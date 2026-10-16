import { randomBytes, createHash } from "node:crypto";
import { credentials, hashPassword, verifyPassword } from "./auth.js";
import { AppError } from "./errors.js";
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const publicAdmin = (row) => ({
  id: row.id,
  loginId: row.login_id,
  name: row.name,
  mobile: row.mobile,
});
export function createAdminAuth(db, clock) {
  db.exec(`CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY,login_id TEXT NOT NULL UNIQUE,name TEXT NOT NULL,mobile TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,admin_id INTEGER NOT NULL REFERENCES admins(id),expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS admin_session_expiry ON admin_sessions(expires_at);`);
  // Provisioning is available only to the local owner CLI, never public signup.
  async function create(input) {
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
      throw new AppError("Enter a valid admin name with 2–80 characters.");
    if (db.prepare("SELECT id FROM admins WHERE mobile=?").get(input.mobile))
      throw new AppError(
        "An admin with this phone number already exists.",
        409,
      );
    const passwordHash = await hashPassword(input.password),
      loginId = `SB-ADM-${randomBytes(6).toString("hex").toUpperCase()}`;
    try {
      const result = db
        .prepare(
          "INSERT INTO admins(login_id,name,mobile,password_hash) VALUES(?,?,?,?)",
        )
        .run(loginId, name, input.mobile, passwordHash);
      return {
        id: Number(result.lastInsertRowid),
        loginId,
        name,
        mobile: input.mobile,
      };
    } catch (error) {
      if (
        String(error.message).includes(
          "UNIQUE constraint failed: admins.mobile",
        )
      )
        throw new AppError(
          "An admin with this phone number already exists.",
          409,
        );
      throw error;
    }
  }
  async function login(input) {
    credentials(input);
    const loginId =
      typeof input.loginId === "string"
        ? input.loginId.trim().toUpperCase()
        : "";
    if (!/^SB-ADM-[A-F0-9]{12}$/.test(loginId))
      throw new AppError("Enter your assigned admin login ID.");
    const row = db
      .prepare("SELECT * FROM admins WHERE login_id=? AND mobile=?")
      .get(loginId, input.mobile);
    if (!(await verifyPassword(input.password, row?.password_hash)))
      throw new AppError(
        "Admin login ID, phone number or password is incorrect.",
        401,
      );
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM admin_sessions WHERE expires_at<=?").run(
      clock().getTime(),
    );
    db.prepare("INSERT INTO admin_sessions VALUES(?,?,?)").run(
      tokenHash(token),
      row.id,
      clock().getTime() + ADMIN_SESSION_SECONDS * 1000,
    );
    return { admin: publicAdmin(row), token };
  }
  function session(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db
      .prepare(
        "SELECT a.id,a.login_id,a.name,a.mobile FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(tokenHash(token), clock().getTime());
    return row ? publicAdmin(row) : null;
  }
  function logout(token) {
    if (typeof token === "string")
      db.prepare("DELETE FROM admin_sessions WHERE token_hash=?").run(
        tokenHash(token),
      );
  }
  return { create, login, session, logout };
}
