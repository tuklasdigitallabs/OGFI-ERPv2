import { randomUUID } from "node:crypto";

const opaqueEvidenceKeyPattern = /^quarantine\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createOpaqueEvidenceObjectKey() {
  return `quarantine/${randomUUID()}`;
}

export function assertOpaqueEvidenceObjectKey(key: string) {
  if (!opaqueEvidenceKeyPattern.test(key)) {
    throw new Error("EVIDENCE_STORAGE_OBJECT_KEY_INVALID");
  }
  return key;
}

export function assertExactObjectVersion(input: {
  key: string;
  versionId: string;
}) {
  assertOpaqueEvidenceObjectKey(input.key);
  if (!input.versionId.trim() || input.versionId === "null") {
    throw new Error("EVIDENCE_STORAGE_VERSION_ID_REQUIRED");
  }
  return input;
}
