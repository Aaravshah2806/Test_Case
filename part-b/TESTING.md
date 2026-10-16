# Slotbook verification — 16 October 2026

The complete automated suite passes **77 tests** with no skipped tests. The original 54 booking and rescheduling checks are retained, with authenticated sessions added to API fixtures. `npm run check` checks the syntax of all application JavaScript modules.

## Run again

```powershell
cd D:\Projects\Test_case_Techsperia\part-b
npm test
npm run check
```

Tests use their own in-memory or temporary SQLite databases. They do not change customer bookings. HTTP tests require permission to connect to localhost if run in a restricted environment.

## Automated coverage

| Area                      | Checks                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed data and persistence | Four services, two stylists, no duplicate seeds, bookings retained after database reopen                                                                                                |
| Availability              | 15-minute grid, all four service durations, work hours, both stylist schedules, breaks, cleanup on both sides, closing boundaries, past dates and India-time same-day cutoffs           |
| Customer validation       | Empty, numeric, short, long and HTML names; Unicode names and apostrophes; whitespace normalisation; short, long, numeric and alphabetic mobiles                                        |
| Booking validation        | Unknown services/stylists, invalid calendar date, days off, breaks, closing time, missing time, off-grid time; no record saved on rejection                                             |
| Server authority          | Client-supplied duration and price do not override database values                                                                                                                      |
| Any stylist               | Combined availability, break-specific eligibility, least-booked assignment, two eligible stylists at the same time, rejection when both are occupied                                    |
| Rescheduling              | Same ID and customer details; new service, price, duration, stylist, date and time; own-slot exclusion; old time freed; new time blocked                                                |
| Reschedule rollback       | Occupied slot, break, day off, invalid date, unknown service, past date and past appointment rejection preserve the original record                                                     |
| Cancellation and revenue  | Idempotent cancellation, freed availability, cancelled appointments cannot be moved, grouping and revenue after service/stylist changes                                                 |
| Concurrency               | Two independent SQLite connections racing for the same slot; concurrent HTTP bookings; concurrent reschedules targeting one slot                                                        |
| API boundaries            | Malformed JSON, non-object JSON, unsupported content type, oversized request, foreign origin, correct status codes                                                                      |
| Access controls           | Booking details and availability exclusion require the management key; rescheduling rejects a wrong key; admin read/cancel require an admin session; admin results omit management keys |
| Routes                    | Home, booking, treatment selection query, admin and frontend assets load; unknown route returns 404                                                                                     |

## Browser checks

These were exercised through the actual browser interface using an isolated database on port 3001. Normal customer data on port 3000 was not used for bookings.

The original booking checks below were first run before account login was added. The additional account checks at the end were exercised with the new authentication gate enabled. The regression suite verifies the original API booking rules while signed in.

| Flow                                                    | Result                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Home → Hair spa treatment link                          | Booking page opens with Hair spa, 60 minutes and ₹1,200 selected                                    |
| Meera on Sunday                                         | No slots shown; confirmation stays disabled                                                         |
| Numeric customer name                                   | Clear validation error; booking stays unsaved                                                       |
| Three-digit mobile                                      | Browser pattern validation blocks submission                                                        |
| Valid Haircut booking                                   | Confirmation shows Meera, 10:00–10:30, ₹400 and booking ID                                          |
| Second customer with stale 10:00 selection              | Conflict message, refreshed times, 10:00 and cleanup-blocked 10:30 removed; 10:45 remains available |
| Refresh confirmation                                    | Saved appointment loads through its private management link                                         |
| Reschedule into a newly occupied 11:00 slot             | Rejected; reload still shows the original 10:00 appointment                                         |
| Change Haircut → Hair spa, Meera → Karan, and date/time | Confirmation shows new date, 16:00–17:00 and ₹1,200 with the same ID; refresh preserves the change  |
| Incorrect admin credentials                             | Access denied with a clear error                                                                    |
| Authenticated admin dashboard                           | Appointment grouped under Meera; revenue ₹400                                                       |
| Admin cancellation                                      | Count becomes zero, revenue becomes ₹0, cancelled management link shows cancellation message        |
| Availability after cancellation                         | Karan’s 16:00 Hair spa slot appears again                                                           |
| Any stylist Beard trim at 13:00 during Meera’s break    | Karan assigned; confirmation shows 13:00–13:15 and ₹200                                             |
| Responsive home, booking and admin                      | Checked at 320, 768, 1024 and 1440 pixels; mobile admin controls stack vertically                   |

The intentionally rejected requests return 401/403/409 as appropriate. No unexpected JavaScript runtime errors were observed. The narrow admin layout was corrected after visual inspection. This is verification of the implemented assignment flows, not a claim that every possible input, browser or production load has been tested.

## Phone account update

The additional 13 automated tests cover account creation, duplicate-number rejection including concurrent signup, input validation, salted password hashes, durable sessions after reopening SQLite, login, logout, session rotation, session expiry, forged cookies, rate limiting and expiry of the rate-limit window, cross-origin rejection, Secure cookie configuration, safe redirect destinations, account ownership, and both appointment contact options. Public API booking and availability requests without a session return 401; the booking page redirects guests before serving its form.

| Browser flow                                  | Result                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Guest clicks Hair spa from home               | Redirects to login; selected service is preserved in the return destination                         |
| Sign-up with an existing phone number         | Clear duplicate-number message; no second account created                                           |
| Sign-in with wrong password                   | Clear credentials error; booking remains inaccessible                                               |
| Sign-in with the correct phone/password       | Returns to booking with Hair spa selected and the account name prefilled                            |
| Default account-number choice                 | Booking confirmation shows the account phone number                                                 |
| Select “Use another number”                   | Contact input appears and becomes required                                                          |
| Three-digit alternate contact                 | Native form validation rejects submission                                                           |
| Valid alternate contact                       | Confirmation shows the alternate phone; a later booking form still shows the original account phone |
| Reschedule alternate-contact booking          | Same booking ID and contact number retained at the new time                                         |
| Sign out, then reopen private management link | Redirects to sign-in instead of exposing the appointment                                            |
| Sign back in through that redirect            | Restores the saved management link and updated appointment                                          |

The sign-in and sign-up layouts were also checked at 320, 768, 1024 and 1440 pixels with no horizontal overflow.

These browser checks used a fictitious customer in a separate `auth-browser-qa.sqlite` database. Successful account creation and concurrent duplicate prevention were also verified through the API. Authentication is phone plus password; there is no SMS verification service.

## Admin account update

Ten additional automated tests cover unique assigned admin login IDs, duplicate admin phone rejection, password hashing, validation of login ID + phone + password together, separate customer/admin session stores, eight-hour expiry, owner-only provisioning, denial of guest/customer dashboard and API access, forged-cookie rejection, role switching and session revocation, rate limiting, cross-origin protection, revenue and cancellation. Legacy shared access keys do not grant dashboard access.

Browser verification used a fictitious admin and customer in `admin-browser-qa.sqlite`: a signed-in customer was redirected to admin sign-in; a wrong admin password failed; correct credentials opened the dashboard with dashboard-only navigation; the chosen day showed one Meera appointment and ₹400 revenue; cancellation changed totals to zero; refresh retained admin login; visiting `/book` returned the admin to the dashboard; sign-out and a later `/admin` visit returned to admin sign-in.

The owner setup command was checked both through environment-based provisioning and an interactive Windows terminal. Different admins received different login IDs; passwords and confirmation remained hidden. A Windows PTY raw-mode shutdown error found during testing was handled specifically during cleanup, and the CLI was rechecked to exit with code zero.
