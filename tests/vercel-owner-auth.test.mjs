import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
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
