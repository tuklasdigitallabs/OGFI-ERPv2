import { NextRequest, NextResponse } from "next/server";
import releaseIdentity from "../../../../release-identity.json";

export const dynamic = "force-dynamic";

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const IMAGE = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{32,128}$/;

export function GET(request: NextRequest) {
  const nonce = request.nextUrl.searchParams.get("probe");
  if (!nonce || !NONCE.test(nonce) || !validIdentity(releaseIdentity)) {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: noStoreHeaders() });
  }
  return NextResponse.json(
    { schemaVersion: 1, commitSha: releaseIdentity.commitSha, artifactSha256: releaseIdentity.artifactSha256, webImageDigest: releaseIdentity.webImageDigest, probe: nonce },
    { headers: noStoreHeaders() },
  );
}

function validIdentity(value: typeof releaseIdentity) {
  return value.schemaVersion === 1 && SHA.test(value.commitSha) && DIGEST.test(value.artifactSha256) && IMAGE.test(value.webImageDigest);
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
}
