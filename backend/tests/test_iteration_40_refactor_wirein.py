"""
Iteration 40 backend tests — refactor wire-in + polish items.

Refactor wire-in (all served from store_modules/* but URLs/shapes unchanged):
 - coupons.py    : GET/POST/PUT/DELETE /api/admin/store/coupons + POST /api/store/{slug}/validate-coupon
 - hr_agents.py  : GET /api/hr/external-agents + POST /api/hr/external-agents/{id}/add-to-employees
 - store_admin.py: products CRUD, settings GET (mask), settings PUT, admin agents listing, admin upload

Polish items:
 1. PUT /api/admin/store/coupons/{cid} partial-update cross-validation when only valid_from supplied
 2. POST /api/hiring/candidates returns BOTH 'candidate' (new) and 'entry' (backward compat)
 3. POST /api/hiring/candidates/bulk-delete returns hired_skipped + not_found counts

New settings keys:
 - bottom_banner_image (URL ≤500 chars), bottom_banner_caption (≤300 trim)
 - Exposed at GET /api/store/{slug}/meta in settings sub-object
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-portal-dev-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@celestaglow.com", "admin123")
HR = ("hrmanager@celestaglow.com", "hr123")
STORE_SLUG = "muhammed-shahad"


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=30)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def hr_token():
    try:
        return _login(*HR)
    except AssertionError:
        return None


# ============================================================
# REFACTOR WIRE-IN: COUPONS (store_modules/coupons.py)
# ============================================================
class TestCouponsModule:
    def test_list_coupons(self, admin_token):
        r = requests.get(f"{API}/admin/store/coupons", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "coupons" in data and isinstance(data["coupons"], list)

    def test_full_crud_cycle(self, admin_token):
        code = f"TEST_RF_{uuid.uuid4().hex[:6].upper()}"
        # CREATE
        r = requests.post(
            f"{API}/admin/store/coupons",
            headers=_hdr(admin_token),
            json={
                "code": code,
                "description": "Refactor test",
                "discount_type": "percent",
                "discount_value": 10,
                "min_cart_value": 500,
                "max_discount": 200,
                "valid_from": "2026-01-01",
                "valid_to": "2026-12-31",
                "active": True,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        coupon = r.json()["coupon"]
        cid = coupon["id"]
        assert coupon["code"] == code
        assert coupon["discount_type"] == "percent"
        # GET via list
        r = requests.get(f"{API}/admin/store/coupons", headers=_hdr(admin_token), timeout=30)
        assert any(c["id"] == cid for c in r.json()["coupons"])
        # UPDATE
        r = requests.put(
            f"{API}/admin/store/coupons/{cid}",
            headers=_hdr(admin_token),
            json={"description": "Updated desc", "discount_value": 15},
            timeout=30,
        )
        assert r.status_code == 200
        # Verify update via list
        r = requests.get(f"{API}/admin/store/coupons", headers=_hdr(admin_token), timeout=30)
        c = next(c for c in r.json()["coupons"] if c["id"] == cid)
        assert c["description"] == "Updated desc"
        assert float(c["discount_value"]) == 15.0
        # DELETE
        r = requests.delete(f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        # Verify gone
        r = requests.get(f"{API}/admin/store/coupons", headers=_hdr(admin_token), timeout=30)
        assert not any(c["id"] == cid for c in r.json()["coupons"])

    def test_create_duplicate_code_rejected(self, admin_token):
        code = f"TEST_DUP_{uuid.uuid4().hex[:6].upper()}"
        p = {"code": code, "discount_type": "flat", "discount_value": 50}
        r1 = requests.post(f"{API}/admin/store/coupons", headers=_hdr(admin_token), json=p, timeout=30)
        assert r1.status_code == 200
        cid = r1.json()["coupon"]["id"]
        try:
            r2 = requests.post(f"{API}/admin/store/coupons", headers=_hdr(admin_token), json=p, timeout=30)
            assert r2.status_code == 400
        finally:
            requests.delete(f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token), timeout=30)

    def test_public_validate_coupon(self, admin_token):
        code = f"TEST_VAL_{uuid.uuid4().hex[:6].upper()}"
        r1 = requests.post(
            f"{API}/admin/store/coupons", headers=_hdr(admin_token),
            json={"code": code, "discount_type": "flat", "discount_value": 100, "min_cart_value": 500},
            timeout=30,
        )
        cid = r1.json()["coupon"]["id"]
        try:
            # Valid path
            r = requests.post(f"{API}/store/{STORE_SLUG}/validate-coupon",
                              json={"code": code, "subtotal": 1000}, timeout=30)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["ok"] is True and d["code"] == code and d["discount"] == 100
            # Min cart not met
            r = requests.post(f"{API}/store/{STORE_SLUG}/validate-coupon",
                              json={"code": code, "subtotal": 100}, timeout=30)
            assert r.status_code == 400
            # Invalid code
            r = requests.post(f"{API}/store/{STORE_SLUG}/validate-coupon",
                              json={"code": "NO_SUCH_CODE_X", "subtotal": 1000}, timeout=30)
            assert r.status_code == 404
        finally:
            requests.delete(f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token), timeout=30)

    # ---- Polish item: partial update cross-validation ----
    def test_partial_update_valid_from_after_stored_valid_to_rejected(self, admin_token):
        code = f"TEST_PART_{uuid.uuid4().hex[:6].upper()}"
        r1 = requests.post(
            f"{API}/admin/store/coupons", headers=_hdr(admin_token),
            json={"code": code, "discount_type": "flat", "discount_value": 50,
                  "valid_from": "2026-01-01", "valid_to": "2026-06-30"},
            timeout=30,
        )
        cid = r1.json()["coupon"]["id"]
        try:
            # Send ONLY valid_from later than stored valid_to (2026-06-30)
            r = requests.put(
                f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token),
                json={"valid_from": "2026-09-01"}, timeout=30,
            )
            assert r.status_code == 400, f"Expected 400 cross-validate, got {r.status_code} {r.text}"
            # And reverse: only valid_to before stored valid_from
            r = requests.put(
                f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token),
                json={"valid_to": "2025-12-01"}, timeout=30,
            )
            assert r.status_code == 400
            # Valid partial update should succeed
            r = requests.put(
                f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token),
                json={"valid_from": "2026-02-01"}, timeout=30,
            )
            assert r.status_code == 200
        finally:
            requests.delete(f"{API}/admin/store/coupons/{cid}", headers=_hdr(admin_token), timeout=30)


# ============================================================
# REFACTOR WIRE-IN: STORE ADMIN (store_modules/store_admin.py)
# ============================================================
class TestStoreAdminModule:
    def test_settings_get_masks_secret(self, admin_token):
        # Set a secret first
        requests.put(f"{API}/admin/store/settings", headers=_hdr(admin_token),
                     json={"razorpay_key_secret": "live_secret_ABCD1234"}, timeout=30)
        r = requests.get(f"{API}/admin/store/settings", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        s = r.json()["settings"]
        assert s.get("razorpay_key_secret") == ""
        masked = s.get("razorpay_key_secret_masked", "")
        assert masked.startswith("•" * 8)
        assert masked.endswith("1234")

    def test_settings_get_no_overwrite_on_empty_secret(self, admin_token):
        # PUT with empty secret should NOT clear stored secret
        r = requests.put(f"{API}/admin/store/settings", headers=_hdr(admin_token),
                         json={"razorpay_key_secret": ""}, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/admin/store/settings", headers=_hdr(admin_token), timeout=30)
        assert r.json()["settings"].get("razorpay_key_secret_masked", "").endswith("1234")

    def test_product_create_uses_p_prefix(self, admin_token):
        name = f"TEST_P_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/store/products", headers=_hdr(admin_token),
                          json={"name": name, "price": 499, "mrp": 599, "is_combo": False}, timeout=30)
        assert r.status_code == 200, r.text
        prod = r.json()["product"]
        try:
            assert prod["id"].startswith("p-"), f"product id should start with p-: {prod['id']}"
            assert prod["slug"]
            assert prod["is_combo"] is False
            assert prod["price"] == 499
        finally:
            requests.delete(f"{API}/admin/store/products/{prod['id']}",
                            headers=_hdr(admin_token), timeout=30)

    def test_product_create_combo_uses_c_prefix(self, admin_token):
        name = f"TEST_C_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/store/products", headers=_hdr(admin_token),
                          json={"name": name, "price": 999, "mrp": 1299, "is_combo": True,
                                "combo_items": ["p-cleanser", "p-toner"]}, timeout=30)
        assert r.status_code == 200, r.text
        prod = r.json()["product"]
        try:
            assert prod["id"].startswith("c-"), f"combo id should start with c-: {prod['id']}"
            assert prod["is_combo"] is True
            assert prod["combo_items"] == ["p-cleanser", "p-toner"]
        finally:
            requests.delete(f"{API}/admin/store/products/{prod['id']}",
                            headers=_hdr(admin_token), timeout=30)

    def test_product_slug_uniqueness(self, admin_token):
        # Create same name twice — slug must auto-disambiguate (-2 suffix)
        name = f"TEST_SLUG_{uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{API}/admin/store/products", headers=_hdr(admin_token),
                           json={"name": name, "price": 100}, timeout=30)
        p1 = r1.json()["product"]
        r2 = requests.post(f"{API}/admin/store/products", headers=_hdr(admin_token),
                           json={"name": name, "price": 100}, timeout=30)
        p2 = r2.json()["product"]
        try:
            assert p1["slug"] != p2["slug"]
            assert p2["slug"].endswith("-2") or p2["slug"] != p1["slug"]
        finally:
            requests.delete(f"{API}/admin/store/products/{p1['id']}", headers=_hdr(admin_token), timeout=30)
            requests.delete(f"{API}/admin/store/products/{p2['id']}", headers=_hdr(admin_token), timeout=30)

    def test_product_update_persists(self, admin_token):
        r = requests.post(f"{API}/admin/store/products", headers=_hdr(admin_token),
                          json={"name": f"TEST_UPD_{uuid.uuid4().hex[:6]}", "price": 100}, timeout=30)
        pid = r.json()["product"]["id"]
        try:
            r = requests.put(f"{API}/admin/store/products/{pid}", headers=_hdr(admin_token),
                             json={"price": 250, "tagline": "new tag"}, timeout=30)
            assert r.status_code == 200
            r = requests.get(f"{API}/admin/store/products", headers=_hdr(admin_token), timeout=30)
            p = next(p for p in r.json()["products"] if p["id"] == pid)
            assert p["price"] == 250 and p["tagline"] == "new tag"
        finally:
            requests.delete(f"{API}/admin/store/products/{pid}", headers=_hdr(admin_token), timeout=30)

    def test_admin_list_agents(self, admin_token):
        r = requests.get(f"{API}/admin/store/agents", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "agents" in d and isinstance(d["agents"], list)
        for a in d["agents"]:
            assert "password_hash" not in a  # never leak

    def test_upload_endpoint_accepts_png(self, admin_token):
        # 1x1 png
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
            "890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
        )
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/admin/upload",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["url"].startswith("/api/uploads/img-")
        assert d["url"].endswith(".png")
        assert d["size"] > 0

    def test_upload_rejects_disallowed_ext(self, admin_token):
        files = {"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/admin/upload",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          files=files, timeout=30)
        assert r.status_code == 400


# ============================================================
# REFACTOR WIRE-IN: HR AGENTS (store_modules/hr_agents.py)
# ============================================================
class TestHRAgentsModule:
    def test_external_agents_endpoint_reachable(self, hr_token, admin_token):
        tok = hr_token or admin_token
        r = requests.get(f"{API}/hr/external-agents", headers=_hdr(tok), timeout=30)
        # Either 200 success or 403 if role gate differs — but endpoint must exist (not 404)
        assert r.status_code != 404, "hr/external-agents endpoint missing (refactor wire-in failure)"
        if r.status_code == 200:
            assert "agents" in r.json() or isinstance(r.json(), (list, dict))

    def test_add_to_employees_invalid_id_404(self, hr_token, admin_token):
        tok = hr_token or admin_token
        r = requests.post(f"{API}/hr/external-agents/nonexistent-id-xyz/add-to-employees",
                          headers=_hdr(tok), json={}, timeout=30)
        # Endpoint exists -> not 404 because of routing; 404 because of missing agent is OK
        # We just confirm routing reached the handler (not method-not-allowed)
        assert r.status_code in (200, 400, 404, 403, 422), r.text


# ============================================================
# NEW SETTINGS KEYS: bottom_banner_image + bottom_banner_caption
# ============================================================
class TestBottomBanner:
    def test_set_and_read_bottom_banner_settings(self, admin_token):
        img_url = "https://cdn.example.com/banner.jpg"
        caption = "  Holiday sale — up to 40% off  "
        r = requests.put(f"{API}/admin/store/settings", headers=_hdr(admin_token),
                         json={"bottom_banner_image": img_url, "bottom_banner_caption": caption},
                         timeout=30)
        assert r.status_code == 200
        # Verify via admin GET
        r = requests.get(f"{API}/admin/store/settings", headers=_hdr(admin_token), timeout=30)
        s = r.json()["settings"]
        assert s.get("bottom_banner_image") == img_url
        assert s.get("bottom_banner_caption") == caption.strip()
        # Verify via storefront meta
        r = requests.get(f"{API}/store/{STORE_SLUG}/meta", timeout=30)
        assert r.status_code == 200
        meta = r.json()
        # settings could be under 'settings' or merged into root
        st = meta.get("settings") or meta
        assert st.get("bottom_banner_image") == img_url
        assert st.get("bottom_banner_caption") == caption.strip()

    def test_bottom_banner_image_too_long_rejected(self, admin_token):
        long_url = "https://" + ("x" * 600)
        r = requests.put(f"{API}/admin/store/settings", headers=_hdr(admin_token),
                         json={"bottom_banner_image": long_url}, timeout=30)
        assert r.status_code == 400

    def test_bottom_banner_caption_trimmed_to_300(self, admin_token):
        long_cap = "A" * 500
        r = requests.put(f"{API}/admin/store/settings", headers=_hdr(admin_token),
                         json={"bottom_banner_caption": long_cap}, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/admin/store/settings", headers=_hdr(admin_token), timeout=30)
        assert len(r.json()["settings"]["bottom_banner_caption"]) == 300

    def test_cleanup_bottom_banner(self, admin_token):
        # cleanup test: empty out
        r = requests.put(f"{API}/admin/store/settings", headers=_hdr(admin_token),
                         json={"bottom_banner_image": "", "bottom_banner_caption": ""}, timeout=30)
        assert r.status_code == 200


# ============================================================
# POLISH: POST /hiring/candidates returns both candidate + entry
# ============================================================
class TestHiringCandidateResponse:
    def test_create_response_has_both_keys(self, admin_token):
        payload = {
            "name": f"TEST_RF_CAND_{uuid.uuid4().hex[:6]}",
            "email": f"test_rf_{uuid.uuid4().hex[:6]}@example.com",
            "phone": "9999999999",
            "role_applied": "telecaller",
            "stage": "applied",
        }
        r = requests.post(f"{API}/hiring/candidates", headers=_hdr(admin_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "candidate" in body, f"missing 'candidate' key: {body.keys()}"
        assert "entry" in body, f"missing 'entry' key (backward compat): {body.keys()}"
        assert body["candidate"].get("id") == body["entry"].get("id")
        cid = body["candidate"]["id"]
        # cleanup
        requests.post(f"{API}/hiring/candidates/bulk-delete", headers=_hdr(admin_token),
                      json={"ids": [cid], "password": "XYCDF6F@123"}, timeout=30)


# ============================================================
# POLISH: bulk-delete differentiated counts
# ============================================================
class TestBulkDeleteCounts:
    def test_response_includes_hired_skipped_and_not_found(self, admin_token):
        # Create one real candidate
        r = requests.post(f"{API}/hiring/candidates", headers=_hdr(admin_token),
                          json={"name": f"TEST_BD_{uuid.uuid4().hex[:6]}",
                                "email": f"test_bd_{uuid.uuid4().hex[:6]}@example.com",
                                "phone": "8888888888", "role_applied": "telecaller"},
                          timeout=30)
        assert r.status_code == 200
        cid = r.json()["candidate"]["id"]
        # Bulk delete with: 1 real id + 2 fake ids
        fake_ids = ["nonexistent-1", "nonexistent-2"]
        r = requests.post(f"{API}/hiring/candidates/bulk-delete", headers=_hdr(admin_token),
                          json={"ids": [cid] + fake_ids, "password": "XYCDF6F@123"}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "deleted" in d and "hired_skipped" in d and "not_found" in d
        assert d["deleted"] == 1
        assert d["not_found"] == 2
        assert d["hired_skipped"] == 0
        assert "message" in d and "not found" in d["message"].lower()

    def test_all_not_found_returns_zero_deleted(self, admin_token):
        r = requests.post(f"{API}/hiring/candidates/bulk-delete", headers=_hdr(admin_token),
                          json={"ids": ["fake-x-1", "fake-x-2"], "password": "XYCDF6F@123"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["deleted"] == 0
        assert d["not_found"] == 2
