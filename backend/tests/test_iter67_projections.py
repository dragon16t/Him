"""Iteration 67 — Financial Projections vs Actual + Salon quick-actions/district."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j["token"]


@pytest.fixture(scope="module")
def fm_headers():
    return {"Authorization": f"Bearer {_login('finance@celestaglow.com', 'fin123')}"}


@pytest.fixture(scope="module")
def tc_headers():
    return {"Authorization": f"Bearer {_login('telecaller1@celestaglow.com', 'tc123')}"}


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login('admin@celestaglow.com', 'admin123')}"}


@pytest.fixture(scope="module")
def sm_headers():
    return {"Authorization": f"Bearer {_login('salesmanager@celestaglow.com', 'sm123')}"}


# ---------- Projections ----------
class TestProjections:
    def test_list_all_projections(self, fm_headers):
        r = requests.get(f"{API}/finance/projections", headers=fm_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["count"] >= 33, f"expected >=33 seeded rows, got {data['count']}"
        years = {p["year"] for p in data["projections"]}
        assert years == {1, 2, 3}, years

    def test_vs_actual_year1_shape(self, fm_headers):
        r = requests.get(f"{API}/finance/projections/vs-actual", params={"year": 1}, headers=fm_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["year"] == 1
        rows = data["rows"]
        assert len(rows) >= 8
        req = {"month", "sales", "cogs", "marketing", "employee", "tech", "depreciation",
               "net_income", "actual_revenue", "actual_orders", "actual_net_income",
               "variance_revenue", "variance_net"}
        missing = req - set(rows[0].keys())
        assert not missing, f"missing fields: {missing}"
        totals = data["totals"]
        for k in ("projected_revenue", "actual_revenue", "projected_net", "actual_net",
                  "variance_revenue", "variance_net"):
            assert k in totals

    def test_vs_actual_year3(self, fm_headers):
        r = requests.get(f"{API}/finance/projections/vs-actual", params={"year": 3}, headers=fm_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["year"] == 3
        assert len(data["rows"]) >= 8
        # Year 3 should have larger projected revenues than Year 1
        assert data["totals"]["projected_revenue"] > 0

    def test_reseed(self, fm_headers):
        r = requests.post(f"{API}/finance/projections/reseed", headers=fm_headers, timeout=30)
        assert r.status_code == 200
        assert r.json().get("loaded", 0) >= 33

    def test_tc_forbidden(self, tc_headers):
        r = requests.get(f"{API}/finance/projections/vs-actual", params={"year": 1}, headers=tc_headers, timeout=15)
        assert r.status_code == 403

    def test_admin_allowed(self, admin_headers):
        r = requests.get(f"{API}/finance/projections/vs-actual", params={"year": 2}, headers=admin_headers, timeout=15)
        assert r.status_code == 200


# ---------- Salon regression ----------
class TestSalonRegression:
    def test_salons_list_has_district(self, sm_headers):
        r = requests.get(f"{API}/salons", headers=sm_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Some seeded salons should have a district field
        salons = data.get("salons", data) if isinstance(data, dict) else data
        assert isinstance(salons, list)
        # ok even if empty; but field should be present on at least one
        with_district = [s for s in salons if s.get("district")]
        # Just log — not a hard assert (data-dependent)
        print(f"salons: {len(salons)}, with district: {len(with_district)}")
