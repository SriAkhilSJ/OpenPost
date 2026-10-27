import { NextResponse } from "next/server";
import { getRequestScope } from "@/lib/request-scope";
import { getLiveStatus } from "@/lib/orchestration";

export async function GET() {
  const scope = await getRequestScope();
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await getLiveStatus(scope.campaignId);
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
