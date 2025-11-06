#!/usr/bin/env python3
"""
Comprehensive Backend Test Suite for Agenda TTI
Tests all API endpoints with proper authentication and role-based permissions
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment
BACKEND_URL = os.getenv('EXPO_PUBLIC_BACKEND_URL', 'https://rentalcalendar-1.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

print(f"Testing backend at: {API_BASE}")

class AgendaTTITester:
    def __init__(self):
        self.session = requests.Session()
        self.proprietario_token = None
        self.corretor_token = None
        self.test_house_id = None
        self.test_proposal_id = None
        self.results = {
            'passed': 0,
            'failed': 0,
            'errors': []
        }
    
    def log_result(self, test_name, success, message=""):
        if success:
            print(f"✅ {test_name}")
            self.results['passed'] += 1
        else:
            print(f"❌ {test_name}: {message}")
            self.results['failed'] += 1
            self.results['errors'].append(f"{test_name}: {message}")
    
    def make_request(self, method, endpoint, data=None, token=None, expected_status=200):
        """Make HTTP request with proper error handling"""
        url = f"{API_BASE}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, headers=headers)
            elif method.upper() == 'POST':
                response = self.session.post(url, headers=headers, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, headers=headers, json=data)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url, headers=headers)
            
            return response
        except Exception as e:
            print(f"Request error: {str(e)}")
            return None
    
    def test_auth_register(self):
        """Test user registration for both roles"""
        print("\n=== Testing Authentication - Register ===")
        
        # Test proprietário registration
        proprietario_data = {
            "email": "dono@test.com",
            "password": "senha123",
            "name": "João Proprietário",
            "role": "proprietario"
        }
        
        response = self.make_request('POST', '/auth/register', proprietario_data)
        if response and response.status_code in [200, 201]:
            data = response.json()
            if 'access_token' in data and data['user']['role'] == 'proprietario':
                self.proprietario_token = data['access_token']
                self.log_result("Register Proprietário", True)
            else:
                self.log_result("Register Proprietário", False, "Invalid response format")
        else:
            # User might already exist, try login
            login_response = self.make_request('POST', '/auth/login', {
                "email": "dono@test.com",
                "password": "senha123"
            })
            if login_response and login_response.status_code == 200:
                data = login_response.json()
                self.proprietario_token = data['access_token']
                self.log_result("Register Proprietário (existing user)", True)
            else:
                self.log_result("Register Proprietário", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test corretor registration
        corretor_data = {
            "email": "corretor@test.com",
            "password": "senha123",
            "name": "Maria Corretora",
            "role": "corretor"
        }
        
        response = self.make_request('POST', '/auth/register', corretor_data)
        if response and response.status_code in [200, 201]:
            data = response.json()
            if 'access_token' in data and data['user']['role'] == 'corretor':
                self.corretor_token = data['access_token']
                self.log_result("Register Corretor", True)
            else:
                self.log_result("Register Corretor", False, "Invalid response format")
        else:
            # User might already exist, try login
            login_response = self.make_request('POST', '/auth/login', {
                "email": "corretor@test.com",
                "password": "senha123"
            })
            if login_response and login_response.status_code == 200:
                data = login_response.json()
                self.corretor_token = data['access_token']
                self.log_result("Register Corretor (existing user)", True)
            else:
                self.log_result("Register Corretor", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_auth_login(self):
        """Test user login"""
        print("\n=== Testing Authentication - Login ===")
        
        # Test proprietário login
        login_data = {
            "email": "dono@test.com",
            "password": "senha123"
        }
        
        response = self.make_request('POST', '/auth/login', login_data)
        if response and response.status_code == 200:
            data = response.json()
            if 'access_token' in data:
                self.proprietario_token = data['access_token']
                self.log_result("Login Proprietário", True)
            else:
                self.log_result("Login Proprietário", False, "No access token in response")
        else:
            self.log_result("Login Proprietário", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test corretor login
        login_data = {
            "email": "corretor@test.com",
            "password": "senha123"
        }
        
        response = self.make_request('POST', '/auth/login', login_data)
        if response and response.status_code == 200:
            data = response.json()
            if 'access_token' in data:
                self.corretor_token = data['access_token']
                self.log_result("Login Corretor", True)
            else:
                self.log_result("Login Corretor", False, "No access token in response")
        else:
            self.log_result("Login Corretor", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_auth_me(self):
        """Test get current user info"""
        print("\n=== Testing Authentication - Me ===")
        
        # Test proprietário me
        if self.proprietario_token:
            response = self.make_request('GET', '/auth/me', token=self.proprietario_token)
            if response and response.status_code == 200:
                data = response.json()
                if data.get('role') == 'proprietario':
                    self.log_result("Auth Me Proprietário", True)
                else:
                    self.log_result("Auth Me Proprietário", False, "Wrong role returned")
            else:
                self.log_result("Auth Me Proprietário", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test corretor me
        if self.corretor_token:
            response = self.make_request('GET', '/auth/me', token=self.corretor_token)
            if response and response.status_code == 200:
                data = response.json()
                if data.get('role') == 'corretor':
                    self.log_result("Auth Me Corretor", True)
                else:
                    self.log_result("Auth Me Corretor", False, "Wrong role returned")
            else:
                self.log_result("Auth Me Corretor", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_houses_create(self):
        """Test house creation"""
        print("\n=== Testing Houses - Create ===")
        
        # Test proprietário can create house
        if self.proprietario_token:
            house_data = {
                "name": "Casa de Teste",
                "description": "Uma bela casa para locação de temporada",
                "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
            }
            
            response = self.make_request('POST', '/houses', house_data, token=self.proprietario_token)
            if response and response.status_code in [200, 201]:
                data = response.json()
                if 'id' in data:
                    self.test_house_id = data['id']
                    self.log_result("Create House (Proprietário)", True)
                else:
                    self.log_result("Create House (Proprietário)", False, "No house ID returned")
            else:
                self.log_result("Create House (Proprietário)", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test corretor cannot create house
        if self.corretor_token:
            house_data = {
                "name": "Casa Inválida",
                "description": "Corretor não deveria conseguir criar",
                "image": "data:image/jpeg;base64,test"
            }
            
            response = self.make_request('POST', '/houses', house_data, token=self.corretor_token)
            if response and response.status_code == 403:
                self.log_result("Create House Forbidden (Corretor)", True)
            else:
                self.log_result("Create House Forbidden (Corretor)", False, f"Expected 403, got: {response.status_code if response else 'No response'}")
    
    def test_houses_list(self):
        """Test listing houses"""
        print("\n=== Testing Houses - List ===")
        
        # Test proprietário list houses
        if self.proprietario_token:
            response = self.make_request('GET', '/houses', token=self.proprietario_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("List Houses (Proprietário)", True)
                else:
                    self.log_result("List Houses (Proprietário)", False, "Response is not a list")
            else:
                self.log_result("List Houses (Proprietário)", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test corretor list houses (should be empty initially)
        if self.corretor_token:
            response = self.make_request('GET', '/houses', token=self.corretor_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("List Houses (Corretor)", True)
                else:
                    self.log_result("List Houses (Corretor)", False, "Response is not a list")
            else:
                self.log_result("List Houses (Corretor)", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_houses_get_details(self):
        """Test getting house details"""
        print("\n=== Testing Houses - Get Details ===")
        
        if self.test_house_id and self.proprietario_token:
            response = self.make_request('GET', f'/houses/{self.test_house_id}', token=self.proprietario_token)
            if response and response.status_code == 200:
                data = response.json()
                if 'id' in data and data['id'] == self.test_house_id:
                    self.log_result("Get House Details (Proprietário)", True)
                else:
                    self.log_result("Get House Details (Proprietário)", False, "Invalid house data")
            else:
                self.log_result("Get House Details (Proprietário)", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_houses_share(self):
        """Test sharing house with corretor"""
        print("\n=== Testing Houses - Share ===")
        
        if self.test_house_id and self.proprietario_token:
            share_data = {
                "email": "corretor@test.com"
            }
            
            response = self.make_request('POST', f'/houses/{self.test_house_id}/share', share_data, token=self.proprietario_token)
            if response and response.status_code == 200:
                data = response.json()
                if 'message' in data:
                    self.log_result("Share House with Corretor", True)
                else:
                    self.log_result("Share House with Corretor", False, "No message in response")
            else:
                self.log_result("Share House with Corretor", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_calendar_get_events(self):
        """Test getting calendar events"""
        print("\n=== Testing Calendar - Get Events ===")
        
        if self.test_house_id and self.proprietario_token:
            response = self.make_request('GET', f'/calendar/{self.test_house_id}', token=self.proprietario_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Calendar Events (Proprietário)", True)
                else:
                    self.log_result("Get Calendar Events (Proprietário)", False, "Response is not a list")
            else:
                self.log_result("Get Calendar Events (Proprietário)", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test corretor can access after sharing
        if self.test_house_id and self.corretor_token:
            response = self.make_request('GET', f'/calendar/{self.test_house_id}', token=self.corretor_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Calendar Events (Corretor)", True)
                else:
                    self.log_result("Get Calendar Events (Corretor)", False, "Response is not a list")
            else:
                self.log_result("Get Calendar Events (Corretor)", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_calendar_block_dates(self):
        """Test blocking dates"""
        print("\n=== Testing Calendar - Block Dates ===")
        
        if self.test_house_id and self.proprietario_token:
            # Get tomorrow's date
            tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            block_data = {
                "dates": [tomorrow]
            }
            
            response = self.make_request('POST', f'/calendar/{self.test_house_id}/block', block_data, token=self.proprietario_token)
            if response and response.status_code == 200:
                data = response.json()
                if 'message' in data:
                    self.log_result("Block Dates (Proprietário)", True)
                else:
                    self.log_result("Block Dates (Proprietário)", False, "No message in response")
            else:
                self.log_result("Block Dates (Proprietário)", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test corretor cannot block dates
        if self.test_house_id and self.corretor_token:
            tomorrow = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')
            block_data = {
                "dates": [tomorrow]
            }
            
            response = self.make_request('POST', f'/calendar/{self.test_house_id}/block', block_data, token=self.corretor_token)
            if response and response.status_code == 403:
                self.log_result("Block Dates Forbidden (Corretor)", True)
            else:
                self.log_result("Block Dates Forbidden (Corretor)", False, f"Expected 403, got: {response.status_code if response else 'No response'}")
    
    def test_calendar_propose(self):
        """Test proposing locacao"""
        print("\n=== Testing Calendar - Propose Locacao ===")
        
        if self.test_house_id and self.corretor_token:
            # Get day after tomorrow
            day_after_tomorrow = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
            propose_data = {
                "dates": [day_after_tomorrow],
                "value": 500.00
            }
            
            response = self.make_request('POST', f'/calendar/{self.test_house_id}/propose', propose_data, token=self.corretor_token)
            if response and response.status_code == 200:
                data = response.json()
                if 'id' in data:
                    self.test_proposal_id = data['id']
                    self.log_result("Propose Locacao (Corretor)", True)
                else:
                    self.log_result("Propose Locacao (Corretor)", False, "No proposal ID returned")
            else:
                self.log_result("Propose Locacao (Corretor)", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test proprietário cannot propose
        if self.test_house_id and self.proprietario_token:
            day_after_tomorrow = (datetime.now() + timedelta(days=4)).strftime('%Y-%m-%d')
            propose_data = {
                "dates": [day_after_tomorrow],
                "value": 600.00
            }
            
            response = self.make_request('POST', f'/calendar/{self.test_house_id}/propose', propose_data, token=self.proprietario_token)
            if response and response.status_code == 403:
                self.log_result("Propose Locacao Forbidden (Proprietário)", True)
            else:
                self.log_result("Propose Locacao Forbidden (Proprietário)", False, f"Expected 403, got: {response.status_code if response else 'No response'}")
    
    def test_proposals_list(self):
        """Test listing proposals"""
        print("\n=== Testing Proposals - List ===")
        
        if self.test_house_id and self.proprietario_token:
            response = self.make_request('GET', f'/proposals/{self.test_house_id}', token=self.proprietario_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("List Proposals (Proprietário)", True)
                else:
                    self.log_result("List Proposals (Proprietário)", False, "Response is not a list")
            else:
                self.log_result("List Proposals (Proprietário)", False, f"Status: {response.status_code if response else 'No response'}")
    
    def test_proposals_action(self):
        """Test approving/rejecting proposals"""
        print("\n=== Testing Proposals - Actions ===")
        
        # First, get the proposal ID from the list
        if self.test_house_id and self.proprietario_token:
            response = self.make_request('GET', f'/proposals/{self.test_house_id}', token=self.proprietario_token)
            if response and response.status_code == 200:
                proposals = response.json()
                if proposals and len(proposals) > 0:
                    proposal_id = proposals[0]['id']
                    
                    # Test approve action
                    action_data = {"action": "approve"}
                    response = self.make_request('PUT', f'/proposals/{proposal_id}/action', action_data, token=self.proprietario_token)
                    if response and response.status_code == 200:
                        data = response.json()
                        if data.get('status') == 'approved':
                            self.log_result("Approve Proposal", True)
                        else:
                            self.log_result("Approve Proposal", False, "Status not approved")
                    else:
                        self.log_result("Approve Proposal", False, f"Status: {response.status_code if response else 'No response'}")
                else:
                    self.log_result("Approve Proposal", False, "No proposals found to approve")
            else:
                self.log_result("Approve Proposal", False, "Could not get proposals list")
    
    def test_history(self):
        """Test getting history"""
        print("\n=== Testing History ===")
        
        if self.test_house_id and self.proprietario_token:
            response = self.make_request('GET', f'/history/{self.test_house_id}', token=self.proprietario_token)
            if response and response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get History (Proprietário)", True)
                else:
                    self.log_result("Get History (Proprietário)", False, "Response is not a list")
            else:
                self.log_result("Get History (Proprietário)", False, f"Status: {response.status_code if response else 'No response'}")
        
        # Test corretor cannot access history
        if self.test_house_id and self.corretor_token:
            response = self.make_request('GET', f'/history/{self.test_house_id}', token=self.corretor_token)
            if response and response.status_code == 403:
                self.log_result("Get History Forbidden (Corretor)", True)
            else:
                self.log_result("Get History Forbidden (Corretor)", False, f"Expected 403, got: {response.status_code if response else 'No response'}")
    
    def test_health_check(self):
        """Test API health check"""
        print("\n=== Testing Health Check ===")
        
        response = self.make_request('GET', '/')
        if response and response.status_code == 200:
            data = response.json()
            if 'message' in data:
                self.log_result("Health Check", True)
            else:
                self.log_result("Health Check", False, "No message in response")
        else:
            self.log_result("Health Check", False, f"Status: {response.status_code if response else 'No response'}")
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Agenda TTI Backend Tests")
        print(f"Backend URL: {API_BASE}")
        
        # Health check first
        self.test_health_check()
        
        # Authentication tests
        self.test_auth_register()
        self.test_auth_login()
        self.test_auth_me()
        
        # Houses tests
        self.test_houses_create()
        self.test_houses_list()
        self.test_houses_get_details()
        self.test_houses_share()
        
        # Calendar tests
        self.test_calendar_get_events()
        self.test_calendar_block_dates()
        self.test_calendar_propose()
        
        # Proposals tests
        self.test_proposals_list()
        self.test_proposals_action()
        
        # History tests
        self.test_history()
        
        # Print summary
        print(f"\n📊 Test Results Summary:")
        print(f"✅ Passed: {self.results['passed']}")
        print(f"❌ Failed: {self.results['failed']}")
        print(f"📈 Success Rate: {(self.results['passed'] / (self.results['passed'] + self.results['failed']) * 100):.1f}%")
        
        if self.results['errors']:
            print(f"\n🔍 Failed Tests:")
            for error in self.results['errors']:
                print(f"  - {error}")
        
        return self.results['failed'] == 0

if __name__ == "__main__":
    tester = AgendaTTITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)