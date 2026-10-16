import { DatabaseSync } from "node:sqlite";
import { randomUUID, randomBytes } from "node:crypto";
import { availableStarts, validDate, timeLabel } from "./availability.js";
import { createAuth } from "./auth.js";
import { createAdminAuth } from "./admin-auth.js";
import { AppError } from "./errors.js";
export { AppError } from "./errors.js";

export function createStore(
  path,
  { core = false, clock = () => new Date() } = {},
) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY, name TEXT NOT NULL, duration INTEGER NOT NULL, price INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS stylists(id INTEGER PRIMARY KEY, name TEXT NOT NULL, days TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, break_start INTEGER NOT NULL, break_end INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, service_id INTEGER NOT NULL REFERENCES services(id), stylist_id INTEGER NOT NULL REFERENCES stylists(id), date TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, price INTEGER NOT NULL, name TEXT NOT NULL, mobile TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')));
    CREATE INDEX IF NOT EXISTS booking_day ON bookings(date,stylist_id,status);`);
  if (
    !db
      .prepare("PRAGMA table_info(bookings)")
      .all()
      .some((c) => c.name === "manage_token")
  )
    db.exec(
      "ALTER TABLE bookings ADD COLUMN manage_token TEXT NOT NULL DEFAULT ''",
    );
  const auth = createAuth(db, clock);
  const adminAuth = createAdminAuth(db, clock);
  if (
    !db
      .prepare("PRAGMA table_info(bookings)")
      .all()
      .some((c) => c.name === "customer_id")
  )
    db.exec(
      "ALTER TABLE bookings ADD COLUMN customer_id INTEGER REFERENCES customers(id)",
    );
  const seedService = db.prepare(
    "INSERT OR IGNORE INTO services VALUES(?,?,?,?)",
  );
  [
    [1, "Haircut", 30, 400],
    [2, "Hair spa", 60, 1200],
    [3, "Beard trim", 15, 200],
    [4, "Facial", 45, 900],
  ].forEach((row) => seedService.run(...row));
  const seedStylist = db.prepare(
    "INSERT OR IGNORE INTO stylists VALUES(?,?,?,?,?,?,?)",
  );
  seedStylist.run(1, "Meera", "[1,2,3,4,5,6]", 600, 1140, 780, 840);
  seedStylist.run(2, "Karan", "[2,3,4,5,6,0]", 660, 1200, 900, 930);
  const services = () => db.prepare("SELECT * FROM services").all();
  const stylists = () =>
    db
      .prepare("SELECT * FROM stylists")
      .all()
      .map((s) => ({ ...s, days: JSON.parse(s.days) }));
  const booked = (date, stylistId, exclude = "") =>
    db
      .prepare(
        "SELECT * FROM bookings WHERE date=? AND stylist_id=? AND status='confirmed' AND id<>?",
      )
      .all(date, stylistId, exclude);
  function selection(input) {
    const service = services().find((s) => s.id === Number(input.serviceId));
    const stylist = stylists().find((s) => s.id === Number(input.stylistId));
    if (
      !service ||
      (!stylist && input.stylistId !== "any") ||
      !validDate(input.date)
    )
      throw new AppError("Choose a valid service, stylist and date.");
    return { service, stylist };
  }
  function availability(input, exclude = "") {
    const { service, stylist } = selection(input);
    const candidates = stylist ? [stylist] : stylists();
    return [
      ...new Set(
        candidates.flatMap((stylist) =>
          availableStarts({
            stylist,
            duration: service.duration,
            date: input.date,
            bookings: booked(input.date, stylist.id, exclude),
            core,
            now: clock(),
          }).map(timeLabel),
        ),
      ),
    ].sort();
  }
  function choose(input, exclude = "") {
    const { service, stylist } = selection(input);
    const candidates = (stylist ? [stylist] : stylists()).filter((s) =>
      availability({ ...input, stylistId: s.id }, exclude).includes(input.time),
    );
    candidates.sort(
      (a, b) =>
        booked(input.date, a.id, exclude).length -
          booked(input.date, b.id, exclude).length || a.id - b.id,
    );
    if (!candidates.length)
      throw new AppError(
        "This time is no longer available. Please choose another slot.",
        409,
      );
    return { service, stylist: candidates[0] };
  }
  const get = (id) =>
    db
      .prepare(
        `SELECT b.*, s.name AS service, t.name AS stylist, s.duration FROM bookings b JOIN services s ON s.id=b.service_id JOIN stylists t ON t.id=b.stylist_id WHERE b.id=?`,
      )
      .get(id);
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function book(input, customerId = null) {
    const name =
      typeof input.name === "string"
        ? input.name.trim().replace(/\s+/g, " ")
        : "";
    if (
      name.length < 2 ||
      name.length > 80 ||
      !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)
    )
      throw new AppError(
        "Enter a name with 2–80 letters, spaces, apostrophes, dots or hyphens.",
      );
    if (typeof input.mobile !== "string" || !/^\d{10}$/.test(input.mobile))
      throw new AppError("Enter a 10-digit mobile number.");
    return transaction(() => {
      const { service, stylist } = choose(input);
      const start =
        Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3));
      const id = randomUUID();
      db.prepare(
        "INSERT INTO bookings(id,service_id,stylist_id,date,start,end,price,name,mobile,manage_token) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).run(
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
      );
      if (customerId !== null)
        db.prepare("UPDATE bookings SET customer_id=? WHERE id=?").run(
          customerId,
          id,
        );
      return get(id);
    });
  }
  function day(date) {
    if (!validDate(date)) throw new AppError("Choose a valid date.");
    const groups = stylists().map((stylist) => ({
      stylist,
      bookings: booked(date, stylist.id).map((b) => {
        const { manage_token, ...publicBooking } = get(b.id);
        return publicBooking;
      }),
    }));
    return {
      date,
      groups,
      revenue: groups
        .flatMap((g) => g.bookings)
        .reduce((sum, b) => sum + b.price, 0),
    };
  }
  function cancel(id) {
    const booking = get(id);
    if (!booking) throw new AppError("Booking not found.", 404);
    db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(id);
    return { id, status: "cancelled" };
  }
  function managed(id, token) {
    const b = get(id);
    if (!b || !token || token !== b.manage_token)
      throw new AppError("Invalid booking ID or management key.", 403);
    return b;
  }
  function reschedule(id, input, token) {
    return transaction(() => {
      const original = managed(id, token);
      if (original.status !== "confirmed")
        throw new AppError(
          "Cancelled appointments cannot be rescheduled.",
          409,
        );
      // An appointment that has already started cannot be moved.
      const local = new Date(clock().getTime() + 330 * 60000).toISOString();
      if (
        `${original.date}T${timeLabel(original.start)}:00` <= local.slice(0, 19)
      )
        throw new AppError("Past appointments cannot be rescheduled.", 409);
      const { service, stylist } = choose(input, id);
      const start =
        Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3));
      db.prepare(
        "UPDATE bookings SET service_id=?,stylist_id=?,date=?,start=?,end=?,price=? WHERE id=?",
      ).run(
        service.id,
        stylist.id,
        input.date,
        start,
        start + service.duration,
        service.price,
        id,
      );
      return get(id);
    });
  }
  return {
    auth,
    adminAuth,
    db,
    services,
    stylists,
    availability,
    book,
    get,
    transaction,
    booked,
    selection,
    core,
    clock,
    day,
    cancel,
    managed,
    reschedule,
  };
}
