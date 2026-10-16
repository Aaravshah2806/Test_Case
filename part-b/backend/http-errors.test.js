import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { appServer } from "./server.js";

async function fixture(run) {
  const store = createStore(":memory:", {
    clock: () => new Date("2030-01-01T00:00:00Z"),
  });
  const server = appServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const session = await store.auth.signup({
      name: "HTTP Test",
      mobile: "9876543210",
      password: "TestSession2026",
    });
    const authenticatedFetch = (url, options = {}) =>
      globalThis.fetch(url, {
        ...options,
        headers: {
          Cookie: `slotbook_session=${session.token}`,
          ...options.headers,
        },
      });
    const authenticatedPost = (origin, path, body, headers = {}) =>
      authenticatedFetch(origin + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(
          path === "/api/bookings"
            ? { ...body, useAccountNumber: false }
            : body,
        ),
      });
    await run(
      `http://127.0.0.1:${server.address().port}`,
      store,
      authenticatedPost,
      authenticatedFetch,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
}
const input = {
  serviceId: 1,
  stylistId: 1,
  date: "2030-01-08",
  time: "10:00",
  name: "HTTP Customer",
  mobile: "9876543210",
};
test("HTTP rejects malformed JSON, non-object payloads, wrong media types, oversized input and foreign origins", () =>
  fixture(async (origin, store, post, fetch) => {
    for (const body of ["{", "null", "[]", '"text"'])
      assert.equal(
        (
          await fetch(origin + "/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await fetch(origin + "/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(input),
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await post(origin, "/api/bookings", {
          ...input,
          name: "A".repeat(9000),
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await post(origin, "/api/bookings", input, {
          Origin: "https://different-site.example",
        })
      ).status,
      403,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) AS total FROM bookings").get().total,
      0,
    );
    assert.equal(
      (await (await fetch(origin + "/api/catalog")).json()).today,
      "2030-01-01",
    );
  }));
test("HTTP prevents unauthorised reschedule, exclusion and admin cancellation", () =>
  fixture(async (origin, store, post, fetch) => {
    const b = store.book(input);
    assert.equal(
      (
        await post(origin, `/api/bookings/${b.id}/reschedule`, {
          ...input,
          time: "11:00",
          token: "wrong",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(
          origin +
            `/api/availability?serviceId=1&stylistId=1&date=${input.date}&exclude=${b.id}`,
        )
      ).status,
      403,
    );
    assert.equal(
      (await post(origin, `/api/admin/bookings/${b.id}/cancel`, {})).status,
      403,
    );
    assert.equal(
      (
        await post(
          origin,
          `/api/admin/bookings/${b.id}/cancel`,
          {},
          { "X-Admin-Key": "wrong" },
        )
      ).status,
      403,
    );
    assert.equal(store.get(b.id).status, "confirmed");
    assert.equal(store.get(b.id).start, 600);
  }));
test("HTTP rejects invalid reschedule targets and keeps the complete original record", () =>
  fixture(async (origin, store, post) => {
    const b = store.book(input);
    for (const values of [
      { date: "2030-02-30" },
      { serviceId: 100 },
      { stylistId: 100 },
      { time: "13:00" },
      { time: "10:07" },
      { date: "2029-12-31" },
    ]) {
      const response = await post(origin, `/api/bookings/${b.id}/reschedule`, {
        ...input,
        ...values,
        token: b.manage_token,
      });
      assert.ok([400, 409].includes(response.status));
      assert.deepEqual(store.get(b.id), b);
    }
  }));
test("HTTP concurrent reschedules to one slot: only one moves; the other retains its original time", () =>
  fixture(async (origin, store, post) => {
    const first = store.book(input),
      second = store.book({ ...input, time: "11:00" });
    const responses = await Promise.all(
      [first, second].map((b) =>
        post(origin, `/api/bookings/${b.id}/reschedule`, {
          ...input,
          time: "14:00",
          token: b.manage_token,
        }),
      ),
    );
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const moved = await responses.find((r) => r.status === 200).json();
    assert.equal(store.get(moved.id).start, 840);
    const unchanged = first.id === moved.id ? second : first;
    assert.deepEqual(store.get(unchanged.id), unchanged);
    assert.equal(store.day(input.date).revenue, 800);
  }));
