import { NextResponse } from "next/server";
import { isPersonalDeployment } from "#terracotta-runtime";
import { authorizePersonalRequest, personalRequestHeaders } from "./lib/vercel-owner-auth";

export async function proxy(request: Request) {
  if (!isPersonalDeployment) return NextResponse.next();
  const response = await authorizePersonalRequest(request, process.env.TERRACOTTA_OWNER_PASSWORD, [
    process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL,
  ]);
  if (response) return response;
  const next = NextResponse.next({ request: { headers: personalRequestHeaders(request) } });
  next.headers.set("Cache-Control", "private, no-store");
  return next;
}
