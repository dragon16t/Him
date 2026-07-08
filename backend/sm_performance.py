"""
sm_performance.py — Sales Manager → per-Telecaller performance + filtering.

Exposes:
    GET /api/sm/telecaller-performance
        Query: range = "today" | "7d" | "30d" | "custom" (default 7d)
               from  = YYYY-MM-DD (only when range=custom)
               to    = YYYY-MM-DD (only when range=custom)
               sm_id = SM id (admin/IM-only — SM is always scoped to themselves)

    Returns per-telecaller stats card:
      {telecaller_id, telecaller_name, telecaller_phone, orders, total_qty,
       revenue, delivered, returned, in_transit, pending, confirmed,
       rto_pct, delivery_pct}

Visible to: admin + sales_manager + assistant_sales_manager + inventory_manager.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone, timedelta
from typing import Optional
import io


def register_sm_performance(api_router: APIRouter, db, get_current_user):

    async def _team_telecallers(sm_id: str):
        tcs = await db.telecallers.find({"managed_by": sm_id}, {"_id": 0}).to_list(5000)
        asms = await db.assistant_sales_managers.find({"managed_by": sm_id}, {"_id": 0}).to_list(50)
        return tcs + asms

    @api_router.get("/sm/telecaller-performance")
    async def telecaller_performance(
        range: str = Query("7d"),
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        sm_id: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        role = current_user["role"]
        if role not in ("admin", "sales_manager", "assistant_sales_manager", "inventory_manager"):
            raise HTTPException(403, "Not authorised")

        # Resolve which SM's team to scope to
        target_sm = sm_id
        if role == "sales_manager":
            target_sm = current_user["id"]
        elif role == "assistant_sales_manager":
            target_sm = current_user.get("managed_by") or current_user["id"]
        if not target_sm:
            raise HTTPException(400, "sm_id required for admin/IM views")

        # Compute date window
        today = datetime.now(timezone.utc).date()
        if range == "today":
            start = today; end = today
        elif range == "30d":
            start = today - timedelta(days=29); end = today
        elif range == "custom" and from_ and to:
            try:
                start = datetime.strptime(from_, "%Y-%m-%d").date()
                end = datetime.strptime(to, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(400, "Invalid from/to (YYYY-MM-DD)")
        else:
            # default 7d
            start = today - timedelta(days=6); end = today
            range = "7d"

        start_iso = start.isoformat()
        end_iso_excl = (end + timedelta(days=1)).isoformat()

        team = await _team_telecallers(target_sm)
        tc_lookup = {t["id"]: t for t in team}
        tc_ids = list(tc_lookup.keys())
        if not tc_ids:
            return {
                "range": range, "from": start_iso, "to": end.isoformat(),
                "sm_id": target_sm, "telecallers": [],
                "team": {"total_telecallers": 0},
                "totals": {"orders": 0, "revenue": 0, "qty": 0,
                           "delivered": 0, "returned": 0, "in_transit": 0,
                           "pending": 0, "confirmed": 0},
            }

        # Pull all orders in the window for the SM team
        orders = await db.orders.find({
            "deleted": {"$ne": True},
            "created_by": {"$in": tc_ids},
            "created_at": {"$gte": start_iso, "$lt": end_iso_excl},
        }, {"_id": 0}).to_list(20000)

        # Aggregate per-telecaller
        agg = {}
        for tc_id, tc in tc_lookup.items():
            agg[tc_id] = {
                "telecaller_id": tc_id,
                "telecaller_name": tc.get("name") or "—",
                "telecaller_phone": tc.get("phone") or "",
                "role": "assistant_sales_manager" if tc.get("managed_by") == target_sm and "asm" in tc_id else (tc.get("role") or "telecaller"),
                "orders": 0,
                "total_qty": 0,
                "revenue": 0.0,
                "delivered": 0,
                "delivered_revenue": 0.0,
                "returned": 0,
                "in_transit": 0,
                "pending": 0,
                "confirmed": 0,
                "shipped": 0,
                "cancelled": 0,
            }

        totals = {"orders": 0, "revenue": 0.0, "qty": 0,
                  "delivered": 0, "returned": 0, "in_transit": 0,
                  "pending": 0, "confirmed": 0, "shipped": 0}
        for o in orders:
            cb = o.get("created_by")
            if cb not in agg:
                continue
            a = agg[cb]
            amt = float(o.get("total_amount") or 0)
            qty = sum(int(it.get("quantity") or 0) for it in (o.get("items") or []))
            status = (o.get("status") or "").lower()
            a["orders"] += 1
            a["total_qty"] += qty
            a["revenue"] += amt
            totals["orders"] += 1
            totals["revenue"] += amt
            totals["qty"] += qty
            if status == "delivered":
                a["delivered"] += 1; a["delivered_revenue"] += amt
                totals["delivered"] += 1
            elif status in ("returned", "rto", "not_delivered"):
                a["returned"] += 1
                totals["returned"] += 1
            elif status == "shipped":
                a["in_transit"] += 1; a["shipped"] += 1
                totals["in_transit"] += 1; totals["shipped"] += 1
            elif status == "pending":
                a["pending"] += 1; totals["pending"] += 1
            elif status == "confirmed":
                a["confirmed"] += 1; totals["confirmed"] += 1
            elif status == "cancelled":
                a["cancelled"] += 1

        out = []
        for tc_id, a in agg.items():
            # Percentages computed on the number of orders that have reached
            # a final outcome (delivered + returned) so in-transit ones don't
            # skew the metric down artificially.
            final = a["delivered"] + a["returned"]
            a["delivery_pct"] = round((a["delivered"] / final) * 100, 1) if final else 0
            a["rto_pct"] = round((a["returned"] / final) * 100, 1) if final else 0
            a["revenue"] = round(a["revenue"], 2)
            a["delivered_revenue"] = round(a["delivered_revenue"], 2)
            out.append(a)
        # Sort by revenue desc
        out.sort(key=lambda x: (x["revenue"], x["orders"]), reverse=True)
        totals["revenue"] = round(totals["revenue"], 2)

        return {
            "range": range,
            "from": start_iso,
            "to": end.isoformat(),
            "sm_id": target_sm,
            "team": {"total_telecallers": len(tc_ids)},
            "telecallers": out,
            "totals": totals,
        }


    @api_router.get("/admin/all-tcs-performance")
    async def all_tcs_performance(
        range: str = Query("7d"),
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        """Admin/IM only — returns per-Sales-Manager team performance rollup PLUS every
        telecaller across all SMs for the same date window. Structure:

            {
              range, from, to,
              managers: [
                { sm_id, sm_name, sm_phone, is_head_of_sales,
                  team_size, telecallers: [<same shape as /sm/telecaller-performance>],
                  totals: {orders, revenue, qty, delivered, returned, in_transit, pending, ...} },
                ...
              ],
              unassigned: {  # TCs with no managed_by
                telecallers: [...], totals: {...}, team_size: N
              },
              grand_totals: {...},
            }
        """
        role = current_user["role"]
        if role not in ("admin", "inventory_manager"):
            raise HTTPException(403, "Admin/IM only")

        # Date window (mirrors telecaller_performance)
        today = datetime.now(timezone.utc).date()
        if range == "today":
            start = today; end = today
        elif range == "30d":
            start = today - timedelta(days=29); end = today
        elif range == "custom" and from_ and to:
            try:
                start = datetime.strptime(from_, "%Y-%m-%d").date()
                end = datetime.strptime(to, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(400, "Invalid from/to (YYYY-MM-DD)")
        else:
            start = today - timedelta(days=6); end = today
            range = "7d"
        start_iso = start.isoformat()
        end_iso_excl = (end + timedelta(days=1)).isoformat()

        # Load all SMs
        sms = await db.sales_managers.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(500)
        sm_lookup = {s["id"]: s for s in sms}

        # Load ALL telecallers + assistant SMs in one shot
        all_tcs = await db.telecallers.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(20000)
        all_asms = await db.assistant_sales_managers.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(2000)
        all_tcs_all = all_tcs + all_asms  # asms carry orders too

        # Group TCs by their managed_by (SM)
        by_sm = {}
        unassigned = []
        for t in all_tcs_all:
            mb = t.get("managed_by")
            if mb and mb in sm_lookup:
                by_sm.setdefault(mb, []).append(t)
            else:
                unassigned.append(t)

        # Pull ALL orders in window once, index by created_by
        tc_ids = [t["id"] for t in all_tcs_all]
        orders_by_tc = {}
        if tc_ids:
            cursor = db.orders.find({
                "deleted": {"$ne": True},
                "created_by": {"$in": tc_ids},
                "created_at": {"$gte": start_iso, "$lt": end_iso_excl},
            }, {"_id": 0})
            async for o in cursor:
                orders_by_tc.setdefault(o.get("created_by"), []).append(o)

        def _aggregate(team_tcs):
            agg = {}
            for tc in team_tcs:
                agg[tc["id"]] = {
                    "telecaller_id": tc["id"],
                    "telecaller_name": tc.get("name") or "—",
                    "telecaller_phone": tc.get("phone") or "",
                    "role": "assistant_sales_manager" if "asm" in tc["id"] else "telecaller",
                    "orders": 0, "total_qty": 0, "revenue": 0.0,
                    "delivered": 0, "delivered_revenue": 0.0,
                    "returned": 0, "in_transit": 0,
                    "pending": 0, "confirmed": 0, "shipped": 0, "cancelled": 0,
                }
            totals = {"orders": 0, "revenue": 0.0, "qty": 0,
                      "delivered": 0, "returned": 0, "in_transit": 0,
                      "pending": 0, "confirmed": 0, "shipped": 0,
                      "delivered_revenue": 0.0}
            for tc in team_tcs:
                for o in orders_by_tc.get(tc["id"], []):
                    a = agg[tc["id"]]
                    amt = float(o.get("total_amount") or 0)
                    qty = sum(int(it.get("quantity") or 0) for it in (o.get("items") or []))
                    status = (o.get("status") or "").lower()
                    a["orders"] += 1; a["total_qty"] += qty; a["revenue"] += amt
                    totals["orders"] += 1; totals["revenue"] += amt; totals["qty"] += qty
                    if status == "delivered":
                        a["delivered"] += 1; a["delivered_revenue"] += amt
                        totals["delivered"] += 1; totals["delivered_revenue"] += amt
                    elif status in ("returned", "rto", "not_delivered"):
                        a["returned"] += 1; totals["returned"] += 1
                    elif status == "shipped":
                        a["in_transit"] += 1; a["shipped"] += 1
                        totals["in_transit"] += 1; totals["shipped"] += 1
                    elif status == "pending":
                        a["pending"] += 1; totals["pending"] += 1
                    elif status == "confirmed":
                        a["confirmed"] += 1; totals["confirmed"] += 1
                    elif status == "cancelled":
                        a["cancelled"] += 1
            out = []
            for tc_id, a in agg.items():
                final = a["delivered"] + a["returned"]
                a["delivery_pct"] = round((a["delivered"] / final) * 100, 1) if final else 0
                a["rto_pct"] = round((a["returned"] / final) * 100, 1) if final else 0
                a["revenue"] = round(a["revenue"], 2)
                a["delivered_revenue"] = round(a["delivered_revenue"], 2)
                out.append(a)
            out.sort(key=lambda x: (x["revenue"], x["orders"]), reverse=True)
            totals["revenue"] = round(totals["revenue"], 2)
            totals["delivered_revenue"] = round(totals["delivered_revenue"], 2)
            # roll-up percentages
            final_total = totals["delivered"] + totals["returned"]
            totals["delivery_pct"] = round((totals["delivered"] / final_total) * 100, 1) if final_total else 0
            totals["rto_pct"] = round((totals["returned"] / final_total) * 100, 1) if final_total else 0
            return out, totals

        managers = []
        grand = {"orders": 0, "revenue": 0.0, "qty": 0,
                 "delivered": 0, "returned": 0, "in_transit": 0,
                 "pending": 0, "confirmed": 0, "shipped": 0,
                 "delivered_revenue": 0.0, "total_telecallers": 0}
        for sm_id, sm in sm_lookup.items():
            team_tcs = by_sm.get(sm_id, [])
            tc_list, totals = _aggregate(team_tcs)
            managers.append({
                "sm_id": sm_id,
                "sm_name": sm.get("name") or "—",
                "sm_phone": sm.get("phone") or "",
                "is_head_of_sales": bool(sm.get("is_head_of_sales")),
                "team_size": len(team_tcs),
                "telecallers": tc_list,
                "totals": totals,
            })
            for k in ("orders", "revenue", "qty", "delivered", "returned",
                      "in_transit", "pending", "confirmed", "shipped", "delivered_revenue"):
                grand[k] += totals.get(k, 0)
            grand["total_telecallers"] += len(team_tcs)
        # Sort SMs by revenue desc — biggest first, Head of Sales pinned at top of ties
        managers.sort(key=lambda m: (m["is_head_of_sales"], m["totals"]["revenue"], m["totals"]["orders"]), reverse=True)

        # Unassigned bucket
        unassigned_tcs, unassigned_totals = _aggregate(unassigned)
        for k in ("orders", "revenue", "qty", "delivered", "returned",
                  "in_transit", "pending", "confirmed", "shipped", "delivered_revenue"):
            grand[k] += unassigned_totals.get(k, 0)
        grand["total_telecallers"] += len(unassigned)

        grand["revenue"] = round(grand["revenue"], 2)
        grand["delivered_revenue"] = round(grand["delivered_revenue"], 2)
        _final = grand["delivered"] + grand["returned"]
        grand["delivery_pct"] = round((grand["delivered"] / _final) * 100, 1) if _final else 0
        grand["rto_pct"] = round((grand["returned"] / _final) * 100, 1) if _final else 0

        return {
            "range": range,
            "from": start_iso,
            "to": end.isoformat(),
            "managers": managers,
            "unassigned": {
                "team_size": len(unassigned),
                "telecallers": unassigned_tcs,
                "totals": unassigned_totals,
            },
            "grand_totals": grand,
        }


    @api_router.get("/sm/telecaller-performance/pdf")
    async def telecaller_performance_pdf(
        range: str = Query("7d"),
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        sm_id: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        """Same data as GET /sm/telecaller-performance but streamed as a PDF report
        with ALL telecallers listed (even zero-order ones), plus totals footer."""
        # Reuse the JSON endpoint to compute the data
        payload = await telecaller_performance(range=range, from_=from_, to=to,
                                                sm_id=sm_id, current_user=current_user)
        # Look up SM name
        sm_doc = await db.sales_managers.find_one({"id": payload["sm_id"]}, {"_id": 0, "name": 1})
        sm_name = (sm_doc or {}).get("name") or payload["sm_id"]

        try:
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib import colors
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        except ImportError:
            raise HTTPException(500, "reportlab not installed")

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=20, rightMargin=20, topMargin=20, bottomMargin=20)
        styles = getSampleStyleSheet()
        story = []
        story.append(Paragraph(f"<b>Telecaller Performance — {sm_name}</b>", styles["Title"]))
        story.append(Paragraph(f"Range: <b>{payload['range']}</b> · {payload['from']} to {payload['to']} · Team size: <b>{payload['team']['total_telecallers']}</b>", styles["Normal"]))
        story.append(Spacer(1, 12))

        header = ["#", "Telecaller", "Phone", "Orders", "Qty", "Revenue", "Delivered", "In-Transit", "Returned", "Pending", "Delivery %", "RTO %"]
        rows = [header]
        for i, t in enumerate(payload["telecallers"], start=1):
            rows.append([
                str(i),
                t["telecaller_name"] or "—",
                t.get("telecaller_phone") or "",
                str(t.get("orders", 0)),
                str(t.get("total_qty", 0)),
                f"Rs.{t.get('revenue', 0):,.0f}",
                str(t.get("delivered", 0)),
                str(t.get("in_transit", 0)),
                str(t.get("returned", 0)),
                str(t.get("pending", 0) + t.get("confirmed", 0)),
                f"{t.get('delivery_pct', 0)}%",
                f"{t.get('rto_pct', 0)}%",
            ])
        totals = payload["totals"]
        rows.append([
            "", "TOTAL", "",
            str(totals.get("orders", 0)),
            str(totals.get("qty", 0)),
            f"Rs.{totals.get('revenue', 0):,.0f}",
            str(totals.get("delivered", 0)),
            str(totals.get("in_transit", 0)),
            str(totals.get("returned", 0)),
            str(totals.get("pending", 0) + totals.get("confirmed", 0)),
            "", "",
        ])
        col_widths = [22, 130, 80, 45, 45, 75, 60, 65, 55, 55, 65, 55]
        tbl = Table(rows, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3B5249")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ALIGN", (3, 1), (-1, -1), "CENTER"),
            ("ALIGN", (5, 1), (5, -1), "RIGHT"),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F4EAE0")),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D6D2C8")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F9F8F6")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 12))
        story.append(Paragraph(f"<i>Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by Celesta Glow CRM</i>", styles["Normal"]))
        doc.build(story)
        buf.seek(0)
        filename = f"tc_performance_{sm_name.replace(' ', '_')}_{payload['from']}_{payload['to']}.pdf"
        return StreamingResponse(buf, media_type="application/pdf",
                                  headers={"Content-Disposition": f'attachment; filename="{filename}"'})


    @api_router.get("/sm/tc-call-coverage")
    async def tc_call_coverage(
        sm_id: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        """Per-TC call-coverage rollup for a Sales Manager (or admin/IM for any SM).

        For each telecaller under the manager returns:
          - assigned_leads        : count of active (non-deleted, non-collab) leads assigned to them
          - called_today          : distinct leads on which they logged at least one call today
          - coverage_pct          : called_today / assigned_leads * 100 (0 if no leads assigned)
          - untouched_72h         : leads assigned >72h ago with ZERO call_logs so far — the "aging" bucket
          - last_call_at          : ISO-string of the most recent call log across ALL their leads
        + team_totals summary.
        """
        role = current_user["role"]
        if role == "sales_manager":
            sm_id = current_user["id"]
        elif role == "assistant_sales_manager":
            sm_id = current_user.get("managed_by") or sm_id
        elif role not in ("admin", "inventory_manager"):
            raise HTTPException(403, "Admin / IM / Sales Manager only")
        if not sm_id:
            raise HTTPException(400, "sm_id required")

        sm = await db.sales_managers.find_one({"id": sm_id}, {"_id": 0}) or {}
        tcs = await db.telecallers.find({"managed_by": sm_id, "deleted": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(5000)
        tc_ids = [t["id"] for t in tcs]

        today_str = datetime.now(timezone.utc).date().isoformat()
        cutoff_72h = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()

        # Pull all active leads for this team in one query
        leads = await db.leads.find(
            {"assigned_to": {"$in": tc_ids}, "deleted": {"$ne": True}, "status": {"$ne": "routed_to_collab"}},
            {"_id": 0, "id": 1, "assigned_to": 1, "call_logs": 1, "created_at": 1, "status": 1},
        ).to_list(50000) if tc_ids else []

        # Group per TC
        buckets = {t["id"]: {"assigned": [], "called_today_ids": set(), "untouched_72h": 0, "last_call_at": None} for t in tcs}
        # Track terminal counts too for context
        for l in leads:
            tc_id = l["assigned_to"]
            b = buckets.get(tc_id)
            if not b:
                continue
            b["assigned"].append(l)
            call_logs = l.get("call_logs") or []
            has_any_call = bool(call_logs)
            # Called today?
            for cl in call_logs:
                stamp = (cl.get("logged_at") or cl.get("timestamp") or "")
                if stamp[:10] == today_str:
                    b["called_today_ids"].add(l["id"])
                if stamp and (b["last_call_at"] is None or stamp > b["last_call_at"]):
                    b["last_call_at"] = stamp
            # Untouched > 72h?
            created = l.get("created_at") or ""
            if not has_any_call and created and created < cutoff_72h:
                b["untouched_72h"] += 1

        rows = []
        for t in tcs:
            b = buckets[t["id"]]
            total = len(b["assigned"])
            called_today = len(b["called_today_ids"])
            coverage = round((called_today / total) * 100, 1) if total else 0.0
            rows.append({
                "tc_id": t["id"],
                "tc_name": t.get("name") or "—",
                "tc_phone": t.get("phone") or "",
                "assigned_leads": total,
                "called_today": called_today,
                "coverage_pct": coverage,
                "untouched_72h": b["untouched_72h"],
                "last_call_at": b["last_call_at"] or "",
            })
        # Sort by coverage_pct ASC (lowest coverage TCs surface first — they need attention)
        rows.sort(key=lambda r: (r["coverage_pct"], -r["assigned_leads"]))

        team_totals = {
            "team_size": len(tcs),
            "assigned_leads": sum(r["assigned_leads"] for r in rows),
            "called_today": sum(r["called_today"] for r in rows),
            "untouched_72h": sum(r["untouched_72h"] for r in rows),
        }
        team_totals["coverage_pct"] = round(
            (team_totals["called_today"] / team_totals["assigned_leads"]) * 100, 1
        ) if team_totals["assigned_leads"] else 0.0

        return {
            "sm_id": sm_id,
            "sm_name": sm.get("name") or "—",
            "date": today_str,
            "team_totals": team_totals,
            "telecallers": rows,
        }
