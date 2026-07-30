import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const transferDetailPage = readFileSync(
  new URL("../../app/(app)/transfers/[id]/page.tsx", import.meta.url),
  "utf8"
);
const transferListPage = readFileSync(
  new URL("../../app/(app)/transfers/page.tsx", import.meta.url),
  "utf8"
);
const countDetailPage = readFileSync(
  new URL("../../app/(app)/counts/[id]/page.tsx", import.meta.url),
  "utf8"
);

describe("inventory pilot visible submission controls", () => {
  test("gives transfer submission and resubmission a browser-stable request key", () => {
    for (const page of [transferDetailPage, transferListPage]) {
      expect(page).toContain('name="idempotencyKey"');
      expect(page).toContain("ui:transfer-approval:${randomUUID()}");
      expect(page).toContain('["DRAFT", "RETURNED"].includes(transfer.status)');
      expect(page).toContain('"Resubmit Request"');
    }
  });

  test("gives count submission a request key and routes admitted review to the inbox", () => {
    expect(countDetailPage).toContain('name="idempotencyKey"');
    expect(countDetailPage).toContain("ui:stock-count-review:${randomUUID()}");
    expect(countDetailPage).toContain(
      'process.env.STOCK_COUNT_ATTEMPT_REVIEW_APPROVAL_V1_ENABLED === "true"'
    );
    expect(countDetailPage).toContain('href="/approvals"');
    expect(countDetailPage).toContain("direct review");
  });
});
