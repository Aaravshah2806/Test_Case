import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { appServer } from "./server.js";
import { safeNext } from "../frontend/auth-ui.js";
const account = {
  name: "Phone Customer",
  mobile: "9876543210",
  password: "TestPassword2026",
};
const booking = {
  name: account.name,
  serviceId: 1,
  stylistId: 1,
  date: "2030-01-08",
  time: "10:00",
};
async function fixture(run, options = {}) {
  let now = new Date("2030-01-01T00:00:00Z");
  const store = createStore(":memory:", { clock: () => now });
  const server = appServer(store, options);
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
test("guests are redirected before seeing booking and cannot call protected APIs", () =>
  fixture(async ({ request }) => {
    const response = await request("/book?service=2", { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "/login?next=%2Fbook%3Fservice%3D2",
    );
    assert.equal((await request("/login")).status, 200);
    assert.equal((await request("/")).status, 200);
    assert.equal(
      (await request("/api/bookings", { body: booking })).status,
      401,
    );
    assert.equal(
      (
        await request(
          "/api/availability?serviceId=1&stylistId=1&date=2030-01-08",
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request(
          "/api/bookings/00000000-0000-0000-0000-000000000000/reschedule",
          { body: {} },
        )
      ).status,
      401,
    );
  }));
test("signup returns an HttpOnly session, duplicate phone is rejected, login and logout work", () =>
  fixture(async ({ request, store }) => {
    const signup = await request("/api/auth/signup", { body: account });
    assert.equal(signup.status, 201);
    const payload = await signup.json();
    assert.equal(payload.customer.mobile, account.mobile);
    assert.equal(payload.token, undefined);
    assert.equal(payload.customer.password_hash, undefined);
    assert.match(signup.headers.get("set-cookie"), /HttpOnly/);
    assert.match(signup.headers.get("set-cookie"), /SameSite=Lax/);
    const cookie = cookieFrom(signup);
    assert.equal(
      (await (await request("/api/auth/session", { cookie })).json()).customer
        .mobile,
      account.mobile,
    );
    assert.equal(
      (await request("/api/auth/signup", { body: account })).status,
      409,
    );
    assert.equal(
      (
        await request("/api/auth/login", {
          body: { ...account, password: "WrongPassword" },
        })
      ).status,
      401,
    );
    const login = await request("/api/auth/login", { body: account, cookie });
    assert.equal(login.status, 200);
    const newCookie = cookieFrom(login);
    assert.notEqual(newCookie, cookie);
    assert.equal(
      (await (await request("/api/auth/session", { cookie })).json()).customer,
      null,
    );
    const logout = await request("/api/auth/logout", {
      method: "POST",
      cookie: newCookie,
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(
      (await request("/api/bookings", { body: booking, cookie: newCookie }))
        .status,
      401,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) AS total FROM customers").get().total,
      1,
    );
  }));
test("booking uses account phone or validates a different phone without changing the account", () =>
  fixture(async ({ request, store }) => {
    const cookie = cookieFrom(
      await request("/api/auth/signup", { body: account }),
    );
    const own = await request("/api/bookings", {
      cookie,
      body: { ...booking, useAccountNumber: true, mobile: "1111111111" },
    });
    assert.equal(own.status, 201);
    const first = await own.json();
    assert.equal(first.mobile, account.mobile);
    assert.ok(first.customer_id);
    const another = await request("/api/bookings", {
      cookie,
      body: {
        ...booking,
        time: "11:00",
        useAccountNumber: false,
        mobile: "9123456789",
      },
    });
    assert.equal(another.status, 201);
    const second = await another.json();
    assert.equal(second.mobile, "9123456789");
    assert.equal(second.customer_id, first.customer_id);
    assert.equal(
      (await (await request("/api/auth/session", { cookie })).json()).customer
        .mobile,
      account.mobile,
    );
    for (const patch of [
      { mobile: "123" },
      { mobile: 9123456789 },
      { mobile: "" },
      { useAccountNumber: "true", mobile: "9123456789" },
    ])
      assert.equal(
        (
          await request("/api/bookings", {
            cookie,
            body: {
              ...booking,
              time: "12:00",
              useAccountNumber: false,
              ...patch,
            },
          })
        ).status,
        400,
      );
    assert.equal(
      store.db.prepare("SELECT count(*) AS total FROM bookings").get().total,
      2,
    );
  }));
test("a different logged-in account cannot manage another account appointment even with its link", () =>
  fixture(async ({ request }) => {
    const cookie = cookieFrom(
      await request("/api/auth/signup", { body: account }),
    );
    const b = await (
      await request("/api/bookings", { cookie, body: booking })
    ).json();
    const otherCookie = cookieFrom(
      await request("/api/auth/signup", {
        body: { ...account, mobile: "9876543211", name: "Other Customer" },
      }),
    );
    const auth = { Authorization: `Bearer ${b.manage_token}` };
    assert.equal(
      (
        await request(`/api/bookings/${b.id}`, {
          cookie: otherCookie,
          headers: auth,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(`/api/bookings/${b.id}/reschedule`, {
          cookie: otherCookie,
          body: { ...booking, time: "12:00", token: b.manage_token },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/availability?serviceId=1&stylistId=1&date=${booking.date}&exclude=${b.id}`,
          { cookie: otherCookie, headers: auth },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(`/api/bookings/${b.id}/reschedule`, {
          cookie,
          body: { ...booking, time: "12:00", token: b.manage_token },
        })
      ).status,
      200,
    );
  }));
test("expired or forged cookies cannot bypass booking protection", () =>
  fixture(async ({ request, setNow }) => {
    const cookie = cookieFrom(
      await request("/api/auth/signup", { body: account }),
    );
    setNow("2030-01-09T00:00:00Z");
    assert.equal(
      (await request("/api/bookings", { cookie, body: booking })).status,
      401,
    );
    assert.equal(
      (
        await request("/api/bookings", {
          cookie: "slotbook_session=forged",
          body: booking,
        })
      ).status,
      401,
    );
  }));
test("auth rate limits are enforced and expire after fifteen minutes", () =>
  fixture(async ({ request, setNow }) => {
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await request("/api/auth/login", {
            body: { mobile: "bad", password: "bad" },
          })
        ).status,
        400,
      );
    assert.equal(
      (await request("/api/auth/login", { body: account })).status,
      429,
    );
    setNow("2030-01-01T00:16:00Z");
    assert.equal(
      (await request("/api/auth/login", { body: account })).status,
      401,
    );
  }));
test("auth rejects cross-origin signup and logout; HTTPS deployments can require Secure cookies", () =>
  fixture(
    async ({ request }) => {
      assert.equal(
        (
          await request("/api/auth/signup", {
            body: account,
            headers: { Origin: "https://other.example" },
          })
        ).status,
        403,
      );
      const signup = await request("/api/auth/signup", { body: account });
      assert.match(signup.headers.get("set-cookie"), /; Secure/);
      assert.equal(
        (
          await request("/api/auth/logout", {
            method: "POST",
            cookie: cookieFrom(signup),
            headers: { Origin: "https://other.example" },
          })
        ).status,
        403,
      );
    },
    { secureCookies: true },
  ));
test("post-login destinations preserve treatment and management link but never redirect off-site", () => {
  const origin = "http://localhost:3000";
  assert.equal(
    safeNext("/book?service=2#manage=test", origin),
    "/book?service=2#manage=test",
  );
  for (const value of [
    "https://other.example/book",
    "//other.example/book",
    "javascript:alert(1)",
    "/admin",
    "/login",
  ])
    assert.equal(safeNext(value, origin), "/book");
});
