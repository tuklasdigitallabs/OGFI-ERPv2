import { NextResponse, type NextRequest } from "next/server";
import { isTrustedMutationOrigin } from "@/server/services/authentication";
import { issueEvidenceUploadIntent } from "@/server/services/evidenceUploads";

function trusted(request: NextRequest) {
  return isTrustedMutationOrigin({
    origin: request.headers.get("origin"),
    requestUrl: request.url,
    appUrl: process.env.APP_URL,
  });
}

export async function POST(request: NextRequest) {
  if (!trusted(request)) {
    return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  }
  try {
    const lengthHeader = request.headers.get("content-length");
    const declaredLength = lengthHeader === null ? null : Number(lengthHeader);
    if (
      declaredLength !== null &&
      (!Number.isInteger(declaredLength) || declaredLength < 2 || declaredLength > 16_384)
    ) {
      throw new Error("EVIDENCE_UPLOAD_REQUEST_TOO_LARGE");
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > 16_384) {
      throw new Error("EVIDENCE_UPLOAD_REQUEST_TOO_LARGE");
    }
    const result = await issueEvidenceUploadIntent(JSON.parse(rawBody));
    return NextResponse.json(result, {
      status: result.reused ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const rawCode = error instanceof Error ? error.message : "";
    const code = /^EVIDENCE_[A-Z0-9_]+$/.test(rawCode)
      ? rawCode
      : "EVIDENCE_UPLOAD_FAILED";
    const rateLimited = code === "EVIDENCE_UPLOAD_INTENT_RATE_LIMITED";
    const status = rateLimited
      ? 429
      : code.includes("IDEMPOTENCY")
        ? 409
        : code.includes("QUOTA")
          ? 422
          : 400;
    return NextResponse.json(
      { error: code },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          ...(rateLimited ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
