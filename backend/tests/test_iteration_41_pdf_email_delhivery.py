"""
Iteration 41 - Backend regression tests for:
- Label PDF (single + bulk)
- GST Invoice PDF
- Daily Report Email
- Delhivery sync endpoint
- Auto-finance sync: transaction recorded on delivered
- Telecaller dashboard helper endpoints (leads listing)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-central-82.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@celestaglow.com"
ADMIN_PASSWORD = "admin123"
TELECALLER_EMAIL = "telecaller1@celestaglow.com"
TELECALLER_PASSWORD = "tc123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:300]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def telecaller_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TELECALLER_EMAIL, "password": TELECALLER_PASSWORD},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"telecaller login failed: {r.status_code}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def any_order_id(admin_headers):
    r = requests.get(f"{BASE_URL}/api/orders?limit=20", headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"orders list failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    items = data if isinstance(data, list) else data.get("orders") or data.get("items") or []
    if not items:
        pytest.skip("no orders available to test PDFs")
    return items[0].get("id") or items[0].get("_id")


# ---------------- Label PDF ----------------
class TestLabelPDF:
    def test_single_label_pdf(self, admin_headers, any_order_id):
        r = requests.get(
            f"{BASE_URL}/api/orders/{any_order_id}/label.pdf",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"label pdf status {r.status_code}: {r.text[:300]}"
        assert r.content[:5] == b"%PDF-", f"not a PDF: {r.content[:20]}"
        assert len(r.content) > 500

    def test_bulk_label_pdf(self, admin_headers, any_order_id):
        r = requests.post(
            f"{BASE_URL}/api/orders/labels/bulk",
            headers=admin_headers,
            json={"order_ids": [any_order_id]},
            timeout=60,
        )
        assert r.status_code == 200, f"bulk label status {r.status_code}: {r.text[:300]}"
        assert r.content[:5] == b"%PDF-", f"bulk not a PDF: {r.content[:20]}"


# ---------------- GST Invoice PDF ----------------
class TestGSTInvoicePDF:
    def test_invoice_pdf(self, admin_headers, any_order_id):
        r = requests.get(
            f"{BASE_URL}/api/orders/{any_order_id}/invoice.pdf",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"invoice pdf status {r.status_code}: {r.text[:300]}"
        assert r.content[:5] == b"%PDF-", f"invoice not a PDF: {r.content[:20]}"
        assert len(r.content) > 500


# ---------------- Daily Report Email ----------------
class TestDailyReportEmail:
    def test_send_daily_report(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/reports/daily/send",
            headers=admin_headers,
            timeout=60,
        )
        # accept 200 (sent) or 202 (queued); should not be 500
        assert r.status_code in (200, 202), f"daily report status {r.status_code}: {r.text[:500]}"
        # validate JSON if present
        try:
            data = r.json()
            assert isinstance(data, dict)
            # common keys
            ok_flag = data.get("ok") or data.get("success") or data.get("sent") or data.get("status")
            assert ok_flag or "message" in data or "sent_to" in data, f"unexpected response shape: {data}"
        except ValueError:
            pass


# ---------------- Delhivery sync ----------------
class TestDelhiverySync:
    def test_sync_now(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/delhivery/sync-now",
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"delhivery sync status {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert isinstance(data, dict)
        # acceptable: synced count or no_api_key skip
        assert ("synced" in data) or ("skipped" in data) or ("ok" in data), data


# ---------------- Auto-finance sync on delivered ----------------
class TestAutoFinanceSync:
    def test_mark_delivered_creates_revenue_transaction(self, admin_headers):
        # find an order not delivered yet
        r = requests.get(f"{BASE_URL}/api/orders?limit=50", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("orders") or data.get("items") or []
        target = None
        for o in items:
            st = (o.get("status") or "").lower()
            if st not in ("delivered", "returned", "rto", "cancelled"):
                target = o
                break
        if not target:
            pytest.skip("no non-delivered order available to update")
        oid = target.get("id") or target.get("_id")

        # Promote through approve -> ship -> deliver as needed
        cur_status = (target.get("status") or "").lower()
        if cur_status == "pending":
            ap = requests.put(f"{BASE_URL}/api/orders/{oid}/approve", headers=admin_headers, timeout=20)
            # approve may need extra payload; ignore failure and continue
            cur_status = "approved" if ap.status_code in (200, 204) else cur_status
        if cur_status in ("pending", "approved"):
            sh = requests.put(f"{BASE_URL}/api/orders/{oid}/ship", headers=admin_headers, json={"tracking_id": "TEST123", "carrier": "delhivery"}, timeout=20)
            if sh.status_code not in (200, 204):
                # try ship-and-deliver shortcut
                sd = requests.put(f"{BASE_URL}/api/orders/{oid}/ship-and-deliver", headers=admin_headers, json={"tracking_id": "TEST123"}, timeout=20)
                assert sd.status_code in (200, 204), f"ship-and-deliver {sd.status_code}: {sd.text[:300]}"
            else:
                dv = requests.put(f"{BASE_URL}/api/orders/{oid}/deliver", headers=admin_headers, timeout=20)
                assert dv.status_code in (200, 204), f"deliver {dv.status_code}: {dv.text[:300]}"
        elif cur_status == "shipped":
            dv = requests.put(f"{BASE_URL}/api/orders/{oid}/deliver", headers=admin_headers, timeout=20)
            assert dv.status_code in (200, 204), f"deliver {dv.status_code}: {dv.text[:300]}"

        # verify a transaction with category 'order_revenue' linked to this order exists
        tx = requests.get(
            f"{BASE_URL}/api/finance/ledger",
            headers=admin_headers,
            timeout=20,
        )
        assert tx.status_code == 200, f"finance ledger {tx.status_code}: {tx.text[:300]}"
        txdata = tx.json()
        tx_items = txdata.get("transactions") or txdata.get("items") or (txdata if isinstance(txdata, list) else [])
        matched = [t for t in tx_items if t.get("reference_id") == oid and t.get("category") == "order_revenue"]
        assert matched, f"no order_revenue ledger entry for order {oid}; recent: {tx_items[:3]}"


# ---------------- Telecaller helpers (read-only) ----------------
class TestTelecallerLeads:
    def test_telecaller_leads_listing(self, telecaller_token):
        h = {"Authorization": f"Bearer {telecaller_token}"}
        # try common endpoints used by TelecallerDashboard
        endpoints = ["/api/leads", "/api/leads/today-calls", "/api/leads/follow-ups"]
        ok = False
        for ep in endpoints:
            r = requests.get(f"{BASE_URL}{ep}", headers=h, timeout=20)
            if r.status_code == 200:
                ok = True
                break
        assert ok, "no telecaller leads endpoint responded 200"
