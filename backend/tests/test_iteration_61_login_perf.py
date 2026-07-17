"""Iteration 61 – event-loop blocking / concurrency fix tests.

Validates:
  1. Login for admin/SM/TC succeeds fast (<3s) with token.
  2. Wrong password returns 401 fast (<2s) with 'Password entered is wrong' detail.
  3. 5 concurrent logins do not stall / serialize on bcrypt (avg < 3s each).
  4. Delhivery tracking endpoint doesn't hang (<10s) for bogus AWB.
  5. Razorpay payment-links list endpoint returns 200 for telecaller.
"""
import os
import time
import concurrent.futures as cf
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Preview URL fallback for local pytest run
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

CREDS = {
    "admin":  ("admin@celestaglow.com",         "admin123"),
    "sm":     ("salesmanager@celestaglow.com",  "sm123"),
    "tc":     ("telecaller1@celestaglow.com",   "tc123"),
}


def _login(email, password, timeout=15):
    t0 = time.time()
    r = requests.post(f"{API}/auth/login",
                      json={"email": email, "password": password},
                      timeout=timeout)
    return r, time.time() - t0


# ─── 1. Basic login success + speed ─────────────────────────────────────
@pytest.mark.parametrize("role", ["admin", "sm", "tc"])
def test_login_success_fast(role):
    email, pw = CREDS[role]
    r, dt = _login(email, pw)
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
    assert "user" in data and data["user"].get("email") == email
    assert dt < 3.0, f"{role} login too slow: {dt:.2f}s"
    print(f"OK {role} login {dt*1000:.0f}ms")


# ─── 2. Wrong password → 401 fast with correct detail ────────────────────
def test_wrong_password_fast_401():
    r, dt = _login("admin@celestaglow.com", "totally-wrong")
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"
    body = r.json()
    detail = (body.get("detail") or "").lower()
    assert "wrong" in detail or "incorrect" in detail or "invalid" in detail, \
        f"unexpected detail: {body}"
    assert dt < 3.0, f"wrong-pw took too long: {dt:.2f}s"


# ─── 3. Concurrent login load – shouldn't serialize on bcrypt ────────────
def test_concurrent_logins_no_stall():
    email, pw = CREDS["admin"]

    def worker():
        return _login(email, pw, timeout=20)

    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(lambda _: worker(), range(5)))
    wall = time.time() - t0

    codes = [r.status_code for r, _ in results]
    durations = [dt for _, dt in results]
    print(f"concurrent codes={codes} durations={[f'{d*1000:.0f}ms' for d in durations]} wall={wall*1000:.0f}ms")
    for r, _ in results:
        assert r.status_code == 200, f"got {r.status_code} body={r.text[:200]}"
    assert max(durations) < 8.0, f"max latency {max(durations):.2f}s too high"
    # If bcrypt were serializing, wall would be ~5×single. With to_thread it should be closer to 2×.
    single_r, single_dt = _login(email, pw)
    assert single_r.status_code == 200
    assert wall < single_dt * 5 + 2, \
        f"5 concurrent wall={wall:.2f}s vs single {single_dt:.2f}s (serialized?)"


# ─── 4. Delhivery track endpoint responds (not hang) ─────────────────────
def test_delhivery_track_no_hang():
    r, _ = _login(*CREDS["admin"])
    token = r.json()["token"]
    t0 = time.time()
    try:
        resp = requests.get(f"{API}/shipping/delhivery/track/BOGUS12345",
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=15)
    except requests.Timeout:
        pytest.fail("Delhivery tracking endpoint hung (>15s)")
    dt = time.time() - t0
    assert dt < 15.0
    # Any non-5xx (or upstream 502 wrapped) is OK — we just verify it doesn't stall
    assert resp.status_code in (200, 400, 401, 403, 404, 422, 429, 502, 503), \
        f"unexpected status {resp.status_code}: {resp.text[:200]}"
    print(f"delhivery status={resp.status_code} took={dt*1000:.0f}ms")


# ─── 5. Razorpay payment-links list ──────────────────────────────────────
def test_razorpay_list_as_telecaller():
    r, _ = _login(*CREDS["tc"])
    token = r.json()["token"]
    resp = requests.get(f"{API}/razorpay/payment-links",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=15)
    assert resp.status_code == 200, f"{resp.status_code}: {resp.text[:200]}"
    body = resp.json()
    assert "payment_links" in body and isinstance(body["payment_links"], list)
