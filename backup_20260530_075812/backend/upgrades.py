"""
Celesta Glow CRM — Phase 1-6 Upgrade Module
Adds: order-edit scope hardening, label PDFs, daily reports, employee 360°,
HR efficiency, forecasting, Delhivery auto-sync. Mounted as a sub-router from server.py.
"""
import os, io, json, uuid, asyncio, logging, smtplib
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Request, Response, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
import requests

logger = logging.getLogger(__name__)

# Lazy imports for reportlab/barcode (only loaded when needed)
def _reportlab():
    from reportlab.lib.pagesizes import A4, A6
    from reportlab.lib.units import mm, cm
    from reportlab.lib.colors import HexColor
    from reportlab.pdfgen import canvas
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
    return locals()

def _barcode_png(code: str) -> bytes:
    from barcode import Code128
    from barcode.writer import ImageWriter
    buf = io.BytesIO()
    Code128(code or "NA", writer=ImageWriter()).write(buf, options={"write_text": False, "module_height": 8.0, "quiet_zone": 1.0})
    return buf.getvalue()

# ========================================================================
# Will be set on init from server.py
# ========================================================================
db = None
get_current_user = None
ROLE_COLLECTIONS = {}
COMPANY = {}
COMMISSION_RATES = {}
EMERGENT_LLM_KEY = ""
SMTP_EMAIL = ""
SMTP_PASSWORD = ""
DAILY_REPORT_RECIPIENT = os.environ.get("DAILY_REPORT_EMAIL", "shadnazar123@gmail.com")
DELHIVERY_API_KEY = ""
DELHIVERY_BASE_URL = "https://track.delhivery.com"

router = APIRouter(prefix="/api")

# Auth dependency wrapper — get_current_user is wired at init_upgrades()
async def _auth(request: Request):
    return await get_current_user(request)

def init_upgrades(**kw):
    """Called from server.py at startup to wire shared state."""
    global db, get_current_user, ROLE_COLLECTIONS, COMPANY, COMMISSION_RATES
    global EMERGENT_LLM_KEY, SMTP_EMAIL, SMTP_PASSWORD, DELHIVERY_API_KEY, DELHIVERY_BASE_URL
    db = kw["db"]
    get_current_user = kw["get_current_user"]
    ROLE_COLLECTIONS = kw["ROLE_COLLECTIONS"]
    COMPANY = kw["COMPANY"]
    COMMISSION_RATES = kw.get("COMMISSION_RATES", {})
    EMERGENT_LLM_KEY = kw.get("EMERGENT_LLM_KEY", "")
    SMTP_EMAIL = kw.get("SMTP_EMAIL", "")
    SMTP_PASSWORD = kw.get("SMTP_PASSWORD", "")
    DELHIVERY_API_KEY = kw.get("DELHIVERY_API_KEY", os.environ.get("DELHIVERY_API_KEY", ""))
    DELHIVERY_BASE_URL = kw.get("DELHIVERY_BASE_URL", "https://track.delhivery.com").rstrip("/")
    return router

# ========================================================================
# Helper: team scope resolvers
# ========================================================================
async def _sm_team_ids(sm_id: str) -> List[str]:
    tcs = await db.telecallers.find({"managed_by": sm_id}, {"_id": 0, "id": 1}).to_list(500)
    asms = await db.assistant_sales_managers.find({"managed_by": sm_id}, {"_id": 0, "id": 1}).to_list(50)
    return [t["id"] for t in tcs] + [a["id"] for a in asms] + [sm_id]

async def _dm_team_ids(dm_id: str) -> List[str]:
    ags = await db.agents.find({"managed_by": dm_id}, {"_id": 0, "id": 1}).to_list(500)
    adms = await db.assistant_district_managers.find({"managed_by": dm_id}, {"_id": 0, "id": 1}).to_list(50)
    return [a["id"] for a in ags] + [a["id"] for a in adms] + [dm_id]

# ========================================================================
# Phase 1 — Hardened order edit scope check (replaces _can_edit_order)
# ========================================================================
async def can_edit_order_strict(order: dict, user: dict) -> tuple[bool, str]:
    status = order.get("status", "")
    creator_id = order.get("created_by", "")
    role = user["role"]; uid = user["id"]
    if status in ("delivered", "rejected", "cancelled"):
        return False, f"Order is {status} — editing is locked"
    if role == "admin":
        return True, ""
    if role == "inventory_manager":
        return True, ""
    if role == "sales_manager":
        ids = await _sm_team_ids(uid)
        return (creator_id in ids, "Not in your sales team")
    if role == "assistant_sales_manager":
        parent = user.get("managed_by", "")
        ids = await _sm_team_ids(parent) if parent else [uid]
        return (creator_id in ids, "Not in your sales team")
    if role == "district_manager":
        ids = await _dm_team_ids(uid)
        return (creator_id in ids, "Not in your district team")
    if role == "assistant_district_manager":
        parent = user.get("managed_by", "")
        ids = await _dm_team_ids(parent) if parent else [uid]
        return (creator_id in ids, "Not in your district team")
    if role in ("telecaller", "agent", "inhouse_telecaller"):
        if creator_id != uid:
            return False, "You can only edit orders you created"
        if status != "pending":
            return False, "Order is already approved — only manager can edit now"
        return True, ""
    return False, "Not authorised"

# ========================================================================
# Phase 1 — Date range filter for leads + orders (additive)
# ========================================================================
def _date_range_query(field: str, frm: Optional[str], to: Optional[str]) -> dict:
    if not (frm or to): return {}
    q = {}
    if frm: q["$gte"] = frm
    if to: q["$lt"] = to + "T99"
    return {field: q}

@router.get("/v2/orders")
async def get_orders_v2(
    status: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    created_by: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    current_user: dict = Depends(_auth)
):
    """Paginated order list with date range + team scope. Used by SM/DM/Admin dashboards."""
    query = {}
    role = current_user["role"]; uid = current_user["id"]
    if role == "sales_manager":
        query["created_by"] = {"$in": await _sm_team_ids(uid)}
    elif role == "assistant_sales_manager":
        query["created_by"] = {"$in": await _sm_team_ids(current_user.get("managed_by", uid))}
    elif role == "district_manager":
        query["created_by"] = {"$in": await _dm_team_ids(uid)}
    elif role == "assistant_district_manager":
        query["created_by"] = {"$in": await _dm_team_ids(current_user.get("managed_by", uid))}
    elif role in ("telecaller", "agent", "inhouse_telecaller"):
        query["created_by"] = uid
    if status and status != "all":
        query["status"] = status
    if created_by:
        query["created_by"] = created_by
    query.update(_date_range_query("created_at", from_date, to_date))
    limit = max(1, min(int(limit or 50), 500))
    skip = max(0, int(skip or 0))
    total = await db.orders.count_documents(query)
    items = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"orders": items, "total": total, "skip": skip, "limit": limit, "pages": (total + limit - 1) // limit}

@router.get("/v2/leads")
async def get_leads_v2(
    status: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    assigned_to: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    current_user: dict = Depends(_auth)
):
    query = {"deleted": {"$ne": True}}
    role = current_user["role"]; uid = current_user["id"]
    if role in ("telecaller", "agent"):
        query["assigned_to"] = uid
    elif role == "sales_manager":
        ids = await _sm_team_ids(uid)
        query["$or"] = [{"assigned_to": {"$in": ids}}, {"created_by": {"$in": ids}}]
    elif role == "district_manager":
        ids = await _dm_team_ids(uid)
        query["$or"] = [{"assigned_to": {"$in": ids}}, {"created_by": {"$in": ids}}]
    if assigned_to: query["assigned_to"] = assigned_to
    if status and status != "all":
        query["status"] = status
    else:
        query["status"] = {"$ne": "routed_to_collab"}
    query.update(_date_range_query("created_at", from_date, to_date))
    limit = max(1, min(int(limit or 50), 500))
    skip = max(0, int(skip or 0))
    total = await db.leads.count_documents(query)
    items = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"leads": items, "total": total, "skip": skip, "limit": limit, "pages": (total + limit - 1) // limit}

# ========================================================================
# Phase 3 — Shipping Label PDF (A6 / 4-up A4)
# ========================================================================
def _draw_label(c, x0: float, y0: float, w: float, h: float, order: dict):
    """Draw a single shipping label at (x0, y0) with width w, height h (in points).
    Layout zones (top → bottom):
      • Header strip (14mm)
      • FROM block (28mm)
      • Divider (1mm)
      • TO block (flexible, fills middle — clipped to not overlap bottom strip)
      • Bottom strip (12mm) — Order ID + Payment + AWB + Total
    """
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import mm
    pad = 5 * mm
    primary = HexColor(COMPANY.get("primary_color", "#3B5249"))
    accent = HexColor(COMPANY.get("accent_color", "#A66E4E"))

    HEADER_H = 14 * mm
    FROM_H = 28 * mm
    BOTTOM_H = 12 * mm
    TO_TOP = y0 + h - HEADER_H - FROM_H - 2 * mm           # absolute Y where TO block starts (top)
    TO_BOTTOM = y0 + BOTTOM_H + 3 * mm                     # absolute Y where TO block must end

    # Outer border
    c.setStrokeColor(HexColor("#2C3531"))
    c.setLineWidth(0.6)
    c.rect(x0, y0, w, h, stroke=1, fill=0)

    # ===== Header strip =====
    c.setFillColor(primary)
    c.rect(x0, y0 + h - HEADER_H, w, HEADER_H, stroke=0, fill=1)
    c.setFillColor("white")
    c.setFont("Helvetica-Bold", 13)
    c.drawString(x0 + pad, y0 + h - 8 * mm, "CELESTA")
    c.setFillColor(HexColor(COMPANY.get("warning_color", "#D4A373")))
    tw = c.stringWidth("CELESTA", "Helvetica-Bold", 13)
    c.drawString(x0 + pad + tw + 3, y0 + h - 8 * mm, "GLOW")
    c.setFillColor("white")
    c.setFont("Helvetica-Oblique", 6.5)
    c.drawString(x0 + pad, y0 + h - 12 * mm, COMPANY.get("tagline", "Premium Beauty")[:50])

    # ===== FROM block =====
    from_y = y0 + h - HEADER_H - 4
    c.setFillColor(HexColor("#59615D"))
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(x0 + pad, from_y - 4, "FROM:")
    c.setFont("Helvetica", 7)
    c.setFillColor("black")
    for i, line in enumerate([
        COMPANY.get("name", "Celesta Glow"),
        COMPANY.get("address_line1", ""),
        COMPANY.get("address_line2", ""),
        "Phone: " + COMPANY.get("phone", ""),
    ]):
        c.drawString(x0 + pad, from_y - 12 - i * 8, line[:55])

    # ===== Divider =====
    c.setStrokeColor(HexColor("#E5E3DB"))
    c.setLineWidth(0.4)
    c.line(x0 + pad, TO_TOP + 2 * mm, x0 + w - pad, TO_TOP + 2 * mm)

    # ===== TO block — drawn within [TO_BOTTOM, TO_TOP] window =====
    cy = TO_TOP
    c.setFillColor(primary)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x0 + pad, cy, "DELIVER TO:")
    cy -= 13
    # Customer name (bold, big)
    c.setFillColor("black")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x0 + pad, cy, (order.get("customer_name") or "—")[:42])
    cy -= 13
    # Address (wrap by words, clip to avoid bottom strip)
    c.setFont("Helvetica", 9.5)
    addr = (order.get("customer_address") or "").strip()
    # Build city/state/pin line so we can reserve space for it
    parts = []
    if order.get("customer_city"): parts.append(order["customer_city"])
    if order.get("customer_state"): parts.append(order["customer_state"])
    if order.get("customer_pincode"): parts.append(f"PIN {order['customer_pincode']}")
    city_line = ", ".join(parts)
    landmark = (order.get("customer_landmark") or "").strip()
    phone_str = (order.get("customer_phone") or "—")
    # Reserve space: city_line + landmark (if any) + phone
    reserved_lines = 1 + (1 if landmark else 0) + 1
    reserved_h = reserved_lines * 11 + 6
    addr_floor = TO_BOTTOM + reserved_h
    # Wrap address by words
    words = addr.split()
    line_buf = ""
    max_chars = max(20, int(w / 6.0))  # rough char width estimate at 9.5pt
    addr_lines = []
    for w_ in words:
        candidate = (line_buf + " " + w_).strip() if line_buf else w_
        if len(candidate) <= max_chars:
            line_buf = candidate
        else:
            if line_buf: addr_lines.append(line_buf)
            line_buf = w_
    if line_buf: addr_lines.append(line_buf)
    # Print only lines that fit; ellipsize the last one if truncated
    drawn = 0
    for ln in addr_lines:
        if cy - 11 < addr_floor:
            # Out of room — append ellipsis on previous line if anything was drawn
            if drawn > 0:
                c.drawString(x0 + w - 10 * mm, cy + 11, "…")
            break
        c.drawString(x0 + pad, cy, ln)
        cy -= 11
        drawn += 1
    # City / state / pin
    if city_line:
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(x0 + pad, max(cy, TO_BOTTOM + reserved_h - 11), city_line[:60])
        cy = max(cy, TO_BOTTOM + reserved_h - 11) - 11
    # Landmark (optional)
    if landmark:
        c.setFont("Helvetica-Oblique", 8.5)
        c.setFillColor(HexColor("#59615D"))
        c.drawString(x0 + pad, cy, ("Landmark: " + landmark)[:60])
        c.setFillColor("black")
        cy -= 11
    # Phone (highlighted)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(accent)
    c.drawString(x0 + pad, max(cy, TO_BOTTOM + 4), "Phone: " + phone_str[:20])

    # ===== Bottom strip — Order ID + Payment + AWB + Total =====
    c.setFillColor(primary)
    c.rect(x0, y0, w, BOTTOM_H, stroke=0, fill=1)
    c.setFillColor("white")
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x0 + pad, y0 + 8 * mm, "ORDER:")
    c.setFont("Helvetica", 7.5)
    c.drawString(x0 + pad + 30, y0 + 8 * mm, (order.get("id", "") or "")[:24])
    pay = (order.get("payment_type", "cod") or "cod").upper()
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(x0 + w - pad, y0 + 8 * mm, f"[{pay}]")
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x0 + pad, y0 + 3 * mm, "AWB:")
    c.setFont("Helvetica", 7.5)
    awb_or_courier = order.get("awb_number") or (order.get("courier_name") if order.get("self_shipped") else "") or "—"
    c.drawString(x0 + pad + 22, y0 + 3 * mm, str(awb_or_courier)[:30])
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(x0 + w - pad, y0 + 3 * mm, f"Rs.{order.get('total_amount', 0):.0f}")


@router.get("/orders/{oid}/label.pdf")
async def order_label(oid: str, sheet: str = "single", current_user: dict = Depends(_auth)):
    """Single A6 label. sheet=single | a4 (4-up)"""
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order: raise HTTPException(status_code=404, detail="Order not found")
    from reportlab.lib.pagesizes import A4, A6
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    if sheet == "a4":
        c = canvas.Canvas(buf, pagesize=A4)
        W, H = A4
        cell_w = W / 2; cell_h = H / 2
        for idx in range(4):
            row = idx // 2; col = idx % 2
            x = col * cell_w + 3 * mm
            y = H - (row + 1) * cell_h + 3 * mm
            _draw_label(c, x, y, cell_w - 6 * mm, cell_h - 6 * mm, order)
        c.showPage()
    else:
        c = canvas.Canvas(buf, pagesize=A6)
        W, H = A6
        _draw_label(c, 3 * mm, 3 * mm, W - 6 * mm, H - 6 * mm, order)
        c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=label-{oid}.pdf"})


@router.post("/orders/labels/bulk")
async def bulk_labels(data: dict, current_user: dict = Depends(_auth)):
    """Generate a single multi-page PDF (4 labels per A4 page)."""
    ids = data.get("order_ids") or []
    if not ids: raise HTTPException(status_code=400, detail="order_ids required")
    orders = await db.orders.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
    if not orders: raise HTTPException(status_code=404, detail="No orders found")
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    cell_w = W / 2; cell_h = H / 2
    for i, o in enumerate(orders):
        idx = i % 4
        if i > 0 and idx == 0:
            c.showPage()
        row = idx // 2; col = idx % 2
        x = col * cell_w + 3 * mm
        y = H - (row + 1) * cell_h + 3 * mm
        _draw_label(c, x, y, cell_w - 6 * mm, cell_h - 6 * mm, o)
    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=labels-{len(orders)}.pdf"})

# ========================================================================
# Phase 4 — Admin Employee 360°
# ========================================================================
async def _employee_360(uid: str, range_days: int = 30) -> dict:
    """Aggregate everything for one employee."""
    # Find user across all role collections
    user = None; role = None
    for coll, r in {v: k for k, v in ROLE_COLLECTIONS.items()}.items():
        u = await db[coll].find_one({"id": uid}, {"_id": 0, "password_hash": 0})
        if u:
            user = u; role = r; break
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    user["role"] = role

    today = date.today()
    start = (today - timedelta(days=range_days)).isoformat()
    end = (today + timedelta(days=1)).isoformat()

    # KPIs
    orders = await db.orders.find({"created_by": uid, "created_at": {"$gte": start}}, {"_id": 0}).to_list(2000)
    delivered = [o for o in orders if o.get("status") == "delivered"]
    leads = await db.leads.find({"assigned_to": uid, "created_at": {"$gte": start}}, {"_id": 0}).to_list(2000)
    calls = sum(len(l.get("call_logs") or []) for l in leads)
    commissions = await db.commissions.find({"user_id": uid, "created_at": {"$gte": start}}, {"_id": 0}).to_list(1000)
    attendance = await db.attendance.find({"user_id": uid, "date": {"$gte": start[:10]}}, {"_id": 0}).sort("date", 1).to_list(60)
    leaves = await db.leaves.find({"user_id": uid}, {"_id": 0}).sort("start_date", -1).to_list(60)
    tasks = await db.employee_tasks.find({"user_id": uid, "date": {"$gte": start[:10]}}, {"_id": 0}).sort("date", -1).to_list(60)
    advances = await db.advances.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    payroll_history = await db.payroll.find({"user_id": uid}, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(24)

    # Hours late counter (compare with 9:30 IST)
    late_minutes = 0; on_time = 0; half_days = 0
    for a in attendance:
        ci = a.get("check_in", "")  # HH:MM
        if ci and len(ci) >= 5:
            try:
                h, m = int(ci[:2]), int(ci[3:5])
                mins = h * 60 + m
                target = 9 * 60 + 30
                if mins > target:
                    late_minutes += (mins - target)
                else:
                    on_time += 1
            except Exception: pass
        if (a.get("status") or "").lower() == "half_day":
            half_days += 1

    # Build response
    today_iso = today.isoformat()
    return {
        "user": user,
        "kpis": {
            "leads": len(leads),
            "calls": calls,
            "orders": len(orders),
            "delivered": len(delivered),
            "conversion": round((len(delivered) / max(len(leads), 1)) * 100, 1),
            "revenue": sum(o.get("total_amount", 0) for o in delivered),
            "commission_total": sum(c.get("commission_amount", 0) for c in commissions),
            "commission_paid": sum(c.get("commission_amount", 0) for c in commissions if c.get("status") == "paid"),
        },
        "attendance": {
            "records": attendance,
            "days_present": len(attendance),
            "late_minutes_total": late_minutes,
            "late_hours_total": round(late_minutes / 60, 1),
            "on_time_days": on_time,
            "half_days": half_days,
        },
        "leaves": leaves,
        "tasks": tasks,
        "advances": advances,
        "payroll_history": payroll_history,
        "today_tasks": [t for t in tasks if t.get("date") == today_iso],
        "range_days": range_days,
    }


@router.get("/admin/employees")
async def list_all_employees(current_user: dict = Depends(_auth)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    out = []
    for coll, role in {v: k for k, v in ROLE_COLLECTIONS.items()}.items():
        users = await db[coll].find({}, {"_id": 0, "password_hash": 0}).to_list(500)
        for u in users:
            u["role"] = role
            out.append(u)
    return {"employees": out, "total": len(out)}


@router.get("/admin/employee/{uid}/360")
async def employee_360(uid: str, range_days: int = 30, current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Admin / HR only")
    return await _employee_360(uid, range_days)


# ========================================================================
# Phase 6 — HR Efficiency (per-day employee snapshot)
# ========================================================================
@router.get("/hr/efficiency")
async def hr_efficiency(d: Optional[str] = None, current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "hr_manager"):
        raise HTTPException(status_code=403)
    day = d or date.today().isoformat()
    employees = []
    for coll, role in {v: k for k, v in ROLE_COLLECTIONS.items()}.items():
        if role == "admin": continue
        users = await db[coll].find({}, {"_id": 0, "password_hash": 0}).to_list(500)
        for u in users:
            uid = u.get("id")
            att = await db.attendance.find_one({"user_id": uid, "date": day}, {"_id": 0}) or {}
            tasks = await db.employee_tasks.find({"user_id": uid, "date": day}, {"_id": 0}).to_list(20)
            leaves_today = await db.leaves.find({"user_id": uid, "start_date": {"$lte": day}, "end_date": {"$gte": day}, "status": "approved"}, {"_id": 0}).to_list(5)
            advances_pending = await db.advances.find({"user_id": uid, "status": "pending"}, {"_id": 0}).to_list(10)
            leaves_total = await db.leaves.count_documents({"user_id": uid, "status": "approved"})
            half = await db.attendance.count_documents({"user_id": uid, "status": "half_day"})
            employees.append({
                "id": uid, "name": u.get("name", ""), "role": role,
                "joining_date": u.get("joining_date") or u.get("created_at", "")[:10],
                "phone": u.get("phone", ""),
                "salary": u.get("salary", 0), "incentive": u.get("incentive", 0),
                "attendance_today": att,
                "tasks_today": tasks, "tasks_count": len(tasks),
                "on_leave_today": bool(leaves_today),
                "leave_today_details": leaves_today,
                "leaves_taken_total": leaves_total,
                "half_days_total": half,
                "advances_pending": advances_pending,
                "advances_pending_amount": sum(a.get("amount", 0) for a in advances_pending),
            })
    return {"date": day, "employees": employees, "total": len(employees)}


# ========================================================================
# Phase 4/6 — AI Day Summary (Emergent LLM Key)
# ========================================================================
@router.post("/admin/employee/{uid}/ai-summary")
async def ai_summary(uid: str, data: Optional[dict] = None, current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "hr_manager"):
        raise HTTPException(status_code=403)
    days = (data or {}).get("range_days", 7)
    snapshot = await _employee_360(uid, days)
    u = snapshot["user"]; k = snapshot["kpis"]; a = snapshot["attendance"]
    if not EMERGENT_LLM_KEY:
        # Deterministic fallback
        summary = (
            f"{u.get('name', 'Employee')} ({u.get('role','').replace('_',' ').title()}) — "
            f"last {days}d: {k['leads']} leads, {k['calls']} calls, {k['orders']} orders "
            f"({k['delivered']} delivered), conversion {k['conversion']}%, revenue Rs.{int(k['revenue'])}. "
            f"Attendance: {a['days_present']} days, on-time {a['on_time_days']}, "
            f"late {a['late_hours_total']}h total, {a['half_days']} half-days."
        )
        return {"summary": summary, "model": "fallback", "kpis": k}
    # Use emergentintegrations
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"emp-{uid}-{days}", system_message=(
            "You are a sharp HR analyst at Celesta Glow CRM. "
            "Given an employee performance snapshot, write a tight 4-5 sentence summary covering: "
            "performance vs avg, attendance/punctuality concerns, leave usage, advance status, and one actionable recommendation. "
            "Be direct, no fluff. Use the actual numbers."
        )).with_model("openai", "gpt-4o-mini")
        prompt = (
            f"Employee: {u.get('name')} ({u.get('role')})\n"
            f"Range: last {days} days\n"
            f"KPIs: {json.dumps(k)}\n"
            f"Attendance: {json.dumps(a, default=str)}\n"
            f"Leaves taken: {len(snapshot['leaves'])}\n"
            f"Pending advances: {len(snapshot['advances'])} totaling Rs.{sum(x.get('amount',0) for x in snapshot['advances'])}\n"
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        return {"summary": str(resp), "model": "gpt-4o-mini", "kpis": k}
    except Exception as e:
        logger.error(f"ai_summary: {e}")
        return {"summary": f"AI offline — {u.get('name')}: {k['orders']} orders, conversion {k['conversion']}%.",
                "model": "fallback_error", "error": str(e), "kpis": k}


# ========================================================================
# Phase 5 — Forecasting
# ========================================================================
@router.get("/admin/forecast")
async def forecast(days: int = 30, current_user: dict = Depends(_auth)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403)
    cutoff = (date.today() - timedelta(days=90)).isoformat()
    orders = await db.orders.find({"status": "delivered", "created_at": {"$gte": cutoff}}, {"_id": 0, "created_at": 1, "total_amount": 1}).to_list(5000)
    # daily series
    by_day = {}
    for o in orders:
        d = o.get("created_at", "")[:10]
        by_day[d] = by_day.get(d, 0) + (o.get("total_amount") or 0)
    series = sorted(by_day.items())
    if len(series) < 5:
        # Not enough data — flat projection
        avg = sum(by_day.values()) / max(len(by_day), 1)
        proj = [{"day": (date.today() + timedelta(days=i+1)).isoformat(), "projected_revenue": round(avg, 2)} for i in range(days)]
        return {"historical": [{"day": d, "revenue": v} for d, v in series], "projection": proj, "avg_per_day": round(avg, 2)}
    # Simple linear regression on (day_index, revenue)
    import numpy as np
    xs = np.arange(len(series)); ys = np.array([v for _, v in series], dtype=float)
    slope, intercept = np.polyfit(xs, ys, 1)
    last_idx = len(series) - 1
    proj = []
    for i in range(1, days + 1):
        v = max(0, slope * (last_idx + i) + intercept)
        proj.append({"day": (date.today() + timedelta(days=i)).isoformat(), "projected_revenue": round(float(v), 2)})
    return {
        "historical": [{"day": d, "revenue": v} for d, v in series],
        "projection": proj,
        "avg_per_day": round(float(ys.mean()), 2),
        "trend_per_day": round(float(slope), 2),
    }


# ========================================================================
# Phase 5 — Daily Report PDF + Email
# ========================================================================
async def _daily_report_data(scope_user: dict, target_date: date) -> dict:
    """Build the metrics for one user's scope on a given date."""
    day = target_date.isoformat()
    role = scope_user["role"]; uid = scope_user["id"]
    if role == "admin":
        user_ids = None  # all
    elif role == "sales_manager":
        user_ids = await _sm_team_ids(uid)
    elif role == "district_manager":
        user_ids = await _dm_team_ids(uid)
    elif role == "hr_manager":
        user_ids = None  # all employees
    elif role in ("digital_marketing_manager", "social_media_manager", "content_strategist",
                  "content_developer", "finance_manager", "inventory_manager"):
        # These roles look at org-wide / department-wide activity in their own section,
        # NOT just their personal leads — leave lead/order context broad and rely on the
        # role-specific section below for the real KPIs.
        user_ids = None
    else:
        user_ids = [uid]
    lead_q = {"created_at": {"$gte": day, "$lt": day + "T99"}, "deleted": {"$ne": True}}
    order_q = {"created_at": {"$gte": day, "$lt": day + "T99"}}
    if user_ids is not None:
        lead_q["assigned_to"] = {"$in": user_ids}
        order_q["created_by"] = {"$in": user_ids}
    leads = await db.leads.find(lead_q, {"_id": 0}).to_list(2000)
    orders = await db.orders.find(order_q, {"_id": 0}).to_list(2000)
    # Lead status distribution
    status_dist = {}
    for l in leads:
        s = l.get("status", "new")
        status_dist[s] = status_dist.get(s, 0) + 1
    # Per-person breakdown
    per_user = {}
    for l in leads:
        owner = l.get("assigned_to_name") or l.get("assigned_to", "—")
        if owner not in per_user: per_user[owner] = {"leads": 0, "orders": 0, "revenue": 0, "delivered": 0}
        per_user[owner]["leads"] += 1
    for o in orders:
        owner = o.get("created_by_name") or o.get("created_by", "—")
        if owner not in per_user: per_user[owner] = {"leads": 0, "orders": 0, "revenue": 0, "delivered": 0}
        per_user[owner]["orders"] += 1
        if o.get("status") == "delivered":
            per_user[owner]["delivered"] += 1
            per_user[owner]["revenue"] += o.get("total_amount", 0)
    revenue_today = sum(o.get("total_amount", 0) for o in orders if o.get("status") == "delivered")
    cod_count = sum(1 for o in orders if (o.get("payment_type") or "cod") == "cod")
    prepaid_count = len(orders) - cod_count
    # HR-specific section
    hr_section = {}
    if role in ("hr_manager", "admin"):
        new_candidates = await db.hiring_candidates.find({"created_at": {"$gte": day, "$lt": day + "T99"}}, {"_id": 0}).to_list(500)
        hr_calls = await db.hr_call_logs.find({"call_date": day}, {"_id": 0}).to_list(500)
        hired = await db.hiring_candidates.find({"hired_at": {"$gte": day, "$lt": day + "T99"}}, {"_id": 0}).to_list(500)
        attendance_today = await db.attendance.find({"date": day}, {"_id": 0}).to_list(500)
        leaves_today = await db.leaves.find({"start_date": {"$lte": day}, "end_date": {"$gte": day}, "status": "approved"}, {"_id": 0}).to_list(200)
        hr_section = {
            "candidates_added": len(new_candidates),
            "hr_calls": len(hr_calls),
            "hired_today": len(hired),
            "hired_list": hired,
            "checkins": len([a for a in attendance_today if a.get("check_in")]),
            "on_leave": len(leaves_today),
        }

    # Sales-manager-specific section: orders booked, telecaller calls, leads under SM team.
    sales_section = {}
    if role in ("sales_manager", "admin"):
        # For SM, the scope is already filtered by team via lead_q/order_q above. For admin we sum org-wide.
        tc_call_q = {"created_at": {"$gte": day, "$lt": day + "T99"}}
        if role == "sales_manager":
            tc_ids = user_ids or []
            tc_call_q["caller_id"] = {"$in": tc_ids}
        tc_calls = await db.inhouse_call_logs.count_documents(tc_call_q)
        confirmed_orders = sum(1 for o in orders if o.get("status") in ("confirmed", "shipped", "delivered"))
        # collect call_logs entries from the leads themselves (telecaller follow-ups)
        lead_call_count = 0
        for l in leads:
            for cl in (l.get("call_logs") or []):
                if cl.get("logged_at", "")[:10] == day:
                    lead_call_count += 1
        sales_section = {
            "leads_taken": len(leads),
            "telecaller_calls": tc_calls + lead_call_count,
            "orders_booked": len(orders),
            "orders_confirmed": confirmed_orders,
            "delivered": sum(1 for o in orders if o.get("status") == "delivered"),
        }

    # Digital marketing-specific section: ad campaigns + leads sourced from ads, daily ad spend.
    digital_section = {}
    if role in ("digital_marketing_manager", "admin"):
        camps_q = {"created_at": {"$gte": day, "$lt": day + "T99"}}
        new_camps = await db.campaigns.count_documents(camps_q)
        active_camps = await db.campaigns.count_documents({"status": "active"})
        # Ad spend from any campaign that has a daily_spend field for `day`
        all_camps = await db.campaigns.find({}, {"_id": 0}).to_list(500)
        spend_today = 0.0
        for c in all_camps:
            for sp in (c.get("daily_spend") or []):
                if sp.get("date") == day:
                    spend_today += float(sp.get("amount", 0) or 0)
            # Fall back: a single created-today spend
            if c.get("created_at", "")[:10] == day:
                spend_today += float(c.get("budget", 0) or 0) / max(int(c.get("duration_days", 30) or 30), 1)
        ad_leads = await db.leads.count_documents({**lead_q, "source": {"$in": ["facebook", "instagram", "google_ads", "meta_ads"]}})
        digital_section = {
            "new_campaigns": new_camps,
            "active_campaigns": active_camps,
            "ad_spend_today": round(spend_today, 2),
            "leads_from_ads": ad_leads,
        }

    # Social media-specific section: posts published, scripts, briefs created.
    social_section = {}
    if role in ("social_media_manager", "admin"):
        new_briefs = await db.content_briefs.count_documents({"created_at": {"$gte": day, "$lt": day + "T99"}})
        new_scripts = await db.content_scripts.count_documents({"created_at": {"$gte": day, "$lt": day + "T99"}})
        posted_today = await db.content_scripts.count_documents({"status": "posted", "posted_at": {"$gte": day, "$lt": day + "T99"}})
        pending_review = await db.content_scripts.count_documents({"status": "pending_approval"})
        infl_added = await db.influencers.count_documents({"created_at": {"$gte": day, "$lt": day + "T99"}}) if (await db.influencers.estimated_document_count() > 0) else 0
        social_section = {
            "briefs_created": new_briefs,
            "scripts_created": new_scripts,
            "posts_published": posted_today,
            "pending_approvals": pending_review,
            "new_influencers": infl_added,
        }

    # Content strategist-specific section.
    strategist_section = {}
    if role in ("content_strategist", "admin"):
        my_briefs = await db.content_briefs.count_documents({"created_at": {"$gte": day, "$lt": day + "T99"}, "created_by": uid} if role == "content_strategist" else {"created_at": {"$gte": day, "$lt": day + "T99"}})
        my_pillars = await db.content_pillars.count_documents({"status": "active"})
        my_scripts = await db.content_scripts.count_documents({"created_at": {"$gte": day, "$lt": day + "T99"}, "created_by": uid} if role == "content_strategist" else {"created_at": {"$gte": day, "$lt": day + "T99"}})
        strategist_section = {
            "briefs_created": my_briefs,
            "active_pillars": my_pillars,
            "scripts_created": my_scripts,
        }

    # Content developer-specific section: scripts assigned, drafted, submitted.
    developer_section = {}
    if role in ("content_developer", "admin"):
        assigned_q = {"assigned_to": uid} if role == "content_developer" else {}
        drafted = await db.content_scripts.count_documents({**assigned_q, "status": "draft", "updated_at": {"$gte": day, "$lt": day + "T99"}})
        submitted = await db.content_scripts.count_documents({**assigned_q, "status": "pending_approval", "submitted_at": {"$gte": day, "$lt": day + "T99"}})
        posted = await db.content_scripts.count_documents({**assigned_q, "status": "posted", "posted_at": {"$gte": day, "$lt": day + "T99"}})
        in_progress = await db.content_scripts.count_documents({**assigned_q, "status": {"$in": ["draft", "in_progress"]}})
        developer_section = {
            "drafted_today": drafted,
            "submitted_today": submitted,
            "posted_today": posted,
            "in_progress": in_progress,
        }

    # Finance manager-specific section: expenses approved, payroll, fund-requests for the day.
    finance_section = {}
    if role in ("finance_manager", "admin"):
        approved_exps = await db.expenses.find({"status": "approved", "created_at": {"$gte": day, "$lt": day + "T99"}}, {"_id": 0}).to_list(500)
        pending_exps = await db.expenses.count_documents({"status": "pending"})
        approved_today_amt = sum(e.get("amount", 0) for e in approved_exps)
        fund_today = await db.fund_requests.count_documents({"created_at": {"$gte": day, "$lt": day + "T99"}})
        payroll_processed_today = await db.payroll.count_documents({"status": "processed", "processed_at": {"$gte": day, "$lt": day + "T99"}})
        finance_section = {
            "expenses_approved_today_count": len(approved_exps),
            "expenses_approved_today_amount": round(approved_today_amt, 2),
            "expenses_pending_count": pending_exps,
            "fund_requests_today": fund_today,
            "payroll_processed_today": payroll_processed_today,
        }

    # Inventory manager-specific section.
    inventory_section = {}
    if role in ("inventory_manager", "admin"):
        # Use products + orders to derive simple stock movement signal.
        delivered_today_orders = [o for o in orders if o.get("status") == "delivered"]
        units_shipped = 0
        for o in delivered_today_orders:
            for it in (o.get("items") or []):
                units_shipped += int(it.get("quantity") or 0)
        low_stock = await db.products.count_documents({"stock": {"$lt": 20}})
        inventory_section = {
            "units_shipped_today": units_shipped,
            "deliveries_today": len(delivered_today_orders),
            "low_stock_skus": low_stock,
        }

    # Telecaller / inhouse telecaller-specific section (when not admin).
    telecaller_section = {}
    if role in ("telecaller", "inhouse_telecaller"):
        my_calls = 0
        for l in leads:
            for cl in (l.get("call_logs") or []):
                if cl.get("logged_at", "")[:10] == day and cl.get("logged_by") == uid:
                    my_calls += 1
        my_calls += await db.inhouse_call_logs.count_documents({"caller_id": uid, "created_at": {"$gte": day, "$lt": day + "T99"}})
        telecaller_section = {
            "calls_today": my_calls,
            "leads_assigned": len(leads),
            "orders_booked": len(orders),
            "interested": sum(1 for l in leads if l.get("status") == "interested"),
            "follow_ups": sum(1 for l in leads if l.get("next_follow_up_date") == day),
        }

    # Agent-specific section.
    agent_section = {}
    if role == "agent":
        agent_calls = await db.agent_call_logs.count_documents({"agent_id": uid, "call_date": day})
        delivered_today = sum(1 for o in orders if o.get("status") == "delivered")
        agent_section = {
            "field_calls_today": agent_calls,
            "orders_taken": len(orders),
            "delivered_today": delivered_today,
        }

    return {
        "date": day, "manager_role": role, "manager_name": scope_user.get("name", ""),
        "leads_today": len(leads), "orders_today": len(orders),
        "delivered_today": sum(1 for o in orders if o.get("status") == "delivered"),
        "revenue_today": revenue_today,
        "cod_count": cod_count, "prepaid_count": prepaid_count,
        "status_dist": status_dist,
        "per_user": per_user,
        "leads": leads, "orders": orders,
        "hr": hr_section,
        "sales": sales_section,
        "digital": digital_section,
        "social": social_section,
        "strategist": strategist_section,
        "developer": developer_section,
        "finance": finance_section,
        "inventory": inventory_section,
        "telecaller": telecaller_section,
        "agent": agent_section,
    }


def _build_report_pdf(report: dict) -> bytes:
    """Generate a clean A4 daily report PDF."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    primary = HexColor(COMPANY.get("primary_color", "#3B5249"))
    accent = HexColor(COMPANY.get("accent_color", "#A66E4E"))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm, leftMargin=15 * mm, rightMargin=15 * mm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=primary, fontSize=20, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=primary, fontSize=12, spaceAfter=4, spaceBefore=8)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    elements = []
    elements.append(Paragraph(f"<b>Celesta Glow</b> — Daily Report", h1))
    elements.append(Paragraph(f"Date: <b>{report['date']}</b> · Scope: {report['manager_role'].replace('_',' ').title()} · {report['manager_name']}", body))
    elements.append(Spacer(1, 6))
    # KPI table
    kpi = [
        ["Leads Today", str(report["leads_today"])],
        ["Orders Today", str(report["orders_today"])],
        ["Delivered Today", str(report["delivered_today"])],
        ["Revenue (delivered)", f"Rs.{report['revenue_today']:.0f}"],
        ["COD / Prepaid", f"{report['cod_count']} / {report['prepaid_count']}"],
    ]
    t = Table(kpi, colWidths=[60 * mm, 60 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
        ("TEXTCOLOR", (0, 0), (0, -1), primary),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.6, primary),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    # Status distribution
    if report["status_dist"]:
        elements.append(Paragraph("Lead Status Distribution", h2))
        rows = [["Status", "Count"]] + [[k.replace("_", " ").title(), str(v)] for k, v in sorted(report["status_dist"].items(), key=lambda x: -x[1])]
        t = Table(rows, colWidths=[80 * mm, 40 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary),
            ("TEXTCOLOR", (0, 0), (-1, 0), "white"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(t)
    # Per-user table
    if report["per_user"]:
        elements.append(Paragraph("Per-Employee Performance", h2))
        rows = [["Employee", "Leads", "Orders", "Delivered", "Revenue"]]
        for name, m in sorted(report["per_user"].items(), key=lambda x: -x[1]["revenue"]):
            rows.append([name[:30], str(m["leads"]), str(m["orders"]), str(m["delivered"]), f"Rs.{m['revenue']:.0f}"])
        t = Table(rows, colWidths=[60 * mm, 25 * mm, 25 * mm, 25 * mm, 35 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary),
            ("TEXTCOLOR", (0, 0), (-1, 0), "white"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)
    # HR Section
    if report.get("hr"):
        hr = report["hr"]
        elements.append(Paragraph("HR Activity", h2))
        rows = [
            ["Candidates Added", str(hr.get("candidates_added", 0))],
            ["HR Calls Logged", str(hr.get("hr_calls", 0))],
            ["Hired Today", str(hr.get("hired_today", 0))],
            ["Check-ins", str(hr.get("checkins", 0))],
            ["On Leave Today", str(hr.get("on_leave", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Sales Section — for sales_manager + admin
    if report.get("sales"):
        s = report["sales"]
        elements.append(Paragraph("Sales Pipeline Activity", h2))
        rows = [
            ["Leads Taken", str(s.get("leads_taken", 0))],
            ["Telecaller Calls", str(s.get("telecaller_calls", 0))],
            ["Orders Booked", str(s.get("orders_booked", 0))],
            ["Orders Confirmed", str(s.get("orders_confirmed", 0))],
            ["Delivered", str(s.get("delivered", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Digital marketing section — for digital_marketing_manager + admin
    if report.get("digital"):
        dm = report["digital"]
        elements.append(Paragraph("Digital Marketing", h2))
        rows = [
            ["New Campaigns", str(dm.get("new_campaigns", 0))],
            ["Active Campaigns", str(dm.get("active_campaigns", 0))],
            ["Ad Spend Today", f"Rs.{dm.get('ad_spend_today', 0):.0f}"],
            ["Leads from Ads", str(dm.get("leads_from_ads", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Social media section
    if report.get("social"):
        sm = report["social"]
        elements.append(Paragraph("Social Media Activity", h2))
        rows = [
            ["Briefs Created", str(sm.get("briefs_created", 0))],
            ["Scripts Created", str(sm.get("scripts_created", 0))],
            ["Posts Published", str(sm.get("posts_published", 0))],
            ["Pending Approvals", str(sm.get("pending_approvals", 0))],
            ["New Influencers", str(sm.get("new_influencers", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Strategist section
    if report.get("strategist"):
        st = report["strategist"]
        elements.append(Paragraph("Content Strategy", h2))
        rows = [
            ["Briefs Created Today", str(st.get("briefs_created", 0))],
            ["Active Pillars", str(st.get("active_pillars", 0))],
            ["Scripts Created Today", str(st.get("scripts_created", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Developer section
    if report.get("developer"):
        dv = report["developer"]
        elements.append(Paragraph("Content Development", h2))
        rows = [
            ["Drafted Today", str(dv.get("drafted_today", 0))],
            ["Submitted Today", str(dv.get("submitted_today", 0))],
            ["Posted Today", str(dv.get("posted_today", 0))],
            ["In Progress", str(dv.get("in_progress", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Finance section
    if report.get("finance"):
        fn = report["finance"]
        elements.append(Paragraph("Finance Activity", h2))
        rows = [
            ["Expenses Approved Today", str(fn.get("expenses_approved_today_count", 0))],
            ["Amount Approved", f"Rs.{fn.get('expenses_approved_today_amount', 0):.0f}"],
            ["Expenses Pending Review", str(fn.get("expenses_pending_count", 0))],
            ["Fund Requests Today", str(fn.get("fund_requests_today", 0))],
            ["Payroll Processed Today", str(fn.get("payroll_processed_today", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Inventory section
    if report.get("inventory"):
        iv = report["inventory"]
        elements.append(Paragraph("Inventory", h2))
        rows = [
            ["Units Shipped Today", str(iv.get("units_shipped_today", 0))],
            ["Deliveries Today", str(iv.get("deliveries_today", 0))],
            ["Low-Stock SKUs (<20)", str(iv.get("low_stock_skus", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Telecaller / Inhouse-telecaller section
    if report.get("telecaller"):
        tc = report["telecaller"]
        elements.append(Paragraph("My Call Performance", h2))
        rows = [
            ["Calls Today", str(tc.get("calls_today", 0))],
            ["Leads Assigned", str(tc.get("leads_assigned", 0))],
            ["Orders Booked", str(tc.get("orders_booked", 0))],
            ["Interested", str(tc.get("interested", 0))],
            ["Follow-ups Due Today", str(tc.get("follow_ups", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    # Agent section
    if report.get("agent"):
        ag = report["agent"]
        elements.append(Paragraph("Field Agent Activity", h2))
        rows = [
            ["Field Calls Today", str(ag.get("field_calls_today", 0))],
            ["Orders Taken", str(ag.get("orders_taken", 0))],
            ["Delivered Today", str(ag.get("delivered_today", 0))],
        ]
        t = Table(rows, colWidths=[60 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(f"<font color='#A66E4E'>Generated by Celesta Glow CRM · {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}</font>", body))
    doc.build(elements)
    buf.seek(0)
    return buf.read()


@router.get("/reports/daily.pdf")
async def my_daily_report(d: Optional[str] = None, current_user: dict = Depends(_auth)):
    try:
        target = date.fromisoformat(d) if d else date.today()
    except Exception:
        target = date.today()
    try:
        report = await _daily_report_data(current_user, target)
    except Exception as e:
        logger.exception(f"daily report data failed: {e}")
        # Fallback to a minimal report so PDF can still generate
        report = {
            "date": target.isoformat(), "manager_role": current_user.get("role", ""),
            "manager_name": current_user.get("name", ""),
            "leads_today": 0, "orders_today": 0, "delivered_today": 0, "revenue_today": 0,
            "cod_count": 0, "prepaid_count": 0, "status_dist": {}, "per_user": {},
            "leads": [], "orders": [],
            "hr": {}, "sales": {}, "digital": {}, "social": {}, "strategist": {},
            "developer": {}, "finance": {}, "inventory": {}, "telecaller": {}, "agent": {},
            "_error": str(e),
        }
    try:
        pdf = _build_report_pdf(report)
    except Exception as e:
        logger.exception(f"daily report PDF build failed: {e}")
        raise HTTPException(status_code=500, detail=f"Daily report could not be generated: {e}")
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="daily-{target.isoformat()}.pdf"'})


@router.get("/reports/employee/{uid}.pdf")
async def employee_report_pdf(uid: str, days: int = 30, current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "hr_manager", "sales_manager", "district_manager"):
        raise HTTPException(status_code=403)
    snap = await _employee_360(uid, days)
    # Build PDF
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    primary = HexColor(COMPANY.get("primary_color", "#3B5249"))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm, leftMargin=15 * mm, rightMargin=15 * mm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=primary, fontSize=18, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=primary, fontSize=12, spaceAfter=4, spaceBefore=8)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    u = snap["user"]; k = snap["kpis"]; a = snap["attendance"]
    elements = [
        Paragraph(f"<b>{u.get('name','—')}</b>", h1),
        Paragraph(f"Role: {u.get('role','').replace('_',' ').title()} · Phone: {u.get('phone','—')} · Joined: {u.get('joining_date') or u.get('created_at','')[:10]}", body),
        Paragraph(f"<b>Report period:</b> last {days} days · Generated {datetime.now(timezone.utc).strftime('%d %b %Y')}", body),
        Spacer(1, 6),
        Paragraph("Performance KPIs", h2),
        Table([
            ["Leads", k["leads"], "Calls", k["calls"]],
            ["Orders", k["orders"], "Delivered", k["delivered"]],
            ["Conversion", f"{k['conversion']}%", "Revenue", f"Rs.{int(k['revenue'])}"],
            ["Commission (total)", f"Rs.{int(k['commission_total'])}", "Commission Paid", f"Rs.{int(k['commission_paid'])}"],
        ], colWidths=[40 * mm, 30 * mm, 40 * mm, 30 * mm]),
        Spacer(1, 4),
        Paragraph("Attendance", h2),
        Table([
            ["Days Present", a["days_present"], "On-time Days", a["on_time_days"]],
            ["Total Late (hrs)", a["late_hours_total"], "Half-Days", a["half_days"]],
        ], colWidths=[40 * mm, 30 * mm, 40 * mm, 30 * mm]),
    ]
    style = TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), HexColor("#F9F8F6")),
        ("BACKGROUND", (2, 0), (2, -1), HexColor("#F9F8F6")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOX", (0, 0), (-1, -1), 0.5, primary),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
        ("PADDING", (0, 0), (-1, -1), 5),
    ])
    elements[5].setStyle(style); elements[8].setStyle(style)
    if snap.get("leaves"):
        elements.append(Paragraph("Leaves (last 24)", h2))
        rows = [["Type", "From", "To", "Days", "Status"]]
        for lv in snap["leaves"][:24]:
            rows.append([lv.get("leave_type", "—"), lv.get("start_date", "—"), lv.get("end_date", "—"), str(lv.get("days", "—")), lv.get("status", "—")])
        t = Table(rows, colWidths=[30 * mm, 30 * mm, 30 * mm, 20 * mm, 30 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary),
            ("TEXTCOLOR", (0, 0), (-1, 0), "white"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BOX", (0, 0), (-1, -1), 0.4, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)
    if snap.get("advances"):
        elements.append(Paragraph("Advances", h2))
        rows = [["Date", "Amount", "Status", "Reason"]]
        for adv in snap["advances"][:20]:
            rows.append([(adv.get("created_at") or "")[:10], f"Rs.{adv.get('amount', 0)}", adv.get("status", "—"), (adv.get("reason") or "")[:40]])
        t = Table(rows, colWidths=[30 * mm, 30 * mm, 30 * mm, 60 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary),
            ("TEXTCOLOR", (0, 0), (-1, 0), "white"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BOX", (0, 0), (-1, -1), 0.4, primary),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, HexColor("#E5E3DB")),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)
    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="employee-{uid}-{days}d.pdf"'})


# ========================================================================
# Email helpers
# ========================================================================
def _send_email_with_attachment(to_email: str, subject: str, html: str, pdf_bytes: bytes, filename: str) -> tuple[bool, str]:
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        return False, "SMTP not configured"
    try:
        msg = MIMEMultipart()
        msg["Subject"] = subject
        msg["From"] = f"Celesta Glow <{SMTP_EMAIL}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))
        att = MIMEApplication(pdf_bytes, _subtype="pdf")
        att.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(att)
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as s:
                s.login(SMTP_EMAIL, SMTP_PASSWORD)
                s.sendmail(SMTP_EMAIL, [to_email], msg.as_string())
        except Exception:
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as s:
                s.ehlo(); s.starttls(); s.ehlo()
                s.login(SMTP_EMAIL, SMTP_PASSWORD)
                s.sendmail(SMTP_EMAIL, [to_email], msg.as_string())
        return True, ""
    except Exception as e:
        logger.error(f"email send: {e}")
        return False, str(e)


@router.post("/reports/daily/send")
async def email_daily_report(data: Optional[dict] = None, current_user: dict = Depends(_auth)):
    """Email today's daily report to specified address (defaults to DAILY_REPORT_RECIPIENT)."""
    data = data or {}
    target_email = data.get("email") or DAILY_REPORT_RECIPIENT
    d = data.get("date")
    try:
        target = date.fromisoformat(d) if d else date.today()
    except Exception:
        target = date.today()
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise HTTPException(status_code=400, detail="Email server not configured. Please set SMTP_EMAIL and SMTP_PASSWORD on the backend, or use 'Download PDF' instead.")
    try:
        report = await _daily_report_data(current_user, target)
        pdf = _build_report_pdf(report)
    except Exception as e:
        logger.exception(f"daily report email/build failed: {e}")
        raise HTTPException(status_code=500, detail=f"Daily report could not be generated: {e}")
    html = (
        f"<p>Hi,</p>"
        f"<p>Daily report for <b>{target.isoformat()}</b> (scope: {current_user['role']}) is attached.</p>"
        f"<ul>"
        f"<li>Leads: {report['leads_today']}</li>"
        f"<li>Orders: {report['orders_today']}</li>"
        f"<li>Delivered: {report['delivered_today']}</li>"
        f"<li>Revenue: Rs.{report['revenue_today']:.0f}</li>"
        f"</ul>"
        f"<p>— Celesta Glow CRM</p>"
    )
    ok, err = await asyncio.to_thread(_send_email_with_attachment, target_email,
        f"Celesta Glow Daily Report — {target.isoformat()}", html, pdf, f"daily-{target.isoformat()}.pdf")
    if not ok:
        raise HTTPException(status_code=502, detail=f"Email failed: {err}")
    return {"message": f"Sent to {target_email}", "to": target_email}


# ========================================================================
# Phase 2 — Delhivery auto-sync engine
# ========================================================================
DELHIVERY_STATUS_MAP = {
    "delivered": "delivered",
    "rto": "not_delivered",
    "returned": "not_delivered",
    "undelivered": "not_delivered",
    "lost": "not_delivered",
    "damaged": "not_delivered",
    "cancelled": "cancelled",
    "in transit": "shipped",
    "manifested": "shipped",
    "pickup pending": "shipped",
    "dispatched": "shipped",
}

async def _credit_commission_for(order: dict, current_user_id: str = "system"):
    """Mirror of server.py deliver_order commission logic — used by auto-sync."""
    cr = order.get("created_by_role", "")
    rates = COMMISSION_RATES.copy()
    cfg = await db.app_config.find_one({"key": "commission_rates"}, {"_id": 0})
    if cfg and cfg.get("rates"): rates.update(cfg["rates"])
    pct = rates.get(cr, 0)
    amt = round((order.get("total_amount", 0)) * pct / 100, 2)
    now = datetime.now(timezone.utc).isoformat()
    if amt > 0:
        comm = {
            "id": f"comm-{uuid.uuid4().hex[:8]}", "user_id": order.get("created_by", ""),
            "user_role": cr, "user_name": order.get("created_by_name", ""),
            "order_id": order["id"], "order_amount": order.get("total_amount", 0),
            "commission_percentage": pct, "commission_amount": amt,
            "status": "pending", "created_at": now, "paid_at": None, "paid_via": None,
            "notes": "Auto-credited from Delhivery delivery confirmation"
        }
        await db.commissions.insert_one(comm)
        coll_map = {"telecaller": "telecallers", "agent": "agents",
                    "district_manager": "managers", "sales_manager": "sales_managers"}
        if cr in coll_map:
            await db[coll_map[cr]].update_one({"id": order.get("created_by", "")}, {"$inc": {"commission_earned": amt}})
    if cr == "telecaller":
        await db.telecallers.update_one({"id": order.get("created_by", "")},
            {"$inc": {"conversions": 1, "total_sales": order.get("total_amount", 0)}})
    elif cr == "agent":
        await db.agents.update_one({"id": order.get("created_by", "")},
            {"$inc": {"total_sales": order.get("total_amount", 0)}})


async def delhivery_sync_once():
    """Poll Delhivery for every shipped order with AWB; update status if changed."""
    if not DELHIVERY_API_KEY:
        return {"synced": 0, "skipped": "no_api_key"}
    orders = await db.orders.find({"awb_number": {"$nin": [None, ""]}, "status": {"$in": ["shipped", "confirmed"]}}, {"_id": 0}).to_list(500)
    synced = 0; updated = 0; errors = 0
    for o in orders:
        awb = o.get("awb_number") or ""
        if not awb: continue
        try:
            r = requests.get(f"{DELHIVERY_BASE_URL}/api/v1/packages/json/",
                headers={"Authorization": f"Token {DELHIVERY_API_KEY}"},
                params={"waybill": awb}, timeout=15)
            if r.status_code != 200:
                errors += 1; continue
            data = r.json()
            shipments = data.get("ShipmentData") or []
            if not shipments: continue
            shipment = shipments[0].get("Shipment", {}) or {}
            status_text = (shipment.get("Status", {}).get("Status") or "").lower().strip()
            mapped = None
            for keyword, target in DELHIVERY_STATUS_MAP.items():
                if keyword in status_text:
                    mapped = target; break
            if not mapped: continue
            if mapped != o.get("status"):
                now = datetime.now(timezone.utc).isoformat()
                upd = {"status": mapped, "updated_at": now, "delhivery_status": status_text, "delhivery_synced_at": now}
                if mapped == "delivered" and not o.get("delivered_at"):
                    upd["delivered_at"] = now
                    upd["delivered_by"] = "delhivery_auto"
                    upd["delivered_by_name"] = "Delhivery Auto-Sync"
                await db.orders.update_one({"id": o["id"]}, {"$set": upd})
                if mapped == "delivered":
                    # Credit commission once
                    existing = await db.commissions.find_one({"order_id": o["id"]})
                    if not existing:
                        await _credit_commission_for(o)
                    if o.get("lead_id"):
                        today = date.today()
                        items = o.get("items") or []
                        last_products = ", ".join([(it.get("product_name") or "").strip() for it in items if it.get("product_name")])
                        await db.leads.update_one({"id": o["lead_id"]}, {"$set": {
                            "status": "delivered",
                            "last_order_id": o["id"],
                            "last_order_amount": o.get("total_amount", 0),
                            "last_order_products": last_products,
                            "last_order_date": today.isoformat(),
                            "next_relationship_date": (today + timedelta(days=15)).isoformat(),
                            "next_repeat_order_date": (today + timedelta(days=35)).isoformat(),
                            "updated_at": now,
                        }})
                updated += 1
            synced += 1
        except Exception as e:
            errors += 1
            logger.warning(f"delhivery_sync {awb}: {e}")
    await db.app_config.update_one({"key": "delhivery_last_sync"},
        {"$set": {"key": "delhivery_last_sync", "at": datetime.now(timezone.utc).isoformat(),
                  "synced": synced, "updated": updated, "errors": errors}}, upsert=True)
    return {"synced": synced, "updated": updated, "errors": errors}


@router.post("/admin/delhivery/sync-now")
async def manual_delhivery_sync(current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "inventory_manager"):
        raise HTTPException(status_code=403)
    res = await delhivery_sync_once()
    return res


@router.get("/admin/delhivery/sync-status")
async def delhivery_sync_status(current_user: dict = Depends(_auth)):
    if current_user["role"] not in ("admin", "inventory_manager"):
        raise HTTPException(status_code=403)
    doc = await db.app_config.find_one({"key": "delhivery_last_sync"}, {"_id": 0})
    return {"status": doc or {}, "api_key_set": bool(DELHIVERY_API_KEY)}


# ========================================================================
# Background scheduler — runs on startup
# ========================================================================
_scheduler_started = False

async def _scheduler_loop():
    """Runs Delhivery sync every 5 min + daily auto-email at 9 PM IST."""
    last_daily_email = ""
    while True:
        try:
            # Delhivery sync
            if DELHIVERY_API_KEY:
                await delhivery_sync_once()
            # Daily email at 9 PM IST (= 15:30 UTC)
            now_utc = datetime.now(timezone.utc)
            today_str = now_utc.date().isoformat()
            if now_utc.hour == 15 and now_utc.minute >= 30 and last_daily_email != today_str:
                # Email admin
                admin = await db.admins.find_one({}, {"_id": 0, "password_hash": 0})
                if admin and SMTP_EMAIL and SMTP_PASSWORD:
                    admin["role"] = "admin"
                    target = date.today()
                    report = await _daily_report_data(admin, target)
                    pdf = _build_report_pdf(report)
                    html = (
                        f"<p>Hi,</p><p>Auto-generated daily report for <b>{target.isoformat()}</b>.</p>"
                        f"<ul><li>Leads: {report['leads_today']}</li>"
                        f"<li>Orders: {report['orders_today']}</li>"
                        f"<li>Delivered: {report['delivered_today']}</li>"
                        f"<li>Revenue: Rs.{report['revenue_today']:.0f}</li></ul>"
                        f"<p>— Celesta Glow CRM</p>"
                    )
                    await asyncio.to_thread(_send_email_with_attachment, DAILY_REPORT_RECIPIENT,
                        f"Celesta Glow Daily Report — {target.isoformat()}", html, pdf,
                        f"daily-{target.isoformat()}.pdf")
                last_daily_email = today_str
        except Exception as e:
            logger.error(f"scheduler_loop: {e}")
        await asyncio.sleep(300)  # 5 min


def start_scheduler():
    global _scheduler_started
    if _scheduler_started: return
    _scheduler_started = True
    asyncio.create_task(_scheduler_loop())
    logger.info(f"Scheduler started (Delhivery={'ON' if DELHIVERY_API_KEY else 'OFF — no API key'}, daily_report_to={DAILY_REPORT_RECIPIENT})")
