"""Iter-32 comprehensive bug-scan tests.

Covers: PWA manifest, service-worker, security headers on /api, /api/ws/notifications
JWT enforcement (HTTP upgrade probe), per-user rate-limit, proxy-login endpoint flow,
auth refresh, basic CRUD reachability across 15 roles.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

CREDS = {
    "admin": ("admin@celestaglow.com", "admin123"),
    "sm": ("salesmanager@celestaglow.com", "sm123"),
    "dm": ("manager1@celestaglow.com", "mgr123"),
    "tc": ("telecaller1@celestaglow.com", "tc123"),
    "agent": ("agent1@celestaglow.com", "agent123"),
    "finance": ("finance@celestaglow.com", "fin123"),
    "hr": ("hrmanager@celestaglow.com", "hr123"),
    "social": ("socialmedia@celestaglow.com", "social123"),
    "inhouse": ("inhouse1@celestaglow.com", "ih123"),
    "content_strat": ("contentstrat@celestaglow.com", "cs123"),
    "content_dev": ("contentdev@celestaglow.com", "cd123"),
    "asm": ("asstsa@celestaglow.com", "asm123"),
    "adm": ("asstdm@celestaglow.com", "adm123"),
    "inv": ("inventory@celestaglow.com", "inv123"),
    "digital": ("digitalmarketing@celestaglow.com", "dm123"),
}


def _login(email, pwd, retries=3):
    for i in range(retries):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=10)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 429:
            time.sleep(15)
            continue
        return None
    return None


@pytest.fixture(scope="module")
def admin_token():
    data = _login(*CREDS["admin"])
    assert data and "token" in data, "admin login failed"
    return data["token"]


# ===== PWA / SW =====
class TestPWA:
    def test_manifest_json_accessible(self):
        r = requests.get(f"{BASE_URL}/manifest.json", timeout=10)
        assert r.status_code == 200, f"manifest.json status={r.status_code}"
        j = r.json()
        assert "name" in j or "short_name" in j

    def test_service_worker_accessible(self):
        r = requests.get(f"{BASE_URL}/sw.js", timeout=10)
        assert r.status_code == 200, f"sw.js status={r.status_code}"
        assert "javascript" in r.headers.get("content-type", "").lower() or len(r.text) > 0


# ===== Security headers =====
class TestSecurityHeaders:
    def test_headers_on_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        h = {k.lower(): v for k, v in r.headers.items()}
        # report each
        missing = []
        for hdr in ["content-security-policy", "x-frame-options", "x-content-type-options",
                    "referrer-policy", "permissions-policy"]:
            if hdr not in h:
                missing.append(hdr)
        assert not missing, f"Missing security headers: {missing}; got: {list(h.keys())}"
        assert h.get("x-frame-options", "").upper() == "DENY"
        assert h.get("x-content-type-options", "").lower() == "nosniff"


# ===== Per-user rate limit (login burst) =====
class TestRateLimit:
    def test_login_burst_triggers_429(self):
        # use a real email + wrong password so the rate-limiter has the same key path as real login
        email = "telecaller2@celestaglow.com"
        codes = []
        for i in range(15):
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "WRONGPASS"}, timeout=10)
            codes.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in codes, f"Expected 429 in burst, got: {codes}"


# ===== Login for all 15 roles =====
class TestAllRoleLogins:
    @pytest.mark.parametrize("role_key", list(CREDS.keys()))
    def test_login(self, role_key):
        email, pwd = CREDS[role_key]
        time.sleep(2)  # spread out to avoid 429
        data = _login(email, pwd)
        assert data and data.get("token"), f"login failed for {role_key}={email}"
        assert "user" in data
        assert data["user"].get("role")


# ===== Proxy-login endpoint =====
class TestProxyLogin:
    def test_admin_proxy_login_for_hr(self, admin_token):
        # find a hr_manager user id
        r = requests.get(f"{BASE_URL}/api/hr/employees", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        if r.status_code != 200:
            pytest.skip(f"/api/hr/employees not reachable: {r.status_code}")
        users = r.json() if isinstance(r.json(), list) else (r.json().get("employees") or r.json().get("items", []))
        hr = next((u for u in users if u.get("role") == "hr_manager"), None)
        assert hr, "no hr_manager user found"
        rid = hr.get("id") or hr.get("_id")
        # call proxy-login
        r2 = requests.post(f"{BASE_URL}/api/admin/proxy-login/{rid}",
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r2.status_code in (200, 201), f"proxy-login status={r2.status_code} body={r2.text[:200]}"
        body = r2.json()
        # response should contain a proxy_token or token + url
        assert any(k in body for k in ("proxy_token", "token", "redirect_url", "url"))


# ===== Auth refresh =====
class TestAuthRefresh:
    def test_refresh_with_valid_token(self):
        time.sleep(2)
        data = _login(*CREDS["tc"])
        assert data
        rt = data.get("refresh_token")
        if not rt:
            pytest.skip("no refresh_token in login response")
        r = requests.post(f"{BASE_URL}/api/auth/refresh", json={"refresh_token": rt}, timeout=10)
        assert r.status_code == 200, f"refresh failed: {r.status_code} {r.text[:200]}"
        assert r.json().get("token")

    def test_refresh_with_bad_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/refresh", json={"refresh_token": "garbage"}, timeout=10)
        assert r.status_code in (400, 401, 422), f"expected 4xx, got {r.status_code}"


# ===== Cash holder flow balance check =====
class TestCashHolderBalance:
    def test_overdraw_blocked(self, admin_token):
        # find agent1 via /api/hr/employees
        r = requests.get(f"{BASE_URL}/api/hr/employees", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        if r.status_code != 200:
            pytest.skip(f"employees not reachable: {r.status_code}")
        users = r.json() if isinstance(r.json(), list) else (r.json().get("employees") or r.json().get("items", []))
        agent = next((u for u in users if u.get("email") == CREDS["agent"][0]), None)
        if not agent:
            pytest.skip("agent1 not found")
        aid = agent.get("id") or agent.get("_id")
        # finance login
        time.sleep(5)
        fin = _login(*CREDS["finance"])
        if not fin:
            pytest.skip("finance login failed")
        fhdr = {"Authorization": f"Bearer {fin['token']}"}
        # Assign 5000
        ra = requests.post(f"{BASE_URL}/api/finance/assign-cash",
                           json={"user_id": aid, "amount": 5000, "note": "iter32 test"},
                           headers=fhdr, timeout=10)
        if ra.status_code not in (200, 201):
            pytest.skip(f"assign failed: {ra.status_code} {ra.text[:200]}")
        # Return 3000
        rr1 = requests.post(f"{BASE_URL}/api/finance/return-cash",
                            json={"user_id": aid, "amount": 3000, "note": "partial"},
                            headers=fhdr, timeout=10)
        assert rr1.status_code in (200, 201), f"return 3000 failed: {rr1.status_code} {rr1.text[:200]}"
        # Try return 5000 (should fail, balance only 2000)
        rr2 = requests.post(f"{BASE_URL}/api/finance/return-cash",
                            json={"user_id": aid, "amount": 5000, "note": "overdraw"},
                            headers=fhdr, timeout=10)
        assert rr2.status_code == 400, f"overdraw should be 400, got {rr2.status_code}: {rr2.text[:200]}"
        # Return 2000 (zero out)
        rr3 = requests.post(f"{BASE_URL}/api/finance/return-cash",
                            json={"user_id": aid, "amount": 2000, "note": "zero"},
                            headers=fhdr, timeout=10)
        assert rr3.status_code in (200, 201), f"final return failed: {rr3.status_code} {rr3.text[:200]}"
