"""
Iteration 62 – Meta Conversions API (CAPI) integration tests.
Covers /api/meta/status, /api/meta/test, /api/meta/events, and the lead/order
create-side hooks that push events to Meta silently.
"""
import os
import time
import random
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

ADMIN_EMAIL = "admin@celestaglow.com"
ADMIN_PW = "admin123"
TC_EMAIL = "telecaller1@celestaglow.com"
TC_PW = "tc123"

SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="session")
def tc_token():
    return _login(TC_EMAIL, TC_PW)


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def tc_h(tc_token):
    return {"Authorization": f"Bearer {tc_token}"}


# ── /api/meta/status ─────────────────────────────────────────────────────────
class TestMetaStatus:
    def test_status_admin(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/meta/status", headers=admin_h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["configured"] is True
        assert d["enabled"] is True
        # pixel masked
        assert "…" in d["pixel_id"] and d["pixel_id"] != ""
        assert "…" in d["token_masked"] and d["token_masked"] != ""
        assert d["graph_version"].startswith("v")
        assert "totals" in d
        assert set(d["totals"].keys()) >= {"total", "ok", "failed"}
        assert isinstance(d.get("recent_events"), list)

    def test_status_forbidden_for_tc(self, tc_h):
        r = requests.get(f"{BASE_URL}/api/meta/status", headers=tc_h, timeout=30)
        assert r.status_code == 403

    def test_status_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/meta/status", timeout=30)
        assert r.status_code == 401


# ── /api/meta/test ───────────────────────────────────────────────────────────
class TestMetaTest:
    def test_fire_test_event_live(self, admin_h):
        payload = {
            "name": "TEST Meta User",
            "phone": "9988776655",
            "email": "test_meta@example.com",
            "amount": 1499,
        }
        r = requests.post(f"{BASE_URL}/api/meta/test", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        result = r.json().get("result", {})
        assert result.get("status") == 200, f"Meta non-200: {result}"
        body = result.get("body") or {}
        assert body.get("events_received") == 1, f"events_received != 1: {body}"
        assert "fbtrace_id" in body

    def test_fire_test_forbidden_for_tc(self, tc_h):
        r = requests.post(
            f"{BASE_URL}/api/meta/test",
            json={"name": "x", "phone": "9988776655", "email": "x@x.com", "amount": 1},
            headers=tc_h, timeout=30,
        )
        assert r.status_code == 403


# ── /api/leads → fires Lead event ────────────────────────────────────────────
class TestLeadHook:
    def test_create_lead_fires_meta_lead_event(self, admin_h):
        phone = "9988" + "".join(str(random.randint(0, 9)) for _ in range(6))
        payload = {
            "phone_number": phone,
            "name": "TEST_Meta Lead",
            "email": "meta_lead@example.com",
            "product_interest": "sunscreen",
            "source": "instagram",
            "customer_city": "Kochi",
            "customer_state": "Kerala",
            "customer_pincode": "682001",
        }
        r = requests.post(f"{BASE_URL}/api/leads", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        lead = r.json().get("lead")
        assert lead and lead.get("id")
        lead_id = lead["id"]
        expected_event_id = f"lead-{lead_id}"
        # Poll up to 8s for the async fire-and-forget task to log
        found = None
        deadline = time.time() + 8
        while time.time() < deadline:
            ev_resp = requests.get(f"{BASE_URL}/api/meta/events?limit=20", headers=admin_h, timeout=30)
            assert ev_resp.status_code == 200
            for ev in ev_resp.json().get("events", []):
                if ev.get("event_id") == expected_event_id:
                    found = ev
                    break
            if found:
                break
            time.sleep(0.7)
        assert found is not None, "Lead event never logged in meta_events"
        assert found["event_name"] == "Lead"
        assert found.get("ok") is True, f"Meta rejected: {found.get('meta_response')}"
        assert found["meta_response"]["status"] == 200
        # PII hash spot-check — only assert on the fields the lead endpoint stores today.
        # NOTE: create_lead currently does NOT persist email/city/state/pincode,
        # so those hashed fields will be missing in Meta payload. See action_items.
        ud = found["event"]["user_data"]
        for k in ("ph", "fn", "country"):
            assert k in ud, f"missing hashed field {k}"
            assert isinstance(ud[k], list) and len(ud[k]) == 1
            assert SHA256_RE.match(ud[k][0]), f"{k} not SHA-256 hex"
        import json as _json
        ud_str = _json.dumps(ud)
        assert phone not in ud_str
        # custom_data should have lead_id in plain text
        cd = found["event"]["custom_data"]
        assert cd.get("lead_id") == lead_id


# ── /api/orders → fires Purchase event ───────────────────────────────────────
class TestOrderHook:
    def test_create_order_fires_meta_purchase_event(self, admin_h):
        phone = "9988" + "".join(str(random.randint(0, 9)) for _ in range(6))
        # First create a lead so order can attach (some server flows require it),
        # but /api/orders typically accepts customer info directly.
        order_payload = {
            "customer_name": "TEST_Meta Purchase",
            "customer_phone": phone,
            "customer_email": "meta_purchase@example.com",
            "customer_address": "123 test street",
            "customer_city": "Kochi",
            "customer_state": "Kerala",
            "customer_pincode": "682001",
            "items": [{"product_id": "prod-001", "product_name": "SPF 50", "quantity": 2, "price": 599}],
            "total_amount": 1198,
            "payment_type": "cod",
            "payment_status": "pending",
        }
        r = requests.post(f"{BASE_URL}/api/orders", json=order_payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        order = r.json().get("order") or r.json()
        order_id = order.get("id")
        assert order_id, f"no order id in response: {r.text[:400]}"
        expected_event_id = f"purchase-{order_id}"
        found = None
        deadline = time.time() + 10
        while time.time() < deadline:
            ev_resp = requests.get(f"{BASE_URL}/api/meta/events?limit=20", headers=admin_h, timeout=30)
            assert ev_resp.status_code == 200
            for ev in ev_resp.json().get("events", []):
                if ev.get("event_id") == expected_event_id:
                    found = ev
                    break
            if found:
                break
            time.sleep(0.8)
        assert found is not None, f"Purchase event never logged for {order_id}"
        assert found["event_name"] == "Purchase"
        assert found.get("ok") is True, f"Meta rejected: {found.get('meta_response')}"
        assert found["meta_response"]["status"] == 200
        cd = found["event"]["custom_data"]
        assert cd["order_id"] == order_id
        assert cd["value"] == 1198
        assert cd["currency"] == "INR"
        assert cd["num_items"] == 2
        ud = found["event"]["user_data"]
        for k in ("ph", "fn", "ct", "zp"):
            assert k in ud and SHA256_RE.match(ud[k][0])


# ── /api/meta/events sorting ─────────────────────────────────────────────────
class TestMetaEventsList:
    def test_events_sorted_desc(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/meta/events?limit=20", headers=admin_h, timeout=30)
        assert r.status_code == 200
        evs = r.json().get("events", [])
        assert isinstance(evs, list)
        if len(evs) >= 2:
            times = [e.get("at", "") for e in evs]
            assert times == sorted(times, reverse=True), "events not sorted by at desc"

    def test_events_forbidden_for_tc(self, tc_h):
        r = requests.get(f"{BASE_URL}/api/meta/events", headers=tc_h, timeout=30)
        assert r.status_code == 403
