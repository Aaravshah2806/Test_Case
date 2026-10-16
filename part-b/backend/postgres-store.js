import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { availableStarts, validDate, timeLabel } from "./availability.js";
import {
  credentials,
  hashPassword,
  verifyPassword,
  SESSION_SECONDS,
} from "./auth.js";
import { ADMIN_SESSION_SECONDS } from "./admin-auth.js";
import { AppError } from "./errors.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const validToken = (token) =>
  typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
const customerView = (row) => ({
  id: row.id,
  name: row.name,
  mobile: row.mobile,
});
const adminView = (row) => ({ ...customerView(row), loginId: row.login_id });
const normalizeName = (value) => {
  const name =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (
    name.length < 2 ||
    name.length > 80 ||
    !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)
  )
    throw new AppError("Enter a valid name with 2–80 characters.");
  return name;
};

export function postgresOptions(connectionString, env = process.env) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  // Keep URL SSL parameters from overriding certificate verification.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return {
    connectionString: url.href,
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(env.DATABASE_CA_CERT
            ? { ca: env.DATABASE_CA_CERT.replace(/\\n/g, "\n") }
            : {}),
        },
  };
}

export async function createPostgresStore(
  connectionString,
  { clock = () => new Date(), core = false, pool: suppliedPool } = {},
) {
  const pool = suppliedPool || new Pool(postgresOptions(connectionString));
  pool.on("error", () => console.error("An idle database connection failed."));
  const query = (sql, values = [], client = pool) => client.query(sql, values);
  const rows = async (sql, values = [], client = pool) =>
    (await query(sql, values, client)).rows;
  const one = async (sql, values = [], client = pool) =>
    (await rows(sql, values, client))[0];
  async function transaction(fn, lock = false) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      // Serialize availability checks + mutations across ALL backend processes.
      if (lock) await client.query("SELECT pg_advisory_xact_lock(734261, 1)");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  try {
    await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(734261, 2)");
      await client.query(
        readFileSync(new URL("./postgres-schema.sql", import.meta.url), "utf8"),
      );
    });
  } catch (error) {
    await pool.end();
    throw error;
  }

  const services = (client = pool) =>
    rows("SELECT * FROM slotbook.services ORDER BY id", [], client);
  const stylists = async (client = pool) =>
    (await rows("SELECT * FROM slotbook.stylists ORDER BY id", [], client)).map(
      (s) => ({ ...s, days: JSON.parse(s.days) }),
    );
  const booked = (date, stylistId, exclude = "", client = pool) =>
    rows(
      "SELECT * FROM slotbook.bookings WHERE date=$1 AND stylist_id=$2 AND status='confirmed' AND id<>$3",
      [date, stylistId, exclude],
      client,
    );
  const get = (id, client = pool) =>
    one(
      "SELECT b.*,s.name AS service,t.name AS stylist,s.duration FROM slotbook.bookings b JOIN slotbook.services s ON s.id=b.service_id JOIN slotbook.stylists t ON t.id=b.stylist_id WHERE b.id=$1",
      [id],
      client,
    );
  async function selection(input, client = pool) {
    const service = (await services(client)).find(
      (s) => s.id === Number(input.serviceId),
    );
    const stylist = (await stylists(client)).find(
      (s) => s.id === Number(input.stylistId),
    );
    if (
      !service ||
      (!stylist && input.stylistId !== "any") ||
      !validDate(input.date)
    )
      throw new AppError("Choose a valid service, stylist and date.");
    return { service, stylist };
  }
  async function availability(input, exclude = "", client = pool) {
    const { service, stylist } = await selection(input, client);
    const times = [];
    for (const s of stylist ? [stylist] : await stylists(client)) {
      times.push(
        ...availableStarts({
          stylist: s,
          duration: service.duration,
          date: input.date,
          bookings: await booked(input.date, s.id, exclude, client),
          core,
          now: clock(),
        }).map(timeLabel),
      );
    }
    return [...new Set(times)].sort();
  }
  async function choose(input, exclude, client) {
    const { service, stylist } = await selection(input, client);
    const candidates = [];
    for (const s of stylist ? [stylist] : await stylists(client)) {
      if (
        (
          await availability({ ...input, stylistId: s.id }, exclude, client)
        ).includes(input.time)
      )
        candidates.push({
          stylist: s,
          count: (await booked(input.date, s.id, exclude, client)).length,
        });
    }
    candidates.sort((a, b) => a.count - b.count || a.stylist.id - b.stylist.id);
    if (!candidates.length)
      throw new AppError(
        "This time is no longer available. Please choose another slot.",
        409,
      );
    return { service, stylist: candidates[0].stylist };
  }
  async function book(input, customerId = null) {
    const name = normalizeName(input.name);
    if (typeof input.mobile !== "string" || !/^\d{10}$/.test(input.mobile))
      throw new AppError("Enter a 10-digit mobile number.");
    return transaction(async (client) => {
      const { service, stylist } = await choose(input, "", client);
      const start =
        Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3));
      const id = randomUUID();
      await query(
        'INSERT INTO slotbook.bookings(id,service_id,stylist_id,date,start,"end",price,name,mobile,manage_token,customer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          id,
          service.id,
          stylist.id,
          input.date,
          start,
          start + service.duration,
          service.price,
          name,
          input.mobile,
          randomBytes(24).toString("hex"),
          customerId,
        ],
        client,
      );
      return get(id, client);
    }, true);
  }
  async function managed(id, token, client = pool) {
    const b = await get(id, client);
    if (!b || !token || token !== b.manage_token)
      throw new AppError("Invalid booking ID or management key.", 403);
    return b;
  }
  async function reschedule(id, input, token) {
    return transaction(async (client) => {
      const original = await managed(id, token, client);
      if (original.status !== "confirmed")
        throw new AppError(
          "Cancelled appointments cannot be rescheduled.",
          409,
        );
      const local = new Date(clock().getTime() + 330 * 60000).toISOString();
      if (
        `${original.date}T${timeLabel(original.start)}:00` <= local.slice(0, 19)
      )
        throw new AppError("Past appointments cannot be rescheduled.", 409);
      const { service, stylist } = await choose(input, id, client);
      const start =
        Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3));
      await query(
        'UPDATE slotbook.bookings SET service_id=$1,stylist_id=$2,date=$3,start=$4,"end"=$5,price=$6 WHERE id=$7',
        [
          service.id,
          stylist.id,
          input.date,
          start,
          start + service.duration,
          service.price,
          id,
        ],
        client,
      );
      return get(id, client);
    }, true);
  }
  async function cancel(id) {
    return transaction(async (client) => {
      if (!(await get(id, client)))
        throw new AppError("Booking not found.", 404);
      await query(
        "UPDATE slotbook.bookings SET status='cancelled' WHERE id=$1",
        [id],
        client,
      );
      return { id, status: "cancelled" };
    }, true);
  }
  async function day(date) {
    if (!validDate(date)) throw new AppError("Choose a valid date.");
    const groups = [];
    for (const stylist of await stylists()) {
      const bookings = [];
      for (const b of await booked(date, stylist.id)) {
        const { manage_token, ...publicBooking } = await get(b.id);
        bookings.push(publicBooking);
      }
      groups.push({ stylist, bookings });
    }
    return {
      date,
      groups,
      revenue: groups
        .flatMap((g) => g.bookings)
        .reduce((sum, b) => sum + b.price, 0),
    };
  }

  async function issue(row, admin = false, client = pool) {
    const token = randomBytes(32).toString("hex");
    const table = admin ? "admin_sessions" : "customer_sessions";
    const column = admin ? "admin_id" : "customer_id";
    const seconds = admin ? ADMIN_SESSION_SECONDS : SESSION_SECONDS;
    await query(
      `DELETE FROM slotbook.${table} WHERE expires_at<=$1`,
      [clock().getTime()],
      client,
    );
    await query(
      `INSERT INTO slotbook.${table}(token_hash,${column},expires_at) VALUES($1,$2,$3)`,
      [digest(token), row.id, clock().getTime() + seconds * 1000],
      client,
    );
    return admin
      ? { admin: adminView(row), token }
      : { customer: customerView(row), token };
  }
  async function session(token, admin = false) {
    if (!validToken(token)) return null;
    const row = await one(
      admin
        ? "SELECT a.* FROM slotbook.admin_sessions s JOIN slotbook.admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>$2"
        : "SELECT c.* FROM slotbook.customer_sessions s JOIN slotbook.customers c ON c.id=s.customer_id WHERE s.token_hash=$1 AND s.expires_at>$2",
      [digest(token), clock().getTime()],
    );
    return row ? (admin ? adminView(row) : customerView(row)) : null;
  }
  const logout = (token, admin = false) =>
    typeof token === "string"
      ? query(
          `DELETE FROM slotbook.${admin ? "admin_sessions" : "customer_sessions"} WHERE token_hash=$1`,
          [digest(token)],
        )
      : undefined;
  async function signup(input) {
    credentials(input);
    const name = normalizeName(input.name),
      hash = await hashPassword(input.password);
    try {
      return await transaction(async (client) => {
        const row = await one(
          "INSERT INTO slotbook.customers(name,mobile,password_hash) VALUES($1,$2,$3) RETURNING *",
          [name, input.mobile, hash],
          client,
        );
        return issue(row, false, client);
      });
    } catch (error) {
      if (error.code === "23505")
        throw new AppError(
          "An account with this phone number already exists. Please sign in.",
          409,
        );
      throw error;
    }
  }
  async function login(input, admin = false) {
    credentials(input);
    const loginId =
      typeof input.loginId === "string"
        ? input.loginId.trim().toUpperCase()
        : "";
    if (admin && !/^SB-ADM-[A-F0-9]{12}$/.test(loginId))
      throw new AppError("Enter your assigned admin login ID.");
    const row = await one(
      admin
        ? "SELECT * FROM slotbook.admins WHERE login_id=$1 AND mobile=$2"
        : "SELECT * FROM slotbook.customers WHERE mobile=$1",
      admin ? [loginId, input.mobile] : [input.mobile],
    );
    if (!(await verifyPassword(input.password, row?.password_hash)))
      throw new AppError(
        admin
          ? "Admin login ID, phone number or password is incorrect."
          : "Phone number or password is incorrect.",
        401,
      );
    return issue(row, admin);
  }
  async function createAdmin(input) {
    credentials(input);
    const name = normalizeName(input.name),
      hash = await hashPassword(input.password);
    const loginId = `SB-ADM-${randomBytes(6).toString("hex").toUpperCase()}`;
    try {
      return adminView(
        await one(
          "INSERT INTO slotbook.admins(login_id,name,mobile,password_hash) VALUES($1,$2,$3,$4) RETURNING *",
          [loginId, name, input.mobile, hash],
        ),
      );
    } catch (error) {
      if (error.code === "23505")
        throw new AppError(
          "An admin with this phone number already exists.",
          409,
        );
      throw error;
    }
  }
  async function rateLimit(client) {
    const now = clock().getTime(),
      key = digest(client || "unknown");
    // Atomic UPSERT: concurrent attempts cannot lose increments or extend the window.
    const row = await one(
      "INSERT INTO slotbook.auth_limits(key,attempts,reset_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN slotbook.auth_limits.reset_at<=$3 THEN 1 ELSE slotbook.auth_limits.attempts+1 END, reset_at=CASE WHEN slotbook.auth_limits.reset_at<=$3 THEN $2 ELSE slotbook.auth_limits.reset_at END RETURNING attempts",
      [key, now + 15 * 60000, now],
    );
    if (row.attempts > 10)
      throw new AppError(
        "Too many sign-in attempts. Try again in 15 minutes.",
        429,
      );
  }
  return {
    services,
    stylists,
    availability,
    book,
    get,
    booked,
    managed,
    reschedule,
    cancel,
    day,
    core,
    clock,
    auth: { signup, login, session, logout, rateLimit },
    adminAuth: {
      create: createAdmin,
      login: (input) => login(input, true),
      session: (token) => session(token, true),
      logout: (token) => logout(token, true),
    },
    health: async () => {
      await query("SELECT 1");
    },
    close: () => pool.end(),
  };
}
