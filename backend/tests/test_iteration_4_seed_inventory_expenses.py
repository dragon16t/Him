"""
Iteration 4 backend tests:
  - New seed products (5 singles + 3 combos) with exact names/slugs/prices
  - Inventory deduction on SM approval (combo deducts children; combo's own stock untouched)
  - Commission expense logged into db.expenses on approval (id=comm-{oid}, status=reserved)
  - Withdraw payout expense logged into db.expenses on HR mark-paid (id=wd-{wid}, status=paid)
  - GET /api/sales-manager/withdraw-requests RBAC (SM scoping; admin sees all; telecaller 403)
  - Smoke regression for store endpoints / agent CRUD / razorpay verify endpoint
"""
import os, uuid, pytest, requests
from pathlib import Path
from pymongo import MongoClient

# Load frontend/.env for REACT_APP_BACKEND_URL
_env = Path("/app/frontend/.env")
if _env.exists():
    for line in _env.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            os.environ.setdefault("REACT_APP_BACKEND_URL", line.split("=", 1)[1].strip().strip('"'))
            break
_benv = Path("/app/backend/.env")
if _benv.exists():
    for line in _benv.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

AGENT_SLUG = "priya-influencer-3"
AGENT_USERNAME = "priya-influencer-3"
AGENT_PW = "priya123"
EXPECTED = [
    ("p-cleanser", "gentle-cleanser", 299, 399, False),
    ("p-sunscreen", "daily-defense-sunscreen", 399, 499, False),
    ("p-eye-cream", "caffeine-under-eye-cream", 349, 449, False),
    ("p-night-cream", "advanced-retinoid-night-cream", 499, 599, False),
    ("p-serum", "advanced-face-serum", 449, 549, False),
    ("c-anti-aging-kit", "complete-anti-aging-kit", 1899, 2499, True),
    ("c-day-routine", "day-routine-combo", 999, 1347, True),
    ("c-night-routine", "night-routine-combo", 1099, 1447, True),
]

# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "admin@celestaglow.com", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def sm_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "salesmanager@celestaglow.com", "password": "sm123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def hr_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "hrmanager@celestaglow.com", "password": "hr123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def tc_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "telecaller1@celestaglow.com", "password": "tc123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def agent_token():
    r = requests.post(f"{BASE}/api/store-agent/login",
                      json={"username": AGENT_USERNAME, "password": AGENT_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------------- Seed products ----------------
class TestSeedProducts:
    def test_store_products_returns_8_correct_items(self):
        r = requests.get(f"{BASE}/api/store/{AGENT_SLUG}/products", timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()["products"]
        # Filter only active items
        items = [i for i in items if i.get("active", True)]
        assert len(items) == 8, f"Expected 8 products got {len(items)}: {[i['id'] for i in items]}"

        by_id = {i["id"]: i for i in items}
        for pid, slug, price, mrp, is_combo in EXPECTED:
            assert pid in by_id, f"Missing {pid}"
            p = by_id[pid]
            assert p["slug"] == slug, f"{pid} slug={p['slug']} expected {slug}"
            assert p["price"] == price, f"{pid} price={p['price']} expected {price}"
            assert p["mrp"] == mrp, f"{pid} mrp={p['mrp']} expected {mrp}"
            assert bool(p.get("is_combo")) == is_combo

    def test_anti_aging_kit_combo_items_correct(self):
        r = requests.get(f"{BASE}/api/store/{AGENT_SLUG}/products", timeout=15)
        items = {i["id"]: i for i in r.json()["products"]}
        kit = items["c-anti-aging-kit"]
        assert kit["combo_items"] == ["p-cleanser", "p-sunscreen", "p-eye-cream", "p-night-cream", "p-serum"]
        assert "Anti-Aging" in kit["name"]


# ---------------- Inventory deduction + commission expense ----------------
class TestInventoryAndExpense:
    def test_order_approve_deducts_inventory_and_logs_expense(self, sm_token, db):
        database = db
        # Snapshot stocks
        snap = {}
        for pid in ["p-cleanser", "p-sunscreen", "p-eye-cream", "p-night-cream", "p-serum", "c-anti-aging-kit"]:
            p = database.store_products.find_one({"id": pid})
            snap[pid] = p["stock"]

        # Place order: 1x p-cleanser + 1x c-anti-aging-kit
        payload = {
            "items": [{"id": "p-cleanser", "qty": 1}, {"id": "c-anti-aging-kit", "qty": 1}],
            "customer_name": "TEST_Inv_Customer",
            "customer_phone": "9999000111",
            "address": "TEST 12 Main",
            "city": "Mumbai", "state": "MH", "pincode": "400001",
            "payment_method": "cod",
        }
        r = requests.post(f"{BASE}/api/store/{AGENT_SLUG}/order", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        oid = r.json()["order_id"]

        # SM approve
        r = requests.post(f"{BASE}/api/sales-manager/agent-orders/{oid}/approve",
                          headers={"Authorization": f"Bearer {sm_token}"}, timeout=20)
        assert r.status_code == 200, r.text

        # Verify stock decrements
        after = {}
        for pid in snap:
            p = database.store_products.find_one({"id": pid})
            after[pid] = p["stock"]

        # p-cleanser: 1 (single) + 1 (from kit) = -2
        assert after["p-cleanser"] == snap["p-cleanser"] - 2, f"cleanser {snap['p-cleanser']}->{after['p-cleanser']}"
        # Each of the other 4 from the kit: -1
        for pid in ["p-sunscreen", "p-eye-cream", "p-night-cream", "p-serum"]:
            assert after[pid] == snap[pid] - 1, f"{pid} {snap[pid]}->{after[pid]}"
        # Combo's own stock NOT decremented
        assert after["c-anti-aging-kit"] == snap["c-anti-aging-kit"], \
            f"combo stock should be unchanged {snap['c-anti-aging-kit']}->{after['c-anti-aging-kit']}"

        # Commission expense logged
        exp = database.expenses.find_one({"id": f"comm-{oid}"})
        assert exp is not None, f"expense comm-{oid} not found"
        assert exp["type"] == "agent_commission"
        assert exp["status"] == "reserved"
        assert exp["order_id"] == oid
        # commission_amount: subtotal = 299 + 1899 = 2198, pct from agent (priya 10 default)
        # We don't hardcode pct; just check >0
        assert exp["amount"] > 0

        # store oid for later cleanup
        TestInventoryAndExpense.last_oid = oid

    def test_cleanup_inventory_test(self, db):
        """Restore inventory & remove the test expense / order to keep DB clean."""
        database = db
        oid = getattr(TestInventoryAndExpense, "last_oid", None)
        if not oid:
            pytest.skip("nothing to clean")
        # Re-increment stocks
        for pid, delta in [("p-cleanser", 2), ("p-sunscreen", 1), ("p-eye-cream", 1),
                           ("p-night-cream", 1), ("p-serum", 1)]:
            database.store_products.update_one({"id": pid}, {"$inc": {"stock": delta}})
        database.expenses.delete_one({"id": f"comm-{oid}"})
        database.agent_orders.delete_one({"id": oid})
        database.orders.delete_one({"id": oid})


# ---------------- Withdraw payout expense ----------------
class TestPayoutExpense:
    def test_mark_paid_logs_payout_expense(self, agent_token, hr_token, db, sm_token):
        database = db
        # Ensure agent has commission balance: create+approve a small order
        order_payload = {
            "items": [{"id": "p-cleanser", "qty": 1}],
            "customer_name": "TEST_Wd_Customer", "customer_phone": "9999000222",
            "address": "TEST a", "city": "M", "state": "MH", "pincode": "400001",
            "payment_method": "cod",
        }
        r = requests.post(f"{BASE}/api/store/{AGENT_SLUG}/order", json=order_payload, timeout=15)
        assert r.status_code == 200
        oid = r.json()["order_id"]
        requests.post(f"{BASE}/api/sales-manager/agent-orders/{oid}/approve",
                      headers={"Authorization": f"Bearer {sm_token}"}, timeout=15)

        # Agent creates a tiny withdraw request
        r = requests.post(f"{BASE}/api/store-agent/withdraw-request",
                          headers={"Authorization": f"Bearer {agent_token}"},
                          json={"amount": 1, "method": "gpay"}, timeout=15)
        assert r.status_code == 200, r.text
        wid = r.json()["request"]["id"]

        # HR mark paid with transaction_ref
        r = requests.post(f"{BASE}/api/hr/withdraw-requests/{wid}/paid",
                          headers={"Authorization": f"Bearer {hr_token}"},
                          json={"transaction_ref": "TEST_TXN_REF_001"}, timeout=15)
        assert r.status_code == 200, r.text

        # Expense logged
        exp = database.expenses.find_one({"id": f"wd-{wid}"})
        assert exp is not None, f"expense wd-{wid} missing"
        assert exp["type"] == "agent_payout"
        assert exp["status"] == "paid"
        assert exp["amount"] == 1
        assert exp.get("paid_by")
        assert exp.get("transaction_ref") == "TEST_TXN_REF_001"

        # cleanup
        database.expenses.delete_one({"id": f"wd-{wid}"})
        database.expenses.delete_one({"id": f"comm-{oid}"})
        database.withdraw_requests.delete_one({"id": wid})
        database.agent_orders.delete_one({"id": oid})
        database.orders.delete_one({"id": oid})
        # restore stock
        database.store_products.update_one({"id": "p-cleanser"}, {"$inc": {"stock": 1}})


# ---------------- SM withdraw read-only endpoint ----------------
class TestSMWithdrawList:
    def test_sm_sees_only_their_agents_requests(self, sm_token, db):
        database = db
        # The seeded priya agent has sales_manager_id=sm-001. Check sm_token user id matches.
        r = requests.get(f"{BASE}/api/sales-manager/withdraw-requests",
                         headers={"Authorization": f"Bearer {sm_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        reqs = r.json()["requests"]
        # All returned requests' agents must belong to this SM
        sm_me = requests.get(f"{BASE}/api/auth/me",
                             headers={"Authorization": f"Bearer {sm_token}"}, timeout=15).json()
        sm_id = sm_me.get("id")
        for w in reqs:
            ag = database.store_agents.find_one({"id": w["agent_id"]})
            assert ag is not None
            assert ag.get("sales_manager_id") == sm_id, f"withdraw {w['id']} agent SM mismatch"

    def test_admin_sees_all(self, admin_token):
        r = requests.get(f"{BASE}/api/sales-manager/withdraw-requests",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert "requests" in r.json()

    def test_telecaller_forbidden(self, tc_token):
        r = requests.get(f"{BASE}/api/sales-manager/withdraw-requests",
                         headers={"Authorization": f"Bearer {tc_token}"}, timeout=15)
        assert r.status_code == 403


# ---------------- Smoke regression ----------------
class TestSmoke:
    def test_store_meta_ok(self):
        r = requests.get(f"{BASE}/api/store/{AGENT_SLUG}/meta", timeout=15)
        assert r.status_code == 200
        assert r.json()["agent"]["slug"] == AGENT_SLUG

    def test_product_detail_ok(self):
        r = requests.get(f"{BASE}/api/store/{AGENT_SLUG}/product/gentle-cleanser", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == "p-cleanser"

    def test_sm_list_agents_ok(self, sm_token):
        r = requests.get(f"{BASE}/api/sales-manager/agents",
                         headers={"Authorization": f"Bearer {sm_token}"}, timeout=15)
        assert r.status_code == 200
        assert "agents" in r.json()

    def test_agent_me_no_password_hash(self, agent_token):
        r = requests.get(f"{BASE}/api/store-agent/me",
                         headers={"Authorization": f"Bearer {agent_token}"}, timeout=15)
        assert r.status_code == 200
        agent = r.json()["agent"]
        # Regression note from iter1: password_hash should be stripped
        assert "password_hash" not in agent, "password_hash leaks in /store-agent/me"

    def test_razorpay_verify_invalid_signature_400(self):
        # Place a COD order, then call verify with bogus signature → 400 (signature check fails)
        r = requests.post(f"{BASE}/api/store/{AGENT_SLUG}/order", json={
            "items": [{"id": "p-serum", "qty": 1}],
            "customer_name": "TEST_Rzp", "customer_phone": "9999000333",
            "address": "TEST", "city": "M", "state": "MH", "pincode": "400001",
            "payment_method": "cod",
        }, timeout=15)
        assert r.status_code == 200
        oid = r.json()["order_id"]
        r2 = requests.post(f"{BASE}/api/store/{AGENT_SLUG}/order/verify", json={
            "order_id": oid,
            "razorpay_order_id": "order_BOGUS",
            "razorpay_payment_id": "pay_BOGUS",
            "razorpay_signature": "deadbeef",
        }, timeout=15)
        assert r2.status_code == 400
