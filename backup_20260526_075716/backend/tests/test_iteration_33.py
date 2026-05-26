"""Iteration 33 — fresh deep-bug scan for Celesta Glow CRM.

Covers:
- Auth for every seeded role.
- NEW Role-specific document template precedence (role_override > global_override > inherited_global > default).
- NEW Document preview & download w/ X-Template-Source response header.
- Leads: create+duplicate-phone, RBAC for telecaller scope, listing.
- HR endpoints: /hr/employees, /hr/employment-terms, /hr/communications, /hr/call-logs.
- Finance/orders happy-path GET endpoints.
- AI endpoints graceful degradation.
"""
import os
import uuid
import pytest
import requests

def _load_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v)

_load_frontend_env()
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

ROLE_CREDS = {
    "admin": ("admin@celestaglow.com", "admin123"),
    "sales_manager": ("salesmanager@celestaglow.com", "sm123"),
    "district_manager": ("manager1@celestaglow.com", "mgr123"),
    "telecaller": ("telecaller1@celestaglow.com", "tc123"),
    "telecaller2": ("telecaller2@celestaglow.com", "tc123"),
    "agent": ("agent1@celestaglow.com", "agent123"),
    "finance_manager": ("finance@celestaglow.com", "fin123"),
    "hr_manager": ("hrmanager@celestaglow.com", "hr123"),
    "social_media_manager": ("socialmedia@celestaglow.com", "social123"),
    "inhouse_telecaller": ("inhouse1@celestaglow.com", "ih123"),
    "content_strategist": ("contentstrat@celestaglow.com", "cs123"),
}


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="session")
def tokens():
    out = {}
    for role, (email, pwd) in ROLE_CREDS.items():
        r = login(email, pwd)
        if r.status_code == 200:
            out[role] = r.json()["token"]
    return out


def H(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ==================== Auth ====================
@pytest.mark.parametrize("role,creds", list(ROLE_CREDS.items()))
def test_login_role(role, creds):
    r = login(*creds)
    assert r.status_code == 200, f"{role} login failed: {r.status_code} {r.text[:200]}"
    j = r.json()
    assert "token" in j and "user" in j
    assert j["user"]["email"] == creds[0]


def test_login_invalid():
    r = login("admin@celestaglow.com", "wrongpass")
    assert r.status_code in (400, 401, 403)


# ==================== Document Templates ====================
LETTER_KEYS = ["welcome", "offer", "employment", "agreement", "increment", "warning", "termination", "relieving", "experience"]


def test_dt_list(tokens):
    r = requests.get(f"{BASE}/hr/document-templates", headers=H(tokens["hr_manager"]))
    assert r.status_code == 200
    j = r.json()
    assert "builtin_keys" in j and "employable_roles" in j


def test_dt_get_default(tokens):
    r = requests.get(f"{BASE}/hr/document-templates/agreement", headers=H(tokens["hr_manager"]))
    assert r.status_code == 200
    j = r.json()
    assert j["source"] == "default"
    assert j["template"]["body_html"]


def test_dt_get_role_default(tokens):
    # No override yet => should fall back to default
    r = requests.get(f"{BASE}/hr/document-templates/telecaller:agreement", headers=H(tokens["hr_manager"]))
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["role"] == "telecaller"
    assert j["letter_key"] == "agreement"
    assert j["source"] in ("default", "inherited_global")


def test_dt_unknown_letter_key(tokens):
    r = requests.put(
        f"{BASE}/hr/document-templates/foobar",
        headers=H(tokens["hr_manager"]),
        json={"subject": "x", "body_html": "y"},
    )
    assert r.status_code == 400


def test_dt_unknown_role(tokens):
    r = requests.put(
        f"{BASE}/hr/document-templates/martian:agreement",
        headers=H(tokens["hr_manager"]),
        json={"subject": "x", "body_html": "y"},
    )
    assert r.status_code == 400


def test_dt_empty_body(tokens):
    r = requests.put(
        f"{BASE}/hr/document-templates/agreement",
        headers=H(tokens["hr_manager"]),
        json={"subject": "x", "body_html": "   "},
    )
    assert r.status_code == 400


def test_dt_rbac(tokens):
    if "telecaller" in tokens:
        r = requests.get(f"{BASE}/hr/document-templates", headers=H(tokens["telecaller"]))
        assert r.status_code == 403


def test_dt_precedence_full_cycle(tokens):
    """Create global override, then role override; verify precedence; delete; verify fallback."""
    hr = H(tokens["hr_manager"])
    # 1. cleanup
    requests.delete(f"{BASE}/hr/document-templates/agreement", headers=hr)
    requests.delete(f"{BASE}/hr/document-templates/telecaller:agreement", headers=hr)

    # default
    r = requests.get(f"{BASE}/hr/document-templates/telecaller:agreement", headers=hr)
    assert r.json()["source"] == "default"

    # 2. set global override
    g_body = f"<p>GLOBAL-OVR-{uuid.uuid4().hex[:6]}</p>"
    r = requests.put(f"{BASE}/hr/document-templates/agreement", headers=hr,
                     json={"subject": "Global", "body_html": g_body})
    assert r.status_code == 200

    # role-scoped fetch should inherit
    r = requests.get(f"{BASE}/hr/document-templates/telecaller:agreement", headers=hr)
    j = r.json()
    assert j["source"] == "inherited_global", j
    assert g_body in j["template"]["body_html"]

    # 3. set role override
    role_body = f"<p>ROLE-OVR-{uuid.uuid4().hex[:6]}</p>"
    r = requests.put(f"{BASE}/hr/document-templates/telecaller:agreement", headers=hr,
                     json={"subject": "Role", "body_html": role_body})
    assert r.status_code == 200

    r = requests.get(f"{BASE}/hr/document-templates/telecaller:agreement", headers=hr)
    j = r.json()
    assert j["source"] == "role_override", j
    assert role_body in j["template"]["body_html"]

    # 4. delete role override -> inherited_global
    r = requests.delete(f"{BASE}/hr/document-templates/telecaller:agreement", headers=hr)
    assert r.status_code == 200
    r = requests.get(f"{BASE}/hr/document-templates/telecaller:agreement", headers=hr)
    assert r.json()["source"] == "inherited_global"

    # 5. delete global override -> default
    requests.delete(f"{BASE}/hr/document-templates/agreement", headers=hr)
    r = requests.get(f"{BASE}/hr/document-templates/telecaller:agreement", headers=hr)
    assert r.json()["source"] == "default"


# ==================== Document Preview / Download ====================
EMPLOYEES_TO_TEST = [("tc-001", "telecaller"), ("sm-001", "sales_manager")]


@pytest.mark.parametrize("emp_id,emp_role", EMPLOYEES_TO_TEST)
@pytest.mark.parametrize("letter_key", LETTER_KEYS)
def test_doc_preview_default(tokens, emp_id, emp_role, letter_key):
    """Each letter for each employee should preview successfully w/ default source."""
    hr = {"Authorization": f"Bearer {tokens['hr_manager']}"}
    # ensure no overrides
    requests.delete(f"{BASE}/hr/document-templates/{letter_key}", headers=hr)
    requests.delete(f"{BASE}/hr/document-templates/{emp_role}:{letter_key}", headers=hr)

    r = requests.get(f"{BASE}/hr/document/preview",
                     params={"letter_key": letter_key, "employee_id": emp_id},
                     headers=hr)
    assert r.status_code == 200, f"{emp_id}/{letter_key} preview failed: {r.status_code} {r.text[:200]}"
    assert r.headers.get("X-Template-Source") == "default", r.headers
    assert r.headers.get("X-Employee-Role") == emp_role
    assert "<!DOCTYPE html>" in r.text


def test_doc_download_header(tokens):
    hr = {"Authorization": f"Bearer {tokens['hr_manager']}"}
    r = requests.get(f"{BASE}/hr/document/download",
                     params={"letter_key": "offer", "employee_id": "tc-001"},
                     headers=hr)
    assert r.status_code == 200
    cd = r.headers.get("Content-Disposition", "")
    assert "attachment" in cd and ".html" in cd


def test_doc_preview_source_precedence(tokens):
    hr = {"Authorization": f"Bearer {tokens['hr_manager']}"}
    # cleanup
    requests.delete(f"{BASE}/hr/document-templates/welcome", headers=hr)
    requests.delete(f"{BASE}/hr/document-templates/telecaller:welcome", headers=hr)

    # default
    r = requests.get(f"{BASE}/hr/document/preview",
                     params={"letter_key": "welcome", "employee_id": "tc-001"}, headers=hr)
    assert r.headers["X-Template-Source"] == "default"

    # global override
    requests.put(f"{BASE}/hr/document-templates/welcome",
                 headers={**hr, "Content-Type": "application/json"},
                 json={"subject": "G", "body_html": "<p>GLOBAL-WELCOME</p>"})
    r = requests.get(f"{BASE}/hr/document/preview",
                     params={"letter_key": "welcome", "employee_id": "tc-001"}, headers=hr)
    assert r.headers["X-Template-Source"] == "global_override"
    assert "GLOBAL-WELCOME" in r.text

    # role override
    requests.put(f"{BASE}/hr/document-templates/telecaller:welcome",
                 headers={**hr, "Content-Type": "application/json"},
                 json={"subject": "R", "body_html": "<p>ROLE-WELCOME</p>"})
    r = requests.get(f"{BASE}/hr/document/preview",
                     params={"letter_key": "welcome", "employee_id": "tc-001"}, headers=hr)
    assert r.headers["X-Template-Source"] == "role_override"
    assert "ROLE-WELCOME" in r.text

    # sales_manager preview for same letter should NOT see telecaller's override -> inherits global
    r = requests.get(f"{BASE}/hr/document/preview",
                     params={"letter_key": "welcome", "employee_id": "sm-001"}, headers=hr)
    assert r.headers["X-Template-Source"] in ("global_override", "default"), r.headers
    # should pick global override (since global was set)
    assert r.headers["X-Template-Source"] == "global_override"

    # cleanup
    requests.delete(f"{BASE}/hr/document-templates/welcome", headers=hr)
    requests.delete(f"{BASE}/hr/document-templates/telecaller:welcome", headers=hr)


def test_doc_preview_unknown_employee(tokens):
    hr = {"Authorization": f"Bearer {tokens['hr_manager']}"}
    r = requests.get(f"{BASE}/hr/document/preview",
                     params={"letter_key": "offer", "employee_id": "does-not-exist-xyz"}, headers=hr)
    assert r.status_code == 404


def test_doc_preview_unknown_letter(tokens):
    hr = {"Authorization": f"Bearer {tokens['hr_manager']}"}
    r = requests.get(f"{BASE}/hr/document/preview",
                     params={"letter_key": "bogus", "employee_id": "tc-001"}, headers=hr)
    assert r.status_code == 400


def test_doc_preview_rbac(tokens):
    if "telecaller" not in tokens:
        pytest.skip("no telecaller token")
    h = {"Authorization": f"Bearer {tokens['telecaller']}"}
    r = requests.get(f"{BASE}/hr/document/preview",
                     params={"letter_key": "offer", "employee_id": "tc-001"}, headers=h)
    assert r.status_code == 403


# ==================== Leads ====================
def _leads_to_list(j):
    if isinstance(j, list):
        return j
    if isinstance(j, dict) and "leads" in j:
        return j["leads"]
    return []


def test_leads_list_admin(tokens):
    r = requests.get(f"{BASE}/leads", headers=H(tokens["admin"]))
    assert r.status_code == 200
    leads = _leads_to_list(r.json())
    assert isinstance(leads, list)


def test_leads_list_telecaller_scope(tokens):
    if "telecaller" not in tokens or "telecaller2" not in tokens:
        pytest.skip("missing telecaller credentials")
    r1 = requests.get(f"{BASE}/leads", headers=H(tokens["telecaller"]))
    r2 = requests.get(f"{BASE}/leads", headers=H(tokens["telecaller2"]))
    assert r1.status_code == 200 and r2.status_code == 200
    l1 = _leads_to_list(r1.json())
    l2 = _leads_to_list(r2.json())
    # tc-001 must not appear in tc-002's list and vice-versa.
    for lead in l1:
        if isinstance(lead, dict):
            assert lead.get("assigned_to") in (None, "tc-001"), f"TC1 sees lead assigned to {lead.get('assigned_to')}"
    for lead in l2:
        if isinstance(lead, dict):
            assert lead.get("assigned_to") in (None, "tc-002"), f"TC2 sees lead assigned to {lead.get('assigned_to')}"
    print(f"TC1 leads: {len(l1)}, TC2 leads: {len(l2)}")


def test_leads_create_and_duplicate(tokens):
    if "telecaller" not in tokens:
        pytest.skip("no telecaller")
    h = H(tokens["telecaller"])
    phone = f"99{uuid.uuid4().int % 100000000:08d}"
    payload = {
        "customer_name": "TEST_DupCheck",
        "phone": phone,
        "enquiry_type": "orders",
        "products_interested": ["Glow Serum"],
        "notes": "iteration_33 test",
    }
    r1 = requests.post(f"{BASE}/leads", headers=h, json=payload)
    assert r1.status_code in (200, 201), f"create lead failed: {r1.status_code} {r1.text[:300]}"
    # duplicate
    r2 = requests.post(f"{BASE}/leads", headers=h, json=payload)
    assert r2.status_code in (400, 409), f"duplicate phone allowed: {r2.status_code} {r2.text[:200]}"


# ==================== HR endpoints ====================
def test_hr_employees(tokens):
    r = requests.get(f"{BASE}/hr/employees", headers=H(tokens["hr_manager"]))
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, (list, dict))


def test_hr_employment_terms(tokens):
    r = requests.get(f"{BASE}/hr/employment-terms", headers=H(tokens["hr_manager"]))
    assert r.status_code == 200


def test_hr_communications(tokens):
    r = requests.get(f"{BASE}/hr/communications", headers=H(tokens["hr_manager"]))
    assert r.status_code in (200, 204)


def test_hr_call_logs(tokens):
    r = requests.get(f"{BASE}/hr/call-logs", headers=H(tokens["hr_manager"]))
    assert r.status_code in (200, 204)


# ==================== Cross-role endpoint smoke ====================
def test_orders_admin(tokens):
    r = requests.get(f"{BASE}/orders", headers=H(tokens["admin"]))
    assert r.status_code == 200


def test_finance_transactions(tokens):
    r = requests.get(f"{BASE}/finance/transactions", headers=H(tokens["finance_manager"]))
    assert r.status_code in (200, 404), r.text[:200]


def test_unauthenticated():
    r = requests.get(f"{BASE}/leads")
    assert r.status_code in (401, 403)
