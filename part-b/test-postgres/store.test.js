import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  createPostgresStore,
  postgresOptions,
} from "../backend/postgres-store.js";
import { appServer } from "../backend/server.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "Set TEST_DATABASE_URL to a disposable database whose name ends in _test. Never use a real Supabase database for this destructive test suite.",
  );
const now = () => new Date("2030-01-01T00:00:00Z");
const input = {
  serviceId: 1,
  stylistId: 1,
  date: "2030-01-08",
  time: "10:00",
  name: "Test Customer",
  mobile: "9876543210",
};
const account = {
  name: "Test Customer",
  mobile: "9876543210",
  password: "PostgresTest2026",
};
async function reset() {
  const pool = new Pool(postgresOptions(url));
  try {
    await pool.query(
      "TRUNCATE slotbook.bookings,slotbook.customer_sessions,slotbook.admin_sessions,slotbook.customers,slotbook.admins,slotbook.auth_limits RESTART IDENTITY CASCADE",
    );
  } finally {
    await pool.end();
  }
}
test("PostgreSQL deployment flows against a real database", async (t) => {
  let store = await createPostgresStore(url, { clock: now });
  await reset();
  try {
    await t.test(
      "seeds, working days, breaks, cleanup and past dates",
      async () => {
        assert.equal((await store.services()).length, 4);
        assert.equal((await store.stylists()).length, 2);
        assert.deepEqual(
          await store.availability({ ...input, date: "2030-01-06" }),
          [],
        );
        assert.deepEqual(
          await store.availability({ ...input, date: "2020-01-01" }),
          [],
        );
        assert.ok(!(await store.availability(input)).includes("13:00"));
        assert.ok(
          !(await store.availability({ ...input, stylistId: 2 })).includes(
            "15:00",
          ),
        );
      },
    );
    await t.test(
      "duplicate signup, hashed passwords, login and session persistence after reconnect",
      async () => {
        const a = await store.auth.signup(account);
        await assert.rejects(
          store.auth.signup(account),
          (e) => e.status === 409,
        );
        await assert.rejects(
          store.auth.login({ ...account, password: "IncorrectPassword" }),
          (e) => e.status === 401,
        );
        const token = (await store.auth.login(account)).token;
        await store.close();
        store = await createPostgresStore(url, { clock: now });
        assert.equal((await store.auth.session(token)).id, a.customer.id);
        await store.auth.logout(token);
        assert.equal(await store.auth.session(token), null);
      },
    );
    await t.test(
      "booking persists, reschedules atomically, cancellation restores time",
      async () => {
        const customer = (await store.auth.login(account)).customer;
        let b = await store.book(input, customer.id);
        assert.equal(b.price, 400);
        assert.equal(b.customer_id, customer.id);
        assert.ok(!(await store.availability(input)).includes("10:30"));
        await store.close();
        store = await createPostgresStore(url, { clock: now });
        assert.equal((await store.get(b.id)).mobile, input.mobile);
        b = await store.reschedule(
          b.id,
          { ...input, serviceId: 4, time: "14:00" },
          b.manage_token,
        );
        assert.equal(b.price, 900);
        assert.equal(b.start, 840);
        assert.ok((await store.availability(input)).includes("10:00"));
        const original = await store.get(b.id);
        await assert.rejects(
          store.reschedule(b.id, { ...input, time: "13:00" }, b.manage_token),
          (e) => e.status === 409,
        );
        assert.deepEqual(await store.get(b.id), original);
        assert.equal((await store.day(input.date)).revenue, 900);
        assert.ok(
          !(await store.day(input.date)).groups[0].bookings[0].manage_token,
        );
        await store.cancel(b.id);
        assert.equal((await store.day(input.date)).revenue, 0);
        assert.ok(
          (await store.availability({ ...input, serviceId: 4 })).includes(
            "14:00",
          ),
        );
      },
    );
    await t.test(
      "concurrent bookings from independent pools: exactly one succeeds",
      async () => {
        await reset();
        const other = await createPostgresStore(url, { clock: now });
        try {
          const result = await Promise.allSettled([
            store.book(input),
            other.book(input),
          ]);
          assert.equal(
            result.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(
            result.find((r) => r.status === "rejected").reason.status,
            409,
          );
        } finally {
          await other.close();
        }
      },
    );
    await t.test(
      "Any stylist selects eligible stylist and least-booked stylist",
      async () => {
        await reset();
        const b = await store.book({
          ...input,
          stylistId: "any",
          serviceId: 3,
          time: "13:00",
        });
        assert.equal(b.stylist_id, 2);
        const next = await store.book({
          ...input,
          stylistId: "any",
          serviceId: 3,
          time: "11:00",
        });
        assert.equal(next.stylist_id, 1);
      },
    );
    await t.test(
      "concurrent reschedules and cancellation remain consistent",
      async () => {
        await reset();
        const a = await store.book(input),
          b = await store.book({ ...input, time: "11:00" });
        const result = await Promise.allSettled([
          store.reschedule(a.id, { ...input, time: "14:00" }, a.manage_token),
          store.reschedule(b.id, { ...input, time: "14:00" }, b.manage_token),
        ]);
        assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          result.find((r) => r.status === "rejected").reason.status,
          409,
        );
        const failed = result[0].status === "rejected" ? a : b;
        assert.equal((await store.get(failed.id)).start, failed.start);
      },
    );
    await t.test("atomic concurrent signup and rate limiting", async () => {
      await reset();
      const result = await Promise.allSettled([
        store.auth.signup(account),
        store.auth.signup(account),
      ]);
      assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        result.find((r) => r.status === "rejected").reason.status,
        409,
      );
      const attempts = await Promise.allSettled(
        Array.from({ length: 12 }, () => store.auth.rateLimit("same-client")),
      );
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 10);
      assert.equal(attempts.filter((r) => r.status === "rejected").length, 2);
    });
    await t.test(
      "HTTP customer/admin login, phone choices, ownership, rescheduling and cancellation",
      async () => {
        await reset();
        const server = appServer(store, {
          frontendOrigins: "https://salon.vercel.app",
          secureCookies: true,
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const root = `http://127.0.0.1:${server.address().port}`;
        const request = (path, body, cookie = "") =>
          fetch(root + path, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "https://salon.vercel.app",
              Cookie: cookie,
            },
            body: JSON.stringify(body),
          });
        try {
          assert.equal((await fetch(root + "/api/health")).status, 200);
          assert.equal((await request("/api/bookings", input)).status, 401);
          const signup = await request("/api/auth/signup", account);
          assert.equal(signup.status, 201);
          assert.match(signup.headers.get("set-cookie"), /Secure/);
          const cookie = signup.headers.get("set-cookie").split(";")[0];
          const response = await request(
            "/api/bookings",
            { ...input, mobile: "9123456789", useAccountNumber: false },
            cookie,
          );
          assert.equal(response.status, 201);
          const b = await response.json();
          assert.equal(b.mobile, "9123456789");
          assert.equal(
            (
              await request(
                `/api/bookings/${b.id}/reschedule`,
                { ...input, time: "14:00", token: b.manage_token },
                cookie,
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await fetch(root + "/api/admin/bookings?date=" + input.date, {
                headers: { Cookie: cookie },
              })
            ).status,
            403,
          );
          const other = await request("/api/auth/signup", {
            ...account,
            mobile: "9876543211",
          });
          const otherCookie = other.headers.get("set-cookie").split(";")[0];
          assert.equal(
            (
              await request(
                `/api/bookings/${b.id}/reschedule`,
                { ...input, time: "16:00", token: b.manage_token },
                otherCookie,
              )
            ).status,
            403,
          );
          const admin = await store.adminAuth.create(account);
          const adminLogin = await request("/api/admin/auth/login", {
            ...account,
            loginId: admin.loginId,
          });
          assert.equal(adminLogin.status, 200);
          const adminCookie = adminLogin.headers
            .getSetCookie()
            .find((c) => c.startsWith("slotbook_admin="))
            .split(";")[0];
          const dashboard = await fetch(
            root + "/api/admin/bookings?date=" + input.date,
            { headers: { Cookie: adminCookie } },
          );
          assert.equal((await dashboard.json()).revenue, 400);
          assert.equal(
            (
              await request(
                `/api/admin/bookings/${b.id}/cancel`,
                {},
                adminCookie,
              )
            ).status,
            200,
          );
          assert.equal((await store.day(input.date)).revenue, 0);
          await request("/api/admin/auth/logout", {}, adminCookie);
          assert.equal(
            (
              await fetch(root + "/api/admin/bookings?date=" + input.date, {
                headers: { Cookie: adminCookie },
              })
            ).status,
            401,
          );
        } finally {
          await new Promise((resolve) => server.close(resolve));
        }
      },
    );
  } finally {
    await store.close();
  }
});
