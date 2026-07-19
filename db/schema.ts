import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const modelRegistry = sqliteTable("model_registry", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  remoteCreatedAt: integer("remote_created_at").notNull().default(0),
  versionRank: integer("version_rank").notNull().default(0),
  isRoutable: integer("is_routable", { mode: "boolean" }).notNull().default(false),
  inputPriceMicros: integer("input_price_micros").notNull().default(0),
  outputPriceMicros: integer("output_price_micros").notNull().default(0),
  source: text("source").notNull().default("official-seed"),
  discoveredAt: text("discovered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const providerSync = sqliteTable("provider_sync", {
  provider: text("provider").primaryKey(),
  status: text("status").notNull(),
  currentModel: text("current_model"),
  lastSyncedAt: text("last_synced_at"),
  nextSyncAt: text("next_sync_at"),
  error: text("error"),
});

export const usageLedger = sqliteTable("usage_ledger", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  taskType: text("task_type").notNull(),
  inputUnits: integer("input_units").notNull().default(0),
  outputUnits: integer("output_units").notNull().default(0),
  providerCostMicros: integer("provider_cost_micros").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  isLive: integer("is_live", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ownerSettings = sqliteTable("owner_settings", {
  ownerId: text("owner_id").primaryKey(),
  modelPreference: text("model_preference").notNull().default("latest"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mcpConnections = sqliteTable("mcp_connections", {
  id: text("id").notNull(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  serverUrl: text("server_url").notNull(),
  category: text("category").notNull().default("custom"),
  status: text("status").notNull().default("not_connected"),
  authType: text("auth_type").notNull().default("oauth"),
  toolCount: integer("tool_count").notNull().default(0),
  toolsJson: text("tools_json").notNull().default("[]"),
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  tokenExpiresAt: text("token_expires_at"),
  oauthClientId: text("oauth_client_id"),
  encryptedClientSecret: text("encrypted_client_secret"),
  authorizationEndpoint: text("authorization_endpoint"),
  tokenEndpoint: text("token_endpoint"),
  resource: text("resource"),
  scopes: text("scopes"),
  lastCheckedAt: text("last_checked_at"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.id, table.ownerId] })]);

export const mcpOauthStates = sqliteTable("mcp_oauth_states", {
  state: text("state").primaryKey(),
  connectionId: text("connection_id").notNull(),
  ownerId: text("owner_id").notNull(),
  encryptedVerifier: text("encrypted_verifier").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  resource: text("resource").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
});

export const orchestrationRuns = sqliteTable("orchestration_runs", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  prompt: text("prompt").notNull(),
  preference: text("preference").notNull(),
  taskKind: text("task_kind").notNull(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  stateJson: text("state_json").notNull().default("{}"),
  toolsJson: text("tools_json").notNull().default("[]"),
  pendingCallsJson: text("pending_calls_json").notNull().default("[]"),
  traceJson: text("trace_json").notNull().default("[]"),
  costMicros: integer("cost_micros").notNull().default(0),
  status: text("status").notNull().default("running"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
});

export const orchestrationEvents = sqliteTable("orchestration_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  ownerId: text("owner_id").notNull(),
  eventType: text("event_type").notNull(),
  provider: text("provider"),
  modelId: text("model_id"),
  connectionId: text("connection_id"),
  toolName: text("tool_name"),
  risk: text("risk"),
  status: text("status").notNull(),
  inputJson: text("input_json"),
  outputSummary: text("output_summary"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
