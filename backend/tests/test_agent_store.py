"""
Backend tests for Agent Store module (storefront + agent portal + SM agent CRUD + admin store).
Covers the brand-new endpoints mounted via init_agent_store in server.py (line ~8092).
Pre-existing CRM endpoints are NOT tested here.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@celestaglow.com"
ADMIN_PASS = "admin123"
SM_EMAIL = "salesmanager@celestaglow.com"
SM_PASS = "sm123"


# ---------- shared session / fixtures ----------
@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(http, email, password):
    r = http.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token(http):
    return _login(http, ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="session")
def sm_token(http):
    return _login(http, SM_EMAIL, SM_PASS)


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# We collect ids created during this run for downstream tests and cleanup
state = {}


# =====================================================================
# 1. SM agent CRUD
# =====================================================================
class TestSMAgentCRUD:
    def test_create_agent_as_sm(self, http, sm_token):
        unique = f"TestAgent-{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique,
            "phone": "9999000111",
            "email": f"test_{uuid.uuid4().hex[:6]}@celestaglow.com",
            "designation": "influencer",
            "commission_pct": 12,
        }
        r = http.post(f"{API}/sales-manager/agents", json=payload, headers=_h(sm_token), timeout=15)
        assert r.status_code == 200, r.text
        a = r.json()["agent"]
        assert a["name"] == unique
        assert a["designation"] == "influencer"
        assert a["commission_pct"] == 12
        assert a["slug"] and a["username"] == a["slug"]
        assert a.get("initial_password"), "initial_password must be returned"
        assert a.get("store_url", "").startswith("/store/")
        state["agent_id"] = a["id"]
        state["agent_slug"] = a["slug"]
        state["agent_username"] = a["username"]
        state["agent_password"] = a["initial_password"]
        state["agent_name"] = unique

    def test_create_agent_unique_slug(self, http, sm_token):
        # Same name as above to force foo-2 path
        payload = {"name": state["agent_name"], "phone": "9999000112", "designation": "agent"}
        r = http.post(f"{API}/sales-manager/agents", json=payload, headers=_h(sm_token), timeout=15)
        assert r.status_code == 200, r.text
        a = r.json()["agent"]
        assert a["slug"] != state["agent_slug"], "duplicate-name should produce different slug"
        assert a["slug"].startswith(state["agent_slug"]), f"expected suffix variant, got {a['slug']}"
        state["agent2_id"] = a["id"]
        state["agent2_slug"] = a["slug"]

    def test_create_invalid_designation(self, http, sm_token):
        r = http.post(f"{API}/sales-manager/agents",
                      json={"name": "BadOne", "phone": "1", "designation": "ceo"},
                      headers=_h(sm_token), timeout=15)
        assert r.status_code == 400

    def test_create_missing_fields(self, http, sm_token):
        r = http.post(f"{API}/sales-manager/agents",
                      json={"name": "OnlyName"},
                      headers=_h(sm_token), timeout=15)
        assert r.status_code == 400

    def test_list_agents_scoped(self, http, sm_token):
        r = http.get(f"{API}/sales-manager/agents", headers=_h(sm_token), timeout=15)
        assert r.status_code == 200
        ags = r.json()["agents"]
        ids = [a["id"] for a in ags]
        assert state["agent_id"] in ids
        # Stat fields present
        a = next(x for x in ags if x["id"] == state["agent_id"])
        for k in ("total_orders", "total_revenue", "total_commission"):
            assert k in a
        # No password_hash leak
        assert "password_hash" not in a

    def test_patch_agent_new_password(self, http, sm_token):
        new_pw = "Newpass!23"
        r = http.patch(f"{API}/sales-manager/agents/{state['agent_id']}",
                       json={"new_password": new_pw, "phone": "8888777666"},
                       headers=_h(sm_token), timeout=15)
        assert r.status_code == 200, r.text
        # Login with new password should work
        lg = http.post(f"{API}/store-agent/login",
                       json={"username": state["agent_username"], "password": new_pw}, timeout=15)
        assert lg.status_code == 200, lg.text
        state["agent_password"] = new_pw
        state["agent_jwt"] = lg.json()["token"]

    def test_patch_other_sm_agent_forbidden(self, http, admin_token):
        # Admin creates an agent under itself
        payload = {"name": f"AdminAg-{uuid.uuid4().hex[:5]}", "phone": "777", "designation": "dealer"}
        r = http.post(f"{API}/sales-manager/agents", json=payload, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        admin_ag_id = r.json()["agent"]["id"]
        state["admin_agent_id"] = admin_ag_id
        # SM tries to edit it
        sm_tok = _login(http, SM_EMAIL, SM_PASS)
        r2 = http.patch(f"{API}/sales-manager/agents/{admin_ag_id}",
                        json={"name": "Hack"}, headers=_h(sm_tok), timeout=15)
        assert r2.status_code == 403, f"expected 403 RBAC isolation, got {r2.status_code}"


# =====================================================================
# 2. Storefront public endpoints
# =====================================================================
class TestStorefront:
    def test_meta_invalid_slug(self, http):
        r = http.get(f"{API}/store/this-slug-does-not-exist-xyz/meta", timeout=15)
        assert r.status_code == 404

    def test_meta_valid_slug(self, http):
        r = http.get(f"{API}/store/{state['agent_slug']}/meta", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["agent"]["slug"] == state["agent_slug"]
        # Secret should NEVER leak in public payload
        assert "razorpay_key_secret" not in (d.get("settings") or {})
        assert d["settings"].get("hero_title")

    def test_products_listing(self, http):
        r = http.get(f"{API}/store/{state['agent_slug']}/products", timeout=15)
        assert r.status_code == 200
        prods = r.json()["products"]
        singles = [p for p in prods if not p.get("is_combo")]
        combos = [p for p in prods if p.get("is_combo")]
        assert len(singles) >= 5, f"expected >=5 single products, got {len(singles)}"
        assert len(combos) >= 3, f"expected >=3 combos, got {len(combos)}"
        # store a product slug for next test
        state["a_product"] = singles[0]
        state["a_combo"] = combos[0]

    def test_product_detail(self, http):
        psl = state["a_product"]["slug"]
        r = http.get(f"{API}/store/{state['agent_slug']}/product/{psl}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["slug"] == psl
        assert "price" in d and "long_desc" in d

    def test_place_order_cod(self, http):
        items = [{"id": state["a_product"]["id"], "qty": 2}]
        price = state["a_product"]["price"]
        payload = {
            "customer_name": "TEST Customer",
            "customer_phone": "9000011122",
            "customer_email": "test_cust@example.com",
            "address": "1 Test Lane",
            "city": "Mumbai", "state": "MH", "pincode": "400001",
            "items": items,
            "payment_method": "cod",
        }
        r = http.post(f"{API}/store/{state['agent_slug']}/order", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["order_id"].startswith("ord-")
        assert d.get("razorpay") in (None, {}), "COD must not return razorpay block"
        state["order_id_cod"] = d["order_id"]
        # subtotal = price*2, shipping rule: >=999 free else 79
        expected_sub = price * 2
        expected_total = expected_sub + (0 if expected_sub >= 999 else 79)
        assert d["total"] == expected_total

    def test_place_order_missing_customer_returns_400(self, http):
        items = [{"id": state["a_product"]["id"], "qty": 1}]
        r = http.post(f"{API}/store/{state['agent_slug']}/order",
                      json={"items": items, "payment_method": "cod"}, timeout=15)
        assert r.status_code == 400

    def test_place_order_razorpay_no_keys_returns_400(self, http):
        items = [{"id": state["a_product"]["id"], "qty": 1}]
        payload = {
            "customer_name": "X", "customer_phone": "1", "address": "a",
            "items": items, "payment_method": "razorpay",
        }
        r = http.post(f"{API}/store/{state['agent_slug']}/order", json=payload, timeout=15)
        assert r.status_code == 400
        assert "configured" in r.text.lower() or "payment" in r.text.lower()

    def test_order_shipping_rule_small_order(self, http):
        # Find a product whose price * 1 < 999 to assert ₹79 shipping
        r = http.get(f"{API}/store/{state['agent_slug']}/products", timeout=15)
        prods = r.json()["products"]
        cheap = next((p for p in prods if not p.get("is_combo") and p["price"] < 999), None)
        if not cheap:
            pytest.skip("no product cheaper than ₹999")
        payload = {
            "customer_name": "TEST Cheap", "customer_phone": "9", "address": "x",
            "items": [{"id": cheap["id"], "qty": 1}], "payment_method": "cod",
        }
        r2 = http.post(f"{API}/store/{state['agent_slug']}/order", json=payload, timeout=15)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["total"] == cheap["price"] + 79, f"expected ₹79 shipping for {cheap['price']}, got total {d['total']}"


# =====================================================================
# 3. Agent portal (store-agent/*)
# =====================================================================
class TestAgentPortal:
    def test_login_bad_creds(self, http):
        r = http.post(f"{API}/store-agent/login",
                      json={"username": state["agent_username"], "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, http):
        tok = state["agent_jwt"]
        r = http.get(f"{API}/store-agent/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        ag = r.json()["agent"]
        assert ag["id"] == state["agent_id"]
        assert "password_hash" not in ag

    def test_stats(self, http):
        tok = state["agent_jwt"]
        r = http.get(f"{API}/store-agent/stats",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_orders", "revenue", "commission", "by_status"):
            assert k in d
        assert d["total_orders"] >= 1  # we placed at least one order

    def test_stats_with_date_filter(self, http):
        tok = state["agent_jwt"]
        # Far past range → should yield 0 orders
        r = http.get(f"{API}/store-agent/stats?date_from=2000-01-01&date_to=2000-12-31",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["total_orders"] == 0

    def test_orders_and_customers(self, http):
        tok = state["agent_jwt"]
        r = http.get(f"{API}/store-agent/orders", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        orders = r.json()["orders"]
        assert any(o["id"] == state["order_id_cod"] for o in orders)
        rc = http.get(f"{API}/store-agent/customers", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert rc.status_code == 200
        custs = rc.json()["customers"]
        assert any(c.get("customer_phone") == "9000011122" for c in custs)

    def test_repeat_order(self, http):
        tok = state["agent_jwt"]
        r = http.post(f"{API}/store-agent/repeat-order/{state['order_id_cod']}",
                      json={"payment_method": "cod"},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        new_id = r.json()["order_id"]
        # Verify status pending and parent_order_id set
        ord_list = http.get(f"{API}/store-agent/orders", headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()["orders"]
        new_doc = next(o for o in ord_list if o["id"] == new_id)
        assert new_doc["status"] == "pending"
        assert new_doc.get("parent_order_id") == state["order_id_cod"]
        assert new_doc.get("commission_amount", 0) >= 0

    def test_rbac_agent_isolation(self, http, sm_token):
        # Place an order via agent2 storefront
        # First create agent2 already; place a quick COD order
        prods = http.get(f"{API}/store/{state['agent2_slug']}/products", timeout=15).json()["products"]
        prod = next(p for p in prods if not p.get("is_combo"))
        oc = http.post(f"{API}/store/{state['agent2_slug']}/order", json={
            "customer_name": "TEST Iso", "customer_phone": "8000", "address": "y",
            "items": [{"id": prod["id"], "qty": 1}], "payment_method": "cod",
        }, timeout=15)
        assert oc.status_code == 200, oc.text
        ag2_order = oc.json()["order_id"]
        state["agent2_order_id"] = ag2_order

        # Login as agent1 → agent1's /orders must NOT include agent2's order
        tok = state["agent_jwt"]
        r = http.get(f"{API}/store-agent/orders", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        assert all(o["id"] != ag2_order for o in r.json()["orders"]), "RBAC: agent A leaked agent B's order"


# =====================================================================
# 4. SM agent-order queue + approve/reject + CRM mirror
# =====================================================================
class TestSMOrderQueue:
    def test_list_orders_scoped(self, http, sm_token):
        r = http.get(f"{API}/sales-manager/agent-orders", headers=_h(sm_token), timeout=15)
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()["orders"]]
        assert state["order_id_cod"] in ids

    def test_admin_sees_all(self, http, admin_token):
        r = http.get(f"{API}/sales-manager/agent-orders", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        # admin should see the COD order too
        assert any(o["id"] == state["order_id_cod"] for o in r.json()["orders"])

    def test_approve_mirrors_to_orders(self, http, sm_token):
        oid = state["order_id_cod"]
        r = http.post(f"{API}/sales-manager/agent-orders/{oid}/approve",
                      headers=_h(sm_token), timeout=15)
        assert r.status_code == 200
        # Check mirrored into /api/orders. Try a couple of likely endpoints.
        admin_tok = _login(http, ADMIN_EMAIL, ADMIN_PASS)
        found = False
        for ep in ("/orders", "/admin/orders"):
            rr = http.get(f"{API}{ep}", headers=_h(admin_tok), timeout=15)
            if rr.status_code == 200:
                data = rr.json()
                arr = data if isinstance(data, list) else (data.get("orders") or data.get("data") or [])
                if any(isinstance(o, dict) and o.get("id") == oid for o in arr):
                    o = next(o for o in arr if o.get("id") == oid)
                    assert o.get("source") == "agent_store"
                    assert o.get("status") == "approved"
                    found = True
                    break
        assert found, "Approved agent-order was not mirrored into /api/orders pipeline"

    def test_reject_with_reason(self, http, sm_token):
        # Place fresh order to reject
        prod = state["a_product"]
        op = http.post(f"{API}/store/{state['agent_slug']}/order", json={
            "customer_name": "TEST Rej", "customer_phone": "111", "address": "z",
            "items": [{"id": prod["id"], "qty": 1}], "payment_method": "cod",
        }, timeout=15)
        assert op.status_code == 200
        oid = op.json()["order_id"]
        r = http.post(f"{API}/sales-manager/agent-orders/{oid}/reject",
                      json={"reason": "Suspicious address"},
                      headers=_h(sm_token), timeout=15)
        assert r.status_code == 200
        # Verify status
        lst = http.get(f"{API}/sales-manager/agent-orders?status=rejected",
                       headers=_h(sm_token), timeout=15).json()["orders"]
        rejected = next((o for o in lst if o["id"] == oid), None)
        assert rejected and rejected.get("rejection_reason") == "Suspicious address"


# =====================================================================
# 5. Admin store settings + product CRUD
# =====================================================================
class TestAdminStore:
    def test_get_settings_masks_secret(self, http, admin_token):
        # First set a secret
        http.put(f"{API}/admin/store/settings",
                 json={"razorpay_key_id": "rzp_test_demo", "razorpay_key_secret": "supersecret1234"},
                 headers=_h(admin_token), timeout=15)
        r = http.get(f"{API}/admin/store/settings", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        s = r.json()["settings"]
        assert s["razorpay_key_id"] == "rzp_test_demo"
        # secret blanked, mask present
        assert s.get("razorpay_key_secret") in ("", None)
        assert s.get("razorpay_key_secret_masked", "").endswith("1234")

    def test_update_empty_secret_does_not_overwrite(self, http, admin_token):
        # Send empty secret
        r = http.put(f"{API}/admin/store/settings",
                     json={"razorpay_key_secret": "", "hero_title": "New Hero Title"},
                     headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        # Confirm secret still exists
        s = http.get(f"{API}/admin/store/settings", headers=_h(admin_token), timeout=15).json()["settings"]
        assert s.get("razorpay_key_secret_masked", "").endswith("1234"), "secret was wiped by empty payload"
        assert s["hero_title"] == "New Hero Title"

    def test_settings_admin_only(self, http, sm_token):
        r = http.get(f"{API}/admin/store/settings", headers=_h(sm_token), timeout=15)
        assert r.status_code == 403

    def test_product_crud(self, http, admin_token):
        # CREATE
        payload = {"name": f"TEST Product {uuid.uuid4().hex[:5]}",
                   "price": 499, "mrp": 799, "is_combo": False, "stock": 50}
        r = http.post(f"{API}/admin/store/products", json=payload, headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()["product"]
        pid = p["id"]
        assert p["price"] == 499 and p["slug"]

        # LIST contains it
        lst = http.get(f"{API}/admin/store/products", headers=_h(admin_token), timeout=15).json()["products"]
        assert any(x["id"] == pid for x in lst)

        # UPDATE
        ru = http.put(f"{API}/admin/store/products/{pid}",
                      json={"price": 599, "stock": 30}, headers=_h(admin_token), timeout=15)
        assert ru.status_code == 200
        lst2 = http.get(f"{API}/admin/store/products", headers=_h(admin_token), timeout=15).json()["products"]
        updated = next(x for x in lst2 if x["id"] == pid)
        assert updated["price"] == 599 and updated["stock"] == 30

        # DELETE
        rd = http.delete(f"{API}/admin/store/products/{pid}", headers=_h(admin_token), timeout=15)
        assert rd.status_code == 200
        lst3 = http.get(f"{API}/admin/store/products", headers=_h(admin_token), timeout=15).json()["products"]
        assert not any(x["id"] == pid for x in lst3)


# =====================================================================
# 6. SM delete agent (soft delete) — last so other tests can use the agent
# =====================================================================
class TestZAgentDelete:
    def test_soft_delete(self, http, sm_token):
        r = http.delete(f"{API}/sales-manager/agents/{state['agent2_id']}",
                        headers=_h(sm_token), timeout=15)
        assert r.status_code == 200
        # Now storefront for that slug should 404
        m = http.get(f"{API}/store/{state['agent2_slug']}/meta", timeout=15)
        assert m.status_code == 404
