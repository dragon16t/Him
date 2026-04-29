#!/usr/bin/env python3
"""
Celesta Glow CRM Backend Test Suite
Testing specific requirements from review request:
1. Login error messages
2. System wiped state
3. Order edit permissions
4. Cascade delete
5. Hard Reset endpoints
6. Instant Wipe
"""

import requests
import json
import uuid
from datetime import datetime, timezone

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
    print(f"[{status}] {test_name}: {details}")

def make_request(method, endpoint, headers=None, json_data=None, expected_status=None):
    """Make HTTP request and return response"""
    url = f"{API}{endpoint}"
    try:
        response = requests.request(method, url, headers=headers, json=json_data, timeout=60)
        if expected_status and response.status_code != expected_status:
            log_test(f"{method} {endpoint}", "FAIL", 
                    f"Expected {expected_status}, got {response.status_code}: {response.text[:200]}")
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

def test_login_error_messages():
    """Test 1: Login error messages"""
    print("\n=== Testing Login Error Messages ===")
    
    # Test 1.1: Empty email/password → expect 400
    response = make_request("POST", "/auth/login", json_data={})
    if response and response.status_code == 400:
        log_test("Login empty credentials", "PASS", "Got 400 as expected")
    else:
        log_test("Login empty credentials", "FAIL", 
                f"Expected 400, got {response.status_code if response else 'None'}")
    
    # Test 1.2: Non-existent email → expect 404 with specific message
    response = make_request("POST", "/auth/login", 
                          json_data={"email": "nonexistent@test.com", "password": "test123"})
    if response and response.status_code == 404:
        try:
            data = response.json()
            if data.get("detail") == "No account found with this email":
                log_test("Login non-existent email", "PASS", "Got 404 with correct message")
            else:
                log_test("Login non-existent email", "FAIL", 
                        f"Got 404 but wrong message: {data.get('detail')}")
        except:
            log_test("Login non-existent email", "FAIL", "Got 404 but invalid JSON response")
    else:
        log_test("Login non-existent email", "FAIL", 
                f"Expected 404, got {response.status_code if response else 'None'}")
    
    # Test 1.3: Wrong password for existing user → expect 401 with specific message
    response = make_request("POST", "/auth/login", 
                          json_data={"email": ADMIN_EMAIL, "password": "wrongpassword"})
    if response and response.status_code == 401:
        try:
            data = response.json()
            if data.get("detail") == "Password entered is wrong":
                log_test("Login wrong password", "PASS", "Got 401 with correct message")
            else:
                log_test("Login wrong password", "FAIL", 
                        f"Got 401 but wrong message: {data.get('detail')}")
        except:
            log_test("Login wrong password", "FAIL", "Got 401 but invalid JSON response")
    else:
        log_test("Login wrong password", "FAIL", 
                f"Expected 401, got {response.status_code if response else 'None'}")
    
    # Test 1.4: Valid admin login → expect 200 with token + user object with role="admin"
    response = make_request("POST", "/auth/login", 
                          json_data={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response and response.status_code == 200:
        try:
            data = response.json()
            if "token" in data and "user" in data and data["user"].get("role") == "admin":
                global admin_token
                admin_token = data["token"]
                log_test("Admin login", "PASS", "Got 200 with token and admin role")
            else:
                log_test("Admin login", "FAIL", 
                        f"Got 200 but missing token/user/role: {list(data.keys())}")
        except:
            log_test("Admin login", "FAIL", "Got 200 but invalid JSON response")
    else:
        log_test("Admin login", "FAIL", 
                f"Expected 200, got {response.status_code if response else 'None'}")

def test_system_wiped_state():
    """Test 2: System wiped state"""
    print("\n=== Testing System Wiped State ===")
    
    if not admin_token:
        log_test("System wiped state", "SKIP", "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Check various user endpoints to see if only admin exists
    user_endpoints = [
        ("/all-users", "all users"),
        ("/telecallers", "telecallers"),
        ("/agents", "agents"),
        ("/sales-managers", "sales managers"),
        ("/managers", "district managers"),
        ("/hr-managers", "hr managers")
    ]
    
    for endpoint, description in user_endpoints:
        response = make_request("GET", endpoint, headers=headers)
        if response and response.status_code == 200:
            try:
                data = response.json()
                # Handle different response formats
                users = data if isinstance(data, list) else data.get("users", data.get("items", []))
                
                if endpoint == "/all-users":
                    # Should only have admin users
                    admin_users = [u for u in users if u.get("role") == "admin"]
                    non_admin_users = [u for u in users if u.get("role") != "admin"]
                    
                    if len(admin_users) >= 1 and len(non_admin_users) == 0:
                        log_test(f"System wiped - {description}", "PASS", 
                                f"Only {len(admin_users)} admin(s), no other users")
                    else:
                        log_test(f"System wiped - {description}", "FAIL", 
                                f"Found {len(admin_users)} admin(s) and {len(non_admin_users)} other users")
                else:
                    # Other endpoints should be empty
                    if len(users) == 0:
                        log_test(f"System wiped - {description}", "PASS", "No users found")
                    else:
                        log_test(f"System wiped - {description}", "FAIL", 
                                f"Found {len(users)} users when expecting 0")
            except Exception as e:
                log_test(f"System wiped - {description}", "ERROR", f"JSON parse error: {str(e)}")
        else:
            log_test(f"System wiped - {description}", "FAIL", 
                    f"Expected 200, got {response.status_code if response else 'None'}")

def test_order_edit_permissions():
    """Test 3: Order edit permissions"""
    print("\n=== Testing Order Edit Permissions ===")
    
    if not admin_token:
        log_test("Order edit permissions", "SKIP", "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # First, create test users if system is wiped
    test_telecaller_id = None
    test_agent_id = None
    test_dm_id = None
    test_sm_id = None
    test_inv_id = None
    
    # Create test telecaller
    telecaller_data = {
        "email": f"test_tc_{uuid.uuid4().hex[:6]}@test.com",
        "password": "test123",
        "name": "Test Telecaller",
        "role": "telecaller",
        "phone": "9999999999",
        "salary": 15000
    }
    
    response = make_request("POST", "/hr/add-employee", headers=headers, json_data=telecaller_data)
    if response and response.status_code in [200, 201]:
        try:
            data = response.json()
            test_telecaller_id = data.get("id") or data.get("user", {}).get("id")
            log_test("Create test telecaller", "PASS", f"Created telecaller: {test_telecaller_id}")
        except:
            log_test("Create test telecaller", "FAIL", "Invalid response format")
    else:
        log_test("Create test telecaller", "FAIL", 
                f"Expected 200/201, got {response.status_code if response else 'None'}")
    
    # Create test agent
    agent_data = {
        "email": f"test_agent_{uuid.uuid4().hex[:6]}@test.com",
        "password": "test123",
        "name": "Test Agent",
        "role": "agent",
        "phone": "9999999998",
        "salary": 12000
    }
    
    response = make_request("POST", "/hr/add-employee", headers=headers, json_data=agent_data)
    if response and response.status_code in [200, 201]:
        try:
            data = response.json()
            test_agent_id = data.get("id") or data.get("user", {}).get("id")
            log_test("Create test agent", "PASS", f"Created agent: {test_agent_id}")
        except:
            log_test("Create test agent", "FAIL", "Invalid response format")
    
    # Create a test order
    order_data = {
        "customer_name": "Test Customer",
        "customer_phone": "9876543210",
        "customer_address": "Test Address, Test City",
        "customer_city": "Test City",
        "customer_state": "Kerala",
        "customer_pincode": "682001",
        "items": [{"product_name": "Test Product", "quantity": 1, "price": 100}],
        "total_amount": 100,
        "payment_type": "cod"
    }
    
    if test_telecaller_id:
        order_data["assigned_to"] = test_telecaller_id
    
    response = make_request("POST", "/orders", headers=headers, json_data=order_data)
    test_order_id = None
    if response and response.status_code in [200, 201]:
        try:
            data = response.json()
            test_order_id = data.get("order", {}).get("id") or data.get("id")
            log_test("Create test order", "PASS", f"Created order: {test_order_id}")
        except:
            log_test("Create test order", "FAIL", "Invalid response format")
    else:
        log_test("Create test order", "FAIL", 
                f"Expected 200/201, got {response.status_code if response else 'None'}")
    
    if not test_order_id:
        log_test("Order edit permissions", "SKIP", "No test order created")
        return
    
    # Test editing order in pending state (should work)
    edit_data = {"customer_name": "Updated Customer Name"}
    response = make_request("PUT", f"/orders/{test_order_id}", headers=headers, json_data=edit_data)
    if response and response.status_code in [200, 204]:
        log_test("Edit pending order", "PASS", "Successfully edited pending order")
    else:
        log_test("Edit pending order", "FAIL", 
                f"Expected 200/204, got {response.status_code if response else 'None'}")
    
    # Change order status to shipped
    # First approve the order
    response = make_request("PUT", f"/orders/{test_order_id}/approve", headers=headers)
    if response and response.status_code in [200, 204]:
        log_test("Approve order", "PASS", "Successfully approved order")
        
        # Now ship the order
        ship_data = {
            "tracking_link": "https://test-tracking.com/123",
            "courier_name": "Test Courier"
        }
        response = make_request("PUT", f"/orders/{test_order_id}/ship", headers=headers, json_data=ship_data)
        if response and response.status_code in [200, 204]:
            log_test("Ship order", "PASS", "Successfully shipped order")
            
            # Now try to edit shipped order (should fail with 403)
            response = make_request("PUT", f"/orders/{test_order_id}", headers=headers, json_data=edit_data)
            if response and response.status_code == 403:
                try:
                    data = response.json()
                    if "locked" in data.get("detail", "").lower():
                        log_test("Edit shipped order", "PASS", "Got 403 with locked message")
                    else:
                        log_test("Edit shipped order", "FAIL", 
                                f"Got 403 but wrong message: {data.get('detail')}")
                except:
                    log_test("Edit shipped order", "FAIL", "Got 403 but invalid JSON")
            else:
                log_test("Edit shipped order", "FAIL", 
                        f"Expected 403, got {response.status_code if response else 'None'}")
        else:
            log_test("Ship order", "FAIL", 
                    f"Expected 200/204, got {response.status_code if response else 'None'}")
    else:
        log_test("Approve order", "FAIL", 
                f"Expected 200/204, got {response.status_code if response else 'None'}")

def test_cascade_delete():
    """Test 4: Cascade delete"""
    print("\n=== Testing Cascade Delete ===")
    
    if not admin_token:
        log_test("Cascade delete", "SKIP", "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Create test district manager
    dm_data = {
        "email": f"test_dm_{uuid.uuid4().hex[:6]}@test.com",
        "password": "test123",
        "name": "Test District Manager",
        "role": "district_manager",
        "phone": "9999999997",
        "salary": 25000
    }
    
    response = make_request("POST", "/hr/add-employee", headers=headers, json_data=dm_data)
    test_dm_id = None
    if response and response.status_code in [200, 201]:
        try:
            data = response.json()
            test_dm_id = data.get("id") or data.get("user", {}).get("id")
            log_test("Create test DM", "PASS", f"Created DM: {test_dm_id}")
        except:
            log_test("Create test DM", "FAIL", "Invalid response format")
    
    if not test_dm_id:
        log_test("Cascade delete", "SKIP", "No test DM created")
        return
    
    # Create test agent under DM
    agent_data = {
        "email": f"test_agent_cascade_{uuid.uuid4().hex[:6]}@test.com",
        "password": "test123",
        "name": "Test Agent Cascade",
        "role": "agent",
        "phone": "9999999996",
        "salary": 12000,
        "managed_by": test_dm_id
    }
    
    response = make_request("POST", "/hr/add-employee", headers=headers, json_data=agent_data)
    test_agent_id = None
    if response and response.status_code in [200, 201]:
        try:
            data = response.json()
            test_agent_id = data.get("id") or data.get("user", {}).get("id")
            log_test("Create test agent under DM", "PASS", f"Created agent: {test_agent_id}")
        except:
            log_test("Create test agent under DM", "FAIL", "Invalid response format")
    
    # Create test order from agent
    if test_agent_id:
        # Login as the agent to create the order
        agent_login_response = make_request("POST", "/auth/login", 
                                          json_data={"email": agent_data["email"], "password": "test123"})
        if agent_login_response and agent_login_response.status_code == 200:
            agent_token = agent_login_response.json()["token"]
            agent_headers = {"Authorization": f"Bearer {agent_token}"}
            
            order_data = {
                "customer_name": "Cascade Test Customer",
                "customer_phone": "9876543209",
                "customer_address": "Cascade Test Address",
                "customer_city": "Test City",
                "items": [{"product_name": "Test Product", "quantity": 1, "price": 150}],
                "total_amount": 150,
                "payment_type": "cod"
            }
            
            response = make_request("POST", "/orders", headers=agent_headers, json_data=order_data)
            if response and response.status_code in [200, 201]:
                log_test("Create order from agent", "PASS", "Created order from agent")
            else:
                log_test("Create order from agent", "FAIL", 
                        f"Expected 200/201, got {response.status_code if response else 'None'}")
        else:
            log_test("Agent login for order", "FAIL", "Could not login as agent")
    else:
        log_test("Create order from agent", "SKIP", "No agent created")
    
    # Now delete the district manager with cascade
    delete_data = {"password": MASTER_DELETE_PASSWORD}
    response = make_request("DELETE", f"/users/{test_dm_id}", headers=headers, json_data=delete_data)
    
    if response and response.status_code in [200, 204]:
        try:
            data = response.json()
            cascade_counts = data.get("cascade_counts", {})
            deleted_email = data.get("deleted_email")
            
            if cascade_counts.get("users", 0) > 0:
                log_test("Cascade delete users", "PASS", 
                        f"Deleted {cascade_counts.get('users')} users in cascade")
            else:
                log_test("Cascade delete users", "FAIL", "No users deleted in cascade")
            
            if cascade_counts.get("orders", 0) > 0:
                log_test("Cascade delete orders", "PASS", 
                        f"Deleted {cascade_counts.get('orders')} orders in cascade")
            else:
                log_test("Cascade delete orders", "FAIL", "No orders deleted in cascade")
            
            if deleted_email:
                log_test("Email tombstoned", "PASS", f"Email tombstoned: {deleted_email}")
            else:
                log_test("Email tombstoned", "FAIL", "No deleted email returned")
                
        except Exception as e:
            log_test("Cascade delete response", "ERROR", f"JSON parse error: {str(e)}")
    else:
        log_test("Cascade delete", "FAIL", 
                f"Expected 200/204, got {response.status_code if response else 'None'}")

def test_hard_reset_endpoints():
    """Test 5: Hard Reset endpoints"""
    print("\n=== Testing Hard Reset Endpoints ===")
    
    if not admin_token:
        log_test("Hard reset endpoints", "SKIP", "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test scheduling hard reset
    reset_data = {"password": MASTER_HARD_RESET_PASSWORD}
    response = make_request("POST", "/admin/hard-reset", headers=headers, json_data=reset_data)
    
    if response and response.status_code == 200:
        try:
            data = response.json()
            if "execute_at" in data:
                log_test("Schedule hard reset", "PASS", f"Scheduled for: {data['execute_at']}")
            else:
                log_test("Schedule hard reset", "FAIL", "No execute_at in response")
        except:
            log_test("Schedule hard reset", "FAIL", "Invalid JSON response")
    else:
        log_test("Schedule hard reset", "FAIL", 
                f"Expected 200, got {response.status_code if response else 'None'}")
    
    # Test getting hard reset status
    response = make_request("GET", "/admin/hard-reset/status", headers=headers)
    
    if response and response.status_code == 200:
        try:
            data = response.json()
            if data.get("pending") is True and "execute_at" in data:
                log_test("Hard reset status", "PASS", "Status shows pending with execute_at")
            else:
                log_test("Hard reset status", "FAIL", 
                        f"Unexpected status: pending={data.get('pending')}, execute_at present={('execute_at' in data)}")
        except:
            log_test("Hard reset status", "FAIL", "Invalid JSON response")
    else:
        log_test("Hard reset status", "FAIL", 
                f"Expected 200, got {response.status_code if response else 'None'}")
    
    # Test canceling hard reset
    response = make_request("POST", "/admin/hard-reset/cancel", headers=headers)
    
    if response and response.status_code == 200:
        try:
            data = response.json()
            if "cancelled" in data.get("message", "").lower():
                log_test("Cancel hard reset", "PASS", "Successfully cancelled")
            else:
                log_test("Cancel hard reset", "PASS", f"Response: {data.get('message')}")
        except:
            log_test("Cancel hard reset", "FAIL", "Invalid JSON response")
    else:
        log_test("Cancel hard reset", "FAIL", 
                f"Expected 200, got {response.status_code if response else 'None'}")
    
    # Verify cancellation
    response = make_request("GET", "/admin/hard-reset/status", headers=headers)
    
    if response and response.status_code == 200:
        try:
            data = response.json()
            if data.get("pending") is False:
                log_test("Verify cancellation", "PASS", "Status shows not pending")
            else:
                log_test("Verify cancellation", "FAIL", "Status still shows pending")
        except:
            log_test("Verify cancellation", "FAIL", "Invalid JSON response")

def test_instant_wipe():
    """Test 6: Instant Wipe"""
    print("\n=== Testing Instant Wipe ===")
    
    if not admin_token:
        log_test("Instant wipe", "SKIP", "No admin token available")
        return
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Test instant wipe
    wipe_data = {"password": MASTER_HARD_RESET_PASSWORD}
    response = make_request("POST", "/admin/instant-wipe", headers=headers, json_data=wipe_data)
    
    if response and response.status_code == 200:
        try:
            data = response.json()
            if "wiped_at" in data:
                log_test("Instant wipe", "PASS", f"Wiped at: {data['wiped_at']}")
            else:
                log_test("Instant wipe", "PASS", f"Response: {data.get('message')}")
        except:
            log_test("Instant wipe", "FAIL", "Invalid JSON response")
    else:
        log_test("Instant wipe", "FAIL", 
                f"Expected 200, got {response.status_code if response else 'None'}")
    
    # Verify system_wiped flag is set by checking if only admin users exist
    response = make_request("GET", "/all-users", headers=headers)
    if response and response.status_code == 200:
        try:
            data = response.json()
            users = data if isinstance(data, list) else data.get("users", [])
            non_admin_users = [u for u in users if u.get("role") != "admin"]
            
            if len(non_admin_users) == 0:
                log_test("Verify instant wipe", "PASS", "Only admin users remain")
            else:
                log_test("Verify instant wipe", "FAIL", 
                        f"Found {len(non_admin_users)} non-admin users after wipe")
        except:
            log_test("Verify instant wipe", "FAIL", "Invalid JSON response")

def run_all_tests():
    """Run all tests in sequence"""
    print("Starting Celesta Glow CRM Backend Tests")
    print(f"Backend URL: {BASE_URL}")
    print(f"API Endpoint: {API}")
    print("=" * 60)
    
    test_login_error_messages()
    test_system_wiped_state()
    test_order_edit_permissions()
    test_cascade_delete()
    test_hard_reset_endpoints()
    test_instant_wipe()
    
    # Print summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = len([r for r in test_results if r["status"] == "PASS"])
    failed = len([r for r in test_results if r["status"] == "FAIL"])
    errors = len([r for r in test_results if r["status"] == "ERROR"])
    skipped = len([r for r in test_results if r["status"] == "SKIP"])
    
    print(f"Total Tests: {len(test_results)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Errors: {errors}")
    print(f"Skipped: {skipped}")
    
    if failed > 0 or errors > 0:
        print("\nFAILED/ERROR TESTS:")
        for result in test_results:
            if result["status"] in ["FAIL", "ERROR"]:
                print(f"  [{result['status']}] {result['test']}: {result['details']}")
    
    print("\nDetailed results saved to test_results variable")
    return test_results

if __name__ == "__main__":
    results = run_all_tests()