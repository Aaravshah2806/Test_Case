import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { appServer } from "./server.js";
const account = {
  name: "Salon Manager",
  mobile: "9876543290",
  password: "AdminTest2026",
};
const customer = {
  name: "Test Customer",
  mobile: "9876543210",
  password: "CustomerTest2026",
};
async function fixture(run, options = {}) {
  let now = new Date("2030-01-01T00:00:00Z");
  const store = createStore(":memory:", { clock: () => now }),
    server = appServer(store, options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { body, cookie, headers, method, ...rest } = {}) =>
    fetch(origin + path, {
      ...rest,
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    await run({
      request,
      store,
      setNow: (value) => {
        now = new Date(value);
      },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
}
const cookieFrom = (response) =>
  response.headers.get("set-cookie").split(";")[0];
test("guest and customer requests cannot view the dashboard or use admin APIs", () =>
  fixture(async ({ request }) => {
    const signup = await request("/api/auth/signup", { body: customer }),
      cookie = cookieFrom(signup);
    for (const current of [undefined, cookie]) {
      const dashboard = await request("/admin", {
        cookie: current,
        redirect: "manual",
      });
      assert.equal(dashboard.status, 302);
      assert.equal(dashboard.headers.get("location"), "/admin/login");
      for (const path of [
        "/api/admin/bookings?date=2030-01-08",
        "/api/admin/anything",
      ])
        assert.equal(
          (
            await request(path, {
              cookie: current,
              headers: { "X-Admin-Key": "legacy-key" },
            })
          ).status,
          current ? 403 : 401,
        );
      assert.equal(
        (
          await request(
            "/api/admin/bookings/00000000-0000-0000-0000-000000000000/cancel",
            { cookie: current, body: {} },
          )
        ).status,
        current ? 403 : 401,
      );
    }
  }));
test("admin signin requires all three credentials and opens its own protected dashboard", () =>
  fixture(async ({ request, store }) => {
    const admin = await store.adminAuth.create(account),
      input = { ...account, loginId: admin.loginId };
    for (const patch of [
      { loginId: "SB-ADM-000000000000" },
      { mobile: "1111111111" },
      { password: "WrongPassword" },
    ])
      assert.equal(
        (
          await request("/api/admin/auth/login", {
            body: { ...input, ...patch },
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await request("/api/admin/auth/login", {
          body: { mobile: account.mobile, password: account.password },
        })
      ).status,
      400,
    );
    const login = await request("/api/admin/auth/login", { body: input });
    assert.equal(login.status, 200);
    const json = await login.json(),
      cookie = cookieFrom(login);
    assert.equal(json.admin.loginId, admin.loginId);
    assert.equal(json.token, undefined);
    assert.equal(json.admin.password_hash, undefined);
    assert.match(login.headers.get("set-cookie"), /slotbook_admin=/);
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    assert.match(login.headers.get("set-cookie"), /SameSite=Lax/);
    assert.equal(
      (await request("/admin", { cookie, redirect: "manual" })).status,
      200,
    );
    for (const route of ["/", "/book", "/login"])
      assert.equal(
        (await request(route, { cookie, redirect: "manual" })).headers.get(
          "location",
        ),
        "/admin",
      );
    assert.equal(
      (
        await request(
          "/api/availability?serviceId=1&stylistId=1&date=2030-01-08",
          { cookie },
        )
      ).status,
      403,
    );
    const session = await (
      await request("/api/auth/session", { cookie })
    ).json();
    assert.equal(session.customer, null);
    assert.equal(session.admin.loginId, admin.loginId);
  }));
test("an admin session can inspect revenue and cancel bookings; logout revokes access", () =>
  fixture(async ({ request, store }) => {
    const admin = await store.adminAuth.create(account),
      login = await request("/api/admin/auth/login", {
        body: { ...account, loginId: admin.loginId },
      }),
      cookie = cookieFrom(login);
    const b = store.book({
      name: customer.name,
      mobile: customer.mobile,
      serviceId: 1,
      stylistId: 1,
      date: "2030-01-08",
      time: "10:00",
    });
    const day = await (
      await request("/api/admin/bookings?date=" + b.date, { cookie })
    ).json();
    assert.equal(day.revenue, 400);
    assert.equal(day.groups[0].bookings.length, 1);
    assert.equal(day.groups[0].bookings[0].manage_token, undefined);
    assert.equal(
      (
        await request(`/api/admin/bookings/${b.id}/cancel`, {
          cookie,
          body: {},
        })
      ).status,
      200,
    );
    assert.equal(store.day(b.date).revenue, 0);
    assert.ok(
      store
        .availability({ serviceId: 1, stylistId: 1, date: b.date })
        .includes("10:00"),
    );
    const logout = await request("/api/admin/auth/logout", {
      cookie,
      method: "POST",
    });
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(
      (await request("/api/admin/bookings?date=" + b.date, { cookie })).status,
      401,
    );
    assert.equal(
      (await request("/admin", { cookie, redirect: "manual" })).status,
      302,
    );
  }));
test("customer signup cannot assign admin privileges or create admin accounts", () =>
  fixture(async ({ request, store }) => {
    const response = await request("/api/auth/signup", {
      body: {
        ...customer,
        role: "admin",
        admin: true,
        loginId: "SB-ADM-000000000000",
      },
    });
    assert.equal(response.status, 201);
    const cookie = cookieFrom(response);
    assert.equal(
      (await request("/api/admin/bookings?date=2030-01-08", { cookie })).status,
      403,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) AS total FROM admins").get().total,
      0,
    );
    assert.equal(
      (await request("/api/admin/auth/signup", { cookie, body: account }))
        .status,
      403,
    );
  }));
test("customer credentials cannot sign in as admin and forged admin cookies are rejected", () =>
  fixture(async ({ request }) => {
    const signup = await request("/api/auth/signup", { body: customer }),
      cookie = cookieFrom(signup);
    assert.equal(
      (
        await request("/api/admin/auth/login", {
          body: { ...customer, loginId: "SB-ADM-000000000000" },
        })
      ).status,
      401,
    );
    const customerToken = cookie.split("=")[1];
    for (const forged of [
      `slotbook_admin=${customerToken}`,
      "slotbook_admin=forged",
    ])
      assert.equal(
        (
          await request("/api/admin/bookings?date=2030-01-08", {
            cookie: forged,
          })
        ).status,
        401,
      );
  }));
test("signing into either role revokes the previous role session", () =>
  fixture(async ({ request, store }) => {
    const admin = await store.adminAuth.create(account);
    const customerCookie = cookieFrom(
      await request("/api/auth/signup", { body: customer }),
    );
    const login = await request("/api/admin/auth/login", {
        cookie: customerCookie,
        body: { ...account, loginId: admin.loginId },
      }),
      adminCookie = cookieFrom(login);
    assert.equal(
      (
        await (
          await request("/api/auth/session", { cookie: customerCookie })
        ).json()
      ).customer,
      null,
    );
    const customerLogin = await request("/api/auth/login", {
      cookie: adminCookie,
      body: customer,
    });
    assert.equal(customerLogin.status, 200);
    assert.equal(
      (
        await request("/api/admin/bookings?date=2030-01-08", {
          cookie: adminCookie,
        })
      ).status,
      401,
    );
  }));
test("admin sessions expire, login is rate limited and cross-site requests are rejected", () =>
  fixture(async ({ request, store, setNow }) => {
    const admin = await store.adminAuth.create(account),
      input = { ...account, loginId: admin.loginId };
    assert.equal(
      (
        await request("/api/admin/auth/login", {
          body: input,
          headers: { Origin: "https://different.example" },
        })
      ).status,
      403,
    );
    const login = await request("/api/admin/auth/login", { body: input }),
      cookie = cookieFrom(login);
    setNow("2030-01-01T09:00:00Z");
    assert.equal(
      (await request("/api/admin/bookings?date=2030-01-08", { cookie })).status,
      401,
    );
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await request("/api/admin/auth/login", {
            body: { mobile: "bad", password: "bad", loginId: "bad" },
          })
        ).status,
        400,
      );
    assert.equal(
      (await request("/api/admin/auth/login", { body: input })).status,
      429,
    );
    setNow("2030-01-01T09:16:00Z");
    assert.equal(
      (await request("/api/admin/auth/login", { body: input })).status,
      200,
    );
  }));
