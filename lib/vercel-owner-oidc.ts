import { base64url, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const issuer = "https://vercel.com";
const remoteKeys = createRemoteJWKSet(new URL("/.well-known/jwks", issuer), { timeoutDuration: 5000 });
const flowCookieName = "__Host-terracotta_oauth";
const sessionMaxAge = 60 * 60;
export const callbackPath = "/owner/callback";

export type VercelSignIn = {
  clientId?: string;
  ownerId?: string;
  productionHost?: string;
  keys?: JWTVerifyGetKey;
  fetchToken?: typeof fetch;
};

function flowCookie(value: string, age: number) {
  return `${flowCookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
}

export const clearFlowCookie = flowCookie("", 0);

function randomValue() {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function startVercelSignIn(origin: string, clientId: string, returnTo: string) {
  const verifier = randomValue();
  const nonce = randomValue();
  const state = randomValue();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64url.encode(new Uint8Array(digest));
  const authorize = new URL("/oauth/authorize", issuer);
  authorize.search = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: origin + callbackPath,
    scope: "openid", code_challenge_method: "S256", code_challenge: challenge, state, nonce,
  }).toString();
  const flow = JSON.stringify({ state, nonce, verifier, returnTo: returnTo.length <= 1000 ? returnTo : "/" });
  return { location: authorize, cookie: flowCookie(base64url.encode(flow), 600) };
}

export async function verifyVercelOwner(token: string, config: VercelSignIn) {
  if (!config.clientId || !config.ownerId || !token || token.length > 3800) throw new Error("Invalid owner credentials");
  const { payload } = await jwtVerify(token, config.keys ?? remoteKeys, {
    issuer, audience: config.clientId, subject: config.ownerId, algorithms: ["RS256"],
    maxTokenAge: sessionMaxAge, requiredClaims: ["iat", "exp", "sub"],
  });
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId) throw new Error("Invalid authorized party");
  return payload;
}

export async function finishVercelSignIn(request: Request, url: URL, config: VercelSignIn) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(flowCookieName + "="))?.slice(flowCookieName.length + 1);
  if (!config.clientId || !code || !state || !value || value.length > 3000) throw new Error("Missing sign-in flow");
  const flow = JSON.parse(new TextDecoder().decode(base64url.decode(value)));
  if (!flow || state !== flow.state || !/^[\w-]{43}$/.test(flow.verifier) || !/^[\w-]{43}$/.test(flow.nonce)) throw new Error("Invalid sign-in flow");
  const response = await (config.fetchToken ?? fetch)("https://api.vercel.com/login/oauth/token", {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, code,
      code_verifier: flow.verifier, redirect_uri: url.origin + callbackPath }),
  });
  if (!response.ok) throw new Error("Sign-in exchange failed");
  const { id_token: token } = await response.json() as { id_token?: unknown };
  if (typeof token !== "string") throw new Error("Missing identity token");
  const claims = await verifyVercelOwner(token, config);
  if (claims.nonce !== flow.nonce) throw new Error("Invalid sign-in nonce");
  const maxAge = Math.min(claims.exp!, claims.iat! + sessionMaxAge) - Math.floor(Date.now() / 1000);
  if (maxAge < 1) throw new Error("Expired identity token");
  return { token, maxAge, returnTo: typeof flow.returnTo === "string" ? flow.returnTo : "/" };
}
