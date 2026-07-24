import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/server/services/context";
import { listItemMasterOptionCatalog } from "@/server/services/items";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  const url = new URL(request.url);
  const selectedIds = url.searchParams.getAll("selectedId");
  try {
    const result = await listItemMasterOptionCatalog(session, {
      kind: url.searchParams.get("kind") ?? "item",
      query: url.searchParams.get("query") ?? "",
      selectedIds,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "25")
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "OPTION_INPUT_INVALID" }, { status: 400 });
    const code = error instanceof Error ? error.message : "OPTION_LOOKUP_UNAVAILABLE";
    if (code.includes("PERMISSION") || code.includes("ADMIN_SCOPE")) return NextResponse.json({ code: "OPTION_LOOKUP_DENIED" }, { status: 403 });
    return NextResponse.json({ code: "OPTION_LOOKUP_UNAVAILABLE" }, { status: 503 });
  }
}
