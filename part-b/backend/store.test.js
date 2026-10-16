import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
const input = {
  serviceId: 1,
  stylistId: 1,
  date: "2030-01-07",
  time: "10:00",
  name: "Test Customer",
  mobile: "9876543210",
};
test("core: seed, book, confirm, reject overlap and invalid customers", () => {
  const store = createStore(":memory:", { core: true });
  try {
    assert.equal(store.services().length, 4);
    assert.equal(store.stylists().length, 2);
    assert.throws(() => store.book({ ...input, name: " " }));
    assert.throws(() => store.book({ ...input, mobile: "123" }));
    const booking = store.book(input);
    assert.equal(booking.price, 400);
    assert.equal(booking.service, "Haircut");
    assert.equal(booking.stylist, "Meera");
    assert.ok(booking.id);
    assert.equal(store.get(booking.id).mobile, input.mobile);
    assert.throws(() => store.book(input), { status: 409 });
    assert.ok(!store.availability(input).includes("10:15"));
    assert.ok(store.availability(input).includes("10:30"));
  } finally {
    store.db.close();
  }
});
test("admin grouping, revenue and cancellation free the occupied time", () => {
  const store = createStore(":memory:");
  try {
    const b = store.book(input);
    assert.equal(store.day(input.date).revenue, 400);
    assert.equal(store.day(input.date).groups[0].bookings.length, 1);
    store.cancel(b.id);
    assert.equal(store.day(input.date).revenue, 0);
    assert.ok(store.availability(input).includes("10:00"));
  } finally {
    store.db.close();
  }
});
test("any stylist combines availability and chooses the least busy eligible stylist", () => {
  const store = createStore(":memory:");
  try {
    store.book({ ...input, date: "2030-01-08", time: "11:00" });
    const any = {
      ...input,
      date: "2030-01-08",
      time: "12:00",
      stylistId: "any",
    };
    assert.ok(store.availability(any).includes("12:00"));
    assert.equal(store.book(any).stylist, "Karan");
  } finally {
    store.db.close();
  }
});
test("reschedule retains ID and failed reschedule retains the original slot", () => {
  const store = createStore(":memory:");
  try {
    const b = store.book(input);
    store.book({ ...input, time: "11:00" });
    assert.throws(
      () => store.reschedule(b.id, { ...input, time: "11:00" }, b.manage_token),
      { status: 409 },
    );
    assert.equal(store.get(b.id).start, 600);
    assert.throws(
      () => store.reschedule(b.id, { ...input, time: "12:00" }, "wrong"),
      { status: 403 },
    );
    const updated = store.reschedule(
      b.id,
      { ...input, time: "12:00" },
      b.manage_token,
    );
    assert.equal(updated.id, b.id);
    assert.equal(updated.start, 720);
    assert.equal(updated.status, "confirmed");
    assert.ok(store.availability(input).includes("10:00"));
  } finally {
    store.db.close();
  }
});
