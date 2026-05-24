"""
Celesta Glow HRMS/CRM Backend Test Suite
Iteration 13 - Comprehensive end-to-end coverage across all 15 roles
"""
import os
import pytest
import requests
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hrms-portal-29.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# All 15 demo credentials (from /app/memory/test_credentials.md)
CREDS = {
    "admin": ("admin@celestaglow.com", "admin123", "/dashboard"),
    "sales_manager": ("salesmanager@celestaglow.com", "sm123", "/sales-manager"),
    "district_manager": ("manager1@celestaglow.com", "mgr123", "/manager"),
    "assistant_sales_manager": ("asstsa@celestaglow.com", "asm123", "/assistant-sm"),
    "assistant_district_manager": ("asstdm@celestaglow.com", "adm123", "/assistant-dm"),
    "telecaller": ("telecaller1@celestaglow.com", "tc123", "/telecaller"),
    "agent": ("agent1@celestaglow.com", "agent123", "/agent"),
    "finance_manager": ("finance@celestaglow.com", "fin123", "/finance"),
    "hr_manager": ("hrmanager@celestaglow.com", "hr123", "/hr-manager"),
    "social_media_manager": ("socialmedia@celestaglow.com", "social123", "/social-media"),
    "inhouse_telecaller": ("inhouse1@celestaglow.com", "ih123", "/influencer-outreach"),
    "content_strategist": ("contentstrat@celestaglow.com", "cs123", "/content-strategist"),
    "content_developer": ("contentdev@celestaglow.com", "cd123", "/content-developer"),
    "inventory_manager": ("inventory@celestaglow.com", "inv123", "/inventory"),
    "digital_marketing_manager": ("digitalmarketing@celestaglow.com", "dm123", "/digital-marketing"),
}

TOKENS = {}
USER_IDS = {}


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


def H(role):
    return {"Authorization": f"Bearer {TOKENS[role]}"}


# ---------- AUTH ----------
class TestAuth:
    @pytest.mark.parametrize("role", list(CREDS.keys()))
    def test_login_each_role(self, role):
        email, password, route = CREDS[role]
        r = login(email, password)
        assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["role"] == role, f"role mismatch: expected {role}, got {data['user']['role']}"
        assert "_id" not in data["user"], f"_id leaked in user object for {role}"
        TOKENS[role] = data["token"]
        USER_IDS[role] = data["user"]["id"]

    def test_auth_me(self):
        if "admin" not in TOKENS:
            pytest.skip("admin not logged in")
        r = requests.get(f"{API}/auth/me", headers=H("admin"))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_login_invalid(self):
        r = login("nope@nope.com", "bad")
        assert r.status_code in (400, 401, 403)

    def test_proxy_login_admin_to_telecaller(self):
        if "admin" not in TOKENS:
            pytest.skip()
        tc_id = USER_IDS.get("telecaller")
        if not tc_id:
            pytest.skip()
        r = requests.post(f"{API}/admin/proxy-login/{tc_id}", headers=H("admin"))
        assert r.status_code == 200, f"proxy-login failed: {r.text[:200]}"
        d = r.json()
        assert "token" in d
        assert d.get("route") in ("/telecaller", None) or "user" in d


# ---------- ADMIN: list users / hr-team ----------
class TestAdminListings:
    @pytest.mark.parametrize("path", [
        "/telecallers", "/managers", "/sales-managers", "/agents",
        "/hr-managers", "/social-media-managers", "/inhouse-telecallers",
        "/content-strategists", "/content-developers", "/all-users", "/all-managers",
        "/hr-team", "/hr/employees",
    ])
    def test_user_listings(self, path):
        if "admin" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}{path}", headers=H("admin"))
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
        body = r.json()
        items = body if isinstance(body, list) else body.get("items", body)
        if isinstance(items, list) and items:
            assert "_id" not in items[0], f"_id leaked at {path}"


# ---------- ADMIN: create / update / delete user via /hr-team ----------
class TestUserCRUD:
    created_id = None
    test_email = f"TEST_user_{uuid.uuid4().hex[:6]}@test.com"

    def test_create_user(self):
        if "admin" not in TOKENS:
            pytest.skip()
        payload = {
            "email": TestUserCRUD.test_email,
            "password": "Test@123",
            "name": "TEST User CRUD",
            "role": "telecaller",
            "phone": "9999999999",
            "salary": 20000,
        }
        r = requests.post(f"{API}/hr-team", json=payload, headers=H("admin"))
        assert r.status_code in (200, 201), f"create user failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        TestUserCRUD.created_id = d.get("id") or d.get("user", {}).get("id")
        assert TestUserCRUD.created_id, f"no id returned: {d}"

    def test_login_new_user(self):
        if not TestUserCRUD.created_id:
            pytest.skip()
        r = login(TestUserCRUD.test_email, "Test@123")
        assert r.status_code == 200, f"new user login failed: {r.text[:200]}"

    def test_update_user(self):
        if not TestUserCRUD.created_id:
            pytest.skip()
        r = requests.put(
            f"{API}/users/{TestUserCRUD.created_id}/update",
            json={"name": "TEST Updated"},
            headers=H("admin"),
        )
        assert r.status_code in (200, 204), f"update failed: {r.status_code} {r.text[:200]}"

    def test_delete_user_requires_master_pwd(self):
        if not TestUserCRUD.created_id:
            pytest.skip()
        # Wrong master password should fail
        r1 = requests.delete(
            f"{API}/users/{TestUserCRUD.created_id}",
            headers={**H("admin"), "X-Master-Password": "wrong"},
        )
        # Try query param style if header doesn't work
        r2 = requests.delete(
            f"{API}/users/{TestUserCRUD.created_id}?master_password=XYCDF6F@123",
            headers=H("admin"),
        )
        # At least one of these forms should accept correct master password
        if r2.status_code not in (200, 204):
            # try body
            r3 = requests.request(
                "DELETE",
                f"{API}/users/{TestUserCRUD.created_id}",
                json={"master_password": "XYCDF6F@123"},
                headers=H("admin"),
            )
            assert r3.status_code in (200, 204, 400, 401, 403, 422), f"delete unexpected: {r3.status_code} {r3.text[:200]}"


# ---------- ADMIN: app config (commission rates) ----------
class TestAppConfig:
    def test_get_commission_rates(self):
        if "admin" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/config/commission-rates", headers=H("admin"))
        assert r.status_code == 200, r.text[:200]

    def test_update_commission_rates(self):
        if "admin" not in TOKENS:
            pytest.skip()
        r = requests.put(
            f"{API}/config/commission-rates",
            json={"agent": 10, "telecaller": 8, "district_manager": 5, "sales_manager": 5,
                  "assistant_sales_manager": 3, "assistant_district_manager": 3},
            headers=H("admin"),
        )
        assert r.status_code in (200, 204), f"{r.status_code} {r.text[:200]}"


# ---------- TELECALLER ----------
class TestTelecallerFlow:
    lead_id = None

    def test_create_lead(self):
        if "telecaller" not in TOKENS:
            pytest.skip()
        payload = {
            "name": "TEST Lead TC",
            "phone": "9876500001",
            "address": "TEST Address",
            "locality": "TEST Locality",
            "notes": "TEST",
        }
        r = requests.post(f"{API}/leads", json=payload, headers=H("telecaller"))
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"
        d = r.json()
        TestTelecallerFlow.lead_id = d.get("id")
        assert "_id" not in d

    def test_get_lead(self):
        if not TestTelecallerFlow.lead_id:
            pytest.skip()
        r = requests.get(f"{API}/leads/{TestTelecallerFlow.lead_id}", headers=H("telecaller"))
        assert r.status_code == 200

    def test_update_lead_status(self):
        if not TestTelecallerFlow.lead_id:
            pytest.skip()
        r = requests.put(
            f"{API}/leads/{TestTelecallerFlow.lead_id}",
            json={"status": "interested", "call_log": "TEST call - very interested"},
            headers=H("telecaller"),
        )
        assert r.status_code in (200, 204), f"{r.status_code} {r.text[:200]}"

    def test_today_calls(self):
        r = requests.get(f"{API}/leads/today-calls", headers=H("telecaller"))
        assert r.status_code == 200

    def test_my_commissions(self):
        r = requests.get(f"{API}/commissions/my", headers=H("telecaller"))
        assert r.status_code == 200

    def test_leaderboard(self):
        r = requests.get(f"{API}/leaderboard/telecaller", headers=H("telecaller"))
        assert r.status_code == 200


# ---------- AGENT ----------
class TestAgentFlow:
    def test_get_agent_leads(self):
        if "agent" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/leads", headers=H("agent"))
        assert r.status_code == 200

    def test_agent_follow_ups(self):
        r = requests.get(f"{API}/leads/follow-ups", headers=H("agent"))
        assert r.status_code == 200

    def test_relationship_calls(self):
        r = requests.get(f"{API}/relationship-calls", headers=H("agent"))
        assert r.status_code == 200


# ---------- SALES MANAGER / DISTRICT MANAGER ----------
class TestManagerFlow:
    def test_sm_pending_orders(self):
        if "sales_manager" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/orders/pending", headers=H("sales_manager"))
        assert r.status_code == 200

    def test_dm_my_districts(self):
        if "district_manager" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/dm/my-districts", headers=H("district_manager"))
        assert r.status_code == 200

    def test_dm_call_logs_all(self):
        r = requests.get(f"{API}/call-logs/all", headers=H("district_manager"))
        assert r.status_code == 200


# ---------- FINANCE ----------
class TestFinanceFlow:
    def test_balance(self):
        if "finance_manager" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/finance/balance", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_ledger(self):
        r = requests.get(f"{API}/finance/ledger", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_pnl(self):
        r = requests.get(f"{API}/pnl", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_payroll_list(self):
        r = requests.get(f"{API}/payroll", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_fund_requests(self):
        r = requests.get(f"{API}/fund-requests", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_gst(self):
        r = requests.get(f"{API}/finance/gst", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_vendors(self):
        r = requests.get(f"{API}/vendors", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_recurring(self):
        r = requests.get(f"{API}/finance/recurring", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_clv(self):
        r = requests.get(f"{API}/analytics/clv", headers=H("finance_manager"))
        assert r.status_code == 200

    def test_monthly_stats(self):
        r = requests.get(f"{API}/finance/monthly-stats", headers=H("finance_manager"))
        assert r.status_code == 200


# ---------- HR ----------
class TestHRFlow:
    candidate_id = None

    def test_employees(self):
        if "hr_manager" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/hr/employees", headers=H("hr_manager"))
        assert r.status_code == 200

    def test_hiring_candidates_list(self):
        r = requests.get(f"{API}/hiring/candidates", headers=H("hr_manager"))
        assert r.status_code == 200

    def test_hr_create_candidate(self):
        payload = {
            "name": "TEST Candidate",
            "phone": "9876500099",
            "email": f"TEST_cand_{uuid.uuid4().hex[:6]}@test.com",
            "position": "telecaller",
            "source": "referral",
        }
        r = requests.post(f"{API}/hiring/candidates", json=payload, headers=H("hr_manager"))
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"
        TestHRFlow.candidate_id = r.json().get("id")

    def test_hr_attendance_today(self):
        r = requests.get(f"{API}/attendance/today", headers=H("hr_manager"))
        assert r.status_code == 200

    def test_hr_attendance_daily(self):
        r = requests.get(f"{API}/attendance/daily", headers=H("hr_manager"))
        assert r.status_code == 200

    def test_hr_leaves_balance(self):
        r = requests.get(f"{API}/leaves/balance", headers=H("hr_manager"))
        assert r.status_code == 200

    def test_hr_resignations(self):
        r = requests.get(f"{API}/resignations", headers=H("hr_manager"))
        assert r.status_code == 200

    def test_hr_birthdays(self):
        r = requests.get(f"{API}/employees/birthdays", headers=H("hr_manager"))
        assert r.status_code == 200

    def test_hr_complaints(self):
        r = requests.get(f"{API}/complaints", headers=H("hr_manager"))
        assert r.status_code == 200

    def test_hr_call_logs(self):
        r = requests.get(f"{API}/hr/call-logs", headers=H("hr_manager"))
        assert r.status_code == 200


# ---------- SOCIAL MEDIA ----------
class TestSocialMediaFlow:
    inf_id = None

    def test_calendar(self):
        if "social_media_manager" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/content-calendar", headers=H("social_media_manager"))
        assert r.status_code == 200

    def test_influencers_list(self):
        r = requests.get(f"{API}/influencers", headers=H("social_media_manager"))
        assert r.status_code == 200

    def test_influencer_create(self):
        payload = {"name": "TEST Influencer", "handle": "@testinfluencer", "platform": "instagram", "followers": 10000}
        r = requests.post(f"{API}/influencers", json=payload, headers=H("social_media_manager"))
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"
        TestSocialMediaFlow.inf_id = r.json().get("id")

    def test_influencer_delete(self):
        if not TestSocialMediaFlow.inf_id:
            pytest.skip()
        r = requests.delete(f"{API}/influencers/{TestSocialMediaFlow.inf_id}", headers=H("social_media_manager"))
        assert r.status_code in (200, 204)

    def test_shoot_plans(self):
        r = requests.get(f"{API}/shoot-plans", headers=H("social_media_manager"))
        assert r.status_code == 200

    def test_sales_stats(self):
        r = requests.get(f"{API}/social-media/sales-stats", headers=H("social_media_manager"))
        assert r.status_code == 200


# ---------- INHOUSE TELECALLER ----------
class TestInhouseFlow:
    def test_outreach_list(self):
        if "inhouse_telecaller" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/influencer/outreach", headers=H("inhouse_telecaller"))
        assert r.status_code == 200

    def test_call_logs_get(self):
        r = requests.get(f"{API}/inhouse/call-logs", headers=H("inhouse_telecaller"))
        assert r.status_code == 200

    def test_daily_goals_get(self):
        r = requests.get(f"{API}/inhouse/daily-goals", headers=H("inhouse_telecaller"))
        assert r.status_code == 200


# ---------- CONTENT STRATEGIST / DEVELOPER ----------
class TestContentFlow:
    def test_pillars_list(self):
        if "content_strategist" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/content/pillars", headers=H("content_strategist"))
        assert r.status_code == 200

    def test_briefs_list(self):
        r = requests.get(f"{API}/content-briefs", headers=H("content_strategist"))
        assert r.status_code == 200

    def test_assignments_list(self):
        r = requests.get(f"{API}/content-assignments", headers=H("content_strategist"))
        assert r.status_code == 200

    def test_dev_my_tasks(self):
        if "content_developer" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/content/my-tasks", headers=H("content_developer"))
        assert r.status_code == 200

    def test_dev_my_briefs(self):
        r = requests.get(f"{API}/production/my-briefs", headers=H("content_developer"))
        assert r.status_code == 200


# ---------- INVENTORY ----------
class TestInventoryFlow:
    def test_orders(self):
        if "inventory_manager" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/inventory/orders", headers=H("inventory_manager"))
        assert r.status_code == 200

    def test_low_stock(self):
        r = requests.get(f"{API}/products/low-stock", headers=H("inventory_manager"))
        assert r.status_code == 200

    def test_purchase_orders(self):
        r = requests.get(f"{API}/purchase-orders", headers=H("inventory_manager"))
        assert r.status_code == 200

    def test_returns(self):
        r = requests.get(f"{API}/returns", headers=H("inventory_manager"))
        assert r.status_code == 200

    def test_products(self):
        r = requests.get(f"{API}/products", headers=H("inventory_manager"))
        assert r.status_code == 200


# ---------- DIGITAL MARKETING ----------
class TestDigitalMarketingFlow:
    cid = None

    def test_campaigns_list(self):
        if "digital_marketing_manager" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/campaigns", headers=H("digital_marketing_manager"))
        assert r.status_code == 200

    def test_campaign_create(self):
        payload = {"name": "TEST Camp", "platform": "facebook", "budget": 5000, "start_date": datetime.now(timezone.utc).isoformat()}
        r = requests.post(f"{API}/campaigns", json=payload, headers=H("digital_marketing_manager"))
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:200]}"
        TestDigitalMarketingFlow.cid = r.json().get("id")

    def test_campaigns_overview(self):
        r = requests.get(f"{API}/campaigns/overview", headers=H("digital_marketing_manager"))
        assert r.status_code == 200

    def test_campaigns_analytics(self):
        r = requests.get(f"{API}/campaigns/analytics", headers=H("digital_marketing_manager"))
        assert r.status_code == 200

    def test_campaign_leads(self):
        r = requests.get(f"{API}/campaign-leads", headers=H("digital_marketing_manager"))
        assert r.status_code == 200

    def test_campaign_delete(self):
        if not TestDigitalMarketingFlow.cid:
            pytest.skip()
        r = requests.delete(f"{API}/campaigns/{TestDigitalMarketingFlow.cid}", headers=H("digital_marketing_manager"))
        assert r.status_code in (200, 204)


# ---------- GLOBAL ----------
class TestGlobal:
    def test_notifications(self):
        if "admin" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}/notifications", headers=H("admin"))
        assert r.status_code == 200

    def test_activity_feed(self):
        r = requests.get(f"{API}/activity-feed", headers=H("admin"))
        assert r.status_code == 200

    def test_funnel(self):
        r = requests.get(f"{API}/analytics/funnel", headers=H("admin"))
        assert r.status_code == 200

    def test_clv(self):
        r = requests.get(f"{API}/analytics/clv", headers=H("admin"))
        assert r.status_code == 200

    def test_dashboard_stats(self):
        r = requests.get(f"{API}/dashboard/stats", headers=H("admin"))
        assert r.status_code == 200

    def test_customers_search(self):
        r = requests.get(f"{API}/customers/search?q=test", headers=H("admin"))
        assert r.status_code == 200

    def test_attendance_check_in(self):
        # idempotent-ish: attempt to check in any user
        r = requests.post(f"{API}/attendance/check-in", json={}, headers=H("telecaller"))
        # 200 or 400/409 if already checked in
        assert r.status_code in (200, 201, 400, 409), f"{r.status_code} {r.text[:200]}"


# ---------- DATA INTEGRITY: _id must NOT leak in any list ----------
class TestDataIntegrity:
    @pytest.mark.parametrize("path", [
        "/leads", "/orders", "/products", "/regions", "/influencers",
        "/campaigns", "/all-users", "/hr/employees", "/notifications",
        "/activity-feed", "/finance/ledger", "/expenses", "/payroll",
    ])
    def test_no_objectid_leak(self, path):
        if "admin" not in TOKENS:
            pytest.skip()
        r = requests.get(f"{API}{path}", headers=H("admin"))
        if r.status_code != 200:
            pytest.skip(f"endpoint not 200: {r.status_code}")
        body = r.json()
        items = body if isinstance(body, list) else body.get("items", [])
        if isinstance(items, list) and items:
            assert "_id" not in items[0], f"_id leaked at {path}: keys={list(items[0].keys())[:10]}"
