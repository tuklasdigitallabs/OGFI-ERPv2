import { NextRequest, NextResponse } from "next/server";
import {
  constantTimeTokenMatches,
  readAuthenticationRuntimeMetrics,
} from "../../../../server/services/authenticationRuntimeMetrics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expectedToken = process.env.AUTH_HEALTH_METRICS_TOKEN;
  if (!expectedToken || Buffer.byteLength(expectedToken, "utf8") < 32) {
    return NextResponse.json({ code: "AUTH_RUNTIME_METRICS_UNAVAILABLE" }, { status: 503 });
  }
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!constantTimeTokenMatches(supplied, expectedToken)) {
    return NextResponse.json({ code: "AUTH_RUNTIME_METRICS_DENIED" }, { status: 404 });
  }
  try {
    return NextResponse.json(await readAuthenticationRuntimeMetrics());
  } catch {
    return NextResponse.json({ code: "AUTH_RUNTIME_METRICS_UNAVAILABLE" }, { status: 503 });
  }
}
