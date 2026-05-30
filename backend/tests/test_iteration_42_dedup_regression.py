"""
Iteration 42 - Backend regression tests:
- Auto-finance sync dedup (collection mismatch fix: upgrades.py now reads db.finance_ledger)
- Regression: label PDF, GST invoice PDF, daily report email, Delhivery sync still 200
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-central-82.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@celestaglow.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"admin login: {r.status_code} {r.text[:200]}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def any_order_id(admin_headers):
    r = requests.get(f"{BASE_URL}/api/orders?limit=20", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("orders") or data.get("items") or []
    if not items:
        pytest.skip("no orders available")
    return items[0].get("id") or items[0].get("_id")


def _count_order_revenue_entries(admin_headers):
    """Helper: count order_revenue credit entries grouped by reference_id."""
    r = requests.get(f"{BASE_URL}/api/finance/ledger?limit=500", headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"finance ledger: {r.status_code}"
    data = r.json()
    items = data.get("transactions") or data.get("items") or (data if isinstance(data, list) else [])
    grouped = {}
    for t in items:
        if t.get("category") == "order_revenue" and t.get("type") == "credit":
            ref = t.get("reference_id")
            grouped[ref] = grouped.get(ref, 0) + 1
    return grouped, items


# ---------------- Delhivery dedup retest ----------------
class TestDelhiveryDedup:
    def test_sync_now_twice_no_duplicate_revenue(self, admin_headers):
        # Trigger twice in a row
        r1 = requests.post(f"{BASE_URL}/api/admin/delhivery/sync-now", headers=admin_headers, timeout=60)
        assert r1.status_code == 200, f"sync1: {r1.status_code} {r1.text[:300]}"
        d1 = r1.json()
        # If no API key configured, dedup is moot — skip the comparison part
        if d1.get("skipped") == "no_api_key":
            pytest.skip("DELHIVERY_API_KEY not set — dedup not exercisable; sync returned no_api_key")

        before_counts, _ = _count_order_revenue_entries(admin_headers)

        r2 = requests.post(f"{BASE_URL}/api/admin/delhivery/sync-now", headers=admin_headers, timeout=60)
        assert r2.status_code == 200, f"sync2: {r2.status_code} {r2.text[:300]}"

        after_counts, after_items = _count_order_revenue_entries(admin_headers)

        # No reference_id should have > 1 order_revenue credit (dedup guard reads finance_ledger now)
        dupes = {ref: cnt for ref, cnt in after_counts.items() if cnt > 1}
        assert not dupes, f"Duplicate order_revenue credits found per reference_id: {dupes}"

        # Counts shouldn't grow between consecutive syncs without status flips
        for ref, cnt in after_counts.items():
            assert cnt <= before_counts.get(ref, 0) + 1, (
                f"unexpected growth for ref={ref}: before={before_counts.get(ref,0)} after={cnt}"
            )


# ---------------- Regression PDFs + email + sync ----------------
class TestRegressionPDFs:
    def test_label_pdf(self, admin_headers, any_order_id):
        r = requests.get(f"{BASE_URL}/api/orders/{any_order_id}/label.pdf", headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"label pdf {r.status_code}: {r.text[:200]}"
        assert r.content[:5] == b"%PDF-"

    def test_bulk_label_pdf(self, admin_headers, any_order_id):
        r = requests.post(
            f"{BASE_URL}/api/orders/labels/bulk",
            headers=admin_headers, json={"order_ids": [any_order_id]}, timeout=60,
        )
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    def test_invoice_pdf(self, admin_headers, any_order_id):
        r = requests.get(f"{BASE_URL}/api/orders/{any_order_id}/invoice.pdf", headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"invoice pdf {r.status_code}: {r.text[:200]}"
        assert r.content[:5] == b"%PDF-"


class TestRegressionEmailAndSync:
    def test_daily_report_email(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/reports/daily/send", headers=admin_headers, timeout=60)
        assert r.status_code in (200, 202), f"daily report {r.status_code}: {r.text[:300]}"

    def test_delhivery_sync_endpoint(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/delhivery/sync-now", headers=admin_headers, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert ("synced" in data) or ("skipped" in data) or ("ok" in data), data


# ---------------- Telecaller login + lead listing (UI prerequisites) ----------------
class TestTelecallerLogin:
    def test_telecaller_login_and_listing(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "telecaller1@celestaglow.com", "password": "tc123"},
            timeout=20,
        )
        assert r.status_code == 200, f"telecaller login: {r.status_code} {r.text[:200]}"
        token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        # Try a few common endpoints to confirm the dashboard data source is reachable
        endpoints = ["/api/leads", "/api/telecaller/leads", "/api/leads/my", "/api/leads/today-calls"]
        ok = False
        for ep in endpoints:
            rr = requests.get(f"{BASE_URL}{ep}", headers=h, timeout=20)
            if rr.status_code == 200:
                ok = True
                break
        assert ok, "no telecaller leads endpoint responded 200"
