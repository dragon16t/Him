"""Iter-31 Employee Profile endpoints tests.
Covers GET /api/employees/:id/profile, PUT photo, GET PDF, and profile_image on create."""
import os
import base64
import requests
import pytest

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@celestaglow.com", "admin123")


@pytest.fixture(scope="module")
def hr_token():
    return _login("hrmanager@celestaglow.com", "hr123")


@pytest.fixture(scope="module")
def tc1_token():
    return _login("telecaller1@celestaglow.com", "tc123")


@pytest.fixture(scope="module")
def agent1_token():
    return _login("agent1@celestaglow.com", "agent123")


@pytest.fixture(scope="module")
def tc1_user_id(tc1_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tc1_token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()["id"]


# tiny 1x1 PNG base64
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
TINY_PNG_DATAURL = f"data:image/png;base64,{TINY_PNG_B64}"


# ============ GET /api/employees/:id/profile ============
class TestProfileGet:
    def test_profile_as_hr(self, hr_token, tc1_user_id):
        r = requests.get(f"{API}/employees/{tc1_user_id}/profile",
                         headers={"Authorization": f"Bearer {hr_token}"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # All required keys present
        for k in ["user", "payroll_history", "attendance_this_month", "attendance_total",
                  "leave_balance", "commissions_recent", "cash_holder", "recent_expenses", "manager"]:
            assert k in data, f"missing key {k}"
        assert data["user"]["id"] == tc1_user_id
        assert "password_hash" not in data["user"]

    def test_profile_as_admin(self, admin_token, tc1_user_id):
        r = requests.get(f"{API}/employees/{tc1_user_id}/profile",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["id"] == tc1_user_id

    def test_profile_as_self(self, tc1_token, tc1_user_id):
        r = requests.get(f"{API}/employees/{tc1_user_id}/profile",
                         headers={"Authorization": f"Bearer {tc1_token}"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["id"] == tc1_user_id

    def test_profile_as_other_non_admin_403(self, agent1_token, tc1_user_id):
        r = requests.get(f"{API}/employees/{tc1_user_id}/profile",
                         headers={"Authorization": f"Bearer {agent1_token}"}, timeout=20)
        assert r.status_code == 403

    def test_profile_404(self, hr_token):
        r = requests.get(f"{API}/employees/nonexistent-id-xyz/profile",
                         headers={"Authorization": f"Bearer {hr_token}"}, timeout=20)
        assert r.status_code == 404
        assert "not found" in r.text.lower()


# ============ PUT /api/employees/:id/photo ============
class TestPhotoUpdate:
    def test_update_photo_as_hr(self, hr_token, tc1_user_id):
        r = requests.put(
            f"{API}/employees/{tc1_user_id}/photo",
            json={"profile_image": TINY_PNG_DATAURL},
            headers={"Authorization": f"Bearer {hr_token}"}, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["message"] == "Photo updated"
        assert isinstance(body["size"], int)
        assert body["size"] == len(TINY_PNG_DATAURL)

        # GET /profile should now have profile_image set
        r2 = requests.get(f"{API}/employees/{tc1_user_id}/profile",
                          headers={"Authorization": f"Bearer {hr_token}"}, timeout=20)
        assert r2.status_code == 200
        img = r2.json()["user"].get("profile_image", "")
        assert img.startswith("data:image"), f"profile_image not persisted: {img[:30]}"

    def test_update_photo_oversized_capped(self, hr_token, tc1_user_id):
        # Build > 800K char string (data URL prefix + big body)
        big_payload = "data:image/png;base64," + ("A" * 900_000)
        r = requests.put(
            f"{API}/employees/{tc1_user_id}/photo",
            json={"profile_image": big_payload},
            headers={"Authorization": f"Bearer {hr_token}"}, timeout=30,
        )
        assert r.status_code == 200
        body = r.json()
        # Capped to 800_000 chars
        assert body["size"] == 800_000, f"expected cap 800000, got {body['size']}"

    def test_update_photo_404(self, hr_token):
        r = requests.put(
            f"{API}/employees/bogus-id-zzz/photo",
            json={"profile_image": TINY_PNG_DATAURL},
            headers={"Authorization": f"Bearer {hr_token}"}, timeout=15,
        )
        assert r.status_code == 404


# ============ GET /api/employees/:id/profile/pdf ============
class TestProfilePdf:
    def test_pdf_as_hr(self, hr_token, tc1_user_id):
        r = requests.get(f"{API}/employees/{tc1_user_id}/profile/pdf",
                         headers={"Authorization": f"Bearer {hr_token}"}, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        cd = r.headers.get("content-disposition", "").lower()
        assert "attachment" in cd
        assert "filename" in cd
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000

    def test_pdf_as_other_telecaller_403(self, agent1_token, tc1_user_id):
        r = requests.get(f"{API}/employees/{tc1_user_id}/profile/pdf",
                         headers={"Authorization": f"Bearer {agent1_token}"}, timeout=15)
        assert r.status_code == 403


# ============ POST /api/telecallers with profile_image ============
class TestCreateTelecallerWithPhoto:
    def test_create_with_photo_persists(self, admin_token):
        import uuid as _uuid
        suffix = _uuid.uuid4().hex[:6]
        payload = {
            "email": f"TEST_iter31_{suffix}@example.com",
            "name": "TEST Iter31 Photo",
            "phone": f"+9199999{suffix[:5]}",
            "password": "tc123",
            "profile_image": TINY_PNG_DATAURL,
            "salary": 12345,
        }
        r = requests.post(f"{API}/telecallers", json=payload,
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        new_id = created.get("id") or created.get("user", {}).get("id")
        assert new_id, f"no id in create response: {created}"

        # Verify via GET /profile
        r2 = requests.get(f"{API}/employees/{new_id}/profile",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
        assert r2.status_code == 200
        u = r2.json()["user"]
        assert u.get("profile_image", "").startswith("data:image")
        # Cleanup
        try:
            requests.delete(f"{API}/telecallers/{new_id}",
                            headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        except Exception:
            pass
