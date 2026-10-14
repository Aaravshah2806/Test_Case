# Part B implementation checklist

All implementation tasks are pending user instruction. See plan.md for architecture and assumptions.

| Task | Depends on | Acceptance criteria | Verification |
|---|---|---|---|
| 1. Scaffold and database | None | Frontend/backend run; PostgreSQL migrations apply; seeds load once | Start services; run migrations/seeds twice and inspect rows |
| 2. Catalog selection | 1 | Real services, prices, stylists, and date controls appear | API responses and browser check |
| 3. Availability | 2 | 15-minute starts; whole service fits; booked intervals excluded | Focused scheduling tests and browser check |
| 4. Booking validation | 3 | Name and exactly ten digits validated by UI/API | Invalid UI submissions and direct API requests |
| 5. Persistence and confirmation | 4 | Database save, correct confirmation, conflict protection | Restart persistence and concurrent requests |
| 6. Customer flow polish | 5 | Loading, empty slots, errors, and availability refresh work | End-to-end walkthrough and frontend build |
| 7. Real-world scheduling | Level 1 gate | Days off, breaks, cleanup, and past-time rejection work | Boundary tests with controlled clock |
| 8. Admin day view | 7 | Protected daily grouping and confirmed revenue are correct | Authorized/unauthorized API checks and UI walkthrough |
| 9. Cancellation | 8 | Record retained; slot freed; revenue updated | Cancel then requery availability and admin totals |
| 10. Any stylist bonus | Level 2 gate | Combined starts and balanced eligible assignment | Union/tie-break/competing-request tests |
| 11. Reschedule bonus | 10 | ID preserved; failed move retains old appointment | Success, conflict, and concurrent move tests |
| 12. Bonus test evidence | 11 | Unit and PostgreSQL concurrency tests documented | Run suites and record results |
| 13. Deployment bonus | 12 | Live frontend/API/database flow succeeds | Production smoke test, subject to hosting access |
| 14. Submission documentation | Each completed level | Setup, scope, assumptions, commits, demo script ready | Follow README from fresh setup |

- [ ] Tasks 1–3 complete; foundation checkpoint passed.
- [ ] Tasks 4–6 complete; Level 1 fully verified and committed BEFORE task 7.
- [ ] Tasks 7–9 complete; Level 2 fully verified and committed BEFORE bonuses.
- [ ] Optional bonus scope completed or explicitly recorded as skipped.
- [ ] README and demo script ready; repository publishing/recording handled with user instructions.
