"""Backend tests: Salons module, Finance Daily P&L, Manual Invoice GST=0 fix, role guards."""
import os
import pytest
import io
import requests
from datetime import datetime, timezone
from pypdf import PdfReader


def _pdf_text(body: bytes) -> str:
    r = PdfReader(io.BytesIO(body))
    return "\n".join((p.extract_text() or "") for p in r.pages)

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    return tok


@pytest.fixture(scope="module")
def sm_headers():
    return {"Authorization": f"Bearer {_login('salesmanager@celestaglow.com', 'sm123')}"}


@pytest.fixture(scope="module")
def fm_headers():
    return {"Authorization": f"Bearer {_login('finance@celestaglow.com', 'fin123')}"}


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login('admin@celestaglow.com', 'admin123')}"}


@pytest.fixture(scope="module")
def tc_headers():
    return {"Authorization": f"Bearer {_login('telecaller1@celestaglow.com', 'tc123')}"}


# ─── SALONS MODULE ────────────────────────────────────────────────────────────
class TestSalons:
    created_id = None
    test_phone = "9876500001"

    def test_sm_create_salon(self, sm_headers):
        payload = {
            "name": "TEST_Salon_QA",
            "phone": self.test_phone,
            "owner_name": "Test Owner",
            "area": "MG Road",
            "city": "Kochi",
            "district": "Ernakulam",
            "state": "Kerala",
            "pincode": "682016",
            "address": "1st Floor, ABC Complex",
        }
        # Cleanup any leftover from prev iterations by delete-then-create isn't available; just try
        r = requests.post(f"{API}/salons", json=payload, headers=sm_headers, timeout=30)
        if r.status_code == 409:
            # find existing and delete
            lst = requests.get(f"{API}/salons?q=TEST_Salon_QA", headers=sm_headers).json().get("salons", [])
            for s in lst:
                requests.delete(f"{API}/salons/{s['id']}", headers=sm_headers)
            r = requests.post(f"{API}/salons", json=payload, headers=sm_headers, timeout=30)
        assert r.status_code == 200, r.text
        salon = r.json()["salon"]
        assert salon["name"] == "TEST_Salon_QA"
        assert salon["phone"] == self.test_phone
        assert salon["status"] == "visited"
        assert len(salon["status_history"]) == 1
        TestSalons.created_id = salon["id"]

    def test_sm_duplicate_phone_409(self, sm_headers):
        r = requests.post(f"{API}/salons",
                          json={"name": "Dup", "phone": self.test_phone}, headers=sm_headers, timeout=30)
        assert r.status_code == 409, r.text

    def test_list_sm_own_only(self, sm_headers):
        r = requests.get(f"{API}/salons", headers=sm_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "salons" in data and "stats" in data
        ids = [s["id"] for s in data["salons"]]
        assert TestSalons.created_id in ids
        # every salon should have month_orders + month_revenue
        for s in data["salons"]:
            assert "month_orders" in s and "month_revenue" in s

    def test_list_admin_sees_all(self, admin_headers, sm_headers):
        r_admin = requests.get(f"{API}/salons", headers=admin_headers, timeout=30).json()
        r_sm = requests.get(f"{API}/salons", headers=sm_headers, timeout=30).json()
        assert r_admin["total"] >= r_sm["total"]

    def test_status_transition_history(self, sm_headers):
        r = requests.patch(f"{API}/salons/{TestSalons.created_id}",
                           json={"status": "onboarded", "status_note": "signed up"},
                           headers=sm_headers, timeout=30)
        assert r.status_code == 200, r.text
        salon = r.json()["salon"]
        assert salon["status"] == "onboarded"
        assert len(salon["status_history"]) == 2
        assert salon["status_history"][-1]["status"] == "onboarded"

    def test_salon_orders_endpoint(self, sm_headers):
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        r = requests.get(f"{API}/salons/{TestSalons.created_id}/orders?month={month}",
                         headers=sm_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "orders" in data and "count" in data and "revenue" in data

    def test_tc_forbidden(self, tc_headers):
        r = requests.get(f"{API}/salons", headers=tc_headers, timeout=30)
        assert r.status_code == 403

    def test_cleanup(self, sm_headers):
        if TestSalons.created_id:
            r = requests.delete(f"{API}/salons/{TestSalons.created_id}", headers=sm_headers, timeout=30)
            assert r.status_code in (200, 404)


# ─── FINANCE DAILY P&L ────────────────────────────────────────────────────────
class TestFinanceDaily:
    def test_daily_sales_shape(self, fm_headers):
        r = requests.get(f"{API}/finance/daily-sales?day=2026-07-08", headers=fm_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["day"] == "2026-07-08"
        t = data["totals"]
        for k in ("orders", "revenue", "cogs", "shipping", "gateway_fees",
                  "gross_profit", "net_profit", "net_margin_pct",
                  "cod_revenue", "online_revenue"):
            assert k in t, f"Missing key {k}"
        assert isinstance(data["by_role"], list)

    def test_daily_sales_math(self, fm_headers):
        r = requests.get(f"{API}/finance/daily-sales?day=2026-07-08", headers=fm_headers, timeout=30)
        t = r.json()["totals"]
        # gross = revenue - cogs
        assert abs(t["gross_profit"] - (t["revenue"] - t["cogs"])) < 0.5
        # net = gross - shipping - gateway
        assert abs(t["net_profit"] - (t["gross_profit"] - t["shipping"] - t["gateway_fees"])) < 0.5
        # cod + online should equal revenue (approx)
        assert abs(t["cod_revenue"] + t["online_revenue"] - t["revenue"]) < 0.5

    def test_daily_sales_today_default(self, fm_headers):
        r = requests.get(f"{API}/finance/daily-sales", headers=fm_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["day"] == datetime.now(timezone.utc).date().isoformat()

    def test_tc_forbidden_finance(self, tc_headers):
        r = requests.get(f"{API}/finance/daily-sales", headers=tc_headers, timeout=30)
        assert r.status_code == 403

    def test_sm_forbidden_finance(self, sm_headers):
        r = requests.get(f"{API}/finance/daily-sales", headers=sm_headers, timeout=30)
        assert r.status_code == 403


# ─── MANUAL INVOICE GST=0 FIX ─────────────────────────────────────────────────
class TestManualInvoiceGst:
    def test_gst_zero_respected(self, sm_headers):
        payload = {
            "customer": {"shop_name": "TEST_ZeroGst_Shop", "state": "Kerala",
                         "address": "1 Test St", "city": "Kochi", "pincode": "682016",
                         "phone": "9876500002"},
            "items": [
                {"name": "Serum 30ml", "qty": 2, "price": 100.0, "gst_pct": 0, "hsn": "3304"},
                {"name": "Cream 50g", "qty": 1, "price": 250.0, "gst_pct": 0, "hsn": "3304"},
            ],
            "payment_terms": "COD",
            "notes": "TEST invoice zero gst",
        }
        r = requests.post(f"{API}/invoices/manual", json=payload, headers=sm_headers, timeout=30)
        assert r.status_code == 200, r.text
        inv = r.json().get("invoice") or r.json()
        inv_id = inv.get("id") or r.json().get("id")
        assert inv_id, f"No id in response: {r.json()}"
        # Fetch PDF and inspect
        pdf_r = requests.get(f"{API}/invoices/{inv_id}/pdf", headers=sm_headers, timeout=30)
        assert pdf_r.status_code == 200
        text = _pdf_text(pdf_r.content)
        # Verify: total should be 450 (2*100 + 1*250), NOT 531 (with 18% gst)
        assert "450.00" in text, f"Expected grand total 450.00 for gst_pct=0 — GST bug present. Text sample: {text[:500]}"
        assert "531" not in text, f"Found 531 (18% inflated) in PDF: {text[:500]}"

    def test_gst_explicit_18_still_works(self, sm_headers):
        payload = {
            "customer": {"shop_name": "TEST_18Gst_Shop", "state": "Kerala",
                         "address": "1 Test St", "city": "Kochi", "pincode": "682016",
                         "phone": "9876500003"},
            "items": [{"name": "Serum", "qty": 1, "price": 100.0, "gst_pct": 18, "hsn": "3304"}],
            "payment_terms": "COD",
        }
        r = requests.post(f"{API}/invoices/manual", json=payload, headers=sm_headers, timeout=30)
        assert r.status_code == 200
        inv = r.json().get("invoice") or r.json()
        inv_id = inv.get("id") or r.json().get("id")
        pdf = requests.get(f"{API}/invoices/{inv_id}/pdf", headers=sm_headers, timeout=30).content
        text = _pdf_text(pdf)
        # 100 + 18 = 118
        assert "118.00" in text, f"Expected 118.00 in PDF: {text[:500]}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
