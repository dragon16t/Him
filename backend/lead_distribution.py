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
        # Aggregate counts per TC
        by_tc = {}
        for a in allocations:
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
            "total": len(allocations),
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

        allocations = await _allocate(team, phones, mode, mapping)

        now = datetime.now(timezone.utc).isoformat()
        today_prefix = now[:10]
        # SM lookup (for stamping)
        sm_doc = await db.sales_managers.find_one({"id": sm_id}, {"_id": 0, "name": 1})

        created = 0
        skipped_duplicates = 0
        unmatched_names = 0
        by_tc_count = {}
        created_ids = []
        for a in allocations:
            if not a.get("telecaller_id"):
                unmatched_names += 1
                continue
            phone_norm = a["phone_norm"]
            # Dedupe: skip if a lead exists today for the same normalised phone
            # already assigned (active, not soft-deleted)
            existing = await db.leads.find_one({
                "phone_number_norm": phone_norm,
                "deleted": {"$ne": True},
                "created_at": {"$regex": f"^{today_prefix}"},
            }, {"_id": 0, "id": 1, "assigned_to": 1})
            if existing:
                skipped_duplicates += 1
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
            "unmatched_names": unmatched_names,
            "summary": summary,
            "lead_ids": created_ids,
        }
