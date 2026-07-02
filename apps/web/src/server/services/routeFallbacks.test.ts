import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const appRoot = path.resolve(__dirname, "../../app");

const permissionAwareFallbackPages = [
  "page.tsx",
  "(app)/items/page.tsx",
  "(app)/suppliers/page.tsx",
  "(app)/admin/page.tsx",
  "(app)/admin/users/[id]/page.tsx",
  "(app)/inventory/page.tsx",
  "(app)/inventory/ledger/page.tsx",
  "(app)/quotes/page.tsx",
  "(app)/purchase-orders/page.tsx",
  "(app)/purchase-orders/[id]/page.tsx",
  "(app)/purchase-orders/[id]/print/page.tsx",
  "(app)/receiving/page.tsx",
  "(app)/receiving/[id]/page.tsx",
  "(app)/transfers/page.tsx",
  "(app)/transfers/[id]/page.tsx",
  "(app)/counts/page.tsx",
  "(app)/counts/[id]/page.tsx",
  "(app)/wastage/page.tsx",
  "(app)/wastage/[id]/page.tsx",
  "(app)/adjustments/page.tsx",
  "(app)/adjustments/[id]/page.tsx",
  "(app)/purchase-requests/page.tsx",
  "(app)/purchase-requests/[id]/page.tsx",
  "(app)/approvals/page.tsx",
  "(app)/approvals/[id]/page.tsx"
];

describe("route fallbacks", () => {
  test("keeps broad fallback redirects permission-aware", () => {
    for (const page of permissionAwareFallbackPages) {
      const source = readFileSync(path.join(appRoot, page), "utf8");

      expect(source, page).toContain("getDefaultAppRoute");
    }
  });
});
