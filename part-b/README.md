# Part B — Slotbook Salon Booking App

A responsive salon booking app with a Node.js HTTP backend, real SQLite storage, and a plain JavaScript frontend. No package installation or build step is needed.

## Run

Install **Node.js 24 or later**, then open a terminal at the repository root:

```powershell
cd part-b
npm start
```

Open **http://localhost:3000**. The database is created and seeded on first run in `data/slotbook.sqlite`. Restarting retains appointments. The four services and two stylist schedules match the assignment.

**One command starts both frontend and backend.** Keep the terminal running; press `Ctrl+C` to stop the app. No separate frontend server or `npm install` step is needed.

| Page | Local URL |
| --- | --- |
| Home | http://localhost:3000/ |
| Customer sign-in / sign-up | http://localhost:3000/login |
| Booking | http://localhost:3000/book |
| Admin sign-in | http://localhost:3000/admin/login |
| Protected dashboard | http://localhost:3000/admin |

## Seed data

| Service | Duration | Price |
| --- | --- | --- |
| Haircut | 30 minutes | ₹400 |
| Hair spa | 60 minutes | ₹1,200 |
| Beard trim | 15 minutes | ₹200 |
| Facial | 45 minutes | ₹900 |

| Stylist | Working days | Working hours | Break | Weekly day off |
| --- | --- | --- | --- | --- |
| Meera | Monday–Saturday | 10:00–19:00 | 13:00–14:00 | Sunday |
| Karan | Tuesday–Sunday | 11:00–20:00 | 15:00–15:30 | Monday |

Weekly days off and daily breaks block availability. Custom holiday dates and individual leave management are not implemented.

The home page shows treatments, prices and stylist schedules. Its booking buttons lead to **http://localhost:3000/book**. Clicking a treatment opens the booking page with that service selected. Confirmation has a private management link; refreshing that page reloads the saved booking, and you can reschedule from there.

## Customer accounts

Open **http://localhost:3000/login** to sign in or select **Create account**. An account needs a name, a 10-digit phone number and an 8–128-character password. The database enforces one account per phone number. Existing numbers show a clear message to sign in instead.

Guests can browse the home page. Opening `/book` redirects them to sign-in, preserving their selected treatment or private management link. Signing in or creating an account returns them to that destination. The backend also requires an active session for availability, booking details, booking creation and rescheduling.

The appointment form defaults to **Use my account number**. Choose **Use another number** to reveal a required 10-digit contact number field. This number is saved only on that appointment; it does not change the account phone. Confirmation shows the chosen contact number, and rescheduling preserves it. New bookings are linked to the signed-in customer. Another customer cannot open or move them even if they obtain a management link. Pre-account bookings remain accessible with their original private link after sign-in.

Passwords use salted asynchronous scrypt (`N=32768, r=8, p=3`); plaintext passwords are never stored. Sessions use random 256-bit tokens in HttpOnly, SameSite=Lax cookies, with only token hashes saved in SQLite and a seven-day expiry. Sign-out revokes the session in the database. Authentication attempts are limited to ten per fifteen minutes per client address, with shared counters in SQLite. These choices use [Node.js crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) and [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

This flow uses **phone number + password**, not SMS verification. No SMS service is configured, so it does not verify ownership of the phone number. Password recovery is not implemented. Public hosting must use HTTPS and set `COOKIE_SECURE=1` so session cookies are Secure; plain HTTP is supported only for local development.

## Admin accounts

The salon owner creates each admin account locally:

```powershell
# In a second terminal, from the repository root:
cd part-b
npm run admin:create
```

Enter the admin's name, 10-digit phone number, password and password confirmation. Password entry is hidden. The command prints the newly assigned **special login ID**, such as `SB-ADM-XXXXXXXXXXXX`. Give that login ID to the admin. Repeat the command for each additional admin; login IDs and phone numbers are unique. There is no default admin password or public admin signup. The setup command uses the same SQLite file as the server (`DB_PATH`, if supplied).

Open **http://localhost:3000/admin/login**, or choose **Salon admin? Sign in here** on the customer login page. The admin must supply their assigned login ID, phone number and password together. A successful sign-in goes directly to `/admin`, with dashboard-only navigation, bookings grouped by stylist, daily revenue and cancellation controls.

Admin sessions use a separate HttpOnly cookie and a separate SQLite session table, and expire after eight hours. Every dashboard page and admin API request checks that session on the backend. Guests are redirected to admin sign-in; customer sessions receive 403 for admin APIs and cannot see the dashboard. Customer signup cannot assign an admin role. Signing into either role revokes the previous role's session. Admin sign-out revokes dashboard access. The previous shared access-key flow is removed.

For non-interactive owner provisioning, the command accepts `SLOTBOOK_ADMIN_NAME`, `SLOTBOOK_ADMIN_PHONE` and `SLOTBOOK_ADMIN_PASSWORD` from environment variables. Do not put passwords in command arguments, source files or version control.

## Testing

From `part-b`, run:

```sh
npm test
npm run check
```

The automated suite contains **77 tests**. Tests use isolated databases and do not change saved appointments. See [TESTING.md](TESTING.md) for coverage and browser verification.

## Assignment coverage

Level 1 was implemented and verified before adding Level 2. Tests retain a core-mode fixture to verify that milestone independently.

- **Level 1:** service, stylist and date selection; 15-minute start times; whole-service availability; name and 10-digit mobile validation on both sides; SQLite persistence; complete confirmation.
- **Level 2:** breaks, days off, 10-minute cleanup, India-time past-date and past-time blocking; protected admin view grouped by stylist; total confirmed booking revenue; cancellation immediately restores availability.
- **Level 3:** Any stylist; least-booked eligible stylist assignment; atomic rescheduling; concurrent booking protection; availability unit tests and database/API integration tests.
- **Live deployment:** Dockerfile supplied; no live URL has been provisioned. Deployment requires a hosting account and persistent storage.

## Booking rules

All salon dates and times use **Asia/Kolkata (UTC+05:30)**, irrespective of the browser/server timezone. Starts are on a 15-minute grid. The appointment **and its cleanup** must fit before closing and must not overlap a break. A 10:00 haircut ends at 10:30 and blocks through 10:40, so the next grid time is 10:45. Intervals are half-open: a treatment may begin exactly when another appointment's cleanup or a break ends. Past appointment rescheduling is rejected.

“Any stylist” combines both calendars. At booking time, eligible stylists are sorted by their count of confirmed bookings on that date. The lowest count wins; ties use stylist ID (Meera first). Cancelled bookings do not contribute. Availability is refreshed when a stale slot is rejected.

Names accept 2–80 characters, starting with a Unicode letter, with letters, combining marks, spaces, apostrophes, dots and hyphens thereafter. Mobile numbers must be exactly 10 ASCII digits. Backend validation is authoritative. Prices and durations come from the database, never client input.

## How double booking is prevented

The entire booking operation uses **SQLite `BEGIN IMMEDIATE`**: acquire the database write lock, read existing confirmed appointments, recompute availability including buffers, assign a stylist, insert, then commit. A competing process/connection must wait for the lock and then sees the first booking; it receives HTTP **409 Conflict**. A 5-second busy timeout bounds lock waiting. This covers overlaps with different start times, not merely identical start times. Rescheduling does the same check/update in one transaction while excluding its own ID; a failed move rolls back and preserves the original appointment.

The race test releases two worker threads with independent database connections at the same instant and asserts that exactly one succeeds. HTTP tests also issue concurrent requests. SQLite WAL mode allows reads during writes. Use a single persistent local SQLite volume; do not deploy separate database copies to multiple instances.

## Rescheduling

Confirmation offers a reschedule button and a private management link. Save this link to return later. The link contains a random 192-bit management key in the URL fragment (not sent in URL request logs). The frontend sends the key only when accessing that specific booking. Knowing a booking ID alone does not grant access. Sign in to the account that created the appointment before opening the link. Rescheduling keeps the booking ID and customer details; service, stylist, date, time and price update atomically. Keep management links private.

## Structure

```text
backend/availability.js       Pure time and overlap calculations
backend/store.js              Schema, seeds, booking transactions
backend/auth.js               Password hashing, accounts, sessions and auth throttling
backend/admin-auth.js         Assigned admin IDs, admin credential checks and sessions
backend/create-admin.js       Local owner command for admin provisioning
backend/server.js             HTTP API and frontend serving
backend/*.test.js             Unit, persistence, concurrency and HTTP tests
frontend/index.html           Page shell
frontend/home.js              Home page with treatment links and salon introduction
frontend/auth-ui.js           Sign-in, sign-up, account navigation and safe redirects
frontend/app.js               Customer booking, confirmation and role routing
frontend/admin-ui.js          Admin sign-in and protected dashboard
frontend/style.css            Responsive styles
```

Detailed test coverage and browser verification results are recorded in `TESTING.md`.

## Website walkthrough

A three-minute captioned recording demonstrates the home page, customer signup and login, validation, phone choices, booking rules, confirmation, rescheduling, Any stylist, admin login, revenue, cancellation and mobile layout. It uses fictitious accounts in an isolated database.

See [walkthrough notes](walkthrough/README.md) and [the MP4 recording](walkthrough/slotbook-walkthrough.mp4).

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Listening address; use `0.0.0.0` for container hosting |
| `DB_PATH` | Project's `data/slotbook.sqlite` | SQLite location; use the same setting when provisioning admins |
| `COOKIE_SECURE` | Unset | Set to `1` for HTTPS hosting |
| `CORE_MODE` | Unset | Set to `1` only for Level 1 availability mode; leave unset for the complete app |

To use another port in PowerShell:

```powershell
$env:PORT = "3001"
npm start
```

If port 3000 is occupied, stop the existing Slotbook process with `Ctrl+C` in its terminal or choose another port. If `node:sqlite` is unavailable, check `node --version` and use Node.js 24 or newer.

## API

Customer authentication uses an HttpOnly session cookie. `POST /api/auth/signup` accepts `{name,mobile,password}`; `POST /api/auth/login` accepts `{mobile,password}`. Both return public customer details and set the session cookie. `GET /api/auth/session` returns `{customer,admin}` (both null for guests); `POST /api/auth/logout` revokes the current customer session and clears its cookie. Auth, availability and appointment endpoints never return password hashes or session tokens in JSON.

Admin authentication uses `POST /api/admin/auth/login` with `{loginId,mobile,password}`, `GET /api/admin/auth/session`, and `POST /api/admin/auth/logout`. Only local owner provisioning can create admin accounts. Admin API access requires the `slotbook_admin` session cookie; a customer cookie or legacy access key cannot grant access.

Booking, availability and management routes below require the customer session. `POST /api/bookings` also accepts `useAccountNumber`: when true (the default), the server uses the account's phone number; when false, it validates and saves the supplied `mobile`. This flag does not update the customer's account.

| Method | Route                                                         | Purpose                                                       |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/catalog`                                                | Services, stylists, current salon date                        |
| GET    | `/api/availability?serviceId=1&stylistId=any&date=2030-01-08` | Available start times                                         |
| POST   | `/api/bookings`                                               | `{serviceId,stylistId,date,time,name,mobile}`                 |
| GET    | `/api/bookings/:id`                                           | Booking details with `Authorization: Bearer <management key>` |
| POST   | `/api/bookings/:id/reschedule`                                | `{serviceId,stylistId,date,time,token}`                       |
| GET    | `/api/admin/bookings?date=2030-01-08`                         | Grouped bookings and revenue; admin session required          |
| POST   | `/api/admin/bookings/:id/cancel`                              | Cancel; admin session required                                |

For rescheduling availability, add `exclude=<booking ID>` and authenticate with the same Bearer management key. Errors return `{error: "message"}` with appropriate HTTP status codes.

## Deployment

Use a Docker host with a persistent volume mounted at `/app/data`, one running instance, Node 24, and HTTPS. Set `HOST=0.0.0.0`, your hosting `PORT`, `COOKIE_SECURE=1`, and optionally `DB_PATH`. Provision admins against that same persistent database with the owner command. The app has no third-party runtime dependencies. A local Docker example is:

```sh
docker build -t slotbook .
docker run --rm --name slotbook -p 3000:3000 -v slotbook-data:/app/data slotbook
docker exec -it slotbook npm run admin:create
```

Set `COOKIE_SECURE=1` when hosting behind HTTPS. Keep the SQLite file backed up; temporary container filesystems lose bookings, customer accounts and admin accounts. This assignment app does not provide SMS delivery or payment processing.

## GitHub submission

The included `.gitignore` excludes `data/`, `node_modules/`, `.env` and logs. Do not commit real databases, customer details or credentials. There are no default admin credentials: reviewers can create an admin locally with `npm run admin:create`.

[Back to repository README](../README.md)
