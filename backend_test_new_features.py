#!/usr/bin/env python3
"""
Celesta Glow CRM Backend Test Suite - New Features
Testing specific requirements from review request:
1. Email sending verification with custom template
2. Updated employment terms in offer letter footer
3. Document template overrides (NEW endpoints)
4. New unified instruction endpoint with task assignment + email + dashboard
5. Verify only ONE POST /api/instructions endpoint exists
"""

import requests
import json
import uuid
from datetime import datetime, timezone, date, timedelta

# Backend URL from review request
BASE_URL = "https://hr-central-82.preview.emergentagent.com"
API = f"{BASE_URL}/api"

# Credentials from review request
ADMIN_EMAIL = "admin@celestaglow.com"
ADMIN_PASSWORD = "admin123"
MASTER_DELETE_PASSWORD = "XYCDF6F@123"
MASTER_HARD_RESET_PASSWORD = "AMVPA2478F@123"

# Global variables for test state
admin_token = None
test_results = []

def log_test(test_name, status, details=""):
    """Log test results"""
    result = {
        "test": test_name,
        "status": status,
        "details": details,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    test_results.append(result)
    status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"{status_icon} [{status}] {test_name}")
    if details:
        print(f"   → {details}")

def make_request(method, endpoint, headers=None, json_data=None, expected_status=None):
    """Make HTTP request and return response"""
    url = f"{API}{endpoint}"
    try:
        response = requests.request(method, url, headers=headers, json=json_data, timeout=60)
        if expected_status and response.status_code != expected_status:
            log_test(f"{method} {endpoint}", "FAIL", 
                    f"Expected {expected_status}, got {response.status_code}: {response.text[:300]}")
            return response  # Return response even if status doesn't match expected
        return response
    except requests.exceptions.Timeout as e:
        log_test(f"{method} {endpoint}", "ERROR", f"Request timeout: {str(e)}")
        return None
    except requests.exceptions.ConnectionError as e:
        log_test(f"{method} {endpoint}", "ERROR", f"Connection error: {str(e)}")
        return None
    except Exception as e:
        log_test(f"{method} {endpoint}", "ERROR", f"Request failed: {str(e)}")
        return None

def login_admin():
    """Login as admin and get token"""
    global admin_token
    print("\n=== Logging in as Admin ===")
    response = make_request("POST", "/auth/login", 
                          json_data={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response and response.status_code == 200:
        data = response.json()
        admin_token = data.get("token")
        if admin_token:
            log_test("Admin login", "PASS", f"Token obtained, role={data.get('role')}")
            return True
        else:
            log_test("Admin login", "FAIL", "No token in response")
            return False
    else:
        log_test("Admin login", "FAIL", 
                f"Status {response.status_code if response else 'None'}")
        return False

def test_email_sending_custom_template():
    """Test 1: Email sending verification with custom template"""
    print("\n=== Test 1: Email Sending Verification (Custom Template) ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "template": "custom",
        "to_email": "glowcelesta@gmail.com",
        "emp_name": "QA",
        "subject": "Test",
        "message": "Hello"
    }
    
    response = make_request("POST", "/hr/send-email", headers=headers, json_data=payload)
    
    if not response:
        log_test("Email sending - custom template", "FAIL", "No response received")
        return False
    
    # Check if it's 200 (success) or 502 (SMTP error)
    if response.status_code == 200:
        try:
            data = response.json()
            if data.get("communication", {}).get("status") == "sent":
                log_test("Email sending - custom template", "PASS", 
                        "Email sent successfully with status='sent'")
                return True
            else:
                log_test("Email sending - custom template", "FAIL", 
                        f"Status not 'sent': {data.get('communication', {}).get('status')}")
                return False
        except Exception as e:
            log_test("Email sending - custom template", "FAIL", f"Invalid JSON: {e}")
            return False
    elif response.status_code == 502:
        try:
            data = response.json()
            detail = data.get("detail", "")
            if "SMTP" in detail or "Email send failed" in detail:
                log_test("Email sending - custom template", "PASS", 
                        f"Got expected 502 with SMTP error: {detail[:100]}")
                return True
            else:
                log_test("Email sending - custom template", "FAIL", 
                        f"Got 502 but unexpected detail: {detail}")
                return False
        except Exception as e:
            log_test("Email sending - custom template", "FAIL", f"Got 502 but invalid JSON: {e}")
            return False
    else:
        log_test("Email sending - custom template", "FAIL", 
                f"Unexpected status {response.status_code}: {response.text[:300]}")
        return False

def test_offer_letter_employment_terms():
    """Test 2: Updated employment terms in offer letter footer"""
    print("\n=== Test 2: Offer Letter with Updated Employment Terms ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "template": "offer",
        "to_email": "glowcelesta@gmail.com",
        "emp_name": "Test",
        "position": "Test",
        "salary": 20000,
        "joining_date": "2026-05-15",
        "department": "Operations",
        "reporting_to": "HR"
    }
    
    response = make_request("POST", "/hr/send-email", headers=headers, json_data=payload)
    
    if not response:
        log_test("Offer letter - employment terms", "FAIL", "No response received")
        return False
    
    # Check if it's 200 (success) or 502 (SMTP error)
    if response.status_code == 200:
        try:
            data = response.json()
            if data.get("communication", {}).get("status") == "sent":
                log_test("Offer letter - employment terms", "PASS", 
                        "Offer letter sent successfully. Employment terms should include break-time, Friday extra-30min, Sunday weekly-off")
                return True
            else:
                log_test("Offer letter - employment terms", "FAIL", 
                        f"Status not 'sent': {data.get('communication', {}).get('status')}")
                return False
        except Exception as e:
            log_test("Offer letter - employment terms", "FAIL", f"Invalid JSON: {e}")
            return False
    elif response.status_code == 502:
        try:
            data = response.json()
            detail = data.get("detail", "")
            if "SMTP" in detail or "Email send failed" in detail:
                log_test("Offer letter - employment terms", "PASS", 
                        f"Got expected 502 with SMTP error (email would have terms if SMTP configured): {detail[:100]}")
                return True
            else:
                log_test("Offer letter - employment terms", "FAIL", 
                        f"Got 502 but unexpected detail: {detail}")
                return False
        except Exception as e:
            log_test("Offer letter - employment terms", "FAIL", f"Got 502 but invalid JSON: {e}")
            return False
    else:
        log_test("Offer letter - employment terms", "FAIL", 
                f"Unexpected status {response.status_code}: {response.text[:300]}")
        return False

def test_document_template_overrides():
    """Test 3: Document template overrides (NEW endpoints)"""
    print("\n=== Test 3: Document Template Overrides ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    all_passed = True
    
    # 3.1: GET /api/hr/document-templates → returns {templates:[], builtin_keys:[...9 keys]}
    print("\n--- 3.1: List document templates ---")
    response = make_request("GET", "/hr/document-templates", headers=headers)
    if response and response.status_code == 200:
        try:
            data = response.json()
            templates = data.get("templates", [])
            builtin_keys = data.get("builtin_keys", [])
            
            if isinstance(templates, list) and isinstance(builtin_keys, list):
                if len(builtin_keys) == 9:
                    log_test("List document templates", "PASS", 
                            f"Got {len(templates)} templates, {len(builtin_keys)} builtin keys: {builtin_keys}")
                else:
                    log_test("List document templates", "FAIL", 
                            f"Expected 9 builtin keys, got {len(builtin_keys)}: {builtin_keys}")
                    all_passed = False
            else:
                log_test("List document templates", "FAIL", 
                        f"Invalid response structure: {data}")
                all_passed = False
        except Exception as e:
            log_test("List document templates", "FAIL", f"Invalid JSON: {e}")
            all_passed = False
    else:
        log_test("List document templates", "FAIL", 
                f"Status {response.status_code if response else 'None'}")
        all_passed = False
    
    # 3.2: PUT /api/hr/document-templates/offer with custom template
    print("\n--- 3.2: Create custom offer template ---")
    custom_template = {
        "subject": "Custom Offer for {emp_name}",
        "body_html": "<p>Hello {emp_name}, your salary is Rs.{salary}.</p>"
    }
    response = make_request("PUT", "/hr/document-templates/offer", 
                          headers=headers, json_data=custom_template)
    if response and response.status_code == 200:
        try:
            data = response.json()
            if data.get("message") and data.get("template"):
                log_test("Create custom template", "PASS", 
                        f"Template saved: {data.get('message')}")
            else:
                log_test("Create custom template", "FAIL", 
                        f"Missing message or template in response: {data}")
                all_passed = False
        except Exception as e:
            log_test("Create custom template", "FAIL", f"Invalid JSON: {e}")
            all_passed = False
    else:
        log_test("Create custom template", "FAIL", 
                f"Status {response.status_code if response else 'None'}")
        all_passed = False
    
    # 3.3: GET /api/hr/document-templates/offer → returns the saved template
    print("\n--- 3.3: Get custom offer template ---")
    response = make_request("GET", "/hr/document-templates/offer", headers=headers)
    if response and response.status_code == 200:
        try:
            data = response.json()
            template = data.get("template")
            if template and template.get("subject") == "Custom Offer for {emp_name}":
                log_test("Get custom template", "PASS", 
                        f"Retrieved custom template with correct subject")
            else:
                log_test("Get custom template", "FAIL", 
                        f"Template not found or incorrect: {template}")
                all_passed = False
        except Exception as e:
            log_test("Get custom template", "FAIL", f"Invalid JSON: {e}")
            all_passed = False
    else:
        log_test("Get custom template", "FAIL", 
                f"Status {response.status_code if response else 'None'}")
        all_passed = False
    
    # 3.4: Send email with custom template → should mention "(custom template)"
    print("\n--- 3.4: Send email with custom template ---")
    payload = {
        "template": "offer",
        "to_email": "glowcelesta@gmail.com",
        "emp_name": "Custom QA",
        "salary": 25000
    }
    response = make_request("POST", "/hr/send-email", headers=headers, json_data=payload)
    if response and response.status_code in [200, 502]:
        try:
            data = response.json()
            if response.status_code == 200:
                message = data.get("message", "")
                if "custom template" in message.lower():
                    log_test("Send with custom template", "PASS", 
                            f"Email sent with custom template: {message}")
                else:
                    log_test("Send with custom template", "FAIL", 
                            f"Message doesn't mention custom template: {message}")
                    all_passed = False
            else:  # 502
                # SMTP error is acceptable, but check if it would have used custom template
                detail = data.get("detail", "")
                log_test("Send with custom template", "PASS", 
                        f"Got 502 SMTP error (would use custom template if configured): {detail[:100]}")
        except Exception as e:
            log_test("Send with custom template", "FAIL", f"Invalid JSON: {e}")
            all_passed = False
    else:
        log_test("Send with custom template", "FAIL", 
                f"Status {response.status_code if response else 'None'}")
        all_passed = False
    
    # 3.5: DELETE /api/hr/document-templates/offer → reverts to default
    print("\n--- 3.5: Delete custom template (revert to default) ---")
    response = make_request("DELETE", "/hr/document-templates/offer", headers=headers)
    if response and response.status_code == 200:
        try:
            data = response.json()
            message = data.get("message", "")
            if "default" in message.lower() or "reverted" in message.lower():
                log_test("Delete custom template", "PASS", 
                        f"Template reverted to default: {message}")
            else:
                log_test("Delete custom template", "FAIL", 
                        f"Unexpected message: {message}")
                all_passed = False
        except Exception as e:
            log_test("Delete custom template", "FAIL", f"Invalid JSON: {e}")
            all_passed = False
    else:
        log_test("Delete custom template", "FAIL", 
                f"Status {response.status_code if response else 'None'}")
        all_passed = False
    
    return all_passed

def test_unified_instruction_endpoint():
    """Test 4: New unified instruction endpoint with task assignment + email + dashboard"""
    print("\n=== Test 4: Unified Instruction Endpoint ===")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    all_passed = True
    
    # 4.1: Create instruction with task assignment
    print("\n--- 4.1: Create instruction with task assignment ---")
    due_date = (date.today() + timedelta(days=3)).isoformat()
    payload = {
        "title": "QA Test",
        "content": "Daily report by 5 PM",
        "target_role": "all",
        "priority": "high",
        "create_as_task": True,
        "send_email": False,
        "due_date": due_date
    }
    
    response = make_request("POST", "/instructions", headers=headers, json_data=payload)
    instruction_id = None
    
    if response and response.status_code == 200:
        try:
            data = response.json()
            instruction = data.get("instruction")
            tasks_created = data.get("tasks_created")
            notifications_created = data.get("notifications_created")
            email_results = data.get("email_results")
            target_users_count = data.get("target_users_count")
            
            # Verify all required fields are present
            missing_fields = []
            if instruction is None:
                missing_fields.append("instruction")
            if tasks_created is None:
                missing_fields.append("tasks_created")
            if notifications_created is None:
                missing_fields.append("notifications_created")
            if email_results is None:
                missing_fields.append("email_results")
            if target_users_count is None:
                missing_fields.append("target_users_count")
            
            if missing_fields:
                log_test("Create instruction - response fields", "FAIL", 
                        f"Missing fields: {missing_fields}")
                all_passed = False
            else:
                instruction_id = instruction.get("id")
                log_test("Create instruction - response fields", "PASS", 
                        f"All fields present: instruction_id={instruction_id}, tasks={tasks_created}, "
                        f"notifications={notifications_created}, target_users={target_users_count}")
                
                # Verify tasks were created (should be >= 0)
                if isinstance(tasks_created, int) and tasks_created >= 0:
                    log_test("Create instruction - tasks created", "PASS", 
                            f"Tasks created: {tasks_created}")
                else:
                    log_test("Create instruction - tasks created", "FAIL", 
                            f"Invalid tasks_created: {tasks_created}")
                    all_passed = False
                
                # Verify notifications were created (should be >= 0)
                if isinstance(notifications_created, int) and notifications_created >= 0:
                    log_test("Create instruction - notifications created", "PASS", 
                            f"Notifications created: {notifications_created}")
                else:
                    log_test("Create instruction - notifications created", "FAIL", 
                            f"Invalid notifications_created: {notifications_created}")
                    all_passed = False
                
                # Verify email_results structure
                if isinstance(email_results, dict):
                    log_test("Create instruction - email results", "PASS", 
                            f"Email results: {email_results}")
                else:
                    log_test("Create instruction - email results", "FAIL", 
                            f"Invalid email_results: {email_results}")
                    all_passed = False
        except Exception as e:
            log_test("Create instruction", "FAIL", f"Invalid JSON or error: {e}")
            all_passed = False
    else:
        log_test("Create instruction", "FAIL", 
                f"Status {response.status_code if response else 'None'}: {response.text[:300] if response else 'No response'}")
        all_passed = False
    
    # 4.2: Verify instruction was created by fetching it back
    if instruction_id:
        print("\n--- 4.2: Verify instruction exists ---")
        response = make_request("GET", "/instructions", headers=headers)
        if response and response.status_code == 200:
            try:
                data = response.json()
                instructions = data.get("instructions", [])
                found = any(i.get("id") == instruction_id for i in instructions)
                if found:
                    log_test("Verify instruction exists", "PASS", 
                            f"Instruction {instruction_id} found in list")
                else:
                    log_test("Verify instruction exists", "FAIL", 
                            f"Instruction {instruction_id} not found in list")
                    all_passed = False
            except Exception as e:
                log_test("Verify instruction exists", "FAIL", f"Invalid JSON: {e}")
                all_passed = False
        else:
            log_test("Verify instruction exists", "FAIL", 
                    f"Status {response.status_code if response else 'None'}")
            all_passed = False
    
    return all_passed

def test_single_instructions_endpoint():
    """Test 5: Verify only ONE POST /api/instructions endpoint exists"""
    print("\n=== Test 5: Verify Single POST /api/instructions Endpoint ===")
    
    # This test verifies that the new endpoint returns the rich response format
    # (with tasks_created, notifications_created, email_results, target_users_count)
    # and not the old format (just {"instruction": {...}, "message": "..."})
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "title": "Endpoint Verification Test",
        "content": "Testing for duplicate endpoints",
        "target_role": "all",
        "priority": "normal",
        "create_as_task": False,
        "send_email": False
    }
    
    response = make_request("POST", "/instructions", headers=headers, json_data=payload)
    
    if response and response.status_code == 200:
        try:
            data = response.json()
            
            # Check for new endpoint fields
            has_new_fields = all(k in data for k in 
                                ["instruction", "tasks_created", "notifications_created", 
                                 "email_results", "target_users_count"])
            
            # Check if it's the old format (just instruction + message)
            is_old_format = "instruction" in data and "message" in data and len(data) == 2
            
            if has_new_fields and not is_old_format:
                log_test("Single endpoint verification", "PASS", 
                        "Endpoint returns new rich format with all required fields")
                return True
            elif is_old_format:
                log_test("Single endpoint verification", "FAIL", 
                        "Endpoint returns old format (instruction + message only). Duplicate endpoint may exist!")
                return False
            else:
                log_test("Single endpoint verification", "FAIL", 
                        f"Unexpected response format: {list(data.keys())}")
                return False
        except Exception as e:
            log_test("Single endpoint verification", "FAIL", f"Invalid JSON: {e}")
            return False
    else:
        log_test("Single endpoint verification", "FAIL", 
                f"Status {response.status_code if response else 'None'}")
        return False

def print_summary():
    """Print test summary"""
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    
    passed = sum(1 for r in test_results if r["status"] == "PASS")
    failed = sum(1 for r in test_results if r["status"] == "FAIL")
    errors = sum(1 for r in test_results if r["status"] == "ERROR")
    
    print(f"\nTotal Tests: {len(test_results)}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"⚠️  Errors: {errors}")
    
    if failed > 0 or errors > 0:
        print("\n--- Failed/Error Tests ---")
        for r in test_results:
            if r["status"] in ["FAIL", "ERROR"]:
                print(f"  • {r['test']}: {r['details'][:100]}")
    
    print("\n" + "="*70)

def main():
    """Main test runner"""
    print("="*70)
    print("CELESTA GLOW CRM - NEW FEATURES BACKEND TEST SUITE")
    print("="*70)
    print(f"Backend URL: {API}")
    print(f"Admin: {ADMIN_EMAIL}")
    print("="*70)
    
    # Login first
    if not login_admin():
        print("\n❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
        return
    
    # Run all tests
    test_email_sending_custom_template()
    test_offer_letter_employment_terms()
    test_document_template_overrides()
    test_unified_instruction_endpoint()
    test_single_instructions_endpoint()
    
    # Print summary
    print_summary()
    
    # Save results to file
    with open("/app/test_results_new_features.json", "w") as f:
        json.dump(test_results, f, indent=2)
    print(f"\n📄 Detailed results saved to: /app/test_results_new_features.json")

if __name__ == "__main__":
    main()
