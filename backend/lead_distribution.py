"""
lead_distribution.py — Bulk lead allocation to telecallers under a Sales Manager.

Three modes:
    "equal"       — Round-robin balance the phones across selected TCs,
                    starting with the TC who currently has the lowest TODAY
                    lead-load. (So if TC-A already has 3 leads today and TC-B
                    has 0, the new batch fills TC-B first.)
    "round_robin" — Plain rotation across selected TCs in the provided order.
    "name_mapped" — Caller provides explicit { tc_name: [phones...] } mapping,
                    we fuzzy-match each name to a telecaller managed by the SM.

For each allocation, we create a `lead` document scoped to that telecaller
(assigned_to + assigned_to_name), normalise the phone, and skip duplicates
that are already assigned for today.

Routes (all under /api):
    POST /api/leads/bulk-distribute   — create the leads
    POST /api/leads/preview-distribute— preview which TC each phone would go to
                                        (no DB writes)

Visible to: admin + sales_manager + assistant_sales_manager.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional
import re
import uuid


_DIGIT_RE = re.compile(r"\D")


def _norm_phone(s) -> str:
    """Normalise to digits-only; drop leading +91/0/91 when local Indian number."""
    if not s:
        return ""
    n = _DIGIT_RE.sub("", str(s))
    if len(n) > 10 and n.startswith("91"):
        n = n[-10:]
    return n


def _norm_name(s) -> str:
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def register_lead_distribution(api_router: APIRouter, db, get_current_user):

    async def _resolve_sm(current_user, body_sm_id):
        role = current_user["role"]
        if role == "sales_manager":
            return current_user["id"]
        if role == "assistant_sales_manager":
            return current_user.get("managed_by") or current_user["id"]
        if role == "admin":
            if not body_sm_id:
                raise HTTPException(400, "sales_manager_id is required for admin")
            return body_sm_id
        raise HTTPException(403, "Not authorised")

    async def _team_telecallers(sm_id):
        """All callable team members under an SM = telecallers + assistant SMs."""
        tcs = await db.telecallers.find({"managed_by": sm_id}, {"_id": 0}).to_list(5000)
        asms = await db.assistant_sales_managers.find({"managed_by": sm_id}, {"_id": 0}).to_list(50)
        out = tcs + asms
        return out

    def _match_tc_by_name(name, team):
        """Fuzzy-match a TC by name. Strategy: exact-normalised → contains → token overlap."""
        target = _norm_name(name)
        if not target:
            return None
        # Exact match
        for tc in team:
            if _norm_name(tc.get("name")) == target:
                return tc
        # Contains
        for tc in team:
            n = _norm_name(tc.get("name"))
            if target and (target in n or n in target):
                return tc
        # First-token match
        first = target.split()[0] if " " in target else target
        for tc in team:
            n = _norm_name(tc.get("name"))
            if first and first in n:
                return tc
        return None

    async def _today_load(team_ids):
        """How many leads each TC already has TODAY (used by 'equal' mode)."""
        today = datetime.now(timezone.utc).date().isoformat()
        cursor = db.leads.find({
            "assigned_to": {"$in": team_ids},
            "created_at": {"$regex": f"^{today}"},
            "deleted": {"$ne": True},
        }, {"_id": 0, "assigned_to": 1})
        counts = {tid: 0 for tid in team_ids}
        async for ld in cursor:
            tid = ld.get("assigned_to")
            if tid in counts:
                counts[tid] += 1
        return counts

    async def _allocate(team, phones, mode, mapping):
        """Pure-compute: return list of {phone, telecaller_id, telecaller_name} (no DB writes)."""
        allocations = []
        if mode == "name_mapped":
            if not isinstance(mapping, dict) or not mapping:
                raise HTTPException(400, "mapping required for name_mapped mode")
            for name, ph_list in mapping.items():
                tc = _match_tc_by_name(name, team)
                if not tc:
                    for ph in (ph_list or []):
                        allocations.append({"phone": ph, "phone_norm": _norm_phone(ph),
                                            "telecaller_id": None, "telecaller_name": name,
                                            "unmatched_name": True})
                    continue
                for ph in (ph_list or []):
                    allocations.append({"phone": ph, "phone_norm": _norm_phone(ph),
                                        "telecaller_id": tc["id"], "telecaller_name": tc.get("name") or ""})
            return allocations

        if not team:
            raise HTTPException(400, "No telecallers selected / available")
        if not phones:
            return []

        team_ids = [t["id"] for t in team]
        if mode == "equal":
            # Load-aware round robin — fill the TC with lowest current load first.
            load = await _today_load(team_ids)
            # Local mutable load to factor in new allocations
            local_load = dict(load)
            for ph in phones:
                pick_id = min(team_ids, key=lambda t: local_load[t])
                tc = next((t for t in team if t["id"] == pick_id), None)
                allocations.append({"phone": ph, "phone_norm": _norm_phone(ph),
                                    "telecaller_id": pick_id,
                                    "telecaller_name": (tc or {}).get("name") or ""})
                local_load[pick_id] = local_load.get(pick_id, 0) + 1
            return allocations

        # round_robin (default)
        for i, ph in enumerate(phones):
            tc = team[i % len(team)]
            allocations.append({"phone": ph, "phone_norm": _norm_phone(ph),
                                "telecaller_id": tc["id"], "telecaller_name": tc.get("name") or ""})
        return allocations

    @api_router.post("/leads/preview-distribute")
    async def preview_distribute(data: dict, current_user: dict = Depends(get_current_user)):
        """Return who each phone would go to without writing leads. Useful to confirm before commit."""
        sm_id = await _resolve_sm(current_user, data.get("sales_manager_id"))
        mode = (data.get("mode") or "equal").lower()
        phones_raw = data.get("phone_numbers") or []
        mapping = data.get("mapping")
        tc_filter = data.get("telecaller_ids")  # optional subset of the SM team

        team = await _team_telecallers(sm_id)
        if tc_filter and mode in ("equal", "round_robin"):
            team = [t for t in team if t["id"] in tc_filter]
        phones = [p for p in (phones_raw or []) if p]

        allocations = await _allocate(team, phones, mode, mapping)

        # Enrich allocations with a "will_skip_reason" so the UI can flag dupes
        # BEFORE commit (within-batch + already-in-system).
        seen_in_batch = set()
        norm_needed = []
        for a in allocations:
            pn = a.get("phone_norm")
            if pn:
                norm_needed.append(pn)
        already_norms = set()
        already_owner = {}
        if norm_needed:
            async for ld in db.leads.find({
                "phone_number_norm": {"$in": list(set(norm_needed))},
                "deleted": {"$ne": True},
            }, {"_id": 0, "phone_number_norm": 1, "assigned_to_name": 1, "managed_by_name": 1}):
                pn = ld.get("phone_number_norm")
                if pn:
                    already_norms.add(pn)
                    already_owner.setdefault(pn, {
                        "telecaller_name": ld.get("assigned_to_name"),
                        "sm_name": ld.get("managed_by_name"),
                    })
        for a in allocations:
            pn = a.get("phone_norm")
            if not pn:
                a["will_skip"] = True; a["skip_reason"] = "invalid_phone"; continue
            if pn in seen_in_batch:
                a["will_skip"] = True; a["skip_reason"] = "duplicate_in_batch"; continue
            if pn in already_norms:
                a["will_skip"] = True; a["skip_reason"] = "already_in_system"
                a["existing_owner"] = already_owner.get(pn)
                continue
            seen_in_batch.add(pn)
            a["will_skip"] = False

        # Aggregate counts per TC (only counting non-skipped)
        by_tc = {}
        for a in allocations:
            if a.get("will_skip"):
                continue
            k = a.get("telecaller_id") or "_unmatched"
            entry = by_tc.setdefault(k, {"telecaller_id": a.get("telecaller_id"),
                                         "telecaller_name": a.get("telecaller_name") or "—",
                                         "count": 0})
            entry["count"] += 1
        summary = list(by_tc.values())
        summary.sort(key=lambda x: x["count"], reverse=True)
        return {
            "sm_id": sm_id,
            "mode": mode,
            "total": len([a for a in allocations if not a.get("will_skip")]),
            "will_skip": sum(1 for a in allocations if a.get("will_skip")),
            "allocations": allocations,
            "summary": summary,
            "team_size": len(team),
        }

    @api_router.post("/leads/bulk-distribute")
    async def bulk_distribute(data: dict, current_user: dict = Depends(get_current_user)):
        """Create leads from a bulk phone list, distributed across the SM's telecallers."""
        sm_id = await _resolve_sm(current_user, data.get("sales_manager_id"))
        mode = (data.get("mode") or "equal").lower()
        phones_raw = data.get("phone_numbers") or []
        mapping = data.get("mapping")
        tc_filter = data.get("telecaller_ids")
        source = data.get("source") or "manual_bulk"
        notes = data.get("notes") or ""

        team = await _team_telecallers(sm_id)
        if tc_filter and mode in ("equal", "round_robin"):
            team = [t for t in team if t["id"] in tc_filter]
        phones = [p for p in (phones_raw or []) if p]

        # DEDUPE step 1: within-batch. Same normalised phone appearing multiple
        # times in the paste should only produce one lead.
        seen_in_batch = set()
        deduped_phones = []
        within_batch_dupes = 0
        for p in phones:
            pn = _norm_phone(p)
            if not pn:
                continue
            if pn in seen_in_batch:
                within_batch_dupes += 1
                continue
            seen_in_batch.add(pn)
            deduped_phones.append(p)
        if mode == "name_mapped":
            # Dedupe within the mapping too
            deduped_mapping = {}
            for name, plist in (mapping or {}).items():
                clean = []
                for p in (plist or []):
                    pn = _norm_phone(p)
                    if not pn or pn in seen_in_batch:
                        within_batch_dupes += 1
                        continue
                    seen_in_batch.add(pn)
                    clean.append(p)
                deduped_mapping[name] = clean
            mapping = deduped_mapping
        else:
            phones = deduped_phones

        # DEDUPE step 2: pre-load existing phone_number_norm values across ALL
        # non-deleted leads. A phone that already lives on ANY telecaller's
        # dashboard should NEVER be re-assigned (only exception: soft-deleted lead).
        all_norms = list(seen_in_batch)
        already_norms = set()
        already_owner = {}   # phone_norm → {tc_id, tc_name, sm_name}
        if all_norms:
            async for ld in db.leads.find({
                "phone_number_norm": {"$in": all_norms},
                "deleted": {"$ne": True},
            }, {"_id": 0, "phone_number_norm": 1, "assigned_to": 1, "assigned_to_name": 1, "managed_by_name": 1}):
                pn = ld.get("phone_number_norm")
                if pn:
                    already_norms.add(pn)
                    already_owner.setdefault(pn, {
                        "telecaller_id": ld.get("assigned_to"),
                        "telecaller_name": ld.get("assigned_to_name"),
                        "sm_name": ld.get("managed_by_name"),
                    })

        allocations = await _allocate(team, phones, mode, mapping)

        now = datetime.now(timezone.utc).isoformat()
        # SM lookup (for stamping)
        sm_doc = await db.sales_managers.find_one({"id": sm_id}, {"_id": 0, "name": 1})

        created = 0
        skipped_duplicates = 0
        skipped_details = []  # [{phone, owner}]
        unmatched_names = 0
        by_tc_count = {}
        created_ids = []
        for a in allocations:
            if not a.get("telecaller_id"):
                unmatched_names += 1
                continue
            phone_norm = a["phone_norm"]
            if not phone_norm:
                continue
            if phone_norm in already_norms:
                skipped_duplicates += 1
                skipped_details.append({"phone": a["phone"], "owner": already_owner.get(phone_norm)})
                continue
            lead = {
                "id": f"lead-{uuid.uuid4().hex[:8]}",
                "name": "",  # no name from phone-only upload
                "phone_number": a["phone"],
                "phone_number_norm": phone_norm,
                "email": "",
                "source": source,
                "status": "new",
                "notes": notes,
                "assigned_to": a["telecaller_id"],
                "assigned_to_name": a["telecaller_name"],
                "managed_by": sm_id,
                "managed_by_name": (sm_doc or {}).get("name") or "",
                "managed_by_role": "sales_manager",
                "created_at": now,
                "updated_at": now,
                "created_by": current_user["id"],
                "created_by_name": current_user.get("name", ""),
                "bulk_batch": data.get("batch_id") or f"batch-{uuid.uuid4().hex[:6]}",
            }
            await db.leads.insert_one(lead)
            created_ids.append(lead["id"])
            created += 1
            by_tc_count[a["telecaller_id"]] = by_tc_count.get(a["telecaller_id"], 0) + 1

        # Per-TC summary
        summary = []
        for tc in team:
            if tc["id"] in by_tc_count or not tc_filter:
                summary.append({"telecaller_id": tc["id"], "telecaller_name": tc.get("name") or "",
                                "count": by_tc_count.get(tc["id"], 0),
                                "phone": tc.get("phone") or ""})
        summary.sort(key=lambda x: x["count"], reverse=True)

        return {
            "sm_id": sm_id,
            "mode": mode,
            "total_input": len(phones if mode != "name_mapped" else [p for ps in (mapping or {}).values() for p in (ps or [])]),
            "created": created,
            "skipped_duplicates": skipped_duplicates,
            "skipped_details": skipped_details[:50],  # trim for response size
            "within_batch_dupes": within_batch_dupes,
            "unmatched_names": unmatched_names,
            "summary": summary,
            "lead_ids": created_ids,
        }


    @api_router.post("/leads/dedupe-cleanup")
    async def dedupe_cleanup(data: dict = None, current_user: dict = Depends(get_current_user)):
        """Admin-only maintenance endpoint. For every phone_number_norm that has
        > 1 non-deleted lead, keep the OLDEST (first-created) and soft-delete
        the rest. Used to clean up the corrupted-duplicates state before the
        new all-time-dedupe went live.

        Body: {dry_run: bool} — if true, only counts, does not mutate.
        """
        if current_user["role"] != "admin":
            raise HTTPException(403, "Admin only")
        dry_run = bool((data or {}).get("dry_run", False))
        pipeline = [
            {"$match": {"deleted": {"$ne": True}, "phone_number_norm": {"$exists": True, "$ne": ""}}},
            {"$group": {"_id": "$phone_number_norm", "count": {"$sum": 1},
                        "leads": {"$push": {"id": "$id", "created_at": "$created_at",
                                              "assigned_to_name": "$assigned_to_name"}}}},
            {"$match": {"count": {"$gt": 1}}},
        ]
        groups = await db.leads.aggregate(pipeline).to_list(20000)
        total_dupes = sum(g["count"] - 1 for g in groups)
        details = []
        deleted = 0
        for g in groups[:2000]:
            # Keep the earliest-created lead, delete the rest
            sorted_leads = sorted(g["leads"], key=lambda x: x.get("created_at") or "")
            keeper = sorted_leads[0]
            to_delete = sorted_leads[1:]
            details.append({"phone_norm": g["_id"], "keeper": keeper.get("id"),
                            "removed": [{"id": d.get("id"), "tc": d.get("assigned_to_name")} for d in to_delete]})
            if not dry_run:
                await db.leads.update_many(
                    {"id": {"$in": [d.get("id") for d in to_delete]}},
                    {"$set": {"deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(),
                              "delete_reason": "dedupe_cleanup", "deleted_by_name": current_user.get("name", "")}}
                )
                deleted += len(to_delete)
        return {
            "duplicate_phone_norms": len(groups),
            "extra_leads_found": total_dupes,
            "deleted": deleted,
            "dry_run": dry_run,
            "sample": details[:20],
        }
