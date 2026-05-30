"""Coupons CRUD + public validation. Extracted from agent_store.py.

Exposes `evaluate_coupon` via helpers dict so the parent module's /order
endpoint can still apply discounts using the same logic.
"""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException, Depends


def evaluate_coupon(coupon: dict, subtotal: float) -> dict:
    """Return {ok, discount, reason}."""
    if not coupon or not coupon.get("active", True):
        return {"ok": False, "discount": 0, "reason": "Coupon is inactive"}
    today = datetime.now(timezone.utc).date().isoformat()
    vf = coupon.get("valid_from") or ""
    vt = coupon.get("valid_to") or ""
    if vf and today < vf:
        return {"ok": False, "discount": 0, "reason": "Coupon not yet valid"}
    if vt and today > vt:
        return {"ok": False, "discount": 0, "reason": "Coupon expired"}
    ul = int(coupon.get("usage_limit", 0) or 0)
    if ul and int(coupon.get("used_count", 0) or 0) >= ul:
        return {"ok": False, "discount": 0, "reason": "Coupon usage limit reached"}
    mcv = float(coupon.get("min_cart_value", 0) or 0)
    if mcv and subtotal < mcv:
        return {"ok": False, "discount": 0, "reason": f"Minimum cart value is ₹{int(mcv)}"}
    dt = (coupon.get("discount_type") or "flat").lower()
    dv = float(coupon.get("discount_value", 0) or 0)
    if dt == "percent":
        disc = round(subtotal * dv / 100.0, 2)
        mxd = float(coupon.get("max_discount", 0) or 0)
        if mxd and disc > mxd:
            disc = mxd
    else:
        disc = dv
    disc = min(disc, subtotal)  # never discount more than the cart
    if disc <= 0:
        return {"ok": False, "discount": 0, "reason": "No discount applicable"}
    return {"ok": True, "discount": round(disc, 2), "reason": ""}


def register(router, db, get_current_user, helpers):
    now = helpers["now"]
    strip_mongo = helpers["strip_mongo"]
    ensure_admin = helpers["ensure_admin"]
    validate_iso_date = helpers["validate_iso_date"]
    # Make evaluate_coupon callable from the parent module (used by /order)
    helpers["evaluate_coupon"] = evaluate_coupon

    @router.get("/admin/store/coupons")
    async def admin_list_coupons(current_user: dict = Depends(get_current_user)):
        ensure_admin(current_user)
        out = []
        async for c in db.store_coupons.find().sort("created_at", -1):
            out.append(strip_mongo(c))
        return {"coupons": out}

    @router.post("/admin/store/coupons")
    async def admin_create_coupon(data: dict, current_user: dict = Depends(get_current_user)):
        ensure_admin(current_user)
        code = (data.get("code") or "").strip().upper()
        if not code:
            raise HTTPException(400, "Coupon code is required")
        if await db.store_coupons.find_one({"code": code}):
            raise HTTPException(400, f"Coupon '{code}' already exists")
        discount_type = (data.get("discount_type") or "flat").lower()
        if discount_type not in ("flat", "percent"):
            raise HTTPException(400, "discount_type must be 'flat' or 'percent'")
        valid_from = validate_iso_date(data.get("valid_from", ""), "valid_from")
        valid_to = validate_iso_date(data.get("valid_to", ""), "valid_to")
        if valid_from and valid_to and valid_from > valid_to:
            raise HTTPException(400, "valid_from must be on or before valid_to")
        doc = {
            "id": "cpn-" + uuid.uuid4().hex[:8],
            "code": code,
            "description": (data.get("description") or "").strip(),
            "discount_type": discount_type,
            "discount_value": float(data.get("discount_value", 0) or 0),
            "min_cart_value": float(data.get("min_cart_value", 0) or 0),
            "max_discount": float(data.get("max_discount", 0) or 0),
            "usage_limit": int(data.get("usage_limit", 0) or 0),
            "used_count": 0,
            "valid_from": valid_from,
            "valid_to": valid_to,
            "active": bool(data.get("active", True)),
            "created_at": now(),
            "updated_at": now(),
        }
        await db.store_coupons.insert_one(doc)
        return {"coupon": {k: v for k, v in doc.items() if k != "_id"}}

    @router.put("/admin/store/coupons/{cid}")
    async def admin_update_coupon(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
        ensure_admin(current_user)
        allowed = {"description", "discount_type", "discount_value", "min_cart_value",
                   "max_discount", "usage_limit", "valid_from", "valid_to", "active"}
        updates = {k: v for k, v in (data or {}).items() if k in allowed}
        for k in ("discount_value", "min_cart_value", "max_discount"):
            if k in updates:
                updates[k] = float(updates[k] or 0)
        if "usage_limit" in updates:
            updates["usage_limit"] = int(updates["usage_limit"] or 0)
        if "discount_type" in updates and updates["discount_type"] not in ("flat", "percent"):
            raise HTTPException(400, "discount_type must be 'flat' or 'percent'")
        if "valid_from" in updates:
            updates["valid_from"] = validate_iso_date(updates["valid_from"], "valid_from")
        if "valid_to" in updates:
            updates["valid_to"] = validate_iso_date(updates["valid_to"], "valid_to")
        # Cross-validate from ≤ to, loading existing doc if only one side is changing
        if "valid_from" in updates or "valid_to" in updates:
            existing = await db.store_coupons.find_one({"id": cid}, {"_id": 0, "valid_from": 1, "valid_to": 1}) or {}
            effective_vf = updates.get("valid_from", existing.get("valid_from") or "")
            effective_vt = updates.get("valid_to", existing.get("valid_to") or "")
            if effective_vf and effective_vt and effective_vf > effective_vt:
                raise HTTPException(400, "valid_from must be on or before valid_to")
        if updates:
            updates["updated_at"] = now()
            await db.store_coupons.update_one({"id": cid}, {"$set": updates})
        return {"ok": True}

    @router.delete("/admin/store/coupons/{cid}")
    async def admin_delete_coupon(cid: str, current_user: dict = Depends(get_current_user)):
        ensure_admin(current_user)
        await db.store_coupons.delete_one({"id": cid})
        return {"ok": True}

    @router.post("/store/{slug}/validate-coupon")
    async def public_validate_coupon(slug: str, data: dict):
        code = (data.get("code") or "").strip().upper()
        subtotal = float(data.get("subtotal", 0) or 0)
        if not code:
            raise HTTPException(400, "Coupon code required")
        agent = await db.store_agents.find_one({"slug": slug, "active": True})
        if not agent:
            raise HTTPException(404, "Storefront not found")
        coupon = await db.store_coupons.find_one({"code": code})
        if not coupon:
            raise HTTPException(404, "Invalid coupon code")
        res = evaluate_coupon(coupon, subtotal)
        if not res["ok"]:
            raise HTTPException(400, res["reason"])
        return {
            "ok": True,
            "code": code,
            "discount": res["discount"],
            "discount_type": coupon.get("discount_type"),
            "discount_value": coupon.get("discount_value"),
            "description": coupon.get("description", ""),
        }
