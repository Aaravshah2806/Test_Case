import { createStore } from "./store.js";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function runtimeStore(env = process.env) {
  if (env.DATABASE_URL) {
    const { createPostgresStore } = await import("./postgres-store.js");
    return createPostgresStore(env.DATABASE_URL, {
      core: env.CORE_MODE === "1",
    });
  }
  if (env.RENDER)
    throw new Error(
      "Set DATABASE_URL to your Supabase session-pooler connection string. Render cannot persist local SQLite.",
    );
  const path =
    env.DB_PATH ||
    resolve(
      fileURLToPath(new URL("../", import.meta.url)),
      "data/slotbook.sqlite",
    );
  mkdirSync(dirname(path), { recursive: true });
  const store = createStore(path, { core: env.CORE_MODE === "1" });
  store.health = () => store.db.prepare("SELECT 1").get();
  store.close = () => store.db.close();
  return store;
}
