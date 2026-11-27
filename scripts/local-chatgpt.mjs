import { createHash, randomBytes, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const prefix = "/api/local-chatgpt/";
const page = "/?subscriptions=1";
const modeHeader = "x-terracotta-local-subscriptions";
const scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const publishedKeys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"));
const defaultDir = path.join(process.env.LOCALAPPDATA || process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "Terracotta", "chatgpt");
const nonce = () => randomBytes(32).toString("base64url");
const hash = value => createHash("sha256").update(value).digest("base64url");
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const unusableGrants = new Set(["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]);

function providerError(code, status = 502) {
  if (code === "subscription_sharing_user_not_eligible") return failure("선택한 계정이나 워크스페이스에서 ChatGPT 플랜 연결을 지원하지 않아요.", 403);
  if (status === 429 || code === "subscription_sharing_usage_limit_exceeded") return failure("ChatGPT 플랜의 사용 한도에 도달했어요. ChatGPT 설정에서 사용량을 확인해 주세요.", 429);
  if (code === "subscription_sharing_usage_unavailable") return failure("ChatGPT에서 현재 사용 가능 여부를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", 503);
  if (unusableGrants.has(code)) return Object.assign(failure("ChatGPT 인증이 만료되었어요. 다시 로그인해 주세요.", 401), { unusableGrant: true });
  if ([400, 401, 403].includes(status)) return failure("ChatGPT 연결 권한과 선택한 모델을 확인해 주세요.", status);
  return failure("OpenAI에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 502);
}

async function readText(file) {
  try { return await readFile(file, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function stableHostId(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "host-id");
  try { await writeFile(file, "urn:uuid:" + randomUUID(), { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const id = await readText(file);
  if (!/^urn:uuid:[0-9a-f-]{36}$/.test(id ?? "")) throw failure("로컬 설치 정보를 확인해 주세요.", 500);
  return id;
}

async function body(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) throw failure("JSON 요청이 필요해요.", 415);
  let total = 0;
  const chunks = [];
  for await (const part of req) {
    total += part.length;
    if (total > 96 * 1024) throw failure("요청이 너무 길어요.", 413);
    chunks.push(part);
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { throw failure("요청 내용을 확인해 주세요."); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw failure("요청 내용을 확인해 주세요.");
  return parsed;
}

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function tokenRecord(result, previous) {
  if (typeof result.access_token !== "string" || !result.access_token || String(result.token_type).toLowerCase() !== "bearer") throw failure("OpenAI가 유효한 액세스 토큰을 반환하지 않았어요.", 401);
  const granted = typeof result.scope === "string" ? result.scope.split(" ") : previous?.granted ?? [];
  if (!["resource.invoke", "chatgpt.tokens.use.direct"].every(s => granted.includes(s))) throw failure("ChatGPT 플랜 사용 권한에 동의해 주세요.", 403);
  const ttl = Number(result.expires_in);
  if (!Number.isFinite(ttl) || ttl <= 0) throw failure("OpenAI 연결의 유효 시간을 확인할 수 없어요.", 401);
  return { access: result.access_token, refresh: result.refresh_token || previous?.refresh, expires: Date.now() + ttl * 1000, granted };
}

async function answerFromStream(response) {
  if (!response.body) throw failure("ChatGPT 응답 스트림을 열지 못했어요.", 502);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "", buffer = "", completed = false;
  // OpenAI emits SSE events delimited by a blank line. Network chunks may split
  // a Korean character, an event delimiter, or a single JSON payload.
  function event(block) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    const e = JSON.parse(data);
    if (e.type === "error" || e.type === "response.failed") throw providerError(e.response?.error?.code ?? e.code);
    if (e.type === "response.incomplete") throw failure("ChatGPT가 답변을 완료하지 못했어요.", 502);
    if (e.type === "response.output_text.delta" && typeof e.delta === "string") text += e.delta;
    if (e.type === "response.completed") completed = true;
    if (text.length > 500_000) throw failure("답변이 너무 길어요. 질문을 나눠 주세요.", 413);
  }
  try {
    while (!completed) {
      const { done, value } = await reader.read();
      if (done) { if (buffer.trim()) event(buffer); break; }
      buffer += value;
      if (buffer.length > 4_000_000) throw failure("ChatGPT의 응답 크기가 너무 커요.", 502);
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        event(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!completed || !text.trim()) throw failure("완료된 텍스트 답변을 받지 못했어요.", 502);
  return text;
}

export function createLocalChatGPT({ dir = defaultDir, http = fetch, keys = publishedKeys } = {}) {
  const browsers = new Map();
  let host;
  async function openai(target, options = {}) {
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(20_000);
    const response = await http(target, { ...options, signal, redirect: "error" });
    if (response.ok) return response;
    const data = await response.json().catch(() => ({}));
    throw providerError(typeof data.error === "string" ? data.error : data.error?.code, response.status);
  }
  const exchange = async params => (await openai(issuer + "/api/accounts/oauth/token", {
    method: "POST", body: new URLSearchParams({ resource, ...params }),
  })).json();

  async function currentAccess(session) {
    if (!session.tokens) throw failure("ChatGPT 연결이 만료됐어요. 다시 로그인해 주세요.", 401);
    if (session.tokens.expires > Date.now() + 60_000) return session.tokens.access;
    if (!session.tokens.refresh) {
      session.tokens = null;
      throw failure("ChatGPT 연결이 만료됐어요. 다시 로그인해 주세요.", 401);
    }
    session.refreshing ??= (async () => {
      const next = await exchange({ grant_type: "refresh_token", refresh_token: session.tokens.refresh, client_id: session.clientId });
      session.tokens = tokenRecord(next, session.tokens);
    })().catch(err => {
      if (err.unusableGrant) { session.tokens = null; session.controller.abort(); }
      throw err;
    }).finally(() => { session.refreshing = null; });
    await session.refreshing;
    return session.tokens.access;
  }

  async function listModels(session) {
    if (session.models && session.modelsUntil > Date.now()) return session.models;
    const access = await currentAccess(session);
    const json = await (await openai(resource + "/models", { headers: { Authorization: "Bearer " + access }, signal: session.controller.signal })).json();
    session.models = (Array.isArray(json.models) ? json.models : []).filter(m => m?.visibility === "list" && typeof m.slug === "string").map(m => ({ id: m.slug, name: String(m.display_name || m.slug) }));
    session.modelsUntil = Date.now() + 5 * 60_000;
    return session.models;
  }

  return async function handle(req, res, next) {
    // This middleware is installed only in the Vite development server. Never
    // trust a Host header or an upstream proxy to establish that it is local.
    delete req.headers[modeHeader];
    // The Cloudflare Vite adapter reads rawHeaders, unlike Connect's headers.
    for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2) {
      if (req.rawHeaders[i].toLowerCase() === modeHeader) req.rawHeaders.splice(i, 2);
    }
    const listener = req.socket.server?.address();
    const hostPort = "127.0.0.1:" + req.socket.localPort;
    const origin = "http://" + hostPort;
    const local = listener?.address === "127.0.0.1" && req.socket.remoteAddress === "127.0.0.1" &&
      req.headers.host === hostPort && !Object.keys(req.headers).some(h => h === "forwarded" || h.startsWith("x-forwarded-"));
    let url;
    try { url = new URL(req.url, origin); }
    catch { return send(res, 400, { error: "요청 주소를 확인해 주세요." }); }
    const entry = req.method === "GET" && url.pathname === "/" && url.searchParams.get("subscriptions") === "1";
    if (!url.pathname.startsWith(prefix) && !entry) return next();
    if (!local || url.origin !== origin || process.env.VERCEL) {
      if (entry) return next();
      return send(res, 403, { error: "127.0.0.1의 Terracotta 로컬 작업실에서 열어 주세요." });
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const cookieName = "terracotta_plan_" + req.socket.localPort;
    const cookies = (req.headers.cookie ?? "").split(";").map(v => v.trim());
    const cookieValue = name => {
      const value = cookies.find(v => v.startsWith(name + "="))?.slice(name.length + 1);
      return /^[\w-]{43}$/.test(value ?? "") ? value : null;
    };
    const browserId = cookieValue(cookieName);
    const sessionId = cookieValue(cookieName + "_session");
    const state = browsers.get(sessionId);
    function startSession() {
      const id = nonce();
      const registration = browserId || nonce();
      browsers.set(id, { browserId: registration });
      const attributes = "; Path=/; HttpOnly; SameSite=Lax";
      const headers = [cookieName + "_session=" + id + attributes];
      if (!browserId) headers.push(cookieName + "=" + registration + attributes + "; Max-Age=31536000");
      res.setHeader("Set-Cookie", headers);
    }
    if (entry) {
      if (!state || !browserId || state.browserId !== browserId) startSession();
      req.headers[modeHeader] = "1";
      req.rawHeaders.push(modeHeader, "1");
      return next();
    }
    if (!state || !browserId || state.browserId !== browserId) return send(res, 401, { error: "로컬 작업실을 다시 열어 주세요." });
    const action = url.pathname.slice(prefix.length);
    const get = ["status", "callback"].includes(action);
    if (!get && !["sign-in", "sign-out", "chat"].includes(action)) return send(res, 404, { error: "없는 연결 경로입니다." });
    if (req.method !== (get ? "GET" : "POST")) return send(res, 405, { error: "지원하지 않는 요청입니다." });
    const callbackOrigin = action === "callback" && req.headers.origin === issuer;
    if ((!get && req.headers.origin !== origin) || (req.headers.origin && req.headers.origin !== origin && !callbackOrigin) || (action !== "callback" && req.headers["sec-fetch-site"] === "cross-site")) return send(res, 403, { error: "같은 로컬 작업실에서 요청해 주세요." });
    const registrationFile = path.join(dir, "registration-" + hash(browserId) + ".json");
    const callback = origin + prefix + "callback";
    try {
      if (action === "status") {
        if (!state.session?.tokens) return send(res, 200, { connected: false });
        return send(res, 200, { connected: true, email: state.session.email, models: await listModels(state.session) });
      }
      if (action === "callback") {
        const attempt = state.pending;
        if (!attempt || attempt.until < Date.now() || url.searchParams.get("state") !== attempt.state) throw failure("로그인 요청이 만료됐어요. 다시 시작해 주세요.");
        delete state.pending;
        if (url.searchParams.has("error")) throw failure("ChatGPT 로그인이 취소되었어요.");
        const issued = url.searchParams.get("client_id") || attempt.clientId;
        if (!issued || issued === "dynamic_agent_client" || !/^[\w.-]{1,256}$/.test(issued) || (attempt.clientId && issued !== attempt.clientId)) throw failure("OpenAI 앱 등록을 확인할 수 없어요.");
        const code = url.searchParams.get("code");
        if (!code) throw failure("OpenAI 인증 코드가 없어요.");
        let result;
        try { result = await exchange({ grant_type: "authorization_code", client_id: issued, code, code_verifier: attempt.verifier, redirect_uri: callback }); }
        catch (err) {
          if (err.unusableGrant && state.attempt === attempt) state.retryClientId = issued;
          throw err;
        }
        const { payload } = await jwtVerify(result.id_token, keys, { issuer, audience: issued, algorithms: ["RS256"], requiredClaims: ["exp", "sub", "nonce"] });
        if (typeof payload.sub !== "string" || payload.nonce !== attempt.nonce || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== issued)) throw failure("계정 인증을 확인할 수 없어요.");
        const identity = hash(payload.sub);
        if (attempt.registration && attempt.registration.identity !== identity) throw failure("기존에 연결한 ChatGPT 계정으로 로그인해 주세요.");
        const session = { clientId: issued, email: typeof payload.email === "string" ? payload.email : undefined, tokens: tokenRecord(result), controller: new AbortController() };
        // Keep only the issued public client ID and hashed subject on disk. No
        // access, refresh or ID token is sent to the browser or saved to disk.
        const temp = registrationFile + "." + nonce() + ".tmp";
        if (state.attempt !== attempt) throw failure("새 로그인 요청에서 다시 시도해 주세요.");
        if (!attempt.registration) {
          await writeFile(temp, JSON.stringify({ clientId: issued, identity }), { mode: 0o600, flag: "wx" });
          try {
            if (state.attempt !== attempt) throw failure("새 로그인 요청에서 다시 시도해 주세요.");
            // Only the first completed registration may bind this browser. An
            // overlapping callback cannot overwrite a different verified ID.
            await link(temp, registrationFile);
          } finally { await unlink(temp); }
        }
        if (state.attempt !== attempt) throw failure("새 로그인 요청에서 다시 시도해 주세요.");
        delete state.attempt;
        delete state.retryClientId;
        state.session?.controller.abort();
        state.session = session;
        res.writeHead(303, { Location: page }); res.end(); return;
      }
      const input = await body(req);
      if (action === "sign-in") {
        host ??= stableHostId(dir).catch(err => { host = null; throw err; });
        const hostId = await host;
        const saved = await readText(registrationFile);
        const registration = saved ? JSON.parse(saved) : null;
        const attempt = { state: nonce(), nonce: nonce(), verifier: nonce(), registration, clientId: registration?.clientId ?? state.retryClientId, until: Date.now() + 10 * 60_000 };
        state.pending = attempt;
        state.attempt = attempt;
        const params = new URLSearchParams({
          client_id: attempt.clientId ?? "dynamic_agent_client", ext_agent_host_id: hostId, response_type: "code",
          redirect_uri: callback, scope: scopes, resource, state: attempt.state, nonce: attempt.nonce,
          code_challenge_method: "S256", code_challenge: hash(attempt.verifier),
        });
        if (!attempt.clientId) params.set("agent_name_hint", "Terracotta");
        return send(res, 200, { url: issuer + "/api/accounts/authorize?" + params });
      }
      if (action === "sign-out") {
        const session = state.session;
        delete state.attempt;
        delete state.pending;
        delete state.session;
        browsers.delete(sessionId);
        startSession();
        session?.controller.abort();
        if (session?.refreshing) await session.refreshing.catch(() => {});
        let warning;
        if (session?.tokens?.refresh) {
          try {
            await openai(issuer + "/api/accounts/oauth/revoke", { method: "POST", body: new URLSearchParams({ token: session.tokens.refresh, token_type_hint: "refresh_token", client_id: session.clientId }) });
          } catch { warning = "로컬 로그아웃을 완료했어요. ChatGPT 설정에서 앱 연결 해제 상태를 확인해 주세요."; }
        }
        return send(res, 200, { connected: false, warning });
      }
      const session = state.session;
      if (!session) throw failure("이 브라우저에서 먼저 ChatGPT에 로그인해 주세요.", 401);
      if (!Array.isArray(input.turns) || !input.turns.length || input.turns.length > 100 || input.turns.some(t => !t || !["user", "assistant"].includes(t.role) || typeof t.text !== "string" || !t.text.trim())) throw failure("보낼 대화 내용을 확인해 주세요.");
      if (!(await listModels(session)).some(m => m.id === input.model)) throw failure("이 ChatGPT 계정에서 사용할 모델을 선택해 주세요.");
      const access = await currentAccess(session);
      const generation = new AbortController();
      res.once("close", () => { if (!res.writableEnded) generation.abort(); });
      if (res.destroyed) generation.abort();
      const signal = AbortSignal.any([session.controller.signal, generation.signal]);
      const response = await openai(resource + "/responses", { method: "POST", signal,
        headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
        body: JSON.stringify({ model: input.model, store: false, stream: true, input: input.turns.map(t => ({ role: t.role, content: t.text })) }),
      });
      return send(res, 200, { model: input.model, text: await answerFromStream(response) });
    } catch (error) {
      const message = error.status ? error.message : "ChatGPT 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
      if (state.session && !state.session.tokens) {
        delete state.session;
        if (action === "status") return send(res, 200, { connected: false, error: message });
      }
      if (action === "callback") { res.writeHead(303, { Location: page + "#subscription-error=" + encodeURIComponent(message) }); res.end(); return; }
      return send(res, Number(error.status) || 502, { error: message });
    }
  };
}

/** @returns {import("vite").Plugin} */
export function localChatGPTPlugin() {
  return { name: "terracotta-local-chatgpt", apply: "serve", enforce: "pre", configureServer(server) {
    server.middlewares.use(createLocalChatGPT());
  } };
}
