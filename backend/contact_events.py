"""
contact_events.py — Track every call + WhatsApp message initiated by a
Telecaller against a customer (lead). Managers + Admin can see per-TC totals,
per-customer breakdown, and date-wise reports (JSON + PDF).

Model:
    contact_events: {
        id, tc_id, tc_name, sm_id, sm_name,
        lead_id, customer_name, customer_phone, phone_norm,
        type: "call" | "whatsapp",
        outcome (optional): "connected" | "no_answer" | ...
        message (optional): sent WhatsApp text
        remarks (optional),
        created_at
    }

Endpoints:
    POST /api/contact-events                — log a new call/WA event
    GET  /api/contact-events                — filter by tc_id / sm_id / range / type
    GET  /api/contact-events/summary        — per-TC counts + top customers
    GET  /api/contact-events/report/pdf     — date-wise PDF report

Visibility:
    - Log: anyone can log (telecaller for themselves, or manager/admin
      creating a follow-up entry)
    - Read: admin / sales_manager / district_manager / assistant_* / inventory_manager
    - Read (self): telecaller can see their own events
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone, timedelta
from typing import Optional
import io
import re
import uuid


def _norm_phone(s):
    if not s:
        return ""
    n = re.sub(r"\D", "", str(s))
    if len(n) > 10 and n.startswith("91"):
        n = n[-10:]
    return n


def register_contact_events(api_router: APIRouter, db, get_current_user):

    MANAGER_ROLES = ("admin", "sales_manager", "assistant_sales_manager",
                     "district_manager", "assistant_district_manager",
                     "inventory_manager")

    async def _scope_query(current_user, base):
        """Restrict a query so telecallers only see their own events."""
        role = current_user["role"]
        if role in MANAGER_ROLES:
            return base
        if role == "sales_manager":
            # (fallthrough — already in MANAGER_ROLES, kept for clarity)
            return base
        # Non-manager: limit to own events
        base = dict(base)
        base["tc_id"] = current_user["id"]
        return base

    @api_router.post("/contact-events")
    async def log_event(data: dict, current_user: dict = Depends(get_current_user)):
        etype = (data.get("type") or "").lower()
        if etype not in ("call", "whatsapp"):
            raise HTTPException(400, "type must be 'call' or 'whatsapp'")
        phone = (data.get("customer_phone") or "").strip()
        lead_id = data.get("lead_id") or ""
        if not phone and not lead_id:
            raise HTTPException(400, "customer_phone or lead_id required")

        # Auto-fill lead + customer info if lead_id given
        lead_doc = None
        if lead_id:
            lead_doc = await db.leads.find_one({"id": lead_id}, {"_id": 0})
            if lead_doc and not phone:
                phone = lead_doc.get("phone_number") or ""

        # Determine tc + sm ownership
        tc_id = data.get("tc_id") or current_user["id"]
        tc_name = data.get("tc_name") or current_user.get("name") or ""
        sm_id = data.get("sm_id") or (lead_doc or {}).get("managed_by") or ""
        sm_name = data.get("sm_name") or (lead_doc or {}).get("managed_by_name") or ""

        # Manager-privilege check: only managers can log ON BEHALF OF another TC
        if tc_id != current_user["id"] and current_user["role"] not in MANAGER_ROLES:
            raise HTTPException(403, "Cannot log events for another telecaller")

        doc = {
            "id": f"ce-{uuid.uuid4().hex[:10]}",
            "type": etype,
            "tc_id": tc_id,
            "tc_name": tc_name,
            "sm_id": sm_id,
            "sm_name": sm_name,
            "lead_id": lead_id,
            "customer_name": data.get("customer_name") or (lead_doc or {}).get("name") or "",
            "customer_phone": phone,
            "phone_norm": _norm_phone(phone),
            "outcome": data.get("outcome") or "",
            "message": data.get("message") or "",
            "remarks": data.get("remarks") or "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.contact_events.insert_one(doc)
        doc.pop("_id", None)
        return {"event": doc, "message": "Event logged"}

    @api_router.get("/contact-events")
    async def list_events(
        tc_id: Optional[str] = None,
        sm_id: Optional[str] = None,
        phone: Optional[str] = None,
        type: Optional[str] = None,
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        limit: int = 1000,
        current_user: dict = Depends(get_current_user),
    ):
        q: dict = {}
        if tc_id: q["tc_id"] = tc_id
        if sm_id: q["sm_id"] = sm_id
        if type: q["type"] = type
        if phone: q["phone_norm"] = _norm_phone(phone)
        if from_ or to:
            rng = {}
            if from_: rng["$gte"] = from_
            if to: rng["$lt"] = (datetime.strptime(to, "%Y-%m-%d") + timedelta(days=1)).isoformat()
            if rng: q["created_at"] = rng
        q = await _scope_query(current_user, q)
        events = await db.contact_events.find(q, {"_id": 0}).sort("created_at", -1).limit(min(int(limit or 1000), 5000)).to_list(5000)
        return {"events": events, "count": len(events)}

    @api_router.get("/contact-events/summary")
    async def summary(
        sm_id: Optional[str] = None,
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        if current_user["role"] not in MANAGER_ROLES:
            raise HTTPException(403, "Not authorised")
        q: dict = {}
        if sm_id: q["sm_id"] = sm_id
        elif current_user["role"] == "sales_manager": q["sm_id"] = current_user["id"]
        elif current_user["role"] == "assistant_sales_manager": q["sm_id"] = current_user.get("managed_by") or current_user["id"]
        if from_ or to:
            rng = {}
            if from_: rng["$gte"] = from_
            if to: rng["$lt"] = (datetime.strptime(to, "%Y-%m-%d") + timedelta(days=1)).isoformat()
            if rng: q["created_at"] = rng
        events = await db.contact_events.find(q, {"_id": 0}).to_list(20000)
        by_tc = {}
        by_customer = {}
        for e in events:
            tc = e.get("tc_id") or "_"
            b = by_tc.setdefault(tc, {"tc_id": tc, "tc_name": e.get("tc_name") or "", "calls": 0, "whatsapp": 0, "customers_contacted": set()})
            if e["type"] == "call": b["calls"] += 1
            else: b["whatsapp"] += 1
            if e.get("phone_norm"): b["customers_contacted"].add(e["phone_norm"])
            # per-customer breakdown
            cust_key = e.get("phone_norm") or "_"
            c = by_customer.setdefault(cust_key, {"phone": e.get("customer_phone"), "customer_name": e.get("customer_name") or "",
                                                    "calls": 0, "whatsapp": 0, "last_contact_at": ""})
            if e["type"] == "call": c["calls"] += 1
            else: c["whatsapp"] += 1
            if (e.get("created_at") or "") > c["last_contact_at"]:
                c["last_contact_at"] = e.get("created_at") or ""
                c["last_tc_name"] = e.get("tc_name") or ""
        tc_list = []
        for b in by_tc.values():
            b["customers_contacted"] = len(b["customers_contacted"])
            b["total"] = b["calls"] + b["whatsapp"]
            tc_list.append(b)
        tc_list.sort(key=lambda x: x["total"], reverse=True)
        cust_list = list(by_customer.values())
        cust_list.sort(key=lambda x: x["calls"] + x["whatsapp"], reverse=True)
        return {"telecallers": tc_list, "customers": cust_list[:200], "total_events": len(events)}

    @api_router.get("/contact-events/report/pdf")
    async def report_pdf(
        sm_id: Optional[str] = None,
        from_: Optional[str] = Query(None, alias="from"),
        to: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        if current_user["role"] not in MANAGER_ROLES:
            raise HTTPException(403, "Not authorised")
        summary_data = await summary(sm_id=sm_id, from_=from_, to=to, current_user=current_user)
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib import colors
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        except ImportError:
            raise HTTPException(500, "reportlab not installed")
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=25, rightMargin=25, topMargin=20, bottomMargin=20)
        styles = getSampleStyleSheet()
        story = []
        rng = f"{from_ or 'beginning'} → {to or 'now'}"
        story.append(Paragraph(f"<b>Contact Activity Report</b> · {rng}", styles["Title"]))
        story.append(Paragraph(f"Total events: <b>{summary_data['total_events']}</b>", styles["Normal"]))
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>Telecaller Summary</b>", styles["Heading2"]))
        rows = [["#", "Telecaller", "Calls", "WhatsApp", "Total", "Unique Customers"]]
        for i, t in enumerate(summary_data["telecallers"], 1):
            rows.append([str(i), t["tc_name"] or "—", str(t["calls"]), str(t["whatsapp"]),
                         str(t["total"]), str(t["customers_contacted"])])
        tbl = Table(rows, colWidths=[25, 200, 60, 70, 55, 90], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3B5249")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (2, 1), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D6D2C8")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F8F6")]),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 14))
        story.append(Paragraph("<b>Top Customers Contacted</b>", styles["Heading2"]))
        rows2 = [["#", "Customer", "Phone", "Calls", "WA", "Last By", "Last At"]]
        for i, c in enumerate(summary_data["customers"][:60], 1):
            rows2.append([str(i), c.get("customer_name") or "—", c.get("phone") or "",
                          str(c["calls"]), str(c["whatsapp"]), c.get("last_tc_name") or "—",
                          (c.get("last_contact_at") or "")[:16].replace("T", " ")])
        tbl2 = Table(rows2, colWidths=[25, 140, 90, 45, 40, 100, 100], repeatRows=1)
        tbl2.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#A66E4E")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("ALIGN", (3, 1), (4, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D6D2C8")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F8F6")]),
        ]))
        story.append(tbl2)
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"<i>Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</i>", styles["Normal"]))
        doc.build(story)
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
                                  headers={"Content-Disposition": f'attachment; filename="contact_report_{from_ or "all"}_{to or "now"}.pdf"'})
