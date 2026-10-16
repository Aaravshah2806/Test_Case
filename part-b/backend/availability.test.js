import { test } from "node:test";
import assert from "node:assert/strict";
import { availableStarts } from "./availability.js";

const stylist = {
  start: 600,
  end: 1140,
  days: [1, 2, 3, 4, 5, 6],
  break_start: 780,
  break_end: 840,
};
test("whole service fits and starts use a 15-minute grid", () => {
  const slots = availableStarts({
    stylist,
    duration: 30,
    date: "2030-01-07",
    bookings: [],
    core: true,
  });
  assert.equal(slots[0], 600);
  assert.equal(slots.at(-1), 1110);
  assert.ok(slots.every((s) => s % 15 === 0));
});
test("overlapping services are blocked; adjacent services are allowed in core", () => {
  const slots = availableStarts({
    stylist,
    duration: 30,
    date: "2030-01-07",
    bookings: [{ start: 630, end: 660 }],
    core: true,
  });
  assert.ok(slots.includes(600));
  assert.ok(!slots.includes(615));
  assert.ok(!slots.includes(630));
  assert.ok(slots.includes(660));
});
const full = (overrides) =>
  availableStarts({
    stylist,
    duration: 30,
    date: "2030-01-07",
    bookings: [],
    now: new Date("2029-01-01T00:00:00Z"),
    ...overrides,
  });
test("days off and breaks block appointments including cleanup", () => {
  assert.deepEqual(full({ date: "2030-01-06" }), []);
  const slots = full({});
  assert.ok(!slots.includes(750));
  assert.ok(!slots.includes(780));
  assert.ok(slots.includes(840));
  assert.ok(slots.includes(735));
  assert.equal(slots.at(-1), 1095);
});
test("cleanup blocks both sides of an appointment", () => {
  const slots = full({ bookings: [{ start: 660, end: 690 }] });
  assert.ok(!slots.includes(630));
  assert.ok(!slots.includes(690));
  assert.ok(slots.includes(615));
  assert.ok(slots.includes(705));
});
test("past dates and already-started slots in India time are excluded", () => {
  assert.deepEqual(full({ date: "2028-01-01" }), []);
  const slots = full({ now: new Date("2030-01-07T04:30:01Z") });
  assert.ok(!slots.includes(600));
  assert.ok(slots.includes(615));
});
test("invalid calendar dates return no slots", () => {
  assert.deepEqual(full({ date: "2030-02-30" }), []);
  assert.deepEqual(full({ date: "invalid" }), []);
});
test("Karan works Sunday, rests Monday, and blocks the 15:00–15:30 break", () => {
  const karan = {
    start: 660,
    end: 1200,
    days: [2, 3, 4, 5, 6, 0],
    break_start: 900,
    break_end: 930,
  };
  assert.deepEqual(full({ stylist: karan }), []);
  const slots = full({ stylist: karan, date: "2030-01-06" });
  assert.equal(slots[0], 660);
  assert.ok(!slots.includes(870));
  assert.ok(!slots.includes(900));
  assert.ok(slots.includes(930));
});
test("all service durations fit in work and break boundaries with cleanup", () => {
  for (const duration of [15, 30, 45, 60]) {
    const slots = full({ duration });
    assert.ok(slots.every((start) => start + duration + 10 <= stylist.end));
    assert.ok(
      slots.every((start) => start + duration + 10 <= 780 || start >= 840),
    );
  }
});
