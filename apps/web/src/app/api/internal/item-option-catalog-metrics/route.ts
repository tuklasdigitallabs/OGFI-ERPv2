import { NextRequest, NextResponse } from "next/server";
import { constantTimeTokenMatches } from "@/server/services/authenticationRuntimeMetrics";
import { readItemOptionCatalogRuntimeMetrics } from "@/server/services/itemOptionCatalogRuntimeMetrics";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const expectedToken = process.env.AUTH_HEALTH_METRICS_TOKEN;
  if (!expectedToken || Buffer.byteLength(expectedToken, "utf8") < 32) {
    return NextResponse.json(
      { code: "ITEM_OPTION_RUNTIME_METRICS_UNAVAILABLE" },
      { status: 503, headers: noStoreHeaders },
    );
  }
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!constantTimeTokenMatches(supplied, expectedToken)) {
    return NextResponse.json(
      { code: "ITEM_OPTION_RUNTIME_METRICS_DENIED" },
      { status: 404, headers: noStoreHeaders },
    );
  }
  try {
    return NextResponse.json(await readItemOptionCatalogRuntimeMetrics(), {
      headers: noStoreHeaders,
    });
  } catch {
    return NextResponse.json(
      { code: "ITEM_OPTION_RUNTIME_METRICS_UNAVAILABLE" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
