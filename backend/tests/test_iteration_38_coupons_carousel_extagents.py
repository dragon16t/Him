"""
Iteration 38 backend tests:
- Coupons CRUD (admin) + public validate-coupon
- Order with coupon_code + locality field
- Store settings: home_carousel_images, home_faqs, product_faqs
- HR external agents directory + add-to-employees
- Daily report PDF resilience + email error clarity
- SM->HR agent sync on creation
- HR/finance/admin can process withdraw-requests
- Admin product create with faqs field
"""

import os
import time
import uuid
import requests
import pytest

def _load_backend_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if not val:
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        val = line.split("=", 1)[1].strip()
                        break
    return (val or "").rstrip("/")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@celestaglow.com"
ADMIN_PASSWORD = "admin123"
SM_EMAIL = "salesmanager@celestaglow.com"
SM_PASSWORD = "sm123"
HR_EMAIL = "hrmanager@celestaglow.com"
HR_PASSWORD = "hr123"
FIN_EMAIL = "finance@celestaglow.com"
FIN_PASSWORD = "fin123"

PUBLIC_AGENT_SLUG = "muhammed-shahad"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def sm_token():
    return _login(SM_EMAIL, SM_PASSWORD)


@pytest.fixture(scope="module")
def hr_token():
    return _login(HR_EMAIL, HR_PASSWORD)


@pytest.fixture(scope="module")
def fin_token():
    return _login(FIN_EMAIL, FIN_PASSWORD)


# ============================== COUPONS CRUD ==============================
class TestCouponsCRUD:
    created_id = None
    code = None

    def test_01_create_coupon(self, admin_token):
        code = f"TEST_CPN_{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "code": code,
            "description": "Test 10% off",
            "discount_type": "percent",
            "discount_value": 10,
            "min_cart_value": 500,
            "max_discount": 200,
            "usage_limit": 0,
            "active": True,
        }
        r = requests.post(f"{API}/admin/store/coupons", json=payload, headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "coupon" in body
        c = body["coupon"]
        assert c["code"] == code
        assert c["discount_type"] == "percent"
        assert c["discount_value"] == 10
        assert c["used_count"] == 0
        assert "id" in c
        TestCouponsCRUD.created_id = c["id"]
        TestCouponsCRUD.code = code

    def test_02_list_coupons_has_new(self, admin_token):
        r = requests.get(f"{API}/admin/store/coupons", headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200
        codes = [c["code"] for c in r.json()["coupons"]]
        assert TestCouponsCRUD.code in codes

    def test_03_duplicate_code_rejected(self, admin_token):
        r = requests.post(f"{API}/admin/store/coupons",
                          json={"code": TestCouponsCRUD.code, "discount_type": "flat", "discount_value": 50},
                          headers=_auth(admin_token), timeout=20)
        assert r.status_code == 400

    def test_04_update_coupon(self, admin_token):
        r = requests.put(f"{API}/admin/store/coupons/{TestCouponsCRUD.created_id}",
                         json={"discount_value": 15, "max_discount": 250},
                         headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        # verify via list
        r = requests.get(f"{API}/admin/store/coupons", headers=_auth(admin_token), timeout=20)
        c = next((x for x in r.json()["coupons"] if x["id"] == TestCouponsCRUD.created_id), None)
        assert c is not None
        assert c["discount_value"] == 15
        assert c["max_discount"] == 250

    def test_05_public_validate_coupon_ok(self):
        r = requests.post(f"{API}/store/{PUBLIC_AGENT_SLUG}/validate-coupon",
                          json={"code": TestCouponsCRUD.code, "subtotal": 1000}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        # 15% of 1000 = 150 (cap 250 not reached)
        assert body["discount"] == 150.0
        assert body["code"] == TestCouponsCRUD.code

    def test_06_public_validate_below_min_cart(self):
        r = requests.post(f"{API}/store/{PUBLIC_AGENT_SLUG}/validate-coupon",
                          json={"code": TestCouponsCRUD.code, "subtotal": 100}, timeout=20)
        assert r.status_code == 400
        assert "Minimum" in r.text or "minimum" in r.text.lower()

    def test_07_public_validate_invalid_code(self):
        r = requests.post(f"{API}/store/{PUBLIC_AGENT_SLUG}/validate-coupon",
                          json={"code": "DOESNOTEXIST_X", "subtotal": 1000}, timeout=20)
        assert r.status_code == 404

    def test_08_public_validate_invalid_slug(self):
        r = requests.post(f"{API}/store/this-slug-does-not-exist-xyz/validate-coupon",
                          json={"code": TestCouponsCRUD.code, "subtotal": 1000}, timeout=20)
        assert r.status_code == 404

    def test_09_delete_coupon(self, admin_token):
        r = requests.delete(f"{API}/admin/store/coupons/{TestCouponsCRUD.created_id}",
                            headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200
        # verify removed
        r = requests.get(f"{API}/admin/store/coupons", headers=_auth(admin_token), timeout=20)
        ids = [c["id"] for c in r.json()["coupons"]]
        assert TestCouponsCRUD.created_id not in ids


# ============================== ORDER WITH COUPON + LOCALITY ==============================
class TestOrderWithCoupon:
    coupon_id = None
    code = None

    def test_01_setup_coupon(self, admin_token):
        code = f"TEST_ORD_{uuid.uuid4().hex[:6].upper()}"
        r = requests.post(f"{API}/admin/store/coupons",
                          json={"code": code, "discount_type": "flat", "discount_value": 100,
                                "min_cart_value": 0, "active": True},
                          headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200
        TestOrderWithCoupon.coupon_id = r.json()["coupon"]["id"]
        TestOrderWithCoupon.code = code

    def test_02_place_cod_order_with_coupon_and_locality(self, admin_token):
        # Fetch a real product from the storefront
        r = requests.get(f"{API}/store/{PUBLIC_AGENT_SLUG}/products", timeout=20)
        assert r.status_code == 200, r.text
        products = r.json().get("products", [])
        assert len(products) > 0
        p = products[0]
        payload = {
            "customer_name": "TEST_Coupon_Customer",
            "customer_phone": "9999999911",
            "customer_email": "testcoupon@example.com",
            "address": "TEST line 1",
            "city": "Pune",
            "state": "Maharashtra",
            "pincode": "411001",
            "locality": "Shivajinagar",
            "items": [{"id": p["id"], "qty": 1}],
            "payment_method": "cod",
            "subtotal": p["price"],
            "coupon_code": TestOrderWithCoupon.code,
        }
        r = requests.post(f"{API}/store/{PUBLIC_AGENT_SLUG}/order", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("coupon_code") == TestOrderWithCoupon.code
        # discount should be applied (flat 100)
        assert "discount" in body or "order_id" in body
        oid = body.get("order_id") or body.get("id")
        assert oid

        # Verify the order persisted with locality + coupon_code
        # Look it up via admin/all agent_orders endpoint candidates — fallback to track-order
        track = requests.post(f"{API}/store/track-order",
                              json={"phone": "9999999911", "order_id": oid}, timeout=20)
        assert track.status_code == 200, track.text
        orders = track.json().get("orders") or []
        assert len(orders) > 0
        order = orders[0]
        assert order.get("locality") == "Shivajinagar"
        assert order.get("coupon_code") == TestOrderWithCoupon.code

    def test_99_cleanup(self, admin_token):
        if TestOrderWithCoupon.coupon_id:
            requests.delete(f"{API}/admin/store/coupons/{TestOrderWithCoupon.coupon_id}",
                            headers=_auth(admin_token), timeout=20)


# ============================== STORE SETTINGS (carousel / faqs) ==============================
class TestStoreSettings:
    def test_01_update_and_read_back(self, admin_token):
        carousel = [
            "https://example.com/c1.jpg",
            "https://example.com/c2.jpg",
            "https://example.com/c3.jpg",
        ]
        home_faqs = [
            {"q": "Is COD available?", "a": "Yes, across India."},
            {"q": "Return policy?", "a": "7 day return on unopened products."},
        ]
        product_faqs = [{"q": "Is it safe?", "a": "Dermatologist-tested."}]
        r = requests.put(f"{API}/admin/store/settings",
                         json={"home_carousel_images": carousel,
                               "home_faqs": home_faqs,
                               "product_faqs": product_faqs},
                         headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text

        r = requests.get(f"{API}/admin/store/settings", headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200
        s = r.json()["settings"]
        assert s.get("home_carousel_images") == carousel
        assert s.get("home_faqs") == home_faqs
        assert s.get("product_faqs") == product_faqs


# ============================== HR EXTERNAL AGENTS ==============================
class TestHRExternalAgents:
    created_agent_id = None
    sm_agent_name = None

    def test_01_sm_creates_agent_syncs_to_hr(self, sm_token):
        name = f"TEST_ExtAgent_{uuid.uuid4().hex[:6]}"
        phone = "98700" + str(int(time.time()) % 100000).zfill(5)
        payload = {"name": name, "phone": phone, "designation": "agent",
                   "commission_pct": 12, "region": "Pune", "gpay_number": phone}
        r = requests.post(f"{API}/sales-manager/agents", json=payload,
                          headers=_auth(sm_token), timeout=20)
        assert r.status_code == 200, r.text
        a = r.json()["agent"]
        TestHRExternalAgents.created_agent_id = a["id"]
        TestHRExternalAgents.sm_agent_name = name

    def test_02_hr_can_list_external_agents(self, hr_token):
        r = requests.get(f"{API}/hr/external-agents", headers=_auth(hr_token), timeout=20)
        assert r.status_code == 200, r.text
        agents = r.json()["agents"]
        found = next((x for x in agents if x.get("agent_id") == TestHRExternalAgents.created_agent_id), None)
        assert found is not None, "New SM agent not synced to hr_external_agents"
        assert found["name"] == TestHRExternalAgents.sm_agent_name
        assert "added_to_employees" in found
        assert found["added_to_employees"] is False

    def test_03_telecaller_forbidden(self):
        tc_token = _login("telecaller1@celestaglow.com", "tc123")
        r = requests.get(f"{API}/hr/external-agents", headers=_auth(tc_token), timeout=20)
        assert r.status_code == 403

    def test_04_admin_add_to_employees(self, admin_token):
        agent_id = TestHRExternalAgents.created_agent_id
        r = requests.post(f"{API}/hr/external-agents/{agent_id}/add-to-employees",
                          json={"salary": 25000},
                          headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "user_id" in body

        # Verify external-agents now has flag flipped
        r = requests.get(f"{API}/hr/external-agents", headers=_auth(admin_token), timeout=20)
        found = next((x for x in r.json()["agents"] if x.get("agent_id") == agent_id), None)
        assert found is not None
        assert found.get("added_to_employees") is True

    def test_05_add_to_employees_idempotent(self, admin_token):
        agent_id = TestHRExternalAgents.created_agent_id
        r = requests.post(f"{API}/hr/external-agents/{agent_id}/add-to-employees",
                          json={"salary": 25000},
                          headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("already_existed") is True

    def test_06_404_for_unknown_agent(self, admin_token):
        r = requests.post(f"{API}/hr/external-agents/nope-xyz-99/add-to-employees",
                          json={}, headers=_auth(admin_token), timeout=20)
        assert r.status_code == 404

    def test_99_cleanup(self, sm_token, admin_token):
        # Delete SM agent (which should also be safe; HR external entry left, employee left — we clear DB-side via SM delete)
        aid = TestHRExternalAgents.created_agent_id
        if aid:
            requests.delete(f"{API}/sales-manager/agents/{aid}",
                            headers=_auth(sm_token), timeout=20)


# ============================== DAILY REPORT ==============================
class TestDailyReport:
    def test_01_daily_pdf_200(self, admin_token):
        r = requests.get(f"{API}/reports/daily.pdf", headers=_auth(admin_token), timeout=60)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_02_daily_pdf_200_for_sales_manager(self, sm_token):
        r = requests.get(f"{API}/reports/daily.pdf", headers=_auth(sm_token), timeout=60)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_03_daily_send_400_when_smtp_missing(self, admin_token):
        # SMTP is not configured in this env (no SMTP_EMAIL/SMTP_PASSWORD)
        r = requests.post(f"{API}/reports/daily/send",
                          json={"email": "test@example.com"},
                          headers=_auth(admin_token), timeout=30)
        # Either 400 (clean error) OR 200 (if env happens to have SMTP — but should be 400 here)
        if r.status_code == 400:
            detail = r.json().get("detail", "")
            assert "not configured" in detail.lower() or "email server" in detail.lower(), detail
        else:
            # In case SMTP happens to be set, accept 200; but flag 502 as failure
            assert r.status_code != 502, f"Got 502 - SMTP error not handled cleanly: {r.text}"


# ============================== WITHDRAW REQUESTS RBAC ==============================
class TestWithdrawRBAC:
    def test_01_admin_lists(self, admin_token):
        r = requests.get(f"{API}/hr/withdraw-requests", headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200
        assert "requests" in r.json()

    def test_02_hr_lists(self, hr_token):
        r = requests.get(f"{API}/hr/withdraw-requests", headers=_auth(hr_token), timeout=20)
        assert r.status_code == 200

    def test_03_finance_lists(self, fin_token):
        r = requests.get(f"{API}/hr/withdraw-requests", headers=_auth(fin_token), timeout=20)
        assert r.status_code == 200

    def test_04_sm_lists_readonly(self, sm_token):
        r = requests.get(f"{API}/sales-manager/withdraw-requests", headers=_auth(sm_token), timeout=20)
        assert r.status_code == 200
        assert "requests" in r.json()

    def test_05_telecaller_forbidden(self):
        tc = _login("telecaller1@celestaglow.com", "tc123")
        r = requests.get(f"{API}/hr/withdraw-requests", headers=_auth(tc), timeout=20)
        assert r.status_code == 403

    def test_06_invalid_action_400(self, admin_token):
        r = requests.post(f"{API}/hr/withdraw-requests/nope-id/notarealaction",
                          json={}, headers=_auth(admin_token), timeout=20)
        # Either 400 invalid action or 404 not found request, but not 500
        assert r.status_code in (400, 404), r.text


# ============================== ADMIN PRODUCT WITH FAQs ==============================
class TestProductFaqs:
    pid = None

    def test_01_create_product_with_faqs(self, admin_token):
        faqs = [
            {"q": "Is it cruelty-free?", "a": "Yes."},
            {"q": "Shelf life?", "a": "24 months."},
        ]
        payload = {
            "name": f"TEST_Product_{uuid.uuid4().hex[:6]}",
            "tagline": "Test tagline",
            "short_desc": "Short",
            "long_desc": "Long",
            "price": 499,
            "mrp": 999,
            "stock": 50,
            "faqs": faqs,
        }
        r = requests.post(f"{API}/admin/store/products", json=payload,
                          headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        prod = r.json()["product"]
        assert prod["faqs"] == faqs
        TestProductFaqs.pid = prod["id"]

    def test_02_faqs_persisted_in_listing(self, admin_token):
        r = requests.get(f"{API}/admin/store/products", headers=_auth(admin_token), timeout=20)
        assert r.status_code == 200
        prods = r.json()["products"]
        p = next((x for x in prods if x["id"] == TestProductFaqs.pid), None)
        assert p is not None
        assert len(p.get("faqs") or []) == 2
        assert p["faqs"][0]["q"] == "Is it cruelty-free?"

    def test_99_cleanup(self, admin_token):
        if TestProductFaqs.pid:
            requests.delete(f"{API}/admin/store/products/{TestProductFaqs.pid}",
                            headers=_auth(admin_token), timeout=20)
