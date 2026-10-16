import { renderHome } from "./home.js";
import {
  renderAdminLogin,
  renderAdminDashboard,
  updateAdminNavigation,
} from "./admin-ui.js";
import {
  renderAuth,
  updateAccountNavigation,
  safeNext,
  loginUrl,
} from "./auth-ui.js";
const app = document.querySelector("#app");
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
const clock = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The salon server is starting or temporarily unavailable. Please try again in a minute.",
    );
  }
  if (!response.ok) {
    const error = new Error(data.error || "Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}
let catalog,
  selectedService = 1,
  selectedTime = "",
  requestVersion = 0,
  rescheduling = null;
let customer = null;
function intro(tag, title, text) {
  return `<div class="intro"><div class="eyebrow">${tag}</div><h1>${title}</h1><p>${text}</p></div>`;
}
function renderBooking() {
  if (!customer) {
    location.replace(loginUrl());
    return;
  }
  document.title = rescheduling
    ? "Reschedule appointment · Slotbook"
    : "Book an appointment · Slotbook";
  app.innerHTML =
    intro(
      "YOUR NEXT GOOD HAIR DAY",
      "A little time.<br>A whole new feeling.",
      "Choose your treatment, find your person, and make some time for yourself.",
    ) +
    `
  <div class="layout"><form id="booking-form" class="panel">
    <section class="section"><h2><span class="step">01</span>Choose your service</h2><div class="services">${catalog.services.map((s) => `<button type="button" class="service" data-service="${s.id}" aria-pressed="${s.id === selectedService}"><span><strong>${s.name}</strong><small>${s.duration} minutes</small></span><span class="price">${money(s.price)}</span></button>`).join("")}</div></section>
    <section class="section"><h2><span class="step">02</span>Your stylist & date</h2><div class="fields"><label>Stylist<select id="stylist"><option value="any">Any stylist · first available</option>${catalog.stylists.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select></label><label>Appointment date<input id="date" type="date" required value="${catalog.today}" min="${catalog.today}" max="2099-12-31"></label></div><p class="help" id="schedule"></p></section>
    <section class="section"><h2><span class="step">03</span>Find your moment</h2><p class="help">Available start times · India Standard Time</p><div id="times" class="times" aria-live="polite"></div></section>
    <section class="section"><h2><span class="step">04</span>A few details</h2><label>Your name<input id="name" autocomplete="name" required minlength="2" maxlength="80" value="${escape(customer.name)}" placeholder="e.g. Ananya Sharma"></label><fieldset id="phone-choice" class="contact-choice"><legend>Which phone number should we use for this appointment?</legend><label class="radio-choice"><input type="radio" name="phone-choice" id="use-account" value="account" checked>Use my account number <strong>${escape(customer.mobile)}</strong></label><label class="radio-choice"><input type="radio" name="phone-choice" id="use-another" value="another">Use another number</label></fieldset><label id="alternate-phone-label" hidden>Another mobile number<input id="mobile" type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[0-9]{10}" maxlength="10" disabled placeholder="10-digit mobile number"></label><p class="help">Your appointment contact number won’t change the phone number on your account.</p></section>
    <p id="error" class="message" role="alert"></p><button class="primary" id="submit" type="submit" disabled>Confirm appointment →</button></form>
    <aside class="panel summary"><span class="badge">A MOMENT FOR YOU</span><h2>Your appointment</h2><p>A fresh look starts here.</p><dl id="summary"></dl><p class="note">✳ Thoughtful care, without the wait.<br>Every visit includes 10 minutes of cleanup after your treatment.</p></aside></div>`;
  document.querySelectorAll("[data-service]").forEach(
    (button) =>
      (button.onclick = () => {
        selectedService = Number(button.dataset.service);
        document
          .querySelectorAll("[data-service]")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        loadTimes();
      }),
  );
  document.querySelector("#stylist").onchange = loadTimes;
  document.querySelector("#date").onchange = loadTimes;
  document.querySelector("#booking-form").onsubmit = submitBooking;
  const contactChoice = () => {
    const another = document.querySelector("#use-another").checked;
    document.querySelector("#alternate-phone-label").hidden = !another;
    document.querySelector("#mobile").disabled = !another;
    document.querySelector("#mobile").required = another;
  };
  document.querySelector("#use-account").onchange = contactChoice;
  document.querySelector("#use-another").onchange = contactChoice;
  if (rescheduling) {
    document.querySelector("h1").textContent = "Make a little room for change.";
    document.querySelector("#stylist").value = rescheduling.stylist_id;
    document.querySelector("#date").value = rescheduling.date;
    document.querySelector("#name").value = rescheduling.name;
    document.querySelector("#name").readOnly = true;
    document.querySelector("#mobile").value = rescheduling.mobile;
    document.querySelector("#mobile").readOnly = true;
    document.querySelector("#phone-choice").hidden = true;
    document.querySelector("#alternate-phone-label").hidden = false;
    document.querySelector("#alternate-phone-label").firstChild.textContent =
      "Appointment contact number";
    document.querySelector("#mobile").disabled = false;
    document.querySelector("#submit").textContent = "Save new appointment →";
  }
  loadTimes();
}
function selection() {
  return {
    serviceId: selectedService,
    stylistId: document.querySelector("#stylist").value,
    date: document.querySelector("#date").value,
  };
}
function summary() {
  const service = catalog.services.find((s) => s.id === selectedService),
    stylist = catalog.stylists.find(
      (s) => s.id === Number(selection().stylistId),
    );
  document.querySelector("#summary").innerHTML =
    `<div><dt>Treatment</dt><dd>${service.name}</dd></div><div><dt>Duration</dt><dd>${service.duration} min</dd></div><div><dt>Stylist</dt><dd>${stylist?.name || "Any stylist"}</dd></div><div><dt>Date</dt><dd>${escape(selection().date || "Choose a date")}</dd></div><div><dt>Time</dt><dd>${selectedTime || "Choose a time"}</dd></div><div class="total"><dt>Total</dt><dd>${money(service.price)}</dd></div>`;
}
async function loadTimes() {
  const version = ++requestVersion;
  selectedTime = "";
  summary();
  const container = document.querySelector("#times");
  container.textContent = "Checking availability…";
  document.querySelector("#submit").disabled = true;
  const stylist = catalog.stylists.find(
    (s) => s.id === Number(selection().stylistId),
  );
  document.querySelector("#schedule").textContent = stylist
    ? `${stylist.name}: ${stylist.id === 1 ? "Mon–Sat" : "Tue–Sun"} · ${clock(stylist.start)}–${clock(stylist.end)} · Break ${clock(stylist.break_start)}–${clock(stylist.break_end)}`
    : "We’ll match you with an available stylist.";
  try {
    const query = new URLSearchParams(selection());
    const data = await api(
      `/api/availability?${query}${rescheduling ? `&exclude=${encodeURIComponent(rescheduling.id)}` : ""}`,
      rescheduling
        ? { headers: { Authorization: `Bearer ${rescheduling.manage_token}` } }
        : {},
    );
    if (version !== requestVersion) return;
    container.innerHTML = data.times.length
      ? data.times
          .map(
            (t) =>
              `<button type="button" aria-pressed="false" data-time="${t}">${t}</button>`,
          )
          .join("")
      : "<p>No available times. Try another date or stylist.</p>";
    container.querySelectorAll("button").forEach(
      (button) =>
        (button.onclick = () => {
          selectedTime = button.dataset.time;
          container
            .querySelectorAll("button")
            .forEach((b) =>
              b.setAttribute("aria-pressed", String(b === button)),
            );
          summary();
          document.querySelector("#submit").disabled = false;
        }),
    );
  } catch (error) {
    if (error.status === 401) {
      location.replace(loginUrl());
      return;
    }
    if (version === requestVersion) container.textContent = error.message;
  }
}
async function submitBooking(event) {
  event.preventDefault();
  const errorBox = document.querySelector("#error"),
    button = document.querySelector("#submit");
  errorBox.textContent = "";
  const name = document.querySelector("#name").value.trim(),
    mobile =
      rescheduling || document.querySelector("#use-another").checked
        ? document.querySelector("#mobile").value
        : customer.mobile;
  if (
    name.length < 2 ||
    name.length > 80 ||
    !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)
  ) {
    errorBox.textContent = "Enter a valid name with 2–80 characters.";
    return;
  }
  if (!/^\d{10}$/.test(mobile)) {
    errorBox.textContent = "Enter a 10-digit mobile number.";
    return;
  }
  if (!selectedTime) {
    errorBox.textContent = "Choose an available time.";
    return;
  }
  button.disabled = true;
  button.textContent = "Confirming…";
  try {
    const booking = await api(
      rescheduling
        ? `/api/bookings/${rescheduling.id}/reschedule`
        : "/api/bookings",
      {
        method: "POST",
        body: JSON.stringify({
          ...selection(),
          time: selectedTime,
          name,
          mobile,
          useAccountNumber: document.querySelector("#use-account").checked,
          token: rescheduling?.manage_token,
        }),
      },
    );
    rescheduling = null;
    confirmation(booking);
  } catch (error) {
    if (error.status === 401) {
      location.replace(loginUrl());
      return;
    }
    errorBox.textContent = error.message;
    button.textContent = rescheduling
      ? "Save new appointment →"
      : "Confirm appointment →";
    await loadTimes();
  }
}
function confirmation(b) {
  document.title = "Appointment confirmed · Slotbook";
  history.replaceState(null, "", `/book#manage=${b.id}:${b.manage_token}`);
  app.innerHTML = `<section class="panel success"><span class="badge">✓ APPOINTMENT CONFIRMED</span><h1>You’re on the calendar.</h1><p>We look forward to seeing you, ${escape(b.name)}.</p><div class="details"><div><small>Treatment</small><strong>${escape(b.service)}</strong></div><div><small>Your stylist</small><strong>${escape(b.stylist)}</strong></div><div><small>Date & time · IST</small><strong>${escape(b.date)} · ${clock(b.start)}–${clock(b.end)}</strong></div><div><small>Price</small><strong>${money(b.price)}</strong></div></div><p class="booking-id">Booking ID: ${escape(b.id)}</p><p class="help">Keep your booking ID for your visit.</p><button id="another" class="primary">Book another appointment</button></section>`;
  const contact = document.createElement("div"),
    contactLabel = document.createElement("small"),
    contactNumber = document.createElement("strong");
  contactLabel.textContent = "Appointment contact number";
  contactNumber.textContent = b.mobile;
  contact.append(contactLabel, contactNumber);
  document.querySelector(".details").append(contact);
  document.querySelector("#another").onclick = () => {
    rescheduling = null;
    history.replaceState(null, "", "/book");
    renderBooking();
  };
  const link = document.createElement("a");
  link.href = `/book#manage=${b.id}:${b.manage_token}`;
  link.textContent = "Save this private link to manage your appointment";
  link.className = "manage-link";
  document.querySelector(".success").append(link);
  const change = document.createElement("button");
  change.className = "secondary";
  change.textContent = "Reschedule this appointment";
  change.onclick = () => {
    rescheduling = b;
    selectedService = b.service_id;
    renderBooking();
  };
  document.querySelector(".success").append(change);
}
async function start() {
  try {
    catalog = await api("/api/catalog");
    const session = await api("/api/auth/session");
    customer = session.customer;
    if (session.admin) {
      if (location.pathname !== "/admin") {
        location.replace("/admin");
        return;
      }
      updateAdminNavigation(session.admin, api);
      renderAdminDashboard(app, {
        api,
        catalog,
        admin: session.admin,
        money,
        clock,
        escape,
      });
      return;
    }
    updateAccountNavigation(customer, api);
    if (location.pathname === "/admin/login") {
      renderAdminLogin(app, api);
      return;
    }
    if (location.pathname === "/admin") {
      location.replace("/admin/login");
      return;
    }
    if (location.pathname === "/login") {
      const queryNext = new URLSearchParams(location.search).get("next");
      const next =
        safeNext(queryNext, location.origin) +
        (queryNext?.includes("#") ? "" : location.hash);
      if (customer) {
        location.replace(next);
        return;
      }
      renderAuth(app, api, next);
      return;
    }
    if (location.pathname === "/book" && !customer) {
      location.replace(loginUrl());
      return;
    }
    if (location.hash.startsWith("#manage=")) {
      if (!customer) {
        location.replace(
          `/login?next=${encodeURIComponent("/book" + location.hash)}`,
        );
        return;
      }
      const [id, token] = location.hash.slice(8).split(":");
      const b = await api(`/api/bookings/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (b.status === "cancelled")
        throw new Error("This appointment has been cancelled.");
      confirmation(b);
    } else if (location.pathname === "/book") {
      document.title = "Book an appointment · Slotbook";
      const serviceId = Number(
        new URLSearchParams(location.search).get("service"),
      );
      if (catalog.services.some((service) => service.id === serviceId))
        selectedService = serviceId;
      renderBooking();
    } else {
      document.title = "Slotbook · Your next good hair day";
      renderHome(app, catalog, money);
    }
  } catch (error) {
    if (error.status === 401 && location.pathname === "/book") {
      location.replace(loginUrl());
      return;
    }
    app.innerHTML = `<p role="alert">${escape(error.message)}</p><button id="retry-start" type="button">Try again</button>`;
    document.querySelector("#retry-start").onclick = () => {
      app.innerHTML =
        '<p role="status">Connecting to the salon… Free hosting may take about a minute to wake up.</p>';
      start();
    };
  }
}
start();
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
