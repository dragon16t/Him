#!/usr/bin/env python3
"""
Test ship order functionality specifically
"""

import requests
import json

BASE_URL = "https://hr-central-82.preview.emergentagent.com"
API = f"{BASE_URL}/api"

def test_ship_order():
    # Login first
    response = requests.post(f"{API}/auth/login", 
                           json={"email": "admin@celestaglow.com", "password": "admin123"}, 
                           timeout=60)
    
    if response.status_code != 200:
        print("Login failed")
        return
    
    token = response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create a test order first
    order_data = {
        "customer_name": "Ship Test Customer",
        "customer_phone": "9876543210",
        "customer_address": "Ship Test Address, Test City",
        "customer_city": "Test City",
        "customer_state": "Kerala",
        "customer_pincode": "682001",
        "items": [{"product_name": "Test Product", "quantity": 1, "price": 100}],
        "total_amount": 100,
        "payment_type": "cod"
    }
    
    response = requests.post(f"{API}/orders", headers=headers, json=order_data, timeout=60)
    print(f"Create order: {response.status_code} - {response.text}")
    
    if response.status_code not in [200, 201]:
        print("Failed to create order")
        return
    
    order_id = response.json().get("order", {}).get("id")
    print(f"Created order: {order_id}")
    
    # Try to ship the order
    ship_data = {
        "tracking_link": "https://test-tracking.com/123",
        "courier_name": "Test Courier"
    }
    
    response = requests.put(f"{API}/orders/{order_id}/ship", headers=headers, json=ship_data, timeout=60)
    print(f"Ship order: {response.status_code} - {response.text}")

if __name__ == "__main__":
    test_ship_order()