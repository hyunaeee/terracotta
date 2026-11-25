const SESSION_COOKIE = "__Host-terracotta_owner";
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const LOGIN_PATH = "/owner/login";
const LOGOUT_PATH = "/owner/logout";
const encoder = new TextEncoder();
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

function returnPath(url: URL) {
  const value = url.searchParams.get("returnTo") ?? "/";
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return "/";
  const target = new URL(value, url.origin);
  if (target.origin !== url.origin || target.pathname.startsWith("//") || [LOGIN_PATH, LOGOUT_PATH].includes(target.pathname)) return "/";
  return target.pathname + target.search;
}

function loginForm(action: string, invalidPassword = false) {
  // Actions are generated from fixed paths and URLSearchParams.
  const safeAction = action.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const logout = action === LOGOUT_PATH;
  const title = logout ? "로그아웃" : "Terracotta 로그인";
  const field = logout ? "" : '<label>비밀번호<input name="password" type="password" autocomplete="current-password" required autofocus maxlength="256"></label>';
  const error = invalidPassword ? '<p role="alert">비밀번호를 다시 확인해 주세요.</p>' : "";
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
    *{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f8f5ee;color:#302b25;font:16px/1.5 system-ui,sans-serif}main{width:min(26rem,100%);padding:2rem}h1{font-size:1.75rem}label{display:grid;gap:.5rem}input,button{font:inherit;border-radius:.4rem;padding:.65rem .8rem}input{width:100%;border:1px solid #82776d}button{margin-top:1rem;background:#73432e;color:white;border:0;cursor:pointer}p{color:#913d27}
    </style></head><body><main><h1>${title}</h1><form method="post" action="${safeAction}">${field}${error}<button>${logout ? "로그아웃" : "로그인"}</button></form></main></body></html>`;
  return new Response(html, { status: invalidPassword ? 401 : 200, headers: {
    ...privateHeaders, "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  } });
}

function redirect(location: URL, cookie?: string) {
  const headers = new Headers(privateHeaders);
  headers.set("Location", location.href);
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function sessionCookie(value: string, maxAge: number) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function signingKey(password: string) {
  return crypto.subtle.importKey("raw", encoder.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function newSession(password: string, origin: string) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const token = `v1.${expires}.${crypto.randomUUID()}`;
  const data = encoder.encode(`terracotta-owner-session\n${origin}\n${token}`);
  const signature = await crypto.subtle.sign("HMAC", await signingKey(password), data);
  const hex = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
  return sessionCookie(`${token}.${hex}`, SESSION_SECONDS);
}

async function validSession(request: Request, password: string, origin: string) {
  const cookie = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(SESSION_COOKIE + "="));
  const value = cookie?.slice(SESSION_COOKIE.length + 1);
  const parts = value?.match(/^(v1\.(\d{10,11})\.[0-9a-f-]{36})\.([0-9a-f]{64})$/);
  if (!parts || Number(parts[2]) <= Math.floor(Date.now() / 1000)) return false;
  const signature = Uint8Array.from(parts[3].match(/../g)!, hex => parseInt(hex, 16));
  const data = encoder.encode(`terracotta-owner-session\n${origin}\n${parts[1]}`);
  return crypto.subtle.verify("HMAC", await signingKey(password), signature, data);
}

async function passwordMatches(attempt: string, password: string) {
  if (!attempt || attempt.length > 256) return false;
  const marker = encoder.encode("terracotta-owner-password-check");
  const proof = await crypto.subtle.sign("HMAC", await signingKey(password), marker);
  return crypto.subtle.verify("HMAC", await signingKey(attempt), proof, marker);
}

export function personalRequestHeaders(request: Request) {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith("oai-authenticated-user-")) headers.delete(name);
  }
  return headers;
}

function publicRequestUrl(request: Request, deploymentHosts: readonly (string | undefined)[]) {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.toLowerCase() ?? url.host;
  const forwarded = request.headers.get("x-forwarded-host")?.toLowerCase();
  const known = new Set(deploymentHosts.filter((name): name is string => !!name && /^[a-z0-9.-]+$/i.test(name)).map(name => name.toLowerCase()));
  const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
  if (known.size) {
    // A managed proxy may construct request.url from an internal address. Only Vercel's own deployment domains can replace it.
    const external = forwarded ?? host;
    if (!known.has(external)) return null;
    if (host !== external && !(host === url.host && loopback.test(host))) return null;
    url.protocol = "https:";
    url.port = "";
    url.hostname = external;
  } else {
    if (forwarded && forwarded !== host) return null;
    if (host !== url.host) {
      // next start normalizes loopback aliases to localhost in request.url.
      if (!loopback.test(host) || !loopback.test(url.host)) return null;
      const local = new URL(url.protocol + "//" + host);
      if (local.port !== url.port) return null;
      url.hostname = local.hostname;
    }
  }
  return url;
}

/** A null result lets Next handle the request. The worker route also verifies its scoped agent token against the database. */
export async function authorizePersonalRequest(request: Request, password: string | undefined, deploymentHosts: readonly (string | undefined)[] = []): Promise<Response | null> {
  if (!password || !/^[\x21-\x7e]{32,256}$/.test(password)) return errorResponse(503, "개인 로그인 비밀번호를 설정해 주세요.");
  const url = publicRequestUrl(request, deploymentHosts);
  if (!url) return errorResponse(403, "요청 도메인을 확인할 수 없습니다.");
  const path = url.pathname;
  const read = request.method === "GET" || request.method === "HEAD";
  if (read && (path === "/terracotta-local-agent.mjs" || path === "/api/mcp/client-metadata")) return null;
  if (path === "/api/local-agent/worker" && request.method === "POST") {
    return /^Bearer tca_[\w-]{32}$/.test(request.headers.get("authorization") ?? "") ? null : errorResponse(401, "로컬 에이전트 키가 필요합니다.");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (read && path.startsWith("/api/") && path !== "/api/mcp/callback" && fetchSite && !["none", "same-origin"].includes(fetchSite)) {
    return errorResponse(403, "요청 출처를 확인할 수 없습니다.");
  }
  if (!read && request.headers.get("origin") !== url.origin) return errorResponse(403, "요청 출처를 확인할 수 없습니다.");
  if (path === LOGIN_PATH) {
    const target = returnPath(url);
    const action = LOGIN_PATH + "?" + new URLSearchParams({ returnTo: target });
    if (read) return loginForm(action);
    if (request.method !== "POST") return errorResponse(405, "지원하지 않는 요청입니다.");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") return errorResponse(415, "로그인 양식을 사용해 주세요.");
    if (Number(request.headers.get("content-length")) > 2048) return errorResponse(413, "로그인 요청이 너무 큽니다.");
    const attempt = new URLSearchParams(await request.text()).get("password") ?? "";
    if (!await passwordMatches(attempt, password)) return loginForm(action, true);
    return redirect(new URL(target, url.origin), await newSession(password, url.origin));
  }
  if (path === LOGOUT_PATH) {
    if (read) return loginForm(LOGOUT_PATH);
    if (request.method !== "POST") return errorResponse(405, "지원하지 않는 요청입니다.");
    return redirect(new URL(LOGIN_PATH, url.origin), sessionCookie("", 0));
  }
  if (await validSession(request, password, url.origin)) return null;
  if (!read || path === "/api" || path.startsWith("/api/")) return errorResponse(401, "개인 작업실에 로그인해 주세요.");
  const login = new URL(LOGIN_PATH, url.origin);
  login.searchParams.set("returnTo", path + url.search);
  return redirect(login);
}
