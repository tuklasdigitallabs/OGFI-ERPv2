import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import releaseIdentity from "../../../../release-identity.json";

export const dynamic = "force-dynamic";

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{32,128}$/;

export function GET(request: NextRequest) {
  const nonce = request.nextUrl.searchParams.get("probe");
  if (!nonce || !NONCE.test(nonce) || !validIdentity(releaseIdentity)) {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: noStoreHeaders() });
  }
  return NextResponse.json(
    { schemaVersion: 2, commitSha: releaseIdentity.commitSha, artifactSha256: releaseIdentity.artifactSha256, identityManifestSha256: identityManifestSha256(releaseIdentity), probe: nonce },
    { headers: noStoreHeaders() },
  );
}

function validIdentity(value: typeof releaseIdentity) {
  return value.schemaVersion === 2 && SHA.test(value.commitSha) && DIGEST.test(value.artifactSha256);
}

function identityManifestSha256(value: typeof releaseIdentity) {
  return createHash("sha256").update(`{"artifactSha256":${JSON.stringify(value.artifactSha256)},"commitSha":${JSON.stringify(value.commitSha)},"schemaVersion":${value.schemaVersion}}`).digest("hex");
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
}
