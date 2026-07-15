"""
Razorpay Payment Links integration for Celesta Glow CRM.

Every telecaller can generate a shareable Razorpay Payment Link from their
dashboard with a manual amount. Razorpay automatically sends an SMS + email to
the customer. TCs & managers can see live status (created / paid / expired /
cancelled) either by polling `refresh_status` or via webhook auto-updates.

Wire-in:
    from razorpay_module import register as _rz_register
    _rz_register(api_router, db, get_current_user, log_audit)

Env vars (in backend/.env):
    RAZORPAY_KEY_ID          — mandatory (test: rzp_test_…, live: rzp_live_…)
    RAZORPAY_KEY_SECRET      — mandatory
    RAZORPAY_WEBHOOK_SECRET  — optional (for auto status updates on payment)
"""
import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

try:
    import razorpay
    _RAZORPAY_INSTALLED = True
except Exception as _rz_import_err:  # pragma: no cover
    razorpay = None
    _RAZORPAY_INSTALLED = False

from fastapi import Depends, HTTPException, Request

logger = logging.getLogger("razorpay_module")


def _client():
    if not _RAZORPAY_INSTALLED:
        return None
    key_id = (os.environ.get("RAZORPAY_KEY_ID") or "").strip()
    key_secret = (os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
    if not (key_id and key_secret):
        return None
    return razorpay.Client(auth=(key_id, key_secret))


def _ensure_keys():
    if not _RAZORPAY_INSTALLED:
        raise HTTPException(
            status_code=503,
            detail="Razorpay SDK not installed on this server. Run `pip install razorpay` and redeploy.",
        )
    c = _client()
    if not c:
        raise HTTPException(
            status_code=503,
            detail=(
                "Razorpay is not configured. Ask admin to set RAZORPAY_KEY_ID + "
                "RAZORPAY_KEY_SECRET in backend/.env and redeploy."
            ),
        )
    return c


def register(api_router, db, get_current_user, log_audit=None):
    """Attach every route to the caller's main api_router."""

    @api_router.post("/razorpay/payment-links")
    async def create_payment_link(data: dict, current_user: dict = Depends(get_current_user)):
        """Body: {amount, customer_phone, customer_name?, description?, lead_id?, order_id?, notify?}.

        `amount` is in rupees (float or int) — we convert to paise internally.
        `notify` (default True) tells Razorpay to send SMS + email to the customer.
        """
        role = current_user.get("role")
        if role not in ("telecaller", "inhouse_telecaller", "agent", "sales_manager",
                        "assistant_sales_manager", "admin", "head_of_sales"):
            raise HTTPException(status_code=403, detail="Not allowed")
        client = _ensure_keys()

        amount = data.get("amount")
        if amount is None:
            raise HTTPException(status_code=400, detail="amount is required (rupees)")
        try:
            amount_paise = int(round(float(amount) * 100))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="amount must be numeric")
        if amount_paise < 100:
            raise HTTPException(status_code=400, detail="Minimum amount is Rs.1")

        phone_raw = (data.get("customer_phone") or "").strip()
        digits = "".join(ch for ch in phone_raw if ch.isdigit())
        if len(digits) < 10:
            raise HTTPException(status_code=400, detail="Valid 10-digit customer phone required")
        contact_e164 = f"+91{digits[-10:]}"

        cust_name = (data.get("customer_name") or "").strip() or f"Customer {digits[-4:]}"
        description = (data.get("description") or "").strip() or "Celesta Glow Order"
        notify = data.get("notify", True)
        # Razorpay accepts only bool for these
        notify_sms = bool(notify)
        notify_email = False  # user has no email captured — SMS is enough

        # Build the Razorpay Payment Link payload
        expire_at = int((datetime.now(timezone.utc) + timedelta(days=7)).timestamp())
        payload = {
            "amount": amount_paise,
            "currency": "INR",
            "accept_partial": False,
            "description": description[:2048],
            "customer": {
                "name": cust_name[:100],
                "contact": contact_e164,
            },
            "notify": {"sms": notify_sms, "email": notify_email},
            "reminder_enable": True,
            "expire_by": expire_at,
            "notes": {
                "created_by_id": current_user["id"],
                "created_by_name": (current_user.get("name") or "")[:200],
                "created_by_role": role,
                "lead_id": data.get("lead_id") or "",
                "order_id": data.get("order_id") or "",
            },
        }

        try:
            link = client.payment_link.create(payload)
        except Exception as e:  # razorpay SDK raises BadRequestError / etc.
            logger.exception("Razorpay create_payment_link failed")
            raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")

        now_iso = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": link.get("id"),  # plink_XXXXXX
            "short_url": link.get("short_url", ""),
            "amount": amount_paise,
            "amount_rupees": round(amount_paise / 100.0, 2),
            "currency": "INR",
            "description": description,
            "customer_name": cust_name,
            "customer_phone": digits[-10:],
            "customer_phone_e164": contact_e164,
            "status": link.get("status") or "created",
            "created_at": now_iso,
            "expires_at": datetime.fromtimestamp(expire_at, tz=timezone.utc).isoformat(),
            "created_by": current_user["id"],
            "created_by_name": current_user.get("name") or "",
            "created_by_role": role,
            "lead_id": data.get("lead_id") or "",
            "order_id": data.get("order_id") or "",
            "notify_sms": notify_sms,
            "razorpay_raw": {k: link.get(k) for k in ("id", "short_url", "status", "amount", "customer")},
        }
        await db.payment_links.insert_one(dict(doc))
        doc.pop("_id", None)
        if log_audit:
            try:
                await log_audit(
                    "create_payment_link", "payment_link", doc["id"],
                    current_user["id"], current_user.get("name") or "",
                    f"Rs.{doc['amount_rupees']} → {contact_e164}",
                )
            except Exception:
                pass
        return {"payment_link": doc}

    @api_router.get("/razorpay/payment-links")
    async def list_payment_links(
        scope: str = "mine",
        status: str = "",
        current_user: dict = Depends(get_current_user),
    ):
        """List payment links. `scope=mine` (default) shows just the caller's links.
        Managers/admin can pass `scope=all` to see everyone's links."""
        q = {}
        role = current_user.get("role")
        if scope == "all":
            if role not in ("admin", "sales_manager", "assistant_sales_manager", "head_of_sales"):
                raise HTTPException(status_code=403, detail="Managers only")
        else:
            q["created_by"] = current_user["id"]
        if status:
            q["status"] = status
        rows = await db.payment_links.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
        # High-level counts for the dashboard KPIs
        counts = {"total": len(rows), "paid": 0, "created": 0, "expired": 0, "cancelled": 0}
        total_paid_amt = 0.0
        for r in rows:
            s = r.get("status") or "created"
            counts[s] = counts.get(s, 0) + 1
            if s == "paid":
                total_paid_amt += float(r.get("amount_rupees") or 0)
        return {"payment_links": rows, "counts": counts, "total_paid_amount": round(total_paid_amt, 2)}

    @api_router.post("/razorpay/payment-links/{plid}/refresh")
    async def refresh_payment_link(plid: str, current_user: dict = Depends(get_current_user)):
        """Poll Razorpay for latest status. Anyone who can see the link can refresh it."""
        client = _ensure_keys()
        row = await db.payment_links.find_one({"id": plid}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Payment link not found")
        role = current_user.get("role")
        if role not in ("admin", "sales_manager", "assistant_sales_manager", "head_of_sales") \
                and row.get("created_by") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Not your link")
        try:
            link = client.payment_link.fetch(plid)
        except Exception as e:
            logger.exception("Razorpay fetch failed")
            raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")
        new_status = link.get("status") or row.get("status")
        update = {
            "status": new_status,
            "razorpay_raw": {k: link.get(k) for k in ("id", "short_url", "status", "amount")},
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if new_status == "paid" and not row.get("paid_at"):
            update["paid_at"] = update["updated_at"]
            update["paid_amount_rupees"] = round(int(link.get("amount_paid") or link.get("amount") or 0) / 100.0, 2)
            # Auto-mark linked order as paid
            if row.get("order_id"):
                await db.orders.update_one({"id": row["order_id"]}, {"$set": {
                    "payment_status": "paid",
                    "payment_method": "razorpay_link",
                    "razorpay_link_id": plid,
                    "razorpay_paid_at": update["paid_at"],
                }})
        await db.payment_links.update_one({"id": plid}, {"$set": update})
        merged = {**row, **update}
        return {"payment_link": merged}

    @api_router.post("/razorpay/payment-links/{plid}/cancel")
    async def cancel_payment_link(plid: str, current_user: dict = Depends(get_current_user)):
        """Cancel an unpaid link. TC can cancel their own; managers can cancel any."""
        client = _ensure_keys()
        row = await db.payment_links.find_one({"id": plid}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        role = current_user.get("role")
        if role not in ("admin", "sales_manager", "assistant_sales_manager", "head_of_sales") \
                and row.get("created_by") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Not your link")
        if row.get("status") == "paid":
            raise HTTPException(status_code=400, detail="Already paid — cannot cancel")
        try:
            client.payment_link.cancel(plid)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")
        await db.payment_links.update_one({"id": plid}, {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_by": current_user["id"],
        }})
        return {"message": "Cancelled"}

    @api_router.post("/razorpay/webhook")
    async def razorpay_webhook(request: Request):
        """Razorpay hits this URL on every payment event. Verifies signature,
        updates the linked payment_link status, and auto-marks linked orders paid."""
        body = await request.body()
        secret = (os.environ.get("RAZORPAY_WEBHOOK_SECRET") or "").strip()
        client = _client()
        if secret and client:
            sig = request.headers.get("X-Razorpay-Signature", "")
            try:
                client.utility.verify_webhook_signature(body.decode(), sig, secret)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid signature")
        try:
            import json
            evt = json.loads(body.decode() or "{}")
        except Exception:
            raise HTTPException(status_code=400, detail="Bad JSON")
        event_name = evt.get("event", "")
        payload = evt.get("payload", {}) or {}
        link_entity = (payload.get("payment_link", {}) or {}).get("entity", {}) or {}
        plid = link_entity.get("id")
        if not plid:
            # Not a payment_link event — accept and ignore
            return {"ok": True, "ignored": True, "event": event_name}
        new_status = link_entity.get("status") or ("paid" if "paid" in event_name else None)
        if not new_status:
            return {"ok": True, "no_status": True}
        row = await db.payment_links.find_one({"id": plid}, {"_id": 0})
        if not row:
            return {"ok": True, "unknown_link": True}
        now_iso = datetime.now(timezone.utc).isoformat()
        update = {"status": new_status, "updated_at": now_iso, "last_webhook_event": event_name}
        if new_status == "paid" and not row.get("paid_at"):
            paid_amt = link_entity.get("amount_paid") or link_entity.get("amount") or 0
            update["paid_at"] = now_iso
            update["paid_amount_rupees"] = round(int(paid_amt) / 100.0, 2)
            # Auto-mark linked order paid, if any
            if row.get("order_id"):
                await db.orders.update_one({"id": row["order_id"]}, {"$set": {
                    "payment_status": "paid",
                    "payment_method": "razorpay_link",
                    "razorpay_link_id": plid,
                    "razorpay_paid_at": now_iso,
                }})
        await db.payment_links.update_one({"id": plid}, {"$set": update})
        return {"ok": True, "event": event_name, "status": new_status}
