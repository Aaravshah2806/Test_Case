import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { runtimeStore } from "./runtime-store.js";

let hidden = false,
  closing = false,
  rl,
  store;
try {
  let name = process.env.SLOTBOOK_ADMIN_NAME,
    mobile = process.env.SLOTBOOK_ADMIN_PHONE,
    password = process.env.SLOTBOOK_ADMIN_PASSWORD;
  if (!name || !mobile || !password) {
    if (!process.stdin.isTTY)
      throw new Error(
        "Run this command in an interactive terminal, or supply SLOTBOOK_ADMIN_NAME, SLOTBOOK_ADMIN_PHONE and SLOTBOOK_ADMIN_PASSWORD through the environment.",
      );
    const output = new Writable({
      write(chunk, encoding, callback) {
        if (!hidden) process.stdout.write(chunk);
        callback();
      },
    });
    rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.on("error", (error) => {
      // Some Windows PTYs lose their raw-input handle during shutdown.
      if (
        closing &&
        process.platform === "win32" &&
        error.code === "EPERM" &&
        error.syscall === "setRawMode"
      )
        return;
      console.error(
        "Terminal input failed. Run setup again in a standard terminal.",
      );
      process.exitCode = 1;
    });
    rl.on("SIGINT", () => {
      closing = true;
      rl.close();
      process.stdout.write("\n");
      process.exit(130);
    });
    name = await rl.question("Admin name: ");
    mobile = await rl.question("10-digit phone number: ");
    const secret = async (prompt) => {
      process.stdout.write(prompt);
      hidden = true;
      try {
        return await rl.question("");
      } finally {
        hidden = false;
        process.stdout.write("\n");
      }
    };
    password = await secret("Password (8–128 characters; hidden): ");
    if (password !== (await secret("Confirm password (hidden): ")))
      throw new Error("Passwords do not match. No admin account was created.");
  }
  store = await runtimeStore();
  const admin = await store.adminAuth.create({ name, mobile, password });
  console.log(
    `Admin account created.\nAssigned login ID: ${admin.loginId}\nSign in at ${(process.env.FRONTEND_ORIGINS || `http://localhost:${process.env.PORT || 3000}`).split(",")[0].trim()}/admin/login\nGive the login ID to this admin. The password is not printed.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  closing = true;
  rl?.close();
  await store?.close();
  if (rl) {
    process.stdin.pause();
    await new Promise((resolve) => process.stdout.write("", resolve));
    process.exit(process.exitCode || 0);
  }
}
