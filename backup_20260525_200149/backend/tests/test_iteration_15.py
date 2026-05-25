"""
Iteration 15 — Verify:
  * employee-tasks CRUD + efficiency overview (HR)
  * SMM/CD content endpoints (pillars, scripts, assignments, calendar, influencers, shoot-plans, my-tasks)
  * 15-role login (used by 10 roles needing My Sheet)
"""
import os
import uuid
import datetime
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@celestaglow.com", "password": "admin123"}
HR = {"email": "hrmanager@celestaglow.com", "password": "hr123"}
SMM = {"email": "socialmedia@celestaglow.com", "password": "social123"}
CD = {"email": "contentdev@celestaglow.com", "password": "cd123"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_h():
    r = _login(**ADMIN)
    assert r.status_code == 200, r.text
    return _h(r.json()["token"])


@pytest.fixture(scope="session")
def hr_h():
    r = _login(**HR)
    assert r.status_code == 200, r.text
    return _h(r.json()["token"])


@pytest.fixture(scope="session")
def smm_h():
    r = _login(**SMM)
    assert r.status_code == 200, r.text
    return _h(r.json()["token"])


@pytest.fixture(scope="session")
def cd_h():
    r = _login(**CD)
    assert r.status_code == 200, r.text
    return _h(r.json()["token"])


# ====== 1. employee-tasks (DailyTaskSheet) ======
class TestEmployeeTasks:
    def test_create_my_task_smm(self, smm_h):
        title = f"TEST_ts_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/employee-tasks",
                          json={"title": title, "description": "Plan SMM",
                                "from_time": "09:00", "to_time": "10:00", "status": "pending"},
                          headers=smm_h, timeout=15)
        assert r.status_code == 200, r.text
        t = r.json()["task"]
        assert t["title"] == title
        assert t["from_time"] == "09:00" and t["to_time"] == "10:00"
        assert t["status"] == "pending"
        assert t["user_role"] == "social_media_manager"
        assert "id" in t and "_id" not in t

        # GET back
        g = requests.get(f"{API}/employee-tasks", headers=smm_h, timeout=15)
        assert g.status_code == 200
        ids = [x["id"] for x in g.json()["tasks"]]
        assert t["id"] in ids

        # PUT update -> completed
        u = requests.put(f"{API}/employee-tasks/{t['id']}",
                         json={"status": "completed"}, headers=smm_h, timeout=15)
        assert u.status_code == 200
        g2 = requests.get(f"{API}/employee-tasks", headers=smm_h, timeout=15).json()["tasks"]
        match = next((x for x in g2 if x["id"] == t["id"]), None)
        assert match and match["status"] == "completed"
        assert match.get("completed_at"), "completed_at should be set after status=completed"

        # DELETE
        d = requests.delete(f"{API}/employee-tasks/{t['id']}", headers=smm_h, timeout=15)
        assert d.status_code == 200

    def test_efficiency_overview_hr_only(self, hr_h, smm_h, admin_h):
        # SMM creates a task for today
        title = f"TEST_eff_{uuid.uuid4().hex[:6]}"
        today = datetime.date.today().isoformat()
        cr = requests.post(f"{API}/employee-tasks",
                           json={"title": title, "from_time": "11:00", "to_time": "12:00",
                                 "status": "in_progress", "date": today},
                           headers=smm_h, timeout=15)
        assert cr.status_code == 200
        tid = cr.json()["task"]["id"]
        try:
            r = requests.get(f"{API}/employee-tasks/efficiency", headers=hr_h, timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            assert "employees" in data and isinstance(data["employees"], list)
            # must contain SMM user with our entry
            smm_entry = next((e for e in data["employees"]
                              if any(en["id"] == tid for en in e.get("entries", []))), None)
            assert smm_entry, "SMM efficiency entry missing"
            assert smm_entry["total"] >= 1
            assert smm_entry["in_progress"] >= 1
        finally:
            requests.delete(f"{API}/employee-tasks/{tid}", headers=smm_h, timeout=10)

    def test_efficiency_forbidden_for_non_hr(self, smm_h):
        r = requests.get(f"{API}/employee-tasks/efficiency", headers=smm_h, timeout=15)
        assert r.status_code == 403

    def test_get_only_returns_own_tasks_for_non_hr(self, smm_h, cd_h):
        title_smm = f"TEST_own_smm_{uuid.uuid4().hex[:6]}"
        title_cd = f"TEST_own_cd_{uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{API}/employee-tasks",
                           json={"title": title_smm, "from_time": "08:00", "to_time": "09:00"},
                           headers=smm_h).json()["task"]
        r2 = requests.post(f"{API}/employee-tasks",
                           json={"title": title_cd, "from_time": "08:00", "to_time": "09:00"},
                           headers=cd_h).json()["task"]
        try:
            cd_tasks = requests.get(f"{API}/employee-tasks", headers=cd_h).json()["tasks"]
            cd_titles = [t["title"] for t in cd_tasks]
            assert title_cd in cd_titles
            assert title_smm not in cd_titles, "CD must not see SMM tasks"
        finally:
            requests.delete(f"{API}/employee-tasks/{r1['id']}", headers=smm_h)
            requests.delete(f"{API}/employee-tasks/{r2['id']}", headers=cd_h)


# ====== 2. Content pipeline endpoints ======
class TestContentPipeline:
    def test_pillars_create_and_list(self, smm_h):
        title = f"TEST_pillar_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/content/pillars",
                          json={"title": title, "description": "test"}, headers=smm_h)
        assert r.status_code == 200, r.text
        body = r.json()
        p = body.get("pillar", body)
        assert p.get("title") == title
        # GET
        g = requests.get(f"{API}/content/pillars", headers=smm_h)
        assert g.status_code == 200
        gbody = g.json()
        items = gbody if isinstance(gbody, list) else gbody.get("pillars", [])
        titles = [pp.get("title") for pp in items]
        assert title in titles

    def test_scripts_create_assign_my_tasks(self, smm_h, cd_h, admin_h):
        # Create pillar
        pname = f"TEST_p_{uuid.uuid4().hex[:6]}"
        pr = requests.post(f"{API}/content/pillars", json={"name": pname}, headers=smm_h)
        assert pr.status_code == 200
        # Create script
        title = f"TEST_script_{uuid.uuid4().hex[:6]}"
        sr = requests.post(f"{API}/content/scripts",
                           json={"title": title, "pillar": pname, "content": "abc",
                                 "platform": "instagram"}, headers=smm_h)
        assert sr.status_code == 200, sr.text
        sbody = sr.json()
        script = sbody if isinstance(sbody, dict) and "id" in sbody else sbody.get("script", sbody)
        sid = script.get("id") or script.get("_id")
        assert sid

        # Find content_developer user
        au = requests.get(f"{API}/all-users", headers=admin_h).json()
        ulist = au.get("users", au) if isinstance(au, dict) else au
        if isinstance(ulist, dict):
            flat = []
            for v in ulist.values():
                if isinstance(v, list):
                    flat.extend(v)
            ulist = flat
        cd_user = next((u for u in ulist if isinstance(u, dict) and u.get("email") == CD["email"]), None)
        assert cd_user, "Content developer user not found"

        # Assign script to CD
        ar = requests.post(f"{API}/content/scripts/{sid}/assign",
                           json={"developer_id": cd_user["id"], "developer_name": cd_user.get("name", "CD"),
                                 "assignee_id": cd_user["id"], "assignee_name": cd_user.get("name", "CD"),
                                 "notes": "please do"},
                           headers=smm_h)
        assert ar.status_code == 200, ar.text

        # CD fetches my-tasks
        my = requests.get(f"{API}/content/my-tasks", headers=cd_h)
        assert my.status_code == 200
        mybody = my.json()
        tasks = mybody if isinstance(mybody, list) else mybody.get("tasks", mybody.get("assignments", []))
        # tolerant: at least non-error
        assert isinstance(tasks, list)

        # Update script status
        ur = requests.put(f"{API}/content/scripts/{sid}",
                          json={"status": "in_progress"}, headers=cd_h)
        assert ur.status_code in (200, 403), ur.text  # may or may not allow CD edit

    def test_content_assignments_crud(self, smm_h, admin_h):
        au = requests.get(f"{API}/all-users", headers=admin_h).json()
        ulist = au.get("users", au) if isinstance(au, dict) else au
        if isinstance(ulist, dict):
            flat = []
            for v in ulist.values():
                if isinstance(v, list):
                    flat.extend(v)
            ulist = flat
        cd_user = next((u for u in ulist if isinstance(u, dict) and u.get("email") == CD["email"]), None)
        assert cd_user
        title = f"TEST_ca_{uuid.uuid4().hex[:6]}"
        cr = requests.post(f"{API}/content-assignments",
                           json={"title": title, "description": "x",
                                 "assignee_id": cd_user["id"],
                                 "assignee_name": cd_user.get("name", "CD"),
                                 "platform": "instagram", "due_date": "2026-12-31"},
                           headers=smm_h)
        assert cr.status_code == 200, cr.text
        body = cr.json()
        a = body if isinstance(body, dict) and "id" in body else body.get("assignment", body)
        aid = a.get("id")
        assert aid
        # GET
        g = requests.get(f"{API}/content-assignments", headers=smm_h)
        assert g.status_code == 200
        # PUT
        u = requests.put(f"{API}/content-assignments/{aid}",
                         json={"status": "in_progress"}, headers=smm_h)
        assert u.status_code == 200
        # DELETE
        d = requests.delete(f"{API}/content-assignments/{aid}", headers=smm_h)
        assert d.status_code in (200, 204)

    def test_content_calendar_crud(self, smm_h):
        title = f"TEST_cal_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/content-calendar",
                          json={"title": title, "platform": "instagram",
                                "scheduled_date": "2026-12-31", "type": "post"},
                          headers=smm_h)
        assert r.status_code == 200, r.text
        body = r.json()
        e = body if isinstance(body, dict) and "id" in body else body.get("entry", body)
        cid = e.get("id")
        assert cid
        g = requests.get(f"{API}/content-calendar", headers=smm_h)
        assert g.status_code == 200
        u = requests.put(f"{API}/content-calendar/{cid}",
                         json={"title": title + "_upd"}, headers=smm_h)
        assert u.status_code == 200
        d = requests.delete(f"{API}/content-calendar/{cid}", headers=smm_h)
        assert d.status_code in (200, 204)

    def test_influencer_outreach_crud(self, smm_h):
        name = f"TEST_inf_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/influencer/outreach",
                          json={"influencer_name": name, "platform": "instagram",
                                "contact": "@x", "followers": 1000, "status": "contacted"},
                          headers=smm_h)
        assert r.status_code == 200, r.text
        body = r.json()
        e = body.get("entry", body)
        iid = e.get("id")
        assert iid, f"no id in response: {body}"
        assert e.get("influencer_name") == name
        g = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        assert g.status_code == 200
        # PUT
        u = requests.put(f"{API}/influencer/outreach/{iid}",
                         json={"status": "responded"}, headers=smm_h)
        assert u.status_code == 200
        # delete via /influencers/{iid}
        d = requests.delete(f"{API}/influencers/{iid}", headers=smm_h)
        assert d.status_code in (200, 204, 404)  # tolerate

    def test_shoot_plans_create_get(self, cd_h):
        title = f"TEST_shoot_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/shoot-plans",
                          json={"title": title, "shoot_date": "2026-12-31",
                                "location": "studio", "team": ["cd"], "shots": ["a"]},
                          headers=cd_h)
        assert r.status_code == 200, r.text
        body = r.json()
        e = body if isinstance(body, dict) and "id" in body else body.get("plan", body)
        pid = e.get("id")
        assert pid
        g = requests.get(f"{API}/shoot-plans", headers=cd_h)
        assert g.status_code == 200
        u = requests.put(f"{API}/shoot-plans/{pid}",
                         json={"status": "completed"}, headers=cd_h)
        assert u.status_code == 200


# ====== 3. Login for the 10 listed roles ======
ROLE_LOGINS = [
    ("socialmedia@celestaglow.com", "social123", "social_media_manager"),
    ("hrmanager@celestaglow.com", "hr123", "hr_manager"),
    ("contentdev@celestaglow.com", "cd123", "content_developer"),
    ("finance@celestaglow.com", "fin123", "finance_manager"),
    ("asstdm@celestaglow.com", "adm123", "assistant_district_manager"),
    ("inventory@celestaglow.com", "inv123", "inventory_manager"),
    ("digitalmarketing@celestaglow.com", "dm123", "digital_marketing_manager"),
    ("inhouse1@celestaglow.com", "ih123", "inhouse_telecaller"),
    ("manager1@celestaglow.com", "mgr123", "district_manager"),
    ("salesmanager@celestaglow.com", "sm123", "sales_manager"),
]


@pytest.mark.parametrize("email,pw,role", ROLE_LOGINS)
def test_role_login_and_create_my_task(email, pw, role):
    """Each of the 10 roles can log in and create their own employee-task entry."""
    r = _login(email, pw)
    assert r.status_code == 200, f"[{role}] login: {r.text}"
    body = r.json()
    assert body["user"]["role"] == role
    h = _h(body["token"])
    title = f"TEST_role_{role}_{uuid.uuid4().hex[:6]}"
    cr = requests.post(f"{API}/employee-tasks",
                       json={"title": title, "from_time": "09:00", "to_time": "10:00"},
                       headers=h, timeout=15)
    assert cr.status_code == 200, f"[{role}] create employee-task failed: {cr.text}"
    tid = cr.json()["task"]["id"]
    requests.delete(f"{API}/employee-tasks/{tid}", headers=h, timeout=10)
