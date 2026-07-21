import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const listSource = readFileSync(
  fileURLToPath(new URL("./ControlledEvidenceList.tsx", import.meta.url)),
  "utf8",
);
const pageSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/evidence/page.tsx", import.meta.url)),
  "utf8",
);

describe("controlled evidence list", () => {
  it("shows preservation reasons and disables prohibited archive actions", () => {
    expect(listSource).toContain(
      "Legal hold — this evidence link cannot be archived.",
    );
    expect(listSource).toContain("Required evidence — preserved for");
    expect(listSource).toContain("!attachment.legalHold");
    expect(listSource).toContain("Archive unavailable");
  });

  it("bounds embedded lists and routes larger sets to server pagination", () => {
    expect(listSource).toContain("attachments.slice(0, 10)");
    expect(listSource).toContain("attachments.length > 10");
    expect(listSource).toContain("View all evidence");
    expect(pageSource).toContain("listControlledEvidenceAttachmentPage({");
    expect(pageSource).toContain("pageSize: 10");
    expect(pageSource).toContain('aria-label="Evidence pages"');
    expect(pageSource).toContain("canArchiveControlledEvidenceSource(");
    expect(pageSource).toContain("archiveEvidenceFromRegisterAction");
    expect(pageSource).toContain("legally held evidence remains preserved");
  });
});
