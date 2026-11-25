/// <reference types="@cloudflare/workers-types" />
import { env as bindings } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export const env = bindings as { DB: D1Database };
export const isPersonalDeployment = false;

export function getDb() {
  if (!env.DB) {
    throw new Error("Terracotta D1 binding `DB` is unavailable. Start Docker or configure the Worker binding.");
  }
  return drizzle(env.DB, { schema });
}
