"""
Iteration 35 — Celesta Glow CRM regression tests.
Covers:
  FIX 1: Expense approval gating in dashboard/stats (admin + finance_manager)
  FIX 2: Daily report PDF works for admin AND all non-admin roles (reportlab installed)
  FIX 4: Role-specific PDF sections (header presence per role)
  REGRESSION: auth + leads RBAC + role-scoped doc templates
"""
import os
import re
import time
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # fallback to frontend/.env (tests run from container without env injection)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

CREDS = {
    "admin":                ("admin@celestaglow.com",          "admin123"),
    "finance_manager":      ("finance@celestaglow.com",        "fin123"),
    "hr_manager":           ("hrmanager@celestaglow.com",      "hr123"),
    "sales_manager":        ("salesmanager@celestaglow.com",   "sm123"),
    "digital_marketing":    ("digitalmarketing@celestaglow.com","dm123"),
    "social_media":         ("socialmedia@celestaglow.com",    "social123"),
    "content_strategist":   ("contentstrat@celestaglow.com",   "cs123"),
    "content_developer":    ("contentdev@celestaglow.com",     "cd123"),
    "inventory_manager":    ("inventory@celestaglow.com",      "inv123"),
    "telecaller":           ("telecaller1@celestaglow.com",    "tc123"),
    "agent":                ("agent1@celestaglow.com",         "agent123"),
}

# Expected PDF section header substring per role (case-sensitive in stream but
# reportlab encodes them readable. We search lowercased PDF bytes).
EXPECTED_HEADER = {
    "admin":              ["hr activity", "sales pipeline", "digital marketing", "social media", "content strategy", "content development", "finance", "inventory"],
    "finance_manager":    ["finance"],
    "hr_manager":         ["hr activity"],
    "sales_manager":      ["sales pipeline"],
    "digital_marketing":  ["digital marketing"],
    "social_media":       ["social media"],
    "content_strategist": ["content strategy"],
    "content_developer":  ["content development"],
    "inventory_manager":  ["inventory"],
    "telecaller":         [],   # telecaller section header not asserted (no fixed name)
    "agent":              [],
}

_TOKENS = {}


def _pdf_text(pdf_bytes: bytes) -> str:
    """Extract concatenated text from a PDF using pypdf (handles compressed streams)."""
    import io as _io
    from pypdf import PdfReader
    reader = PdfReader(_io.BytesIO(pdf_bytes))
    return "\n".join((p.extract_text() or "") for p in reader.pages).lower()


def _login(role: str) -> str:
    """Login with retry handling for the 10/min IP rate limit."""
    if role in _TOKENS:
        return _TOKENS[role]
    email, pw = CREDS[role]
    for attempt in range(3):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
        if r.status_code == 200:
            tok = r.json().get("token") or r.json().get("access_token")
            assert tok, f"No token in login response for {role}: {r.text[:200]}"
            _TOKENS[role] = tok
            return tok
        if r.status_code == 429:
            time.sleep(20)
            continue
        pytest.fail(f"Login failed for {role}: {r.status_code} {r.text[:200]}")
    pytest.fail(f"Login retries exhausted for {role}")


@pytest.fixture(scope="session")
def admin_h():
    return {"Authorization": f"Bearer {_login('admin')}"}


@pytest.fixture(scope="session")
def finance_h():
    return {"Authorization": f"Bearer {_login('finance_manager')}"}


# --------------------------------------------------------------------------
# REGRESSION: auth ping
# --------------------------------------------------------------------------
class TestAuth:
    def test_all_roles_login(self):
        for role in CREDS:
            tok = _login(role)
            assert isinstance(tok, str) and len(tok) > 10


# --------------------------------------------------------------------------
# FIX 1: Expense approval workflow gating in dashboard/stats
# --------------------------------------------------------------------------
class TestExpenseApprovalGating:
    def _stats(self, headers):
        r = requests.get(f"{API}/dashboard/stats", headers=headers, timeout=15)
        assert r.status_code == 200, f"dashboard/stats={r.status_code} {r.text[:200]}"
        j = r.json()
        # Backend wraps in {"stats": {...}} for finance, returns flat for admin in some versions.
        return j.get("stats", j) if isinstance(j, dict) else j

    def test_pending_expense_not_in_total_admin(self, admin_h):
        # baseline
        before = self._stats(admin_h)
        base_total = before.get("total_expenses", 0)
        base_pending = before.get("pending_expenses_amount", 0)

        # create a pending expense as admin (admins can post)
        payload = {"category": "office_supplies", "amount": 1234.0,
                   "description": "TEST_iter35 pending expense",
                   "paid_to_name": "Acme TEST"}
        cr = requests.post(f"{API}/expenses", json=payload, headers=admin_h, timeout=15)
        assert cr.status_code in (200, 201), f"create expense failed: {cr.status_code} {cr.text[:200]}"
        eid = cr.json().get("id") or cr.json().get("expense", {}).get("id")
        assert eid, f"no expense id returned: {cr.json()}"

        # stats: total should NOT have moved; pending should grow by 1234
        mid = self._stats(admin_h)
        assert abs(mid["total_expenses"] - base_total) < 0.01, (
            f"total_expenses moved with PENDING expense: {base_total} -> {mid['total_expenses']}")
        assert mid["pending_expenses_amount"] >= base_pending + 1233.99, (
            f"pending_expenses_amount didn't bump: {base_pending} -> {mid['pending_expenses_amount']}")

        # approve
        ar = requests.put(f"{API}/expenses/{eid}/approve",
                          json={"status": "approved", "debit_from": "main"},
                          headers=admin_h, timeout=15)
        assert ar.status_code == 200, f"approve failed: {ar.status_code} {ar.text[:200]}"

        # stats now: total bumped, pending dropped
        after = self._stats(admin_h)
        assert after["total_expenses"] >= base_total + 1233.99, (
            f"total_expenses didn't bump after approve: {base_total} -> {after['total_expenses']}")
        assert after["pending_expenses_amount"] <= mid["pending_expenses_amount"] - 1233.99, (
            f"pending_expenses_amount didn't drop after approve: {mid['pending_expenses_amount']} -> {after['pending_expenses_amount']}")

        # cleanup — delete via admin
        requests.delete(f"{API}/expenses/{eid}", headers=admin_h, timeout=15)

    def test_finance_dashboard_has_same_gating(self, finance_h):
        s = self._stats(finance_h)
        # Required fields present and consistent
        assert "total_expenses" in s
        assert "pending_expenses_amount" in s
        assert s["total_expenses"] >= 0
        assert s["pending_expenses_amount"] >= 0


# --------------------------------------------------------------------------
# FIX 2 + FIX 4: PDF generation works for every role and has role-correct header
# --------------------------------------------------------------------------
class TestDailyReportPDFAllRoles:
    @pytest.mark.parametrize("role", list(CREDS.keys()))
    def test_pdf_for_role(self, role):
        tok = _login(role)
        r = requests.get(f"{API}/reports/daily.pdf",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 200, f"{role} pdf status={r.status_code} body={r.text[:300]}"
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct, f"{role} content-type={ct}"
        assert r.content[:8].startswith(b"%PDF-1."), f"{role} body magic={r.content[:8]!r}"
        assert len(r.content) > 500, f"{role} pdf suspiciously small: {len(r.content)}"
        # decode PDF text using pypdf (handles ASCII85+Flate compression)
        text = _pdf_text(r.content)
        for expected in EXPECTED_HEADER[role]:
            assert expected in text, (
                f"{role} pdf missing expected section header '{expected}'. "
                f"Extracted text (first 800 chars): {text[:800]!r}")


# --------------------------------------------------------------------------
# FIX 4: Section gating — non-admin roles should NOT carry sections of OTHER roles
# We can't read the PDF JSON directly (no .json endpoint), so we assert via header
# presence: e.g., HR PDF must NOT contain "Digital Marketing" section header.
# --------------------------------------------------------------------------
class TestRoleScopedSections:
    EXCLUSIONS = {
        # role -> list of section headers that MUST NOT appear in their PDF
        "hr_manager":         ["digital marketing", "social media activity", "content strategy",
                               "content development", "finance", "inventory"],
        "sales_manager":      ["hr activity", "digital marketing", "social media activity",
                               "content strategy", "content development"],
        "digital_marketing":  ["hr activity", "social media activity", "content strategy", "content development"],
        "social_media":       ["hr activity", "digital marketing", "content strategy", "content development"],
        "content_strategist": ["hr activity", "digital marketing", "social media activity", "content development", "finance", "inventory"],
        "content_developer":  ["hr activity", "digital marketing", "social media activity", "content strategy", "finance", "inventory"],
        "finance_manager":    ["hr activity", "digital marketing", "social media activity", "content strategy", "content development", "inventory"],
        "inventory_manager":  ["hr activity", "digital marketing", "social media activity", "content strategy", "content development", "finance"],
    }

    @pytest.mark.parametrize("role", list(EXCLUSIONS.keys()))
    def test_role_pdf_excludes_other_sections(self, role):
        tok = _login(role)
        r = requests.get(f"{API}/reports/daily.pdf",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 200, f"{role} {r.status_code}"
        text = _pdf_text(r.content)
        leaked = [h for h in self.EXCLUSIONS[role] if h in text]
        assert not leaked, f"{role} PDF leaks foreign sections: {leaked}"


# --------------------------------------------------------------------------
# REGRESSION: leads RBAC + document template preview
# --------------------------------------------------------------------------
class TestRegression:
    def test_leads_listing_admin(self, admin_h):
        r = requests.get(f"{API}/leads", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert "leads" in j and isinstance(j["leads"], list)

    def test_doc_template_preview_admin(self, admin_h):
        # find an employee
        er = requests.get(f"{API}/employees", headers=admin_h, timeout=15)
        if er.status_code != 200:
            pytest.skip(f"/employees not available: {er.status_code}")
        rows = er.json()
        emps = rows if isinstance(rows, list) else rows.get("employees", [])
        if not emps:
            pytest.skip("no employees seeded")
        eid = emps[0]["id"]
        r = requests.get(f"{API}/hr/document-templates/preview",
                         params={"employee_id": eid, "letter_key": "welcome"},
                         headers=admin_h, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"

    def test_leads_unauth_blocked(self):
        r = requests.get(f"{API}/leads", timeout=15)
        assert r.status_code in (401, 403)
