"""Customer Photo Sessions — secure remote photo capture flow.

Flow:
1. SM hits POST /api/customer-photos/request with { customer_phone, customer_name?, lead_id?, order_id? }
   → backend creates a `photo_sessions` doc with one-time token and returns:
     { session_id, token, share_url, wa_url }
2. SM forwards `share_url` to customer (WhatsApp, SMS, whatever).
3. Customer opens the link in their phone browser → React route `/photo-capture/:token`
   uses the device camera to capture FRONT / LEFT / RIGHT (+ optional BEFORE / AFTER).
4. Each photo is POSTed to `/api/customer-photos/{token}/upload` (no auth — token
   is the bearer). Photos are persisted to `uploaded_images` (MongoDB) so they survive
   container restarts.
5. SM lists photos for a customer via GET /api/customer-photos?phone=...
   or GET /api/customer-photos/by-customer/{phone}.
6. SM can mark a session "completed" / "archived". Tokens expire after 7 days unless renewed.

Data Model
----------
db.photo_sessions {
  id, token, customer_phone, customer_name, lead_id, order_id,
  created_by, created_by_name, sales_manager_id,
  status ("pending" | "submitted" | "completed" | "expired"),
  created_at, expires_at, submitted_at,
  photos: [ { kind: "front" | "left" | "right" | "before" | "after",
              filename, captured_at } ]
}
"""
from datetime import datetime, timezone, timedelta
import uuid
import base64

from fastapi import HTTPException, Depends, Request, UploadFile, File, Form


def register_customer_photos(app, db, api_router, get_current_user, logger):
    BASE_URL_FALLBACK = "https://software.celestaglow.com"

    async def _team_phones_for_sm(sm_id: str):
        """Return all customer_phone numbers that belong to the SM's team
        (their telecallers + agents + assistant SMs + their own leads/orders).
        Used to gate photo visibility."""
        team_ids = {sm_id}
        async for tc in db.telecallers.find({"managed_by": sm_id}, {"_id": 0, "id": 1}):
            team_ids.add(tc["id"])
        async for a in db.agents.find({"managed_by": sm_id}, {"_id": 0, "id": 1}):
            team_ids.add(a["id"])
        async for asm in db.assistant_sales_managers.find({"managed_by": sm_id}, {"_id": 0, "id": 1}):
            team_ids.add(asm["id"])
        phones = set()
        async for ld in db.leads.find({"assigned_to": {"$in": list(team_ids)}}, {"_id": 0, "phone_number": 1}):
            if ld.get("phone_number"):
                phones.add(ld["phone_number"])
        async for ld in db.leads.find({"created_by": {"$in": list(team_ids)}}, {"_id": 0, "phone_number": 1}):
            if ld.get("phone_number"):
                phones.add(ld["phone_number"])
        async for o in db.orders.find({"created_by": {"$in": list(team_ids)}, "deleted": {"$ne": True}}, {"_id": 0, "customer_phone": 1}):
            if o.get("customer_phone"):
                phones.add(o["customer_phone"])
        return phones

    def _norm_phone(p):
        if not p:
            return ""
        digits = "".join(ch for ch in str(p) if ch.isdigit())
        # Drop India country code prefix and any leading zeros so search matches across formats.
        if digits.startswith("91") and len(digits) > 10:
            digits = digits[-10:]
        return digits.lstrip("0")

    @api_router.post("/customer-photos/request")
    async def create_photo_session(data: dict,
                                   current_user: dict = Depends(get_current_user),
                                   request: Request = None):
        """SM (or Admin) creates a photo-capture link for a customer."""
        if current_user["role"] not in ("admin", "sales_manager", "telecaller"):
            raise HTTPException(status_code=403, detail="Not authorized")
        phone = _norm_phone(data.get("customer_phone"))
        if not phone or len(phone) < 7:
            raise HTTPException(status_code=400, detail="Valid customer_phone required")
        token = uuid.uuid4().hex
        sess = {
            "id": f"ps-{uuid.uuid4().hex[:10]}",
            "token": token,
            "customer_phone": phone,
            "customer_name": (data.get("customer_name") or "").strip(),
            "lead_id": data.get("lead_id", ""),
            "order_id": data.get("order_id", ""),
            "created_by": current_user["id"],
            "created_by_name": current_user.get("name", ""),
            "sales_manager_id": current_user["id"] if current_user["role"] == "sales_manager" else current_user.get("managed_by", current_user["id"]),
            "status": "pending",
            "photos": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        }
        await db.photo_sessions.insert_one(sess)
        sess.pop("_id", None)
        # Build a public link. Prefer the explicit PUBLIC_BASE_URL env var
        # (set to the user-facing https://software.celestaglow.com); fall back
        # to the request origin if env var isn't set.
        import os as _os
        origin = _os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
        if not origin and request is not None:
            origin = str(request.base_url).rstrip("/")
            if origin.endswith("/api"):
                origin = origin[:-4]
        if not origin:
            origin = BASE_URL_FALLBACK
        share_url = f"{origin}/photo-capture/{token}"
        wa_msg = f"Hi {sess['customer_name'] or 'there'}, please upload your face photos for our skin analysis: {share_url}"
        wa_url = f"https://wa.me/91{phone}?text={wa_msg.replace(' ', '%20')}"
        return {"session": sess, "share_url": share_url, "wa_url": wa_url, "token": token}

    @api_router.get("/customer-photos/session/{token}")
    async def get_session_public(token: str):
        """No-auth endpoint used by the customer-facing capture page."""
        sess = await db.photo_sessions.find_one({"token": token}, {"_id": 0})
        if not sess:
            raise HTTPException(status_code=404, detail="Invalid or expired link")
        if sess["status"] == "expired":
            raise HTTPException(status_code=410, detail="Link expired")
        try:
            if datetime.fromisoformat(sess["expires_at"]) < datetime.now(timezone.utc):
                await db.photo_sessions.update_one({"token": token}, {"$set": {"status": "expired"}})
                raise HTTPException(status_code=410, detail="Link expired")
        except (ValueError, KeyError):
            pass
        # Strip internal fields
        return {"session": {
            "id": sess["id"],
            "customer_name": sess.get("customer_name", ""),
            "status": sess.get("status"),
            "photos_count": len(sess.get("photos", [])),
            "expires_at": sess.get("expires_at"),
        }}

    @api_router.post("/customer-photos/{token}/upload")
    async def upload_photo(token: str, kind: str = Form(...), file: UploadFile = File(...)):
        """Customer-facing photo upload — uses the session token as bearer.
        No JWT required since the customer isn't logged in."""
        sess = await db.photo_sessions.find_one({"token": token}, {"_id": 0})
        if not sess:
            raise HTTPException(status_code=404, detail="Invalid link")
        try:
            if datetime.fromisoformat(sess["expires_at"]) < datetime.now(timezone.utc):
                await db.photo_sessions.update_one({"token": token}, {"$set": {"status": "expired"}})
                raise HTTPException(status_code=410, detail="Link expired")
        except (ValueError, KeyError):
            pass
        kind = (kind or "").lower().strip()
        if kind not in ("front", "left", "right", "before", "after"):
            raise HTTPException(status_code=400, detail="kind must be front/left/right/before/after")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image must be smaller than 8 MB")
        ext = ".jpg"
        if file.content_type:
            if "png" in file.content_type:
                ext = ".png"
            elif "webp" in file.content_type:
                ext = ".webp"
        filename = f"customer-{sess['customer_phone']}-{kind}-{uuid.uuid4().hex[:8]}{ext}"
        content_type = file.content_type or "image/jpeg"
        await db.uploaded_images.insert_one({
            "filename": filename,
            "content_type": content_type,
            "data": data,
            "size": len(data),
            "uploaded_by": f"customer-session:{sess['id']}",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "tags": ["customer_photo", sess["customer_phone"], kind],
        })
        # Replace existing photo of same kind, else append
        photos = sess.get("photos", [])
        photos = [p for p in photos if p.get("kind") != kind]
        photos.append({
            "kind": kind,
            "filename": filename,
            "url": f"/api/uploads/{filename}",
            "captured_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.photo_sessions.update_one(
            {"token": token},
            {"$set": {"photos": photos, "status": "submitted",
                      "submitted_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"ok": True, "uploaded": kind, "photos_count": len(photos), "url": f"/api/uploads/{filename}"}

    @api_router.get("/customer-photos/by-customer/{phone}")
    async def list_photos_by_customer(phone: str, current_user: dict = Depends(get_current_user)):
        """SM / Admin / Telecaller view — get every photo session for a customer phone.
        SM sees all team customers; TC sees only customers they're assigned to / created."""
        if current_user["role"] not in ("admin", "sales_manager", "telecaller", "district_manager", "assistant_sales_manager"):
            raise HTTPException(status_code=403)
        norm = _norm_phone(phone)
        # Visibility gate for SM and TC
        if current_user["role"] == "sales_manager":
            allowed = await _team_phones_for_sm(current_user["id"])
            allowed_norm = {_norm_phone(p) for p in allowed}
            if norm not in allowed_norm:
                raise HTTPException(status_code=403, detail="Customer not in your team")
        elif current_user["role"] == "telecaller":
            tc_id = current_user["id"]
            my_lead = await db.leads.find_one({
                "phone_number_norm": norm,
                "$or": [{"assigned_to": tc_id}, {"created_by": tc_id}],
            }, {"_id": 0, "id": 1})
            my_order = await db.orders.find_one({
                "customer_phone": norm, "created_by": tc_id, "deleted": {"$ne": True},
            }, {"_id": 0, "id": 1})
            if not my_lead and not my_order:
                raise HTTPException(status_code=403, detail="Customer not assigned to you")
        sessions = await db.photo_sessions.find({"customer_phone": norm}, {"_id": 0}).sort("created_at", -1).to_list(100)
        return {"sessions": sessions, "total": len(sessions)}

    @api_router.get("/customer-photos/search")
    async def search_customers_with_photos(q: str = "", current_user: dict = Depends(get_current_user)):
        """Find customers from LEADS (added by SM's team's telecallers) + ORDERS + existing photo sessions.
        Always team-scoped for SM/TC. Admin sees everything."""
        if current_user["role"] not in ("admin", "sales_manager", "telecaller", "district_manager", "assistant_sales_manager"):
            raise HTTPException(status_code=403)
        q = (q or "").strip()
        # Build scope: team ids for SM, self for TC, all for admin
        team_ids = None
        if current_user["role"] == "sales_manager":
            team_ids = {current_user["id"]}
            async for tc in db.telecallers.find({"managed_by": current_user["id"]}, {"_id": 0, "id": 1}):
                team_ids.add(tc["id"])
            async for a in db.agents.find({"managed_by": current_user["id"]}, {"_id": 0, "id": 1}):
                team_ids.add(a["id"])
            async for asm in db.assistant_sales_managers.find({"managed_by": current_user["id"]}, {"_id": 0, "id": 1}):
                team_ids.add(asm["id"])
        elif current_user["role"] == "telecaller":
            team_ids = {current_user["id"]}
        # Build the lead query: by phone, name, OR show all if q is empty
        lead_q = {}
        if q:
            norm = _norm_phone(q)
            lead_q["$or"] = [
                {"phone_number_norm": {"$regex": norm}} if norm else None,
                {"phone_number": {"$regex": q}},
                {"name": {"$regex": q, "$options": "i"}},
            ]
            lead_q["$or"] = [c for c in lead_q["$or"] if c]
        if team_ids is not None:
            lead_q["$or_team"] = list(team_ids)
            tids = list(team_ids)
            scope = {"$or": [{"assigned_to": {"$in": tids}}, {"created_by": {"$in": tids}}]}
            lead_q.pop("$or_team")
            if "$or" in lead_q:
                lead_q = {"$and": [{"$or": lead_q["$or"]}, scope]}
            else:
                lead_q = scope
        # Aggregate distinct customers by phone
        results = {}
        async for ld in db.leads.find(lead_q, {"_id": 0, "phone_number": 1, "name": 1, "status": 1, "created_at": 1, "assigned_to": 1}).sort("created_at", -1).limit(500):
            norm = _norm_phone(ld.get("phone_number"))
            if not norm:
                continue
            if norm not in results:
                results[norm] = {
                    "customer_phone": norm,
                    "customer_name": ld.get("name") or "",
                    "sessions_count": 0,
                    "photos_count": 0,
                    "latest_lead_status": ld.get("status"),
                    "latest_session_at": None,
                    "source": "lead",
                }
        # Also pull from orders (within scope) so customers who only have orders show up too
        order_q = {"deleted": {"$ne": True}}
        if team_ids is not None:
            order_q["created_by"] = {"$in": list(team_ids)}
        if q:
            order_q["$or"] = [
                {"customer_phone": {"$regex": _norm_phone(q)}} if _norm_phone(q) else None,
                {"customer_name": {"$regex": q, "$options": "i"}},
            ]
            order_q["$or"] = [c for c in order_q["$or"] if c]
            if not order_q["$or"]:
                order_q.pop("$or", None)
        async for o in db.orders.find(order_q, {"_id": 0, "customer_phone": 1, "customer_name": 1, "created_at": 1}).sort("created_at", -1).limit(500):
            norm = _norm_phone(o.get("customer_phone"))
            if not norm:
                continue
            if norm not in results:
                results[norm] = {
                    "customer_phone": norm,
                    "customer_name": o.get("customer_name") or "",
                    "sessions_count": 0, "photos_count": 0,
                    "latest_session_at": None, "source": "order",
                }
            elif not results[norm].get("customer_name"):
                results[norm]["customer_name"] = o.get("customer_name") or ""
        # Add session counts on top
        async for sess in db.photo_sessions.find({"customer_phone": {"$in": list(results.keys())}}, {"_id": 0, "customer_phone": 1, "photos": 1, "created_at": 1}):
            ph = sess["customer_phone"]
            if ph in results:
                results[ph]["sessions_count"] += 1
                results[ph]["photos_count"] += len(sess.get("photos", []))
                if not results[ph]["latest_session_at"] or sess.get("created_at", "") > results[ph]["latest_session_at"]:
                    results[ph]["latest_session_at"] = sess.get("created_at")
        ordered = sorted(results.values(), key=lambda x: (x.get("photos_count", 0), x.get("latest_session_at") or ""), reverse=True)
        return {"customers": ordered[:100]}

    # ------------------------------------------------------------ DIRECT UPLOAD
    # Telecaller (or SM) uploads a Before/Front/Left/Right/After photo directly
    # on behalf of the customer (e.g. when logging a call or creating an order).
    # No share-link needed — the user is authenticated.
    @api_router.post("/customer-photos/direct-upload")
    async def staff_direct_upload(
        customer_phone: str = Form(...),
        customer_name: str = Form(""),
        kind: str = Form(...),
        lead_id: str = Form(""),
        order_id: str = Form(""),
        file: UploadFile = File(...),
        current_user: dict = Depends(get_current_user),
    ):
        if current_user["role"] not in ("admin", "sales_manager", "telecaller", "assistant_sales_manager"):
            raise HTTPException(status_code=403, detail="Not authorized")
        kind = (kind or "").lower().strip()
        if kind not in ("front", "left", "right", "before", "after"):
            raise HTTPException(status_code=400, detail="kind must be front/left/right/before/after")
        phone_norm = _norm_phone(customer_phone)
        if not phone_norm:
            raise HTTPException(status_code=400, detail="Valid phone required")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image must be smaller than 8 MB")
        ext = ".jpg"
        ct = file.content_type or "image/jpeg"
        if "png" in ct:
            ext = ".png"
        elif "webp" in ct:
            ext = ".webp"
        filename = f"customer-{phone_norm}-{kind}-{uuid.uuid4().hex[:8]}{ext}"
        await db.uploaded_images.insert_one({
            "filename": filename, "content_type": ct, "data": data, "size": len(data),
            "uploaded_by": f"staff:{current_user['id']}",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "tags": ["customer_photo", phone_norm, kind, "staff_upload"],
        })
        # Find or create a "staff" session for this customer (one rolling session, not a customer-link)
        sess = await db.photo_sessions.find_one({"customer_phone": phone_norm, "session_type": "staff"})
        if not sess:
            sess = {
                "id": f"ps-{uuid.uuid4().hex[:10]}",
                "token": uuid.uuid4().hex,  # not shared externally for staff sessions
                "customer_phone": phone_norm,
                "customer_name": customer_name or "",
                "lead_id": lead_id or "",
                "order_id": order_id or "",
                "session_type": "staff",
                "created_by": current_user["id"],
                "created_by_name": current_user.get("name", ""),
                "sales_manager_id": current_user["id"] if current_user["role"] == "sales_manager" else current_user.get("managed_by", ""),
                "status": "submitted",
                "photos": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat(),  # 10y — basically never
            }
            await db.photo_sessions.insert_one(sess)
            sess.pop("_id", None)
        photos = [p for p in sess.get("photos", []) if p.get("kind") != kind]
        photos.append({
            "kind": kind, "filename": filename, "url": f"/api/uploads/{filename}",
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "uploaded_by_name": current_user.get("name", ""),
        })
        update_set = {"photos": photos, "status": "submitted",
                      "submitted_at": datetime.now(timezone.utc).isoformat()}
        if customer_name and not sess.get("customer_name"):
            update_set["customer_name"] = customer_name
        if lead_id and not sess.get("lead_id"):
            update_set["lead_id"] = lead_id
        if order_id and not sess.get("order_id"):
            update_set["order_id"] = order_id
        await db.photo_sessions.update_one({"id": sess["id"]}, {"$set": update_set})
        return {"ok": True, "uploaded": kind, "url": f"/api/uploads/{filename}", "session_id": sess["id"]}

    # Delete a single photo (kind) from a session — used for "re-upload / edit" flow.
    @api_router.delete("/customer-photos/photo")
    async def delete_one_photo(
        customer_phone: str,
        kind: str,
        current_user: dict = Depends(get_current_user),
    ):
        if current_user["role"] not in ("admin", "sales_manager", "telecaller", "assistant_sales_manager"):
            raise HTTPException(status_code=403)
        norm = _norm_phone(customer_phone)
        sess = await db.photo_sessions.find_one({"customer_phone": norm, "session_type": "staff"}, {"_id": 0})
        if not sess:
            raise HTTPException(status_code=404, detail="No staff session for this customer")
        photos_keep = [p for p in sess.get("photos", []) if p.get("kind") != kind]
        photos_drop = [p for p in sess.get("photos", []) if p.get("kind") == kind]
        await db.photo_sessions.update_one({"id": sess["id"]}, {"$set": {"photos": photos_keep}})
        for p in photos_drop:
            if p.get("filename"):
                await db.uploaded_images.delete_one({"filename": p["filename"]})
        return {"ok": True, "removed": kind}

    @api_router.delete("/customer-photos/session/{sid}")
    async def delete_session(sid: str, current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in ("admin", "sales_manager"):
            raise HTTPException(status_code=403)
        sess = await db.photo_sessions.find_one({"id": sid}, {"_id": 0})
        if not sess:
            raise HTTPException(status_code=404)
        if current_user["role"] == "sales_manager" and sess.get("created_by") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Cannot delete sessions you didn't create")
        await db.photo_sessions.delete_one({"id": sid})
        # Remove the actual image blobs from uploaded_images (no orphan binaries)
        for p in sess.get("photos", []):
            if p.get("filename"):
                await db.uploaded_images.delete_one({"filename": p["filename"]})
        return {"message": "Session deleted"}

    logger.info("Customer Photos module registered: photo sessions + capture + scoped search")
