import { NextResponse, type NextRequest } from "next/server";
import { isTrustedMutationOrigin } from "@/server/services/authentication";
import { readEvidenceStorageConfig } from "@/server/services/evidenceStorageConfig";
import { storeEvidenceUploadContent } from "@/server/services/evidenceUploads";

async function* requestBodyChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value.byteLength > 0) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest) {
  if (
    !isTrustedMutationOrigin({
      origin: request.headers.get("origin"),
      requestUrl: request.url,
      appUrl: process.env.APP_URL,
    })
  ) {
    return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  }
  try {
    const config = readEvidenceStorageConfig();
    const declaredLengthHeader = request.headers.get("content-length");
    const declaredLength =
      declaredLengthHeader === null ? null : Number(declaredLengthHeader);
    if (
      (declaredLength !== null &&
        (!Number.isInteger(declaredLength) ||
          declaredLength < 1 ||
          declaredLength > config.maxUploadBytes)) ||
      !request.body
    ) {
      throw new Error("EVIDENCE_UPLOAD_SIZE_INVALID");
    }
    const intentId = request.headers.get("x-evidence-intent-id") ?? "";
    const intentToken = request.headers.get("x-evidence-intent-token") ?? "";
    const contentType = request.headers.get("content-type") ?? "";
    if (
      !/^[0-9a-f-]{36}$/i.test(intentId) ||
      intentToken.length < 32 ||
      intentToken.length > 256 ||
      contentType.length < 3 ||
      contentType.length > 160
    ) {
      throw new Error("EVIDENCE_UPLOAD_CONTENT_INVALID");
    }
    const result = await storeEvidenceUploadContent({
      intentId,
      intentToken,
      contentType,
      body: requestBodyChunks(request.body),
    });
    return NextResponse.json(result, {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const rawCode = error instanceof Error ? error.message : "";
    const brokerFailure = rawCode.startsWith("EVIDENCE_BROKER_");
    const code = brokerFailure
      ? rawCode.includes("WATERMARK")
        ? "EVIDENCE_UPLOAD_CAPACITY_UNAVAILABLE"
        : rawCode.includes("UNAVAILABLE") || rawCode.includes("TIMEOUT")
          ? "EVIDENCE_UPLOAD_STORAGE_UNAVAILABLE"
          : "EVIDENCE_UPLOAD_CONTENT_REJECTED"
      : /^EVIDENCE_[A-Z0-9_]+$/.test(rawCode)
        ? rawCode
        : "EVIDENCE_UPLOAD_FAILED";
    const status =
      code.includes("RACE") || code.includes("COLLISION")
        ? 409
        : code.includes("SIZE")
          ? 413
          : code.includes("CAPACITY")
            ? 507
            : code.includes("UNAVAILABLE")
              ? 503
              : 400;
    return NextResponse.json(
      { error: code },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
