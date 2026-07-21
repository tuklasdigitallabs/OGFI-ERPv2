import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadControlledEvidenceAttachment = vi.fn();

vi.mock("@/server/services/attachments", () => ({
  downloadControlledEvidenceAttachment,
}));

describe("controlled evidence download route", () => {
  beforeEach(() => {
    downloadControlledEvidenceAttachment.mockReset();
  });

  it("returns the same non-enumerating response for every denial", async () => {
    downloadControlledEvidenceAttachment
      .mockRejectedValueOnce(new Error("PERMISSION_DENIED:internal-detail"))
      .mockRejectedValueOnce(
        new Error("CONTROLLED_EVIDENCE_ATTACHMENT_LINK_NOT_FOUND"),
      );
    const { GET } = await import("../../app/(app)/evidence/[id]/download/route");
    const response = await GET({} as never, {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000123" }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const nonexistentResponse = await GET({} as never, {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000999" }),
    });
    expect(nonexistentResponse.status).toBe(404);
    expect(await nonexistentResponse.json()).toEqual({
      error: "CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE",
    });
    expect(nonexistentResponse.headers.get("cache-control")).toBe(
      "private, no-store",
    );
  });

  it("delivers only the authorized service result with safe headers", async () => {
    downloadControlledEvidenceAttachment.mockResolvedValueOnce({
      body: (async function* () {
        yield Buffer.from("evidence");
      })(),
      originalFilename: 'evidence\"\r\n.pdf',
      mimeType: "application/pdf",
      sizeBytes: 8,
    });
    const { GET } = await import("../../app/(app)/evidence/[id]/download/route");
    const response = await GET({} as never, {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000123" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="evidence___.pdf"; filename*=UTF-8\'\'evidence___.pdf',
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("evidence");
  });
});
