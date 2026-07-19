"""
Meta Conversions API (CAPI) v25.0 — server-side event tracking for Celesta Glow CRM.

Sends events to Meta so ad campaigns can optimize for the RIGHT audience:
  • Lead   → whenever a TC/agent adds a new lead to the CRM
  • Purchase → whenever a COD/UPI order is created

PII (email, phone, name, city, zip, country) is SHA-256 hashed per Meta spec.

Wire-in:
    from meta_module import register as _meta_register, fire_lead_event, fire_purchase_event
    _meta_register(api_router, db, get_current_user)
    # Inside create_lead:
    asyncio.create_task(fire_lead_event(lead, request))
    # Inside create_order:
    asyncio.create_task(fire_purchase_event(order, request))

Env vars (backend/.env):
    META_ENABLED           — "1" to send, "0" to skip (kill switch)
    META_PIXEL_ID          — Meta pixel/dataset ID
    META_ACCESS_TOKEN      — CAPI access token
    META_GRAPH_VERSION     — e.g. v25.0
    META_TEST_EVENT_CODE   — optional; if set, events go to Test Events (dev only)
"""
import os
import re
import time
import json
import hashlib
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import aiohttp
from fastapi import Depends, HTTPException, Request

logger = logging.getLogger("meta_module")

# ─── Module-level config (read at import) ────────────────────────────────────
_ENABLED = os.environ.get("META_ENABLED", "0").strip() == "1"
_PIXEL_ID = (os.environ.get("META_PIXEL_ID") or "").strip()
_ACCESS_TOKEN = (os.environ.get("META_ACCESS_TOKEN") or "").strip()
_GRAPH_VERSION = (os.environ.get("META_GRAPH_VERSION") or "v25.0").strip()
_TEST_EVENT_CODE = (os.environ.get("META_TEST_EVENT_CODE") or "").strip()

_db = None  # injected via register()


def is_configured() -> bool:
    return bool(_ENABLED and _PIXEL_ID and _ACCESS_TOKEN)


# ─── PII hashing helpers (Meta CAPI spec) ────────────────────────────────────
def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hash_email(email: str) -> Optional[str]:
    if not email:
        return None
    v = email.strip().lower()
    if "@" not in v:
        return None
    return _sha256(v)


def _hash_phone(phone: str) -> Optional[str]:
    if not phone:
        return None
    # Keep digits only; Meta expects E.164-style digits (country code included).
    digits = re.sub(r"\D+", "", phone)
    if len(digits) < 7:
        return None
    # Prepend India country code if it's a 10-digit local number
    if len(digits) == 10:
        digits = "91" + digits
    return _sha256(digits)


def _hash_text(value: str) -> Optional[str]:
    if not value:
        return None
    v = re.sub(r"\s+", "", value.strip().lower())
    if not v:
        return None
    return _sha256(v)


def _first_last(name: str):
    parts = (name or "").strip().split()
    if not parts:
        return None, None
    first = parts[0]
    last = " ".join(parts[1:]) if len(parts) > 1 else None
    return first, last


def _build_user_data(
    email: str = "",
    phone: str = "",
    name: str = "",
    city: str = "",
    state: str = "",
    zip_code: str = "",
    country: str = "IN",
    client_ip: Optional[str] = None,
    client_ua: Optional[str] = None,
) -> Dict[str, Any]:
    """Build Meta CAPI user_data with hashed PII. Fields are ARRAYS per spec."""
    ud: Dict[str, Any] = {}
    em = _hash_email(email)
    if em:
        ud["em"] = [em]
    ph = _hash_phone(phone)
    if ph:
        ud["ph"] = [ph]
    first, last = _first_last(name)
    fn_h = _hash_text(first or "")
    ln_h = _hash_text(last or "")
    if fn_h:
        ud["fn"] = [fn_h]
    if ln_h:
        ud["ln"] = [ln_h]
    ct = _hash_text(city or "")
    if ct:
        ud["ct"] = [ct]
    st = _hash_text(state or "")
    if st:
        ud["st"] = [st]
    zp = _hash_text(zip_code or "")
    if zp:
        ud["zp"] = [zp]
    co = _hash_text(country or "IN")
    if co:
        ud["country"] = [co]
    if client_ip:
        ud["client_ip_address"] = client_ip
    if client_ua:
        ud["client_user_agent"] = client_ua
    return ud


# ─── Low-level CAPI post ─────────────────────────────────────────────────────
async def _post_events(events: List[Dict[str, Any]], test_event_code_override: Optional[str] = None) -> Dict[str, Any]:
    """POST a batch of events to Meta Conversions API. Returns Meta's JSON."""
    url = f"https://graph.facebook.com/{_GRAPH_VERSION}/{_PIXEL_ID}/events"
    body: Dict[str, Any] = {"data": events, "access_token": _ACCESS_TOKEN}
    tec = test_event_code_override if test_event_code_override is not None else _TEST_EVENT_CODE
    if tec:
        body["test_event_code"] = tec
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as sess:
        async with sess.post(url, json=body) as resp:
            text = await resp.text()
            try:
                parsed = json.loads(text)
            except Exception:
                parsed = {"raw": text[:400]}
            return {"status": resp.status, "body": parsed}


async def _log_event(event_id: str, event_name: str, event: Dict[str, Any], result: Dict[str, Any], ok: bool):
    if _db is None:
        return
    try:
        await _db.meta_events.update_one(
            {"event_id": event_id},
            {"$set": {
                "event_id": event_id,
                "event_name": event_name,
                "event": event,
                "meta_response": result,
                "ok": ok,
                "at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"meta_events log failed: {e}")


# ─── High-level fire functions (called from lead/order create) ───────────────
async def fire_lead_event(lead: Dict[str, Any], request: Optional[Request] = None, test_event_code: Optional[str] = None) -> Dict[str, Any]:
    """Fire a Meta 'Lead' event for a newly created CRM lead. Fails silently."""
    if not is_configured():
        return {"skipped": "meta_not_configured"}
    try:
        event_id = f"lead-{lead.get('id') or lead.get('_id') or uuid_short()}"
        client_ip, client_ua = _extract_client(request)
        user_data = _build_user_data(
            email=lead.get("email") or "",
            phone=lead.get("phone_number") or lead.get("phone") or "",
            name=lead.get("name") or "",
            city=lead.get("customer_city") or lead.get("city") or "",
            state=lead.get("customer_state") or lead.get("state") or "",
            zip_code=lead.get("customer_pincode") or lead.get("pincode") or "",
            country="IN",
            client_ip=client_ip,
            client_ua=client_ua,
        )
        event = {
            "event_name": "Lead",
            "event_time": int(time.time()),
            "event_id": event_id,
            "action_source": "system_generated",
            "user_data": user_data,
            "custom_data": {
                "lead_id": lead.get("id"),
                "content_name": lead.get("product_interest") or "general",
                "lead_source": lead.get("source") or "crm_manual",
                "content_category": "lead",
            },
        }
        result = await _post_events([event], test_event_code_override=test_event_code)
        ok = result["status"] < 400
        await _log_event(event_id, "Lead", event, result, ok)
        if not ok:
            logger.warning(f"Meta Lead event rejected: {result}")
        return result
    except Exception as e:
        logger.exception(f"fire_lead_event failed: {e}")
        return {"error": str(e)}


async def fire_purchase_event(order: Dict[str, Any], request: Optional[Request] = None, test_event_code: Optional[str] = None) -> Dict[str, Any]:
    """Fire a Meta 'Purchase' event for a newly created CRM order. Fails silently."""
    if not is_configured():
        return {"skipped": "meta_not_configured"}
    try:
        event_id = f"purchase-{order.get('id') or uuid_short()}"
        client_ip, client_ua = _extract_client(request)
        user_data = _build_user_data(
            email=order.get("customer_email") or "",
            phone=order.get("customer_phone") or "",
            name=order.get("customer_name") or "",
            city=order.get("customer_city") or "",
            state=order.get("customer_state") or "",
            zip_code=order.get("customer_pincode") or "",
            country="IN",
            client_ip=client_ip,
            client_ua=client_ua,
        )
        items = order.get("items") or []
        content_ids = [str(it.get("product_id") or it.get("id") or "") for it in items if it]
        content_ids = [c for c in content_ids if c]
        contents = []
        for it in items:
            contents.append({
                "id": str(it.get("product_id") or it.get("id") or ""),
                "quantity": int(it.get("quantity") or 1),
                "item_price": float(it.get("price") or it.get("unit_price") or 0),
            })
        payment_type = (order.get("payment_type") or "cod").lower()
        event = {
            "event_name": "Purchase",
            "event_time": int(time.time()),
            "event_id": event_id,
            "action_source": "system_generated",
            "user_data": user_data,
            "custom_data": {
                "currency": "INR",
                "value": float(order.get("total_amount") or 0),
                "order_id": order.get("id"),
                "content_ids": content_ids or [order.get("id", "")],
                "content_type": "product",
                "contents": contents,
                "num_items": sum(int(it.get("quantity") or 1) for it in items) or 1,
                "payment_method": payment_type,  # cod / upi / razorpay etc.
            },
        }
        result = await _post_events([event], test_event_code_override=test_event_code)
        ok = result["status"] < 400
        await _log_event(event_id, "Purchase", event, result, ok)
        if not ok:
            logger.warning(f"Meta Purchase event rejected: {result}")
        return result
    except Exception as e:
        logger.exception(f"fire_purchase_event failed: {e}")
        return {"error": str(e)}


# ─── Small helpers ───────────────────────────────────────────────────────────
def uuid_short() -> str:
    import uuid as _u
    return _u.uuid4().hex[:12]


def _extract_client(request: Optional[Request]):
    if not request:
        return None, None
    ip = None
    ua = None
    try:
        ip = request.client.host if request.client else None
        # Prefer X-Forwarded-For when behind Cloudflare / K8s ingress
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            ip = xff.split(",")[0].strip() or ip
        ua = request.headers.get("user-agent") or None
    except Exception:
        pass
    return ip, ua


# ─── FastAPI routes for admin Data Connections panel ─────────────────────────
def register(api_router, database, get_current_user):
    """Mount Meta admin routes: /meta/status, /meta/events, /meta/test."""
    global _db
    _db = database

    def _admin_only(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        return current_user

    @api_router.get("/meta/status")
    async def meta_status(current_user: dict = Depends(_admin_only)):
        """Return integration health + last event summary for the admin panel."""
        recent = []
        try:
            cursor = _db.meta_events.find({}, {"_id": 0}).sort("at", -1).limit(20)
            recent = await cursor.to_list(20)
        except Exception:
            recent = []
        total = 0
        ok_count = 0
        fail_count = 0
        try:
            total = await _db.meta_events.count_documents({})
            ok_count = await _db.meta_events.count_documents({"ok": True})
            fail_count = await _db.meta_events.count_documents({"ok": False})
        except Exception:
            pass
        return {
            "configured": is_configured(),
            "enabled": _ENABLED,
            "pixel_id": _PIXEL_ID[:8] + "…" + _PIXEL_ID[-4:] if _PIXEL_ID else "",
            "graph_version": _GRAPH_VERSION,
            "test_mode": bool(_TEST_EVENT_CODE),
            "token_masked": (_ACCESS_TOKEN[:6] + "…" + _ACCESS_TOKEN[-4:]) if _ACCESS_TOKEN else "",
            "totals": {"total": total, "ok": ok_count, "failed": fail_count},
            "recent_events": recent,
        }

    @api_router.post("/meta/test")
    async def meta_test(data: dict, current_user: dict = Depends(_admin_only)):
        """Send a synthetic Test Purchase to Meta with test_event_code — helps
        admin verify the pixel wire-up in Events Manager → Test Events."""
        if not is_configured():
            raise HTTPException(status_code=400, detail="Meta integration not configured")
        test_code = (data.get("test_event_code") or "").strip()
        fake_order = {
            "id": f"TEST-{int(time.time())}",
            "customer_name": data.get("name") or "Test Customer",
            "customer_phone": data.get("phone") or "9876543210",
            "customer_email": data.get("email") or "test@example.com",
            "customer_city": "Kochi",
            "customer_state": "Kerala",
            "customer_pincode": "682001",
            "total_amount": float(data.get("amount") or 999),
            "payment_type": "cod",
            "items": [{"product_id": "test-sku", "quantity": 1, "price": 999}],
        }
        # Temporarily override test event code for this single call
        result = await fire_purchase_event(fake_order, request=None, test_event_code=test_code or None)
        return {"result": result}

    @api_router.get("/meta/events")
    async def meta_events_list(limit: int = 50, current_user: dict = Depends(_admin_only)):
        """List recent Meta CAPI events (both success + fail) for the audit log."""
        try:
            cursor = _db.meta_events.find({}, {"_id": 0}).sort("at", -1).limit(min(limit, 200))
            docs = await cursor.to_list(min(limit, 200))
            return {"events": docs}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    logger.info("Meta CAPI routes registered (/meta/status, /meta/test, /meta/events)")
