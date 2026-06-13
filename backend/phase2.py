"""
Celesta Glow CRM — Phase 2 Upgrades Module
Implements P0-P3 improvements: security hardening, CSV import/export, GST invoice,
customer 360°, recurring expenses, 2FA, trash/restore, lead kanban, live ops, cohort
analytics, voice transcription, proxy audit, phone normalization, smart AI fallback.
"""
import os, io, re, csv, json, uuid, asyncio, logging, secrets, base64
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Query, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
import requests

logger = logging.getLogger(__name__)

# Shared state — wired by init_phase2()
db = None
get_current_user = None
ROLE_COLLECTIONS = {}
AUTH_COLLECTIONS = {}
COMPANY = {}
EMERGENT_LLM_KEY = ""

router = APIRouter(prefix="/api")

async def _auth(request: Request):
    return await get_current_user(request)

def init_phase2(**kw):
    global db, get_current_user, ROLE_COLLECTIONS, AUTH_COLLECTIONS, COMPANY, EMERGENT_LLM_KEY
    db = kw["db"]
    get_current_user = kw["get_current_user"]
    ROLE_COLLECTIONS = kw["ROLE_COLLECTIONS"]
    AUTH_COLLECTIONS = {v: k for k, v in ROLE_COLLECTIONS.items()}
    COMPANY = kw["COMPANY"]
    EMERGENT_LLM_KEY = kw.get("EMERGENT_LLM_KEY", "")
    return router


# ========================================================================
# Phone normalization (P2 #20)
# ========================================================================
def normalize_phone(raw: str) -> str:
    if not raw: return ""
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) >= 10:
        return digits[-10:]
    return digits


# ========================================================================
# P0 — Migration: audit_log → audit_logs, crm_orders → orders, etc.
# ========================================================================
async def run_p0_migrations():
    """One-time legacy-collection consolidation. Idempotent."""
    try:
        # 1) audit_log → audit_logs
        legacy = await db.audit_log.find({}, {"_id": 0}).to_list(100000)
        for d in legacy:
            if not d.get("id"): d["id"] = f"audit-{uuid.uuid4().hex[:10]}"
            await db.audit_logs.update_one({"id": d["id"]}, {"$setOnInsert": d}, upsert=True)
        if legacy:
            await db.audit_log.drop()
            logger.info(f"Migrated {len(legacy)} audit_log → audit_logs and dropped legacy.")
        # 2) crm_orders → orders
        legacy = await db.crm_orders.find({}, {"_id": 0}).to_list(100000)
        for d in legacy:
            if not d.get("id"): d["id"] = f"ORD-LEG-{uuid.uuid4().hex[:8]}"
            await db.orders.update_one({"id": d["id"]}, {"$setOnInsert": d}, upsert=True)
        if legacy:
            await db.crm_orders.drop()
            logger.info(f"Migrated {len(legacy)} crm_orders → orders and dropped legacy.")
        # 3) contacts_book → contacts
        legacy = await db.contacts_book.find({}, {"_id": 0}).to_list(100000)
        for d in legacy:
            if not d.get("id"): d["id"] = f"contact-{uuid.uuid4().hex[:8]}"
            await db.contacts.update_one({"id": d["id"]}, {"$setOnInsert": d}, upsert=True)
        if legacy:
            await db.contacts_book.drop()
            logger.info(f"Migrated {len(legacy)} contacts_book → contacts and dropped legacy.")
        # 4) Normalize phone fields on leads + orders (one-pass backfill)
        async for doc in db.leads.find({"phone_number_norm": {"$exists": False}}, {"id": 1, "phone_number": 1}):
            await db.leads.update_one({"id": doc["id"]}, {"$set": {"phone_number_norm": normalize_phone(doc.get("phone_number", ""))}})
        # 5) Critical index: commissions unique per (order_id, user_id)
        try:
            await db.commissions.create_index([("order_id", 1), ("user_id", 1)], unique=True, name="uniq_order_user", sparse=True)
            logger.info("Created unique index uniq_order_user on commissions.")
        except Exception as e:
            logger.warning(f"Commission unique index (may already exist): {e}")
        # Text index on leads + orders for global search (P2 #22)
        try:
            await db.leads.create_index([("name", "text"), ("phone_number", "text"), ("phone_number_norm", "text"), ("remarks", "text")], name="leads_text")
            await db.orders.create_index([("customer_name", "text"), ("customer_phone", "text"), ("customer_address", "text"), ("id", "text")], name="orders_text")
            logger.info("Text indexes created.")
        except Exception as e:
            logger.warning(f"Text index: {e}")
    except Exception as e:
        logger.error(f"P0 migration: {e}")


# ========================================================================
# CSV / Excel export (P1 #12)
# ========================================================================
def _to_csv(rows: List[dict], columns: List[str]) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(columns)
    for r in rows:
        w.writerow([r.get(c, "") for c in columns])
    return out.getvalue()


@router.get("/v2/export/orders.csv")
async def export_orders_csv(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    status: Optional[str] = None,
    current_user: dict = Depends(_auth),
):
    query = {}
    role = current_user["role"]; uid = current_user["id"]
    if role == "sales_manager":
        tcs = await db.telecallers.find({"managed_by": uid}, {"id": 1, "_id": 0}).to_list(5000)
        query["created_by"] = {"$in": [t["id"] for t in tcs] + [uid]}
    elif role == "district_manager":
        ags = await db.agents.find({"managed_by": uid}, {"id": 1, "_id": 0}).to_list(5000)
        query["created_by"] = {"$in": [a["id"] for a in ags] + [uid]}
    elif role not in ("admin", "inventory_manager", "finance_manager", "hr_manager"):
        raise HTTPException(status_code=403)
    if from_date: query["created_at"] = {"$gte": from_date}
    if to_date:
        query.setdefault("created_at", {})["$lt"] = to_date + "T99"
    if status: query["status"] = status
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(20000)
    cols = ["id", "created_at", "customer_name", "customer_phone", "customer_address", "customer_city",
            "customer_pincode", "total_amount", "payment_type", "status", "awb_number",
            "created_by_name", "created_by_role", "delivered_at"]
    csv_text = _to_csv(orders, cols)
    return StreamingResponse(io.BytesIO(csv_text.encode("utf-8")), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="orders-{date.today().isoformat()}.csv"'})


@router.get("/v2/export/leads.csv")
async def export_leads_csv(current_user: dict = Depends(_auth)):
    query = {"deleted": {"$ne": True}}
    role = current_user["role"]; uid = current_user["id"]
    if role == "telecaller" or role == "agent":
        query["assigned_to"] = uid
    elif role == "sales_manager":
        tcs = await db.telecallers.find({"managed_by": uid}, {"id": 1, "_id": 0}).to_list(5000)
        query["assigned_to"] = {"$in": [t["id"] for t in tcs] + [uid]}
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(20000)
    cols = ["id", "created_at", "name", "phone_number", "status", "source", "product_interest",
            "assigned_to_name", "next_follow_up_date", "last_order_date", "remarks"]
    csv_text = _to_csv(leads, cols)
    return StreamingResponse(io.BytesIO(csv_text.encode("utf-8")), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="leads-{date.today().isoformat()}.csv"'})


@router.get("/v2/export/commissions.csv")
async def export_commissions_csv(current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "finance_manager", "sales_manager", "district_manager", "hr_manager"):
        raise HTTPException(status_code=403)
    comms = await db.commissions.find({}, {"_id": 0}).sort("created_at", -1).to_list(20000)
    cols = ["id", "created_at", "user_name", "user_role", "order_id", "order_amount",
            "commission_percentage", "commission_amount", "status", "paid_at"]
    return StreamingResponse(io.BytesIO(_to_csv(comms, cols).encode("utf-8")), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="commissions-{date.today().isoformat()}.csv"'})


# ========================================================================
# Bulk lead CSV import (P2 #17)
# ========================================================================
@router.post("/leads/bulk-import")
async def bulk_import_leads(file: UploadFile = File(...), current_user: dict = Depends(_auth)):
    """Marketing CSV with columns: name, phone, source, product_interest, remarks (header row required).
    Round-robin assigns to active telecallers."""
    if current_user["role"] not in ("admin", "hr_manager", "sales_manager"):
        raise HTTPException(status_code=403, detail="Admin / HR / SM only")
    content = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(content))
    # Active telecallers for round-robin assignment
    tcs = await db.telecallers.find({"status": {"$ne": "inactive"}}, {"id": 1, "name": 1, "_id": 0}).to_list(5000)
    if not tcs:
        raise HTTPException(status_code=400, detail="No active telecallers to assign")
    created, dup, errors, rows = 0, 0, [], 0
    for row in reader:
        rows += 1
        phone_raw = row.get("phone") or row.get("phone_number") or row.get("mobile") or ""
        phone = normalize_phone(phone_raw)
        if not phone or len(phone) < 10:
            errors.append(f"Row {rows}: invalid phone '{phone_raw}'"); continue
        if await db.leads.find_one({"phone_number_norm": phone}):
            dup += 1; continue
        tc = tcs[(created + dup) % len(tcs)]
        lead = {
            "id": f"lead-{uuid.uuid4().hex[:8]}",
            "phone_number": phone, "phone_number_norm": phone,
            "name": (row.get("name") or "Customer").strip(),
            "source": (row.get("source") or "csv_import").strip(),
            "status": "new",
            "assigned_to": tc["id"], "assigned_to_name": tc.get("name", ""),
            "product_interest": (row.get("product_interest") or "general").strip(),
            "remarks": (row.get("remarks") or "").strip(),
            "customer_remarks": "",
            "urgency": "medium",
            "next_follow_up_date": "", "next_follow_up_time": "",
            "next_relationship_date": "", "next_repeat_order_date": "",
            "last_order_date": "", "call_logs": [],
            "created_by": current_user["id"],
            "created_by_name": current_user.get("name", ""),
            "created_by_role": current_user["role"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.leads.insert_one(lead)
        created += 1
    return {"created": created, "duplicates_skipped": dup, "errors": errors[:50], "total_rows": rows}


# ========================================================================
# Customer 360 (P2 #18)
# ========================================================================
@router.get("/customers/{phone}/360")
async def customer_360(phone: str, current_user: dict = Depends(_auth)):
    p = normalize_phone(phone)
    # Find by normalized phone first, fallback to raw
    leads = await db.leads.find({"$or": [{"phone_number_norm": p}, {"phone_number": phone}]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    orders = await db.orders.find({"customer_phone": {"$regex": p[-10:]}}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    delivered = [o for o in orders if o.get("status") == "delivered"]
    return {
        "phone": p,
        "leads": leads,
        "orders": orders,
        "stats": {
            "total_orders": len(orders),
            "delivered": len(delivered),
            "total_spent": sum(o.get("total_amount", 0) for o in delivered),
            "avg_order_value": round(sum(o.get("total_amount", 0) for o in delivered) / max(len(delivered), 1), 2),
            "first_order_date": min((o.get("created_at", "") for o in delivered), default=""),
            "last_order_date": max((o.get("created_at", "") for o in delivered), default=""),
        },
    }


# ========================================================================
# GST Invoice PDF (P2 #21)
# ========================================================================
def _gst_invoice_pdf(order: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    primary = HexColor(COMPANY.get("primary_color", "#3B5249"))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm, leftMargin=15 * mm, rightMargin=15 * mm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=primary, fontSize=20, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=primary, fontSize=11, spaceAfter=4, spaceBefore=8)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    elements = []
    elements.append(Paragraph("<b>Celesta Glow</b> · Tax Invoice", h1))
    elements.append(Paragraph(f"GSTIN: {COMPANY.get('gstin', '32XXXXX0000X1ZX')} · State: Kerala (32)", body))
    elements.append(Paragraph(f"{COMPANY.get('address_line1','')}, {COMPANY.get('address_line2','')}", body))
    elements.append(Spacer(1, 6))
    # Invoice header
    inv_no = f"CG/GST/{datetime.now(timezone.utc).strftime('%Y%m')}/{order['id'][-6:]}"
    rows = [
        ["Invoice No.", inv_no, "Date", (order.get("created_at") or "")[:10]],
        ["Order ID", order["id"], "Payment", (order.get("payment_type", "cod") or "").upper()],
        ["AWB", order.get("awb_number", "—"), "Place of Supply", order.get("customer_state", "Kerala")],
    ]
    t = Table(rows, colWidths=[30 * mm, 60 * mm, 30 * mm, 60 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
        ("BACKGROUND", (2, 0), (2, -1), HexColor("#F9F8F6")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.4, primary),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(t)
    elements.append(Paragraph("Bill To:", h2))
    elements.append(Paragraph(f"<b>{order.get('customer_name','')}</b><br/>{order.get('customer_address','')}<br/>"
        f"{order.get('customer_city','')}, {order.get('customer_state','Kerala')} - {order.get('customer_pincode','')}<br/>"
        f"Phone: {order.get('customer_phone','')}<br/>"
        f"GSTIN: {order.get('customer_gstin','—')}", body))
    elements.append(Paragraph("Items", h2))
    item_rows = [["#", "Description", "HSN", "Qty", "Rate", "Amount"]]
    subtotal = 0
    for i, it in enumerate(order.get("items", []), 1):
        qty = it.get("quantity", 1) or 1
        price = it.get("price", 0) or 0
        amt = qty * price
        subtotal += amt
        item_rows.append([str(i), (it.get("product_name") or it.get("name") or "")[:40],
            it.get("hsn_code", "3304"), str(qty), f"Rs.{price:.2f}", f"Rs.{amt:.2f}"])
    t = Table(item_rows, colWidths=[10 * mm, 60 * mm, 20 * mm, 15 * mm, 30 * mm, 30 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), primary),
        ("TEXTCOLOR", (0, 0), (-1, 0), "white"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.5, primary),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
    ]))
    elements.append(t)
    # GST split (intra-state = CGST+SGST; inter-state = IGST)
    in_state = (order.get("customer_state", "") or "Kerala").lower() == "kerala"
    gst_rate = 18.0  # standard rate for cosmetics
    base = subtotal / (1 + gst_rate / 100)
    tax = subtotal - base
    cgst = tax / 2 if in_state else 0
    sgst = tax / 2 if in_state else 0
    igst = tax if not in_state else 0
    tax_rows = [
        ["Sub-total (taxable)", f"Rs.{base:.2f}"],
        ["CGST @ 9%", f"Rs.{cgst:.2f}"],
        ["SGST @ 9%", f"Rs.{sgst:.2f}"],
        ["IGST @ 18%", f"Rs.{igst:.2f}"],
        ["Grand Total", f"Rs.{subtotal:.2f}"],
    ]
    t = Table(tax_rows, colWidths=[100 * mm, 60 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), HexColor("#F9F8F6")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
        ("BOX", (0, 0), (-1, -1), 0.5, primary),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(Spacer(1, 4))
    elements.append(t)
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(f"<i>Amount in words: Indian Rupees {int(subtotal)} only.</i>", body))
    elements.append(Paragraph(f"<font color='#A66E4E'>Authorised Signatory · {COMPANY.get('name','Celesta Glow')} · {datetime.now(timezone.utc).strftime('%d %b %Y')}</font>", body))
    doc.build(elements)
    buf.seek(0)
    return buf.read()


@router.get("/orders/{oid}/invoice.pdf")
async def gst_invoice(oid: str, current_user: dict = Depends(_auth)):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order: raise HTTPException(status_code=404)
    pdf = _gst_invoice_pdf(order)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="invoice-{oid}.pdf"'})


# ========================================================================
# Manual GST Invoice (SM enters shop + items + GST by hand)
# ========================================================================
def _manual_invoice_pdf(inv: dict) -> bytes:
    """Build a printable GST invoice from a manual invoice doc with arbitrary
    line items and per-line GST %. Layout matches the order-based invoice."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    primary = HexColor(COMPANY.get("primary_color", "#3B5249"))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm, leftMargin=15 * mm, rightMargin=15 * mm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=primary, fontSize=20, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=primary, fontSize=11, spaceAfter=4, spaceBefore=8)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    el = []
    el.append(Paragraph("<b>Celesta Glow</b> · Tax Invoice", h1))
    el.append(Paragraph(f"GSTIN: {COMPANY.get('gstin', '32XXXXX0000X1ZX')} · State: Kerala (32)", body))
    el.append(Paragraph(f"{COMPANY.get('address_line1','')}, {COMPANY.get('address_line2','')}", body))
    el.append(Spacer(1, 6))
    cust = inv.get("customer") or {}
    rows = [
        ["Invoice No.", inv["id"], "Date", (inv.get("created_at") or "")[:10]],
        ["Bill To", cust.get("shop_name", "—"), "Payment", inv.get("payment_terms", "—")],
        ["Contact", cust.get("contact_person", "—"), "Place of Supply", cust.get("state", "Kerala")],
    ]
    t = Table(rows, colWidths=[30 * mm, 60 * mm, 30 * mm, 60 * mm])
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(0,-1),HexColor("#F9F8F6")),("BACKGROUND",(2,0),(2,-1),HexColor("#F9F8F6")),
                            ("FONTNAME",(0,0),(0,-1),"Helvetica-Bold"),("FONTNAME",(2,0),(2,-1),"Helvetica-Bold"),
                            ("FONTSIZE",(0,0),(-1,-1),9),("BOX",(0,0),(-1,-1),0.4,primary),
                            ("INNERGRID",(0,0),(-1,-1),0.3,HexColor("#E5E3DB")),("PADDING",(0,0),(-1,-1),5)]))
    el.append(t)
    el.append(Paragraph("Bill To:", h2))
    el.append(Paragraph(
        f"<b>{cust.get('shop_name','')}</b><br/>{cust.get('address','')}<br/>"
        f"{cust.get('city','')}, {cust.get('state','Kerala')} - {cust.get('pincode','')}<br/>"
        f"Phone: {cust.get('phone','')}<br/>GSTIN: {cust.get('gstin','—')}", body))
    el.append(Paragraph("Items", h2))
    item_rows = [["#", "Description", "HSN", "Qty", "Rate", "GST %", "Line Total"]]
    sub = 0.0
    gst_sum = 0.0
    for i, it in enumerate(inv.get("items", []), 1):
        qty = float(it.get("qty", 1) or 1)
        price = float(it.get("price", 0) or 0)
        gst_pct = float(it.get("gst_pct", 18) or 18)
        line = qty * price
        line_gst = line * gst_pct / 100
        sub += line
        gst_sum += line_gst
        item_rows.append([str(i), (it.get("name") or "")[:40], it.get("hsn", "3304"),
                          f"{qty:g}", f"Rs.{price:.2f}", f"{gst_pct:.0f}%",
                          f"Rs.{line + line_gst:.2f}"])
    t = Table(item_rows, colWidths=[10 * mm, 55 * mm, 18 * mm, 14 * mm, 23 * mm, 18 * mm, 27 * mm])
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),primary),("TEXTCOLOR",(0,0),(-1,0),"white"),
                            ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),9),
                            ("BOX",(0,0),(-1,-1),0.5,primary),("INNERGRID",(0,0),(-1,-1),0.3,HexColor("#E5E3DB")),
                            ("PADDING",(0,0),(-1,-1),5),("ALIGN",(3,1),(-1,-1),"RIGHT")]))
    el.append(t)
    in_state = (cust.get("state", "") or "Kerala").lower() == "kerala"
    cgst = gst_sum / 2 if in_state else 0
    sgst = gst_sum / 2 if in_state else 0
    igst = gst_sum if not in_state else 0
    grand = sub + gst_sum
    tax_rows = [
        ["Sub-total (taxable)", f"Rs.{sub:.2f}"],
        ["CGST", f"Rs.{cgst:.2f}"],
        ["SGST", f"Rs.{sgst:.2f}"],
        ["IGST", f"Rs.{igst:.2f}"],
        ["Grand Total", f"Rs.{grand:.2f}"],
    ]
    t = Table(tax_rows, colWidths=[100 * mm, 60 * mm])
    t.setStyle(TableStyle([("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),("BACKGROUND",(0,-1),(-1,-1),HexColor("#F9F8F6")),
                            ("FONTSIZE",(0,0),(-1,-1),9),("ALIGN",(-1,0),(-1,-1),"RIGHT"),
                            ("BOX",(0,0),(-1,-1),0.5,primary),("INNERGRID",(0,0),(-1,-1),0.3,HexColor("#E5E3DB")),
                            ("PADDING",(0,0),(-1,-1),5)]))
    el.append(Spacer(1, 4))
    el.append(t)
    if inv.get("notes"):
        el.append(Spacer(1, 4))
        el.append(Paragraph(f"<b>Notes:</b> {inv['notes']}", body))
    el.append(Spacer(1, 6))
    el.append(Paragraph(f"<i>Amount in words: Indian Rupees {int(grand)} only.</i>", body))
    el.append(Paragraph(f"<font color='#A66E4E'>Authorised Signatory · {COMPANY.get('name','Celesta Glow')} · {datetime.now(timezone.utc).strftime('%d %b %Y')}</font>", body))
    doc.build(el)
    buf.seek(0)
    return buf.read()


@router.post("/invoices/manual")
async def create_manual_invoice(data: dict, current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "sales_manager", "finance_manager"):
        raise HTTPException(status_code=403, detail="Not authorized")
    customer = data.get("customer") or {}
    items = data.get("items") or []
    if not customer.get("shop_name") or not items:
        raise HTTPException(status_code=400, detail="Shop name + items required")
    serial = await db.manual_invoices.count_documents({}) + 1
    inv_id = f"CG/INV/{datetime.now(timezone.utc).strftime('%Y%m')}/{serial:04d}"
    inv = {
        "id": inv_id,
        "customer": customer,
        "items": items,
        "notes": data.get("notes", ""),
        "payment_terms": data.get("payment_terms", ""),
        "subtotal": float(data.get("subtotal", 0) or 0),
        "gst_total": float(data.get("gst_total", 0) or 0),
        "grand_total": float(data.get("grand_total", 0) or 0),
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.manual_invoices.insert_one(inv)
    inv.pop("_id", None)
    return {"invoice_id": inv_id, "invoice": inv}


@router.get("/invoices/manual")
async def list_manual_invoices(current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "sales_manager", "finance_manager"):
        raise HTTPException(status_code=403)
    items = await db.manual_invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"invoices": items, "total": len(items)}


@router.get("/invoices/{inv_id:path}/pdf")
async def manual_invoice_pdf(inv_id: str, request: Request):
    """Accepts JWT via Authorization header OR ?token=... query (so the PDF can be opened in a new tab)."""
    import jwt
    JWT_SECRET = os.environ.get("JWT_SECRET", "celesta-glow-secret-key-2024-secure")
    auth_h = request.headers.get("Authorization", "")
    token = auth_h.split(" ", 1)[1].strip() if auth_h.lower().startswith("bearer ") else request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    inv = await db.manual_invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    pdf = _manual_invoice_pdf(inv)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="invoice-{inv_id.replace("/","-")}.pdf"'})



# ========================================================================
# Trash / Restore (P2 #23)
# ========================================================================
@router.get("/trash/leads")
async def trash_leads(current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "sales_manager", "hr_manager"):
        raise HTTPException(status_code=403)
    items = await db.leads.find({"deleted": True}, {"_id": 0}).sort("deleted_at", -1).to_list(5000)
    return {"items": items, "total": len(items)}


@router.post("/trash/leads/{lid}/restore")
async def restore_lead(lid: str, current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "sales_manager"):
        raise HTTPException(status_code=403)
    r = await db.leads.update_one({"id": lid, "deleted": True},
        {"$set": {"deleted": False, "restored_by": current_user["id"], "restored_at": datetime.now(timezone.utc).isoformat()}, "$unset": {"deleted_at": ""}})
    if r.modified_count == 0:
        raise HTTPException(status_code=404, detail="Not found in trash")
    return {"message": "Restored"}


# ========================================================================
# 2FA / TOTP (P2 #24)
# ========================================================================
@router.post("/auth/2fa/setup")
async def setup_2fa(current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "finance_manager", "hr_manager"):
        raise HTTPException(status_code=403, detail="2FA available for admin/finance/HR only")
    import pyotp, qrcode
    secret = pyotp.random_base32()
    coll = ROLE_COLLECTIONS.get(current_user["role"])
    await db[coll].update_one({"id": current_user["id"]},
        {"$set": {"totp_secret": secret, "totp_enabled": False, "totp_pending": True}})
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=current_user["email"], issuer_name="Celesta Glow")
    img = qrcode.make(uri)
    buf = io.BytesIO(); img.save(buf, format="PNG"); buf.seek(0)
    qr_b64 = base64.b64encode(buf.read()).decode()
    return {"secret": secret, "qr_data_uri": f"data:image/png;base64,{qr_b64}", "uri": uri}


@router.post("/auth/2fa/verify")
async def verify_2fa(data: dict, current_user: dict = Depends(_auth)):
    import pyotp
    coll = ROLE_COLLECTIONS.get(current_user["role"])
    u = await db[coll].find_one({"id": current_user["id"]}, {"totp_secret": 1, "_id": 0})
    secret = (u or {}).get("totp_secret")
    if not secret: raise HTTPException(status_code=400, detail="No 2FA setup pending")
    if not pyotp.TOTP(secret).verify(data.get("code", "")):
        raise HTTPException(status_code=400, detail="Invalid code")
    await db[coll].update_one({"id": current_user["id"]},
        {"$set": {"totp_enabled": True, "totp_pending": False, "totp_verified_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "2FA enabled successfully"}


@router.post("/auth/2fa/disable")
async def disable_2fa(current_user: dict = Depends(_auth)):
    coll = ROLE_COLLECTIONS.get(current_user["role"])
    await db[coll].update_one({"id": current_user["id"]},
        {"$set": {"totp_enabled": False}, "$unset": {"totp_secret": ""}})
    return {"message": "2FA disabled"}


# ========================================================================
# Live Operations Wall data (P2 #26)
# ========================================================================
@router.get("/live/ops-wall")
async def live_ops_wall(current_user: dict = Depends(_auth)):
    """Auto-refresh feed for big-screen office TV. Light payload, public to all roles."""
    today = date.today().isoformat()
    now = datetime.now(timezone.utc)
    last_hour = (now - timedelta(hours=1)).isoformat()
    last_10m = (now - timedelta(minutes=10)).isoformat()
    orders_today = await db.orders.find({"created_at": {"$gte": today}}, {"_id": 0}).to_list(5000)
    delivered_today = [o for o in orders_today if o.get("status") == "delivered"]
    orders_last_hour = sum(1 for o in orders_today if o.get("created_at", "") >= last_hour)
    leads_today = await db.leads.count_documents({"created_at": {"$gte": today}, "deleted": {"$ne": True}})
    leads_last_10m = await db.leads.count_documents({"created_at": {"$gte": last_10m}, "deleted": {"$ne": True}})
    # Top performer today
    perf = {}
    for o in delivered_today:
        k = o.get("created_by_name") or o.get("created_by", "—")
        perf[k] = perf.get(k, 0) + o.get("total_amount", 0)
    top = max(perf.items(), key=lambda x: x[1], default=("—", 0))
    # Live ticker — last 10 orders
    recent_orders = sorted(orders_today, key=lambda x: x.get("created_at", ""), reverse=True)[:10]
    # Live deliveries from Delhivery (shipped → delivered in last hour)
    delivered_last_hour = [o for o in delivered_today if (o.get("delivered_at") or "") >= last_hour]
    return {
        "ts": now.isoformat(),
        "revenue_today": sum(o.get("total_amount", 0) for o in delivered_today),
        "orders_today": len(orders_today),
        "delivered_today": len(delivered_today),
        "leads_today": leads_today,
        "leads_last_10m": leads_last_10m,
        "orders_last_hour": orders_last_hour,
        "deliveries_last_hour": len(delivered_last_hour),
        "top_performer": {"name": top[0], "revenue": top[1]},
        "recent_orders": [{"id": o["id"], "customer": o.get("customer_name", ""), "amount": o.get("total_amount", 0),
                          "status": o.get("status", ""), "at": o.get("created_at", "")} for o in recent_orders],
        "delivered_last_hour": [{"id": o["id"], "customer": o.get("customer_name", ""), "amount": o.get("total_amount", 0)} for o in delivered_last_hour[:6]],
    }


# ========================================================================
# Cohort retention analytics (P3 #32)
# ========================================================================
@router.get("/analytics/cohort")
async def cohort_retention(current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "sales_manager"):
        raise HTTPException(status_code=403)
    delivered = await db.orders.find({"status": "delivered"}, {"_id": 0, "customer_phone": 1, "created_at": 1, "total_amount": 1}).to_list(50000)
    # Group customers by their FIRST order month
    by_customer = {}
    for o in delivered:
        ph = normalize_phone(o.get("customer_phone", ""))
        if not ph: continue
        d = (o.get("created_at") or "")[:7]  # YYYY-MM
        if ph not in by_customer: by_customer[ph] = []
        by_customer[ph].append((d, o.get("total_amount", 0)))
    cohorts = {}  # cohort_month → {month_offset → count}
    for ph, orders in by_customer.items():
        orders.sort()
        first_month = orders[0][0]
        if first_month not in cohorts: cohorts[first_month] = {}
        seen = set()
        for d, _amt in orders:
            try:
                fy, fm = int(first_month[:4]), int(first_month[5:7])
                cy, cm = int(d[:4]), int(d[5:7])
                offset = (cy - fy) * 12 + (cm - fm)
            except Exception:
                continue
            seen.add(offset)
        for off in seen:
            cohorts[first_month][off] = cohorts[first_month].get(off, 0) + 1
    return {"cohorts": cohorts, "total_customers": len(by_customer)}


# ========================================================================
# Voice transcription (P3 #31)
# ========================================================================
@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), current_user: dict = Depends(_auth)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="EMERGENT_LLM_KEY not configured")
    try:
        from emergentintegrations.llm.openai.stt import OpenAISTT
        stt = OpenAISTT(api_key=EMERGENT_LLM_KEY).with_model("whisper-1")
        audio_bytes = await file.read()
        text = await stt.transcribe(audio_bytes, filename=file.filename or "voice.webm")
        return {"text": str(text), "model": "whisper-1"}
    except Exception as e:
        logger.error(f"transcribe: {e}")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")


# ========================================================================
# Proxy-login audit (P3 #35)
# ========================================================================
@router.get("/admin/proxy-audit")
async def proxy_audit_log(current_user: dict = Depends(_auth)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403)
    logs = await db.audit_logs.find({"action": {"$regex": "proxy_"}}, {"_id": 0}).sort("timestamp", -1).to_list(5000)
    return {"logs": logs, "total": len(logs)}


# ========================================================================
# Stock auto-deduct hook (P1 #15) — to be called from server.py deliver_order
# ========================================================================
async def deduct_stock_for_order(order: dict):
    for it in (order.get("items") or []):
        pid = it.get("product_id")
        qty = int(it.get("quantity", 0) or 0)
        if pid and qty > 0:
            try:
                await db.products.update_one({"id": pid}, {"$inc": {"stock": -qty}})
            except Exception as e:
                logger.warning(f"stock deduct {pid}: {e}")


# ========================================================================
# Smart fallback AI summary (P2 #16) — used by upgrades.py when no key
# ========================================================================
def smart_summary(user: dict, kpis: dict, attendance: dict) -> str:
    flags = []
    if attendance.get("late_hours_total", 0) > 5:
        flags.append(f"⚠️ Heavy late hours ({attendance['late_hours_total']}h)")
    if attendance.get("half_days", 0) > 3:
        flags.append(f"⚠️ {attendance['half_days']} half-days")
    if kpis.get("conversion", 0) < 5 and kpis.get("leads", 0) > 10:
        flags.append("🔴 Low conversion (<5%)")
    if kpis.get("conversion", 0) > 25:
        flags.append("✅ Top conversion rate")
    if kpis.get("revenue", 0) > 100000:
        flags.append(f"⭐ ₹{int(kpis['revenue']/1000)}k revenue")
    rec = ""
    if kpis.get("conversion", 0) < 5:
        rec = "Recommend script training + call shadowing."
    elif attendance.get("late_hours_total", 0) > 5:
        rec = "Recommend HR meeting on punctuality."
    elif kpis.get("orders", 0) > 30:
        rec = "Excellent — consider promotion/incentive bump."
    else:
        rec = "Maintain current pace; review weekly."
    return (
        f"{user.get('name','Employee')} ({user.get('role','').replace('_',' ').title()}): "
        f"{kpis.get('leads',0)} leads · {kpis.get('orders',0)} orders · "
        f"{kpis.get('conversion',0)}% conversion · Rs.{int(kpis.get('revenue',0))} revenue. "
        f"Attendance {attendance.get('days_present',0)} days, {attendance.get('late_hours_total',0)}h late. "
        + " ".join(flags) + (" · " + rec if rec else "")
    )
