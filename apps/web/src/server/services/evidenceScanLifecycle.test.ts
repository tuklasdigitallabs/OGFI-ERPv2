import { describe, expect, it } from "vitest";
import {
  detectEvidenceMimeType,
  isRetryableEvidenceScanResult,
} from "./evidenceScanLifecycle";

describe("controlled evidence scan lifecycle guards", () => {
  it("detects the supported binary formats independently from declared MIME", () => {
    expect(detectEvidenceMimeType(Buffer.from("%PDF-1.7\n"))).toBe(
      "application/pdf",
    );
    expect(
      detectEvidenceMimeType(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
      ),
    ).toBe("image/png");
    expect(detectEvidenceMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(
      detectEvidenceMimeType(Buffer.from("RIFF0000WEBP", "ascii")),
    ).toBe("image/webp");
  });

  it("accepts valid UTF-8 text and rejects binary content", () => {
    expect(detectEvidenceMimeType(Buffer.from("reference,amount\nINV-1,100"))).toBe(
      "text/plain",
    );
    expect(detectEvidenceMimeType(Buffer.from([0, 1, 2, 3]))).toBeNull();
  });

  it("rejects ZIP-based Office content until structural archive validation exists", () => {
    expect(
      detectEvidenceMimeType(Buffer.from("PK\u0003\u0004word/document.xml", "latin1")),
    ).toBeNull();
    expect(
      detectEvidenceMimeType(Buffer.from("PK\u0003\u0004xl/workbook.xml", "latin1")),
    ).toBeNull();
  });

  it("retries operational scan failures but terminalizes threats and unsupported files", () => {
    expect(isRetryableEvidenceScanResult("FAILED", false)).toBe(true);
    expect(isRetryableEvidenceScanResult("ACCESS_DENIED", false)).toBe(true);
    expect(isRetryableEvidenceScanResult("NO_THREATS_FOUND", true)).toBe(true);
    expect(isRetryableEvidenceScanResult("THREATS_FOUND", false)).toBe(false);
    expect(isRetryableEvidenceScanResult("UNSUPPORTED", false)).toBe(false);
  });
});
