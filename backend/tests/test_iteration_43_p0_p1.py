"""
Iteration 43 — P0 + P1 features regression suite
Covers:
  - Product badges (GET, PUT add/remove/replace, RBAC)
  - Order reorder (POST /api/orders/{id}/reorder)
  - GET /api/v2/orders includes items array
  - GET /api/leads dedup by phone_number_norm for SM/admin
  - Sales Manager agent create persists store_url + agent_portal_url
  - SMM zero-value influencer order
  - ADMIN_FORCE_RESET code path is present (source check)
"""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# fall back to known frontend env if backend env doesn't have it
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@celestaglow.com", "admin123"),
    "sm":    ("salesmanager@celestaglow.com", "sm123"),
    "tc1":   ("telecaller1@celestaglow.com", "tc123"),
    "inv":   ("inventory@celestaglow.com", "inv123"),
    "smm":   ("socialmedia@celestaglow.com", "social123"),
}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for k, (e, p) in CREDS.items():
        try:
            out[k] = _login(e, p)
        except AssertionError as ex:
            pytest.skip(f"login skip ({k}): {ex}")
    return out


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- Badges ----------------

class TestProductBadges:
    def _first_product(self, tok):
        r = requests.get(f"{API}/products", headers=_h(tok), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        products = data if isinstance(data, list) else data.get("products", [])
        assert products, "no products returned"
        return products[0]

    def test_put_badges_add_remove_replace_and_get_persists(self, tokens):
        prod = self._first_product(tokens["inv"])
        pid = prod["id"]

        # add
        r = requests.put(f"{API}/products/{pid}/badges", json={"add": "TEST_Bestseller"}, headers=_h(tokens["inv"]), timeout=20)
        assert r.status_code == 200, r.text
        assert "TEST_Bestseller" in r.json()["badges"]

        # GET persists
        r = requests.get(f"{API}/products", headers=_h(tokens["inv"]), timeout=20)
        prods = r.json() if isinstance(r.json(), list) else r.json().get("products", [])
        match = next((p for p in prods if p["id"] == pid), None)
        assert match and "TEST_Bestseller" in (match.get("badges") or []), f"badge not persisted: {match.get('badges')}"

        # remove
        r = requests.put(f"{API}/products/{pid}/badges", json={"remove": "TEST_Bestseller"}, headers=_h(tokens["inv"]), timeout=20)
        assert r.status_code == 200
        assert "TEST_Bestseller" not in r.json()["badges"]

        # replace
        r = requests.put(f"{API}/products/{pid}/badges", json={"badges": ["New", "Hot Pick"]}, headers=_h(tokens["admin"]), timeout=20)
        assert r.status_code == 200
        assert set(r.json()["badges"]) == {"New", "Hot Pick"}

        # cleanup
        requests.put(f"{API}/products/{pid}/badges", json={"badges": []}, headers=_h(tokens["admin"]), timeout=20)

    def test_put_badges_forbidden_for_non_admin_non_inv(self, tokens):
        prod = self._first_product(tokens["admin"])
        pid = prod["id"]
        r = requests.put(f"{API}/products/{pid}/badges", json={"add": "X"}, headers=_h(tokens["tc1"]), timeout=20)
        assert r.status_code == 403, f"expected 403 for telecaller, got {r.status_code}"


# ---------------- Reorder ----------------

class TestReorder:
    def _make_order_for_tc1(self, tokens):
        # Telecaller creates a small order
        prods_resp = requests.get(f"{API}/products", headers=_h(tokens["tc1"]), timeout=20).json()
        prods = prods_resp if isinstance(prods_resp, list) else prods_resp.get("products", [])
        assert prods, "no products"
        p = prods[0]
        payload = {
            "customer_name": "TEST_Reorder Customer",
            "customer_phone": "9990000001",
            "customer_address": "Test Address",
            "customer_city": "Kochi",
            "customer_state": "Kerala",
            "customer_pincode": "682001",
            "items": [{"product_id": p["id"], "product_name": p.get("name", ""), "price": p.get("price", 100) or 100, "quantity": 1}],
            "total_amount": p.get("price", 100) or 100,
            "payment_type": "cod",
            "status": "pending",
        }
        r = requests.post(f"{API}/orders", json=payload, headers=_h(tokens["tc1"]), timeout=20)
        assert r.status_code in (200, 201), r.text
        order = r.json()
        oid = order.get("id") or order.get("order", {}).get("id")
        assert oid
        return oid

    def test_reorder_creates_pending_with_reorder_of(self, tokens):
        oid = self._make_order_for_tc1(tokens)
        r = requests.post(f"{API}/orders/{oid}/reorder", json={}, headers=_h(tokens["tc1"]), timeout=20)
        assert r.status_code == 200, r.text
        new = r.json()["order"]
        assert new["status"] == "pending"
        assert new["reorder_of"] == oid
        assert new["customer_phone"] == "9990000001"
        assert len(new["items"]) >= 1

    def test_reorder_forbidden_for_unrelated_telecaller(self, tokens):
        # tc1 creates, tc2 attempts
        if "tc2" not in tokens:
            try:
                tokens["tc2"] = _login("telecaller2@celestaglow.com", "tc123")
            except Exception:
                pytest.skip("tc2 not available")
        oid = self._make_order_for_tc1(tokens)
        r = requests.post(f"{API}/orders/{oid}/reorder", json={}, headers=_h(tokens["tc2"]), timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_admin_can_reorder(self, tokens):
        oid = self._make_order_for_tc1(tokens)
        r = requests.post(f"{API}/orders/{oid}/reorder", json={}, headers=_h(tokens["admin"]), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["order"]["reorder_of"] == oid


# ---------------- v2 orders items ----------------

class TestV2OrdersIncludeItems:
    def test_v2_orders_has_items(self, tokens):
        r = requests.get(f"{API}/v2/orders", headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        orders = data.get("orders") if isinstance(data, dict) else data
        assert orders, "no orders returned"
        # find an order that has items
        with_items = [o for o in orders if isinstance(o.get("items"), list)]
        assert with_items, "no order has items array"
        # most recent orders (we just created some) should have item dicts
        sample = with_items[0]
        assert isinstance(sample["items"], list)


# ---------------- Leads dedup ----------------

class TestLeadsDedupSM:
    def test_dedup_by_phone_number_norm_for_sm(self, tokens):
        """Inject two leads with same phone_number_norm directly into mongo (API
        blocks duplicates on create) and verify GET /api/leads as SM dedupes."""
        import asyncio
        import uuid as _uuid
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
        db_name = os.environ.get("DB_NAME") or "celesta_glow"
        # try to load from backend .env if missing
        try:
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("DB_NAME="):
                        db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if line.startswith("MONGO_URL="):
                        mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass

        phone = "9988001122"
        async def _seed():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            # purge any prior test leads with this phone
            await db.leads.delete_many({"phone_number_norm": phone})
            for i in range(2):
                await db.leads.insert_one({
                    "id": f"lead-TEST_{_uuid.uuid4().hex[:6]}",
                    "name": f"TEST_Dedup_{i}",
                    "phone_number": phone,
                    "phone_number_norm": phone,
                    "source": "manual",
                    "status": "new",
                    "remarks": "dedup test",
                    "created_by": "sm-001",
                    "assigned_to": "sm-001",
                    "created_at": f"2026-01-0{i+1}T00:00:00",
                })
            client.close()
        asyncio.run(_seed())

        # SM view
        r = requests.get(f"{API}/leads?limit=5000", headers=_h(tokens["sm"]), timeout=30)
        assert r.status_code == 200, r.text
        leads = r.json().get("leads", [])
        same_phone = [l for l in leads if (l.get("phone_number_norm") or "") == phone]
        assert len(same_phone) == 1, f"dedup failed: {len(same_phone)} leads visible for SM (expected exactly 1)"

        # admin also sees deduped
        r = requests.get(f"{API}/leads?limit=5000", headers=_h(tokens["admin"]), timeout=30)
        leads = r.json().get("leads", [])
        same_phone = [l for l in leads if (l.get("phone_number_norm") or "") == phone]
        assert len(same_phone) == 1, f"admin dedup failed: {len(same_phone)} leads"


# ---------------- SM creates agent with portal+store URL ----------------

class TestSMAgentURLs:
    def test_sm_create_agent_returns_urls(self, tokens):
        import uuid
        suffix = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_Agent_{suffix}",
            "email": f"test_agent_{suffix}@example.com",
            "phone": f"99{suffix[:8]}",
            "password": "agentpw123",
        }
        r = requests.post(f"{API}/sales-manager/agents", json=payload, headers=_h(tokens["sm"]), timeout=20)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        agent = body.get("agent") if isinstance(body, dict) and "agent" in body else body
        store_url = agent.get("store_url")
        portal_url = agent.get("agent_portal_url")
        assert store_url, f"missing store_url: {agent}"
        assert portal_url, f"missing agent_portal_url: {agent}"
        assert "agent-login" in portal_url, f"portal url malformed: {portal_url}"

        # GET list also returns same fields
        r2 = requests.get(f"{API}/sales-manager/agents", headers=_h(tokens["sm"]), timeout=20)
        assert r2.status_code == 200
        body2 = r2.json()
        agents = body2.get("agents") if isinstance(body2, dict) else body2
        match = next((a for a in agents if a.get("id") == agent.get("id") or a.get("email") == payload["email"]), None)
        assert match, f"created agent not in list"
        assert match.get("store_url") and match.get("agent_portal_url"), f"list missing urls: {match}"


# ---------------- SMM zero-value order ----------------

class TestSMMZeroOrder:
    def test_smm_creates_zero_value_order(self, tokens):
        prods_resp = requests.get(f"{API}/products", headers=_h(tokens["smm"]), timeout=20).json()
        prods = prods_resp if isinstance(prods_resp, list) else prods_resp.get("products", [])
        assert prods, "no products"
        p = prods[0]
        payload = {
            "customer_name": "TEST_Influencer_X",
            "customer_phone": "9776655443",
            "customer_address": "Test Influencer Addr",
            "customer_city": "Kochi",
            "customer_state": "Kerala",
            "customer_pincode": "682001",
            "items": [{"product_id": p["id"], "product_name": p.get("name", ""), "price": 0, "quantity": 1}],
            "total_amount": 0,
            "payment_type": "free_influencer",
            "source": "influencer",
            "status": "pending",
        }
        r = requests.post(f"{API}/orders", json=payload, headers=_h(tokens["smm"]), timeout=20)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        oid = body.get("id") or body.get("order", {}).get("id")
        assert oid, f"no order id: {body}"

        # confirm in v2 list
        r = requests.get(f"{API}/v2/orders", headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200
        orders = r.json().get("orders") if isinstance(r.json(), dict) else r.json()
        match = next((o for o in orders if o.get("id") == oid), None)
        assert match, "newly created zero-value order not visible in v2/orders"
        assert float(match.get("total_amount", -1)) == 0.0


# ---------------- ADMIN_FORCE_RESET code path ----------------

def test_admin_force_reset_code_path_exists():
    """Static check: server.py seed_database honours ADMIN_FORCE_RESET env var."""
    with open("/app/backend/server.py") as f:
        src = f.read()
    assert "ADMIN_FORCE_RESET" in src
    # The block must be inside seed_database (after function def, before next async def)
    m = re.search(r"async def seed_database.*?(?=\nasync def |\ndef )", src, re.DOTALL)
    assert m, "seed_database function not found"
    body = m.group(0)
    assert "ADMIN_FORCE_RESET" in body, "ADMIN_FORCE_RESET not present inside seed_database"
    assert "force_reset_at" in body, "force_reset_at timestamp missing"
