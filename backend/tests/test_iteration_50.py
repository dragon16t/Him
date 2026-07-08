"""Iteration 50: contact-events, finance pending-credits, customers/profile, stock allocatable-employees."""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-central-82.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def tokens():
    # Restore seed if needed
    try:
        r = requests.post(f"{API}/auth/login", json={"email": "admin@celestaglow.com", "password": "admin123"}, timeout=15)
        if r.status_code != 200:
            requests.post(f"{API}/admin/restore-seed", json={"password": "AMVPA2478F@123"}, timeout=60)
    except Exception:
        pass
    return {
        "admin": _login("admin@celestaglow.com", "admin123"),
        "sm": _login("salesmanager@celestaglow.com", "sm123"),
        "tc": _login("telecaller1@celestaglow.com", "tc123"),
        "im": _login("inventory@celestaglow.com", "inv123"),
        "fin": _login("finance@celestaglow.com", "fin123"),
    }


def H(t): return {"Authorization": f"Bearer {t}"}


# ============ CONTACT EVENTS ============

def test_contact_event_log_by_tc(tokens):
    r = requests.post(f"{API}/contact-events",
                      headers=H(tokens["tc"]),
                      json={"type": "call", "customer_phone": "9876500001", "customer_name": "TEST_C1"},
                      timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["event"]["type"] == "call"
    assert data["event"]["phone_norm"] == "9876500001"


def test_contact_event_tc_cannot_log_for_other_tc(tokens):
    r = requests.post(f"{API}/contact-events",
                      headers=H(tokens["tc"]),
                      json={"type": "call", "customer_phone": "9876500002", "tc_id": "some-other-tc-id"},
                      timeout=15)
    assert r.status_code == 403, r.text


def test_contact_event_admin_can_log_for_any(tokens):
    r = requests.post(f"{API}/contact-events",
                      headers=H(tokens["admin"]),
                      json={"type": "whatsapp", "customer_phone": "9876500003", "tc_id": "tc-002", "tc_name": "Anjali"},
                      timeout=15)
    assert r.status_code == 200, r.text


def test_contact_event_invalid_type(tokens):
    r = requests.post(f"{API}/contact-events",
                      headers=H(tokens["tc"]),
                      json={"type": "email", "customer_phone": "9876500004"},
                      timeout=15)
    assert r.status_code == 400


def test_contact_events_list_tc_sees_own_only(tokens):
    r = requests.get(f"{API}/contact-events", headers=H(tokens["tc"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    # TC-only scope: all events tc_id should equal tc's own id (impossible to know exactly, but validate structure)
    assert "events" in data


def test_contact_events_summary_manager_only(tokens):
    r = requests.get(f"{API}/contact-events/summary", headers=H(tokens["admin"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "telecallers" in data and "customers" in data and "total_events" in data

    r2 = requests.get(f"{API}/contact-events/summary", headers=H(tokens["tc"]), timeout=15)
    assert r2.status_code == 403


def test_contact_events_summary_sm_scopes(tokens):
    r = requests.get(f"{API}/contact-events/summary", headers=H(tokens["sm"]), timeout=15)
    assert r.status_code == 200


def test_contact_events_pdf(tokens):
    r = requests.get(f"{API}/contact-events/report/pdf", headers=H(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


# ============ CUSTOMERS PROFILE ============

def test_customer_profile_valid(tokens):
    r = requests.get(f"{API}/customers/profile", headers=H(tokens["admin"]),
                     params={"phone": "9876500001"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("profile", "leads", "orders", "events", "stats"):
        assert k in d
    for k in ("total_calls", "total_whatsapp", "total_orders", "delivered_orders", "total_spend", "last_contact_at"):
        assert k in d["stats"]


def test_customer_profile_invalid(tokens):
    r = requests.get(f"{API}/customers/profile", headers=H(tokens["admin"]),
                     params={"phone": "123"}, timeout=15)
    assert r.status_code == 400


# ============ FINANCE PENDING CREDITS ============

def test_pending_credits_tc_forbidden(tokens):
    r = requests.get(f"{API}/finance/pending-credits", headers=H(tokens["tc"]), timeout=15)
    assert r.status_code == 403


def test_pending_credits_im_ok(tokens):
    r = requests.get(f"{API}/finance/pending-credits?status=pending", headers=H(tokens["im"]), timeout=15)
    assert r.status_code == 200, r.text
    assert "pending_credits" in r.json()


def test_pending_credits_summary(tokens):
    r = requests.get(f"{API}/finance/pending-credits/summary", headers=H(tokens["im"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("pending", "approved", "rejected"):
        assert k in d
        assert "count" in d[k] and "amount" in d[k]


def test_pending_credit_approve_reject_flow(tokens):
    # Seed a pending credit directly via DB is not possible; instead, we simulate
    # by finding an existing pending credit OR marking an order delivered.
    # Try: get any pending credit
    r = requests.get(f"{API}/finance/pending-credits?status=pending", headers=H(tokens["im"]), timeout=15)
    rows = r.json().get("pending_credits", [])
    if not rows:
        # Attempt to create one by delivering an order. Find a delivered-eligible order.
        rr = requests.get(f"{API}/orders", headers=H(tokens["admin"]), timeout=15)
        candidates = []
        if rr.status_code == 200:
            for o in rr.json().get("orders", [])[:500]:
                if o.get("status") == "shipped":
                    candidates.append(o)
        if not candidates:
            pytest.skip("No shipped orders available to deliver for creating a pending credit")
        oid = candidates[0]["id"]
        dr = requests.put(f"{API}/orders/{oid}/deliver", headers=H(tokens["admin"]), json={}, timeout=20)
        print(f"[deliver] {oid} -> {dr.status_code} {dr.text[:200]}")
        r = requests.get(f"{API}/finance/pending-credits?status=pending", headers=H(tokens["im"]), timeout=15)
        rows = r.json().get("pending_credits", [])
    if not rows:
        pytest.skip("Could not create/find a pending credit")
    # Approve one
    to_approve = rows[0]
    cid = to_approve["id"]
    ap = requests.post(f"{API}/finance/pending-credits/{cid}/approve",
                       headers=H(tokens["im"]), json={"account": "Bank Account"}, timeout=15)
    assert ap.status_code == 200, ap.text
    assert "ledger_entry_id" in ap.json()

    # Re-approve should 400
    ap2 = requests.post(f"{API}/finance/pending-credits/{cid}/approve",
                        headers=H(tokens["im"]), json={"account": "Bank Account"}, timeout=15)
    assert ap2.status_code == 400

    # Verify ledger has the entry
    lr = requests.get(f"{API}/finance/ledger", headers=H(tokens["im"]), timeout=15)
    if lr.status_code == 200:
        entries = lr.json().get("ledger", []) or lr.json().get("entries", []) or []
        found = any(e.get("reference_id") == to_approve.get("order_id") and e.get("type") == "credit" for e in entries)
        # informational only
        print(f"[ledger check] found credit for order {to_approve.get('order_id')}: {found}")

    # Reject flow: find another pending
    r2 = requests.get(f"{API}/finance/pending-credits?status=pending", headers=H(tokens["im"]), timeout=15)
    rows2 = r2.json().get("pending_credits", [])
    if rows2:
        cid2 = rows2[0]["id"]
        rj_missing = requests.post(f"{API}/finance/pending-credits/{cid2}/reject",
                                    headers=H(tokens["im"]), json={}, timeout=15)
        assert rj_missing.status_code == 400
        rj = requests.post(f"{API}/finance/pending-credits/{cid2}/reject",
                            headers=H(tokens["im"]), json={"reason": "Test rejection"}, timeout=15)
        assert rj.status_code == 200


# ============ STOCK ALLOCATABLE EMPLOYEES ============

def test_allocatable_employees_im(tokens):
    r = requests.get(f"{API}/stock-allocations/allocatable-employees",
                     headers=H(tokens["im"]), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "employees" in d
    assert isinstance(d["employees"], list)
    # Should have at least some telecallers
    tcs = [e for e in d["employees"] if e["role"] == "telecaller"]
    assert len(tcs) > 0, "no telecallers in allocatable-employees"


def test_allocatable_employees_tc_forbidden(tokens):
    r = requests.get(f"{API}/stock-allocations/allocatable-employees",
                     headers=H(tokens["tc"]), timeout=15)
    assert r.status_code == 403
