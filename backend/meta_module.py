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
        event = _build_purchase_event_dict(order)
        # Overwrite event_time with "now" for realtime events (backfill uses clamped historical)
        event["event_time"] = int(time.time())
        # Attach client IP/UA for advanced matching
        client_ip, client_ua = _extract_client(request)
        if client_ip:
            event["user_data"]["client_ip_address"] = client_ip
        if client_ua:
            event["user_data"]["client_user_agent"] = client_ua
        result = await _post_events([event], test_event_code_override=test_event_code)
        ok = result["status"] < 400
        await _log_event(event["event_id"], "Purchase", event, result, ok)
        if not ok:
            logger.warning(f"Meta Purchase event rejected: {result}")
        return result
    except Exception as e:
        logger.exception(f"fire_purchase_event failed: {e}")
        return {"error": str(e)}


# ─── Bulk backfill helpers (historical events → Meta) ──────────────────────
def _parse_iso_to_epoch(iso_str: str) -> int:
    """Convert an ISO datetime string to unix epoch seconds. Falls back to now."""
    if not iso_str:
        return int(time.time())
    try:
        s = iso_str.replace("Z", "+00:00") if isinstance(iso_str, str) else str(iso_str)
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return int(time.time())


def _clamp_event_time(iso_str: str) -> int:
    """Meta CAPI rejects events older than 7 days. Clamp older event_times to
    ~6 days ago so historical backfills are accepted (they still help train
    lookalike audiences even if not used for direct ad attribution)."""
    ts = _parse_iso_to_epoch(iso_str)
    now = int(time.time())
    six_days_ago = now - (6 * 24 * 3600)
    if ts < six_days_ago:
        return six_days_ago
    if ts > now + 60:  # future timestamps also rejected
        return now
    return ts


def _build_lead_event_dict(lead: Dict[str, Any]) -> Dict[str, Any]:
    """Same shape as fire_lead_event's event, but with historical event_time."""
    user_data = _build_user_data(
        email=lead.get("email") or "",
        phone=lead.get("phone_number") or lead.get("phone") or "",
        name=lead.get("name") or "",
        city=lead.get("customer_city") or lead.get("city") or "",
        state=lead.get("customer_state") or lead.get("state") or "",
        zip_code=lead.get("customer_pincode") or lead.get("pincode") or "",
        country="IN",
    )
    return {
        "event_name": "Lead",
        "event_time": _clamp_event_time(lead.get("created_at") or ""),
        "event_id": f"lead-{lead.get('id')}",
        "action_source": "system_generated",
        "user_data": user_data,
        "custom_data": {
            "lead_id": lead.get("id"),
            "content_name": lead.get("product_interest") or "general",
            "lead_source": lead.get("source") or "crm_manual",
            "content_category": "lead",
        },
    }


def _item_id(it: Dict[str, Any], fallback: str) -> str:
    """Return a stable non-empty product ID for Meta contents. Falls back to a
    slug of product_name/name if product_id is missing (many older CRM orders
    saved items without a product_id)."""
    pid = str(it.get("product_id") or it.get("id") or "").strip()
    if pid:
        return pid
    name = str(it.get("product_name") or it.get("name") or "").strip().lower()
    if name:
        slug = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
        return slug or fallback
    return fallback


def _build_purchase_event_dict(order: Dict[str, Any]) -> Dict[str, Any]:
    user_data = _build_user_data(
        email=order.get("customer_email") or "",
        phone=order.get("customer_phone") or "",
        name=order.get("customer_name") or "",
        city=order.get("customer_city") or "",
        state=order.get("customer_state") or "",
        zip_code=order.get("customer_pincode") or "",
        country="IN",
    )
    order_id = str(order.get("id") or "unknown")
    items = order.get("items") or []
    contents = []
    content_ids: List[str] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        item_id = _item_id(it, fallback=f"{order_id}-item")
        qty = int(it.get("quantity") or 1)
        try:
            price = float(it.get("price") or it.get("unit_price") or 0)
        except Exception:
            price = 0.0
        if price <= 0:
            # Distribute total_amount evenly if we have no per-item price.
            try:
                price = float(order.get("total_amount") or 0) / max(len(items), 1)
            except Exception:
                price = 0.0
        contents.append({"id": item_id, "quantity": qty, "item_price": round(price, 2)})
        content_ids.append(item_id)

    custom_data: Dict[str, Any] = {
        "currency": "INR",
        "value": float(order.get("total_amount") or 0),
        "order_id": order_id,
        "content_type": "product",
        "num_items": sum(int(it.get("quantity") or 1) for it in items) or 1,
        "payment_method": (order.get("payment_type") or "cod").lower(),
    }
    # content_ids is REQUIRED for Purchase attribution; fall back to order_id.
    custom_data["content_ids"] = content_ids or [order_id]
    # contents is OPTIONAL — only send when we actually have items with real IDs.
    if contents:
        custom_data["contents"] = contents

    return {
        "event_name": "Purchase",
        "event_time": _clamp_event_time(order.get("created_at") or ""),
        "event_id": f"purchase-{order_id}",
        "action_source": "system_generated",
        "user_data": user_data,
        "custom_data": custom_data,
    }


async def backfill_events(kind: str, since_days: Optional[int] = None, limit: int = 5000, skip_already_sent: bool = True) -> Dict[str, Any]:
    """Backfill historical Lead or Purchase events to Meta in batches of 100.
    kind: 'leads' or 'orders'
    since_days: only send records created within the last N days (None = all)
    limit: hard cap on records to send this run (safety)
    skip_already_sent: skip event_ids that were already successfully accepted
                      by Meta (dedup against meta_events collection).
    """
    if not is_configured():
        return {"error": "meta_not_configured"}
    if _db is None:
        return {"error": "db_not_ready"}
    coll_name = "leads" if kind == "leads" else "orders"
    build_fn = _build_lead_event_dict if kind == "leads" else _build_purchase_event_dict
    ev_name = "Lead" if kind == "leads" else "Purchase"
    id_prefix = "lead-" if kind == "leads" else "purchase-"

    q: Dict[str, Any] = {}
    if since_days is not None:
        cutoff = (datetime.now(timezone.utc) - _td(days=since_days)).isoformat()
        q = {"created_at": {"$gte": cutoff}}
    cursor = _db[coll_name].find(q, {"_id": 0}).sort("created_at", 1).limit(limit)
    records = await cursor.to_list(limit)

    # Pre-fetch already-sent event_ids for dedup
    already_ok: set = set()
    if skip_already_sent and records:
        wanted_ids = [f"{id_prefix}{r.get('id')}" for r in records if r.get("id")]
        async for e in _db.meta_events.find(
            {"event_id": {"$in": wanted_ids}, "ok": True},
            {"_id": 0, "event_id": 1},
        ):
            already_ok.add(e["event_id"])

    batch: List[Dict[str, Any]] = []
    total_sent = 0
    total_ok = 0
    total_failed = 0
    total_skipped = 0
    errors: List[str] = []
    BATCH_SIZE = 100

    async def _flush():
        nonlocal batch, total_sent, total_ok, total_failed
        if not batch:
            return
        try:
            result = await _post_events(batch)
            ok = result["status"] < 400
            received = int(result.get("body", {}).get("events_received") or 0) if ok else 0
            total_sent += len(batch)
            if ok:
                total_ok += received or len(batch)
            else:
                total_failed += len(batch)
                errors.append(str(result.get("body"))[:200])
            for ev in batch:
                await _log_event(ev["event_id"], ev["event_name"], ev, result, ok)
        except Exception as e:
            total_failed += len(batch)
            errors.append(str(e)[:200])
        batch = []

    for r in records:
        try:
            ev = build_fn(r)
            if ev["event_id"] in already_ok:
                total_skipped += 1
                continue
            batch.append(ev)
            if len(batch) >= BATCH_SIZE:
                await _flush()
                await asyncio.sleep(0.2)
        except Exception as e:
            errors.append(f"build_err: {e}")
    await _flush()

    return {
        "kind": kind,
        "event_name": ev_name,
        "queried": len(records),
        "skipped_already_sent": total_skipped,
        "sent": total_sent,
        "accepted": total_ok,
        "failed": total_failed,
        "errors": errors[:5],
        "since_days": since_days,
    }


# Alias so we can `from datetime import timedelta` cleanly at top later
from datetime import timedelta as _td


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

    @api_router.post("/meta/backfill")
    async def meta_backfill(data: dict, current_user: dict = Depends(_admin_only)):
        """One-time bulk send of historical leads/orders to Meta.
        Body: {"kind": "leads" | "orders" | "both", "since_days": <int|null>, "limit": <int>}
        Notes:
          - since_days=null sends ALL historical records (careful — Meta only
            uses events from the last 7 days for ad attribution; older events
            still help build lookalike audiences).
          - limit is a hard safety cap per run (default 5000).
        Runs synchronously; response includes counts. For very large sets, call
        this multiple times with smaller `limit` chunks."""
        if not is_configured():
            raise HTTPException(status_code=400, detail="Meta integration not configured")
        kind = (data.get("kind") or "both").lower()
        since_days = data.get("since_days")
        if since_days is not None:
            try:
                since_days = int(since_days)
            except Exception:
                since_days = None
        limit = int(data.get("limit") or 5000)
        limit = max(1, min(limit, 20000))

        results: Dict[str, Any] = {}
        if kind in ("leads", "both"):
            results["leads"] = await backfill_events("leads", since_days=since_days, limit=limit)
        if kind in ("orders", "both"):
            results["orders"] = await backfill_events("orders", since_days=since_days, limit=limit)
        return results

    @api_router.get("/meta/backfill/preview")
    async def meta_backfill_preview(since_days: Optional[int] = None, current_user: dict = Depends(_admin_only)):
        """Return counts of records that WOULD be sent for a given since_days window.
        Lets the admin see how much data will hit Meta before firing backfill."""
        q: Dict[str, Any] = {}
        if since_days is not None:
            cutoff = (datetime.now(timezone.utc) - _td(days=int(since_days))).isoformat()
            q = {"created_at": {"$gte": cutoff}}
        try:
            leads_count = await _db.leads.count_documents(q)
            orders_count = await _db.orders.count_documents(q)
        except Exception:
            leads_count = 0
            orders_count = 0
        return {"since_days": since_days, "leads": leads_count, "orders": orders_count}

    logger.info("Meta CAPI routes registered (/meta/status, /meta/test, /meta/events)")
