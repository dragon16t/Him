"""
Fresh-clone smoke test for Celesta Glow CRM.
Tests login, role endpoints, and core admin endpoints per review_request.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://port2-staging.preview.emergentagent.com").rstrip("/")

# --- Fixtures ---

@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, password):
    return session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)


@pytest.fixture(scope="session")
def admin_token(session):
    r = _login(session, "admin@celestaglow.com", "admin123")
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# --- AUTH login tests ---

@pytest.mark.parametrize("email,password,expected_role", [
    ("admin@celestaglow.com", "admin123", "admin"),
    ("telecaller1@celestaglow.com", "tc123", "telecaller"),
    ("agent1@celestaglow.com", "agent123", "agent"),
    ("finance@celestaglow.com", "fin123", "finance_manager"),
    ("hrmanager@celestaglow.com", "hr123", "hr_manager"),
    ("salesmanager@celestaglow.com", "sm123", "sales_manager"),
])
def test_login_role_success(session, email, password, expected_role):
    r = _login(session, email, password)
    assert r.status_code == 200, f"{email} login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
    assert "user" in data and isinstance(data["user"], dict)
    assert data["user"]["email"] == email
    assert data["user"]["role"] == expected_role, f"expected {expected_role}, got {data['user']['role']}"


def test_login_wrong_password(session):
    r = _login(session, "admin@celestaglow.com", "WRONGPASS")
    assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"
    body = r.json()
    msg = body.get("detail") or body.get("message") or body.get("error") or ""
    assert "wrong" in str(msg).lower(), f"unexpected msg: {msg}"


def test_login_unknown_email(session):
    r = _login(session, "doesnotexist@celestaglow.com", "anything")
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"
    body = r.json()
    msg = body.get("detail") or body.get("message") or body.get("error") or ""
    assert "no account" in str(msg).lower() or "not found" in str(msg).lower(), f"unexpected msg: {msg}"


# --- Role list endpoints ---

def _extract_list(data, key_candidates):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in key_candidates:
            if k in data and isinstance(data[k], list):
                return data[k]
    return None


@pytest.mark.parametrize("path,key", [
    ("/api/telecallers", "telecallers"),
    ("/api/agents", "agents"),
    ("/api/managers", "managers"),
    ("/api/sales-managers", "sales_managers"),
    ("/api/hr-managers", "hr_managers"),
])
def test_role_list_endpoints(session, admin_headers, path, key):
    r = session.get(f"{BASE_URL}{path}", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:300]}"
    items = _extract_list(r.json(), [key, "data", "items"])
    assert items is not None, f"{path} no list found in: {str(r.json())[:200]}"
    assert len(items) > 0, f"{path} returned empty list (expected seeded users)"


# --- Core list endpoints ---

def test_get_leads(session, admin_headers):
    r = session.get(f"{BASE_URL}/api/leads", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    items = _extract_list(r.json(), ["leads", "data", "items"])
    assert items is not None, f"unexpected shape: {str(r.json())[:200]}"


def test_get_orders(session, admin_headers):
    r = session.get(f"{BASE_URL}/api/orders", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    items = _extract_list(r.json(), ["orders", "data", "items"])
    assert items is not None, f"unexpected shape: {str(r.json())[:200]}"


# --- HR document templates ---

def test_hr_document_templates(session, admin_headers):
    r = session.get(f"{BASE_URL}/api/hr/document-templates", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    # expect dict with builtin_keys list of 9
    if isinstance(data, dict):
        keys = data.get("builtin_keys") or data.get("builtins") or []
        assert isinstance(keys, list), f"builtin_keys not a list: {data}"
        assert len(keys) == 9, f"expected 9 builtin templates, got {len(keys)}: {keys}"
    else:
        pytest.fail(f"expected dict response, got {type(data).__name__}: {str(data)[:200]}")


# --- Admin employees ---

def test_admin_employees(session, admin_headers):
    r = session.get(f"{BASE_URL}/api/admin/employees", headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    # Could be a list or dict with employees key
    if isinstance(data, dict):
        emp_list = data.get("employees") or data.get("data") or []
    else:
        emp_list = data
    assert isinstance(emp_list, list), f"unexpected employees structure: {str(data)[:200]}"
    assert len(emp_list) > 0, "no employees seeded"


# --- POST /api/instructions ---

def test_post_instructions(session, admin_headers):
    payload = {
        "title": "TEST_smoke instruction",
        "description": "Smoke test instruction",
        "target_roles": ["telecaller"],
        "priority": "medium",
    }
    r = session.post(f"{BASE_URL}/api/instructions", headers=admin_headers, json=payload, timeout=60)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:400]}"
    data = r.json()
    # rich response expected
    assert "instruction" in data, f"missing instruction: {list(data.keys())}"
    # The other rich fields
    for key in ["tasks_created", "notifications_created", "email_results", "target_users_count"]:
        assert key in data, f"missing field '{key}' in response: {list(data.keys())}"
