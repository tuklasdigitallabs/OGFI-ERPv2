import { NextResponse } from "next/server";
import { getSessionContext } from "@/server/services/context";
import { listApprovedRecommendationsForPo } from "@/server/services/purchaseOrders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const result = await listApprovedRecommendationsForPo(session, {
      query: url.searchParams.get("query") ?? "",
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "25"),
      selectedId: url.searchParams.get("selectedId") || undefined,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "LOOKUP_UNAVAILABLE";
    if (code.includes("PERMISSION") || code.includes("SCOPE") || code.includes("LOCATION")) return NextResponse.json({ code: "LOOKUP_DENIED" }, { status: 403 });
    return NextResponse.json({ code: "LOOKUP_UNAVAILABLE" }, { status: 503 });
  }
}
