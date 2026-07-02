import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { permissions } from "./authorization";
import type { SessionContext } from "./context";
import {
  projectTaskRegisterExportHeaders,
  safeProjectActivityExportSummary
} from "./projectReports";
import { canUseOperationalReports, listOperationalReports } from "./reports";

function sessionWithPermissions(permissionCodes: string[]): SessionContext {
  return {
    user: {
      id: "user-1",
      email: "user@example.test",
      displayName: "Report User",
      role: "Reporter"
    },
    context: {
      tenantId: "tenant-1",
      companyId: "company-1",
      companyName: "OGFI",
      brandId: "brand-1",
      brandName: "Demo Brand",
      locationId: "location-1",
      locationName: "Selected Branch",
      locationType: "BRANCH"
    },
    authorizedLocations: [],
    permissionCodes
  };
}

describe("operational report catalog", () => {
  it("hides the reporting hub when no source reports are permitted", () => {
    const session = sessionWithPermissions([]);

    expect(canUseOperationalReports(session)).toBe(false);
    expect(listOperationalReports(session)).toEqual([]);
  });

  it("returns only reports backed by permitted source modules", () => {
    const session = sessionWithPermissions([
      permissions.purchaseRequestCreate,
      permissions.receivingView,
      permissions.inventoryLedgerView
    ]);

    expect(listOperationalReports(session).map((report) => report.id)).toEqual([
      "purchase-request-register",
      "receiving-reports",
      "movement-ledger"
    ]);
  });

  it("marks approval aging as view-only and audit export as admin-controlled", () => {
    const session = sessionWithPermissions([
      permissions.purchaseRequestApprove,
      permissions.coreAdminister
    ]);

    expect(listOperationalReports(session)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "approval-aging",
          exportHref: null,
          status: "VIEW_ONLY"
        }),
        expect.objectContaining({
          id: "audit-trail",
          exportHref: "/admin/audit/export",
          status: "CSV_AVAILABLE"
        })
      ])
    );
  });

  it("exposes project exports only with project visibility", () => {
    const session = sessionWithPermissions([permissions.projectView]);

    expect(listOperationalReports(session)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project-health",
          group: "Projects",
          exportHref: "/projects/export",
          status: "CSV_AVAILABLE"
        }),
        expect.objectContaining({
          id: "project-task-register",
          group: "Projects",
          exportHref: "/projects/tasks/export",
          status: "CSV_AVAILABLE"
        }),
        expect.objectContaining({
          id: "project-activity-log",
          group: "Projects",
          exportHref: "/projects/activity/export",
          status: "CSV_AVAILABLE"
        }),
        expect.objectContaining({
          id: "project-linked-record-follow-up",
          group: "Projects",
          exportHref: "/projects/links/export",
          status: "CSV_AVAILABLE"
        })
      ])
    );
  });

  it("keeps project exports scoped without source details or sensitive task payloads", () => {
    const source = readFileSync(
      new URL("./projectReports.ts", import.meta.url),
      "utf8"
    );
    const generalProjectExports = source.slice(
      0,
      source.indexOf("export async function buildProjectLinkedRecordFollowUpExportRows")
    );

    expect(generalProjectExports).toContain("Linked Record Count");
    expect(generalProjectExports).toContain("buildProjectTaskRegisterExportRows");
    expect(generalProjectExports).toContain("buildProjectActivityLogExportRows");
    expect(generalProjectExports).toContain("Overdue");
    expect(generalProjectExports).toContain("Overdue Days");
    expect(generalProjectExports).toContain("projectTaskDueState");
    expect(generalProjectExports).toContain("Unsupported event for safe CSV");
    expect(generalProjectExports).toContain("Attachment Count");
    expect(generalProjectExports).toContain("Open Blocker Next Review");
    expect(generalProjectExports).toContain("nextBlockerReviewAt?.toISOString() ?? \"\"");
    expect(generalProjectExports).toContain("listAuthorizedProjectAccess(session)");
    expect(generalProjectExports).not.toContain("beforeData");
    expect(generalProjectExports).not.toContain("afterData");
    expect(generalProjectExports).not.toContain("sourceRecordId");
    expect(generalProjectExports).not.toContain("sourceRecordType");
    expect(generalProjectExports).not.toContain("taskAssignees");
    expect(generalProjectExports).not.toContain("blockerReason");
    expect(generalProjectExports).not.toContain("description:");
    expect(generalProjectExports).not.toContain("objectKey");
  });

  it("keeps project task register export metadata-only", () => {
    expect([...projectTaskRegisterExportHeaders]).toEqual([
      "Project Code",
      "Project Name",
      "Task Key",
      "Task Title",
      "Status",
      "Priority",
      "Owner",
      "Due Date",
      "Completed At",
      "Due State",
      "Overdue",
      "Overdue Days",
      "Blocked",
      "Checklist Total",
      "Checklist Completed",
      "Comment Count",
      "Attachment Count",
      "Open Blocker Count",
      "Open Blocker Next Review"
    ]);

    const forbiddenHeaders = [
      "Project ID",
      "Task ID",
      "Task Description",
      "Comment Body",
      "Attachment ID",
      "Object Key",
      "Source Record ID",
      "Source Record Type",
      "Blocker Reason",
      "Assignees"
    ];

    for (const forbiddenHeader of forbiddenHeaders) {
      expect(projectTaskRegisterExportHeaders).not.toContain(forbiddenHeader);
    }
  });

  it("adds a linked-record follow-up export with safe source redaction", () => {
    const source = readFileSync(
      new URL("./projectReports.ts", import.meta.url),
      "utf8"
    );
    const route = readFileSync(
      new URL("../../app/(app)/projects/links/export/route.ts", import.meta.url),
      "utf8"
    );

    expect(source).toContain("buildProjectLinkedRecordFollowUpExportRows");
    expect(source).toContain("resolveProjectRecordLinkSourceSummary");
    expect(source).toContain("assertSafeSourceSummary(summary)");
    expect(source).toContain('"project-linked-record-follow-up"');
    expect(source).toContain('"Linked record exists"');
    expect(source).toContain('summary.visible ? summary.sourceRecordType : "Restricted"');
    expect(source).toContain('summary.visible ? summary.href ?? "" : ""');
    expect(source).not.toContain("beforeData");
    expect(source).not.toContain("afterData");
    expect(source).not.toContain("objectKey");
    expect(route).toContain("buildProjectLinkedRecordFollowUpExportRows");
    expect(route).toContain("project-linked-record-follow-up.csv");
  });

  it("maps unknown project activity events to a redacted fail-closed summary", () => {
    expect(
      safeProjectActivityExportSummary({
        eventType: "project_record_link.created",
        entityType: "ProjectRecordLink"
      })
    ).toEqual({
      eventType: "project record link / created",
      entityType: "ProjectRecordLink",
      entityCategory: "LINK",
      changeSummary: "Source record link added",
      reasonCode: "NONE"
    });

    expect(
      safeProjectActivityExportSummary({
        eventType: "project_task.assigned",
        entityType: "ProjectTask"
      })
    ).toEqual({
      eventType: "project task / assigned",
      entityType: "ProjectTask",
      entityCategory: "TASK",
      changeSummary: "Task assigned",
      reasonCode: "NONE"
    });

    expect(
      safeProjectActivityExportSummary({
        eventType: "project_task.reassigned",
        entityType: "ProjectTask"
      })
    ).toEqual({
      eventType: "project task / reassigned",
      entityType: "ProjectTask",
      entityCategory: "TASK",
      changeSummary: "Task reassigned",
      reasonCode: "NONE"
    });

    expect(
      safeProjectActivityExportSummary({
        eventType: "project_blocker.resolved",
        entityType: "ProjectBlocker"
      })
    ).toEqual({
      eventType: "project blocker / resolved",
      entityType: "ProjectBlocker",
      entityCategory: "BLOCKER",
      changeSummary: "Blocker resolved",
      reasonCode: "NONE"
    });

    expect(
      safeProjectActivityExportSummary({
        eventType: "new_sensitive_event.created",
        entityType: "PurchaseOrder"
      })
    ).toEqual({
      eventType: "new sensitive event / created",
      entityType: "PurchaseOrder",
      entityCategory: "OTHER",
      changeSummary: "Unsupported event for safe CSV",
      reasonCode: "MAPPED_UNKNOWN"
    });
  });
});
