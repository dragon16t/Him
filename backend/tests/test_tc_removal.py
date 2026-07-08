"""Backend tests for TC soft-delete filter fix."""
import os
import requests
import pytest
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://hr-central-82.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@celestaglow.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def test_get_telecallers_excludes_deleted(admin_headers):
    r = requests.get(f"{BASE_URL}/api/telecallers", headers=admin_headers)
    assert r.status_code == 200, r.text
    tcs = r.json().get("telecallers", [])
    for tc in tcs:
        assert tc.get("deleted") is not True, f"Deleted TC leaked: {tc.get('email')}"


def test_get_telecallers_all_excludes_deleted(admin_headers):
    r = requests.get(f"{BASE_URL}/api/telecallers/all", headers=admin_headers)
    assert r.status_code == 200, r.text
    tcs = r.json().get("telecallers", [])
    for tc in tcs:
        assert tc.get("deleted") is not True


def test_full_removal_flow(admin_headers):
    """Create a TC, delete it, verify it disappears from GET."""
    # find an SM to assign to
    r = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
    sm_id = None
    if r.status_code == 200:
        users = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
        for u in users:
            if u.get("role") == "sales_manager":
                sm_id = u.get("id")
                break

    unique = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_TC_{unique}",
        "email": f"test_tc_{unique}@celestaglow.com",
        "phone": f"9{unique[:9]}",
        "password": "tc123",
    }
    if sm_id:
        payload["managed_by"] = sm_id

    cr = requests.post(f"{BASE_URL}/api/telecallers", headers=admin_headers, json=payload)
    assert cr.status_code in [200, 201], cr.text
    created = cr.json()
    tc_id = created.get("id") or created.get("telecaller", {}).get("id") or created.get("user", {}).get("id")
    assert tc_id, f"No id in create response: {created}"

    # Verify it appears
    lr = requests.get(f"{BASE_URL}/api/telecallers", headers=admin_headers)
    ids = [t["id"] for t in lr.json().get("telecallers", [])]
    assert tc_id in ids, "Newly created TC not visible"

    # Wrong password rejects
    wr = requests.delete(f"{BASE_URL}/api/telecallers/{tc_id}", headers=admin_headers, json={"password": "wrongpass"})
    assert wr.status_code == 403, f"Wrong password should be rejected, got {wr.status_code}"

    # Delete
    dr = requests.delete(f"{BASE_URL}/api/telecallers/{tc_id}", headers=admin_headers, json={"password": "remove"})
    assert dr.status_code == 200, dr.text
    body = dr.json()
    # Just check delete responded 200; response shape may vary
    _ = body

    # Verify gone from both endpoints
    lr2 = requests.get(f"{BASE_URL}/api/telecallers", headers=admin_headers)
    ids2 = [t["id"] for t in lr2.json().get("telecallers", [])]
    assert tc_id not in ids2, "Deleted TC still returned by /api/telecallers"

    lr3 = requests.get(f"{BASE_URL}/api/telecallers/all", headers=admin_headers)
    ids3 = [t["id"] for t in lr3.json().get("telecallers", [])]
    assert tc_id not in ids3, "Deleted TC still returned by /api/telecallers/all"
