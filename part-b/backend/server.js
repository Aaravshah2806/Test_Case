import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { AppError } from "./errors.js";
import { runtimeStore } from "./runtime-store.js";
import { indiaNow } from "./availability.js";
import { SESSION_SECONDS } from "./auth.js";
import { ADMIN_SESSION_SECONDS } from "./admin-auth.js";

const root = fileURLToPath(new URL("../", import.meta.url));
export function appServer(
  store,
  {
    secureCookies = process.env.COOKIE_SECURE === "1",
    frontendOrigins = process.env.FRONTEND_ORIGINS || "",
  } = {},
) {
  const allowedOrigins = new Set(
    frontendOrigins
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        const url = new URL(value);
        if (url.origin !== value || !["http:", "https:"].includes(url.protocol))
          throw new Error(
            "FRONTEND_ORIGINS must contain exact origins without paths or trailing slashes.",
          );
        return url.origin;
      }),
  );
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/health") {
        try {
          await store.health?.();
          return send(200, { status: "ok" });
        } catch {
          return send(503, { error: "Database unavailable." });
        }
      }
      const sessionToken =
        String(req.headers.cookie || "")
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("slotbook_session="))
          ?.slice("slotbook_session=".length) || "";
      const adminToken =
        String(req.headers.cookie || "")
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("slotbook_admin="))
          ?.slice("slotbook_admin=".length) || "";
      const administrator = await store.adminAuth.session(adminToken);
      const customer = administrator
        ? null
        : await store.auth.session(sessionToken);
      const requireCustomer = () => {
        if (administrator)
          throw new AppError(
            "Use a customer account to book appointments.",
            403,
          );
        if (!customer)
          throw new AppError("Please sign in to book an appointment.", 401);
        return customer;
      };
      const manage = async (id, token) => {
        requireCustomer();
        const booking = await store.managed(id, token);
        if (booking.customer_id !== null && booking.customer_id !== customer.id)
          throw new AppError(
            "This appointment belongs to another account.",
            403,
          );
        return booking;
      };
      const cookie = (
        token,
        maxAge = SESSION_SECONDS,
        name = "slotbook_session",
      ) => {
        const existing = res.getHeader("Set-Cookie") || [];
        res.setHeader("Set-Cookie", [
          ...existing,
          `${name}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookies || req.socket.encrypted ? "; Secure" : ""}`,
        ]);
      };
      if (
        req.method === "POST" &&
        req.headers.origin &&
        !allowedOrigins.has(req.headers.origin) &&
        ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(
          req.headers.origin,
        )
      )
        throw new AppError("Cross-origin requests are not allowed.", 403);
      const readInput = async () => {
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          throw new AppError("Send JSON data.", 415);
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) throw new AppError("Request too large.", 413);
        }
        let input;
        try {
          input = JSON.parse(body);
        } catch {
          throw new AppError("Invalid JSON.");
        }
        if (!input || typeof input !== "object" || Array.isArray(input))
          throw new AppError("Invalid request.");
        return input;
      };
      if (req.method === "GET" && url.pathname === "/api/auth/session")
        return send(200, { customer, admin: administrator });
      if (req.method === "POST" && url.pathname === "/api/admin/auth/login") {
        const input = await readInput(),
          limitKey =
            allowedOrigins.size &&
            typeof input.mobile === "string" &&
            /^\d{10}$/.test(input.mobile)
              ? `admin-phone:${input.mobile}`
              : `admin:${req.socket.remoteAddress}`;
        await store.auth.rateLimit(limitKey);
        const result = await store.adminAuth.login(input);
        await store.adminAuth.logout(adminToken);
        await store.auth.logout(sessionToken);
        cookie(result.token, ADMIN_SESSION_SECONDS, "slotbook_admin");
        cookie("", 0);
        return send(200, { admin: result.admin });
      }
      if (req.method === "GET" && url.pathname === "/api/admin/auth/session")
        return send(200, { admin: administrator });
      if (req.method === "POST" && url.pathname === "/api/admin/auth/logout") {
        await store.adminAuth.logout(adminToken);
        cookie("", 0, "slotbook_admin");
        return send(200, { admin: null });
      }
      if (
        req.method === "POST" &&
        ["/api/auth/signup", "/api/auth/login"].includes(url.pathname)
      ) {
        const input = await readInput();
        // Reverse proxies share socket addresses. Limit valid phone identities so
        // one customer's failed login does not lock every customer out.
        const limitKey =
          allowedOrigins.size &&
          typeof input.mobile === "string" &&
          /^\d{10}$/.test(input.mobile)
            ? `customer-phone:${input.mobile}`
            : req.socket.remoteAddress;
        await store.auth.rateLimit(limitKey);
        const result =
          await store.auth[
            url.pathname.endsWith("/signup") ? "signup" : "login"
          ](input);
        if (sessionToken) await store.auth.logout(sessionToken);
        await store.adminAuth.logout(adminToken);
        cookie(result.token);
        cookie("", 0, "slotbook_admin");
        return send(url.pathname.endsWith("/signup") ? 201 : 200, {
          customer: result.customer,
        });
      }
      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        await store.auth.logout(sessionToken);
        cookie("", 0);
        return send(200, { customer: null });
      }
      if (req.method === "GET" && url.pathname === "/book" && !customer) {
        res.writeHead(302, {
          Location: administrator
            ? "/admin"
            : `/login?next=${encodeURIComponent(url.pathname + url.search)}`,
          "Cache-Control": "no-store",
        });
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/admin" && !administrator) {
        res.writeHead(302, {
          Location: "/admin/login",
          "Cache-Control": "no-store",
        });
        return res.end();
      }
      if (
        req.method === "GET" &&
        ["/", "/login"].includes(url.pathname) &&
        administrator
      ) {
        res.writeHead(302, { Location: "/admin", "Cache-Control": "no-store" });
        return res.end();
      }
      const admin = () => {
        if (!administrator)
          throw new AppError(
            "An admin account is required.",
            customer ? 403 : 401,
          );
        return administrator;
      };
      if (url.pathname.startsWith("/api/admin/")) {
        admin();
        if (req.method === "GET" && url.pathname === "/api/admin/bookings")
          return send(200, await store.day(url.searchParams.get("date")));
        const match = url.pathname.match(
          /^\/api\/admin\/bookings\/([a-f0-9-]+)\/cancel$/,
        );
        if (req.method === "POST" && match)
          return send(200, await store.cancel(match[1]));
      }
      if (req.method === "GET" && url.pathname === "/api/catalog")
        return send(200, {
          services: await store.services(),
          stylists: await store.stylists(),
          today: indiaNow(store.clock()).date,
        });
      if (req.method === "GET" && url.pathname === "/api/availability") {
        requireCustomer();
        const exclude = url.searchParams.get("exclude") || "";
        if (exclude)
          await manage(
            exclude,
            String(req.headers.authorization || "").replace(/^Bearer /, ""),
          );
        return send(200, {
          times: await store.availability(
            Object.fromEntries(url.searchParams),
            exclude,
          ),
        });
      }
      const managedMatch = url.pathname.match(
        /^\/api\/bookings\/([a-f0-9-]+)(\/reschedule)?$/,
      );
      if (req.method === "GET" && managedMatch && !managedMatch[2])
        return send(
          200,
          await manage(
            managedMatch[1],
            String(req.headers.authorization || "").replace(/^Bearer /, ""),
          ),
        );
      if (
        req.method === "POST" &&
        (url.pathname === "/api/bookings" || managedMatch?.[2])
      ) {
        requireCustomer();
        const input = await readInput();
        if (managedMatch?.[2]) {
          await manage(managedMatch[1], input.token);
          return send(
            200,
            await store.reschedule(managedMatch[1], input, input.token),
          );
        }
        if (
          input.useAccountNumber !== undefined &&
          typeof input.useAccountNumber !== "boolean"
        )
          throw new AppError(
            "Choose whether to use your account phone number.",
          );
        const mobile =
          input.useAccountNumber === false ? input.mobile : customer.mobile;
        return send(201, await store.book({ ...input, mobile }, customer.id));
      }
      const files = {
        "/": "index.html",
        "/book": "index.html",
        "/login": "index.html",
        "/admin": "index.html",
        "/admin/login": "index.html",
        "/app.js": "app.js",
        "/home.js": "home.js",
        "/auth-ui.js": "auth-ui.js",
        "/admin-ui.js": "admin-ui.js",
        "/style.css": "style.css",
      };
      if (req.method === "GET" && files[url.pathname]) {
        const type = url.pathname.endsWith(".js")
          ? "text/javascript"
          : url.pathname.endsWith(".css")
            ? "text/css"
            : "text/html";
        res.writeHead(200, {
          "Content-Type": `${type}; charset=utf-8`,
          "Cache-Control": "no-store",
        });
        return res.end(
          readFileSync(resolve(root, "frontend", files[url.pathname])),
        );
      }
      send(404, { error: "Not found." });
    } catch (error) {
      if (!error.status)
        console.error("Request failed.", { code: error.code || "unknown" });
      send(error.status || 500, {
        error: error.status
          ? error.message
          : "Something went wrong. Please try again.",
      });
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const store = await runtimeStore();
  const server = appServer(store);
  console.log(
    "Create admins with npm run admin:create using the same DATABASE_URL (or local SQLite file).",
  );
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () => console.log(`Slotbook: http://localhost:${process.env.PORT || 3000}`),
  );
  const shutdown = () =>
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
