"""Iteration 21 — Backend regression for Celesta Glow CRM/HRMS.

Covers 24 test points across:
- Order create requires customer_address; ship requires tracking_link
- Inventory orders: ship+deliver + tracking_link required, date_filter
- Telecaller conversion increment on delivery (admin + inv mgr)
- Data segregation: SM vs DM commissions / orders / leads
- Call logs unified (admin sees telecaller_call with caller_name)
- Lead create populates assigned_to_name
- DM-creates-agent / SM-creates-telecaller / Admin user create → login + reset
- AI generate-areas via Gemini
- Demo seeded leads visible in correct dashboards
"""
import os
import time
import uuid
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


BASE = _load_base_url()
API = f"{BASE}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_h(): return _h(_login("admin@celestaglow.com", "admin123"))
@pytest.fixture(scope="module")
def sm_h(): return _h(_login("salesmanager@celestaglow.com", "sm123"))
@pytest.fixture(scope="module")
def dm_h(): return _h(_login("manager1@celestaglow.com", "mgr123"))
@pytest.fixture(scope="module")
def tc_h(): return _h(_login("telecaller1@celestaglow.com", "tc123"))
@pytest.fixture(scope="module")
def agent_h(): return _h(_login("agent1@celestaglow.com", "agent123"))
@pytest.fixture(scope="module")
def inv_h(): return _h(_login("inventory@celestaglow.com", "inv123"))


# ============== POST /api/orders ==============
class TestOrderCreate:
    def test_missing_customer_address_400(self, tc_h):
        r = requests.post(f"{API}/orders", json={
            "customer_name": "TEST_NoAddr", "customer_phone": "9999900000",
            "items": [{"name": "Serum", "qty": 1, "price": 100}], "total_amount": 100,
        }, headers=tc_h)
        assert r.status_code == 400
        assert "address" in r.text.lower()

    def test_create_with_full_address_200(self, tc_h):
        r = requests.post(f"{API}/orders", json={
            "customer_name": "TEST_Addr", "customer_phone": "9999900001",
            "customer_address": "Flat 7, Pearl Apartments",
            "customer_city": "Calicut", "customer_pincode": "673001",
            "customer_landmark": "Near Lulu", "customer_state": "Kerala",
            "items": [{"name": "Serum", "qty": 1, "price": 500}], "total_amount": 500,
        }, headers=tc_h)
        assert r.status_code == 200, r.text
        o = r.json()["order"]
        assert o["customer_address"] == "Flat 7, Pearl Apartments"
        assert o["customer_city"] == "Calicut"
        assert o["customer_pincode"] == "673001"
        assert o["customer_landmark"] == "Near Lulu"
        assert o["customer_state"] == "Kerala"


def _create_and_confirm_order(tc_h, sm_h, total=300, lead_id=""):
    payload = {
        "customer_name": f"TEST_{uuid.uuid4().hex[:5]}",
        "customer_phone": "9000000001",
        "customer_address": "Some addr 12",
        "customer_city": "Kochi", "customer_pincode": "682001",
        "items": [{"name": "Cream", "qty": 1, "price": total}],
        "total_amount": total,
    }
    if lead_id:
        payload["lead_id"] = lead_id
    r = requests.post(f"{API}/orders", json=payload, headers=tc_h)
    assert r.status_code == 200, r.text
    oid = r.json()["order"]["id"]
    # SM approves (telecaller order goes through SM)
    ra = requests.put(f"{API}/orders/{oid}/approve", headers=sm_h)
    assert ra.status_code == 200, ra.text
    return oid


# ============== PUT /api/orders/{id}/ship ==============
class TestOrderShip:
    def test_ship_without_tracking_link_400(self, tc_h, sm_h):
        oid = _create_and_confirm_order(tc_h, sm_h)
        r = requests.put(f"{API}/orders/{oid}/ship", json={}, headers=sm_h)
        assert r.status_code == 400
        assert "tracking" in r.text.lower()

    def test_ship_with_tracking_link_200(self, tc_h, sm_h):
        oid = _create_and_confirm_order(tc_h, sm_h)
        r = requests.put(f"{API}/orders/{oid}/ship",
                         json={"tracking_link": "https://shiprocket/x1",
                               "courier_name": "Delhivery", "tracking_number": "DLV123"},
                         headers=sm_h)
        assert r.status_code == 200, r.text
        # Verify persisted
        all_orders = requests.get(f"{API}/orders", headers=sm_h).json()["orders"]
        got = next(o for o in all_orders if o["id"] == oid)
        assert got["tracking_link"] == "https://shiprocket/x1"
        assert got["courier_name"] == "Delhivery"
        assert got["tracking_number"] == "DLV123"
        assert got["status"] == "shipped"


# ============== Inventory orders ship/deliver ==============
class TestInventoryShipDeliver:
    def test_inventory_ship_without_tracking_400(self, tc_h, sm_h, inv_h):
        oid = _create_and_confirm_order(tc_h, sm_h)
        r = requests.put(f"{API}/inventory/orders/{oid}/ship", json={}, headers=inv_h)
        assert r.status_code == 400

    def test_inventory_ship_with_tracking_200_then_deliver(self, tc_h, sm_h, inv_h):
        oid = _create_and_confirm_order(tc_h, sm_h, total=400)
        r = requests.put(f"{API}/inventory/orders/{oid}/ship",
                         json={"tracking_link": "https://courier/abc",
                               "courier_name": "BlueDart", "tracking_number": "BD9"},
                         headers=inv_h)
        assert r.status_code == 200, r.text
        # Get conversions before deliver
        tcs1 = requests.get(f"{API}/telecallers", headers=sm_h).json()["telecallers"]
        tc1 = next(t for t in tcs1 if t["email"] == "telecaller1@celestaglow.com")
        before = tc1.get("conversions", 0)
        # Now deliver via inventory route
        rd = requests.put(f"{API}/inventory/orders/{oid}/deliver", headers=inv_h)
        assert rd.status_code == 200, rd.text
        # Wait briefly for write
        time.sleep(0.5)
        tcs2 = requests.get(f"{API}/telecallers", headers=sm_h).json()["telecallers"]
        tc2 = next(t for t in tcs2 if t["email"] == "telecaller1@celestaglow.com")
        after = tc2.get("conversions", 0)
        assert after == before + 1, f"conversions did not increment: {before} -> {after}"
        assert tc2.get("total_sales", 0) >= 400

    def test_admin_deliver_route_increments_conversions(self, tc_h, sm_h, admin_h, inv_h):
        # ship via inv first (since /orders/{id}/deliver requires shipped)
        oid = _create_and_confirm_order(tc_h, sm_h, total=250)
        rs = requests.put(f"{API}/orders/{oid}/ship",
                         json={"tracking_link": "https://x/y", "courier_name": "X"},
                         headers=admin_h)
        assert rs.status_code == 200
        tcs1 = requests.get(f"{API}/telecallers", headers=admin_h).json()["telecallers"]
        before = next(t for t in tcs1 if t["email"] == "telecaller1@celestaglow.com").get("conversions", 0)
        rd = requests.put(f"{API}/orders/{oid}/deliver", headers=admin_h)
        assert rd.status_code == 200, rd.text
        time.sleep(0.3)
        tcs2 = requests.get(f"{API}/telecallers", headers=admin_h).json()["telecallers"]
        after = next(t for t in tcs2 if t["email"] == "telecaller1@celestaglow.com").get("conversions", 0)
        assert after == before + 1, f"admin deliver did not bump conv: {before}->{after}"


# ============== inventory date_filter ==============
class TestInventoryDateFilter:
    def test_date_filter_day(self, tc_h, sm_h, inv_h):
        oid = _create_and_confirm_order(tc_h, sm_h, total=120)
        # fetch order to determine its date
        rj = requests.get(f"{API}/inventory/orders", headers=inv_h).json()
        my = next(o for o in rj["orders"] if o["id"] == oid)
        day = my["created_at"][:10]
        r = requests.get(f"{API}/inventory/orders?date_filter={day}", headers=inv_h)
        assert r.status_code == 200
        for o in r.json()["orders"]:
            assert o["created_at"].startswith(day), f"order {o['id']} not in {day}"
        ids = [o["id"] for o in r.json()["orders"]]
        assert oid in ids

    def test_date_filter_month(self, inv_h):
        # Use current month
        from datetime import datetime, timezone
        ym = datetime.now(timezone.utc).isoformat()[:7]
        r = requests.get(f"{API}/inventory/orders?date_filter={ym}", headers=inv_h)
        assert r.status_code == 200
        for o in r.json()["orders"]:
            assert o["created_at"].startswith(ym)


# ============== Commissions segregation ==============
class TestCommissionsSegregation:
    def test_sm_sees_only_telecaller_pool(self, sm_h):
        r = requests.get(f"{API}/commissions/all", headers=sm_h)
        assert r.status_code == 200
        for c in r.json()["commissions"]:
            assert c.get("user_role") in ['telecaller', 'sales_manager',
                                          'assistant_sales_manager', 'inhouse_telecaller'], c

    def test_dm_sees_only_agent_pool(self, dm_h):
        r = requests.get(f"{API}/commissions/all", headers=dm_h)
        assert r.status_code == 200
        for c in r.json()["commissions"]:
            assert c.get("user_role") in ['agent', 'district_manager',
                                          'assistant_district_manager'], c


# ============== Orders segregation ==============
class TestOrdersSegregation:
    def test_sm_sees_only_tc_orders(self, sm_h):
        r = requests.get(f"{API}/orders", headers=sm_h)
        assert r.status_code == 200
        for o in r.json()["orders"]:
            role = o.get("created_by_role", "")
            assert role in ['telecaller', 'sales_manager',
                            'assistant_sales_manager', 'inhouse_telecaller', ''], f"SM saw {role}"
            assert role != 'agent'

    def test_dm_sees_only_agent_orders(self, dm_h):
        r = requests.get(f"{API}/orders", headers=dm_h)
        assert r.status_code == 200
        for o in r.json()["orders"]:
            role = o.get("created_by_role", "")
            assert role in ['agent', 'district_manager',
                            'assistant_district_manager', ''], f"DM saw {role}"
            assert role != 'telecaller'


# ============== Leads follow-ups segregation + assigned_to_name ==============
class TestLeadsFollowUps:
    def test_sm_follow_ups_telecallers_only(self, sm_h):
        r = requests.get(f"{API}/leads/follow-ups", headers=sm_h)
        assert r.status_code == 200
        body = r.json()
        all_leads = (body.get("repeat_due", []) + body.get("repeat_upcoming", [])
                     + body.get("relationship_due", []) + body.get("relationship_upcoming", []))
        for lead in all_leads:
            if lead.get("assigned_to"):
                assert lead["assigned_to"].startswith("tc"), \
                    f"SM saw non-tc lead: {lead.get('assigned_to')}"

    def test_dm_follow_ups_agents_only(self, dm_h):
        r = requests.get(f"{API}/leads/follow-ups", headers=dm_h)
        assert r.status_code == 200
        body = r.json()
        all_leads = (body.get("repeat_due", []) + body.get("repeat_upcoming", [])
                     + body.get("relationship_due", []) + body.get("relationship_upcoming", []))
        for lead in all_leads:
            if lead.get("assigned_to"):
                assert lead["assigned_to"].startswith("agent"), \
                    f"DM saw non-agent lead: {lead.get('assigned_to')}"

    def test_assigned_to_name_populated_on_create(self, tc_h):
        # Telecaller creating a lead → assigned_to_name = self
        r = requests.post(f"{API}/leads", json={
            "name": f"TEST_LEAD_{uuid.uuid4().hex[:4]}",
            "phone_number": f"98000{uuid.uuid4().hex[:5]}",
            "assigned_to": "tc-001",
        }, headers=tc_h)
        assert r.status_code == 200, r.text
        lead = r.json().get("lead") or r.json()
        # Some servers nest under 'lead', some return flat
        if "assigned_to_name" not in lead and "lead" in r.json():
            lead = r.json()["lead"]
        assert lead.get("assigned_to_name"), f"assigned_to_name missing in {lead}"


# ============== Admin Call Logs ==============
class TestAdminCallLogs:
    def test_admin_call_logs_telecaller_caller_name(self, admin_h):
        r = requests.get(f"{API}/call-logs/all", headers=admin_h)
        assert r.status_code == 200
        logs = r.json()["call_logs"]
        tc_logs = [l for l in logs if l.get("source") == "telecaller_call"]
        # If demo seeded calls exist they should have caller_name
        for l in tc_logs:
            assert "caller_name" in l, f"caller_name missing on {l}"
        if tc_logs:
            with_name = [l for l in tc_logs if l.get("caller_name")]
            assert with_name, "no telecaller_call logs had a caller_name populated"


# ============== DM creates Agent + login + reset ==============
class TestDMCreateAgent:
    def test_create_agent_login_reset(self, dm_h):
        email = f"test_agent_{uuid.uuid4().hex[:6]}@celestaglow.com"
        r = requests.post(f"{API}/agents", json={
            "email": email, "name": "TEST Agent X",
            "phone": "9876543210", "password": "agentpw1",
            "district": "Calicut",
        }, headers=dm_h)
        assert r.status_code == 200, r.text
        # Login
        rl = requests.post(f"{API}/auth/login", json={"email": email, "password": "agentpw1"})
        assert rl.status_code == 200, rl.text
        # Wrong password
        rw = requests.post(f"{API}/auth/login", json={"email": email, "password": "WRONG"})
        assert rw.status_code == 401
        # Reset
        rr = requests.post(f"{API}/auth/reset-password",
                           json={"email": email, "new_password": "agentpw2"})
        assert rr.status_code == 200, rr.text
        rl2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "agentpw2"})
        assert rl2.status_code == 200, rl2.text


# ============== SM creates Telecaller + login + reset ==============
class TestSMCreateTelecaller:
    def test_create_tc_login_reset(self, sm_h):
        email = f"test_tc_{uuid.uuid4().hex[:6]}@celestaglow.com"
        r = requests.post(f"{API}/telecallers", json={
            "email": email, "name": "TEST TC Y",
            "phone": "9123456789", "password": "tcpw1",
        }, headers=sm_h)
        assert r.status_code == 200, r.text
        assert requests.post(f"{API}/auth/login",
                             json={"email": email, "password": "tcpw1"}).status_code == 200
        assert requests.post(f"{API}/auth/login",
                             json={"email": email, "password": "BAD"}).status_code == 401
        assert requests.post(f"{API}/auth/reset-password",
                             json={"email": email, "new_password": "tcpw2"}).status_code == 200
        assert requests.post(f"{API}/auth/login",
                             json={"email": email, "password": "tcpw2"}).status_code == 200


# ============== Admin creates user via factory ==============
class TestAdminCreateUser:
    def test_admin_create_finance_login_reset(self, admin_h):
        email = f"test_fin_{uuid.uuid4().hex[:6]}@celestaglow.com"
        r = requests.post(f"{API}/finance-managers", json={
            "email": email, "name": "TEST FIN", "phone": "9000111222", "password": "finpw1",
        }, headers=admin_h)
        assert r.status_code == 200, r.text
        assert requests.post(f"{API}/auth/login",
                             json={"email": email, "password": "finpw1"}).status_code == 200
        assert requests.post(f"{API}/auth/login",
                             json={"email": email, "password": "wrong"}).status_code == 401
        assert requests.post(f"{API}/auth/reset-password",
                             json={"email": email, "new_password": "finpw2"}).status_code == 200
        rl = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": "finpw2"})
        assert rl.status_code == 200
        assert rl.json()["user"]["role"] == "finance_manager"


# ============== AI generate-areas (Gemini) ==============
class TestAIGenerateAreas:
    def test_generate_areas_calicut(self, admin_h):
        r = requests.post(f"{API}/ai/generate-areas",
                          json={"district": "Calicut"},
                          headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        # Endpoint should return list of areas
        areas = body.get("areas") or body.get("data") or body
        if isinstance(areas, dict):
            areas = areas.get("areas", [])
        assert isinstance(areas, list), f"areas not a list: {body}"
        assert len(areas) >= 3, f"expected at least 3 areas, got {areas}"


# ============== Demo seeded leads visibility ==============
class TestDemoLeads:
    def test_demo_leads_present(self, admin_h):
        r = requests.get(f"{API}/leads", headers=admin_h)
        assert r.status_code == 200
        ids = {l["id"] for l in r.json()["leads"]}
        for lid in ["lead-demo-1", "lead-demo-2", "lead-demo-3"]:
            assert lid in ids, f"missing seeded lead {lid}"

    def test_aishwarya_in_tc1_today_calls(self, tc_h):
        r = requests.get(f"{API}/leads/today-calls", headers=tc_h)
        assert r.status_code == 200
        names = [l.get("name", "") for l in r.json()["leads"]]
        # Aishwarya (lead-demo-1, assigned tc-001 = telecaller1)
        assert any("Aishwarya" in n for n in names), f"Aishwarya not in TC1 today-calls: {names}"

    def test_meena_for_dm(self, dm_h):
        r = requests.get(f"{API}/leads/follow-ups", headers=dm_h)
        assert r.status_code == 200
        body = r.json()
        all_leads = (body.get("repeat_due", []) + body.get("repeat_upcoming", [])
                     + body.get("relationship_due", []) + body.get("relationship_upcoming", []))
        names = [l.get("name", "") for l in all_leads]
        # Meena assigned to agent-001 — DM should see in either due/upcoming bucket
        assert any("Meena" in n for n in names), f"Meena not in DM follow-ups: {names}"
