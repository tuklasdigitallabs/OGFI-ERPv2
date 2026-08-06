import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
const primitivesSource = readFileSync(
  fileURLToPath(
    new URL("../../../../../../packages/ui/src/primitives.tsx", import.meta.url),
  ),
  "utf8",
);

describe("opening inventory cutover queue", () => {
  it("keeps the primary route queue-first and links records to dedicated detail pages", () => {
    expect(source).toContain("listOpeningInventoryCutoverPage(session");
    expect(source).toContain("/opening-inventory/${cutover.id}");
    expect(source).not.toContain("getOpeningInventoryCutoverDetail");
    expect(source).not.toContain("getOpeningInventoryPreparationFormOptions");
  });

  it("shows accountable queue facts without inventing a brand binding", () => {
    expect(source).toContain("Requested by {cutover.requesterName");
    expect(source).toContain("cohort owner {cutover.ownerName");
    expect(source).toContain("Current approver: ${cutover.currentApprover}");
    expect(source).toContain("Company-level cohort · no brand binding");
  });

  it("uses server-backed filters and pagination for the queue", () => {
    expect(source).toContain("Search cutover batches");
    expect(source).toContain("Apply filters");
    expect(source).toContain("<PaginationBar");
  });

  it("keeps the filter reset control at the shared touch-target size", () => {
    expect(source).toContain('className="mt-3 bg-white text-blue-700"');
    expect(source).not.toContain('className="mt-3 min-h-8 bg-white text-blue-700"');
  });

  it("uses 44px pagination controls", () => {
    expect(primitivesSource).toContain(
      '"inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] border',
    );
  });

  it("keeps preparation-option failures distinct and retryable without leaking internals", () => {
    expect(source).toContain('kind: "denied"');
    expect(source).toContain('kind: "no_eligible_revision"');
    expect(source).toContain('kind: "ineligible"');
    expect(source).toContain('kind: "not_found"');
    expect(source).toContain('kind: "load_error"');
    expect(source).toContain("Retry preparation options");
    expect(source).toContain("configurationLiveReadinessBlocked");
    expect(source).toContain("configurationEvidenceInvalid");
    expect(source).not.toContain("getOpeningInventoryFormOptions(session).catch(() => null)");
  });
});
