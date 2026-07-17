import { env as cloudflareEnv } from "cloudflare:workers";

type McpEnv = { DB: D1Database; MCP_TOKEN_ENCRYPTION_KEY?: string };
type Connection = {
  id: string; owner_id: string; name: string; server_url: string; category: string; status: string; auth_type: string;
  tool_count: number; tools_json: string; encrypted_access_token: string | null; encrypted_refresh_token: string | null;
  token_expires_at: string | null; oauth_client_id: string | null; encrypted_client_secret: string | null;
  authorization_endpoint: string | null; token_endpoint: string | null; resource: string | null; scopes: string | null; last_checked_at: string | null; error: string | null;
};

const PROTOCOL_VERSION = "2025-11-25";
const presets = [
  { id: "github", name: "GitHub", url: "https://api.githubcopilot.com/mcp/", category: "개발", auth: "oauth", note: "저장소·이슈·PR" },
  { id: "notion", name: "Notion", url: "https://mcp.notion.com/mcp", category: "지식", auth: "oauth", note: "페이지 검색·작성" },
  { id: "figma", name: "Figma", url: "https://mcp.figma.com/mcp", category: "디자인", auth: "oauth", note: "디자인 컨텍스트" },
  { id: "linear", name: "Linear", url: "https://mcp.linear.app/mcp", category: "업무", auth: "oauth", note: "이슈·프로젝트" },
  { id: "google-drive", name: "Google Drive", url: "https://drivemcp.googleapis.com/mcp/v1", category: "파일", auth: "oauth", note: "Developer Preview" },
];

const schema = [
  `CREATE TABLE IF NOT EXISTS mcp_connections (id TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, server_url TEXT NOT NULL, category TEXT DEFAULT 'custom' NOT NULL, status TEXT DEFAULT 'not_connected' NOT NULL, auth_type TEXT DEFAULT 'oauth' NOT NULL, tool_count INTEGER DEFAULT 0 NOT NULL, tools_json TEXT DEFAULT '[]' NOT NULL, encrypted_access_token TEXT, encrypted_refresh_token TEXT, token_expires_at TEXT, oauth_client_id TEXT, encrypted_client_secret TEXT, authorization_endpoint TEXT, token_endpoint TEXT, resource TEXT, scopes TEXT, last_checked_at TEXT, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, PRIMARY KEY (id, owner_id))`,
  `CREATE INDEX IF NOT EXISTS mcp_connections_owner_idx ON mcp_connections (owner_id, status)`,
  `CREATE TABLE IF NOT EXISTS mcp_oauth_states (state TEXT PRIMARY KEY NOT NULL, connection_id TEXT NOT NULL, owner_id TEXT NOT NULL, encrypted_verifier TEXT NOT NULL, redirect_uri TEXT NOT NULL, resource TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, expires_at TEXT NOT NULL)`,
];

function env() { return cloudflareEnv as unknown as McpEnv; }
export function ownerId(request: Request) { return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "owner"; }
function safeMessage(error: unknown) { return (error instanceof Error ? error.message : "MCP connection failed").slice(0, 260); }

function assertSafeUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") throw new Error("MCP 서버는 HTTPS 주소만 연결할 수 있어요.");
  if (host === "localhost" || host.endsWith(".local") || host === "metadata.google.internal" || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::1") throw new Error("내부 네트워크 주소는 연결할 수 없어요.");
  return url;
}

async function ensureHub(db: D1Database, owner: string) {
  await db.batch(schema.map((sql) => db.prepare(sql)));
  for (const item of presets) {
    await db.prepare("INSERT OR IGNORE INTO mcp_connections (id, owner_id, name, server_url, category, auth_type) VALUES (?, ?, ?, ?, ?, ?)").bind(item.id, owner, item.name, item.url, item.category, item.auth).run();
  }
  await db.prepare("DELETE FROM mcp_oauth_states WHERE expires_at < CURRENT_TIMESTAMP").run();
}

function bytesToBase64(bytes: Uint8Array) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
function base64ToBytes(value: string) { const raw = atob(value); return Uint8Array.from(raw, (char) => char.charCodeAt(0)); }
async function encryptionKey() {
  const key = env().MCP_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("MCP 토큰 암호화 키가 아직 설정되지 않았어요.");
  const bytes = base64ToBytes(key);
  if (bytes.length !== 32) throw new Error("MCP 토큰 암호화 키 형식이 올바르지 않아요.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}
async function decrypt(value: string | null) {
  if (!value) return null;
  const [iv, data] = value.split(".");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(data));
  return new TextDecoder().decode(decrypted);
}
async function pkceChallenge(verifier: string) { return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function randomUrlSafe(size = 32) { return bytesToBase64(crypto.getRandomValues(new Uint8Array(size))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }

function parseRpc(text: string, contentType: string | null) {
  if (contentType?.includes("text/event-stream")) {
    const events = text.split(/\r?\n/).filter((line) => line.startsWith("data:"));
    for (const line of events.reverse()) { try { return JSON.parse(line.slice(5).trim()); } catch { /* keep looking */ } }
    throw new Error("MCP 서버가 비어 있는 이벤트 스트림을 반환했어요.");
  }
  return text ? JSON.parse(text) : null;
}

async function rpc(urlValue: string, body: object, token?: string | null, session?: string | null) {
  const url = assertSafeUrl(urlValue);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (session) headers["MCP-Session-Id"] = session;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (response.status === 401) return { unauthorized: true as const, authenticate: response.headers.get("WWW-Authenticate"), response };
  if (!response.ok) throw new Error(`MCP 서버 응답 ${response.status}`);
  const payload = parseRpc(await response.text(), response.headers.get("content-type"));
  if (payload?.error) throw new Error(payload.error.message || "MCP JSON-RPC 오류");
  return { unauthorized: false as const, payload, session: response.headers.get("MCP-Session-Id") };
}

async function initializeAndList(connection: Connection, token?: string | null) {
  const initialized = await rpc(connection.server_url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "Terracotta", version: "1.0.0" } } }, token);
  if (initialized.unauthorized) return initialized;
  await rpc(connection.server_url, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, token, initialized.session);
  const listed = await rpc(connection.server_url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, token, initialized.session);
  if (listed.unauthorized) return listed;
  const tools = Array.isArray(listed.payload?.result?.tools) ? listed.payload.result.tools : [];
  return { unauthorized: false as const, tools };
}

async function readJson(urlValue: string) {
  const url = assertSafeUrl(urlValue);
  const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`OAuth 메타데이터 응답 ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

function metadataCandidates(server: URL, challenge: string | null) {
  const found = challenge?.match(/resource_metadata="([^"]+)"/i)?.[1];
  if (found) return [found];
  const path = server.pathname === "/" ? "" : server.pathname.replace(/\/$/, "");
  return [`${server.origin}/.well-known/oauth-protected-resource${path}`, `${server.origin}/.well-known/oauth-protected-resource`];
}
function authMetadataCandidates(issuerValue: string) {
  const issuer = assertSafeUrl(issuerValue); const path = issuer.pathname === "/" ? "" : issuer.pathname.replace(/\/$/, "");
  return path ? [`${issuer.origin}/.well-known/oauth-authorization-server${path}`, `${issuer.origin}/.well-known/openid-configuration${path}`, `${issuer.origin}${path}/.well-known/openid-configuration`] : [`${issuer.origin}/.well-known/oauth-authorization-server`, `${issuer.origin}/.well-known/openid-configuration`];
}
async function firstJson(urls: string[]) { let last: unknown; for (const url of urls) { try { return await readJson(url); } catch (error) { last = error; } } throw last ?? new Error("OAuth 메타데이터를 찾지 못했어요."); }

async function connection(db: D1Database, owner: string, id: string) {
  const row = await db.prepare("SELECT * FROM mcp_connections WHERE owner_id=? AND id=?").bind(owner, id).first<Connection>();
  if (!row) throw new Error("MCP 연결을 찾을 수 없어요.");
  return row;
}

export async function listMcpConnections(request: Request) {
  const db = env().DB; const owner = ownerId(request); await ensureHub(db, owner);
  const rows = await db.prepare("SELECT id, name, server_url, category, status, auth_type, tool_count, tools_json, last_checked_at, error FROM mcp_connections WHERE owner_id=? ORDER BY CASE id WHEN 'github' THEN 1 WHEN 'notion' THEN 2 WHEN 'figma' THEN 3 WHEN 'linear' THEN 4 WHEN 'google-drive' THEN 5 ELSE 9 END, name").bind(owner).all<Record<string, unknown>>();
  return rows.results.map((row) => ({ ...row, tools: JSON.parse(String(row.tools_json ?? "[]")), tools_json: undefined, note: presets.find((item) => item.id === row.id)?.note ?? "사용자 MCP" }));
}

export async function addCustomMcp(request: Request, payload: { name?: string; url?: string }) {
  const db = env().DB; const owner = ownerId(request); await ensureHub(db, owner);
  const name = payload.name?.trim().slice(0, 50) || "Custom MCP"; const url = assertSafeUrl(payload.url?.trim() || "").toString();
  const id = `custom-${crypto.randomUUID()}`;
  await db.prepare("INSERT INTO mcp_connections (id, owner_id, name, server_url, category, auth_type) VALUES (?, ?, ?, ?, 'custom', 'auto')").bind(id, owner, name, url).run();
  return { id };
}

export async function startMcpConnection(request: Request, id: string) {
  const db = env().DB; const owner = ownerId(request); await ensureHub(db, owner); const item = await connection(db, owner, id);
  try {
    const initial = await initializeAndList(item, null);
    if (!initial.unauthorized) {
      await db.prepare("UPDATE mcp_connections SET status='connected', auth_type='none', tool_count=?, tools_json=?, last_checked_at=CURRENT_TIMESTAMP, error=NULL, updated_at=CURRENT_TIMESTAMP WHERE owner_id=? AND id=?").bind(initial.tools.length, JSON.stringify(initial.tools), owner, id).run();
      return { connected: true, toolCount: initial.tools.length };
    }
    const server = assertSafeUrl(item.server_url);
    const resource = await firstJson(metadataCandidates(server, initial.authenticate));
    const issuer = Array.isArray(resource.authorization_servers) ? String(resource.authorization_servers[0]) : "";
    if (!issuer) throw new Error("MCP 서버가 OAuth 인증 서버를 알려주지 않았어요.");
    const auth = await firstJson(authMetadataCandidates(issuer));
    const authorizationEndpoint = String(auth.authorization_endpoint ?? ""); const tokenEndpoint = String(auth.token_endpoint ?? "");
    if (!authorizationEndpoint || !tokenEndpoint) throw new Error("OAuth 인증 또는 토큰 주소가 없어요.");
    if (!Array.isArray(auth.code_challenge_methods_supported) || !auth.code_challenge_methods_supported.includes("S256")) throw new Error("이 서버는 필수 PKCE S256 인증을 지원하지 않아요.");
    const origin = new URL(request.url).origin; const redirectUri = `${origin}/api/mcp/callback`; const metadataUrl = `${origin}/api/mcp/client-metadata`;
    let clientId = metadataUrl; let clientSecret: string | null = null;
    if (auth.client_id_metadata_document_supported !== true) {
      const registrationEndpoint = String(auth.registration_endpoint ?? "");
      if (!registrationEndpoint) throw new Error("공급사 OAuth 앱 등록이 필요해요.");
      const registration = await fetch(assertSafeUrl(registrationEndpoint), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Terracotta", redirect_uris: [redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }), redirect: "error", signal: AbortSignal.timeout(20_000) });
      if (!registration.ok) throw new Error(`OAuth 클라이언트 등록 응답 ${registration.status}`);
      const registered = await registration.json() as { client_id?: string; client_secret?: string };
      if (!registered.client_id) throw new Error("OAuth 클라이언트 ID를 받지 못했어요.");
      clientId = registered.client_id; clientSecret = registered.client_secret ?? null;
    }
    const verifier = randomUrlSafe(48); const state = randomUrlSafe(32); const resourceId = String(resource.resource ?? item.server_url); const challengedScope = initial.authenticate?.match(/scope="([^"]+)"/i)?.[1]; const scopes = challengedScope || (Array.isArray(resource.scopes_supported) ? resource.scopes_supported.join(" ") : "");
    await db.prepare("INSERT INTO mcp_oauth_states (state, connection_id, owner_id, encrypted_verifier, redirect_uri, resource, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(state, id, owner, await encrypt(verifier), redirectUri, resourceId, new Date(Date.now() + 10 * 60_000).toISOString()).run();
    await db.prepare("UPDATE mcp_connections SET status='authorizing', auth_type='oauth', oauth_client_id=?, encrypted_client_secret=?, authorization_endpoint=?, token_endpoint=?, resource=?, scopes=?, error=NULL, updated_at=CURRENT_TIMESTAMP WHERE owner_id=? AND id=?").bind(clientId, clientSecret ? await encrypt(clientSecret) : null, authorizationEndpoint, tokenEndpoint, resourceId, scopes || null, owner, id).run();
    const authorize = assertSafeUrl(authorizationEndpoint); authorize.searchParams.set("response_type", "code"); authorize.searchParams.set("client_id", clientId); authorize.searchParams.set("redirect_uri", redirectUri); authorize.searchParams.set("state", state); authorize.searchParams.set("code_challenge", await pkceChallenge(verifier)); authorize.searchParams.set("code_challenge_method", "S256"); authorize.searchParams.set("resource", resourceId); if (scopes) authorize.searchParams.set("scope", scopes);
    return { connected: false, authUrl: authorize.toString() };
  } catch (error) {
    await db.prepare("UPDATE mcp_connections SET status='error', error=?, last_checked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE owner_id=? AND id=?").bind(safeMessage(error), owner, id).run();
    throw error;
  }
}

export function mcpClientMetadata(request: Request) {
  const origin = new URL(request.url).origin; const clientId = `${origin}/api/mcp/client-metadata`;
  return { client_id: clientId, client_name: "Terracotta MCP Hub", client_uri: origin, redirect_uris: [`${origin}/api/mcp/callback`], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
}

export async function finishMcpOAuth(request: Request) {
  const url = new URL(request.url); const stateValue = url.searchParams.get("state") ?? ""; const code = url.searchParams.get("code") ?? "";
  if (!stateValue || !code) throw new Error(url.searchParams.get("error_description") || "OAuth 승인 코드가 없어요.");
  const db = env().DB; await db.batch(schema.map((sql) => db.prepare(sql)));
  const state = await db.prepare("SELECT * FROM mcp_oauth_states WHERE state=? AND expires_at > CURRENT_TIMESTAMP").bind(stateValue).first<{ state: string; connection_id: string; owner_id: string; encrypted_verifier: string; redirect_uri: string; resource: string }>();
  if (!state) throw new Error("OAuth 인증 요청이 만료되었어요.");
  const item = await connection(db, state.owner_id, state.connection_id); const clientSecret = await decrypt(item.encrypted_client_secret);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: state.redirect_uri, client_id: item.oauth_client_id ?? "", code_verifier: (await decrypt(state.encrypted_verifier)) ?? "", resource: state.resource }); if (clientSecret) body.set("client_secret", clientSecret);
  const response = await fetch(assertSafeUrl(item.token_endpoint ?? ""), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`OAuth 토큰 응답 ${response.status}`);
  const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!token.access_token) throw new Error("MCP 액세스 토큰을 받지 못했어요.");
  const checked = await initializeAndList(item, token.access_token); if (checked.unauthorized) throw new Error("승인된 토큰으로 MCP 서버에 연결할 수 없어요.");
  await db.prepare("UPDATE mcp_connections SET status='connected', tool_count=?, tools_json=?, encrypted_access_token=?, encrypted_refresh_token=?, token_expires_at=?, scopes=COALESCE(?, scopes), last_checked_at=CURRENT_TIMESTAMP, error=NULL, updated_at=CURRENT_TIMESTAMP WHERE owner_id=? AND id=?").bind(checked.tools.length, JSON.stringify(checked.tools), await encrypt(token.access_token), token.refresh_token ? await encrypt(token.refresh_token) : null, token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, token.scope ?? null, state.owner_id, state.connection_id).run();
  await db.prepare("DELETE FROM mcp_oauth_states WHERE state=?").bind(stateValue).run();
  return { connectionId: state.connection_id };
}

async function activeAccessToken(db: D1Database, item: Connection) {
  const current = await decrypt(item.encrypted_access_token);
  if (!item.token_expires_at || new Date(item.token_expires_at).getTime() > Date.now() + 60_000) return current;
  const refreshToken = await decrypt(item.encrypted_refresh_token);
  if (!refreshToken || !item.token_endpoint || !item.oauth_client_id) return current;
  const clientSecret = await decrypt(item.encrypted_client_secret);
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: item.oauth_client_id });
  if (item.resource) body.set("resource", item.resource);
  if (item.scopes) body.set("scope", item.scopes);
  if (clientSecret) body.set("client_secret", clientSecret);
  const response = await fetch(assertSafeUrl(item.token_endpoint), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("MCP 인증이 만료됐어요. 다시 연결해 주세요.");
  const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!token.access_token) throw new Error("갱신된 MCP 액세스 토큰이 없어요.");
  await db.prepare("UPDATE mcp_connections SET encrypted_access_token=?, encrypted_refresh_token=COALESCE(?, encrypted_refresh_token), token_expires_at=?, scopes=COALESCE(?, scopes), updated_at=CURRENT_TIMESTAMP WHERE owner_id=? AND id=?").bind(await encrypt(token.access_token), token.refresh_token ? await encrypt(token.refresh_token) : null, token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, token.scope ?? null, item.owner_id, item.id).run();
  return token.access_token;
}

export async function callMcpTool(request: Request, id: string, tool: string, args: Record<string, unknown>) {
  const db = env().DB; const owner = ownerId(request); await ensureHub(db, owner); const item = await connection(db, owner, id);
  if (item.status !== "connected") throw new Error("먼저 MCP 서버를 연결해 주세요.");
  const known = JSON.parse(item.tools_json || "[]") as Array<{ name?: string }>;
  if (!known.some((entry) => entry.name === tool)) throw new Error("허용된 MCP 도구가 아니에요.");
  const token = await activeAccessToken(db, item);
  const initialized = await rpc(item.server_url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "Terracotta", version: "1.0.0" } } }, token);
  if (initialized.unauthorized) throw new Error("MCP 인증이 만료됐어요. 다시 연결해 주세요.");
  await rpc(item.server_url, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, token, initialized.session);
  const result = await rpc(item.server_url, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } }, token, initialized.session);
  if (result.unauthorized) throw new Error("MCP 인증이 만료됐어요. 다시 연결해 주세요.");
  return result.payload?.result;
}

export async function removeMcpConnection(request: Request, id: string) {
  const db = env().DB; const owner = ownerId(request); await ensureHub(db, owner);
  if (presets.some((item) => item.id === id)) await db.prepare("UPDATE mcp_connections SET status='not_connected', tool_count=0, tools_json='[]', encrypted_access_token=NULL, encrypted_refresh_token=NULL, token_expires_at=NULL, error=NULL, updated_at=CURRENT_TIMESTAMP WHERE owner_id=? AND id=?").bind(owner, id).run();
  else await db.prepare("DELETE FROM mcp_connections WHERE owner_id=? AND id=?").bind(owner, id).run();
}

export function mcpError(error: unknown) { return { error: safeMessage(error) }; }
