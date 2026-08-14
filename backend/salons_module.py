"""
Salon / Store Tracker for Celesta Glow CRM.

Sales Managers visit salons (our primary B2B channel), track them through a
pipeline (visited → interested → onboarded → converted), and log recurring
orders. This module powers all backend routes; a matching Sales Manager
dashboard tab shows the pipeline, monthly order counts and quick-contact
(WhatsApp / call) shortcuts.

Order linkage: each order document CAN carry a `salon_id` field. When it
does, that order shows up in the salon's monthly report.
"""
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import Depends, HTTPException, Query

logger = logging.getLogger("salons")

_db = None

# ─── Status pipeline (order matters — kanban columns follow this) ────────────
STATUS_ORDER: List[str] = [
    "visited",       # SM walked in / met the owner
    "interested",    # Owner showed interest, needs follow-up
    "onboarded",     # Signed up as a B2B partner
    "converted",     # First paid order received
    "not_interested" # Owner declined — kept for follow-up later
]


def _clean_phone(p: str) -> str:
    if not p:
        return ""
    digits = re.sub(r"\D+", "", str(p))
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits[-10:] if len(digits) >= 10 else digits


def register(api_router, database, get_current_user):
    global _db
    _db = database

    def _sm_or_admin(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role")
        if role not in ("sales_manager", "admin"):
            raise HTTPException(status_code=403, detail="Sales Manager or Admin only")
        return current_user

    async def _own_or_admin_filter(current_user: dict) -> Dict[str, Any]:
        """SM only sees the salons they created. Admin sees everything."""
        if current_user.get("role") == "admin":
            return {}
        return {"created_by": current_user.get("id")}

    # ─── CREATE ─────────────────────────────────────────────────────────────
    @api_router.post("/salons")
    async def create_salon(data: dict, current_user: dict = Depends(_sm_or_admin)):
        name = (data.get("name") or "").strip()
        phone = _clean_phone(data.get("phone") or "")
        if not name:
            raise HTTPException(status_code=400, detail="Salon name required")
        if not phone or len(phone) != 10:
            raise HTTPException(status_code=400, detail="Valid 10-digit phone required")
        # Dedupe by phone per user (SM shouldn't accidentally re-add same salon)
        existing = await _db.salons.find_one({
            "phone": phone,
            "created_by": current_user["id"],
        }, {"_id": 0, "id": 1, "name": 1})
        if existing:
            raise HTTPException(status_code=409, detail=f"You already added this phone under '{existing['name']}'")
        status = data.get("status") or "visited"
        if status not in STATUS_ORDER:
            status = "visited"
        salon = {
            "id": f"salon-{uuid.uuid4().hex[:10]}",
            "name": name[:100],
            "owner_name": (data.get("owner_name") or "").strip()[:60],
            "phone": phone,
            "whatsapp": _clean_phone(data.get("whatsapp") or "") or phone,
            "email": (data.get("email") or "").strip()[:100],
            "address": (data.get("address") or "").strip(),
            "landmark": (data.get("landmark") or "").strip()[:100],
            "area": (data.get("area") or "").strip()[:100],
            "city": (data.get("city") or "").strip()[:60],
            "district": (data.get("district") or "").strip()[:60],
            "state": (data.get("state") or "Kerala").strip()[:60],
            "pincode": re.sub(r"\D", "", str(data.get("pincode") or ""))[:6],
            "status": status,
            "notes": (data.get("notes") or "").strip(),
            "created_by": current_user["id"],
            "created_by_name": current_user.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "status_history": [{
                "status": status,
                "at": datetime.now(timezone.utc).isoformat(),
                "by": current_user["id"],
                "by_name": current_user.get("name", ""),
            }],
        }
        await _db.salons.insert_one(salon)
        salon.pop("_id", None)
        return {"salon": salon}

    # ─── LIST ───────────────────────────────────────────────────────────────
    @api_router.get("/salons")
    async def list_salons(
        status: Optional[str] = Query(None, description="Filter by status; comma-separated ok"),
        q: Optional[str] = Query(None, description="Fuzzy search on name/owner/phone/area/city"),
        current_user: dict = Depends(_sm_or_admin),
    ):
        query = await _own_or_admin_filter(current_user)
        if status and status != "all":
            statuses = [s.strip() for s in status.split(",") if s.strip()]
            query["status"] = {"$in": statuses}
        if q:
            regex = {"$regex": re.escape(q.strip()), "$options": "i"}
            query["$or"] = [
                {"name": regex}, {"owner_name": regex}, {"phone": regex},
                {"area": regex}, {"city": regex}, {"district": regex},
            ]
        cur = _db.salons.find(query, {"_id": 0}).sort("updated_at", -1).limit(2000)
        salons = await cur.to_list(2000)

        # Attach monthly order aggregate (this month) so the list can display
        # a quick counter next to each onboarded/converted salon.
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        ids = [s["id"] for s in salons]
        agg_map: Dict[str, Dict[str, float]] = {}
        if ids:
            pipeline = [
                {"$match": {"salon_id": {"$in": ids}, "created_at": {"$gte": month_start.isoformat()}}},
                {"$group": {"_id": "$salon_id", "count": {"$sum": 1}, "revenue": {"$sum": "$total_amount"}}},
            ]
            async for r in _db.orders.aggregate(pipeline):
                agg_map[r["_id"]] = {"count": r["count"], "revenue": r["revenue"]}
        for s in salons:
            s["month_orders"] = agg_map.get(s["id"], {}).get("count", 0)
            s["month_revenue"] = agg_map.get(s["id"], {}).get("revenue", 0)

        # Pipeline totals for kanban header badges
        stats: Dict[str, int] = {}
        for s in salons:
            stats[s["status"]] = stats.get(s["status"], 0) + 1
        return {"salons": salons, "stats": stats, "total": len(salons)}

    # ─── DETAIL + ORDERS ─────────────────────────────────────────────────────
    @api_router.get("/salons/{salon_id}")
    async def get_salon(salon_id: str, current_user: dict = Depends(_sm_or_admin)):
        query = await _own_or_admin_filter(current_user)
        query["id"] = salon_id
        salon = await _db.salons.find_one(query, {"_id": 0})
        if not salon:
            raise HTTPException(status_code=404, detail="Salon not found")
        return {"salon": salon}

    @api_router.get("/salons/{salon_id}/orders")
    async def salon_orders(
        salon_id: str,
        month: Optional[str] = Query(None, description="YYYY-MM (default this month)"),
        current_user: dict = Depends(_sm_or_admin),
    ):
        # Access check
        access_q = await _own_or_admin_filter(current_user)
        access_q["id"] = salon_id
        if not await _db.salons.find_one(access_q, {"_id": 0, "id": 1}):
            raise HTTPException(status_code=404, detail="Salon not found")

        q: Dict[str, Any] = {"salon_id": salon_id}
        if month:
            try:
                y, m = month.split("-")
                start = datetime(int(y), int(m), 1, tzinfo=timezone.utc)
                end = (start + timedelta(days=32)).replace(day=1)
                q["created_at"] = {"$gte": start.isoformat(), "$lt": end.isoformat()}
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid month; use YYYY-MM")
        orders = await _db.orders.find(q, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
        total_revenue = sum(float(o.get("total_amount") or 0) for o in orders)
        return {"orders": orders, "count": len(orders), "revenue": total_revenue, "month": month}

    # ─── UPDATE (edit fields OR change status) ───────────────────────────────
    @api_router.patch("/salons/{salon_id}")
    async def update_salon(salon_id: str, data: dict, current_user: dict = Depends(_sm_or_admin)):
        access_q = await _own_or_admin_filter(current_user)
        access_q["id"] = salon_id
        salon = await _db.salons.find_one(access_q, {"_id": 0})
        if not salon:
            raise HTTPException(status_code=404, detail="Salon not found")

        updates: Dict[str, Any] = {}
        # Editable text fields
        for f in ("name", "owner_name", "email", "address", "landmark", "area",
                  "city", "district", "state", "pincode", "notes"):
            if f in data:
                updates[f] = str(data[f] or "").strip()
        if "phone" in data:
            updates["phone"] = _clean_phone(data["phone"])
        if "whatsapp" in data:
            updates["whatsapp"] = _clean_phone(data["whatsapp"]) or updates.get("phone") or salon.get("phone")

        # Status transition with history log
        push_history = None
        if "status" in data and data["status"] in STATUS_ORDER and data["status"] != salon.get("status"):
            updates["status"] = data["status"]
            push_history = {
                "status": data["status"],
                "at": datetime.now(timezone.utc).isoformat(),
                "by": current_user["id"],
                "by_name": current_user.get("name", ""),
                "note": (data.get("status_note") or "").strip(),
            }

        if not updates and not push_history:
            return {"salon": salon}

        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        mongo_update: Dict[str, Any] = {"$set": updates}
        if push_history:
            mongo_update["$push"] = {"status_history": push_history}
        await _db.salons.update_one({"id": salon_id}, mongo_update)
        salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
        return {"salon": salon}

    # ─── DELETE (soft-hard) ──────────────────────────────────────────────────
    @api_router.delete("/salons/{salon_id}")
    async def delete_salon(salon_id: str, current_user: dict = Depends(_sm_or_admin)):
        access_q = await _own_or_admin_filter(current_user)
        access_q["id"] = salon_id
        r = await _db.salons.delete_one(access_q)
        if not r.deleted_count:
            raise HTTPException(status_code=404, detail="Salon not found")
        return {"ok": True, "id": salon_id}

    logger.info("Salons routes registered (/salons GET/POST/PATCH/DELETE, /salons/:id/orders)")
