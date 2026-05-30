"""Iteration 20 — Backend verification for:
- NEW: POST /api/content/scripts/{sid}/mark-posted allows content_developer too
- NEW: DELETE /api/content/scripts/{sid} — allowed for admin/SMM/CS/CD; others 403
- ENHANCED: POST /api/influencer/outreach stores `phone`; stats has barter/paid counts
- NEW: POST /api/influencer/outreach/{eid}/log-call (remarks required, call_logs push)
- NEW: POST /api/influencer/outreach/{eid}/send-product
   * barter_type=free_product requires product_tracking_link
   * barter_type=paid requires paid_amount>0 → auto-creates fund_request
- ENHANCED: PUT /api/fund-requests/{frid}/approve — linked_influencer_id gets
  fund_request_status=approved + expense_id; when rejected → rejected
- E2E: SMM → log-call → send-product paid → finance approve → influencer updated
- PUT /api/influencer/outreach/{eid} does NOT clobber call_logs
- REGRESSION: iteration 19 mark-posted+submit-post+approve-post still pass
"""
import os
import pytest
import requests


def _load_base_url():
    val = os.environ.get('REACT_APP_BACKEND_URL')
    if not val:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL'):
                    val = line.split('=', 1)[1].strip()
                    break
    assert val, "REACT_APP_BACKEND_URL missing"
    return val.rstrip('/')


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# -------- Shared fixtures --------
@pytest.fixture(scope="module")
def smm_h():
    return _h(_login("socialmedia@celestaglow.com", "social123"))


@pytest.fixture(scope="module")
def cd_h():
    return _h(_login("contentdev@celestaglow.com", "cd123"))


@pytest.fixture(scope="module")
def fin_h():
    return _h(_login("finance@celestaglow.com", "fin123"))


@pytest.fixture(scope="module")
def tc_h():
    return _h(_login("telecaller1@celestaglow.com", "tc123"))


@pytest.fixture(scope="module")
def admin_h():
    return _h(_login("admin@celestaglow.com", "admin123"))


# -------- Helpers --------
def _mk_pillar(smm_h, title):
    r = requests.post(f"{API}/content/pillars", json={"title": title, "description": "iter20", "color": "#22AACC"}, headers=smm_h)
    assert r.status_code == 200, r.text
    return r.json()["pillar"]


def _mk_script(smm_h, pid, title):
    r = requests.post(f"{API}/content/scripts",
                      json={"pillar_id": pid, "title": title, "content_type": "reel", "platform": "instagram"},
                      headers=smm_h)
    assert r.status_code == 200, r.text
    return r.json()["script"]


def _get_script(smm_h, pillar_id, script_id):
    r = requests.get(f"{API}/content/pillars", headers=smm_h)
    assert r.status_code == 200, r.text
    for p in r.json()["pillars"]:
        if p["id"] == pillar_id:
            for s in p.get("scripts", []):
                if s["id"] == script_id:
                    return s
    return None


def _mk_influencer(smm_h, name, phone="9888877777"):
    r = requests.post(f"{API}/influencer/outreach",
                      json={"influencer_name": name, "platform": "instagram", "followers": 50000,
                            "category": "micro", "phone": phone, "contact": "@" + name.lower()},
                      headers=smm_h)
    assert r.status_code == 200, r.text
    return r.json()["entry"]


# ================== CONTENT DEVELOPER mark-posted ==================
class TestCDMarkPosted:
    def test_cd_mark_posted_with_link_succeeds(self, smm_h, cd_h):
        pillar = _mk_pillar(smm_h, "TEST_iter20_cdmp_pillar")
        s = _mk_script(smm_h, pillar["id"], "TEST_iter20_cdmp_script")
        r = requests.post(f"{API}/content/scripts/{s['id']}/mark-posted",
                          json={"post_link": "https://instagram.com/p/CDPOST"},
                          headers=cd_h)
        assert r.status_code == 200, r.text
        # Verify via pillars listing
        got = _get_script(smm_h, pillar["id"], s["id"])
        assert got is not None
        assert got.get("post_status") == "posted"
        assert got.get("post_link") == "https://instagram.com/p/CDPOST"
        assert got.get("post_published_by_role") == "content_developer"
        assert got.get("status") == "completed"

    def test_cd_mark_posted_without_link_400(self, smm_h, cd_h):
        pillar = _mk_pillar(smm_h, "TEST_iter20_cdmp2_pillar")
        s = _mk_script(smm_h, pillar["id"], "TEST_iter20_cdmp2_script")
        r = requests.post(f"{API}/content/scripts/{s['id']}/mark-posted", json={"post_link": ""}, headers=cd_h)
        assert r.status_code == 400, r.text


# ================== DELETE script ==================
class TestDeleteScript:
    def test_admin_can_delete(self, smm_h, admin_h):
        pillar = _mk_pillar(smm_h, "TEST_iter20_del_pillar")
        s = _mk_script(smm_h, pillar["id"], "TEST_iter20_del_admin")
        r = requests.delete(f"{API}/content/scripts/{s['id']}", headers=admin_h)
        assert r.status_code == 200, r.text
        got = _get_script(smm_h, pillar["id"], s["id"])
        assert got is None

    def test_smm_can_delete(self, smm_h):
        pillar = _mk_pillar(smm_h, "TEST_iter20_del_pillar2")
        s = _mk_script(smm_h, pillar["id"], "TEST_iter20_del_smm")
        r = requests.delete(f"{API}/content/scripts/{s['id']}", headers=smm_h)
        assert r.status_code == 200, r.text

    def test_cd_can_delete(self, smm_h, cd_h):
        pillar = _mk_pillar(smm_h, "TEST_iter20_del_pillar3")
        s = _mk_script(smm_h, pillar["id"], "TEST_iter20_del_cd")
        r = requests.delete(f"{API}/content/scripts/{s['id']}", headers=cd_h)
        assert r.status_code == 200, r.text

    def test_tc_cannot_delete_403(self, smm_h, tc_h):
        pillar = _mk_pillar(smm_h, "TEST_iter20_del_pillar4")
        s = _mk_script(smm_h, pillar["id"], "TEST_iter20_del_tc")
        r = requests.delete(f"{API}/content/scripts/{s['id']}", headers=tc_h)
        assert r.status_code == 403, r.text
        # Cleanup
        requests.delete(f"{API}/content/scripts/{s['id']}", headers=smm_h)

    def test_delete_missing_404(self, admin_h):
        r = requests.delete(f"{API}/content/scripts/does-not-exist-xyz", headers=admin_h)
        assert r.status_code == 404


# ================== INFLUENCER phone + stats ==================
class TestInfluencerPhoneStats:
    def test_create_with_phone_and_stats(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_phoneinf", phone="9000011111")
        assert e.get("phone") == "9000011111"
        assert "call_logs" in e and isinstance(e["call_logs"], list)
        r = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        assert r.status_code == 200
        stats = r.json()["stats"]
        for k in ["barter_count", "paid_count", "total_paid_amount"]:
            assert k in stats, f"stats missing {k}"
        # Verify returned list contains our entry with phone
        entries = r.json()["entries"]
        got = [x for x in entries if x["id"] == e["id"]][0]
        assert got["phone"] == "9000011111"


# ================== log-call ==================
class TestLogCall:
    def test_log_call_success_and_pushes(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_lcinf")
        r = requests.post(f"{API}/influencer/outreach/{e['id']}/log-call",
                          json={"outcome": "contacted", "remarks": "spoke with them, interested",
                                "next_action": "send product", "status": "contacted"},
                          headers=smm_h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["call"]["remarks"] == "spoke with them, interested"
        assert body["call"]["outcome"] == "contacted"
        assert "id" in body["call"]
        # Now GET and check call_logs
        gl = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        got = [x for x in gl.json()["entries"] if x["id"] == e["id"]][0]
        assert len(got["call_logs"]) == 1
        assert got["call_logs"][0]["remarks"] == "spoke with them, interested"
        assert got["status"] == "contacted"
        # Log another
        r2 = requests.post(f"{API}/influencer/outreach/{e['id']}/log-call",
                           json={"outcome": "responded", "remarks": "followed up again"},
                           headers=smm_h)
        assert r2.status_code == 200
        gl2 = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        got2 = [x for x in gl2.json()["entries"] if x["id"] == e["id"]][0]
        assert len(got2["call_logs"]) == 2

    def test_log_call_without_remarks_400(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_lcnrem")
        r = requests.post(f"{API}/influencer/outreach/{e['id']}/log-call",
                          json={"outcome": "contacted", "remarks": ""}, headers=smm_h)
        assert r.status_code == 400, r.text

    def test_log_call_finance_role_403(self, smm_h, fin_h):
        e = _mk_influencer(smm_h, "TEST_iter20_lcfin")
        r = requests.post(f"{API}/influencer/outreach/{e['id']}/log-call",
                          json={"remarks": "should not work"}, headers=fin_h)
        assert r.status_code == 403


# ================== send-product ==================
class TestSendProduct:
    def test_barter_requires_tracking_link(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_sp_b1")
        r = requests.post(f"{API}/influencer/outreach/{e['id']}/send-product",
                          json={"barter_type": "free_product", "product_tracking_link": ""},
                          headers=smm_h)
        assert r.status_code == 400, r.text

    def test_barter_success_saves_products(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_sp_b2")
        r = requests.post(f"{API}/influencer/outreach/{e['id']}/send-product",
                          json={"barter_type": "free_product",
                                "product_tracking_link": "https://shiprocket/xyz",
                                "products_sent": [{"name": "SerumA", "qty": 1}]},
                          headers=smm_h)
        assert r.status_code == 200, r.text
        assert r.json().get("fund_request") is None
        gl = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        got = [x for x in gl.json()["entries"] if x["id"] == e["id"]][0]
        assert got["barter_type"] == "free_product"
        assert got["product_tracking_link"] == "https://shiprocket/xyz"
        assert got["products_sent"] == [{"name": "SerumA", "qty": 1}]
        assert got["status"] == "product_sent"

    def test_paid_requires_amount(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_sp_p1")
        r = requests.post(f"{API}/influencer/outreach/{e['id']}/send-product",
                          json={"barter_type": "paid", "paid_amount": 0}, headers=smm_h)
        assert r.status_code == 400, r.text

    def test_paid_creates_fund_request(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_sp_p2")
        r = requests.post(f"{API}/influencer/outreach/{e['id']}/send-product",
                          json={"barter_type": "paid", "paid_amount": 5000}, headers=smm_h)
        assert r.status_code == 200, r.text
        fr = r.json()["fund_request"]
        assert fr is not None
        assert fr["amount"] == 5000
        assert fr["category"] == "influencer_marketing"
        assert fr["linked_influencer_id"] == e["id"]
        assert fr["status"] == "pending"
        # Influencer record has fund_request_id
        gl = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        got = [x for x in gl.json()["entries"] if x["id"] == e["id"]][0]
        assert got["fund_request_id"] == fr["id"]
        assert got["fund_request_status"] == "pending"
        assert got["paid_amount"] == 5000

    def test_send_product_invalid_type_400(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_sp_bad")
        r = requests.post(f"{API}/influencer/outreach/{e['id']}/send-product",
                          json={"barter_type": "other"}, headers=smm_h)
        assert r.status_code == 400


# ================== End-to-end: paid → finance approve ==================
class TestE2EPaidApprove:
    def test_full_paid_flow(self, smm_h, fin_h):
        # 1. create influencer
        e = _mk_influencer(smm_h, "TEST_iter20_e2e_paid")
        # 2. log a call
        rc = requests.post(f"{API}/influencer/outreach/{e['id']}/log-call",
                           json={"remarks": "agreed on paid collab", "outcome": "contacted",
                                 "status": "contacted"},
                           headers=smm_h)
        assert rc.status_code == 200
        # 3. send-product paid
        rp = requests.post(f"{API}/influencer/outreach/{e['id']}/send-product",
                           json={"barter_type": "paid", "paid_amount": 7500}, headers=smm_h)
        assert rp.status_code == 200
        fr_id = rp.json()["fund_request"]["id"]
        # 4. finance approves
        ra = requests.put(f"{API}/fund-requests/{fr_id}/approve",
                          json={"status": "approved", "debit_from": "bank"}, headers=fin_h)
        assert ra.status_code == 200, ra.text
        # 5. verify influencer now has fund_request_status=approved and expense_id
        gl = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        got = [x for x in gl.json()["entries"] if x["id"] == e["id"]][0]
        assert got.get("fund_request_status") == "approved"
        assert got.get("expense_id"), "expense_id not set on influencer"
        assert got.get("fund_approved_at"), "fund_approved_at missing"
        # 6. verify an expense exists
        ge = requests.get(f"{API}/expenses", headers=fin_h)
        assert ge.status_code == 200
        exps = ge.json()["expenses"]
        assert any(x["id"] == got["expense_id"] for x in exps)
        # 7. call_logs preserved (not clobbered after send-product / approve)
        assert len(got.get("call_logs", [])) >= 1
        assert got["call_logs"][0]["remarks"] == "agreed on paid collab"

    def test_rejected_flow_sets_rejected(self, smm_h, fin_h):
        e = _mk_influencer(smm_h, "TEST_iter20_e2e_rej")
        rp = requests.post(f"{API}/influencer/outreach/{e['id']}/send-product",
                           json={"barter_type": "paid", "paid_amount": 2000}, headers=smm_h)
        assert rp.status_code == 200
        fr_id = rp.json()["fund_request"]["id"]
        rr = requests.put(f"{API}/fund-requests/{fr_id}/approve",
                          json={"status": "rejected"}, headers=fin_h)
        assert rr.status_code == 200
        gl = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        got = [x for x in gl.json()["entries"] if x["id"] == e["id"]][0]
        assert got.get("fund_request_status") == "rejected"


# ================== PUT does not clobber call_logs ==================
class TestPUTDoesNotClobberCallLogs:
    def test_put_preserves_call_logs(self, smm_h):
        e = _mk_influencer(smm_h, "TEST_iter20_put_preserve")
        # Log a call first
        rc = requests.post(f"{API}/influencer/outreach/{e['id']}/log-call",
                           json={"remarks": "preserve me"}, headers=smm_h)
        assert rc.status_code == 200
        # Attempt to PUT with call_logs=[] to try to clobber
        rp = requests.put(f"{API}/influencer/outreach/{e['id']}",
                          json={"notes": "updated notes", "call_logs": []}, headers=smm_h)
        assert rp.status_code == 200
        gl = requests.get(f"{API}/influencer/outreach", headers=smm_h)
        got = [x for x in gl.json()["entries"] if x["id"] == e["id"]][0]
        assert len(got["call_logs"]) == 1, "call_logs got clobbered!"
        assert got["call_logs"][0]["remarks"] == "preserve me"
        assert got["notes"] == "updated notes"


# ================== REGRESSION iter19 ==================
class TestIter19Regression:
    def test_mark_posted_smm_still_works(self, smm_h):
        pillar = _mk_pillar(smm_h, "TEST_iter20_reg_pillar")
        s = _mk_script(smm_h, pillar["id"], "TEST_iter20_reg_script")
        # SMM mark-posted
        r = requests.post(f"{API}/content/scripts/{s['id']}/mark-posted",
                          json={"post_link": "https://instagram.com/p/SMM"}, headers=smm_h)
        assert r.status_code == 200, r.text

    def test_approve_post_sets_ready_to_post(self, smm_h, cd_h):
        pillar = _mk_pillar(smm_h, "TEST_iter20_reg_ap_pillar")
        s = _mk_script(smm_h, pillar["id"], "TEST_iter20_reg_ap_script")
        # CD uploads edited link
        requests.put(f"{API}/content/scripts/{s['id']}",
                     json={"edited_link": "https://drive/x"}, headers=cd_h)
        # CD submits
        rs = requests.post(f"{API}/content/scripts/{s['id']}/submit-post", json={}, headers=cd_h)
        assert rs.status_code == 200, rs.text
        # SMM approves
        ra = requests.post(f"{API}/content/scripts/{s['id']}/approve-post",
                           json={"action": "approve"}, headers=smm_h)
        assert ra.status_code == 200, ra.text
        got = _get_script(smm_h, pillar["id"], s["id"])
        assert got is not None
        assert got.get("post_status") == "ready_to_post"
        assert got.get("post_approval_status") == "approved"

    def test_pillars_counts_exists(self, smm_h):
        r = requests.get(f"{API}/content/pillars", headers=smm_h)
        assert r.status_code == 200
        pillars = r.json()["pillars"]
        if pillars:
            p = pillars[0]
            assert "counts" in p
            for k in ["total", "draft", "in_progress", "awaiting_approval",
                      "ready_to_post", "posted", "revision", "pending", "completed"]:
                assert k in p["counts"], f"missing count key {k}"
