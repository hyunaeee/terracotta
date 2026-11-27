import { NextResponse } from "next/server";
import { isPersonalDeployment } from "#terracotta-runtime";
import { browserWorkspaceHeader, resolvePersonalRequest } from "./lib/vercel-owner-auth";

export async function proxy(request: Request) {
  if (!isPersonalDeployment) {
    if (!request.headers.has(browserWorkspaceHeader)) return NextResponse.next();
    const headers = new Headers(request.headers);
    headers.delete(browserWorkspaceHeader);
    return NextResponse.next({ request: { headers } });
  }
  const clientId = process.env.TERRACOTTA_VERCEL_CLIENT_ID;
  const ownerId = process.env.TERRACOTTA_VERCEL_OWNER_ID;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const route = await resolvePersonalRequest(request, process.env.TERRACOTTA_OWNER_PASSWORD, [
    productionHost, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL,
  ], clientId || ownerId ? { clientId, ownerId, productionHost } : undefined);
  if (route instanceof Response) return route;
  const next = NextResponse.next({ request: { headers: route.requestHeaders } });
  if (!route.staticAsset) next.headers.set("Cache-Control", "private, no-store");
  return next;
}
