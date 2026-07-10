"""Iteration 66 backend tests.

Covers:
- POST /api/orders   → cross-dashboard cleanup
- POST /api/leads    → 409 when prior order exists on phone by other TC
- POST /api/leads/{id}/mark-order-by-other-tc
- GET  /api/admin/lead-stats-overview
- GET  /api/admin/tc-performance-range
"""
import os
import time
import uuid
from datetime import datetime, timezone
import pytest
import requests
from pymongo import MongoClient

def _read_frontend_env_url():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"

def _read_backend_env(key):
    try:
        with open("/app/backend/.env") as f:
            for line in f:
                if line.strip().startswith(f"{key}="):
                    v = line.strip().split("=", 1)[1].strip().strip('"')
                    return v
    except Exception:
        pass
    return None

_MONGO_URL = _read_backend_env("MONGO_URL") or "mongodb://localhost:27017"
_DB_NAME = _read_backend_env("DB_NAME") or "test_database"
_mongo = MongoClient(_MONGO_URL)
_db = _mongo[_DB_NAME]
API = f"{BASE_URL}/api"

ADMIN = ("admin@celestaglow.com", "admin123")
TC1 = ("telecaller1@celestaglow.com", "tc123")
TC2 = ("telecaller2@celestaglow.com", "tc123")
TC3 = ("telecaller3@celestaglow.com", "tc123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j["access_token"], j.get("user") or {}


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sessions():
    admin_tok, admin_u = _login(*ADMIN)
    tc1_tok, tc1_u = _login(*TC1)
    tc2_tok, tc2_u = _login(*TC2)
    tc3_tok, tc3_u = _login(*TC3)
    return {
        "admin": (admin_tok, admin_u),
        "tc1": (tc1_tok, tc1_u),
        "tc2": (tc2_tok, tc2_u),
        "tc3": (tc3_tok, tc3_u),
    }


@pytest.fixture(scope="module")
def unique_phone():
    # 10 digit test phone
    return "9" + "".join(str((int(time.time()) >> i) & 7) for i in range(9))


def _admin_create_lead(admin_tok, phone, assigned_to, name="TEST_lead"):
    r = requests.post(
        f"{API}/leads",
        headers=_h(admin_tok),
        json={
            "phone_number": phone,
            "name": name,
            "assigned_to": assigned_to,
            "source": "TEST_iter66",
            "product_interest": "general",
        },
        timeout=30,
    )
    return r


# ────────────────────────────────────────────────────────────────
# Test 1: admin lead-stats-overview
# ────────────────────────────────────────────────────────────────
def test_admin_lead_stats_overview(sessions):
    admin_tok, _ = sessions["admin"]
    r = requests.get(f"{API}/admin/lead-stats-overview", headers=_h(admin_tok), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("unique_leads", "all_leads_incl_dead", "duplicates_removed",
              "total_orders", "overall_conversion_pct"):
        assert k in d, f"missing key {k}: {d}"
    assert isinstance(d["unique_leads"], int)
    assert isinstance(d["overall_conversion_pct"], (int, float))


def test_admin_lead_stats_overview_forbidden(sessions):
    tc1_tok, _ = sessions["tc1"]
    r = requests.get(f"{API}/admin/lead-stats-overview", headers=_h(tc1_tok), timeout=30)
    assert r.status_code == 403


# ────────────────────────────────────────────────────────────────
# Test 2: tc-performance-range
# ────────────────────────────────────────────────────────────────
def test_admin_tc_performance_range(sessions):
    admin_tok, _ = sessions["admin"]
    from datetime import date, timedelta
    to_d = date.today()
    from_d = to_d - timedelta(days=30)
    r = requests.get(
        f"{API}/admin/tc-performance-range",
        headers=_h(admin_tok),
        params={"from_date": from_d.isoformat(), "to_date": to_d.isoformat()},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "rows" in d and isinstance(d["rows"], list)
    assert "totals" in d
    assert d.get("range_from") == from_d.isoformat()
    assert d.get("range_to") == to_d.isoformat()
    if d["rows"]:
        row = d["rows"][0]
        for k in ("telecaller_id", "telecaller_name", "leads_given", "orders",
                  "qty", "revenue", "conversion_pct", "tier"):
            assert k in row, f"missing {k} in {row}"
        assert row["tier"] in ("high", "medium", "under", "no_leads")


def test_tc_performance_range_forbidden(sessions):
    tc1_tok, _ = sessions["tc1"]
    r = requests.get(f"{API}/admin/tc-performance-range", headers=_h(tc1_tok), timeout=30)
    assert r.status_code == 403


def test_tc_performance_range_bad_date(sessions):
    admin_tok, _ = sessions["admin"]
    r = requests.get(f"{API}/admin/tc-performance-range?from_date=nope",
                     headers=_h(admin_tok), timeout=30)
    assert r.status_code == 400


# ────────────────────────────────────────────────────────────────
# Test 3: create_lead 409 for prior order by another TC
# Test 4: cross-dashboard cleanup on order creation
# Test 5: mark-order-by-other-tc
# ────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def three_tc_leads(sessions, unique_phone):
    """Create TEST_ leads for TC1/TC2/TC3 with same phone.
    Direct mongo insert bypasses the API's dupe check (that's exactly the
    real-world state this feature is designed to clean up)."""
    admin_tok, _ = sessions["admin"]
    _tc1_tok, tc1_u = sessions["tc1"]
    _tc2_tok, tc2_u = sessions["tc2"]
    _tc3_tok, tc3_u = sessions["tc3"]

    p10 = unique_phone[-10:]
    now_iso = datetime.now(timezone.utc).isoformat()
    lead_ids = {}
    for tc_key, assignee, name in [
        ("tc1", tc1_u["id"], tc1_u.get("name", "TC1")),
        ("tc2", tc2_u["id"], tc2_u.get("name", "TC2")),
        ("tc3", tc3_u["id"], tc3_u.get("name", "TC3")),
    ]:
        lid = f"lead-TEST-{uuid.uuid4().hex[:8]}"
        _db.leads.insert_one({
            "id": lid,
            "phone_number": p10,
            "phone_number_norm": p10,
            "name": f"TEST_iter66_{tc_key}",
            "source": "TEST_iter66",
            "status": "new",
            "assigned_to": assignee,
            "assigned_to_name": name,
            "product_interest": "general",
            "call_logs": [],
            "created_at": now_iso,
            "updated_at": now_iso,
            "deleted": False,
        })
        lead_ids[tc_key] = lid
    yield lead_ids, p10
    # Teardown — clean up TEST leads
    _db.leads.delete_many({"id": {"$in": list(lead_ids.values())}})


def test_create_lead_prior_order_409(sessions, three_tc_leads):
    """After TC1 places an order on the phone, TC2 adding a lead with same phone must 409."""
    lead_ids, p10 = three_tc_leads
    tc1_tok, tc1_u = sessions["tc1"]
    tc2_tok, _ = sessions["tc2"]

    # If TC1 does not own a lead skip
    if not lead_ids.get("tc1"):
        pytest.skip("Could not seed TC1 lead")

    # TC1 places order on this phone
    order_payload = {
        "lead_id": lead_ids["tc1"],
        "customer_name": "TEST_iter66_cust",
        "customer_phone": p10,
        "customer_address": "TEST addr",
        "customer_city": "TCity",
        "customer_state": "TState",
        "customer_pincode": "560001",
        "items": [{"product_id": "prod-any", "product_name": "TESTITEM",
                    "quantity": 1, "price": 100.0}],
        "total_amount": 100.0,
        "payment_type": "cod",
    }
    r_order = requests.post(f"{API}/orders", headers=_h(tc1_tok), json=order_payload, timeout=30)
    assert r_order.status_code in (200, 201), f"order create failed: {r_order.status_code} {r_order.text[:300]}"
    resp = r_order.json()
    o = resp.get("order", resp)  # unwrap {"order": ..., "message": ...}
    # Store for next tests
    pytest.iter66_order = o
    pytest.iter66_p10 = p10
    pytest.iter66_lead_ids = lead_ids

    # Now TC2 attempts to add a fresh lead with same phone → expect 409
    # But TC2 might not have permission to POST /api/leads (usually admin/SM);
    # let's use admin as a different creator instead: prior_order.created_by
    # is TC1, admin != TC1 so should 409.
    admin_tok, _ = sessions["admin"]
    r2 = requests.post(f"{API}/leads", headers=_h(admin_tok),
                       json={"phone_number": p10, "name": "TEST_dup_after_order",
                             "assigned_to": sessions["tc2"][1]["id"],
                             "source": "TEST"}, timeout=30)
    assert r2.status_code == 409, f"expected 409, got {r2.status_code} {r2.text[:200]}"
    assert "already placed" in r2.text.lower() or "order" in r2.text.lower()


def test_cross_dashboard_cleanup(sessions):
    """TC2 and TC3 leads should now be soft-deleted with dedupe_merged_into set."""
    o = getattr(pytest, "iter66_order", None)
    lead_ids = getattr(pytest, "iter66_lead_ids", None)
    if o is None or lead_ids is None:
        pytest.skip("prior order test did not run")
    # Order response should include cross_dashboard_cleanup
    ccd = o.get("cross_dashboard_cleanup")
    assert ccd is not None, f"missing cross_dashboard_cleanup in order response: {list(o.keys())}"
    assert ccd.get("removed_leads", 0) >= 1
    tc1_u = sessions["tc1"][1]
    assert ccd.get("reassigned_to") == tc1_u["id"]

    # Verify: fetch TC2's lead as admin — should be deleted=True and dedupe_merged_into set
    admin_tok, _ = sessions["admin"]
    for tc_key in ("tc2", "tc3"):
        lid = lead_ids.get(tc_key)
        if not lid:
            continue
        # There's no direct GET /leads/{id}; use search endpoint
        r = requests.get(f"{API}/leads/{lid}", headers=_h(admin_tok), timeout=30)
        # If not implemented, use admin all-leads list including deleted
        if r.status_code == 404:
            # try admin list with include_deleted
            r2 = requests.get(f"{API}/admin/leads?include_deleted=true",
                              headers=_h(admin_tok), timeout=30)
            found = None
            if r2.status_code == 200:
                for lead in (r2.json() if isinstance(r2.json(), list) else r2.json().get("leads", [])):
                    if lead.get("id") == lid:
                        found = lead; break
            assert found is not None, f"could not fetch {tc_key} lead {lid}"
            assert found.get("deleted") is True
            assert found.get("dedupe_merged_into")
        else:
            assert r.status_code == 200, r.text
            lead = r.json()
            lead = lead.get("lead", lead)  # unwrap wrapper
            assert lead.get("deleted") is True, f"{tc_key} lead not deleted: {lead}"
            assert lead.get("dedupe_merged_into"), f"{tc_key} lead missing dedupe_merged_into"


def test_mark_order_by_other_tc(sessions):
    """Fresh scenario: create a lead for TC2, TC2 calls mark-order-by-other-tc → soft-deleted."""
    admin_tok, _ = sessions["admin"]
    tc2_tok, tc2_u = sessions["tc2"]
    tc1_tok, _ = sessions["tc1"]
    # unique phone (new)
    phone = "9" + str(uuid.uuid4().int)[-9:]
    r = _admin_create_lead(admin_tok, phone, tc2_u["id"], name="TEST_mark_other")
    assert r.status_code in (200, 201), r.text
    lead_id = r.json().get("id") or r.json().get("lead_id") or (r.json().get("lead") or {}).get("id")
    assert lead_id

    # Non-owner (TC1) → 403
    r_forbid = requests.post(f"{API}/leads/{lead_id}/mark-order-by-other-tc",
                              headers=_h(tc1_tok),
                              json={"other_tc_name": "Someone"}, timeout=30)
    assert r_forbid.status_code == 403

    # Missing other_tc_name → 400
    r_bad = requests.post(f"{API}/leads/{lead_id}/mark-order-by-other-tc",
                          headers=_h(tc2_tok), json={}, timeout=30)
    assert r_bad.status_code == 400

    # Happy path
    r_ok = requests.post(f"{API}/leads/{lead_id}/mark-order-by-other-tc",
                         headers=_h(tc2_tok),
                         json={"other_tc_name": "Rahul (TC1)"}, timeout=30)
    assert r_ok.status_code == 200, r_ok.text
    body = r_ok.json()
    assert body.get("credit_to") == "Rahul (TC1)"

    # Verify persistence via admin list
    r_list = requests.get(f"{API}/admin/leads?include_deleted=true",
                          headers=_h(admin_tok), timeout=30)
    lead = None
    if r_list.status_code == 200:
        leads = r_list.json() if isinstance(r_list.json(), list) else r_list.json().get("leads", [])
        for L in leads:
            if L.get("id") == lead_id:
                lead = L; break
    if lead is None:
        # fallback: direct fetch
        r_g = requests.get(f"{API}/leads/{lead_id}", headers=_h(admin_tok), timeout=30)
        if r_g.status_code == 200:
            body = r_g.json()
            lead = body.get("lead", body)
    assert lead is not None, f"could not re-fetch lead {lead_id}"
    assert lead.get("deleted") is True
    assert "another tc" in (lead.get("deleted_reason") or "").lower()
    assert lead.get("removed_credit_to") == "Rahul (TC1)"


# Cleanup: nothing hard — soft-deletes only; nothing more to delete.
