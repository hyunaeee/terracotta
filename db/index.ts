import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Terracotta D1 binding `DB` is unavailable. Start the Docker distribution or configure the `DB` binding in the Worker runtime."
    );
  }

  return drizzle(env.DB, { schema });
}
