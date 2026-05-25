"""
Iteration 27 — backend tests for new endpoints introduced in this round
plus re-validation of finance/return-cash validation + PO validation +
PUT /api/leads phone re-normalization.

New endpoints covered:
- GET /api/all-users (paginated + role_filter + q search)
- POST /api/commissions/bulk-pay (empty ids, non-existent ids)
- GET /api/leads/{id}/score (rule-based)
- POST /api/calls/{id}/summary (fallback, no LLM key)
- POST /api/finance/return-cash (404 + balance validation + success)
- POST /api/purchase-orders (empty items + unknown product validation)
- PUT /api/leads/{id} (phone re-normalization)

Smoke tests from iteration 1 are run via the existing test_smoke_iteration_1.py
file (kept untouched) so previous results re-execute in this pytest run.
"""
import os
import uuid
import pytest
import requests

def _read_env(path, key):
    try:
        for ln in open(path):
            ln = ln.strip()
            if ln.startswith(f"{key}="):
                return ln.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return ""

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")
            or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set (env or /app/frontend/.env)"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, password):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(session):
    tok = _login(session, "admin@celestaglow.com", "admin123")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def finance_headers(session):
    tok = _login(session, "finance@celestaglow.com", "fin123")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ===== GET /api/all-users (paginated) =====

class TestAllUsersPagination:
    def test_pagination_returns_envelope(self, session, admin_headers):
        r = session.get(f"{BASE_URL}/api/all-users?skip=0&limit=5",
                        headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        for k in ("users", "total", "skip", "limit"):
            assert k in data, f"missing {k} in {list(data.keys())}"
        assert isinstance(data["users"], list)
        assert len(data["users"]) <= 5
        assert data["skip"] == 0
        assert data["limit"] == 5
        assert isinstance(data["total"], int) and data["total"] >= len(data["users"])

    def test_role_filter_admin(self, session, admin_headers):
        r = session.get(f"{BASE_URL}/api/all-users?role_filter=admin",
                        headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        assert data["total"] >= 1, f"expected at least 1 admin, got {data['total']}"
        # All returned users should have role=admin
        for u in data["users"]:
            assert u.get("role") == "admin", f"non-admin in role_filter=admin: {u}"

    def test_q_search_matches_admin(self, session, admin_headers):
        r = session.get(f"{BASE_URL}/api/all-users?q=admin",
                        headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        assert data["total"] >= 1, "q=admin should hit at least the admin user"
        # Confirm at least one user contains 'admin' in name or email
        found = any(
            "admin" in (u.get("name", "") or "").lower() or
            "admin" in (u.get("email", "") or "").lower() or
            "admin" in (u.get("phone", "") or "").lower()
            for u in data["users"]
        )
        assert found, f"q=admin returned no admin-matching user: {data['users'][:3]}"


# ===== POST /api/commissions/bulk-pay =====

class TestBulkPayCommissions:
    def test_empty_ids_returns_400(self, session, admin_headers):
        r = session.post(f"{BASE_URL}/api/commissions/bulk-pay",
                         headers=admin_headers, json={"ids": []}, timeout=30)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "ids list is required" in str(body.get("detail", "")).lower()

    def test_nonexistent_ids_returns_skipped(self, session, admin_headers):
        fake = [f"comm-fake-{uuid.uuid4().hex[:6]}",
                f"comm-fake-{uuid.uuid4().hex[:6]}"]
        r = session.post(f"{BASE_URL}/api/commissions/bulk-pay",
                         headers=admin_headers,
                         json={"ids": fake, "paid_via": "bank_transfer"}, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert body.get("paid_count") == 0
        assert body.get("skipped") == 2
        assert "no pending" in str(body.get("message", "")).lower()


# ===== POST /api/finance/return-cash =====

class TestReturnCash:
    def test_returncash_unknown_user_404(self, session, finance_headers):
        r = session.post(f"{BASE_URL}/api/finance/return-cash",
                         headers=finance_headers,
                         json={"user_id": f"nope-{uuid.uuid4().hex[:6]}",
                               "amount": 10, "user_name": "Ghost"},
                         timeout=30)
        assert r.status_code == 404, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert "no cash holder" in str(body.get("detail", "")).lower()

    def test_returncash_overdraft_and_success(self, session, finance_headers):
        """Assign Rs.100 → attempt return Rs.500 (400) → return Rs.40 (200)."""
        uid = f"TEST_holder-{uuid.uuid4().hex[:8]}"
        uname = "TEST_HolderUser"
        # assign 100
        ra = session.post(f"{BASE_URL}/api/finance/assign-cash",
                          headers=finance_headers,
                          json={"user_id": uid, "amount": 100, "user_name": uname},
                          timeout=30)
        assert ra.status_code == 200, f"assign-cash failed: {ra.status_code} {ra.text}"
        # try return 500 → 400
        rb = session.post(f"{BASE_URL}/api/finance/return-cash",
                          headers=finance_headers,
                          json={"user_id": uid, "amount": 500, "user_name": uname},
                          timeout=30)
        assert rb.status_code == 400, f"expected 400 overdraft, got {rb.status_code} {rb.text}"
        msg = str(rb.json().get("detail", "")).lower()
        assert "cannot return" in msg and "only has" in msg, f"unexpected detail: {msg}"
        # return 40 → 200
        rc = session.post(f"{BASE_URL}/api/finance/return-cash",
                          headers=finance_headers,
                          json={"user_id": uid, "amount": 40, "user_name": uname},
                          timeout=30)
        assert rc.status_code == 200, f"{rc.status_code} {rc.text[:300]}"
        body = rc.json()
        assert "remaining_balance" in body
        assert abs(body["remaining_balance"] - 60.0) < 0.01, f"expected 60, got {body['remaining_balance']}"


# ===== Leads: score + summary + phone re-normalize =====

class TestLeadAIEndpoints:
    @pytest.fixture(scope="class")
    def created_lead(self, admin_headers):
        s = requests.Session()
        s.headers.update(admin_headers)
        phone = f"99{uuid.uuid4().int % 10**8:08d}"  # 10-digit
        r = s.post(f"{BASE_URL}/api/leads",
                   json={"phone_number": phone, "name": "TEST_ScoreLead",
                         "source": "manual", "status": "new"},
                   timeout=30)
        assert r.status_code in (200, 201), f"create lead: {r.status_code} {r.text}"
        lead = r.json().get("lead") or r.json()
        return lead

    def test_score_404_for_fake_id(self, session, admin_headers):
        r = session.get(f"{BASE_URL}/api/leads/fake-{uuid.uuid4().hex[:6]}/score",
                        headers=admin_headers, timeout=30)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"
        assert "lead not found" in str(r.json().get("detail", "")).lower()

    def test_summary_404_for_fake_id(self, session, admin_headers):
        r = session.post(f"{BASE_URL}/api/calls/fake-{uuid.uuid4().hex[:6]}/summary",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 404, f"{r.status_code} {r.text[:200]}"
        assert "lead not found" in str(r.json().get("detail", "")).lower()

    def test_lead_score_shape(self, session, admin_headers, created_lead):
        lid = created_lead["id"]
        r = session.get(f"{BASE_URL}/api/leads/{lid}/score",
                        headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert isinstance(body.get("score"), int)
        assert 0 <= body["score"] <= 100
        assert body.get("band") in ("hot", "warm", "cold")
        assert isinstance(body.get("reasons"), list)

    def test_call_summary_fallback_no_logs(self, session, admin_headers, created_lead):
        lid = created_lead["id"]
        r = session.post(f"{BASE_URL}/api/calls/{lid}/summary",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        assert body.get("source") == "fallback"
        assert body.get("call_count") == 0
        assert isinstance(body.get("summary"), str) and len(body["summary"]) > 0

    def test_put_lead_phone_renormalizes(self, session, admin_headers, created_lead):
        lid = created_lead["id"]
        new_phone = "+91-98765-43210"  # mixed chars
        r = session.put(f"{BASE_URL}/api/leads/{lid}",
                        headers=admin_headers,
                        json={"phone_number": new_phone}, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        # GET back to verify norm
        g = session.get(f"{BASE_URL}/api/leads/{lid}",
                        headers=admin_headers, timeout=30)
        assert g.status_code == 200
        lead = g.json().get("lead") or {}
        assert lead.get("phone_number_norm") == "9876543210", \
            f"expected last-10 norm '9876543210', got {lead.get('phone_number_norm')}"


# ===== Purchase Orders validation =====

class TestPurchaseOrders:
    def test_po_empty_items_400(self, session, admin_headers):
        r = session.post(f"{BASE_URL}/api/purchase-orders",
                         headers=admin_headers,
                         json={"vendor_name": "TEST_Vendor", "items": []},
                         timeout=30)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"
        assert "at least one item" in str(r.json().get("detail", "")).lower()

    def test_po_unknown_product_400(self, session, admin_headers):
        fake_pid = f"prod-fake-{uuid.uuid4().hex[:6]}"
        r = session.post(f"{BASE_URL}/api/purchase-orders",
                         headers=admin_headers,
                         json={"vendor_name": "TEST_Vendor",
                               "items": [{"product_id": fake_pid, "qty": 5}]},
                         timeout=30)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"
        detail = str(r.json().get("detail", "")).lower()
        assert "unknown product" in detail and fake_pid.lower() in detail
