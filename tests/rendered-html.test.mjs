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
  assert.match(page, /전체 모델 요약/);
  assert.match(page, /모델 핵심 비교/);
  assert.match(css, /\.model-insight-grid/);
  assert.match(css, /\.model-metrics/);
  assert.match(css, /\.model-compare-table/);
  assert.match(intelligence, /lmarena-ai%2Fleaderboard-dataset/);
  assert.match(intelligence, /Artificial Analysis/);
  assert.match(intelligence, /Claude Fable 5/);
  assert.match(intelligence, /GPT-5\.6 Sol/);
  assert.match(intelligence, /Gemini 3\.6 Flash/);
  assert.match(intelligence, /Perplexity Sonar Pro/);
  assert.match(intelligence, /Kimi K3/);
  assert.match(intelligence, /AbortSignal\.timeout/);
  assert.match(route, /s-maxage=21600/);
});

test("pairs cross-platform local terminals through an approval-only outbound agent", async () => {
  const [agent, orchestrator, page, css, schema, browserRoute, workerRoute, script, migration, productionCompose, caddy] = await Promise.all([
    source("lib/local-agent.ts"),
    source("lib/terracotta-orchestrator.ts"),
    source("app/page.tsx"),
    source("app/globals.css"),
    source("db/schema.ts"),
    source("app/api/local-agent/route.ts"),
    source("app/api/local-agent/worker/route.ts"),
    source("public/terracotta-local-agent.mjs"),
    source("drizzle/0006_chubby_karnak.sql"),
    source("compose.production.yaml"),
    source("deploy/Caddyfile"),
  ]);

  assert.match(agent, /SHA-256/);
  assert.match(agent, /local_agent_jobs/);
  assert.match(agent, /connectedLocalAgentTools/);
  assert.match(agent, /risk: "write"/);
  assert.match(agent, /runLocalAgentTool/);
  assert.match(orchestrator, /local_shell/);
  assert.match(orchestrator, /runLocalAgentTool/);
  assert.match(page, /로컬 터미널/);
  assert.match(page, /PowerShell/);
  assert.match(page, /macOS \/ Linux/);
  assert.match(css, /\.local-agent-dialog/);
  assert.match(schema, /localAgents/);
  assert.match(schema, /localAgentJobs/);
  assert.match(browserRoute, /createLocalAgent/);
  assert.match(workerRoute, /handleLocalAgentRequest/);
  assert.match(script, /process\.platform === "win32"/);
  assert.match(script, /\/bin\/zsh/);
  assert.match(script, /insideWorkspace/);
  assert.match(script, /blockedCommand/);
  assert.match(script, /NonInteractive/);
  assert.match(migration, /CREATE TABLE `local_agents`/);
  assert.match(migration, /CREATE TABLE `local_agent_jobs`/);
  assert.match(productionCompose, /oauth2-proxy/);
  assert.match(productionCompose, /terracotta-data/);
  assert.match(caddy, /X-Auth-Request-Email>oai-authenticated-user-email/);
});

test("organizes conversations, model context, and computer files by project", async () => {
  const [projects, filesRoute, projectRoute, context, orchestrator, agent, worker, page, css, schema, migration] = await Promise.all([
    source("lib/workspace-projects.ts"),
    source("app/api/projects/files/route.ts"),
    source("app/api/projects/route.ts"),
    source("lib/work-context.ts"),
    source("lib/terracotta-orchestrator.ts"),
    source("lib/local-agent.ts"),
    source("public/terracotta-local-agent.mjs"),
    source("app/page.tsx"),
    source("app/globals.css"),
    source("db/schema.ts"),
    source("drizzle/0007_serious_blizzard.sql"),
  ]);

  assert.match(projects, /workspace_projects/);
  assert.match(projects, /project_file_events/);
  assert.match(projects, /normalizeRootPath/);
  assert.match(projects, /ProjectFileAccess/);
  assert.match(projectRoute, /listWorkspaceProjects/);
  assert.match(filesRoute, /WRITE_CONFIRMATION_REQUIRED/);
  assert.match(filesRoute, /inspect_project_changes/);
  assert.match(context, /project_id/);
  assert.match(context, /projectPacket/);
  assert.match(orchestrator, /projectContext/);
  assert.match(orchestrator, /project\?\.model_preference/);
  assert.match(agent, /list_project_files/);
  assert.match(agent, /read_project_file/);
  assert.match(agent, /write_project_file/);
  assert.match(agent, /project\.file_access/);
  assert.match(agent, /project\.command_access/);
  assert.match(worker, /realpath/);
  assert.match(worker, /expectedHash/);
  assert.match(worker, /search_project_files/);
  assert.match(worker, /inspect_project_changes/);
  assert.match(page, /프로젝트 워크스페이스/);
  assert.match(page, /프로젝트 안에서 검색/);
  assert.match(page, /대화·모델 인계·프로젝트 지침/);
  assert.match(css, /\.project-file-workbench/);
  assert.match(css, /\.project-activity/);
  assert.match(schema, /workspaceProjects/);
  assert.match(schema, /projectFileEvents/);
  assert.match(migration, /CREATE TABLE `workspace_projects`/);
  assert.match(migration, /ALTER TABLE `work_sessions` ADD `project_id`/);
});

test("orchestrates models and MCP tools with durable write approval", async () => {
  const [orchestrator, assistantRoute, page, css, schema, migration] = await Promise.all([
    source("lib/terracotta-orchestrator.ts"),
    source("app/api/assistant/route.ts"),
    source("app/page.tsx"),
    source("app/globals.css"),
    source("db/schema.ts"),
    source("drizzle/0003_curved_natasha_romanoff.sql"),
  ]);

  assert.match(orchestrator, /MAX_AGENT_ROUNDS/);
  assert.match(orchestrator, /terracotta_web_research/);
  assert.match(orchestrator, /callMcpTool/);
  assert.match(orchestrator, /function_call_output/);
  assert.match(orchestrator, /tool_result/);
  assert.match(orchestrator, /function_result/);
  assert.match(orchestrator, /readOnlyHint/);
  assert.match(orchestrator, /approval_required/);
  assert.match(orchestrator, /resolveApproval/);
  assert.match(orchestrator, /function shouldReview/);
  assert.match(assistantRoute, /result\.approvalRequired \? 202 : 200/);
  assert.match(page, /승인하고 실행/);
  assert.match(page, /인자 변경은 허용하지 않아요/);
  assert.match(page, /orchestration-trace/);
  assert.match(css, /\.tool-approval/);
  assert.match(schema, /orchestrationRuns/);
  assert.match(schema, /orchestrationEvents/);
  assert.match(migration, /CREATE TABLE `orchestration_runs`/);
  assert.match(migration, /CREATE TABLE `orchestration_events`/);
});

test("persists provider-neutral work context and hands it between GPT, Claude, and Gemini", async () => {
  const [context, contextRoute, assistantRoute, orchestrator, page, css, schema, migration] = await Promise.all([
    source("lib/work-context.ts"),
    source("app/api/context/route.ts"),
    source("app/api/assistant/route.ts"),
    source("lib/terracotta-orchestrator.ts"),
    source("app/page.tsx"),
    source("app/globals.css"),
    source("db/schema.ts"),
    source("drizzle/0004_sturdy_toad_men.sql"),
  ]);

  assert.match(context, /work_sessions/);
  assert.match(context, /work_turns/);
  assert.match(context, /context_handoffs/);
  assert.match(context, /context_run_links/);
  assert.match(context, /buildProviderHistory/);
  assert.match(context, /kind: "google"/);
  assert.match(context, /Hidden reasoning is never transferred/);
  assert.match(contextRoute, /recentSessions/);
  assert.match(contextRoute, /private, no-store/);
  assert.match(assistantRoute, /payload\.sessionId/);
  assert.match(orchestrator, /recordContextHandoff/);
  assert.match(orchestrator, /appendAssistantTurn/);
  assert.match(orchestrator, /provider-neutral Terracotta work session/);
  assert.match(page, /GPT로 이어하기/);
  assert.match(page, /Claude로 이어하기/);
  assert.match(page, /Gemini로 이어하기/);
  assert.match(page, /GPT · Claude · Gemini 공용 기억/);
  assert.match(css, /\.context-bridge/);
  assert.match(css, /\.orchestration-trace span\.handoff/);
  assert.match(schema, /workSessions/);
  assert.match(schema, /workTurns/);
  assert.match(schema, /contextHandoffs/);
  assert.match(migration, /CREATE TABLE `work_sessions`/);
  assert.match(migration, /CREATE TABLE `work_turns`/);
  assert.match(migration, /CREATE TABLE `context_handoffs`/);
});

test("routes Gemini through the live registry, Interactions API, and Docker runtime", async () => {
  const [router, orchestrator, registryRoute, assistantRoute, page, compose, productionCompose, runtime] = await Promise.all([
    source("lib/terracotta-router.ts"),
    source("lib/terracotta-orchestrator.ts"),
    source("app/api/model-registry/route.ts"),
    source("app/api/assistant/route.ts"),
    source("app/page.tsx"),
    source("compose.yaml"),
    source("compose.production.yaml"),
    source("docker/prepare-runtime-env.mjs"),
  ]);

  assert.match(router, /provider: "google"/);
  assert.match(router, /gemini-3\.6-flash/);
  assert.match(router, /v1beta\/models\?pageSize=1000/);
  assert.match(router, /GEMINI_API_KEY/);
  assert.match(orchestrator, /invokeGeminiTurn/);
  assert.match(orchestrator, /v1beta\/interactions/);
  assert.match(orchestrator, /total_thought_tokens/);
  assert.match(registryRoute, /"gemini"/);
  assert.match(assistantRoute, /"gemini"/);
  assert.match(page, /Gemini 우선/);
  assert.match(page, /Google Gemini/);
  assert.match(compose, /GEMINI_API_KEY/);
  assert.match(productionCompose, /GEMINI_API_KEY/);
  assert.match(runtime, /GEMINI_API_KEY/);
});

test("shares work sessions with role-based team handoffs", async () => {
  const [context, contextRoute, page, css, schema, migration] = await Promise.all([
    source("lib/work-context.ts"),
    source("app/api/context/route.ts"),
    source("app/page.tsx"),
    source("app/globals.css"),
    source("db/schema.ts"),
    source("drizzle/0005_famous_magik.sql"),
  ]);

  assert.match(context, /work_session_members/);
  assert.match(context, /team_handoffs/);
  assert.match(context, /assertCanEdit/);
  assert.match(context, /session\.access_role === "viewer"/);
  assert.match(context, /shareWorkSession/);
  assert.match(context, /handoffWorkSession/);
  assert.match(context, /acceptTeamHandoff/);
  assert.match(contextRoute, /action\?: "new" \| "share" \| "handoff" \| "revoke" \| "accept"/);
  assert.match(page, /팀 공유/);
  assert.match(page, /초대하고 넘기기/);
  assert.match(page, /보기 전용 작업입니다/);
  assert.match(css, /\.team-dialog/);
  assert.match(css, /\.incoming-handoff/);
  assert.match(schema, /workSessionMembers/);
  assert.match(schema, /teamHandoffs/);
  assert.match(migration, /CREATE TABLE `work_session_members`/);
  assert.match(migration, /CREATE TABLE `team_handoffs`/);
});
