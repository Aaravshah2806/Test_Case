# Part B — Studio Salon appointments

React + JavaScript frontend, Python FastAPI backend, and **Supabase PostgreSQL**.

Level 1 implementation is ready. Final live-database verification waits for your Supabase
connection string. Level 2 has not started. No bookings are stored in browser storage.

## What you need to do manually

1. Create a Supabase project and keep its **database password**.
2. Configure `backend/.env` with its PostgreSQL connection URL (steps below).
3. Run the migration and start the backend and frontend in separate terminals.
4. Make a test appointment and check it in Supabase.
5. Before submitting, create/publish your public GitHub repository and record the 3–5 minute demo.

Docker, Supabase CLI, Supabase API keys, and frontend database credentials are not needed.

## 1. Create and connect Supabase

- Sign in at [Supabase](https://supabase.com/dashboard) and create a **new project** for this app.
- Choose a project name, region, and database password. Wait for provisioning to finish.
- Open the project's **Connect** panel and select **Session pooler**, with port **5432**.
  This supports IPv4 machines. Copy the connection URI from that panel, using its actual
  host and username; do not guess the region or hostname.
- Copy `backend/.env.example` to `backend/.env`, then edit the copy.
- Use `postgresql+psycopg://` at the beginning and add `?sslmode=require` at the end
  (or `&sslmode=require` if the URI already has a query).

Example **shape**, not a working credential:

```dotenv
DATABASE_URL=postgresql+psycopg://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
```

Replace `PROJECT_REF`, `ENCODED_PASSWORD`, and `POOLER_HOST` with your own values.
The pooler username is normally `postgres.<project-ref>`, not simply `postgres`.
Use the database password you set when creating the project, not your Supabase account password.
URL-encode special characters in that password (`@` → `%40`, `#` → `%23`, `%` → `%25`).
Do not send the password in chat or commit `.env`. The repository ignores real `.env` files.

Connection reference: [Supabase PostgreSQL connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

The backend creates a private **`salon` schema**. Keep it outside Supabase's exposed API schemas.
RLS is enabled on its tables without public policies; the backend connects as the database owner.
This demo uses the project database owner to simplify setup. A deployment should use a dedicated
runtime database role with only the app permissions it needs.

## 2. Prepare Python and start the backend

Use Python **3.12+** and Node.js **22.12+** (Node 24 is fine).
If `python --version` opens the Microsoft Store or fails, install Python from
[python.org](https://www.python.org/downloads/) with **Add Python to PATH**, then reopen PowerShell.

PowerShell terminal 1:

```powershell
cd D:\Projects\Test_case_Techsperia\part-b\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

**Run the copy command only if `.env` does not already exist.** Edit `.env` before continuing.
The lock file pins the verified backend and test dependencies. Direct dependency requirements
also exist in `requirements.txt` and `requirements-dev.txt`.

```powershell
.\.venv\Scripts\python.exe -m app.check_database
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The backend seeds the four services and two stylists automatically on its first successful
startup. Restarting it does not duplicate or reset seed data. Stop it with `Ctrl+C`.
Virtual-environment activation is unnecessary, avoiding PowerShell execution-policy issues.

On the current Codex machine, a virtual environment and dependencies have already been created.
You can start with `app.check_database` once `.env` is filled in. If recreating the environment
before installing standard Python, the bundled interpreter is available at:

```powershell
& 'C:\Users\Dell\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m venv .venv
```

Check [API health](http://127.0.0.1:8000/api/health) and
[interactive API documentation](http://127.0.0.1:8000/docs).

## 3. Start React

PowerShell terminal 2:

```powershell
cd D:\Projects\Test_case_Techsperia\part-b\frontend
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).
The Vite proxy forwards `/api` requests to Python on port 8000. No CORS setup or
Supabase credentials are needed in React. Use both servers when testing the app.
Install scripts are disabled in `.npmrc`; the build uses the downloaded platform binaries.

## 4. Verify a booking manually

1. Choose **Haircut**, **Meera**, and a date. Available starts appear in 15-minute steps.
2. Select **10:00 am**, enter a name and a ten-digit mobile number, and confirm.
3. Verify the confirmation shows a booking ID, Haircut, Meera, 10:00–10:30 IST, and ₹400.
4. Click **Book another appointment**. On that same date/stylist, 10:00 and 10:15
   should be unavailable for a haircut; **10:30** should remain available.
5. Switch to Hair spa: a 60-minute service must finish by 19:00, so the latest
   possible start with Meera is **18:00** when it is unoccupied.
6. Select a slot and try an empty name or a short mobile number. The UI must reject it.
   The backend independently rejects invalid direct API requests with HTTP 422.
7. Restart the Python server and revisit the same date. Booked times must stay blocked.
8. In Supabase's SQL Editor, check the saved records:

```sql
select id, customer_name, service_id, stylist_id,
       starts_at at time zone 'Asia/Kolkata' as local_start,
       ends_at at time zone 'Asia/Kolkata' as local_end,
       price_rupees, status
from salon.bookings
order by created_at desc;
```

Do not include real customer personal data in your screen recording.

## Tests

Backend unit tests (no database required):

```powershell
cd D:\Projects\Test_case_Techsperia\part-b\backend
.\.venv\Scripts\python.exe -m pytest tests/test_availability.py tests/test_validation.py -q
.\.venv\Scripts\python.exe -m ruff check app migrations tests
```

Real PostgreSQL integration tests, **after configuring `.env`**:

```powershell
$env:RUN_POSTGRES_TESTS = '1'
.\.venv\Scripts\python.exe -m pytest -q
Remove-Item Env:RUN_POSTGRES_TESTS
```

Each integration test creates and removes its own `salon_test_<random-id>` schema.
It does not delete or alter the app's `salon` tables. The connection user must be
allowed to create schemas (the Supabase database owner can do this).
These tests verify seeding, persistence, validation, overlap rejection, and simultaneous
same/overlapping bookings. Without the opt-in flag, PostgreSQL tests report **skipped**.

Frontend:

```powershell
cd D:\Projects\Test_case_Techsperia\part-b\frontend
npm test
npm run build
npm run test:browser
```

The browser tests use installed **Google Chrome** and mocked API responses. They verify
the UI, not Supabase persistence. They cover validation, confirmation, stale-slot conflicts,
service changes, error/empty states, and widths of 320, 768, 1024, and 1440 pixels.
Install Google Chrome if Playwright reports that the browser executable is missing.

Verified during implementation: **27 Python unit/configuration tests**, **3 JavaScript tests**,
**8 Chrome browser tests**, backend lint, and frontend production build pass.
The **12 PostgreSQL integration cases** await a configured Supabase project.

## Implemented scope and assumptions

| Requirement | Status |
| --- | --- |
| React service/stylist/date selection | Implemented |
| Full-duration, 15-minute availability | Implemented and unit-tested |
| Name/mobile validation in both layers | Implemented and tested |
| Real PostgreSQL persistence | Implemented; live verification pending credentials |
| Booking ID/service/stylist/time/price confirmation | Implemented and browser-tested |
| Concurrent overlapping appointment protection | Implemented; real DB test pending |
| Breaks, days off, cleanup, past-time rules, admin/cancellation | Level 2 — not started |
| Any stylist, rescheduling, deployment | Later bonus scope — not started |

- Dates and times are interpreted in **Asia/Kolkata (IST)**. PostgreSQL stores timezone-aware timestamps.
- Level 1 enforces daily working-hour windows only. Seeded weekday/break data is retained,
  but those restrictions activate in Level 2. Past dates/times also remain allowed in Level 1.
- Adjacent appointments are allowed: a haircut at 10:00 ends at 10:30 and allows 10:30
  as the next start. Level 2 will extend the blocked interval for cleanup.
- Prices are stored in integer rupees and copied to the booking. Duration is captured by
  the saved start/end timestamps. The client cannot set a booking's price or duration.
- Names must be nonblank, at most 100 characters, and free of control characters.
  Mobile numbers are strings of exactly ten ASCII digits; leading zeroes are preserved.
- There is no online payment, account login, SMS, or cancellation/rescheduling in Level 1.

## How double-booking is prevented

Showing availability does not reserve a slot. `POST /api/bookings` opens a transaction,
locks the selected stylist row with **SELECT FOR UPDATE**, then rereads that day's
confirmed bookings. The transaction uses PostgreSQL **READ COMMITTED** isolation.
If a competing request committed while this request waited for the lock, the reread sees it.
Only an available full-service interval is inserted, and the lock lasts until commit.
The losing request receives HTTP **409**, and React refreshes the times.
This works across backend processes; every future booking mutation must use the same lock protocol.
Direct manual inserts bypass this application-level protocol, so use the backend for bookings.

Reference: [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).

## Structure

```text
part-b/
  backend/
    app/             API, validation, scheduling, models, first-run seeds
    migrations/      Alembic PostgreSQL schema migration
    tests/           Unit and real PostgreSQL integration tests
    .env.example     Supabase connection template
    requirements-lock.txt
  frontend/
    src/             React booking form and confirmation
    tests/           Validation and Chrome UI contract tests
    package-lock.json
  README.md
```

## Troubleshooting

- **Password authentication failed:** use the project's database password and the exact
  pooler username from Connect. Encode password special characters.
- **Host unreachable:** use Session pooler on port 5432 rather than the IPv6-only direct
  connection. Check that the Supabase project is active.
- **Relation salon.services does not exist:** run `alembic upgrade head`, then restart Python.
- **The salon will not load:** check Python is running on 8000 and React on 5173.
- **A selected time was taken:** choose a fresh time. This is the expected HTTP 409 behaviour.
- **Port already in use:** stop the previous server in its terminal with `Ctrl+C`.

## Submission checklist

- Keep `/part-a` and `/part-b` in the public GitHub repository. Part A is not changed here.
- Preserve the incremental local commits and push them to your chosen GitHub repository.
- Record a 3–5 minute walkthrough: introduce the stack, show selection/validation/confirmation,
  demonstrate blocked overlaps and persistence, explain locking, then walk through Part A.
- Record completed/skipped levels honestly; do not claim Level 1 fully verified until the
  Supabase smoke test and PostgreSQL tests pass.
- Deployment/live URL and sending the email have not been performed.
