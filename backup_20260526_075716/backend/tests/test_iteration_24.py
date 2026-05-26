"""Iteration 24 backend tests for Celesta Glow CRM.

Covers the deltas in this iteration:
  • POST /api/leads now sets phone_number_norm even on direct create (bug-fix)
  • NEW: POST /api/shipping/self/ship/{oid} — self-ship endpoint
        - Allowed for: admin, inventory_manager, sales_manager, district_manager, hr_manager
        - Blocked for: telecaller, agent
        - Rejects cancelled orders (400)
        - Rejects orders with Delhivery AWB (400)
  • Regression: GET /api/orders/{oid}/label.pdf (single & a4) and POST /api/orders/labels/bulk
    still return valid %PDF- bytes after _draw_label refactor
"""
import os
import uuid
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
INTERNAL_URL = "http://localhost:8001"  # avoid ingress IP issues
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip().strip('"').strip("'")
DB_NAME = os.environ.get("DB_NAME", "test_database").strip().strip('"').strip("'")

CREDS = {
    "admin":       ("admin@celestaglow.com",        "admin123"),
    "sm":          ("salesmanager@celestaglow.com", "sm123"),
    "dm":          ("manager1@celestaglow.com",     "mgr123"),
    "telecaller":  ("telecaller1@celestaglow.com",  "tc123"),
    "agent":       ("agent1@celestaglow.com",       "agent123"),
    "hr":          ("hrmanager@celestaglow.com",    "hr123"),
    "inventory":   ("inventory@celestaglow.com",    "inv123"),
}


def _login(email, pw, allow_retry=True):
    r = requests.post(f"{INTERNAL_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=10)
    if r.status_code == 429 and allow_retry:
        # rate-limited; wait out the window
        import time as _t
        _t.sleep(62)
        return _login(email, pw, allow_retry=False)
    if r.status_code != 200:
        return None
    return r.json().get("token")


@pytest.fixture(scope="session")
def tokens():
    import time as _t
    out = {}
    for role, (e, p) in CREDS.items():
        t = _login(e, p)
        if t:
            out[role] = t
        # space out logins so we don't trip slowapi 10/min
        _t.sleep(0.3)
    return out


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------------------------------------------------------- helpers


def _get_any_product(tok):
    r = requests.get(f"{BASE_URL}/api/products", headers=H(tok), timeout=10)
    assert r.status_code == 200, r.text[:300]
    arr = r.json()
    if isinstance(arr, dict):
        arr = arr.get("items") or arr.get("products") or []
    assert arr, "no products available"
    return arr[0]


def _create_confirmed_order(tokens):
    """Create a fresh order (telecaller) then approve (admin) to reach 'confirmed'."""
    assert "telecaller" in tokens, "telecaller login missing"
    assert "admin" in tokens, "admin login missing"
    prod = _get_any_product(tokens["telecaller"])
    pid = prod.get("id") or prod.get("_id")
    pname = prod.get("name", "Product")
    price = prod.get("price", 100) or 100
    unique = uuid.uuid4().hex[:6]
    payload = {
        "customer_name": f"TEST_self_{unique}",
        "customer_phone": f"9{unique[:9].ljust(9,'0')}",
        "customer_address": "123 TEST Street, Building B",
        "customer_pincode": "682001",
        "customer_city": "Kochi",
        "customer_state": "Kerala",
        "items": [{"product_id": pid, "product_name": pname, "quantity": 1, "price": price}],
        "total_amount": price,
        "payment_type": "cod",
    }
    c = requests.post(f"{BASE_URL}/api/orders", headers=H(tokens["telecaller"]),
                      json=payload, timeout=15)
    assert c.status_code in (200, 201), c.text[:400]
    body = c.json()
    oid = (body.get("order") or {}).get("id") or body.get("id")
    assert oid, f"order id missing in response: {body}"
    # Approve as admin
    a = requests.put(f"{BASE_URL}/api/orders/{oid}/approve", headers=H(tokens["admin"]), timeout=15)
    assert a.status_code == 200, a.text[:300]
    return oid


# -------------------------------------------------------- 1. Phone-norm bug


class TestPhoneNormBugFix:
    """POST /api/leads must set phone_number_norm to last-10-digits even on direct create."""

    def test_phone_norm_set_on_direct_create(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip("no telecaller token")
        unique = uuid.uuid4().hex[:6]
        name = f"TEST_norm24_{unique}"
        # Use a unique raw phone whose normalized last-10 digits are unique
        raw_last10 = "98" + uuid.uuid4().hex[:8]  # 10 chars; hex digits 0-9a-f — we need 10 digits
        raw_last10 = "9" + "".join([c for c in uuid.uuid4().hex if c.isdigit()])[:9]
        if len(raw_last10) < 10:
            raw_last10 = (raw_last10 + "0000000000")[:10]
        raw_phone = f"+91 {raw_last10[:5]} {raw_last10[5:]}"
        payload = {
            "name": name,
            "phone_number": raw_phone,
            "source": "manual",
            "product_interest": "lipstick",
        }
        r = requests.post(f"{BASE_URL}/api/leads", headers=H(tokens["telecaller"]),
                          json=payload, timeout=10)
        assert r.status_code in (200, 201), r.text[:300]

        loop = asyncio.new_event_loop()
        try:
            async def _check():
                cli = AsyncIOMotorClient(MONGO_URL)
                d = await cli[DB_NAME].leads.find_one({"name": name}, {"_id": 0})
                cli.close()
                return d
            doc = loop.run_until_complete(_check())
        finally:
            loop.close()
        assert doc is not None, "lead was not persisted"
        assert doc.get("phone_number_norm") == raw_last10, \
            f"expected '{raw_last10}', got '{doc.get('phone_number_norm')}'"


# -------------------------------------------------------- 2. Self-ship endpoint


class TestSelfShip:

    def test_self_ship_happy_path_admin(self, tokens):
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}",
                          headers=H(tokens["admin"]),
                          json={"courier_name": "BlueDart", "tracking_number": "BD12345", "tracking_link": "https://bluedart.com/BD12345"},
                          timeout=15)
        assert r.status_code == 200, r.text[:400]
        # verify persistence via GET
        g = requests.get(f"{BASE_URL}/api/orders", headers=H(tokens["admin"]), timeout=10)
        assert g.status_code == 200
        arr = g.json()
        if isinstance(arr, dict):
            arr = arr.get("orders") or arr.get("items") or []
        ord_doc = next((o for o in arr if o.get("id") == oid), None)
        assert ord_doc is not None, "order not found in GET /api/orders"
        assert ord_doc.get("status") == "shipped", f"status={ord_doc.get('status')}"
        assert ord_doc.get("self_shipped") is True
        assert ord_doc.get("courier") == "self"
        assert ord_doc.get("courier_name") == "BlueDart"
        assert ord_doc.get("tracking_number") == "BD12345"

    def test_self_ship_sales_manager_allowed(self, tokens):
        if "sm" not in tokens:
            pytest.skip("no sm")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}", headers=H(tokens["sm"]),
                          json={"courier_name": "DTDC"}, timeout=15)
        assert r.status_code == 200, r.text[:400]

    def test_self_ship_district_manager_allowed(self, tokens):
        if "dm" not in tokens:
            pytest.skip("no dm")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}", headers=H(tokens["dm"]),
                          json={"courier_name": "Self"}, timeout=15)
        assert r.status_code == 200, r.text[:400]

    def test_self_ship_inventory_allowed(self, tokens):
        if "inventory" not in tokens:
            pytest.skip("no inventory")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}", headers=H(tokens["inventory"]),
                          json={"courier_name": "InHouse"}, timeout=15)
        assert r.status_code == 200, r.text[:400]

    def test_self_ship_hr_allowed(self, tokens):
        if "hr" not in tokens:
            pytest.skip("no hr")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}", headers=H(tokens["hr"]),
                          json={"courier_name": "HR-Self"}, timeout=15)
        assert r.status_code == 200, r.text[:400]

    def test_self_ship_blocked_for_telecaller(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip("no tc")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}",
                          headers=H(tokens["telecaller"]),
                          json={"courier_name": "x"}, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_self_ship_blocked_for_agent(self, tokens):
        if "agent" not in tokens:
            pytest.skip("no agent")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}",
                          headers=H(tokens["agent"]),
                          json={"courier_name": "x"}, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_self_ship_rejects_cancelled_order(self, tokens):
        # Create order, cancel it via DB direct, then try to self-ship
        oid = _create_confirmed_order(tokens)
        loop = asyncio.new_event_loop()
        try:
            async def _cancel():
                cli = AsyncIOMotorClient(MONGO_URL)
                await cli[DB_NAME].orders.update_one({"id": oid}, {"$set": {"status": "cancelled"}})
                cli.close()
            loop.run_until_complete(_cancel())
        finally:
            loop.close()
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}",
                          headers=H(tokens["admin"]),
                          json={"courier_name": "X"}, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"

    def test_self_ship_rejects_order_with_delhivery_awb(self, tokens):
        oid = _create_confirmed_order(tokens)
        # Force an AWB onto the order to simulate Delhivery shipment
        loop = asyncio.new_event_loop()
        try:
            async def _set_awb():
                cli = AsyncIOMotorClient(MONGO_URL)
                await cli[DB_NAME].orders.update_one({"id": oid}, {"$set": {"awb_number": "DHL12345"}})
                cli.close()
            loop.run_until_complete(_set_awb())
        finally:
            loop.close()
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}",
                          headers=H(tokens["admin"]),
                          json={"courier_name": "X"}, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"

    def test_self_ship_unknown_order(self, tokens):
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/NONEXISTENT-OID",
                          headers=H(tokens["admin"]), json={}, timeout=10)
        assert r.status_code == 404


# -------------------------------------------------------- 3. Label PDF regression


class TestLabelPDFRegression:

    def _pick_oid(self, tokens):
        r = requests.get(f"{BASE_URL}/api/orders", headers=H(tokens["admin"]), timeout=10)
        assert r.status_code == 200
        arr = r.json()
        if isinstance(arr, dict):
            arr = arr.get("orders") or arr.get("items") or []
        assert arr, "no orders available"
        return arr[0]["id"]

    def test_label_pdf_single(self, tokens):
        oid = self._pick_oid(tokens)
        r = requests.get(f"{BASE_URL}/api/orders/{oid}/label.pdf",
                         headers=H(tokens["admin"]), timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:5] == b"%PDF-", f"not a PDF: {r.content[:20]}"
        assert len(r.content) > 500, "PDF too small"

    def test_label_pdf_a4_sheet(self, tokens):
        oid = self._pick_oid(tokens)
        r = requests.get(f"{BASE_URL}/api/orders/{oid}/label.pdf",
                         headers=H(tokens["admin"]), params={"sheet": "a4"}, timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:5] == b"%PDF-"
        assert len(r.content) > 500

    def test_labels_bulk(self, tokens):
        r0 = requests.get(f"{BASE_URL}/api/orders", headers=H(tokens["admin"]), timeout=10)
        arr = r0.json()
        if isinstance(arr, dict):
            arr = arr.get("orders") or arr.get("items") or []
        ids = [o["id"] for o in arr[:3]] or []
        if not ids:
            pytest.skip("no orders for bulk")
        r = requests.post(f"{BASE_URL}/api/orders/labels/bulk", headers=H(tokens["admin"]),
                         json={"order_ids": ids}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:5] == b"%PDF-"
        assert len(r.content) > 1000
