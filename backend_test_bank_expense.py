#!/usr/bin/env python3
"""
Backend test for Celesta Glow CRM - Bank/Payment fields and Expense reimbursement flow
Tests the new features:
1. Bank/Payment fields on user creation (POST /api/telecallers)
2. User update with bank fields (PUT /api/users/{id}/update)
3. Expense paid_to and reimburse flow
"""

import requests
import json
import sys
from datetime import datetime

BASE_URL = "https://hr-central-82.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@celestaglow.com"
ADMIN_PASSWORD = "admin123"
DELETE_PASSWORD = "XYCDF6F@123"

# Test data tracking
created_user_id = None
created_expense_ids = []

def log(msg, level="INFO"):
    """Log test messages"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")

def login_admin():
    """Login as admin and return token"""
    log("Logging in as admin...")
    resp = requests.post(f"{BASE_URL}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        log(f"Login failed: {resp.status_code} - {resp.text}", "ERROR")
        sys.exit(1)
    token = resp.json()["token"]
    log("✓ Admin login successful")
    return token

def test_1_create_telecaller_with_bank_fields(token):
    """Test 1: Create telecaller with bank/payment fields"""
    log("\n=== TEST 1: Create Telecaller with Bank/Payment Fields ===")
    
    payload = {
        "name": "Bank Test User",
        "email": "banktest1@celestaglow.com",
        "phone": "9876543210",
        "password": "test123",
        "bank_account_name": "BANK TEST",
        "bank_account_number": "123456789012",
        "bank_ifsc": "SBIN0001234",
        "bank_name": "SBI",
        "upi_id": "banktest@sbi",
        "pan_number": "ABCDE1234F",
        "aadhaar_number": "123456789012",
        "address": "Test Address",
        "emergency_contact": "Family 9999900000",
        "dob": "1995-03-15",
        "joining_date": "2026-05-01"
    }
    
    log(f"POST /api/telecallers with bank fields...")
    resp = requests.post(
        f"{BASE_URL}/telecallers",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED: {resp.status_code} - {resp.text}", "ERROR")
        return None
    
    data = resp.json()
    user = data.get("user", {})
    user_id = user.get("id")
    
    # Verify all bank fields are present in response
    expected_fields = [
        "bank_account_name", "bank_account_number", "bank_ifsc", "bank_name",
        "upi_id", "pan_number", "aadhaar_number", "address", 
        "emergency_contact", "dob", "joining_date"
    ]
    
    missing_fields = []
    incorrect_values = []
    
    for field in expected_fields:
        if field not in user:
            missing_fields.append(field)
        elif user[field] != payload[field]:
            incorrect_values.append(f"{field}: expected '{payload[field]}', got '{user[field]}'")
    
    if missing_fields:
        log(f"✗ FAILED: Missing fields in response: {missing_fields}", "ERROR")
        return None
    
    if incorrect_values:
        log(f"✗ FAILED: Incorrect values: {incorrect_values}", "ERROR")
        return None
    
    log(f"✓ PASSED: User created with ID {user_id}")
    log(f"  - All bank/payment fields present and correct")
    log(f"  - bank_account_number: {user['bank_account_number']}")
    log(f"  - upi_id: {user['upi_id']}")
    log(f"  - pan_number: {user['pan_number']}")
    
    return user_id

def test_2_update_user_bank_fields(token, user_id):
    """Test 2: Update user bank fields"""
    log("\n=== TEST 2: Update User Bank Fields ===")
    
    if not user_id:
        log("✗ SKIPPED: No user_id from previous test", "WARN")
        return False
    
    payload = {
        "bank_account_number": "999999999999",
        "upi_id": "updated@upi"
    }
    
    log(f"PUT /api/users/{user_id}/update with updated bank fields...")
    resp = requests.put(
        f"{BASE_URL}/users/{user_id}/update",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED: {resp.status_code} - {resp.text}", "ERROR")
        return False
    
    log("✓ Update request successful")
    
    # Verify the update by fetching telecallers list
    log("Verifying update via GET /api/telecallers...")
    resp = requests.get(
        f"{BASE_URL}/telecallers",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED to fetch telecallers: {resp.status_code}", "ERROR")
        return False
    
    telecallers = resp.json().get("telecallers", [])
    user = next((u for u in telecallers if u["id"] == user_id), None)
    
    if not user:
        log(f"✗ FAILED: User {user_id} not found in telecallers list", "ERROR")
        return False
    
    if user.get("bank_account_number") != "999999999999":
        log(f"✗ FAILED: bank_account_number not updated. Expected '999999999999', got '{user.get('bank_account_number')}'", "ERROR")
        return False
    
    if user.get("upi_id") != "updated@upi":
        log(f"✗ FAILED: upi_id not updated. Expected 'updated@upi', got '{user.get('upi_id')}'", "ERROR")
        return False
    
    log("✓ PASSED: Bank fields updated successfully")
    log(f"  - bank_account_number: {user['bank_account_number']}")
    log(f"  - upi_id: {user['upi_id']}")
    
    return True

def test_3_create_expense_with_reimbursement(token):
    """Test 3: Create expense with paid_to fields (reimbursement)"""
    log("\n=== TEST 3: Create Expense with Reimbursement Fields ===")
    
    payload = {
        "title": "Test reimbursement",
        "amount": 500,
        "category": "travel",
        "description": "Driver paid from own pocket",
        "paid_to_name": "Suresh",
        "paid_to_phone": "9961012345"
    }
    
    log("POST /api/expenses with paid_to fields...")
    resp = requests.post(
        f"{BASE_URL}/expenses",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED: {resp.status_code} - {resp.text}", "ERROR")
        return None
    
    data = resp.json()
    expense = data.get("expense", {})
    expense_id = expense.get("id")
    
    # Verify paid_to fields and reimburse_status
    if expense.get("paid_to_name") != "Suresh":
        log(f"✗ FAILED: paid_to_name incorrect. Expected 'Suresh', got '{expense.get('paid_to_name')}'", "ERROR")
        return None
    
    if expense.get("paid_to_phone") != "9961012345":
        log(f"✗ FAILED: paid_to_phone incorrect. Expected '9961012345', got '{expense.get('paid_to_phone')}'", "ERROR")
        return None
    
    if expense.get("reimburse_status") != "to_be_paid":
        log(f"✗ FAILED: reimburse_status incorrect. Expected 'to_be_paid', got '{expense.get('reimburse_status')}'", "ERROR")
        return None
    
    log(f"✓ PASSED: Expense created with ID {expense_id}")
    log(f"  - paid_to_name: {expense['paid_to_name']}")
    log(f"  - paid_to_phone: {expense['paid_to_phone']}")
    log(f"  - reimburse_status: {expense['reimburse_status']}")
    
    return expense_id

def test_4_update_expense_paid_to(token, expense_id):
    """Test 4: Update expense paid_to fields"""
    log("\n=== TEST 4: Update Expense paid_to Fields ===")
    
    if not expense_id:
        log("✗ SKIPPED: No expense_id from previous test", "WARN")
        return False
    
    payload = {
        "description": "Updated description",
        "paid_to_name": "Suresh Pillai"
    }
    
    log(f"PUT /api/expenses/{expense_id} with updated paid_to_name...")
    resp = requests.put(
        f"{BASE_URL}/expenses/{expense_id}",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED: {resp.status_code} - {resp.text}", "ERROR")
        return False
    
    data = resp.json()
    expense = data.get("expense", {})
    
    if expense.get("paid_to_name") != "Suresh Pillai":
        log(f"✗ FAILED: paid_to_name not updated. Expected 'Suresh Pillai', got '{expense.get('paid_to_name')}'", "ERROR")
        return False
    
    if expense.get("description") != "Updated description":
        log(f"✗ FAILED: description not updated. Expected 'Updated description', got '{expense.get('description')}'", "ERROR")
        return False
    
    # reimburse_status should still be "to_be_paid"
    if expense.get("reimburse_status") != "to_be_paid":
        log(f"✗ FAILED: reimburse_status changed unexpectedly. Expected 'to_be_paid', got '{expense.get('reimburse_status')}'", "ERROR")
        return False
    
    log("✓ PASSED: Expense updated successfully")
    log(f"  - paid_to_name: {expense['paid_to_name']}")
    log(f"  - description: {expense['description']}")
    log(f"  - reimburse_status: {expense['reimburse_status']}")
    
    return True

def test_5_mark_expense_paid(token, expense_id):
    """Test 5: Mark expense as paid (reimbursed)"""
    log("\n=== TEST 5: Mark Expense as Paid ===")
    
    if not expense_id:
        log("✗ SKIPPED: No expense_id from previous test", "WARN")
        return False
    
    payload = {
        "method": "cash"
    }
    
    log(f"PUT /api/expenses/{expense_id}/mark-paid...")
    resp = requests.put(
        f"{BASE_URL}/expenses/{expense_id}/mark-paid",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED: {resp.status_code} - {resp.text}", "ERROR")
        return False
    
    log("✓ Mark-paid request successful")
    
    # Verify by fetching expenses list
    log("Verifying via GET /api/expenses...")
    resp = requests.get(
        f"{BASE_URL}/expenses",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED to fetch expenses: {resp.status_code}", "ERROR")
        return False
    
    expenses = resp.json().get("expenses", [])
    expense = next((e for e in expenses if e["id"] == expense_id), None)
    
    if not expense:
        log(f"✗ FAILED: Expense {expense_id} not found", "ERROR")
        return False
    
    if expense.get("reimburse_status") != "paid":
        log(f"✗ FAILED: reimburse_status not updated. Expected 'paid', got '{expense.get('reimburse_status')}'", "ERROR")
        return False
    
    if not expense.get("reimbursed_at"):
        log(f"✗ FAILED: reimbursed_at timestamp not set", "ERROR")
        return False
    
    if expense.get("reimburse_method") != "cash":
        log(f"✗ FAILED: reimburse_method incorrect. Expected 'cash', got '{expense.get('reimburse_method')}'", "ERROR")
        return False
    
    log("✓ PASSED: Expense marked as paid successfully")
    log(f"  - reimburse_status: {expense['reimburse_status']}")
    log(f"  - reimbursed_at: {expense['reimbursed_at']}")
    log(f"  - reimburse_method: {expense['reimburse_method']}")
    
    return True

def test_6_expense_without_paid_to(token):
    """Test 6: Create regular expense without paid_to fields"""
    log("\n=== TEST 6: Create Regular Expense (no reimbursement) ===")
    
    payload = {
        "title": "Regular office expense",
        "amount": 300,
        "category": "office",
        "description": "Office supplies"
    }
    
    log("POST /api/expenses without paid_to fields...")
    resp = requests.post(
        f"{BASE_URL}/expenses",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED: {resp.status_code} - {resp.text}", "ERROR")
        return None
    
    data = resp.json()
    expense = data.get("expense", {})
    expense_id = expense.get("id")
    
    # Verify reimburse_status is empty
    if expense.get("reimburse_status") != "":
        log(f"✗ FAILED: reimburse_status should be empty. Got '{expense.get('reimburse_status')}'", "ERROR")
        return None
    
    if expense.get("paid_to_name"):
        log(f"✗ FAILED: paid_to_name should be empty. Got '{expense.get('paid_to_name')}'", "ERROR")
        return None
    
    log(f"✓ PASSED: Regular expense created with ID {expense_id}")
    log(f"  - reimburse_status: (empty)")
    log(f"  - paid_to_name: (empty)")
    
    return expense_id

def test_7_user_creation_without_bank_fields(token):
    """Test 7: Create user without bank fields (backward compatibility)"""
    log("\n=== TEST 7: Create User Without Bank Fields (Backward Compatibility) ===")
    
    payload = {
        "name": "Simple Test User",
        "email": "simpletest@celestaglow.com",
        "phone": "9876543211",
        "password": "test123"
    }
    
    log("POST /api/telecallers without bank fields...")
    resp = requests.post(
        f"{BASE_URL}/telecallers",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    if resp.status_code != 200:
        log(f"✗ FAILED: {resp.status_code} - {resp.text}", "ERROR")
        return None
    
    data = resp.json()
    user = data.get("user", {})
    user_id = user.get("id")
    
    # Verify user created successfully with empty bank fields
    if not user_id:
        log(f"✗ FAILED: User not created", "ERROR")
        return None
    
    log(f"✓ PASSED: User created without bank fields with ID {user_id}")
    log(f"  - bank_account_number: '{user.get('bank_account_number', '')}'")
    log(f"  - upi_id: '{user.get('upi_id', '')}'")
    
    return user_id

def cleanup(token, user_ids, expense_ids):
    """Cleanup test data"""
    log("\n=== CLEANUP: Deleting Test Data ===")
    
    # Delete test users
    for user_id in user_ids:
        if user_id:
            log(f"Deleting user {user_id}...")
            resp = requests.delete(
                f"{BASE_URL}/users/{user_id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"password": DELETE_PASSWORD}
            )
            if resp.status_code == 200:
                log(f"✓ User {user_id} deleted")
            else:
                log(f"✗ Failed to delete user {user_id}: {resp.status_code}", "WARN")
    
    # Note: Expenses don't have a delete endpoint, so we'll leave them
    # They can be manually cleaned up if needed
    if expense_ids:
        log(f"Note: {len(expense_ids)} test expenses created (no delete endpoint available)")

def main():
    """Run all tests"""
    log("=" * 70)
    log("CELESTA GLOW CRM - BANK/PAYMENT & EXPENSE REIMBURSEMENT TESTS")
    log("=" * 70)
    
    try:
        # Login
        token = login_admin()
        
        # Track created resources
        user_ids = []
        expense_ids = []
        
        # Test 1: Create telecaller with bank fields
        user_id_1 = test_1_create_telecaller_with_bank_fields(token)
        if user_id_1:
            user_ids.append(user_id_1)
        
        # Test 2: Update user bank fields
        test_2_update_user_bank_fields(token, user_id_1)
        
        # Test 3: Create expense with reimbursement
        expense_id_1 = test_3_create_expense_with_reimbursement(token)
        if expense_id_1:
            expense_ids.append(expense_id_1)
        
        # Test 4: Update expense paid_to
        test_4_update_expense_paid_to(token, expense_id_1)
        
        # Test 5: Mark expense as paid
        test_5_mark_expense_paid(token, expense_id_1)
        
        # Test 6: Regular expense without paid_to
        expense_id_2 = test_6_expense_without_paid_to(token)
        if expense_id_2:
            expense_ids.append(expense_id_2)
        
        # Test 7: User creation without bank fields
        user_id_2 = test_7_user_creation_without_bank_fields(token)
        if user_id_2:
            user_ids.append(user_id_2)
        
        # Cleanup
        cleanup(token, user_ids, expense_ids)
        
        log("\n" + "=" * 70)
        log("ALL TESTS COMPLETED")
        log("=" * 70)
        
    except Exception as e:
        log(f"Test suite failed with exception: {e}", "ERROR")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
