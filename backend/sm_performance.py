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
from datetime import datetime, timezone, timedelta
from typing import Optional


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
