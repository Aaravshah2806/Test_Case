import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const account = {
  name: "Account Customer",
  mobile: "9876543210",
  password: "TestingPass2026",
};
test("phone signup creates one unique account with hashed credentials", async () => {
  const store = createStore(":memory:");
  try {
    const result = await store.auth.signup(account);
    assert.equal(result.customer.mobile, account.mobile);
    assert.ok(result.token);
    const row = store.db.prepare("SELECT * FROM customers").get();
    assert.notEqual(row.password_hash, account.password);
    assert.match(row.password_hash, /^scrypt:/);
    await assert.rejects(() => store.auth.signup(account), { status: 409 });
    assert.equal(
      store.db.prepare("SELECT count(*) AS total FROM customers").get().total,
      1,
    );
  } finally {
    store.db.close();
  }
});
test("login validates password, rotates sessions, expires sessions and logout revokes access", async () => {
  let now = new Date("2030-01-01T00:00:00Z");
  const store = createStore(":memory:", { clock: () => now });
  try {
    const first = await store.auth.signup(account);
    assert.equal(store.auth.session(first.token).mobile, account.mobile);
    await assert.rejects(
      () => store.auth.login({ ...account, password: "WrongPass2026" }),
      { status: 401 },
    );
    await assert.rejects(
      () => store.auth.login({ ...account, mobile: "1111111111" }),
      { status: 401 },
    );
    const login = await store.auth.login(account);
    assert.notEqual(login.token, first.token);
    store.auth.logout(login.token);
    assert.equal(store.auth.session(login.token), null);
    now = new Date("2030-01-09T00:00:00Z");
    assert.equal(store.auth.session(first.token), null);
  } finally {
    store.db.close();
  }
});
test("signup validates customer name, exact phone format and password length", async () => {
  const store = createStore(":memory:");
  try {
    for (const values of [
      { name: " " },
      { name: "123" },
      { mobile: "123" },
      { mobile: 9876543210 },
      { password: "short" },
      { password: "a".repeat(129) },
    ])
      await assert.rejects(() => store.auth.signup({ ...account, ...values }), {
        status: 400,
      });
  } finally {
    store.db.close();
  }
});
test("concurrent signups for one phone number cannot create two accounts", async () => {
  const store = createStore(":memory:");
  try {
    const results = await Promise.allSettled([
      store.auth.signup(account),
      store.auth.signup(account),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.find((r) => r.status === "rejected").reason.status,
      409,
    );
  } finally {
    store.db.close();
  }
});
test("accounts and unexpired sessions survive a database reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slotbook-auth-")),
    path = join(dir, "test.sqlite");
  let store;
  try {
    store = createStore(path);
    const result = await store.auth.signup(account);
    store.db.close();
    store = createStore(path);
    assert.equal(store.auth.session(result.token).mobile, account.mobile);
    assert.equal(
      (await store.auth.login(account)).customer.id,
      result.customer.id,
    );
  } finally {
    store?.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
