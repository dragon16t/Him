"""Backend tests for iteration 17 — Payroll/suggest, content_type/step_map, submit-post/approve-post,
influencer/outreach PUT&DELETE, attendance login_time editing, payroll create with hours+rate."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


# ------------------------------ AUTH HELPERS ------------------------------ #
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j["token"]


@pytest.fixture(scope="session")
def hr_token():
    return _login("hrmanager@celestaglow.com", "hr123")


@pytest.fixture(scope="session")
def smm_token():
    return _login("socialmedia@celestaglow.com", "social123")


@pytest.fixture(scope="session")
def cd_token():
    return _login("contentdev@celestaglow.com", "cd123")


@pytest.fixture(scope="session")
def admin_token():
    return _login("admin@celestaglow.com", "admin123")


@pytest.fixture(scope="session")
def telecaller_token():
    return _login("telecaller1@celestaglow.com", "tc123")


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ------------------------------ PAYROLL/SUGGEST ------------------------------ #
class TestPayrollSuggest:
    def test_hr_can_get_suggest(self, hr_token):
        r = requests.get(f"{API}/payroll/suggest/hr-001", headers=H(hr_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("user_id", "attendance", "hourly_rate", "suggested_basic"):
            assert k in d, f"Missing key {k} in {list(d.keys())}"
        assert d["user_id"] == "hr-001"
        assert "total_hours" in d["attendance"]
        assert "working_days" in d["attendance"]
        assert isinstance(d["hourly_rate"], (int, float))

    def test_admin_can_get_suggest_for_smm(self, admin_token):
        r = requests.get(f"{API}/payroll/suggest/smm-001?month=1&year=2026",
                         headers=H(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["month"] == "01" and d["year"] == "2026"

    def test_telecaller_forbidden(self, telecaller_token):
        r = requests.get(f"{API}/payroll/suggest/tc-001", headers=H(telecaller_token), timeout=15)
        assert r.status_code == 403, r.text

    def test_unknown_user_404(self, hr_token):
        r = requests.get(f"{API}/payroll/suggest/zzz-bogus", headers=H(hr_token), timeout=15)
        assert r.status_code == 404, r.text


# ------------------------------ ATTENDANCE LOGIN_TIME EDIT ------------------------------ #
class TestAttendanceLoginTime:
    def test_mark_then_update_login_time(self, hr_token):
        # Mark attendance with a custom login time
        r1 = requests.post(f"{API}/attendance", headers=H(hr_token),
                           json={"user_id": "hr-001", "date": "2026-01-05",
                                 "user_name": "Test HR", "user_role": "hr_manager",
                                 "status": "present", "login_time": "10:15"}, timeout=15)
        assert r1.status_code == 200, r1.text
        assert r1.json()["attendance"]["login_time"] == "10:15"

        # Update the same date's login_time
        r2 = requests.post(f"{API}/attendance", headers=H(hr_token),
                           json={"user_id": "hr-001", "date": "2026-01-05",
                                 "user_name": "Test HR", "user_role": "hr_manager",
                                 "status": "present", "login_time": "08:45"}, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["attendance"]["login_time"] == "08:45"

        # Verify GET returns the updated value
        r3 = requests.get(f"{API}/attendance?user_id=hr-001&date_filter=2026-01-05",
                          headers=H(hr_token), timeout=15)
        assert r3.status_code == 200
        recs = r3.json()["records"]
        assert any(r["login_time"] == "08:45" for r in recs)


# ------------------------------ CONTENT_TYPE / STEP_MAP ------------------------------ #
class TestContentTypeStepMap:
    @pytest.fixture(scope="class")
    def pillar_id(self, smm_token):
        r = requests.post(f"{API}/content/pillars", headers=H(smm_token),
                          json={"title": "TEST_iter17_pillar", "description": "test"}, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["pillar"]["id"]

    @pytest.mark.parametrize("ctype,expect", [
        ("flyer",    {"video": False, "design": True}),
        ("reel",     {"video": True,  "design": False}),
        ("blog",     {"video": False, "design": False}),
        ("ad",       {"video": True,  "design": True}),
    ])
    def test_step_map_for_type(self, smm_token, pillar_id, ctype, expect):
        r = requests.post(f"{API}/content/scripts", headers=H(smm_token),
                          json={"pillar_id": pillar_id, "title": f"TEST_{ctype}",
                                "script_text": "x", "content_type": ctype,
                                "platform": "instagram", "deadline": "2026-01-31",
                                "priority": "P2"}, timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()["script"]
        assert s["content_type"] == ctype
        assert s["steps"]["video"] == expect["video"]
        assert s["steps"]["design"] == expect["design"]
        # video_status should be "n/a" when video step disabled
        if not expect["video"]:
            assert s["video_status"] == "n/a", f"Expected video_status='n/a' for {ctype}, got {s['video_status']}"
        if not expect["design"]:
            assert s["design_status"] == "n/a"


# ------------------------------ SUBMIT POST + APPROVE/REJECT/DIRECT ------------------------------ #
class TestPostApprovalFlow:
    @pytest.fixture
    def script_id(self, smm_token):
        # Create pillar+script and assign to CD
        rp = requests.post(f"{API}/content/pillars", headers=H(smm_token),
                           json={"title": "TEST_iter17_approval"}, timeout=15)
        pid = rp.json()["pillar"]["id"]
        rs = requests.post(f"{API}/content/scripts", headers=H(smm_token),
                           json={"pillar_id": pid, "title": "TEST_approval_script",
                                 "script_text": "x", "content_type": "flyer",
                                 "platform": "instagram"}, timeout=15)
        sid = rs.json()["script"]["id"]
        # Assign to CD
        ra = requests.post(f"{API}/content/scripts/{sid}/assign", headers=H(smm_token),
                           json={"content_developer_id": "cd-001"}, timeout=15)
        assert ra.status_code == 200, ra.text
        return sid

    def test_cd_submit_then_smm_approve(self, smm_token, cd_token, script_id):
        # CD submits post link
        r1 = requests.post(f"{API}/content/scripts/{script_id}/submit-post",
                           headers=H(cd_token),
                           json={"post_link": "https://insta.com/test-post-1",
                                 "notes": "Submitted for review"}, timeout=15)
        assert r1.status_code == 200, r1.text

        # Verify post_approval_status=pending via GET pillars
        rp = requests.get(f"{API}/content/pillars", headers=H(smm_token), timeout=15)
        scripts = [s for p in rp.json()["pillars"] for s in p.get("scripts", [])]
        s = next((s for s in scripts if s["id"] == script_id), None)
        assert s is not None
        assert s["post_approval_status"] == "pending"
        assert s["post_link"] == "https://insta.com/test-post-1"

        # SMM approves
        r2 = requests.post(f"{API}/content/scripts/{script_id}/approve-post",
                           headers=H(smm_token),
                           json={"action": "approve"}, timeout=15)
        assert r2.status_code == 200, r2.text

        # Verify final state
        rp2 = requests.get(f"{API}/content/pillars", headers=H(smm_token), timeout=15)
        scripts2 = [s for p in rp2.json()["pillars"] for s in p.get("scripts", [])]
        s2 = next((x for x in scripts2 if x["id"] == script_id), None)
        assert s2["post_approval_status"] == "approved"
        assert s2["post_status"] == "posted"
        assert s2["status"] == "completed"

    def test_cd_submit_then_smm_reject(self, smm_token, cd_token, script_id):
        requests.post(f"{API}/content/scripts/{script_id}/submit-post",
                      headers=H(cd_token), json={"post_link": "https://x.com/p"}, timeout=15)
        r = requests.post(f"{API}/content/scripts/{script_id}/approve-post",
                          headers=H(smm_token),
                          json={"action": "reject", "feedback": "Wrong asset"}, timeout=15)
        assert r.status_code == 200, r.text
        # Verify
        rp = requests.get(f"{API}/content/pillars", headers=H(smm_token), timeout=15)
        scripts = [s for p in rp.json()["pillars"] for s in p.get("scripts", [])]
        s = next((x for x in scripts if x["id"] == script_id), None)
        assert s["post_approval_status"] == "rejected"
        assert s.get("post_feedback") == "Wrong asset"

    def test_smm_direct_post(self, smm_token, script_id):
        r = requests.post(f"{API}/content/scripts/{script_id}/approve-post",
                          headers=H(smm_token),
                          json={"action": "direct_post",
                                "post_link": "https://insta.com/direct"}, timeout=15)
        assert r.status_code == 200, r.text
        rp = requests.get(f"{API}/content/pillars", headers=H(smm_token), timeout=15)
        scripts = [s for p in rp.json()["pillars"] for s in p.get("scripts", [])]
        s = next((x for x in scripts if x["id"] == script_id), None)
        assert s["post_status"] == "posted"
        assert s["post_link"] == "https://insta.com/direct"
        assert s["post_approval_status"] == "approved"

    def test_submit_post_requires_link(self, cd_token, script_id):
        r = requests.post(f"{API}/content/scripts/{script_id}/submit-post",
                          headers=H(cd_token), json={"post_link": ""}, timeout=15)
        assert r.status_code == 400

    def test_non_cd_cannot_submit(self, smm_token, script_id):
        r = requests.post(f"{API}/content/scripts/{script_id}/submit-post",
                          headers=H(smm_token), json={"post_link": "https://x"}, timeout=15)
        assert r.status_code == 403

    def test_non_smm_cannot_approve(self, cd_token, script_id):
        r = requests.post(f"{API}/content/scripts/{script_id}/approve-post",
                          headers=H(cd_token), json={"action": "approve"}, timeout=15)
        assert r.status_code == 403


# ------------------------------ INFLUENCER OUTREACH PUT/DELETE ------------------------------ #
class TestInfluencerOutreachCrud:
    def test_create_update_delete(self, smm_token):
        # Create
        c = requests.post(f"{API}/influencer/outreach", headers=H(smm_token),
                         json={"influencer_name": "TEST_iter17_inf",
                               "platform": "instagram", "handle": "@test",
                               "status": "contacted"}, timeout=15)
        assert c.status_code == 200, c.text
        eid = c.json()["entry"]["id"]

        # Update via /influencer/outreach/{eid}
        u = requests.put(f"{API}/influencer/outreach/{eid}", headers=H(smm_token),
                         json={"status": "negotiating"}, timeout=15)
        assert u.status_code == 200, u.text

        # Verify update persisted
        g = requests.get(f"{API}/influencer/outreach", headers=H(smm_token), timeout=15)
        entries = g.json()["entries"]
        ent = next((e for e in entries if e["id"] == eid), None)
        assert ent is not None and ent["status"] == "negotiating"

        # Delete
        d = requests.delete(f"{API}/influencer/outreach/{eid}", headers=H(smm_token), timeout=15)
        assert d.status_code == 200, d.text
        # Verify deleted
        g2 = requests.get(f"{API}/influencer/outreach", headers=H(smm_token), timeout=15)
        assert all(e["id"] != eid for e in g2.json()["entries"])


# ------------------------------ PAYROLL CREATE WITH HOURS+RATE ------------------------------ #
class TestPayrollWithHours:
    def test_post_payroll_persists_hours_and_rate(self, hr_token):
        payload = {
            "user_id": "hr-001", "user_name": "Test HR", "user_role": "hr_manager",
            "month": "01", "year": "2026",
            "basic_salary": 18000, "incentive": 0, "bonus": 0, "deductions": 0,
            "advance_deductions": 0, "commission": 0,
            "working_days": 22, "total_working_days": 26,
            "total_hours": 187.5, "hourly_rate": 81.45,
        }
        r = requests.post(f"{API}/payroll", headers=H(hr_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        pr = r.json()["payroll"]
        assert pr["total_hours"] == 187.5
        assert pr["hourly_rate"] == 81.45

        # Verify GET returns the same
        g = requests.get(f"{API}/payroll", headers=H(hr_token), timeout=15)
        assert g.status_code == 200
        rec = next((p for p in g.json()["payroll"] if p["id"] == pr["id"]), None)
        assert rec is not None
        assert rec["total_hours"] == 187.5
        assert rec["hourly_rate"] == 81.45
