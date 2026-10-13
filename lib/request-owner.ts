export type IdentityEnvironment = {
  TERRACOTTA_SELF_HOSTED?: string;
  TERRACOTTA_TRUST_AUTH_HEADERS?: string;
};

export function requestOwner(request: Request, environment: IdentityEnvironment): string {
  // A local single-user installation must never let client headers select an owner.
  if (environment.TERRACOTTA_SELF_HOSTED === "true" && environment.TERRACOTTA_TRUST_AUTH_HEADERS !== "true") return "owner";
  // Hosted requests arrive through the platform's authenticated proxy. Self-hosted
  // deployments opt in only after a proxy strips and replaces this header.
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) throw Object.assign(new Error("로그인이 필요합니다."), { code: "AUTHENTICATION_REQUIRED", status: 401 });
  return email;
}
