import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { createStore } from "./store.js";
import { appServer } from "./server.js";

const input = {
  serviceId: 1,
  stylistId: 1,
  date: "2030-01-08",
  time: "11:00",
  name: "Demo Customer",
  mobile: "9876543210",
};
test("bookings survive database close and reopen; seeding is idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "slotbook-"));
  try {
    let store = createStore(join(dir, "test.sqlite"));
    const b = store.book(input);
    store.db.close();
    store = createStore(join(dir, "test.sqlite"));
    assert.equal(store.get(b.id).name, input.name);
    assert.equal(store.services().length, 4);
    assert.ok(!store.availability(input).includes("11:00"));
    store.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("two independent SQLite connections racing for the same slot: exactly one succeeds", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slotbook-race-")),
    path = join(dir, "race.sqlite");
  const store = createStore(path);
  const ready = new SharedArrayBuffer(4),
    workers = [];
  try {
    const jobs = Array.from(
      { length: 2 },
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(
            `const {parentPort,workerData}=require('node:worker_threads');
        (async()=>{const {createStore}=await import(workerData.module);const store=createStore(workerData.path);
        const signal=new Int32Array(workerData.ready);parentPort.postMessage('ready');Atomics.wait(signal,0,0);
        try{store.book(workerData.input);parentPort.postMessage({success:true});}
        catch(e){parentPort.postMessage({success:false,status:e.status,message:e.message});}
        finally{store.db.close();}})().catch(e=>{throw e;});`,
            {
              eval: true,
              workerData: {
                module: new URL("./store.js", import.meta.url).href,
                path,
                input,
                ready,
              },
            },
          );
          workers.push(worker);
          worker.on("message", (message) => {
            if (message === "ready") {
              worker.isReady = true;
              if (workers.length === 2 && workers.every((w) => w.isReady)) {
                Atomics.store(new Int32Array(ready), 0, 1);
                Atomics.notify(new Int32Array(ready), 0);
              }
            } else resolve(message);
          });
          worker.on("error", reject);
        }),
    );
    const results = await Promise.all(jobs);
    assert.equal(results.filter((r) => r.success).length, 1);
    assert.equal(results.find((r) => !r.success).status, 409);
    assert.equal(store.day(input.date).groups[0].bookings.length, 1);
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("HTTP: validation, auth, concurrency, reschedule, revenue and cancellation", async () => {
  const store = createStore(":memory:");
  const server = appServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const session = await store.auth.signup({
    ...input,
    password: "TestSession2026",
  });
  const cookie = `slotbook_session=${session.token}`;
  const request = (path, body, headers = {}) =>
    fetch(origin + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        ...headers,
      },
      body: body
        ? JSON.stringify(
            path === "/api/bookings"
              ? { ...body, useAccountNumber: false }
              : body,
          )
        : undefined,
    });
  try {
    assert.equal((await request("/api/catalog")).status, 200);
    for (const route of [
      "/",
      "/book",
      "/book?service=2",
      "/admin",
      "/home.js",
      "/app.js",
      "/style.css",
    ]) {
      const page = await request(route);
      assert.equal(page.status, 200, route);
      assert.ok((await page.text()).length > 0);
    }
    assert.equal((await request("/unknown-page")).status, 404);
    assert.equal(
      (await request("/api/admin/bookings?date=" + input.date)).status,
      403,
    );
    assert.equal(
      (await request("/api/bookings", { ...input, mobile: "123" })).status,
      400,
    );
    const responses = await Promise.all([
      request("/api/bookings", input),
      request("/api/bookings", input),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    const b = await responses.find((r) => r.status === 201).json();
    assert.equal((await request(`/api/bookings/${b.id}`)).status, 403);
    const headers = { Authorization: `Bearer ${b.manage_token}` };
    assert.equal(
      (await request(`/api/bookings/${b.id}`, null, headers)).status,
      200,
    );
    assert.equal(
      (
        await request(`/api/bookings/${b.id}/reschedule`, {
          ...input,
          time: "12:00",
          token: b.manage_token,
        })
      ).status,
      200,
    );
    const adminAccount = await store.adminAuth.create({
      name: "Test Manager",
      mobile: "9876543290",
      password: "TestAdmin2026",
    });
    const adminSession = await store.adminAuth.login({
      loginId: adminAccount.loginId,
      mobile: adminAccount.mobile,
      password: "TestAdmin2026",
    });
    const admin = { Cookie: `slotbook_admin=${adminSession.token}` };
    const day = await (
      await request("/api/admin/bookings?date=" + input.date, null, admin)
    ).json();
    assert.equal(day.revenue, 400);
    assert.equal(day.groups[0].bookings[0].start, 720);
    assert.equal(day.groups[0].bookings[0].manage_token, undefined);
    assert.equal(
      (await request(`/api/admin/bookings/${b.id}/cancel`, {}, admin)).status,
      200,
    );
    const free = await (
      await request(
        `/api/availability?serviceId=1&stylistId=1&date=${input.date}`,
      )
    ).json();
    assert.ok(free.times.includes("12:00"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});
