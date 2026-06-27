"""Today's-snapshot endpoints + helpers.
Adds GET /api/today-stats that returns role-scoped totals for "today" used by
the new dashboard cards (Admin, Inventory Manager, Sales Manager).

Scope rules
-----------
* admin / inventory_manager → company-wide
* sales_manager → only orders/leads created by their team
* telecaller → only their own
"""
from datetime import datetime, timezone, date, timedelta
from fastapi import Depends, HTTPException


def register_today_stats(app, db, api_router, get_current_user, logger):

    async def _team_ids_for_sm(sm_id):
        ids = {sm_id}
        async for tc in db.telecallers.find({"managed_by": sm_id}, {"_id": 0, "id": 1}):
            ids.add(tc["id"])
        async for a in db.agents.find({"managed_by": sm_id}, {"_id": 0, "id": 1}):
            ids.add(a["id"])
        async for asm in db.assistant_sales_managers.find({"managed_by": sm_id}, {"_id": 0, "id": 1}):
            ids.add(asm["id"])
        return list(ids)

    @api_router.get("/today-stats")
    async def today_stats(current_user: dict = Depends(get_current_user)):
        today = date.today().isoformat()
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        role = current_user["role"]
        uid = current_user["id"]
        scope_orders = {"deleted": {"$ne": True}, "created_at": {"$gte": today, "$lt": tomorrow}}
        scope_leads = {"created_at": {"$gte": today, "$lt": tomorrow}}
        if role == "telecaller":
            scope_orders["created_by"] = uid
            scope_leads["$or"] = [{"assigned_to": uid}, {"created_by": uid}]
        elif role == "sales_manager":
            team = await _team_ids_for_sm(uid)
            scope_orders["created_by"] = {"$in": team}
            scope_leads["$or"] = [{"assigned_to": {"$in": team}}, {"created_by": {"$in": team}}]
        elif role == "agent":
            scope_orders["created_by"] = uid
            scope_leads["created_by"] = uid
        # admin + inventory_manager + finance_manager → no scope filter (company-wide)
        orders_today = await db.orders.find(scope_orders, {"_id": 0, "total_amount": 1, "status": 1, "customer_phone": 1, "customer_name": 1, "id": 1, "created_by_name": 1, "created_at": 1, "payment_type": 1}).sort("created_at", -1).to_list(500)
        revenue_today = sum(o.get("total_amount", 0) for o in orders_today if o.get("status") != "cancelled")
        delivered_today = await db.orders.count_documents({
            "deleted": {"$ne": True},
            "delivered_at": {"$gte": today, "$lt": tomorrow},
            **({"created_by": scope_orders["created_by"]} if "created_by" in scope_orders else {}),
        })
        leads_today_count = await db.leads.count_documents(scope_leads)
        # Top telecallers (for SM/Admin) — who added how many leads today
        by_tc = {}
        if role in ("admin", "sales_manager"):
            async for ld in db.leads.find(scope_leads, {"_id": 0, "assigned_to": 1, "created_by": 1, "name": 1, "phone_number": 1, "created_at": 1}):
                tc_id = ld.get("created_by") or ld.get("assigned_to")
                if not tc_id:
                    continue
                by_tc.setdefault(tc_id, {"id": tc_id, "name": "", "leads": []})
                by_tc[tc_id]["leads"].append({
                    "name": ld.get("name"), "phone": ld.get("phone_number"),
                    "at": (ld.get("created_at") or "")[:16].replace("T", " "),
                })
            for tc_id, bucket in by_tc.items():
                tc = await db.telecallers.find_one({"id": tc_id}, {"_id": 0, "name": 1}) or \
                     await db.agents.find_one({"id": tc_id}, {"_id": 0, "name": 1}) or \
                     await db.assistant_sales_managers.find_one({"id": tc_id}, {"_id": 0, "name": 1})
                bucket["name"] = (tc or {}).get("name", "Unknown")
                bucket["count"] = len(bucket["leads"])
        leaderboard = sorted(by_tc.values(), key=lambda x: x.get("count", 0), reverse=True)
        return {
            "orders_today_count": len(orders_today),
            "revenue_today": round(revenue_today, 2),
            "delivered_today": delivered_today,
            "leads_today_count": leads_today_count,
            "orders_today": orders_today[:50],
            "telecaller_leaderboard": leaderboard,
        }

    logger.info("Today-stats module registered: /today-stats")
