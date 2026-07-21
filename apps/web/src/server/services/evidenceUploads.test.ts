import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EvidenceStorageConfig } from "./evidenceStorageConfig";
import {
  evidenceStorageEnvironment,
  issueEvidenceUploadSchema,
  requiredEvidenceActionForSource,
  verifyIntentTokenForTest,
} from "./evidenceUploads";

const localConfig = {
  provider: "local-private",
  production: false,
  rootDirectory: "/tmp/evidence-test",
  localScanMode: "explicit-test-clean",
  uploadIntentTtlSeconds: 300,
  uploadIntentAbsoluteTtlSeconds: 900,
  uploadLeaseSeconds: 180,
  maxActiveUploadIntentsPerUser: 20,
  maxActiveUploadIntentsPerCompany: 500,
  maxUploadIntentsPerUserHour: 100,
  maxUploadIntentsPerCompanyHour: 2000,
  maxUploadBytes: 1024,
  defaultCompanyQuotaBytes: 4096,
} satisfies EvidenceStorageConfig;

describe("controlled evidence upload contract", () => {
  it("requires an idempotency key and a SHA-256 checksum", () => {
    const result = issueEvidenceUploadSchema.safeParse({
      sourceType: "AP_INVOICE",
      sourceRecordId: "00000000-0000-4000-8000-000000000001",
      originalFilename: "invoice.pdf",
      mimeType: "application/pdf",
      sizeBytes: 20,
      checksumSha256Base64: "not-a-checksum",
      idempotencyKey: "short",
    });
    expect(result.success).toBe(false);
  });

  it.each([
    "review.cmd",
    "review.bat",
    "review.ps1",
    "review.js",
    "review.html",
    "review.svg",
    "review.csv",
    "review.txt.",
  ])(
    "rejects active or spreadsheet filename %s declared as plain text",
    (originalFilename) => {
      const result = issueEvidenceUploadSchema.safeParse({
        sourceType: "AP_INVOICE",
        sourceRecordId: "00000000-0000-4000-8000-000000000001",
        originalFilename,
        mimeType: "text/plain",
        sizeBytes: 20,
        checksumSha256Base64: "A".repeat(43) + "=",
        idempotencyKey: "evidence-file-safety-001",
      });
      expect(result.success).toBe(false);
    },
  );

  it.each([
    ["invoice.jpg", "application/pdf"],
    ["photo.pdf", "image/jpeg"],
    ["diagram.jpeg", "image/png"],
    ["scan.png", "image/webp"],
  ])(
    "rejects filename %s for declared MIME %s",
    (originalFilename, mimeType) => {
      const result = issueEvidenceUploadSchema.safeParse({
        sourceType: "AP_INVOICE",
        sourceRecordId: "00000000-0000-4000-8000-000000000001",
        originalFilename,
        mimeType,
        sizeBytes: 20,
        checksumSha256Base64: "A".repeat(43) + "=",
        idempotencyKey: "evidence-file-mismatch-001",
      });
      expect(result.success).toBe(false);
    },
  );

  it("accepts case-insensitive safe extensions", () => {
    const result = issueEvidenceUploadSchema.safeParse({
      sourceType: "AP_INVOICE",
      sourceRecordId: "00000000-0000-4000-8000-000000000001",
      originalFilename: "INVOICE.PDF",
      mimeType: "application/pdf",
      sizeBytes: 20,
      checksumSha256Base64: "A".repeat(43) + "=",
      idempotencyKey: "evidence-file-uppercase-001",
    });
    expect(result.success).toBe(true);
  });

  it("uses constant-time comparable hashes for one-time intent tokens", () => {
    const token = "a".repeat(43);
    const hash = createHash("sha256").update(token).digest("hex");
    expect(verifyIntentTokenForTest(token, hash)).toBe(true);
    expect(verifyIntentTokenForTest(`${token}x`, hash)).toBe(false);
  });

  it("classifies deployment environments explicitly and fails closed", () => {
    expect(evidenceStorageEnvironment(localConfig, { APP_ENV: "uat" })).toBe(
      "CONTROLLED_UAT",
    );
    expect(
      evidenceStorageEnvironment(localConfig, { APP_ENV: "development" }),
    ).toBe("LOCAL_DEVELOPMENT");
    expect(() =>
      evidenceStorageEnvironment(
        {
          ...localConfig,
          production: true,
        } as unknown as EvidenceStorageConfig,
        {},
      ),
    ).toThrow("EVIDENCE_STORAGE_ENVIRONMENT_UNCLASSIFIED");
  });

  it("derives preservation requirements from the source workflow", () => {
    expect(requiredEvidenceActionForSource("PAYMENT_RELEASE")).toBe("RELEASE");
    expect(requiredEvidenceActionForSource("EXPENSE_REQUEST")).toBe(
      "EXPENSE_REVIEW",
    );
    expect(requiredEvidenceActionForSource("PROJECT_REQUIREMENT")).toBe(
      "PROJECT_REQUIREMENT_SUBMIT",
    );
    expect(requiredEvidenceActionForSource("AP_INVOICE")).toBeNull();
  });
});
