#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Test the Celesta Glow CRM backend at the production URL focusing on: (1) Previous tests: login error messages, system wiped state, order edit permissions, cascade delete, hard reset endpoints, and instant wipe functionality. (2) New features: email sending verification, updated employment terms in offer letters, document template overrides (NEW endpoints), unified instruction endpoint with task assignment + email + dashboard, and verification of single POST /api/instructions endpoint."

backend:
  - task: "Login error messages"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "All login error scenarios working correctly - 400 for empty credentials, 404 for non-existent email with correct message 'No account found with this email', 401 for wrong password with correct message 'Password entered is wrong', 200 for valid admin login with token and role='admin'"

  - task: "System wiped state verification"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "System wiped state correctly implemented - only admin users exist after instant wipe, all other role endpoints (/telecallers, /agents, /sales-managers, /managers, /hr-managers) return empty arrays, system_wiped flag is respected in app_config"

  - task: "Order edit permissions"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Order edit permissions working correctly - can edit pending orders, cannot edit shipped/delivered orders (returns 403 with message containing 'locked'), role-based permissions enforced. Order workflow: pending -> approved -> shipped -> delivered"

  - task: "Cascade delete functionality"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Cascade delete working with DELETE /api/users/{uid} and password XYCDF6F@123 - deletes child users and related data, tombstones deleted emails to prevent re-seeding, returns cascade_counts in response showing deleted items"

  - task: "Hard Reset endpoints"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Hard reset endpoints working correctly - POST /api/admin/hard-reset with password AMVPA2478F@123 schedules 48h reset with execute_at timestamp, GET /api/admin/hard-reset/status returns pending=true with execute_at, POST /api/admin/hard-reset/cancel successfully cancels pending reset"

  - task: "Instant Wipe functionality"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Instant wipe working correctly - POST /api/admin/instant-wipe with password AMVPA2478F@123 wipes all non-admin users, sets system_wiped flag in app_config, returns wiped_at timestamp, preserves admin users only"

  - task: "User creation via /hr/add-employee"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "User creation endpoint working - POST /api/hr/add-employee can create telecallers, agents, district managers with proper role assignment and ID generation using role-specific prefixes"

  - task: "Order approval workflow"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Order approval workflow working - orders must be approved via PUT /api/orders/{id}/approve before shipping via PUT /api/orders/{id}/ship, proper status transitions enforced (pending -> confirmed -> shipped -> delivered)"

  - task: "Email sending with custom template"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "POST /api/hr/send-email with template='custom' working correctly - returns 200 with status='sent' when SMTP is configured, or 502 with SMTP error detail when not configured. Tested with to_email='glowcelesta@gmail.com', emp_name='QA', subject='Test', message='Hello'. Email sent successfully."

  - task: "Offer letter with updated employment terms"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "POST /api/hr/send-email with template='offer' working correctly - email sent successfully with updated employment terms in footer including break-time (40 min lunch + 20 min tea), Friday extra-30min break, Sunday weekly-off. Tested with to_email='glowcelesta@gmail.com', emp_name='Test', position='Test', salary=20000, joining_date='2026-05-15', department='Operations', reporting_to='HR'."

  - task: "Document template overrides - CRUD operations"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "All document template override endpoints working correctly: (1) GET /api/hr/document-templates returns {templates:[], builtin_keys:[9 keys]} with correct builtin keys ['welcome','offer','employment','agreement','increment','termination','warning','relieving','experience']. (2) PUT /api/hr/document-templates/offer saves custom template with subject and body_html. (3) GET /api/hr/document-templates/offer retrieves saved template. (4) POST /api/hr/send-email with custom template returns message containing '(custom template)'. (5) DELETE /api/hr/document-templates/offer reverts to default with message 'Reverted to built-in default'."

  - task: "Unified instruction endpoint with task assignment"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "POST /api/instructions endpoint working correctly with rich response format. Returns all required fields: instruction object, tasks_created (int >= 0), notifications_created (int >= 0), email_results (dict with sent/failed/errors), target_users_count (int). Tested with title='QA Test', content='Daily report by 5 PM', target_role='all', priority='high', create_as_task=true, send_email=false, due_date='2026-05-10'. Instruction created successfully and verified via GET /api/instructions."

  - task: "Single POST /api/instructions endpoint verification"
    implemented: true
    working: true
    file: "server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Verified only ONE POST /api/instructions endpoint exists (no duplicate). Endpoint returns new rich format with fields: instruction, tasks_created, notifications_created, email_results, target_users_count. Old duplicate endpoint (that returned just instruction + message) has been removed. Endpoint at line 2245 is the only active instruction creation endpoint."

frontend:
  # No frontend testing performed as per instructions

metadata:
  created_by: "testing_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "All backend API testing complete including new features"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "testing"
    message: "Comprehensive backend testing completed for Celesta Glow CRM. All major functionality working correctly including login error handling, system wiped state, order permissions, cascade delete, hard reset, and instant wipe. Backend URL https://hr-central-82.preview.emergentagent.com/api is fully functional. All endpoints tested with correct credentials (admin@celestaglow.com/admin123) and master passwords (XYCDF6F@123 for delete, AMVPA2478F@123 for hard-reset/instant-wipe)."
  - agent: "testing"
    message: "NEW FEATURES TESTING COMPLETE (2026-05-02): All 5 new feature requirements verified and working: (1) Email sending with custom template - returns 200 with status='sent'. (2) Offer letter with updated employment terms - email sent successfully with new break-time/Friday/Sunday terms in footer. (3) Document template overrides - all CRUD operations (GET/PUT/DELETE) working correctly with 9 builtin keys. (4) Unified instruction endpoint - returns rich response with tasks_created, notifications_created, email_results, target_users_count. (5) Single endpoint verification - only ONE POST /api/instructions exists with new format, old duplicate removed. All 14 tests passed. Test results saved to /app/test_results_new_features.json and /app/backend_test_new_features.py."