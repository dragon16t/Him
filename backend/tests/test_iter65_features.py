"""Iteration 65 tests:
- POST /api/admin/sanitize-emails
- Email validation + cross-collection uniqueness on user create
- POST /api/leads/dedupe first-owner-wins
- POST /api/leads/manager-distribute skips already-owned
- GET /api/admin/weekly-performance new fields + sort
- GET /api/admin/leads-received-report
- GET /api/admin/status-summary-report
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for l in f:
            if l.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = l.split("=", 1)[1].strip().rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login('admin@celestaglow.com', 'admin123')}"}


@pytest.fixture(scope="module")
def sm_headers():
    return {"Authorization": f"Bearer {_login('salesmanager@celestaglow.com', 'sm123')}"}


@pytest.fixture(scope="module")
def tc_headers():
    return {"Authorization": f"Bearer {_login('telecaller1@celestaglow.com', 'tc123')}"}


UNIQ = str(int(time.time()))[-6:]


# ----------------- 1. sanitize-emails -----------------
class TestSanitizeEmails:
    def test_endpoint_returns_shape(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/sanitize-emails", json={}, headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "fixed" in data
        assert "flagged" in data
        assert isinstance(data["fixed"], int)
        assert isinstance(data["flagged"], list)

    def test_non_admin_forbidden(self, tc_headers):
        r = requests.post(f"{BASE_URL}/api/admin/sanitize-emails", json={}, headers=tc_headers)
        assert r.status_code == 403


# ----------------- 2. Email validation on user create -----------------
class TestUserEmailValidation:
    def test_reject_invalid_format(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/telecallers",
                          json={"name": f"TEST_bademail_{UNIQ}", "email": "notanemail", "phone": "9999999999"},
                          headers=admin_headers)
        assert r.status_code == 400, r.text
        assert "email" in r.json().get("detail", "").lower()

    def test_whitespace_email_gets_sanitized_and_created(self, admin_headers):
        raw_email = f"  TEST User{UNIQ} @Gmail.com  "
        # After sanitize: "testuser<UNIQ>@gmail.com"
        expected = f"testuser{UNIQ}@gmail.com"
        r = requests.post(f"{BASE_URL}/api/telecallers",
                          json={"name": f"TEST_ws_{UNIQ}", "email": raw_email, "phone": "9999999911"},
                          headers=admin_headers)
        # The stripped email is valid — should be created OK
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["email"] == expected, f"expected sanitized {expected}, got {user['email']}"
        # Cleanup
        try:
            requests.delete(f"{BASE_URL}/api/telecallers/{user['id']}", headers=admin_headers,
                            json={"password": "delete"})
        except Exception:
            pass

    def test_duplicate_across_collections_blocked(self, admin_headers):
        # admin@celestaglow.com already exists (admin coll). Try to create TC with same email.
        r = requests.post(f"{BASE_URL}/api/telecallers",
                          json={"name": f"TEST_dup_{UNIQ}", "email": "admin@celestaglow.com", "phone": "9999999912"},
                          headers=admin_headers)
        assert r.status_code == 400, r.text
        assert "exist" in r.json().get("detail", "").lower()


# ----------------- 3. dedupe first-owner-wins -----------------
class TestDedupeIdempotent:
    def test_dry_run_idempotent(self, admin_headers):
        r1 = requests.post(f"{BASE_URL}/api/leads/dedupe", json={"dry_run": True}, headers=admin_headers)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/leads/dedupe", json={"dry_run": True}, headers=admin_headers)
        assert r2.status_code == 200
        # Dry run should not mutate → running twice yields same groups_processed
        assert r1.json()["groups_processed"] == r2.json()["groups_processed"]

    def test_wet_then_dry_is_zero(self, admin_headers):
        rw = requests.post(f"{BASE_URL}/api/leads/dedupe", json={}, headers=admin_headers)
        assert rw.status_code == 200
        rd = requests.post(f"{BASE_URL}/api/leads/dedupe", json={"dry_run": True}, headers=admin_headers)
        assert rd.status_code == 200
        # After wet run, dry run must find 0 duplicate groups
        assert rd.json()["groups_processed"] == 0, f"After wet dedupe, dry run still finds {rd.json()['groups_processed']} groups"


# ----------------- 4. manager-distribute skips already-owned -----------------
class TestManagerDistributeSkip:
    def test_skipped_duplicates_field(self, admin_headers):
        # Get 2 TCs
        r = requests.get(f"{BASE_URL}/api/telecallers", headers=admin_headers)
        tcs_data = r.json()
        tcs = tcs_data.get("telecallers", tcs_data) if isinstance(tcs_data, dict) else tcs_data
        assert len(tcs) >= 2
        tc_a, tc_b = tcs[0]["id"], tcs[1]["id"]

        # Create a lead assigned to tc_a
        phone = f"94{UNIQ}5000"[-10:]
        r = requests.post(f"{BASE_URL}/api/leads",
                          json={"phone_number": phone, "name": f"TEST_skip_{UNIQ}"},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        lead_a = r.json()["lead"]["id"]
        # Assign to tc_a
        rd = requests.post(f"{BASE_URL}/api/leads/manager-distribute",
                           json={"lead_ids": [lead_a], "telecaller_ids": [tc_a]},
                           headers=admin_headers)
        assert rd.status_code == 200, rd.text

        # Now create a NEW lead with same phone (should 409 — but if it succeeds via alt path,
        # attempt to distribute to tc_b, which should skip.)
        # Instead, directly test the skip logic: create ANOTHER lead with a DIFFERENT phone,
        # already assigned to tc_a. Then call distribute with telecaller_ids=[tc_b] only.
        # Since tc_a is NOT in target set → should be skipped.
        rd2 = requests.post(f"{BASE_URL}/api/leads/manager-distribute",
                            json={"lead_ids": [lead_a], "telecaller_ids": [tc_b]},
                            headers=admin_headers)
        assert rd2.status_code == 200, rd2.text
        data = rd2.json()
        assert "skipped_duplicates" in data
        assert isinstance(data["skipped_duplicates"], list)
        # The lead was owned by tc_a — tc_a not in target [tc_b] → must skip
        assert len(data["skipped_duplicates"]) == 1, f"Expected 1 skipped, got {data['skipped_duplicates']}"
        assert data["skipped_duplicates"][0]["lead_id"] == lead_a
        assert "existing_owner" in data["skipped_duplicates"][0]

        # Cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lead_a}", headers=admin_headers,
                        json={"password": "delete"})


# ----------------- 5. weekly-performance new fields -----------------
class TestWeeklyPerformanceNewFields:
    def test_new_fields_present(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/weekly-performance", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data
        if data["rows"]:
            row = data["rows"][0]
            for k in ("leads_given", "conversion_pct", "tier", "is_active_7d", "last_activity"):
                assert k in row, f"missing new field {k}"
            assert row["tier"] in ("high", "medium", "under", "no_leads")
            assert isinstance(row["is_active_7d"], bool)

    def test_active_tcs_sorted_first(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/weekly-performance", headers=admin_headers)
        data = r.json()
        rows = data["rows"]
        # Once we hit first inactive row, no active should appear after
        seen_inactive = False
        for row in rows:
            if not row["is_active_7d"]:
                seen_inactive = True
            elif seen_inactive:
                pytest.fail(f"Active TC {row['telecaller_name']} appears after an inactive TC — sort broken")


# ----------------- 6. leads-received-report -----------------
class TestLeadsReceivedReport:
    def test_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/leads-received-report", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("today", "range_from", "range_to", "rows", "totals"):
            assert k in data, f"missing {k}"
        for k in ("today", "3d", "7d", "range"):
            assert k in data["totals"]
        if data["rows"]:
            row = data["rows"][0]
            for k in ("telecaller_id", "telecaller_name", "leads_today", "leads_3d", "leads_7d", "leads_range"):
                assert k in row

    def test_custom_range(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/leads-received-report",
                         params={"from_date": "2026-01-01", "to_date": "2026-01-31"},
                         headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["range_from"] == "2026-01-01"
        assert d["range_to"] == "2026-01-31"

    def test_bad_date_400(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/leads-received-report",
                         params={"from_date": "bogus"}, headers=admin_headers)
        assert r.status_code == 400

    def test_tc_forbidden(self, tc_headers):
        r = requests.get(f"{BASE_URL}/api/admin/leads-received-report", headers=tc_headers)
        assert r.status_code == 403


# ----------------- 7. status-summary-report -----------------
class TestStatusSummaryReport:
    def test_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/status-summary-report", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("range_from", "range_to", "status_keys", "rows", "totals", "grand_not_interested_reasons"):
            assert k in data, f"missing {k}"
        for st in ("no_response", "interested", "not_interested"):
            assert st in data["status_keys"]
        if data["rows"]:
            row = data["rows"][0]
            assert "counts" in row
            assert "not_interested_reasons" in row
            for st in ("no_response", "interested", "not_interested"):
                assert st in row["counts"]

    def test_custom_range(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/status-summary-report",
                         params={"from_date": "2026-01-01", "to_date": "2026-01-31"},
                         headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["range_from"] == "2026-01-01"

    def test_tc_forbidden(self, tc_headers):
        r = requests.get(f"{BASE_URL}/api/admin/status-summary-report", headers=tc_headers)
        assert r.status_code == 403


# ----------------- 8. Notification email is no-op when SMTP not configured -----------------
class TestNotificationNoOp:
    def test_manager_distribute_still_returns_200_without_smtp(self, admin_headers):
        # Even if SMTP isn't configured, distribute should NOT crash.
        r = requests.get(f"{BASE_URL}/api/telecallers", headers=admin_headers)
        tcs_data = r.json()
        tcs = tcs_data.get("telecallers", tcs_data) if isinstance(tcs_data, dict) else tcs_data
        assert len(tcs) >= 1
        phone = f"93{UNIQ}9999"[-10:]
        rc = requests.post(f"{BASE_URL}/api/leads",
                           json={"phone_number": phone, "name": f"TEST_notif_{UNIQ}"},
                           headers=admin_headers)
        assert rc.status_code == 200, rc.text
        lid = rc.json()["lead"]["id"]
        rd = requests.post(f"{BASE_URL}/api/leads/manager-distribute",
                           json={"lead_ids": [lid], "telecaller_ids": [tcs[0]["id"]]},
                           headers=admin_headers)
        assert rd.status_code == 200, rd.text
        # cleanup
        requests.delete(f"{BASE_URL}/api/leads/{lid}", headers=admin_headers,
                        json={"password": "delete"})
