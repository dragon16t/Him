"""Iteration 18 — Verify SMM simplification + influencer post_link enforcement + CD own scripts."""
import os
import pytest
import requests

# Read from frontend/.env if not in environment
def _load_base_url():
    val = os.environ.get('REACT_APP_BACKEND_URL')
    if not val:
        try:
            with open('/app/frontend/.env') as f:
                for line in f:
                    if line.startswith('REACT_APP_BACKEND_URL'):
                        val = line.split('=', 1)[1].strip()
                        break
        except Exception:
            pass
    assert val, "REACT_APP_BACKEND_URL not set"
    return val.rstrip('/')

BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def smm_token():
    return _login("socialmedia@celestaglow.com", "social123")


@pytest.fixture(scope="module")
def cd_token():
    return _login("contentdev@celestaglow.com", "cd123")


@pytest.fixture(scope="module")
def smm_h(smm_token):
    return {"Authorization": f"Bearer {smm_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cd_h(cd_token):
    return {"Authorization": f"Bearer {cd_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def smm_pillar(smm_h):
    r = requests.post(f"{API}/content/pillars", json={"title": "TEST_iter18_pillar", "description": "iter18"}, headers=smm_h)
    assert r.status_code == 200, r.text
    return r.json()["pillar"]


# ---------- 1. content_developer can create scripts (was admin/SMM/strategist only) ----------
class TestCDCreatesScripts:
    def test_cd_can_create_script(self, cd_h, smm_pillar):
        payload = {"pillar_id": smm_pillar["id"], "title": "TEST_iter18_cd_own", "content_type": "reel", "platform": "instagram"}
        r = requests.post(f"{API}/content/scripts", json=payload, headers=cd_h)
        assert r.status_code == 200, r.text
        s = r.json()["script"]
        assert s["title"] == "TEST_iter18_cd_own"
        assert s["content_type"] == "reel"
        assert "id" in s and s["id"].startswith("scr-")
        # Persistence: GET pillars and find this script
        pr = requests.get(f"{API}/content/pillars", headers=cd_h)
        assert pr.status_code == 200
        scripts_seen = [sc for p in pr.json()["pillars"] if p["id"] == smm_pillar["id"] for sc in p.get("scripts", [])]
        ids = {sc["id"] for sc in scripts_seen}
        assert s["id"] in ids


# ---------- 2. ai_video content_type accepted (falls back to reel defaults) ----------
class TestAiVideoContentType:
    def test_ai_video_accepted(self, smm_h, smm_pillar):
        payload = {"pillar_id": smm_pillar["id"], "title": "TEST_iter18_ai", "content_type": "ai_video", "platform": "instagram"}
        r = requests.post(f"{API}/content/scripts", json=payload, headers=smm_h)
        assert r.status_code == 200, r.text
        s = r.json()["script"]
        assert s["content_type"] == "ai_video"
        # Falls back to reel defaults
        assert s["steps"] == {"video": True, "edit": True, "design": False, "post": True}
        assert s["video_status"] == "pending"
        assert s["design_status"] == "n/a"


# ---------- 3. Influencer outreach: post_link mandatory on converted ----------
class TestInfluencerConverted:
    @pytest.fixture(scope="class")
    def inf(self, smm_h):
        r = requests.post(f"{API}/influencer/outreach",
                          json={"influencer_name": "TEST_iter18_inf", "platform": "instagram", "followers": 5000, "category": "nano", "contact": "@iter18"},
                          headers=smm_h)
        assert r.status_code == 200, r.text
        e = r.json()["entry"]
        yield e
        # cleanup
        requests.delete(f"{API}/influencer/outreach/{e['id']}", headers=smm_h)

    def test_converted_without_post_link_400(self, smm_h, inf):
        r = requests.put(f"{API}/influencer/outreach/{inf['id']}", json={"status": "converted"}, headers=smm_h)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        msg = body.get("detail") or body.get("message") or ""
        assert "post_link" in str(msg).lower()

    def test_converted_with_empty_post_link_400(self, smm_h, inf):
        r = requests.put(f"{API}/influencer/outreach/{inf['id']}", json={"status": "converted", "post_link": "   "}, headers=smm_h)
        assert r.status_code == 400, r.text

    def test_converted_with_post_link_200(self, smm_h, inf):
        link = "https://instagram.com/p/TEST_iter18"
        r = requests.put(f"{API}/influencer/outreach/{inf['id']}",
                         json={"status": "converted", "post_link": link}, headers=smm_h)
        assert r.status_code == 200, r.text
        # GET to verify persistence
        gr = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        assert gr.status_code == 200
        rows = [e for e in gr.json()["entries"] if e["id"] == inf["id"]]
        assert len(rows) == 1
        row = rows[0]
        assert row["status"] == "converted"
        assert row["post_link"] == link
        assert row.get("converted_at"), "converted_at should be set"


# ---------- 4. SMM full flow: forward to CD → CD submit-post → SMM approve ----------
class TestSubmitApproveFlow:
    @pytest.fixture(scope="class")
    def cd_user_id(self, smm_h):
        r = requests.get(f"{API}/content-developers", headers=smm_h)
        assert r.status_code == 200, r.text
        cds = r.json()["content_developers"]
        match = [c for c in cds if c["email"] == "contentdev@celestaglow.com"]
        assert match, "seeded content_developer missing"
        return match[0]["id"]

    @pytest.fixture(scope="class")
    def script(self, smm_h, smm_pillar, cd_user_id):
        # SMM creates flyer script
        r = requests.post(f"{API}/content/scripts",
                          json={"pillar_id": smm_pillar["id"], "title": "TEST_iter18_flyer", "content_type": "flyer", "platform": "instagram"},
                          headers=smm_h)
        assert r.status_code == 200, r.text
        s = r.json()["script"]
        # Forward (assign) to CD
        ar = requests.post(f"{API}/content/scripts/{s['id']}/assign",
                           json={"content_developer_id": cd_user_id}, headers=smm_h)
        assert ar.status_code == 200, ar.text
        return s

    def test_cd_submit_post(self, cd_h, script):
        link = "https://drive.google.com/test_iter18_design"
        r = requests.post(f"{API}/content/scripts/{script['id']}/submit-post",
                          json={"post_link": link, "notes": "iter18 cd"}, headers=cd_h)
        assert r.status_code == 200, r.text

    def test_cd_submit_post_empty_link_400(self, cd_h, script):
        r = requests.post(f"{API}/content/scripts/{script['id']}/submit-post",
                          json={"post_link": ""}, headers=cd_h)
        assert r.status_code == 400

    def test_smm_approve_post(self, smm_h, script):
        r = requests.post(f"{API}/content/scripts/{script['id']}/approve-post",
                          json={"action": "approve"}, headers=smm_h)
        assert r.status_code == 200, r.text
        # Verify state
        pr = requests.get(f"{API}/content/pillars", headers=smm_h)
        all_scripts = [sc for p in pr.json()["pillars"] for sc in p.get("scripts", [])]
        match = [sc for sc in all_scripts if sc["id"] == script["id"]]
        assert len(match) == 1
        s = match[0]
        assert s["post_status"] == "posted"
        assert s["status"] == "completed"
        assert s["post_approval_status"] == "approved"

    def test_smm_direct_post(self, smm_h, smm_pillar):
        r = requests.post(f"{API}/content/scripts",
                          json={"pillar_id": smm_pillar["id"], "title": "TEST_iter18_direct", "content_type": "post"}, headers=smm_h)
        assert r.status_code == 200
        sid = r.json()["script"]["id"]
        link = "https://instagram.com/p/iter18_direct"
        ap = requests.post(f"{API}/content/scripts/{sid}/approve-post",
                           json={"action": "direct_post", "post_link": link}, headers=smm_h)
        assert ap.status_code == 200, ap.text

    def test_smm_direct_post_empty_link_400(self, smm_h, smm_pillar):
        r = requests.post(f"{API}/content/scripts",
                          json={"pillar_id": smm_pillar["id"], "title": "TEST_iter18_direct2", "content_type": "post"}, headers=smm_h)
        sid = r.json()["script"]["id"]
        ap = requests.post(f"{API}/content/scripts/{sid}/approve-post",
                           json={"action": "direct_post", "post_link": ""}, headers=smm_h)
        assert ap.status_code == 400


# ---------- 5. Auth/role guards still work ----------
class TestRoleGuards:
    def test_telecaller_cannot_create_script(self):
        tc = _login("telecaller1@celestaglow.com", "tc123")
        h = {"Authorization": f"Bearer {tc}", "Content-Type": "application/json"}
        r = requests.post(f"{API}/content/scripts", json={"title": "x", "pillar_id": "p"}, headers=h)
        assert r.status_code == 403

    def test_smm_cannot_submit_post(self, smm_h):
        # need an existing script id; use any from pillar
        pr = requests.get(f"{API}/content/pillars", headers=smm_h)
        scripts = [sc for p in pr.json()["pillars"] for sc in p.get("scripts", [])]
        if not scripts:
            pytest.skip("no script available")
        sid = scripts[0]["id"]
        r = requests.post(f"{API}/content/scripts/{sid}/submit-post",
                          json={"post_link": "x"}, headers=smm_h)
        assert r.status_code == 403

    def test_cd_cannot_approve_post(self, cd_h, smm_h):
        pr = requests.get(f"{API}/content/pillars", headers=smm_h)
        scripts = [sc for p in pr.json()["pillars"] for sc in p.get("scripts", [])]
        if not scripts:
            pytest.skip("no script available")
        sid = scripts[0]["id"]
        r = requests.post(f"{API}/content/scripts/{sid}/approve-post",
                          json={"action": "approve"}, headers=cd_h)
        assert r.status_code == 403
