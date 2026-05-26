"""
Iteration 39 backend tests:
- Settings input validations: carousel cap (20), URL length (500), FAQs cap (30), public_base_url protocol
- Coupon ISO date validation (YYYY-MM-DD) + valid_from <= valid_to
- Storefront /order coupon_applied + coupon_reason flags
- Role-specific delete passwords:
    HR  -> "hr@celestaglow.com" or master "XYCDF6F@123"
    Fin -> "finance@celestaglow.com" or master "XYCDF6F@123"
- SM agents store_url uses settings.public_base_url (default https://celestaglow.com)

Cleanup: resets public_base_url to https://celestaglow.com at session end.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-portal-dev-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@celestaglow.com", "admin123")
SM = ("salesmanager@celestaglow.com", "sm123")
HR = ("hrmanager@celestaglow.com", "hr123")
FIN = ("finance@celestaglow.com", "fin123")

MASTER_PWD = "XYCDF6F@123"
HR_PWD = "hr@celestaglow.com"
FIN_PWD = "finance@celestaglow.com"

STORE_SLUG = "muhammed-shahad"  # active storefront slug (from iter-38 context)


# ---------------- fixtures ----------------
def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def sm_token():
    return _login(*SM)


@pytest.fixture(scope="session")
def hr_token():
    try:
        return _login(*HR)
    except AssertionError:
        return None


@pytest.fixture(scope="session")
def fin_token():
    try:
        return _login(*FIN)
    except AssertionError:
        return None


@pytest.fixture(scope="session", autouse=True)
def reset_public_base_url(admin_token):
    """Ensure public_base_url is celestaglow.com before AND after the suite."""
    requests.put(f"{API}/admin/store/settings",
                 headers=_hdr(admin_token),
                 json={"public_base_url": "https://celestaglow.com"}, timeout=30)
    yield
    requests.put(f"{API}/admin/store/settings",
                 headers=_hdr(admin_token),
                 json={"public_base_url": "https://celestaglow.com"}, timeout=30)


# ---------------- settings: carousel / FAQs / base url ----------------
class TestStoreSettingsValidation:

    def test_carousel_max_20(self, admin_token):
        imgs = [f"https://img.example.com/{i}.jpg" for i in range(21)]
        r = requests.put(f"{API}/admin/store/settings",
                         headers=_hdr(admin_token),
                         json={"home_carousel_images": imgs}, timeout=30)
        assert r.status_code == 400, r.text
        assert "20" in r.text

    def test_carousel_url_max_500(self, admin_token):
        long_url = "https://img.example.com/" + ("a" * 500)  # > 500 chars total
        r = requests.put(f"{API}/admin/store/settings",
                         headers=_hdr(admin_token),
                         json={"home_carousel_images": [long_url]}, timeout=30)
        assert r.status_code == 400, r.text
        assert "500" in r.text or "length" in r.text.lower()

    def test_carousel_20_ok(self, admin_token):
        imgs = [f"https://img.example.com/{i}.jpg" for i in range(20)]
        r = requests.put(f"{API}/admin/store/settings",
                         headers=_hdr(admin_token),
                         json={"home_carousel_images": imgs}, timeout=30)
        assert r.status_code == 200, r.text

    def test_faqs_max_30(self, admin_token):
        faqs = [{"q": f"Q{i}", "a": f"A{i}"} for i in range(31)]
        r = requests.put(f"{API}/admin/store/settings",
                         headers=_hdr(admin_token),
                         json={"home_faqs": faqs}, timeout=30)
        assert r.status_code == 400
        assert "30" in r.text

    def test_public_base_url_must_have_scheme(self, admin_token):
        r = requests.put(f"{API}/admin/store/settings",
                         headers=_hdr(admin_token),
                         json={"public_base_url": "celestaglow.com"}, timeout=30)
        assert r.status_code == 400
        assert "http" in r.text.lower()

    def test_public_base_url_https_ok(self, admin_token):
        r = requests.put(f"{API}/admin/store/settings",
                         headers=_hdr(admin_token),
                         json={"public_base_url": "https://celestaglow.com"}, timeout=30)
        assert r.status_code == 200


# ---------------- coupon ISO date validations ----------------
class TestCouponDateValidation:

    @pytest.fixture(scope="class")
    def make_payload(self):
        def _make(**ov):
            base = {
                "code": "TEST_DATE_" + os.urandom(3).hex().upper(),
                "discount_type": "flat",
                "discount_value": 50,
                "min_cart_value": 0,
                "max_discount": 0,
                "usage_limit": 0,
                "active": True,
                "valid_from": "",
                "valid_to": "",
            }
            base.update(ov)
            return base
        return _make

    def test_create_bad_slash_format(self, admin_token, make_payload):
        r = requests.post(f"{API}/admin/store/coupons",
                         headers=_hdr(admin_token),
                         json=make_payload(valid_from="2026/01/01"), timeout=30)
        assert r.status_code == 400
        assert "YYYY-MM-DD" in r.text

    def test_create_bad_dmy_format(self, admin_token, make_payload):
        r = requests.post(f"{API}/admin/store/coupons",
                         headers=_hdr(admin_token),
                         json=make_payload(valid_from="01-01-2026"), timeout=30)
        assert r.status_code == 400

    def test_create_bad_month(self, admin_token, make_payload):
        r = requests.post(f"{API}/admin/store/coupons",
                         headers=_hdr(admin_token),
                         json=make_payload(valid_from="2026-13-01"), timeout=30)
        assert r.status_code == 400

    def test_create_from_after_to(self, admin_token, make_payload):
        r = requests.post(f"{API}/admin/store/coupons",
                         headers=_hdr(admin_token),
                         json=make_payload(valid_from="2026-06-01", valid_to="2026-05-01"), timeout=30)
        assert r.status_code == 400
        assert "before" in r.text.lower() or "valid_to" in r.text

    def test_create_valid_dates_then_update_bad(self, admin_token, make_payload):
        # Create valid
        payload = make_payload(valid_from="2026-01-01", valid_to="2026-12-31")
        r = requests.post(f"{API}/admin/store/coupons",
                         headers=_hdr(admin_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        cid = r.json()["coupon"]["id"]
        try:
            # Update with bad date
            r = requests.put(f"{API}/admin/store/coupons/{cid}",
                            headers=_hdr(admin_token),
                            json={"valid_to": "2026/12/31"}, timeout=30)
            assert r.status_code == 400
        finally:
            requests.delete(f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token), timeout=30)


# ---------------- /order coupon_applied + coupon_reason ----------------
class TestOrderCouponFeedback:

    @pytest.fixture(scope="class")
    def coupon_factory(self, admin_token):
        created = []

        def _make(**ov):
            payload = {
                "code": "TEST_ORD_" + os.urandom(3).hex().upper(),
                "discount_type": "flat",
                "discount_value": 50,
                "min_cart_value": 0,
                "max_discount": 0,
                "usage_limit": 0,
                "active": True,
                "valid_from": "",
                "valid_to": "",
            }
            payload.update(ov)
            r = requests.post(f"{API}/admin/store/coupons",
                             headers=_hdr(admin_token), json=payload, timeout=30)
            assert r.status_code == 200, r.text
            cid = r.json()["coupon"]["id"]
            created.append(cid)
            return payload["code"], cid
        yield _make
        for cid in created:
            requests.delete(f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token), timeout=30)

    def _get_product_slug(self):
        r = requests.get(f"{API}/store/{STORE_SLUG}/products", timeout=30)
        assert r.status_code == 200, r.text
        prods = r.json().get("products", [])
        assert prods, "No products in storefront for testing"
        return prods[0]

    def _make_order(self, coupon_code: str):
        p = self._get_product_slug()
        body = {
            "customer_name": "TEST Coupon Customer",
            "customer_phone": "9999900000",
            "address": "Test address",
            "locality": "Test", "city": "Test", "state": "TS", "pincode": "560001",
            "items": [{"id": p["id"], "qty": 1}],
            "payment_method": "cod",
            "coupon_code": coupon_code,
        }
        return requests.post(f"{API}/store/{STORE_SLUG}/order", json=body, timeout=30)

    def test_invalid_coupon_code(self):
        r = self._make_order("NOPE_DOES_NOT_EXIST_XYZ")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["coupon_applied"] is False
        assert "Invalid" in d["coupon_reason"]
        assert d["discount"] == 0

    def test_inactive_coupon(self, coupon_factory):
        code, _ = coupon_factory(active=False)
        r = self._make_order(code)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["coupon_applied"] is False
        assert d["coupon_reason"]  # specific reason
        assert d["discount"] == 0

    def test_below_min_cart(self, coupon_factory):
        code, _ = coupon_factory(min_cart_value=99999999)
        r = self._make_order(code)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["coupon_applied"] is False
        assert "Minimum" in d["coupon_reason"] or "min" in d["coupon_reason"].lower()
        assert d["discount"] == 0

    def test_valid_coupon_applies(self, coupon_factory):
        code, _ = coupon_factory(discount_type="flat", discount_value=50, min_cart_value=0)
        r = self._make_order(code)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["coupon_applied"] is True
        assert d["discount"] == 50
        assert d["coupon_code"] == code


# ---------------- HR + Finance role-specific delete passwords ----------------
class TestHrCandidateDeletePassword:

    @pytest.fixture
    def candidate(self, admin_token):
        # Create a hiring candidate to delete
        payload = {
            "name": "TEST_HR_DEL_" + os.urandom(3).hex(),
            "phone": "9000000001",
            "applied_for": "telecaller",
            "status": "applied",
        }
        r = requests.post(f"{API}/hiring/candidates",
                         headers=_hdr(admin_token), json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        cid = (body.get("id") or body.get("candidate", {}).get("id")
               or body.get("entry", {}).get("id") or body.get("_id"))
        assert cid, f"could not extract id: {body}"
        yield cid
        # Cleanup if still exists
        requests.delete(f"{API}/hiring/candidates/{cid}",
                       headers=_hdr(admin_token),
                       json={"password": MASTER_PWD}, timeout=30)

    def test_hr_delete_wrong_password(self, admin_token, candidate):
        r = requests.delete(f"{API}/hiring/candidates/{candidate}",
                           headers=_hdr(admin_token),
                           json={"password": "wrong-password"}, timeout=30)
        assert r.status_code == 403
        assert "password" in r.text.lower()

    def test_hr_delete_with_hr_password(self, admin_token, candidate):
        r = requests.delete(f"{API}/hiring/candidates/{candidate}",
                           headers=_hdr(admin_token),
                           json={"password": HR_PWD}, timeout=30)
        assert r.status_code == 200, r.text

    def test_hr_delete_with_master_password(self, admin_token, candidate):
        r = requests.delete(f"{API}/hiring/candidates/{candidate}",
                           headers=_hdr(admin_token),
                           json={"password": MASTER_PWD}, timeout=30)
        assert r.status_code == 200, r.text

    def test_hr_bulk_delete_wrong_password(self, admin_token):
        r = requests.post(f"{API}/hiring/candidates/bulk-delete",
                         headers=_hdr(admin_token),
                         json={"ids": ["nonexistent"], "password": "wrong"}, timeout=30)
        assert r.status_code == 403

    def test_hr_bulk_delete_with_hr_password(self, admin_token):
        # Create two candidates and bulk delete
        ids = []
        for _ in range(2):
            payload = {"name": "TEST_BULK_" + os.urandom(3).hex(), "phone": "9000000002",
                       "applied_for": "telecaller", "status": "applied"}
            r = requests.post(f"{API}/hiring/candidates", headers=_hdr(admin_token),
                             json=payload, timeout=30)
            body = r.json()
            cid = (body.get("id") or body.get("candidate", {}).get("id")
                   or body.get("entry", {}).get("id"))
            assert cid, f"create failed: {body}"
            ids.append(cid)
        r = requests.post(f"{API}/hiring/candidates/bulk-delete",
                         headers=_hdr(admin_token),
                         json={"ids": ids, "password": HR_PWD}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("deleted", 0) >= 1


class TestFinanceDeletePassword:

    @pytest.fixture
    def transaction(self, admin_token):
        # Create an investment (credits bank) -> records a ledger txn we can delete
        amt = 100
        r = requests.post(f"{API}/investments",
                         headers=_hdr(admin_token),
                         json={"title": "TEST_FIN_DEL_INV", "amount": amt,
                               "source": "test", "partner_type": "main"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        # fetch latest ledger entry id
        l = requests.get(f"{API}/finance/ledger", headers=_hdr(admin_token), timeout=30)
        assert l.status_code == 200
        txns = l.json().get("transactions", [])
        tid = None
        for t in txns:
            if "TEST_FIN_DEL_INV" in (t.get("description") or "") and t.get("type") == "credit":
                tid = t["id"]; break
        assert tid, "couldn't find created investment transaction in ledger"
        yield tid
        requests.delete(f"{API}/finance/transaction/{tid}", headers=_hdr(admin_token),
                       json={"password": MASTER_PWD}, timeout=30)

    def test_finance_txn_wrong_password(self, admin_token, transaction):
        r = requests.delete(f"{API}/finance/transaction/{transaction}",
                           headers=_hdr(admin_token),
                           json={"password": "wrong"}, timeout=30)
        assert r.status_code == 403

    def test_finance_txn_with_finance_password_reverses_balance(self, admin_token, transaction):
        # Capture bank balance before
        b1 = requests.get(f"{API}/finance/balance", headers=_hdr(admin_token), timeout=30).json()["balance"]["bank"]
        r = requests.delete(f"{API}/finance/transaction/{transaction}",
                           headers=_hdr(admin_token),
                           json={"password": FIN_PWD}, timeout=30)
        assert r.status_code == 200, r.text
        b2 = requests.get(f"{API}/finance/balance", headers=_hdr(admin_token), timeout=30).json()["balance"]["bank"]
        # 100 credit reversal -> bank decreases by 100
        assert round(b1 - b2, 2) == 100.0, f"bank balance not reversed: {b1} -> {b2}"

    def test_expense_delete_wrong_password(self, admin_token):
        # Create an expense
        r = requests.post(f"{API}/expenses",
                         headers=_hdr(admin_token),
                         json={"title": "TEST_EXP_DEL", "amount": 10,
                               "category": "test", "debit_from": "bank"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        eid = body.get("id") or body.get("expense", {}).get("id")
        assert eid
        try:
            r = requests.delete(f"{API}/expenses/{eid}",
                               headers=_hdr(admin_token),
                               json={"password": "wrong"}, timeout=30)
            assert r.status_code == 403
        finally:
            requests.delete(f"{API}/expenses/{eid}", headers=_hdr(admin_token),
                           json={"password": MASTER_PWD}, timeout=30)

    def test_expense_delete_with_finance_password(self, admin_token):
        r = requests.post(f"{API}/expenses",
                         headers=_hdr(admin_token),
                         json={"title": "TEST_EXP_DEL2", "amount": 10,
                               "category": "test", "debit_from": "bank"}, timeout=30)
        assert r.status_code in (200, 201)
        eid = r.json().get("id") or r.json().get("expense", {}).get("id")
        r = requests.delete(f"{API}/expenses/{eid}",
                           headers=_hdr(admin_token),
                           json={"password": FIN_PWD}, timeout=30)
        assert r.status_code == 200, r.text


# ---------------- SM agents store_url uses public_base_url ----------------
class TestAgentStoreUrlPublicBase:

    def test_default_celestaglow(self, admin_token, sm_token):
        # ensure default
        requests.put(f"{API}/admin/store/settings",
                    headers=_hdr(admin_token),
                    json={"public_base_url": "https://celestaglow.com"}, timeout=30)
        r = requests.get(f"{API}/sales-manager/agents", headers=_hdr(sm_token), timeout=30)
        assert r.status_code == 200
        agents = r.json().get("agents", [])
        assert agents, "no agents to verify"
        for a in agents:
            assert a.get("store_url", "").startswith("https://celestaglow.com/store/"), a.get("store_url")
            assert "preview.emergentagent.com" not in a.get("store_url", "")
            assert a.get("agent_portal_url", "").startswith("https://celestaglow.com/store/")

    def test_custom_base_url_reflected(self, admin_token, sm_token):
        # set custom
        r = requests.put(f"{API}/admin/store/settings",
                        headers=_hdr(admin_token),
                        json={"public_base_url": "https://example.com"}, timeout=30)
        assert r.status_code == 200
        try:
            r = requests.get(f"{API}/sales-manager/agents", headers=_hdr(sm_token), timeout=30)
            assert r.status_code == 200
            for a in r.json().get("agents", []):
                assert a["store_url"].startswith("https://example.com/store/"), a["store_url"]
        finally:
            # reset
            requests.put(f"{API}/admin/store/settings",
                        headers=_hdr(admin_token),
                        json={"public_base_url": "https://celestaglow.com"}, timeout=30)

    def test_create_agent_uses_celestaglow(self, admin_token, sm_token):
        # ensure default first
        requests.put(f"{API}/admin/store/settings",
                    headers=_hdr(admin_token),
                    json={"public_base_url": "https://celestaglow.com"}, timeout=30)
        suffix = os.urandom(3).hex()
        payload = {
            "name": f"TEST_StoreUrl_{suffix}",
            "phone": "9000" + os.urandom(3).hex()[:6],
            "designation": "agent",
            "region": "Pune",
            "commission_pct": 10,
        }
        r = requests.post(f"{API}/sales-manager/agents",
                         headers=_hdr(sm_token), json=payload, timeout=30)
        # SM may not be allowed to create directly; fall back to admin if 403
        if r.status_code == 403:
            r = requests.post(f"{API}/sales-manager/agents",
                             headers=_hdr(admin_token), json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        agent = r.json().get("agent", {})
        try:
            assert agent.get("store_url", "").startswith("https://celestaglow.com/store/"), agent.get("store_url")
        finally:
            aid = agent.get("id")
            if aid:
                requests.delete(f"{API}/sales-manager/agents/{aid}",
                               headers=_hdr(admin_token), timeout=30)


# ---------------- Smoke for existing endpoints (must still pass) ----------------
class TestRegression:
    def test_hr_external_agents(self, admin_token):
        r = requests.get(f"{API}/hr/external-agents", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("agents", []), list)

    def test_daily_pdf(self, admin_token):
        r = requests.get(f"{API}/reports/daily.pdf", headers=_hdr(admin_token), timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 500
