import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/server/services/context";
import {
  ItemOptionCatalogRateLimitedError,
} from "@/server/services/itemOptionCatalogAdmission";
import { listItemMasterOptionCatalog } from "@/server/services/items";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store" };

function response(code: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { code },
    { status, headers: { ...noStoreHeaders, ...headers } },
  );
}

function hasStrictQueryShape(url: URL) {
  const allowed = new Set(["kind", "query", "selectedId", "page", "pageSize"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return false;
  return ["kind", "query", "page", "pageSize"].every(
    (key) => url.searchParams.getAll(key).length <= 1,
  );
}

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return response("AUTH_REQUIRED", 401);
    }
    const url = new URL(request.url);
    if (!hasStrictQueryShape(url)) {
      return response("OPTION_INPUT_INVALID", 400);
    }
    const selectedIds = url.searchParams.getAll("selectedId");
    const rawKind = url.searchParams.get("kind") ?? "item";
    if (!["item", "uom", "category"].includes(rawKind)) {
      return response("OPTION_INPUT_INVALID", 400);
    }
    const kind = rawKind as "item" | "uom" | "category";
    const result = await listItemMasterOptionCatalog(session, {
      kind,
      query: url.searchParams.get("query") ?? "",
      selectedIds,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "25")
    });
    return NextResponse.json(result, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof ItemOptionCatalogRateLimitedError) {
      return response("OPTION_LOOKUP_RATE_LIMITED", 429, {
        "Retry-After": String(error.retryAfterSeconds),
      });
    }
    if (error instanceof z.ZodError) {
      return response("OPTION_INPUT_INVALID", 400);
    }
    const code = error instanceof Error ? error.message : "OPTION_LOOKUP_UNAVAILABLE";
    if (code.includes("PERMISSION") || code.includes("ADMIN_SCOPE")) {
      return response("OPTION_LOOKUP_DENIED", 403);
    }
    return response("OPTION_LOOKUP_UNAVAILABLE", 503);
  }
}
