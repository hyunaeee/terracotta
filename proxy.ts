import { NextResponse } from "next/server";
import { isPersonalDeployment } from "#terracotta-runtime";
import { authorizePersonalRequest, personalRequestHeaders } from "./lib/vercel-owner-auth";

export async function proxy(request: Request) {
  if (!isPersonalDeployment) return NextResponse.next();
  const clientId = process.env.TERRACOTTA_VERCEL_CLIENT_ID;
  const ownerId = process.env.TERRACOTTA_VERCEL_OWNER_ID;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const response = await authorizePersonalRequest(request, process.env.TERRACOTTA_OWNER_PASSWORD, [
    productionHost, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL,
  ], clientId || ownerId ? { clientId, ownerId, productionHost } : undefined);
  if (response) return response;
  const next = NextResponse.next({ request: { headers: personalRequestHeaders(request) } });
  next.headers.set("Cache-Control", "private, no-store");
  return next;
}
