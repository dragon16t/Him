from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request, Response, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, json, bcrypt, jwt, requests, smtplib, asyncio
from datetime import datetime, timezone, timedelta, date
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

# Gemini AI client
try:
    from google import genai as _genai
    _gemini_client = _genai.Client(api_key=os.environ.get('GEMINI_API_KEY','')) if os.environ.get('GEMINI_API_KEY') else None
except Exception:
    _gemini_client = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'default_jwt_secret')
JWT_ALGORITHM = "HS256"
SMTP_EMAIL = os.environ.get('SMTP_EMAIL', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')

# ===== Company Information (for letterheads & email templates) =====
COMPANY = {
    "name": "Celesta Glow Private Limited",
    "tagline": "Premium Beauty • Wellness • Skincare",
    "address_line1": "Veegal Enterprises LLP, Cherutti Road",
    "address_line2": "Calicut, Kerala 673032, India",
    "phone": "+91 94461 25745",
    "email": "manager@celestaglow.com",
    "website": "www.celestaglow.com",
    "work_hours": "9:30 AM – 5:30 PM (Monday to Saturday)",
    "total_break": "1 hour total per day",
    "weekly_off": "Sunday",
    "notice_period": "30 days (as per company policy & Indian labour law)",
    "probation": "3 months from date of joining",
    "leave_policy": "12 Casual Leaves + 12 Sick Leaves + 12 Earned Leaves per annum (pro-rata)",
    "primary_color": "#3B5249",
    "accent_color": "#A66E4E",
    "warning_color": "#D4A373",
    "danger_color": "#B75D69",
}

# Editable employment-terms keys (the 9 fields shown in every letter footer).
# These can be overridden by HR/Admin via /api/hr/employment-terms — the override is
# stored in db.company_settings and merged into COMPANY at startup + on every save.
EMPLOYMENT_TERM_KEYS = [
    "work_hours", "total_break", "weekly_off", "probation", "notice_period", "leave_policy",
]

def _letterhead(title: str, accent: str = None) -> str:
    """Standard letterhead header with logo block, company details, and section title."""
    accent = accent or COMPANY["primary_color"]
    return f"""<div style='font-family:Georgia,"Times New Roman",serif;max-width:720px;margin:0 auto;padding:0;background:#ffffff;border:1px solid #E5E3DB;'>
<div style='background:linear-gradient(135deg,{COMPANY['primary_color']} 0%,#2C3531 100%);color:#ffffff;padding:24px 32px;'>
<table style='width:100%;border:none;border-collapse:collapse'><tr>
<td style='border:none;vertical-align:middle'>
<h1 style='margin:0;font-size:26px;letter-spacing:1.5px;font-weight:600'>CELESTA <span style='color:{COMPANY['warning_color']}'>GLOW</span></h1>
<p style='margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.85'>{COMPANY['tagline']}</p>
</td>
<td style='border:none;text-align:right;vertical-align:middle;font-size:10.5px;line-height:1.6'>
<div>{COMPANY['address_line1']}</div>
<div>{COMPANY['address_line2']}</div>
<div style='margin-top:4px'>📞 {COMPANY['phone']}</div>
<div>✉ {COMPANY['email']}</div>
</td>
</tr></table>
</div>
<div style='padding:32px 40px 24px;'>
<h2 style='color:{accent};text-align:center;letter-spacing:3px;font-size:18px;margin:0 0 6px;text-transform:uppercase;border-bottom:2px solid {accent};padding-bottom:8px;display:inline-block;width:100%'>{title}</h2>
<table style='width:100%;border:none;margin:14px 0 22px;font-family:Arial,sans-serif;font-size:11px;color:#59615D'><tr>
<td style='border:none;text-align:left'><b>Ref:</b> CG/HR/{datetime.now(timezone.utc).strftime('%Y/%m')}/{uuid.uuid4().hex[:5].upper()}</td>
<td style='border:none;text-align:right'><b>Date:</b> {datetime.now(timezone.utc).strftime('%d %B %Y')}</td>
</tr></table>"""

def _letterhead_footer(signatory: str = "HR Department", show_terms: bool = False) -> str:
    """Standard letterhead footer with signature block and company contact strip."""
    terms_block = ""
    if show_terms:
        terms_block = f"""<div style='background:#F9F8F6;border-left:3px solid {COMPANY['primary_color']};padding:14px 18px;margin:22px 0 18px;font-family:Arial,sans-serif;font-size:11px;color:#2C3531;line-height:1.7'>
<p style='margin:0 0 6px;font-weight:600;color:{COMPANY['primary_color']};letter-spacing:0.5px;text-transform:uppercase;font-size:10px'>Standard Employment Terms</p>
<p style='margin:0'>• <b>Work Hours:</b> {COMPANY['work_hours']}</p>
<p style='margin:0'>• <b>Break Time:</b> {COMPANY['total_break']}</p>
<p style='margin:0'>• <b>Weekly Off:</b> {COMPANY['weekly_off']}</p>
<p style='margin:0'>• <b>Probation:</b> {COMPANY['probation']}</p>
<p style='margin:0'>• <b>Notice Period:</b> {COMPANY['notice_period']}</p>
<p style='margin:0'>• <b>Leave Policy:</b> {COMPANY['leave_policy']}</p>
</div>"""
    return f"""{terms_block}
<p style='font-family:Georgia,serif;margin:28px 0 6px;font-size:13px'>With warm regards,</p>
<div style='margin-top:36px;font-family:Arial,sans-serif'>
<div style='border-top:1px solid #2C3531;padding-top:6px;display:inline-block;min-width:220px'>
<p style='margin:0;font-size:13px;font-weight:600;color:{COMPANY['primary_color']}'>{signatory}</p>
<p style='margin:0;font-size:11px;color:#59615D'>For {COMPANY['name']}</p>
<p style='margin:0;font-size:10px;color:#A66E4E;font-style:italic'>(Authorized Signatory)</p>
</div>
</div>
</div>
<div style='background:{COMPANY['primary_color']};color:#ffffff;padding:14px 32px;font-family:Arial,sans-serif;font-size:10px;text-align:center;letter-spacing:0.4px'>
<p style='margin:0;opacity:0.95'><b>{COMPANY['name']}</b> &nbsp;|&nbsp; {COMPANY['address_line1']}, {COMPANY['address_line2']}</p>
<p style='margin:4px 0 0;opacity:0.78'>📞 {COMPANY['phone']} &nbsp;•&nbsp; ✉ {COMPANY['email']} &nbsp;•&nbsp; 🌐 {COMPANY['website']}</p>
<p style='margin:6px 0 0;opacity:0.6;font-size:9px;font-style:italic'>This is a confidential communication. Unauthorized use, disclosure, or distribution is strictly prohibited.</p>
</div>
</div>"""

def _details_table(rows: list) -> str:
    """Render a clean key-value table for letter details."""
    body = "".join([
        f"<tr><td style='padding:10px 14px;border:1px solid #E5E3DB;background:#F9F8F6;font-weight:600;color:#2C3531;width:36%'>{k}</td><td style='padding:10px 14px;border:1px solid #E5E3DB;color:#2C3531'>{v}</td></tr>"
        for k, v in rows
    ])
    return f"<table style='width:100%;border-collapse:collapse;margin:10px 0 18px;font-family:Arial,sans-serif;font-size:12px'>{body}</table>"

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "celesta-glow"
storage_key = None

app = FastAPI(title="Celesta Glow CRM", version="3.0")
api_router = APIRouter(prefix="/api")

# ==================== OBJECT STORAGE ====================
def init_storage():
    global storage_key
    if storage_key: return storage_key
    if not EMERGENT_LLM_KEY: return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path, data, content_type):
    key = init_storage()
    if not key: raise Exception("Storage not initialized")
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path):
    key = init_storage()
    if not key: raise Exception("Storage not initialized")
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ==================== EMAIL ====================
async def send_email_async(to_email, subject, html_body, max_retries=3, cc_emails=None):
    """Send email via Gmail SMTP with retries. Returns (success, error_msg)."""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        return False, "SMTP not configured"
    cc_emails = cc_emails or []
    cc_emails = [e for e in cc_emails if e and e != to_email]  # dedupe
    def _send():
        last_err = ""
        for attempt in range(max_retries):
            try:
                msg = MIMEMultipart('alternative')
                msg['Subject'] = subject
                msg['From'] = f"Celesta Glow <{SMTP_EMAIL}>"
                msg['To'] = to_email
                if cc_emails:
                    msg['Cc'] = ", ".join(cc_emails)
                msg.attach(MIMEText(html_body, 'html'))
                recipients = [to_email] + cc_emails
                # Try SMTP_SSL on 465 first (more reliable on most networks)
                try:
                    with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=20) as server:
                        server.login(SMTP_EMAIL, SMTP_PASSWORD)
                        server.sendmail(SMTP_EMAIL, recipients, msg.as_string())
                    return True, ""
                except Exception:
                    # Fallback to STARTTLS on 587
                    with smtplib.SMTP('smtp.gmail.com', 587, timeout=20) as server:
                        server.ehlo()
                        server.starttls()
                        server.ehlo()
                        server.login(SMTP_EMAIL, SMTP_PASSWORD)
                        server.sendmail(SMTP_EMAIL, recipients, msg.as_string())
                    return True, ""
            except Exception as e:
                last_err = f"{type(e).__name__}: {e}"
                logger.error(f"Email attempt {attempt+1}/{max_retries} to {to_email} failed: {last_err}")
        return False, last_err
    return await asyncio.to_thread(_send)

# ==================== AUTH ====================
def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain, hashed):
    try: return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except: return False

def create_token(user_id, email, role):
    return jwt.encode({"sub": user_id, "email": email, "role": role, "exp": datetime.now(timezone.utc) + timedelta(days=7)}, JWT_SECRET, algorithm=JWT_ALGORITHM)

ROLE_COLLECTIONS = {
    "admin": "admins", "sales_manager": "sales_managers", "district_manager": "managers",
    "assistant_sales_manager": "assistant_sales_managers", "assistant_district_manager": "assistant_district_managers",
    "telecaller": "telecallers", "agent": "agents", "finance_manager": "finance_managers",
    "hr_manager": "hr_managers", "social_media_manager": "social_media_managers",
    "inhouse_telecaller": "inhouse_telecallers", "content_strategist": "content_strategists",
    "content_developer": "content_developers", "inventory_manager": "inventory_managers",
    "digital_marketing_manager": "digital_marketing_managers"
}
AUTH_COLLECTIONS = {v: k for k, v in ROLE_COLLECTIONS.items()}

async def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "): raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        role = payload.get("role")
        coll = ROLE_COLLECTIONS.get(role)
        if not coll: raise HTTPException(status_code=401, detail="Invalid role")
        user = await db[coll].find_one({"id": payload["sub"]}, {"_id": 0})
        if not user: raise HTTPException(status_code=401, detail="User not found")
        user['role'] = role
        user.pop('password_hash', None)
        return user
    except jwt.ExpiredSignatureError: raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError: raise HTTPException(status_code=401, detail="Invalid token")

# ==================== SEED DATA ====================
COMMISSION_RATES = {"telecaller": 8, "agent": 10, "district_manager": 5, "sales_manager": 5}

SEED_PRODUCTS = [
    {"id": "prod-001", "name": "Celesta Glow SPF 50 Sunscreen", "category": "sunscreen", "price": 599, "description": "Premium SPF 50 with natural ingredients", "stock": 100},
    {"id": "prod-002", "name": "Celesta Glow SPF 30 Sunscreen Lite", "category": "sunscreen", "price": 399, "description": "Lightweight SPF 30 daily protection", "stock": 150},
    {"id": "prod-003", "name": "Celesta Glow Vitamin C Face Wash", "category": "facewash", "price": 299, "description": "Brightening Vitamin C face wash", "stock": 200},
    {"id": "prod-004", "name": "Celesta Glow Neem Face Wash", "category": "facewash", "price": 249, "description": "Neem face wash for clear skin", "stock": 180},
    {"id": "prod-005", "name": "Celesta Glow Coconut Body Lotion", "category": "bodylotion", "price": 449, "description": "Deep moisturizing coconut lotion", "stock": 120},
    {"id": "prod-006", "name": "Celesta Glow Aloe Vera Body Lotion", "category": "bodylotion", "price": 349, "description": "Soothing aloe vera body lotion", "stock": 130},
]
SEED_REGIONS = [
    {"id": "reg-001", "name": "Ernakulam", "district": "Ernakulam", "state": "Kerala", "pincode": "682001", "areas": ["Kakkanad", "Edappally", "Vyttila", "Aluva"], "localities": []},
    {"id": "reg-002", "name": "Thiruvananthapuram", "district": "Thiruvananthapuram", "state": "Kerala", "pincode": "695001", "areas": ["Pattom", "Kowdiar", "Thampanoor", "Kazhakkoottam"], "localities": []},
]
SEED_USERS = {
    "admins": [{"id": "admin-001", "email": "admin@celestaglow.com", "name": "Admin User", "password": "admin123", "phone": "9999900001", "salary": 0, "incentive": 0}],
    "sales_managers": [{"id": "sm-001", "email": "salesmanager@celestaglow.com", "name": "Hubby Brahman", "password": "sm123", "phone": "9999900002", "commission_earned": 0, "salary": 25000, "incentive": 5000}],
    "managers": [{"id": "mgr-001", "email": "manager1@celestaglow.com", "name": "Karim PK", "password": "mgr123", "phone": "9999900003", "region_id": "reg-001", "commission_earned": 0, "salary": 22000, "incentive": 3000}],
    "telecallers": [
        {"id": "tc-001", "email": "telecaller1@celestaglow.com", "name": "Priya Nair", "password": "tc123", "phone": "9847012345", "status": "active", "commission_earned": 0, "total_calls": 0, "conversions": 0, "salary": 15000, "incentive": 2000},
        {"id": "tc-002", "email": "telecaller2@celestaglow.com", "name": "Anjali Menon", "password": "tc123", "phone": "9847023456", "status": "active", "commission_earned": 0, "total_calls": 0, "conversions": 0, "salary": 15000, "incentive": 2000},
        {"id": "tc-003", "email": "telecaller3@celestaglow.com", "name": "Sneha Thomas", "password": "tc123", "phone": "9847034567", "status": "active", "commission_earned": 0, "total_calls": 0, "conversions": 0, "salary": 15000, "incentive": 2000}
    ],
    "agents": [
        {"id": "agent-001", "email": "agent1@celestaglow.com", "name": "Suresh Pillai", "password": "agent123", "phone": "9961012345", "district": "Ernakulam", "area": "Kakkanad", "region_id": "reg-001", "status": "active", "inventory": {}, "commission_earned": 0, "total_sales": 0, "salary": 12000, "incentive": 1500},
        {"id": "agent-002", "email": "agent2@celestaglow.com", "name": "Deepa Krishnan", "password": "agent123", "phone": "9961023456", "district": "Thiruvananthapuram", "area": "Pattom", "region_id": "reg-002", "status": "active", "inventory": {}, "commission_earned": 0, "total_sales": 0, "salary": 12000, "incentive": 1500},
        {"id": "agent-003", "email": "agent3@celestaglow.com", "name": "Rahul Vijay", "password": "agent123", "phone": "9961034567", "district": "Ernakulam", "area": "Edappally", "region_id": "reg-001", "status": "active", "inventory": {}, "commission_earned": 0, "total_sales": 0, "salary": 12000, "incentive": 1500}
    ],
    "finance_managers": [{"id": "fin-001", "email": "finance@celestaglow.com", "name": "Lakshmi Devi", "password": "fin123", "phone": "9999900004", "salary": 20000, "incentive": 3000}],
    "hr_managers": [{"id": "hr-001", "email": "hrmanager@celestaglow.com", "name": "Meera Nair", "password": "hr123", "phone": "9999900005", "salary": 20000, "incentive": 2500}],
    "social_media_managers": [{"id": "smm-001", "email": "socialmedia@celestaglow.com", "name": "Vikram Menon", "password": "social123", "phone": "9999900006", "salary": 18000, "incentive": 2000}],
    "inhouse_telecallers": [
        {"id": "iht-001", "email": "inhouse1@celestaglow.com", "name": "Divya Kumar", "password": "ih123", "phone": "9999900007", "total_contacted": 0, "total_followups": 0, "salary": 14000, "incentive": 1500},
        {"id": "iht-002", "email": "inhouse2@celestaglow.com", "name": "Sneha Raj", "password": "ih123", "phone": "9999900008", "total_contacted": 0, "total_followups": 0, "salary": 14000, "incentive": 1500}
    ],
    "content_strategists": [{"id": "cs-001", "email": "contentstrat@celestaglow.com", "name": "Arjun Pillai", "password": "cs123", "phone": "9999900009", "salary": 18000, "incentive": 2000}],
    "content_developers": [{"id": "cd-001", "email": "contentdev@celestaglow.com", "name": "Arun Mohan", "password": "cd123", "phone": "9999900010", "salary": 18000, "incentive": 2000}],
    "assistant_sales_managers": [{"id": "asm-001", "email": "asstsa@celestaglow.com", "name": "Ravi Kumar", "password": "asm123", "phone": "9999900011", "commission_earned": 0, "salary": 18000, "incentive": 3000, "managed_by": "sm-001"}],
    "assistant_district_managers": [{"id": "adm-001", "email": "asstdm@celestaglow.com", "name": "Pradeep Nair", "password": "adm123", "phone": "9999900012", "commission_earned": 0, "salary": 18000, "incentive": 3000, "managed_by": "mgr-001", "district": "Ernakulam"}],
    "inventory_managers": [{"id": "inv-001", "email": "inventory@celestaglow.com", "name": "Sajan Thomas", "password": "inv123", "phone": "9999900013", "salary": 18000, "incentive": 2000}],
    "digital_marketing_managers": [{"id": "dmm-001", "email": "digitalmarketing@celestaglow.com", "name": "Anil Raj", "password": "dm123", "phone": "9999900014", "salary": 20000, "incentive": 3000}]
}

async def seed_database():
    logger.info("Seeding database...")
    # Always ensure admin user exists (so login is never broken)
    admin_seed = SEED_USERS.get("admins", [])
    for u_seed in admin_seed:
        u = {**u_seed}
        email = u["email"]
        if not await db.admins.find_one({"email": email}):
            pw = u.pop("password")
            u["password_hash"] = hash_password(pw)
            u["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.admins.insert_one(u)
            logger.info(f"Seeded admin: {email}")
    # Honor a "system_wiped" flag — once admin has wiped everything, do NOT re-seed users / products / regions / demo data.
    wiped_doc = await db.app_config.find_one({"key": "system_wiped"})
    if wiped_doc and wiped_doc.get("value") is True:
        logger.info("System is in WIPED state — only admin seeded. Skipping all other seed data.")
        # Performance indexes — single + compound for fast date-range / role queries
        single_idx = [
            ("leads","assigned_to"),("leads","status"),("leads","phone_number"),("leads","created_at"),
            ("orders","created_by"),("orders","status"),("orders","created_at"),
            ("commissions","user_id"),("commissions","created_at"),
            ("fund_requests","requested_by"),("fund_requests","status"),("fund_requests","created_at"),
            ("expenses","status"),("expenses","reimburse_status"),("expenses","created_at"),
            ("payroll","user_id"),("payroll","month"),("payroll","year"),("payroll","created_at"),
            ("tasks","assigned_to"),("tasks","created_at"),
            ("audit_logs","timestamp"),("audit_logs","user_id"),
            ("influencers","assigned_to"),("content_briefs","assigned_to"),
            ("leaves","user_id"),("complaints","user_id"),
            ("notifications","user_id"),("notifications","role"),("notifications","read"),
            ("attendance","user_id"),("attendance","date"),
            ("employee_tasks","user_id"),("employee_tasks","date"),
            ("revenue_entries","created_at"),("inhouse_call_logs","created_at"),
            ("ai_call_logs","created_at"),("hr_communications","created_at"),
        ]
        for coll, field in single_idx:
            try: await db[coll].create_index(field)
            except Exception: pass
        # Compound indexes for common date+role queries
        try:
            await db.orders.create_index([("created_at", -1), ("status", 1)])
            await db.orders.create_index([("created_by", 1), ("created_at", -1)])
            await db.leads.create_index([("assigned_to", 1), ("created_at", -1)])
            await db.leads.create_index([("status", 1), ("created_at", -1)])
            await db.expenses.create_index([("status", 1), ("created_at", -1)])
            await db.expenses.create_index([("reimburse_status", 1), ("created_at", -1)])
            await db.audit_logs.create_index([("timestamp", -1)])
            await db.notifications.create_index([("user_id", 1), ("read", 1), ("created_at", -1)])
        except Exception as _e:
            logger.warning(f"Compound index creation: {_e}")
        return
    for p in SEED_PRODUCTS:
        if not await db.products.find_one({"id": p["id"]}):
            await db.products.insert_one({**p, "created_at": datetime.now(timezone.utc).isoformat()})
    for r in SEED_REGIONS:
        if not await db.regions.find_one({"id": r["id"]}):
            await db.regions.insert_one({**r, "created_at": datetime.now(timezone.utc).isoformat()})
    # Backfill assigned_to_name on legacy leads (so admin Conversations tab shows telecaller name)
    try:
        legacy_leads = await db.leads.find({"$or":[{"assigned_to_name":{"$exists":False}},{"assigned_to_name":""}]}, {"_id":0,"id":1,"assigned_to":1}).to_list(2000)
        for ll in legacy_leads:
            aid = ll.get("assigned_to")
            if not aid: continue
            for c in ROLE_COLLECTIONS.values():
                u = await db[c].find_one({"id": aid}, {"_id":0,"name":1})
                if u and u.get("name"):
                    await db.leads.update_one({"id": ll["id"]}, {"$set": {"assigned_to_name": u["name"]}})
                    break
    except Exception as e:
        logger.error(f"backfill assigned_to_name: {e}")
    # Backfill commission user_name (legacy bug stored customer_name) and normalize 'credited' → 'pending'
    try:
        legacy_comms = await db.commissions.find({}, {"_id":0,"id":1,"user_id":1,"user_name":1,"user_role":1,"order_id":1,"status":1}).to_list(5000)
        for cm in legacy_comms:
            updates = {}
            # If user_name is empty or matches customer_name on the order, fix to user collection's actual name
            uid = cm.get("user_id")
            if uid:
                role = cm.get("user_role")
                coll = ROLE_COLLECTIONS.get(role) if role else None
                if coll:
                    u = await db[coll].find_one({"id": uid}, {"_id":0,"name":1})
                    if u and u.get("name"):
                        if cm.get("order_id"):
                            o = await db.orders.find_one({"id": cm["order_id"]}, {"_id":0,"customer_name":1,"total_amount":1})
                            if o and (cm.get("user_name") in ("", None, o.get("customer_name",""))):
                                updates["user_name"] = u["name"]
                            if o and not cm.get("order_amount"):
                                updates["order_amount"] = o.get("total_amount", 0)
                        elif not cm.get("user_name"):
                            updates["user_name"] = u["name"]
            # Normalize legacy 'credited' → 'pending' so summary picks it up
            if cm.get("status") == "credited":
                updates["status"] = "pending"
            if updates:
                await db.commissions.update_one({"id": cm["id"]}, {"$set": updates})
    except Exception as e:
        logger.error(f"backfill commissions: {e}")
    # Clean up legacy collections that are no longer used
    for legacy_coll in ["videographers", "editors", "graphic_designers"]:
        try: await db[legacy_coll].drop()
        except Exception: pass
    for coll_name, users in SEED_USERS.items():
        for ud in users:
            u = {**ud}
            email = u["email"]
            # Skip re-seeding any user that was explicitly deleted
            tomb = await db.deleted_seed_emails.find_one({"email": email})
            if tomb:
                continue
            existing = await db[coll_name].find_one({"email": email})
            if not existing:
                pw = u.pop("password")
                u["password_hash"] = hash_password(pw)
                u["created_at"] = datetime.now(timezone.utc).isoformat()
                await db[coll_name].insert_one(u)
                logger.info(f"Seeded {coll_name}: {email}")
            else:
                # IMPORTANT: never overwrite password — the user / admin may have changed it.
                # Only fill in missing optional fields like phone / salary / incentive.
                u.pop("password", None)
                if u.get("phone"):
                    await db[coll_name].update_one({"email": email, "phone": {"$in": [None, ""]}}, {"$set": {"phone": u["phone"]}}, upsert=False)
                    await db[coll_name].update_one({"email": email, "phone": {"$exists": False}}, {"$set": {"phone": u["phone"]}}, upsert=False)
                for fld in ["salary", "incentive"]:
                    if u.get(fld) is not None:
                        await db[coll_name].update_one({"email": email, fld: {"$exists": False}}, {"$set": {fld: u[fld]}}, upsert=False)
    for idx in [("leads","assigned_to"),("leads","status"),("leads","phone_number"),("orders","created_by"),("orders","status"),("commissions","user_id"),("fund_requests","requested_by"),("expenses","status"),("payroll","user_id"),("tasks","assigned_to"),("audit_logs","timestamp"),("influencers","assigned_to"),("content_briefs","assigned_to"),("leaves","user_id"),("complaints","user_id")]:
        await db[idx[0]].create_index(idx[1])
    # Auto-activate Gemini AI fallback if admin hasn't configured anything
    try:
        ai_doc = await db.ai_settings.find_one({"id": "global_ai"})
        if (not ai_doc or not ai_doc.get("is_active")) and os.environ.get("GEMINI_API_KEY"):
            await db.ai_settings.update_one(
                {"id": "global_ai"},
                {"$set": {"id":"global_ai","provider":"gemini","model":"gemini-2.5-flash","api_key":os.environ["GEMINI_API_KEY"],"is_active":True,"updated_at":datetime.now(timezone.utc).isoformat()}},
                upsert=True
            )
    except Exception as e:
        logger.error(f"AI auto-config: {e}")
    # Seed demo leads with repeat-order + relationship dates so SM/DM/Telecaller dashboards have visible data
    try:
        today = date.today()
        demo_leads = [
            {"id":"lead-demo-1","phone_number":"9876500001","name":"Aishwarya Pillai","status":"delivered","assigned_to":"tc-001","assigned_to_name":"Priya Nair",
             "product_interest":"sunscreen","source":"instagram","last_order_date":(today - timedelta(days=20)).isoformat(),
             "next_relationship_date":(today - timedelta(days=5)).isoformat(),  # OVERDUE relationship
             "next_repeat_order_date":(today + timedelta(days=15)).isoformat(),  # upcoming repeat
             "remarks":"Loved the SPF 50, asked about night cream","customer_remarks":"Will reorder next month","call_logs":[],
             "created_by":"tc-001","created_at":(today - timedelta(days=21)).isoformat()+"T10:00:00+00:00",
             "updated_at":datetime.now(timezone.utc).isoformat()},
            {"id":"lead-demo-2","phone_number":"9876500002","name":"Reshma Krishnan","status":"delivered","assigned_to":"tc-002","assigned_to_name":"Anjali Menon",
             "product_interest":"facewash","source":"facebook","last_order_date":(today - timedelta(days=36)).isoformat(),
             "next_relationship_date":(today - timedelta(days=21)).isoformat(),
             "next_repeat_order_date":(today - timedelta(days=1)).isoformat(),  # OVERDUE repeat (should appear in Repeat Due)
             "remarks":"Repeat customer - 3rd order coming","customer_remarks":"Recommends to friends","call_logs":[],
             "created_by":"tc-002","created_at":(today - timedelta(days=37)).isoformat()+"T11:00:00+00:00",
             "updated_at":datetime.now(timezone.utc).isoformat()},
            {"id":"lead-demo-3","phone_number":"9876500003","name":"Meena Thomas","status":"delivered","assigned_to":"agent-001","assigned_to_name":"Suresh Pillai",
             "product_interest":"bodylotion","source":"agent_visit","last_order_date":(today - timedelta(days=15)).isoformat(),
             "next_relationship_date":today.isoformat(),  # DUE today (15-day relationship)
             "next_repeat_order_date":(today + timedelta(days=20)).isoformat(),
             "remarks":"Bulk order from beauty parlour","customer_remarks":"Wants invoice","call_logs":[],
             "created_by":"agent-001","created_at":(today - timedelta(days=16)).isoformat()+"T12:00:00+00:00",
             "updated_at":datetime.now(timezone.utc).isoformat()},
        ]
        for dl in demo_leads:
            if not await db.leads.find_one({"id": dl["id"]}):
                await db.leads.insert_one(dl)
    except Exception as e:
        logger.error(f"demo lead seed: {e}")
    logger.info("Database seeded")

async def write_test_credentials():
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write("## Admin\n- Email: admin@celestaglow.com\n- Password: admin123\n- Role: admin\n- Route: /dashboard\n\n")
        f.write("## Sales Manager\n- Email: salesmanager@celestaglow.com\n- Password: sm123\n- Role: sales_manager\n- Route: /sales-manager\n\n")
        f.write("## District Manager\n- Email: manager1@celestaglow.com\n- Password: mgr123\n- Role: district_manager\n- Route: /manager\n\n")
        f.write("## Telecaller 1\n- Email: telecaller1@celestaglow.com\n- Password: tc123\n- Role: telecaller\n- Route: /telecaller\n\n")
        f.write("## Telecaller 2\n- Email: telecaller2@celestaglow.com\n- Password: tc123\n\n")
        f.write("## Agent 1\n- Email: agent1@celestaglow.com\n- Password: agent123\n- Role: agent\n- Route: /agent\n\n")
        f.write("## Agent 2\n- Email: agent2@celestaglow.com\n- Password: agent123\n\n")
        f.write("## Finance Manager\n- Email: finance@celestaglow.com\n- Password: fin123\n- Role: finance_manager\n- Route: /finance\n\n")
        f.write("## HR Manager\n- Email: hrmanager@celestaglow.com\n- Password: hr123\n- Role: hr_manager\n- Route: /hr-manager\n\n")
        f.write("## Social Media Manager\n- Email: socialmedia@celestaglow.com\n- Password: social123\n- Role: social_media_manager\n- Route: /social-media\n\n")
        f.write("## In-House Telecaller 1\n- Email: inhouse1@celestaglow.com\n- Password: ih123\n- Role: inhouse_telecaller\n- Route: /influencer-outreach\n\n")
        f.write("## In-House Telecaller 2\n- Email: inhouse2@celestaglow.com\n- Password: ih123\n\n")
        f.write("## Content Strategist\n- Email: contentstrat@celestaglow.com\n- Password: cs123\n- Role: content_strategist\n- Route: /content-strategist\n\n")

# ==================== AUTH ROUTES ====================
@api_router.post("/auth/login")
async def login(data: dict):
    email = data.get("email", "").lower().strip()
    password = data.get("password", "")
    if not email or not password: raise HTTPException(status_code=400, detail="Email and password are required")
    found_user = None
    for coll_name, role in AUTH_COLLECTIONS.items():
        user = await db[coll_name].find_one({"email": email}, {"_id": 0})
        if user:
            if verify_password(password, user.get("password_hash", "")):
                token = create_token(user["id"], email, role)
                ud = {k: v for k, v in user.items() if k != "password_hash"}
                ud["role"] = role
                return {"token": token, "user": ud}
            found_user = True
            break
    if found_user:
        raise HTTPException(status_code=401, detail="Password entered is wrong")
    raise HTTPException(status_code=404, detail="No account found with this email")

@api_router.post("/auth/reset-password")
async def reset_password(data: dict):
    email = data.get("email", "").lower().strip()
    new_password = data.get("new_password", "")
    if not email or not new_password: raise HTTPException(status_code=400, detail="Email and new password required")
    for coll in ROLE_COLLECTIONS.values():
        user = await db[coll].find_one({"email": email})
        if user:
            await db[coll].update_one({"email": email}, {"$set": {"password_hash": hash_password(new_password)}})
            return {"message": "Password reset successful"}
    raise HTTPException(status_code=404, detail="User not found")

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    # Return flat user object (consistent with /auth/login's `user` shape).
    return current_user

@api_router.post("/admin/proxy-login/{user_id}")
async def proxy_login(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403, detail="Admin only")
    for coll_name, role in AUTH_COLLECTIONS.items():
        user = await db[coll_name].find_one({"id": user_id}, {"_id": 0})
        if user:
            token = create_token(user["id"], user["email"], role)
            ud = {k: v for k, v in user.items() if k != "password_hash"}
            ud["role"] = role
            route = {
                "admin":"/dashboard","sales_manager":"/sales-manager","district_manager":"/manager",
                "telecaller":"/telecaller","agent":"/agent","finance_manager":"/finance",
                "hr_manager":"/hr-manager","social_media_manager":"/social-media",
                "inhouse_telecaller":"/influencer-outreach","content_strategist":"/content-strategist",
                "content_developer":"/content-developer","inventory_manager":"/inventory",
                "digital_marketing_manager":"/digital-marketing",
                "assistant_sales_manager":"/assistant-sm","assistant_district_manager":"/assistant-dm"
            }.get(role, "/login")
            return {"token": token, "user": ud, "route": route}
    raise HTTPException(status_code=404, detail="User not found")

# ==================== PROFILE ====================
@api_router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    coll = ROLE_COLLECTIONS.get(current_user['role'])
    user = await db[coll].find_one({"id": current_user['id']}, {"_id": 0, "password_hash": 0})
    orders = await db.orders.find({"created_by": current_user['id'], "status": "confirmed"}, {"_id": 0, "total_amount": 1, "created_at": 1}).to_list(1000)
    today = date.today()
    daily = sum(o['total_amount'] for o in orders if o.get('created_at','')[:10] == today.isoformat())
    month_start = today.replace(day=1).isoformat()
    monthly = sum(o['total_amount'] for o in orders if o.get('created_at','')[:10] >= month_start)
    comms = await db.commissions.find({"user_id": current_user['id']}, {"_id": 0}).to_list(500)
    daily_comm = sum(c['commission_amount'] for c in comms if c.get('created_at','')[:10] == today.isoformat())
    monthly_comm = sum(c['commission_amount'] for c in comms if c.get('created_at','')[:10] >= month_start)
    return {"profile": user, "earnings": {"daily_sales": round(daily,2), "monthly_sales": round(monthly,2), "daily_commission": round(daily_comm,2), "monthly_commission": round(monthly_comm,2), "total_commission": round(sum(c['commission_amount'] for c in comms),2)}}

@api_router.put("/profile/password")
async def change_password(data: dict, current_user: dict = Depends(get_current_user)):
    coll = ROLE_COLLECTIONS.get(current_user['role'])
    full = await db[coll].find_one({"id": current_user['id']})
    if not verify_password(data.get("old_password",""), full.get("password_hash","")):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    await db[coll].update_one({"id": current_user['id']}, {"$set": {"password_hash": hash_password(data["new_password"])}})
    return {"message": "Password changed"}

# ==================== LEAD ROUTES ====================
@api_router.get("/leads")
async def get_leads(status: Optional[str] = None, assigned_to: Optional[str] = None,
                   created_by: Optional[str] = None,
                   limit: int = 500, skip: int = 0,
                   month: Optional[str] = None, year: Optional[str] = None, day: Optional[str] = None,
                   current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user['role'] == 'telecaller': query['assigned_to'] = current_user['id']
    elif current_user['role'] == 'agent': query['assigned_to'] = current_user['id']
    elif current_user['role'] == 'sales_manager':
        # SM sees only leads added by their telecallers (their real contribution)
        tcs = await db.telecallers.find({"managed_by": current_user['id']}, {"_id":0,"id":1}).to_list(500)
        ids = [t['id'] for t in tcs] + [current_user['id']]
        # If a specific telecaller is requested, restrict to that one (but only if in scope)
        target = created_by or assigned_to
        if target:
            if target not in ids:
                raise HTTPException(status_code=403, detail="Not your telecaller")
            query['created_by'] = target
        else:
            query['created_by'] = {"$in": ids}
    elif current_user['role'] == 'assistant_sales_manager':
        sm_id = current_user.get('managed_by','')
        tcs = await db.telecallers.find({"managed_by": sm_id}, {"_id":0,"id":1}).to_list(500)
        ids = [t['id'] for t in tcs] + [sm_id]
        if assigned_to:
            if assigned_to not in ids:
                raise HTTPException(status_code=403, detail="Not in your team")
            query['assigned_to'] = assigned_to
        else:
            query['assigned_to'] = {"$in": ids}
    elif current_user['role'] == 'district_manager':
        ags = await db.agents.find({"managed_by": current_user['id']}, {"_id":0,"id":1}).to_list(500)
        ids = [a['id'] for a in ags] + [current_user['id']]
        if assigned_to:
            if assigned_to not in ids:
                raise HTTPException(status_code=403, detail="Not your agent")
            query['assigned_to'] = assigned_to
        else:
            query['assigned_to'] = {"$in": ids}
    elif current_user['role'] == 'assistant_district_manager':
        dm_id = current_user.get('managed_by','')
        ags = await db.agents.find({"managed_by": dm_id}, {"_id":0,"id":1}).to_list(500)
        ids = [a['id'] for a in ags] + [dm_id]
        if assigned_to:
            if assigned_to not in ids:
                raise HTTPException(status_code=403, detail="Not in your team")
            query['assigned_to'] = assigned_to
        else:
            query['assigned_to'] = {"$in": ids}
    elif assigned_to: query['assigned_to'] = assigned_to
    if status: query['status'] = status
    else:
        # Hide leads routed to collaboration / sales-opportunity contact books
        query['status'] = {"$ne": "routed_to_collab"}
    if year and month and day and month != "all":
        prefix = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        query['created_at'] = {"$gte": prefix, "$lt": prefix + "T99"}
    elif year and month and month != "all":
        prefix = f"{year}-{month.zfill(2)}"
        query['created_at'] = {"$gte": prefix, "$lt": prefix + "~"}
    elif year:
        query['created_at'] = {"$gte": year, "$lt": year + "~"}
    limit = max(1, min(int(limit or 500), 2000))
    skip = max(0, int(skip or 0))
    total = await db.leads.count_documents(query)
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"leads": leads, "total": total, "skip": skip, "limit": limit}

@api_router.get("/leads/today-calls")
async def get_todays_calls(current_user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    query = {"assigned_to": current_user['id'], "$or": [
        {"status": "new"}, {"next_follow_up_date": {"$lte": today, "$ne": ""}},
        {"next_relationship_date": {"$lte": today, "$ne": ""}},
        {"next_repeat_order_date": {"$lte": today, "$ne": ""}},
        {"status": "not_interested", "next_follow_up_date": {"$lte": today, "$ne": ""}},
    ]}
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    motivations = [
        "Every 'no' is one step closer to a 'yes'! Keep pushing!",
        "The best salespeople hear 'no' 7 times before getting a 'yes'.",
        "Today's rejection is tomorrow's conversion. Follow up with confidence!",
        "Offer something new — a sample, a discount, a success story. Change the angle!",
        "Persistence is the key. This customer just needs the right moment.",
        "Remember: they said no to the offer, not to you. Try again differently!",
    ]
    import random
    for l in leads:
        l['call_type'] = 'new'
        if l.get('next_repeat_order_date') and l['next_repeat_order_date'] <= today and l.get('last_order_date'):
            l['call_type'] = 'repeat_order'
            l['call_label'] = 'REPEAT CUSTOMER'
        elif l.get('next_relationship_date') and l['next_relationship_date'] <= today:
            l['call_type'] = 'relationship'
            l['call_label'] = 'RELATIONSHIP CALL'
        elif l.get('next_follow_up_date') and l['next_follow_up_date'] <= today:
            l['call_type'] = 'follow_up'
            l['call_label'] = 'FOLLOW UP'
        if l.get('status') == 'not_interested':
            l['call_type'] = 'not_interested_followup'
            l['call_label'] = 'RE-ENGAGE'
            l['motivation'] = random.choice(motivations)
    return {"leads": leads}

@api_router.get("/leads/follow-ups")
async def get_follow_up_leads(current_user: dict = Depends(get_current_user)):
    """Get repeat order + relationship leads for agents (self or managed agents/telecallers)"""
    today = date.today().isoformat()
    role = current_user['role']
    if role == 'agent':
        user_ids = [current_user['id']]
    elif role == 'telecaller':
        user_ids = [current_user['id']]
    elif role == 'district_manager':
        # Only agents reporting to THIS DM
        agents = await db.agents.find({"managed_by": current_user['id']}, {"_id": 0, "id": 1}).to_list(500)
        user_ids = [a['id'] for a in agents]
    elif role == 'assistant_district_manager':
        dm_id = current_user.get('managed_by', '')
        agents = await db.agents.find({"managed_by": dm_id}, {"_id": 0, "id": 1}).to_list(500)
        user_ids = [a['id'] for a in agents]
    elif role == 'sales_manager':
        # Only telecallers reporting to THIS SM
        tcs = await db.telecallers.find({"managed_by": current_user['id']}, {"_id": 0, "id": 1}).to_list(500)
        user_ids = [t['id'] for t in tcs]
    elif role == 'assistant_sales_manager':
        sm_id = current_user.get('managed_by', '')
        tcs = await db.telecallers.find({"managed_by": sm_id}, {"_id": 0, "id": 1}).to_list(500)
        user_ids = [t['id'] for t in tcs]
    elif role in ['admin']:
        user_ids = None  # All
    else:
        raise HTTPException(status_code=403)
    query = {"$or": [
        {"next_repeat_order_date": {"$ne": "", "$exists": True}},
        {"next_relationship_date": {"$ne": "", "$exists": True}}
    ]}
    if user_ids is not None:
        query["assigned_to"] = {"$in": user_ids}
    leads = await db.leads.find(query, {"_id": 0}).sort("next_repeat_order_date", 1).to_list(500)
    repeat_leads = [l for l in leads if l.get('next_repeat_order_date') and l['next_repeat_order_date'] <= today]
    upcoming_repeat = [l for l in leads if l.get('next_repeat_order_date') and l['next_repeat_order_date'] > today]
    relationship_leads = [l for l in leads if l.get('next_relationship_date') and l['next_relationship_date'] <= today]
    upcoming_relationship = [l for l in leads if l.get('next_relationship_date') and l['next_relationship_date'] > today]
    return {
        "repeat_due": repeat_leads, "repeat_upcoming": upcoming_repeat[:20],
        "relationship_due": relationship_leads, "relationship_upcoming": upcoming_relationship[:20],
        "total_repeat": len(repeat_leads), "total_relationship": len(relationship_leads)
    }


@api_router.post("/leads")
async def create_lead(data: dict, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    phone = (data.get("phone_number") or data.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    if await db.leads.find_one({"phone_number": phone}):
        raise HTTPException(status_code=400, detail="Lead with this phone already exists")
    assigned_to = data.get("assigned_to", current_user['id'])
    # Lookup name of assignee for downstream call-logs/conversations display
    assigned_to_name = current_user.get('name', '') if assigned_to == current_user['id'] else ""
    if not assigned_to_name:
        for c in ROLE_COLLECTIONS.values():
            u = await db[c].find_one({"id": assigned_to}, {"_id": 0, "name": 1})
            if u: assigned_to_name = u.get("name",""); break
    lead = {
        "id": f"lead-{uuid.uuid4().hex[:8]}", "phone_number": phone,
        "name": data.get("name", "Customer"), "source": data.get("source", "manual"),
        "status": "new", "assigned_to": assigned_to, "assigned_to_name": assigned_to_name,
        "product_interest": data.get("product_interest", "general"),
        "remarks": data.get("remarks", ""), "customer_remarks": "",
        "urgency": data.get("urgency", "medium"),
        "next_follow_up_date": data.get("next_follow_up_date", ""),
        "next_follow_up_time": data.get("next_follow_up_time", ""),
        "next_relationship_date": "", "next_repeat_order_date": "",
        "last_order_date": "", "call_logs": [],
        "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.leads.insert_one(lead)
    lead.pop("_id", None)
    return {"lead": lead, "message": "Lead created successfully"}

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead: raise HTTPException(status_code=404, detail="Lead not found")
    orders = await db.orders.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"lead": lead, "orders": orders}

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in data.items() if k not in ["id", "_id", "call_log"]}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    # 15-minute mandatory callback rule for first contact
    if "call_log" in data and data.get("status") not in ["not_interested", "ordered", "delivered"]:
        callback_time = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        update_data["callback_by"] = callback_time
        update_data["callback_done"] = False
    if data.get("status") in ["ordered", "delivered", "not_interested"]:
        update_data["callback_by"] = ""
        update_data["callback_done"] = True
    if "call_log" in data:
        cl = data["call_log"]
        cl["logged_at"] = datetime.now(timezone.utc).isoformat()
        cl["logged_by"] = current_user['id']
        # Stamp customer_name onto the lead the first time it's captured at call time
        # Also overwrite the placeholder "Unknown" name with the real customer name.
        if cl.get("customer_name"):
            existing = (await db.leads.find_one({"id": lead_id}, {"_id": 0, "name": 1}) or {}).get("name", "")
            if not existing or existing.strip().lower() in ("unknown", "—", "-"):
                update_data["name"] = cl["customer_name"]
        await db.leads.update_one({"id": lead_id}, {"$push": {"call_logs": cl}, "$set": update_data})
        # Increment the caller's total_calls counter — supports both telecaller and inhouse_telecaller
        if current_user['role'] == 'telecaller':
            await db.telecallers.update_one({"id": current_user['id']}, {"$inc": {"total_calls": 1}})
        elif current_user['role'] == 'inhouse_telecaller':
            await db.inhouse_telecallers.update_one({"id": current_user['id']}, {"$inc": {"total_calls": 1}})

        # ROUTING: if enquiry_type is not for orders, the contact gets moved to the
        # appropriate manager's collaboration / sales-opportunity contact book and
        # disappears from the telecaller's active pipeline (no follow-up scheduled).
        etype = (cl.get("enquiry_type") or "orders").strip()
        if etype != "orders":
            target_role = "social_media_manager" if etype in ("business_collaboration", "influencer") else "sales_manager" if etype == "sales_opportunity" else "admin"
            lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
            contact = {
                "id": f"colcon-{uuid.uuid4().hex[:8]}",
                "enquiry_type": etype,
                "name": cl.get("customer_name") or (lead.get("name") if lead else "") or "",
                "phone": lead.get("phone_number") if lead else "",
                "notes": cl.get("remarks") or "",
                "source_lead_id": lead_id,
                "source_tc_id": current_user['id'],
                "source_tc_name": current_user.get('name', ''),
                "routed_to_role": target_role,
                "status": "new",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.collaboration_contacts.insert_one(contact); contact.pop("_id", None)
            # Park the lead so it stops appearing in TC's repeat / follow-up lists.
            await db.leads.update_one({"id": lead_id}, {"$set": {
                "status": "routed_to_collab",
                "routed_to_role": target_role,
                "enquiry_type": etype,
                "callback_done": True,
                "callback_by": "",
                "next_follow_up_date": "",
                "next_follow_up_time": "",
                "next_relationship_date": "",
                "next_repeat_order_date": "",
            }})
    else:
        await db.leads.update_one({"id": lead_id}, {"$set": update_data})
    # Send follow-up email notification if time is set
    if data.get("next_follow_up_date") and data.get("next_follow_up_time") and SMTP_EMAIL and SMTP_PASSWORD:
        try:
            user_email = current_user.get('email','')
            lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
            msg = MIMEMultipart()
            msg['Subject'] = f"Follow-up Reminder: {lead.get('name','')}"
            msg['From'] = SMTP_EMAIL; msg['To'] = user_email
            body = f"Reminder: Follow up with {lead.get('name','')} ({lead.get('phone_number','')}) on {data['next_follow_up_date']} at {data['next_follow_up_time']}.\n\nNotes: {data.get('remarks','')}"
            msg.attach(MIMEText(body, 'plain'))
            with smtplib.SMTP_SSL('smtp.gmail.com', 465) as s:
                s.login(SMTP_EMAIL, SMTP_PASSWORD); s.send_message(msg)
        except Exception as e: logger.error(f"Follow-up email failed: {e}")
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return {"lead": lead, "message": "Lead updated"}

# ==================== ORDER ROUTES ====================
@api_router.get("/orders")
async def get_orders(status: Optional[str] = None, date_filter: Optional[str] = None,
                    limit: int = 1000, skip: int = 0,
                    month: Optional[str] = None, year: Optional[str] = None, day: Optional[str] = None,
                    current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user['role'] in ['telecaller', 'agent']: query['created_by'] = current_user['id']
    elif current_user['role'] == 'sales_manager':
        # SM sees only telecaller-created orders FROM THEIR TEAM (managed_by = self)
        tcs = await db.telecallers.find({"managed_by": current_user['id']}, {"_id": 0, "id": 1}).to_list(500)
        asms = await db.assistant_sales_managers.find({"managed_by": current_user['id']}, {"_id": 0, "id": 1}).to_list(50)
        ids = [t['id'] for t in tcs] + [current_user['id']] + [a['id'] for a in asms]
        query['created_by'] = {'$in': ids}
    elif current_user['role'] == 'district_manager':
        # DM sees only agent-created orders FROM THEIR TEAM (managed_by = self)
        ags = await db.agents.find({"managed_by": current_user['id']}, {"_id": 0, "id": 1}).to_list(500)
        adms = await db.assistant_district_managers.find({"managed_by": current_user['id']}, {"_id": 0, "id": 1}).to_list(50)
        ids = [a['id'] for a in ags] + [current_user['id']] + [a['id'] for a in adms]
        query['created_by'] = {'$in': ids}
    elif current_user['role'] == 'assistant_sales_manager':
        # ASM sees same scope as their parent SM
        tcs = await db.telecallers.find({"managed_by": current_user.get('managed_by','')}, {"_id": 0, "id": 1}).to_list(500)
        ids = [t['id'] for t in tcs] + [current_user['id'], current_user.get('managed_by','')]
        query['created_by'] = {'$in': ids}
    elif current_user['role'] == 'assistant_district_manager':
        ags = await db.agents.find({"managed_by": current_user.get('managed_by','')}, {"_id": 0, "id": 1}).to_list(500)
        ids = [a['id'] for a in ags] + [current_user['id'], current_user.get('managed_by','')]
        query['created_by'] = {'$in': ids}
    if status: query['status'] = status
    if date_filter:  # YYYY-MM-DD
        query['created_at'] = {"$regex": f"^{date_filter}"}
    elif year and month and day and month != "all":
        prefix = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        query['created_at'] = {"$gte": prefix, "$lt": prefix + "T99"}
    elif year and month and month != "all":
        prefix = f"{year}-{month.zfill(2)}"
        query['created_at'] = {"$gte": prefix, "$lt": prefix + "~"}
    elif year:
        query['created_at'] = {"$gte": year, "$lt": year + "~"}
    limit = max(1, min(int(limit or 1000), 5000))
    skip = max(0, int(skip or 0))
    total = await db.orders.count_documents(query)
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"orders": orders, "total": total, "skip": skip, "limit": limit}

@api_router.get("/orders/pending")
async def get_pending_orders(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager', 'admin', 'sales_manager']:
        raise HTTPException(status_code=403, detail="Access denied")
    return {"orders": await db.orders.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(100)}

@api_router.post("/orders")
async def create_order(data: dict, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    address = (data.get("customer_address") or "").strip()
    if not address:
        raise HTTPException(status_code=400, detail="Customer address is required")
    # Allow admin to credit the order to a specific telecaller/agent
    creator_id = current_user['id']
    creator_role = current_user['role']
    creator_name = current_user.get('name', '')
    if current_user['role'] == 'admin' and data.get('assigned_to'):
        for c, role in AUTH_COLLECTIONS.items():
            u = await db[c].find_one({"id": data['assigned_to']}, {"_id":0,"id":1,"name":1})
            if u:
                creator_id = u['id']; creator_role = role; creator_name = u.get('name','')
                break
    order_id = f"ORD-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    order = {
        "id": order_id, "customer_name": data.get("customer_name", ""),
        "customer_phone": data.get("customer_phone", ""), "customer_address": address,
        "customer_city": data.get("customer_city", ""), "customer_state": data.get("customer_state", "Kerala"),
        "customer_pincode": data.get("customer_pincode", ""), "customer_landmark": data.get("customer_landmark", ""),
        "items": data.get("items", []), "total_amount": data.get("total_amount", 0),
        "payment_type": data.get("payment_type", "cod"),
        "payment_proof_url": data.get("payment_proof_url", ""), "payment_proof_path": data.get("payment_proof_path", ""),
        "status": "pending", "lead_id": data.get("lead_id", ""),
        "tracking_link": "", "courier_name": "", "tracking_number": "",
        "created_by": creator_id, "created_by_role": creator_role,
        "created_by_name": creator_name,
        "approved_by": None, "approved_at": None, "shipped_at": None, "delivered_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(order)
    order.pop("_id", None)
    if order['lead_id']:
        await db.leads.update_one({"id": order['lead_id']}, {"$set": {"status": "order_created", "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"order": order, "message": "Order created successfully"}

def _can_edit_order(order: dict, user: dict) -> tuple[bool, str]:
    """Role-based access check for editing orders.
    Returns (allowed, reason_if_denied).
    """
    status = order.get("status", "")
    creator_role = order.get("created_by_role", "")
    creator_id = order.get("created_by", "")
    role = user["role"]
    uid = user["id"]
    # Once shipped or delivered → LOCKED for everyone
    if status in ("shipped", "delivered", "rejected", "cancelled"):
        return False, f"Order is {status} — editing is locked"
    if role == "admin":
        return True, ""
    if role == "inventory_manager":
        # Can edit until they ship it (i.e. while status in pending/confirmed)
        return True, ""
    if role in ("sales_manager", "assistant_sales_manager"):
        if creator_role in ("telecaller", "sales_manager", "assistant_sales_manager", "inhouse_telecaller"):
            return True, ""
        return False, "Sales manager can only edit telecaller-team orders"
    if role in ("district_manager", "assistant_district_manager"):
        if creator_role in ("agent", "district_manager", "assistant_district_manager"):
            return True, ""
        return False, "District manager can only edit agent-team orders"
    if role in ("telecaller", "agent", "inhouse_telecaller"):
        # Creators can edit only their OWN order AND only while still pending (not yet approved)
        if creator_id != uid:
            return False, "You can only edit orders you created"
        if status != "pending":
            return False, "Order is already approved — only manager can edit now"
        return True, ""
    return False, "Not authorised to edit orders"

@api_router.put("/orders/{order_id}")
async def edit_order(order_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order: raise HTTPException(status_code=404, detail="Order not found")
    allowed, reason = _can_edit_order(order, current_user)
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)
    # Whitelist editable fields
    editable = {}
    for k in ("customer_name","customer_phone","customer_address","customer_city","customer_state",
              "customer_pincode","customer_landmark","items","total_amount","payment_type"):
        if k in data:
            editable[k] = data[k]
    if "customer_address" in editable:
        addr = (editable["customer_address"] or "").strip()
        if not addr:
            raise HTTPException(status_code=400, detail="Customer address cannot be empty")
        editable["customer_address"] = addr
    if "items" in editable and isinstance(editable["items"], list):
        # Auto-recompute total if items changed and no explicit override
        if "total_amount" not in data:
            editable["total_amount"] = sum((i.get("price",0) or 0) * (i.get("quantity",0) or 0) for i in editable["items"])
    if not editable:
        raise HTTPException(status_code=400, detail="No editable fields provided")
    editable["updated_at"] = datetime.now(timezone.utc).isoformat()
    editable["last_edited_by"] = current_user["id"]
    editable["last_edited_by_name"] = current_user.get("name","")
    editable["last_edited_by_role"] = current_user["role"]
    await db.orders.update_one({"id": order_id}, {"$set": editable})
    await log_audit("edit_order", "order", order_id, current_user["id"], current_user.get("name",""), f"Edited order — fields: {list(editable.keys())}")
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return {"message": "Order updated", "order": updated}

@api_router.put("/orders/{order_id}/approve")
async def approve_order(order_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager', 'admin', 'sales_manager']:
        raise HTTPException(status_code=403, detail="Only managers can approve")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order: raise HTTPException(status_code=404, detail="Order not found")
    if order['status'] != 'pending': raise HTTPException(status_code=400, detail="Not pending")
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "confirmed", "approved_by": current_user['id'], "approved_at": now, "updated_at": now}})
    await log_audit("approve_order", "order", order_id, current_user['id'], current_user.get('name',''), f"Approved order Rs.{order['total_amount']}")
    if order.get('lead_id'):
        today = date.today()
        await db.leads.update_one({"id": order['lead_id']}, {"$set": {
            "status": "converted", "last_order_date": today.isoformat(),
            "next_relationship_date": (today + timedelta(days=15)).isoformat(),
            "next_repeat_order_date": (today + timedelta(days=35)).isoformat(),
            "updated_at": now
        }})
    return {"message": "Order approved - ready to ship"}

@api_router.put("/orders/{order_id}/ship")
async def ship_order(order_id: str, data: dict = None, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager', 'admin', 'sales_manager', 'hr_manager', 'inventory_manager']:
        raise HTTPException(status_code=403)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order: raise HTTPException(status_code=404)
    if order['status'] != 'confirmed': raise HTTPException(status_code=400, detail="Order must be confirmed first")
    data = data or {}
    tracking_link = (data.get("tracking_link") or "").strip()
    if not tracking_link:
        raise HTTPException(status_code=400, detail="Tracking link is required to ship the order")
    now = datetime.now(timezone.utc).isoformat()
    update = {"status": "shipped", "shipped_at": now, "updated_at": now,
              "shipped_by": current_user['id'], "shipped_by_name": current_user.get('name',''),
              "tracking_link": tracking_link,
              "courier_name": data.get("courier_name",""),
              "tracking_number": data.get("tracking_number","")}
    await db.orders.update_one({"id": order_id}, {"$set": update})
    await log_audit("ship_order", "order", order_id, current_user['id'], current_user.get('name',''), f"Shipped order Rs.{order['total_amount']} via {data.get('courier_name','')} - {tracking_link}")
    return {"message": "Order marked as shipped", "tracking_link": tracking_link}

@api_router.put("/orders/{order_id}/deliver")
async def deliver_order(order_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','inventory_manager']:
        raise HTTPException(status_code=403, detail="Only admin/inventory can mark delivered")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order: raise HTTPException(status_code=404)
    if order['status'] != 'shipped': raise HTTPException(status_code=400, detail="Order must be shipped first")
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "delivered", "delivered_at": now, "updated_at": now,
                                                            "delivered_by": current_user['id'], "delivered_by_name": current_user.get('name','')}})
    await log_audit("deliver_order", "order", order_id, current_user['id'], current_user.get('name',''), f"Delivered order Rs.{order['total_amount']}")
    # Credit commission on delivery + bump telecaller/agent conversion stats
    cr = order['created_by_role']
    rates = COMMISSION_RATES.copy()
    cfg = await db.app_config.find_one({"key": "commission_rates"}, {"_id": 0})
    if cfg and cfg.get("rates"): rates.update(cfg["rates"])
    pct = rates.get(cr, 0)
    amt = round(order['total_amount'] * pct / 100, 2)
    if amt > 0:
        comm = {"id": f"comm-{uuid.uuid4().hex[:8]}", "user_id": order['created_by'], "user_role": cr,
                "user_name": order.get('created_by_name',''), "order_id": order_id,
                "order_amount": order['total_amount'], "commission_percentage": pct,
                "commission_amount": amt, "status": "pending", "created_at": now, "paid_at": None, "paid_via": None, "notes": ""}
        await db.commissions.insert_one(comm)
        coll_map = {"telecaller": "telecallers", "agent": "agents", "district_manager": "managers", "sales_manager": "sales_managers"}
        if cr in coll_map: await db[coll_map[cr]].update_one({"id": order['created_by']}, {"$inc": {"commission_earned": amt}})
    # Conversion bump on delivery (telecallers/agents)
    if cr == 'telecaller':
        await db.telecallers.update_one({"id": order['created_by']}, {"$inc": {"conversions": 1, "total_sales": order['total_amount']}})
    elif cr == 'agent':
        await db.agents.update_one({"id": order['created_by']}, {"$inc": {"total_sales": order['total_amount']}})
    # Mark lead as delivered + set repeat/relationship windows if not yet set
    if order.get('lead_id'):
        today = date.today()
        # Persist last order summary so SM/DM dashboards (repeat/relationship) can show
        # product name(s) and order value without a join.
        items = order.get('items') or []
        last_products = ", ".join([(it.get('product_name') or '').strip() for it in items if it.get('product_name')])
        await db.leads.update_one({"id": order['lead_id']}, {"$set": {
            "status": "delivered",
            "last_order_id": order_id,
            "last_order_amount": order.get('total_amount', 0),
            "last_order_products": last_products,
            "last_order_date": today.isoformat(),
            "next_relationship_date": (today + timedelta(days=15)).isoformat(),
            "next_repeat_order_date": (today + timedelta(days=35)).isoformat(),
            "updated_at": now
        }})
    # Record revenue in finance ledger
    pay_method = "cash" if order.get('payment_type') == "cod" else "bank"
    await record_transaction("credit", "order_revenue", order['total_amount'], f"Order {order_id} delivered - {order['customer_name']}", reference_id=order_id, method=pay_method, created_by=current_user['id'])
    return {"message": "Order delivered - commission credited"}

@api_router.put("/orders/{order_id}/reject")
async def reject_order(order_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager', 'admin', 'sales_manager']:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "rejected", "rejected_reason": data.get("reason",""), "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Order rejected"}

# ==================== PRODUCT / REGION / COMMISSION ====================
@api_router.get("/products")
async def get_products(current_user: dict = Depends(get_current_user)):
    return {"products": await db.products.find({}, {"_id": 0}).to_list(100)}

@api_router.post("/products")
async def create_product(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin','sales_manager']: raise HTTPException(status_code=403)
    p = {"id": f"prod-{uuid.uuid4().hex[:6]}", "name": data.get("name",""), "category": data.get("category","general"),
         "price": data.get("price",0), "description": data.get("description",""), "stock": data.get("stock",0),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.products.insert_one(p); p.pop("_id",None)
    return {"product": p, "message": "Product created"}

@api_router.put("/products/{pid}")
async def update_product(pid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin','sales_manager']: raise HTTPException(status_code=403)
    u = {k:v for k,v in data.items() if k not in ["id","_id"]}
    await db.products.update_one({"id": pid}, {"$set": u})
    return {"product": await db.products.find_one({"id": pid}, {"_id": 0}), "message": "Updated"}

@api_router.delete("/products/{pid}")
async def delete_product(pid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin','sales_manager']: raise HTTPException(status_code=403)
    await db.products.delete_one({"id": pid}); return {"message": "Deleted"}

@api_router.get("/regions")
async def get_regions(current_user: dict = Depends(get_current_user)):
    return {"regions": await db.regions.find({}, {"_id": 0}).to_list(100)}

@api_router.get("/dm/my-districts")
async def get_my_districts(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin']: raise HTTPException(status_code=403)
    mgr = await db.managers.find_one({"id": current_user['id']}, {"_id": 0})
    assigned = mgr.get("assigned_districts", []) if mgr else []
    # Get regions for these districts
    regions = []
    for d in assigned:
        district_regions = await db.regions.find({"district": d}, {"_id": 0}).to_list(50)
        regions.extend(district_regions)
    return {"districts": assigned, "regions": regions}

@api_router.post("/regions")
async def create_region(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin']: raise HTTPException(status_code=403)
    r = {"id": f"reg-{uuid.uuid4().hex[:6]}", "name": data.get("name",""), "district": data.get("district",""),
         "state": data.get("state","Kerala"), "pincode": data.get("pincode",""),
         "areas": data.get("areas",[]), "localities": data.get("localities",[]),
         "manager_id": data.get("manager_id",""), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.regions.insert_one(r); r.pop("_id",None)
    return {"region": r, "message": "Region created"}

@api_router.put("/regions/{rid}")
async def update_region(rid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin']: raise HTTPException(status_code=403)
    u = {k:v for k,v in data.items() if k not in ["id","_id"]}
    await db.regions.update_one({"id": rid}, {"$set": u})
    return {"region": await db.regions.find_one({"id": rid}, {"_id": 0})}

@api_router.get("/commissions/my")
async def get_my_commissions(current_user: dict = Depends(get_current_user)):
    comms = await db.commissions.find({"user_id": current_user['id']}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Fix: include legacy 'credited' status in totals
    p = sum(c['commission_amount'] for c in comms if c['status']=='pending')
    a = sum(c['commission_amount'] for c in comms if c['status'] in ('approved','credited'))
    pd = sum(c['commission_amount'] for c in comms if c['status']=='paid')
    # Enrich each commission with order details so telecaller can see customer + items
    order_ids = list({c.get('order_id') for c in comms if c.get('order_id')})
    orders = {}
    if order_ids:
        async for o in db.orders.find({"id": {"$in": order_ids}}, {"_id":0,"id":1,"customer_name":1,"customer_phone":1,"customer_address":1,"total_amount":1,"status":1,"created_at":1,"delivered_at":1}):
            orders[o['id']] = o
    for c in comms:
        o = orders.get(c.get('order_id'),{})
        c['customer_name'] = o.get('customer_name','')
        c['customer_phone'] = o.get('customer_phone','')
        c['order_status'] = o.get('status','')
        c['order_date'] = o.get('created_at','')[:10]
        c['order_total'] = o.get('total_amount', c.get('order_amount',0))
        # Backfill: legacy commissions stored customer_name in user_name field
        if c.get('user_name') and c['user_name'] == o.get('customer_name'):
            c['user_name'] = current_user.get('name','')
    return {"commissions": comms, "summary": {"total_pending": round(p,2), "total_approved": round(a,2), "total_paid": round(pd,2), "total_earned": round(p+a+pd,2), "count": len(comms)}}

@api_router.get("/commissions/all")
async def get_all_commissions(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin','sales_manager','finance_manager','assistant_sales_manager','assistant_district_manager']: raise HTTPException(status_code=403)
    query = {}
    if current_user['role'] in ['sales_manager','assistant_sales_manager']:
        # SM sees only telecaller / SM / asst SM commissions
        query['user_role'] = {"$in": ['telecaller','sales_manager','assistant_sales_manager','inhouse_telecaller']}
    elif current_user['role'] in ['district_manager','assistant_district_manager']:
        # DM sees only agent / DM / asst DM commissions
        query['user_role'] = {"$in": ['agent','district_manager','assistant_district_manager']}
    return {"commissions": await db.commissions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)}

@api_router.put("/commissions/{cid}/pay")
async def mark_paid(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin','sales_manager']: raise HTTPException(status_code=403)
    await db.commissions.update_one({"id": cid}, {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat(), "paid_via": data.get("paid_via","bank_transfer"), "notes": data.get("notes","")}})
    await log_audit("pay_commission", "commission", cid, current_user['id'], current_user.get('name',''), "Commission paid")
    comm = await db.commissions.find_one({"id": cid}, {"_id": 0})
    if comm:
        pay_method = "cash" if data.get("paid_via") == "cash" else "bank"
        await record_transaction("debit", "commission_payout", comm['commission_amount'], f"Commission paid to {comm.get('user_name','')} for {comm.get('order_id','')}", reference_id=cid, method=pay_method, created_by=current_user['id'])
    return {"message": "Paid"}

# ==================== USER MANAGEMENT ====================
@api_router.get("/telecallers")
async def get_telecallers(days: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin','sales_manager','assistant_sales_manager']: raise HTTPException(status_code=403)
    q = {}
    if current_user['role'] == 'sales_manager':
        q['managed_by'] = current_user['id']
    elif current_user['role'] == 'assistant_sales_manager':
        q['managed_by'] = current_user.get('managed_by','')
    tcs = await db.telecallers.find(q, {"_id": 0, "password_hash": 0}).to_list(500)
    # All-time totals
    for tc in tcs:
        call_count = 0
        async for lead in db.leads.find({"assigned_to": tc['id']}, {"_id":0, "call_logs":1}):
            call_count += len(lead.get("call_logs") or [])
        call_count += await db.inhouse_call_logs.count_documents({"caller_id": tc['id']})
        tc['total_calls'] = call_count
        conv = await db.orders.count_documents({"created_by": tc['id'], "status": {"$in": ["confirmed","shipped","delivered"]}})
        tc['conversions'] = conv
        # Show leads ADDED BY this telecaller (not just assigned), so SM sees her real contribution
        tc['total_leads'] = await db.leads.count_documents({"created_by": tc['id']})
        comm_pipeline = await db.commissions.find({"user_id": tc['id'], "status": "paid"}, {"_id":0, "commission_amount":1}).to_list(500)
        tc['commission_earned'] = round(sum(c.get("commission_amount", 0) for c in comm_pipeline), 2)
        # ----- Live "health" stats so the SM sees what each TC sees in their alerts banner -----
        today_iso = date.today().isoformat()
        seven_days_ago = (date.today() - timedelta(days=7)).isoformat()
        # Pending: new+never-called OR follow-up due today/earlier OR interested without an order
        pending = 0
        stale_interested = 0
        not_updated = 0  # leads with no call log AT ALL (regardless of status)
        ordered_lead_ids = set([o.get("lead_id") for o in await db.orders.find({"created_by": tc['id'], "lead_id": {"$exists": True, "$ne": ""}}, {"_id":0,"lead_id":1}).to_list(2000) if o.get("lead_id")])
        async for ld in db.leads.find({"assigned_to": tc['id']}, {"_id":0,"id":1,"status":1,"call_logs":1,"next_follow_up_date":1}):
            logs = ld.get("call_logs") or []
            if ld.get("status") == "new" and len(logs) == 0:
                pending += 1
            if ld.get("status") in ("interested", "ordered") and ld.get("id") not in ordered_lead_ids:
                pending += 1
            nfd = ld.get("next_follow_up_date") or ""
            if nfd and nfd <= today_iso and ld.get("status") not in ("order_created","converted","not_interested"):
                pending += 1
            # Stale interested — no recent call log
            if ld.get("status") == "interested":
                last_ts = ""
                if logs:
                    last = logs[-1]
                    last_ts = (last.get("logged_at") or last.get("timestamp") or "")[:10]
                if not last_ts or last_ts < seven_days_ago:
                    stale_interested += 1
            if not logs:
                not_updated += 1
        tc['pending_calls'] = pending
        tc['stale_interested'] = stale_interested
        tc['not_updated_leads'] = not_updated
        # Calls done TODAY (for the orange "no activity today" warning)
        today_calls = 0
        async for lead in db.leads.find({"assigned_to": tc['id']}, {"_id":0, "call_logs":1}):
            for cl in (lead.get("call_logs") or []):
                ts = cl.get("logged_at") or cl.get("timestamp") or cl.get("date") or cl.get("created_at") or ""
                if str(ts).startswith(today_iso): today_calls += 1
        today_calls += await db.inhouse_call_logs.count_documents({"caller_id": tc['id'], "created_at": {"$regex": f"^{today_iso}"}})
        tc['today_calls'] = today_calls
    # Windowed counts when `days` is provided (3/7/15/30) for the SM tab filter chips
    if days and int(days) > 0:
        from datetime import timedelta as _td
        cutoff_iso = (datetime.now(timezone.utc) - _td(days=int(days))).isoformat()
        for tc in tcs:
            w_calls = 0
            async for lead in db.leads.find({"assigned_to": tc['id']}, {"_id":0, "call_logs":1}):
                for cl in (lead.get("call_logs") or []):
                    ts = cl.get("logged_at") or cl.get("timestamp") or cl.get("date") or cl.get("created_at") or ""
                    if str(ts) >= cutoff_iso:
                        w_calls += 1
            w_calls += await db.inhouse_call_logs.count_documents({"caller_id": tc['id'], "created_at": {"$gte": cutoff_iso}})
            tc['window_calls'] = w_calls
            tc['window_conv'] = await db.orders.count_documents({
                "created_by": tc['id'], "status": {"$in": ["confirmed","shipped","delivered"]},
                "created_at": {"$gte": cutoff_iso}
            })
            tc['window_leads'] = await db.leads.count_documents({
                "created_by": tc['id'], "created_at": {"$gte": cutoff_iso}
            })
    return {"telecallers": tcs}

@api_router.get("/managers")
async def get_managers(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ('admin','hr_manager'): raise HTTPException(status_code=403)
    return {"managers": await db.managers.find({}, {"_id": 0, "password_hash": 0}).to_list(200)}

@api_router.get("/sales-managers")
async def get_sales_managers(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ('admin','hr_manager'): raise HTTPException(status_code=403)
    return {"sales_managers": await db.sales_managers.find({}, {"_id": 0, "password_hash": 0}).to_list(200)}

@api_router.get("/agents")
async def get_agents(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin','sales_manager','assistant_district_manager']: raise HTTPException(status_code=403)
    q = {}
    if current_user['role'] == 'district_manager':
        q['managed_by'] = current_user['id']
    elif current_user['role'] == 'assistant_district_manager':
        q['managed_by'] = current_user.get('managed_by','')
    agents = await db.agents.find(q, {"_id": 0, "password_hash": 0}).to_list(500)
    today = date.today().isoformat()
    week_ago = (date.today() - timedelta(days=7)).isoformat()
    for a in agents:
        orders = await db.orders.find({"created_by": a['id']}, {"_id": 0}).to_list(500)
        a['total_orders'] = len([o for o in orders if o.get('status') in ['confirmed','shipped','delivered']])
        a['total_sales_amount'] = sum(o.get('total_amount',0) for o in orders if o.get('status') in ['confirmed','shipped','delivered'])
        a['sales_today'] = sum(o.get('total_amount',0) for o in orders if o.get('created_at','')[:10]==today and o.get('status') in ['confirmed','shipped','delivered'])
        a['sales_7days'] = sum(o.get('total_amount',0) for o in orders if o.get('created_at','')[:10]>=week_ago and o.get('status') in ['confirmed','shipped','delivered'])
        comms = await db.commissions.find({"user_id": a['id']}, {"_id": 0}).to_list(100)
        a['commission_total'] = round(sum(c.get('commission_amount',0) for c in comms), 2)
        a['commission_pending'] = round(sum(c.get('commission_amount',0) for c in comms if c['status']=='pending'), 2)
        # Live counts (so DM dashboard never shows stale 0)
        a['total_calls'] = await db.agent_call_logs.count_documents({"agent_id": a['id']})
        # Recent samples for inline preview
        a['call_logs'] = await db.agent_call_logs.find({"agent_id": a['id']}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return {"agents": agents}

# ==================== AGENT CALL LOGS (DM → Agent calls) ====================
@api_router.post("/agents/{aid}/call-log")
async def log_agent_call(aid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['district_manager','admin','sales_manager']: raise HTTPException(status_code=403)
    log = {"id": f"acl-{uuid.uuid4().hex[:8]}", "agent_id": aid,
           "caller_id": current_user['id'], "caller_name": current_user.get('name',''),
           "details": data.get("details",""), "call_date": datetime.now(timezone.utc).isoformat()[:10],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.agent_call_logs.insert_one(log); log.pop("_id", None)
    return {"call_log": log}

@api_router.get("/agents/{aid}/call-logs")
async def get_agent_call_logs(aid: str, current_user: dict = Depends(get_current_user)):
    return {"call_logs": await db.agent_call_logs.find({"agent_id": aid}, {"_id": 0}).sort("created_at", -1).to_list(50)}

@api_router.put("/telecallers/{tid}")
async def update_telecaller(tid: str, data: dict, current_user: dict = Depends(get_current_user)):
    """SM (only their TC) / admin can edit telecaller profile fields (language, location, phone, name)."""
    if current_user['role'] not in ('admin', 'sales_manager', 'assistant_sales_manager'):
        raise HTTPException(status_code=403)
    tc = await db.telecallers.find_one({"id": tid}, {"_id": 0, "managed_by": 1})
    if not tc:
        raise HTTPException(status_code=404, detail="Telecaller not found")
    if current_user['role'] == 'sales_manager' and tc.get('managed_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not your telecaller")
    if current_user['role'] == 'assistant_sales_manager' and tc.get('managed_by') != current_user.get('managed_by',''):
        raise HTTPException(status_code=403, detail="Not in your team")
    allowed = {"name", "phone", "language", "location"}
    update = {k: v for k, v in data.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.telecallers.update_one({"id": tid}, {"$set": update})
    return {"message": "Telecaller updated", "fields": list(update.keys())}

@api_router.put("/agents/{aid}")
async def update_agent(aid: str, data: dict, current_user: dict = Depends(get_current_user)):
    """DM (only their agent) / admin can edit agent profile fields (language, area, district, phone, name)."""
    if current_user['role'] not in ('admin', 'district_manager', 'assistant_district_manager'):
        raise HTTPException(status_code=403)
    ag = await db.agents.find_one({"id": aid}, {"_id": 0, "managed_by": 1})
    if not ag:
        raise HTTPException(status_code=404, detail="Agent not found")
    if current_user['role'] == 'district_manager' and ag.get('managed_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not your agent")
    if current_user['role'] == 'assistant_district_manager' and ag.get('managed_by') != current_user.get('managed_by',''):
        raise HTTPException(status_code=403, detail="Not in your team")
    allowed = {"name", "phone", "language", "area", "district", "location"}
    update = {k: v for k, v in data.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.agents.update_one({"id": aid}, {"$set": update})
    return {"message": "Agent updated", "fields": list(update.keys())}

# ==================== UNIFIED CALL LOG SHEET (HR/SM/DM/Admin) ====================
@api_router.get("/call-logs/all")
async def get_all_call_logs(month: str = "", year: str = "", current_user: dict = Depends(get_current_user)):
    role = current_user['role']
    if role not in ['admin','hr_manager','sales_manager','district_manager']:
        raise HTTPException(status_code=403)
    date_filter = {}
    if month and year:
        date_filter = {"$regex": f"^{year}-{month.zfill(2)}"}
    logs = []
    # Agent call logs (DM/SM/Admin)
    if role in ['admin','district_manager','hr_manager','sales_manager']:
        q = {"call_date": date_filter} if date_filter else {}
        ag_logs = await db.agent_call_logs.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        for l in ag_logs:
            l['source'] = 'agent_call'
            l['type'] = 'Agent Call'
        logs.extend(ag_logs)
    # In-house telecaller call logs (HR/Admin/SM)
    if role in ['admin','hr_manager','sales_manager']:
        q2 = {}
        if date_filter: q2 = {"created_at": date_filter}
        ih_logs = await db.inhouse_call_logs.find(q2, {"_id": 0}).sort("created_at", -1).to_list(500)
        for l in ih_logs:
            l['source'] = 'inhouse_call'
            l['type'] = 'In-House Call'
        logs.extend(ih_logs)
    # HR call logs (Admin/HR)
    if role in ['admin','hr_manager']:
        q3 = {}
        if month and year: q3["call_date"] = {"$regex": f"^{year}-{month.zfill(2)}"}
        hr_logs = await db.hr_call_logs.find(q3, {"_id": 0}).sort("created_at", -1).to_list(500)
        for l in hr_logs:
            l['source'] = 'hr_call'
            l['type'] = 'HR Call'
            l['details'] = l.get('notes','') or l.get('next_action','')
            l['status'] = l.get('outcome','')
        logs.extend(hr_logs)
    # Telecaller call logs from leads (any role above)
    leads_q = {}
    leads = await db.leads.find({"call_logs": {"$exists": True, "$ne": []}}, {"_id": 0, "id": 1, "name": 1, "phone_number": 1, "assigned_to": 1, "assigned_to_name": 1, "call_logs": 1}).to_list(500)
    for ld in leads:
        for cl in (ld.get('call_logs') or []):
            cd = cl.get('created_at','') or cl.get('date','')
            if date_filter and not (cd[:7] == f"{year}-{month.zfill(2)}"): continue
            logs.append({
                "id": f"tcl-{ld['id']}-{cd[:19]}",
                "source": "telecaller_call",
                "type": "Telecaller Call",
                "contact_name": ld.get('name',''),
                "phone": ld.get('phone_number',''),
                "caller_name": ld.get('assigned_to_name',''),
                "details": cl.get('remarks','') or cl.get('notes',''),
                "status": cl.get('status',''),
                "created_at": cd,
                "call_date": cd[:10] if cd else ''
            })
    # Sort by created_at desc
    logs.sort(key=lambda x: x.get('created_at',''), reverse=True)
    return {"call_logs": logs[:1000]}

# ==================== CUSTOMER HISTORY (Lead Detail) ====================
@api_router.get("/leads/{lead_id}/history")
async def get_lead_history(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead: raise HTTPException(status_code=404)
    orders = await db.orders.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"lead": lead, "orders": orders, "call_logs": lead.get("call_logs", [])}

# ==================== FUND REQUEST → EXPENSE AUTO ====================

@api_router.get("/hr-managers")
async def get_hr_managers(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','hr_manager']: raise HTTPException(status_code=403)
    hrs = await db.hr_managers.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    # Enrich with per-HR call counts + candidates added (live)
    for h in hrs:
        hid = h.get("id")
        h['total_calls'] = await db.hr_call_logs.count_documents({"caller_id": hid})
        h['candidates_added'] = await db.hiring_candidates.count_documents({"created_by": hid})
        today_iso = date.today().isoformat()
        h['today_calls'] = await db.hr_call_logs.count_documents({"caller_id": hid, "call_date": today_iso})
    return {"hr_managers": hrs}

@api_router.get("/social-media-managers")
async def get_social_media_managers(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    return {"social_media_managers": await db.social_media_managers.find({}, {"_id": 0, "password_hash": 0}).to_list(100)}

@api_router.get("/inhouse-telecallers")
async def get_inhouse_telecallers(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','social_media_manager']: raise HTTPException(status_code=403)
    return {"inhouse_telecallers": await db.inhouse_telecallers.find({}, {"_id": 0, "password_hash": 0}).to_list(100)}

@api_router.get("/content-strategists")
async def get_content_strategists(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','social_media_manager']: raise HTTPException(status_code=403)
    return {"content_strategists": await db.content_strategists.find({}, {"_id": 0, "password_hash": 0}).to_list(100)}

@api_router.get("/all-users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager', 'social_media_manager', 'finance_manager', 'district_manager', 'sales_manager']: raise HTTPException(status_code=403)
    all_users = []
    for coll_name, role in AUTH_COLLECTIONS.items():
        users = await db[coll_name].find({}, {"_id": 0, "password_hash": 0}).to_list(100)
        for u in users:
            u['role'] = role
            u['collection'] = coll_name
        all_users.extend(users)
    return {"users": all_users}

@api_router.get("/hr-team")
async def get_hr_team(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','sales_manager','hr_manager']: raise HTTPException(status_code=403)
    return {"hr_team": await db.hr_team.find({}, {"_id": 0}).to_list(100)}

def _create_user_factory(coll_name, id_prefix, default_pw, extra_fields=None):
    async def create_user(data: dict, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
        email = data.get("email","").lower().strip()
        phone = (data.get("phone") or "").strip()
        if not phone: raise HTTPException(status_code=400, detail="Phone number is required")
        if len(phone.replace("+","").replace(" ","").replace("-","")) < 7:
            raise HTTPException(status_code=400, detail="Invalid phone number")
        # Email is OPTIONAL — only enforce uniqueness when actually provided
        if email and await db[coll_name].find_one({"email": email}): raise HTTPException(status_code=400, detail="Email exists")
        pw = data.get("password", default_pw)
        u = {"id": f"{id_prefix}-{uuid.uuid4().hex[:6]}", "email": email, "name": data.get("name",""),
             "phone": phone,
             "password_hash": hash_password(pw), "salary": data.get("salary", 0),
             "incentive": data.get("incentive", 0),
             # Bank/payment details (optional, for salary disbursement)
             "bank_account_name": data.get("bank_account_name", ""),
             "bank_account_number": data.get("bank_account_number", ""),
             "bank_ifsc": data.get("bank_ifsc", ""),
             "bank_name": data.get("bank_name", ""),
             "upi_id": data.get("upi_id", ""),
             "pan_number": data.get("pan_number", ""),
             "aadhaar_number": data.get("aadhaar_number", ""),
             "address": data.get("address", ""),
             "emergency_contact": data.get("emergency_contact", ""),
             "dob": data.get("dob", ""),
             "joining_date": data.get("joining_date", ""),
             "created_at": datetime.now(timezone.utc).isoformat()}
        if extra_fields:
            for k,v in extra_fields.items():
                if k == "phone": continue  # already set from mandatory validation above
                u[k] = data.get(k, v)
        await db[coll_name].insert_one(u); u.pop("_id",None); u.pop("password_hash",None)
        # If this email was previously tombstoned, clear the tombstone (user is being re-added intentionally)
        await db.deleted_seed_emails.delete_one({"email": email})
        # Send welcome email in background (non-blocking) — only when an actual email is provided
        if email and SMTP_EMAIL and SMTP_PASSWORD:
            def _send_welcome(to_email, name, plain_pw):
                try:
                    msg = MIMEMultipart()
                    msg['Subject'] = "Welcome to Celesta Glow - Your Login Details"
                    msg['From'] = SMTP_EMAIL; msg['To'] = to_email
                    body = f"Hi {name},\n\nWelcome to Celesta Glow CRM!\n\nYour login details:\nEmail: {to_email}\nPassword: {plain_pw}\n\nPlease login and change your password.\n\nBest regards,\nCelesta Glow Team"
                    msg.attach(MIMEText(body, 'plain'))
                    with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=10) as s:
                        s.login(SMTP_EMAIL, SMTP_PASSWORD); s.send_message(msg)
                except Exception as e:
                    logger.error(f"Welcome email failed: {e}")
            background_tasks.add_task(_send_welcome, email, data.get('name',''), pw)
        return {"user": u, "message": f"{coll_name} created"}
    return create_user

api_router.add_api_route("/telecallers", _create_user_factory("telecallers","tc","tc123",{"status":"active","commission_earned":0,"total_calls":0,"conversions":0,"language":"","location":""}), methods=["POST"])
api_router.add_api_route("/agents", _create_user_factory("agents","agent","agent123",{"district":"","area":"","region_id":"","phone":"","status":"active","inventory":{},"commission_earned":0,"total_sales":0,"language":""}), methods=["POST"])
api_router.add_api_route("/managers", _create_user_factory("managers","mgr","mgr123",{"region_id":"","commission_earned":0,"assigned_districts":[]}), methods=["POST"])
api_router.add_api_route("/sales-managers", _create_user_factory("sales_managers","sm","sm123",{"commission_earned":0}), methods=["POST"])
api_router.add_api_route("/finance-managers", _create_user_factory("finance_managers","fin","fin123",{}), methods=["POST"])
api_router.add_api_route("/hr-managers", _create_user_factory("hr_managers","hr","hr123",{}), methods=["POST"])
api_router.add_api_route("/social-media-managers", _create_user_factory("social_media_managers","smm","social123",{}), methods=["POST"])
api_router.add_api_route("/inhouse-telecallers", _create_user_factory("inhouse_telecallers","iht","ih123",{"total_contacted":0,"total_followups":0}), methods=["POST"])
api_router.add_api_route("/content-strategists", _create_user_factory("content_strategists","cs","cs123",{}), methods=["POST"])
api_router.add_api_route("/content-developers", _create_user_factory("content_developers","cd","cd123",{}), methods=["POST"])
api_router.add_api_route("/assistant-sales-managers", _create_user_factory("assistant_sales_managers","asm","asm123",{"commission_earned":0,"managed_by":""}), methods=["POST"])
api_router.add_api_route("/assistant-district-managers", _create_user_factory("assistant_district_managers","adm","adm123",{"commission_earned":0,"managed_by":"","district":""}), methods=["POST"])
api_router.add_api_route("/inventory-managers", _create_user_factory("inventory_managers","inv","inv123",{}), methods=["POST"])
api_router.add_api_route("/digital-marketing-managers", _create_user_factory("digital_marketing_managers","dmm","dm123",{}), methods=["POST"])

# ==================== ASM / ADM MANAGEMENT (for SM / DM dashboards) ====================
@api_router.get("/my-team/asms")
async def get_my_asms(current_user: dict = Depends(get_current_user)):
    """SM/Asst SM/Admin: list Assistant Sales Managers assigned to me."""
    if current_user['role'] not in ('sales_manager', 'assistant_sales_manager', 'admin'):
        raise HTTPException(status_code=403, detail="Only Sales Managers / Admin can view ASMs")
    q = {} if current_user['role'] == 'admin' else {"managed_by": current_user['id']}
    asms = await db.assistant_sales_managers.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    return {"asms": asms, "total": len(asms)}

@api_router.get("/my-team/adms")
async def get_my_adms(current_user: dict = Depends(get_current_user)):
    """DM/Asst DM/Admin: list Assistant District Managers assigned to me."""
    if current_user['role'] not in ('district_manager', 'assistant_district_manager', 'admin'):
        raise HTTPException(status_code=403, detail="Only District Managers / Admin can view ADMs")
    q = {} if current_user['role'] == 'admin' else {"managed_by": current_user['id']}
    adms = await db.assistant_district_managers.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    return {"adms": adms, "total": len(adms)}

@api_router.post("/my-team/asm")
async def add_my_asm(data: dict, current_user: dict = Depends(get_current_user)):
    """SM creates a new Assistant Sales Manager reporting to themselves."""
    if current_user['role'] not in ('sales_manager', 'admin'):
        raise HTTPException(status_code=403, detail="Only Sales Managers / Admin can add ASMs")
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").lower().strip()
    phone = (data.get("phone") or "").strip()
    if not name or not email or not phone:
        raise HTTPException(status_code=400, detail="Name, email and phone are required")
    if await db.deleted_seed_emails.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="This email was previously deleted; choose a different email")
    for c in AUTH_COLLECTIONS:
        if await db[c].find_one({"email": email}):
            raise HTTPException(status_code=400, detail=f"User with email {email} already exists")
    pw = data.get("password") or "asm123"
    asm = {
        "id": f"asm-{uuid.uuid4().hex[:6]}", "email": email, "name": name, "phone": phone,
        "password_hash": hash_password(pw),
        "salary": int(data.get("salary") or 0), "incentive": int(data.get("incentive") or 0),
        "commission_earned": 0, "managed_by": current_user['id'] if current_user['role']=='sales_manager' else (data.get('managed_by') or current_user['id']),
        "managed_by_name": current_user.get('name', '') if current_user['role']=='sales_manager' else "",
        "bank_account_name": data.get("bank_account_name", ""), "bank_account_number": data.get("bank_account_number", ""),
        "bank_ifsc": data.get("bank_ifsc", ""), "bank_name": data.get("bank_name", ""),
        "upi_id": data.get("upi_id", ""), "address": data.get("address", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.assistant_sales_managers.insert_one(asm); asm.pop("_id", None); asm.pop("password_hash", None)
    # Welcome email (best-effort)
    try:
        body = _letterhead("Welcome to Celesta Glow") + f"<p>Dear {name},</p><p>Welcome aboard as an <b>Assistant Sales Manager</b>. You report to <b>{current_user.get('name','your Sales Manager')}</b>.</p><p><b>Login:</b> {email}<br><b>Password:</b> {pw}</p><p>Please log in to your dashboard and change your password.</p>" + _letterhead_footer(show_terms=True)
        await send_email_async(email, f"Welcome — {COMPANY['name']}", body)
    except Exception: pass
    return {"asm": asm, "message": "Assistant Sales Manager added"}

@api_router.post("/my-team/adm")
async def add_my_adm(data: dict, current_user: dict = Depends(get_current_user)):
    """DM creates a new Assistant District Manager reporting to themselves."""
    if current_user['role'] not in ('district_manager', 'admin'):
        raise HTTPException(status_code=403, detail="Only District Managers / Admin can add ADMs")
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").lower().strip()
    phone = (data.get("phone") or "").strip()
    if not name or not email or not phone:
        raise HTTPException(status_code=400, detail="Name, email and phone are required")
    if await db.deleted_seed_emails.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="This email was previously deleted; choose a different email")
    for c in AUTH_COLLECTIONS:
        if await db[c].find_one({"email": email}):
            raise HTTPException(status_code=400, detail=f"User with email {email} already exists")
    pw = data.get("password") or "adm123"
    adm = {
        "id": f"adm-{uuid.uuid4().hex[:6]}", "email": email, "name": name, "phone": phone,
        "password_hash": hash_password(pw),
        "salary": int(data.get("salary") or 0), "incentive": int(data.get("incentive") or 0),
        "commission_earned": 0, "managed_by": current_user['id'] if current_user['role']=='district_manager' else (data.get('managed_by') or current_user['id']),
        "managed_by_name": current_user.get('name', '') if current_user['role']=='district_manager' else "",
        "district": data.get("district", ""),
        "bank_account_name": data.get("bank_account_name", ""), "bank_account_number": data.get("bank_account_number", ""),
        "bank_ifsc": data.get("bank_ifsc", ""), "bank_name": data.get("bank_name", ""),
        "upi_id": data.get("upi_id", ""), "address": data.get("address", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.assistant_district_managers.insert_one(adm); adm.pop("_id", None); adm.pop("password_hash", None)
    try:
        body = _letterhead("Welcome to Celesta Glow") + f"<p>Dear {name},</p><p>Welcome aboard as an <b>Assistant District Manager</b>. You report to <b>{current_user.get('name','your District Manager')}</b>.</p><p><b>Login:</b> {email}<br><b>Password:</b> {pw}</p><p>Please log in to your dashboard and change your password.</p>" + _letterhead_footer(show_terms=True)
        await send_email_async(email, f"Welcome — {COMPANY['name']}", body)
    except Exception: pass
    return {"adm": adm, "message": "Assistant District Manager added"}

@api_router.put("/my-team/asm/{asm_id}")
async def update_my_asm(asm_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ('sales_manager', 'admin'):
        raise HTTPException(status_code=403)
    asm = await db.assistant_sales_managers.find_one({"id": asm_id}, {"_id": 0})
    if not asm: raise HTTPException(status_code=404)
    if current_user['role']=='sales_manager' and asm.get('managed_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not your ASM")
    upd = {k: v for k, v in data.items() if k in ('name','email','phone','salary','incentive','bank_account_name','bank_account_number','bank_ifsc','bank_name','upi_id','address')}
    if 'password' in data and data['password']:
        upd['password_hash'] = hash_password(data['password'])
    upd['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.assistant_sales_managers.update_one({"id": asm_id}, {"$set": upd})
    return {"message": "ASM updated"}

@api_router.put("/my-team/adm/{adm_id}")
async def update_my_adm(adm_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ('district_manager', 'admin'):
        raise HTTPException(status_code=403)
    adm = await db.assistant_district_managers.find_one({"id": adm_id}, {"_id": 0})
    if not adm: raise HTTPException(status_code=404)
    if current_user['role']=='district_manager' and adm.get('managed_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not your ADM")
    upd = {k: v for k, v in data.items() if k in ('name','email','phone','salary','incentive','district','bank_account_name','bank_account_number','bank_ifsc','bank_name','upi_id','address')}
    if 'password' in data and data['password']:
        upd['password_hash'] = hash_password(data['password'])
    upd['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.assistant_district_managers.update_one({"id": adm_id}, {"$set": upd})
    return {"message": "ADM updated"}

async def _get_cc_assistants(target_user_id: str, target_role: str) -> list:
    """If target is a SM/DM, return their ASM/ADM emails for CC."""
    cc_emails = []
    try:
        if target_role == 'sales_manager':
            async for a in db.assistant_sales_managers.find({"managed_by": target_user_id}, {"_id": 0, "email": 1}):
                if a.get('email'): cc_emails.append(a['email'])
        elif target_role == 'district_manager':
            async for a in db.assistant_district_managers.find({"managed_by": target_user_id}, {"_id": 0, "email": 1}):
                if a.get('email'): cc_emails.append(a['email'])
    except Exception: pass
    return cc_emails

# ==================== TEAM ACTIVITY (SM/DM call & visit tracker) ====================
@api_router.get("/team-activity")
async def get_team_activity(
    month: Optional[str] = None, year: Optional[str] = None, day: Optional[str] = None,
    user_id: Optional[str] = None, activity_type: Optional[str] = None,
    days: Optional[int] = None,
    limit: int = 500, skip: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Manager view of agent/telecaller call & home-visit activity.
    Returns lead.call_logs (calls + remarks) + agent_call_logs (home visits) + inhouse_call_logs.
    SM sees only telecallers' & ASM activity; DM sees only agents' & ADM activity."""
    role = current_user['role']
    if role not in ('sales_manager','district_manager','assistant_sales_manager','assistant_district_manager','admin'):
        raise HTTPException(status_code=403, detail="Only Managers / Admin can view team activity")
    # Build user-id allowlist for current manager
    allowed_ids: list = []
    if role in ('sales_manager','assistant_sales_manager'):
        sm_id = current_user['id'] if role == 'sales_manager' else current_user.get('managed_by','')
        async for tc in db.telecallers.find({"managed_by": sm_id}, {"_id":0,"id":1}): allowed_ids.append(tc['id'])
        async for asm in db.assistant_sales_managers.find({"managed_by": sm_id}, {"_id":0,"id":1}): allowed_ids.append(asm['id'])
        # In-house telecallers also fall under SM scope (if managed_by set)
        async for ih in db.inhouse_telecallers.find({"managed_by": sm_id}, {"_id":0,"id":1}): allowed_ids.append(ih['id'])
    elif role in ('district_manager','assistant_district_manager'):
        dm_id = current_user['id'] if role == 'district_manager' else current_user.get('managed_by','')
        async for ag in db.agents.find({"managed_by": dm_id}, {"_id":0,"id":1}): allowed_ids.append(ag['id'])
        async for adm in db.assistant_district_managers.find({"managed_by": dm_id}, {"_id":0,"id":1}): allowed_ids.append(adm['id'])
    elif role == 'admin':
        allowed_ids = None  # all
    if user_id:
        if allowed_ids is not None and user_id not in allowed_ids:
            raise HTTPException(status_code=403, detail="User not in your team")
        allowed_ids = [user_id]

    # Date range
    date_prefix = ""
    if year and month and day and month != "all":
        date_prefix = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    elif year and month and month != "all":
        date_prefix = f"{year}-{month.zfill(2)}"
    elif year:
        date_prefix = f"{year}"

    activities: list = []
    # 1) Lead call_logs (telecaller calls — phone number, notes, status changes)
    if (not activity_type) or activity_type in ('call','calls','telecaller','lead_call'):
        lead_q = {} if allowed_ids is None else {"assigned_to": {"$in": allowed_ids}}
        async for lead in db.leads.find(lead_q, {"_id":0, "id":1, "name":1, "phone_number":1, "assigned_to":1, "assigned_to_name":1, "call_logs":1, "status":1, "product_interest":1}):
            for cl in (lead.get("call_logs") or []):
                ts = (cl.get("logged_at") or cl.get("timestamp") or cl.get("date") or cl.get("created_at") or "")
                if date_prefix and not str(ts).startswith(date_prefix): continue
                activities.append({
                    "type": "call",
                    "user_id": lead.get("assigned_to",""),
                    "user_name": lead.get("assigned_to_name","-"),
                    "customer_name": lead.get("name",""),
                    "customer_phone": lead.get("phone_number",""),
                    "outcome": cl.get("outcome") or cl.get("status") or lead.get("status",""),
                    "notes": cl.get("notes") or cl.get("remarks") or cl.get("customer_remarks") or "",
                    "duration": cl.get("duration") or cl.get("duration_seconds"),
                    "product_interest": lead.get("product_interest",""),
                    "timestamp": ts,
                    "lead_id": lead.get("id",""),
                })
    # 2) Agent call/home visits
    if (not activity_type) or activity_type in ('home_visit','visit','agent','agent_call'):
        ag_q = {}
        if allowed_ids is not None: ag_q["agent_id"] = {"$in": allowed_ids}
        if date_prefix: ag_q["call_date"] = {"$regex": f"^{date_prefix}"}
        async for log in db.agent_call_logs.find(ag_q, {"_id":0}).sort("created_at", -1):
            activities.append({
                "type": "home_visit" if (log.get("visit_type")=="home" or log.get("type")=="visit") else "call",
                "user_id": log.get("agent_id",""),
                "user_name": log.get("agent_name","-"),
                "customer_name": log.get("customer_name","") or log.get("client_name",""),
                "customer_phone": log.get("phone","") or log.get("customer_phone",""),
                "outcome": log.get("outcome",""),
                "notes": log.get("notes","") or log.get("remarks",""),
                "address": log.get("address",""),
                "duration": log.get("duration"),
                "timestamp": log.get("call_date") or log.get("created_at",""),
            })
    # 3) In-house telecaller call logs
    if (not activity_type) or activity_type in ('call','inhouse','telecaller'):
        ih_q = {}
        if allowed_ids is not None: ih_q["caller_id"] = {"$in": allowed_ids}
        if date_prefix: ih_q["created_at"] = {"$regex": f"^{date_prefix}"}
        async for log in db.inhouse_call_logs.find(ih_q, {"_id":0}).sort("created_at", -1):
            activities.append({
                "type": "call",
                "user_id": log.get("caller_id",""),
                "user_name": log.get("caller_name","-"),
                "customer_name": log.get("contact_name","") or log.get("customer_name",""),
                "customer_phone": log.get("phone",""),
                "outcome": log.get("outcome","") or log.get("status",""),
                "notes": log.get("notes","") or log.get("remarks",""),
                "timestamp": log.get("created_at",""),
            })
    # Sort by timestamp desc
    activities.sort(key=lambda x: str(x.get("timestamp","")), reverse=True)
    # Optional "last N days" filter (frontend uses this for the 3/7/15/30 selector)
    if days and int(days) > 0:
        from datetime import timedelta as _td
        cutoff = (datetime.now(timezone.utc) - _td(days=int(days))).isoformat()
        activities = [a for a in activities if str(a.get("timestamp","")) >= cutoff]
    total = len(activities)
    items = activities[skip: skip + max(1, min(int(limit or 500), 2000))]
    # Summary
    summary = {
        "total": total,
        "calls": sum(1 for a in activities if a["type"] == "call"),
        "home_visits": sum(1 for a in activities if a["type"] == "home_visit"),
        "with_notes": sum(1 for a in activities if a.get("notes")),
        "by_user": {},
    }
    for a in activities:
        uid = a.get("user_id") or "_unknown"
        if uid not in summary["by_user"]:
            summary["by_user"][uid] = {"name": a.get("user_name","?"), "total":0, "calls":0, "visits":0}
        summary["by_user"][uid]["total"] += 1
        if a["type"] == "home_visit":
            summary["by_user"][uid]["visits"] += 1
        else:
            summary["by_user"][uid]["calls"] += 1
    return {"activities": items, "summary": summary, "total": total, "skip": skip, "limit": limit}

# ==================== TEAM GROUPS (Language / Locality with HEAD) ====================
@api_router.get("/team/groups")
async def list_groups(current_user: dict = Depends(get_current_user)):
    role = current_user['role']
    if role not in ('sales_manager','district_manager','assistant_sales_manager','assistant_district_manager','admin'):
        raise HTTPException(status_code=403)
    q = {} if role == 'admin' else {"created_by": current_user['id']}
    groups = await db.team_groups.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Enrich with member info
    for g in groups:
        members_full: list = []
        for mid in (g.get("member_ids") or []):
            for coll in ("telecallers","agents","assistant_sales_managers","assistant_district_managers","inhouse_telecallers"):
                u = await db[coll].find_one({"id": mid}, {"_id":0,"id":1,"name":1,"email":1,"phone":1,"language":1,"area":1,"district":1,"total_calls":1,"conversions":1,"commission_earned":1})
                if u:
                    u['role'] = coll[:-1] if not coll.endswith('s') else (coll[:-1])
                    members_full.append(u); break
        g['members'] = members_full
        # Head info
        head = None
        if g.get("head_id"):
            for coll in ("telecallers","agents","assistant_sales_managers","assistant_district_managers"):
                u = await db[coll].find_one({"id": g["head_id"]}, {"_id":0,"id":1,"name":1,"email":1,"phone":1})
                if u: head = u; break
        g['head'] = head
    return {"groups": groups}

@api_router.post("/team/groups")
async def create_group(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ('sales_manager','district_manager','admin'):
        raise HTTPException(status_code=403)
    name = (data.get("name") or "").strip()
    if not name: raise HTTPException(status_code=400, detail="Group name required")
    member_ids = data.get("member_ids") or []
    if len(member_ids) > 10:
        raise HTTPException(status_code=400, detail="A group can have at most 10 members. Create another group for additional members.")
    grp = {
        "id": f"grp-{uuid.uuid4().hex[:8]}",
        "name": name,
        "type": data.get("type", "language"),  # 'language' or 'locality'
        "language": data.get("language", ""),
        "locality": data.get("locality", ""),
        "district": data.get("district", ""),
        "head_id": data.get("head_id", ""),
        "member_ids": member_ids,
        "created_by": current_user['id'],
        "created_by_name": current_user.get('name', ''),
        "created_by_role": current_user.get('role', ''),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.team_groups.insert_one(grp); grp.pop("_id", None)
    return {"group": grp, "message": "Group created"}

@api_router.put("/team/groups/{gid}")
async def update_group(gid: str, data: dict, current_user: dict = Depends(get_current_user)):
    grp = await db.team_groups.find_one({"id": gid}, {"_id": 0})
    if not grp: raise HTTPException(status_code=404)
    if current_user['role'] != 'admin' and grp.get('created_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not your group")
    upd = {k: v for k, v in data.items() if k in ('name','type','language','locality','district','head_id','member_ids')}
    if 'member_ids' in upd and len(upd['member_ids']) > 10:
        raise HTTPException(status_code=400, detail="A group can have at most 10 members.")
    upd['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.team_groups.update_one({"id": gid}, {"$set": upd})
    return {"message": "Group updated"}

@api_router.delete("/team/groups/{gid}")
async def delete_group(gid: str, current_user: dict = Depends(get_current_user)):
    grp = await db.team_groups.find_one({"id": gid}, {"_id": 0})
    if not grp: raise HTTPException(status_code=404)
    if current_user['role'] != 'admin' and grp.get('created_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not your group")
    await db.team_groups.delete_one({"id": gid})
    return {"message": "Group deleted"}

@api_router.post("/team/groups/{gid}/send-performance-report")
async def send_perf_report(gid: str, data: dict = None, current_user: dict = Depends(get_current_user)):
    """Email the head of a group with the daily performance summary of all sub-members."""
    if current_user['role'] not in ('sales_manager','district_manager','admin'):
        raise HTTPException(status_code=403)
    grp = await db.team_groups.find_one({"id": gid}, {"_id": 0})
    if not grp: raise HTTPException(status_code=404)
    head = None
    for coll in ("telecallers","agents","assistant_sales_managers","assistant_district_managers"):
        u = await db[coll].find_one({"id": grp.get("head_id","")}, {"_id":0,"id":1,"name":1,"email":1})
        if u: head = u; break
    if not head or not head.get("email"):
        raise HTTPException(status_code=400, detail="Group has no head with email — set a head first")
    # Compute stats per member for the requested period (defaults to today)
    period_label = "Today"
    today = date.today().isoformat()
    date_prefix = (data or {}).get("date") or today
    if (data or {}).get("month") and (data or {}).get("year"):
        date_prefix = f"{(data or {})['year']}-{str((data or {})['month']).zfill(2)}"
        period_label = f"{(data or {})['month']}/{(data or {})['year']}"
    rows_html = ""
    totals = {"calls": 0, "orders": 0, "revenue": 0}
    for mid in (grp.get("member_ids") or []):
        # Find member name
        member = None
        for coll in ("telecallers","agents","assistant_sales_managers","assistant_district_managers","inhouse_telecallers"):
            u = await db[coll].find_one({"id": mid}, {"_id":0,"id":1,"name":1})
            if u: member = u; break
        if not member: continue
        # Calls: count call_logs in leads + agent_call_logs that match the prefix
        calls_count = 0
        async for lead in db.leads.find({"assigned_to": mid}, {"_id":0,"call_logs":1}):
            for cl in (lead.get("call_logs") or []):
                ts = str(cl.get("timestamp") or cl.get("date") or cl.get("created_at") or "")
                if ts.startswith(date_prefix): calls_count += 1
        calls_count += await db.agent_call_logs.count_documents({"agent_id": mid, "call_date": {"$regex": f"^{date_prefix}"}})
        calls_count += await db.inhouse_call_logs.count_documents({"caller_id": mid, "created_at": {"$regex": f"^{date_prefix}"}})
        # Orders & revenue
        orders_q = {"created_by": mid, "created_at": {"$regex": f"^{date_prefix}"}}
        orders_count = await db.orders.count_documents(orders_q)
        revenue = 0
        async for o in db.orders.find(orders_q, {"_id":0,"total_amount":1,"status":1}):
            if o.get("status") in ("delivered","confirmed","shipped"):
                revenue += int(o.get("total_amount") or 0)
        rows_html += f"<tr><td style='padding:8px;border:1px solid #E5E3DB'>{member['name']}</td><td style='padding:8px;border:1px solid #E5E3DB;text-align:center'>{calls_count}</td><td style='padding:8px;border:1px solid #E5E3DB;text-align:center'>{orders_count}</td><td style='padding:8px;border:1px solid #E5E3DB;text-align:right'>Rs.{revenue:,}</td></tr>"
        totals["calls"] += calls_count; totals["orders"] += orders_count; totals["revenue"] += revenue
    body = _letterhead(f"Daily Performance Report — {grp['name']}") + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{head['name']}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>You are the <b>group head</b> of <b>{grp['name']}</b> ({grp.get('type','').title()} based group of {len(grp.get('member_ids') or [])} members). Below is the performance summary for <b>{period_label}</b> ({date_prefix}). Please review and coach your members where needed.</p>
<table style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px;margin:16px 0'>
  <thead><tr style='background:#F9F8F6'><th style='padding:8px;border:1px solid #E5E3DB;text-align:left'>Member</th><th style='padding:8px;border:1px solid #E5E3DB'>Calls</th><th style='padding:8px;border:1px solid #E5E3DB'>Orders</th><th style='padding:8px;border:1px solid #E5E3DB'>Revenue</th></tr></thead>
  <tbody>{rows_html}</tbody>
  <tfoot><tr style='background:#3B5249;color:white'><td style='padding:8px'><b>Total</b></td><td style='padding:8px;text-align:center'><b>{totals['calls']}</b></td><td style='padding:8px;text-align:center'><b>{totals['orders']}</b></td><td style='padding:8px;text-align:right'><b>Rs.{totals['revenue']:,}</b></td></tr></tfoot>
</table>
<p style='font-family:Georgia,serif;font-size:12px;color:#59615D;line-height:1.6'>Please log in to your Celesta Glow dashboard to view detailed call notes and home-visit logs. Reach out to under-performing members and share best practices.</p>
""" + _letterhead_footer(signatory=current_user.get('name','Manager'))
    success, err = await send_email_async(head['email'], f"Daily Performance Report — {grp['name']}", body)
    if not success:
        raise HTTPException(status_code=502, detail=f"Email failed: {err}")
    return {"message": f"Performance report sent to {head['name']} ({head['email']})", "totals": totals}

@api_router.post("/hr-team")
async def create_hr_member(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','sales_manager','hr_manager']: raise HTTPException(status_code=403)
    phone = (data.get("phone") or "").strip()
    if not phone: raise HTTPException(status_code=400, detail="Phone number is required")
    if len(phone.replace("+","").replace(" ","").replace("-","")) < 7:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    # If a login-role is specified, also create the real login user in the role collection.
    role = (data.get("role") or "").strip()
    email = (data.get("email") or "").lower().strip()
    created_user_id = None
    if role and role in ROLE_COLLECTIONS and email:
        coll_name = ROLE_COLLECTIONS[role]
        if not await db[coll_name].find_one({"email": email}):
            pw = data.get("password") or "Welcome@123"
            role_id_prefix = {"admin":"admin","sales_manager":"sm","district_manager":"mgr","telecaller":"tc","agent":"agent","finance_manager":"fin","hr_manager":"hr","social_media_manager":"smm","inhouse_telecaller":"iht","content_strategist":"cs","content_developer":"cd","assistant_sales_manager":"asm","assistant_district_manager":"adm","inventory_manager":"inv","digital_marketing_manager":"dmm"}.get(role, "usr")
            created_user_id = f"{role_id_prefix}-{uuid.uuid4().hex[:6]}"
            user_doc = {
                "id": created_user_id,
                "email": email, "name": data.get("name",""),
                "phone": phone,
                "password_hash": hash_password(pw),
                "salary": data.get("salary", 0), "incentive": data.get("incentive", 0),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db[coll_name].insert_one(user_doc)
            await db.deleted_seed_emails.delete_one({"email": email})
        else:
            existing = await db[coll_name].find_one({"email": email}, {"_id": 0, "id": 1})
            created_user_id = existing.get("id") if existing else None
    m = {"id": created_user_id or f"hr-{uuid.uuid4().hex[:6]}",
         "hr_team_id": f"hr-{uuid.uuid4().hex[:6]}",
         "name": data.get("name",""), "role_title": data.get("role_title","") or role,
         "email": email, "phone": phone, "department": data.get("department",""),
         "salary": data.get("salary",0), "created_at": datetime.now(timezone.utc).isoformat()}
    # Store a separate directory record (uses hr_team_id so it doesn't shadow the login user's id)
    hr_record = {**m, "id": m["hr_team_id"]}
    await db.hr_team.insert_one(hr_record)
    return {**m, "message": "HR team member added"}

@api_router.put("/users/{user_id}/update")
async def update_user(user_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','district_manager','sales_manager','hr_manager','assistant_district_manager','assistant_sales_manager']: raise HTTPException(status_code=403)
    for coll in ROLE_COLLECTIONS.values():
        u = await db[coll].find_one({"id": user_id})
        if u:
            upd = {k:v for k,v in data.items() if k not in ["id","_id","password_hash"]}
            if "password" in data and data["password"]: upd["password_hash"] = hash_password(data["password"])
            await db[coll].update_one({"id": user_id}, {"$set": upd})
            await log_audit("update_user", coll, user_id, current_user['id'], current_user.get('name',''), f"Updated user fields: {list(upd.keys())}")
            return {"message": "User updated"}
    raise HTTPException(status_code=404, detail="User not found")

@api_router.put("/managers/{mid}/assign-districts")
async def assign_districts(mid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    districts = data.get("districts", [])
    await db.managers.update_one({"id": mid}, {"$set": {"assigned_districts": districts}})
    return {"message": f"Districts assigned: {', '.join(districts)}"}

# ==================== FUND REQUESTS ====================
@api_router.post("/fund-requests")
async def create_fund_request(data: dict, current_user: dict = Depends(get_current_user)):
    fr = {"id": f"fr-{uuid.uuid4().hex[:8]}", "requested_by": current_user['id'],
          "requested_by_name": current_user.get('name',''), "requested_by_role": current_user['role'],
          "amount": data.get("amount",0), "reason": data.get("reason",""), "category": data.get("category","general"),
          "status": "pending", "approved_by": None, "payment_proof_path": "",
          "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.fund_requests.insert_one(fr); fr.pop("_id",None)
    return {"fund_request": fr, "message": "Fund request submitted"}

@api_router.get("/fund-requests")
async def get_fund_requests(limit: int = 200, skip: int = 0,
                           month: Optional[str] = None, year: Optional[str] = None, day: Optional[str] = None,
                           current_user: dict = Depends(get_current_user)):
    q = {}
    if current_user['role'] in ['telecaller','agent']: q['requested_by'] = current_user['id']
    if year and month and day and month != "all":
        prefix = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        q['created_at'] = {"$gte": prefix, "$lt": prefix + "T99"}
    elif year and month and month != "all":
        prefix = f"{year}-{month.zfill(2)}"
        q['created_at'] = {"$gte": prefix, "$lt": prefix + "~"}
    elif year:
        q['created_at'] = {"$gte": year, "$lt": year + "~"}
    limit = max(1, min(int(limit or 200), 1000))
    skip = max(0, int(skip or 0))
    total = await db.fund_requests.count_documents(q)
    items = await db.fund_requests.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"fund_requests": items, "total": total, "skip": skip, "limit": limit}

@api_router.put("/fund-requests/{frid}/approve")
async def approve_fund_request(frid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','district_manager','sales_manager','finance_manager']: raise HTTPException(status_code=403)
    debit_from = data.get("debit_from", "bank")
    status = data.get("status","approved")
    await db.fund_requests.update_one({"id": frid}, {"$set": {"status": status, "approved_by": current_user['id'], "debit_from": debit_from, "updated_at": datetime.now(timezone.utc).isoformat()}})
    if status == "approved":
        fr = await db.fund_requests.find_one({"id": frid}, {"_id": 0})
        if fr:
            # Auto-add to expenses sheet
            exp = {"id": f"exp-{uuid.uuid4().hex[:8]}", "title": f"Fund: {fr.get('reason','')}", "amount": fr['amount'],
                   "category": fr.get('category','general'), "description": f"Auto from fund request by {fr.get('requested_by_name','')}",
                   "status": "approved", "debit_from": debit_from, "proof_path": "",
                   "created_by": fr.get('requested_by',''), "created_by_name": fr.get('requested_by_name',''),
                   "approved_by": current_user['id'], "created_at": datetime.now(timezone.utc).isoformat()}
            await db.expenses.insert_one(exp)
            await record_transaction("debit", "fund_disbursement", fr['amount'], f"Fund to {fr.get('requested_by_name','')} - {fr.get('reason','')}", reference_id=frid, method=debit_from, created_by=current_user['id'])
            # If this fund request was tied to an influencer collab, update its status too
            if fr.get("linked_influencer_id"):
                await db.influencer_outreach.update_one(
                    {"id": fr["linked_influencer_id"]},
                    {"$set": {"fund_request_status": "approved", "fund_approved_at": datetime.now(timezone.utc).isoformat(), "expense_id": exp["id"]}}
                )
    elif status == "rejected":
        fr = await db.fund_requests.find_one({"id": frid}, {"_id": 0})
        if fr and fr.get("linked_influencer_id"):
            await db.influencer_outreach.update_one(
                {"id": fr["linked_influencer_id"]},
                {"$set": {"fund_request_status": "rejected"}}
            )
    return {"message": "Fund request updated"}

@api_router.put("/fund-requests/{frid}/complete")
async def complete_fund_request(frid: str, data: dict, current_user: dict = Depends(get_current_user)):
    await db.fund_requests.update_one({"id": frid}, {"$set": {"status": "completed", "payment_proof_path": data.get("payment_proof_path",""), "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Fund request completed"}

# ==================== EXPENSES ====================
@api_router.post("/expenses")
async def create_expense(data: dict, current_user: dict = Depends(get_current_user)):
    e = {"id": f"exp-{uuid.uuid4().hex[:8]}", "title": data.get("title",""), "amount": data.get("amount",0),
         "category": data.get("category","general"), "description": data.get("description",""),
         "proof_path": data.get("proof_path",""), "created_by": current_user['id'],
         "created_by_name": current_user.get('name',''), "status": "pending",
         # Optional "to be paid to" tracking — useful when staff pays from own pocket and needs reimbursement
         "paid_to_name": (data.get("paid_to_name") or "").strip(),
         "paid_to_user_id": data.get("paid_to_user_id", ""),
         "paid_to_phone": (data.get("paid_to_phone") or "").strip(),
         "reimburse_status": "to_be_paid" if (data.get("paid_to_name") or data.get("paid_to_user_id")) else "",
         "approved_by": None, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.expenses.insert_one(e); e.pop("_id",None)
    return {"expense": e, "message": "Expense created"}

@api_router.put("/expenses/{eid}")
async def update_expense(eid: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Edit expense details — title, amount, category, description, paid_to fields. Only creator/admin/finance can edit pending expenses."""
    exp = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not exp: raise HTTPException(status_code=404, detail="Expense not found")
    if current_user['role'] not in ('admin','finance_manager') and exp.get('created_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Only creator, finance manager or admin can edit")
    if exp.get('status') == 'approved' and current_user['role'] not in ('admin','finance_manager'):
        raise HTTPException(status_code=400, detail="Approved expense can only be edited by admin/finance")
    upd = {k: v for k, v in data.items() if k in ('title','amount','category','description','proof_path','paid_to_name','paid_to_user_id','paid_to_phone','notes')}
    if 'paid_to_name' in upd or 'paid_to_user_id' in upd:
        upd['reimburse_status'] = "to_be_paid" if (upd.get('paid_to_name') or upd.get('paid_to_user_id') or exp.get('paid_to_name') or exp.get('paid_to_user_id')) else ""
    upd['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.expenses.update_one({"id": eid}, {"$set": upd})
    return {"message": "Expense updated", "expense": await db.expenses.find_one({"id": eid}, {"_id": 0})}

@api_router.put("/expenses/{eid}/mark-paid")
async def mark_expense_paid(eid: str, data: dict = None, current_user: dict = Depends(get_current_user)):
    """Mark expense as reimbursed/paid to the payee — only admin/finance."""
    if current_user['role'] not in ('admin','finance_manager'):
        raise HTTPException(status_code=403)
    data = data or {}
    method = data.get("method", "cash")
    exp = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not exp: raise HTTPException(status_code=404)
    update = {
        "reimburse_status": "paid",
        "reimbursed_at": datetime.now(timezone.utc).isoformat(),
        "reimbursed_by": current_user['id'],
        "reimbursed_by_name": current_user.get('name', ''),
        "reimburse_method": method,
    }
    await db.expenses.update_one({"id": eid}, {"$set": update})
    # Optionally record a finance ledger debit if not already approved & debited
    if exp.get('status') != 'approved' and exp.get('paid_to_name'):
        await record_transaction("debit", "reimbursement",
            exp.get('amount', 0),
            f"Reimbursement: {exp.get('title','')} → {exp.get('paid_to_name','')}",
            reference_id=eid, method=method, created_by=current_user['id'])
    return {"message": "Marked as paid"}

@api_router.get("/expenses")
async def get_expenses(limit: int = 500, skip: int = 0,
                       month: Optional[str] = None, year: Optional[str] = None, day: Optional[str] = None,
                       reimburse_status: Optional[str] = None,
                       current_user: dict = Depends(get_current_user)):
    q = {}
    if reimburse_status:
        q['reimburse_status'] = reimburse_status
    if year and month and day and month != "all":
        prefix = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        q['created_at'] = {"$gte": prefix, "$lt": prefix + "T99"}
    elif year and month and month != "all":
        prefix = f"{year}-{month.zfill(2)}"
        q['created_at'] = {"$gte": prefix, "$lt": prefix + "~"}
    elif year:
        q['created_at'] = {"$gte": year, "$lt": year + "~"}
    limit = max(1, min(int(limit or 500), 2000))
    skip = max(0, int(skip or 0))
    total = await db.expenses.count_documents(q)
    items = await db.expenses.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"expenses": items, "total": total, "skip": skip, "limit": limit}

@api_router.put("/expenses/{eid}/approve")
async def approve_expense(eid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    debit_from = data.get("debit_from", "bank")
    await db.expenses.update_one({"id": eid}, {"$set": {"status": data.get("status","approved"), "approved_by": current_user['id'], "debit_from": debit_from}})
    if data.get("status") == "approved":
        exp = await db.expenses.find_one({"id": eid}, {"_id": 0})
        if exp:
            await record_transaction("debit", "expense", exp['amount'], f"Expense: {exp['title']} ({exp['category']})", reference_id=eid, method=debit_from, created_by=current_user['id'])
    return {"message": "Expense updated"}

DELETE_PASSWORD = "XYCDF6F@123"
wrong_password_attempts = {}

async def check_delete_password(password, current_user):
    """Check password with 2-attempt lockout + email notification"""
    uid = current_user['id']
    if password == DELETE_PASSWORD:
        wrong_password_attempts.pop(uid, None)
        return True
    wrong_password_attempts[uid] = wrong_password_attempts.get(uid, 0) + 1
    if wrong_password_attempts[uid] >= 2:
        # Send alert email
        try:
            msg = MIMEMultipart()
            msg['Subject'] = f"SECURITY ALERT: Wrong delete password by {current_user.get('name','')}"
            msg['From'] = SMTP_EMAIL; msg['To'] = "admin@celestaglow.com"
            body = f"User {current_user.get('name','')} ({current_user.get('email','')}) entered wrong delete password {wrong_password_attempts[uid]} times.\n\nTime: {datetime.now(timezone.utc).isoformat()}"
            msg.attach(MIMEText(body, 'plain'))
            if SMTP_EMAIL and SMTP_PASSWORD:
                with smtplib.SMTP_SSL('smtp.gmail.com', 465) as s:
                    s.login(SMTP_EMAIL, SMTP_PASSWORD); s.send_message(msg)
        except Exception as e: logger.error(f"Alert email failed: {e}")
        wrong_password_attempts[uid] = 0
    raise HTTPException(status_code=403, detail=f"Wrong password ({wrong_password_attempts.get(uid,0)} attempt{'s' if wrong_password_attempts.get(uid,0)!=1 else ''})")

@api_router.delete("/expenses/{eid}")
async def delete_expense(eid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    await check_delete_password(data.get("password",""), current_user)
    exp = await db.expenses.find_one({"id": eid}, {"_id": 0})
    if not exp: raise HTTPException(status_code=404)
    if exp.get("status") == "approved":
        method = exp.get("debit_from", "bank")
        await record_transaction("credit", "expense_reversal", exp['amount'], f"Reversed expense: {exp['title']}", reference_id=eid, method=method, created_by=current_user['id'])
    await db.expenses.delete_one({"id": eid})
    return {"message": "Expense deleted and balance restored"}

# ==================== PAYROLL ====================
@api_router.get("/payroll/suggest/{user_id}")
async def suggest_payroll(user_id: str, month: str = "", year: str = "", current_user: dict = Depends(get_current_user)):
    """Auto-compute payroll suggestion from attendance: hours_worked, present/half days, and hourly rate."""
    if current_user['role'] not in ['admin', 'finance_manager', 'hr_manager']:
        raise HTTPException(status_code=403)
    ist = _ist_now()
    m = (month or str(ist.month)).zfill(2)
    y = year or str(ist.year)
    prefix = f"{y}-{m}"
    # Find user
    user = None
    user_role = None
    for role, coll in ROLE_COLLECTIONS.items():
        u = await db[coll].find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if u:
            user = u
            user_role = role
            break
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    records = await db.attendance.find({"user_id": user_id, "date": {"$regex": f"^{prefix}"}}, {"_id": 0}).to_list(500)
    total_hours = round(sum(r.get('hours_worked') or 0 for r in records), 2)
    present_days = len([r for r in records if r.get('status') == 'present'])
    half_days = len([r for r in records if r.get('status') == 'half_day'])
    leave_days = len([r for r in records if r.get('status') == 'leave'])
    absent_days = len([r for r in records if r.get('status') == 'absent'])
    working_days = present_days + half_days * 0.5
    # Hourly rate = monthly salary / (total_working_days * standard_hours_per_day)
    base_salary = user.get('salary', 0) or 0
    standard_hours_per_day = 8.5  # 9:30-18:00 minus 30min lunch
    total_working_days = 26
    hourly_rate = round(base_salary / (total_working_days * standard_hours_per_day), 2) if base_salary > 0 else 0
    computed_salary = round(hourly_rate * total_hours, 2) if total_hours > 0 else round(base_salary * (working_days / total_working_days), 2)
    # Pending advances
    advs = await db.advances.find({"user_id": user_id, "status": "active", "deducted_in_payroll": False}, {"_id": 0}).to_list(100)
    advance_deductions = round(sum(a.get('amount', 0) for a in advs), 2)
    # Pending commissions this month
    comm_total = 0
    try:
        coms = await db.commissions.find({"user_id": user_id, "status": "pending"}, {"_id": 0}).to_list(100)
        for c in coms:
            cd = c.get('created_at', '')
            if cd[:7] == prefix:
                comm_total += c.get('commission_amount', 0)
    except Exception:
        pass
    return {
        "user_id": user_id,
        "user_name": user.get('name', ''),
        "user_role": user_role,
        "month": m, "year": y,
        "attendance": {
            "total_hours": total_hours,
            "present_days": present_days,
            "half_days": half_days,
            "leave_days": leave_days,
            "absent_days": absent_days,
            "working_days": working_days,
            "marked_days": len(records),
            "total_working_days": total_working_days,
        },
        "hourly_rate": hourly_rate,
        "base_salary": base_salary,
        "hours_based_salary": round(hourly_rate * total_hours, 2),
        "prorated_salary": round(base_salary * (working_days / total_working_days), 2) if total_working_days > 0 else 0,
        "suggested_basic": computed_salary,
        "incentive": user.get('incentive', 0) or 0,
        "advance_deductions": advance_deductions,
        "commission": round(comm_total, 2),
    }

@api_router.post("/payroll")
async def create_payroll(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager','hr_manager']: raise HTTPException(status_code=403)
    pr = {"id": f"pay-{uuid.uuid4().hex[:8]}", "user_id": data.get("user_id",""), "user_name": data.get("user_name",""),
          "user_role": data.get("user_role",""), "month": data.get("month",""), "year": data.get("year",""),
          "basic_salary": data.get("basic_salary",0), "incentive": data.get("incentive",0), "bonus": data.get("bonus",0),
          "deductions": data.get("deductions",0), "advance_deductions": data.get("advance_deductions",0),
          "commission": data.get("commission",0),
          "working_days": data.get("working_days", 0), "total_working_days": data.get("total_working_days", 30),
          "total_hours": data.get("total_hours", 0), "hourly_rate": data.get("hourly_rate", 0),
          "net_salary": data.get("basic_salary",0) + data.get("incentive",0) + data.get("bonus",0) + data.get("commission",0) - data.get("deductions",0) - data.get("advance_deductions",0),
          "status": "pending", "paid_at": None, "proof_path": "",
          "created_at": datetime.now(timezone.utc).isoformat()}
    await db.payroll.insert_one(pr); pr.pop("_id",None)
    return {"payroll": pr, "message": "Payroll record created"}

@api_router.get("/payroll")
async def get_payroll(limit: int = 200, skip: int = 0,
                     month: Optional[str] = None, year: Optional[str] = None,
                     current_user: dict = Depends(get_current_user)):
    q = {}
    if current_user['role'] in ['telecaller','agent']: q['user_id'] = current_user['id']
    if month and month != "all": q['month'] = month
    if year: q['year'] = year
    limit = max(1, min(int(limit or 200), 1000))
    skip = max(0, int(skip or 0))
    total = await db.payroll.count_documents(q)
    items = await db.payroll.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"payroll": items, "total": total, "skip": skip, "limit": limit}

@api_router.put("/payroll/{pid}/process")
async def process_payroll(pid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    await db.payroll.update_one({"id": pid}, {"$set": {"status": "processed", "paid_at": datetime.now(timezone.utc).isoformat(), "proof_path": data.get("proof_path","")}})
    pr = await db.payroll.find_one({"id": pid}, {"_id": 0})
    if pr:
        await record_transaction("debit", "salary", pr.get('net_salary', 0), f"Salary: {pr.get('user_name','')} ({pr.get('month','')}/{pr.get('year','')})", reference_id=pid, method="bank", created_by=current_user['id'])
    return {"message": "Payroll processed"}

# ==================== TASKS — see richer implementation around line 1579 ====================

# ==================== INSTRUCTIONS — see richer implementation around line 2260 ====================

# ==================== CONTENT / CONTACTS / INVESTMENTS ====================
@api_router.post("/content")
async def create_content(data: dict, current_user: dict = Depends(get_current_user)):
    c = {"id": f"cnt-{uuid.uuid4().hex[:8]}", "title": data.get("title",""), "type": data.get("type",""),
         "platform": data.get("platform",""), "status": data.get("status","draft"),
         "assigned_to": data.get("assigned_to",""), "budget": data.get("budget",0),
         "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.content_tracker.insert_one(c); c.pop("_id",None)
    return {"content": c}

@api_router.get("/content")
async def get_content(current_user: dict = Depends(get_current_user)):
    return {"content": await db.content_tracker.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.post("/contacts")
async def create_contact(data: dict, current_user: dict = Depends(get_current_user)):
    c = {"id": f"con-{uuid.uuid4().hex[:8]}", "name": data.get("name",""), "phone": data.get("phone",""),
         "email": data.get("email",""), "type": data.get("type","influencer"),
         "notes": data.get("notes",""), "last_contact_date": data.get("last_contact_date",""),
         "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.contacts.insert_one(c); c.pop("_id",None)
    return {"contact": c}

@api_router.get("/contacts")
async def get_contacts(current_user: dict = Depends(get_current_user)):
    return {"contacts": await db.contacts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)}

@api_router.put("/contacts/{cid}")
async def update_contact(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    u = {k:v for k,v in data.items() if k not in ["id","_id"]}
    await db.contacts.update_one({"id": cid}, {"$set": u})
    return {"message": "Contact updated"}

@api_router.post("/investments")
async def create_investment(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    i = {"id": f"inv-{uuid.uuid4().hex[:8]}", "title": data.get("title",""), "amount": data.get("amount",0),
         "source": data.get("source",""), "partner_type": data.get("partner_type","main"),
         "date": data.get("date",""), "notes": data.get("notes",""),
         "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.investments.insert_one(i); i.pop("_id",None)
    await record_transaction("credit", "investment", data.get("amount",0), f"Investment: {data.get('title','')} from {data.get('source','')} ({data.get('partner_type','main')} partner)", reference_id=i["id"], method="bank", created_by=current_user['id'])
    return {"investment": i}

@api_router.get("/investments")
async def get_investments(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    return {"investments": await db.investments.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.delete("/investments/{iid}")
async def delete_investment(iid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    await check_delete_password(data.get("password",""), current_user)
    inv = await db.investments.find_one({"id": iid}, {"_id": 0})
    if not inv: raise HTTPException(status_code=404)
    await record_transaction("debit", "investment_reversal", inv['amount'], f"Reversed investment: {inv['title']}", reference_id=iid, method="bank", created_by=current_user['id'])
    await db.investments.delete_one({"id": iid})
    return {"message": "Investment deleted and balance adjusted"}

# ==================== CASH ASSIGNMENT TO EMPLOYEES ====================
@api_router.get("/finance/cash-holders")
async def get_cash_holders(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    return {"holders": await db.cash_holders.find({}, {"_id": 0}).to_list(100)}

@api_router.post("/finance/assign-cash")
async def assign_cash(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    user_id = data.get("user_id",""); amount = data.get("amount",0); user_name = data.get("user_name","")
    if amount <= 0: raise HTTPException(status_code=400)
    await db.cash_holders.update_one({"user_id": user_id}, {"$inc": {"amount": amount}, "$set": {"user_name": user_name, "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    await record_transaction("debit", "cash_to_employee", amount, f"Cash given to {user_name}", method="cash", created_by=current_user['id'])
    return {"message": f"Rs.{amount} assigned to {user_name}"}

@api_router.post("/finance/return-cash")
async def return_cash(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    user_id = data.get("user_id",""); amount = data.get("amount",0); user_name = data.get("user_name","")
    if amount <= 0: raise HTTPException(status_code=400)
    await db.cash_holders.update_one({"user_id": user_id}, {"$inc": {"amount": -amount}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    await record_transaction("credit", "cash_from_employee", amount, f"Cash returned by {user_name}", method="cash", created_by=current_user['id'])
    return {"message": f"Rs.{amount} returned by {user_name}"}

# ==================== DASHBOARD STATS ====================
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    role = current_user['role']
    stats = {}
    if role == 'telecaller':
        today = date.today().isoformat()
        uid = current_user['id']
        stats = {
            "today_calls": await db.leads.count_documents({"assigned_to": uid, "$or": [{"next_follow_up_date": today},{"status":"new"},{"next_relationship_date":today},{"next_repeat_order_date":today}]}),
            "total_leads": await db.leads.count_documents({"assigned_to": uid}),
            "interested": await db.leads.count_documents({"assigned_to": uid, "status": "interested"}),
            "follow_ups": await db.leads.count_documents({"assigned_to": uid, "next_follow_up_date": today}),
            "repeat_orders": await db.leads.count_documents({"assigned_to": uid, "next_repeat_order_date": today}),
            "relationship_calls": await db.leads.count_documents({"assigned_to": uid, "next_relationship_date": today}),
            "my_orders": await db.orders.count_documents({"created_by": uid}),
            "pending_tasks": await db.tasks.count_documents({"assigned_to": uid, "status": "pending"})
        }
    elif role in ['district_manager','sales_manager']:
        confirmed = await db.orders.find({"status":"confirmed"},{"_id":0,"total_amount":1}).to_list(1000)
        stats = {
            "total_orders": await db.orders.count_documents({}),
            "pending_orders": await db.orders.count_documents({"status":"pending"}),
            "active_agents": await db.agents.count_documents({"status":"active"}),
            "total_leads": await db.leads.count_documents({}),
            "total_revenue": round(sum(o.get("total_amount",0) for o in confirmed),2),
            "telecaller_count": await db.telecallers.count_documents({}),
            "pending_fund_requests": await db.fund_requests.count_documents({"status":"pending"})
        }
    elif role == 'agent':
        uid = current_user['id']
        today = date.today().isoformat()
        my_dlv = await db.orders.find({"created_by":uid,"status":"delivered"},{"_id":0,"total_amount":1}).to_list(500)
        comms = await db.commissions.find({"user_id":uid},{"_id":0,"commission_amount":1}).to_list(100)
        stats = {
            "total_sales": round(sum(o.get("total_amount",0) for o in my_dlv),2),
            "total_commission": round(sum(c.get("commission_amount",0) for c in comms),2),
            "total_orders": await db.orders.count_documents({"created_by": uid}),
            "repeat_visits": await db.leads.count_documents({"assigned_to": uid, "next_repeat_order_date": today}),
            "pending_tasks": await db.tasks.count_documents({"assigned_to": uid, "status": "pending"})
        }
    elif role == 'admin':
        delivered = await db.orders.find({"status":"delivered"},{"_id":0,"total_amount":1}).to_list(1000)
        total_expenses = await db.expenses.find({},{"_id":0,"amount":1}).to_list(1000)
        total_investments = await db.investments.find({},{"_id":0,"amount":1}).to_list(500)
        stats = {
            "total_leads": await db.leads.count_documents({}),
            "total_orders": await db.orders.count_documents({}),
            "total_revenue": round(sum(o.get("total_amount",0) for o in delivered),2),
            "telecaller_count": await db.telecallers.count_documents({}),
            "manager_count": await db.managers.count_documents({}),
            "agent_count": await db.agents.count_documents({}),
            "pending_orders": await db.orders.count_documents({"status":"pending"}),
            "pending_fund_requests": await db.fund_requests.count_documents({"status":"pending"}),
            "total_expenses": round(sum(e.get("amount",0) for e in total_expenses),2),
            "total_investment": round(sum(i.get("amount",0) for i in total_investments),2),
            "pending_expenses": await db.expenses.count_documents({"status":"pending"})
        }
    elif role == 'finance_manager':
        total_expenses = await db.expenses.find({},{"_id":0,"amount":1,"status":1}).to_list(1000)
        stats = {
            "total_expenses": round(sum(e.get("amount",0) for e in total_expenses),2),
            "pending_expenses": len([e for e in total_expenses if e.get("status")=="pending"]),
            "approved_expenses": round(sum(e['amount'] for e in total_expenses if e.get("status")=="approved"),2),
            "pending_payroll": await db.payroll.count_documents({"status":"pending"})
        }
    return {"stats": stats}

# ==================== FILE UPLOAD ====================
@api_router.post("/upload/payment-proof")
async def upload_payment_proof(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if file.content_type not in ["image/jpeg","image/png","image/webp"]:
        raise HTTPException(status_code=400, detail="Invalid file type")
    contents = await file.read()
    if len(contents) > 5*1024*1024: raise HTTPException(status_code=400, detail="Max 5MB")
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    path = f"{APP_NAME}/proofs/{current_user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, contents, file.content_type)
        ref = {"id": str(uuid.uuid4()), "storage_path": result.get("path",path), "original_filename": file.filename,
               "content_type": file.content_type, "size": len(contents), "uploaded_by": current_user['id'],
               "created_at": datetime.now(timezone.utc).isoformat()}
        await db.files.insert_one(ref)
        return {"path": result.get("path",path), "filename": file.filename, "file_id": ref["id"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@api_router.get("/files/{file_path:path}")
async def download_file(file_path: str, current_user: dict = Depends(get_current_user)):
    try:
        data, ct = get_object(file_path)
        return Response(content=data, media_type=ct)
    except: raise HTTPException(status_code=404, detail="File not found")

# ==================== AI ====================
@api_router.post("/ai/parse-lead")
async def parse_lead_ai(data: dict, current_user: dict = Depends(get_current_user)):
    message = data.get("message","")
    if not message: raise HTTPException(status_code=400, detail="Message required")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"parse-{uuid.uuid4().hex[:8]}",
            system_message="You are an AI for Celesta Glow, a Kerala beauty company. Parse customer messages and return ONLY valid JSON: {\"customer_name\":\"name or Customer\",\"product_interest\":\"sunscreen|facewash|bodylotion|general\",\"inquiry_summary\":\"brief summary\",\"urgency\":\"high|medium|low\",\"suggested_response\":\"friendly reply max 160 chars\"}"
        ).with_model("gemini","gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=f"Parse:\n\n{message}"))
        text = resp.strip()
        for prefix in ["```json","```"]:
            if text.startswith(prefix): text = text[len(prefix):]
        if text.endswith("```"): text = text[:-3]
        return {"parsed": json.loads(text.strip())}
    except Exception as e:
        return {"parsed": {"customer_name":"Customer","product_interest":"general","inquiry_summary":message[:100],"urgency":"medium","suggested_response":"Thank you for contacting Celesta Glow!"}, "error": str(e)}

@api_router.post("/ai/generate-localities")
async def generate_localities(data: dict, current_user: dict = Depends(get_current_user)):
    district = data.get("district","")
    if not district: raise HTTPException(status_code=400, detail="District required")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"loc-{uuid.uuid4().hex[:8]}",
            system_message="You are a geography expert for Kerala, India. Generate locality/area names for districts. Return ONLY a JSON array of strings."
        ).with_model("gemini","gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=f"Generate 15-20 locality names for {district} district in Kerala, India. Include major residential areas, commercial hubs, and neighborhoods. Return as JSON array of strings."))
        text = resp.strip()
        for prefix in ["```json","```"]:
            if text.startswith(prefix): text = text[len(prefix):]
        if text.endswith("```"): text = text[:-3]
        return {"localities": json.loads(text.strip())}
    except Exception as e:
        return {"localities": [f"{district} Area 1",f"{district} Area 2",f"{district} Area 3"], "error": str(e)}

# ==================== AUDIT LOG ====================
async def log_audit(action, entity_type, entity_id, changed_by, changed_by_name, details=""):
    await db.audit_logs.insert_one({"id": f"audit-{uuid.uuid4().hex[:8]}", "action": action, "entity_type": entity_type, "entity_id": entity_id, "changed_by": changed_by, "changed_by_name": changed_by_name, "details": details, "timestamp": datetime.now(timezone.utc).isoformat()})

@api_router.get("/audit-logs")
async def get_audit_logs(limit: int = 200, skip: int = 0,
                        from_date: Optional[str] = None, to_date: Optional[str] = None,
                        current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    q = {}
    if from_date and to_date:
        q['timestamp'] = {"$gte": from_date, "$lt": to_date + "~"}
    elif from_date:
        q['timestamp'] = {"$gte": from_date}
    limit = max(1, min(int(limit or 200), 1000))
    skip = max(0, int(skip or 0))
    total = await db.audit_logs.count_documents(q)
    items = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    return {"audit_logs": items, "total": total, "skip": skip, "limit": limit}

# ==================== STATES ====================
@api_router.post("/states")
async def create_state(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    s = {"id": f"state-{uuid.uuid4().hex[:6]}", "name": data.get("name",""), "districts": data.get("districts",[]), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.states.insert_one(s); s.pop("_id",None)
    await log_audit("create", "state", s["id"], current_user['id'], current_user.get('name',''), f"Created state: {s['name']}")
    return {"state": s, "message": "State created"}

@api_router.get("/states")
async def get_states(current_user: dict = Depends(get_current_user)):
    return {"states": await db.states.find({}, {"_id": 0}).to_list(100)}

@api_router.put("/states/{sid}")
async def update_state(sid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    u = {k:v for k,v in data.items() if k not in ["id","_id"]}
    await db.states.update_one({"id": sid}, {"$set": u})
    await log_audit("update", "state", sid, current_user['id'], current_user.get('name',''), f"Updated state")
    return {"state": await db.states.find_one({"id": sid}, {"_id": 0})}

# ==================== LEAVES ====================
@api_router.post("/leaves")
async def create_leave(data: dict, current_user: dict = Depends(get_current_user)):
    l = {"id": f"leave-{uuid.uuid4().hex[:8]}", "user_id": current_user['id'], "user_name": current_user.get('name',''), "user_role": current_user['role'],
         "type": data.get("type","casual"), "start_date": data.get("start_date",""), "end_date": data.get("end_date",""),
         "reason": data.get("reason",""), "status": "pending", "approved_by": None,
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.leaves.insert_one(l); l.pop("_id",None)
    return {"leave": l, "message": "Leave request submitted"}

@api_router.get("/leaves")
async def get_leaves(current_user: dict = Depends(get_current_user)):
    q = {}
    if current_user['role'] not in ['admin','hr_manager']: q['user_id'] = current_user['id']
    return {"leaves": await db.leaves.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.put("/leaves/{lid}/approve")
async def approve_leave(lid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','hr_manager']: raise HTTPException(status_code=403)
    await db.leaves.update_one({"id": lid}, {"$set": {"status": data.get("status","approved"), "approved_by": current_user['id']}})
    await log_audit("approve_leave", "leave", lid, current_user['id'], current_user.get('name',''), data.get("status","approved"))
    return {"message": "Leave updated"}

# ==================== COMPLAINTS ====================
@api_router.post("/complaints")
async def create_complaint(data: dict, current_user: dict = Depends(get_current_user)):
    c = {"id": f"comp-{uuid.uuid4().hex[:8]}", "user_id": current_user['id'], "user_name": current_user.get('name',''), "user_role": current_user['role'],
         "subject": data.get("subject",""), "description": data.get("description",""), "category": data.get("category","general"),
         "status": "open", "resolution": "", "handled_by": None,
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.complaints.insert_one(c); c.pop("_id",None)
    return {"complaint": c}

@api_router.get("/complaints")
async def get_complaints(current_user: dict = Depends(get_current_user)):
    q = {}
    if current_user['role'] not in ['admin','hr_manager']: q['user_id'] = current_user['id']
    return {"complaints": await db.complaints.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.put("/complaints/{cid}")
async def update_complaint(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','hr_manager']: raise HTTPException(status_code=403)
    u = {k:v for k,v in data.items() if k not in ["id","_id"]}
    u["handled_by"] = current_user['id']
    await db.complaints.update_one({"id": cid}, {"$set": u})
    await log_audit("handle_complaint", "complaint", cid, current_user['id'], current_user.get('name',''), data.get("status",""))
    return {"message": "Complaint updated"}

# ==================== INFLUENCERS ====================
@api_router.post("/influencers")
async def create_influencer(data: dict, current_user: dict = Depends(get_current_user)):
    inf = {"id": f"inf-{uuid.uuid4().hex[:8]}", "name": data.get("name",""), "platform": data.get("platform","instagram"),
           "followers": data.get("followers",0), "phone": data.get("phone",""), "email": data.get("email",""),
           "status": "new", "contact_logs": [], "product_requests": [],
           "remuneration": data.get("remuneration",0), "assigned_to": data.get("assigned_to", current_user['id']),
           "created_by": current_user['id'], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.influencers.insert_one(inf); inf.pop("_id",None)
    return {"influencer": inf}

@api_router.get("/influencers")
async def get_influencers(current_user: dict = Depends(get_current_user)):
    q = {}
    if current_user['role'] == 'inhouse_telecaller': q['assigned_to'] = current_user['id']
    return {"influencers": await db.influencers.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)}

@api_router.put("/influencers/{iid}")
async def update_influencer(iid: str, data: dict, current_user: dict = Depends(get_current_user)):
    u = {k:v for k,v in data.items() if k not in ["id","_id","contact_log","product_request"]}
    ops = {"$set": u}
    if "contact_log" in data:
        cl = data["contact_log"]
        cl["logged_at"] = datetime.now(timezone.utc).isoformat()
        cl["logged_by"] = current_user['id']
        ops["$push"] = {"contact_logs": cl}
        await db.inhouse_telecallers.update_one({"id": current_user['id']}, {"$inc": {"total_contacted": 1}})
    if "product_request" in data:
        pr = data["product_request"]
        pr["requested_at"] = datetime.now(timezone.utc).isoformat()
        pr["status"] = "requested"
        if "$push" in ops: ops["$push"]["product_requests"] = pr
        else: ops["$push"] = {"product_requests": pr}
    await db.influencers.update_one({"id": iid}, ops)
    return {"influencer": await db.influencers.find_one({"id": iid}, {"_id": 0})}

@api_router.put("/influencers/{iid}/dispatch")
async def dispatch_to_influencer(iid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['social_media_manager','admin']: raise HTTPException(status_code=403)
    inf = await db.influencers.find_one({"id": iid}, {"_id": 0})
    if not inf: raise HTTPException(status_code=404)
    prs = inf.get("product_requests",[])
    for i, pr in enumerate(prs):
        if pr.get("status") == "requested":
            prs[i]["status"] = "dispatched"
            prs[i]["dispatched_by"] = current_user['id']
            prs[i]["dispatched_at"] = datetime.now(timezone.utc).isoformat()
    await db.influencers.update_one({"id": iid}, {"$set": {"product_requests": prs, "status": "product_sent"}})
    if inf.get("remuneration", 0) > 0:
        await db.expenses.insert_one({"id": f"exp-{uuid.uuid4().hex[:8]}", "title": f"Influencer: {inf['name']}", "amount": inf['remuneration'],
             "category": "influencer_remuneration", "description": f"Remuneration for {inf['name']}", "proof_path": "",
             "created_by": current_user['id'], "created_by_name": current_user.get('name',''), "status": "pending",
             "approved_by": None, "created_at": datetime.now(timezone.utc).isoformat()})
    return {"message": "Product dispatched"}

# ==================== CONTENT PILLARS & BRIEFS ====================
@api_router.post("/content-pillars")
async def create_pillar(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['social_media_manager','admin']: raise HTTPException(status_code=403)
    p = {"id": f"pillar-{uuid.uuid4().hex[:6]}", "name": data.get("name",""), "description": data.get("description",""),
         "target_count": data.get("target_count",0), "completed_count": 0,
         "created_by": current_user['id'], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.content_pillars.insert_one(p); p.pop("_id",None)
    return {"pillar": p}

@api_router.get("/content-pillars")
async def get_pillars(current_user: dict = Depends(get_current_user)):
    return {"pillars": await db.content_pillars.find({}, {"_id": 0}).to_list(100)}

@api_router.post("/content-briefs")
async def create_brief(data: dict, current_user: dict = Depends(get_current_user)):
    b = {"id": f"brief-{uuid.uuid4().hex[:8]}", "pillar_id": data.get("pillar_id",""), "pillar_name": data.get("pillar_name",""),
         "title": data.get("title",""), "description": data.get("description",""),
         "content_type": data.get("content_type","video"), "assigned_to": data.get("assigned_to",""),
         "assigned_to_name": data.get("assigned_to_name",""),
         "status": "pending", "script": "", "delivery_link": "", "due_date": data.get("due_date",""),
         "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.content_briefs.insert_one(b); b.pop("_id",None)
    return {"brief": b}

@api_router.get("/content-briefs")
async def get_briefs(current_user: dict = Depends(get_current_user)):
    q = {}
    if current_user['role'] == 'content_strategist': q['assigned_to'] = current_user['id']
    return {"briefs": await db.content_briefs.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.put("/content-briefs/{bid}")
async def update_brief(bid: str, data: dict, current_user: dict = Depends(get_current_user)):
    u = {k:v for k,v in data.items() if k not in ["id","_id"]}
    await db.content_briefs.update_one({"id": bid}, {"$set": u})
    if data.get("status") == "completed":
        brief = await db.content_briefs.find_one({"id": bid}, {"_id": 0})
        if brief and brief.get("pillar_id"):
            await db.content_pillars.update_one({"id": brief["pillar_id"]}, {"$inc": {"completed_count": 1}})
    return {"brief": await db.content_briefs.find_one({"id": bid}, {"_id": 0})}

# ==================== INHOUSE TELECALLER STATS ====================
@api_router.get("/influencer-stats")
async def get_influencer_stats(current_user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    q = {"assigned_to": current_user['id']} if current_user['role'] == 'inhouse_telecaller' else {}
    infs = await db.influencers.find(q, {"_id": 0}).to_list(500)
    today_contacted = sum(1 for i in infs for cl in i.get("contact_logs",[]) if cl.get("logged_at","")[:10] == today)
    pending_followups = sum(1 for i in infs if i.get("status") in ["follow_up","contacted"])
    products_sent = sum(1 for i in infs if i.get("status") == "product_sent")
    total_remuneration = sum(i.get("remuneration",0) for i in infs)
    return {"stats": {"total_influencers": len(infs), "today_contacted": today_contacted, "pending_followups": pending_followups, "products_sent": products_sent, "total_remuneration": total_remuneration}}

# ==================== UNIVERSAL TASK SYSTEM ====================
@api_router.post("/tasks")
async def create_task(data: dict, current_user: dict = Depends(get_current_user)):
    t = {"id": f"task-{uuid.uuid4().hex[:8]}", "title": data.get("title",""), "description": data.get("description",""),
         "priority": data.get("priority","medium"), "status": "pending", "phase": "pending",
         "assigned_to": data.get("assigned_to",""), "assigned_to_name": data.get("assigned_to_name",""),
         "assigned_to_role": data.get("assigned_to_role",""),
         "created_by": current_user['id'], "created_by_name": current_user.get('name',''), "created_by_role": current_user['role'],
         "due_date": data.get("due_date",""), "proof_url": "", "proof_type": "",
         "completion_notes": "", "completed_at": None,
         "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.tasks.insert_one(t); t.pop("_id", None)
    return {"task": t}

@api_router.get("/tasks")
async def get_tasks(current_user: dict = Depends(get_current_user)):
    if current_user['role'] in ['admin','hr_manager','sales_manager','district_manager','social_media_manager']:
        tasks = await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        tasks = await db.tasks.find({"$or": [{"assigned_to": current_user['id']}, {"created_by": current_user['id']}]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"tasks": tasks}

@api_router.put("/tasks/{tid}")
async def update_task(tid: str, data: dict, current_user: dict = Depends(get_current_user)):
    u = {}
    if "phase" in data: u["phase"] = data["phase"]
    if "status" in data: u["status"] = data["status"]
    if "proof_url" in data: u["proof_url"] = data["proof_url"]
    if "proof_type" in data: u["proof_type"] = data["proof_type"]
    if "completion_notes" in data: u["completion_notes"] = data["completion_notes"]
    if data.get("phase") == "completed":
        u["completed_at"] = datetime.now(timezone.utc).isoformat()
        u["status"] = "completed"
    u["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tasks.update_one({"id": tid}, {"$set": u})
    return {"message": "Task updated"}

# ==================== SETTLEMENT CHARGE CONFIG ====================
@api_router.get("/config/settlement")
async def get_settlement_config(current_user: dict = Depends(get_current_user)):
    cfg = await db.app_config.find_one({"key": "settlement"}, {"_id": 0})
    if not cfg: cfg = {"key": "settlement", "type": "percentage", "value": 0}
    return {"settlement": cfg}

@api_router.put("/config/settlement")
async def set_settlement_config(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    await db.app_config.update_one({"key": "settlement"}, {"$set": {"type": data.get("type","percentage"), "value": data.get("value",0)}}, upsert=True)
    return {"message": "Settlement config updated"}

@api_router.get("/config/commission-rates")
async def get_commission_rates(current_user: dict = Depends(get_current_user)):
    cfg = await db.app_config.find_one({"key": "commission_rates"}, {"_id": 0})
    if not cfg: cfg = {"key": "commission_rates", "rates": COMMISSION_RATES}
    return {"config": cfg}

@api_router.put("/config/commission-rates")
async def set_commission_rates(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    rates = data.get("rates", {})
    await db.app_config.update_one({"key": "commission_rates"}, {"$set": {"rates": rates}}, upsert=True)
    global COMMISSION_RATES
    COMMISSION_RATES.update(rates)
    return {"message": "Commission rates updated"}

# ==================== COMBINED SHIP+DELIVER ====================
@api_router.put("/orders/{order_id}/ship-and-deliver")
async def ship_and_deliver(order_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order: raise HTTPException(status_code=404)
    if order['status'] not in ['confirmed','pending']: raise HTTPException(status_code=400, detail=f"Order is {order['status']}")
    now = datetime.now(timezone.utc).isoformat()
    # Get settlement config
    settlement_cfg = await db.app_config.find_one({"key": "settlement"}, {"_id": 0}) or {"type": "percentage", "value": 0}
    settlement_amt = 0
    if settlement_cfg.get("value", 0) > 0:
        if settlement_cfg["type"] == "percentage":
            settlement_amt = round(order['total_amount'] * settlement_cfg["value"] / 100, 2)
        else:
            settlement_amt = settlement_cfg["value"]
    net_order = order['total_amount'] - settlement_amt
    await db.orders.update_one({"id": order_id}, {"$set": {
        "status": "delivered", "approved_by": current_user['id'], "approved_at": now,
        "shipped_at": now, "delivered_at": now, "settlement_charge": settlement_amt,
        "net_amount": net_order, "updated_at": now
    }})
    await log_audit("ship_deliver", "order", order_id, current_user['id'], current_user.get('name',''), f"Ship+Deliver Rs.{order['total_amount']}")
    # Credit commission
    cr = order['created_by_role']
    rates = COMMISSION_RATES.copy()
    cfg = await db.app_config.find_one({"key": "commission_rates"}, {"_id": 0})
    if cfg and cfg.get("rates"): rates.update(cfg["rates"])
    pct = rates.get(cr, 0)
    amt = round(order['total_amount'] * pct / 100, 2)
    if amt > 0:
        comm = {"id": f"comm-{uuid.uuid4().hex[:8]}", "user_id": order['created_by'], "user_role": cr,
                "user_name": order.get('created_by_name',''), "order_id": order_id,
                "order_amount": order['total_amount'], "commission_percentage": pct,
                "commission_amount": amt, "status": "pending", "created_at": now, "paid_at": None, "paid_via": None, "notes": ""}
        await db.commissions.insert_one(comm)
        coll_map = {"telecaller": "telecallers", "agent": "agents", "district_manager": "managers", "sales_manager": "sales_managers"}
        if cr in coll_map: await db[coll_map[cr]].update_one({"id": order['created_by']}, {"$inc": {"commission_earned": amt}})
    # Revenue in finance
    pay_method = "cash" if order.get('payment_type') == "cod" else "bank"
    await record_transaction("credit", "order_revenue", order['total_amount'], f"Order {order_id} - {order['customer_name']}", reference_id=order_id, method=pay_method, created_by=current_user['id'])
    if settlement_amt > 0:
        await record_transaction("debit", "settlement_charge", settlement_amt, f"Settlement for {order_id}", reference_id=order_id, method=pay_method, created_by=current_user['id'])
    # Update lead
    if order.get('lead_id'):
        today = date.today()
        await db.leads.update_one({"id": order['lead_id']}, {"$set": {
            "status": "converted", "last_order_date": today.isoformat(),
            "next_repeat_order_date": (today + timedelta(days=35)).isoformat(), "updated_at": now
        }})
    return {"message": "Order shipped & delivered. Commission credited."}

# ==================== SOCIAL MEDIA SALES TRACKING ====================
@api_router.get("/social-media/sales-stats")
async def get_social_sales(current_user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"status": "delivered"}, {"_id": 0}).to_list(1000)
    total_orders = len(orders)
    total_amount = sum(o.get('total_amount', 0) for o in orders)
    total_pieces = sum(sum(i.get('quantity', 0) for i in o.get('items', [])) for o in orders)
    product_wise = {}
    for o in orders:
        for item in o.get('items', []):
            pn = item.get('product_name', 'Unknown')
            if pn not in product_wise: product_wise[pn] = {"quantity": 0, "revenue": 0}
            product_wise[pn]["quantity"] += item.get('quantity', 0)
            product_wise[pn]["revenue"] += item.get('price', 0) * item.get('quantity', 0)
    return {"total_orders": total_orders, "total_amount": total_amount, "total_pieces": total_pieces, "product_wise": product_wise}

# ==================== CONTENT BRIEF AUTO-FORWARD ====================
@api_router.post("/content-briefs")
async def create_content_brief(data: dict, current_user: dict = Depends(get_current_user)):
    brief = {"id": f"brief-{uuid.uuid4().hex[:8]}", "title": data.get("title",""), "description": data.get("description",""),
             "content_type": data.get("content_type","video"), "pillar_name": data.get("pillar_name",""),
             "script": data.get("script",""), "due_date": data.get("due_date",""),
             "needs_shoot": data.get("needs_shoot", False),
             "videographer_name": "", "editor_name": "", "production_notes": "",
             "raw_footage_link": "", "edited_link": "", "delivery_link": "",
             "status": "scripted" if data.get("script") else "pending",
             "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
             "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()}
    # Auto-forward to videographer+editor if script provided and needs shoot
    if data.get("script") and data.get("needs_shoot"):
        vid_name = data.get("videographer_name", "")
        ed_name = data.get("editor_name", "")
        if not vid_name:
            vid = await db.videographers.find_one({}, {"_id": 0})
            if vid: vid_name = vid.get("name", "")
        if not ed_name:
            ed = await db.editors.find_one({}, {"_id": 0})
            if ed: ed_name = ed.get("name", "")
        brief["videographer_name"] = vid_name
        brief["editor_name"] = ed_name
        brief["status"] = "in_production"
        brief["production_notes"] = data.get("production_notes", "Auto-forwarded with script")
    await db.content_briefs.insert_one(brief); brief.pop("_id", None)
    return {"brief": brief}

# ==================== IN-HOUSE TELECALLER CALL LOGS & GOALS ====================
@api_router.post("/inhouse/call-logs")
async def create_call_log(data: dict, current_user: dict = Depends(get_current_user)):
    log = {"id": f"cl-{uuid.uuid4().hex[:8]}", "user_id": current_user['id'], "user_name": current_user.get('name',''),
           "call_type": data.get("call_type","general"), "contact_name": data.get("contact_name",""),
           "contact_phone": data.get("contact_phone",""), "notes": data.get("notes",""),
           "status": data.get("status","completed"), "follow_up_date": data.get("follow_up_date",""),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.inhouse_call_logs.insert_one(log); log.pop("_id",None)
    await db.inhouse_telecallers.update_one({"id": current_user['id']}, {"$inc": {"total_contacted": 1}})
    return {"call_log": log}

@api_router.get("/inhouse/call-logs")
async def get_call_logs(current_user: dict = Depends(get_current_user)):
    q = {} if current_user['role'] in ['admin','hr_manager','social_media_manager'] else {"user_id": current_user['id']}
    return {"call_logs": await db.inhouse_call_logs.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)}

@api_router.post("/inhouse/daily-goals")
async def set_daily_goal(data: dict, current_user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    goal = {"id": f"goal-{uuid.uuid4().hex[:8]}", "user_id": current_user['id'], "date": today,
            "target_calls": data.get("target_calls", 0), "target_followups": data.get("target_followups", 0),
            "created_at": datetime.now(timezone.utc).isoformat()}
    await db.daily_goals.update_one({"user_id": current_user['id'], "date": today}, {"$set": goal}, upsert=True)
    return {"goal": goal}

@api_router.get("/inhouse/daily-goals")
async def get_daily_goals(current_user: dict = Depends(get_current_user)):
    q = {} if current_user['role'] in ['admin','hr_manager'] else {"user_id": current_user['id']}
    return {"goals": await db.daily_goals.find(q, {"_id": 0}).sort("date", -1).to_list(100)}

# ==================== REGION LOCALITY WITH AGENT ASSIGNMENT ====================
@api_router.post("/regions/{rid}/localities")
async def add_locality(rid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','district_manager']: raise HTTPException(status_code=403)
    name = data.get("name","")
    if not name: raise HTTPException(status_code=400, detail="Locality name required")
    locality = {"name": name, "type": data.get("type","village"), "agents": data.get("agents",[]), "sub_regions": data.get("sub_regions",[])}
    await db.regions.update_one({"id": rid}, {"$push": {"localities": locality}})
    return {"message": "Locality added"}

@api_router.put("/regions/{rid}/localities/{idx}")
async def update_locality(rid: str, idx: int, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','district_manager']: raise HTTPException(status_code=403)
    region = await db.regions.find_one({"id": rid}, {"_id": 0})
    if not region or idx >= len(region.get("localities",[])): raise HTTPException(status_code=404)
    locs = region["localities"]
    for k, v in data.items():
        if k != "_id": locs[idx][k] = v
    await db.regions.update_one({"id": rid}, {"$set": {"localities": locs}})
    return {"message": "Locality updated"}

@api_router.put("/regions/{rid}/localities/{idx}/assign-agent")
async def assign_agent_to_locality(rid: str, idx: int, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','district_manager']: raise HTTPException(status_code=403)
    agent_id = data.get("agent_id","")
    region = await db.regions.find_one({"id": rid}, {"_id": 0})
    if not region or idx >= len(region.get("localities",[])): raise HTTPException(status_code=404)
    locs = region["localities"]
    if "agents" not in locs[idx]: locs[idx]["agents"] = []
    if agent_id not in locs[idx]["agents"]: locs[idx]["agents"].append(agent_id)
    await db.regions.update_one({"id": rid}, {"$set": {"localities": locs}})
    return {"message": f"Agent assigned to {locs[idx]['name']}"}

@api_router.put("/regions/{rid}/localities/{idx}/remove-agent")
async def remove_agent_from_locality(rid: str, idx: int, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','district_manager']: raise HTTPException(status_code=403)
    agent_id = data.get("agent_id","")
    region = await db.regions.find_one({"id": rid}, {"_id": 0})
    if not region or idx >= len(region.get("localities",[])): raise HTTPException(status_code=404)
    locs = region["localities"]
    if "agents" in locs[idx] and agent_id in locs[idx]["agents"]: locs[idx]["agents"].remove(agent_id)
    await db.regions.update_one({"id": rid}, {"$set": {"localities": locs}})
    return {"message": "Agent removed"}

# ==================== HR EMPLOYEE DATA ====================
@api_router.get("/hr/employees")
async def get_all_employees(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','hr_manager']: raise HTTPException(status_code=403)
    employees = []
    for coll_name, role in AUTH_COLLECTIONS.items():
        if role == 'admin': continue
        users = await db[coll_name].find({}, {"_id": 0, "password_hash": 0}).to_list(100)
        for u in users:
            u['role'] = role
            # Get payroll info
            latest_payroll = await db.payroll.find_one({"user_id": u['id']}, {"_id": 0}, sort=[("created_at", -1)])
            u['latest_payroll'] = latest_payroll
            employees.append(u)
    return {"employees": employees}

# ==================== VIDEOGRAPHER/EDITOR ENDPOINTS ====================
@api_router.get("/production/my-briefs")
async def get_my_production_briefs(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['videographer','editor','content_developer','content_strategist','social_media_manager','admin']: raise HTTPException(status_code=403)
    q = {}
    if current_user['role'] == 'videographer':
        q = {"videographer_name": current_user.get('name','')}
    elif current_user['role'] == 'editor':
        q = {"editor_name": current_user.get('name','')}
    elif current_user['role'] == 'content_developer':
        q = {"$or": [{"content_developer_name": current_user.get('name','')}, {"assigned_to": current_user.get('id','')}, {"videographer_name": current_user.get('name','')}, {"editor_name": current_user.get('name','')}]}
    briefs = await db.content_briefs.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"briefs": briefs}

@api_router.put("/production/briefs/{bid}/upload-link")
async def upload_production_link(bid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['videographer','editor','content_developer','content_strategist']: raise HTTPException(status_code=403)
    update = {}
    if data.get("raw_footage_link"): update["raw_footage_link"] = data["raw_footage_link"]
    if data.get("edited_link"): update["edited_link"] = data["edited_link"]
    if data.get("delivery_link"): update["delivery_link"] = data["delivery_link"]
    if data.get("status"): update["status"] = data["status"]
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.content_briefs.update_one({"id": bid}, {"$set": update})
    return {"message": "Updated"}

# ==================== FINANCE LEDGER ====================
async def record_transaction(txn_type, category, amount, description, reference_id="", method="bank", created_by="system"):
    """Records a financial transaction and updates balances"""
    txn = {"id": f"txn-{uuid.uuid4().hex[:8]}", "type": txn_type, "category": category,
           "amount": round(amount, 2), "description": description, "reference_id": reference_id,
           "method": method, "created_by": created_by, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.finance_ledger.insert_one(txn)
    # Update balance
    bal = await db.finance_balance.find_one({"id": "main"}) or {"cash": 0, "bank": 0}
    if txn_type == "credit":
        if method == "cash": await db.finance_balance.update_one({"id": "main"}, {"$inc": {"cash": amount}}, upsert=True)
        else: await db.finance_balance.update_one({"id": "main"}, {"$inc": {"bank": amount}}, upsert=True)
    elif txn_type == "debit":
        if method == "cash": await db.finance_balance.update_one({"id": "main"}, {"$inc": {"cash": -amount}}, upsert=True)
        else: await db.finance_balance.update_one({"id": "main"}, {"$inc": {"bank": -amount}}, upsert=True)

@api_router.get("/finance/balance")
async def get_finance_balance(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    bal = await db.finance_balance.find_one({"id": "main"}, {"_id": 0})
    if not bal:
        bal = {"id": "main", "cash": 0, "bank": 0}
        await db.finance_balance.insert_one(bal)
        bal.pop("_id", None)
    return {"balance": {"cash": round(bal.get("cash", 0), 2), "bank": round(bal.get("bank", 0), 2), "total": round(bal.get("cash", 0) + bal.get("bank", 0), 2)}}

@api_router.get("/finance/ledger")
async def get_finance_ledger(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    return {"transactions": await db.finance_ledger.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)}

@api_router.delete("/finance/transaction/{tid}")
async def delete_transaction(tid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    await check_delete_password(data.get("password",""), current_user)
    txn = await db.finance_ledger.find_one({"id": tid}, {"_id": 0})
    if not txn: raise HTTPException(status_code=404)
    # Reverse the balance effect
    if txn['type'] == 'credit':
        if txn['method'] == 'cash': await db.finance_balance.update_one({"id": "main"}, {"$inc": {"cash": -txn['amount']}})
        else: await db.finance_balance.update_one({"id": "main"}, {"$inc": {"bank": -txn['amount']}})
    elif txn['type'] == 'debit':
        if txn['method'] == 'cash': await db.finance_balance.update_one({"id": "main"}, {"$inc": {"cash": txn['amount']}})
        else: await db.finance_balance.update_one({"id": "main"}, {"$inc": {"bank": txn['amount']}})
    await db.finance_ledger.delete_one({"id": tid})
    return {"message": "Transaction deleted and balance reversed"}

# ==================== INSTRUCTIONS SYSTEM ====================
@api_router.post("/instructions")
async def create_instruction(data: dict, current_user: dict = Depends(get_current_user)):
    instr = {"id": f"instr-{uuid.uuid4().hex[:8]}", "title": data.get("title",""),
             "content": data.get("content",""), "target_role": data.get("target_role","all"),
             "target_user_id": data.get("target_user_id",""),
             "priority": data.get("priority","normal"),
             "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
             "created_at": datetime.now(timezone.utc).isoformat(), "read_by": []}
    await db.instructions.insert_one(instr); instr.pop("_id",None)

    # === Optional: also push as a task + email notification ===
    create_as_task = bool(data.get("create_as_task", False))
    send_email_flag = bool(data.get("send_email", False))
    task_due_date = data.get("due_date") or date.today().isoformat()
    task_from_time = data.get("from_time", "")
    task_to_time = data.get("to_time", "")

    # Build target user list
    target_users = []
    target_role = data.get("target_role", "all")
    target_user_id = data.get("target_user_id", "")
    if target_user_id:
        for r, c in ROLE_COLLECTIONS.items():
            u = await db[c].find_one({"id": target_user_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
            if u:
                target_users.append({**u, "role": r}); break
    elif target_role and target_role != "all":
        coll = ROLE_COLLECTIONS.get(target_role)
        if coll:
            async for u in db[coll].find({}, {"_id": 0, "id": 1, "name": 1, "email": 1}):
                target_users.append({**u, "role": target_role})
    elif target_role == "all":
        for r, c in ROLE_COLLECTIONS.items():
            if r == "admin": continue
            async for u in db[c].find({}, {"_id": 0, "id": 1, "name": 1, "email": 1}):
                target_users.append({**u, "role": r})

    task_count = 0
    email_results = {"sent": 0, "failed": 0, "errors": []}
    notif_count = 0

    for u in target_users:
        # Dashboard notification — always created so it appears in NotificationBell
        try:
            await db.notifications.insert_one({
                "id": f"notif-{uuid.uuid4().hex[:8]}", "user_id": u["id"],
                "title": f"📋 {instr['title']}", "message": instr['content'][:200],
                "type": "instruction", "priority": instr["priority"],
                "ref_id": instr["id"], "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            notif_count += 1
        except Exception:
            pass

        if create_as_task:
            task = {"id": f"etask-{uuid.uuid4().hex[:8]}", "user_id": u["id"],
                    "user_name": u.get("name", ""), "user_role": u.get("role", ""),
                    "title": instr["title"], "description": instr["content"],
                    "notes": f"From instruction by {current_user.get('name','Admin')} | Priority: {instr['priority']}",
                    "from_time": task_from_time, "to_time": task_to_time,
                    "status": "pending", "date": task_due_date, "completed_at": "",
                    "instruction_id": instr["id"],
                    "created_by": current_user["id"],
                    "created_at": datetime.now(timezone.utc).isoformat()}
            try:
                await db.employee_tasks.insert_one(task); task_count += 1
            except Exception:
                pass

        if send_email_flag and u.get("email"):
            subject = f"[{instr['priority'].upper()}] {instr['title']} – {COMPANY['name']}"
            content_html = (instr["content"] or "").replace("\n", "<br>")
            body = _letterhead("Task / Instruction Notice") + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{u.get('name','Team Member')}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>You have been assigned the following {'task' if create_as_task else 'instruction'} by <b>{current_user.get('name','Admin')}</b>:</p>
<div style='background:#F9F8F6;border-left:3px solid {COMPANY['primary_color']};padding:14px 18px;margin:18px 0;font-family:Arial,sans-serif;font-size:13px;color:#2C3531;line-height:1.7'>
  <p style='margin:0 0 6px;font-weight:700;font-size:14px;color:{COMPANY['primary_color']}'>{instr['title']}</p>
  <p style='margin:0;font-size:12.5px'>{content_html}</p>
  {f"<p style='margin:10px 0 0;font-size:11.5px'><b>Due Date:</b> {task_due_date}</p>" if create_as_task else ""}
  {f"<p style='margin:0;font-size:11.5px'><b>Time:</b> {task_from_time} – {task_to_time}</p>" if create_as_task and (task_from_time or task_to_time) else ""}
  <p style='margin:6px 0 0;font-size:11.5px'><b>Priority:</b> <span style='text-transform:capitalize;color:{"#B75D69" if instr["priority"] in ("high","urgent") else "#3B5249"}'>{instr['priority']}</span></p>
</div>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Please log in to your Celesta Glow dashboard to view full details and mark progress.</p>
""" + _letterhead_footer(signatory=current_user.get('name', 'Admin'))
            # CC the recipient's ASM/ADM if they are a SM/DM
            cc = await _get_cc_assistants(u["id"], u.get("role", ""))
            success, err = await send_email_async(u["email"], subject, body, cc_emails=cc)
            if success:
                email_results["sent"] += 1
                # Notify CC'd ASMs/ADMs in their dashboard too
                for cc_email in cc:
                    try:
                        # find user_id by email
                        for c, role in AUTH_COLLECTIONS.items():
                            cc_user = await db[c].find_one({"email": cc_email}, {"_id": 0, "id": 1})
                            if cc_user:
                                await db.notifications.insert_one({
                                    "id": f"notif-{uuid.uuid4().hex[:8]}", "user_id": cc_user["id"],
                                    "title": f"📋 (CC) {instr['title']}", "message": f"Copy of instruction sent to {u.get('name','manager')}: {instr['content'][:160]}",
                                    "type": "instruction_cc", "priority": instr["priority"],
                                    "ref_id": instr["id"], "read": False,
                                    "created_at": datetime.now(timezone.utc).isoformat(),
                                })
                                break
                    except Exception: pass
            else:
                email_results["failed"] += 1
                if err and len(email_results["errors"]) < 5:
                    email_results["errors"].append(f"{u['email']}: {err}")

    return {"instruction": instr, "tasks_created": task_count,
            "notifications_created": notif_count,
            "email_results": email_results,
            "target_users_count": len(target_users)}

@api_router.get("/instructions")
async def get_instructions(current_user: dict = Depends(get_current_user)):
    if current_user['role'] in ['admin','sales_manager','district_manager']:
        instrs = await db.instructions.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        instrs = await db.instructions.find({"$or": [{"target_role": {"$in": [current_user['role'], "all"]}}, {"target_user_id": current_user['id']}]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"instructions": instrs}

@api_router.post("/finance/reset")
async def reset_finance(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    if data.get("password") != "XYCDF6F@123": raise HTTPException(status_code=403, detail="Wrong password")
    await db.finance_balance.update_one({"id": "main"}, {"$set": {"cash": 0, "bank": 0}}, upsert=True)
    await db.finance_ledger.delete_many({})
    await db.cash_holders.delete_many({})
    return {"message": "Finance reset to zero"}


HARD_RESET_PASSWORD = "AMVPA2478F@123"
pending_hard_reset = {}  # {admin_id: {"requested_at": datetime, "execute_at": datetime}}
_hard_reset_attempts = {}  # {admin_id: {"count": int, "lock_until": datetime}}

def _check_hard_reset_password(pw: str, user_id: str):
    """Throttle brute-force on hard-reset password."""
    rec = _hard_reset_attempts.get(user_id, {"count": 0, "lock_until": None})
    now = datetime.now(timezone.utc)
    if rec.get("lock_until") and now < rec["lock_until"]:
        wait = int((rec["lock_until"] - now).total_seconds() / 60) + 1
        raise HTTPException(status_code=429, detail=f"Too many wrong attempts. Locked for {wait} more minute(s).")
    if pw != HARD_RESET_PASSWORD:
        rec["count"] = rec.get("count", 0) + 1
        if rec["count"] >= 3:
            rec["lock_until"] = now + timedelta(minutes=15)
            rec["count"] = 0
            _hard_reset_attempts[user_id] = rec
            raise HTTPException(status_code=429, detail="3 wrong attempts — locked for 15 minutes.")
        _hard_reset_attempts[user_id] = rec
        raise HTTPException(status_code=403, detail=f"Wrong password ({rec['count']}/3 attempts)")
    # success — reset counter
    _hard_reset_attempts.pop(user_id, None)

@api_router.post("/admin/hard-reset")
async def hard_reset(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    _check_hard_reset_password(data.get("password", ""), current_user['id'])
    # Schedule 48hr reset
    now = datetime.now(timezone.utc)
    pending_hard_reset["pending"] = {"requested_at": now.isoformat(), "execute_at": (now + timedelta(hours=48)).isoformat(), "requested_by": current_user['id']}
    await log_audit("hard_reset_scheduled", "system", "all", current_user['id'], current_user.get('name', ''), "Hard reset scheduled (48h cooldown)")
    return {"message": "Hard reset scheduled. Will execute in 48 hours. Use cancel endpoint to abort.", "execute_at": (now + timedelta(hours=48)).isoformat()}

@api_router.get("/admin/hard-reset/status")
async def hard_reset_status(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    p = pending_hard_reset.get("pending")
    if not p:
        return {"pending": False}
    return {"pending": True, **p}

@api_router.post("/admin/hard-reset/cancel")
async def cancel_hard_reset(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    if "pending" in pending_hard_reset:
        del pending_hard_reset["pending"]
        return {"message": "Hard reset cancelled"}
    return {"message": "No pending reset"}

@api_router.post("/admin/hard-reset/execute")
async def execute_hard_reset(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    _check_hard_reset_password(data.get("password", ""), current_user['id'])
    for coll in ["leads", "orders", "commissions", "expenses", "investments", "payroll",
                 "fund_requests", "tasks", "instructions", "audit_logs", "leaves", "complaints",
                 "finance_ledger", "cash_holders", "influencers", "content_briefs", "contacts",
                 "inhouse_call_logs", "daily_goals", "revenue_entries", "advances"]:
        await db[coll].delete_many({})
    await db.finance_balance.update_one({"id": "main"}, {"$set": {"cash": 0, "bank": 0}}, upsert=True)
    for coll_name in ROLE_COLLECTIONS.values():
        await db[coll_name].update_many({}, {"$set": {"commission_earned": 0, "total_sales": 0, "total_calls": 0, "conversions": 0, "total_contacted": 0, "total_followups": 0}})
    pending_hard_reset.pop("pending", None)
    await log_audit("hard_reset", "system", "all", current_user['id'], current_user.get('name', ''), "Full system data reset")
    return {"message": "All operational data cleared. Users and products preserved."}

@api_router.post("/admin/instant-wipe")
async def instant_wipe(data: dict, current_user: dict = Depends(get_current_user)):
    """Nuclear option — wipes EVERYTHING except the admin user(s).
    Sets a `system_wiped=true` flag in app_config so seed_database does NOT recreate
    sample employees / products / regions / demo leads on next startup.
    Requires hard-reset password. Use with care.
    """
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    _check_hard_reset_password(data.get("password", ""), current_user['id'])
    # 1. Wipe all role/user collections EXCEPT admins
    user_collections_to_wipe = [c for c in ROLE_COLLECTIONS.values() if c != "admins"]
    for c in user_collections_to_wipe:
        await db[c].delete_many({})
    # Tombstone all seed emails so they never re-seed (defence in depth)
    seed_emails = []
    for users in SEED_USERS.values():
        for u in users:
            if u.get("email") and not u["email"].startswith("admin"):
                seed_emails.append(u["email"].lower())
    for em in seed_emails:
        await db.deleted_seed_emails.update_one(
            {"email": em},
            {"$set": {"email": em, "deleted_at": datetime.now(timezone.utc).isoformat(),
                      "deleted_by": current_user['id'], "deleted_by_name": current_user.get('name', ''), "reason": "instant_wipe"}},
            upsert=True
        )
    # 2. Wipe ALL operational + content collections
    for coll in ["leads", "orders", "commissions", "expenses", "investments", "payroll",
                 "fund_requests", "tasks", "instructions", "audit_logs", "leaves", "complaints",
                 "finance_ledger", "cash_holders", "influencers", "content_briefs", "contacts",
                 "inhouse_call_logs", "daily_goals", "revenue_entries", "advances",
                 "products", "regions", "purchase_orders", "returns", "stock_movements",
                 "notifications", "attendance", "hr_complaints", "hr_attendance",
                 "social_posts", "video_scripts", "shoots", "thumbnails", "tickets",
                 "vendors", "campaigns", "ai_call_logs", "call_recordings"]:
        try: await db[coll].delete_many({})
        except Exception: pass
    # 3. Reset finance balance
    await db.finance_balance.update_one({"id": "main"}, {"$set": {"cash": 0, "bank": 0}}, upsert=True)
    # 4. Set the wiped flag — seed_database will respect this on next restart
    await db.app_config.update_one(
        {"key": "system_wiped"},
        {"$set": {"key": "system_wiped", "value": True,
                  "wiped_at": datetime.now(timezone.utc).isoformat(),
                  "wiped_by": current_user['id'], "wiped_by_name": current_user.get('name', '')}},
        upsert=True
    )
    pending_hard_reset.pop("pending", None)
    await log_audit("instant_wipe", "system", "all", current_user['id'], current_user.get('name', ''),
                    f"INSTANT WIPE — all data and {len(user_collections_to_wipe)} user collections cleared. Admin preserved.")
    return {"message": "Instant wipe complete — admin user preserved, all other data cleared. Sample data will NOT be re-seeded.",
            "wiped_at": datetime.now(timezone.utc).isoformat()}

@api_router.post("/admin/restore-seed")
async def restore_seed_mode(data: dict, current_user: dict = Depends(get_current_user)):
    """Re-enable seeding (clears the system_wiped flag). Useful only for dev/demo restore."""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    _check_hard_reset_password(data.get("password", ""), current_user['id'])
    await db.app_config.delete_one({"key": "system_wiped"})
    await db.deleted_seed_emails.delete_many({"reason": "instant_wipe"})
    return {"message": "Seed mode restored — restart backend to re-seed sample data."}

async def _cascade_delete_user_data(uid: str, role: str, by_user: dict, depth: int = 0) -> dict:
    """Delete every piece of data tied to this user across the system.
    Recursive: if user is a District Manager, all agents under them are cascaded too.
    If Sales Manager, all telecallers + asst_sm under them are cascaded too.
    Returns counts dict.
    """
    counts = {}
    # 1. Recurse to children for managers
    if depth < 2:  # safety
        children = []
        if role == "district_manager":
            async for ag in db.agents.find({"managed_by": uid}, {"_id": 0, "id": 1, "email": 1}):
                children.append(("agent", ag))
            async for ad in db.assistant_district_managers.find({"managed_by": uid}, {"_id": 0, "id": 1, "email": 1}):
                children.append(("assistant_district_manager", ad))
        elif role == "sales_manager":
            async for tc in db.telecallers.find({"managed_by": uid}, {"_id": 0, "id": 1, "email": 1}):
                children.append(("telecaller", tc))
            async for asm in db.assistant_sales_managers.find({"managed_by": uid}, {"_id": 0, "id": 1, "email": 1}):
                children.append(("assistant_sales_manager", asm))
        for child_role, child in children:
            sub = await _cascade_delete_user_data(child["id"], child_role, by_user, depth + 1)
            for k, v in sub.items():
                counts[k] = counts.get(k, 0) + v
            # delete the child user record itself
            child_coll = ROLE_COLLECTIONS.get(child_role)
            if child_coll:
                await db[child_coll].delete_one({"id": child["id"]})
                counts["users"] = counts.get("users", 0) + 1
            if child.get("email"):
                await db.deleted_seed_emails.update_one(
                    {"email": child["email"].lower()},
                    {"$set": {"email": child["email"].lower(), "deleted_at": datetime.now(timezone.utc).isoformat(),
                              "deleted_by": by_user['id'], "deleted_by_name": by_user.get('name', ''), "reason": f"cascade_from_{role}"}},
                    upsert=True
                )
    # 2. Delete operational data tied to this uid
    cascades = [
        ("orders", {"$or": [{"created_by": uid}, {"approved_by": uid}, {"shipped_by": uid}, {"delivered_by": uid}, {"last_edited_by": uid}]}),
        ("leads", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("commissions", {"user_id": uid}),
        ("tasks", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("fund_requests", {"$or": [{"requested_by": uid}, {"approved_by": uid}]}),
        ("expenses", {"$or": [{"created_by": uid}, {"approved_by": uid}]}),
        ("payroll", {"user_id": uid}),
        ("attendance", {"user_id": uid}),
        ("hr_attendance", {"user_id": uid}),
        ("leaves", {"user_id": uid}),
        ("complaints", {"user_id": uid}),
        ("hr_complaints", {"user_id": uid}),
        ("notifications", {"user_id": uid}),
        ("inhouse_call_logs", {"$or": [{"caller_id": uid}, {"user_id": uid}]}),
        ("daily_goals", {"user_id": uid}),
        ("influencers", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("content_briefs", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("contacts", {"created_by": uid}),
        ("advances", {"user_id": uid}),
        ("revenue_entries", {"created_by": uid}),
        ("ai_call_logs", {"user_id": uid}),
        ("hiring", {"$or": [{"forwarded_to": uid}, {"created_by": uid}]}),
        ("candidates", {"$or": [{"forwarded_to": uid}, {"created_by": uid}]}),
        ("resignations", {"user_id": uid}),
        ("content_calendar", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("shoot_plans", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("scripts", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("hr_call_logs", {"user_id": uid}),
        ("outreach_logs", {"user_id": uid}),
        ("employee_tasks", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("audit_logs", {"user_id": uid}),
    ]
    for coll, query in cascades:
        try:
            r = await db[coll].delete_many(query)
            if r.deleted_count:
                counts[coll] = counts.get(coll, 0) + r.deleted_count
        except Exception:
            pass
    return counts

@api_router.delete("/users/{uid}")
async def delete_user(uid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    await check_delete_password(data.get("password", ""), current_user)
    if uid.startswith("admin"):
        raise HTTPException(status_code=400, detail="Cannot delete admin accounts")
    # Find the user across role collections
    deleted_email = None
    deleted_role = None
    for role, coll_name in [(r, c) for r, c in zip(ROLE_COLLECTIONS.keys(), ROLE_COLLECTIONS.values())]:
        existing = await db[coll_name].find_one({"id": uid}, {"_id": 0, "email": 1})
        if existing:
            deleted_email = (existing.get("email") or "").lower()
            deleted_role = role
            break
    if not deleted_role:
        raise HTTPException(status_code=404, detail="User not found")
    # Cascade delete all related data + child users (if manager)
    counts = await _cascade_delete_user_data(uid, deleted_role, current_user)
    # Delete the user record itself
    await db[ROLE_COLLECTIONS[deleted_role]].delete_one({"id": uid})
    counts["users"] = counts.get("users", 0) + 1
    # Tombstone — prevents re-seeding on next backend restart
    if deleted_email:
        await db.deleted_seed_emails.update_one(
            {"email": deleted_email},
            {"$set": {"email": deleted_email, "deleted_at": datetime.now(timezone.utc).isoformat(),
                      "deleted_by": current_user['id'], "deleted_by_name": current_user.get('name', '')}},
            upsert=True
        )
    await log_audit("delete_user_cascade", "user", uid, current_user['id'], current_user.get('name', ''),
                    f"Deleted user {uid} ({deleted_email}) + cascade: {counts}")
    return {"message": f"User {uid} deleted with full cascade", "deleted_email": deleted_email, "cascade_counts": counts}

@api_router.post("/users/bulk-delete")
async def bulk_delete_users(data: dict, current_user: dict = Depends(get_current_user)):
    """Bulk delete users. Admin + HR Manager only. Skips admins. Same cascade as single delete.
    Requires admin/hr password in `password` for safety."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    await check_delete_password(data.get("password", ""), current_user)
    ids = data.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="ids list is required")
    deleted, skipped, errors = 0, 0, []
    for uid in ids:
        if uid.startswith("admin"):
            skipped += 1; continue
        deleted_role, deleted_email = None, None
        for role, coll_name in ROLE_COLLECTIONS.items():
            existing = await db[coll_name].find_one({"id": uid}, {"_id": 0, "email": 1})
            if existing:
                deleted_email = (existing.get("email") or "").lower()
                deleted_role = role
                break
        if not deleted_role:
            errors.append(f"{uid}: not found"); continue
        try:
            await _cascade_delete_user_data(uid, deleted_role, current_user)
            await db[ROLE_COLLECTIONS[deleted_role]].delete_one({"id": uid})
            if deleted_email:
                await db.deleted_seed_emails.update_one(
                    {"email": deleted_email},
                    {"$set": {"email": deleted_email, "deleted_at": datetime.now(timezone.utc).isoformat(),
                              "deleted_by": current_user['id'], "deleted_by_name": current_user.get('name', '')}},
                    upsert=True,
                )
            deleted += 1
        except Exception as e:
            errors.append(f"{uid}: {e}")
    await log_audit("bulk_delete_users", "user", "multi", current_user['id'], current_user.get('name', ''),
                    f"Bulk deleted {deleted} user(s), skipped {skipped}, errors: {len(errors)}")
    return {"deleted": deleted, "skipped": skipped, "errors": errors,
            "message": f"Deleted {deleted} user(s)" + (f" · {skipped} admin protected" if skipped else "") + (f" · {len(errors)} errors" if errors else "")}

@api_router.get("/users/{uid}/cascade-preview")
async def cascade_preview(uid: str, current_user: dict = Depends(get_current_user)):
    """Return how many items would be deleted if this user is removed (for confirmation UI)."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    if uid.startswith("admin"):
        return {"counts": {}, "warning": "Admin cannot be deleted"}
    deleted_role = None
    for role, coll_name in zip(ROLE_COLLECTIONS.keys(), ROLE_COLLECTIONS.values()):
        if await db[coll_name].find_one({"id": uid}, {"_id": 0, "id": 1}):
            deleted_role = role
            break
    if not deleted_role:
        raise HTTPException(status_code=404, detail="User not found")
    counts = {}
    queries = [
        ("orders", {"created_by": uid}),
        ("leads", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("commissions", {"user_id": uid}),
        ("tasks", {"$or": [{"assigned_to": uid}, {"created_by": uid}]}),
        ("fund_requests", {"requested_by": uid}),
        ("expenses", {"created_by": uid}),
        ("payroll", {"user_id": uid}),
        ("attendance", {"user_id": uid}),
        ("leaves", {"user_id": uid}),
        ("complaints", {"user_id": uid}),
        ("notifications", {"user_id": uid}),
        ("inhouse_call_logs", {"caller_id": uid}),
        ("influencers", {"assigned_to": uid}),
        ("content_briefs", {"assigned_to": uid}),
    ]
    for coll, q in queries:
        try:
            n = await db[coll].count_documents(q)
            if n: counts[coll] = n
        except Exception:
            pass
    if deleted_role == "district_manager":
        n = await db.agents.count_documents({"managed_by": uid})
        if n: counts["child_agents"] = n
    elif deleted_role == "sales_manager":
        n = await db.telecallers.count_documents({"managed_by": uid})
        if n: counts["child_telecallers"] = n
    return {"role": deleted_role, "counts": counts}


@api_router.post("/finance/transaction")
async def create_manual_transaction(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    txn_type = data.get("type", "credit")
    amount = data.get("amount", 0)
    if amount <= 0: raise HTTPException(status_code=400, detail="Amount must be positive")
    await record_transaction(txn_type, data.get("category", "manual"), amount,
        data.get("description", "Manual entry"), method=data.get("method", "bank"), created_by=current_user['id'])
    return {"message": "Transaction recorded"}

@api_router.post("/finance/transfer")
async def transfer_funds(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','finance_manager']: raise HTTPException(status_code=403)
    amount = data.get("amount", 0)
    direction = data.get("direction", "cash_to_bank")
    if amount <= 0: raise HTTPException(status_code=400, detail="Amount must be positive")
    if direction == "cash_to_bank":
        await db.finance_balance.update_one({"id": "main"}, {"$inc": {"cash": -amount, "bank": amount}}, upsert=True)
        await record_transaction("transfer", "internal", amount, f"Cash to Bank transfer Rs.{amount}", method="transfer", created_by=current_user['id'])
    else:
        await db.finance_balance.update_one({"id": "main"}, {"$inc": {"cash": amount, "bank": -amount}}, upsert=True)
        await record_transaction("transfer", "internal", amount, f"Bank to Cash withdrawal Rs.{amount}", method="transfer", created_by=current_user['id'])
    return {"message": "Transfer complete"}

# ==================== ROOT ====================
@api_router.get("/")
async def api_root():
    return {"message": "Celesta Glow CRM API", "version": "3.0", "status": "online"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

@api_router.post("/admin/clear-data")
async def clear_data(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    colls = data.get("collections", [])
    cleared = []
    for c in colls:
        if c in ["fund_requests","expenses","investments","audit_logs","orders","leads","commissions","payroll"]:
            await db[c].delete_many({})
            cleared.append(c)
    # Reset commission_earned on all user collections
    if "commissions" in colls:
        for uc in ["telecallers","agents","managers","sales_managers"]:
            await db[uc].update_many({}, {"$set": {"commission_earned": 0}})
    return {"message": f"Cleared: {', '.join(cleared)}"}

@api_router.get("/commissions/summary")
async def get_commission_summary(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','sales_manager','district_manager','finance_manager','hr_manager']: raise HTTPException(status_code=403)
    comms = await db.commissions.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    today = date.today()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    month_start = today.replace(day=1).isoformat()
    by_user = {}
    for c in comms:
        uid = c['user_id']
        if uid not in by_user:
            by_user[uid] = {"user_id": uid, "user_name": c.get('user_name',''), "user_role": c.get('user_role',''),
                            "total": 0, "weekly": 0, "monthly": 0, "pending": 0, "paid": 0, "orders": []}
        by_user[uid]["total"] += c['commission_amount']
        if c.get('created_at','')[:10] >= week_start: by_user[uid]["weekly"] += c['commission_amount']
        if c.get('created_at','')[:10] >= month_start: by_user[uid]["monthly"] += c['commission_amount']
        if c['status'] == 'pending': by_user[uid]["pending"] += c['commission_amount']
        if c['status'] == 'paid': by_user[uid]["paid"] += c['commission_amount']
        by_user[uid]["orders"].append({"order_id": c['order_id'], "amount": c['commission_amount'],
            "order_amount": c.get('order_amount',0), "date": c.get('created_at','')[:10], "status": c['status']})
    # Per-day breakdown
    daily = {}
    for c in comms:
        d = c.get('created_at','')[:10]
        if d not in daily: daily[d] = 0
        daily[d] += c['commission_amount']
    daily_list = [{"date": k, "amount": round(v,2)} for k,v in sorted(daily.items(), reverse=True)]
    today_total = round(sum(c['commission_amount'] for c in comms if c.get('created_at','')[:10] == today.isoformat()), 2)
    for v in by_user.values():
        v["total"] = round(v["total"], 2); v["weekly"] = round(v["weekly"], 2)
        v["monthly"] = round(v["monthly"], 2); v["pending"] = round(v["pending"], 2); v["paid"] = round(v["paid"], 2)
        # Per day for this user
        ud = {}
        for o in v["orders"]:
            d = o["date"]
            if d not in ud: ud[d] = 0
            ud[d] += o["amount"]
        v["daily"] = [{"date": k, "amount": round(val,2)} for k,val in sorted(ud.items(), reverse=True)]
    return {"agents": list(by_user.values()), "total_weekly": round(sum(v["weekly"] for v in by_user.values()),2), "total_monthly": round(sum(v["monthly"] for v in by_user.values()),2), "total_today": today_total, "daily_breakdown": daily_list[:30]}

@api_router.get("/ai/generate-districts/{state_name}")
async def generate_districts_for_state(state_name: str, current_user: dict = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"dist-{uuid.uuid4().hex[:8]}",
            system_message="You are a geography expert for India. Return ONLY a JSON array of district name strings for the given state. No explanations."
        ).with_model("gemini","gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=f"List all districts of {state_name} state in India. Return as JSON array of strings."))
        text = resp.strip()
        for prefix in ["```json","```"]:
            if text.startswith(prefix): text = text[len(prefix):]
        if text.endswith("```"): text = text[:-3]
        return {"districts": json.loads(text.strip())}
    except Exception as e:
        return {"districts": [], "error": str(e)}

@api_router.get("/ai/generate-localities/{district_name}")
async def generate_localities_for_district(district_name: str, state_name: str = "Kerala", current_user: dict = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"loc-{uuid.uuid4().hex[:8]}",
            system_message="You are a geography expert for India. Return ONLY a JSON array of locality/area name strings for the given district. Include major towns, taluks, panchayats. Return 15-25 localities. No explanations."
        ).with_model("gemini","gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=f"List major localities, taluks and areas in {district_name} district, {state_name} state, India. Return as JSON array of strings."))
        text = resp.strip()
        for prefix in ["```json","```"]:
            if text.startswith(prefix): text = text[len(prefix):]
        if text.endswith("```"): text = text[:-3]
        return {"localities": json.loads(text.strip())}
    except Exception as e:
        return {"localities": [], "error": str(e)}

@api_router.put("/states/{sid}/assign-manager")
async def assign_manager_to_district(sid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    district = data.get("district","")
    manager_id = data.get("manager_id","")
    manager_name = data.get("manager_name","")
    state = await db.states.find_one({"id": sid}, {"_id": 0})
    if not state: raise HTTPException(status_code=404)
    assignments = state.get("district_managers", {})
    assignments[district] = {"manager_id": manager_id, "manager_name": manager_name}
    await db.states.update_one({"id": sid}, {"$set": {"district_managers": assignments}})
    # Also update the manager's assigned_districts
    mgr = await db.managers.find_one({"id": manager_id}, {"_id": 0})
    current_districts = mgr.get("assigned_districts", []) if mgr else []
    if district not in current_districts:
        current_districts.append(district)
        await db.managers.update_one({"id": manager_id}, {"$set": {"assigned_districts": current_districts}})
    return {"message": f"{manager_name} assigned to {district}"}

@api_router.post("/states/{sid}/clear")
async def clear_state_data(sid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin': raise HTTPException(status_code=403)
    await db.states.delete_one({"id": sid})
    return {"message": "State deleted"}


# ==================== FINANCE MONTHLY STATS ====================
@api_router.get("/finance/monthly-stats")
async def get_finance_monthly_stats(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']:
        raise HTTPException(status_code=403, detail="Access denied")
    txns = await db.finance_ledger.find({}, {"_id": 0}).to_list(5000)
    expenses = await db.expenses.find({"status": "approved"}, {"_id": 0}).to_list(5000)
    monthly = {}
    for t in txns:
        month_key = t.get('created_at', '')[:7]  # YYYY-MM
        if not month_key or len(month_key) < 7:
            continue
        if month_key not in monthly:
            monthly[month_key] = {"month": month_key, "credits": 0, "debits": 0, "expenses": 0}
        if t.get('type') == 'credit':
            monthly[month_key]["credits"] += t.get('amount', 0)
        elif t.get('type') == 'debit':
            monthly[month_key]["debits"] += t.get('amount', 0)
    for e in expenses:
        month_key = e.get('created_at', '')[:7]
        if not month_key or len(month_key) < 7:
            continue
        if month_key not in monthly:
            monthly[month_key] = {"month": month_key, "credits": 0, "debits": 0, "expenses": 0}
        monthly[month_key]["expenses"] += e.get('amount', 0)
    result = sorted(monthly.values(), key=lambda x: x['month'])
    for r in result:
        r["credits"] = round(r["credits"], 2)
        r["debits"] = round(r["debits"], 2)
        r["expenses"] = round(r["expenses"], 2)
    return {"monthly_stats": result}


# ==================== P&L REVENUE ENTRIES ====================
@api_router.post("/revenue-entries")
async def create_revenue_entry(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']:
        raise HTTPException(status_code=403)
    entry = {"id": f"rev-{uuid.uuid4().hex[:8]}", "platform": data.get("platform", "offline"),
             "sale_amount": data.get("sale_amount", 0), "platform_fee": data.get("platform_fee", 0),
             "shipping_cost": data.get("shipping_cost", 0), "settlement_charge": data.get("settlement_charge", 0),
             "net_received": data.get("sale_amount", 0) - data.get("platform_fee", 0) - data.get("shipping_cost", 0) - data.get("settlement_charge", 0),
             "order_ref": data.get("order_ref", ""), "notes": data.get("notes", ""),
             "date": data.get("date", date.today().isoformat()),
             "created_by": current_user['id'], "created_by_name": current_user.get('name', ''),
             "created_at": datetime.now(timezone.utc).isoformat()}
    await db.revenue_entries.insert_one(entry); entry.pop("_id", None)
    return {"entry": entry, "message": "Revenue entry added"}

@api_router.get("/revenue-entries")
async def get_revenue_entries(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']:
        raise HTTPException(status_code=403)
    return {"entries": await db.revenue_entries.find({}, {"_id": 0}).sort("date", -1).to_list(1000)}

@api_router.delete("/revenue-entries/{rid}")
async def delete_revenue_entry(rid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    await db.revenue_entries.delete_one({"id": rid})
    return {"message": "Entry deleted"}

@api_router.get("/pnl")
async def get_profit_loss(month: str = "", year: str = "", current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']:
        raise HTTPException(status_code=403)
    # Revenue: CRM orders (delivered) + external revenue entries
    oq = {"status": "delivered"}
    if month and year:
        prefix = f"{year}-{month.zfill(2)}"
        oq["created_at"] = {"$regex": f"^{prefix}"}
    crm_orders = await db.orders.find(oq, {"_id": 0}).to_list(5000)
    crm_revenue = sum(o.get('total_amount', 0) for o in crm_orders)
    # External entries
    eq = {}
    if month and year:
        prefix = f"{year}-{month.zfill(2)}"
        eq["date"] = {"$regex": f"^{prefix}"}
    ext_entries = await db.revenue_entries.find(eq, {"_id": 0}).to_list(5000)
    by_platform = {}
    for e in ext_entries:
        p = e.get('platform', 'other')
        if p not in by_platform:
            by_platform[p] = {"sale_amount": 0, "platform_fee": 0, "shipping_cost": 0, "settlement_charge": 0, "net_received": 0, "count": 0}
        by_platform[p]["sale_amount"] += e.get('sale_amount', 0)
        by_platform[p]["platform_fee"] += e.get('platform_fee', 0)
        by_platform[p]["shipping_cost"] += e.get('shipping_cost', 0)
        by_platform[p]["settlement_charge"] += e.get('settlement_charge', 0)
        by_platform[p]["net_received"] += e.get('net_received', 0)
        by_platform[p]["count"] += 1
    total_ext_revenue = sum(v["net_received"] for v in by_platform.values())
    total_revenue = crm_revenue + total_ext_revenue
    # Settlement charges on CRM prepaid orders
    settlement_cfg = await db.config.find_one({"id": "settlement"}, {"_id": 0})
    settlement = settlement_cfg.get("settlement", {"type": "percentage", "value": 0}) if settlement_cfg else {"type": "percentage", "value": 0}
    prepaid_orders = [o for o in crm_orders if o.get('payment_type') in ['online', 'upi']]
    if settlement["type"] == "percentage":
        crm_settlement = sum(o.get('total_amount', 0) * settlement["value"] / 100 for o in prepaid_orders)
    else:
        crm_settlement = len(prepaid_orders) * settlement["value"]
    # Expenses
    xq = {"status": "approved"}
    if month and year:
        prefix = f"{year}-{month.zfill(2)}"
        xq["created_at"] = {"$regex": f"^{prefix}"}
    expenses = await db.expenses.find(xq, {"_id": 0}).to_list(5000)
    exp_by_cat = {}
    for e in expenses:
        cat = e.get('category', 'general')
        exp_by_cat[cat] = exp_by_cat.get(cat, 0) + e.get('amount', 0)
    total_expenses = sum(exp_by_cat.values())
    # Payroll
    pq = {"status": "processed"}
    if month and year:
        pq["month"] = month; pq["year"] = year
    payroll = await db.payroll.find(pq, {"_id": 0}).to_list(500)
    total_salary = sum(p.get('net_salary', 0) for p in payroll)
    # Commissions
    cq = {}
    if month and year:
        prefix = f"{year}-{month.zfill(2)}"
        cq["created_at"] = {"$regex": f"^{prefix}"}
    comms = await db.commissions.find(cq, {"_id": 0}).to_list(5000)
    total_commissions = sum(c.get('commission_amount', 0) for c in comms)
    gross_profit = total_revenue - crm_settlement
    net_profit = gross_profit - total_expenses - total_salary - total_commissions
    return {
        "revenue": {"crm_orders": round(crm_revenue, 2), "crm_count": len(crm_orders), "external": {k: {kk: round(vv, 2) for kk, vv in v.items()} for k, v in by_platform.items()}, "total_external": round(total_ext_revenue, 2), "total": round(total_revenue, 2)},
        "deductions": {"settlement_charges": round(crm_settlement, 2), "prepaid_count": len(prepaid_orders)},
        "gross_profit": round(gross_profit, 2),
        "expenses": {"by_category": {k: round(v, 2) for k, v in exp_by_cat.items()}, "total": round(total_expenses, 2), "salary": round(total_salary, 2), "commissions": round(total_commissions, 2)},
        "net_profit": round(net_profit, 2),
        "month": month, "year": year
    }

# ==================== ADVANCE PAYMENTS ====================
@api_router.post("/advances")
async def create_advance(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager', 'finance_manager']:
        raise HTTPException(status_code=403)
    adv = {"id": f"adv-{uuid.uuid4().hex[:8]}", "user_id": data.get("user_id", ""),
           "user_name": data.get("user_name", ""), "user_role": data.get("user_role", ""),
           "amount": data.get("amount", 0), "type": data.get("type", "advance"),
           "reason": data.get("reason", ""), "status": "active",
           "deducted_in_payroll": False, "payroll_id": None,
           "created_by": current_user['id'], "created_by_name": current_user.get('name', ''),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.advances.insert_one(adv); adv.pop("_id", None)
    # Record in finance as debit (cash given to employee)
    await record_transaction("debit", "advance", adv['amount'], f"Advance to {adv['user_name']} ({adv['type']})", reference_id=adv['id'], method=data.get("method", "cash"), created_by=current_user['id'])
    return {"advance": adv, "message": "Advance recorded"}

@api_router.get("/advances")
async def get_advances(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager', 'finance_manager']:
        raise HTTPException(status_code=403)
    return {"advances": await db.advances.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)}

@api_router.get("/advances/user/{uid}")
async def get_user_advances(uid: str, current_user: dict = Depends(get_current_user)):
    advs = await db.advances.find({"user_id": uid, "status": "active", "deducted_in_payroll": False}, {"_id": 0}).to_list(100)
    return {"advances": advs, "total_pending": sum(a.get('amount', 0) for a in advs)}

@api_router.delete("/advances/{aid}")
async def delete_advance(aid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    adv = await db.advances.find_one({"id": aid}, {"_id": 0})
    if not adv:
        raise HTTPException(status_code=404)
    if adv.get("deducted_in_payroll"):
        raise HTTPException(status_code=400, detail="Already deducted in payroll, cannot remove")
    await db.advances.delete_one({"id": aid})
    await record_transaction("credit", "advance_reversal", adv['amount'], f"Advance reversed: {adv['user_name']}", reference_id=aid, method="cash", created_by=current_user['id'])
    return {"message": "Advance removed and balance restored"}

# ==================== DOCUMENT TEMPLATES (CUSTOM OVERRIDES) ====================

# Editable starter HTML for each letter — uses placeholders that get auto-filled when sent.
# When HR clicks Edit, this is what they see (so they can modify times, content, notes etc.)
DEFAULT_TEMPLATE_BODIES = {
    "welcome": {
        "subject": "Welcome to {company_name} – Appointment & Joining Confirmation",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We are delighted to welcome you to <b>{company_name}</b>. Your appointment as <b>{position}</b> in the <b>{department}</b> department is hereby confirmed.</p>
<p style='font-family:Georgia,serif;font-size:13px'>Below are your appointment details:</p>
<table style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px;margin:14px 0'>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6;width:40%'><b>Employee Name</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{emp_name}</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Designation</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{position}</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Department</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{department}</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Reporting To</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{reporting_to}</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Date of Joining</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{joining_date}</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Monthly Gross Salary</b></td><td style='padding:8px;border:1px solid #E5E3DB'>Rs. {salary} per month</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Performance Incentive</b></td><td style='padding:8px;border:1px solid #E5E3DB'>Rs. {incentive} per month (target-based)</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Work Schedule</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{work_hours}</td></tr>
</table>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Please report at the office on <b>{joining_date}</b> at 9:30 AM for orientation. Carry the originals + photocopies of: Aadhaar, PAN, last salary slip, educational certificates, and 2 passport-size photos.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We look forward to a long and productive association with you. Welcome aboard!</p>"""
    },
    "offer": {
        "subject": "Offer of Employment – {company_name}",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Pursuant to your discussions with our Hiring Team, we are pleased to offer you the position of <b>{position}</b> at <b>{company_name}</b>.</p>
<p style='font-family:Georgia,serif;font-size:13px'>The principal terms of this offer are as follows:</p>
<table style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px;margin:14px 0'>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6;width:40%'><b>Position</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{position}</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Department</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{department}</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Date of Joining</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{joining_date}</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Gross Salary</b></td><td style='padding:8px;border:1px solid #E5E3DB'>Rs. {salary} per month</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Performance Incentive</b></td><td style='padding:8px;border:1px solid #E5E3DB'>Rs. {incentive} per month (target-based)</td></tr>
</table>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This offer is conditional upon (a) verification of your documents, (b) satisfactory background check, and (c) your acceptance within 7 days of receipt of this letter.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>If the above terms are acceptable, please sign and return a copy of this letter. We look forward to welcoming you to the team.</p>"""
    },
    "employment": {
        "subject": "Confirmation of Employment – {company_name}",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This is to formally confirm your employment with <b>{company_name}</b> as <b>{position}</b> in the <b>{department}</b> department, effective <b>{effective_date}</b>, post successful completion of your probation period.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Your performance during the probation has been satisfactory and we are pleased to confirm you in regular employment with all benefits, leave entitlements, and statutory protections as per company policy.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We thank you for your contributions so far and look forward to your continued growth with us.</p>"""
    },
    "agreement": {
        "subject": "Employment Agreement – {company_name}",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This Employment Agreement is entered into between <b>{company_name}</b> ("Employer") and <b>{emp_name}</b> ("Employee") with effect from <b>{joining_date}</b>.</p>
<h4 style='font-family:Georgia,serif;color:#3B5249'>1. Position & Duties</h4>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Employee will serve as <b>{position}</b> in the <b>{department}</b> department, reporting to <b>{reporting_to}</b>, and will perform all duties reasonably assigned.</p>
<h4 style='font-family:Georgia,serif;color:#3B5249'>2. Compensation</h4>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Gross monthly salary: Rs. {salary}. Performance-based incentive: Rs. {incentive}. Salary is paid by the 7th of every month.</p>
<h4 style='font-family:Georgia,serif;color:#3B5249'>3. Confidentiality</h4>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Employee shall maintain strict confidentiality of all proprietary information, customer data, and trade secrets, both during and after employment.</p>
<h4 style='font-family:Georgia,serif;color:#3B5249'>4. Non-Compete</h4>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Employee shall not, directly or indirectly, engage in any competing business for a period of 6 months after termination of employment.</p>
<h4 style='font-family:Georgia,serif;color:#3B5249'>5. Termination</h4>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Either party may terminate this agreement with 30 days written notice. Company reserves the right to terminate without notice for misconduct, fraud, or breach of agreement.</p>"""
    },
    "increment": {
        "subject": "Salary Revision – Effective {effective_date}",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>In recognition of your dedication, performance, and contribution to <b>{company_name}</b>, the management is pleased to announce a revision in your compensation, effective <b>{effective_date}</b>.</p>
<table style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px;margin:14px 0'>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6;width:40%'><b>Previous Gross Salary</b></td><td style='padding:8px;border:1px solid #E5E3DB'>Rs. {old_salary} per month</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Revised Gross Salary</b></td><td style='padding:8px;border:1px solid #E5E3DB'>Rs. {new_salary} per month</td></tr>
  <tr><td style='padding:8px;border:1px solid #E5E3DB;background:#F9F8F6'><b>Effective Date</b></td><td style='padding:8px;border:1px solid #E5E3DB'>{effective_date}</td></tr>
</table>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>All other terms and conditions of your employment remain unchanged. We thank you for your contributions and wish you continued success.</p>"""
    },
    "warning": {
        "subject": "Warning Letter – {company_name}",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This is a formal written warning regarding the following matter:</p>
<div style='background:#FEF3F2;border-left:3px solid #B75D69;padding:12px 16px;margin:14px 0;font-family:Arial,sans-serif;font-size:12.5px;line-height:1.7'>
  <p style='margin:0'><b>Issue / Incident:</b> {reason}</p>
  <p style='margin:6px 0 0'><b>Details:</b> {details}</p>
</div>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This conduct/performance is contrary to the standards expected of all employees of <b>{company_name}</b>. We expect immediate and sustained improvement.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Please treat this as a final warning. Any repetition or further violation may result in disciplinary action, up to and including termination of employment, without further notice.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Kindly acknowledge receipt of this letter by signing below.</p>"""
    },
    "termination": {
        "subject": "Notice of Termination – {company_name}",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This letter is to formally notify you of the termination of your employment with <b>{company_name}</b>, effective <b>{effective_date}</b>.</p>
<div style='background:#F9F8F6;border-left:3px solid #B75D69;padding:12px 16px;margin:14px 0;font-family:Arial,sans-serif;font-size:12.5px;line-height:1.7'>
  <p style='margin:0'><b>Reason for Termination:</b> {reason}</p>
</div>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Please return all company property (ID card, devices, documents) on or before your last working day. Your full and final settlement, including any pending dues, will be processed within 30 days of clearance.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We thank you for your services and wish you the best in your future endeavours.</p>"""
    },
    "relieving": {
        "subject": "Relieving Letter – {company_name}",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>To Whomsoever It May Concern,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This is to certify that <b>{emp_name}</b> was employed with <b>{company_name}</b> as <b>{position}</b> from <b>{joining_date}</b> to <b>{effective_date}</b>.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>{emp_name} has been relieved from all duties and responsibilities effective <b>{effective_date}</b>, the last working day. All dues and final settlement have been completed.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>During the tenure with us, the conduct was found to be satisfactory. We wish {emp_name} all the very best for future endeavours.</p>"""
    },
    "experience": {
        "subject": "Experience Certificate – {company_name}",
        "body_html": """<p style='font-family:Georgia,serif;font-size:13px'>To Whomsoever It May Concern,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This is to certify that <b>{emp_name}</b> was employed with <b>{company_name}</b> as <b>{position}</b> in the <b>{department}</b> department from <b>{joining_date}</b> to <b>{effective_date}</b>.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>During the tenure with us, {emp_name} demonstrated dedication, professionalism, and a strong commitment to assigned responsibilities. The conduct was found to be exemplary.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We wish {emp_name} continued success and growth in all future endeavours.</p>"""
    },
}

@api_router.get("/hr/document-templates")
async def list_document_templates(current_user: dict = Depends(get_current_user)):
    """List all customised document templates (overrides). Defaults are built-in."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    overrides = await db.document_templates.find({}, {"_id": 0}).to_list(50)
    builtin = ["welcome","offer","employment","agreement","increment","termination","warning","relieving","experience"]
    return {"templates": overrides, "builtin_keys": builtin}

@api_router.get("/hr/document-templates/{key}")
async def get_document_template(key: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    doc = await db.document_templates.find_one({"key": key}, {"_id": 0})
    if doc:
        return {"template": doc, "key": key, "is_default": False}
    # Fall back to built-in default so HR sees the existing letter content to edit
    default = DEFAULT_TEMPLATE_BODIES.get(key)
    if not default:
        return {"template": None, "key": key, "is_default": True}
    return {
        "template": {"key": key, "subject": default["subject"], "body_html": default["body_html"]},
        "key": key,
        "is_default": True,
    }

@api_router.put("/hr/document-templates/{key}")
async def upsert_document_template(key: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Save a customised template. Body: {subject, body_html} — supports placeholders like {emp_name},{position},{salary},{joining_date},{department},{effective_date},{reason} etc."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    body_html = data.get("body_html", "").strip()
    subject = data.get("subject", "").strip()
    if not body_html:
        raise HTTPException(status_code=400, detail="body_html cannot be empty")
    update = {"key": key, "subject": subject, "body_html": body_html,
              "updated_by": current_user['id'], "updated_by_name": current_user.get('name', ''),
              "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.document_templates.update_one({"key": key}, {"$set": update}, upsert=True)
    return {"message": "Template saved", "template": update}

@api_router.delete("/hr/document-templates/{key}")
async def delete_document_template(key: str, current_user: dict = Depends(get_current_user)):
    """Reset to built-in default by removing the override."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    r = await db.document_templates.delete_one({"key": key})
    return {"message": "Reverted to built-in default" if r.deleted_count else "No override existed"}

# ==================== STANDARD EMPLOYMENT TERMS (editable footer block) ====================
# Built-in defaults — used when no DB override exists. Kept in sync with COMPANY at module load.
DEFAULT_EMPLOYMENT_TERMS = {k: COMPANY[k] for k in EMPLOYMENT_TERM_KEYS}

async def _refresh_employment_terms_cache():
    """Reload override from DB and merge into COMPANY so every letter footer picks it up."""
    try:
        doc = await db.company_settings.find_one({"key": "employment_terms"}, {"_id": 0})
        for k in EMPLOYMENT_TERM_KEYS:
            COMPANY[k] = (doc or {}).get(k) or DEFAULT_EMPLOYMENT_TERMS[k]
    except Exception as e:
        logger.error(f"Failed to load employment terms override: {e}")

async def _backfill_telecaller_counts():
    """Hydrate stale total_calls / conversions on legacy telecaller + inhouse_telecaller
    rows. Idempotent — recomputes from real lead.call_logs + inhouse_call_logs + delivered
    orders on every boot so SMs always see the true count even if past PUTs missed the
    $inc (e.g. inhouse_telecaller role wasn't covered before)."""
    try:
        for coll_name in ("telecallers", "inhouse_telecallers"):
            async for u in db[coll_name].find({}, {"_id": 0, "id": 1}):
                uid = u.get("id")
                if not uid:
                    continue
                cnt = 0
                async for lead in db.leads.find({"assigned_to": uid}, {"_id": 0, "call_logs": 1}):
                    cnt += len(lead.get("call_logs") or [])
                cnt += await db.inhouse_call_logs.count_documents({"caller_id": uid})
                conv = await db.orders.count_documents({"created_by": uid, "status": {"$in": ["confirmed", "shipped", "delivered"]}})
                await db[coll_name].update_one({"id": uid}, {"$set": {"total_calls": cnt, "conversions": conv}})
    except Exception as e:
        logger.error(f"telecaller counters backfill skipped: {e}")


async def _backfill_lead_last_order():
    """For any lead that has a last_order_date but missing last_order_amount/products,
    derive them from the most recent delivered order. One-time best-effort hydration so
    SM/DM repeat & relationship views show product name + order value for legacy data."""
    try:
        async for lead in db.leads.find(
            {"last_order_date": {"$ne": ""},
             "$or": [{"last_order_amount": {"$exists": False}}, {"last_order_amount": 0}, {"last_order_amount": None}]},
            {"_id": 0, "id": 1}
        ):
            order = await db.orders.find_one(
                {"lead_id": lead["id"], "status": "delivered"},
                {"_id": 0, "total_amount": 1, "items": 1, "id": 1},
                sort=[("delivered_at", -1)]
            )
            if not order:
                continue
            items = order.get("items") or []
            last_products = ", ".join([(it.get("product_name") or "").strip() for it in items if it.get("product_name")])
            await db.leads.update_one(
                {"id": lead["id"]},
                {"$set": {
                    "last_order_id": order.get("id", ""),
                    "last_order_amount": order.get("total_amount", 0),
                    "last_order_products": last_products,
                }},
            )
    except Exception as e:
        logger.error(f"Lead last-order backfill skipped: {e}")

# --- name lookup cache used by backfill so we don't hammer the db ---
_name_cache = {}
async def _lookup_user_name(uid: str) -> str:
    """Find a user's display name by their id across every role collection.
    Returns "" if not found. Caches in-process to keep startup fast."""
    if not uid:
        return ""
    if uid in _name_cache:
        return _name_cache[uid]
    for coll in ROLE_COLLECTIONS.values():
        u = await db[coll].find_one({"id": uid}, {"_id": 0, "name": 1})
        if u and u.get("name"):
            _name_cache[uid] = u["name"]
            return u["name"]
    _name_cache[uid] = ""
    return ""

async def _backfill_created_by_names():
    """One-time hydration: for every collection that stores `created_by` as a raw user id
    but is missing `created_by_name`, look up the user's name and stamp it. This is what
    was causing 'tc-3eed7f' / 'sm-1f2…' to show up in the UI instead of the staff member's
    real name on expense / order / candidate / task / fund-request lists.

    Also fills `paid_to_user_name` / `assigned_to_name` / `requested_by_name` /
    `approved_by_name` / `forwarded_to_name` / `head_name` / `created_by_role` where
    blank but the corresponding id is set."""
    # (collection_name, [(id_field, name_field, role_field_or_None)])
    targets = [
        ("expenses", [("created_by", "created_by_name", None), ("approved_by", "approved_by_name", None),
                      ("paid_to_user_id", "paid_to_name", None)]),
        ("orders", [("created_by", "created_by_name", "created_by_role"), ("approved_by", "approved_by_name", None),
                    ("shipped_by", "shipped_by_name", None), ("delivered_by", "delivered_by_name", None),
                    ("last_edited_by", "last_edited_by_name", "last_edited_by_role")]),
        ("hiring_candidates", [("created_by", "created_by_name", "created_by_role"),
                               ("forwarded_to", "forwarded_to_name", "forwarded_role"),
                               ("manager_selected_by", "manager_selected_by_name", "manager_selected_by_role")]),
        ("leads", [("assigned_to", "assigned_to_name", None), ("created_by", "created_by_name", None)]),
        ("tasks", [("assigned_to", "assigned_to_name", None), ("created_by", "created_by_name", None)]),
        ("fund_requests", [("requested_by", "requested_by_name", None), ("approved_by", "approved_by_name", None)]),
        ("investments", [("created_by", "created_by_name", None)]),
        ("commissions", [("user_id", "user_name", "user_role")]),
        ("payroll", [("user_id", "user_name", "user_role")]),
        ("notifications", [("user_id", "user_name", None)]),
        ("attendance", [("user_id", "user_name", None)]),
        ("team_groups", [("created_by", "created_by_name", "created_by_role"), ("head_id", "head_name", None)]),
        ("instructions", [("created_by", "created_by_name", None)]),
        ("tickets", [("user_id", "user_name", None)]),
        ("complaints", [("user_id", "user_name", None)]),
        ("leaves", [("user_id", "user_name", None)]),
        ("audit_logs", [("user_id", "changed_by_name", None)]),
    ]
    role_lookup_cache = {}
    async def _lookup_role(uid):
        if not uid: return ""
        if uid in role_lookup_cache: return role_lookup_cache[uid]
        for role, coll in ROLE_COLLECTIONS.items():
            u = await db[coll].find_one({"id": uid}, {"_id": 0, "id": 1})
            if u:
                role_lookup_cache[uid] = role
                return role
        role_lookup_cache[uid] = ""
        return ""

    total_fixed = 0
    for coll_name, mappings in targets:
        try:
            for id_field, name_field, role_field in mappings:
                # Find docs that have an id but a missing/blank name
                async for doc in db[coll_name].find(
                    {id_field: {"$exists": True, "$ne": "", "$ne": None},
                     "$or": [{name_field: {"$exists": False}}, {name_field: ""}, {name_field: None}]},
                    {"_id": 0, "id": 1, id_field: 1}
                ):
                    uid = doc.get(id_field)
                    if not uid: continue
                    name = await _lookup_user_name(uid)
                    if not name: continue
                    update = {name_field: name}
                    if role_field:
                        role = await _lookup_role(uid)
                        if role: update[role_field] = role
                    await db[coll_name].update_one({"id": doc["id"]}, {"$set": update})
                    total_fixed += 1
        except Exception as e:
            logger.error(f"name backfill on {coll_name} skipped: {e}")
    if total_fixed:
        logger.info(f"Hydrated {total_fixed} '_name' fields across legacy records.")

@api_router.get("/hr/employment-terms")
async def get_employment_terms(current_user: dict = Depends(get_current_user)):
    """Return current effective terms (override if any, else built-in) + the built-in defaults."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    doc = await db.company_settings.find_one({"key": "employment_terms"}, {"_id": 0})
    effective = {k: (doc or {}).get(k) or DEFAULT_EMPLOYMENT_TERMS[k] for k in EMPLOYMENT_TERM_KEYS}
    return {
        "terms": effective,
        "defaults": DEFAULT_EMPLOYMENT_TERMS,
        "is_default": doc is None,
        "updated_by_name": (doc or {}).get("updated_by_name", ""),
        "updated_at": (doc or {}).get("updated_at", ""),
    }

@api_router.put("/hr/employment-terms")
async def update_employment_terms(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    update = {"key": "employment_terms",
              "updated_by": current_user['id'],
              "updated_by_name": current_user.get('name', ''),
              "updated_at": datetime.now(timezone.utc).isoformat()}
    for k in EMPLOYMENT_TERM_KEYS:
        v = (data.get(k) or "").strip()
        if not v:
            raise HTTPException(status_code=400, detail=f"Field '{k}' cannot be empty")
        update[k] = v
    await db.company_settings.update_one({"key": "employment_terms"}, {"$set": update}, upsert=True)
    await _refresh_employment_terms_cache()
    return {"message": "Standard employment terms updated", "terms": {k: COMPANY[k] for k in EMPLOYMENT_TERM_KEYS}}

@api_router.delete("/hr/employment-terms")
async def reset_employment_terms(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    r = await db.company_settings.delete_one({"key": "employment_terms"})
    await _refresh_employment_terms_cache()
    return {"message": "Reverted to built-in defaults" if r.deleted_count else "No override existed"}

def _render_custom_template(body_html: str, ctx: dict) -> str:
    """Replace {placeholder} tokens with values from ctx, leaving unknown tokens unchanged."""
    out = body_html
    for k, v in ctx.items():
        try:
            out = out.replace("{" + k + "}", str(v))
        except Exception:
            pass
    return out

# ==================== EMAIL TEMPLATES ====================
@api_router.post("/hr/send-email")
async def hr_send_email(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    template = data.get("template", "custom")
    to_email = data.get("to_email", "")
    emp_name = data.get("emp_name", "")
    if not to_email:
        raise HTTPException(status_code=400, detail="Email required")
    position = data.get('position', '—')
    salary = data.get('salary', 0)
    incentive = data.get('incentive', 0) or 0
    joining_date = data.get('joining_date', '—')
    effective_date = data.get('effective_date', '—')
    old_salary = data.get('old_salary', 0)
    new_salary = data.get('new_salary', 0)
    reason = data.get('reason', '—')
    details_text = data.get('details', '')
    department = data.get('department', 'Operations')
    reporting_to = data.get('reporting_to', 'HR Manager')

    # Check for custom override first
    override = await db.document_templates.find_one({"key": template}, {"_id": 0})
    if override and override.get("body_html"):
        ctx = {
            "emp_name": emp_name, "position": position, "salary": f"{salary:,}" if isinstance(salary, (int, float)) else salary,
            "incentive": f"{incentive:,}" if isinstance(incentive, (int, float)) else incentive,
            "joining_date": joining_date, "effective_date": effective_date,
            "department": department, "reporting_to": reporting_to,
            "old_salary": f"{old_salary:,}" if isinstance(old_salary, (int, float)) else old_salary,
            "new_salary": f"{new_salary:,}" if isinstance(new_salary, (int, float)) else new_salary,
            "reason": reason, "details": details_text,
            "company_name": COMPANY['name'], "company_email": COMPANY['email'],
            "company_phone": COMPANY['phone'], "company_address": f"{COMPANY['address_line1']}, {COMPANY['address_line2']}",
            "work_hours": COMPANY['work_hours'], "weekly_off": COMPANY['weekly_off'],
            "today_date": datetime.now(timezone.utc).strftime('%d %B %Y'),
        }
        subject = _render_custom_template(override.get("subject", "") or f"Communication from {COMPANY['name']}", ctx)
        body = _letterhead(subject) + _render_custom_template(override["body_html"], ctx) + _letterhead_footer(show_terms=True)
        success, err = await send_email_async(to_email, subject, body)
        comm = {"id": f"comm-{uuid.uuid4().hex[:8]}", "template": template + "_custom", "to_email": to_email,
                "emp_name": emp_name, "subject": subject, "status": "sent" if success else "failed",
                "error": err if not success else "",
                "sent_by": current_user['id'], "sent_by_name": current_user.get('name', ''),
                "created_at": datetime.now(timezone.utc).isoformat()}
        await db.hr_communications.insert_one(comm); comm.pop("_id", None)
        if not success:
            raise HTTPException(status_code=502, detail=f"Email send failed: {err or 'SMTP not configured'}")
        return {"message": "Email sent (custom template)", "communication": comm}

    if template == "welcome":
        subject = f"Welcome to {COMPANY['name']} – Appointment & Joining Confirmation"
        rows = [
            ("Employee Name", f"<b>{emp_name}</b>"),
            ("Designation", position),
            ("Department", department),
            ("Reporting To", reporting_to),
            ("Date of Joining", joining_date),
            ("Monthly Gross Salary", f"₹ {salary:,}"),
            ("Performance Incentive", f"₹ {incentive:,} / month (target-based)" if incentive else "Performance-based (as per role policy)"),
            ("Work Schedule", COMPANY['work_hours']),
            ("Probation Period", COMPANY['probation']),
        ]
        body = _letterhead("Appointment & Welcome Letter") + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>It is our absolute pleasure to welcome you to the <b>{COMPANY['name']}</b> family. After careful evaluation of your skills, experience and aspirations, we are delighted to confirm your appointment with us. We are confident that your contribution will help us continue to grow and serve our customers with excellence.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Below are the key details of your appointment:</p>
{_details_table(rows)}
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Kindly report to our office on your joining date by 9:30 AM with the following: PAN card, Aadhaar, two passport-size photographs, education certificates, previous experience letters and a cancelled cheque for salary processing.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Once again, a very warm welcome on board. We look forward to a long and rewarding association.</p>
""" + _letterhead_footer(show_terms=True)
    elif template == "increment":
        subject = f"Salary Revision – Appreciation Letter | {COMPANY['name']}"
        rows = [
            ("Employee Name", f"<b>{emp_name}</b>"),
            ("Designation", position),
            ("Previous Monthly Salary", f"₹ {old_salary:,}"),
            ("Revised Monthly Salary", f"<span style='color:{COMPANY['primary_color']};font-weight:600'>₹ {new_salary:,}</span>"),
            ("Increment Amount", f"₹ {(new_salary - old_salary):,} per month"),
            ("Effective From", effective_date),
        ]
        body = _letterhead("Salary Revision Letter") + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We sincerely appreciate your dedication, consistency and the value you have brought to <b>{COMPANY['name']}</b>. In recognition of your performance and continued commitment, we are pleased to inform you of a revision in your compensation.</p>
{_details_table(rows)}
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>All other terms of your employment remain unchanged. We trust that this revision will further motivate you and look forward to your continued contributions.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Congratulations once again, and keep glowing!</p>
""" + _letterhead_footer()
    elif template == "termination":
        subject = f"Notice of Termination – {COMPANY['name']}"
        rows = [
            ("Employee Name", f"<b>{emp_name}</b>"),
            ("Designation", position),
            ("Effective Date of Termination", f"<span style='color:{COMPANY['danger_color']};font-weight:600'>{effective_date}</span>"),
            ("Reason", reason),
        ]
        body = _letterhead("Notice of Termination", accent=COMPANY['danger_color']) + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This letter serves as formal notice that your employment with <b>{COMPANY['name']}</b> stands terminated with effect from the date mentioned below. This decision has been taken after due consideration in accordance with our company policy and the terms of your employment agreement.</p>
{_details_table(rows)}
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'><b>Action Required:</b></p>
<ul style='font-family:Georgia,serif;font-size:12.5px;line-height:1.8;padding-left:22px'>
<li>Return all company property — laptop, ID card, SIM, samples, documents and any other assets — on or before your last working day.</li>
<li>Complete a formal handover of pending tasks, customer files and credentials to your reporting manager.</li>
<li>Settle any outstanding company dues, if applicable.</li>
<li>Your full and final settlement (pending salary, leave encashment, applicable deductions) will be processed within 30–45 days from the effective date and credited to your registered bank account.</li>
</ul>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>For any clarification, please write to <b>{COMPANY['email']}</b> or call <b>{COMPANY['phone']}</b>. We wish you the best in your future endeavors.</p>
""" + _letterhead_footer()
    elif template == "warning":
        subject = f"Official Warning Letter – {COMPANY['name']}"
        rows = [
            ("Employee Name", f"<b>{emp_name}</b>"),
            ("Designation", position),
            ("Subject of Warning", f"<span style='color:{COMPANY['warning_color']};font-weight:600'>{reason}</span>"),
            ("Date Issued", datetime.now(timezone.utc).strftime('%d %B %Y')),
        ]
        body = _letterhead("Official Warning Letter", accent=COMPANY['warning_color']) + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>It has come to our attention that there has been a deviation from the standards of professional conduct expected at <b>{COMPANY['name']}</b>. This letter is being issued as a formal record of that observation.</p>
{_details_table(rows)}
<div style='background:#FFF7E6;border-left:3px solid {COMPANY['warning_color']};padding:14px 18px;margin:14px 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.7'>
<p style='margin:0 0 6px;font-weight:600'>Details of the incident / observation:</p>
<p style='margin:0;color:#2C3531'>{details_text or 'Details discussed verbally with the reporting manager.'}</p>
</div>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>You are hereby advised to take immediate corrective action and ensure that such conduct is not repeated. Continued deviation may invite further disciplinary measures, including, but not limited to, suspension or termination as per company policy.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We believe in your potential and would encourage you to discuss any challenges or support you may need with your reporting manager or HR. Please acknowledge receipt of this letter.</p>
""" + _letterhead_footer()
    elif template == "offer":
        subject = f"Job Offer – {position} | {COMPANY['name']}"
        ctc_annual = (int(salary) + int(incentive or 0)) * 12 if salary else 0
        rows = [
            ("Candidate Name", f"<b>{emp_name}</b>"),
            ("Position Offered", f"<b>{position}</b>"),
            ("Department", department),
            ("Reporting To", reporting_to),
            ("Date of Joining", joining_date),
            ("Monthly Fixed Salary", f"₹ {salary:,}"),
            ("Monthly Incentive (Variable)", f"₹ {incentive:,}" if incentive else "Performance-linked"),
            ("Estimated Annual CTC", f"₹ {ctc_annual:,}" if ctc_annual else "As per role"),
            ("Work Schedule", COMPANY['work_hours']),
            ("Notice Period", COMPANY['notice_period']),
            ("Probation", COMPANY['probation']),
        ]
        body = _letterhead("Letter of Offer") + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Following our recent discussions and assessment of your candidature, we are delighted to extend an offer of employment with <b>{COMPANY['name']}</b>. We were impressed with your background and believe you will be a valuable addition to our team.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>The principal terms of our offer are summarised below:</p>
{_details_table(rows)}
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'><b>What we offer beyond compensation:</b></p>
<ul style='font-family:Georgia,serif;font-size:12.5px;line-height:1.8;padding-left:22px'>
<li>Structured onboarding & training programme</li>
<li>Performance reviews twice a year with clear growth pathways</li>
<li>Paid leaves: {COMPANY['leave_policy']}</li>
<li>Festival bonuses, employee discount on company products</li>
<li>A respectful, collaborative and growth-oriented work culture</li>
</ul>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This offer is valid for <b>7 days</b> from the date of issue. Please confirm your acceptance by replying to <b>{COMPANY['email']}</b> or calling <b>{COMPANY['phone']}</b>. Upon acceptance, a formal Appointment Letter will be issued on your day of joining.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We look forward to welcoming you on board!</p>
""" + _letterhead_footer(show_terms=True)
    elif template == "employment":
        subject = f"Employment Confirmation – {COMPANY['name']}"
        rows = [
            ("Employee Name", f"<b>{emp_name}</b>"),
            ("Designation", position),
            ("Department", department),
            ("Date of Joining", joining_date),
            ("Confirmation Date", effective_date if effective_date != '—' else datetime.now(timezone.utc).strftime('%d %B %Y')),
            ("Monthly Salary", f"₹ {salary:,}"),
            ("Employment Status", "<b style='color:#3B5249'>Confirmed (Permanent)</b>"),
        ]
        body = _letterhead("Employment Confirmation Letter") + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We are pleased to confirm your employment with <b>{COMPANY['name']}</b> on a permanent basis, having successfully completed your probation period. Your performance, attitude and contribution during the probation have been highly commendable.</p>
{_details_table(rows)}
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>All terms and conditions of your initial appointment letter shall continue to apply, along with full eligibility for company benefits including paid leaves, festival bonuses, and the employee welfare schemes.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We look forward to your continued dedication and many more milestones together. Welcome to the permanent team!</p>
""" + _letterhead_footer(show_terms=True)
    elif template == "agreement":
        subject = f"Employment Agreement & Code of Conduct – {COMPANY['name']}"
        body = _letterhead("Employment Agreement") + f"""
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This Employment Agreement (the "Agreement") is entered into on <b>{datetime.now(timezone.utc).strftime('%d %B %Y')}</b> between <b>{COMPANY['name']}</b>, having its registered office at {COMPANY['address_line1']}, {COMPANY['address_line2']} (hereinafter referred to as the "<b>Company</b>"), and <b>{emp_name}</b>, designated as <b>{position}</b> (hereinafter referred to as the "<b>Employee</b>").</p>
{_details_table([
    ("1. Position", position),
    ("2. Compensation", f"₹ {salary:,} per month (gross)"),
    ("3. Date of Joining", joining_date),
    ("4. Work Hours", COMPANY['work_hours']),
    ("5. Probation Period", COMPANY['probation']),
    ("6. Notice Period", COMPANY['notice_period']),
])}
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7;margin-top:14px'><b>7. Confidentiality.</b> The Employee shall not, during or after the term of employment, disclose any proprietary or confidential information including customer lists, pricing, formulations, supplier data, or business strategy to any third party.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'><b>8. Non-Compete.</b> During employment and for a period of 6 months thereafter, the Employee shall not directly or indirectly engage with a direct competitor in the same product category within Kerala.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'><b>9. Intellectual Property.</b> All work, content, designs, formulations, scripts, customer data and code created during the course of employment shall remain the sole property of the Company.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'><b>10. Code of Conduct.</b> The Employee shall maintain professional behaviour, respect colleagues and customers, abide by anti-harassment and anti-discrimination policies, and refrain from any activity that may bring disrepute to the Company.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'><b>11. Termination.</b> Either party may terminate this Agreement by serving the notice period mentioned above. The Company reserves the right of summary termination in case of misconduct, fraud or breach of policy.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'><b>12. Governing Law.</b> This Agreement shall be governed by the laws of India and disputes, if any, shall be subject to the exclusive jurisdiction of courts at Calicut, Kerala.</p>
<table style='width:100%;border:none;margin:36px 0 18px;font-family:Arial,sans-serif;font-size:12px'><tr>
<td style='border:none;width:50%;text-align:left'>
<div style='border-top:1px solid #2C3531;padding-top:6px;display:inline-block;min-width:200px'>
<p style='margin:0;font-weight:600'>{emp_name}</p>
<p style='margin:0;font-size:10px;color:#59615D'>(Employee)</p>
<p style='margin:8px 0 0;font-size:10px'>Date: __________________</p>
</div></td>
<td style='border:none;width:50%;text-align:right'>
<div style='border-top:1px solid #2C3531;padding-top:6px;display:inline-block;min-width:200px;text-align:left'>
<p style='margin:0;font-weight:600'>For {COMPANY['name']}</p>
<p style='margin:0;font-size:10px;color:#59615D'>(Authorized Signatory)</p>
<p style='margin:8px 0 0;font-size:10px'>Date: __________________</p>
</div></td>
</tr></table>
""" + _letterhead_footer()
    elif template == "relieving":
        subject = f"Relieving Letter – {COMPANY['name']}"
        rows = [
            ("Employee Name", f"<b>{emp_name}</b>"),
            ("Designation", position),
            ("Date of Joining", joining_date),
            ("Last Working Day", effective_date),
            ("Reason for Separation", reason if reason != '—' else "Resignation accepted"),
        ]
        body = _letterhead("Relieving Letter") + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name}</b>,</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>This is to formally confirm that you have been relieved from your duties at <b>{COMPANY['name']}</b> with effect from the close of business on the date mentioned below. We acknowledge that you have completed all formalities including handover of duties, return of company property and clearance of dues.</p>
{_details_table(rows)}
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>Your full & final settlement, including any pending salary, leave encashment and applicable statutory amounts, will be credited to your registered bank account within 30–45 working days from your last working day. Form 16 and other tax-related documents will be shared in due course.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.7'>We thank you for the contributions you have made during your tenure with us, and we wish you continued success and fulfilment in all your future endeavors.</p>
""" + _letterhead_footer()
    elif template == "experience":
        subject = f"Experience Certificate – {emp_name} | {COMPANY['name']}"
        body = _letterhead("Experience Certificate") + f"""
<p style='font-family:Georgia,serif;font-size:13px;text-align:center;letter-spacing:1px;color:#59615D;margin:6px 0 22px'>To Whomsoever It May Concern</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.85'>This is to certify that <b>{emp_name}</b> was employed with <b>{COMPANY['name']}</b> as <b>{position}</b> from <b>{joining_date}</b> to <b>{effective_date}</b>.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.85'>During this period, {emp_name.split()[0] if emp_name else 'the employee'} was associated with our <b>{department}</b> department and was responsible for duties commensurate with the role. We found {emp_name.split()[0] if emp_name else 'the employee'} to be sincere, hardworking and a quick learner. Their conduct, punctuality and team spirit during the tenure was found to be satisfactory and professional.</p>
<p style='font-family:Georgia,serif;font-size:13px;line-height:1.85'>We extend our best wishes for {('his' if data.get('gender','').lower()=='male' else 'her' if data.get('gender','').lower()=='female' else 'their')} future endeavors.</p>
<p style='font-family:Georgia,serif;font-size:12px;color:#59615D;margin-top:24px;font-style:italic'>This certificate is issued upon request of the said employee.</p>
""" + _letterhead_footer(signatory="Authorized Signatory · HR Department")
    else:
        subject = data.get("subject", f"Communication from {COMPANY['name']}")
        custom_msg = data.get('message', '')
        # Convert plain newlines to <br> for nicer rendering
        custom_msg_html = custom_msg.replace('\n', '<br>') if '<' not in custom_msg else custom_msg
        body = _letterhead(subject if subject else "Official Communication") + f"""
<p style='font-family:Georgia,serif;font-size:13px'>Dear <b>{emp_name or 'Team Member'}</b>,</p>
<div style='font-family:Georgia,serif;font-size:13px;line-height:1.8;color:#2C3531;margin:10px 0 18px'>{custom_msg_html}</div>
<p style='font-family:Georgia,serif;font-size:12.5px;line-height:1.7;color:#59615D'>For any queries or clarifications, feel free to write to us at <b>{COMPANY['email']}</b> or call <b>{COMPANY['phone']}</b>.</p>
""" + _letterhead_footer()
    success, err = await send_email_async(to_email, subject, body)
    # Log communication
    comm = {"id": f"comm-{uuid.uuid4().hex[:8]}", "template": template, "to_email": to_email,
            "emp_name": emp_name, "subject": subject, "status": "sent" if success else "failed",
            "error": err if not success else "",
            "sent_by": current_user['id'], "sent_by_name": current_user.get('name', ''),
            "created_at": datetime.now(timezone.utc).isoformat()}
    await db.hr_communications.insert_one(comm); comm.pop("_id", None)
    if not success:
        raise HTTPException(status_code=502, detail=f"Email send failed: {err or 'SMTP not configured'}")
    return {"message": "Email sent successfully", "communication": comm}

@api_router.post("/hr/bulk-email")
async def hr_bulk_email(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    emails = data.get("emails", [])
    subject = data.get("subject", "Message from Celesta Glow")
    message = data.get("message", "")
    results = []
    for em in emails:
        body = f"""<div style='font-family:Arial;max-width:600px;margin:0 auto;padding:20px'>
<h2 style='color:#3B5249'>Celesta Glow</h2>
<p>Dear <b>{em.get('name','')}</b>,</p>
<div>{message}</div>
<p>Regards,<br><b>Celesta Glow HR Team</b></p></div>"""
        success, err = await send_email_async(em.get('email',''), subject, body)
        results.append({"email": em.get('email',''), "status": "sent" if success else "failed", "error": err if not success else ""})
    return {"results": results, "total": len(emails), "sent": sum(1 for r in results if r['status'] == 'sent')}

@api_router.get("/hr/communications")
async def get_hr_communications(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    return {"communications": await db.hr_communications.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)}


# ==================== CONTENT PILLARS & SCRIPTS ====================
@api_router.post("/content/pillars")
async def create_pillar(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist']:
        raise HTTPException(status_code=403)
    pillar = {"id": f"pil-{uuid.uuid4().hex[:8]}", "title": data.get("title",""), "description": data.get("description",""),
              "color": data.get("color", "#3B5249"), "icon": data.get("icon", "Layers"),
              "status": "active", "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
              "created_at": datetime.now(timezone.utc).isoformat()}
    await db.content_pillars.insert_one(pillar); pillar.pop("_id", None)
    return {"pillar": pillar}

@api_router.put("/content/pillars/{pid}")
async def update_pillar(pid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist']:
        raise HTTPException(status_code=403)
    update = {k: v for k, v in data.items() if k not in ["id", "_id"]}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.content_pillars.update_one({"id": pid}, {"$set": update})
    return {"message": "Pillar updated"}

@api_router.delete("/content/pillars/{pid}")
async def delete_pillar(pid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager']:
        raise HTTPException(status_code=403)
    # Reject deletion if scripts exist underneath
    if await db.content_scripts.find_one({"pillar_id": pid}):
        raise HTTPException(status_code=400, detail="Cannot delete: this pillar still has scripts. Move or delete them first.")
    await db.content_pillars.delete_one({"id": pid})
    return {"message": "Pillar deleted"}

@api_router.get("/content/pillars")
async def get_pillars(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist', 'content_developer']:
        raise HTTPException(status_code=403)
    pillars = await db.content_pillars.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for p in pillars:
        scripts = await db.content_scripts.find({"pillar_id": p['id']}, {"_id": 0}).to_list(200)
        p['scripts'] = scripts
        # Pillar-level rollup so the SMM dashboard can show pending / completed / posted at a glance.
        counts = {"total": len(scripts), "draft": 0, "in_progress": 0, "awaiting_approval": 0,
                  "ready_to_post": 0, "posted": 0, "revision": 0}
        type_breakdown = {}
        for s in scripts:
            ct = s.get("content_type", "reel")
            type_breakdown[ct] = type_breakdown.get(ct, 0) + 1
            ps = s.get("post_status", "pending")
            paps = s.get("post_approval_status", "none")
            if ps == "posted":
                counts["posted"] += 1
            elif paps == "pending":
                counts["awaiting_approval"] += 1
            elif paps == "rejected":
                counts["revision"] += 1
            elif paps == "approved" and ps != "posted":
                counts["ready_to_post"] += 1
            elif s.get("assigned_to") or s.get("status") == "assigned":
                counts["in_progress"] += 1
            else:
                counts["draft"] += 1
        counts["pending"] = counts["draft"] + counts["in_progress"] + counts["awaiting_approval"] + counts["revision"] + counts["ready_to_post"]
        counts["completed"] = counts["posted"]
        p['counts'] = counts
        p['type_breakdown'] = type_breakdown
    return {"pillars": pillars}

@api_router.post("/content/scripts")
async def create_script(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist', 'content_developer']:
        raise HTTPException(status_code=403)
    content_type = data.get("content_type", "reel")  # reel | post | story | flyer | video | carousel | ad | blog
    platform = data.get("platform", "instagram")
    # Step enablement per content type — drives CD UI
    step_map = {
        "reel":     {"video": True,  "edit": True,  "design": False, "post": True},
        "video":    {"video": True,  "edit": True,  "design": False, "post": True},
        "story":    {"video": True,  "edit": False, "design": True,  "post": True},
        "post":     {"video": False, "edit": False, "design": True,  "post": True},
        "carousel": {"video": False, "edit": False, "design": True,  "post": True},
        "flyer":    {"video": False, "edit": False, "design": True,  "post": True},
        "ad":       {"video": True,  "edit": True,  "design": True,  "post": True},
        "blog":     {"video": False, "edit": False, "design": False, "post": True},
    }
    steps = step_map.get(content_type, step_map["reel"])
    script = {"id": f"scr-{uuid.uuid4().hex[:8]}", "pillar_id": data.get("pillar_id",""),
              "title": data.get("title",""), "script_text": data.get("script_text",""),
              "content_type": content_type, "platform": platform,
              "steps": steps,
              "deadline": data.get("deadline", ""),
              "priority": data.get("priority", "P2"), "status": "draft",
              "assigned_videographer": "", "assigned_editor": "", "assigned_designer": "",
              "video_status": "pending" if steps["video"] else "n/a",
              "edit_status":  "pending" if steps["edit"]  else "n/a",
              "design_status":"pending" if steps["design"]else "n/a",
              "post_status": "pending", "post_link": "",
              "post_approval_status": "none",  # none | pending | approved | rejected
              "post_submitted_by": "", "post_submitted_at": "",
              "post_approved_by": "", "post_approved_at": "",
              "video_link": "", "edited_link": "", "design_link": "",
              "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
              "created_at": datetime.now(timezone.utc).isoformat()}
    await db.content_scripts.insert_one(script); script.pop("_id", None)
    return {"script": script}

@api_router.put("/content/scripts/{sid}")
async def update_script(sid: str, data: dict, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.items() if k not in ["id", "_id"]}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.content_scripts.update_one({"id": sid}, {"$set": update})
    return {"message": "Script updated"}

@api_router.post("/content/scripts/{sid}/submit-post")
async def submit_post_for_approval(sid: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Content Developer submits the finished deliverable (edited video / design / blog) for SMM approval.
    The live post URL is NOT required here — the SMM will publish and add the live link after approval.
    The CD's Drive link should already be saved on the script via edited_link / design_link from prior steps,
    but optionally a final reference link can be passed as `deliverable_link`.
    """
    if current_user['role'] not in ['content_developer', 'admin']:
        raise HTTPException(status_code=403, detail="Content Developer only")
    script = await db.content_scripts.find_one({"id": sid}, {"_id": 0})
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    # Ensure CD has actually uploaded *something* before submitting for review.
    has_deliverable = bool(script.get("edited_link") or script.get("design_link") or script.get("video_link") or (data.get("deliverable_link") or "").strip())
    if not has_deliverable:
        raise HTTPException(status_code=400, detail="Upload your edit / design / video link first, then submit for approval")
    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "post_approval_status": "pending",
        "post_submitted_by": current_user['id'],
        "post_submitted_by_name": current_user.get('name', ''),
        "post_submitted_at": now,
        "post_notes": data.get("notes", ""),
        "updated_at": now,
    }
    # Optional final reference link (e.g. a refreshed Drive copy)
    deliverable_link = (data.get("deliverable_link") or "").strip()
    if deliverable_link:
        # Save to whichever slot makes sense, default to edited_link
        if script.get("steps", {}).get("edit"):
            updates["edited_link"] = deliverable_link
        elif script.get("steps", {}).get("design"):
            updates["design_link"] = deliverable_link
        else:
            updates["edited_link"] = deliverable_link
    await db.content_scripts.update_one({"id": sid}, {"$set": updates})
    return {"message": "Submitted for SMM approval"}

@api_router.post("/content/scripts/{sid}/approve-post")
async def approve_or_reject_post(sid: str, data: dict, current_user: dict = Depends(get_current_user)):
    """SMM reviews CD's deliverable.
    - action=approve: marks the deliverable approved. SMM still has to publish and call /mark-posted with the live URL.
    - action=reject: sends back to CD with feedback.
    - action=direct_post: SMM is publishing on the spot — requires the live `post_link`.
    """
    if current_user['role'] not in ['social_media_manager', 'admin']:
        raise HTTPException(status_code=403, detail="SMM only")
    action = data.get("action", "approve")  # approve | reject | direct_post
    now = datetime.now(timezone.utc).isoformat()
    updates = {"updated_at": now}
    if action == "approve":
        updates["post_approval_status"] = "approved"
        updates["post_status"] = "ready_to_post"  # SMM still has to publish and record the live link
        updates["status"] = "approved"
        updates["post_approved_by"] = current_user['id']
        updates["post_approved_by_name"] = current_user.get('name', '')
        updates["post_approved_at"] = now
    elif action == "reject":
        updates["post_approval_status"] = "rejected"
        updates["post_feedback"] = data.get("feedback", "")
        updates["post_status"] = "pending"
    elif action == "direct_post":
        link = (data.get("post_link") or "").strip()
        if not link:
            raise HTTPException(status_code=400, detail="post_link required for direct_post")
        updates["post_link"] = link
        updates["post_status"] = "posted"
        updates["status"] = "completed"
        updates["post_approval_status"] = "approved"
        updates["post_approved_by"] = current_user['id']
        updates["post_approved_by_name"] = current_user.get('name', '')
        updates["post_approved_at"] = now
        updates["post_published_at"] = now
    await db.content_scripts.update_one({"id": sid}, {"$set": updates})
    return {"message": f"Post {action}d"}

@api_router.post("/content/scripts/{sid}/mark-posted")
async def mark_script_posted(sid: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Records the live post URL once content is published.
    Allowed for SMM (normal flow) AND Content Developer (CD direct-post flow), plus admin.
    """
    if current_user['role'] not in ['social_media_manager', 'admin', 'content_developer']:
        raise HTTPException(status_code=403, detail="Not allowed")
    link = (data.get("post_link") or "").strip()
    if not link:
        raise HTTPException(status_code=400, detail="Live post URL is required")
    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "post_link": link,
        "post_status": "posted",
        "status": "completed",
        "post_approval_status": "approved",
        "post_published_by": current_user['id'],
        "post_published_by_name": current_user.get('name', ''),
        "post_published_by_role": current_user['role'],
        "post_published_at": now,
        "updated_at": now,
    }
    if data.get("caption"):
        updates["post_caption"] = data["caption"]
    await db.content_scripts.update_one({"id": sid}, {"$set": updates})
    return {"message": "Marked as posted"}

@api_router.delete("/content/scripts/{sid}")
async def delete_script(sid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist', 'content_developer']:
        raise HTTPException(status_code=403)
    r = await db.content_scripts.delete_one({"id": sid})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Script not found")
    return {"message": "Script deleted"}

@api_router.post("/content/scripts/{sid}/assign")
async def assign_script(sid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager']:
        raise HTTPException(status_code=403)
    updates = {"status": "assigned", "updated_at": datetime.now(timezone.utc).isoformat()}
    if data.get("content_developer_id"):
        updates["assigned_to"] = data["content_developer_id"]
        updates["video_status"] = "assigned"
        updates["edit_status"] = "pending"
        updates["design_status"] = "pending"
    # Legacy support
    if data.get("videographer_id"):
        updates["assigned_videographer"] = data["videographer_id"]
        updates["video_status"] = "assigned"
    if data.get("editor_id"):
        updates["assigned_editor"] = data["editor_id"]
        updates["edit_status"] = "assigned"
    if data.get("designer_id"):
        updates["assigned_designer"] = data["designer_id"]
        updates["design_status"] = "assigned"
    await db.content_scripts.update_one({"id": sid}, {"$set": updates})
    return {"message": "Script assigned to production team"}

@api_router.get("/content/my-tasks")
async def get_my_content_tasks(current_user: dict = Depends(get_current_user)):
    role = current_user['role']
    uid = current_user['id']
    if role == 'content_developer':
        tasks = await db.content_scripts.find({"$or": [{"assigned_to": uid}, {"assigned_videographer": uid}, {"assigned_editor": uid}, {"assigned_designer": uid}]}, {"_id": 0}).sort("priority", 1).to_list(100)
    elif role == 'videographer':
        tasks = await db.content_scripts.find({"assigned_videographer": uid}, {"_id": 0}).sort("priority", 1).to_list(100)
    elif role == 'editor':
        tasks = await db.content_scripts.find({"assigned_editor": uid}, {"_id": 0}).sort("priority", 1).to_list(100)
    elif role == 'graphic_designer':
        tasks = await db.content_scripts.find({"assigned_designer": uid}, {"_id": 0}).sort("priority", 1).to_list(100)
    else:
        raise HTTPException(status_code=403)
    # Attach pillar name
    for t in tasks:
        pillar = await db.content_pillars.find_one({"id": t.get('pillar_id')}, {"_id": 0, "title": 1})
        t['pillar_title'] = pillar['title'] if pillar else ""
    return {"tasks": tasks}

# ==================== INFLUENCER OUTREACH TRACKING ====================
@api_router.post("/influencer/outreach")
async def log_influencer_outreach(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['inhouse_telecaller', 'admin', 'social_media_manager']:
        raise HTTPException(status_code=403)
    entry = {"id": f"inf-{uuid.uuid4().hex[:8]}", "influencer_name": data.get("influencer_name",""),
             "platform": data.get("platform","instagram"), "followers": data.get("followers",0),
             "category": data.get("category","nano"),
             "contact": data.get("contact",""),
             "phone": (data.get("phone") or data.get("contact") or "").strip(),
             "status": data.get("status","pending"),
             "barter_type": data.get("barter_type",""),  # free_product | paid | ""
             "paid_amount": data.get("paid_amount", 0),
             "products_sent": data.get("products_sent", []),
             "product_tracking_link": data.get("product_tracking_link", ""),
             "fund_request_id": "",
             "call_logs": [],
             "response": data.get("response",""), "notes": data.get("notes",""),
             "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
             "created_at": datetime.now(timezone.utc).isoformat()}
    await db.influencer_outreach.insert_one(entry); entry.pop("_id", None)
    return {"entry": entry}

@api_router.get("/influencer/outreach")
async def get_influencer_outreach(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['inhouse_telecaller', 'admin', 'social_media_manager', 'hr_manager']:
        raise HTTPException(status_code=403)
    query = {}
    if current_user['role'] == 'inhouse_telecaller':
        query["created_by"] = current_user['id']
    entries = await db.influencer_outreach.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    stats = {"total": len(entries),
             "contacted": len([e for e in entries if e.get('status') == 'contacted']),
             "responded": len([e for e in entries if e.get('status') == 'responded']),
             "converted": len([e for e in entries if e.get('status') == 'converted']),
             "product_sent": len([e for e in entries if e.get('status') == 'product_sent']),
             "barter_count": len([e for e in entries if e.get('barter_type') == 'free_product']),
             "paid_count": len([e for e in entries if e.get('barter_type') == 'paid']),
             "total_paid_amount": sum(e.get('paid_amount', 0) or 0 for e in entries if e.get('barter_type') == 'paid')}
    return {"entries": entries, "stats": stats}

@api_router.put("/influencer/outreach/{eid}")
async def update_influencer_outreach(eid: str, data: dict, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.items() if k not in ["id", "_id", "call_logs"]}
    # Enforce post_link when marking converted
    if update.get("status") == "converted":
        existing = await db.influencer_outreach.find_one({"id": eid}, {"_id": 0, "post_link": 1})
        final_post_link = update.get("post_link") or (existing or {}).get("post_link") or ""
        if not final_post_link.strip():
            raise HTTPException(status_code=400, detail="post_link is required when marking converted")
        update["post_link"] = final_post_link.strip()
        update["converted_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.influencer_outreach.update_one({"id": eid}, {"$set": update})
    return {"message": "Outreach updated"}

@api_router.post("/influencer/outreach/{eid}/log-call")
async def log_influencer_call(eid: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Log a call against an influencer. Optionally moves the status (e.g. to 'contacted' or 'responded') and saves remarks."""
    if current_user['role'] not in ['inhouse_telecaller', 'admin', 'social_media_manager']:
        raise HTTPException(status_code=403)
    entry = await db.influencer_outreach.find_one({"id": eid}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Influencer not found")
    remarks = (data.get("remarks") or "").strip()
    if not remarks:
        raise HTTPException(status_code=400, detail="Remarks are required when logging a call")
    now = datetime.now(timezone.utc).isoformat()
    call = {
        "id": f"icl-{uuid.uuid4().hex[:8]}",
        "outcome": data.get("outcome", "contacted"),  # contacted | no_answer | responded | not_interested
        "remarks": remarks,
        "next_action": data.get("next_action", ""),
        "call_at": now,
        "logged_by": current_user['id'],
        "logged_by_name": current_user.get('name', ''),
    }
    update = {"updated_at": now}
    new_status = data.get("status")
    if new_status:
        update["status"] = new_status
    await db.influencer_outreach.update_one({"id": eid}, {"$push": {"call_logs": call}, "$set": update})
    return {"call": call, "message": "Call logged"}

@api_router.post("/influencer/outreach/{eid}/send-product")
async def send_product_to_influencer(eid: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Records the collaboration type (barter / paid).
    - barter_type='free_product' → product_tracking_link required + products_sent list saved.
    - barter_type='paid' → paid_amount required → automatically creates a fund request to Finance for approval.
    """
    if current_user['role'] not in ['inhouse_telecaller', 'admin', 'social_media_manager']:
        raise HTTPException(status_code=403)
    entry = await db.influencer_outreach.find_one({"id": eid}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Influencer not found")
    barter_type = data.get("barter_type", "")
    if barter_type not in ("free_product", "paid"):
        raise HTTPException(status_code=400, detail="barter_type must be 'free_product' or 'paid'")
    now = datetime.now(timezone.utc).isoformat()
    update = {"barter_type": barter_type, "status": "product_sent", "updated_at": now}
    fund_request = None
    if barter_type == "free_product":
        tracking = (data.get("product_tracking_link") or "").strip()
        if not tracking:
            raise HTTPException(status_code=400, detail="Product tracking link is required for barter collaborations")
        update["product_tracking_link"] = tracking
        update["products_sent"] = data.get("products_sent", [])
        update["product_sent_at"] = now
        update["product_notes"] = data.get("notes", "")
    else:  # paid
        amount = float(data.get("paid_amount") or 0)
        if amount <= 0:
            raise HTTPException(status_code=400, detail="paid_amount > 0 is required for paid collaborations")
        update["paid_amount"] = amount
        update["paid_notes"] = data.get("notes", "")
        # Auto-create fund request that goes to Finance Manager
        fr = {"id": f"fr-{uuid.uuid4().hex[:8]}",
              "requested_by": current_user['id'],
              "requested_by_name": current_user.get('name', ''),
              "requested_by_role": current_user['role'],
              "amount": amount,
              "reason": f"Influencer paid collab — {entry.get('influencer_name', '')} ({entry.get('platform', '')})",
              "category": "influencer_marketing",
              "linked_influencer_id": eid,
              "linked_influencer_name": entry.get('influencer_name', ''),
              "status": "pending",
              "approved_by": None,
              "payment_proof_path": "",
              "created_at": now,
              "updated_at": now}
        await db.fund_requests.insert_one(fr); fr.pop("_id", None)
        update["fund_request_id"] = fr["id"]
        update["fund_request_status"] = "pending"
        fund_request = fr
    await db.influencer_outreach.update_one({"id": eid}, {"$set": update})
    return {"message": "Product/payment recorded", "fund_request": fund_request}

@api_router.delete("/influencer/outreach/{eid}")
async def delete_influencer_outreach(eid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['inhouse_telecaller', 'admin', 'social_media_manager']:
        raise HTTPException(status_code=403)
    r = await db.influencer_outreach.delete_one({"id": eid})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Deleted"}

# ==================== HIRING TRACKER (HR Support Telecaller) ====================
@api_router.post("/hiring/candidates")
async def log_hiring_candidate(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['inhouse_telecaller', 'admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    entry = {"id": f"hire-{uuid.uuid4().hex[:8]}", "name": data.get("name",""),
             "phone": data.get("phone",""), "email": data.get("email",""),
             "position": data.get("position","telecaller"),
             "status": data.get("status","contacted"), "location": data.get("location",""),
             "experience": data.get("experience",""), "qualification": data.get("qualification",""),
             "skills": data.get("skills",""), "expected_salary": data.get("expected_salary",0),
             "interview_date": data.get("interview_date",""), "interview_notes": data.get("interview_notes",""),
             "source": data.get("source","direct"), "notes": data.get("notes",""),
             "forwarded_to": data.get("forwarded_to",""), "forwarded_to_name": data.get("forwarded_to_name",""),
             "forwarded_role": data.get("forwarded_role",""), "forwarded_at": "",
             "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
             "created_by_role": current_user.get('role',''),
             "created_at": datetime.now(timezone.utc).isoformat()}
    await db.hiring_candidates.insert_one(entry); entry.pop("_id", None)
    return {"entry": entry}

@api_router.get("/hiring/candidates")
async def get_hiring_candidates(request: Request, current_user: dict = Depends(get_current_user)):
    role = current_user['role']
    if role not in ['inhouse_telecaller', 'admin', 'hr_manager', 'sales_manager', 'district_manager', 'social_media_manager']:
        raise HTTPException(status_code=403)
    include_hired = request.query_params.get('include_hired', 'false').lower() == 'true'
    show_all = request.query_params.get('show_all', 'false').lower() == 'true'
    query = {}
    if role == 'inhouse_telecaller':
        query["created_by"] = current_user['id']
    elif role == 'hr_manager':
        # All HR managers share the SAME pipeline — they're a team working on it together.
        # No more scoping by individual HR's `created_by`. The previous logic caused HR-A and HR-B
        # to see different counts (e.g. 59 vs 90+) which confused users about real candidate volume.
        # Candidates that are private to other roles (e.g. SMM-only) can still be hidden via show_all.
        if not show_all:
            query = {"$or": [
                {"created_by_role": {"$in": ["hr_manager", "inhouse_telecaller", "admin"]}},
                {"created_by_role": {"$exists": False}},  # legacy docs lacking the role tag
                {"created_by_role": ""},
            ]}
    elif role == 'social_media_manager':
        if not show_all:
            query["created_by"] = current_user['id']
    elif role == 'sales_manager':
        # SM sees ONLY candidates explicitly forwarded to them by HR
        query = {"$and": [{"position": {"$in": ["telecaller", "telesales"]}},
                          {"forwarded_to": current_user['id']}]}
    elif role == 'district_manager':
        # DM sees ONLY candidates explicitly forwarded to them by HR
        query = {"$and": [{"position": "agent"},
                          {"forwarded_to": current_user['id']}]}
    # Auto-hide hired candidates from active list (HR/admin can opt-in via include_hired=true)
    if not include_hired:
        if role in ('hr_manager', 'admin', 'inhouse_telecaller'):
            query = {"$and": [query, {"status": {"$ne": "hired"}}]} if query else {"status": {"$ne": "hired"}}
    entries = await db.hiring_candidates.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    stats = {"total": len(entries), "contacted": len([e for e in entries if e['status'] == 'contacted']),
             "interested": len([e for e in entries if e['status'] == 'interested']),
             "interviewed": len([e for e in entries if e['status'] == 'interviewed']),
             "selected": len([e for e in entries if e['status'] == 'selected']),
             "hired": len([e for e in entries if e['status'] == 'hired']),
             "forwarded": len([e for e in entries if e.get('forwarded_to')])}
    return {"entries": entries, "stats": stats}

@api_router.put("/hiring/candidates/{cid}")
async def update_hiring_candidate(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.items() if k not in ["id", "_id"]}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.hiring_candidates.update_one({"id": cid}, {"$set": update})
    return {"message": "Candidate updated"}

@api_router.delete("/hiring/candidates/{cid}")
async def delete_hiring_candidate(cid: str, current_user: dict = Depends(get_current_user)):
    """Remove a duplicate / wrong candidate. Admin + HR Manager only."""
    if current_user['role'] not in ('admin', 'hr_manager'):
        raise HTTPException(status_code=403, detail="Only Admin or HR Manager can delete candidates")
    cand = await db.hiring_candidates.find_one({"id": cid}, {"_id": 0, "status": 1, "name": 1})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if cand.get("status") == "hired":
        raise HTTPException(status_code=400, detail="Cannot delete a candidate who is already hired — terminate via Employees tab instead")
    r = await db.hiring_candidates.delete_one({"id": cid})
    # Cascade: detach any HR call logs linked to this candidate so they don't reference a ghost
    await db.hr_call_logs.update_many({"linked_candidate_id": cid}, {"$set": {"linked_candidate_id": "", "linked_candidate_name": ""}})
    return {"message": "Candidate deleted" if r.deleted_count else "Nothing to delete", "name": cand.get("name", "")}

@api_router.post("/hiring/candidates/bulk-delete")
async def bulk_delete_hiring_candidates(data: dict, current_user: dict = Depends(get_current_user)):
    """Bulk delete candidates. Admin + HR Manager only. Skips already-hired entries."""
    if current_user['role'] not in ('admin', 'hr_manager'):
        raise HTTPException(status_code=403, detail="Only Admin or HR Manager can delete candidates")
    ids = data.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="ids list is required")
    # Don't allow deletion of already-hired candidates via bulk path
    cursor = db.hiring_candidates.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "status": 1})
    deletable = [c["id"] async for c in cursor if c.get("status") != "hired"]
    skipped = len(ids) - len(deletable)
    if not deletable:
        return {"deleted": 0, "skipped": skipped, "message": "Nothing deletable (already-hired candidates are protected)"}
    r = await db.hiring_candidates.delete_many({"id": {"$in": deletable}})
    await db.hr_call_logs.update_many({"linked_candidate_id": {"$in": deletable}}, {"$set": {"linked_candidate_id": "", "linked_candidate_name": ""}})
    return {"deleted": r.deleted_count, "skipped": skipped, "message": f"Deleted {r.deleted_count} candidate(s)" + (f" · {skipped} skipped (hired)" if skipped else "")}

# Forward candidate to a specific manager (SM/DM)
@api_router.post("/hiring/forward/{cid}")
async def forward_hire_candidate(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    target_user_id = data.get("target_user_id", "")
    target_role = data.get("target_role", "")  # sales_manager | district_manager
    if not target_user_id or target_role not in ("sales_manager", "district_manager"):
        raise HTTPException(status_code=400, detail="target_user_id and valid target_role required")
    coll = "sales_managers" if target_role == "sales_manager" else "managers"
    target = await db[coll].find_one({"id": target_user_id}, {"_id": 0})
    if not target: raise HTTPException(status_code=404, detail="Target manager not found")
    cand = await db.hiring_candidates.find_one({"id": cid}, {"_id": 0})
    if not cand: raise HTTPException(status_code=404)
    await db.hiring_candidates.update_one({"id": cid}, {"$set": {
        "forwarded_to": target_user_id, "forwarded_to_name": target.get("name",""),
        "forwarded_role": target_role, "forwarded_at": datetime.now(timezone.utc).isoformat(),
        "status": data.get("status", cand.get("status","interviewed"))}})
    await _notify(user_id=target_user_id, title="New Candidate Forwarded",
                  message=f"HR forwarded candidate {cand['name']} ({cand.get('position','')}) for your review",
                  ntype="info", link="/hiring")
    return {"message": f"Forwarded to {target.get('name','')}"}

# Get available managers for HR to forward candidates
@api_router.get("/hr/managers-for-forwarding")
async def get_managers_for_forwarding(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']: raise HTTPException(status_code=403)
    sms = await db.sales_managers.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(50)
    dms = await db.managers.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1, "district": 1}).to_list(50)
    return {"sales_managers": sms, "district_managers": dms}

# All managers across roles - for campaign-manager linking dropdown
@api_router.get("/all-managers")
async def get_all_managers(current_user: dict = Depends(get_current_user)):
    out = []
    role_collections = {
        "hr_manager":"hr_managers","sales_manager":"sales_managers","district_manager":"managers",
        "social_media_manager":"social_media_managers","finance_manager":"finance_managers",
        "inventory_manager":"inventory_managers","digital_marketing_manager":"digital_marketing_managers",
        "content_strategist":"content_strategists","assistant_sales_manager":"assistant_sales_managers",
        "assistant_district_manager":"assistant_district_managers"}
    for role, coll in role_collections.items():
        users = await db[coll].find({}, {"_id":0,"id":1,"name":1,"email":1}).to_list(50)
        for u in users: u["role"] = role; out.append(u)
    return {"managers": out}

# ----- HR Call Log (HR also makes calls — interviews, candidate followups, employee comms) -----
@api_router.post("/hr/call-logs")
async def add_hr_call_log(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']: raise HTTPException(status_code=403)
    log = {"id": f"hrcl-{uuid.uuid4().hex[:8]}", "caller_id": current_user['id'],
           "caller_name": current_user.get('name',''),
           "contact_name": data.get("contact_name",""), "phone": data.get("phone",""),
           "purpose": data.get("purpose","candidate_followup"),  # candidate_followup | interview | employee_comm | offer | other
           "linked_candidate_id": data.get("linked_candidate_id",""),
           "linked_employee_id": data.get("linked_employee_id",""),
           "duration_min": int(data.get("duration_min", 0)),
           "outcome": data.get("outcome","contacted"),  # contacted | not_reachable | scheduled_interview | accepted_offer | rejected_offer | follow_up
           "next_action": data.get("next_action",""), "next_action_date": data.get("next_action_date",""),
           "notes": data.get("notes",""),
           "call_date": data.get("call_date", date.today().isoformat()),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.hr_call_logs.insert_one(log); log.pop("_id", None)
    # If linked to a candidate, optionally update their status based on outcome
    if log["linked_candidate_id"]:
        outcome_to_status = {"scheduled_interview": "interviewed", "accepted_offer": "selected",
                             "rejected_offer": "rejected", "follow_up": "interested",
                             "contacted": "contacted"}
        new_status = outcome_to_status.get(log["outcome"])
        if new_status:
            await db.hiring_candidates.update_one({"id": log["linked_candidate_id"]},
                                                  {"$set": {"status": new_status,
                                                            "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"log": log}

@api_router.get("/hr/call-logs")
async def get_hr_call_logs(month: str = "", year: str = "", candidate_id: str = "",
                           caller_id: str = "", skip: int = 0, limit: int = 100,
                           current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']: raise HTTPException(status_code=403)
    q = {}
    if candidate_id: q["linked_candidate_id"] = candidate_id
    if caller_id: q["caller_id"] = caller_id
    if month and year: q["call_date"] = {"$regex": f"^{year}-{month.zfill(2)}"}
    total = await db.hr_call_logs.count_documents(q)
    logs = await db.hr_call_logs.find(q, {"_id": 0}).sort("created_at", -1).skip(int(skip)).to_list(int(limit))
    today_iso = date.today().isoformat()
    today_count = await db.hr_call_logs.count_documents({**q, "call_date": today_iso})
    # Per-HR breakdown across the whole filtered set (skip/limit ignored)
    pipeline = [{"$match": q}, {"$group": {"_id": {"id": "$caller_id", "name": "$caller_name"}, "count": {"$sum": 1}}}]
    by_hr_raw = await db.hr_call_logs.aggregate(pipeline).to_list(50)
    by_hr = [{"caller_id": r["_id"].get("id",""), "caller_name": r["_id"].get("name","") or "Unknown",
              "count": r["count"]} for r in by_hr_raw]
    by_hr.sort(key=lambda x: x["count"], reverse=True)
    return {"call_logs": logs, "today_count": today_count, "total": total, "by_hr": by_hr,
            "skip": int(skip), "limit": int(limit)}



# ==================== PROMOTION ENDPOINTS ====================
@api_router.post("/promote/agent-to-adm")
async def promote_agent_to_adm(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'district_manager']:
        raise HTTPException(status_code=403)
    agent_id = data.get("agent_id", "")
    agent = await db.agents.find_one({"id": agent_id}, {"_id": 0})
    if not agent: raise HTTPException(status_code=404, detail="Agent not found")
    new_id = f"adm-{uuid.uuid4().hex[:6]}"
    adm = {"id": new_id, "name": agent['name'], "email": agent['email'], "password_hash": agent.get('password_hash',''),
           "phone": agent.get('phone',''), "district": agent.get('district',''), "region_id": agent.get('region_id',''),
           "salary": agent.get('salary',0), "incentive": agent.get('incentive',0), "commission_earned": 0,
           "managed_by": current_user['id'], "status": "active",
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.assistant_district_managers.insert_one(adm)
    await db.agents.delete_one({"id": agent_id})
    adm.pop("_id", None)
    return {"message": f"{agent['name']} promoted to Assistant District Manager", "user": adm}

@api_router.post("/promote/tc-to-asm")
async def promote_tc_to_asm(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'sales_manager']:
        raise HTTPException(status_code=403)
    tc_id = data.get("telecaller_id", "")
    tc = await db.telecallers.find_one({"id": tc_id}, {"_id": 0})
    if not tc: raise HTTPException(status_code=404, detail="Telecaller not found")
    new_id = f"asm-{uuid.uuid4().hex[:6]}"
    asm = {"id": new_id, "name": tc['name'], "email": tc['email'], "password_hash": tc.get('password_hash',''),
           "phone": tc.get('phone',''), "salary": tc.get('salary',0), "incentive": tc.get('incentive',0),
           "commission_earned": 0, "managed_by": current_user['id'], "status": "active",
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.assistant_sales_managers.insert_one(asm)
    await db.telecallers.delete_one({"id": tc_id})
    asm.pop("_id", None)
    return {"message": f"{tc['name']} promoted to Assistant Sales Manager", "user": asm}

# ==================== INVENTORY MANAGER ====================
@api_router.get("/inventory/orders")
async def get_inventory_orders(status: Optional[str] = None, date_filter: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'inventory_manager']:
        raise HTTPException(status_code=403)
    query = {}
    if status: query['status'] = status
    if date_filter:  # YYYY-MM-DD or YYYY-MM
        query['created_at'] = {"$regex": f"^{date_filter}"}
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    stats = {"total": len(orders), "pending": len([o for o in orders if o.get('status')=='pending']),
             "confirmed": len([o for o in orders if o.get('status')=='confirmed']),
             "shipped": len([o for o in orders if o.get('status')=='shipped']),
             "delivered": len([o for o in orders if o.get('status')=='delivered']),
             "not_shipped": len([o for o in orders if o.get('status')=='confirmed' and not o.get('shipped_at')])}
    return {"orders": orders, "stats": stats}

@api_router.put("/inventory/orders/{oid}/ship")
async def mark_order_shipped(oid: str, data: dict = None, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'inventory_manager']:
        raise HTTPException(status_code=403)
    data = data or {}
    tracking_link = (data.get("tracking_link") or "").strip()
    if not tracking_link:
        raise HTTPException(status_code=400, detail="Tracking link is required to ship the order")
    now = datetime.now(timezone.utc).isoformat()
    update = {"status": "shipped", "shipped_at": now, "shipped_by": current_user['id'],
              "shipped_by_name": current_user.get('name',''), "tracking_link": tracking_link,
              "courier_name": data.get("courier_name",""),
              "tracking_number": data.get("tracking_number",""), "updated_at": now}
    await db.orders.update_one({"id": oid}, {"$set": update})
    return {"message": "Order marked as shipped", "tracking_link": tracking_link}

@api_router.put("/inventory/orders/{oid}/deliver")
async def mark_order_delivered_inv(oid: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'inventory_manager']:
        raise HTTPException(status_code=403)
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order: raise HTTPException(status_code=404)
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one({"id": oid}, {"$set": {"status": "delivered", "delivered_at": now, "delivered_by": current_user['id'], "delivered_by_name": current_user.get('name',''), "updated_at": now}})
    # Trigger commission chain
    pay_method = "cash" if order.get('payment_type') == "cod" else "bank"
    await record_transaction("credit", "order_revenue", order['total_amount'], f"Order {oid} delivered", reference_id=oid, method=pay_method, created_by=current_user['id'])
    creator_id = order.get('created_by', '')
    creator_role = order.get('created_by_role', '') or None
    if not creator_role:
        for coll_name, role in AUTH_COLLECTIONS.items():
            u = await db[coll_name].find_one({"id": creator_id})
            if u: creator_role = role; break
    rates = await db.config.find_one({"id": "commission_rates"}, {"_id": 0})
    rate_map = rates.get("rates", {}) if rates else {"telecaller": 8, "agent": 10, "district_manager": 5, "sales_manager": 5, "assistant_district_manager": 3, "assistant_sales_manager": 3, "inhouse_telecaller": 10}
    if creator_role and creator_role in rate_map:
        comm_amt = round(order['total_amount'] * rate_map[creator_role] / 100, 2)
        comm = {"id": f"comm-{uuid.uuid4().hex[:8]}", "user_id": creator_id, "user_name": order.get('created_by_name',''),
                "user_role": creator_role, "order_id": oid, "order_amount": order['total_amount'],
                "commission_percentage": rate_map[creator_role], "commission_amount": comm_amt,
                "status": "pending", "created_at": now}
        await db.commissions.insert_one(comm)
        coll = ROLE_COLLECTIONS.get(creator_role)
        if coll: await db[coll].update_one({"id": creator_id}, {"$inc": {"commission_earned": comm_amt}})
    # Bump conversions / sales
    if creator_role == 'telecaller':
        await db.telecallers.update_one({"id": creator_id}, {"$inc": {"conversions": 1, "total_sales": order['total_amount']}})
    elif creator_role == 'agent':
        await db.agents.update_one({"id": creator_id}, {"$inc": {"total_sales": order['total_amount']}})
    # Update lead to delivered + repeat windows
    if order.get('lead_id'):
        today_d = date.today()
        await db.leads.update_one({"id": order['lead_id']}, {"$set": {
            "status": "delivered", "last_order_date": today_d.isoformat(),
            "next_relationship_date": (today_d + timedelta(days=15)).isoformat(),
            "next_repeat_order_date": (today_d + timedelta(days=35)).isoformat(),
            "updated_at": now
        }})
    # Manager commission chain
    if creator_role == 'agent':
        for mgr in await db.managers.find({}, {"_id": 0}).to_list(20):
            mgr_rate = rate_map.get('district_manager', 5)
            mgr_comm = round(order['total_amount'] * mgr_rate / 100, 2)
            await db.commissions.insert_one({"id": f"comm-{uuid.uuid4().hex[:8]}", "user_id": mgr['id'], "user_name": mgr['name'], "user_role": "district_manager", "order_id": oid, "commission_amount": mgr_comm, "status": "pending", "created_at": now})
            await db.managers.update_one({"id": mgr['id']}, {"$inc": {"commission_earned": mgr_comm}})
            break
    elif creator_role == 'telecaller':
        for sm in await db.sales_managers.find({}, {"_id": 0}).to_list(5):
            sm_rate = rate_map.get('sales_manager', 5)
            sm_comm = round(order['total_amount'] * sm_rate / 100, 2)
            await db.commissions.insert_one({"id": f"comm-{uuid.uuid4().hex[:8]}", "user_id": sm['id'], "user_name": sm['name'], "user_role": "sales_manager", "order_id": oid, "commission_amount": sm_comm, "status": "pending", "created_at": now})
            await db.sales_managers.update_one({"id": sm['id']}, {"$inc": {"commission_earned": sm_comm}})
            break
    return {"message": "Order delivered, commissions credited"}

# ==================== ATTENDANCE ====================
IST_OFFSET = timedelta(hours=5, minutes=30)
def _ist_now():
    """Current datetime in IST."""
    return datetime.now(timezone.utc) + IST_OFFSET
def _ist_today_iso():
    return _ist_now().date().isoformat()
def _hours_between(login: str, logout: str) -> float:
    """Hours worked between two HH:MM strings (login deducts 30-min lunch)."""
    if not login or not logout: return 0
    try:
        from datetime import datetime as dt2
        h1 = dt2.strptime(login, "%H:%M"); h2 = dt2.strptime(logout, "%H:%M")
        diff = (h2 - h1).total_seconds() / 3600
        if diff <= 0: return 0
        # Deduct 30-min lunch if worked > 5h
        if diff > 5: diff -= 0.5
        return round(diff, 2)
    except Exception:
        return 0

@api_router.post("/attendance")
async def mark_attendance(data: dict, current_user: dict = Depends(get_current_user)):
    """HR-only attendance marking. Idempotent per (user_id, date)."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403, detail="Only HR / Admin can mark attendance")
    user_id = data.get("user_id", "")
    att_date = data.get("date") or _ist_today_iso()
    if not user_id: raise HTTPException(status_code=400, detail="user_id required")
    status = data.get("status", "present")  # present | absent | half_day | leave
    login_time = data.get("login_time", "") or ("09:30" if status in ("present", "half_day") else "")
    logout_time = data.get("logout_time", "")

    # NOTE: previous 5:30 PM IST gate removed — HR / Admin record attendance after-the-fact,
    # so logout_time can be set at any time. Self check-in/out endpoints remain disabled.

    hours = _hours_between(login_time, logout_time) if login_time and logout_time else 0
    record = {
        "user_id": user_id,
        "user_name": data.get("user_name", ""),
        "user_role": data.get("user_role", ""),
        "date": att_date,
        "login_time": login_time,
        "logout_time": logout_time,
        "status": status,
        "hours_worked": hours,
        "marked_by": current_user['id'],
        "marked_by_name": current_user.get('name', ''),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    existing = await db.attendance.find_one({"user_id": user_id, "date": att_date}, {"_id": 0})
    if existing:
        await db.attendance.update_one({"id": existing['id']}, {"$set": record})
        record['id'] = existing['id']
        record['created_at'] = existing.get('created_at', record['updated_at'])
        return {"attendance": record, "message": "Attendance updated"}
    record['id'] = f"att-{uuid.uuid4().hex[:8]}"
    record['created_at'] = record['updated_at']
    await db.attendance.insert_one(record); record.pop("_id", None)
    return {"attendance": record, "message": "Attendance marked"}

@api_router.get("/attendance")
async def get_attendance(month: str = "", year: str = "", user_id: str = "", date_filter: str = "", current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    query = {}
    if user_id: query["user_id"] = user_id
    if date_filter: query["date"] = date_filter
    elif month and year: query["date"] = {"$regex": f"^{year}-{month.zfill(2)}"}
    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(2000)
    return {"records": records}

@api_router.get("/attendance/daily")
async def get_attendance_daily(date_filter: str = "", current_user: dict = Depends(get_current_user)):
    """One row per employee for a given date (defaults to today IST). Includes employees with no record."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    target = date_filter or _ist_today_iso()
    # Gather all active employees across role collections (excluding admins)
    employees = []
    for role, coll in ROLE_COLLECTIONS.items():
        if role == 'admin': continue
        users = await db[coll].find({}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)
        for u in users:
            u['role'] = role
            employees.append(u)
    # Get existing attendance for target date
    existing = await db.attendance.find({"date": target}, {"_id": 0}).to_list(1000)
    by_uid = {r['user_id']: r for r in existing}
    rows = []
    for emp in employees:
        rec = by_uid.get(emp['id'])
        rows.append({
            "user_id": emp['id'], "user_name": emp.get('name', ''),
            "user_role": emp.get('role', ''), "user_email": emp.get('email', ''),
            "date": target,
            "login_time": rec.get('login_time', '') if rec else '',
            "logout_time": rec.get('logout_time', '') if rec else '',
            "status": rec.get('status', 'unmarked') if rec else 'unmarked',
            "hours_worked": rec.get('hours_worked', 0) if rec else 0,
            "marked_by_name": rec.get('marked_by_name', '') if rec else '',
            "att_id": rec.get('id', '') if rec else ''
        })
    rows.sort(key=lambda r: (r['user_role'], r['user_name']))
    # Logout gate removed — HR can set logout any time
    can_set_logout = True
    return {
        "date": target,
        "rows": rows,
        "ist_now": _ist_now().strftime("%H:%M"),
        "can_set_logout": can_set_logout,
        "logout_unlock_at": "always",
        "summary": {
            "total": len(rows),
            "present": len([r for r in rows if r['status'] == 'present']),
            "half_day": len([r for r in rows if r['status'] == 'half_day']),
            "leave": len([r for r in rows if r['status'] == 'leave']),
            "absent": len([r for r in rows if r['status'] == 'absent']),
            "unmarked": len([r for r in rows if r['status'] == 'unmarked']),
        }
    }

@api_router.get("/attendance/monthly-summary")
async def get_monthly_attendance_summary(month: str = "", year: str = "", current_user: dict = Depends(get_current_user)):
    """Totals per employee for a given month: total hours worked + present/leave/absent days."""
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    ist = _ist_now()
    m = month or str(ist.month)
    y = year or str(ist.year)
    prefix = f"{y}-{m.zfill(2)}"
    records = await db.attendance.find({"date": {"$regex": f"^{prefix}"}}, {"_id": 0}).to_list(5000)
    by_uid = {}
    for r in records:
        uid = r['user_id']
        s = by_uid.setdefault(uid, {
            "user_id": uid, "user_name": r.get('user_name', ''),
            "user_role": r.get('user_role', ''),
            "total_hours": 0, "present_days": 0, "half_days": 0,
            "leave_days": 0, "absent_days": 0, "marked_days": 0
        })
        s['total_hours'] = round(s['total_hours'] + (r.get('hours_worked') or 0), 2)
        s['marked_days'] += 1
        st = r.get('status', '')
        if st == 'present': s['present_days'] += 1
        elif st == 'half_day': s['half_days'] += 1
        elif st == 'leave': s['leave_days'] += 1
        elif st == 'absent': s['absent_days'] += 1
    # Include all employees (even with 0 records)
    for role, coll in ROLE_COLLECTIONS.items():
        if role == 'admin': continue
        users = await db[coll].find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        for u in users:
            if u['id'] not in by_uid:
                by_uid[u['id']] = {
                    "user_id": u['id'], "user_name": u.get('name', ''),
                    "user_role": role, "total_hours": 0, "present_days": 0,
                    "half_days": 0, "leave_days": 0, "absent_days": 0, "marked_days": 0
                }
    summary = sorted(by_uid.values(), key=lambda x: (-x['total_hours'], x['user_name']))
    return {"month": m, "year": y, "summary": summary,
            "totals": {"total_hours": round(sum(s['total_hours'] for s in summary), 2),
                       "total_present": sum(s['present_days'] for s in summary)}}

# Self check-in/check-out — DEPRECATED. HR marks attendance. Returns 200 with disabled flag (friendlier than 403).
@api_router.post("/attendance/check-in")
async def attendance_check_in(current_user: dict = Depends(get_current_user)):
    return {"disabled": True, "message": "Self check-in disabled. HR will mark your attendance."}

@api_router.post("/attendance/check-out")
async def attendance_check_out(current_user: dict = Depends(get_current_user)):
    return {"disabled": True, "message": "Self check-out disabled. HR will update your logout time after 5:30 PM IST."}

@api_router.get("/attendance/today")
async def attendance_today(current_user: dict = Depends(get_current_user)):
    today = _ist_today_iso()
    rec = await db.attendance.find_one({"user_id": current_user['id'], "date": today}, {"_id": 0})
    return {"attendance": rec or None, "date": today, "ist_now": _ist_now().strftime("%H:%M")}

# ==================== EMPLOYEE TASK SHEETS (daily "from X to Y I did Z" log) ====================
@api_router.post("/employee-tasks")
async def create_employee_task(data: dict, current_user: dict = Depends(get_current_user)):
    task = {"id": f"etask-{uuid.uuid4().hex[:8]}", "user_id": data.get("user_id", current_user['id']),
            "user_name": data.get("user_name", current_user.get('name','')),
            "user_role": data.get("user_role", current_user.get('role','')),
            "title": data.get("title",""), "description": data.get("description",""),
            "notes": data.get("notes",""),
            "from_time": data.get("from_time",""), "to_time": data.get("to_time",""),
            "status": data.get("status","pending"), "date": data.get("date", date.today().isoformat()),
            "completed_at": datetime.now(timezone.utc).isoformat() if data.get("status")=="completed" else "",
            "created_by": current_user['id'],
            "created_at": datetime.now(timezone.utc).isoformat()}
    await db.employee_tasks.insert_one(task); task.pop("_id", None)
    return {"task": task}

@api_router.get("/employee-tasks")
async def get_employee_tasks(user_id: str = "", date_filter: str = "", month: str = "", year: str = "", current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user['role'] not in ['admin', 'hr_manager']:
        query["user_id"] = current_user['id']
    elif user_id:
        query["user_id"] = user_id
    if date_filter: query["date"] = date_filter
    elif month and year: query["date"] = {"$regex": f"^{year}-{month.zfill(2)}"}
    tasks = await db.employee_tasks.find(query, {"_id": 0}).sort([("date",-1),("from_time",1),("created_at",1)]).to_list(1000)
    return {"tasks": tasks}

@api_router.put("/employee-tasks/{tid}")
async def update_employee_task(tid: str, data: dict, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.items() if k not in ["id", "_id"]}
    if data.get("status") == "completed": update["completed_at"] = datetime.now(timezone.utc).isoformat()
    await db.employee_tasks.update_one({"id": tid}, {"$set": update})
    return {"message": "Task updated"}

@api_router.delete("/employee-tasks/{tid}")
async def delete_employee_task(tid: str, current_user: dict = Depends(get_current_user)):
    q = {"id": tid}
    # Non-HR users can only delete their own tasks
    if current_user['role'] not in ['admin', 'hr_manager']:
        q["user_id"] = current_user['id']
    r = await db.employee_tasks.delete_one(q)
    if r.deleted_count == 0: raise HTTPException(status_code=404, detail="Task not found or unauthorized")
    return {"message": "Task deleted"}

# HR/Admin efficiency overview — all employees grouped
@api_router.get("/employee-tasks/efficiency")
async def get_efficiency_overview(date_filter: str = "", current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','hr_manager']:
        raise HTTPException(status_code=403, detail="HR/Admin only")
    q = {}
    if date_filter: q["date"] = date_filter
    else: q["date"] = date.today().isoformat()
    tasks = await db.employee_tasks.find(q, {"_id": 0}).sort([("user_name",1),("from_time",1)]).to_list(2000)
    # Group by user
    grouped = {}
    for t in tasks:
        uid = t.get("user_id","")
        if uid not in grouped:
            grouped[uid] = {"user_id": uid, "user_name": t.get("user_name",""), "user_role": t.get("user_role",""), "entries": [], "total": 0, "completed": 0, "in_progress": 0, "pending": 0}
        grouped[uid]["entries"].append(t)
        grouped[uid]["total"] += 1
        s = t.get("status","pending")
        if s == "completed": grouped[uid]["completed"] += 1
        elif s == "in_progress": grouped[uid]["in_progress"] += 1
        else: grouped[uid]["pending"] += 1
    return {"employees": list(grouped.values()), "date": q["date"]}

# ==================== DIGITAL MARKETING CAMPAIGNS ====================
@api_router.post("/campaigns")
async def create_campaign(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']:
        raise HTTPException(status_code=403)
    camp = {"id": f"camp-{uuid.uuid4().hex[:8]}", "name": data.get("name",""), "manager": data.get("manager",""),
            "objective": data.get("objective","leads"), "budget": float(data.get("budget",0) or 0),
            "daily_budget": float(data.get("daily_budget",0) or 0),
            "weekly_budget": float(data.get("weekly_budget",0) or 0),
            "platform": data.get("platform","meta"),
            "sub_platform": data.get("sub_platform",""),
            "ad_type": data.get("ad_type",""),
            "audience": data.get("audience",""), "start_date": data.get("start_date",""),
            "end_date": data.get("end_date",""),
            "manager_id": data.get("manager_id",""),
            "manager_role": data.get("manager_role",""),
            "manager_name": data.get("manager_name",""),
            "leads_count": 0, "impressions": 0, "messages": 0, "clicks": 0,
            "spend": 0, "conversions": 0, "leads_generated": 0, "website_purchases": 0,
            "status": data.get("status","running"),
            "created_by": current_user['id'], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.campaigns.insert_one(camp); camp.pop("_id", None)
    return {"campaign": camp}

@api_router.get("/campaigns")
async def get_campaigns(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager', 'hr_manager', 'sales_manager', 'district_manager']:
        raise HTTPException(status_code=403)
    return {"campaigns": await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)}

@api_router.put("/campaigns/{cid}")
async def update_campaign(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']:
        raise HTTPException(status_code=403)
    update = {k: v for k, v in data.items() if k not in ["id", "_id"]}
    await db.campaigns.update_one({"id": cid}, {"$set": update})
    return {"message": "Campaign updated"}

@api_router.delete("/campaigns/{cid}")
async def delete_campaign(cid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']:
        raise HTTPException(status_code=403)
    await db.campaigns.delete_one({"id": cid})
    await db.campaign_leads.delete_many({"campaign_id": cid})
    return {"message": "Campaign deleted"}

@api_router.put("/campaign-leads/{lid}")
async def update_campaign_lead(lid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager', 'sales_manager', 'district_manager', 'hr_manager']:
        raise HTTPException(status_code=403)
    update = {k: v for k, v in data.items() if k not in ["id", "_id"]}
    update['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.campaign_leads.update_one({"id": lid}, {"$set": update})
    # Increment campaign conversions when converted
    if data.get("status") == "converted":
        lead = await db.campaign_leads.find_one({"id": lid}, {"_id": 0})
        if lead and lead.get("campaign_id"):
            await db.campaigns.update_one({"id": lead["campaign_id"]}, {"$inc": {"conversions": 1}})
    return {"message": "Lead updated"}

@api_router.post("/campaign-leads")
async def create_campaign_lead(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']:
        raise HTTPException(status_code=403)
    lead = {"id": f"clead-{uuid.uuid4().hex[:8]}", "campaign_id": data.get("campaign_id",""),
            "name": data.get("name",""), "phone": data.get("phone",""), "email": data.get("email",""),
            "type": data.get("type","customer"), "department": data.get("department","sales_manager"),
            "status": data.get("status","new"), "notes": data.get("notes",""),
            "assigned_to": data.get("assigned_to",""),
            "created_by": current_user['id'], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.campaign_leads.insert_one(lead); lead.pop("_id", None)
    if data.get("campaign_id"):
        await db.campaigns.update_one({"id": data["campaign_id"]}, {"$inc": {"leads_generated": 1}})
    return {"lead": lead}

@api_router.get("/campaign-leads")
async def get_campaign_leads(department: str = "", current_user: dict = Depends(get_current_user)):
    query = {}
    if department: query["department"] = department
    if current_user['role'] == 'sales_manager': query["department"] = {"$in": ["sales_manager", "telecaller"]}
    elif current_user['role'] == 'district_manager': query["department"] = {"$in": ["district_manager", "agent"]}
    elif current_user['role'] == 'hr_manager': query["department"] = {"$in": ["hr_manager", "hiring"]}
    return {"leads": await db.campaign_leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)}

# ==================== CONTACTS BOOK ====================
@api_router.post("/contacts-book")
async def add_contact(data: dict, current_user: dict = Depends(get_current_user)):
    contact = {"id": f"cb-{uuid.uuid4().hex[:8]}", "name": data.get("name",""), "phone": data.get("phone",""),
               "email": data.get("email",""), "category": data.get("category","general"),
               "company": data.get("company",""), "notes": data.get("notes",""),
               "created_by": current_user['id'], "created_at": datetime.now(timezone.utc).isoformat()}
    await db.contacts_book.insert_one(contact); contact.pop("_id", None)
    return {"contact": contact}

@api_router.get("/contacts-book")
async def get_contacts_book(category: str = "", current_user: dict = Depends(get_current_user)):
    query = {}
    if category: query["category"] = category
    return {"contacts": await db.contacts_book.find(query, {"_id": 0}).sort("name", 1).to_list(500)}

@api_router.put("/contacts-book/{cid}")
async def update_contact(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in data.items() if k not in ["id", "_id"]}
    await db.contacts_book.update_one({"id": cid}, {"$set": update})
    return {"message": "Contact updated"}

# ==================== HIRE APPROVAL ====================
@api_router.post("/hiring/approve/{cid}")
async def approve_hire(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager', 'sales_manager', 'district_manager', 'social_media_manager']:
        raise HTTPException(status_code=403)
    action = data.get("action", "")
    candidate = await db.hiring_candidates.find_one({"id": cid}, {"_id": 0})
    if not candidate: raise HTTPException(status_code=404)

    # MANAGER SELECTION (intermediate step) — manager recommends, HR does final hire
    if action == "select":
        if current_user['role'] not in ['sales_manager', 'district_manager', 'admin']:
            raise HTTPException(status_code=403, detail="Only managers can select candidates")
        await db.hiring_candidates.update_one({"id": cid}, {"$set": {
            "status": "selected",
            "manager_selected_by": current_user['id'],
            "manager_selected_by_name": current_user.get('name', ''),
            "manager_selected_by_role": current_user['role'],
            "manager_selected_at": datetime.now(timezone.utc).isoformat()
        }})
        # Notify HR for final hire
        await _notify(role="hr_manager",
                      title="Candidate Recommended for Hire",
                      message=f"{current_user.get('name','')} ({current_user['role'].replace('_',' ')}) selected {candidate['name']} for {candidate.get('position','')}. Please complete final hiring.",
                      ntype="success", link="/hr-manager")
        return {"message": f"{candidate['name']} marked as selected. HR will complete final hire."}

    if action == "reject":
        # Manager or HR can reject
        update = {"status": "rejected",
                  "rejected_by": current_user['id'],
                  "rejected_by_name": current_user.get('name', ''),
                  "rejected_at": datetime.now(timezone.utc).isoformat()}
        await db.hiring_candidates.update_one({"id": cid}, {"$set": update})
        return {"message": "Candidate rejected"}

    if action == "hire":
        # FINAL HIRE — only HR / Admin
        if current_user['role'] not in ['admin', 'hr_manager']:
            raise HTTPException(status_code=403, detail="Only HR can complete the final hire")
        # Idempotency: if this candidate is already hired, return the existing record instead of creating a duplicate
        if candidate.get("status") == "hired" and candidate.get("hired_as_id"):
            return {"message": f"{candidate['name']} is already hired", "user": {"id": candidate.get("hired_as_id")}, "already_hired": True}
        # Also guard against duplicate user record by phone (same candidate clicked twice fast)
        phone_key = (candidate.get('phone') or '').strip()
        if phone_key:
            for _coll in ("telecallers","agents","managers","sales_managers","content_developers"):
                existing = await db[_coll].find_one({"phone": phone_key}, {"_id":0,"id":1,"name":1})
                if existing:
                    await db.hiring_candidates.update_one({"id": cid}, {"$set": {
                        "status": "hired", "hired_as_id": existing["id"],
                        "hired_by": current_user['id'], "hired_by_name": current_user.get('name',''),
                        "hired_at": datetime.now(timezone.utc).isoformat()
                    }})
                    return {"message": f"{candidate['name']} was already hired earlier", "user": existing, "already_hired": True}
        position = candidate.get("position", "telecaller")
        role_map = {"telecaller": ("telecallers", "tc", "tc123"), "agent": ("agents", "agent", "agent123"),
                    "telesales": ("telecallers", "tc", "tc123"), "content_developer": ("content_developers", "cd", "cd123"),
                    "district_manager": ("managers", "mgr", "mgr123"), "sales_manager": ("sales_managers", "sm", "sm123")}
        coll, prefix, default_pw = role_map.get(position, ("telecallers", "tc", "tc123"))
        new_id = f"{prefix}-{uuid.uuid4().hex[:6]}"
        new_email = (candidate.get('email') or '').strip()  # leave empty if not provided — no fake emails
        new_user = {"id": new_id, "name": candidate['name'], "email": new_email,
                    "password_hash": hash_password(default_pw), "phone": candidate.get('phone',''),
                    "salary": data.get('salary', candidate.get('expected_salary', 0)) or 0,
                    "incentive": data.get('incentive', 0) or 0,
                    "commission_earned": 0, "status": "active",
                    "created_at": datetime.now(timezone.utc).isoformat()}
        # MANAGER ASSIGNMENT — link telecaller→SM, agent→DM
        managed_by = data.get('managed_by', '') or candidate.get('manager_selected_by', '')
        managed_by_name = data.get('managed_by_name', '') or candidate.get('manager_selected_by_name', '')
        managed_by_role = data.get('managed_by_role', '') or candidate.get('manager_selected_by_role', '')
        if managed_by:
            # Verify the manager exists and matches the candidate's position
            valid_mgr = False
            if position in ('telecaller', 'telesales'):
                if await db.sales_managers.find_one({"id": managed_by}): valid_mgr = True
            elif position == 'agent':
                if await db.managers.find_one({"id": managed_by}): valid_mgr = True
            elif position == 'inhouse_telecaller':
                if await db.sales_managers.find_one({"id": managed_by}): valid_mgr = True
            if valid_mgr:
                new_user['managed_by'] = managed_by
                new_user['managed_by_name'] = managed_by_name
                new_user['managed_by_role'] = managed_by_role
        if coll == "agents": new_user.update({"district": candidate.get('location',''), "area": "", "region_id": "", "inventory": {}, "total_sales": 0})
        if coll == "telecallers": new_user.update({"total_calls": 0, "conversions": 0, "language": ""})
        await db[coll].insert_one(new_user)
        await db.hiring_candidates.update_one({"id": cid}, {"$set": {
            "status": "hired",
            "hired_as_id": new_id,
            "hired_by": current_user['id'],
            "hired_by_name": current_user.get('name', ''),
            "hired_at": datetime.now(timezone.utc).isoformat()
        }})
        await _notify(role="hr_manager", title="New Hire Completed", message=f"{candidate['name']} hired as {position}", ntype="success")
        # Notify the selecting manager too
        if candidate.get('manager_selected_by'):
            await _notify(user_id=candidate['manager_selected_by'],
                          title="Candidate Hired",
                          message=f"HR has completed hiring of {candidate['name']} (your selection)",
                          ntype="success")
        new_user.pop("_id", None); new_user.pop("password_hash", None)
        return {"message": f"{candidate['name']} hired as {position}", "user": new_user}
    return {"message": "No action taken"}

# ==================== RELATIONSHIP CALLS TABLE ====================
@api_router.get("/relationship-calls")
async def get_relationship_calls(current_user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    role = current_user['role']
    query = {"$or": [{"next_relationship_date": {"$lte": today, "$ne": ""}}, {"next_repeat_order_date": {"$lte": today, "$ne": ""}}]}
    if role in ['telecaller', 'agent']: query["assigned_to"] = current_user['id']
    leads = await db.leads.find(query, {"_id": 0}).to_list(500)
    rel_calls = [{"id": l['id'], "name": l.get('name',''), "phone": l.get('phone_number',''),
                  "order_date": l.get('last_order_date',''), "product": l.get('interested_products',''),
                  "staff": l.get('assigned_to',''), "type": "relationship" if l.get('next_relationship_date','') <= today else "repeat",
                  "due_date": l.get('next_relationship_date','') or l.get('next_repeat_order_date',''),
                  "status": "called" if l.get('callback_done') else "pending"} for l in leads]
    # Compute "pending_calls" (leads with NO call logged yet) and "called_today"
    # (leads with at least one call_log dated today) from the TC/agent's full assigned list
    pending_calls = 0
    called_today = 0
    if role in ('telecaller', 'agent'):
        async for lead in db.leads.find({"assigned_to": current_user['id']}, {"_id": 0, "call_logs": 1}):
            cls = lead.get("call_logs") or []
            if not cls:
                pending_calls += 1
            else:
                if any(str(cl.get("logged_at") or cl.get("timestamp") or "").startswith(today) for cl in cls):
                    called_today += 1
    stats = {
        "pending": pending_calls,  # leads not yet called — matches the "Pending Calls" card
        "called": called_today,    # leads called today — matches the "Called Today" card
        "callbacks_pending": len([c for c in rel_calls if c['status']=='pending']),
        "callbacks_called": len([c for c in rel_calls if c['status']=='called']),
        "total": len(rel_calls),
    }
    return {"calls": rel_calls, "stats": stats}

@api_router.put("/relationship-calls/{lid}/mark-called")
async def mark_relationship_called(lid: str, data: dict, current_user: dict = Depends(get_current_user)):
    update = {"callback_done": True, "updated_at": datetime.now(timezone.utc).isoformat()}
    if data.get("remarks"): update["customer_remarks"] = data["remarks"]
    if data.get("ordered"):
        update["next_repeat_order_date"] = (date.today() + timedelta(days=30)).isoformat()
        update["next_relationship_date"] = (date.today() + timedelta(days=15)).isoformat()
    await db.leads.update_one({"id": lid}, {"$set": update})
    return {"message": "Marked as called"}

# ==================== ALL-USERS ACCESS UPDATE ====================
@api_router.get("/team-members")
async def get_team_members(current_user: dict = Depends(get_current_user)):
    """Get team members based on role hierarchy"""
    role = current_user['role']
    members = []
    if role in ['district_manager', 'assistant_district_manager']:
        agents = await db.agents.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
        for a in agents: a['role'] = 'agent'
        adms = await db.assistant_district_managers.find({}, {"_id": 0, "password_hash": 0}).to_list(50)
        for a in adms: a['role'] = 'assistant_district_manager'
        members = agents + adms
    elif role in ['sales_manager', 'assistant_sales_manager']:
        tcs = await db.telecallers.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
        for t in tcs: t['role'] = 'telecaller'
        asms = await db.assistant_sales_managers.find({}, {"_id": 0, "password_hash": 0}).to_list(50)
        for a in asms: a['role'] = 'assistant_sales_manager'
        members = tcs + asms
    return {"members": members}


# ==================== DELETE ORDER WITH PASSWORD ====================
@api_router.delete("/orders/{oid}")
async def delete_order(oid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin']:
        raise HTTPException(status_code=403)
    await check_delete_password(data.get("password", ""), current_user)
    await db.orders.delete_one({"id": oid})
    await db.commissions.delete_many({"order_id": oid})
    return {"message": f"Order {oid} deleted"}

# ==================== HR CALL LOG (legacy POST kept for backward compat) ====================
@api_router.post("/hr/call-log")
async def hr_log_call(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    log = {"id": f"hrcall-{uuid.uuid4().hex[:8]}", "candidate_name": data.get("candidate_name",""),
           "phone": data.get("phone",""), "role_applied": data.get("role_applied",""),
           "source": data.get("source",""), "status": data.get("status","contacted"),
           "interview_status": data.get("interview_status","pending"),
           "remarks": data.get("remarks",""), "forward_to": data.get("forward_to",""),
           "next_follow_up": data.get("next_follow_up",""),
           "contact_name": data.get("candidate_name",""), "purpose": "candidate_followup",
           "outcome": data.get("status","contacted"), "duration_min": 0,
           "linked_candidate_id": "", "next_action": data.get("remarks",""),
           "next_action_date": data.get("next_follow_up",""),
           "notes": data.get("remarks",""), "call_date": date.today().isoformat(),
           "caller_id": current_user['id'], "caller_name": current_user.get('name',''),
           "created_by": current_user['id'], "created_by_name": current_user.get('name',''),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.hr_call_logs.insert_one(log); log.pop("_id", None)
    return {"call_log": log}

@api_router.put("/hr/call-log/{lid}")
async def update_hr_call_log(lid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    update = {k: v for k, v in data.items() if k not in ["id", "_id"]}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.hr_call_logs.update_one({"id": lid}, {"$set": update})
    return {"message": "Updated"}

# ==================== DEFAULT TASK SHEETS PER ROLE ====================
DEFAULT_ROLE_TASKS = {
    "telecaller": ["Make 30+ calls daily", "Log every call with status and remarks", "Follow up on interested leads within 24h", "Update lead status after each call", "Create orders for interested customers", "Track repeat orders (30-day cycle)", "Maintain relationship calls (15-day cycle)"],
    "agent": ["Visit assigned localities daily", "Create orders during home visits", "Collect payments and upload proofs", "Follow up repeat orders every 30 days", "Build customer relationships (15-day visits)", "Report daily to District Manager", "Maintain product knowledge"],
    "district_manager": ["Monitor agent performance daily", "Review pending orders", "Track repeat orders across team", "Call agents to discuss targets", "Approve/reject orders", "Review agent rankings weekly", "Submit fund requests as needed"],
    "assistant_district_manager": ["Monitor assigned agents", "Create orders like an agent", "Track agent repeat orders", "Report to District Manager", "Review team commissions"],
    "sales_manager": ["Monitor telecaller performance", "Review call stats and conversions", "Track repeat order targets", "Create instruction sheets", "Assign tasks to telecallers", "Review monthly projections"],
    "assistant_sales_manager": ["Monitor assigned telecallers", "Track call conversions", "Report to Sales Manager", "Review telecaller commissions"],
    "hr_manager": ["Process monthly payroll", "Mark daily attendance", "Handle leave requests", "Track hiring pipeline", "Send official communications", "Monitor employee task completion", "Review department productivity"],
    "finance_manager": ["Approve/reject expenses", "Process fund requests", "Manage cash vs bank balance", "Record external revenue", "Review P&L monthly", "Process payroll payments"],
    "social_media_manager": ["Create content pillars", "Write scripts for content team", "Assign tasks to content developer", "Monitor influencer outreach", "Track content production pipeline", "Review and approve final content"],
    "content_developer": ["Review assigned scripts/briefs", "Shoot video content", "Edit raw footage", "Create graphic designs", "Upload links to Google Drive", "Mark content as posted with link"],
    "inhouse_telecaller": ["Find and contact influencers", "Track influencer responses", "Log hiring candidates", "Set daily call goals", "Follow up on interested influencers/candidates"],
    "inventory_manager": ["Process new orders daily", "Mark orders as shipped", "Mark orders as delivered", "Track not-shipped orders", "Coordinate deliveries"],
    "digital_marketing_manager": ["Create and manage campaigns", "Distribute leads to departments", "Track campaign performance", "Generate daily/monthly reports"]
}

@api_router.get("/employee-tasks/defaults/{role}")
async def get_default_tasks(role: str, current_user: dict = Depends(get_current_user)):
    return {"tasks": DEFAULT_ROLE_TASKS.get(role, [])}

@api_router.post("/employee-tasks/seed/{user_id}")
async def seed_employee_tasks(user_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']:
        raise HTTPException(status_code=403)
    role = data.get("role", "")
    user_name = data.get("user_name", "")
    tasks_list = DEFAULT_ROLE_TASKS.get(role, [])
    today = date.today().isoformat()
    for t in tasks_list:
        task = {"id": f"etask-{uuid.uuid4().hex[:8]}", "user_id": user_id, "user_name": user_name,
                "title": t, "description": "", "status": "pending", "date": today,
                "completed_at": "", "created_by": current_user['id'],
                "created_at": datetime.now(timezone.utc).isoformat()}
        await db.employee_tasks.insert_one(task)
    return {"message": f"Seeded {len(tasks_list)} tasks for {user_name}"}

# ==================== BATCH 2-6: ALL NEW ENDPOINTS ====================

# ----- SMM ↔ Content Developer DIRECT ASSIGNMENT (script/post/reel/edit/design — any type) -----
@api_router.post("/content-assignments")
async def create_content_assignment(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist']: raise HTTPException(status_code=403)
    asn = {"id": f"casn-{uuid.uuid4().hex[:8]}",
           "title": data.get("title",""), "description": data.get("description",""),
           "content_type": data.get("content_type","reel"),  # reel | post | story | video | script | design | edit | other
           "platform": data.get("platform","instagram"),
           "script": data.get("script",""), "brief": data.get("brief",""),
           "reference_links": data.get("reference_links",""),
           "assigned_to": data.get("assigned_to",""), "assigned_to_name": data.get("assigned_to_name",""),
           "assigned_by": current_user['id'], "assigned_by_name": current_user.get('name',''),
           "assigned_by_role": current_user['role'],
           "priority": data.get("priority","medium"),
           "deadline": data.get("deadline",""),
           "status": "assigned",  # assigned | in_progress | submitted | approved | revision | completed
           "completion_link": "", "completion_notes": "",
           "feedback": "", "revision_count": 0,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.content_assignments.insert_one(asn); asn.pop("_id", None)
    if asn['assigned_to']:
        await _notify(user_id=asn['assigned_to'],
                      title="New Content Assignment",
                      message=f"{asn['assigned_by_name']} assigned: {asn['title']} ({asn['content_type']})",
                      ntype="info", link="/content-developer")
    return {"assignment": asn}

@api_router.get("/content-assignments")
async def get_content_assignments(current_user: dict = Depends(get_current_user)):
    role = current_user['role']
    uid = current_user['id']
    if role in ['admin']:
        q = {}
    elif role in ['social_media_manager', 'content_strategist']:
        q = {"assigned_by": uid}
    elif role == 'content_developer':
        q = {"assigned_to": uid}
    else:
        raise HTTPException(status_code=403)
    items = await db.content_assignments.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    stats = {"total": len(items),
             "assigned": len([i for i in items if i['status']=='assigned']),
             "in_progress": len([i for i in items if i['status']=='in_progress']),
             "submitted": len([i for i in items if i['status']=='submitted']),
             "completed": len([i for i in items if i['status']=='completed']),
             "revision": len([i for i in items if i['status']=='revision'])}
    return {"assignments": items, "stats": stats}

@api_router.put("/content-assignments/{aid}")
async def update_content_assignment(aid: str, data: dict, current_user: dict = Depends(get_current_user)):
    asn = await db.content_assignments.find_one({"id": aid}, {"_id": 0})
    if not asn: raise HTTPException(status_code=404)
    role = current_user['role']
    uid = current_user['id']
    # Permissions: assignee can update status/completion, assigner can give feedback/approve, admin all
    update = {k: v for k, v in data.items() if k not in ["id","_id","assigned_to","assigned_by","created_at"]}
    if role == 'content_developer' and asn['assigned_to'] != uid: raise HTTPException(status_code=403)
    if role in ['social_media_manager','content_strategist'] and asn['assigned_by'] != uid and role != 'admin':
        if role != 'admin': raise HTTPException(status_code=403)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    if update.get("status") == "revision":
        update["revision_count"] = (asn.get("revision_count", 0) or 0) + 1
    await db.content_assignments.update_one({"id": aid}, {"$set": update})
    # Cross-notifications
    new_status = update.get("status")
    if new_status and role == 'content_developer':
        # CD updated → notify assigner
        await _notify(user_id=asn['assigned_by'],
                      title=f"Content {new_status.replace('_',' ').title()}",
                      message=f"{current_user.get('name','')} updated '{asn['title']}' to {new_status}",
                      ntype="info" if new_status != "submitted" else "success",
                      link="/social-media")
    elif new_status in ("revision","approved","completed") and role in ('social_media_manager','content_strategist','admin'):
        # Assigner gave feedback → notify CD
        await _notify(user_id=asn['assigned_to'],
                      title=f"Content {new_status.replace('_',' ').title()}",
                      message=f"{current_user.get('name','')}: {update.get('feedback','')[:100]}",
                      ntype="warning" if new_status == "revision" else "success",
                      link="/content-developer")
    return {"message": "Updated"}

@api_router.delete("/content-assignments/{aid}")
async def delete_content_assignment(aid: str, current_user: dict = Depends(get_current_user)):
    asn = await db.content_assignments.find_one({"id": aid}, {"_id": 0})
    if not asn: raise HTTPException(status_code=404)
    if current_user['role'] != 'admin' and asn['assigned_by'] != current_user['id']:
        raise HTTPException(status_code=403)
    await db.content_assignments.delete_one({"id": aid})
    return {"message": "Deleted"}

# Get list of content developers for SMM/strategist dropdown
@api_router.get("/content-developers")
async def list_content_devs(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','social_media_manager','content_strategist','hr_manager']:
        raise HTTPException(status_code=403)
    cds = await db.content_developers.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(50)
    return {"content_developers": cds}

# ----- DIGITAL MARKETING: per-day metrics per campaign (Meta vs Google etc.) -----
@api_router.post("/campaigns/{cid}/daily-metrics")
async def add_daily_metric(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']: raise HTTPException(status_code=403)
    # Validate campaign exists
    campaign = await db.campaigns.find_one({"id": cid}, {"_id": 0})
    if not campaign: raise HTTPException(status_code=404, detail="Campaign not found")
    metric_date = data.get("date") or date.today().isoformat()
    def _i(v):  # tolerate empty strings / None coming from the form
        try: return int(float(v)) if v not in (None, "", "null") else 0
        except (ValueError, TypeError): return 0
    def _f(v):
        try: return float(v) if v not in (None, "", "null") else 0.0
        except (ValueError, TypeError): return 0.0
    # Upsert per (campaign_id, date)
    rec = {"id": f"dm-{uuid.uuid4().hex[:8]}", "campaign_id": cid,
           "date": metric_date,
           "leads": _i(data.get("leads")), "impressions": _i(data.get("impressions")),
           "messages": _i(data.get("messages")), "clicks": _i(data.get("clicks")),
           "spend": _f(data.get("spend")), "conversions": _i(data.get("conversions")),
           "reach": _i(data.get("reach")), "engagement": _i(data.get("engagement")),
           "notes": data.get("notes", ""),
           "logged_by": current_user['id'], "logged_by_name": current_user.get('name',''),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.campaign_daily_metrics.update_one({"campaign_id": cid, "date": metric_date},
                                               {"$set": rec}, upsert=True)
    # Roll up totals on the campaign for quick KPIs
    pipeline = [{"$match": {"campaign_id": cid}},
                {"$group": {"_id": "$campaign_id",
                            "total_leads": {"$sum": "$leads"},
                            "total_impressions": {"$sum": "$impressions"},
                            "total_messages": {"$sum": "$messages"},
                            "total_clicks": {"$sum": "$clicks"},
                            "total_spend": {"$sum": "$spend"},
                            "total_conversions": {"$sum": "$conversions"}}}]
    agg = await db.campaign_daily_metrics.aggregate(pipeline).to_list(1)
    if agg:
        a = agg[0]
        await db.campaigns.update_one({"id": cid}, {"$set": {
            "leads_count": a['total_leads'], "impressions": a['total_impressions'],
            "messages": a['total_messages'], "clicks": a['total_clicks'],
            "spend": a['total_spend'], "conversions": a['total_conversions']}})
    return {"metric": rec}

@api_router.get("/campaigns/{cid}/daily-metrics")
async def get_daily_metrics(cid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']: raise HTTPException(status_code=403)
    rows = await db.campaign_daily_metrics.find({"campaign_id": cid}, {"_id": 0}).sort("date", -1).to_list(365)
    totals = {"leads": sum(r['leads'] for r in rows), "impressions": sum(r['impressions'] for r in rows),
              "messages": sum(r['messages'] for r in rows), "clicks": sum(r['clicks'] for r in rows),
              "spend": round(sum(r['spend'] for r in rows), 2),
              "conversions": sum(r['conversions'] for r in rows),
              "ctr": round((sum(r['clicks'] for r in rows) / sum(r['impressions'] for r in rows) * 100), 2) if sum(r['impressions'] for r in rows) else 0,
              "cpl": round(sum(r['spend'] for r in rows) / sum(r['leads'] for r in rows), 2) if sum(r['leads'] for r in rows) else 0}
    return {"metrics": rows, "totals": totals}

@api_router.post("/campaigns/quick-update")
async def quick_update_metrics(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']: raise HTTPException(status_code=403)
    metric_date = data.get("date", date.today().isoformat())
    updates = data.get("updates", [])  # [{campaign_id, leads, impressions, messages, clicks, spend, conversions}]
    saved = 0
    for u in updates:
        cid = u.get("campaign_id")
        if not cid: continue
        campaign = await db.campaigns.find_one({"id": cid}, {"_id": 0})
        if not campaign: continue
        rec = {"id": f"dm-{uuid.uuid4().hex[:8]}", "campaign_id": cid, "date": metric_date,
               "leads": int(u.get("leads", 0)), "impressions": int(u.get("impressions", 0)),
               "messages": int(u.get("messages", 0)), "clicks": int(u.get("clicks", 0)),
               "spend": float(u.get("spend", 0)), "conversions": int(u.get("conversions", 0)),
               "reach": int(u.get("reach", 0)), "engagement": int(u.get("engagement", 0)),
               "notes": u.get("notes", ""),
               "logged_by": current_user['id'], "logged_by_name": current_user.get('name',''),
               "created_at": datetime.now(timezone.utc).isoformat()}
        await db.campaign_daily_metrics.update_one({"campaign_id": cid, "date": metric_date},
                                                   {"$set": rec}, upsert=True)
        # Roll up
        pipeline = [{"$match": {"campaign_id": cid}},
                    {"$group": {"_id": "$campaign_id",
                                "total_leads": {"$sum": "$leads"},
                                "total_impressions": {"$sum": "$impressions"},
                                "total_messages": {"$sum": "$messages"},
                                "total_clicks": {"$sum": "$clicks"},
                                "total_spend": {"$sum": "$spend"},
                                "total_conversions": {"$sum": "$conversions"}}}]
        agg = await db.campaign_daily_metrics.aggregate(pipeline).to_list(1)
        if agg:
            a = agg[0]
            await db.campaigns.update_one({"id": cid}, {"$set": {
                "leads_count": a['total_leads'], "impressions": a['total_impressions'],
                "messages": a['total_messages'], "clicks": a['total_clicks'],
                "spend": a['total_spend'], "conversions": a['total_conversions']}})
        saved += 1
    return {"saved": saved, "date": metric_date}

# Aggregate metrics for dashboard overview (today, last 7 days)
@api_router.get("/campaigns/overview")
async def campaigns_overview(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']: raise HTTPException(status_code=403)
    today = date.today().isoformat()
    last_7 = [(date.today() - timedelta(days=i)).isoformat() for i in range(7)]
    today_metrics = await db.campaign_daily_metrics.find({"date": today}, {"_id": 0}).to_list(500)
    week_metrics = await db.campaign_daily_metrics.find({"date": {"$in": last_7}}, {"_id": 0}).to_list(2000)
    def sum_field(lst, f): return sum((x.get(f, 0) or 0) for x in lst)
    today_t = {"leads": sum_field(today_metrics, "leads"),
               "impressions": sum_field(today_metrics, "impressions"),
               "messages": sum_field(today_metrics, "messages"),
               "spend": round(sum_field(today_metrics, "spend"), 2),
               "conversions": sum_field(today_metrics, "conversions")}
    week_t = {"leads": sum_field(week_metrics, "leads"),
              "impressions": sum_field(week_metrics, "impressions"),
              "messages": sum_field(week_metrics, "messages"),
              "spend": round(sum_field(week_metrics, "spend"), 2),
              "conversions": sum_field(week_metrics, "conversions")}
    week_t["cpl"] = round(week_t["spend"] / week_t["leads"], 2) if week_t["leads"] else 0
    # Per-day chart for last 7 days
    daily_chart = []
    for d in reversed(last_7):
        day_rows = [m for m in week_metrics if m["date"] == d]
        daily_chart.append({"date": d, "leads": sum_field(day_rows,"leads"),
                            "spend": round(sum_field(day_rows,"spend"), 2),
                            "messages": sum_field(day_rows,"messages")})
    return {"today": today_t, "week": week_t, "chart": daily_chart}

# Group all campaigns by platform (Meta/Google/etc.)
@api_router.get("/campaigns/by-platform")
async def campaigns_by_platform(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']: raise HTTPException(status_code=403)
    campaigns = await db.campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Map subplatform → parent (Meta = facebook+instagram+whatsapp; Google = google+youtube)
    def parent_of(p):
        p = (p or "other").lower()
        if p in ("facebook","instagram","whatsapp","meta"): return "meta"
        if p in ("google","youtube","youtube_ads","gads"): return "google"
        return p
    groups = {}
    for c in campaigns:
        parent = parent_of(c.get("platform"))
        groups.setdefault(parent, {"platform": parent, "campaigns": [], "total_spend": 0, "total_leads": 0, "total_impressions": 0, "total_messages": 0, "total_conversions": 0})
        groups[parent]["campaigns"].append(c)
        groups[parent]["total_spend"] += float(c.get("spend", 0) or 0)
        groups[parent]["total_leads"] += int(c.get("leads_count", 0) or 0)
        groups[parent]["total_impressions"] += int(c.get("impressions", 0) or 0)
        groups[parent]["total_messages"] += int(c.get("messages", 0) or 0)
        groups[parent]["total_conversions"] += int(c.get("conversions", 0) or 0)
    return {"groups": list(groups.values())}

# ----- Helper: notify user/role -----
async def _notify(*, user_id: str = "", role: str = "", title: str = "", message: str = "", ntype: str = "info", link: str = ""):
    try:
        await db.notifications.insert_one({"id": f"ntf-{uuid.uuid4().hex[:8]}",
            "user_id": user_id, "role": role, "title": title, "message": message,
            "type": ntype, "link": link, "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()})
    except Exception: pass

# ----- HR: Leave Balance, Birthdays, Resignation, Document Preview -----
@api_router.get("/leaves/balance")
async def get_leave_balance(user_id: str = "", current_user: dict = Depends(get_current_user)):
    target_id = user_id if (user_id and current_user['role'] in ['admin','hr_manager']) else current_user['id']
    bal = await db.leave_balances.find_one({"user_id": target_id}, {"_id": 0})
    if not bal:
        bal = {"user_id": target_id, "casual": 12, "sick": 6, "earned": 12, "casual_used": 0, "sick_used": 0, "earned_used": 0}
    used = await db.leave_requests.find({"user_id": target_id, "status": "approved"}, {"_id": 0}).to_list(200)
    bal['casual_used'] = sum(u.get('days', 1) for u in used if u.get('leave_type') == 'casual')
    bal['sick_used'] = sum(u.get('days', 1) for u in used if u.get('leave_type') == 'sick')
    bal['earned_used'] = sum(u.get('days', 1) for u in used if u.get('leave_type') == 'earned')
    return {"balance": bal}

@api_router.put("/leaves/balance/{user_id}")
async def update_leave_balance(user_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']: raise HTTPException(status_code=403)
    data['user_id'] = user_id
    await db.leave_balances.update_one({"user_id": user_id}, {"$set": data}, upsert=True)
    return {"message": "Updated"}

@api_router.get("/employees/birthdays")
async def get_birthdays(current_user: dict = Depends(get_current_user)):
    today = date.today()
    today_md = today.strftime("%m-%d")
    upcoming = []; today_list = []
    for coll in ROLE_COLLECTIONS.values():
        async for u in db[coll].find({}, {"_id": 0, "id": 1, "name": 1, "email": 1, "dob": 1, "joining_date": 1, "role": 1}):
            if u.get('dob'):
                try:
                    md = u['dob'][5:10]
                    if md == today_md: today_list.append({**u, "type": "birthday"})
                except Exception: pass
            if u.get('joining_date'):
                try:
                    md = u['joining_date'][5:10]
                    yrs = today.year - int(u['joining_date'][:4])
                    if md == today_md and yrs > 0: today_list.append({**u, "type": "anniversary", "years": yrs})
                except Exception: pass
    return {"today": today_list, "upcoming": upcoming}

@api_router.post("/resignations")
async def create_resignation(data: dict, current_user: dict = Depends(get_current_user)):
    r = {"id": f"res-{uuid.uuid4().hex[:8]}", "user_id": data.get("user_id", current_user['id']),
         "user_name": data.get("user_name", current_user.get('name','')),
         "reason": data.get("reason",""), "notice_days": data.get("notice_days", 30),
         "last_working_day": data.get("last_working_day",""), "status": "pending",
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.resignations.insert_one(r); r.pop("_id", None)
    return {"resignation": r}

@api_router.get("/resignations")
async def get_resignations(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']: raise HTTPException(status_code=403)
    return {"resignations": await db.resignations.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.put("/resignations/{rid}")
async def update_resignation(rid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']: raise HTTPException(status_code=403)
    await db.resignations.update_one({"id": rid}, {"$set": data})
    return {"message": "Updated"}

# ----- FINANCE: GST, Vendor ledger, Recurring expenses, Export -----
@api_router.post("/finance/gst")
async def add_gst(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']: raise HTTPException(status_code=403)
    gst = {"id": f"gst-{uuid.uuid4().hex[:8]}", "type": data.get("type","sale"),
           "amount": float(data.get("amount", 0)), "rate": float(data.get("rate", 18)),
           "gst_amount": float(data.get("amount", 0)) * float(data.get("rate", 18)) / 100,
           "ref_no": data.get("ref_no", ""), "notes": data.get("notes", ""),
           "date": data.get("date", date.today().isoformat()),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.gst_entries.insert_one(gst); gst.pop("_id", None)
    return {"gst": gst}

@api_router.get("/finance/gst")
async def get_gst(month: str = "", year: str = "", current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']: raise HTTPException(status_code=403)
    q = {}
    if month and year: q["date"] = {"$regex": f"^{year}-{month.zfill(2)}"}
    entries = await db.gst_entries.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    out_total = sum(e['gst_amount'] for e in entries if e['type'] == 'sale')
    in_total = sum(e['gst_amount'] for e in entries if e['type'] == 'purchase')
    return {"entries": entries, "output_gst": round(out_total, 2), "input_gst": round(in_total, 2), "net_payable": round(out_total - in_total, 2)}

@api_router.post("/vendors")
async def create_vendor(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager', 'inventory_manager']: raise HTTPException(status_code=403)
    v = {"id": f"vnd-{uuid.uuid4().hex[:8]}", "name": data.get("name",""),
         "contact": data.get("contact", ""), "phone": data.get("phone", ""), "email": data.get("email", ""),
         "address": data.get("address", ""), "gst_number": data.get("gst_number", ""),
         "category": data.get("category", "supplier"), "balance": float(data.get("balance", 0)),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.vendors.insert_one(v); v.pop("_id", None)
    return {"vendor": v}

@api_router.get("/vendors")
async def get_vendors(current_user: dict = Depends(get_current_user)):
    return {"vendors": await db.vendors.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.post("/vendors/{vid}/transaction")
async def vendor_transaction(vid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']: raise HTTPException(status_code=403)
    t = {"id": f"vtxn-{uuid.uuid4().hex[:8]}", "vendor_id": vid,
         "type": data.get("type", "payment"), "amount": float(data.get("amount", 0)),
         "notes": data.get("notes", ""), "date": data.get("date", date.today().isoformat()),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.vendor_transactions.insert_one(t); t.pop("_id", None)
    delta = -t['amount'] if t['type'] == 'payment' else t['amount']
    await db.vendors.update_one({"id": vid}, {"$inc": {"balance": delta}})
    return {"transaction": t}

@api_router.get("/vendors/{vid}/ledger")
async def vendor_ledger(vid: str, current_user: dict = Depends(get_current_user)):
    return {"transactions": await db.vendor_transactions.find({"vendor_id": vid}, {"_id": 0}).sort("date", -1).to_list(200)}

@api_router.post("/finance/recurring")
async def create_recurring(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']: raise HTTPException(status_code=403)
    r = {"id": f"rec-{uuid.uuid4().hex[:8]}", "name": data.get("name",""),
         "category": data.get("category", "rent"), "amount": float(data.get("amount", 0)),
         "frequency": data.get("frequency", "monthly"),
         "next_due_date": data.get("next_due_date", ""), "active": True,
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.recurring_expenses.insert_one(r); r.pop("_id", None)
    return {"recurring": r}

@api_router.get("/finance/recurring")
async def get_recurring(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']: raise HTTPException(status_code=403)
    return {"recurring": await db.recurring_expenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)}

@api_router.delete("/finance/recurring/{rid}")
async def delete_recurring(rid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager']: raise HTTPException(status_code=403)
    await db.recurring_expenses.delete_one({"id": rid})
    return {"message": "Deleted"}

# ----- INVENTORY: Stock, Low-stock alerts, PO, Returns -----
@api_router.put("/products/{pid}/stock")
async def update_stock(pid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'inventory_manager']: raise HTTPException(status_code=403)
    await db.products.update_one({"id": pid}, {"$set": {"stock": int(data.get("stock", 0)),
        "low_stock_threshold": int(data.get("low_stock_threshold", 10)),
        "stock_updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Stock updated"}

@api_router.get("/products/low-stock")
async def low_stock(current_user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(500)
    low = [p for p in products if (p.get("stock", 0) or 0) <= (p.get("low_stock_threshold", 10) or 10)]
    return {"products": low, "count": len(low)}

@api_router.post("/purchase-orders")
async def create_po(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'inventory_manager', 'finance_manager']: raise HTTPException(status_code=403)
    po = {"id": f"po-{uuid.uuid4().hex[:8]}", "vendor_id": data.get("vendor_id", ""),
          "vendor_name": data.get("vendor_name", ""), "items": data.get("items", []),
          "total_amount": float(data.get("total_amount", 0)), "status": "pending",
          "expected_date": data.get("expected_date", ""),
          "created_at": datetime.now(timezone.utc).isoformat(), "created_by": current_user['id']}
    await db.purchase_orders.insert_one(po); po.pop("_id", None)
    return {"po": po}

@api_router.get("/purchase-orders")
async def get_pos(current_user: dict = Depends(get_current_user)):
    return {"pos": await db.purchase_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.put("/purchase-orders/{pid}")
async def update_po(pid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'inventory_manager', 'finance_manager']: raise HTTPException(status_code=403)
    await db.purchase_orders.update_one({"id": pid}, {"$set": data})
    return {"message": "Updated"}

@api_router.post("/returns")
async def create_return(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'inventory_manager', 'agent', 'district_manager']: raise HTTPException(status_code=403)
    r = {"id": f"ret-{uuid.uuid4().hex[:8]}", "order_id": data.get("order_id", ""),
         "reason": data.get("reason", ""), "type": data.get("type", "return"),
         "amount": float(data.get("amount", 0)), "status": "pending",
         "notes": data.get("notes", ""),
         "created_at": datetime.now(timezone.utc).isoformat(), "created_by": current_user['id']}
    await db.returns_rto.insert_one(r); r.pop("_id", None)
    return {"return": r}

@api_router.get("/returns")
async def get_returns(current_user: dict = Depends(get_current_user)):
    return {"returns": await db.returns_rto.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)}

@api_router.put("/returns/{rid}")
async def update_return(rid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'inventory_manager', 'finance_manager']: raise HTTPException(status_code=403)
    await db.returns_rto.update_one({"id": rid}, {"$set": data})
    return {"message": "Updated"}

# ----- DIGITAL MARKETING: Platform breakdown -----
@api_router.get("/campaigns/analytics")
async def campaign_analytics(month: str = "", year: str = "", current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'digital_marketing_manager']: raise HTTPException(status_code=403)
    q = {}
    if month and year: q["created_at"] = {"$regex": f"^{year}-{month.zfill(2)}"}
    campaigns = await db.campaigns.find(q, {"_id": 0}).to_list(500)
    leads_all = await db.campaign_leads.find({}, {"_id": 0}).to_list(2000)
    # Group by platform
    plats = {}
    for c in campaigns:
        p = c.get("platform", "other")
        plats.setdefault(p, {"platform": p, "spend": 0, "leads": 0, "conversions": 0, "revenue": 0})
        plats[p]["spend"] += float(c.get("budget", 0) or 0)
        plats[p]["leads"] += int(c.get("leads_count", 0) or 0)
        plats[p]["conversions"] += int(c.get("conversions", 0) or 0)
    # Compute metrics per platform
    for p in plats.values():
        p["cpl"] = round(p["spend"] / p["leads"], 2) if p["leads"] else 0
        p["conversion_rate"] = round((p["conversions"] / p["leads"]) * 100, 2) if p["leads"] else 0
    total_spend = sum(p['spend'] for p in plats.values())
    total_leads = sum(p['leads'] for p in plats.values())
    total_conv = sum(p['conversions'] for p in plats.values())
    return {"platforms": list(plats.values()),
            "summary": {"total_spend": total_spend, "total_leads": total_leads, "total_conversions": total_conv,
                       "overall_cpl": round(total_spend / total_leads, 2) if total_leads else 0,
                       "overall_cvr": round((total_conv / total_leads) * 100, 2) if total_leads else 0}}

# ----- SOCIAL MEDIA: Calendar, Influencer add/edit, Post analytics -----
@api_router.post("/content-calendar")
async def add_calendar(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist']: raise HTTPException(status_code=403)
    e = {"id": f"cal-{uuid.uuid4().hex[:8]}", "title": data.get("title",""),
         "platform": data.get("platform", "instagram"), "content_type": data.get("content_type", "post"),
         "shoot_type": data.get("shoot_type", ""),  # e.g. UGC Reel, Cinematic Product, Product Showcase, Myth & Fact Reel
         "shoot_time": data.get("shoot_time", ""),  # HH:MM optional
         "scheduled_date": data.get("scheduled_date", ""), "status": data.get("status", "scheduled"),
         "assigned_to": data.get("assigned_to", ""), "assigned_to_name": data.get("assigned_to_name", ""),
         "notes": data.get("notes", ""),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.content_calendar.insert_one(e); e.pop("_id", None)
    return {"entry": e}

@api_router.get("/content-calendar")
async def get_calendar(current_user: dict = Depends(get_current_user)):
    return {"entries": await db.content_calendar.find({}, {"_id": 0}).sort("scheduled_date", 1).to_list(500)}

@api_router.put("/content-calendar/{cid}")
async def update_calendar(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist']: raise HTTPException(status_code=403)
    await db.content_calendar.update_one({"id": cid}, {"$set": data})
    return {"message": "Updated"}

@api_router.delete("/content-calendar/{cid}")
async def delete_calendar(cid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager']: raise HTTPException(status_code=403)
    await db.content_calendar.delete_one({"id": cid})
    return {"message": "Deleted"}

@api_router.put("/influencers/{iid}")
async def update_influencer(iid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'inhouse_telecaller']: raise HTTPException(status_code=403)
    await db.influencer_outreach.update_one({"id": iid}, {"$set": data})
    return {"message": "Updated"}

@api_router.delete("/influencers/{iid}")
async def delete_influencer(iid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager']: raise HTTPException(status_code=403)
    await db.influencer_outreach.delete_one({"id": iid})
    return {"message": "Deleted"}

@api_router.post("/posts/{pid}/metrics")
async def update_post_metrics(pid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_developer']: raise HTTPException(status_code=403)
    metrics = {"views": int(data.get("views", 0)), "likes": int(data.get("likes", 0)),
               "comments": int(data.get("comments", 0)), "shares": int(data.get("shares", 0)),
               "engagement_rate": float(data.get("engagement_rate", 0)),
               "metrics_updated_at": datetime.now(timezone.utc).isoformat()}
    await db.content_briefs.update_one({"id": pid}, {"$set": metrics})
    return {"metrics": metrics}

# ----- CONTENT DEVELOPER: Shoot Plans -----
@api_router.post("/shoot-plans")
async def create_shoot_plan(data: dict, current_user: dict = Depends(get_current_user)):
    p = {"id": f"shp-{uuid.uuid4().hex[:8]}", "title": data.get("title", ""),
         "shoot_date": data.get("shoot_date", date.today().isoformat()),
         "location": data.get("location", ""), "items_needed": data.get("items_needed", []),
         "team": data.get("team", []), "status": "scheduled",
         "assigned_to": data.get("assigned_to", current_user['id']),
         "deadline": data.get("deadline", ""), "notes": data.get("notes", ""),
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.shoot_plans.insert_one(p); p.pop("_id", None)
    return {"plan": p}

@api_router.get("/shoot-plans")
async def get_shoot_plans(current_user: dict = Depends(get_current_user)):
    q = {}
    if current_user['role'] == 'content_developer':
        q["assigned_to"] = current_user['id']
    return {"plans": await db.shoot_plans.find(q, {"_id": 0}).sort("shoot_date", 1).to_list(200)}

@api_router.put("/shoot-plans/{pid}")
async def update_shoot_plan(pid: str, data: dict, current_user: dict = Depends(get_current_user)):
    await db.shoot_plans.update_one({"id": pid}, {"$set": data})
    return {"message": "Updated"}

# ----- TARGETS & LEADERBOARDS -----
@api_router.post("/targets")
async def set_target(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'sales_manager', 'district_manager', 'hr_manager']: raise HTTPException(status_code=403)
    t = {"id": f"tgt-{uuid.uuid4().hex[:8]}", "user_id": data.get("user_id", ""),
         "user_name": data.get("user_name", ""),
         "target_type": data.get("target_type", "orders"),
         "target_value": float(data.get("target_value", 0)),
         "month": data.get("month", str(date.today().month)),
         "year": data.get("year", str(date.today().year)),
         "created_at": datetime.now(timezone.utc).isoformat(), "set_by": current_user['id']}
    await db.targets.insert_one(t); t.pop("_id", None)
    return {"target": t}

@api_router.get("/targets")
async def get_targets(user_id: str = "", current_user: dict = Depends(get_current_user)):
    q = {"user_id": user_id} if user_id else {"user_id": current_user['id']}
    return {"targets": await db.targets.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)}

@api_router.get("/leaderboard/{role}")
async def get_leaderboard(role: str, month: str = "", year: str = "", current_user: dict = Depends(get_current_user)):
    coll = ROLE_COLLECTIONS.get(role)
    if not coll: return {"leaderboard": []}
    users = await db[coll].find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    rows = []
    for u in users:
        oq = {"created_by": u['id'], "status": "delivered"}
        if month and year:
            oq["created_at"] = {"$regex": f"^{year}-{month.zfill(2)}"}
        orders = await db.orders.find(oq, {"_id": 0, "total_amount": 1}).to_list(500)
        revenue = round(sum(o.get('total_amount', 0) for o in orders), 2)
        cq = {"user_id": u['id']}
        if month and year:
            cq["created_at"] = {"$regex": f"^{year}-{month.zfill(2)}"}
        comm = await db.commissions.find(cq, {"_id": 0, "commission_amount": 1}).to_list(500)
        comm_total = round(sum(c.get('commission_amount', 0) for c in comm), 2)
        rows.append({**u, "orders": len(orders), "revenue": revenue, "commission": comm_total})
    rows.sort(key=lambda x: (x['revenue'], x['orders'], x['commission']), reverse=True)
    # Rank for UI convenience
    for idx, r in enumerate(rows):
        r['rank'] = idx + 1
    return {"leaderboard": rows[:20]}

# ----- HR: Generic add-employee (any role) -----
@api_router.post("/hr/add-employee")
async def hr_add_employee(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']: raise HTTPException(status_code=403)
    role = data.get("role", "")
    coll = ROLE_COLLECTIONS.get(role)
    if not coll: raise HTTPException(status_code=400, detail=f"Invalid role: {role}")
    email = (data.get("email","") or "").lower()
    if not email or not data.get("name"): raise HTTPException(status_code=400, detail="Name & email required")
    if await db[coll].find_one({"email": email}): raise HTTPException(status_code=400, detail="Email already exists")
    pw = data.get("password") or "celesta123"
    prefix_map = {"telecaller":"tc","agent":"ag","sales_manager":"sm","district_manager":"dm",
                  "assistant_sales_manager":"asm","assistant_district_manager":"adm",
                  "hr_manager":"hr","finance_manager":"fin","social_media_manager":"smm",
                  "content_strategist":"cs","content_developer":"cd","inventory_manager":"inv",
                  "digital_marketing_manager":"dmm","inhouse_telecaller":"ih"}
    new_id = f"{prefix_map.get(role,'usr')}-{uuid.uuid4().hex[:6]}"
    u = {"id": new_id, "email": email, "name": data.get("name"),
         "phone": data.get("phone",""), "salary": float(data.get("salary", 0) or 0),
         "dob": data.get("dob",""), "joining_date": data.get("joining_date", date.today().isoformat()),
         "address": data.get("address",""), "designation": data.get("designation",""),
         "password_hash": hash_password(pw),
         "created_at": datetime.now(timezone.utc).isoformat(),
         "created_by": current_user['id']}
    for k in ("district","region","manager_id","assigned_to","sales_manager_id","district_manager_id"):
        if k in data: u[k] = data[k]
    await db[coll].insert_one(u); u.pop("_id", None); u.pop("password_hash", None)
    await _notify(user_id=new_id, title="Welcome!", message=f"You have been added as {role.replace('_',' ')}. Email: {email} / Password: {pw}", ntype="success")
    return {"user": u, "default_password": pw}

# ----- DM: Campaign visibility for non-DMM managers -----
@api_router.get("/campaigns/for-manager")
async def campaigns_for_manager(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['hr_manager','social_media_manager','district_manager','sales_manager','admin','finance_manager']:
        raise HTTPException(status_code=403)
    if current_user['role'] == 'admin':
        q = {}
    else:
        q = {"$or": [{"manager_id": current_user['id']}, {"manager_role": current_user['role']}]}
    camps = await db.campaigns.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"campaigns": camps}

# ----- Content Assignment: post-approval workflow -----
@api_router.post("/content-assignments/{aid}/approve-to-post")
async def approve_to_post(aid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin','social_media_manager','content_strategist']:
        raise HTTPException(status_code=403)
    asn = await db.content_assignments.find_one({"id": aid}, {"_id": 0})
    if not asn: raise HTTPException(status_code=404)
    update = {"status": "approved", "approved_at": datetime.now(timezone.utc).isoformat(),
              "approval_notes": data.get("approval_notes","")}
    await db.content_assignments.update_one({"id": aid}, {"$set": update})
    await _notify(user_id=asn['assigned_to'], title="Approved — Ready to Post",
                  message=f"{current_user.get('name','')} approved '{asn['title']}'. Please post and mark as posted.",
                  ntype="success", link="/content-developer")
    return {"message": "Approved for posting"}

@api_router.post("/content-assignments/{aid}/mark-posted")
async def mark_posted(aid: str, data: dict, current_user: dict = Depends(get_current_user)):
    asn = await db.content_assignments.find_one({"id": aid}, {"_id": 0})
    if not asn: raise HTTPException(status_code=404)
    if current_user['role'] != 'admin' and asn['assigned_to'] != current_user['id']:
        raise HTTPException(status_code=403)
    update = {"status": "posted", "posted_at": datetime.now(timezone.utc).isoformat(),
              "post_url": data.get("post_url",""), "post_notes": data.get("post_notes","")}
    await db.content_assignments.update_one({"id": aid}, {"$set": update})
    await _notify(user_id=asn['assigned_by'], title="Content Posted",
                  message=f"'{asn['title']}' is live: {data.get('post_url','')}",
                  ntype="success", link="/social-media")
    return {"message": "Marked as posted"}

# ----- CUSTOMER SEARCH -----
@api_router.get("/customers/search")
async def search_customers(q: str = "", current_user: dict = Depends(get_current_user)):
    if not q or len(q) < 2: return {"results": []}
    rgx = {"$regex": q, "$options": "i"}
    lead_q = {"$or": [{"name": rgx}, {"phone_number": rgx}, {"email": rgx}]}
    order_q = {"$or": [{"customer_name": rgx}, {"phone_number": rgx}]}
    # Telecaller / agent only see their own customers — never the global pool
    if current_user['role'] in ('telecaller', 'agent'):
        uid = current_user['id']
        lead_q = {"$and": [lead_q, {"$or": [{"created_by": uid}, {"assigned_to": uid}]}]}
        order_q = {"$and": [order_q, {"created_by": uid}]}
    leads = await db.leads.find(lead_q, {"_id": 0}).limit(30).to_list(30)
    orders = await db.crm_orders.find(order_q, {"_id": 0}).limit(30).to_list(30)
    return {"leads": leads, "orders": orders}

# ----- NOTIFICATIONS -----
@api_router.post("/notifications/create")
async def create_notification(data: dict, current_user: dict = Depends(get_current_user)):
    n = {"id": f"ntf-{uuid.uuid4().hex[:8]}", "user_id": data.get("user_id", ""),
         "role": data.get("role", ""), "title": data.get("title", ""),
         "message": data.get("message", ""), "type": data.get("type", "info"),
         "link": data.get("link", ""), "read": False,
         "created_at": datetime.now(timezone.utc).isoformat()}
    await db.notifications.insert_one(n); n.pop("_id", None)
    return {"notification": n}

@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notes = await db.notifications.find({"$or": [{"user_id": current_user['id']}, {"role": current_user['role']}, {"role": "all"}]},
                                         {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    unread = len([n for n in notes if not n.get("read")])
    return {"notifications": notes, "unread": unread}

@api_router.put("/notifications/{nid}/read")
async def mark_read(nid: str, current_user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid}, {"$set": {"read": True}})
    return {"message": "Read"}

@api_router.post("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"$or": [{"user_id": current_user['id']}, {"role": current_user['role']}, {"role": "all"}]},
        {"$set": {"read": True}})
    return {"message": "All read"}

# ----- ACTIVITY FEED / AUDIT LOG -----
@api_router.get("/activity-feed")
async def activity_feed(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager']: raise HTTPException(status_code=403)
    activities = await db.activity_log.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return {"activities": activities}

# ----- SALES FUNNEL & CLV -----
@api_router.get("/analytics/funnel")
async def sales_funnel(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'hr_manager', 'sales_manager', 'district_manager', 'finance_manager']: raise HTTPException(status_code=403)
    total_leads = await db.leads.count_documents({})
    contacted = await db.leads.count_documents({"status": {"$in": ["interested", "called", "follow_up"]}})
    converted = await db.leads.count_documents({"status": "converted"})
    delivered_orders = await db.crm_orders.count_documents({"status": "delivered"})
    return {"funnel": [
        {"stage": "Total Leads", "count": total_leads, "rate": 100},
        {"stage": "Contacted", "count": contacted, "rate": round((contacted/total_leads)*100, 2) if total_leads else 0},
        {"stage": "Converted", "count": converted, "rate": round((converted/total_leads)*100, 2) if total_leads else 0},
        {"stage": "Delivered Orders", "count": delivered_orders, "rate": round((delivered_orders/total_leads)*100, 2) if total_leads else 0}
    ]}

@api_router.get("/analytics/clv")
async def customer_lifetime_value(current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ['admin', 'finance_manager', 'sales_manager']: raise HTTPException(status_code=403)
    pipeline = [{"$match": {"status": "delivered"}},
                {"$group": {"_id": "$phone_number", "total": {"$sum": "$total_amount"},
                            "orders": {"$sum": 1}, "name": {"$first": "$customer_name"}}},
                {"$sort": {"total": -1}}, {"$limit": 50}]
    top = await db.crm_orders.aggregate(pipeline).to_list(50)
    customers = [{"phone": t["_id"], "name": t["name"], "total_spent": t["total"], "orders": t["orders"]} for t in top]
    avg_clv = round(sum(c['total_spent'] for c in customers) / len(customers), 2) if customers else 0
    return {"top_customers": customers, "avg_clv": avg_clv}

# =====================================================================
# ============   AI SETTINGS + GENERATION (Admin-managed key)  ========
# =====================================================================
AI_PROVIDERS = {
    "emergent":  {"label": "Emergent Universal Key (recommended)", "models": ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4o", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001", "gemini-2.5-pro", "gemini-2.5-flash"]},
    "openai":    {"label": "OpenAI",   "models": ["gpt-5.2", "gpt-5.1", "gpt-5-mini", "gpt-4o", "gpt-4o-mini"]},
    "anthropic": {"label": "Anthropic", "models": ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001", "claude-opus-4-5-20251101"]},
    "gemini":    {"label": "Google Gemini", "models": ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-flash-preview"]},
}

# Provider per-model routing for the `emergentintegrations` library
def _provider_for(model: str, configured_provider: str):
    """When admin picked Emergent Universal Key, route to the correct underlying provider based on the model name."""
    if configured_provider != "emergent":
        return configured_provider
    if model.startswith("claude"):
        return "anthropic"
    if model.startswith("gemini"):
        return "gemini"
    return "openai"

def _mask_key(k: str) -> str:
    if not k:
        return ""
    if len(k) <= 8:
        return "•" * len(k)
    return f"{k[:4]}…{k[-4:]}"

async def _get_ai_settings_doc():
    """Always returns a settings doc — seeded with Emergent default if not present."""
    doc = await db.ai_settings.find_one({"id": "singleton"}, {"_id": 0})
    if not doc:
        doc = {
            "id": "singleton",
            "provider": "emergent",
            "model": "gpt-5.2",
            "api_key": os.environ.get("EMERGENT_LLM_KEY", ""),
            "is_active": bool(os.environ.get("EMERGENT_LLM_KEY")),
            "uses_emergent_key": True,
            "updated_by": "system",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ai_settings.insert_one(doc)
        doc.pop("_id", None)
    return doc

@api_router.get("/admin/ai-settings")
async def get_ai_settings(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    doc = await _get_ai_settings_doc()
    return {
        "provider": doc.get("provider", "emergent"),
        "model": doc.get("model", "gpt-5.2"),
        "is_active": bool(doc.get("is_active")),
        "uses_emergent_key": bool(doc.get("uses_emergent_key", True)),
        "key_masked": _mask_key(doc.get("api_key", "")),
        "key_set": bool(doc.get("api_key")),
        "updated_by": doc.get("updated_by", ""),
        "updated_at": doc.get("updated_at", ""),
        "providers": AI_PROVIDERS,
    }

@api_router.post("/admin/ai-settings")
async def save_ai_settings(data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    provider = (data.get("provider") or "emergent").lower()
    if provider not in AI_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider. Allowed: {list(AI_PROVIDERS.keys())}")
    model = data.get("model") or AI_PROVIDERS[provider]["models"][0]
    uses_emergent = (provider == "emergent")
    api_key = (data.get("api_key") or "").strip()
    if uses_emergent:
        # Use the env-provided universal key
        api_key = os.environ.get("EMERGENT_LLM_KEY", api_key)
        if not api_key:
            raise HTTPException(status_code=400, detail="EMERGENT_LLM_KEY is missing in backend .env")
    else:
        if not api_key:
            raise HTTPException(status_code=400, detail="api_key is required when not using the Emergent Universal Key")
    doc = {
        "id": "singleton",
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "is_active": True,
        "uses_emergent_key": uses_emergent,
        "updated_by": current_user.get("name", "admin"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ai_settings.update_one({"id": "singleton"}, {"$set": doc}, upsert=True)
    return {"message": "AI settings saved", "key_masked": _mask_key(api_key), "provider": provider, "model": model}

async def _run_llm(prompt: str, system_prompt: str = "", session_id: Optional[str] = None) -> dict:
    """Internal helper used by every AI endpoint. Picks the configured provider+key+model.
    Falls back to direct Gemini (using GEMINI_API_KEY env var) when admin AI settings are absent.
    """
    settings = await _get_ai_settings_doc()
    if (not settings.get("is_active") or not settings.get("api_key")) and _gemini_client:
        # Direct Gemini fallback (free tier, user-provided key)
        try:
            sys_msg = system_prompt or "You are a helpful assistant for Celesta Glow, a premium Indian beauty & skincare D2C brand."
            full = f"{sys_msg}\n\n{prompt}"
            r = await asyncio.to_thread(_gemini_client.models.generate_content, model="gemini-2.5-flash", contents=full)
            return {"text": (r.text or "").strip(), "model_used": "gemini-2.5-flash", "provider": "gemini"}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Gemini error: {e}")
    if not settings.get("is_active") or not settings.get("api_key"):
        raise HTTPException(status_code=400, detail="AI is not configured. Ask admin to set up AI in /dashboard → AI Settings.")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"emergentintegrations not available: {e}")
    provider_for_lib = _provider_for(settings["model"], settings["provider"])
    chat = LlmChat(
        api_key=settings["api_key"],
        session_id=session_id or f"ai-{uuid.uuid4().hex[:8]}",
        system_message=system_prompt or "You are a helpful assistant for a beauty D2C brand called Celesta Glow.",
    ).with_model(provider_for_lib, settings["model"])
    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI provider error: {e}")
    return {"text": str(response).strip(), "model_used": settings["model"], "provider": provider_for_lib}

@api_router.post("/ai/generate-areas")
async def ai_generate_areas(data: dict, current_user: dict = Depends(get_current_user)):
    """Generate areas/localities for a given district/region using Gemini AI.
    Body: {district: str, count?: int}
    Returns: {areas: [str]}
    """
    if current_user['role'] not in ['admin','district_manager','sales_manager','assistant_district_manager']:
        raise HTTPException(status_code=403)
    district = (data.get("district") or "").strip()
    state = (data.get("state") or "Kerala").strip()
    count = int(data.get("count") or 10)
    if not district:
        raise HTTPException(status_code=400, detail="district is required")
    prompt = f"List {count} popular residential and commercial areas/localities in {district} district, {state}, India. Return ONLY a JSON array of strings, no markdown, no extra text. Example: [\"Area1\",\"Area2\"]"
    out = await _run_llm(prompt, system_prompt="You are a local geography expert. Return strictly JSON arrays.")
    txt = out["text"].strip()
    # Strip code fences if present
    if txt.startswith("```"):
        txt = "\n".join([l for l in txt.split("\n") if not l.startswith("```")])
    try:
        areas = json.loads(txt)
        if not isinstance(areas, list): areas = []
    except Exception:
        # Best-effort parse: extract quoted strings
        import re
        areas = re.findall(r'"([^"]+)"', txt)
    areas = [a for a in areas if isinstance(a, str) and a.strip()][:count]
    return {"areas": areas, "model_used": out["model_used"]}

@api_router.post("/admin/ai-settings/test")
async def test_ai_connection(current_user: dict = Depends(get_current_user)):
    """Sends a 5-word test prompt to validate the saved AI configuration."""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    out = await _run_llm("Say exactly: AI is connected.", system_prompt="Respond with only the requested phrase.")
    ok = "ai" in out["text"].lower() and "connect" in out["text"].lower()
    return {"ok": ok, "message": out["text"], "model_used": out["model_used"], "provider": out["provider"]}

@api_router.post("/ai/generate")
async def ai_generate(data: dict, current_user: dict = Depends(get_current_user)):
    """Generic AI generator — used by every dashboard's 'Generate with AI' buttons.
    Body: {prompt: str, system_prompt?: str, purpose?: str, context?: dict}
    """
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    system = (data.get("system_prompt") or "").strip()
    out = await _run_llm(prompt, system_prompt=system)
    # Audit AI usage so the admin can see who used it for what
    await db.ai_usage.insert_one({
        "id": f"aiu-{uuid.uuid4().hex[:8]}",
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "user_role": current_user["role"],
        "purpose": data.get("purpose", "generic"),
        "prompt_preview": prompt[:160],
        "model_used": out["model_used"],
        "provider": out["provider"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"text": out["text"], "model_used": out["model_used"], "provider": out["provider"]}

@api_router.post("/ai/generate-script")
async def ai_generate_script(data: dict, current_user: dict = Depends(get_current_user)):
    """Generates a social-media script. Used on the SMM 'New Script' dialog."""
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist', 'content_developer']:
        raise HTTPException(status_code=403)
    title = (data.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    pillar_title = (data.get("pillar_title") or "").strip()
    pillar_desc = (data.get("pillar_description") or "").strip()
    content_type = data.get("content_type", "reel")
    platform = data.get("platform", "instagram")
    duration = {"reel": "30 seconds", "video": "60 seconds", "story": "15 seconds", "ai_video": "30 seconds",
                "post": "single static post", "carousel": "5-slide carousel", "flyer": "single flyer", "ad": "30-sec ad", "blog": "1200-word blog"}.get(content_type, "30 seconds")
    system = (
        "You are the head copywriter at Celesta Glow, a premium Indian beauty & skincare D2C brand. "
        "Write tight, hook-first scripts in friendly, trust-building Indian English. Avoid corporate jargon. "
        "Use simple sentences. Add scene directions in [brackets] for video formats."
    )
    prompt = (
        f"Write a {duration} {content_type} script for {platform.title()} titled \"{title}\".\n"
        + (f"Content pillar: {pillar_title}. {pillar_desc}\n" if pillar_title else "")
        + "Format the response in this structure (use exact headings):\n"
        "HOOK (first 3 seconds):\nMAIN BODY:\nCALL TO ACTION:\nON-SCREEN TEXT IDEAS:\nHASHTAGS (8-12):"
    )
    out = await _run_llm(prompt, system_prompt=system)
    await db.ai_usage.insert_one({"id": f"aiu-{uuid.uuid4().hex[:8]}", "user_id": current_user["id"], "user_name": current_user.get("name", ""), "user_role": current_user["role"], "purpose": "script", "prompt_preview": title[:160], "model_used": out["model_used"], "provider": out["provider"], "created_at": datetime.now(timezone.utc).isoformat()})
    return {"script": out["text"], "model_used": out["model_used"]}

@api_router.post("/ai/generate-caption")
async def ai_generate_caption(data: dict, current_user: dict = Depends(get_current_user)):
    """Generates a platform caption + hashtags for a given script title or context. Used on Mark Posted dialog."""
    if current_user['role'] not in ['admin', 'social_media_manager', 'content_strategist', 'content_developer']:
        raise HTTPException(status_code=403)
    title = (data.get("title") or "").strip()
    script_text = (data.get("script_text") or "").strip()
    platform = data.get("platform", "instagram")
    if not (title or script_text):
        raise HTTPException(status_code=400, detail="title or script_text required")
    system = (
        "You write captions for Celesta Glow, a premium beauty & skincare D2C brand. "
        "Captions are warm, slightly aspirational, never salesy. Indian English. Mix of English and a touch of Hinglish where natural. "
        "Each caption ends with a soft CTA and 8-12 well-targeted hashtags."
    )
    prompt = (
        f"Write a {platform} caption for the post titled \"{title}\".\n"
        + (f"Script context:\n{script_text[:500]}\n" if script_text else "")
        + "Output two clearly labeled options:\nOPTION A (90-120 chars, punchy):\nOPTION B (250-350 chars, story-led):\n"
        "Then a HASHTAGS line with 10-12 hashtags."
    )
    out = await _run_llm(prompt, system_prompt=system)
    await db.ai_usage.insert_one({"id": f"aiu-{uuid.uuid4().hex[:8]}", "user_id": current_user["id"], "user_name": current_user.get("name", ""), "user_role": current_user["role"], "purpose": "caption", "prompt_preview": (title or script_text)[:160], "model_used": out["model_used"], "provider": out["provider"], "created_at": datetime.now(timezone.utc).isoformat()})
    return {"caption": out["text"], "model_used": out["model_used"]}

@api_router.get("/admin/ai-usage")
async def list_ai_usage(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403)
    items = await db.ai_usage.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    by_purpose = {}
    for it in items:
        by_purpose[it.get("purpose", "generic")] = by_purpose.get(it.get("purpose", "generic"), 0) + 1
    return {"usage": items, "totals": by_purpose, "count": len(items)}

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get('CORS_ORIGINS','*').split(','), allow_methods=["*"], allow_headers=["*"])

# ==================== DELHIVERY SHIPPING INTEGRATION ====================
DELHIVERY_API_KEY = os.environ.get("DELHIVERY_API_KEY", "")
DELHIVERY_BASE_URL = os.environ.get("DELHIVERY_BASE_URL", "https://track.delhivery.com").rstrip("/")
DELHIVERY_PICKUP_LOCATION = os.environ.get("DELHIVERY_PICKUP_LOCATION", "")
DELHIVERY_PACKAGE_LENGTH_CM = int(os.environ.get("DELHIVERY_PACKAGE_LENGTH_CM", "20") or 20)
DELHIVERY_PACKAGE_BREADTH_CM = int(os.environ.get("DELHIVERY_PACKAGE_BREADTH_CM", "20") or 20)
DELHIVERY_PACKAGE_HEIGHT_CM = int(os.environ.get("DELHIVERY_PACKAGE_HEIGHT_CM", "20") or 20)
DELHIVERY_PACKAGE_WEIGHT_GRAMS = int(os.environ.get("DELHIVERY_PACKAGE_WEIGHT_GRAMS", "500") or 500)
PUBLIC_TRACKING_URL = "https://www.delhivery.com/tracking?awb={awb}"

def _delhivery_headers():
    return {
        "Authorization": f"Token {DELHIVERY_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }

@api_router.post("/shipping/delhivery/ship/{oid}")
async def delhivery_ship_order(oid: str, current_user: dict = Depends(get_current_user)):
    """Create a Delhivery waybill for an order. Admin / Inventory Manager / Sales Manager only.
    Saves the AWB + tracking URL onto the order and marks it shipped."""
    if current_user['role'] not in ('admin', 'inventory_manager', 'sales_manager'):
        raise HTTPException(status_code=403, detail="Only Admin / Inventory / Sales Manager can ship")
    if not DELHIVERY_API_KEY:
        raise HTTPException(status_code=500, detail="DELHIVERY_API_KEY not configured on the server")
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("awb_number"):
        return {"awb_number": order["awb_number"], "tracking_url": order.get("tracking_url"), "message": "Already shipped via Delhivery"}
    if order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot ship a cancelled order")

    # Build payload — Delhivery accepts `format=json&data=<json>` form-encoded
    payment_mode = "COD" if (order.get("payment_type") or "cod").lower() == "cod" else "Prepaid"
    items = order.get("items") or []
    product_desc = ", ".join([f"{(it.get('product_name') or '').strip()} x{it.get('quantity',1)}" for it in items if it.get('product_name')]) or "Beauty / Wellness products"
    total_amount = order.get("total_amount", 0)
    cod_amount = total_amount if payment_mode == "COD" else 0
    pin_raw = str(order.get("customer_pincode") or "").strip()
    if not pin_raw.isdigit() or len(pin_raw) != 6:
        raise HTTPException(status_code=400, detail=f"Invalid delivery pincode '{pin_raw}' — must be 6 digits")

    shipment_payload = {
        "name": order.get("customer_name") or "Customer",
        "add": order.get("customer_address") or "",
        "city": order.get("customer_city") or "",
        "state": order.get("customer_state") or "",
        "country": "India",
        "pin": pin_raw,
        "phone": order.get("customer_phone") or "",
        "order": order.get("order_number") or oid,
        "payment_mode": payment_mode,
        "products_desc": product_desc[:200],
        "cod_amount": cod_amount,
        "total_amount": total_amount,
        "quantity": str(sum(int(it.get("quantity", 1) or 1) for it in items) or 1),
        "weight": DELHIVERY_PACKAGE_WEIGHT_GRAMS,  # grams
        "shipment_width": DELHIVERY_PACKAGE_BREADTH_CM,
        "shipment_height": DELHIVERY_PACKAGE_HEIGHT_CM,
        "shipment_length": DELHIVERY_PACKAGE_LENGTH_CM,
        "seller_name": COMPANY.get("name", "Celesta Glow"),
        "seller_add": f"{COMPANY.get('address_line1','')}, {COMPANY.get('address_line2','')}",
    }
    payload = {
        "shipments": [shipment_payload],
        "pickup_location": {"name": DELHIVERY_PICKUP_LOCATION},
    }
    body = "format=json&data=" + json.dumps(payload)

    try:
        r = requests.post(f"{DELHIVERY_BASE_URL}/api/cmu/create.json", headers=_delhivery_headers(), data=body, timeout=20)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Delhivery API error: {e}")
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Delhivery returned {r.status_code}: {r.text[:500]}")
    try:
        resp_json = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail=f"Invalid Delhivery response: {r.text[:500]}")
    pkgs = resp_json.get("packages") or []
    if not pkgs or not pkgs[0].get("waybill"):
        raise HTTPException(status_code=502, detail=f"Delhivery did not return a waybill: {json.dumps(resp_json)[:500]}")
    awb = pkgs[0]["waybill"]
    tracking_url = PUBLIC_TRACKING_URL.format(awb=awb)

    await db.orders.update_one({"id": oid}, {"$set": {
        "awb_number": awb,
        "tracking_url": tracking_url,
        "courier": "delhivery",
        "shipped_at": datetime.now(timezone.utc).isoformat(),
        "shipped_by": current_user['id'],
        "shipped_by_name": current_user.get('name', ''),
        "status": "shipped",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    await log_audit("ship_order", "order", oid, current_user['id'], current_user.get('name', ''), f"Shipped via Delhivery, AWB {awb}")
    return {"awb_number": awb, "tracking_url": tracking_url, "message": "Shipment created"}

@api_router.get("/shipping/delhivery/track/{awb}")
async def delhivery_track(awb: str, current_user: dict = Depends(get_current_user)):
    """Live tracking status from Delhivery. Any authenticated user can view."""
    if not DELHIVERY_API_KEY:
        raise HTTPException(status_code=500, detail="DELHIVERY_API_KEY not configured")
    try:
        r = requests.get(f"{DELHIVERY_BASE_URL}/api/v1/packages/json/", headers=_delhivery_headers(), params={"waybill": awb}, timeout=15)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Delhivery tracking error: {e}")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Delhivery returned {r.status_code}: {r.text[:500]}")
    return {"awb": awb, "tracking_url": PUBLIC_TRACKING_URL.format(awb=awb), "data": r.json()}

@api_router.post("/shipping/delhivery/cancel/{oid}")
async def delhivery_cancel(oid: str, current_user: dict = Depends(get_current_user)):
    """Cancel a Delhivery shipment for an order. Admin + Inventory Manager only."""
    if current_user['role'] not in ('admin', 'inventory_manager'):
        raise HTTPException(status_code=403, detail="Only Admin or Inventory Manager can cancel a shipment")
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    awb = order.get("awb_number")
    if not awb:
        raise HTTPException(status_code=400, detail="No Delhivery AWB on this order")
    payload = {"waybill": awb, "cancellation": "true"}
    try:
        r = requests.post(f"{DELHIVERY_BASE_URL}/api/p/edit", headers={**_delhivery_headers(), "Content-Type": "application/json"}, json=payload, timeout=15)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Delhivery API error: {e}")
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Delhivery returned {r.status_code}: {r.text[:500]}")
    await db.orders.update_one({"id": oid}, {"$set": {
        "shipment_cancelled": True,
        "shipment_cancelled_at": datetime.now(timezone.utc).isoformat(),
        "shipment_cancelled_by": current_user['id'],
        "shipment_cancelled_by_name": current_user.get('name', ''),
        "status": "cancelled",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }})
    await log_audit("cancel_shipment", "order", oid, current_user['id'], current_user.get('name', ''), f"Cancelled Delhivery AWB {awb}")
    return {"message": "Shipment cancelled", "awb": awb}

# ==================== COLLABORATION / SALES-OPPORTUNITY CONTACT BOOK ====================
@api_router.get("/collaboration-contacts")
async def list_collab_contacts(type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """List routed contacts.
    - SMM: business_collaboration + influencer
    - SM: sales_opportunity
    - Admin: everything (or filter by `type` query)"""
    role = current_user['role']
    q = {}
    if role == 'admin':
        if type:
            q["enquiry_type"] = type
    elif role in ('social_media_manager',):
        q["enquiry_type"] = {"$in": ["business_collaboration", "influencer"]}
    elif role in ('sales_manager', 'assistant_sales_manager'):
        q["enquiry_type"] = "sales_opportunity"
    else:
        raise HTTPException(status_code=403)
    items = await db.collaboration_contacts.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"contacts": items, "total": len(items)}

@api_router.put("/collaboration-contacts/{cid}")
async def update_collab_contact(cid: str, data: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ('admin', 'social_media_manager', 'sales_manager', 'assistant_sales_manager'):
        raise HTTPException(status_code=403)
    allowed = {"name", "phone", "notes", "status", "follow_up_date", "follow_up_done"}
    update = {k: v for k, v in data.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by_name"] = current_user.get('name', '')
    await db.collaboration_contacts.update_one({"id": cid}, {"$set": update})
    return {"message": "Updated"}

@api_router.delete("/collaboration-contacts/{cid}")
async def delete_collab_contact(cid: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] not in ('admin', 'social_media_manager', 'sales_manager'):
        raise HTTPException(status_code=403)
    await db.collaboration_contacts.delete_one({"id": cid})
    return {"message": "Deleted"}


# Register all routes (must be after every @api_router decorator above)
app.include_router(api_router)


@app.on_event("startup")
async def startup():
    logger.info("Starting Celesta Glow CRM v3...")
    await seed_database()
    await write_test_credentials()
    init_storage()
    await _refresh_employment_terms_cache()
    await _backfill_lead_last_order()
    await _backfill_telecaller_counts()
    await _backfill_created_by_names()
    # Performance: Create indexes
    await db.orders.create_index("status")
    await db.orders.create_index("created_by")
    await db.orders.create_index("created_at")
    await db.leads.create_index("assigned_to")
    await db.leads.create_index("status")
    await db.leads.create_index("next_follow_up_date")
    await db.leads.create_index("next_repeat_order_date")
    await db.leads.create_index("next_relationship_date")
    await db.commissions.create_index("user_id")
    await db.commissions.create_index("created_at")
    await db.finance_ledger.create_index("created_at")
    await db.expenses.create_index("status")
    await db.payroll.create_index([("month", 1), ("year", 1)])
    await db.notifications.create_index("user_id")
    await db.notifications.create_index("role")
    await db.notifications.create_index("read")
    await db.shoot_plans.create_index("assigned_to")
    await db.shoot_plans.create_index("shoot_date")
    await db.targets.create_index("user_id")
    await db.gst_entries.create_index("date")
    await db.vendor_transactions.create_index("vendor_id")
    await db.content_calendar.create_index("scheduled_date")
    await db.purchase_orders.create_index("status")
    await db.returns_rto.create_index("status")
    await db.activity_log.create_index("created_at")
    await db.hr_call_logs.create_index("call_date")
    await db.hr_call_logs.create_index("linked_candidate_id")
    await db.hiring_candidates.create_index("forwarded_to")
    await db.content_assignments.create_index("assigned_to")
    await db.content_assignments.create_index("assigned_by")
    await db.content_assignments.create_index("status")
    await db.campaign_daily_metrics.create_index([("campaign_id", 1), ("date", -1)])
    await db.attendance.create_index([("user_id", 1), ("date", 1)])
    await db.employee_tasks.create_index([("user_id", 1), ("date", 1)])
    await db.fund_requests.create_index("status")
    await db.hiring_candidates.create_index("status")
    await db.campaigns.create_index("status")
    await db.content_scripts.create_index("pillar_id")
    await db.content_scripts.create_index("assigned_to")
    # CRITICAL: id + email indexes on every role collection (auth + lookups)
    for _coll_name in ROLE_COLLECTIONS.values():
        try:
            await db[_coll_name].create_index("id", unique=True)
            await db[_coll_name].create_index("email")
        except Exception as _e:
            logger.warning(f"Index on {_coll_name}: {_e}")
    # Common query fields
    await db.orders.create_index("agent_id")
    await db.orders.create_index("telecaller_id")
    await db.orders.create_index("manager_id")
    await db.leads.create_index("created_at")
    await db.payroll.create_index("user_id")
    await db.advances.create_index("user_id")
    await db.advances.create_index("status")
    await db.attendance.create_index("date")
    await db.audit_log.create_index("created_at")
    logger.info("Celesta Glow CRM ready!")

@app.on_event("shutdown")
async def shutdown():
    client.close()
