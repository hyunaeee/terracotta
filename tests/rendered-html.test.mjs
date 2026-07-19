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
  const [hub, page, css, schema, connectRoute, toolsRoute] = await Promise.all([
    source("lib/mcp-hub.ts"),
    source("app/page.tsx"),
    source("app/globals.css"),
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
  assert.match(page, /function McpBrandMark/);
  assert.match(page, /mcpBrandAssets/);
  assert.match(page, /id\.startsWith\("cloudflare-"\)/);
  assert.match(css, /\.mcp-service-mark img/);
  assert.match(page, /OAuth 앱 키를 암호화해 저장/);
  assert.match(page, /Shopify Storefront/);
  assert.match(connectRoute, /startMcpConnection/);
  assert.match(toolsRoute, /callMcpTool/);

  for (const asset of [
    "github.svg",
    "notion.svg",
    "figma.svg",
    "google-drive.svg",
    "slack.png",
    "canva.png",
    "cloudflare.svg",
    "microsoft-learn.png",
    "exa.png",
    "context7.png",
  ]) {
    const image = await readFile(new URL(`../public/assets/mcp/${asset}`, import.meta.url));
    assert.ok(image.length > 100, `${asset} should be a real brand asset`);
  }
});

test("separates lawn terrain from free-position garden objects", async () => {
  const [page, css] = await Promise.all([
    source("app/page.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(page, /terracotta-garden-v3/);
  assert.match(page, /groundTiles/);
  assert.match(page, /decorations/);
  assert.match(page, /handleGardenPointerMove/);
  assert.match(page, /characterPosition/);
  assert.match(page, /grass-sage-connected/);
  assert.match(page, /requiresFullLawn/);
  assert.match(page, /채소 텃밭/);
  assert.match(page, /벚꽃나무/);
  assert.match(page, /라벤더 꽃나무/);
  assert.match(css, /\.garden-ground-grid\.connected/);
  assert.match(css, /\.free-garden-item/);
  assert.match(css, /touch-action: none/);

  for (const asset of [
    "vegetable-bed.png",
    "tomato-bed.png",
    "herb-bed.png",
    "greenhouse.png",
    "watering-can.png",
    "scarecrow.png",
    "birdhouse.png",
    "cat.png",
    "beehive.png",
  ]) {
    const image = await readFile(new URL(`../public/assets/garden/${asset}`, import.meta.url));
    assert.ok(image.length > 100, `${asset} should be a real PNG asset`);
  }
});

test("keeps garden depth layers below every modal", async () => {
  const [page, css] = await Promise.all([
    source("app/page.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(page, /zIndex: Math\.round\(2 \+ position\.y \/ 10\)/);
  assert.match(css, /\.garden-rail \{ position: relative; z-index: 0; isolation: isolate;/);
  assert.match(css, /\.pixel-garden \{ position: relative; isolation: isolate;/);
  assert.match(css, /\.overlay \{ position: fixed; inset: 0; z-index: 50;/);
});

test("adds a sourced, live-updating model intelligence lab", async () => {
  const [page, css, intelligence, route] = await Promise.all([
    source("app/page.tsx"),
    source("app/globals.css"),
    source("lib/model-intelligence.ts"),
    source("app/api/model-intelligence/route.ts"),
  ]);

  assert.match(page, /모델 연구소/);
  assert.match(page, /최근 모델, 한눈에 비교/);
  assert.match(page, /Arena 공개 데이터 연결됨/);
  assert.match(page, /잘하는 것/);
  assert.match(page, /약한 것/);
  assert.match(css, /\.model-insight-grid/);
  assert.match(css, /\.model-metrics/);
  assert.match(intelligence, /lmarena-ai%2Fleaderboard-dataset/);
  assert.match(intelligence, /Artificial Analysis/);
  assert.match(intelligence, /Claude Fable 5/);
  assert.match(intelligence, /GPT-5\.6 Sol/);
  assert.match(intelligence, /Perplexity Sonar Pro/);
  assert.match(intelligence, /Kimi K3/);
  assert.match(intelligence, /AbortSignal\.timeout/);
  assert.match(route, /s-maxage=21600/);
});
