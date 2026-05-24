"""Iteration 25 backend regression tests for Celesta Glow CRM.

This iteration's app deltas are FRONTEND-ONLY (UI validation hardening + new
ConfirmDialog component). The backend has NOT changed. Goal here is to confirm
no backend endpoints regressed by exercising the contracts the frontend now
relies on:

  (1) Auth — all 7 role logins still work.
  (2) POST /api/orders as AGENT WITHOUT pincode → backend MUST still accept
      (UI now enforces 6-digit pincode, but backend itself does NOT — confirm
      no regression).
  (3) POST /api/orders accepts customer_city / customer_pincode / customer_landmark
      and persists them (telecaller + agent flows).
  (4) POST /api/shipping/self/ship/{oid} works after confirming an order
      created with the new address fields (admin).
  (5) POST /api/shipping/delhivery/ship/{oid} role-gate still 403 for non-allowed
      roles (admin/inventory/SM allowed — but key is unconfigured, so admin gets
      500; we only assert the 403-gate behaviour for unauthorised roles).
  (6) GET /api/orders/{oid}/label.pdf returns valid %PDF- for an order that has
      city + pincode + landmark populated (regression for layout / new fields).
  (7) Phone-normalisation on POST /api/leads still applied (last-10-digits).
"""
import os
import uuid
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
INTERNAL_URL = "http://localhost:8001"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip().strip('"').strip("'")
DB_NAME = os.environ.get("DB_NAME", "test_database").strip().strip('"').strip("'")

CREDS = {
    "admin":      ("admin@celestaglow.com",        "admin123"),
    "sm":         ("salesmanager@celestaglow.com", "sm123"),
    "dm":         ("manager1@celestaglow.com",     "mgr123"),
    "telecaller": ("telecaller1@celestaglow.com",  "tc123"),
    "agent":      ("agent1@celestaglow.com",       "agent123"),
    "hr":         ("hrmanager@celestaglow.com",    "hr123"),
    "inventory":  ("inventory@celestaglow.com",    "inv123"),
}


def _login(email, pw, allow_retry=True):
    r = requests.post(f"{INTERNAL_URL}/api/auth/login",
                      json={"email": email, "password": pw}, timeout=10)
    if r.status_code == 429 and allow_retry:
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
        _t.sleep(0.3)  # avoid slowapi 10/min trip
    return out


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def _get_any_product(tok):
    r = requests.get(f"{BASE_URL}/api/products", headers=H(tok), timeout=10)
    assert r.status_code == 200, r.text[:300]
    arr = r.json()
    if isinstance(arr, dict):
        arr = arr.get("items") or arr.get("products") or []
    assert arr, "no products available"
    return arr[0]


def _build_order_payload(with_address_fields=True, with_pincode=True):
    unique = uuid.uuid4().hex[:6]
    payload = {
        "customer_name": f"TEST_iter25_{unique}",
        "customer_phone": f"9{unique[:9].ljust(9, '0')}",
        "customer_address": "123 TEST Street, Building B",
        "items": [],  # will be filled by caller
        "total_amount": 0,
        "payment_type": "cod",
    }
    if with_address_fields:
        payload["customer_city"] = "Kochi"
        payload["customer_state"] = "Kerala"
        payload["customer_landmark"] = "Near MG Road Metro Station"
        if with_pincode:
            payload["customer_pincode"] = "682001"
    return payload, unique


# ----------------------------------------------------------- 1. Auth: all 7 roles

class TestAllRoleLogins:
    """Regression: all 7 role logins documented in test_credentials.md still work."""

    @pytest.mark.parametrize("role", list(CREDS.keys()))
    def test_login(self, role, tokens):
        assert role in tokens, f"{role} login failed (no token returned)"
        assert isinstance(tokens[role], str) and len(tokens[role]) > 10


# ----------------------------------------------------------- 2. Backend does NOT enforce pincode (regression check)

class TestAgentOrderWithoutPincode:
    """B5.1 regression: backend MUST still accept POST /api/orders without pincode.
    Only the agent UI validates 6-digit pincode — backend has no such enforcement."""

    def test_agent_create_order_no_pincode_still_succeeds(self, tokens):
        if "agent" not in tokens:
            pytest.skip("no agent token")
        prod = _get_any_product(tokens["agent"])
        pid = prod.get("id") or prod.get("_id")
        pname = prod.get("name", "Product")
        price = prod.get("price", 100) or 100
        payload, _ = _build_order_payload(with_address_fields=True, with_pincode=False)
        payload["items"] = [{"product_id": pid, "product_name": pname, "quantity": 1, "price": price}]
        payload["total_amount"] = price

        r = requests.post(f"{BASE_URL}/api/orders", headers=H(tokens["agent"]),
                          json=payload, timeout=15)
        assert r.status_code in (200, 201), \
            f"agent order WITHOUT pincode should still succeed at backend, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        ord_doc = body.get("order") or body
        # confirm persisted with empty pincode (i.e. backend didn't reject)
        assert ord_doc.get("customer_pincode", "") == ""
        assert ord_doc.get("customer_city") == "Kochi"  # other addr fields still stored


# ----------------------------------------------------------- 3. Address fields accepted & persisted

class TestOrderAddressFields:
    """B3.x: customer_pincode / customer_city / customer_landmark are accepted and persisted."""

    def test_telecaller_create_order_with_all_address_fields(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip("no telecaller")
        prod = _get_any_product(tokens["telecaller"])
        pid = prod.get("id") or prod.get("_id")
        pname = prod.get("name", "Product")
        price = prod.get("price", 100) or 100
        payload, unique = _build_order_payload(with_address_fields=True, with_pincode=True)
        payload["items"] = [{"product_id": pid, "product_name": pname, "quantity": 1, "price": price}]
        payload["total_amount"] = price

        r = requests.post(f"{BASE_URL}/api/orders", headers=H(tokens["telecaller"]),
                          json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text[:300]
        body = r.json()
        ord_doc = body.get("order") or body
        oid = ord_doc.get("id")
        assert oid, f"missing order id in: {body}"
        assert ord_doc.get("customer_pincode") == "682001"
        assert ord_doc.get("customer_city") == "Kochi"
        assert ord_doc.get("customer_landmark") == "Near MG Road Metro Station"

        # Round-trip via GET /api/orders to confirm DB persistence
        g = requests.get(f"{BASE_URL}/api/orders", headers=H(tokens["admin"]), timeout=15)
        assert g.status_code == 200
        arr = g.json()
        if isinstance(arr, dict):
            arr = arr.get("orders") or arr.get("items") or []
        match = next((o for o in arr if o.get("id") == oid), None)
        assert match is not None, "order not in GET /api/orders"
        assert match["customer_pincode"] == "682001"
        assert match["customer_city"] == "Kochi"
        assert match["customer_landmark"] == "Near MG Road Metro Station"
        return oid

    def test_agent_create_order_with_all_address_fields(self, tokens):
        if "agent" not in tokens:
            pytest.skip("no agent")
        prod = _get_any_product(tokens["agent"])
        pid = prod.get("id") or prod.get("_id")
        pname = prod.get("name", "Product")
        price = prod.get("price", 100) or 100
        payload, _ = _build_order_payload(with_address_fields=True, with_pincode=True)
        payload["items"] = [{"product_id": pid, "product_name": pname, "quantity": 1, "price": price}]
        payload["total_amount"] = price
        r = requests.post(f"{BASE_URL}/api/orders", headers=H(tokens["agent"]),
                          json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text[:300]
        body = r.json()
        ord_doc = body.get("order") or body
        assert ord_doc["customer_pincode"] == "682001"
        assert ord_doc["customer_city"] == "Kochi"
        assert ord_doc["customer_landmark"] == "Near MG Road Metro Station"


# ----------------------------------------------------------- 4. Self-ship regression

def _create_confirmed_order(tokens, with_pincode=True, with_landmark=True):
    """Telecaller creates → admin approves → returns oid (status=confirmed)."""
    assert "telecaller" in tokens and "admin" in tokens
    prod = _get_any_product(tokens["telecaller"])
    pid = prod.get("id") or prod.get("_id")
    pname = prod.get("name", "Product")
    price = prod.get("price", 100) or 100
    payload, _ = _build_order_payload(with_address_fields=True, with_pincode=with_pincode)
    if not with_landmark:
        payload.pop("customer_landmark", None)
    payload["items"] = [{"product_id": pid, "product_name": pname, "quantity": 1, "price": price}]
    payload["total_amount"] = price
    c = requests.post(f"{BASE_URL}/api/orders", headers=H(tokens["telecaller"]),
                      json=payload, timeout=15)
    assert c.status_code in (200, 201), c.text[:300]
    oid = (c.json().get("order") or {}).get("id") or c.json().get("id")
    a = requests.put(f"{BASE_URL}/api/orders/{oid}/approve",
                     headers=H(tokens["admin"]), timeout=15)
    assert a.status_code == 200, a.text[:300]
    return oid


class TestSelfShipRegression:

    def test_self_ship_after_create_with_new_fields(self, tokens):
        oid = _create_confirmed_order(tokens, with_pincode=True, with_landmark=True)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}",
                          headers=H(tokens["admin"]),
                          json={"courier_name": "BlueDart",
                                "tracking_number": "BD-iter25-001",
                                "tracking_link": "https://bluedart.com/BD-iter25-001"},
                          timeout=15)
        assert r.status_code == 200, r.text[:400]

    def test_self_ship_blocked_for_telecaller_still(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip("no telecaller")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/self/ship/{oid}",
                          headers=H(tokens["telecaller"]),
                          json={"courier_name": "X"}, timeout=15)
        assert r.status_code == 403


# ----------------------------------------------------------- 5. Delhivery role-gate regression

class TestDelhiveryRoleGate:
    """Backend role-gate is admin / inventory_manager / sales_manager only."""

    def test_delhivery_ship_blocked_for_telecaller(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip("no telecaller")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/delhivery/ship/{oid}",
                          headers=H(tokens["telecaller"]), timeout=10)
        assert r.status_code == 403, f"expected 403 for telecaller, got {r.status_code}"

    def test_delhivery_ship_blocked_for_agent(self, tokens):
        if "agent" not in tokens:
            pytest.skip("no agent")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/delhivery/ship/{oid}",
                          headers=H(tokens["agent"]), timeout=10)
        assert r.status_code == 403

    def test_delhivery_ship_blocked_for_hr(self, tokens):
        """HR is NOT in the Delhivery allow-list (admin/inventory/SM only)."""
        if "hr" not in tokens:
            pytest.skip("no hr")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/delhivery/ship/{oid}",
                          headers=H(tokens["hr"]), timeout=10)
        assert r.status_code == 403

    def test_delhivery_ship_blocked_for_dm(self, tokens):
        """District manager is NOT in the Delhivery allow-list."""
        if "dm" not in tokens:
            pytest.skip("no dm")
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/delhivery/ship/{oid}",
                          headers=H(tokens["dm"]), timeout=10)
        assert r.status_code == 403

    def test_delhivery_admin_passes_role_gate(self, tokens):
        """Admin should pass the role-gate. With no DELHIVERY_API_KEY configured,
        backend returns 500 (config missing) — that's expected. Just confirm it's
        NOT a 403 (i.e., gate passes)."""
        oid = _create_confirmed_order(tokens)
        r = requests.post(f"{BASE_URL}/api/shipping/delhivery/ship/{oid}",
                          headers=H(tokens["admin"]), timeout=15)
        # admin passes the role-gate; downstream may 200/400/500/502 based on key
        assert r.status_code != 403, f"admin should pass role-gate, got 403"


# ----------------------------------------------------------- 6. Label PDF regression

class TestLabelPDFWithNewFields:

    def test_label_pdf_for_order_with_city_pincode_landmark(self, tokens):
        oid = _create_confirmed_order(tokens, with_pincode=True, with_landmark=True)
        r = requests.get(f"{BASE_URL}/api/orders/{oid}/label.pdf",
                         headers=H(tokens["admin"]), timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:5] == b"%PDF-", f"expected PDF, got: {r.content[:20]}"
        assert len(r.content) > 500, "PDF suspiciously small"

    def test_label_pdf_a4_sheet_for_order_with_new_fields(self, tokens):
        oid = _create_confirmed_order(tokens, with_pincode=True, with_landmark=True)
        r = requests.get(f"{BASE_URL}/api/orders/{oid}/label.pdf",
                         headers=H(tokens["admin"]),
                         params={"sheet": "a4"}, timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.content[:5] == b"%PDF-"
        assert len(r.content) > 500


# ----------------------------------------------------------- 7. Phone normalisation regression

class TestPhoneNormRegression:

    def test_phone_normalised_on_lead_create(self, tokens):
        if "telecaller" not in tokens:
            pytest.skip("no telecaller")
        unique = uuid.uuid4().hex[:6]
        name = f"TEST_norm25_{unique}"
        raw_last10 = "9" + "".join(c for c in uuid.uuid4().hex if c.isdigit())[:9]
        if len(raw_last10) < 10:
            raw_last10 = (raw_last10 + "0000000000")[:10]
        raw_phone = f"+91 {raw_last10[:5]} {raw_last10[5:]}"
        payload = {"name": name, "phone_number": raw_phone,
                   "source": "manual", "product_interest": "skincare"}
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
        assert doc is not None
        assert doc.get("phone_number_norm") == raw_last10, \
            f"expected '{raw_last10}', got '{doc.get('phone_number_norm')}'"
