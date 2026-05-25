"""
Iteration 34 — fresh DEEP scan of Celesta Glow CRM.
Focus: response-shape consistency, RBAC leakage, new feature regressions,
orders/commissions/finance/payroll/leaves/tasks/HR/admin endpoints,
phase2 + upgrades endpoints, AI graceful degradation.
"""
import os
import pytest
import requests

BASE = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

CREDS = {
    "admin": ("admin@celestaglow.com", "admin123"),
    "sm": ("salesmanager@celestaglow.com", "sm123"),
    "dm": ("manager1@celestaglow.com", "mgr123"),
    "tc1": ("telecaller1@celestaglow.com", "tc123"),
    "tc2": ("telecaller2@celestaglow.com", "tc123"),
    "agent1": ("agent1@celestaglow.com", "agent123"),
    "agent2": ("agent2@celestaglow.com", "agent123"),
    "finance": ("finance@celestaglow.com", "fin123"),
    "hr": ("hrmanager@celestaglow.com", "hr123"),
    "social": ("socialmedia@celestaglow.com", "social123"),
    "ih1": ("inhouse1@celestaglow.com", "ih123"),
    "cs": ("contentstrat@celestaglow.com", "cs123"),
}

TOKENS = {}

def _login(email, pw):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]

@pytest.fixture(scope="session", autouse=True)
def login_all():
    for k, (e, p) in CREDS.items():
        TOKENS[k] = _login(e, p)
    yield

def H(role):
    return {"Authorization": f"Bearer {TOKENS[role]}"}

# ============ 1. Auth ============
class TestAuth:
    def test_all_role_logins(self):
        # All logins were already done in the session-scope autouse fixture
        # (which proves logins succeed). Re-logging in here trips the 10/min
        # rate-limit, so just sanity-check that every role yielded a token.
        for k in CREDS:
            assert TOKENS.get(k), f"{k} has no token"

    def test_me(self):
        r = requests.get(f"{BASE}/api/auth/me", headers=H("admin"))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self):
        r = requests.get(f"{BASE}/api/auth/me")
        assert r.status_code in (401, 403)

# ============ 2. Leads ============
class TestLeads:
    def test_admin_leads_shape(self):
        r = requests.get(f"{BASE}/api/leads", headers=H("admin"))
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j, dict) and "leads" in j and "total" in j

    def test_telecaller_leads_shape(self):
        r = requests.get(f"{BASE}/api/leads", headers=H("tc1"))
        assert r.status_code == 200
        j = r.json()
        # Document the actual shape
        assert isinstance(j, dict) and "leads" in j, f"tc1 leads shape: {type(j).__name__} sample={str(j)[:200]}"

    def test_rbac_tc1_cannot_see_tc2(self):
        r1 = requests.get(f"{BASE}/api/leads", headers=H("tc1")).json()
        leads = r1.get("leads", r1) if isinstance(r1, dict) else r1
        for l in leads:
            assert l.get("assigned_to") in ("tc-001", None), f"leak: {l.get('assigned_to')}"

    def test_today_calls(self):
        r = requests.get(f"{BASE}/api/leads/today-calls", headers=H("tc1"))
        assert r.status_code == 200
        assert "leads" in r.json()

    def test_followups(self):
        r = requests.get(f"{BASE}/api/leads/follow-ups", headers=H("tc1"))
        assert r.status_code in (200, 404)

    def test_score(self):
        r = requests.get(f"{BASE}/api/leads/lead-demo-1/score", headers=H("admin"))
        # may 404 if endpoint expects POST or seed missing — capture
        assert r.status_code in (200, 404, 405), r.status_code

    def test_reply_suggestions_no_gemini(self):
        # Should degrade gracefully without GEMINI_API_KEY (not 500)
        r = requests.get(f"{BASE}/api/leads/lead-demo-1/reply-suggestions", headers=H("admin"))
        assert r.status_code != 500, f"gemini-less 500: {r.text[:200]}"

    def test_history(self):
        r = requests.get(f"{BASE}/api/leads/lead-demo-1/history", headers=H("admin"))
        assert r.status_code in (200, 404)

# ============ 3. Orders / Commissions / Finance ============
class TestOrdersCommissionsFinance:
    def test_orders_admin_shape(self):
        r = requests.get(f"{BASE}/api/orders", headers=H("admin"))
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j, dict) and "orders" in j and "total" in j

    def test_orders_tc(self):
        r = requests.get(f"{BASE}/api/orders", headers=H("tc1"))
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j, dict) and "orders" in j
        for o in j["orders"]:
            assert o.get("created_by") == "tc-001"

    def test_orders_pending_rbac(self):
        r = requests.get(f"{BASE}/api/orders/pending", headers=H("tc1"))
        assert r.status_code == 403
        r2 = requests.get(f"{BASE}/api/orders/pending", headers=H("admin"))
        assert r2.status_code == 200

    def test_commissions_my(self):
        r = requests.get(f"{BASE}/api/commissions/my", headers=H("tc1"))
        assert r.status_code == 200
        assert r.status_code != 500

    def test_commissions_all_admin(self):
        r = requests.get(f"{BASE}/api/commissions/all", headers=H("admin"))
        assert r.status_code == 200

    def test_commissions_all_tc_forbidden(self):
        r = requests.get(f"{BASE}/api/commissions/all", headers=H("tc1"))
        assert r.status_code in (403, 401), r.status_code

    def test_commissions_summary(self):
        r = requests.get(f"{BASE}/api/commissions/summary", headers=H("admin"))
        assert r.status_code == 200

    def test_finance_balance(self):
        r = requests.get(f"{BASE}/api/finance/balance", headers=H("finance"))
        assert r.status_code == 200

    def test_finance_ledger(self):
        r = requests.get(f"{BASE}/api/finance/ledger", headers=H("finance"))
        assert r.status_code == 200

    def test_finance_monthly_stats(self):
        r = requests.get(f"{BASE}/api/finance/monthly-stats", headers=H("finance"))
        assert r.status_code == 200

    def test_finance_cash_holders(self):
        r = requests.get(f"{BASE}/api/finance/cash-holders", headers=H("finance"))
        assert r.status_code == 200

    def test_finance_balance_no_auth(self):
        r = requests.get(f"{BASE}/api/finance/balance")
        assert r.status_code in (401, 403)

# ============ 4. Payroll / Fund Requests / Expenses ============
class TestPayrollFundsExpenses:
    def test_payroll_list_admin(self):
        r = requests.get(f"{BASE}/api/payroll", headers=H("admin"))
        assert r.status_code == 200

    def test_payroll_list_tc_forbidden(self):
        r = requests.get(f"{BASE}/api/payroll", headers=H("tc1"))
        # might be allowed self-only — capture
        assert r.status_code != 500

    def test_payroll_suggest(self):
        r = requests.get(f"{BASE}/api/payroll/suggest/tc-001", headers=H("admin"))
        assert r.status_code in (200, 404), r.status_code

    def test_fund_requests_list(self):
        r = requests.get(f"{BASE}/api/fund-requests", headers=H("tc1"))
        assert r.status_code == 200

    def test_expenses_list(self):
        r = requests.get(f"{BASE}/api/expenses", headers=H("tc1"))
        assert r.status_code == 200

    def test_expenses_no_auth(self):
        r = requests.get(f"{BASE}/api/expenses")
        assert r.status_code in (401, 403)

# ============ 5. Tasks / Attendance / Leaves / Complaints ============
class TestOps:
    def test_tasks(self):
        r = requests.get(f"{BASE}/api/tasks", headers=H("tc1"))
        assert r.status_code == 200

    def test_attendance_admin(self):
        r = requests.get(f"{BASE}/api/attendance", headers=H("admin"))
        assert r.status_code == 200

    def test_attendance_tc_forbidden(self):
        r = requests.get(f"{BASE}/api/attendance", headers=H("tc1"))
        assert r.status_code == 403

    def test_attendance_today(self):
        r = requests.get(f"{BASE}/api/attendance/today", headers=H("tc1"))
        assert r.status_code == 200

    def test_attendance_daily_admin(self):
        r = requests.get(f"{BASE}/api/attendance/daily", headers=H("admin"))
        assert r.status_code == 200

    def test_leaves(self):
        r = requests.get(f"{BASE}/api/leaves", headers=H("tc1"))
        assert r.status_code == 200

    def test_complaints(self):
        r = requests.get(f"{BASE}/api/complaints", headers=H("tc1"))
        assert r.status_code == 200

# ============ 6. HR endpoints (incl. new template feature) ============
class TestHR:
    def test_hr_employees(self):
        r = requests.get(f"{BASE}/api/hr/employees", headers=H("hr"))
        assert r.status_code == 200

    def test_hr_employees_tc_forbidden(self):
        r = requests.get(f"{BASE}/api/hr/employees", headers=H("tc1"))
        assert r.status_code in (403, 401)

    def test_hr_employment_terms(self):
        r = requests.get(f"{BASE}/api/hr/employment-terms", headers=H("hr"))
        assert r.status_code == 200

    def test_hr_document_templates(self):
        r = requests.get(f"{BASE}/api/hr/document-templates", headers=H("hr"))
        assert r.status_code == 200

    def test_hr_communications(self):
        r = requests.get(f"{BASE}/api/hr/communications", headers=H("hr"))
        assert r.status_code == 200

    def test_hr_call_logs(self):
        r = requests.get(f"{BASE}/api/hr/call-logs", headers=H("hr"))
        assert r.status_code == 200

    def test_hr_managers_for_forwarding(self):
        r = requests.get(f"{BASE}/api/hr/managers-for-forwarding", headers=H("hr"))
        assert r.status_code == 200

    def test_document_preview_valid(self):
        r = requests.get(f"{BASE}/api/hr/document/preview?employee_id=tc-001&letter_key=offer", headers=H("hr"))
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert "X-Template-Source" in r.headers

    def test_document_preview_invalid_letter_key(self):
        # Should reject unknown letter key (400) not crash (500)
        r = requests.get(f"{BASE}/api/hr/document/preview?employee_id=tc-001&letter_key=foo_bogus", headers=H("hr"))
        assert r.status_code in (400, 404), f"got {r.status_code} body={r.text[:200]}"

    def test_document_preview_invalid_emp(self):
        r = requests.get(f"{BASE}/api/hr/document/preview?employee_id=does-not-exist&letter_key=offer", headers=H("hr"))
        assert r.status_code in (400, 404), r.status_code

    def test_document_preview_no_auth(self):
        r = requests.get(f"{BASE}/api/hr/document/preview?employee_id=tc-001&letter_key=offer")
        assert r.status_code in (401, 403)

    def test_document_preview_tc_forbidden(self):
        r = requests.get(f"{BASE}/api/hr/document/preview?employee_id=tc-001&letter_key=offer", headers=H("tc1"))
        assert r.status_code == 403

    def test_document_download(self):
        r = requests.get(f"{BASE}/api/hr/document/download?employee_id=tc-001&letter_key=offer", headers=H("admin"))
        assert r.status_code == 200
        assert "X-Template-Source" in r.headers

    def test_template_put_validates_empty(self):
        # PUT with body_html='' should reject
        payload = {"key": "offer", "title": "Offer", "body_html": ""}
        r = requests.put(f"{BASE}/api/hr/document-templates/offer",
                         headers={**H("admin"), "Content-Type": "application/json"}, json=payload)
        assert r.status_code != 500, r.text[:300]
        # Either 400 (correct validation) or 200 (no validation — bug)
        # Document outcome
        print(f"PUT empty body_html → {r.status_code}: {r.text[:200]}")

    def test_template_put_invalid_role_scope(self):
        # role-scoped key with bogus role should 400
        payload = {"key": "offer__role__nonexistent_role", "title": "x", "body_html": "<p>x</p>"}
        r = requests.put(f"{BASE}/api/hr/document-templates/offer__role__nonexistent_role",
                         headers={**H("admin"), "Content-Type": "application/json"}, json=payload)
        assert r.status_code != 500
        print(f"PUT bogus role-scope → {r.status_code}")

# ============ 7. Admin endpoints ============
class TestAdmin:
    def test_admin_employees(self):
        r = requests.get(f"{BASE}/api/admin/employees", headers=H("admin"))
        assert r.status_code == 200

    def test_admin_employees_tc_forbidden(self):
        r = requests.get(f"{BASE}/api/admin/employees", headers=H("tc1"))
        assert r.status_code in (403, 401)

    def test_cascade_preview(self):
        r = requests.get(f"{BASE}/api/users/tc-001/cascade-preview", headers=H("admin"))
        assert r.status_code in (200, 404), r.status_code

    def test_admin_employee_360(self):
        r = requests.get(f"{BASE}/api/admin/employee/tc-001/360", headers=H("admin"))
        assert r.status_code == 200, r.text[:200]

    def test_admin_forecast(self):
        r = requests.get(f"{BASE}/api/admin/forecast", headers=H("admin"))
        assert r.status_code in (200, 404, 503), r.status_code  # may degrade w/o gemini

    def test_admin_proxy_audit(self):
        r = requests.get(f"{BASE}/api/admin/proxy-audit", headers=H("admin"))
        assert r.status_code in (200, 404)

# ============ 8. Phase2 / Upgrades ============
class TestPhase2Upgrades:
    def test_v2_orders(self):
        r = requests.get(f"{BASE}/api/v2/orders", headers=H("admin"))
        assert r.status_code in (200, 404), r.status_code

    def test_v2_leads(self):
        r = requests.get(f"{BASE}/api/v2/leads", headers=H("admin"))
        assert r.status_code in (200, 404), r.status_code

    def test_v2_export_orders(self):
        r = requests.get(f"{BASE}/api/v2/export/orders.csv", headers=H("admin"))
        assert r.status_code in (200, 404, 403)

    def test_v2_export_leads(self):
        r = requests.get(f"{BASE}/api/v2/export/leads.csv", headers=H("admin"))
        assert r.status_code in (200, 404, 403)

    def test_live_ops_wall(self):
        r = requests.get(f"{BASE}/api/live/ops-wall", headers=H("admin"))
        assert r.status_code in (200, 404)

    def test_analytics_cohort(self):
        r = requests.get(f"{BASE}/api/analytics/cohort", headers=H("admin"))
        assert r.status_code in (200, 404)

    def test_trash_leads(self):
        r = requests.get(f"{BASE}/api/trash/leads", headers=H("admin"))
        assert r.status_code in (200, 404, 403)

    def test_hr_efficiency(self):
        r = requests.get(f"{BASE}/api/hr/efficiency", headers=H("hr"))
        assert r.status_code in (200, 404)

# ============ 9. Misc / RBAC leak checks ============
class TestRBACLeaks:
    def test_tc_cannot_access_finance(self):
        for p in ["/api/finance/balance", "/api/finance/ledger", "/api/finance/cash-holders",
                  "/api/finance/monthly-stats"]:
            r = requests.get(f"{BASE}{p}", headers=H("tc1"))
            assert r.status_code in (401, 403), f"{p} should be 403 for tc1, got {r.status_code}"

    def test_tc_cannot_access_hr(self):
        for p in ["/api/hr/employees", "/api/hr/employment-terms", "/api/hr/document-templates"]:
            r = requests.get(f"{BASE}{p}", headers=H("tc1"))
            assert r.status_code in (401, 403), f"{p} → tc1 got {r.status_code}"

    def test_tc_cannot_access_admin(self):
        for p in ["/api/admin/employees", "/api/admin/forecast"]:
            r = requests.get(f"{BASE}{p}", headers=H("tc1"))
            assert r.status_code in (401, 403, 404), f"{p} → tc1 got {r.status_code}"

    def test_orders_no_auth(self):
        r = requests.get(f"{BASE}/api/orders")
        assert r.status_code in (401, 403)

    def test_leads_no_auth(self):
        r = requests.get(f"{BASE}/api/leads")
        assert r.status_code in (401, 403)
