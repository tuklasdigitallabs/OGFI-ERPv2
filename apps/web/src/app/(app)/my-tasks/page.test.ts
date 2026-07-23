import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

describe("My Tasks Maintenance presentation", () => {
  it("identifies Maintenance as an enrolled completion source", () => {
    expect(source).toContain("eligible Maintenance completion");
  });

  it("renders native Maintenance urgency as priority", () => {
    expect(source).toContain('task.sourceType === "MAINTENANCE"');
    expect(source).toContain(
      'task.sourceType === "INCIDENT" ? "severity" : "priority"'
    );
  });
});

describe("My Tasks Stock Count presentation", () => {
  it("identifies assigned Stock Count work without implying pooled access", () => {
    expect(source).toContain("assigned Stock Count start, entry, or submission");
    expect(source).toContain(
      "Stock Count work is shown only to its assigned counter"
    );
  });
});
