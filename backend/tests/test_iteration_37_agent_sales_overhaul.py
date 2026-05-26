"""
Iteration 37 — Agent Sales Overhaul backend tests
Covers:
  * SM agent create (gpay_number, custom username/password, HR sync)
  * SM agent update (gpay, username, new_password)
  * SM agents window stats (today/last7/last30/month/all + summary)
  * Withdraw flow: agent create / list / HR approve / reject / paid
  * Track Order (privacy: no commission fields)
  * Product stats
  * Razorpay order create (live key configured) + signature verify (negative)
  * Regression: agent portal me/stats/orders/customers
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = "http://localhost:8001"
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@celestaglow.com", "password": "admin123"}
SM = {"email": "salesmanager@celestaglow.com", "password": "sm123"}
HR = {"email": "hrmanager@celestaglow.com", "password": "hr123"}
TC = {"email": "telecaller1@celestaglow.com", "password": "tc123"}
AGENT = {"username": "priya-influencer-3", "password": "priya123"}
AGENT_SLUG = "priya-influencer-3"

mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
db = mongo[os.environ.get("DB_NAME", "test_database")]


# -------------------- fixtures --------------------
def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def sm_token():
    return _login(SM)


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def hr_token():
    return _login(HR)


@pytest.fixture(scope="session")
def tc_token():
    return _login(TC)


@pytest.fixture(scope="session")
def agent_token():
    r = requests.post(f"{API}/store-agent/login", json=AGENT, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def created_agent(sm_token):
    """Create a TEST_ agent for use in multiple tests."""
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "name": f"TEST Agent {suffix}",
        "phone": f"99999{suffix[:5]}",
        "email": f"test_{suffix}@example.com",
        "designation": "influencer",
        "commission_pct": 12,
        "region": "Bangalore",
        "gpay_number": "9876543210",
        "username": f"testuser_{suffix}",
        "password": f"pw_{suffix}",
    }
    r = requests.post(f"{API}/sales-manager/agents", json=payload,
                       headers={"Authorization": f"Bearer {sm_token}"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()["agent"]
    yield {"payload": payload, "agent": body}
    # cleanup
    try:
        requests.delete(f"{API}/sales-manager/agents/{body['id']}",
                         headers={"Authorization": f"Bearer {sm_token}"}, timeout=15)
        db.store_agents.delete_one({"id": body["id"]})
        db.hr_external_agents.delete_one({"agent_id": body["id"]})
        db.withdraw_requests.delete_many({"agent_id": body["id"]})
    except Exception:
        pass


# -------------------- SM CREATE AGENT --------------------
class TestSMAgentCreate:
    def test_create_with_custom_credentials_and_gpay(self, created_agent):
        body = created_agent["agent"]
        payload = created_agent["payload"]
        assert body["gpay_number"] == "9876543210"
        assert body["username"] == payload["username"]
        # initial_password must be the password we sent
        assert body["initial_password"] == payload["password"]
        assert body["designation"] == "influencer"
        assert body["commission_pct"] == 12

    def test_hr_external_agents_sync(self, created_agent):
        body = created_agent["agent"]
        doc = db.hr_external_agents.find_one({"agent_id": body["id"]})
        assert doc is not None, "Agent not synced to hr_external_agents"
        assert doc["gpay_number"] == "9876543210"
        assert doc["type"] == "external_agent"
        assert doc["name"] == body["name"]

    def test_login_with_custom_password(self, created_agent):
        payload = created_agent["payload"]
        r = requests.post(f"{API}/store-agent/login",
                           json={"username": payload["username"], "password": payload["password"]},
                           timeout=15)
        assert r.status_code == 200, r.text
        assert "token" in r.json()


# -------------------- SM UPDATE AGENT --------------------
class TestSMAgentUpdate:
    def test_update_gpay_username_and_password(self, sm_token, created_agent):
        body = created_agent["agent"]
        new_user = f"renamed_{uuid.uuid4().hex[:6]}"
        new_pw = f"newpw_{uuid.uuid4().hex[:6]}"
        r = requests.patch(
            f"{API}/sales-manager/agents/{body['id']}",
            json={"gpay_number": "1112223333", "username": new_user, "new_password": new_pw},
            headers={"Authorization": f"Bearer {sm_token}"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        # verify by DB
        doc = db.store_agents.find_one({"id": body["id"]})
        assert doc["gpay_number"] == "1112223333"
        assert doc["username"] == new_user
        # login with new password
        rl = requests.post(f"{API}/store-agent/login",
                            json={"username": new_user, "password": new_pw}, timeout=15)
        assert rl.status_code == 200, rl.text

    def test_update_username_collision(self, sm_token, created_agent):
        # try to take 'priya-influencer-3' which already exists
        body = created_agent["agent"]
        r = requests.patch(
            f"{API}/sales-manager/agents/{body['id']}",
            json={"username": AGENT_SLUG},
            headers={"Authorization": f"Bearer {sm_token}"}, timeout=15,
        )
        assert r.status_code == 400, r.text


# -------------------- SM LIST AGENTS WINDOW --------------------
class TestSMAgentsWindow:
    @pytest.mark.parametrize("window", ["today", "last7", "last30", "month", "all"])
    def test_window_returns_summary_and_window_fields(self, sm_token, window):
        r = requests.get(f"{API}/sales-manager/agents?window={window}",
                          headers={"Authorization": f"Bearer {sm_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["window"] == window
        assert "summary" in body
        s = body["summary"]
        for k in ("total_agents", "total_orders", "total_revenue", "total_commission"):
            assert k in s, f"summary missing {k}"
        # agents list shape
        if body["agents"]:
            a = body["agents"][0]
            for k in ("window_orders", "window_revenue", "window_commission"):
                assert k in a, f"agent missing {k}"


# -------------------- WITHDRAW REQUEST FLOW --------------------
class TestWithdrawFlow:
    def test_withdraw_amount_must_be_positive(self, agent_token):
        r = requests.post(f"{API}/store-agent/withdraw-request",
                           json={"amount": 0},
                           headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 400

    def test_withdraw_exceeds_balance_returns_400(self, agent_token):
        # use insanely large amount, should always exceed
        r = requests.post(f"{API}/store-agent/withdraw-request",
                           json={"amount": 99999999},
                           headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 400
        assert "exceeds" in r.text.lower() or "available" in r.text.lower()

    def test_agent_list_withdraws_returns_balance_object(self, agent_token):
        r = requests.get(f"{API}/store-agent/withdraw-requests",
                          headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "requests" in body and isinstance(body["requests"], list)
        bal = body["balance"]
        for k in ("earned", "paid", "pending", "available"):
            assert k in bal

    def test_full_withdraw_lifecycle(self, agent_token, hr_token):
        """Seed earned commission, create request, HR approve, mark paid, ensure balance drops."""
        # find priya-influencer-3 agent id
        ag = db.store_agents.find_one({"slug": AGENT_SLUG})
        agent_id = ag["id"]

        # Seed a fake delivered order with commission so balance > amount
        seed_oid = "ord-test-" + uuid.uuid4().hex[:8]
        seed_doc = {
            "id": seed_oid, "agent_id": agent_id, "agent_slug": AGENT_SLUG,
            "status": "delivered", "total": 1000, "commission_amount": 100.0,
            "commission_pct": 10, "items": [],
            "created_at": "2026-01-01T00:00:00+00:00",
            "customer_phone": "TEST_PRIVACY_PHONE",
            "customer_name": "TEST Privacy", "address": "x", "_seed_for_test": True,
        }
        db.agent_orders.insert_one(seed_doc)
        try:
            # get balance to compute available
            rb = requests.get(f"{API}/store-agent/withdraw-requests",
                              headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
            available = rb.json()["balance"]["available"]
            req_amt = min(50.0, max(1.0, available - 1.0))
            assert available >= req_amt, f"Not enough seeded balance: avail={available}"

            # Create withdraw request
            cr = requests.post(f"{API}/store-agent/withdraw-request",
                                json={"amount": req_amt, "method": "gpay", "note": "TEST"},
                                headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
            assert cr.status_code == 200, cr.text
            wid = cr.json()["request"]["id"]

            # HR list (should include it)
            hl = requests.get(f"{API}/hr/withdraw-requests",
                               headers={"Authorization": f"Bearer {hr_token}"}, timeout=15)
            assert hl.status_code == 200
            assert any(r["id"] == wid for r in hl.json()["requests"])

            # HR approve
            ap = requests.post(f"{API}/hr/withdraw-requests/{wid}/approve",
                                json={},
                                headers={"Authorization": f"Bearer {hr_token}"}, timeout=15)
            assert ap.status_code == 200, ap.text
            wr = db.withdraw_requests.find_one({"id": wid})
            assert wr["status"] == "approved"
            assert wr.get("approved_at") and wr.get("approved_by")

            # HR mark paid
            pd = requests.post(f"{API}/hr/withdraw-requests/{wid}/paid",
                                json={"transaction_ref": "TXN-TEST-123"},
                                headers={"Authorization": f"Bearer {hr_token}"}, timeout=15)
            assert pd.status_code == 200, pd.text
            wr2 = db.withdraw_requests.find_one({"id": wid})
            assert wr2["status"] == "paid"
            assert wr2.get("transaction_ref") == "TXN-TEST-123"

            # Balance available should have decreased
            rb2 = requests.get(f"{API}/store-agent/withdraw-requests",
                                headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
            paid_after = rb2.json()["balance"]["paid"]
            assert paid_after >= req_amt, f"Paid balance did not increase: {paid_after}"
        finally:
            db.agent_orders.delete_one({"id": seed_oid})
            db.withdraw_requests.delete_many({"note": "TEST"})

    def test_hr_reject_with_reason(self, agent_token, hr_token):
        ag = db.store_agents.find_one({"slug": AGENT_SLUG})
        agent_id = ag["id"]
        seed_oid = "ord-test-" + uuid.uuid4().hex[:8]
        db.agent_orders.insert_one({
            "id": seed_oid, "agent_id": agent_id, "agent_slug": AGENT_SLUG,
            "status": "sm_approved", "total": 500, "commission_amount": 50.0,
            "commission_pct": 10, "items": [],
            "created_at": "2026-01-01T00:00:00+00:00",
            "customer_phone": "x", "customer_name": "x", "address": "x",
        })
        try:
            cr = requests.post(f"{API}/store-agent/withdraw-request",
                                json={"amount": 10, "note": "TEST_REJECT"},
                                headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
            assert cr.status_code == 200, cr.text
            wid = cr.json()["request"]["id"]
            rj = requests.post(f"{API}/hr/withdraw-requests/{wid}/reject",
                                json={"reason": "Insufficient docs"},
                                headers={"Authorization": f"Bearer {hr_token}"}, timeout=15)
            assert rj.status_code == 200, rj.text
            wr = db.withdraw_requests.find_one({"id": wid})
            assert wr["status"] == "rejected"
            assert wr.get("rejection_reason") == "Insufficient docs"
        finally:
            db.agent_orders.delete_one({"id": seed_oid})
            db.withdraw_requests.delete_many({"note": "TEST_REJECT"})

    def test_hr_endpoint_rbac_telecaller_forbidden(self, tc_token):
        r = requests.get(f"{API}/hr/withdraw-requests",
                          headers={"Authorization": f"Bearer {tc_token}"}, timeout=15)
        assert r.status_code == 403, r.text


# -------------------- TRACK ORDER --------------------
class TestTrackOrder:
    def test_track_no_phone_returns_400(self):
        r = requests.post(f"{API}/store/track-order", json={}, timeout=15)
        assert r.status_code == 400

    def test_track_hides_commission_fields(self):
        # seed an order
        ag = db.store_agents.find_one({"slug": AGENT_SLUG})
        seed_oid = "ord-test-" + uuid.uuid4().hex[:8]
        phone = "TEST_PRIV_" + uuid.uuid4().hex[:6]
        db.agent_orders.insert_one({
            "id": seed_oid, "agent_id": ag["id"], "agent_slug": AGENT_SLUG,
            "status": "pending", "total": 200, "commission_amount": 20.0,
            "commission_pct": 10, "items": [],
            "created_at": "2026-01-01T00:00:00+00:00",
            "customer_phone": phone, "customer_name": "TEST", "address": "x",
        })
        try:
            r = requests.post(f"{API}/store/track-order", json={"phone": phone}, timeout=15)
            assert r.status_code == 200, r.text
            orders = r.json()["orders"]
            assert len(orders) == 1
            o = orders[0]
            assert "commission_amount" not in o
            assert "commission_pct" not in o
            assert o["id"] == seed_oid
        finally:
            db.agent_orders.delete_one({"id": seed_oid})


# -------------------- PRODUCT STATS --------------------
class TestProductStats:
    def test_product_stats_shape_and_sort(self, agent_token):
        r = requests.get(f"{API}/store-agent/product-stats",
                          headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        products = r.json()["products"]
        assert isinstance(products, list)
        # Sorted by qty desc
        qtys = [p["qty"] for p in products]
        assert qtys == sorted(qtys, reverse=True)
        # Each has required keys (if non-empty)
        for p in products:
            for k in ("qty", "revenue", "orders"):
                assert k in p


# -------------------- RAZORPAY --------------------
class TestRazorpay:
    def test_razorpay_order_create_returns_payload(self):
        # find an active product
        prod = db.store_products.find_one({"active": True})
        assert prod is not None
        payload = {
            "items": [{"id": prod["id"], "qty": 1}],
            "customer_name": "TEST Buyer",
            "customer_phone": "TEST_RZP_" + uuid.uuid4().hex[:6],
            "customer_email": "test@example.com",
            "address": "TEST Addr",
            "city": "BLR", "state": "KA", "pincode": "560001",
            "payment_method": "razorpay",
        }
        r = requests.post(f"{API}/store/{AGENT_SLUG}/order", json=payload, timeout=30)
        # Razorpay live may return 502 if external issue — treat as soft pass
        if r.status_code == 502:
            pytest.skip(f"Razorpay external error (502): {r.text}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("razorpay") is not None, "razorpay payload missing"
        rzp = body["razorpay"]
        assert rzp.get("order_id", "").startswith("order_"), rzp
        assert rzp.get("key_id") == "rzp_live_SRrQe6jkss6LQD"
        assert rzp.get("amount") == int(body["total"]) * 100
        # cleanup
        db.agent_orders.delete_one({"id": body["order_id"]})

    def test_invalid_signature_returns_400(self):
        # Pick any order (create a tiny dummy with razorpay_order_id)
        oid = "ord-test-" + uuid.uuid4().hex[:8]
        db.agent_orders.insert_one({
            "id": oid, "agent_id": "x", "agent_slug": AGENT_SLUG,
            "status": "pending", "total": 100, "items": [],
            "razorpay_order_id": "order_FAKE_TEST", "payment_status": "pending",
        })
        try:
            r = requests.post(
                f"{API}/store/{AGENT_SLUG}/order/verify",
                json={
                    "order_id": oid,
                    "razorpay_order_id": "order_FAKE_TEST",
                    "razorpay_payment_id": "pay_FAKE",
                    "razorpay_signature": "deadbeef" * 8,
                }, timeout=15,
            )
            assert r.status_code == 400, r.text
            assert "signature" in r.text.lower()
        finally:
            db.agent_orders.delete_one({"id": oid})


# -------------------- AGENT PORTAL REGRESSION --------------------
class TestAgentPortalRegression:
    def test_me(self, agent_token):
        r = requests.get(f"{API}/store-agent/me",
                          headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["agent"]["slug"] == AGENT_SLUG

    def test_stats(self, agent_token):
        r = requests.get(f"{API}/store-agent/stats",
                          headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 200

    def test_orders(self, agent_token):
        r = requests.get(f"{API}/store-agent/orders",
                          headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 200

    def test_customers(self, agent_token):
        r = requests.get(f"{API}/store-agent/customers",
                          headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 200
