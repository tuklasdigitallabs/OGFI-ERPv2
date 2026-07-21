import { beforeEach, describe, expect, it, vi } from "vitest";

const issueEvidenceUploadIntent = vi.fn();
const storeEvidenceUploadContent = vi.fn();
const isTrustedMutationOrigin = vi.fn();

vi.mock("@/server/services/evidenceUploads", () => ({
  issueEvidenceUploadIntent,
  storeEvidenceUploadContent,
}));
vi.mock("@/server/services/authentication", () => ({
  isTrustedMutationOrigin,
}));
vi.mock("@/server/services/evidenceStorageConfig", () => ({
  readEvidenceStorageConfig: () => ({ maxUploadBytes: 26_214_400 }),
}));

describe("evidence upload API origin boundary", () => {
  beforeEach(() => {
    issueEvidenceUploadIntent.mockReset();
    storeEvidenceUploadContent.mockReset();
    isTrustedMutationOrigin.mockReset();
  });

  it("rejects an untrusted raw content request before reading or storing bytes", async () => {
    isTrustedMutationOrigin.mockReturnValue(false);
    const { POST } = await import(
      "../../app/api/evidence/uploads/content/route"
    );
    const response = await POST(
      new Request("https://erp.example/api/evidence/uploads/content", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: "private evidence",
      }) as never,
    );
    expect(response.status).toBe(403);
    expect(storeEvidenceUploadContent).not.toHaveBeenCalled();
  });

  it("passes trusted raw content to the exact intent service without caching", async () => {
    isTrustedMutationOrigin.mockReturnValue(true);
    storeEvidenceUploadContent.mockResolvedValue({
      attachmentId: "00000000-0000-4000-8000-000000000001",
      objectVersionId: "00000000-0000-4000-8000-000000000002",
      status: "SCANNING",
    });
    const { POST } = await import(
      "../../app/api/evidence/uploads/content/route"
    );
    const response = await POST(
      new Request("https://erp.example/api/evidence/uploads/content", {
        method: "POST",
        headers: {
          origin: "https://erp.example",
          "content-type": "text/plain",
          "x-evidence-intent-id": "00000000-0000-4000-8000-000000000003",
          "x-evidence-intent-token": "a".repeat(43),
        },
        body: "private evidence",
      }) as never,
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(storeEvidenceUploadContent).toHaveBeenCalledTimes(1);
  });

  it("rejects an untrusted issue request before invoking the service", async () => {
    isTrustedMutationOrigin.mockReturnValue(false);
    const { POST } = await import("../../app/api/evidence/uploads/route");
    const response = await POST(
      new Request("https://erp.example/api/evidence/uploads", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
        body: "{}",
      }) as never,
    );
    expect(response.status).toBe(403);
    expect(issueEvidenceUploadIntent).not.toHaveBeenCalled();
  });

  it("returns the opaque service upload contract without caching", async () => {
    isTrustedMutationOrigin.mockReturnValue(true);
    issueEvidenceUploadIntent.mockResolvedValue({
      intentId: "intent",
      attachmentId: "attachment",
      intentToken: "token",
      upload: {
        method: "application-proxy",
        url: "/api/evidence/uploads/content",
        fields: {},
      },
      reused: false,
    });
    const { POST } = await import("../../app/api/evidence/uploads/route");
    const response = await POST(
      new Request("https://erp.example/api/evidence/uploads", {
        method: "POST",
        headers: { origin: "https://erp.example" },
        body: "{}",
      }) as never,
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
