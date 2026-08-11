import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8"
);

describe("DEC-0071 historical Food Cost notification presentation", () => {
  it("keeps historical rows listable and archivable with a non-mutating warning", () => {
    expect(source).toContain(
      'notification.notificationType === "FOOD_COST_EXCEPTION"'
    );
    expect(source).toContain("Historical Food Cost reminder");
    expect(source).toContain(
      "legacy definition that is not used for new"
    );
    expect(source).toContain(
      "does not change, resolve, or recalculate the"
    );
    expect(source).toContain("href={notification.deepLink}");
    expect(source).toContain("action={archiveAction}");
  });

  it("excludes historical Food Cost rows from the presentation-only action count", () => {
    expect(source).toContain(
      'notification.notificationType !== "FOOD_COST_EXCEPTION"'
    );
    expect(source).toContain("notifications.length");
    expect(source).toContain(
      '(notification) => notification.status === "UNREAD"'
    );
  });

  it("does not offer recipe-only Restaurant Ops reminder scanning", () => {
    expect(source).not.toContain("canUseRecipesAndCosting");
    expect(source).not.toContain("Manual scan for food-cost");
    expect(source).toContain("canUseBranchOperations(session.permissionCodes)");
  });

  it("uses 44px row actions and a responsive action layout", () => {
    expect(source).toContain('className="flex flex-col gap-2 sm:flex-row lg:flex-col"');
    expect(source).toContain('className="min-h-11 bg-slate-100');
    expect(source.match(/inline-flex min-h-11 w-full/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("keeps the Notification Center primary and consolidates manual scans", () => {
    expect(source).toContain(
      'import { SingleOpenSummaryList } from "@/components/SingleOpenSummaryList"'
    );
    expect(source.indexOf("Notification Center")).toBeLessThan(
      source.indexOf("Manual reminder scans")
    );
    expect(source).toContain('ariaLabel="Notification maintenance utilities"');
    expect(source).toContain('id: "manual-reminder-scans"');
    expect(source).toContain('label: "Available families"');
    expect(source).toContain('label: "Latest results"');
  });

  it("keeps each existing permission-gated scan in the expandable utility body", () => {
    expect(source).toContain("canRunProjectReminderScan ? (");
    expect(source).toContain("canRunApprovalReminderScan ? (");
    expect(source).toContain("canRunRestaurantOpsReminderScan ? (");
    expect(source).toContain("action={scanDeadlineRemindersAction}");
    expect(source).toContain("action={scanApprovalRemindersAction}");
    expect(source).toContain("action={scanRestaurantOpsRemindersAction}");
  });
});
