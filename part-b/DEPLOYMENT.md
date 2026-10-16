# Deploy Slotbook: Vercel + Render + Supabase

The frontend runs on Vercel, the Node.js backend runs on Render, and Supabase PostgreSQL stores accounts, sessions and appointments. Local development can still use SQLite. No Supabase API key or database password goes into frontend code.

```text
Browser → Vercel frontend
              /api/* → Render backend → Supabase PostgreSQL
```

Vercel proxies API requests using its [Build Output API](https://vercel.com/docs/build-output-api/configuration). Host-only HttpOnly login cookies stay on the Vercel domain. Customer and admin permissions are enforced by the Render backend. The `slotbook` database schema is private and is not exposed through Supabase's public Data API.

## 1. Push the project to GitHub

Upload the complete repository, including `.github/workflows`, root `render.yaml`, and the `part-b` folder. Keep `part-b/package-lock.json` committed. Do not upload `.env`, database files, passwords or connection strings. Those files are excluded by `part-b/.gitignore`.

The included CI workflow runs on pushes and pull requests. It checks JavaScript syntax, runs the local SQLite/HTTP tests and Part A examples, runs PostgreSQL integration tests with a disposable database, verifies the Vercel build and audits production packages.

## 2. Create your Supabase database

1. Sign in to [Supabase](https://supabase.com/dashboard) and create a project on the Free plan. Choose a region near your Render service.
2. Set a strong **database password** and keep it private. This is different from your Supabase account password and your app admin password.
3. Open your project's **Connect** panel. Choose a PostgreSQL connection string and **Session pooler**, using port **5432**. Copy the connection string shown by your project. Session pooling provides IPv4 support for the long-running Render backend; see [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
4. Replace the password placeholder with your database password. URL-encode special characters in the password, for example `@` as `%40`. Keep the username, host and project reference exactly as supplied by Supabase.
5. Download the database CA certificate from the database SSL settings if required for your project's certificate chain. The backend verifies TLS certificates. Set `DATABASE_CA_CERT` to the complete PEM text including its BEGIN/END lines. The app also accepts literal `\n` between certificate lines. See [Supabase SSL settings](https://supabase.com/docs/guides/platform/ssl-enforcement).

Example shape only; use the actual host and reference from your project:

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:5432/postgres
```

No manual SQL paste is required: the backend creates the private schema, tables, indexes and seed services/stylists on first startup. Setup is idempotent and does not erase existing rows. Do not add `slotbook` to Supabase's exposed schemas or grant access to `anon`/`authenticated` roles. The app uses its own phone/password accounts; enabling Supabase Auth is unnecessary.

Existing local SQLite bookings are not automatically copied to Supabase. Your local database remains unchanged; the hosted database starts fresh.

## 3. Deploy the backend on Render

Use either the Blueprint or manual approach, not both.

### Blueprint

In [Render](https://dashboard.render.com), select **New → Blueprint**, connect the GitHub repository and use root `render.yaml`. It creates a Free Node.js web service rooted at `part-b` with the health path and environment settings below. Supply the requested database and frontend settings. If you have not created Vercel yet, use the Render backend's own HTTPS origin temporarily for `FRONTEND_ORIGINS`, then replace it after Step 4.

### Manual web service

Select **New → Web Service**, connect the GitHub repository and configure:

| Setting           | Value                |
| ----------------- | -------------------- |
| Root directory    | `part-b`             |
| Runtime           | Node                 |
| Instance type     | Free                 |
| Build command     | `npm ci`             |
| Start command     | `npm start`          |
| Health check path | `/api/health`        |
| Auto deploy       | After CI Checks Pass |

Set these environment variables:

| Variable           | Value                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `NODE_VERSION`     | `24.14.0` (or a newer supported Node 24 release)                                             |
| `HOST`             | `0.0.0.0`                                                                                    |
| `COOKIE_SECURE`    | `1`                                                                                          |
| `DATABASE_URL`     | Supabase **Session pooler** PostgreSQL connection string                                     |
| `DATABASE_CA_CERT` | Supabase CA PEM text; required if the certificate chain is not in Node's default trust store |
| `FRONTEND_ORIGINS` | Exact Vercel production origin, e.g. `https://your-salon.vercel.app`; no trailing slash      |

Render supplies `PORT`; leave that setting alone. Do not set `CORE_MODE`. Render startup intentionally refuses to fall back to ephemeral SQLite when `DATABASE_URL` is missing.

Copy the resulting backend URL, for example `https://your-slotbook-api.onrender.com`. Check `https://YOUR-BACKEND.onrender.com/api/health`; it must return `{"status":"ok"}`. This checks the database connection too.

If startup reports a TLS trust error, configure `DATABASE_CA_CERT`; do not disable certificate verification. If it cannot resolve the direct database host, use the Session pooler string. If it reports password authentication failure, recheck the pooler username and encoded database password.

## 4. Deploy the frontend on Vercel

1. In [Vercel](https://vercel.com/new), import the same GitHub repository.
2. Set **Root Directory** to `part-b`.
3. Use **Framework Preset: Other**. The committed `vercel.json` uses `npm ci` and `npm run build:vercel`.
4. Leave **Output Directory override disabled**. The build produces `.vercel/output` using Vercel's Build Output API; do not select `frontend` or `dist`.
5. Add environment variable **`RENDER_BACKEND_URL`** with your backend origin, for example `https://your-slotbook-api.onrender.com`. Set it for Production and Preview. Do not append `/api` or include a path/query/password.
6. Deploy and copy the production URL. Update Render's `FRONTEND_ORIGINS` to that exact origin, then save/redeploy Render.

Only `RENDER_BACKEND_URL` is needed on Vercel. **Never add `DATABASE_URL`, database passwords or admin credentials to Vercel frontend settings.** The Vercel build copies only `frontend/` into public output, not backend source or the database.

For a custom frontend domain, add its exact HTTPS origin to `FRONTEND_ORIGINS` as a comma-separated list. Preview deployments can display the frontend, but account-changing requests require that preview's exact origin to be explicitly included. No wildcard origin allowance is enabled.

## 5. Create an admin in the hosted database

Render Free does not provide shell access. Run the owner command on your computer against Supabase instead:

```powershell
cd part-b
npm ci
Copy-Item .env.example .env
```

Edit `.env`: uncomment and fill `DATABASE_URL` with the same Supabase connection string used by Render. Set `DATABASE_CA_CERT` if needed (quote multiline PEM text, or use literal `\n` between its lines). Set `FRONTEND_ORIGINS` to the deployed Vercel origin. Then run:

```powershell
npm run admin:create
```

Enter the admin name, 10-digit phone number and password twice. Save the generated `SB-ADM-...` login ID. Open **`https://YOUR-FRONTEND.vercel.app/admin/login`** and enter that ID, phone number and password. Repeat the command to add another admin. Existing mobile numbers are rejected; customer signup cannot create admins.

The CLI loads `.env` automatically. Remove or comment out `DATABASE_URL` in your local `.env` when you want to return to the original local SQLite database. Do not accidentally test or create demo bookings against your hosted database.

## 6. Optional scheduled Render health check

The committed `.github/workflows/render-health.yml` makes an HTTP request every ten minutes, at minutes 3, 13, 23, 33, 43 and 53. It is **disabled until you opt in**.

In your GitHub repository, open **Settings → Secrets and variables → Actions → Variables**. Add:

| Repository variable        | Value                               |
| -------------------------- | ----------------------------------- |
| `RENDER_BACKEND_URL`       | `https://YOUR-BACKEND.onrender.com` |
| `RENDER_KEEPALIVE_ENABLED` | `true`                              |

These are GitHub **repository variables**, separate from Vercel environment settings. No database credentials are needed by the health workflow. Keep the workflow on the repository's default branch. Under **Actions → Render health check (optional)**, select **Run workflow** to test it. Change `RENDER_KEEPALIVE_ENABLED` to `false` to disable health requests.

Render Free currently sleeps after **15 minutes**, not ten. A health request can reduce idle sleeps, but **it does not guarantee an always-on service**. Render can restart services, and its 750 monthly free instance hours are shared across the workspace. GitHub schedules can be delayed; public repositories disable schedules after 60 days without repository activity. Each run also consumes Actions usage: ten-minute checks mean about 4,320 runs in a 30-day month. Review the limits for your GitHub plan, especially for private repositories. See [Render Free limits](https://render.com/docs/free), [GitHub scheduled workflow limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Supabase Free can pause projects with low activity over seven days. This health endpoint queries the database, but no workflow guarantees exemption from platform pauses or quotas. Resume paused projects in Supabase and consider paid hosting if continuous availability is required. See [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

## 7. Verify the deployed app

On the **Vercel URL**, check:

1. Home page loads; all four treatments and prices display.
2. Guest booking opens customer login.
3. Signup succeeds; a duplicate phone is rejected; login survives refresh.
4. Book a future appointment with the account phone, then one with an alternate contact number.
5. Confirmation includes ID, contact, stylist, time and price.
6. Reschedule through the private management link and verify the same ID, new time and updated price.
7. Two signed-in browsers competing for the same slot produce only one successful booking.
8. Weekly days off, breaks, cleanup and past dates remain blocked.
9. A customer cannot access the admin dashboard/API.
10. Admin login shows the selected day's grouped bookings and revenue; cancellation restores availability.
11. Restart/redeploy Render, sign in again if needed, and verify accounts and bookings remain in Supabase.

For local automated checks:

```sh
cd part-b
npm ci
npm run check
npm test
RENDER_BACKEND_URL=https://example.onrender.com npm run build:vercel
```

The last line uses Bash environment syntax. In PowerShell, set `$env:RENDER_BACKEND_URL = "https://example.onrender.com"` before `npm run build:vercel`.

The PostgreSQL integration suite uses `npm run test:postgres` and requires `TEST_DATABASE_URL` pointing to a disposable database whose name ends in `_test`. It truncates test tables. CI creates its own PostgreSQL service; **never set this to a real Supabase project**.

Vercel's Git integration handles frontend deployments on push. Render's **After CI Checks Pass** setting gates backend auto-deployment on the GitHub checks. No deploy hook, cloud password or API token needs to be stored in GitHub Actions for this setup.
