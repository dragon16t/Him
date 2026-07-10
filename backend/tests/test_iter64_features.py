"""Iteration 64 tests: dedupe, manager-distribute, weekly-performance, order → lead flow."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for backend-run env
    with open("/app/frontend/.env") as f:
        for l in f:
            if l.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = l.split("=", 1)[1].strip().rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login("admin@celestaglow.com", "admin123")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def sm_headers():
    tok = _login("salesmanager@celestaglow.com", "sm123")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tc_headers():
    tok = _login("telecaller1@celestaglow.com", "tc123")
    return {"Authorization": f"Bearer {tok}"}


UNIQ = str(int(time.time()))[-6:]


# ---------------- 1. Duplicate lead creation returns 409 ----------------
class TestDuplicateLead:
    def test_create_then_duplicate_returns_409(self, admin_headers):
        phone = f"98{UNIQ}1234"[-10:]
        payload = {"phone_number": phone, "name": f"TEST_dup_{UNIQ}", "source": "manual"}
        r1 = requests.post(f"{BASE_URL}/api/leads", json=payload, headers=admin_headers)
        assert r1.status_code == 200, r1.text
        lead_id = r1.json()["lead"]["id"]

        # duplicate
        r2 = requests.post(f"{BASE_URL}/api/leads", json=payload, headers=admin_headers)
        assert r2.status_code == 409, r2.text
        assert "already exists" in r2.json().get("detail", "").lower()

        # cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers,
                        json={"password": "delete"})

    def test_fresh_phone_still_works(self, admin_headers):
        phone = f"97{UNIQ}5678"[-10:]
        r = requests.post(f"{BASE_URL}/api/leads",
                          json={"phone_number": phone, "name": f"TEST_fresh_{UNIQ}"},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        lid = r.json()["lead"]["id"]
        requests.delete(f"{BASE_URL}/api/leads/{lid}", headers=admin_headers,
                        json={"password": "delete"})


# ---------------- 2. Dedupe endpoint ----------------
class TestDedupe:
    def test_dry_run_no_mutation(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/leads/dedupe", json={"dry_run": True}, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "groups_processed" in data and "merged" in data and "removed" in data
        assert data["dry_run"] is True

    def test_wet_run(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/leads/dedupe", json={}, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["dry_run"] is False
        assert isinstance(data["merged"], int)
        assert isinstance(data["removed"], int)

    def test_tc_forbidden(self, tc_headers):
        r = requests.post(f"{BASE_URL}/api/leads/dedupe", json={}, headers=tc_headers)
        assert r.status_code == 403


# ---------------- 3. Manager-distribute (round-robin) ----------------
class TestManagerDistribute:
    def test_distribute_round_robin(self, admin_headers):
        # Get 2 TCs
        r = requests.get(f"{BASE_URL}/api/telecallers", headers=admin_headers)
        assert r.status_code == 200
        tcs_data = r.json()
        tcs = tcs_data.get("telecallers", tcs_data) if isinstance(tcs_data, dict) else tcs_data
        assert isinstance(tcs, list) and len(tcs) >= 2, f"Need >=2 telecallers, got {len(tcs) if isinstance(tcs,list) else 'N/A'}"
        tc_ids = [tcs[0]["id"], tcs[1]["id"]]

        # create 4 test leads
        lead_ids = []
        for i in range(4):
            phone = f"96{UNIQ}{i}00"[-10:]
            r = requests.post(f"{BASE_URL}/api/leads",
                              json={"phone_number": phone, "name": f"TEST_dist_{UNIQ}_{i}"},
                              headers=admin_headers)
            if r.status_code == 200:
                lead_ids.append(r.json()["lead"]["id"])
        assert len(lead_ids) >= 2

        r = requests.post(f"{BASE_URL}/api/leads/manager-distribute",
                          json={"lead_ids": lead_ids, "telecaller_ids": tc_ids},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "per_telecaller" in data
        total = sum(x["assigned"] for x in data["per_telecaller"])
        assert total == len(lead_ids)
        counts = sorted([x["assigned"] for x in data["per_telecaller"]])
        # Round-robin: max-min <= 1
        assert counts[-1] - counts[0] <= 1

        # cleanup
        for lid in lead_ids:
            requests.delete(f"{BASE_URL}/api/leads/{lid}", headers=admin_headers,
                            json={"password": "delete"})

    def test_missing_body_returns_400(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/leads/manager-distribute",
                          json={"lead_ids": [], "telecaller_ids": []},
                          headers=admin_headers)
        assert r.status_code == 400


# ---------------- 4. Weekly performance ----------------
class TestWeeklyPerformance:
    def test_basic_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/weekly-performance", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("week_start", "week_end", "days", "target_qty", "rows"):
            assert k in d, f"missing {k}"
        assert d["target_qty"] == 18
        assert len(d["days"]) == 7
        # sorted by gap desc
        gaps = [r["gap"] for r in d["rows"]]
        assert gaps == sorted(gaps, reverse=True)
        # rows shape
        if d["rows"]:
            row = d["rows"][0]
            for k in ("per_day", "total_orders", "total_qty", "gap", "status"):
                assert k in row
            assert row["status"] in ("red", "amber", "green")
            assert len(row["per_day"]) == 7

    def test_with_week_start(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/weekly-performance?week_start=2026-01-05",
                         headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["week_start"] == "2026-01-05"

    def test_tc_forbidden(self, tc_headers):
        r = requests.get(f"{BASE_URL}/api/admin/weekly-performance", headers=tc_headers)
        assert r.status_code == 403


# ---------------- 5. Order creation clears follow-up and sets status ----------------
class TestOrderFlow:
    def test_order_creates_updates_lead(self, admin_headers, tc_headers):
        # Create fresh lead via admin
        phone = f"95{UNIQ}7000"[-10:]
        r = requests.post(f"{BASE_URL}/api/leads",
                          json={"phone_number": phone, "name": f"TEST_order_{UNIQ}",
                                "next_follow_up_date": "2026-06-01"},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        lead_id = r.json()["lead"]["id"]

        # fetch a product
        rp = requests.get(f"{BASE_URL}/api/products", headers=admin_headers)
        assert rp.status_code == 200
        prods = rp.json()
        prods = prods.get("products", prods) if isinstance(prods, dict) else prods
        assert prods, "No products in system"
        prod = prods[0]

        # place order
        order_payload = {
            "lead_id": lead_id,
            "customer_name": "TEST_customer",
            "customer_phone": phone,
            "customer_address": "TEST addr",
            "state": "Maharashtra", "city": "Pune", "pincode": "411001",
            "items": [{"product_id": prod["id"], "quantity": 1, "price": prod.get("price", 100)}],
            "total_amount": prod.get("price", 100),
            "payment_type": "cod",
        }
        ro = requests.post(f"{BASE_URL}/api/orders", json=order_payload, headers=admin_headers)
        assert ro.status_code == 200, ro.text

        # verify lead updated
        rl = requests.get(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers)
        assert rl.status_code == 200
        lead = rl.json()["lead"]
        assert lead["status"] == "order_created", f"got {lead['status']}"
        assert lead["next_follow_up_date"] in ("", None)
        assert lead.get("next_repeat_order_date"), "next_repeat_order_date not set"
        assert lead.get("last_order_date"), "last_order_date not set"

        # cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=admin_headers,
                        json={"password": "delete"})
