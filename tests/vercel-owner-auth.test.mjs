import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { base64url, generateKeyPair, SignJWT } from "jose";
import { authorizePersonalRequest, personalRequestHeaders } from "../lib/vercel-owner-auth.ts";

const origin = "https://workspace.example.com";
const password = randomBytes(32).toString("base64url");
const req = (path, options) => new Request(new URL(path, origin), options);
const check = request => authorizePersonalRequest(request, password);
function login(value, returnTo = "/", host = origin) {
  const path = "/owner/login?" + new URLSearchParams({ returnTo });
  return check(req(path, { method: "POST", headers: { origin: host }, body: new URLSearchParams({ password: value }) }));
}

test("the owner page requires login and private APIs never trust supplied identity", async () => {
  const page = await check(req("/?tab=projects"));
  assert.equal(page.status, 303);
  assert.equal(new URL(page.headers.get("location")).searchParams.get("returnTo"), "/?tab=projects");
  assert.match((await check(req("/owner/login"))).headers.get("cache-control"), /no-store/);
  const fake = req("/api/projects", { headers: { "oai-authenticated-user-email": "owner", "oai-authenticated-user-full-name": "owner", "X-Message": "keep" } });
  assert.equal((await check(fake)).status, 401);
  const headers = personalRequestHeaders(fake);
  assert.equal(headers.get("oai-authenticated-user-email"), null);
  assert.equal(headers.get("oai-authenticated-user-full-name"), null);
  assert.equal(headers.get("x-message"), "keep");
  assert.equal((await authorizePersonalRequest(fake, undefined)).status, 503);
  assert.equal((await authorizePersonalRequest(fake, "short")).status, 503);
});

test("a password session is origin-bound, expiring, signed and revoked by password rotation", async t => {
  assert.equal((await login("incorrect")).status, 401);
  assert.equal((await login(password, "/", "https://another.example")).status, 403);
  const response = await login(password, "/?tab=projects");
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), origin + "/?tab=projects");
  const setCookie = response.headers.get("set-cookie");
  for (const attr of ["HttpOnly", "Secure", "Path=/", "SameSite=Lax", "Max-Age="]) assert.ok(setCookie.includes(attr));
  const cookie = setCookie.split(";")[0];
  const headers = { cookie };
  assert.equal(await check(req("/api/context", { headers })), null);
  assert.equal(await check(req("/api/context", { method: "POST", headers: { ...headers, origin } })), null);
  assert.equal((await check(req("/api/context", { method: "POST", headers }))).status, 403);
  assert.equal((await check(req("/api/model-registry?refresh=1", { headers: { ...headers, "sec-fetch-site": "cross-site" } }))).status, 403);
  assert.equal((await check(req("/api/context", { headers: { cookie: cookie.replace(/.$/, cookie.endsWith("a") ? "b" : "a") } }))).status, 401);
  assert.equal((await check(new Request("https://other.example/api/context", { headers }))).status, 401);
  assert.equal((await authorizePersonalRequest(req("/api/context", { headers }), randomBytes(32).toString("hex"))).status, 401);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  t.mock.timers.tick(15 * 24 * 3600 * 1000);
  assert.equal((await check(req("/api/context", { headers }))).status, 401);
});

test("password sign-in, validation feedback and logout share an accessible pixel landing", async () => {
  const page = await check(req("/owner/login?returnTo=%2Fprojects"));
  const markup = await page.text();
  assert.equal(page.status, 200);
  assert.equal(page.headers.has("set-cookie"), false);
  assert.match(markup, /<form method="post" action="\/owner\/login\?returnTo=%2Fprojects">/);
  assert.match(markup, /<label for="password">비밀번호<\/label>/);
  assert.match(markup, /autocomplete="current-password"/);
  assert.match(markup, /class="pixel-pot" aria-hidden="true"/);
  const invalidPassword = await login("incorrect", "/projects");
  assert.equal(invalidPassword.status, 401);
  const feedback = await invalidPassword.text();
  assert.match(feedback, /aria-invalid="true" aria-describedby="password-error"/);
  assert.match(feedback, /id="password-error" role="alert"/);
  const logout = await check(req("/owner/logout"));
  assert.match(await logout.text(), /<form method="post" action="\/owner\/logout">/);
  assert.equal(logout.headers.has("set-cookie"), false);
});

function vercelLink(html) {
  const links = [...html.matchAll(/href="([^"]+)">Vercel로 로그인<\/a>/g)];
  assert.equal(links.length, 1);
  const url = new URL(links[0][1].replaceAll("&amp;", "&"), origin);
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, "/owner/login");
  assert.equal(url.searchParams.get("start"), "1");
  return url;
}

test("the Vercel owner landing is private, self-contained and starts sign-in only on request", async () => {
  const config = { clientId: "client", ownerId: "owner" };
  const page = await authorizePersonalRequest(req("/owner/login?returnTo=%2Fowner%2Flogout"), undefined, [], config);
  assert.equal(page.status, 200);
  assert.equal(page.headers.has("set-cookie"), false);
  assert.equal(page.headers.has("location"), false);
  assert.match(page.headers.get("cache-control"), /no-store/);
  assert.match(page.headers.get("content-security-policy"), /default-src 'none'/);
  const html = await page.text();
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /class="pixel-pot" aria-hidden="true"/);
  assert.doesNotMatch(html, /<script|<img|<svg|type="password"/);
  assert.equal(vercelLink(html).searchParams.get("returnTo"), "/");
});

test("login redirects stay on the personal deployment and logout clears its cookie", async () => {
  for (const target of ["https://other.example", "//other.example", "/.//other.example", "/owner/login"]) {
    assert.equal((await login(password, target)).headers.get("location"), origin + "/");
  }
  const logout = await check(req("/owner/logout", { method: "POST", headers: { origin } }));
  assert.ok(logout.headers.get("set-cookie").includes("Max-Age=0"));
});

test("the Vercel proxy uses the same trusted external origin for cookies, writes, and redirects", async () => {
  const publicHost = "personal.example";
  const hosts = [publicHost, "preview.example"];
  const external = "https://" + publicHost;
  const headers = { host: publicHost, "x-forwarded-host": publicHost, origin: external };
  const gate = (path, options) => authorizePersonalRequest(new Request("http://localhost:3100" + path, options), password, hosts);
  const response = await gate("/owner/login", { method: "POST", headers, body: new URLSearchParams({ password }) });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), external + "/");
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.equal(await gate("/api/projects", { method: "POST", headers: { ...headers, cookie } }), null);
  const forged = { ...headers, host: "unknown.example", "x-forwarded-host": "unknown.example", origin: "https://unknown.example", cookie };
  assert.equal((await gate("/api/projects", { method: "POST", headers: forged })).status, 403);
  assert.equal((await gate("/api/projects", { method: "POST", headers: { ...headers, cookie, "x-forwarded-host": "preview.example" } })).status, 403);
  assert.equal((await gate("/api/projects", { method: "POST", headers: { ...headers, cookie, origin: "https://unknown.example" } })).status, 403);
});

test("metadata and installer are readable, OAuth callback needs a browser session and agents use their own bearer token", async () => {
  assert.equal(await check(req("/api/mcp/client-metadata")), null);
  assert.equal(await check(req("/terracotta-local-agent.mjs")), null);
  assert.equal((await check(req("/api/mcp/callback"))).status, 401);
  assert.equal((await check(req("/api/local-agent/worker", { method: "POST" }))).status, 401);
  assert.equal(await check(req("/api/local-agent/worker", { method: "POST", headers: { authorization: "Bearer tca_" + randomBytes(24).toString("base64url") } })), null);
});

test("Vercel OIDC validates PKCE, state, nonce, token signature, audience, expiry and the pinned owner", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const config = { clientId: "client-123", ownerId: "user-123", keys: async () => publicKey };
  const gate = (path, options, auth = config) => authorizePersonalRequest(req(path, options), undefined, [], auth);
  const landing = await gate("/owner/login?returnTo=%2F%3Ftab%3Dgarden");
  const signInLink = vercelLink(await landing.text());
  assert.equal(signInLink.searchParams.get("returnTo"), "/?tab=garden");
  const start = await gate(signInLink);
  const external = new URL(start.headers.get("location"));
  assert.equal(external.origin + external.pathname, "https://vercel.com/oauth/authorize");
  assert.equal(external.searchParams.get("scope"), "openid");
  assert.equal(external.searchParams.get("redirect_uri"), origin + "/owner/callback");
  assert.equal(external.searchParams.get("code_challenge_method"), "S256");
  const nonce = external.searchParams.get("nonce");
  const state = external.searchParams.get("state");
  const flowCookie = start.headers.get("set-cookie").split(";")[0];
  const callback = "/owner/callback?code=test-code&state=" + state;
  const makeToken = (overrides = {}) => new SignJWT({ nonce, ...overrides })
    .setProtectedHeader({ alg: "RS256" }).setIssuer("https://vercel.com").setSubject(overrides.sub ?? config.ownerId)
    .setAudience(overrides.aud ?? config.clientId).setIssuedAt().setExpirationTime(overrides.exp ?? "5m").sign(privateKey);
  let token = await makeToken();
  let exchanges = 0;
  config.fetchToken = async (endpoint, init) => {
    exchanges++;
    assert.equal(endpoint, "https://api.vercel.com/login/oauth/token");
    assert.equal(init.body.get("code"), "test-code");
    assert.equal(init.body.get("redirect_uri"), origin + "/owner/callback");
    assert.equal(init.body.has("client_secret"), false);
    const verifier = new TextEncoder().encode(init.body.get("code_verifier"));
    const digest = await crypto.subtle.digest("SHA-256", verifier);
    assert.equal(base64url.encode(new Uint8Array(digest)), external.searchParams.get("code_challenge"));
    return Response.json({ id_token: token, access_token: "unused-access", refresh_token: "unused-refresh" });
  };
  const headers = { cookie: flowCookie };
  assert.equal((await gate(callback + "x", { headers })).status, 403);
  const retry = await gate(callback);
  assert.equal(retry.status, 403);
  assert.match(retry.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const retryPage = await retry.text();
  assert.match(retryPage, /role="alert"/);
  assert.equal(vercelLink(retryPage).searchParams.get("returnTo"), "/");
  assert.equal(exchanges, 0);
  const finished = await gate(callback, { headers });
  assert.equal(finished.status, 303);
  assert.equal(finished.headers.get("location"), origin + "/?tab=garden");
  const issued = finished.headers.getSetCookie();
  assert.equal(issued.length, 2);
  assert.ok(issued[1].includes("Max-Age=0"));
  assert.doesNotMatch(issued.join(" "), /unused-access|unused-refresh/);
  const session = { cookie: issued[0].split(";")[0] };
  assert.equal(await gate("/api/projects", { headers: session }), null);
  assert.equal((await gate("/api/projects", { headers: session }, { ...config, ownerId: "other" })).status, 401);
  assert.equal((await gate("/api/projects", { headers: session }, { ...config, clientId: "other" })).status, 401);
  const foreign = await generateKeyPair("RS256");
  assert.equal((await gate("/api/projects", { headers: session }, { ...config, keys: async () => foreign.publicKey })).status, 401);
  for (const wrong of [{ sub: "other" }, { nonce: "different" }, { aud: "other" }, { exp: 1 }]) {
    token = await makeToken(wrong);
    assert.equal((await gate(callback, { headers })).status, 403);
  }
  assert.equal((await gate("/owner/login", undefined, { clientId: "incomplete" })).status, 503);
  assert.equal((await gate("/api/mcp/callback")).status, 401);
  assert.equal(await gate("/api/mcp/client-metadata"), null);
  assert.equal((await gate("/owner/login", undefined, { ...config, productionHost: "live.example" })).headers.get("location"), "https://live.example/owner/login");
});
