"""
finance_gating.py — Cash-credit gating for Inventory Manager.

Before this change: when a COD order was marked delivered, the finance ledger
auto-credited the amount to the Bank account.

After this change:
  - COD-on-delivery creates a `finance_pending_credits` entry with status="pending"
  - Nothing hits the Bank account until Inventory Manager clicks "Add to Account"
  - UPI/Online payments follow the same manual-approval workflow

Endpoints:
    GET  /api/finance/pending-credits          — list pending credits
    POST /api/finance/pending-credits/{id}/approve  — IM/admin: credit to account
    POST /api/finance/pending-credits/{id}/reject   — IM/admin: mark as rejected (with reason)
    GET  /api/finance/pending-credits/summary  — grouped counts + totals

The order/finance flow inside server.py registers pending credits by writing
to `db.finance_pending_credits` when an order flips to delivered.
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Optional


def register_finance_gating(api_router: APIRouter, db, get_current_user):

    async def _require(user):
        if user.get("role") not in ("admin", "inventory_manager", "finance_manager"):
            raise HTTPException(403, "Not authorised")

    @api_router.get("/finance/pending-credits")
    async def pending_credits(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        q = {}
        if status: q["status"] = status
        else: q["status"] = "pending"
        rows = await db.finance_pending_credits.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return {"pending_credits": rows, "count": len(rows)}

    @api_router.get("/finance/pending-credits/summary")
    async def pending_credits_summary(current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        rows = await db.finance_pending_credits.find({}, {"_id": 0}).to_list(5000)
        by = {"pending": {"count": 0, "amount": 0.0},
              "approved": {"count": 0, "amount": 0.0},
              "rejected": {"count": 0, "amount": 0.0}}
        for r in rows:
            s = r.get("status") or "pending"
            if s not in by: continue
            by[s]["count"] += 1
            by[s]["amount"] += float(r.get("amount") or 0)
        for s in by:
            by[s]["amount"] = round(by[s]["amount"], 2)
        return by

    @api_router.post("/finance/pending-credits/{cid}/approve")
    async def approve_credit(cid: str, data: dict = None, current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        credit = await db.finance_pending_credits.find_one({"id": cid}, {"_id": 0})
        if not credit:
            raise HTTPException(404, "Credit not found")
        if credit.get("status") != "pending":
            raise HTTPException(400, f"Credit is already {credit.get('status')}")
        now = datetime.now(timezone.utc).isoformat()
        account = ((data or {}).get("account") or "Bank Account").strip()
        # Post to finance ledger (Bank)
        ledger_entry = {
            "id": f"fl-{cid}",
            "type": "credit",
            "account": account,
            "amount": float(credit.get("amount") or 0),
            "reference_type": "order",
            "reference_id": credit.get("order_id"),
            "description": f"COD/{credit.get('payment_type', 'cod').upper()} credit — Order {credit.get('order_id')} · {credit.get('customer_name') or ''}",
            "created_at": now,
            "created_by": current_user["id"],
            "created_by_name": current_user.get("name", ""),
            "approved_from_credit": cid,
        }
        await db.finance_ledger.insert_one(ledger_entry)
        # Mark credit approved
        await db.finance_pending_credits.update_one({"id": cid}, {"$set": {
            "status": "approved",
            "approved_at": now,
            "approved_by": current_user["id"],
            "approved_by_name": current_user.get("name", ""),
            "credited_account": account,
            "ledger_entry_id": ledger_entry["id"],
        }})
        return {"message": "Credit added to account", "ledger_entry_id": ledger_entry["id"]}

    @api_router.post("/finance/pending-credits/{cid}/reject")
    async def reject_credit(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
        await _require(current_user)
        reason = (data or {}).get("reason") or ""
        if not reason:
            raise HTTPException(400, "reason required")
        credit = await db.finance_pending_credits.find_one({"id": cid}, {"_id": 0})
        if not credit:
            raise HTTPException(404, "Credit not found")
        if credit.get("status") != "pending":
            raise HTTPException(400, f"Credit is already {credit.get('status')}")
        await db.finance_pending_credits.update_one({"id": cid}, {"$set": {
            "status": "rejected",
            "rejected_at": datetime.now(timezone.utc).isoformat(),
            "rejected_by": current_user["id"],
            "rejected_by_name": current_user.get("name", ""),
            "rejection_reason": reason,
        }})
        return {"message": "Credit rejected"}
