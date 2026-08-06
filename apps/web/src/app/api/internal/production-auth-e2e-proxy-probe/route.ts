import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getTrustedRequestFingerprint } from "../../../../server/services/authentication";

export const dynamic = "force-dynamic";

function admittedProbeRuntime() {
  const shared =
    process.env.NODE_ENV === "production" &&
    process.env.CI === "true" &&
    process.env.AUTH_MODE === "local";
  const ordinaryProduction =
    process.env.APP_ENV === "production" &&
    process.env.AUTH_HARDENED_UAT_RUNTIME_ENABLED === "false" &&
    process.env.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "false" &&
    process.env.APPROVAL_ROUTING_V1_ENABLED === "false";
  const boundedUat =
    process.env.APP_ENV === "uat" &&
    process.env.AUTH_HARDENED_UAT_RUNTIME_ENABLED === "true" &&
    process.env.BOUNDED_INVENTORY_UAT_APPROVAL_WORKLIST_ENABLED === "true" &&
    process.env.APPROVAL_ROUTING_V1_ENABLED === "false";
  return shared && (ordinaryProduction || boundedUat);
}

function validProbeToken(provided: string | null) {
  const expected = process.env.OGFI_PRODUCTION_AUTH_E2E_PROBE_TOKEN ?? "";
  if (expected.length < 32 || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function GET(request: Request) {
  if (
    !admittedProbeRuntime() ||
    !validProbeToken(request.headers.get("x-ogfi-e2e-probe-token"))
  ) {
    return new NextResponse(null, { status: 404 });
  }
  const requestHeaders = await headers();
  const fingerprint = getTrustedRequestFingerprint(requestHeaders);
  const forwardedHeaderRemoved = !requestHeaders.has("forwarded");
  return NextResponse.json(
    {
      forwardedHeaderRemoved,
      xRealIpRemoved: !requestHeaders.has("x-real-ip"),
      forwardedFor: requestHeaders.get("x-forwarded-for"),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      forwardedHost: requestHeaders.get("x-forwarded-host"),
      trustedLoopbackSource: fingerprint.sourceAddress === "127.0.0.1",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
