# Salon appointment app — Part B plan

Status: Level 1 implemented; local checks pass. Supabase integration verification is pending
the user's database configuration. Level 2 has not started.

## Scope and location

Build the salon app in `part-b/`, alongside the existing `part-a/`. The user called this “Plan B”; `part-b` is the proposed folder because the submission explicitly requires it. Do not modify Part A. Its solutions are outside this app's scope.

## Proposed stack

- Frontend: React with JavaScript, Vite, plain CSS, and browser fetch.
- Backend: Python FastAPI, Pydantic validation, SQLAlchemy, Alembic migrations, and psycopg.
- Database: Supabase PostgreSQL, following the user's updated preference. Connect only through
  the Python backend using an environment-variable database URL and encrypted Session pooler connection.
- Testing: pytest for scheduling logic and API/database integration checks; frontend production build and manual browser walkthrough.
- Structure: `part-b/frontend/`, `part-b/backend/`, `part-b/backend/.env.example`, and `part-b/README.md`.

## Data model

- Services: ID, name, duration in minutes, price in integer rupees.
- Stylists: ID and name.
- Stylist schedule fields: weekdays, working start/end, and break start/end. Seeded weekday/break
  data is stored now; Level 2 will activate those checks.
- Bookings: UUID ID, service, stylist, customer name/mobile, starts_at, ends_at, occupied_until, booked price, status, created_at.
- Snapshot duration and price on booking so subsequent catalog changes do not alter existing appointments.
- Store timezone-aware timestamps; interpret selected dates and working hours in Asia/Kolkata. Mobile numbers are strings so leading zeroes are preserved.
- Seed exactly the supplied services and schedules on first initialization. Seeding is idempotent and does not restore deleted or changed seed values on every restart.

## Scheduling and consistency

Generate candidates on a 15-minute grid anchored to stylist working hours. Use half-open intervals: a booking ending at 10:30 permits another starting at 10:30 in Level 1. Check full service duration, not merely the start time.

Level 1 uses working-hour windows and appointment overlaps. Store the complete weekly schedules and breaks from the beginning; activate days-off/break enforcement in Level 2, as explicitly requested by the brief's staged levels.

In Level 2, occupied_until is appointment end plus ten minutes. Proposed interpretation: both service and cleanup must finish within the working window and must not overlap a break. Confirm this assumption during plan review; the brief is ambiguous about cleanup at closing/break boundaries.

Availability is advisory. Every create, cancel, and reschedule operation uses a database transaction and a lock on the relevant stylist row. Booking creation rechecks availability after acquiring the lock, then inserts and commits. This serializes competing writes for a stylist across backend processes. Return HTTP 409 if another customer took the slot. Use the same lock protocol for all booking mutations; rescheduling across stylists locks both rows in ID order to avoid deadlocks.

Concurrency prevention is a core requirement from the start. Level 3 adds the explicit concurrent-request demonstration and explanation.

## API outline

- GET /api/services
- GET /api/stylists
- GET /api/availability?service_id=...&stylist_id=...&date=YYYY-MM-DD
- POST /api/bookings — server determines duration, price, and end time.
- Level 2: GET /api/admin/bookings?date=..., POST /api/admin/bookings/{id}/cancel.
- Level 3: availability/create support an any-stylist selection; PATCH /api/bookings/{id}/reschedule.
- Admin endpoints require an environment-configured admin credential checked by the backend. Keep that credential out of the frontend bundle; no full account system is proposed.

## Level 1 — complete before Level 2

1. Scaffold frontend/backend, PostgreSQL configuration, migrations, and idempotent seeds.
2. Show services with durations/prices and stylist/date controls using real API data.
3. Implement and display available starts in 15-minute steps, respecting full duration, working hours, and existing bookings.
4. Add customer details and booking submission. Both layers reject blank/whitespace-only names and mobile values other than exactly ten ASCII digits. Allow common names without requiring letters-only input.
5. Save bookings in PostgreSQL with transactional conflict prevention. Display booking ID, service, stylist, local appointment start/end, and rupee price.
6. Handle loading, no slots, validation failures, and stale-slot conflicts. Refresh availability after a successful booking or conflict.

Gate: restart backend and verify persistence; complete a booking from the browser; verify full-duration overlaps and closing boundaries; reject invalid direct API submissions; demonstrate competing bookings cannot both succeed; run focused checks and frontend build. Record Level 1 completion in README and make the milestone commit before beginning Level 2.

## Level 2 — real-world rules

7. Enforce weekdays, breaks, ten-minute cleanup, past dates, and times already passed today on both availability and booking creation. Recheck current time inside the booking transaction.
8. Add a protected admin page with date selection, bookings grouped by stylist, and total revenue from confirmed bookings for the selected salon-local date. Display cancelled bookings distinctly and exclude them from revenue.
9. Add cancellation with confirmation, retaining the record with cancelled status. Cancelled intervals stop blocking availability immediately after commit.

Gate: verify both seeded schedules, break boundaries, cleanup gaps, closing time, day-off behavior, today's elapsed times, admin access, revenue calculation, and cancellation freeing a slot. Repeat the complete customer flow before marking Level 2 complete.

## Level 3 — optional bonus after Level 2

10. Any stylist: union valid start times; at submission recheck eligible stylists and assign the one with fewer confirmed bookings on that local date, using stylist ID as deterministic tie-breaker. Lock candidate stylist rows in stable order while checking eligibility and counts.
11. Reschedule atomically: exclude the current booking from conflict checks and update it in one transaction. Preserve the booking ID and original reservation when the target is unavailable.
12. Expand unit tests for boundary cases and add PostgreSQL concurrency integration tests; explain the locking approach in README.
13. Deploy frontend, backend, and managed PostgreSQL after choosing a hosting provider/account. Configure HTTPS, CORS, environment secrets, and migrations; verify the deployed flow. Hosting credentials and costs are not assumed.

## Delivery and commits

Commit small verified slices: scaffold, seed/catalog, availability, booking/confirmation, Level 1 complete, real-world rules, admin/cancel, and each bonus feature. Never commit credentials or generated dependencies.

README: setup commands, PostgreSQL connection, migrations/seeds, frontend/backend startup, tests, completed/skipped levels, assumptions, concurrency explanation, and deployment details if applicable.

Submission preparation: public GitHub repository with `/part-a` and `/part-b`, plus a 3–5 minute demo script covering the booking flow, validation, conflicts, admin cancellation, and the user's separate Part A solutions. The user supplies or authorizes GitHub publishing and records/uploads the walkthrough. Email sending is outside this planning request.

## Review points

- Proposed folder is `part-b`, matching the submission requirement.
- Confirm whether cleanup must fit before closing and outside breaks; proposed default is yes.
- Level 3 and deployment are optional and will be prioritized after Levels 1 and 2.
