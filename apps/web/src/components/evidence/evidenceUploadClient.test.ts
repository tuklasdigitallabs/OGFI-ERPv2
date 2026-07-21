import { describe, expect, it } from "vitest";
import {
  friendlyUploadError,
  uploadFailureCode,
  validateEvidenceFile,
} from "./evidenceUploadClient";

function evidenceFile(name: string, type: string, size = 16) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("controlled evidence upload client validation", () => {
  it("accepts a supported file with a matching extension", () => {
    expect(
      validateEvidenceFile(evidenceFile("receipt.pdf", "application/pdf")),
    ).toBeNull();
  });

  it("rejects an allowed MIME type paired with an unsupported extension", () => {
    expect(
      validateEvidenceFile(evidenceFile("receipt.exe", "application/pdf")),
    ).toContain("Choose a PDF");
  });

  it.each(["note.csv", "note.cmd", "note.html", "note.txt."])(
    "rejects active filename %s reported as plain text",
    (name) => {
      expect(validateEvidenceFile(evidenceFile(name, "text/plain"))).toContain(
        "Choose a PDF",
      );
    },
  );

  it("rejects a file over the visible 25 MB limit", () => {
    expect(
      validateEvidenceFile(
        evidenceFile("receipt.pdf", "application/pdf", 25 * 1024 * 1024 + 1),
      ),
    ).toContain("25 MB");
  });

  it("keeps internal error codes out of user-facing retry copy", () => {
    const message = friendlyUploadError(
      new Error("EVIDENCE_UPLOAD_VERIFICATION_REFERENCE_MISSING"),
    );
    expect(message).toContain("verification reference");
    expect(message).not.toContain("EVIDENCE_UPLOAD");
  });

  it("preserves only safe upload error codes from the application proxy", () => {
    expect(
      uploadFailureCode(
        409,
        JSON.stringify({ error: "EVIDENCE_UPLOAD_INTENT_RACE" }),
      ),
    ).toBe("EVIDENCE_UPLOAD_INTENT_RACE");
    expect(uploadFailureCode(500, "upstream stack trace")).toBe(
      "EVIDENCE_UPLOAD_STORAGE_REJECTED",
    );
  });
});
