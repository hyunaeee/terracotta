import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
