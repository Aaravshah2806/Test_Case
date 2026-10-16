import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";

const customer = { name: "Test Customer", mobile: "9876543210" };
const input = {
  ...customer,
  serviceId: 1,
  stylistId: 1,
  date: "2030-01-08",
  time: "10:00",
};
function fixture(run, options = {}) {
  const store = createStore(":memory:", {
    clock: () => new Date("2030-01-01T00:00:00Z"),
    ...options,
  });
  try {
    run(store);
  } finally {
    store.db.close();
  }
}

for (const [id, duration, price] of [
  [1, 30, 400],
  [2, 60, 1200],
  [3, 15, 200],
  [4, 45, 900],
]) {
  test(`service ${id}: booking and reschedule use database duration/price`, () =>
    fixture((store) => {
      const booked = store.book({
        ...input,
        serviceId: id,
        price: 1,
        duration: 1,
      });
      assert.equal(booked.end - booked.start, duration);
      assert.equal(booked.price, price);
      const updated = store.reschedule(
        booked.id,
        { ...input, serviceId: id, time: "14:00", price: 0 },
        booked.manage_token,
      );
      assert.equal(updated.id, booked.id);
      assert.equal(updated.end, 840 + duration);
      assert.equal(updated.price, price);
    }));
}
for (const [label, values, status] of [
  ["blank name", { name: " " }, 400],
  ["numeric name", { name: "1234" }, 400],
  ["one-letter name", { name: "A" }, 400],
  ["too-long name", { name: "A".repeat(81) }, 400],
  ["HTML name", { name: "<script>alert(1)</script>" }, 400],
  ["short mobile", { mobile: "123" }, 400],
  ["long mobile", { mobile: "12345678901" }, 400],
  ["numeric mobile", { mobile: 9876543210 }, 400],
  ["alphabetic mobile", { mobile: "abcdefghij" }, 400],
  ["unknown service", { serviceId: 999 }, 400],
  ["unknown stylist", { stylistId: 999 }, 400],
  ["impossible date", { date: "2030-02-30" }, 400],
  ["past date", { date: "2029-12-31" }, 409],
  ["day off", { date: "2030-01-06" }, 409],
  ["break", { time: "13:00" }, 409],
  ["crosses break", { time: "12:30" }, 409],
  ["after closing", { time: "19:00" }, 409],
  ["off grid", { time: "10:10" }, 409],
  ["missing time", { time: undefined }, 409],
])
  test(`reject ${label} without saving`, () =>
    fixture((store) => {
      assert.throws(() => store.book({ ...input, ...values }), { status });
      assert.equal(
        store.db.prepare("SELECT count(*) AS total FROM bookings").get().total,
        0,
      );
    }));

test("Unicode names and apostrophes work, and extra spaces are normalised", () =>
  fixture((store) => {
    assert.equal(
      store.book({ ...input, name: "  मीरा   शर्मा  " }).name,
      "मीरा शर्मा",
    );
    assert.equal(
      store.book({ ...input, time: "11:00", name: "Anne O'Neil" }).name,
      "Anne O'Neil",
    );
  }));
test("cleanup blocks 10:30 after 10:00 haircut, but allows 10:45", () =>
  fixture((store) => {
    store.book(input);
    assert.throws(() => store.book({ ...input, time: "10:30" }), {
      status: 409,
    });
    assert.ok(store.book({ ...input, time: "10:45" }).id);
  }));
test("different stylist can book the same time", () =>
  fixture((store) => {
    store.book({ ...input, time: "11:00" });
    assert.equal(
      store.book({ ...input, time: "11:00", stylistId: 2 }).stylist,
      "Karan",
    );
  }));
test("Any stylist selects the available person during the other stylist break", () =>
  fixture((store) => {
    assert.equal(
      store.book({ ...input, stylistId: "any", time: "13:00" }).stylist,
      "Karan",
    );
    assert.equal(
      store.book({ ...input, stylistId: "any", time: "15:00" }).stylist,
      "Meera",
    );
  }));
test("Any stylist distributes simultaneous-time bookings and rejects a third", () =>
  fixture((store) => {
    const first = store.book({ ...input, stylistId: "any", time: "11:00" });
    const second = store.book({ ...input, stylistId: "any", time: "11:00" });
    assert.notEqual(first.stylist_id, second.stylist_id);
    assert.throws(
      () => store.book({ ...input, stylistId: "any", time: "11:00" }),
      { status: 409 },
    );
  }));
test("reschedule changes service, stylist and date, preserving customer and ID", () =>
  fixture((store) => {
    const original = store.book(input);
    const moved = store.reschedule(
      original.id,
      {
        serviceId: 2,
        stylistId: 2,
        date: "2030-01-09",
        time: "16:00",
        name: "Other Person",
        mobile: "1111111111",
      },
      original.manage_token,
    );
    assert.equal(moved.id, original.id);
    assert.equal(moved.name, customer.name);
    assert.equal(moved.mobile, customer.mobile);
    assert.equal(moved.service, "Hair spa");
    assert.equal(moved.stylist, "Karan");
    assert.equal(moved.price, 1200);
    assert.equal(moved.date, "2030-01-09");
    assert.equal(moved.end, 1020);
    assert.ok(store.availability(input).includes("10:00"));
    assert.ok(
      !store
        .availability({
          ...input,
          serviceId: 2,
          stylistId: 2,
          date: "2030-01-09",
        })
        .includes("16:00"),
    );
  }));
test("reschedule can retain its own slot or move into its own old interval", () =>
  fixture((store) => {
    const original = store.book(input);
    assert.equal(
      store.reschedule(original.id, input, original.manage_token).start,
      600,
    );
    assert.equal(
      store.reschedule(
        original.id,
        { ...input, time: "10:15" },
        original.manage_token,
      ).start,
      615,
    );
  }));
test("failed reschedule into a break, day off or occupied slot preserves every field", () =>
  fixture((store) => {
    const original = store.book(input);
    store.book({ ...input, time: "11:00" });
    for (const patch of [
      { time: "11:00" },
      { time: "13:00" },
      { date: "2030-01-06" },
      { date: "2029-12-31" },
      { serviceId: 999 },
    ]) {
      assert.throws(() =>
        store.reschedule(
          original.id,
          { ...input, ...patch },
          original.manage_token,
        ),
      );
      assert.deepEqual(store.get(original.id), original);
    }
  }));
test("cancelled bookings cannot be rescheduled; cancellation is idempotent", () =>
  fixture((store) => {
    const original = store.book(input);
    store.cancel(original.id);
    store.cancel(original.id);
    assert.throws(
      () =>
        store.reschedule(
          original.id,
          { ...input, time: "11:00" },
          original.manage_token,
        ),
      { status: 409 },
    );
    assert.equal(store.day(input.date).revenue, 0);
    assert.ok(store.availability(input).includes("10:00"));
  }));
test("already-started appointments cannot be rescheduled", () => {
  let now = new Date("2030-01-08T04:00:00Z");
  fixture(
    (store) => {
      const original = store.book(input);
      now = new Date("2030-01-08T04:30:01Z");
      assert.throws(
        () =>
          store.reschedule(
            original.id,
            { ...input, time: "11:00" },
            original.manage_token,
          ),
        { status: 409 },
      );
      assert.equal(store.get(original.id).start, 600);
    },
    { clock: () => now },
  );
});
test("same-day availability follows IST and rejects passed start times on POST", () =>
  fixture(
    (store) => {
      const today = { ...input, date: "2030-01-08" };
      assert.throws(() => store.book(today), { status: 409 });
      assert.ok(store.availability(today).includes("10:15"));
    },
    { clock: () => new Date("2030-01-08T04:30:01Z") },
  ));
test("admin totals update after service change, stylist move and cancellation", () =>
  fixture((store) => {
    const first = store.book(input);
    store.book({ ...input, stylistId: 2, time: "11:00", serviceId: 4 });
    assert.equal(store.day(input.date).revenue, 1300);
    store.reschedule(
      first.id,
      { ...input, serviceId: 2, stylistId: 2, time: "16:00" },
      first.manage_token,
    );
    const day = store.day(input.date);
    assert.equal(day.revenue, 2100);
    assert.equal(day.groups[0].bookings.length, 0);
    assert.equal(day.groups[1].bookings.length, 2);
    store.cancel(first.id);
    assert.equal(store.day(input.date).revenue, 900);
  }));
