export function safeNext(value, origin) {
  try {
    const url = new URL(value || "/book", origin);
    return url.origin === origin && url.pathname === "/book"
      ? url.pathname + url.search + url.hash
      : "/book";
  } catch {
    return "/book";
  }
}
export function loginUrl() {
  return `/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
}
export function updateAccountNavigation(customer, api) {
  const slot = document.querySelector("#account-nav");
  slot.replaceChildren();
  if (!customer) {
    const link = document.createElement("a");
    link.href = "/login";
    link.textContent = "Sign in";
    slot.append(link);
    return;
  }
  const name = document.createElement("span");
  name.className = "nav-customer";
  name.textContent = `Hi, ${customer.name.split(" ")[0]}`;
  const button = document.createElement("button");
  button.className = "nav-signout";
  button.type = "button";
  button.textContent = "Sign out";
  button.onclick = async () => {
    button.disabled = true;
    try {
      await api("/api/auth/logout", { method: "POST" });
      location.assign("/");
    } catch {
      button.textContent = "Retry sign out";
      button.disabled = false;
    }
  };
  slot.append(name, button);
}
export function renderAuth(app, api, next) {
  let mode = "login",
    phone = "";
  function render() {
    document.title =
      mode === "login" ? "Sign in · Slotbook" : "Create an account · Slotbook";
    app.innerHTML = `<div class="auth-layout"><section class="auth-intro"><div class="eyebrow">YOUR TIME, YOUR SLOTBOOK</div><h1>A good day<br>starts with <em>you.</em></h1><p>Sign in to book a little self-care. Your phone number keeps your account and appointment details together.</p><div class="auth-benefits"><p>✳ Find your next appointment</p><p>✳ Choose your appointment contact number</p><p>✳ Come back to reschedule when plans change</p></div><a href="/">← Back to the salon</a></section><section class="panel auth-panel"><div class="auth-tabs" role="group" aria-label="Account action"><button type="button" id="login-tab" aria-pressed="${mode === "login"}">Sign in</button><button type="button" id="signup-tab" aria-pressed="${mode === "signup"}">Create account</button></div><h2>${mode === "login" ? "Welcome back." : "Make yourself at home."}</h2><p class="auth-description">${mode === "login" ? "Use your phone number and password to sign in." : "Create an account with your phone number to book appointments."}</p><form id="auth-form">${mode === "signup" ? '<label>Your name<input id="account-name" autocomplete="name" minlength="2" maxlength="80" required placeholder="e.g. Ananya Sharma"></label>' : ""}<label>Phone number<input id="account-phone" type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[0-9]{10}" maxlength="10" required placeholder="10-digit phone number"></label><label>Password<input id="account-password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="8" maxlength="128" required placeholder="At least 8 characters"></label><p class="help">${mode === "signup" ? "Use a password with 8–128 characters. Each phone number can have one account." : "Enter the password you chose when creating your account."}</p><p id="auth-error" class="message" role="alert"></p><button id="auth-submit" type="submit" class="primary">${mode === "login" ? "Sign in & continue →" : "Create account & continue →"}</button></form><p class="auth-footnote">Your account number can be different from your appointment contact number.</p></section></div>`;
    const adminLink = document.createElement("a");
    adminLink.href = "/admin/login";
    adminLink.className = "admin-signin-link";
    adminLink.textContent = "Salon admin? Sign in here →";
    document.querySelector(".auth-panel").append(adminLink);
    document.querySelector("#account-phone").value = phone;
    document.querySelector("#login-tab").onclick = () => switchMode("login");
    document.querySelector("#signup-tab").onclick = () => switchMode("signup");
    document.querySelector("#auth-form").onsubmit = async (event) => {
      event.preventDefault();
      const button = document.querySelector("#auth-submit"),
        errorBox = document.querySelector("#auth-error");
      const mobile = document.querySelector("#account-phone").value,
        password = document.querySelector("#account-password").value;
      const name =
        mode === "signup"
          ? document.querySelector("#account-name").value.trim()
          : undefined;
      errorBox.textContent = "";
      if (!/^\d{10}$/.test(mobile)) {
        errorBox.textContent = "Enter a 10-digit phone number.";
        return;
      }
      if (
        mode === "signup" &&
        (name.length < 2 ||
          name.length > 80 ||
          !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name))
      ) {
        errorBox.textContent = "Enter a valid name with 2–80 characters.";
        return;
      }
      button.disabled = true;
      button.textContent =
        mode === "login" ? "Signing in…" : "Creating your account…";
      document.querySelector("#login-tab").disabled = true;
      document.querySelector("#signup-tab").disabled = true;
      try {
        await api(`/api/auth/${mode}`, {
          method: "POST",
          body: JSON.stringify({ name, mobile, password }),
        });
        location.assign(next);
      } catch (error) {
        errorBox.textContent = error.message;
        button.disabled = false;
        button.textContent =
          mode === "login"
            ? "Sign in & continue →"
            : "Create account & continue →";
        document.querySelector("#login-tab").disabled = false;
        document.querySelector("#signup-tab").disabled = false;
      }
    };
  }
  function switchMode(value) {
    phone = document.querySelector("#account-phone").value;
    mode = value;
    render();
  }
  render();
}
