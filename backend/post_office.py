"""
post_office.py — India Post bulk-upload + telecaller-followup module

Flow:
1. Inventory Manager uploads the daily post-office shipment manifest (Excel).
2. Each row { Tracking No., Customer Service (= customer name), To (= destination SO),
   COD Amount, Date } is parsed and we attempt to MATCH it against an existing order:
      a. customer name fuzzy match (uppercase trimmed)
      b. tighter match using COD amount when available
      c. destination "SO" area substring match against order address/city
3. For each matched order we attach:
      * india_post_article         (tracking no.)
      * tracking_link / awb_number
      * courier_name = "India Post"
      * shipment_date              (from manifest)
      * badge "India Post"
      * status -> shipped (if not already)
4. We persist the upload as a `post_office_shipment` doc so the IM / Admin can see
   later, with the matched order and the telecaller who originally took the order.
5. We expose:
      GET  /api/post-office/shipments        — list of shipments + linked TC info
      GET  /api/post-office/telecaller-stats — per-TC delivered/returned/in-transit count
      POST /api/post-office/upload           — upload Excel
      POST /api/post-office/relink/{id}      — manually relink a row to a different order
      POST /api/post-office/whatsapp-template — get pre-rendered TC follow-up message

Visible to: admin + inventory_manager.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from datetime import datetime, timezone
from typing import Optional
import io
import re
import uuid

try:
    from openpyxl import load_workbook
except ImportError:
    load_workbook = None


def _norm(s):
    if s is None:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _to_iso_date(v):
    if v is None or v == "":
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    s = str(v).strip()
    # try common formats: dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s  # last-resort: keep as-is


def _match_score(row, order):
    """Score 0–100 — how strongly this row matches the order."""
    rn = _norm(row.get("customer_name"))
    on = _norm(order.get("customer_name"))
    if not rn or not on:
        return 0
    if rn == on:
        score = 70
    elif rn in on or on in rn:
        score = 50
    else:
        # token overlap
        rt = set(re.findall(r"[a-z]+", str(row.get("customer_name") or "").lower()))
        ot = set(re.findall(r"[a-z]+", str(order.get("customer_name") or "").lower()))
        if rt and ot and len(rt & ot) >= 1:
            score = 30
        else:
            return 0
    # COD amount match bonus
    try:
        cod = float(row.get("cod_amount") or 0)
        ot_amt = float(order.get("total_amount") or 0)
        if cod > 0 and abs(cod - ot_amt) < 1:
            score += 20
        elif cod > 0 and abs(cod - ot_amt) <= 50:
            score += 5
    except (TypeError, ValueError):
        pass
    # Destination area match — "Kondotti SO" should match address/city containing "Kondotti"
    dest = re.sub(r"\bSO\b", "", str(row.get("destination") or ""), flags=re.IGNORECASE).strip().lower()
    addr_blob = " ".join([
        str(order.get("customer_address") or ""),
        str(order.get("customer_city") or ""),
        str(order.get("customer_state") or ""),
    ]).lower()
    if dest and dest in addr_blob:
        score += 10
    return score


def register_post_office_routes(api_router: APIRouter, db, get_current_user, log_audit):
    """Mount post-office routes on the given api_router."""

    async def _require_role(user, roles):
        if user.get("role") not in roles:
            raise HTTPException(403, "Not authorised")

    def _parse_workbook(content: bytes) -> list[dict]:
        if load_workbook is None:
            raise HTTPException(500, "openpyxl not installed on server")
        try:
            wb = load_workbook(io.BytesIO(content), data_only=True)
        except Exception as e:
            raise HTTPException(400, f"Could not read Excel: {e}")
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        header = [str(h or "").strip() for h in rows[0]]
        # map header → index, case-insensitive trim
        idx = {}
        for i, h in enumerate(header):
            k = re.sub(r"[^a-z]", "", h.lower())
            idx[k] = i

        def col(row, *keys):
            for k in keys:
                kk = re.sub(r"[^a-z]", "", k.lower())
                if kk in idx and idx[kk] < len(row):
                    val = row[idx[kk]]
                    if val is not None and str(val).strip() != "":
                        return val
            return None

        parsed = []
        for r in rows[1:]:
            if r is None or all(c is None or str(c).strip() == "" for c in r):
                continue
            tracking = col(r, "Tracking No.", "Tracking No", "Tracking", "Article No", "AWB")
            cust = col(r, "Customer Service", "Customer Name", "Customer", "Recipient", "Name")
            if not tracking and not cust:
                continue
            parsed.append({
                "sl_no": col(r, "Sl. No.", "Sl No", "S No"),
                "tracking_no": str(tracking).strip() if tracking else "",
                "from_office": str(col(r, "From") or "").strip(),
                "destination": str(col(r, "To", "Destination") or "").strip(),
                "brand": str(col(r, "Brand") or "").strip(),
                "customer_name": str(cust or "").strip(),
                "weight_g": col(r, "Weight (g)", "Weight"),
                "chargeable_weight_g": col(r, "Chargeable Weight (g)", "Chargeable Weight"),
                "postage": col(r, "Postage"),
                "cod_amount": col(r, "COD Amount", "COD"),
                "shipment_date": _to_iso_date(col(r, "Date")),
            })
        return parsed

    @api_router.post("/post-office/upload")
    async def upload_post_office_manifest(
        file: UploadFile = File(...),
        current_user: dict = Depends(get_current_user),
    ):
        await _require_role(current_user, ("admin", "inventory_manager"))
        if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
            raise HTTPException(400, "Please upload an .xlsx file")
        content = await file.read()
        if not content:
            raise HTTPException(400, "Empty file")
        rows = _parse_workbook(content)
        if not rows:
            raise HTTPException(400, "No data rows found in sheet")

        # Pre-fetch a working set of orders (last 90 days, not delivered yet, not soft-deleted)
        # Wider net: last 120 days
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(days=120)).isoformat()
        candidate_orders = await db.orders.find(
            {"deleted": {"$ne": True}, "created_at": {"$gte": cutoff}},
            {"_id": 0}
        ).to_list(8000)

        upload_id = f"po-{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        matched = 0
        ambiguous = 0
        unmatched = 0
        shipment_docs = []

        for row in rows:
            # Skip if already uploaded — dedupe on tracking_no
            existing = await db.post_office_shipments.find_one({"tracking_no": row["tracking_no"]}, {"_id": 0})
            if existing:
                shipment_docs.append({**existing, "duplicate": True})
                continue

            # Score every candidate
            scored = []
            for o in candidate_orders:
                s = _match_score(row, o)
                if s >= 50:
                    scored.append((s, o))
            scored.sort(key=lambda x: x[0], reverse=True)

            match_status = "unmatched"
            order_id = None
            tc_id = None
            tc_name = None
            tc_phone = None
            top_candidates = []
            order_summary = None
            if scored:
                top = scored[0]
                # ambiguous if 2 candidates with similar scores
                if len(scored) >= 2 and scored[0][0] - scored[1][0] < 15:
                    match_status = "ambiguous"
                    ambiguous += 1
                    top_candidates = [
                        {"order_id": c[1].get("id"), "name": c[1].get("customer_name"),
                         "phone": c[1].get("customer_phone"), "score": c[0],
                         "amount": c[1].get("total_amount"), "address": c[1].get("customer_address")}
                        for c in scored[:5]
                    ]
                else:
                    match_status = "matched"
                    matched += 1
                    order = top[1]
                    order_id = order.get("id")
                    tc_id = order.get("created_by")
                    tc_name = order.get("created_by_name")
                    order_summary = {
                        "id": order_id,
                        "customer_name": order.get("customer_name"),
                        "customer_phone": order.get("customer_phone"),
                        "customer_address": order.get("customer_address"),
                        "total_amount": order.get("total_amount"),
                        "status": order.get("status"),
                    }
                    # Resolve TC phone for one-click contact
                    if tc_id:
                        tc_doc = await db.telecallers.find_one({"id": tc_id}, {"_id": 0, "phone": 1, "name": 1})
                        if not tc_doc:
                            tc_doc = await db.users.find_one({"id": tc_id}, {"_id": 0, "phone": 1, "name": 1})
                        if not tc_doc:
                            tc_doc = await db.admins.find_one({"id": tc_id}, {"_id": 0, "phone": 1, "name": 1})
                        if tc_doc:
                            tc_phone = tc_doc.get("phone")
                            tc_name = tc_name or tc_doc.get("name")
                    # Update the order — attach tracking + courier + shipment date + badge
                    new_badges = list(order.get("badges") or [])
                    if "India Post" not in new_badges:
                        new_badges.append("India Post")
                    update_set = {
                        "courier_name": "India Post",
                        "awb_number": row["tracking_no"],
                        "india_post_article": row["tracking_no"],
                        "tracking_number": row["tracking_no"],
                        "tracking_link": f"https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?article={row['tracking_no']}",
                        "shipment_date": row["shipment_date"],
                        "badges": new_badges,
                    }
                    # Only flip to shipped if it was pending/confirmed
                    if order.get("status") in (None, "pending", "confirmed"):
                        update_set["status"] = "shipped"
                        update_set["shipped_at"] = now_iso
                        update_set["shipped_by_name"] = current_user.get("name") or "India Post Upload"
                    await db.orders.update_one({"id": order_id}, {"$set": update_set})
            else:
                unmatched += 1

            doc = {
                "id": f"pos-{uuid.uuid4().hex[:10]}",
                "upload_id": upload_id,
                "tracking_no": row["tracking_no"],
                "customer_name": row["customer_name"],
                "destination": row["destination"],
                "from_office": row["from_office"],
                "brand": row["brand"],
                "cod_amount": row["cod_amount"],
                "postage": row["postage"],
                "shipment_date": row["shipment_date"],
                "match_status": match_status,
                "order_id": order_id,
                "order": order_summary,
                "telecaller_id": tc_id,
                "telecaller_name": tc_name,
                "telecaller_phone": tc_phone,
                "candidates": top_candidates,
                "uploaded_at": now_iso,
                "uploaded_by": current_user.get("id"),
                "uploaded_by_name": current_user.get("name"),
                "tracking_link": f"https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?article={row['tracking_no']}",
            }
            await db.post_office_shipments.insert_one(doc)
            doc.pop("_id", None)
            shipment_docs.append(doc)

        try:
            await log_audit("upload_post_office", "post_office", upload_id, current_user["id"],
                            current_user.get("name", ""),
                            f"Uploaded {len(rows)} rows: {matched} matched / {ambiguous} ambiguous / {unmatched} unmatched")
        except Exception:
            pass

        return {
            "upload_id": upload_id,
            "total_rows": len(rows),
            "matched": matched,
            "ambiguous": ambiguous,
            "unmatched": unmatched,
            "shipments": shipment_docs,
        }

    @api_router.get("/post-office/shipments")
    async def list_shipments(
        match_status: Optional[str] = None,
        telecaller_id: Optional[str] = None,
        upload_id: Optional[str] = None,
        date_str: Optional[str] = None,
        limit: int = 500,
        current_user: dict = Depends(get_current_user),
    ):
        await _require_role(current_user, ("admin", "inventory_manager", "sales_manager"))
        q: dict = {}
        if match_status:
            q["match_status"] = match_status
        if telecaller_id:
            q["telecaller_id"] = telecaller_id
        if upload_id:
            q["upload_id"] = upload_id
        if date_str:
            q["shipment_date"] = date_str
        docs = await db.post_office_shipments.find(q, {"_id": 0}).sort("uploaded_at", -1).limit(min(int(limit or 500), 5000)).to_list(5000)
        # Stitch latest order status (delivered/returned) so the UI shows what happened post-upload
        for d in docs:
            if d.get("order_id"):
                fresh = await db.orders.find_one({"id": d["order_id"]}, {"_id": 0, "status": 1, "delivered_at": 1, "returned_at": 1, "delivered_by_name": 1})
                if fresh:
                    d["current_status"] = fresh.get("status")
                    d["delivered_at"] = fresh.get("delivered_at")
                    d["returned_at"] = fresh.get("returned_at")
                    d["delivered_by_name"] = fresh.get("delivered_by_name")
        return {"shipments": docs, "count": len(docs)}

    @api_router.get("/post-office/telecaller-stats")
    async def post_office_telecaller_stats(current_user: dict = Depends(get_current_user)):
        """For each telecaller whose orders have been routed through India Post,
        return a count of in-transit / delivered / returned / total."""
        await _require_role(current_user, ("admin", "inventory_manager", "sales_manager"))
        pipeline = [
            {"$match": {"telecaller_id": {"$ne": None}}},
            {"$group": {
                "_id": {"tc_id": "$telecaller_id", "tc_name": "$telecaller_name", "tc_phone": "$telecaller_phone"},
                "shipments": {"$sum": 1},
                "tracking_nos": {"$push": "$tracking_no"},
                "order_ids": {"$push": "$order_id"},
            }},
            {"$sort": {"shipments": -1}},
        ]
        groups = await db.post_office_shipments.aggregate(pipeline).to_list(2000)
        out = []
        for g in groups:
            order_ids = [o for o in (g.get("order_ids") or []) if o]
            delivered = returned = in_transit = pending = 0
            if order_ids:
                rows = await db.orders.find({"id": {"$in": order_ids}}, {"_id": 0, "status": 1}).to_list(len(order_ids))
                for r in rows:
                    s = (r.get("status") or "").lower()
                    if s == "delivered":
                        delivered += 1
                    elif s in ("returned", "rto"):
                        returned += 1
                    elif s == "shipped":
                        in_transit += 1
                    else:
                        pending += 1
            out.append({
                "telecaller_id": g["_id"].get("tc_id"),
                "telecaller_name": g["_id"].get("tc_name") or "—",
                "telecaller_phone": g["_id"].get("tc_phone") or "",
                "total_shipments": g["shipments"],
                "delivered": delivered,
                "returned": returned,
                "in_transit": in_transit,
                "pending": pending,
            })
        return {"telecallers": out}

    @api_router.post("/post-office/relink/{shipment_id}")
    async def relink_shipment(shipment_id: str, data: dict, current_user: dict = Depends(get_current_user)):
        """IM/Admin: manually attach a shipment to a different order id (used when the
        auto-match is wrong or the row was unmatched)."""
        await _require_role(current_user, ("admin", "inventory_manager"))
        new_order_id = data.get("order_id")
        if not new_order_id:
            raise HTTPException(400, "order_id required")
        shipment = await db.post_office_shipments.find_one({"id": shipment_id}, {"_id": 0})
        if not shipment:
            raise HTTPException(404, "Shipment not found")
        order = await db.orders.find_one({"id": new_order_id}, {"_id": 0})
        if not order:
            raise HTTPException(404, "Order not found")
        tc_doc = None
        if order.get("created_by"):
            tc_doc = await db.telecallers.find_one({"id": order["created_by"]}, {"_id": 0, "phone": 1, "name": 1})
            if not tc_doc:
                tc_doc = await db.users.find_one({"id": order["created_by"]}, {"_id": 0, "phone": 1, "name": 1})
        await db.post_office_shipments.update_one({"id": shipment_id}, {"$set": {
            "order_id": new_order_id,
            "match_status": "matched",
            "telecaller_id": order.get("created_by"),
            "telecaller_name": order.get("created_by_name") or (tc_doc or {}).get("name"),
            "telecaller_phone": (tc_doc or {}).get("phone"),
            "order": {
                "id": new_order_id,
                "customer_name": order.get("customer_name"),
                "customer_phone": order.get("customer_phone"),
                "customer_address": order.get("customer_address"),
                "total_amount": order.get("total_amount"),
                "status": order.get("status"),
            },
            "relinked_at": datetime.now(timezone.utc).isoformat(),
            "relinked_by_name": current_user.get("name", ""),
        }})
        # Also attach tracking to the new order
        new_badges = list(order.get("badges") or [])
        if "India Post" not in new_badges:
            new_badges.append("India Post")
        await db.orders.update_one({"id": new_order_id}, {"$set": {
            "courier_name": "India Post",
            "awb_number": shipment["tracking_no"],
            "india_post_article": shipment["tracking_no"],
            "tracking_number": shipment["tracking_no"],
            "tracking_link": shipment.get("tracking_link"),
            "shipment_date": shipment.get("shipment_date"),
            "badges": new_badges,
            "status": "shipped" if order.get("status") in (None, "pending", "confirmed") else order.get("status"),
        }})
        return {"message": "Relinked", "shipment_id": shipment_id}

    @api_router.delete("/post-office/shipment/{shipment_id}")
    async def delete_shipment(shipment_id: str, current_user: dict = Depends(get_current_user)):
        await _require_role(current_user, ("admin", "inventory_manager"))
        r = await db.post_office_shipments.delete_one({"id": shipment_id})
        if not r.deleted_count:
            raise HTTPException(404, "Not found")
        return {"message": "Deleted"}

    @api_router.post("/post-office/whatsapp-template")
    async def whatsapp_template(data: dict, current_user: dict = Depends(get_current_user)):
        """Generate the pre-rendered WhatsApp text the IM/Admin can ping the TC with.
        Body: { shipment_id }. Returns: { text, wa_link_tc, wa_link_customer, call_tc_link }."""
        await _require_role(current_user, ("admin", "inventory_manager", "sales_manager"))
        shipment_id = data.get("shipment_id")
        sh = await db.post_office_shipments.find_one({"id": shipment_id}, {"_id": 0})
        if not sh:
            raise HTTPException(404, "Shipment not found")
        cust_name = (sh.get("order") or {}).get("customer_name") or sh.get("customer_name") or "Customer"
        cust_phone = (sh.get("order") or {}).get("customer_phone") or ""
        tracking_no = sh.get("tracking_no", "")
        tracking_link = sh.get("tracking_link") or f"https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?article={tracking_no}"
        ship_date = sh.get("shipment_date") or datetime.now(timezone.utc).date().isoformat()
        tc_msg = (
            f"Hi {sh.get('telecaller_name') or 'team'},\n\n"
            f"Your order for *{cust_name}* (📞 {cust_phone}) has been shipped via *India Post* on {ship_date}.\n\n"
            f"📦 Article No: *{tracking_no}*\n"
            f"🔗 Track: {tracking_link}\n\n"
            f"Expected delivery in 3–4 working days. Please follow up with the customer to ensure smooth delivery, share the tracking link, and confirm address/phone.\n\n"
            f"Thanks!\n– Celesta Glow Inventory"
        )
        customer_msg = (
            f"Hi {cust_name},\n\n"
            f"Your Celesta Glow order has been shipped via *India Post* 📦\n\n"
            f"Article No: *{tracking_no}*\n"
            f"Track here: {tracking_link}\n\n"
            f"Expected to reach you within 3–4 working days. For any help just reply to this chat.\n\n"
            f"Thanks for shopping with us! 💚\n– Celesta Glow"
        )
        def _wa(phone, msg):
            if not phone:
                return ""
            clean = re.sub(r"\D", "", str(phone))
            if len(clean) == 10:
                clean = "91" + clean
            from urllib.parse import quote
            return f"https://wa.me/{clean}?text={quote(msg)}"
        tc_phone = sh.get("telecaller_phone") or ""
        return {
            "text": tc_msg,
            "customer_text": customer_msg,
            "wa_link_tc": _wa(tc_phone, tc_msg),
            "wa_link_customer": _wa(cust_phone, customer_msg),
            "call_tc_link": f"tel:{tc_phone}" if tc_phone else "",
            "telecaller_phone": tc_phone,
            "customer_phone": cust_phone,
        }
