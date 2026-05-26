"""
Iteration 36 — Cache correctness sanity test (backend side).
We can't directly assert the frontend SWR layer here, but we CAN make sure that
once the frontend calls invalidate() and re-fetches /api/expenses, the new
expense IS present. This verifies the backend contract the SWR cache relies on.
"""
import os, requests, time

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")  # exists in /app/frontend/.env? no — use the staging url directly

# fall back to staging url referenced in frontend/.env
if not BASE:
    BASE = "https://portal-staging-19.preview.emergentagent.com"


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    r.raise_for_status()
    return r.json().get("token") or r.json()["access_token"]


def test_expense_create_then_list_returns_new_entry():
    token = _login("admin@celestaglow.com", "admin123")
    h = {"Authorization": f"Bearer {token}"}

    tag = f"TEST_iter36_{int(time.time())}"
    payload = {"category": "office", "amount": 42.5, "description": tag, "status": "pending"}
    cr = requests.post(f"{BASE}/api/expenses", json=payload, headers=h, timeout=15)
    assert cr.status_code in (200, 201), cr.text
    body = cr.json()
    obj = body.get("expense") or body
    new_id = obj.get("id") or obj.get("_id")
    assert new_id, cr.json()

    # GET list should include it (frontend cache MUST invalidate to see this)
    lr = requests.get(f"{BASE}/api/expenses", headers=h, timeout=15)
    assert lr.status_code == 200
    items = lr.json() if isinstance(lr.json(), list) else lr.json().get("expenses", [])
    assert any((it.get("description") == tag) or (it.get("id") == new_id) for it in items), \
        f"new expense {tag} missing from list — backend contract for cache invalidation broken"

    # cleanup
    requests.delete(f"{BASE}/api/expenses/{new_id}", headers=h, timeout=15)
