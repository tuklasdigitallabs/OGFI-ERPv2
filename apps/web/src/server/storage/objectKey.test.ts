import { describe, expect, it } from "vitest";
import {
  assertExactObjectVersion,
  assertOpaqueEvidenceObjectKey,
  createOpaqueEvidenceObjectKey,
} from "./objectKey";

describe("opaque evidence object keys", () => {
  it("creates filename-free quarantine keys", () => {
    const key = createOpaqueEvidenceObjectKey();
    expect(key).toMatch(/^quarantine\/[0-9a-f-]{36}$/);
    expect(() => assertOpaqueEvidenceObjectKey(key)).not.toThrow();
  });

  it.each([
    "invoice.pdf",
    "quarantine/invoice.pdf",
    "../quarantine/550e8400-e29b-41d4-a716-446655440000",
    "quarantine/550e8400-e29b-41d4-a716-446655440000/extra",
  ])("rejects non-opaque key %s", (key) => {
    expect(() => assertOpaqueEvidenceObjectKey(key)).toThrow(
      "EVIDENCE_STORAGE_OBJECT_KEY_INVALID",
    );
  });

  it("requires an exact immutable version", () => {
    expect(() =>
      assertExactObjectVersion({
        key: "quarantine/550e8400-e29b-41d4-a716-446655440000",
        versionId: "",
      }),
    ).toThrow("EVIDENCE_STORAGE_VERSION_ID_REQUIRED");
  });
});
