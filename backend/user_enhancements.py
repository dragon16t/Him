"""User-requested enhancements (May 2026)
- Pickup locations (Parakkal/Office/Kochi) + telecaller default
- Order soft-delete (Admin + Sales Manager) + restore + trash list
- Telecaller transfer between Sales Managers (full data migration)
- Lead status counts (for filter badges)
- AI-style keyword-based expense categorization + custom heads
- HR open positions (hiring targets)
- Demo / sample data seeder (admin-only)

This module is imported by server.py and uses its `api_router`, `db`, `log_audit`,
and `get_current_user` dependency.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import random

from fastapi import HTTPException, Depends


def register_enhancements(api_router, db, get_current_user, log_audit, logger):

    # ---------- 1. Pickup Locations ----------
    DEFAULT_PICKUP_LOCATIONS = [
        {"id": "pickup-office", "name": "Office",
         "address": "Veegal Enterprises, Nechkadan Tower 3rd Floor, Eranhipalam, Kerala 673006",
         "is_default": True, "active": True},
        {"id": "pickup-parakkal", "name": "Parakkal",
         "address": "Parakkal Warehouse, Calicut, Kerala",
         "is_default": False, "active": True},
        {"id": "pickup-kochi", "name": "Kochi",
         "address": "Kochi Distribution Center, Kerala",
         "is_default": False, "active": True},
    ]

    async def _ensure_office_is_default():
        """One-time backfill: if 'Office' exists and is not default (or default is Parakkal),
        flip the default to Office. Idempotent — safe to run every request."""
        office = await db.pickup_locations.find_one({"name": "Office", "active": True})
        if office and not office.get("is_default"):
            await db.pickup_locations.update_many({}, {"$set": {"is_default": False}})
            await db.pickup_locations.update_one({"id": office["id"]}, {"$set": {"is_default": True}})

    @api_router.get("/pickup-locations")
    async def list_pickup_locations(current_user: dict = Depends(get_current_user)):
        locs = await db.pickup_locations.find({"active": True}, {"_id": 0}).to_list(50)
        if not locs:
            await db.pickup_locations.insert_many([{**l} for l in DEFAULT_PICKUP_LOCATIONS])
            locs = [{**l} for l in DEFAULT_PICKUP_LOCATIONS]
        await _ensure_office_is_default()
        # Re-read after potential default flip so the caller sees the correct is_default
        locs = await db.pickup_locations.find({"active": True}, {"_id": 0}).to_list(50)
        return {"locations": locs}

    @api_router.post("/pickup-locations")
    async def create_pickup_location(data: dict, current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'inventory_manager'):
            raise HTTPException(status_code=403)
        loc = {
            "id": f"pickup-{uuid.uuid4().hex[:8]}",
            "name": (data.get("name") or "").strip(),
            "address": data.get("address", ""),
            "is_default": bool(data.get("is_default", False)),
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if not loc["name"]:
            raise HTTPException(status_code=400, detail="Name is required")
        if loc["is_default"]:
            await db.pickup_locations.update_many({}, {"$set": {"is_default": False}})
        await db.pickup_locations.insert_one(loc)
        loc.pop("_id", None)
        return {"location": loc}

    @api_router.put("/pickup-locations/{lid}/default")
    async def set_default_pickup(lid: str, current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'inventory_manager'):
            raise HTTPException(status_code=403)
        await db.pickup_locations.update_many({}, {"$set": {"is_default": False}})
        r = await db.pickup_locations.update_one({"id": lid}, {"$set": {"is_default": True}})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="Location not found")
        return {"message": "Default pickup updated"}

    @api_router.delete("/pickup-locations/{lid}")
    async def delete_pickup_location(lid: str, current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'inventory_manager'):
            raise HTTPException(status_code=403)
        await db.pickup_locations.update_one({"id": lid}, {"$set": {"active": False}})
        return {"message": "Pickup location archived"}

    @api_router.put("/telecallers/{tc_id}/preferred-pickup")
    async def set_telecaller_preferred_pickup(tc_id: str, data: dict,
                                              current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'sales_manager'):
            raise HTTPException(status_code=403)
        pickup_id = data.get("pickup_id", "")
        loc = await db.pickup_locations.find_one({"id": pickup_id}, {"_id": 0, "name": 1})
        if not loc:
            raise HTTPException(status_code=404, detail="Pickup location not found")
        await db.telecallers.update_one(
            {"id": tc_id},
            {"$set": {"preferred_pickup_id": pickup_id,
                      "preferred_pickup_name": loc.get("name", "")}}
        )
        return {"message": "Preferred pickup updated", "pickup_name": loc.get("name", "")}

    # ---------- 2. Order Soft-Delete ----------
    @api_router.delete("/orders/{order_id}/soft-delete")
    async def soft_delete_order(order_id: str, data: dict = None,
                                current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'sales_manager', 'telecaller', 'inhouse_telecaller', 'inventory_manager'):
            raise HTTPException(status_code=403,
                                detail="Not authorised to delete orders")
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.get("deleted"):
            raise HTTPException(status_code=400, detail="Order already deleted")
        # Scope checks
        if current_user['role'] in ('telecaller', 'inhouse_telecaller'):
            # Telecaller can only delete orders they created and only while still pending
            if order.get("created_by") != current_user['id']:
                raise HTTPException(status_code=403, detail="You can only delete orders you created")
            if order.get("status") not in ("pending", ""):
                raise HTTPException(status_code=403, detail="Order is already processed — only manager can delete now")
        elif current_user['role'] == 'sales_manager':
            allowed_ids = [current_user['id']]
            async for tc in db.telecallers.find(
                {"managed_by": current_user['id']}, {"_id": 0, "id": 1}
            ):
                allowed_ids.append(tc['id'])
            if (order.get("created_by") not in allowed_ids and
                    order.get("telecaller_id") not in allowed_ids):
                raise HTTPException(status_code=403,
                                    detail="This order is not under your team")
        reason = (data or {}).get("reason", "") if data else ""
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {
                "deleted": True,
                "deleted_at": datetime.now(timezone.utc).isoformat(),
                "deleted_by": current_user['id'],
                "deleted_by_name": current_user.get('name', ''),
                "deleted_by_role": current_user['role'],
                "delete_reason": reason,
                "prev_status_before_delete": order.get("status"),
                "status": "deleted",
            }}
        )
        await db.commissions.update_many(
            {"order_id": order_id, "status": {"$in": ["pending", "approved"]}},
            {"$set": {"status": "cancelled",
                      "cancelled_at": datetime.now(timezone.utc).isoformat(),
                      "cancel_reason": f"Order deleted: {reason}"}}
        )
        # Reverse revenue + return rows in finance ledger so cash/bank balances are correct
        try:
            from server import record_transaction as _rt
            rev = await db.finance_ledger.find_one({"reference_id": order_id, "category": "order_revenue", "type": "credit"})
            if rev:
                already_reversed = await db.finance_ledger.find_one({"reference_id": order_id, "category": "order_deleted_reversal", "type": "debit"})
                if not already_reversed:
                    await _rt("debit", "order_deleted_reversal", rev.get("amount", 0),
                              f"Order {order_id} deleted — reversing revenue", reference_id=order_id,
                              method=rev.get("method", "bank"), created_by=current_user['id'])
        except Exception as _e:
            logger.warning(f"finance reversal on delete failed for {order_id}: {_e}")
        # Reset the linked lead so it stops showing "ORDER PLACED" / "delivered" on TC/SM dashboards
        lead_id = order.get("lead_id")
        if lead_id:
            await db.leads.update_one({"id": lead_id}, {"$set": {
                "status": "interested",
                "last_order_id": "",
                "last_order_amount": 0,
                "last_order_products": "",
                "last_order_date": "",
                "next_repeat_order_date": "",
                "next_relationship_date": "",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }})
        await log_audit("delete_order", "order", order_id, current_user['id'],
                        current_user.get('name', ''),
                        f"Order soft-deleted (Rs.{order.get('total_amount', 0)}) — reason: {reason}")
        return {"message": "Order deleted — finance reversed, lead unlinked", "order_id": order_id}

    @api_router.post("/orders/{order_id}/restore")
    async def restore_order(order_id: str, current_user: dict = Depends(get_current_user)):
        if current_user['role'] != 'admin':
            raise HTTPException(status_code=403, detail="Only Admin can restore orders")
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404)
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"deleted": False,
                      "status": order.get("prev_status_before_delete", "pending")},
             "$unset": {"deleted_at": "", "deleted_by": "", "delete_reason": ""}}
        )
        await log_audit("restore_order", "order", order_id, current_user['id'],
                        current_user.get('name', ''), "Order restored from trash")
        return {"message": "Order restored"}

    @api_router.put("/orders/{order_id}/status")
    async def set_order_status(order_id: str, data: dict,
                               current_user: dict = Depends(get_current_user)):
        """Generic status updater. Auto revenue-reversal on return/RTO is DISABLED
        per business rule (2026-02, mirrors Post Office manual flow). Only commission
        gets auto-reversed on returned/RTO (that's employee earnings, not seller ledger).

        Custom `returned_at` date can be supplied via body {"returned_at":"YYYY-MM-DD"}
        so IM can back-date returns for historical analysis.

        Allowed roles: admin, sales_manager, inventory_manager."""
        if current_user['role'] not in ('admin', 'sales_manager', 'inventory_manager'):
            raise HTTPException(status_code=403, detail="Not authorized")
        new_status = (data.get("status") or "").strip().lower()
        if new_status not in ('pending', 'confirmed', 'shipped', 'delivered', 'returned', 'rto', 'cancelled'):
            raise HTTPException(status_code=400, detail="Invalid status")
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        prev_status = order.get("status")

        # ── FORWARD-ONLY TRANSITION GUARD (2026-02-13) ──
        # Once an order is shipped/delivered/returned/cancelled it can NEVER go back
        # to a pre-shipment status. This closes the "shipped order coming back to
        # pending" bug that IMs were reporting. Only forward moves (shipped→delivered,
        # delivered→returned, etc.) or lateral moves within terminal states (returned
        # ↔ rto) are permitted. Admin can override with force=True.
        rank = {"pending": 0, "confirmed": 1, "shipped": 2, "delivered": 3, "returned": 4, "rto": 4, "cancelled": 5}
        cur_rank = rank.get(prev_status, -1)
        new_rank = rank.get(new_status, -1)
        force = bool(data.get("force", False)) and current_user.get("role") == "admin"
        if not force and cur_rank >= 2 and new_rank < cur_rank and not (cur_rank == 4 and new_rank == 4):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot regress from '{prev_status}' to '{new_status}'. Once an order is shipped/delivered/returned it stays there. Ask admin to force if truly needed.",
            )
        reason = (data.get("reason") or "").strip()
        update_set = {
            "status": new_status,
            "status_updated_at": datetime.now(timezone.utc).isoformat(),
            "status_updated_by": current_user['id'],
            "status_updated_by_name": current_user.get('name', ''),
        }
        if reason:
            update_set["status_reason"] = reason
        # Handle return/RTO: reverse commission only (finance ledger stays manual).
        if new_status in ('returned', 'rto'):
            # Custom return date support (IM can back-date historical returns)
            custom_ret = (data.get("returned_at") or "").strip()
            if custom_ret:
                try:
                    # accept YYYY-MM-DD or full ISO
                    from datetime import date as _dt
                    _dt.fromisoformat(custom_ret[:10])
                    update_set["returned_at"] = custom_ret if "T" in custom_ret else f"{custom_ret[:10]}T00:00:00+00:00"
                except Exception:
                    raise HTTPException(status_code=400, detail="returned_at must be YYYY-MM-DD")
            else:
                update_set["returned_at"] = datetime.now(timezone.utc).isoformat()
            # NOTE: auto revenue-reversal REMOVED per iter 62. Finance stays manual.
            # Reverse commission (employee earnings only — safe to auto)
            await db.commissions.update_many(
                {"order_id": order_id, "status": {"$in": ["pending", "approved", "paid"]}},
                {"$set": {"status": "cancelled",
                          "cancelled_at": datetime.now(timezone.utc).isoformat(),
                          "cancel_reason": f"Order returned: {reason or 'N/A'}"}}
            )
        # Handle delivered transitioning — NO auto finance credit either (manual only).
        if new_status == 'delivered' and prev_status != 'delivered':
            update_set["delivered_at"] = datetime.now(timezone.utc).isoformat()
            update_set["delivered_by"] = current_user['id']
            update_set["delivered_by_name"] = current_user.get('name', '')
        await db.orders.update_one({"id": order_id}, {"$set": update_set})
        await log_audit("update_order_status", "order", order_id, current_user['id'],
                        current_user.get('name', ''),
                        f"{prev_status} → {new_status}" + (f" ({reason})" if reason else ""))
        return {"message": f"Order status updated to {new_status}", "order_id": order_id, "previous": prev_status}

    @api_router.get("/inventory/telecaller-returns")
    async def inventory_telecaller_returns(
        from_date: str = "",
        to_date: str = "",
        current_user: dict = Depends(get_current_user),
    ):
        """Per-TC returns analytics for the IM. Counts every order in status
        `returned` or `rto` grouped by the telecaller who placed it, over the
        selected date window. Body-less GET.
        Admin / IM / SM only."""
        if current_user['role'] not in ('admin', 'inventory_manager', 'sales_manager', 'head_of_sales'):
            raise HTTPException(status_code=403)
        from datetime import date as _date, timedelta as _td
        today = _date.today()
        try:
            cfrom = _date.fromisoformat(from_date) if from_date else today - _td(days=30)
            cto = _date.fromisoformat(to_date) if to_date else today
        except Exception:
            raise HTTPException(status_code=400, detail="from_date / to_date must be YYYY-MM-DD")
        if cto < cfrom:
            cfrom, cto = cto, cfrom
        # Match returned/rto orders in range (by returned_at, fallback to updated_at)
        from_iso = cfrom.isoformat(); to_iso = (cto + _td(days=1)).isoformat()
        cursor = db.orders.find({
            "status": {"$in": ["returned", "rto"]},
            "deleted": {"$ne": True},
        }, {"_id": 0}).limit(50000)
        by_tc = {}
        detail_rows = []
        async for o in cursor:
            ref = o.get("returned_at") or o.get("updated_at") or o.get("created_at") or ""
            if not ref or ref < from_iso or ref >= to_iso:
                continue
            tc_id = o.get("created_by") or "unknown"
            tc_name = o.get("created_by_name") or "Unknown"
            b = by_tc.setdefault(tc_id, {"telecaller_id": tc_id, "telecaller_name": tc_name,
                                         "returns_count": 0, "returns_value": 0.0,
                                         "reasons": {}})
            b["returns_count"] += 1
            b["returns_value"] += float(o.get("total_amount") or 0)
            r = o.get("status_reason") or "Not specified"
            b["reasons"][r] = b["reasons"].get(r, 0) + 1
            detail_rows.append({
                "order_id": o.get("id"),
                "telecaller_id": tc_id,
                "telecaller_name": tc_name,
                "customer_name": o.get("customer_name") or "",
                "customer_phone": o.get("customer_phone") or "",
                "amount": float(o.get("total_amount") or 0),
                "returned_at": (o.get("returned_at") or o.get("updated_at") or "")[:10],
                "reason": o.get("status_reason") or "",
                "created_at": (o.get("created_at") or "")[:10],
            })
        # Sort telecallers by highest return count first
        rows = list(by_tc.values())
        rows.sort(key=lambda r: (-r["returns_count"], -r["returns_value"]))
        for r in rows:
            r["returns_value"] = round(r["returns_value"], 2)
        return {
            "range_from": cfrom.isoformat(),
            "range_to": cto.isoformat(),
            "rows": rows,
            "detail_rows": detail_rows[:2000],
            "totals": {
                "returns_count": sum(r["returns_count"] for r in rows),
                "returns_value": round(sum(r["returns_value"] for r in rows), 2),
                "telecallers_with_returns": len(rows),
            },
        }


    @api_router.get("/orders/trash")
    async def get_deleted_orders(current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'sales_manager'):
            raise HTTPException(status_code=403)
        q = {"deleted": True}
        if current_user['role'] == 'sales_manager':
            ids = [current_user['id']]
            async for tc in db.telecallers.find(
                {"managed_by": current_user['id']}, {"_id": 0, "id": 1}
            ):
                ids.append(tc['id'])
            q["$or"] = [{"created_by": {"$in": ids}}, {"telecaller_id": {"$in": ids}}]
        return {"orders": await db.orders.find(q, {"_id": 0})
                .sort("deleted_at", -1).to_list(5000)}

    # ---------- 3. Telecaller Transfer ----------
    @api_router.post("/admin/transfer-telecaller")
    async def transfer_telecaller(data: dict, current_user: dict = Depends(get_current_user)):
        if current_user['role'] != 'admin':
            raise HTTPException(status_code=403, detail="Only Admin can transfer telecallers")
        tc_id = data.get("telecaller_id", "")
        new_sm_id = data.get("new_sales_manager_id", "")
        reason = data.get("reason", "")
        if not tc_id or not new_sm_id:
            raise HTTPException(status_code=400,
                                detail="telecaller_id and new_sales_manager_id are required")
        tc = await db.telecallers.find_one({"id": tc_id}, {"_id": 0})
        if not tc:
            raise HTTPException(status_code=404, detail="Telecaller not found")
        new_sm = await db.sales_managers.find_one(
            {"id": new_sm_id}, {"_id": 0, "id": 1, "name": 1}
        )
        if not new_sm:
            raise HTTPException(status_code=404, detail="Target sales manager not found")
        old_sm_id = tc.get("managed_by", "")
        old_sm = await db.sales_managers.find_one(
            {"id": old_sm_id}, {"_id": 0, "name": 1}
        ) if old_sm_id else None
        await db.telecallers.update_one(
            {"id": tc_id},
            {"$set": {
                "managed_by": new_sm_id,
                "managed_by_name": new_sm.get("name", ""),
                "managed_by_role": "sales_manager",
                "previous_managed_by": old_sm_id,
                "transferred_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        await db.leads.update_many(
            {"$or": [{"assigned_to": tc_id}, {"created_by": tc_id}]},
            {"$set": {"assigned_to_sm": new_sm_id,
                      "assigned_to_sm_name": new_sm.get("name", "")}}
        )
        await db.orders.update_many(
            {"$or": [{"telecaller_id": tc_id}, {"created_by": tc_id}]},
            {"$set": {"sales_manager_id": new_sm_id,
                      "sales_manager_name": new_sm.get("name", "")}}
        )
        transfer_log = {
            "id": f"xfer-{uuid.uuid4().hex[:10]}",
            "telecaller_id": tc_id,
            "telecaller_name": tc.get("name", ""),
            "from_sm_id": old_sm_id,
            "from_sm_name": old_sm.get("name", "") if old_sm else "",
            "to_sm_id": new_sm_id,
            "to_sm_name": new_sm.get("name", ""),
            "reason": reason,
            "by_user_id": current_user['id'],
            "by_user_name": current_user.get('name', ''),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.telecaller_transfers.insert_one(transfer_log)
        transfer_log.pop("_id", None)
        await log_audit("transfer_telecaller", "telecaller", tc_id, current_user['id'],
                        current_user.get('name', ''),
                        f"Transferred {tc.get('name','')} → {new_sm.get('name','')}")
        return {"message": "Transfer complete", "transfer": transfer_log}

    @api_router.get("/admin/telecaller-transfers")
    async def get_telecaller_transfers(current_user: dict = Depends(get_current_user)):
        if current_user['role'] != 'admin':
            raise HTTPException(status_code=403)
        return {"transfers": await db.telecaller_transfers.find({}, {"_id": 0})
                .sort("created_at", -1).to_list(5000)}

    # ---------- 4. Lead Status Counts ----------
    @api_router.get("/lead-status-counts")
    async def get_lead_status_counts(
        assigned_to: Optional[str] = None,
        month: Optional[str] = None,
        year: Optional[str] = None,
        day: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        q = {"deleted": {"$ne": True}}
        role = current_user['role']
        if role == 'telecaller':
            q['assigned_to'] = current_user['id']
        elif role == 'agent':
            q['assigned_to'] = current_user['id']
        elif role == 'sales_manager':
            tcs = await db.telecallers.find(
                {"managed_by": current_user['id']}, {"_id": 0, "id": 1}
            ).to_list(5000)
            ids = [t['id'] for t in tcs] + [current_user['id']]
            if assigned_to:
                if assigned_to not in ids:
                    raise HTTPException(status_code=403)
                q['created_by'] = assigned_to
            else:
                q['created_by'] = {"$in": ids}
        elif role in ('district_manager', 'manager'):
            ags = await db.agents.find(
                {"managed_by": current_user['id']}, {"_id": 0, "id": 1}
            ).to_list(5000)
            ids = [a['id'] for a in ags] + [current_user['id']]
            q['assigned_to'] = {"$in": ids}
        elif assigned_to:
            q['assigned_to'] = assigned_to
        if year and month and day and month != "all":
            prefix = f"{year}-{str(month).zfill(2)}-{str(day).zfill(2)}"
            q['created_at'] = {"$gte": prefix, "$lt": prefix + "T99"}
        elif year and month and month != "all":
            prefix = f"{year}-{str(month).zfill(2)}"
            q['created_at'] = {"$gte": prefix, "$lt": prefix + "~"}
        elif year:
            q['created_at'] = {"$gte": year, "$lt": year + "~"}
        statuses = ["new", "interested", "follow_up", "no_response",
                    "busy", "order_created", "not_interested"]
        out = {}
        total = 0
        for s in statuses:
            c = await db.leads.count_documents({**q, "status": s})
            out[s] = c
            total += c
        out["all"] = await db.leads.count_documents(q)
        return {"counts": out, "total": total}

    # ---------- 5. AI-style Expense Categorization ----------
    # type classification: each top-level expense head gets a default behaviour.
    #  - fixed   = recurring monthly cost regardless of revenue (rent, salary, utilities, internet, sw subs)
    #  - asset   = one-time capital purchase / vehicle / equipment that adds to assets
    #  - variable= scales with sales/operations (logistics, marketing, fuel, COGS, food)
    EXPENSE_TYPE_DEFAULTS = {
        "Fuel & Vehicle":              "variable",
        "Travel":                      "variable",
        "Logistics & Courier":         "variable",
        "Staff Welfare & Food":        "variable",
        "Marketing & Advertising":     "variable",
        "Office Supplies":             "variable",
        "Utilities":                   "fixed",
        "Rent & Property":             "fixed",
        "Repairs & Maintenance":       "variable",
        "Product COGS / Raw Material": "variable",
        "Tech & Software":             "fixed",
        "Salary & Wages":              "fixed",
        "Bank Charges":                "variable",
        "Legal & Compliance":          "fixed",
        "Vehicle / Equipment Purchase": "asset",
        "Furniture & Office Setup":    "asset",
        "Uncategorized":               "variable",
    }

    EXPENSE_KEYWORD_MAP = {
        "Fuel & Vehicle": ["petrol", "diesel", "fuel", "cng", "lpg", "vehicle",
                           "car wash", "service", "puncture", "tyre", "oil change"],
        "Travel": ["uber", "ola", "rapido", "auto", "taxi", "cab", "train",
                   "ksrtc", "bus", "irctc", "flight", "airfare", "hotel",
                   "lodging", "stay"],
        "Logistics & Courier": ["delhivery", "courier", "shipping", "shiprocket",
                                "dtdc", "bluedart", "fedex", "dhl", "india post",
                                "packaging", "polybag", "carton", "label",
                                "bubble wrap"],
        "Staff Welfare & Food": ["food", "lunch", "dinner", "tea", "coffee",
                                 "snack", "biryani", "swiggy", "zomato", "tiffin",
                                 "canteen", "water bottle", "birthday"],
        "Marketing & Advertising": ["facebook ad", "meta ads", "google ads",
                                    "instagram", "youtube", "influencer",
                                    "promotion", "campaign", "boost", "brochure",
                                    "flyer", "ad campaign"],
        "Office Supplies": ["stationery", "pen", "paper", "printer", "ink",
                            "toner", "register", "file", "folder", "envelope",
                            "cartridge"],
        "Utilities": ["electricity", "kseb", "water bill", "internet", "broadband",
                      "wifi", "jio", "airtel", "vodafone", "bsnl", "telephone"],
        "Rent & Property": ["rent", "lease", "deposit", "maintenance fee",
                            "property tax"],
        "Repairs & Maintenance": ["repair", "maintenance", "ac service", "plumber",
                                  "electrician", "carpenter", "painter"],
        "Product COGS / Raw Material": ["raw material", "bottle", "label print",
                                        "perfume oil", "essential oil",
                                        "preservative", "ingredient", "formula",
                                        "filling"],
        "Tech & Software": ["software", "subscription", "saas", "domain", "hosting",
                            "godaddy", "aws", "razorpay charge", "stripe charge",
                            "shopify", "renewal"],
        "Salary & Wages": ["salary", "wage", "stipend", "bonus", "incentive payout",
                           "freelance"],
        "Bank Charges": ["bank charge", "atm fee", "neft", "rtgs", "imps",
                         "transaction fee", "gst", "tds"],
        "Legal & Compliance": ["legal", "advocate", "ca ", "chartered accountant",
                               "audit fee", "licence", "trademark", "patent",
                               "fssai", "gstn"],
        "Vehicle / Equipment Purchase": ["motor purchase", "bike purchase",
                                         "scooter", "two-wheeler", "vehicle purchase",
                                         "laptop purchase", "computer purchase",
                                         "camera purchase", "machine purchase",
                                         "equipment purchase", "cctv install"],
        "Furniture & Office Setup": ["furniture", "chair", "desk", "table",
                                     "office setup", "interior", "renovation",
                                     "shelf", "cupboard", "air conditioner",
                                     "ac purchase", "fridge", "appliance"],
    }

    def _ai_categorize_expense(title: str, notes: str = "") -> dict:
        text = f"{title} {notes}".lower()
        best_match = None
        best_keyword = None
        for category, keywords in EXPENSE_KEYWORD_MAP.items():
            for kw in keywords:
                if kw in text:
                    best_match = category
                    best_keyword = kw
                    break
            if best_match:
                break
        return {
            "category": best_match or "Uncategorized",
            "confidence": 0.95 if best_match else 0.0,
            "matched_keyword": best_keyword or "",
            "rule_based": True,
        }

    @api_router.post("/expenses/categorize")
    async def categorize_expense(data: dict,
                                 current_user: dict = Depends(get_current_user)):
        title = (data.get("title", "") or "").strip()
        notes = (data.get("notes", "") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title is required")
        suggestion = _ai_categorize_expense(title, notes)
        custom_heads = await db.expense_heads.find({}, {"_id": 0}).to_list(5000)
        return {"suggestion": suggestion, "custom_heads": custom_heads}

    @api_router.get("/expense-heads")
    async def list_expense_heads(current_user: dict = Depends(get_current_user)):
        heads = await db.expense_heads.find({}, {"_id": 0}).sort("name", 1).to_list(5000)
        # If seeded but missing the newer fields, backfill them in-place
        for h in heads:
            if "expense_type" not in h or not h.get("expense_type"):
                h["expense_type"] = EXPENSE_TYPE_DEFAULTS.get(h.get("name", ""), "variable")
                await db.expense_heads.update_one({"id": h["id"]}, {"$set": {"expense_type": h["expense_type"]}})
        # Auto-insert any missing default heads (eg. Asset categories added later)
        existing_names = {h.get("name") for h in heads}
        missing_defaults = []
        for i, (cat, kws) in enumerate(EXPENSE_KEYWORD_MAP.items()):
            if cat not in existing_names:
                missing_defaults.append({
                    "id": f"head-auto-{uuid.uuid4().hex[:6]}",
                    "name": cat,
                    "keywords": ",".join(kws[:8]),
                    "expense_type": EXPENSE_TYPE_DEFAULTS.get(cat, "variable"),
                    "active": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        if missing_defaults:
            await db.expense_heads.insert_many([{**h} for h in missing_defaults])
            heads = await db.expense_heads.find({}, {"_id": 0}).sort("name", 1).to_list(5000)
        if not heads:
            defaults = []
            for i, (cat, kws) in enumerate(EXPENSE_KEYWORD_MAP.items()):
                defaults.append({
                    "id": f"head-default-{i}",
                    "name": cat,
                    "keywords": ",".join(kws[:8]),
                    "expense_type": EXPENSE_TYPE_DEFAULTS.get(cat, "variable"),
                    "active": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            await db.expense_heads.insert_many([{**h} for h in defaults])
            heads = [{**h} for h in defaults]
        return {"heads": heads, "types": ["fixed", "variable", "asset"]}

    @api_router.post("/expense-heads")
    async def create_expense_head(data: dict,
                                  current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        head = {
            "id": f"head-{uuid.uuid4().hex[:8]}",
            "name": (data.get("name") or "").strip(),
            "keywords": data.get("keywords", ""),
            "expense_type": (data.get("expense_type") or "variable").lower(),
            "active": True,
            "created_by": current_user['id'],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if head["expense_type"] not in ("fixed", "variable", "asset"):
            head["expense_type"] = "variable"
        if not head["name"]:
            raise HTTPException(status_code=400, detail="Name required")
        await db.expense_heads.insert_one(head)
        head.pop("_id", None)
        if head["keywords"]:
            EXPENSE_KEYWORD_MAP[head["name"]] = [
                k.strip().lower() for k in head["keywords"].split(",") if k.strip()
            ]
        EXPENSE_TYPE_DEFAULTS[head["name"]] = head["expense_type"]
        return {"head": head}

    @api_router.put("/expense-heads/{hid}")
    async def update_expense_head(hid: str, data: dict,
                                  current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        upd = {k: v for k, v in data.items()
               if k in ("name", "keywords", "expense_type", "active")}
        if "expense_type" in upd and upd["expense_type"] not in ("fixed", "variable", "asset"):
            upd["expense_type"] = "variable"
        await db.expense_heads.update_one({"id": hid}, {"$set": upd})
        head = await db.expense_heads.find_one({"id": hid}, {"_id": 0})
        if head:
            if head.get("keywords"):
                EXPENSE_KEYWORD_MAP[head["name"]] = [
                    k.strip().lower() for k in head["keywords"].split(",") if k.strip()
                ]
            EXPENSE_TYPE_DEFAULTS[head["name"]] = head.get("expense_type", "variable")
        return {"head": head}

    @api_router.delete("/expense-heads/{hid}")
    async def delete_expense_head(hid: str,
                                  current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        await db.expense_heads.delete_one({"id": hid})
        return {"message": "Head deleted"}

    @api_router.get("/expenses/analytics")
    async def expense_analytics(month: Optional[str] = None,
                                year: Optional[str] = None,
                                current_user: dict = Depends(get_current_user)):
        """Smart analytics: per-category totals + trend + overspending alerts."""
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        q = {}
        if year and month and month != "all":
            prefix = f"{year}-{str(month).zfill(2)}"
            q['created_at'] = {"$gte": prefix, "$lt": prefix + "~"}
        elif year:
            q['created_at'] = {"$gte": year, "$lt": year + "~"}
        by_cat = {}
        total = 0
        async for e in db.expenses.find(q, {"_id": 0, "category": 1, "amount": 1, "created_at": 1}):
            cat = e.get("category") or "Uncategorized"
            amt = float(e.get("amount") or 0)
            by_cat[cat] = by_cat.get(cat, 0) + amt
            total += amt
        breakdown = [{"category": k, "amount": round(v, 2),
                      "percentage": round(v / total * 100, 1) if total else 0}
                     for k, v in sorted(by_cat.items(), key=lambda x: -x[1])]
        alerts = [b for b in breakdown if b["percentage"] > 30]
        return {"total": round(total, 2), "breakdown": breakdown,
                "overspending_alerts": alerts, "category_count": len(by_cat)}

    @api_router.get("/expenses/grouped")
    async def expenses_grouped(month: Optional[str] = None,
                               year: Optional[str] = None,
                               expense_type: Optional[str] = None,
                               current_user: dict = Depends(get_current_user)):
        """Auto-group expenses by Head (basket) using keyword tracker and bucket
        each Head into fixed / variable / asset. Lets the FM see at a glance how
        much of the monthly burn is recurring fixed cost vs sales-driven variable
        cost vs capital asset purchases.
        """
        if current_user['role'] not in ('admin', 'finance_manager'):
            raise HTTPException(status_code=403)
        q = {}
        if year and month and month != "all":
            prefix = f"{year}-{str(month).zfill(2)}"
            q['created_at'] = {"$gte": prefix, "$lt": prefix + "~"}
        elif year:
            q['created_at'] = {"$gte": year, "$lt": year + "~"}

        # Load custom heads → name → expense_type map
        head_type_map = dict(EXPENSE_TYPE_DEFAULTS)
        async for h in db.expense_heads.find({}, {"_id": 0, "name": 1, "expense_type": 1, "keywords": 1}):
            if h.get("expense_type"):
                head_type_map[h["name"]] = h["expense_type"]

        groups = {}  # head -> {amount, count, items[], type}
        type_totals = {"fixed": 0.0, "variable": 0.0, "asset": 0.0, "uncategorized": 0.0}

        def _classify(title: str, notes: str, existing_cat: str):
            text = f"{title or ''} {notes or ''}".lower()
            # 1. honour the saved category if it matches a known head
            if existing_cat and existing_cat in head_type_map:
                return existing_cat, head_type_map[existing_cat]
            # 2. otherwise scan keywords
            for cat, kws in EXPENSE_KEYWORD_MAP.items():
                if any(kw in text for kw in kws):
                    return cat, head_type_map.get(cat, "variable")
            return existing_cat or "Uncategorized", "variable"

        grand_total = 0.0
        async for e in db.expenses.find(q, {"_id": 0, "title": 1, "description": 1, "amount": 1, "category": 1, "created_at": 1, "id": 1, "status": 1}):
            amt = float(e.get("amount") or 0)
            grand_total += amt
            head, etype = _classify(e.get("title", ""), e.get("description", ""), e.get("category", ""))
            g = groups.setdefault(head, {"head": head, "expense_type": etype, "amount": 0.0, "count": 0, "items": []})
            g["amount"] += amt
            g["count"] += 1
            g["items"].append({"id": e.get("id"), "title": e.get("title"), "amount": amt,
                               "date": (e.get("created_at") or "")[:10], "status": e.get("status", "")})
            bucket = etype if etype in type_totals else "uncategorized"
            type_totals[bucket] += amt

        # Sort groups by amount desc
        groups_list = sorted(groups.values(), key=lambda g: -g["amount"])
        for g in groups_list:
            g["amount"] = round(g["amount"], 2)
            g["percentage"] = round(g["amount"] / grand_total * 100, 1) if grand_total else 0
            # Cap items list for response size; full list available via /expenses
            g["items"] = sorted(g["items"], key=lambda i: -i["amount"])[:25]

        if expense_type and expense_type != "all":
            groups_list = [g for g in groups_list if g["expense_type"] == expense_type]

        type_totals = {k: round(v, 2) for k, v in type_totals.items()}
        return {
            "groups": groups_list,
            "type_totals": type_totals,
            "grand_total": round(grand_total, 2),
            "month": month, "year": year,
        }

    # ---------- 6. HR Open Positions ----------
    DEFAULT_HIRING_POSITIONS = [
        {"id": "pos-dm-intern", "title": "Digital Marketing Intern",
         "department": "Marketing", "vacancies": 4, "filled": 0, "active": True},
        {"id": "pos-hr", "title": "HR", "department": "Human Resources",
         "vacancies": 1, "filled": 0, "active": True},
        {"id": "pos-exec-sales-pt", "title": "Executive Sales (Part-time)",
         "department": "Sales", "vacancies": 2, "filled": 0, "active": True},
        {"id": "pos-telecalling", "title": "Telecalling", "department": "Sales",
         "vacancies": 2, "filled": 0, "active": True},
    ]

    @api_router.get("/hiring/positions")
    async def list_hiring_positions(current_user: dict = Depends(get_current_user)):
        pos = await db.hiring_positions.find({"active": True}, {"_id": 0}).to_list(5000)
        if not pos:
            for p in DEFAULT_HIRING_POSITIONS:
                p["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.hiring_positions.insert_many([{**p} for p in DEFAULT_HIRING_POSITIONS])
            pos = [{**p} for p in DEFAULT_HIRING_POSITIONS]
        for p in pos:
            p['filled_live'] = await db.hiring_candidates.count_documents(
                {"position": p['title'], "status": "hired"})
            p['in_pipeline'] = await db.hiring_candidates.count_documents(
                {"position": p['title'], "status": {"$nin": ["hired", "rejected"]}})
        return {"positions": pos}

    @api_router.post("/hiring/positions")
    async def create_hiring_position(data: dict,
                                     current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'hr_manager'):
            raise HTTPException(status_code=403)
        p = {
            "id": f"pos-{uuid.uuid4().hex[:8]}",
            "title": (data.get("title") or "").strip(),
            "department": data.get("department", ""),
            "vacancies": int(data.get("vacancies", 1)),
            "filled": 0,
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if not p["title"]:
            raise HTTPException(status_code=400, detail="Title required")
        await db.hiring_positions.insert_one(p)
        p.pop("_id", None)
        return {"position": p}

    @api_router.put("/hiring/positions/{pid}")
    async def update_hiring_position(pid: str, data: dict,
                                     current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'hr_manager'):
            raise HTTPException(status_code=403)
        upd = {k: v for k, v in data.items()
               if k in ("title", "department", "vacancies", "active")}
        if "vacancies" in upd:
            upd["vacancies"] = int(upd["vacancies"])
        upd["updated_at"] = datetime.now(timezone.utc).isoformat()
        r = await db.hiring_positions.update_one({"id": pid}, {"$set": upd})
        if not r.matched_count:
            raise HTTPException(status_code=404)
        return {"message": "Updated"}

    @api_router.delete("/hiring/positions/{pid}")
    async def delete_hiring_position(pid: str,
                                     current_user: dict = Depends(get_current_user)):
        if current_user['role'] not in ('admin', 'hr_manager'):
            raise HTTPException(status_code=403)
        await db.hiring_positions.update_one({"id": pid}, {"$set": {"active": False}})
        return {"message": "Position archived"}

    # ---------- 7. Demo Data Seeder ----------
    @api_router.post("/admin/seed-demo-data")
    async def seed_demo_data(current_user: dict = Depends(get_current_user)):
        if current_user['role'] != 'admin':
            raise HTTPException(status_code=403)
        marker = await db.app_config.find_one({"key": "demo_seeded_v1"})
        if marker:
            return {"message": "Demo data already seeded", "skipped": True}
        random.seed(42)
        now = datetime.now(timezone.utc)
        statuses = ["new", "interested", "follow_up", "no_response",
                    "busy", "order_created", "not_interested"]
        pickup_locations = ["Parakkal", "Office", "Kochi"]
        tc_ids = ["tc-001", "tc-002", "tc-003"]
        tc_names = {"tc-001": "Priya Nair", "tc-002": "Anjali Menon",
                    "tc-003": "Sneha Thomas"}
        first_names = ["Arun", "Bindu", "Chitra", "Deepak", "Elsa", "Faisal",
                       "Gita", "Hari", "Indu", "Jose", "Kavya", "Lekha",
                       "Mahesh", "Neethu", "Omana", "Praveen", "Riya", "Sajan",
                       "Tara", "Usha", "Vipin", "Wilson", "Xavier", "Yamuna",
                       "Zarin"]
        last_names = ["Nair", "Pillai", "Menon", "Thomas", "Krishnan", "Joseph",
                      "Varma", "Kurup", "Iyer", "Rao"]
        # Leads
        leads = []
        for i in range(60):
            created = now - timedelta(days=random.randint(0, 90))
            tc_id = random.choice(tc_ids)
            status = statuses[i % len(statuses)]
            leads.append({
                "id": f"lead-demo-{i:03d}",
                "name": f"{random.choice(first_names)} {random.choice(last_names)}",
                "phone_number": f"9{random.randint(700000000, 999999999)}",
                "alternate_phone": "",
                "email": f"customer{i}@example.com",
                "address": f"House #{i+1}",
                "city": random.choice(["Kochi", "Calicut", "Thiruvananthapuram", "Kannur"]),
                "state": "Kerala",
                "pincode": str(680000 + i),
                "source": random.choice(["facebook_ad", "instagram", "youtube",
                                         "referral", "walk_in", "google_ads"]),
                "product_interest": random.choice(["Glow Cream", "Hair Oil Combo",
                                                   "Face Wash", "Serum Pack"]),
                "status": status,
                "assigned_to": tc_id,
                "assigned_to_name": tc_names[tc_id],
                "created_by": tc_id,
                "created_by_name": tc_names[tc_id],
                "assigned_to_sm": "sm-001",
                "assigned_to_sm_name": "Hubby Brahman",
                "next_follow_up_date": (created + timedelta(days=random.randint(1, 14))).date().isoformat()
                                        if status in ("follow_up", "interested", "not_interested") else "",
                "notes": f"Demo lead — status: {status}",
                "deleted": False,
                "created_at": created.isoformat(),
            })
        if leads:
            await db.leads.insert_many(leads)
        # Orders
        orders = []
        for i in range(25):
            created = now - timedelta(days=random.randint(0, 75))
            order_status = random.choices(
                ["pending", "approved", "shipped", "delivered",
                 "rto", "returned", "cancelled"],
                weights=[3, 3, 4, 8, 2, 2, 1])[0]
            tc_id = random.choice(tc_ids)
            amount = random.choice([1499, 1999, 2499, 2999, 3499, 4999])
            orders.append({
                "id": f"ord-demo-{i:03d}",
                "customer_name": f"{random.choice(first_names)} {random.choice(last_names)}",
                "customer_phone": f"9{random.randint(700000000, 999999999)}",
                "customer_address": f"House #{i+50}",
                "customer_city": random.choice(["Kochi", "Calicut", "Thiruvananthapuram"]),
                "customer_state": "Kerala",
                "customer_pincode": str(680000 + i + 100),
                "items": [{"product": random.choice(["Glow Cream", "Hair Oil Combo", "Face Wash"]),
                           "qty": random.randint(1, 3), "price": amount}],
                "total_amount": amount,
                "payment_mode": random.choice(["cod", "prepaid"]),
                "status": order_status,
                "telecaller_id": tc_id,
                "telecaller_name": tc_names[tc_id],
                "created_by": tc_id,
                "created_by_name": tc_names[tc_id],
                "sales_manager_id": "sm-001",
                "sales_manager_name": "Hubby Brahman",
                "pickup_location": random.choice(pickup_locations),
                "delhivery_waybill": f"WB{random.randint(10000000, 99999999)}"
                                      if order_status in ("shipped", "delivered", "rto", "returned") else "",
                "delivered_at": (created + timedelta(days=random.randint(3, 8))).isoformat()
                                 if order_status == "delivered" else "",
                "rto_reason": "Customer not available" if order_status == "rto" else "",
                "return_reason": "Quality complaint" if order_status == "returned" else "",
                "deleted": False,
                "created_at": created.isoformat(),
            })
        if orders:
            await db.orders.insert_many(orders)
        # Candidates
        positions = ["Digital Marketing Intern", "HR",
                     "Executive Sales (Part-time)", "Telecalling"]
        cand_statuses = ["new", "shortlisted", "interview_scheduled",
                         "rejected", "hired"]
        cands = []
        for i in range(16):
            created = now - timedelta(days=random.randint(0, 120))
            cands.append({
                "id": f"cand-demo-{i:03d}",
                "name": f"{random.choice(first_names)} {random.choice(last_names)}",
                "phone": f"9{random.randint(700000000, 999999999)}",
                "email": f"applicant{i}@example.com",
                "position": positions[i % len(positions)],
                "source": random.choice(["naukri", "linkedin", "referral",
                                         "walk_in", "indeed"]),
                "experience_years": random.choice([0, 1, 2, 3, 5]),
                "status": random.choices(cand_statuses, weights=[5, 4, 3, 2, 2])[0],
                "created_by": "hr-001",
                "created_by_name": "Meera Nair",
                "created_by_role": "hr_manager",
                "notes": "Demo candidate — auto-seeded",
                "created_at": created.isoformat(),
            })
        if cands:
            await db.hiring_candidates.insert_many(cands)
        # Expenses
        sample_expenses = [
            ("Petrol refill for delivery van", "Fuel & Vehicle", 1500),
            ("Diesel for warehouse pickup", "Fuel & Vehicle", 2200),
            ("Ola cab to client meeting", "Travel", 350),
            ("Train ticket Cochin-Calicut", "Travel", 850),
            ("Delhivery courier — 12 parcels", "Logistics & Courier", 1800),
            ("Bubble wrap + carton boxes", "Logistics & Courier", 950),
            ("Team lunch Zomato", "Staff Welfare & Food", 1200),
            ("Office tea & snacks", "Staff Welfare & Food", 600),
            ("Facebook ad campaign boost", "Marketing & Advertising", 5000),
            ("Instagram influencer reel", "Marketing & Advertising", 3500),
            ("Printer ink cartridges", "Office Supplies", 1200),
            ("Stationery & files", "Office Supplies", 800),
            ("KSEB electricity bill", "Utilities", 3200),
            ("Jio Fiber broadband", "Utilities", 1500),
            ("Office rent — monthly", "Rent & Property", 25000),
            ("AC servicing", "Repairs & Maintenance", 1500),
            ("Plumber visit", "Repairs & Maintenance", 600),
            ("Perfume oil raw material", "Product COGS / Raw Material", 12000),
            ("Bottle filling labour", "Product COGS / Raw Material", 4500),
            ("Razorpay transaction charges", "Tech & Software", 850),
            ("Domain renewal godaddy", "Tech & Software", 1100),
            ("Freelance designer payment", "Salary & Wages", 3000),
            ("Bank NEFT charges", "Bank Charges", 250),
            ("CA fee — GST filing", "Legal & Compliance", 2500),
            ("FSSAI licence renewal", "Legal & Compliance", 7500),
            ("Petrol — sales team bikes", "Fuel & Vehicle", 1800),
            ("Auto rickshaw — courier drop", "Travel", 180),
            ("Polybag bulk order", "Logistics & Courier", 2200),
            ("Birthday cake for team", "Staff Welfare & Food", 850),
            ("Google Ads search campaign", "Marketing & Advertising", 4500),
        ]
        expenses = []
        for i, (title, cat, amount) in enumerate(sample_expenses):
            created = now - timedelta(days=random.randint(0, 90))
            expenses.append({
                "id": f"exp-demo-{i:03d}",
                "title": title,
                "category": cat,
                "amount": amount,
                "date": created.date().isoformat(),
                "payment_method": random.choice(["cash", "bank", "upi"]),
                "vendor": "",
                "notes": f"Demo expense — {cat}",
                "status": random.choice(["approved", "pending"]),
                "reimburse_status": "not_required",
                "created_by": random.choice(["admin-001", "fin-001"]),
                "created_by_name": random.choice(["Admin User", "Lakshmi Devi"]),
                "created_at": created.isoformat(),
            })
        if expenses:
            await db.expenses.insert_many(expenses)
        # Investments
        investments = []
        for i, (title, src, amount) in enumerate([
            ("Initial Capital Infusion", "Founder", 500000),
            ("Equipment Purchase Fund", "Founder", 150000),
            ("Inventory Stocking", "Working Capital Loan", 300000),
            ("Marketing Boost — Q2", "Founder", 100000),
            ("Office Setup Calicut", "Co-founder", 200000),
        ]):
            created = now - timedelta(days=random.randint(30, 180))
            investments.append({
                "id": f"inv-demo-{i:03d}",
                "title": title,
                "amount": amount,
                "source": src,
                "partner_type": "main",
                "date": created.date().isoformat(),
                "notes": "Demo investment record",
                "created_by": "admin-001",
                "created_by_name": "Admin User",
                "created_at": created.isoformat(),
            })
        if investments:
            await db.investments.insert_many(investments)
        # Assign all 3 telecallers to sm-001 + set default pickup
        await db.telecallers.update_many(
            {"id": {"$in": tc_ids}},
            {"$set": {"managed_by": "sm-001",
                      "managed_by_name": "Hubby Brahman",
                      "managed_by_role": "sales_manager"}}
        )
        # Set default pickup per telecaller
        for tc, pk in zip(tc_ids, ["pickup-parakkal", "pickup-office", "pickup-kochi"]):
            loc_name = pk.replace("pickup-", "").capitalize()
            await db.telecallers.update_one(
                {"id": tc},
                {"$set": {"preferred_pickup_id": pk, "preferred_pickup_name": loc_name}}
            )
        await db.app_config.insert_one({"key": "demo_seeded_v1", "value": True,
                                        "at": now.isoformat()})
        logger.info(f"Demo data seeded: {len(leads)} leads, {len(orders)} orders, "
                    f"{len(cands)} candidates, {len(expenses)} expenses, "
                    f"{len(investments)} investments")
        return {
            "message": "Demo data seeded successfully",
            "leads": len(leads),
            "orders": len(orders),
            "candidates": len(cands),
            "expenses": len(expenses),
            "investments": len(investments),
        }

    @api_router.post("/admin/clear-demo-data")
    async def clear_demo_data(current_user: dict = Depends(get_current_user)):
        if current_user['role'] != 'admin':
            raise HTTPException(status_code=403)
        deleted = {
            "leads": (await db.leads.delete_many({"id": {"$regex": "^lead-demo-"}})).deleted_count,
            "orders": (await db.orders.delete_many({"id": {"$regex": "^ord-demo-"}})).deleted_count,
            "candidates": (await db.hiring_candidates.delete_many({"id": {"$regex": "^cand-demo-"}})).deleted_count,
            "expenses": (await db.expenses.delete_many({"id": {"$regex": "^exp-demo-"}})).deleted_count,
            "investments": (await db.investments.delete_many({"id": {"$regex": "^inv-demo-"}})).deleted_count,
        }
        await db.app_config.delete_one({"key": "demo_seeded_v1"})
        return {"message": "Demo data cleared", "deleted": deleted}

    logger.info("User enhancements registered: pickup, order-delete, transfer, "
                "status-counts, expense AI, positions, demo seeder")
