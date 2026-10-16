import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { appServer } from "./server.js";
import { deploymentConfig } from "../scripts/build-vercel.js";
import { postgresOptions } from "./postgres-store.js";
import { runtimeStore } from "./runtime-store.js";

test("Vercel build keeps API separate from pages and refuses unsafe backend URLs", () => {
  const config = deploymentConfig("https://salon.onrender.com");
  assert.equal(
    config.routes.find((r) => r.src === "/api/(.*)").dest,
    "https://salon.onrender.com/api/$1",
  );
  assert.equal(config.routes.at(-1).status, 404);
  for (const url of [
    "http://salon.onrender.com",
    "https://salon.onrender.com/path",
    "https://user:pass@salon.onrender.com",
    "https://salon.onrender.com?secret=x",
  ])
    assert.throws(() => deploymentConfig(url));
});
test("PostgreSQL verifies TLS remotely, supports CA and restricts unencrypted mode to localhost", () => {
  assert.equal(
    postgresOptions("postgresql://user:pw@remote.example/db?sslmode=require")
      .ssl.rejectUnauthorized,
    true,
  );
  assert.equal(
    postgresOptions("postgresql://user:pw@remote.example/db", {
      DATABASE_CA_CERT: "line1\\nline2",
    }).ssl.ca,
    "line1\nline2",
  );
  assert.equal(postgresOptions("postgresql://user:pw@localhost/db").ssl, false);
  assert.throws(() => postgresOptions("https://example.com"));
});
test("Render refuses ephemeral SQLite when DATABASE_URL is missing", async () => {
  await assert.rejects(runtimeStore({ RENDER: "true" }), /DATABASE_URL/);
});
test("proxy origin is explicitly allowed; lookalikes and arbitrary forwarded hosts cannot bypass origin protection", async () => {
  const store = createStore(":memory:");
  const server = appServer(store, {
    frontendOrigins: "https://salon.vercel.app",
    secureCookies: true,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const root = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(root + "/api/health")).status, 200);
    const post = (origin) =>
      fetch(root + "/api/auth/logout", {
        method: "POST",
        headers: { Origin: origin, "X-Forwarded-Host": "salon.vercel.app" },
      });
    const allowed = await post("https://salon.vercel.app");
    assert.equal(allowed.status, 200);
    assert.match(allowed.headers.get("set-cookie"), /Secure/);
    assert.equal(
      (await post("https://salon.vercel.app.evil.example")).status,
      403,
    );
    assert.equal((await post("https://evil.example")).status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});
test("health endpoint fails when the database cannot be reached", async () => {
  const store = createStore(":memory:");
  store.health = async () => {
    throw new Error("private database details");
  };
  const server = appServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/health`,
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Database unavailable." });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});

test("proxy authentication throttles each phone without locking every customer out", async () => {
  const store = createStore(":memory:");
  const server = appServer(store, {
    frontendOrigins: "https://salon.vercel.app",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const root = `http://127.0.0.1:${server.address().port}`;
  const login = (mobile) =>
    fetch(root + "/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://salon.vercel.app",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mobile, password: "WrongPassword2026" }),
    });
  try {
    for (let i = 0; i < 10; i++)
      assert.equal((await login("9876543210")).status, 401);
    assert.equal((await login("9876543210")).status, 429);
    assert.equal((await login("9876543211")).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
  }
});
