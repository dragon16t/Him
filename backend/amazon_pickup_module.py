"""
Amazon India Bulk Pickup Sheet Exporter for Celesta Glow CRM.

Generates an .xlsx file matching Amazon's official "IN Schedule Pickup V2"
template so the Inventory Manager can bulk-schedule pickups for CRM orders
without any manual data entry.

Fields auto-filled:
  • Weight: 0.25 KG (250g) — configurable
  • Dimensions: 9 x 6 x 3 cm (L x W x H) — configurable
  • Product Value: order.total_amount (already includes GST — per user spec)
  • CGST / SGST / IGST: 0 (price is GST-inclusive)
  • CollectOnDelivery: Y for COD orders, N for prepaid/UPI/Razorpay
  • Product Type: Beauty Product (Celesta Glow catalog)
  • Currency: INR, Business: B2C, Shipping: STANDARD
  • Pickup Date: user-selected (or same-day if not passed)
  • Pickup Time: 11:00 - 14:00 (default slot)

Ship From / Return To addresses come from `company_settings` if configured,
otherwise left BLANK so the seller's default Shipper Central address is used.
"""
import os
import io
import re
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Optional, Dict, Any, List
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from fastapi import Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

logger = logging.getLogger("amazon_pickup")

_db = None

# Exact column order from IN Schedule Pickup V2 sheet (44 data columns)
COLUMNS: List[str] = [
    "Client Reference ID",
    "Ship To: Recipient Name",
    "Ship To: Address Line 1",
    "Ship To: Address Line 2",
    "Ship To: Address Landmark",
    "Ship To: City/Town",
    "Ship To: State",
    "Ship To: Postal Code",
    "Ship To: Email Address",
    "Ship To: Phone Number",
    "Product Description",
    "Product Type",
    "Length (in cm)",
    "Width (in cm)",
    "Height (in cm)",
    "Gross Weight (in KG)",
    "Invoice Number",
    "Invoice Date",
    "Product Value",
    "CGST Value",
    "SGST Value",
    "IGST Value",
    "CollectOnDelivery",
    "Shipping Service",
    "Pickup Date",
    "Pickup Time",
    "Desired delivery date",
    "Shipper Name",
    "Ship From: Address Line 1",
    "Ship From: Address Line 2",
    "Ship From: Address Line 3",
    "Ship From: City/Town",
    "Ship From: State/Region",
    "Ship From: Postal code",
    "Ship From: Email Address",
    "Ship From: Phone Number",
    "Return To: Address Line 1",
    "Return To: Address Line 2",
    "Return To: Address Line 3",
    "Return To: City/Town",
    "Return To: State/Region",
    "Return To: Postal code",
    "Return To: Email Address",
    "Return To: Phone Number",
]

# Valid Amazon Indian state names (normalized upper-case).
_AMAZON_STATES = {
    "ANDAMAN & NICOBAR ISLANDS", "ANDHRA PRADESH", "ARUNACHAL PRADESH", "ASSAM",
    "BIHAR", "CHANDIGARH", "CHHATTISGARH", "DADRA & NAGAR HAVELI", "DAMAN & DIU",
    "DELHI", "GOA", "GUJARAT", "HARYANA", "HIMACHAL PRADESH", "JAMMU & KASHMIR",
    "JHARKHAND", "KARNATAKA", "KERALA", "LADAKH", "LAKSHADWEEP", "MADHYA PRADESH",
    "MAHARASHTRA", "MANIPUR", "MEGHALAYA", "MIZORAM", "NAGALAND", "ODISHA",
    "PUDUCHERRY", "PUNJAB", "RAJASTHAN", "SIKKIM", "TAMIL NADU", "TELANGANA",
    "TRIPURA", "UTTAR PRADESH", "UTTARAKHAND", "WEST BENGAL",
}


def _norm_state(s: str) -> str:
    """Normalize a state name to Amazon's uppercase format. Falls back to given text."""
    if not s:
        return ""
    up = re.sub(r"\s+", " ", s.strip()).upper()
    up = up.replace(" AND ", " & ")
    if up in _AMAZON_STATES:
        return up
    # Common short forms
    aliases = {
        "TN": "TAMIL NADU", "KL": "KERALA", "KA": "KARNATAKA",
        "MH": "MAHARASHTRA", "DL": "DELHI", "UP": "UTTAR PRADESH",
        "AP": "ANDHRA PRADESH", "TS": "TELANGANA", "WB": "WEST BENGAL",
        "GJ": "GUJARAT", "RJ": "RAJASTHAN", "MP": "MADHYA PRADESH",
        "PB": "PUNJAB", "HR": "HARYANA", "BR": "BIHAR", "OR": "ODISHA",
    }
    return aliases.get(up, up)


def _clean_phone(p: str) -> str:
    """Strip prefixes (+91, 0) and non-digits to get a bare 10-digit number."""
    if not p:
        return ""
    digits = re.sub(r"\D+", "", str(p))
    if len(digits) > 10 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits[-10:] if len(digits) >= 10 else digits


def _split_address(full: str, city: str) -> tuple:
    """Split a free-form address string into line1/line2 (max 60 chars each).
    Amazon rejects lines > 60 chars, so we truncate cleanly on word boundaries."""
    if not full:
        return "", ""
    txt = re.sub(r"\s+", " ", str(full)).strip()
    # remove trailing ", city" if the city name is present at the end
    if city and txt.lower().rstrip(",. ").endswith(city.lower()):
        txt = txt[: -len(city)].rstrip(",. ")
    if len(txt) <= 60:
        return txt, ""
    # try to split at a comma near the middle
    parts = [p.strip() for p in txt.split(",")]
    line1, line2 = "", ""
    for p in parts:
        if len(line1) + len(p) + 2 <= 60 and not line2:
            line1 = (line1 + ", " + p).strip(", ") if line1 else p
        else:
            candidate = (line2 + ", " + p).strip(", ") if line2 else p
            if len(candidate) <= 60:
                line2 = candidate
            # otherwise drop the overflow silently
    if not line1:
        line1 = txt[:60]
        line2 = txt[60:120]
    return line1[:60], line2[:60]


def _product_description(items: List[Dict[str, Any]], max_len: int = 100) -> str:
    """Build a short description from item names for the Product Description column."""
    if not items:
        return "Beauty Product"
    names = []
    for it in items:
        if not isinstance(it, dict):
            continue
        nm = str(it.get("product_name") or it.get("name") or "").strip()
        qty = it.get("quantity", 1)
        if nm:
            names.append(f"{nm} x{qty}" if qty and qty != 1 else nm)
    joined = ", ".join(names) if names else "Beauty Product"
    return joined[:max_len]


def _fmt_date_ddmmyyyy(iso_str: str) -> str:
    """Convert an ISO timestamp to DD-MM-YYYY (Amazon's required format)."""
    if not iso_str:
        return date.today().strftime("%d-%m-%Y")
    try:
        s = iso_str.replace("Z", "+00:00") if isinstance(iso_str, str) else str(iso_str)
        dt = datetime.fromisoformat(s)
        return dt.strftime("%d-%m-%Y")
    except Exception:
        return date.today().strftime("%d-%m-%Y")


async def _build_row(order: Dict[str, Any], pickup_date_ddmmyyyy: str,
                     pickup_time: str, weight_kg: float,
                     length_cm: float, width_cm: float, height_cm: float,
                     ship_from: Dict[str, str]) -> List[Any]:
    """Map a CRM order dict → 44 Amazon columns."""
    items = order.get("items") or []
    total = float(order.get("total_amount") or 0)
    is_cod = (order.get("payment_type") or "cod").lower() == "cod"

    address_line_1, address_line_2 = _split_address(
        order.get("customer_address") or "",
        order.get("customer_city") or ""
    )
    landmark = str(order.get("customer_landmark") or "")[:50]
    state = _norm_state(order.get("customer_state") or "KERALA")
    city = str(order.get("customer_city") or "")[:50]
    pincode = re.sub(r"\D", "", str(order.get("customer_pincode") or ""))[:6]
    phone = _clean_phone(order.get("customer_phone") or "")
    email = str(order.get("customer_email") or "").strip()[:255]
    name = str(order.get("customer_name") or "Customer").strip()[:50]

    invoice_no = str(order.get("id") or "").replace("ORD-", "INV-")[:20]
    invoice_date = _fmt_date_ddmmyyyy(order.get("created_at") or "")

    row = [
        (order.get("id") or "")[:20],   # A Client Reference ID
        name,                           # B Recipient Name
        address_line_1,                 # C Address Line 1
        address_line_2,                 # D Address Line 2
        landmark,                       # E Landmark
        city,                           # F City/Town
        state,                          # G State
        pincode,                        # H Postal Code
        email,                          # I Email
        phone,                          # J Phone (10 digits)
        _product_description(items),    # K Product Description
        "Beauty Product",               # L Product Type
        length_cm,                      # M Length
        width_cm,                       # N Width
        height_cm,                      # O Height
        round(weight_kg, 2),            # P Gross Weight (KG)
        invoice_no,                     # Q Invoice Number
        invoice_date,                   # R Invoice Date
        round(total, 2),                # S Product Value (GST-inclusive per user spec)
        0,                              # T CGST Value (already included in Product Value)
        0,                              # U SGST Value
        0,                              # V IGST Value
        "YES" if is_cod else "NO",      # W CollectOnDelivery (per Amazon spec: YES/NO)
        "STANDARD",                     # X Shipping Service
        pickup_date_ddmmyyyy,           # Y Pickup Date
        pickup_time,                    # Z Pickup Time
        "",                             # AA Desired delivery date (optional)
        ship_from.get("shipper_name", ""),  # AB Shipper Name
        ship_from.get("addr1", ""),     # AC Ship From Line 1
        ship_from.get("addr2", ""),     # AD Line 2
        ship_from.get("addr3", ""),     # AE Line 3
        ship_from.get("city", ""),      # AF City
        ship_from.get("state", ""),     # AG State
        ship_from.get("pincode", ""),   # AH Postal
        ship_from.get("email", ""),     # AI Email
        ship_from.get("phone", ""),     # AJ Phone
        ship_from.get("addr1", ""),     # AK Return line 1 (same as Ship From by default)
        ship_from.get("addr2", ""),     # AL
        ship_from.get("addr3", ""),     # AM
        ship_from.get("city", ""),      # AN
        ship_from.get("state", ""),     # AO
        ship_from.get("pincode", ""),   # AP
        ship_from.get("email", ""),     # AQ
        ship_from.get("phone", ""),     # AR
    ]
    return row


async def _load_ship_from() -> Dict[str, str]:
    """Load seller's Ship From / warehouse address from company_settings."""
    if _db is None:
        return {}
    try:
        cfg = await _db.company_settings.find_one({}, {"_id": 0}) or {}
    except Exception:
        cfg = {}
    return {
        "shipper_name": cfg.get("shipper_name") or cfg.get("company_name") or "Celesta Glow",
        "addr1": cfg.get("warehouse_address_line1") or "",
        "addr2": cfg.get("warehouse_address_line2") or "",
        "addr3": "",
        "city": cfg.get("warehouse_city") or "",
        "state": _norm_state(cfg.get("warehouse_state") or ""),
        "pincode": re.sub(r"\D", "", str(cfg.get("warehouse_pincode") or ""))[:6],
        "email": cfg.get("warehouse_email") or cfg.get("company_email") or "",
        "phone": _clean_phone(cfg.get("warehouse_phone") or cfg.get("company_phone") or ""),
    }


def _make_workbook(rows: List[List[Any]]) -> bytes:
    """Produce the Amazon-compatible workbook as bytes."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "IN Schedule Pickup V2"

    # Header row (bold, dark green background matching Celesta brand)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="3B5249", end_color="3B5249", fill_type="solid")
    for col_idx, header in enumerate(COLUMNS, start=1):
        c = ws.cell(row=1, column=col_idx, value=header)
        c.font = header_font
        c.fill = header_fill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "A2"

    for r_idx, row in enumerate(rows, start=2):
        for c_idx, val in enumerate(row, start=1):
            ws.cell(row=r_idx, column=c_idx, value=val)

    # Auto-ish widths
    widths = [16, 22, 40, 40, 24, 18, 18, 12, 24, 14, 40, 20, 10, 10, 10, 12, 16, 12, 12, 10, 10, 10, 8, 14, 12, 14, 14, 22, 30, 30, 30, 18, 18, 12, 24, 14, 30, 30, 30, 18, 18, 12, 24, 14]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    # Optional second sheet with instructions
    ws2 = wb.create_sheet("Notes")
    ws2["A1"] = "Amazon India Schedule Pickup — generated by Celesta Glow CRM"
    ws2["A1"].font = Font(bold=True, size=13)
    lines = [
        "",
        "This file matches Amazon's official IN Schedule Pickup V2 template (44 columns).",
        "Every row is prefilled from your CRM orders — you can review + edit before upload.",
        "",
        "Fields prefilled automatically:",
        "  • Weight: 0.25 KG (250 g)",
        "  • Dimensions: 9 x 6 x 3 cm (Length x Width x Height)",
        "  • Product Value = order total (GST-inclusive; CGST/SGST/IGST kept 0 to avoid double-tax)",
        "  • CollectOnDelivery: Y for COD, N for prepaid / UPI / Razorpay-paid orders",
        "  • Product Type: Beauty Product",
        "  • Shipping Service: STANDARD",
        "",
        "Before uploading to Amazon, verify:",
        "  1. Pickup Date is a working day.",
        "  2. Pickup Time slot matches your Amazon pickup window.",
        "  3. Ship From & Return To addresses are correct (edit if warehouse changes).",
    ]
    for i, line in enumerate(lines, start=2):
        ws2.cell(row=i, column=1, value=line)
    ws2.column_dimensions["A"].width = 100

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def register(api_router, database, get_current_user):
    """Mount /inventory/amazon-pickup/preview + /export routes."""
    global _db
    _db = database

    def _im_or_admin(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role")
        if role not in ("inventory_manager", "admin"):
            raise HTTPException(status_code=403, detail="Inventory Manager or Admin only")
        return current_user

    async def _find_orders(order_date: Optional[str], payment_type: str, statuses: List[str]) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {}
        if order_date:
            try:
                d0 = datetime.fromisoformat(order_date).replace(hour=0, minute=0, second=0, tzinfo=timezone.utc)
                d1 = d0 + timedelta(days=1)
                q["created_at"] = {"$gte": d0.isoformat(), "$lt": d1.isoformat()}
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid date; use YYYY-MM-DD")
        if payment_type != "all":
            if payment_type == "cod":
                q["payment_type"] = {"$in": ["cod", "COD"]}
            elif payment_type == "prepaid":
                q["payment_type"] = {"$nin": ["cod", "COD"]}
        if statuses:
            q["status"] = {"$in": statuses}
        cur = _db.orders.find(q, {"_id": 0}).sort("created_at", 1).limit(5000)
        return await cur.to_list(5000)

    @api_router.get("/inventory/amazon-pickup/preview")
    async def amazon_preview(
        order_date: Optional[str] = Query(None, description="YYYY-MM-DD, filter orders created that day"),
        payment_type: str = Query("all", description="all | cod | prepaid"),
        status: str = Query("all", description="all | pending | confirmed | shipped ..."),
        current_user: dict = Depends(_im_or_admin),
    ):
        statuses: List[str] = []
        if status != "all":
            statuses = [s.strip() for s in status.split(",") if s.strip()]
        orders = await _find_orders(order_date, payment_type, statuses)
        return {
            "count": len(orders),
            "order_date": order_date,
            "payment_type": payment_type,
            "status": status,
            "sample": [
                {
                    "id": o.get("id"),
                    "customer_name": o.get("customer_name"),
                    "customer_phone": o.get("customer_phone"),
                    "customer_city": o.get("customer_city"),
                    "customer_state": o.get("customer_state"),
                    "total_amount": o.get("total_amount"),
                    "payment_type": o.get("payment_type"),
                    "status": o.get("status"),
                    "created_at": o.get("created_at"),
                }
                for o in orders[:20]
            ],
        }

    @api_router.get("/inventory/amazon-pickup/export")
    async def amazon_export(
        order_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
        payment_type: str = Query("all"),
        status: str = Query("all"),
        pickup_date: Optional[str] = Query(None, description="DD-MM-YYYY (defaults to tomorrow)"),
        pickup_time: str = Query("11:00", description="HH:MM (Amazon spec)"),
        weight_kg: float = Query(0.25, ge=0.01, le=18),
        length_cm: float = Query(9, gt=0, le=70),
        width_cm: float = Query(6, gt=0, le=70),
        height_cm: float = Query(3, gt=0, le=45),
        current_user: dict = Depends(_im_or_admin),
    ):
        statuses: List[str] = []
        if status != "all":
            statuses = [s.strip() for s in status.split(",") if s.strip()]
        orders = await _find_orders(order_date, payment_type, statuses)
        if not orders:
            raise HTTPException(status_code=404, detail="No orders match this filter")

        if not pickup_date:
            pickup_date = (date.today() + timedelta(days=1)).strftime("%d-%m-%Y")

        ship_from = await _load_ship_from()

        rows = []
        over_cap = []  # orders that exceed Amazon's ₹50000 (Product+GST) limit
        for o in orders:
            total = float(o.get("total_amount") or 0)
            if total > 50000:
                over_cap.append(o.get("id"))
            rows.append(await _build_row(
                o, pickup_date, pickup_time,
                weight_kg, length_cm, width_cm, height_cm,
                ship_from,
            ))

        payload = _make_workbook(rows)
        fname = f"Amazon_Pickup_{order_date or 'all'}_{payment_type}.xlsx"
        headers = {
            "Content-Disposition": f'attachment; filename="{fname}"',
            "X-Row-Count": str(len(rows)),
        }
        if over_cap:
            headers["X-Over-Cap-Count"] = str(len(over_cap))
            headers["X-Over-Cap-Ids"] = ",".join(over_cap[:10])
        return StreamingResponse(
            io.BytesIO(payload),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers,
        )

    logger.info("Amazon pickup export routes registered")
