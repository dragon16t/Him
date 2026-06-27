"""Iteration 47 — Lead Distribution backend tests.

Endpoints under test (under /api):
  POST /api/leads/preview-distribute
  POST /api/leads/bulk-distribute

Modes: equal (load-aware), round_robin, name_mapped. Phone normalisation,
duplicate guard, telecaller subset, role auth.
"""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hr-central-82.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "admin@celestaglow.com", "password": "admin123"}
SM    = {"email": "salesmanager@celestaglow.com", "password": "sm123"}
TC1   = {"email": "telecaller1@celestaglow.com", "password": "tc123"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_tok():
    return _login(ADMIN).get("token") or _login(ADMIN).get("access_token")


@pytest.fixture(scope="module")
def sm_session():
    return _login(SM)


@pytest.fixture(scope="module")
def sm_tok(sm_session):
    return sm_session.get("token") or sm_session.get("access_token")


@pytest.fixture(scope="module")
def tc_tok():
    s = _login(TC1)
    return s.get("token") or s.get("access_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sm_id(sm_session):
    # /api/auth/me to discover sm user id (used only for SM-auto-scope tests)
    tok = sm_session.get("token") or sm_session.get("access_token")
    r = requests.get(f"{BASE}/api/auth/me", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    return r.json().get("id")


# The seed SM with multiple TCs (Anjali Menon, Sneha Thomas) per spec.
TARGET_SM_ID = "sm-8654ce"


@pytest.fixture(scope="module")
def team(admin_tok):
    """List of TCs under TARGET_SM_ID (admin-scoped)."""
    r = requests.get(f"{BASE}/api/telecallers", headers=_h(admin_tok), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    arr = data if isinstance(data, list) else data.get("telecallers", [])
    out = [t for t in arr if t.get("managed_by") == TARGET_SM_ID]
    return out


@pytest.fixture(scope="module")
def admin_h(admin_tok):
    return _h(admin_tok)


# ---- Auth / role-scope checks ----
class TestPreviewAuth:
    def test_admin_without_sm_id_returns_400(self, admin_tok):
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(admin_tok),
                          json={"mode": "equal", "phone_numbers": ["9999999999"]}, timeout=20)
        assert r.status_code == 400, r.text

    def test_telecaller_forbidden(self, tc_tok):
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(tc_tok),
                          json={"mode": "equal", "phone_numbers": ["9999999999"]}, timeout=20)
        assert r.status_code == 403, r.text

    def test_sm_autoscoped_no_sm_id_needed(self, sm_tok):
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(sm_tok),
                          json={"mode": "round_robin", "phone_numbers": ["9000000001", "9000000002"]},
                          timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 2
        assert body["mode"] == "round_robin"


# ---- Phone normalisation ----
class TestNormalisation:
    def test_phone_norm_three_formats_collapse(self, admin_tok, team):
        if len(team) < 1:
            pytest.skip("No TCs in SM team")
        tc_id = team[0]["id"]
        phones = ["+91 94475 58409", "9447558409", "+919447558409"]
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(admin_tok),
                          json={"sales_manager_id": TARGET_SM_ID,
                                "mode": "equal", "phone_numbers": phones,
                                "telecaller_ids": [tc_id]}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        norms = {a["phone_norm"] for a in body["allocations"]}
        assert norms == {"9447558409"}, f"expected single normalised phone, got {norms}"


# ---- Round-robin rotation ----
class TestRoundRobin:
    def test_round_robin_consistent_rotation(self, admin_tok, team):
        if len(team) < 2:
            pytest.skip("Need >= 2 TCs for rotation test")
        phones = [f"95000000{i:02d}" for i in range(6)]
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(admin_tok),
                          json={"sales_manager_id": TARGET_SM_ID,
                                "mode": "round_robin", "phone_numbers": phones}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        allocs = body["allocations"]
        n = body["team_size"]
        for i in range(n, len(allocs)):
            assert allocs[i]["telecaller_id"] == allocs[i % n]["telecaller_id"], \
                f"rotation broken at index {i}"


# ---- Equal mode load balancing ----
class TestEqualLoadAware:
    @pytest.fixture
    def imbalance(self, admin_tok, team):
        """Create 5 leads for TC-A (team[0]) so equal mode fills TC-B first."""
        if len(team) < 2:
            pytest.skip("Need >= 2 TCs for imbalance")
        tc_a = team[0]["id"]
        prefix = int(time.time()) % 10000
        for i in range(5):
            ph = f"7{prefix:04d}{i:05d}"[:10]
            r = requests.post(f"{BASE}/api/leads/bulk-distribute",
                              headers=_h(admin_tok),
                              json={"sales_manager_id": TARGET_SM_ID,
                                    "mode": "equal", "phone_numbers": [ph],
                                    "telecaller_ids": [tc_a],
                                    "notes": "TEST_imbalance"}, timeout=20)
            assert r.status_code == 200, r.text
        return tc_a

    def test_equal_balances_lower_load_first(self, admin_tok, team, imbalance):
        tc_a = imbalance
        tc_b = team[1]["id"]
        prefix = int(time.time()) % 10000
        new_phones = [f"6{prefix:04d}{i:05d}"[:10] for i in range(6)]
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(admin_tok),
                          json={"sales_manager_id": TARGET_SM_ID,
                                "mode": "equal",
                                "phone_numbers": new_phones,
                                "telecaller_ids": [tc_a, tc_b]}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        counts = {s["telecaller_id"]: s["count"] for s in body["summary"]}
        assert counts.get(tc_b, 0) == 5, f"expected TC-B to receive 5, got {counts}"
        assert counts.get(tc_a, 0) == 1, f"expected TC-A to receive 1, got {counts}"


# ---- Telecaller subset (single TC) ----
class TestTelecallerSubset:
    def test_single_tc_gets_all(self, admin_tok, team):
        if not team:
            pytest.skip("No TCs")
        tc_id = team[0]["id"]
        prefix = int(time.time()) % 10000
        phones = [f"8{prefix:04d}{i:05d}"[:10] for i in range(4)]
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(admin_tok),
                          json={"sales_manager_id": TARGET_SM_ID,
                                "mode": "equal", "phone_numbers": phones,
                                "telecaller_ids": [tc_id]}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert all(a["telecaller_id"] == tc_id for a in body["allocations"])


# ---- Name-mapped mode ----
class TestNameMapped:
    def test_name_mapped_fuzzy_and_unmatched(self, admin_tok, team):
        if not team:
            pytest.skip("No TCs")
        # Use partial first name to assert fuzzy match (e.g. "Anjali" → "Anjali Menon")
        first_tc_name = team[0].get("name") or ""
        partial = first_tc_name.split(" ")[0]
        mapping = {
            partial: ["9447001001", "9447001002"],
            "XYZUnknown": ["9447002001"],
        }
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(admin_tok),
                          json={"sales_manager_id": TARGET_SM_ID,
                                "mode": "name_mapped", "mapping": mapping}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        matched = [a for a in body["allocations"] if a.get("telecaller_id") == team[0]["id"]]
        unmatched = [a for a in body["allocations"] if a.get("unmatched_name")]
        assert len(matched) == 2, f"expected 2 matched, got {len(matched)}: {body}"
        assert len(unmatched) == 1, f"expected 1 unmatched, got {len(unmatched)}: {body}"


# ---- Bulk-distribute create + dedupe ----
class TestBulkCreateAndDedupe:
    def test_bulk_create_then_skip_duplicates(self, admin_tok, team):
        if not team:
            pytest.skip("No TCs")
        tc_id = team[0]["id"]
        prefix = int(time.time()) % 10000
        phones = [f"5{prefix:04d}{i:05d}"[:10] for i in range(3)]
        payload = {"sales_manager_id": TARGET_SM_ID,
                   "mode": "equal", "phone_numbers": phones, "telecaller_ids": [tc_id],
                   "notes": "TEST_dedupe"}

        r1 = requests.post(f"{BASE}/api/leads/bulk-distribute", headers=_h(admin_tok),
                          json=payload, timeout=30)
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        assert body1["created"] == 3, f"first run should create 3, got {body1}"
        assert body1["skipped_duplicates"] == 0
        assert all(lid.startswith("lead-") for lid in body1["lead_ids"])

        # Second run identical payload → all duplicates
        r2 = requests.post(f"{BASE}/api/leads/bulk-distribute", headers=_h(admin_tok),
                          json=payload, timeout=30)
        assert r2.status_code == 200, r2.text
        body2 = r2.json()
        assert body2["created"] == 0, f"second run should create 0, got {body2}"
        assert body2["skipped_duplicates"] == 3, f"expected 3 skips, got {body2}"

        # Verify lead doc shape via GET /api/leads
        rg = requests.get(f"{BASE}/api/leads", headers=_h(admin_tok), timeout=20)
        assert rg.status_code == 200
        data = rg.json()
        leads = data if isinstance(data, list) else data.get("leads", [])
        sample = next((l for l in leads if l.get("id") == body1["lead_ids"][0]), None)
        assert sample, "created lead not found in /api/leads response"
        assert sample.get("assigned_to") == tc_id
        assert sample.get("status") == "new"
        assert sample.get("source") == "manual_bulk"
        assert sample.get("phone_number_norm") and len(sample["phone_number_norm"]) == 10
        assert sample.get("managed_by") == TARGET_SM_ID
        assert sample.get("bulk_batch")


# ---- Admin happy path ----
class TestAdminFlow:
    def test_admin_with_sm_id_works(self, admin_tok, sm_id):
        r = requests.post(f"{BASE}/api/leads/preview-distribute",
                          headers=_h(admin_tok),
                          json={"sales_manager_id": sm_id, "mode": "round_robin",
                                "phone_numbers": ["9100000001", "9100000002"]}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["sm_id"] == sm_id
        assert body["total"] == 2
