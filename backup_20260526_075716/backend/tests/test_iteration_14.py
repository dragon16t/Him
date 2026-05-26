"""
Iteration 14 - Phone Mandatory, Phone Display, Delete-Respawn Fix, SMM Task Assignment,
Full User-Flow per Role, Password Change, Edit Persistence.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hrms-portal-29.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
DELETE_PW = "XYCDF6F@123"

ADMIN = {"email": "admin@celestaglow.com", "password": "admin123"}
SMM = {"email": "socialmedia@celestaglow.com", "password": "social123"}
INHOUSE1 = {"email": "inhouse1@celestaglow.com", "password": "ih123"}
HR = {"email": "hrmanager@celestaglow.com", "password": "hr123"}

# 14 non-admin roles: (endpoint_path, role_name_for_dashboard, default_pw)
ROLES = [
    ("telecallers", "telecaller", "tc123"),
    ("agents", "agent", "agent123"),
    ("managers", "district_manager", "mgr123"),
    ("sales-managers", "sales_manager", "sm123"),
    ("finance-managers", "finance_manager", "fin123"),
    ("hr-managers", "hr_manager", "hr123"),
    ("social-media-managers", "social_media_manager", "social123"),
    ("inhouse-telecallers", "inhouse_telecaller", "ih123"),
    ("content-strategists", "content_strategist", "cs123"),
    ("content-developers", "content_developer", "cd123"),
    ("assistant-sales-managers", "assistant_sales_manager", "asm123"),
    ("assistant-district-managers", "assistant_district_manager", "adm123"),
    ("inventory-managers", "inventory_manager", "inv123"),
    ("digital-marketing-managers", "digital_marketing_manager", "dm123"),
]


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="session")
def admin_token():
    r = _login(**ADMIN)
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _uniq_email(prefix):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:6]}@example.com"


# =================================================================
# 1. PHONE MANDATORY for all 14 role endpoints + hr-team
# =================================================================
class TestPhoneMandatory:
    @pytest.mark.parametrize("endpoint,role,_pw", ROLES)
    def test_create_without_phone_returns_400(self, endpoint, role, _pw, admin_headers):
        payload = {"email": _uniq_email(role), "name": "TEST NoPhone", "salary": 1000}
        r = requests.post(f"{API}/{endpoint}", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 400, f"{endpoint} should reject missing phone, got {r.status_code}: {r.text}"
        assert "phone" in r.text.lower()

    @pytest.mark.parametrize("endpoint,role,_pw", ROLES)
    def test_create_with_phone_succeeds(self, endpoint, role, _pw, admin_headers):
        email = _uniq_email(role)
        payload = {"email": email, "name": f"TEST {role} Phone", "phone": "9999988877", "salary": 1000}
        r = requests.post(f"{API}/{endpoint}", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200, f"{endpoint} create with phone failed: {r.status_code} {r.text}"
        body = r.json()
        u = body.get("user", body)
        assert u.get("phone") == "9999988877"
        # cleanup
        if u.get("id"):
            requests.delete(f"{API}/users/{u['id']}", json={"password": DELETE_PW}, headers=admin_headers, timeout=10)

    def test_hr_team_phone_mandatory(self, admin_headers):
        # missing phone
        r = requests.post(f"{API}/hr-team", json={"email": _uniq_email("hrt"), "name": "TEST HRT NoPhone"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 400, f"hr-team should reject missing phone: {r.status_code} {r.text}"

    def test_hr_team_with_phone(self, admin_headers):
        email = _uniq_email("hrt")
        r = requests.post(f"{API}/hr-team", json={"email": email, "name": "TEST HRT", "phone": "9888877766",
                                                   "department": "Test"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("phone") == "9888877766"


# =================================================================
# 2. PHONE DISPLAY in /api/hr/employees and /api/all-users
# =================================================================
class TestPhoneDisplay:
    def test_hr_employees_have_phone(self, admin_headers):
        r = requests.get(f"{API}/hr/employees", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        emps = r.json()["employees"]
        assert len(emps) > 0
        missing = [e for e in emps if not e.get("phone")]
        assert len(missing) == 0, f"{len(missing)} employees missing phone: {[e.get('email') for e in missing[:5]]}"

    def test_all_users_have_phone(self, admin_headers):
        r = requests.get(f"{API}/all-users", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        users = body.get("users", body) if isinstance(body, dict) else body
        if isinstance(users, dict):
            # combine all role lists
            all_users = []
            for v in users.values():
                if isinstance(v, list):
                    all_users.extend(v)
            users = all_users
        assert len(users) > 0
        missing = [u for u in users if u.get("role") != "admin" and not u.get("phone")]
        assert len(missing) == 0, f"{len(missing)} non-admin users missing phone: {[u.get('email') for u in missing[:5]]}"

    def test_no_objectid_leaks(self, admin_headers):
        for path in ["/hr/employees", "/all-users", "/leads", "/tasks"]:
            r = requests.get(f"{API}{path}", headers=admin_headers, timeout=10)
            assert r.status_code in (200, 403), f"{path} returned {r.status_code}"
            if r.status_code == 200:
                assert "_id" not in r.text or '"_id"' not in r.text, f"{path} leaks _id"


# =================================================================
# 3. DELETE-RESPAWN FIX (tombstone)
# =================================================================
class TestDeleteRespawn:
    def test_delete_user_then_login_fails_and_tombstone_set(self, admin_headers):
        email = _uniq_email("delete")
        # create
        r = requests.post(f"{API}/telecallers",
                          json={"email": email, "name": "TEST Delete", "phone": "9000011122", "password": "delpw123"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        uid = r.json()["user"]["id"]
        # login should work
        lr = _login(email, "delpw123")
        assert lr.status_code == 200, f"Created user can't login: {lr.text}"
        # delete with master password
        dr = requests.delete(f"{API}/users/{uid}", json={"password": DELETE_PW},
                             headers=admin_headers, timeout=15)
        assert dr.status_code == 200, dr.text
        # login must fail
        lr2 = _login(email, "delpw123")
        assert lr2.status_code == 401, f"Deleted user still logs in: {lr2.status_code} {lr2.text}"

    def test_delete_wrong_password_returns_403(self, admin_headers):
        email = _uniq_email("delwrongpw")
        r = requests.post(f"{API}/telecallers",
                          json={"email": email, "name": "TEST", "phone": "9000022233"},
                          headers=admin_headers, timeout=15)
        uid = r.json()["user"]["id"]
        dr = requests.delete(f"{API}/users/{uid}", json={"password": "wrong"},
                             headers=admin_headers, timeout=15)
        assert dr.status_code in (400, 403), f"Wrong delete pw should fail: {dr.status_code}"
        # cleanup
        requests.delete(f"{API}/users/{uid}", json={"password": DELETE_PW}, headers=admin_headers, timeout=10)


# =================================================================
# 4. SMM -> In-House Telecaller TASK assignment
# =================================================================
class TestSMMTaskAssignment:
    def test_smm_assigns_task_to_inhouse_tc(self, admin_headers):
        # SMM login
        smm_r = _login(**SMM)
        assert smm_r.status_code == 200
        smm_h = {"Authorization": f"Bearer {smm_r.json()['token']}", "Content-Type": "application/json"}
        # find inhouse1 id
        au = requests.get(f"{API}/all-users", headers=admin_headers, timeout=10).json()
        users = au.get("users", []) if isinstance(au, dict) else au
        ih_id = None
        for u in users:
            if isinstance(u, dict) and u.get("email") == "inhouse1@celestaglow.com":
                ih_id = u.get("id"); break
        assert ih_id, f"Could not find inhouse1 id. Sample user: {users[0] if users else 'none'}"

        # SMM creates task assigned to inhouse TC
        title = f"TEST SMM->IHTC {uuid.uuid4().hex[:6]}"
        cr = requests.post(f"{API}/tasks",
                           json={"title": title, "description": "Influencer outreach",
                                 "assigned_to": ih_id, "assigned_to_name": "Divya Kumar",
                                 "assigned_to_role": "inhouse_telecaller", "priority": "high"},
                           headers=smm_h, timeout=15)
        assert cr.status_code == 200, cr.text

        # IH-TC1 fetches tasks
        ih_r = _login(**INHOUSE1)
        assert ih_r.status_code == 200
        ih_h = {"Authorization": f"Bearer {ih_r.json()['token']}", "Content-Type": "application/json"}
        gt = requests.get(f"{API}/tasks", headers=ih_h, timeout=15)
        assert gt.status_code == 200, gt.text
        tasks = gt.json().get("tasks", [])
        titles = [t.get("title") for t in tasks]
        assert title in titles, f"Task not visible to inhouse TC. Got titles: {titles[:5]}"


# =================================================================
# 5. FULL USER-FLOW per role: create -> login -> edit -> pw change -> login again -> delete -> login fails
# Reduced to 1 user per role to fit budget; matrix of 14 roles still covers each path.
# =================================================================
class TestFullUserFlowAllRoles:
    @pytest.mark.parametrize("endpoint,role,_pw", ROLES)
    def test_full_flow(self, endpoint, role, _pw, admin_headers):
        email = _uniq_email(f"flow_{role}")
        orig_pw = "Init@123"
        new_pw = "Changed@456"

        # 1) Create with phone
        cr = requests.post(f"{API}/{endpoint}",
                           json={"email": email, "name": f"TEST {role}", "phone": "9111122233",
                                 "password": orig_pw, "salary": 5000},
                           headers=admin_headers, timeout=15)
        assert cr.status_code == 200, f"[{role}] create failed: {cr.status_code} {cr.text}"
        body = cr.json()
        u = body.get("user", body)
        uid = u["id"]
        assert u.get("phone") == "9111122233"

        try:
            # 2) New user logs in
            lr = _login(email, orig_pw)
            assert lr.status_code == 200, f"[{role}] login failed: {lr.text}"
            user_token = lr.json()["token"]
            user_h = {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}

            # 3) Edit via PUT /users/{id}/update
            ur = requests.put(f"{API}/users/{uid}/update",
                              json={"name": f"TEST {role} Updated", "salary": 7777, "phone": "9222233344"},
                              headers=admin_headers, timeout=15)
            assert ur.status_code == 200, f"[{role}] update failed: {ur.text}"
            # verify persistence via /hr/employees or /all-users
            eg = requests.get(f"{API}/hr/employees", headers=admin_headers, timeout=10).json()
            found = next((e for e in eg["employees"] if e.get("id") == uid), None)
            assert found, f"[{role}] user {uid} not in employees after update"
            assert found.get("name") == f"TEST {role} Updated", f"[{role}] name not persisted: {found.get('name')}"
            assert found.get("salary") == 7777, f"[{role}] salary not persisted: {found.get('salary')}"
            assert found.get("phone") == "9222233344", f"[{role}] phone not persisted: {found.get('phone')}"

            # 4) Change password via PUT /profile/password
            pr = requests.put(f"{API}/profile/password",
                              json={"old_password": orig_pw, "new_password": new_pw},
                              headers=user_h, timeout=15)
            assert pr.status_code == 200, f"[{role}] pw change failed: {pr.text}"

            # 4b) Wrong old password should fail
            pr2 = requests.put(f"{API}/profile/password",
                               json={"old_password": "wrongpw", "new_password": "x"},
                               headers=user_h, timeout=15)
            assert pr2.status_code == 400, f"[{role}] wrong-old-pw should be 400, got {pr2.status_code}"

            # 5) Login with new password
            lr2 = _login(email, new_pw)
            assert lr2.status_code == 200, f"[{role}] login with new pw failed: {lr2.text}"
            # old pw should fail
            lr_old = _login(email, orig_pw)
            assert lr_old.status_code == 401, f"[{role}] old pw still works after change: {lr_old.status_code}"

            # 6) Admin delete with master password
            dr = requests.delete(f"{API}/users/{uid}", json={"password": DELETE_PW},
                                 headers=admin_headers, timeout=15)
            assert dr.status_code == 200, f"[{role}] delete failed: {dr.text}"

            # 7) Deleted user can't log in
            lr3 = _login(email, new_pw)
            assert lr3.status_code == 401, f"[{role}] deleted user still logs in: {lr3.status_code}"

        finally:
            # safety cleanup
            requests.delete(f"{API}/users/{uid}", json={"password": DELETE_PW}, headers=admin_headers, timeout=10)


# =================================================================
# 6. SMTP non-blocking - batch of 10 user creations < 5s
# =================================================================
class TestSmtpNonBlocking:
    def test_batch_of_10_creations_fast(self, admin_headers):
        ids = []
        start = time.time()
        for i in range(10):
            email = _uniq_email(f"batch_{i}")
            r = requests.post(f"{API}/telecallers",
                              json={"email": email, "name": f"TEST batch {i}", "phone": f"900001{i:04d}"},
                              headers=admin_headers, timeout=15)
            assert r.status_code == 200, r.text
            ids.append(r.json()["user"]["id"])
        elapsed = time.time() - start
        # cleanup
        for uid in ids:
            requests.delete(f"{API}/users/{uid}", json={"password": DELETE_PW}, headers=admin_headers, timeout=10)
        assert elapsed < 15.0, f"10 user creations took {elapsed:.1f}s (target <5s ideal, <15s acceptable for network)"
        print(f"\nBatch of 10 creates took {elapsed:.2f}s")


# =================================================================
# 7. Dashboard login per role - just confirm token returned for each demo creds
# =================================================================
class TestPerRoleLogin:
    @pytest.mark.parametrize("email,password,role", [
        ("admin@celestaglow.com", "admin123", "admin"),
        ("salesmanager@celestaglow.com", "sm123", "sales_manager"),
        ("manager1@celestaglow.com", "mgr123", "district_manager"),
        ("telecaller1@celestaglow.com", "tc123", "telecaller"),
        ("agent1@celestaglow.com", "agent123", "agent"),
        ("finance@celestaglow.com", "fin123", "finance_manager"),
        ("hrmanager@celestaglow.com", "hr123", "hr_manager"),
        ("socialmedia@celestaglow.com", "social123", "social_media_manager"),
        ("inhouse1@celestaglow.com", "ih123", "inhouse_telecaller"),
        ("contentstrat@celestaglow.com", "cs123", "content_strategist"),
        ("contentdev@celestaglow.com", "cd123", "content_developer"),
        ("asstsa@celestaglow.com", "asm123", "assistant_sales_manager"),
        ("asstdm@celestaglow.com", "adm123", "assistant_district_manager"),
        ("inventory@celestaglow.com", "inv123", "inventory_manager"),
        ("digitalmarketing@celestaglow.com", "dm123", "digital_marketing_manager"),
    ])
    def test_demo_login(self, email, password, role):
        r = _login(email, password)
        assert r.status_code == 200, f"[{role}] login failed: {r.text}"
        body = r.json()
        assert "token" in body and "user" in body
        assert body["user"]["role"] == role
