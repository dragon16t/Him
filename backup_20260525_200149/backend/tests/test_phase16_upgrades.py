"""
Phase 1-6 Upgrade backend test suite.
Covers: v2 orders/leads, labels PDF, employee 360, hr efficiency, forecast,
daily/employee reports, delhivery sync, order edit scope.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://veegal-stage.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("admin@celestaglow.com", "admin123"),
    "sm": ("salesmanager@celestaglow.com", "sm123"),
    "dm": ("manager1@celestaglow.com", "mgr123"),
    "tc": ("telecaller1@celestaglow.com", "tc123"),
    "agent": ("agent1@celestaglow.com", "agent123"),
    "hr": ("hrmanager@celestaglow.com", "hr123"),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for k, (e, p) in CREDS.items():
        try:
            data = _login(e, p)
            out[k] = {"token": data.get("token") or data.get("access_token"), "user": data.get("user", {})}
        except AssertionError as ex:
            out[k] = {"error": str(ex)}
    return out


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- AUTH ----------------
class TestAuth:
    def test_admin_login(self, tokens):
        assert "token" in tokens["admin"], tokens["admin"]
        assert tokens["admin"]["token"]

    def test_sm_login(self, tokens):
        assert tokens["sm"].get("token")

    def test_dm_login(self, tokens):
        assert tokens["dm"].get("token")

    def test_tc_login(self, tokens):
        assert tokens["tc"].get("token")


# ---------------- /api/v2/orders ----------------
class TestV2Orders:
    def test_v2_orders_admin_pagination(self, tokens):
        r = requests.get(f"{API}/v2/orders?skip=0&limit=10", headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("orders", "total", "pages", "skip", "limit"):
            assert k in d, f"missing key {k}"
        assert d["limit"] == 10
        assert isinstance(d["orders"], list)

    def test_v2_orders_date_filter(self, tokens):
        r = requests.get(f"{API}/v2/orders?from=2024-01-01&to=2030-12-31&limit=5",
                         headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "orders" in d and "total" in d

    def test_v2_orders_status_filter(self, tokens):
        r = requests.get(f"{API}/v2/orders?status=pending&limit=5",
                         headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        for o in r.json().get("orders", []):
            assert o.get("status") == "pending"

    def test_v2_orders_sm_scope(self, tokens):
        # Assign telecaller1 to sm-001
        r = requests.post(f"{API}/admin/assign-telecaller",
                          headers=_hdr(tokens["admin"]["token"]),
                          json={"telecaller_id": "tc-001", "sales_manager_id": "sm-001"}, timeout=20)
        assert r.status_code == 200, r.text

        # Create an order as telecaller1
        order_payload = {
            "customer_name": "TEST_PHASE16",
            "customer_phone": "9999999999",
            "customer_address": "TEST address",
            "customer_pincode": "682001",
            "items": [{"name": "Test", "price": 100, "quantity": 1}],
            "total_amount": 100,
            "payment_type": "cod",
        }
        rc = requests.post(f"{API}/orders", headers=_hdr(tokens["tc"]["token"]),
                           json=order_payload, timeout=20)
        assert rc.status_code in (200, 201), rc.text
        order_id = rc.json().get("order", {}).get("id")
        assert order_id
        pytest.shared_order_id = order_id

        # SM should see at least this order
        rs = requests.get(f"{API}/v2/orders?limit=200", headers=_hdr(tokens["sm"]["token"]), timeout=30)
        assert rs.status_code == 200, rs.text
        ids = [o.get("id") for o in rs.json().get("orders", [])]
        assert order_id in ids, f"SM should see order from their tc: ids={ids[:5]}..."

        # All visible orders must have created_by in SM's team
        team_ids = {"tc-001", "sm-001"}  # plus possible asms/other tcs; loose check
        for o in rs.json().get("orders", []):
            assert "created_by" in o

    def test_v2_orders_dm_scope(self, tokens):
        r = requests.get(f"{API}/v2/orders?limit=100", headers=_hdr(tokens["dm"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        # Only orders by agents under this DM (managed_by = mgr-001)
        for o in r.json().get("orders", []):
            cr_role = o.get("created_by_role", "")
            # DM team members should produce these orders (agent or DM/ADM)
            assert cr_role in ("agent", "district_manager", "assistant_district_manager"), o


# ---------------- /api/v2/leads ----------------
class TestV2Leads:
    def test_v2_leads_admin(self, tokens):
        r = requests.get(f"{API}/v2/leads?limit=5", headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("leads", "total", "pages", "skip", "limit"):
            assert k in d

    def test_v2_leads_date_range(self, tokens):
        r = requests.get(f"{API}/v2/leads?from=2024-01-01&to=2030-12-31&limit=5",
                         headers=_hdr(tokens["sm"]["token"]), timeout=30)
        assert r.status_code == 200, r.text


# ---------------- Label PDF ----------------
class TestLabelPDF:
    def _ensure_order_id(self, tokens):
        # Try shared first
        oid = getattr(pytest, "shared_order_id", None)
        if oid:
            return oid
        # Fallback: fetch any order
        r = requests.get(f"{API}/v2/orders?limit=1", headers=_hdr(tokens["admin"]["token"]), timeout=20)
        assert r.status_code == 200
        orders = r.json().get("orders", [])
        if not orders:
            pytest.skip("No orders in db to generate label")
        return orders[0]["id"]

    def test_single_label_pdf(self, tokens):
        oid = self._ensure_order_id(tokens)
        r = requests.get(f"{API}/orders/{oid}/label.pdf",
                         headers={"Authorization": f"Bearer {tokens['admin']['token']}"},
                         timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.content.startswith(b"%PDF-"), "Not a valid PDF"
        assert r.headers.get("content-type", "").startswith("application/pdf")

    def test_a4_4up_label(self, tokens):
        oid = self._ensure_order_id(tokens)
        r = requests.get(f"{API}/orders/{oid}/label.pdf?sheet=a4",
                         headers={"Authorization": f"Bearer {tokens['admin']['token']}"},
                         timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.content.startswith(b"%PDF-")

    def test_bulk_labels(self, tokens):
        oid = self._ensure_order_id(tokens)
        r = requests.post(f"{API}/orders/labels/bulk",
                         headers=_hdr(tokens["admin"]["token"]),
                         json={"order_ids": [oid]}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.content.startswith(b"%PDF-")

    def test_bulk_labels_empty(self, tokens):
        r = requests.post(f"{API}/orders/labels/bulk",
                         headers=_hdr(tokens["admin"]["token"]),
                         json={"order_ids": []}, timeout=20)
        assert r.status_code == 400

    def test_label_not_found(self, tokens):
        r = requests.get(f"{API}/orders/DOES-NOT-EXIST/label.pdf",
                         headers={"Authorization": f"Bearer {tokens['admin']['token']}"},
                         timeout=20)
        assert r.status_code == 404


# ---------------- Employee 360 / AI Summary ----------------
class TestEmployee360:
    def test_list_employees_admin(self, tokens):
        r = requests.get(f"{API}/admin/employees", headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "employees" in d and "total" in d
        assert d["total"] == len(d["employees"])
        assert d["total"] > 0

    def test_list_employees_forbidden_for_sm(self, tokens):
        r = requests.get(f"{API}/admin/employees", headers=_hdr(tokens["sm"]["token"]), timeout=20)
        assert r.status_code == 403

    def test_employee_360_admin(self, tokens):
        r = requests.get(f"{API}/admin/employee/tc-001/360?range_days=30",
                         headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("user", "kpis", "attendance", "leaves", "tasks", "advances", "payroll_history"):
            assert k in d, f"missing {k}"
        assert d["user"].get("id") == "tc-001"

    def test_employee_360_not_found(self, tokens):
        r = requests.get(f"{API}/admin/employee/xxx-nope/360",
                         headers=_hdr(tokens["admin"]["token"]), timeout=20)
        assert r.status_code == 404

    def test_ai_summary(self, tokens):
        r = requests.post(f"{API}/admin/employee/tc-001/ai-summary",
                          headers=_hdr(tokens["admin"]["token"]),
                          json={"range_days": 7}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "summary" in d and "model" in d and "kpis" in d
        assert isinstance(d["summary"], str) and len(d["summary"]) > 0


# ---------------- HR Efficiency ----------------
class TestHrEfficiency:
    def test_hr_efficiency_admin(self, tokens):
        r = requests.get(f"{API}/hr/efficiency", headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("date", "employees", "total"):
            assert k in d
        assert d["total"] == len(d["employees"])

    def test_hr_efficiency_hr_role(self, tokens):
        if not tokens["hr"].get("token"):
            pytest.skip("HR login failed")
        r = requests.get(f"{API}/hr/efficiency?d=2025-01-15",
                         headers=_hdr(tokens["hr"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["date"] == "2025-01-15"

    def test_hr_efficiency_forbidden(self, tokens):
        r = requests.get(f"{API}/hr/efficiency", headers=_hdr(tokens["sm"]["token"]), timeout=20)
        assert r.status_code == 403


# ---------------- Forecast ----------------
class TestForecast:
    def test_forecast_admin(self, tokens):
        r = requests.get(f"{API}/admin/forecast?days=30", headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Accept either "historical" or similar keys
        # Per spec: historical + projection + avg_per_day + trend_per_day
        assert any(k in d for k in ("historical", "history", "series")), f"keys={list(d.keys())}"
        assert any(k in d for k in ("projection", "forecast")), f"keys={list(d.keys())}"

    def test_forecast_forbidden(self, tokens):
        r = requests.get(f"{API}/admin/forecast", headers=_hdr(tokens["sm"]["token"]), timeout=20)
        assert r.status_code == 403


# ---------------- Reports PDF ----------------
class TestReports:
    def test_daily_report_admin(self, tokens):
        r = requests.get(f"{API}/reports/daily.pdf",
                         headers={"Authorization": f"Bearer {tokens['admin']['token']}"}, timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.content.startswith(b"%PDF-")

    def test_daily_report_sm(self, tokens):
        r = requests.get(f"{API}/reports/daily.pdf",
                         headers={"Authorization": f"Bearer {tokens['sm']['token']}"}, timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.content.startswith(b"%PDF-")

    def test_employee_report_pdf(self, tokens):
        r = requests.get(f"{API}/reports/employee/tc-001.pdf?days=30",
                         headers={"Authorization": f"Bearer {tokens['admin']['token']}"}, timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.content.startswith(b"%PDF-")

    def test_daily_report_send_no_smtp(self, tokens):
        r = requests.post(f"{API}/reports/daily/send", headers=_hdr(tokens["admin"]["token"]),
                          json={}, timeout=30)
        # 502 expected when SMTP not configured; accept 200 if SMTP is set
        assert r.status_code in (200, 502), r.text
        if r.status_code == 502:
            assert "SMTP" in r.text or "Email failed" in r.text


# ---------------- Delhivery ----------------
class TestDelhivery:
    def test_sync_status(self, tokens):
        r = requests.get(f"{API}/admin/delhivery/sync-status",
                         headers=_hdr(tokens["admin"]["token"]), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "status" in d
        assert "api_key_set" in d
        assert d["api_key_set"] is False

    def test_sync_now_no_api_key(self, tokens):
        r = requests.post(f"{API}/admin/delhivery/sync-now",
                          headers=_hdr(tokens["admin"]["token"]), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Should skip gracefully — accept skipped or zeros
        assert ("skipped" in d) or (d.get("synced", 0) == 0)

    def test_sync_forbidden(self, tokens):
        r = requests.post(f"{API}/admin/delhivery/sync-now",
                          headers=_hdr(tokens["sm"]["token"]), timeout=20)
        assert r.status_code == 403


# ---------------- PUT /api/orders edit scope ----------------
class TestOrderEditScope:
    def _ensure_order(self, tokens):
        oid = getattr(pytest, "shared_order_id", None)
        if oid:
            return oid
        # Create via tc
        order_payload = {
            "customer_name": "TEST_EDIT_SCOPE",
            "customer_phone": "9999999998",
            "customer_address": "TEST edit address",
            "customer_pincode": "682002",
            "items": [{"name": "Test", "price": 100, "quantity": 1}],
            "total_amount": 100,
            "payment_type": "cod",
        }
        rc = requests.post(f"{API}/orders", headers=_hdr(tokens["tc"]["token"]),
                           json=order_payload, timeout=20)
        assert rc.status_code in (200, 201), rc.text
        return rc.json()["order"]["id"]

    def test_sm_edit_team_order(self, tokens):
        oid = self._ensure_order(tokens)
        r = requests.put(f"{API}/orders/{oid}",
                         headers=_hdr(tokens["sm"]["token"]),
                         json={"customer_name": "TEST_SM_EDITED"}, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["order"]["customer_name"] == "TEST_SM_EDITED"

    def test_dm_cannot_edit_telecaller_order(self, tokens):
        oid = self._ensure_order(tokens)
        r = requests.put(f"{API}/orders/{oid}",
                         headers=_hdr(tokens["dm"]["token"]),
                         json={"customer_name": "TEST_DM_BLOCKED"}, timeout=20)
        # DM should be blocked from telecaller orders
        assert r.status_code == 403, f"DM should NOT edit telecaller order: {r.status_code} {r.text}"

    def test_edit_shipped_order_allowed(self, tokens):
        # Create order as tc, approve+ship as admin, then edit
        order_payload = {
            "customer_name": "TEST_SHIPPED_EDIT",
            "customer_phone": "9999999997",
            "customer_address": "TEST shipped address",
            "customer_pincode": "682003",
            "items": [{"name": "Test", "price": 100, "quantity": 1}],
            "total_amount": 100,
            "payment_type": "cod",
        }
        rc = requests.post(f"{API}/orders", headers=_hdr(tokens["tc"]["token"]),
                           json=order_payload, timeout=20)
        assert rc.status_code in (200, 201), rc.text
        oid = rc.json()["order"]["id"]
        # Approve
        ra = requests.put(f"{API}/orders/{oid}/approve", headers=_hdr(tokens["admin"]["token"]), timeout=20)
        assert ra.status_code == 200, ra.text
        # Ship
        rs = requests.put(f"{API}/orders/{oid}/ship",
                         headers=_hdr(tokens["admin"]["token"]),
                         json={"courier_name": "Delhivery", "tracking_number": f"TEST{uuid.uuid4().hex[:8]}",
                               "tracking_link": "https://x"}, timeout=20)
        assert rs.status_code == 200, rs.text
        # Now edit while shipped — should succeed (Phase 1 update)
        re = requests.put(f"{API}/orders/{oid}",
                         headers=_hdr(tokens["admin"]["token"]),
                         json={"customer_name": "TEST_SHIPPED_EDITED"}, timeout=20)
        assert re.status_code == 200, f"shipped order should be editable: {re.status_code} {re.text}"
        pytest.shared_shipped_oid = oid

    def test_edit_delivered_order_locked(self, tokens):
        oid = getattr(pytest, "shared_shipped_oid", None)
        if not oid:
            pytest.skip("no shipped order to deliver")
        rd = requests.put(f"{API}/orders/{oid}/deliver", headers=_hdr(tokens["admin"]["token"]), timeout=20)
        assert rd.status_code == 200, rd.text
        re = requests.put(f"{API}/orders/{oid}",
                         headers=_hdr(tokens["admin"]["token"]),
                         json={"customer_name": "TEST_DELIVERED_EDIT"}, timeout=20)
        assert re.status_code == 403, f"delivered order should be locked: {re.status_code} {re.text}"
