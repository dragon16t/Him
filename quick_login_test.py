#!/usr/bin/env python3
"""
Quick login test to debug connection issues
"""

import requests
import json

BASE_URL = "https://hr-central-82.preview.emergentagent.com"
API = f"{BASE_URL}/api"

def test_login():
    print("Testing login functionality...")
    
    # Test 1: Empty credentials
    print("\n1. Testing empty credentials...")
    try:
        response = requests.post(f"{API}/auth/login", json={}, timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test 2: Non-existent email
    print("\n2. Testing non-existent email...")
    try:
        response = requests.post(f"{API}/auth/login", 
                               json={"email": "nonexistent@test.com", "password": "test123"}, 
                               timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test 3: Wrong password
    print("\n3. Testing wrong password...")
    try:
        response = requests.post(f"{API}/auth/login", 
                               json={"email": "admin@celestaglow.com", "password": "wrongpassword"}, 
                               timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test 4: Valid login
    print("\n4. Testing valid admin login...")
    try:
        response = requests.post(f"{API}/auth/login", 
                               json={"email": "admin@celestaglow.com", "password": "admin123"}, 
                               timeout=60)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            print(f"Token received: {token[:50]}..." if token else "No token")
            return token
    except Exception as e:
        print(f"Error: {e}")
    
    return None

if __name__ == "__main__":
    test_login()