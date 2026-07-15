"""Today's Activity endpoint for Telecallers.

Returns every call the TC made today (across ALL leads) with:
  - phone_number, customer_name, status, remarks, timestamp
  - the follow-up date they set (if any)
Plus a top-line summary: total_calls_today, by_status breakdown, orders_created_today.

This is added as a module import in server.py, so it lives close to the other
TC helpers without bloating server.py further.
"""
from datetime import datetime, timezone, timedelta, date
from fastapi import Depends, HTTPException


def register(api_router, db, get_current_user):
    @api_router.get("/telecaller/today-activity")
    async def today_activity(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in ("telecaller", "inhouse_telecaller",
                                            "admin", "sales_manager", "assistant_sales_manager"):
            raise HTTPException(status_code=403, detail="Not allowed")
        tc_id = current_user["id"]
        # SMs / admin may want to view a specific TC — pass ?tc_id=… (skipped here; TC sees own)
        ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
        today_iso = ist_now.date().isoformat()

        calls_today = []
        by_status = {}
        # Every lead owned by TC — scan call_logs for today's entries
        async for ld in db.leads.find(
            {"assigned_to": tc_id, "deleted": {"$ne": True}},
            {"_id": 0, "id": 1, "phone_number": 1, "name": 1, "call_logs": 1, "status": 1,
             "next_follow_up_date": 1, "next_follow_up_time": 1},
        ):
            for cl in (ld.get("call_logs") or []):
                ts = cl.get("logged_at") or cl.get("timestamp") or cl.get("created_at") or ""
                if not str(ts).startswith(today_iso):
                    continue
                st = (cl.get("status") or ld.get("status") or "").lower()
                by_status[st] = by_status.get(st, 0) + 1
                calls_today.append({
                    "lead_id": ld["id"],
                    "phone_number": ld.get("phone_number") or "",
                    "customer_name": (cl.get("customer_name") or ld.get("name") or "Unknown"),
                    "status": st,
                    "remarks": cl.get("remarks") or cl.get("customer_remarks") or "",
                    "not_interested_reason": cl.get("not_interested_reason") or "",
                    "logged_at": ts,
                    "next_follow_up_date": ld.get("next_follow_up_date") or "",
                    "next_follow_up_time": ld.get("next_follow_up_time") or "",
                    "current_lead_status": ld.get("status") or "",
                })
        # Sort by most recent first
        calls_today.sort(key=lambda c: c.get("logged_at", ""), reverse=True)

        # Orders created today
        start_iso = today_iso
        end_iso = (ist_now.date() + timedelta(days=1)).isoformat()
        orders_today = await db.orders.find({
            "created_by": tc_id,
            "created_at": {"$gte": start_iso, "$lt": end_iso},
            "status": {"$nin": ["cancelled", "rejected"]},
            "deleted": {"$ne": True},
        }, {"_id": 0, "id": 1, "customer_name": 1, "customer_phone": 1,
            "total_amount": 1, "created_at": 1, "items": 1, "status": 1}).to_list(500)
        orders_qty = sum(int(it.get("quantity") or 0) for o in orders_today for it in (o.get("items") or []))

        return {
            "date": today_iso,
            "telecaller_id": tc_id,
            "telecaller_name": current_user.get("name") or "",
            "total_calls_today": len(calls_today),
            "by_status": by_status,
            "calls": calls_today,
            "orders_today": {
                "count": len(orders_today),
                "qty": orders_qty,
                "revenue": round(sum(float(o.get("total_amount") or 0) for o in orders_today), 2),
                "list": orders_today,
            },
        }
