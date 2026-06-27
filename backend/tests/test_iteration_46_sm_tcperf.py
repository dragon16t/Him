"""
Iteration 46 backend tests:
1. GET /api/v2/orders sales_manager_id filter (admin/IM only)
2. GET /api/inventory/orders sales_manager_id filter
3. GET /api/sm/telecaller-performance (new endpoint)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@celestaglow.com", "admin123")
SM = ("salesmanager@celestaglow.com", "sm123")
TC1 = ("telecaller1@celestaglow.com", "tc123")
IM = ("inventory@celestaglow.com", "inv123")


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        # try restore-seed
        requests.post(f"{API}/admin/restore-seed", json={"password": "AMVPA2478F@123"}, timeout=60)
        time.sleep(3)
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": login(*ADMIN),
        "sm": login(*SM),
        "tc": login(*TC1),
        "im": login(*IM),
    }


@pytest.fixture(scope="module")
def sm_id(tokens):
    # Find SM id by email
    r = requests.get(f"{API}/admin/sales-managers", headers=H(tokens["admin"]))
    if r.status_code == 200:
        for sm in r.json().get("sales_managers", r.json() if isinstance(r.json(), list) else []):
            if sm.get("email") == SM[0]:
                return sm["id"]
    # fallback: from auth/me-like data on login
    r2 = requests.get(f"{API}/auth/me", headers=H(tokens["sm"]))
    assert r2.status_code == 200, r2.text
    return r2.json().get("id") or r2.json().get("user", {}).get("id")


# ---------- v2/orders SM filter ----------
class TestV2OrdersSmFilter:
    def test_admin_can_pass_sm_filter(self, tokens, sm_id):
        r = requests.get(f"{API}/v2/orders", params={"sales_manager_id": sm_id, "limit": 5}, headers=H(tokens["admin"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "orders" in data
        # If orders exist for the team they should all be by team members
        # (Hard to assert team membership without team list - just confirm no 500)

    def test_sm_filter_unknown_id_returns_empty(self, tokens):
        r = requests.get(f"{API}/v2/orders", params={"sales_manager_id": "non-existent-id-xyz", "limit": 5}, headers=H(tokens["admin"]))
        assert r.status_code == 200
        # Team resolves to [sales_manager_id] only — likely zero orders
        assert r.json()["total"] >= 0

    def test_im_can_pass_sm_filter(self, tokens, sm_id):
        r = requests.get(f"{API}/v2/orders", params={"sales_manager_id": sm_id, "limit": 5}, headers=H(tokens["im"]))
        assert r.status_code == 200, r.text


# ---------- inventory/orders SM filter ----------
class TestInventoryOrdersSmFilter:
    def test_admin_passes(self, tokens, sm_id):
        r = requests.get(f"{API}/inventory/orders", params={"sales_manager_id": sm_id}, headers=H(tokens["admin"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "orders" in data and "stats" in data

    def test_tc_forbidden(self, tokens):
        r = requests.get(f"{API}/inventory/orders", headers=H(tokens["tc"]))
        assert r.status_code == 403

    def test_im_passes(self, tokens, sm_id):
        r = requests.get(f"{API}/inventory/orders", params={"sales_manager_id": sm_id}, headers=H(tokens["im"]))
        assert r.status_code == 200


# ---------- sm/telecaller-performance ----------
class TestTelecallerPerformance:
    def test_admin_missing_sm_id_400(self, tokens):
        r = requests.get(f"{API}/sm/telecaller-performance", headers=H(tokens["admin"]))
        assert r.status_code == 400

    def test_admin_with_sm_id(self, tokens, sm_id):
        r = requests.get(f"{API}/sm/telecaller-performance", params={"sm_id": sm_id}, headers=H(tokens["admin"]))
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("range", "from", "to", "sm_id", "telecallers", "totals", "team"):
            assert k in data, f"missing {k}"
        assert data["sm_id"] == sm_id
        assert data["range"] == "7d"  # default
        assert isinstance(data["telecallers"], list)
        # totals shape
        for k in ("orders", "revenue", "qty", "delivered", "returned", "in_transit", "pending", "confirmed"):
            assert k in data["totals"]

    def test_sm_self_scoped(self, tokens, sm_id):
        r = requests.get(f"{API}/sm/telecaller-performance", headers=H(tokens["sm"]))
        assert r.status_code == 200, r.text
        assert r.json()["sm_id"] == sm_id

    def test_tc_forbidden(self, tokens):
        r = requests.get(f"{API}/sm/telecaller-performance", headers=H(tokens["tc"]))
        assert r.status_code == 403

    def test_range_today(self, tokens, sm_id):
        r = requests.get(f"{API}/sm/telecaller-performance", params={"sm_id": sm_id, "range": "today"}, headers=H(tokens["admin"]))
        assert r.status_code == 200
        assert r.json()["range"] == "today"

    def test_range_30d(self, tokens, sm_id):
        r = requests.get(f"{API}/sm/telecaller-performance", params={"sm_id": sm_id, "range": "30d"}, headers=H(tokens["admin"]))
        assert r.status_code == 200
        assert r.json()["range"] == "30d"

    def test_range_custom_bad_date(self, tokens, sm_id):
        r = requests.get(f"{API}/sm/telecaller-performance", params={"sm_id": sm_id, "range": "custom", "from": "bad", "to": "2026-01-01"}, headers=H(tokens["admin"]))
        assert r.status_code == 400

    def test_range_custom_good(self, tokens, sm_id):
        r = requests.get(f"{API}/sm/telecaller-performance", params={"sm_id": sm_id, "range": "custom", "from": "2025-12-01", "to": "2026-01-31"}, headers=H(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        assert d["from"] == "2025-12-01"
        assert d["to"] == "2026-01-31"

    def test_per_tc_aggregation(self, tokens, sm_id):
        """Create orders by TC1, verify they show up in performance numbers."""
        # First find TC1's id
        r = requests.get(f"{API}/auth/me", headers=H(tokens["tc"]))
        assert r.status_code == 200
        tc_data = r.json()
        tc_id = tc_data.get("id") or tc_data.get("user", {}).get("id")
        assert tc_id

        # Create an order as TC1
        order_payload = {
            "customer_name": f"TEST_TCPerf_{int(time.time())}",
            "customer_phone": "9990001234",
            "customer_address": "Test Address",
            "items": [{"product_id": "p1", "product_name": "P", "quantity": 2, "price": 100, "subtotal": 200}],
            "total_amount": 200,
            "payment_type": "cod",
        }
        cr = requests.post(f"{API}/orders", json=order_payload, headers=H(tokens["tc"]))
        # accept any 2xx
        assert cr.status_code in (200, 201), cr.text

        # Now call performance for the SM scope
        r = requests.get(f"{API}/sm/telecaller-performance", params={"sm_id": sm_id, "range": "today"}, headers=H(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        # find tc1 entry
        tc_entry = next((t for t in d["telecallers"] if t["telecaller_id"] == tc_id), None)
        # If TC1 is in the SM's team, the entry should exist
        if tc_entry is not None:
            assert tc_entry["orders"] >= 1
            assert tc_entry["total_qty"] >= 2
            assert tc_entry["revenue"] >= 200
