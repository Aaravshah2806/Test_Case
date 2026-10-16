import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
const account = {
  name: "Salon Manager",
  mobile: "9876543290",
  password: "AdminTest2026",
};
test("admin provisioning assigns a unique login ID and stores a hashed password", async () => {
  const store = createStore(":memory:");
  try {
    const admin = await store.adminAuth.create(account);
    assert.match(admin.loginId, /^SB-ADM-[A-F0-9]{12}$/);
    assert.equal(admin.password, undefined);
    assert.match(
      store.db.prepare("SELECT password_hash FROM admins").get().password_hash,
      /^scrypt:/,
    );
    await assert.rejects(() => store.adminAuth.create(account), {
      status: 409,
    });
    const second = await store.adminAuth.create({
      ...account,
      mobile: "9876543291",
    });
    assert.notEqual(second.loginId, admin.loginId);
  } finally {
    store.db.close();
  }
});
test("admin login requires the correct login ID, phone and password together", async () => {
  const store = createStore(":memory:");
  try {
    const admin = await store.adminAuth.create(account);
    const input = { ...account, loginId: admin.loginId };
    for (const patch of [
      { loginId: "SB-ADM-000000000000" },
      { mobile: "1111111111" },
      { password: "WrongPassword" },
    ])
      await assert.rejects(
        () => store.adminAuth.login({ ...input, ...patch }),
        { status: 401 },
      );
    const login = await store.adminAuth.login({
      ...input,
      loginId: admin.loginId.toLowerCase(),
    });
    assert.equal(login.admin.loginId, admin.loginId);
    assert.ok(login.token);
    assert.equal(store.adminAuth.session(login.token).mobile, account.mobile);
    store.adminAuth.logout(login.token);
    assert.equal(store.adminAuth.session(login.token), null);
  } finally {
    store.db.close();
  }
});
test("customer sessions cannot become admin sessions, and admin sessions expire", async () => {
  let now = new Date("2030-01-01T00:00:00Z");
  const store = createStore(":memory:", { clock: () => now });
  try {
    const customer = await store.auth.signup(account);
    assert.equal(store.adminAuth.session(customer.token), null);
    const admin = await store.adminAuth.create(account);
    const session = await store.adminAuth.login({
      ...account,
      loginId: admin.loginId,
    });
    assert.equal(store.auth.session(session.token), null);
    now = new Date("2030-01-01T09:00:00Z");
    assert.equal(store.adminAuth.session(session.token), null);
  } finally {
    store.db.close();
  }
});
