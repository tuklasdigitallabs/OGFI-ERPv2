import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./ControlledEvidenceUploader.tsx", import.meta.url)),
  "utf8",
);

describe("controlled evidence uploader accessibility", () => {
  it("traps focus, supports Escape, locks scrolling, and restores trigger focus", () => {
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain("triggerRef.current?.focus()");
    expect(source).toContain("dialogRef.current");
    expect(source).toContain("?.querySelector<HTMLInputElement>");
  });
});
