import { createClient, type Client } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import * as schema from "../db/schema";
import { createVercelDatabase } from "./vercel-database";
import type { Database } from "./database";

let client: Client | undefined;
let database: Database | undefined;

export const isPersonalDeployment = true;

function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) throw new Error("Connect a Turso database to this Vercel project.");
    client = createClient({ url, authToken });
  }
  return client;
}

export const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
  HIGGSFIELD_MCP_CONNECTED: process.env.HIGGSFIELD_MCP_CONNECTED,
  TERRACOTTA_MONTHLY_BUDGET_USD: process.env.TERRACOTTA_MONTHLY_BUDGET_USD,
  MCP_TOKEN_ENCRYPTION_KEY: process.env.MCP_TOKEN_ENCRYPTION_KEY,
  get DB() {
    return database ??= createVercelDatabase(getClient());
  },
};

export function getDb() {
  return drizzle(getClient(), { schema });
}
