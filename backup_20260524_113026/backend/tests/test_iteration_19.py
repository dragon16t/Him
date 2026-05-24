"""Iteration 19 — Verify:
- POST /content/scripts/{sid}/submit-post (CD) no longer requires post_link
- GET /content/pillars returns `counts` object and `type_breakdown`
- POST/PUT/DELETE /content/pillars (color, update, delete-with-scripts-blocked)
- POST /content/scripts/{sid}/approve-post actions: approve (ready_to_post, no link),
  direct_post (posted, requires link), reject (rejected+feedback)
- NEW: POST /content/scripts/{sid}/mark-posted — SMM-only, requires post_link
- End-to-end CD/SMM pipeline: pillar → script → assign → CD uploads → submit-post → approve → mark-posted → pillar counts.posted incremented
- Role guards: non-CD 403 on submit-post; non-SMM 403 on approve-post & mark-posted
"""
import os
import pytest
import requests


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


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def smm_h():
    tok = _login("socialmedia@celestaglow.com", "social123")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cd_h():
    tok = _login("contentdev@celestaglow.com", "cd123")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_h():
    tok = _login("admin@celestaglow.com", "admin123")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tc_h():
    tok = _login("telecaller1@celestaglow.com", "tc123")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _mk_pillar(smm_h, title, color="#FF8800"):
    r = requests.post(f"{API}/content/pillars", json={"title": title, "description": "iter19", "color": color}, headers=smm_h)
    assert r.status_code == 200, r.text
    return r.json()["pillar"]


def _mk_script(smm_h, pillar_id, title, content_type="reel"):
    r = requests.post(f"{API}/content/scripts",
                      json={"pillar_id": pillar_id, "title": title, "content_type": content_type, "platform": "instagram"},
                      headers=smm_h)
    assert r.status_code == 200, r.text
    return r.json()["script"]


def _get_pillar(smm_h, pid):
    r = requests.get(f"{API}/content/pillars", headers=smm_h)
    assert r.status_code == 200, r.text
    for p in r.json().get("pillars", []):
        if p["id"] == pid:
            return p
    return None


def _get_script(smm_h, sid):
    # Use pillars list to fetch script by id
    r = requests.get(f"{API}/content/pillars", headers=smm_h)
    assert r.status_code == 200
    for p in r.json().get("pillars", []):
        for s in p.get("scripts", []):
            if s["id"] == sid:
                return s
    return None


# =========================================================
# 1. Pillars: create with color, update, get with counts, delete rules
# =========================================================
class TestPillarCRUD:
    def test_create_pillar_with_color(self, smm_h):
        p = _mk_pillar(smm_h, "TEST_iter19_colorpillar", color="#123456")
        assert p["color"] == "#123456"
        assert p["title"] == "TEST_iter19_colorpillar"
        assert "id" in p

    def test_update_pillar(self, smm_h):
        p = _mk_pillar(smm_h, "TEST_iter19_updatep")
        r = requests.put(f"{API}/content/pillars/{p['id']}",
                         json={"title": "TEST_iter19_updatep_renamed", "color": "#AABBCC"}, headers=smm_h)
        assert r.status_code == 200, r.text
        fetched = _get_pillar(smm_h, p['id'])
        assert fetched is not None
        assert fetched["title"] == "TEST_iter19_updatep_renamed"
        assert fetched["color"] == "#AABBCC"

    def test_pillars_list_has_counts_and_type_breakdown(self, smm_h):
        p = _mk_pillar(smm_h, "TEST_iter19_countsp")
        # Add 2 scripts of different content_type
        _mk_script(smm_h, p["id"], "TEST_iter19_s1", "reel")
        _mk_script(smm_h, p["id"], "TEST_iter19_s2", "flyer")
        fetched = _get_pillar(smm_h, p["id"])
        assert fetched is not None
        counts = fetched.get("counts")
        assert counts is not None, f"counts missing: {fetched}"
        for k in ["total", "draft", "in_progress", "awaiting_approval",
                  "ready_to_post", "posted", "revision", "pending", "completed"]:
            assert k in counts, f"counts missing key {k}: {counts}"
        assert counts["total"] == 2
        assert counts["draft"] == 2  # freshly created
        assert counts["posted"] == 0
        tb = fetched.get("type_breakdown")
        assert tb is not None, "type_breakdown missing"
        assert tb.get("reel", 0) >= 1
        assert tb.get("flyer", 0) >= 1

    def test_delete_pillar_blocked_when_scripts_exist(self, smm_h):
        p = _mk_pillar(smm_h, "TEST_iter19_dblocked")
        _mk_script(smm_h, p["id"], "TEST_iter19_ds1")
        r = requests.delete(f"{API}/content/pillars/{p['id']}", headers=smm_h)
        assert r.status_code == 400, f"Expected 400 got {r.status_code} {r.text}"
        # Still exists
        assert _get_pillar(smm_h, p["id"]) is not None

    def test_delete_pillar_succeeds_when_empty(self, smm_h):
        p = _mk_pillar(smm_h, "TEST_iter19_dempty")
        r = requests.delete(f"{API}/content/pillars/{p['id']}", headers=smm_h)
        assert r.status_code == 200, r.text
        assert _get_pillar(smm_h, p["id"]) is None


# =========================================================
# 2. submit-post — CD no longer requires post_link, but needs a deliverable
# =========================================================
class TestSubmitPost:
    def test_submit_post_without_deliverable_returns_400(self, smm_h, cd_h):
        p = _mk_pillar(smm_h, "TEST_iter19_subp_empty")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_s_empty")
        r = requests.post(f"{API}/content/scripts/{s['id']}/submit-post",
                          json={"notes": "done"}, headers=cd_h)
        assert r.status_code == 400, f"Expected 400, got {r.status_code} {r.text}"
        assert "edit" in r.text.lower() or "deliverable" in r.text.lower() or "design" in r.text.lower() or "video" in r.text.lower()

    def test_submit_post_with_edited_link_succeeds_no_post_link_needed(self, smm_h, cd_h):
        p = _mk_pillar(smm_h, "TEST_iter19_subp_ok")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_s_ok")
        # CD uploads edited_link
        r = requests.put(f"{API}/content/scripts/{s['id']}",
                         json={"edited_link": "https://drive.google.com/edit1"}, headers=cd_h)
        assert r.status_code == 200, r.text
        # Submit for approval WITHOUT post_link — must succeed
        r = requests.post(f"{API}/content/scripts/{s['id']}/submit-post",
                          json={"notes": "edit done"}, headers=cd_h)
        assert r.status_code == 200, f"Expected 200 (no post_link needed), got {r.status_code} {r.text}"
        fetched = _get_script(smm_h, s["id"])
        assert fetched["post_approval_status"] == "pending"
        assert fetched.get("post_notes") == "edit done"
        # Must NOT have been auto-marked posted
        assert fetched.get("post_status", "pending") != "posted"


# =========================================================
# 3. approve-post actions
# =========================================================
class TestApprovePost:
    def test_approve_sets_ready_to_post_no_link(self, smm_h, cd_h):
        p = _mk_pillar(smm_h, "TEST_iter19_ap_ok")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_s_ap")
        requests.put(f"{API}/content/scripts/{s['id']}", json={"edited_link": "https://drv/e2"}, headers=cd_h)
        requests.post(f"{API}/content/scripts/{s['id']}/submit-post", json={}, headers=cd_h)
        r = requests.post(f"{API}/content/scripts/{s['id']}/approve-post",
                          json={"action": "approve"}, headers=smm_h)
        assert r.status_code == 200, r.text
        fetched = _get_script(smm_h, s["id"])
        assert fetched["post_approval_status"] == "approved"
        assert fetched["post_status"] == "ready_to_post", f"Expected ready_to_post, got {fetched['post_status']}"
        # Critical: must NOT be 'posted' yet and must NOT have set a post_link
        assert fetched["post_status"] != "posted"
        assert not fetched.get("post_link")

    def test_direct_post_requires_link_and_marks_posted(self, smm_h, cd_h):
        p = _mk_pillar(smm_h, "TEST_iter19_ap_dp")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_s_dp")
        requests.put(f"{API}/content/scripts/{s['id']}", json={"edited_link": "https://drv/e3"}, headers=cd_h)
        requests.post(f"{API}/content/scripts/{s['id']}/submit-post", json={}, headers=cd_h)
        # Empty link → 400
        r = requests.post(f"{API}/content/scripts/{s['id']}/approve-post",
                          json={"action": "direct_post", "post_link": ""}, headers=smm_h)
        assert r.status_code == 400
        # With link → posted
        r = requests.post(f"{API}/content/scripts/{s['id']}/approve-post",
                          json={"action": "direct_post", "post_link": "https://instagram.com/p/abc"},
                          headers=smm_h)
        assert r.status_code == 200, r.text
        fetched = _get_script(smm_h, s["id"])
        assert fetched["post_status"] == "posted"
        assert fetched["post_link"] == "https://instagram.com/p/abc"
        assert fetched["post_approval_status"] == "approved"

    def test_reject_saves_feedback(self, smm_h, cd_h):
        p = _mk_pillar(smm_h, "TEST_iter19_ap_rj")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_s_rj")
        requests.put(f"{API}/content/scripts/{s['id']}", json={"edited_link": "https://drv/e4"}, headers=cd_h)
        requests.post(f"{API}/content/scripts/{s['id']}/submit-post", json={}, headers=cd_h)
        r = requests.post(f"{API}/content/scripts/{s['id']}/approve-post",
                          json={"action": "reject", "feedback": "redo the intro"}, headers=smm_h)
        assert r.status_code == 200, r.text
        fetched = _get_script(smm_h, s["id"])
        assert fetched["post_approval_status"] == "rejected"
        assert fetched.get("post_feedback") == "redo the intro"
        assert fetched["post_status"] == "pending"


# =========================================================
# 4. mark-posted (new endpoint)
# =========================================================
class TestMarkPosted:
    def test_mark_posted_without_link_400(self, smm_h, cd_h):
        p = _mk_pillar(smm_h, "TEST_iter19_mp_nolink")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_s_mp_nl")
        requests.put(f"{API}/content/scripts/{s['id']}", json={"edited_link": "https://drv/mp1"}, headers=cd_h)
        requests.post(f"{API}/content/scripts/{s['id']}/submit-post", json={}, headers=cd_h)
        requests.post(f"{API}/content/scripts/{s['id']}/approve-post", json={"action": "approve"}, headers=smm_h)
        r = requests.post(f"{API}/content/scripts/{s['id']}/mark-posted", json={}, headers=smm_h)
        assert r.status_code == 400, f"Expected 400, got {r.status_code} {r.text}"

    def test_mark_posted_with_link_sets_posted_and_completed(self, smm_h, cd_h):
        p = _mk_pillar(smm_h, "TEST_iter19_mp_ok")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_s_mp_ok")
        requests.put(f"{API}/content/scripts/{s['id']}", json={"edited_link": "https://drv/mp2"}, headers=cd_h)
        requests.post(f"{API}/content/scripts/{s['id']}/submit-post", json={}, headers=cd_h)
        requests.post(f"{API}/content/scripts/{s['id']}/approve-post", json={"action": "approve"}, headers=smm_h)
        r = requests.post(f"{API}/content/scripts/{s['id']}/mark-posted",
                          json={"post_link": "https://instagram.com/p/xyz", "caption": "hello"}, headers=smm_h)
        assert r.status_code == 200, r.text
        fetched = _get_script(smm_h, s["id"])
        assert fetched["post_status"] == "posted"
        assert fetched["post_link"] == "https://instagram.com/p/xyz"
        assert fetched["status"] == "completed"
        assert fetched.get("post_published_at")


# =========================================================
# 5. End-to-end pipeline + pillar counts after post
# =========================================================
class TestE2EPipelineAndCounts:
    def test_full_flow(self, smm_h, cd_h):
        # SMM creates pillar
        p = _mk_pillar(smm_h, "TEST_iter19_e2e")
        # SMM creates script
        s = _mk_script(smm_h, p["id"], "TEST_iter19_e2e_scr")
        # Initial pillar count: 1 draft, 0 posted
        fetched_p = _get_pillar(smm_h, p["id"])
        assert fetched_p["counts"]["total"] == 1
        assert fetched_p["counts"]["posted"] == 0
        assert fetched_p["counts"]["draft"] >= 1

        # Get a CD id to assign to
        r = requests.get(f"{API}/content-developers", headers=smm_h)
        if r.status_code == 200 and r.json().get("developers"):
            cd_id = r.json()["developers"][0]["id"]
            ra = requests.post(f"{API}/content/scripts/{s['id']}/assign",
                               json={"content_developer_id": cd_id}, headers=smm_h)
            assert ra.status_code == 200, ra.text

        # CD uploads edited_link
        r = requests.put(f"{API}/content/scripts/{s['id']}",
                         json={"edited_link": "https://drv/e2e"}, headers=cd_h)
        assert r.status_code == 200

        # CD submits for approval WITHOUT post_link
        r = requests.post(f"{API}/content/scripts/{s['id']}/submit-post",
                          json={"notes": "ready"}, headers=cd_h)
        assert r.status_code == 200, r.text

        # Pillar counts.awaiting_approval should be 1
        fetched_p = _get_pillar(smm_h, p["id"])
        assert fetched_p["counts"]["awaiting_approval"] == 1

        # SMM approves (no link)
        r = requests.post(f"{API}/content/scripts/{s['id']}/approve-post",
                          json={"action": "approve"}, headers=smm_h)
        assert r.status_code == 200

        # Script now ready_to_post
        fetched_p = _get_pillar(smm_h, p["id"])
        assert fetched_p["counts"]["ready_to_post"] == 1
        assert fetched_p["counts"]["posted"] == 0

        # SMM calls mark-posted with the live link
        r = requests.post(f"{API}/content/scripts/{s['id']}/mark-posted",
                          json={"post_link": "https://instagram.com/p/e2e"}, headers=smm_h)
        assert r.status_code == 200

        # Pillar counts.posted should be 1 now
        fetched_p = _get_pillar(smm_h, p["id"])
        assert fetched_p["counts"]["posted"] == 1
        assert fetched_p["counts"]["completed"] == 1
        assert fetched_p["counts"]["ready_to_post"] == 0


# =========================================================
# 6. Role guards
# =========================================================
class TestRoleGuards:
    def test_non_cd_cannot_submit_post(self, smm_h, tc_h):
        # SMM creates pillar+script
        p = _mk_pillar(smm_h, "TEST_iter19_rg_sub")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_rg_sub_s")
        # Telecaller tries to submit-post → 403
        r = requests.post(f"{API}/content/scripts/{s['id']}/submit-post",
                          json={"notes": "no"}, headers=tc_h)
        assert r.status_code == 403, f"Expected 403 for TC, got {r.status_code}"
        # SMM (non-CD) — also 403
        r = requests.post(f"{API}/content/scripts/{s['id']}/submit-post",
                          json={"notes": "no"}, headers=smm_h)
        assert r.status_code == 403, f"Expected 403 for SMM, got {r.status_code}"

    def test_non_smm_cannot_approve_post(self, cd_h, tc_h, smm_h):
        p = _mk_pillar(smm_h, "TEST_iter19_rg_ap")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_rg_ap_s")
        # CD cannot approve
        r = requests.post(f"{API}/content/scripts/{s['id']}/approve-post",
                          json={"action": "approve"}, headers=cd_h)
        assert r.status_code == 403
        # Telecaller cannot approve
        r = requests.post(f"{API}/content/scripts/{s['id']}/approve-post",
                          json={"action": "approve"}, headers=tc_h)
        assert r.status_code == 403

    def test_non_smm_cannot_mark_posted(self, cd_h, tc_h, smm_h):
        p = _mk_pillar(smm_h, "TEST_iter19_rg_mp")
        s = _mk_script(smm_h, p["id"], "TEST_iter19_rg_mp_s")
        # CD cannot mark-posted
        r = requests.post(f"{API}/content/scripts/{s['id']}/mark-posted",
                          json={"post_link": "https://x/y"}, headers=cd_h)
        assert r.status_code == 403
        # Telecaller cannot mark-posted
        r = requests.post(f"{API}/content/scripts/{s['id']}/mark-posted",
                          json={"post_link": "https://x/y"}, headers=tc_h)
        assert r.status_code == 403
