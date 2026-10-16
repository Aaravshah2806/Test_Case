export function renderAdminLogin(app, api) {
  document.title = "Admin sign in · Slotbook";
  app.innerHTML = `<div class="auth-layout"><section class="auth-intro"><div class="eyebrow">THE SALON DESK</div><h1>A good day.<br>In good <em>hands.</em></h1><p>Sign in to your admin account to manage appointments and see the salon’s daily bookings and revenue.</p><div class="auth-benefits"><p>✳ Your own assigned admin login ID</p><p>✳ A private dashboard for salon admins</p><p>✳ Appointments organised by stylist</p></div><a href="/login">← Customer sign in</a></section><section class="panel auth-panel"><span class="badge">ADMIN ACCESS</span><h2 class="admin-login-heading">Welcome to the salon desk.</h2><p class="auth-description">Enter all three details assigned to your admin account.</p><form id="admin-login-form"><label>Admin login ID<input id="admin-login-id" autocomplete="username" maxlength="19" pattern="[Ss][Bb]-[Aa][Dd][Mm]-[a-fA-F0-9]{12}" required placeholder="SB-ADM-XXXXXXXXXXXX"></label><label>Phone number<input id="admin-phone" type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[0-9]{10}" maxlength="10" required placeholder="10-digit admin phone number"></label><label>Password<input id="admin-password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required placeholder="Your admin password"></label><p id="admin-login-error" class="message" role="alert"></p><button class="primary" id="admin-login-submit" type="submit">Sign in to dashboard →</button></form><p class="auth-footnote">Your salon owner provides your special login ID and admin account. Customer accounts cannot access this dashboard.</p></section></div>`;
  document.querySelector("#admin-login-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = document.querySelector("#admin-login-submit"),
      errorBox = document.querySelector("#admin-login-error");
    const loginId = document
        .querySelector("#admin-login-id")
        .value.trim()
        .toUpperCase(),
      mobile = document.querySelector("#admin-phone").value,
      password = document.querySelector("#admin-password").value;
    errorBox.textContent = "";
    if (!/^SB-ADM-[A-F0-9]{12}$/.test(loginId) || !/^\d{10}$/.test(mobile)) {
      errorBox.textContent =
        "Enter your assigned admin login ID and 10-digit phone number.";
      return;
    }
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      await api("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ loginId, mobile, password }),
      });
      location.assign("/admin");
    } catch (error) {
      errorBox.textContent = error.message;
      button.disabled = false;
      button.textContent = "Sign in to dashboard →";
    }
  };
}
export function updateAdminNavigation(admin, api) {
  document.querySelector(".brand").href = "/admin";
  const nav = document.querySelector("nav");
  nav.replaceChildren();
  const dashboard = document.createElement("a");
  dashboard.href = "/admin";
  dashboard.textContent = "Dashboard";
  const name = document.createElement("span");
  name.className = "nav-customer";
  name.textContent = admin.name;
  const signout = document.createElement("button");
  signout.className = "nav-signout";
  signout.textContent = "Sign out";
  signout.type = "button";
  signout.onclick = async () => {
    signout.disabled = true;
    try {
      await api("/api/admin/auth/logout", { method: "POST" });
      location.assign("/admin/login");
    } catch {
      signout.textContent = "Retry sign out";
      signout.disabled = false;
    }
  };
  nav.append(dashboard, name, signout);
}
export function renderAdminDashboard(
  app,
  { api, catalog, admin, money, clock, escape },
) {
  document.title = "Admin dashboard · Slotbook";
  app.innerHTML = `<div class="intro"><div class="eyebrow">THE SALON DESK</div><h1>A good day, organised.</h1><p>Your appointments, your people, and the day’s revenue in one place.</p><p class="admin-identity">Signed in as <strong>${escape(admin.name)}</strong> · ${escape(admin.loginId)}</p></div><section class="panel"><form id="admin-form" class="toolbar"><label>Booking date<input id="admin-date" type="date" required value="${catalog.today}" min="2000-01-01" max="2099-12-31"></label><button class="primary" type="submit">View appointments</button></form><p class="message" id="admin-error" role="alert"></p><div id="admin-content" aria-live="polite"></div></section>`;
  let version = 0;
  async function load() {
    const current = ++version,
      container = document.querySelector("#admin-content"),
      errorBox = document.querySelector("#admin-error");
    errorBox.textContent = "";
    container.textContent = "Loading appointments…";
    try {
      const data = await api(
        `/api/admin/bookings?date=${document.querySelector("#admin-date").value}`,
      );
      if (current !== version) return;
      const count = data.groups.reduce((n, g) => n + g.bookings.length, 0);
      container.innerHTML = `<div class="stats"><div><strong>${count}</strong><span>Confirmed appointments</span></div><div><strong>${money(data.revenue)}</strong><span>Total booked revenue</span></div></div><div class="admin-grid">${data.groups.map((g) => `<section><h2>${escape(g.stylist.name)}</h2>${g.bookings.length ? g.bookings.map((b) => `<article class="booking"><strong>${clock(b.start)}–${clock(b.end)} · ${escape(b.service)}</strong><p>${escape(b.name)} · ${escape(b.mobile)}</p><p>${money(b.price)} · Cleanup until ${clock(b.end + 10)}</p><p class="booking-id">${escape(b.id)}</p><button data-cancel="${escape(b.id)}">Cancel appointment</button></article>`).join("") : "<p>No appointments for this day.</p>"}</section>`).join("")}</div>`;
      container.querySelectorAll("[data-cancel]").forEach(
        (button) =>
          (button.onclick = async () => {
            button.disabled = true;
            try {
              await api(`/api/admin/bookings/${button.dataset.cancel}/cancel`, {
                method: "POST",
              });
              await load();
            } catch (error) {
              if ([401, 403].includes(error.status)) {
                location.replace("/admin/login");
                return;
              }
              errorBox.textContent = error.message;
              button.disabled = false;
            }
          }),
      );
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        location.replace("/admin/login");
        return;
      }
      if (current === version) {
        container.textContent = "";
        errorBox.textContent = error.message;
      }
    }
  }
  document.querySelector("#admin-form").onsubmit = (event) => {
    event.preventDefault();
    load();
  };
  load();
}
