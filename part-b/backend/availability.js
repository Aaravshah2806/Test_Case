export const overlaps = (a, b, c, d) => a < d && c < b;
export function indiaNow(now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60000);
  return {
    date: local.toISOString().slice(0, 10),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  };
}
export function validDate(date) {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number(date.slice(0, 4)) >= 2000 &&
    Number(date.slice(0, 4)) <= 2099 &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function availableStarts({
  stylist,
  duration,
  date,
  bookings,
  core = false,
  now = new Date(),
}) {
  if (!validDate(date)) return [];
  const current = indiaNow(now),
    buffer = core ? 0 : 10;
  if (
    !core &&
    (date < current.date || !stylist.days.includes(new Date(date).getUTCDay()))
  )
    return [];
  const result = [];
  for (
    let start = stylist.start;
    start + duration + buffer <= stylist.end;
    start += 15
  ) {
    const end = start + duration + buffer;
    if (
      !core &&
      date === current.date &&
      start <= current.minute + current.second / 60
    )
      continue;
    if (!core && overlaps(start, end, stylist.break_start, stylist.break_end))
      continue;
    if (!bookings.some((b) => overlaps(start, end, b.start, b.end + buffer)))
      result.push(start);
  }
  return result;
}
export const timeLabel = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
