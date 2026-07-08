"""Iteration 49 — backend regression:
- all-time bulk-distribute dedupe (within-batch + already_in_system)
- preview-distribute enrichment (will_skip / skip_reason)
- POST /leads/dedupe-cleanup (admin, dry_run + real)
- GET /orders/by-phone, POST /orders/by-phones
- GET /sm/telecaller-performance/pdf
- stock-allocation CRUD + role gating
- label PDF
"""
import os
import time
import pytest
import requests

def _get_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # load from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _get_base()

ADMIN = ("admin@celestaglow.com", "admin123")
SM = ("salesmanager@celestaglow.com", "sm123")
TC1 = ("telecaller1@celestaglow.com", "tc123")
INV = ("inventory@celestaglow.com", "inv123")

SM_ID = "sm-8654ce"
UNIQ_PHONE_BASE = f"+9191111{int(time.time()) % 100000:05d}"  # unique per run


def _login(email, pwd):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token for {email}: {r.text[:200]}"
    return tok


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(*ADMIN),
        "sm": _login(*SM),
        "tc1": _login(*TC1),
        "inv": _login(*INV),
    }


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# --------------------------------------------------------------- Dedupe (bulk-distribute)
class TestBulkDistributeDedupe:
    """All-time dedupe: phone once assigned is never assigned again unless soft-deleted."""

    def test_1_first_batch_creates_one(self, tokens):
        phone = UNIQ_PHONE_BASE
        r = requests.post(f"{BASE}/api/leads/bulk-distribute",
                          headers=_h(tokens["admin"]),
                          json={"phone_numbers": [phone], "mode": "equal", "sales_manager_id": SM_ID},
                          timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("created") == 1, data
        # store phone for reuse
        pytest.dedupe_phone_a = phone

    def test_2_within_batch_dupes(self, tokens):
        phone = f"+919111199{int(time.time()) % 1000:03d}0"  # different unique phone
        r = requests.post(f"{BASE}/api/leads/bulk-distribute",
                          headers=_h(tokens["admin"]),
                          json={"phone_numbers": [phone, phone, phone], "mode": "equal", "sales_manager_id": SM_ID},
                          timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("created") == 1, d
        assert d.get("within_batch_dupes") == 2, d
        pytest.dedupe_phone_b = phone

    def test_3_already_in_system(self, tokens):
        phone = pytest.dedupe_phone_a
        r = requests.post(f"{BASE}/api/leads/bulk-distribute",
                          headers=_h(tokens["admin"]),
                          json={"phone_numbers": [phone], "mode": "equal", "sales_manager_id": SM_ID},
                          timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("created") == 0, d
        assert d.get("skipped_duplicates") == 1, d
        details = d.get("skipped_details") or []
        assert len(details) >= 1
        owner = details[0].get("owner") or {}
        assert owner.get("telecaller_name"), f"owner.telecaller_name missing: {details[0]}"


# --------------------------------------------------------------- Preview enrichment
class TestPreviewDistribute:
    def test_preview_will_skip(self, tokens):
        # phone_a already exists (from previous test) → already_in_system
        # duplicate in-batch → duplicate_in_batch
        # invalid phone → invalid_phone
        good = f"+919111177{int(time.time()) % 10000:04d}"
        existing = getattr(pytest, "dedupe_phone_a", "+919111100033")
        payload = {
            "phone_numbers": [good, good, existing, "abc"],
            "mode": "equal", "sales_manager_id": SM_ID,
        }
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(tokens["admin"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "will_skip" in d or "allocations" in d, d
        allocs = d.get("allocations") or []
        reasons = [(a.get("will_skip"), a.get("skip_reason")) for a in allocs]
        skip_reasons = {a.get("skip_reason") for a in allocs if a.get("will_skip")}
        assert "duplicate_in_batch" in skip_reasons, reasons
        assert "already_in_system" in skip_reasons, reasons
        # invalid_phone may or may not appear in allocations depending on impl,
        # but at least the 2 valid skip reasons must show
        assert isinstance(d.get("total"), int)


# --------------------------------------------------------------- dedupe-cleanup
class TestDedupeCleanup:
    def test_dry_run_admin(self, tokens):
        r = requests.post(f"{BASE}/api/leads/dedupe-cleanup",
                          headers=_h(tokens["admin"]), json={"dry_run": True}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        # accept any of these count keys
        assert any(k in d for k in ("duplicates", "would_delete", "count", "removed", "duplicate_count", "duplicate_phone_norms", "extra_leads_found")), d

    def test_non_admin_forbidden(self, tokens):
        r = requests.post(f"{BASE}/api/leads/dedupe-cleanup",
                          headers=_h(tokens["tc1"]), json={"dry_run": True}, timeout=30)
        assert r.status_code in (401, 403), r.status_code


# --------------------------------------------------------------- orders/by-phone(s)
class TestOrdersByPhone:
    def test_single_by_phone_ok(self, tokens):
        r = requests.get(f"{BASE}/api/orders/by-phone",
                         headers=_h(tokens["tc1"]), params={"phone": "+919999000000"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "orders" in d
        assert isinstance(d["orders"], list)

    def test_batch_by_phones(self, tokens):
        r = requests.post(f"{BASE}/api/orders/by-phones",
                          headers=_h(tokens["tc1"]),
                          json={"phones": ["+919999000000", "9999000001"]}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "orders_by_phone" in d
        assert isinstance(d["orders_by_phone"], dict)

    def test_batch_empty(self, tokens):
        r = requests.post(f"{BASE}/api/orders/by-phones",
                          headers=_h(tokens["tc1"]), json={"phones": []}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("orders_by_phone") == {}


# --------------------------------------------------------------- TC performance PDF
class TestTcPerformancePDF:
    def test_pdf_admin(self, tokens):
        r = requests.get(f"{BASE}/api/sm/telecaller-performance/pdf",
                         headers=_h(tokens["admin"]),
                         params={"sm_id": SM_ID, "range": "7d"}, timeout=60)
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("content-type", "")
        assert "pdf" in ct.lower(), ct
        assert r.content[:4] == b"%PDF", r.content[:20]


# --------------------------------------------------------------- Stock allocation
class TestStockAllocation:
    alloc_id = None

    def test_role_gate_tc_forbidden(self, tokens):
        r = requests.get(f"{BASE}/api/stock-allocations", headers=_h(tokens["tc1"]), timeout=15)
        assert r.status_code in (401, 403), r.status_code

    def test_list_ok_for_inventory(self, tokens):
        r = requests.get(f"{BASE}/api/stock-allocations", headers=_h(tokens["inv"]), timeout=15)
        assert r.status_code == 200
        assert "allocations" in r.json()

    def test_create_edit_group_delete(self, tokens):
        # find a product
        pr = requests.get(f"{BASE}/api/products", headers=_h(tokens["inv"]), timeout=15)
        assert pr.status_code == 200, pr.text[:200]
        products = pr.json() if isinstance(pr.json(), list) else pr.json().get("products", [])
        assert products, "no products in seed"
        prod_id = products[0]["id"]

        # find a telecaller employee_id
        tr = requests.get(f"{BASE}/api/telecallers", headers=_h(tokens["admin"]), timeout=15)
        assert tr.status_code == 200
        tcs = tr.json() if isinstance(tr.json(), list) else tr.json().get("telecallers", [])
        assert tcs, "no telecallers"
        emp_id = tcs[0]["id"]

        # CREATE
        cr = requests.post(f"{BASE}/api/stock-allocations", headers=_h(tokens["inv"]),
                           json={"employee_id": emp_id, "product_id": prod_id, "qty": 5, "note": "TEST_iter49"},
                           timeout=15)
        assert cr.status_code == 200, cr.text
        alloc = cr.json().get("allocation") or {}
        aid = alloc.get("id")
        assert aid, cr.text
        TestStockAllocation.alloc_id = aid
        assert alloc.get("allocated_qty") == 5
        assert alloc.get("product_name")
        assert alloc.get("employee_name")

        # UPDATE
        ur = requests.put(f"{BASE}/api/stock-allocations/{aid}", headers=_h(tokens["inv"]),
                          json={"qty": 7, "note": "TEST_iter49_upd"}, timeout=15)
        assert ur.status_code == 200, ur.text

        # BY-PERSON
        gp = requests.get(f"{BASE}/api/stock-allocations/by-person", headers=_h(tokens["inv"]), timeout=15)
        assert gp.status_code == 200
        people = gp.json().get("people") or []
        target = next((p for p in people if p["employee_id"] == emp_id), None)
        assert target, "employee missing from by-person grid"
        assert any(prod.get("id") == aid and prod.get("allocated_qty") == 7 for prod in target["products"])

        # DELETE (soft)
        dr = requests.delete(f"{BASE}/api/stock-allocations/{aid}", headers=_h(tokens["inv"]), timeout=15)
        assert dr.status_code == 200, dr.text

        # verify hidden from list
        lr = requests.get(f"{BASE}/api/stock-allocations", headers=_h(tokens["inv"]), timeout=15).json()
        assert not any(x.get("id") == aid for x in lr.get("allocations", []))


# --------------------------------------------------------------- Label PDF
class TestLabelPDF:
    def test_label_pdf_200(self, tokens):
        # find any order
        r = requests.get(f"{BASE}/api/orders", headers=_h(tokens["admin"]),
                         params={"limit": 5}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        orders = data if isinstance(data, list) else data.get("orders", [])
        if not orders:
            pytest.skip("no orders in system")
        oid = orders[0]["id"]
        lr = requests.get(f"{BASE}/api/orders/{oid}/label.pdf", headers=_h(tokens["admin"]), timeout=30)
        assert lr.status_code == 200, lr.text[:200]
        assert lr.content[:4] == b"%PDF", lr.content[:20]
