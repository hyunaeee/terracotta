import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("keeps the Terracotta identity clean and consistent", async () => {
  const [page, css] = await Promise.all([
    source("app/page.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(page, /function TerracottaMark/);
  assert.match(page, /mark-pot/);
  assert.match(page, /mark-stem/);
  assert.match(page, /mark-leaf-left/);
  assert.match(page, /> Terracotta/);
  assert.match(page, /Terracotta MCP Hub/);
  assert.doesNotMatch(page, /\bOrbit\b/);
  assert.match(css, /\.terracotta-mark/);
  assert.match(css, /var\(--terracotta\)/);
  assert.match(css, /\.mcp-grid/);
});

test("implements a durable, encrypted OAuth MCP hub", async () => {
  const [hub, page, schema, connectRoute, toolsRoute] = await Promise.all([
    source("lib/mcp-hub.ts"),
    source("app/page.tsx"),
    source("db/schema.ts"),
    source("app/api/mcp/connect/route.ts"),
    source("app/api/mcp/tools/route.ts"),
  ]);

  for (const provider of ["GitHub", "Notion", "Figma", "Linear", "Google Drive", "Slack", "Canva", "Stripe", "Supabase", "Sentry", "Postman", "Microsoft Learn", "Hugging Face", "Airtable"]) {
    assert.match(hub, new RegExp(provider.replace(" ", "\\s")));
  }
  assert.match(hub, /AES-GCM/);
  assert.match(hub, /code_challenge_method.*S256/);
  assert.match(hub, /resource/);
  assert.match(hub, /tools\/list/);
  assert.match(hub, /tools\/call/);
  assert.match(hub, /encrypted_access_token/);
  assert.match(hub, /configureMcpOAuthApp/);
  assert.match(hub, /내부 네트워크 주소는 연결할 수 없어요/);
  assert.match(schema, /primaryKey\(\{ columns: \[table\.id, table\.ownerId\] \}\)/);
  assert.match(page, /\/api\/mcp\/connect/);
  assert.match(page, /mcpCategories/);
  assert.match(page, /OAuth 앱 키를 암호화해 저장/);
  assert.match(page, /Shopify Storefront/);
  assert.match(connectRoute, /startMcpConnection/);
  assert.match(toolsRoute, /callMcpTool/);
});
