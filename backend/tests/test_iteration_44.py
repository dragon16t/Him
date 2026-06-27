"""
Iteration 44 — Backend acceptance tests
Covers:
  - Agent storefront active!=False relaxation (GET /api/store/{slug}/meta + /products)
  - SM agent create persists store_url + agent_portal_url
  - GET /api/today-stats?date_str=YYYY-MM-DD with arbitrary date + 'date' field in response
  - PUT /api/orders/{id}/badges (add/remove/replace + RBAC 403 for TC/agent)
  - DELETE /api/orders/{id}/soft-delete now permits inventory_manager
  - PUT /api/orders/{id} - inventory_manager can edit non-delivered order
  - GET /api/v2/orders returns items[] with name/quantity
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@celestaglow.com", "admin123"),
    "sm":    ("salesmanager@celestaglow.com", "sm123"),
    "tc1":   ("telecaller1@celestaglow.com", "tc123"),
    "inv":   ("inventory@celestaglow.com", "inv123"),
    "agent1": ("agent1@celestaglow.com", "agent123"),
}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for k, (e, p) in CREDS.items():
        try:
            out[k] = _login(e, p)
        except AssertionError as ex:
            print(f"WARN login skip {k}: {ex}")
            out[k] = None
    return out


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Agent storefront tests ----------
@pytest.fixture(scope="module")
def created_agent(tokens):
    """Create an agent via SM and return its slug/store_url."""
    sm = tokens["sm"]
    payload = {
        "name": "TEST_Agent_Iter44",
        "email": f"test_iter44_{int(time.time())}@example.com",
        "phone": "9000044044",
        "city": "Mumbai",
    }
    r = requests.post(f"{API}/sales-manager/agents", json=payload, headers=_h(sm), timeout=20)
    assert r.status_code in (200, 201), f"agent create failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    if isinstance(data, dict) and "agent" in data and isinstance(data["agent"], dict):
        data = {**data["agent"], **{k: v for k, v in data.items() if k != "agent"}}
    return data


def test_sm_agent_create_returns_urls(created_agent):
    """SM POST /sales-manager/agents returns store_url + agent_portal_url."""
    assert "store_url" in created_agent and created_agent["store_url"], f"missing store_url: {created_agent}"
    assert "agent_portal_url" in created_agent and created_agent["agent_portal_url"], f"missing agent_portal_url"
    assert "/store/" in created_agent["store_url"]


def test_sm_agent_list_persists_urls(tokens, created_agent):
    """GET /sales-manager/agents must return store_url + agent_portal_url on the doc."""
    sm = tokens["sm"]
    r = requests.get(f"{API}/sales-manager/agents", headers=_h(sm), timeout=20)
    assert r.status_code == 200
    agents = r.json()
    if isinstance(agents, dict):
        agents = agents.get("agents") or agents.get("data") or []
    match = next((a for a in agents if a.get("email") == created_agent.get("email") or a.get("id") == created_agent.get("id")), None)
    assert match, f"newly created agent not found in list. emails={[a.get('email') for a in agents[:10]]}"
    assert match.get("store_url"), f"store_url not persisted on agent: {match}"
    assert match.get("agent_portal_url"), f"agent_portal_url not persisted: {match}"


def test_store_meta_returns_agent(created_agent):
    """GET /api/store/{slug}/meta returns 200 with agent name (active!=False relaxation)."""
    store_url = created_agent.get("store_url", "")
    slug = store_url.rstrip("/").split("/store/")[-1]
    assert slug, f"could not parse slug from {store_url}"
    r = requests.get(f"{API}/store/{slug}/meta", timeout=15)
    assert r.status_code == 200, f"store meta failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    # Agent name should be in response
    name_lc = (created_agent.get("name") or "").lower()
    body_lc = str(j).lower()
    assert "test_agent_iter44" in body_lc or name_lc[:10] in body_lc, f"agent name missing in store meta: {j}"


def test_store_products_array(created_agent):
    """GET /api/store/{slug}/products returns a products array."""
    slug = created_agent["store_url"].rstrip("/").split("/store/")[-1]
    r = requests.get(f"{API}/store/{slug}/products", timeout=15)
    assert r.status_code == 200, f"products failed: {r.status_code} {r.text[:200]}"
    j = r.json()
    # Accept either a list or { products: [...] }
    products = j if isinstance(j, list) else (j.get("products") or j.get("data") or [])
    assert isinstance(products, list), f"products is not a list: {type(products)} -> {str(j)[:200]}"


# ---------- today-stats with date_str ----------
def test_today_stats_accepts_date_str(tokens):
    inv = tokens["inv"]
    # empty past day
    r = requests.get(f"{API}/today-stats?date_str=2020-01-01", headers=_h(inv), timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    j = r.json()
    assert "date" in j, f"missing date field: {j}"
    assert j["date"] == "2020-01-01" or "2020-01-01" in str(j["date"]), f"date mismatch: {j['date']}"
    # past empty day -> zero
    assert j.get("orders_today_count", j.get("orders_today", 0)) == 0
    rev = j.get("revenue_today", j.get("revenue", 0))
    assert rev == 0 or rev == 0.0


def test_today_stats_today(tokens):
    inv = tokens["inv"]
    r = requests.get(f"{API}/today-stats", headers=_h(inv), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "date" in j, f"missing date field: {j}"


# ---------- Order badges + RBAC ----------
@pytest.fixture(scope="module")
def created_order(tokens):
    """TC1 creates a TEST_ order; return its id."""
    tc = tokens["tc1"]
    # get products
    pr = requests.get(f"{API}/products", headers=_h(tc), timeout=15)
    assert pr.status_code == 200, pr.text[:200]
    plist = pr.json() if isinstance(pr.json(), list) else (pr.json().get("products") or [])
    assert plist, "no products to build order"
    p0 = plist[0]
    payload = {
        "customer_name": "TEST_Iter44_Cust",
        "customer_phone": "9000044045",
        "customer_address": "TEST address Mumbai",
        "payment_type": "COD",
        "items": [{
            "product_id": p0.get("id") or p0.get("_id"),
            "product_name": p0.get("name", "Test Product"),
            "name": p0.get("name", "Test Product"),
            "quantity": 1,
            "price": float(p0.get("price", 100) or 100),
        }],
        "total": float(p0.get("price", 100) or 100),
        "status": "pending",
    }
    r = requests.post(f"{API}/orders", json=payload, headers=_h(tc), timeout=20)
    assert r.status_code in (200, 201), f"order create: {r.status_code} {r.text[:400]}"
    j = r.json()
    oid = j.get("id") or (j.get("order") or {}).get("id") or j.get("order_id") or j.get("_id")
    assert oid, f"no order id in response: {j}"
    return oid


def test_badge_add(tokens, created_order):
    inv = tokens["inv"]
    r = requests.put(f"{API}/orders/{created_order}/badges", json={"add": "DTDC"}, headers=_h(inv), timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    j = r.json()
    badges = j.get("badges") or (j.get("order") or {}).get("badges") or []
    assert "DTDC" in badges, f"DTDC not in badges: {badges}"


def test_badge_replace(tokens, created_order):
    admin = tokens["admin"]
    r = requests.put(f"{API}/orders/{created_order}/badges",
                     json={"badges": ["DTDC", "Priority"]}, headers=_h(admin), timeout=15)
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    badges = j.get("badges") or (j.get("order") or {}).get("badges") or []
    assert set(badges) >= {"DTDC", "Priority"}, f"replace failed: {badges}"


def test_badge_remove(tokens, created_order):
    sm = tokens["sm"]
    r = requests.put(f"{API}/orders/{created_order}/badges", json={"remove": "DTDC"}, headers=_h(sm), timeout=15)
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    badges = j.get("badges") or (j.get("order") or {}).get("badges") or []
    assert "DTDC" not in badges, f"remove failed: {badges}"


def test_badge_custom_with_convenience_fields(tokens, created_order):
    inv = tokens["inv"]
    body = {"add": "CustomTag44", "courier_name": "DTDC", "shipment_date": "2026-06-30"}
    r = requests.put(f"{API}/orders/{created_order}/badges", json=body, headers=_h(inv), timeout=15)
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    badges = j.get("badges") or (j.get("order") or {}).get("badges") or []
    assert "CustomTag44" in badges, f"custom badge missing: {badges}"


def test_badge_rbac_telecaller_forbidden(tokens, created_order):
    tc = tokens["tc1"]
    r = requests.put(f"{API}/orders/{created_order}/badges", json={"add": "BadgeFromTC"}, headers=_h(tc), timeout=15)
    assert r.status_code in (403, 401), f"TC should be forbidden but got {r.status_code} {r.text[:200]}"


def test_badge_rbac_agent_forbidden(tokens, created_order):
    ag = tokens.get("agent1")
    if not ag:
        pytest.skip("agent1 token missing")
    r = requests.put(f"{API}/orders/{created_order}/badges", json={"add": "BadgeFromAgent"}, headers=_h(ag), timeout=15)
    assert r.status_code in (403, 401), f"agent should be forbidden but got {r.status_code}"


# ---------- IM edit order ----------
def test_inventory_manager_edit_order(tokens, created_order):
    inv = tokens["inv"]
    payload = {
        "customer_address": "TEST updated addr by IM",
        "customer_phone": "9000099999",
        "payment_type": "Prepaid",
    }
    r = requests.put(f"{API}/orders/{created_order}", json=payload, headers=_h(inv), timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    # verify persistence
    g = requests.get(f"{API}/orders/{created_order}", headers=_h(inv), timeout=15)
    if g.status_code == 200:
        j = g.json()
        order = j.get("order") or j
        assert order.get("customer_address") == "TEST updated addr by IM", f"addr not persisted: {order.get('customer_address')}"
        assert order.get("payment_type") == "Prepaid", f"payment_type: {order.get('payment_type')}"


# ---------- IM soft-delete ----------
def test_inventory_manager_soft_delete(tokens):
    """IM creates-by-TC-then-soft-deletes a separate order."""
    tc = tokens["tc1"]
    inv = tokens["inv"]
    pr = requests.get(f"{API}/products", headers=_h(tc), timeout=15)
    plist = pr.json() if isinstance(pr.json(), list) else (pr.json().get("products") or [])
    p0 = plist[0]
    payload = {
        "customer_name": "TEST_Iter44_DelCust",
        "customer_phone": "9000044046",
        "customer_address": "TEST del addr",
        "payment_type": "COD",
        "items": [{"product_id": p0.get("id") or p0.get("_id"),
                   "product_name": p0.get("name"), "name": p0.get("name"),
                   "quantity": 1, "price": float(p0.get("price", 100) or 100)}],
        "total": float(p0.get("price", 100) or 100),
        "status": "pending",
    }
    cr = requests.post(f"{API}/orders", json=payload, headers=_h(tc), timeout=20)
    assert cr.status_code in (200, 201)
    oid = cr.json().get("id") or (cr.json().get("order") or {}).get("id") or cr.json().get("order_id")
    # IM soft-delete
    d = requests.delete(f"{API}/orders/{oid}/soft-delete", headers=_h(inv), timeout=15)
    assert d.status_code in (200, 204), f"IM soft-delete failed: {d.status_code} {d.text[:300]}"


# ---------- v2/orders items[] ----------
def test_v2_orders_items_present(tokens):
    admin = tokens["admin"]
    r = requests.get(f"{API}/v2/orders?limit=10", headers=_h(admin), timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    j = r.json()
    orders = j.get("orders") if isinstance(j, dict) else j
    if not orders:
        # try without query
        r = requests.get(f"{API}/v2/orders", headers=_h(admin), timeout=20)
        j = r.json()
        orders = j.get("orders") if isinstance(j, dict) else j
    assert orders and len(orders) > 0, "no orders to validate"
    # find one with items
    found = False
    for o in orders[:20]:
        items = o.get("items") or []
        if items and isinstance(items, list):
            it = items[0]
            assert ("name" in it) or ("product_name" in it), f"item missing name: {it}"
            assert "quantity" in it or "qty" in it, f"item missing quantity: {it}"
            found = True
            break
    assert found, "no order with items[] found in v2/orders"
