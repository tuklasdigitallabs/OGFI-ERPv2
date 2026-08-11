import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);
const summaryListSource = readFileSync(
  fileURLToPath(
    new URL("../../../../components/SingleOpenSummaryList.tsx", import.meta.url),
  ),
  "utf8",
);
const categorySummaryStart = source.indexOf(
  "const readinessCategorySections",
);
const categorySummarySource = source.slice(
  categorySummaryStart,
  source.indexOf("\n  return (\n    <AppShell", categorySummaryStart),
);

describe("release readiness category summary presentation", () => {
  it("uses the shared accessible single-open interaction with closed initial state", () => {
    expect(summaryListSource).toContain('"use client"');
    expect(summaryListSource).toContain("useState<string | null>(null)");
    expect(summaryListSource).toContain(
      "currentOpenId === sectionId ? null : sectionId",
    );
    expect(summaryListSource).toContain("setOpenId(null)");
    expect(summaryListSource).toContain("aria-expanded={expanded}");
    expect(summaryListSource).toContain("aria-controls={panelId}");
    expect(summaryListSource).toContain('role="region"');
    expect(summaryListSource).toContain("aria-labelledby={buttonId}");
    expect(summaryListSource).toContain("min-h-24");
    expect(summaryListSource).toContain("section.snapshots.slice(0, 3)");
    expect(summaryListSource).toContain("headingLevel?: 2 | 3 | 4");
    expect(summaryListSource).not.toContain("useSearchParams");
  });

  it("derives bounded category snapshots from authorized gate results", () => {
    expect(categorySummarySource).toContain(
      "releaseReadinessCategories.map<SingleOpenSummarySection>((item)",
    );
    expect(categorySummarySource).toContain(
      "gates.filter((gate) => gate.category === item.id)",
    );
    expect(categorySummarySource).toContain(
      "summarizeReleaseReadiness(categoryGates)",
    );
    expect(categorySummarySource).toContain(
      "categorySummary.blocking + categorySummary.hold",
    );
    expect(categorySummarySource).toContain('label: "Ready outcomes"');
    expect(categorySummarySource).toContain('label: "Blocking"');
    expect(categorySummarySource).toContain('label: "Required gates"');
    expect(categorySummarySource).toContain(".slice(0, 3)");
    expect(categorySummarySource).toContain("Bounded gate preview");
    expect(categorySummarySource).not.toContain("<form");
  });

  it("keeps category navigation and controlled work outside the disclosure", () => {
    expect(source).toContain(
      'ariaLabel="Release readiness category summaries"',
    );
    expect(source).toContain("headingLevel={3}");
    expect(categorySummarySource).toContain(
      "href={readinessCategoryHref(item.id)}",
    );
    expect(source).toContain("Export Readiness Register");
    expect(source).toContain('name="category" type="hidden"');
    expect(source).toContain("<TaskSheet");
    expect(source).toContain("GO / NO-GO decision record");
    expect(source.indexOf("<SingleOpenSummaryList")).toBeLessThan(
      source.indexOf('name="category" type="hidden"'),
    );
  });
});
