import { mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function deploymentConfig(backend) {
  const url = new URL(backend);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error(
      "RENDER_BACKEND_URL must be an HTTPS origin, such as https://slotbook-api.onrender.com",
    );
  return {
    version: 3,
    routes: [
      {
        src: "/(.*)",
        headers: {
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "same-origin",
          "Content-Security-Policy":
            "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        },
        continue: true,
      },
      {
        src: "/api/(.*)",
        dest: `${url.origin}/api/$1`,
        headers: { "Cache-Control": "no-store" },
      },
      {
        src: "/(?:book|login|admin|admin/login)?",
        dest: "/index.html",
        headers: { "Cache-Control": "no-store" },
      },
      { handle: "filesystem" },
      { src: "/(.*)", status: 404, dest: "/404.html" },
    ],
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.env.RENDER_BACKEND_URL)
    throw new Error("Set RENDER_BACKEND_URL in Vercel before building.");
  const config = deploymentConfig(process.env.RENDER_BACKEND_URL);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const output = resolve(root, ".vercel/output");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(resolve(root, "frontend"), resolve(output, "static"), {
    recursive: true,
  });
  writeFileSync(
    resolve(output, "static/404.html"),
    '<!doctype html><html lang="en"><title>Page not found</title><h1>Page not found</h1><a href="/">Return to Slotbook</a></html>',
  );
  writeFileSync(
    resolve(output, "config.json"),
    JSON.stringify(config, null, 2),
  );
  console.log("Vercel frontend built. API requests use the Render proxy.");
}
