import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "./errors.js";

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const publicCustomer = (row) => ({
  id: row.id,
  name: row.name,
  mobile: row.mobile,
});
export function credentials(input) {
  if (typeof input.mobile !== "string" || !/^\d{10}$/.test(input.mobile))
    throw new AppError("Enter a 10-digit phone number.");
  if (
    typeof input.password !== "string" ||
    input.password.length < 8 ||
    input.password.length > 128
  )
    throw new AppError("Use a password with 8–128 characters.");
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, options);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, passwordHash) {
  const [, salt, expected] = passwordHash
    ? passwordHash.split(":")
    : ["scrypt", "0".repeat(32), "0".repeat(128)];
  const actual = await derive(password, salt, 64, options);
  return (
    !!passwordHash && timingSafeEqual(actual, Buffer.from(expected, "hex"))
  );
}
export function createAuth(db, clock) {
  db.exec(`CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY, name TEXT NOT NULL, mobile TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS customer_sessions(token_hash TEXT PRIMARY KEY,customer_id INTEGER NOT NULL REFERENCES customers(id),expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS session_expiry ON customer_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);`);
  function issue(row) {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM customer_sessions WHERE expires_at<=?").run(
      clock().getTime(),
    );
    db.prepare("INSERT INTO customer_sessions VALUES(?,?,?)").run(
      tokenHash(token),
      row.id,
      clock().getTime() + SESSION_SECONDS * 1000,
    );
    return { customer: publicCustomer(row), token };
  }
  async function signup(input) {
    credentials(input);
    const name =
      typeof input.name === "string"
        ? input.name.trim().replace(/\s+/g, " ")
        : "";
    if (
      name.length < 2 ||
      name.length > 80 ||
      !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)
    )
      throw new AppError("Enter a valid name with 2–80 characters.");
    if (db.prepare("SELECT id FROM customers WHERE mobile=?").get(input.mobile))
      throw new AppError(
        "An account with this phone number already exists. Please sign in.",
        409,
      );
    const passwordHash = await hashPassword(input.password);
    try {
      db.exec("BEGIN IMMEDIATE");
      const result = db
        .prepare(
          "INSERT INTO customers(name,mobile,password_hash) VALUES(?,?,?)",
        )
        .run(name, input.mobile, passwordHash);
      const session = issue({
        id: Number(result.lastInsertRowid),
        name,
        mobile: input.mobile,
      });
      db.exec("COMMIT");
      return session;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      if (
        error.errcode === 2067 ||
        String(error.message).includes(
          "UNIQUE constraint failed: customers.mobile",
        )
      )
        throw new AppError(
          "An account with this phone number already exists. Please sign in.",
          409,
        );
      throw error;
    }
  }
  async function login(input) {
    credentials(input);
    const row = db
      .prepare("SELECT * FROM customers WHERE mobile=?")
      .get(input.mobile);
    if (!(await verifyPassword(input.password, row?.password_hash)))
      throw new AppError("Phone number or password is incorrect.", 401);
    return issue(row);
  }
  function session(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db
      .prepare(
        "SELECT c.id,c.name,c.mobile FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(tokenHash(token), clock().getTime());
    return row ? publicCustomer(row) : null;
  }
  function logout(token) {
    if (typeof token === "string")
      db.prepare("DELETE FROM customer_sessions WHERE token_hash=?").run(
        tokenHash(token),
      );
  }
  function rateLimit(client) {
    const now = clock().getTime(),
      key = tokenHash(client || "unknown");
    db.prepare("DELETE FROM auth_limits WHERE reset_at<=?").run(now);
    db.prepare(
      "INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",
    ).run(key, now + 15 * 60000);
    if (
      db.prepare("SELECT attempts FROM auth_limits WHERE key=?").get(key)
        .attempts > 10
    )
      throw new AppError(
        "Too many sign-in attempts. Try again in 15 minutes.",
        429,
      );
  }
  return { signup, login, session, logout, rateLimit };
}
