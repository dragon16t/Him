# Veegal CRM (HRM1 clone) — PRD

## Original Problem Statement
Clone https://github.com/shadnazar/HRM1.git and build a fast, full-featured CRM for Sales Managers, District Managers, Agents, Telecallers, and HRs with role-based access, order-edit restrictions, full DB wipe, SMTP, employee bank schemas, expense tracking with "to be paid to" flags, daily/monthly filters, pagination, ASM/ADM, team activity/groups, hiring privacy, candidate pipeline statuses, and HR document template generation/editing.

## Stack
- React 19 + Tailwind + Shadcn UI + Axios
- FastAPI + Motor (async MongoDB) + bcrypt + PyJWT
- SMTP (user-provided), Emergent LLM Key, Gemini API

## Production
- Deployed at https://portal.veegal.com (user-managed). Preview is the dev sandbox only.

## Implemented (latest first)
- **Feb 2026** — Manager hiring view strictly forward-gated: `GET /api/hiring/candidates` for `sales_manager` / `district_manager` now requires `forwarded_to == current_user.id`. The previous status-based fallback (which made `interested` / `contacted` / `interviewed` / `selected` candidates leak to all managers) is gone. Result: managers see only candidates HR has explicitly forwarded to them — any candidate previously shown by status alone is automatically cleared from their dashboards.
- **Feb 2026** — Investments restricted to Admin only: `GET / POST /api/investments` now require `role == 'admin'` (was admin + finance_manager). `total_investment` removed from finance_manager dashboard stats. Finance Manager dashboard: removed Investments tab, stat card, Add Investment dialog, related state/handlers, and the role-guideline line "Maintain investment records with partner breakdowns". Admin panel still has full Investments management.
- **Feb 2026** — Editable Standard Employment Terms: new tab inside the Document Templates dialog (`Letter Templates` / `Standard Employment Terms`). HR/Admin can edit the 9 footer fields (work_hours, total_break, lunch_break, tea_breaks, friday_extra, weekly_off, probation, notice_period, leave_policy). Backed by `db.company_settings` (key=`employment_terms`), merged into `COMPANY` at startup + on every save so the next letter footer reflects the change. Endpoints: `GET/PUT/DELETE /api/hr/employment-terms`. Per-field "reset to default" link + "Revert All" button.
- **Feb 2026** — Document Templates pre-fill: `GET /api/hr/document-templates/{key}` now falls back to `DEFAULT_TEMPLATE_BODIES` when no override exists, returning `is_default` flag. Editor pre-fills the textarea with the existing letter content (Welcome / Offer / Employment / Agreement / Increment / Warning / Termination / Relieving / Experience) so HR can modify rather than start blank. Reset re-loads the default automatically. Visual badge indicates BUILT-IN vs CUSTOM.
- HR Document Templates Edit UI in Documents tab
- Hierarchical linking (`managed_by`) for Telecaller→SM, Agent→DM at Final Hire
- Candidate pipeline statuses (Not Answering, Callback Required, Interested, etc.)
- Hiring candidate privacy scoped per HR
- "Made with Emergent" watermark removed; favicon added
- Team Activity Panel (calls/home visits) + Team Groups (locality/language)
- Daily + Monthly filters across Orders/Expenses/Leads/Funds/Payroll
- Pagination + indexes on Leads/Orders/Payroll/Notifications
- ASM (Assistant SM) and ADM (Assistant DM) UI + API
- Employee bank schema and Expenses `paid_to` + "To Be Paid" filter
- SMTP integration for instructions/tasks
- Admin hard wipe-data with cascade
- Order edit restrictions (Admin/Manager only after agent confirm)
- Custom login error differentiation
- DM conversion counter bug fixed

## Backlog / Roadmap
- **P1** Auto-save (debounced 2s) for the Document Templates editor
- **P2** Refactor `server.py` (>6000 lines) into modular routers
- **P2** Audit log of who edited which template and when (already capturing `updated_by`, surface it in UI)
- **P3** WYSIWYG rich-text editor in template editor (in addition to raw HTML)

## Test Credentials
See `/app/memory/test_credentials.md`
