"""
Iteration 23 — Backend smoke test for Celesta Glow CRM.
Focus: auth roles, /auth/me, /leads, /orders, /products, /v2/orders pagination+date,
/admin/employees, /hr/efficiency, /admin/forecast, /live/ops-wall and permission checks.
"""
import os
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

# Credentials per /app/memory/test_credentials.md
CREDS = {
    "admin":   ("admin@celestaglow.com",        "admin123",   "admin"),
    "sm":      ("salesmanager@celestaglow.com", "sm123",      "sales_manager"),
    "dm":      ("manager1@celestaglow.com",     "mgr123",     "district_manager"),
    "tc":      ("telecaller1@celestaglow.com",  "tc123",      "telecaller"),
    "agent":   ("agent1@celestaglow.com",       "agent123",   "agent"),
    "hr":      ("hrmanager@celestaglow.com",    "hr123",      "hr_manager"),
    "finance": ("finance@celestaglow.com",      "fin123",     "finance_manager"),
}


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for k, (e, p, _role) in CREDS.items():
        r = requests.post(f"{API}/auth/login", json={"email": e, "password": p}, timeout=20)
        out[k] = {
            "status": r.status_code,
            "json": (r.json() if r.headers.get("content-type", "").startswith("application/json") else {}),
            "expected_role": _role,
            "email": e,
        }
    return out


# ---------------- LOGIN (per-role) ----------------
class TestAuthLogin:
    @pytest.mark.parametrize("role", list(CREDS.keys()))
    def test_login_each_role(self, tokens, role):
        info = tokens[role]
        assert info["status"] == 200, f"login failed for {role}: {info['status']} {info['json']}"
        body = info["json"]
        tok = body.get("token") or body.get("access_token")
        assert tok and isinstance(tok, str), f"no token for {role}: {body}"
        user = body.get("user") or {}
        # Role assertion (server may use either key style)
        actual_role = user.get("role") or body.get("role")
        assert actual_role == info["expected_role"], (
            f"role mismatch for {role}: expected={info['expected_role']} got={actual_role}"
        )


def _tok(tokens, role):
    body = tokens[role]["json"]
    return body.get("token") or body.get("access_token")


# ---------------- /auth/me ----------------
class TestAuthMe:
    @pytest.mark.parametrize("role", ["admin", "tc", "hr", "finance"])
    def test_me(self, tokens, role):
        tok = _tok(tokens, role)
        r = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, f"/auth/me {role}: {r.status_code} {r.text[:200]}"
        body = r.json()
        # Body may be {user:..} or flat
        u = body.get("user") if isinstance(body.get("user"), dict) else body
        assert u.get("email") == CREDS[role][0]
        assert u.get("role") == CREDS[role][2]


# ---------------- /leads ----------------
class TestLeads:
    def test_telecaller_leads_scoped(self, tokens):
        tok = _tok(tokens, "tc")
        r = requests.get(f"{API}/leads", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        leads = data if isinstance(data, list) else data.get("leads") or data.get("items") or []
        assert isinstance(leads, list)
        # Scoping check: each lead should be assigned to telecaller1 (tc-001) when present
        tc_user = tokens["tc"]["json"].get("user") or {}
        tc_id = tc_user.get("id") or tc_user.get("user_id") or "tc-001"
        if leads:
            for ld in leads[:25]:
                owner = (
                    ld.get("assigned_to")
                    or ld.get("telecaller_id")
                    or ld.get("owner_id")
                    or ld.get("user_id")
                )
                # If field exists, must match telecaller; if missing, just ensure it's not someone else explicitly
                if owner is not None:
                    assert owner == tc_id, f"lead {ld.get('id')} not scoped to tc; owner={owner}"


# ---------------- /orders ----------------
class TestOrders:
    def test_admin_orders_list(self, tokens):
        tok = _tok(tokens, "admin")
        r = requests.get(f"{API}/orders", headers=_hdr(tok), timeout=20)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        orders = body if isinstance(body, list) else body.get("orders") or body.get("items") or []
        assert isinstance(orders, list)


# ---------------- /products ----------------
class TestProducts:
    def test_products_seeded_six(self):
        # public or any-auth — try unauth first then admin
        r = requests.get(f"{API}/products", timeout=15)
        if r.status_code in (401, 403):
            tok_resp = requests.post(f"{API}/auth/login",
                                     json={"email": "admin@celestaglow.com", "password": "admin123"},
                                     timeout=15).json()
            tok = tok_resp.get("token") or tok_resp.get("access_token")
            r = requests.get(f"{API}/products", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        items = body if isinstance(body, list) else body.get("products") or body.get("items") or []
        assert isinstance(items, list)
        assert len(items) == 6, f"expected 6 seeded products, got {len(items)}: names={[p.get('name') for p in items]}"
        # Field sanity
        for p in items:
            assert p.get("name")
            assert "price" in p or "mrp" in p or "selling_price" in p


# ---------------- /v2/orders (date range + pagination) ----------------
class TestV2Orders:
    def test_v2_orders_pagination_and_date(self, tokens):
        tok = _tok(tokens, "admin")
        today = dt.date.today().isoformat()
        frm = (dt.date.today() - dt.timedelta(days=30)).isoformat()
        params = {"from": frm, "to": today, "page": 1, "page_size": 5}
        r = requests.get(f"{API}/v2/orders", headers=_hdr(tok), params=params, timeout=20)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert isinstance(body, dict), f"expected paginated dict, got {type(body)}"
        items = body.get("items", body.get("orders", []))
        assert isinstance(items, list), f"items not list, body keys={list(body.keys())}"
        # honor whichever page-size key the API uses
        psize = body.get("page_size") or body.get("limit") or 5
        assert len(items) <= psize, f"items {len(items)} exceeds page_size {psize}"
        meta_keys = {"page", "page_size", "total", "limit", "skip", "pages"} & set(body.keys())
        assert meta_keys, f"expected pagination meta keys in response, got keys={list(body.keys())}"


# ---------------- /admin/employees ----------------
class TestAdminEmployees:
    def test_admin_employees_grouped(self, tokens):
        tok = _tok(tokens, "admin")
        r = requests.get(f"{API}/admin/employees", headers=_hdr(tok), timeout=20)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # Expect dict grouped by role OR object with employees grouping
        assert isinstance(body, (dict, list))
        if isinstance(body, dict):
            # at least one role bucket exists
            keys = list(body.keys())
            assert any(k in keys for k in ["telecaller", "agent", "sales_manager", "district_manager", "hr_manager", "admin", "groups", "employees"]), keys

    def test_telecaller_forbidden_on_admin_employees(self, tokens):
        tok = _tok(tokens, "tc")
        r = requests.get(f"{API}/admin/employees", headers=_hdr(tok), timeout=15)
        assert r.status_code == 403, f"expected 403 for tc on /admin/employees, got {r.status_code} {r.text[:200]}"


# ---------------- /hr/efficiency ----------------
class TestHrEfficiency:
    @pytest.mark.parametrize("role", ["admin", "hr"])
    def test_hr_efficiency(self, tokens, role):
        tok = _tok(tokens, role)
        r = requests.get(f"{API}/hr/efficiency", headers=_hdr(tok), timeout=25)
        assert r.status_code == 200, f"{role}: {r.status_code} {r.text[:200]}"
        body = r.json()
        rows = body if isinstance(body, list) else body.get("rows") or body.get("employees") or body.get("items") or []
        assert isinstance(rows, list)


# ---------------- /admin/forecast ----------------
class TestAdminForecast:
    def test_forecast_admin(self, tokens):
        tok = _tok(tokens, "admin")
        r = requests.get(f"{API}/admin/forecast", headers=_hdr(tok), timeout=20)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert isinstance(body, dict)
        assert "historical" in body, f"missing 'historical' key; got keys={list(body.keys())}"
        assert "projection" in body, f"missing 'projection' key; got keys={list(body.keys())}"
        assert isinstance(body["historical"], list), f"historical not list: type={type(body['historical'])}"
        assert isinstance(body["projection"], list), f"projection not list: type={type(body['projection'])}"


# ---------------- /live/ops-wall ----------------
class TestOpsWall:
    def test_ops_wall(self, tokens):
        tok = _tok(tokens, "admin")
        r = requests.get(f"{API}/live/ops-wall", headers=_hdr(tok), timeout=15)
        # ops-wall may be open or require any auth
        if r.status_code in (401, 403):
            r = requests.get(f"{API}/live/ops-wall", timeout=15)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert isinstance(body, dict)
        assert "ts" in body, f"missing ts; keys={list(body.keys())}"
        assert "revenue_today" in body, f"missing revenue_today; keys={list(body.keys())}"
        assert "recent_orders" in body, f"missing recent_orders; keys={list(body.keys())}"
        assert isinstance(body["recent_orders"], list)
