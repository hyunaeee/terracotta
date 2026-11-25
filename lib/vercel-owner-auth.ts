import { callbackPath, clearFlowCookie, finishVercelSignIn, startVercelSignIn, verifyVercelOwner, type VercelSignIn } from "./vercel-owner-oidc.ts";

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

function returnPath(url: URL, value = url.searchParams.get("returnTo") ?? "/") {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return "/";
  const target = new URL(value, url.origin);
  if (target.origin !== url.origin || target.pathname.startsWith("//") || [LOGIN_PATH, LOGOUT_PATH, callbackPath].includes(target.pathname)) return "/";
  return target.pathname + target.search;
}

function vercelLoginPath(target: string) {
  return LOGIN_PATH + "?" + new URLSearchParams({ start: "1", returnTo: target });
}

function ownerPage(mode: "vercel" | "password" | "logout", action: string, status = 200) {
  // The only dynamic URL consists of a fixed path and an encoded URLSearchParams query.
  const safeAction = action.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const title = mode === "logout" ? "작업실에서 로그아웃" : "Terracotta 작업실";
  const descriptions = {
    vercel: "등록된 Vercel 계정으로 로그인해 대화와 정원을 이어가세요.",
    password: "소유자 비밀번호로 로그인해 대화와 정원을 이어가세요.",
    logout: "이 브라우저의 작업실 세션을 종료합니다.",
  };
  let control: string;
  if (mode === "vercel") {
    const error = status === 403 ? '<p role="alert">작업실 소유자의 Vercel 계정으로 다시 로그인해 주세요.</p>' : "";
    control = `${error}<a class="action" href="${safeAction}">Vercel로 로그인</a>`;
  } else if (mode === "password") {
    const invalid = status === 401;
    control = `<form method="post" action="${safeAction}">
      <label for="password">비밀번호</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"${invalid ? ' aria-invalid="true" aria-describedby="password-error"' : ""}>
      ${invalid ? '<p id="password-error" role="alert">비밀번호를 다시 확인해 주세요.</p>' : ""}
      <button class="action" type="submit">로그인</button>
    </form>`;
  } else {
    control = `<form method="post" action="${safeAction}"><button class="action" type="submit">로그아웃</button></form>`;
  }
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; min-height: 100svh; padding: 1.5rem; display: grid; place-items: center; color: #302f28; background: #fff; font: 1rem/1.6 system-ui, sans-serif; word-break: keep-all; overflow-wrap: anywhere; }
  main { width: min(100%, 21rem); text-align: center; }
  .pixel-pot { position: relative; display: block; width: 40px; height: 40px; margin: 0 auto 1.25rem; background: linear-gradient(#537a49, #537a49) center 14px / 4px 10px no-repeat; }
  .pixel-pot::before, .pixel-pot::after { content: ""; position: absolute; width: 6px; height: 6px; background: #a6ca82; }
  .pixel-pot::before { left: 4px; top: 6px; box-shadow: 4px 2px #8cb46f, 8px 4px #76a35e, 12px 6px #638e53; }
  .pixel-pot::after { right: 2px; top: 4px; box-shadow: -4px 2px #8cb46f, -8px 4px #76a35e, -12px 8px #638e53; }
  .pixel-pot i { position: absolute; left: 8px; top: 22px; width: 24px; height: 6px; background: #b98e69; border-bottom: 2px solid #805a43; }
  .pixel-pot i::after { content: ""; position: absolute; left: 2px; top: 6px; width: 20px; height: 8px; background: #aa7959; box-shadow: 0 3px 0 -1px #805a43; }
  h1 { margin: 0; font-size: clamp(1.5rem, 6vw, 2rem); line-height: 1.25; letter-spacing: -.04em; }
  p { margin: .75rem 0 1.5rem; color: #575e53; }
  form { display: grid; gap: .5rem; text-align: start; }
  label { font-weight: 600; }
  input, .action { width: 100%; min-height: 2.85rem; padding: .6rem .8rem; border-radius: 8px; font: inherit; }
  input { border: 1px solid #77836f; color: inherit; background: #fff; }
  .action { display: grid; place-items: center; border: 1px solid #bccfa8; background: #daedc8; color: #31432e; font-weight: 650; text-align: center; text-decoration: none; cursor: pointer; }
  form .action { margin-top: .3rem; }
  .action:hover { background: #cbe2b6; }
  :focus-visible { outline: 3px solid #416544; outline-offset: 3px; }
  [role=alert] { margin: 0 0 .75rem; color: #923d28; }
</style></head><body><main><span class="pixel-pot" aria-hidden="true"><i></i></span><h1>${title}</h1><p>${descriptions[mode]}</p>${control}</main></body></html>`;
  return new Response(html, { status, headers: {
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

function readSession(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(SESSION_COOKIE + "="));
  return cookie?.slice(SESSION_COOKIE.length + 1) ?? "";
}

async function validSession(value: string, password: string, origin: string) {
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
export async function authorizePersonalRequest(request: Request, password: string | undefined, deploymentHosts: readonly (string | undefined)[] = [], oidc?: VercelSignIn): Promise<Response | null> {
  if (oidc ? !oidc.clientId || !oidc.ownerId : !password || !/^[\x21-\x7e]{32,256}$/.test(password)) {
    return errorResponse(503, "개인 작업실의 로그인 설정을 확인해 주세요.");
  }
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
  if (oidc && oidc.productionHost && url.host !== oidc.productionHost) {
    if (!read || path.startsWith("/api/") || path === callbackPath) return errorResponse(403, "개인 운영 주소로 접속해 주세요.");
    const canonical = new URL("https://" + oidc.productionHost);
    canonical.pathname = url.pathname;
    canonical.search = url.search;
    return redirect(canonical);
  }
  if (oidc && path === callbackPath) {
    if (request.method !== "GET") return errorResponse(405, "지원하지 않는 요청입니다.");
    let result: Response;
    try {
      const session = await finishVercelSignIn(request, url, oidc);
      result = redirect(new URL(returnPath(url, session.returnTo), url.origin), sessionCookie(session.token, session.maxAge));
    } catch {
      result = ownerPage("vercel", vercelLoginPath("/"), 403);
    }
    result.headers.append("Set-Cookie", clearFlowCookie);
    return result;
  }
  if (path === LOGIN_PATH) {
    const target = returnPath(url);
    if (oidc) {
      if (request.method !== "GET") return errorResponse(405, "지원하지 않는 요청입니다.");
      if (url.searchParams.get("start") !== "1") return ownerPage("vercel", vercelLoginPath(target));
      const flow = await startVercelSignIn(url.origin, oidc.clientId!, target);
      return redirect(flow.location, flow.cookie);
    }
    const action = LOGIN_PATH + "?" + new URLSearchParams({ returnTo: target });
    if (read) return ownerPage("password", action);
    if (request.method !== "POST") return errorResponse(405, "지원하지 않는 요청입니다.");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") return errorResponse(415, "로그인 양식을 사용해 주세요.");
    if (Number(request.headers.get("content-length")) > 2048) return errorResponse(413, "로그인 요청이 너무 큽니다.");
    const attempt = new URLSearchParams(await request.text()).get("password") ?? "";
    if (!await passwordMatches(attempt, password!)) return ownerPage("password", action, 401);
    return redirect(new URL(target, url.origin), await newSession(password!, url.origin));
  }
  if (path === LOGOUT_PATH) {
    if (read) return ownerPage("logout", LOGOUT_PATH);
    if (request.method !== "POST") return errorResponse(405, "지원하지 않는 요청입니다.");
    return redirect(new URL(LOGIN_PATH, url.origin), sessionCookie("", 0));
  }
  const token = readSession(request);
  if (token && (oidc ? await verifyVercelOwner(token, oidc).then(() => true, () => false) : await validSession(token, password!, url.origin))) return null;
  if (!read || path === "/api" || path.startsWith("/api/")) return errorResponse(401, "개인 작업실에 로그인해 주세요.");
  const login = new URL(LOGIN_PATH, url.origin);
  login.searchParams.set("returnTo", path + url.search);
  return redirect(login);
}
