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
- **Feb 2026** — Delhivery shipping integration (production):
  - **3 endpoints**: `POST /api/shipping/delhivery/ship/{oid}` (creates waybill, stores AWB + tracking URL + sets order.status=shipped), `GET /api/shipping/delhivery/track/{awb}` (live tracking JSON), `POST /api/shipping/delhivery/cancel/{oid}` (cancel a waybill).
  - **Auth**: ship allowed for Admin / Inventory / Sales Manager; cancel only for Admin / Inventory; tracking link visible to all roles.
  - **Config**: env vars `DELHIVERY_API_KEY`, `DELHIVERY_BASE_URL` (defaults to https://track.delhivery.com — production), `DELHIVERY_PICKUP_LOCATION=Parakkal`, `DELHIVERY_PACKAGE_LENGTH/BREADTH/HEIGHT_CM=20`, `DELHIVERY_PACKAGE_WEIGHT_GRAMS=500`.
  - **Auto-flow on Ship click**: validates 6-digit pincode → calls `POST /api/cmu/create.json` with shipments array + pickup_location → extracts waybill from `packages[0]` → saves AWB + public tracking URL (`https://www.delhivery.com/tracking?awb=…`) onto the order → marks shipped.
  - **UI**: new `DelhiveryShipActions` reusable component plugged into the order rows of Admin (`AdminCRMPanel`), Sales Manager (`SalesManagerDashboard`), Inventory Manager (`InventoryManagerDashboard`) — shows "🚚 Ship via Delhivery" button when not yet shipped, replaced by AWB tracking link + "Cancel" (admin/inventory only) once shipped. The existing manual-tracking dialog on Inventory is retained as "Manual" fallback when AWB isn't set. DM dashboard shows the tracking link read-only.
  - **Route registration fix**: moved `app.include_router(api_router)` to the very end (after the new endpoints) — otherwise FastAPI returned 404 on the new routes.
- **Feb 2026** — TC stats: live `total_calls / total_leads / conversions / commission_earned` on `/telecallers` + `?days=` chip filter (3/7/15/30) and 4th "Leads" tile
  - **SM Telecaller cards**: new 📞 button opens a "Call Logs" dialog showing every call the telecaller logged, with a date-range chip selector — **Last 3 / 7 / 15 / 30 days**. Each row shows customer, phone, status / outcome badge, full notes block, duration and timestamp. Backed by `GET /api/team-activity?user_id=…&days=N` (new `days` query param added).
  - **HR Hiring pagination + "Show hired"**: list is now paginated **50 per page, latest-first**, with prev/next buttons and "Showing X-Y of Z" indicator. Pagination resets to page 1 whenever filter changes. A "Show hired" checkbox refetches with `include_hired=true` — fixes the "morning showed 64 / now only 40" complaint (the 24 missing ones were hidden after being marked hired). When a filter is applied, pagination operates on the filtered subset.
- **Feb 2026** — HR Employee Library multi-select + bulk delete + "By: tc-3eed7f…" raw-id hydration backfill
  - **Leaderboard now works**: backend was reading from non-existent `db.crm_orders` → revenue was always 0; also used wrong commission field (`amount` vs `commission_amount`). Fixed to query `db.orders` (delivered status, scoped by `created_by`) with proper month/year filter on both orders + commissions; added `rank` field and tie-break sort (revenue → orders → commission).
  - **Attendance logout (HR)**: removed the 17:30 IST gate that was blocking HR from setting logout earlier. `can_set_logout` always true now; "Set Logout" / "Update Logout" button is always usable.
  - **Telecaller dashboard — Order history**: new "📦 Orders (N)" tab showing every order the telecaller created (order #, customer, items, amount, payment type, status, date) in a clean table.
  - **Edit Telecaller / Edit Agent**: new ✎ button on SM telecaller cards and DM agent cards opening an edit dialog (Name / Phone / Language / Place — and Agent: District / Area). Backed by new `PUT /api/telecallers/{tid}` and `PUT /api/agents/{aid}` endpoints with strict `managed_by` scope (SM can only edit their own TCs, DM only their own agents; assistant managers inherit).
  - **Bulk multi-select & delete on HR Hiring** already shipped earlier in this session; admins (with role==admin) can hit the same endpoints from the HR view because the bulk endpoint allows both roles.
- **Feb 2026** — Hiring & profile-card fixes (HR sees inhouse-TC candidates, delete + language/place badges, daily-metrics fix)
  - **HR Hiring no longer misses inhouse-telecaller candidates**: query now includes candidates created by HR themselves + every candidate with `created_by_role == "inhouse_telecaller"` (plus a legacy fallback by id). New candidates also persist `created_by_role` on insert.
  - **HR can delete bad/duplicate candidates**: new `DELETE /api/hiring/candidates/{cid}` (admin + HR only, blocks if already hired) with a 🗑 button per candidate row. Cascades clean any linked HR call-log references.
  - **Telecaller cards (SM)** now show **🗣 language** and **📍 place** badges; Add-Telecaller dialog has a new "Place / Locality" input.
  - **Agent cards (DM)** now show **🗣 language** and **📍 locality/location/city** badges; Add-Agent dialog has a new "Language" input. Backend agent factory now stores `language`; telecaller factory now stores `location`.
  - **Digital Marketing — "Save Today's Results" fix**: `POST /api/campaigns/{cid}/daily-metrics` now tolerates empty-string inputs (no more 500 on partial forms) and the frontend surfaces the real backend error instead of a generic "Failed".
- **Feb 2026** — Hiring + Repeat/Relationship hardening across SM/DM dashboards:
  - **Manager hiring** is now strictly forward-gated (no status-based leak); HR's hiring list shows a dedicated **"→ Forwarded to &lt;Manager Name&gt; (&lt;role&gt;) · &lt;date&gt;"** info line per candidate.
  - **/api/leads/follow-ups** scoping fixed: SM sees only leads owned by their managed telecallers; DM only by their managed agents; ASM/ADM inherit their manager's team. No more overlap.
  - **Repeat & Relationship tabs** (SM + DM) now display **telecaller/agent name**, **product** (`last_order_products` / `product_interest`), **last order amount** (Rs.), and **callback-due time** when set.
  - **Order persistence**: when an order is delivered, the backend now writes `last_order_id`, `last_order_amount` and `last_order_products` onto the lead. A one-time startup backfill (`_backfill_lead_last_order`) hydrates legacy leads from their delivered orders.
  - **Sales Manager — Create Order**: new "+ Create Order" button on the SM Orders tab with a clean dialog (customer + single-line product + qty/price + COD/Prepaid). Posts to existing `POST /api/orders`.
- **Feb 2026** — Editable Standard Employment Terms (6-field block; lunch/tea/Friday-extra removed per request)
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
