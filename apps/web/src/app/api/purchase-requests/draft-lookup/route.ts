import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/server/services/context";
import { searchPurchaseRequestDraftLookup } from "@/server/services/purchaseRequests";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "item" && kind !== "uom" && kind !== "budget") {
    return NextResponse.json({ code: "LOOKUP_KIND_INVALID" }, { status: 400 });
  }
  try {
    const result = await searchPurchaseRequestDraftLookup(session, {
      kind,
      query: url.searchParams.get("query") ?? "",
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "25"),
      itemId: url.searchParams.get("itemId") || undefined,
      selectedId: url.searchParams.get("selectedId") || undefined,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "LOOKUP_UNAVAILABLE";
    if (code === "PR_LINE_ITEM_NOT_FOUND") {
      return NextResponse.json({ code }, { status: 404 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ code: "LOOKUP_INPUT_INVALID" }, { status: 400 });
    }
    if (code.includes("PERMISSION") || code.includes("SCOPE") || code.includes("LOCATION")) {
      return NextResponse.json({ code: "LOOKUP_DENIED" }, { status: 403 });
    }
    return NextResponse.json({ code: "LOOKUP_UNAVAILABLE" }, { status: 503 });
  }
}
