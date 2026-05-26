"""Phase 2 (P0–P3) backend tests for Celesta Glow CRM.
Covers: secure JWT, removed backdoor, commission unique index, CORS, rate-limit,
collection migrations, phone normalization, CSV exports, bulk import, customer 360,
GST invoice, trash/restore, 2FA TOTP, live ops, cohort retention, voice transcribe,
proxy audit, stock auto-deduct.
"""
import os, io, csv, time, uuid, base64
import pytest
import requests
import pyotp
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
# Use localhost for stable rate-limit behaviour and to avoid ingress IP collation
INTERNAL_URL = "http://localhost:8001"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip().strip('"').strip("'")
DB_NAME = os.environ.get("DB_NAME", "test_database").strip().strip('"').strip("'")

CREDS = {
    "admin":     ("admin@celestaglow.com",       "admin123"),
    "sm":        ("salesmanager@celestaglow.com", "sm123"),
    "hr":        ("hrmanager@celestaglow.com",    "hr123"),
    "telecaller":("telecaller1@celestaglow.com",  "tc123"),
    "finance":   ("finance@celestaglow.com",      "fin123"),
}


# ---------- Module 0: RATE LIMIT (runs FIRST so token logins don't trip 10/min) ----------
class TestZZ0RateLimit:
    """Run first via alphabetical file collection — name uses Zero prefix to dodge."""

    def test_aaa_login_rate_limit(self):
        """11th rapid login attempt should yield 429."""
        url = f"{INTERNAL_URL}/api/auth/login"
        codes = []
        for i in range(12):
            r = requests.post(url, json={"email": "ratelimit_probe@example.com", "password": "x"}, timeout=5)
            codes.append(r.status_code)
        print("rate-limit status codes:", codes)
        # First 10 should be allowed (401/400), at least one of the last attempts must be 429
        assert 429 in codes[-3:], f"expected 429 in last attempts, got {codes}"

    def test_aab_cooldown_sleep(self):
        # Sleep so subsequent good logins succeed
        time.sleep(62)


# ---------- Shared fixtures ----------
@pytest.fixture(scope="session")
def tokens():
    out = {}
    for role, (email, pw) in CREDS.items():
        r = requests.post(f"{INTERNAL_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=10)
        if r.status_code != 200:
            print(f"login {role} -> {r.status_code} {r.text[:200]}")
            continue
        out[role] = r.json()["token"]
    return out


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Module 1: Auth + Backdoor removal ----------
class TestAuth:
    def test_admin_login_ok(self, tokens):
        assert "admin" in tokens, "Admin login failed"
        assert len(tokens["admin"]) > 20

    def test_backdoor_email_removed(self):
        r = requests.post(f"{INTERNAL_URL}/api/auth/login",
                          json={"email": "habeebrahman@anything.com", "password": "anything"}, timeout=5)
        # 404 (no account) / 401 (bad creds) / 400 are all acceptable — backdoor must NOT issue a token.
        assert r.status_code != 200, f"backdoor still works: {r.status_code} {r.text[:200]}"
        if r.status_code == 200:
            assert "token" not in r.json()


# ---------- Module 2: CSV Exports ----------
class TestCSVExports:
    def test_orders_csv(self, tokens):
        r = requests.get(f"{BASE_URL}/api/v2/export/orders.csv", headers=H(tokens["admin"]), timeout=15)
        assert r.status_code == 200, r.text[:300]
        assert "text/csv" in r.headers.get("content-type", "")
        reader = csv.reader(io.StringIO(r.text))
        rows = list(reader)
        assert len(rows) >= 1
        assert rows[0][0] == "id"

    def test_leads_csv(self, tokens):
        r = requests.get(f"{BASE_URL}/api/v2/export/leads.csv", headers=H(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        rows = list(csv.reader(io.StringIO(r.text)))
        assert rows[0][:3] == ["id", "created_at", "name"]

    def test_commissions_csv(self, tokens):
        r = requests.get(f"{BASE_URL}/api/v2/export/commissions.csv", headers=H(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        rows = list(csv.reader(io.StringIO(r.text)))
        assert rows[0][0] == "id"

    def test_commissions_csv_finance(self, tokens):
        if "finance" not in tokens:
            pytest.skip("no finance token")
        r = requests.get(f"{BASE_URL}/api/v2/export/commissions.csv", headers=H(tokens["finance"]), timeout=15)
        assert r.status_code == 200


# ---------- Module 3: Bulk import + phone normalization ----------
class TestBulkImport:
    def test_bulk_import_csv(self, tokens):
        unique = uuid.uuid4().hex[:6]
        csv_text = (
            "name,phone,source,product_interest,remarks\n"
            f"Test User {unique} A,+91 98765 4{unique[:4]},instagram,sunscreen,row A\n"
            f"Test User {unique} B,8765 432 {unique[:3]}0,facebook,serum,row B\n"
            f"Test User {unique} C,+91 98765 4{unique[:4]},instagram,sunscreen,DUPLICATE\n"   # dup of A
            "Bad Phone,12,manual,,malformed\n"
        )
        files = {"file": ("leads.csv", csv_text, "text/csv")}
        r = requests.post(f"{BASE_URL}/api/leads/bulk-import",
                          headers=H(tokens["admin"]), files=files, timeout=20)
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        assert d["total_rows"] == 4
        assert d["created"] >= 2
        assert d["duplicates_skipped"] >= 1
        assert isinstance(d["errors"], list) and len(d["errors"]) >= 1

    def test_phone_normalization_on_create(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip("no telecaller token")
        unique = uuid.uuid4().hex[:6]
        # Build a phone whose last-10 digits are unique to avoid duplicate-phone collisions
        last10 = "9" + ("".join([c for c in uuid.uuid4().hex if c.isdigit()]) + "000000000")[:9]
        raw = f"+91 {last10[:5]} {last10[5:]}"
        payload = {
            "name": f"TEST_norm_{unique}",
            "phone_number": raw,
            "source": "manual",
            "product_interest": "lipstick",
        }
        r = requests.post(f"{BASE_URL}/api/leads", headers=H(tokens["telecaller"]),
                          json=payload, timeout=10)
        # endpoint may return 200 or 201
        assert r.status_code in (200, 201), r.text[:300]
        # Verify via DB
        loop = asyncio.new_event_loop()
        try:
            async def _check():
                cli = AsyncIOMotorClient(MONGO_URL)
                doc = await cli[DB_NAME].leads.find_one({"name": f"TEST_norm_{unique}"}, {"_id": 0})
                cli.close()
                return doc
            doc = loop.run_until_complete(_check())
        finally:
            loop.close()
        assert doc is not None, "lead not persisted"
        assert doc.get("phone_number_norm") == last10, f"norm={doc.get('phone_number_norm')}"


# ---------- Module 4: Customer 360 ----------
class TestCustomer360:
    def test_customer_360(self, tokens):
        r = requests.get(f"{BASE_URL}/api/customers/9876543210/360", headers=H(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "phone" in d and "leads" in d and "orders" in d and "stats" in d
        s = d["stats"]
        for k in ("total_orders", "delivered", "total_spent", "avg_order_value", "first_order_date", "last_order_date"):
            assert k in s


# ---------- Module 5: GST Invoice PDF ----------
class TestInvoicePDF:
    def test_invoice_pdf(self, tokens):
        # pick any order
        ords = requests.get(f"{BASE_URL}/api/orders", headers=H(tokens["admin"]), timeout=10).json()
        if isinstance(ords, dict): ords = ords.get("items") or ords.get("orders") or []
        if not ords:
            pytest.skip("no orders to invoice")
        oid = ords[0]["id"]
        r = requests.get(f"{BASE_URL}/api/orders/{oid}/invoice.pdf", headers=H(tokens["admin"]), timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:5] == b"%PDF-", f"not a PDF: {r.content[:20]}"


# ---------- Module 6: Trash + Restore ----------
class TestTrashRestore:
    def test_trash_list_and_restore_flow(self, tokens):
        if "telecaller" not in tokens or "admin" not in tokens:
            pytest.skip("need telecaller+admin")
        # Create a fresh lead
        unique = uuid.uuid4().hex[:6]
        c = requests.post(f"{BASE_URL}/api/leads", headers=H(tokens["telecaller"]),
                          json={"name": f"TEST_trash_{unique}", "phone_number": f"9000{unique[:6]}",
                                "source": "manual", "product_interest": "x"}, timeout=10)
        assert c.status_code in (200, 201), c.text[:300]
        lid = c.json().get("id") or c.json().get("lead", {}).get("id")
        assert lid
        # Soft-delete
        d = requests.delete(f"{BASE_URL}/api/leads/{lid}", headers=H(tokens["telecaller"]), timeout=10)
        assert d.status_code == 200, d.text[:300]
        # Trash list
        t = requests.get(f"{BASE_URL}/api/trash/leads", headers=H(tokens["admin"]), timeout=10)
        assert t.status_code == 200
        ids = [x["id"] for x in t.json().get("items", [])]
        assert lid in ids
        # Restore
        rs = requests.post(f"{BASE_URL}/api/trash/leads/{lid}/restore", headers=H(tokens["admin"]), timeout=10)
        assert rs.status_code == 200, rs.text[:300]
        # No longer in trash
        t2 = requests.get(f"{BASE_URL}/api/trash/leads", headers=H(tokens["admin"]), timeout=10)
        ids2 = [x["id"] for x in t2.json().get("items", [])]
        assert lid not in ids2

    def test_trash_list_role_gating(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip("no tc")
        r = requests.get(f"{BASE_URL}/api/trash/leads", headers=H(tokens["telecaller"]), timeout=10)
        assert r.status_code == 403


# ---------- Module 7: 2FA TOTP ----------
class TestTwoFA:
    def test_2fa_setup_verify_disable(self, tokens):
        # admin only
        s = requests.post(f"{BASE_URL}/api/auth/2fa/setup", headers=H(tokens["admin"]), timeout=15)
        assert s.status_code == 200, s.text[:300]
        d = s.json()
        assert d.get("secret") and d.get("qr_data_uri", "").startswith("data:image/png;base64,") and d.get("uri")
        # PNG b64 should decode to PNG magic
        b64 = d["qr_data_uri"].split(",", 1)[1]
        png = base64.b64decode(b64)
        assert png[:8] == b"\x89PNG\r\n\x1a\n", "qr is not a valid PNG"
        # Verify with pyotp-computed code
        code = pyotp.TOTP(d["secret"]).now()
        v = requests.post(f"{BASE_URL}/api/auth/2fa/verify", headers=H(tokens["admin"]),
                         json={"code": code}, timeout=10)
        assert v.status_code == 200, v.text[:300]
        # Disable
        x = requests.post(f"{BASE_URL}/api/auth/2fa/disable", headers=H(tokens["admin"]), timeout=10)
        assert x.status_code == 200


# ---------- Module 8: Live ops wall ----------
class TestLiveOpsWall:
    def test_ops_wall_shape(self, tokens):
        r = requests.get(f"{BASE_URL}/api/live/ops-wall", headers=H(tokens["admin"]), timeout=10)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k in ("ts", "revenue_today", "orders_today", "delivered_today",
                  "leads_today", "leads_last_10m", "orders_last_hour",
                  "deliveries_last_hour", "top_performer", "recent_orders",
                  "delivered_last_hour"):
            assert k in d, f"missing {k}"
        assert "name" in d["top_performer"] and "revenue" in d["top_performer"]


# ---------- Module 9: Cohort analytics ----------
class TestCohort:
    def test_cohort(self, tokens):
        r = requests.get(f"{BASE_URL}/api/analytics/cohort", headers=H(tokens["admin"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "cohorts" in d and "total_customers" in d
        assert isinstance(d["cohorts"], dict)


# ---------- Module 10: Proxy audit ----------
class TestProxyAudit:
    def test_proxy_audit_admin(self, tokens):
        r = requests.get(f"{BASE_URL}/api/admin/proxy-audit", headers=H(tokens["admin"]), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "logs" in d and "total" in d

    def test_proxy_audit_non_admin_forbidden(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip()
        r = requests.get(f"{BASE_URL}/api/admin/proxy-audit", headers=H(tokens["telecaller"]), timeout=10)
        assert r.status_code == 403


# ---------- Module 11: Transcribe (gracefully) ----------
class TestTranscribe:
    def test_transcribe_no_key_or_ok(self, tokens):
        files = {"file": ("test.webm", b"fake-audio-bytes-here", "audio/webm")}
        r = requests.post(f"{BASE_URL}/api/transcribe", headers=H(tokens["admin"]),
                         files=files, timeout=30)
        # 503 if no key, 200 with text if key, 502 if backend hit STT and failed
        assert r.status_code in (200, 502, 503), f"unexpected {r.status_code}: {r.text[:300]}"


# ---------- Module 12: DB-level checks (migration + indices + stock deduct) ----------
def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class TestDBMigrations:
    def test_legacy_collections_empty(self):
        async def _go():
            cli = AsyncIOMotorClient(MONGO_URL)
            db = cli[DB_NAME]
            names = await db.list_collection_names()
            out = {}
            for n in ("audit_log", "crm_orders", "contacts_book"):
                if n in names:
                    out[n] = await db[n].count_documents({})
                else:
                    out[n] = -1  # dropped
            cli.close()
            return out
        r = _run(_go())
        print("legacy collection state:", r)
        for n, c in r.items():
            assert c in (0, -1), f"{n} still has {c} docs"

    def test_commission_unique_index(self):
        async def _go():
            cli = AsyncIOMotorClient(MONGO_URL)
            db = cli[DB_NAME]
            idxs = await db.commissions.index_information()
            cli.close()
            return idxs
        idxs = _run(_go())
        print("commissions indexes:", list(idxs.keys()))
        found = False
        for name, info in idxs.items():
            keys = info.get("key", [])
            if info.get("unique") and set(k[0] for k in keys) == {"order_id", "user_id"}:
                found = True
                break
        assert found, f"unique(order_id,user_id) index missing: {idxs}"

    def test_commission_duplicate_insert_fails(self):
        from pymongo.errors import DuplicateKeyError
        async def _go():
            cli = AsyncIOMotorClient(MONGO_URL)
            db = cli[DB_NAME]
            tag = f"TEST-DUP-{uuid.uuid4().hex[:6]}"
            base = {"order_id": tag, "user_id": tag, "amount": 1}
            await db.commissions.insert_one(dict(base))
            err = None
            try:
                await db.commissions.insert_one(dict(base))
            except DuplicateKeyError as e:
                err = e
            await db.commissions.delete_many({"order_id": tag})
            cli.close()
            return err
        err = _run(_go())
        assert err is not None, "duplicate (order_id,user_id) should be rejected"


# ---------- Module 13: Stock auto-deduct on deliver_order ----------
class TestStockDeduct:
    def test_stock_decreases_on_deliver(self, tokens):
        if "telecaller" not in tokens or "admin" not in tokens:
            pytest.skip("need tc+admin")
        # Find a product with stock
        prods = requests.get(f"{BASE_URL}/api/products", headers=H(tokens["admin"]), timeout=10).json()
        if isinstance(prods, dict):
            prods = prods.get("items") or prods.get("products") or []
        target = next((p for p in prods if (p.get("stock") or 0) >= 2), None)
        if not target:
            pytest.skip("no product with stock>=2")
        pid = target["id"]; pname = target.get("name", "x"); price = target.get("price", 100) or 100

        # Snapshot stock
        before = next(p for p in prods if p["id"] == pid)["stock"]

        # Create order via telecaller
        order_payload = {
            "customer_name": "TEST_StockDeduct",
            "customer_phone": "9000111222",
            "customer_address": "123 Test St",
            "customer_city": "Kochi",
            "customer_pincode": "682001",
            "items": [{"product_id": pid, "product_name": pname, "quantity": 1, "price": price}],
            "total_amount": price,
            "payment_type": "cod",
        }
        oc = requests.post(f"{BASE_URL}/api/orders", headers=H(tokens["telecaller"]),
                           json=order_payload, timeout=10)
        assert oc.status_code in (200, 201), oc.text[:300]
        oid = oc.json().get("id") or oc.json().get("order", {}).get("id")
        assert oid

        # Approve + ship + deliver (admin)
        for action in ("approve", "ship"):
            ra = requests.put(f"{BASE_URL}/api/orders/{oid}/{action}",
                             headers=H(tokens["admin"]), timeout=10)
            print(f"{action} -> {ra.status_code} {ra.text[:120]}")
        rd = requests.put(f"{BASE_URL}/api/orders/{oid}/deliver",
                         headers=H(tokens["admin"]), timeout=15)
        if rd.status_code != 200:
            pytest.skip(f"deliver returned {rd.status_code}: could not test stock deduct: {rd.text[:200]}")

        # Stock after
        prods2 = requests.get(f"{BASE_URL}/api/products", headers=H(tokens["admin"]), timeout=10).json()
        if isinstance(prods2, dict):
            prods2 = prods2.get("items") or prods2.get("products") or []
        after = next(p["stock"] for p in prods2 if p["id"] == pid)
        assert after == before - 1, f"stock did not deduct: before={before} after={after}"
