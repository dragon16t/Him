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
