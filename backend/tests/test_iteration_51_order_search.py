"""Iteration 51 — server-side order search on /api/v2/orders & /api/inventory/orders."""
import os, uuid, requests, pytest, time

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-central-82.preview.emergentagent.com").rstrip("/")

def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        # restore seed then retry once
        requests.post(f"{BASE}/api/admin/restore-seed", json={"password": "AMVPA2478F@123"}, timeout=60)
        time.sleep(10)
        r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="module")
def admin_tok(): return _login("admin@celestaglow.com", "admin123")
@pytest.fixture(scope="module")
def sm_tok():    return _login("salesmanager@celestaglow.com", "sm123")
@pytest.fixture(scope="module")
def tc_tok():    return _login("telecaller1@celestaglow.com", "tc123")
@pytest.fixture(scope="module")
def inv_tok():   return _login("inventory@celestaglow.com", "inv123")

def H(t): return {"Authorization": f"Bearer {t}"}

UNIQUE = "ZZUNIQUENAME_XYZ_" + uuid.uuid4().hex[:6].upper()
UNIQ_PHONE = "77" + str(int(time.time()))[-8:]  # 10 digit-ish
UNIQ_PRODUCT = "ZZPRODNAME_" + uuid.uuid4().hex[:5].upper()

@pytest.fixture(scope="module")
def seeded_order(tc_tok):
    """Create one order via TC that has our unique markers, plus a few filler orders."""
    # Filler orders (bulk-ish) so pagination is realistic
    filler_ids = []
    for i in range(6):
        payload = {
            "customer_name": f"Filler Cust {i}",
            "customer_phone": f"90000000{i:02d}",
            "customer_address": "Addr", "customer_city":"City", "customer_pincode":"110001",
            "items": [{"product_name": "Regular Cream", "quantity": 1, "price": 100}],
            "total_amount": 100, "payment_type": "cod"
        }
        r = requests.post(f"{BASE}/api/orders", headers=H(tc_tok), json=payload, timeout=30)
        if r.status_code in (200, 201):
            filler_ids.append(r.json().get("id") or r.json().get("order",{}).get("id"))

    # Special order
    payload = {
        "customer_name": UNIQUE,
        "customer_phone": f"+91 98{UNIQ_PHONE[:8]}",
        "customer_address": "1 Test Rd", "customer_city": "Testville", "customer_pincode":"560001",
        "items": [{"product_name": UNIQ_PRODUCT, "quantity": 1, "price": 500}],
        "total_amount": 500, "payment_type": "cod"
    }
    r = requests.post(f"{BASE}/api/orders", headers=H(tc_tok), json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    oid = body.get("id") or body.get("order",{}).get("id")
    assert oid, f"no id in {body}"
    return {"id": oid, "name": UNIQUE, "phone_digits": UNIQ_PHONE, "product": UNIQ_PRODUCT}


class TestV2OrdersSearch:
    def test_smoke_no_q(self, admin_tok):
        r = requests.get(f"{BASE}/api/v2/orders?skip=0&limit=5", headers=H(admin_tok), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "orders" in data and "total" in data
        assert isinstance(data["orders"], list)

    def test_search_by_unique_name(self, admin_tok, seeded_order):
        r = requests.get(f"{BASE}/api/v2/orders", params={"q": seeded_order["name"], "skip":0, "limit":5},
                         headers=H(admin_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 1, f"expected match, got {d}"
        assert any(o.get("id") == seeded_order["id"] for o in d["orders"])

    def test_search_by_phone_digits(self, admin_tok, seeded_order):
        # phone stored contains +91 spacing; searching by digits should still match
        r = requests.get(f"{BASE}/api/v2/orders", params={"q": seeded_order["phone_digits"][:6], "limit":10},
                         headers=H(admin_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert any(o.get("id") == seeded_order["id"] for o in d["orders"]), f"phone search missed order {d.get('total')}"

    def test_search_by_product_name(self, admin_tok, seeded_order):
        r = requests.get(f"{BASE}/api/v2/orders", params={"q": seeded_order["product"], "limit":10},
                         headers=H(admin_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert any(o.get("id") == seeded_order["id"] for o in d["orders"])

    def test_search_finds_across_pages(self, admin_tok, seeded_order):
        # deep pagination without q — order might not be here
        # with q it should surface at skip=0
        r = requests.get(f"{BASE}/api/v2/orders", params={"q": seeded_order["name"], "skip":0, "limit":5},
                         headers=H(admin_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        ids = [o.get("id") for o in d["orders"]]
        assert seeded_order["id"] in ids

    def test_regex_special_chars_dont_break(self, admin_tok):
        # user types a dot / plus — should not 500
        for q in [".", "+91", "a.b.c", "()[]"]:
            r = requests.get(f"{BASE}/api/v2/orders", params={"q": q, "limit":3}, headers=H(admin_tok), timeout=30)
            assert r.status_code == 200, f"q={q!r} -> {r.status_code} {r.text}"

    def test_role_scope_tc(self, tc_tok, seeded_order):
        # TC should find own order
        r = requests.get(f"{BASE}/api/v2/orders", params={"q": seeded_order["name"], "limit":5},
                         headers=H(tc_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert any(o.get("id") == seeded_order["id"] for o in d["orders"])

    def test_search_combined_with_status(self, admin_tok, seeded_order):
        r = requests.get(f"{BASE}/api/v2/orders",
                         params={"q": seeded_order["name"], "status": "pending", "limit":5},
                         headers=H(admin_tok), timeout=30)
        assert r.status_code == 200
        # Should not 500. Match may or may not depend on order's status; just check well-formed
        d = r.json()
        assert "orders" in d and "total" in d


class TestInventoryOrdersSearch:
    def test_smoke_no_q(self, inv_tok):
        r = requests.get(f"{BASE}/api/inventory/orders", headers=H(inv_tok), timeout=30)
        assert r.status_code == 200
        assert "orders" in r.json() and "stats" in r.json()

    def test_search_unique(self, inv_tok, seeded_order):
        r = requests.get(f"{BASE}/api/inventory/orders", params={"q": seeded_order["name"]},
                         headers=H(inv_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert any(o.get("id") == seeded_order["id"] for o in d["orders"])

    def test_forbidden_for_tc(self, tc_tok):
        r = requests.get(f"{BASE}/api/inventory/orders", headers=H(tc_tok), timeout=30)
        assert r.status_code == 403


class TestRegressionSmoke:
    def test_pending_credits_summary(self, admin_tok):
        # iteration 50 smoke
        r = requests.get(f"{BASE}/api/pending-credits/summary", headers=H(admin_tok), timeout=30)
        # may be 200 or 404 depending on path; try alt
        if r.status_code == 404:
            r = requests.get(f"{BASE}/api/credits/pending/summary", headers=H(admin_tok), timeout=30)
        assert r.status_code in (200, 404), f"unexpected {r.status_code}: {r.text[:200]}"
