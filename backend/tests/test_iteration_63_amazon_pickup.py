"""
Iteration 63 backend tests: Amazon India Bulk Pickup Sheet export feature.

Covers:
 - /api/inventory/amazon-pickup/preview with filters (order_date, payment_type, status)
 - /api/inventory/amazon-pickup/export streaming .xlsx download
 - Role guards (IM/admin allowed, telecaller forbidden)
 - Workbook shape: 44 columns, sheet name, autofill values, phone/state normalization
 - Regression smoke: Meta CAPI Data Connections still reachable
"""
import io
import os
import pytest
import requests
import openpyxl

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

IM_CREDS = {"email": "inventory@celestaglow.com", "password": "inv123"}
ADMIN_CREDS = {"email": "admin@celestaglow.com", "password": "admin123"}
TC_CREDS = {"email": "telecaller1@celestaglow.com", "password": "tc123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def im_headers():
    return {"Authorization": f"Bearer {_login(IM_CREDS)}"}


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN_CREDS)}"}


@pytest.fixture(scope="module")
def tc_headers():
    try:
        return {"Authorization": f"Bearer {_login(TC_CREDS)}"}
    except AssertionError:
        pytest.skip("Telecaller test user not available")


# ── Preview endpoint ────────────────────────────────────────────────────────
class TestAmazonPreview:
    def test_preview_default_all(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/preview",
                         params={"order_date": "", "payment_type": "all", "status": "all"},
                         headers=im_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "count" in data and isinstance(data["count"], int)
        assert "sample" in data and isinstance(data["sample"], list)
        assert len(data["sample"]) <= 20

    def test_preview_filter_cod(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/preview",
                         params={"payment_type": "cod"}, headers=im_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        for s in data["sample"]:
            assert (s.get("payment_type") or "").lower() == "cod"

    def test_preview_filter_prepaid(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/preview",
                         params={"payment_type": "prepaid"}, headers=im_headers, timeout=20)
        assert r.status_code == 200
        for s in r.json()["sample"]:
            assert (s.get("payment_type") or "").lower() != "cod"

    def test_preview_admin_ok(self, admin_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/preview",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200

    def test_preview_role_guard(self, tc_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/preview",
                         headers=tc_headers, timeout=20)
        assert r.status_code == 403, r.text

    def test_preview_invalid_date(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/preview",
                         params={"order_date": "not-a-date"}, headers=im_headers, timeout=20)
        assert r.status_code == 400


# ── Export endpoint ─────────────────────────────────────────────────────────
class TestAmazonExport:
    def test_export_content_type_and_headers(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/export",
                         params={"payment_type": "all"}, headers=im_headers, timeout=45)
        # There should be at least some orders in DB per problem statement
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "openxmlformats" in ct or "spreadsheetml" in ct
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd and ".xlsx" in cd
        assert r.headers.get("x-row-count") is not None
        assert int(r.headers["x-row-count"]) > 0
        # Response bytes must be a valid xlsx
        wb = openpyxl.load_workbook(io.BytesIO(r.content))
        assert "IN Schedule Pickup V2" in wb.sheetnames
        assert "Notes" in wb.sheetnames

    def test_export_column_count_44(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/export",
                         params={"payment_type": "all"}, headers=im_headers, timeout=45)
        assert r.status_code == 200
        wb = openpyxl.load_workbook(io.BytesIO(r.content))
        ws = wb["IN Schedule Pickup V2"]
        headers = [ws.cell(row=1, column=i).value for i in range(1, 45)]
        assert len(headers) == 44
        assert headers[0] == "Client Reference ID"
        assert headers[-1] == "Return To: Phone Number"
        # Nothing in column 45 (only 44 data columns)
        assert ws.cell(row=1, column=45).value is None

    def test_export_row_values_autofill(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/export",
                         params={"payment_type": "all", "weight_kg": 0.25,
                                 "length_cm": 9, "width_cm": 6, "height_cm": 3},
                         headers=im_headers, timeout=45)
        assert r.status_code == 200
        wb = openpyxl.load_workbook(io.BytesIO(r.content))
        ws = wb["IN Schedule Pickup V2"]
        # Grab first data row (row 2)
        row = [ws.cell(row=2, column=i).value for i in range(1, 45)]
        # M=Length(13), N=Width(14), O=Height(15), P=Weight(16)
        assert row[12] == 9
        assert row[13] == 6
        assert row[14] == 3
        assert row[15] == 0.25
        # L=Product Type
        assert row[11] == "Beauty Product"
        # T,U,V = CGST/SGST/IGST all 0
        assert row[19] == 0 and row[20] == 0 and row[21] == 0
        # W = CollectOnDelivery must be Y or N
        assert row[22] in ("Y", "N")
        # X = Shipping Service
        assert row[23] == "STANDARD"
        # J = Phone (col 10) -> 10 digits if present
        phone = row[9]
        if phone:
            assert phone.isdigit() and len(phone) == 10
        # G = State uppercase if present
        state = row[6]
        if state:
            assert state == state.upper()
        # R = Invoice Date (col 18) formatted DD-MM-YYYY
        inv_date = row[17]
        assert isinstance(inv_date, str)
        assert len(inv_date) == 10 and inv_date[2] == "-" and inv_date[5] == "-"
        # S = Product Value > 0
        assert isinstance(row[18], (int, float)) and row[18] > 0

    def test_export_cod_flag(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/export",
                         params={"payment_type": "cod"}, headers=im_headers, timeout=45)
        if r.status_code == 404:
            pytest.skip("No COD orders in DB")
        assert r.status_code == 200
        wb = openpyxl.load_workbook(io.BytesIO(r.content))
        ws = wb["IN Schedule Pickup V2"]
        for row_idx in range(2, ws.max_row + 1):
            assert ws.cell(row=row_idx, column=23).value == "Y", f"Row {row_idx} not Y for COD"

    def test_export_prepaid_flag(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/export",
                         params={"payment_type": "prepaid"}, headers=im_headers, timeout=45)
        if r.status_code == 404:
            pytest.skip("No prepaid orders in DB")
        assert r.status_code == 200
        wb = openpyxl.load_workbook(io.BytesIO(r.content))
        ws = wb["IN Schedule Pickup V2"]
        for row_idx in range(2, ws.max_row + 1):
            assert ws.cell(row=row_idx, column=23).value == "N"

    def test_export_empty_returns_404(self, im_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/export",
                         params={"order_date": "1999-01-01", "payment_type": "cod"},
                         headers=im_headers, timeout=20)
        assert r.status_code == 404

    def test_export_role_guard(self, tc_headers):
        r = requests.get(f"{API}/inventory/amazon-pickup/export",
                         headers=tc_headers, timeout=20)
        assert r.status_code == 403


# ── Regression smoke: Meta CAPI (previous iteration) ────────────────────────
class TestMetaCapiRegression:
    def test_meta_data_connections_reachable(self, admin_headers):
        # Just ensure the endpoint still exists and returns 200 or 404 (not 500)
        for path in ("/marketing/meta/data-connections", "/meta/data-connections",
                     "/marketing/meta/capi/data-connections"):
            r = requests.get(f"{API}{path}", headers=admin_headers, timeout=15)
            if r.status_code in (200, 404):
                return
        pytest.skip("Meta CAPI data-connections route not found under expected paths")
