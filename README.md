# Techsperia Test Case

Python problem-solving exercises in **Part A** and **Slotbook**, a salon booking web app, in **Part B**.

| Part | Contents                                                  | Requirements        | Documentation                     |
| ---- | --------------------------------------------------------- | ------------------- | --------------------------------- |
| A    | Pagination, duplicate leads, expense settlement           | Python 3            | [Part A README](part-a/README.md) |
| B    | Booking, customer accounts, rescheduling, admin dashboard | Node.js 24 or newer | [Part B README](part-b/README.md) |

## Run Part A

From the repository root:

```sh
python -X utf8 part-a/Pagination_bar_A1.py
python -X utf8 part-a/duplicate_leads_A3.py
python -X utf8 part-a/settle_up_A4.py
```

No third-party packages are needed. Each script includes sample input and prints its output.

## Run Part B

From the repository root:

```sh
cd part-b
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). One process serves the frontend and backend. `npm ci` installs the locked PostgreSQL driver; no frontend build is needed locally. SQLite is created and seeded on first run unless `DATABASE_URL` is set.

Open another terminal in `part-b` to create an admin:

```sh
npm run admin:create
```

Save the generated login ID, then use [admin login](http://localhost:3000/admin/login) with that ID, phone number and password.

## Verification

Part A's bundled examples were executed; their outputs are documented in its README. Part A has no separate automated test suite.

Part B includes 83 local SQLite/HTTP/deployment tests and a separate PostgreSQL integration suite. From `part-b`, run:

```sh
npm test
npm run check
```

See [browser verification and test coverage](part-b/TESTING.md) and [website walkthrough](part-b/walkthrough/README.md).

## Structure

```text
part-a/       Python solutions and README
part-b/
  backend/    Node.js API, SQLite storage and tests
  frontend/   HTML, CSS and browser JavaScript
  Dockerfile
  package.json
  README.md
  TESTING.md
```

## GitHub submission

Commit source code, documentation and test files. Part B's `.gitignore` excludes its local database, environment file, logs and `node_modules`. Keep real customer data and passwords out of the repository. A Dockerfile is included; no live deployment URL has been provisioned.

## Cloud deployment

Use Vercel for the frontend, Render for the backend and Supabase PostgreSQL for durable storage. Follow the [deployment guide](part-b/DEPLOYMENT.md), including the optional scheduled health workflow and free-plan limits.
