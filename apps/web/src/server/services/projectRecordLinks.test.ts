import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertSafeSourceSummary } from "./projectRecordLinks";

describe("project record link boundary controls", () => {
  test("redacted summaries cannot include source identifiers or metadata", () => {
    expect(() =>
      assertSafeSourceSummary({
        sourceRecordType: "PURCHASE_ORDER",
        visible: false,
        label: "Restricted linked record",
        sourceRecordId: "00000000-0000-4000-8000-000000000001"
      })
    ).toThrow("PROJECT_LINK_REDACTION_LEAK");

    expect(() =>
      assertSafeSourceSummary({
        sourceRecordType: "APPROVAL_INSTANCE",
        visible: false,
        label: "Restricted linked record",
        primaryDate: "2026-07-01"
      })
    ).toThrow("PROJECT_LINK_REDACTION_LEAK");

    expect(() =>
      assertSafeSourceSummary({
        sourceRecordType: "SUPPLIER",
        visible: false,
        label: "SUP-001"
      })
    ).toThrow("PROJECT_LINK_REDACTION_LABEL_INVALID");

    expect(() =>
      assertSafeSourceSummary({
        sourceRecordType: "GOODS_RECEIPT",
        visible: false,
        label: "Restricted linked record",
        redactionReason: "SOURCE_PERMISSION_DENIED"
      })
    ).not.toThrow();
  });

  test("project link service does not import operational mutation services", () => {
    const source = readFileSync(path.resolve(__dirname, "projectRecordLinks.ts"), "utf8");

    expect(source).not.toContain("submitPurchase");
    expect(source).not.toContain("approvePurchase");
    expect(source).not.toContain("postInventory");
    expect(source).not.toContain("postInventoryMovement");
    expect(source).not.toContain("receiveTransfer");
    expect(source).not.toContain("dispatchTransfer");
    expect(source).not.toContain("reverse");
    expect(source).not.toContain("./inventory");
  });

  test("approval instance links use native approval visibility guards", () => {
    const source = readFileSync(path.resolve(__dirname, "projectRecordLinks.ts"), "utf8");

    expect(source).toContain("isAssignedToPendingApprovalStep");
    expect(source).toContain("hasProjectLinkApprovalScope");
    expect(source).toContain("status: \"PENDING\"");
    expect(source).toContain("requesterUserId === session.user.id");
    expect(source).toContain("requestedByUserId === session.user.id");
    expect(source).toContain("reportedByUserId === session.user.id");
  });

  test("denied source-link attempts use bounded dimensions without target data", () => {
    const source = readFileSync(path.resolve(__dirname, "projectRecordLinks.ts"), "utf8");
    const writer = source.slice(
      source.indexOf("async function logProjectRecordLinkDenied"),
      source.indexOf("export function assertSafeSourceSummary")
    );
    const recorderInput = writer.slice(writer.indexOf("recordSessionDeniedDecisionSafely("));

    expect(source).toContain("logProjectRecordLinkDenied");
    expect(writer).toContain("recordSessionDeniedDecisionSafely");
    expect(source).not.toContain("getAuthorizationDenialWindowMinutes");
    expect(writer).not.toContain("auditEvent.create");
    expect(recorderInput).not.toContain("sourceRecordId:");
    expect(recorderInput).not.toContain("projectId:");
    expect(recorderInput).not.toContain("taskId:");
    expect(recorderInput).not.toContain("milestoneId:");
    expect(source).toContain('attemptedAction: "CREATE"');
    expect(source).toContain('attemptedAction: "READ"');
    expect(source).toContain("const firstDenied = summaries.find");
  });

  test("document references resolve to canonical authorized source records before storage", () => {
    const source = readFileSync(path.resolve(__dirname, "projectRecordLinks.ts"), "utf8");
    const siteDetailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/expansion/sites/[id]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("publicReference: sourceRecordId");
    expect(source).toContain("sourceRecordId: summary.sourceRecordId!");
    expect(siteDetailPage).toContain("Source document number");
    expect(siteDetailPage).not.toContain("Authorized source record UUID");
  });

  test("project record link schema never stores source payload snapshots", () => {
    const schema = readFileSync(
      path.resolve(__dirname, "../../../../../packages/database/prisma/schema.prisma"),
      "utf8"
    );
    const model = schema.slice(
      schema.indexOf("model ProjectRecordLink"),
      schema.indexOf("model ProjectRequirement")
    );

    expect(model).not.toContain("amount");
    expect(model).not.toContain("quantity");
    expect(model).not.toContain("statusSnapshot");
    expect(model).not.toContain("payload");
    expect(model).not.toContain("attachment");
  });

  test("operational adapter source types are constrained by migration", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260701053000_project_record_link_operational_adapters/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("'INVENTORY_MOVEMENT'");
    expect(migration).toContain("'APPROVAL_INSTANCE'");
    expect(migration).toContain("'WASTAGE_REPORT'");
    expect(migration).toContain("'STOCK_ADJUSTMENT'");
    expect(migration).toContain("DROP CONSTRAINT \"ProjectRecordLink_source_type_check\"");
  });

  test("inventory balance links use scoped read-only summaries", () => {
    const source = readFileSync(path.resolve(__dirname, "projectRecordLinks.ts"), "utf8");
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260701074000_project_record_link_inventory_balance/migration.sql"
      ),
      "utf8"
    );
    const taskPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/my-work/page.tsx"),
      "utf8"
    );

    expect(source).toContain('"INVENTORY_BALANCE"');
    expect(source).toContain("resolveInventoryBalanceSummary");
    expect(source).toContain("permissions.inventoryBalanceView");
    expect(source).toContain("prisma.inventoryBalance.findFirst");
    expect(source).toContain("locationId: session.context.locationId");
    expect(source).toContain("return restrictedSummary(\"INVENTORY_BALANCE\")");
    expect(source).toContain("record.item.itemName");
    expect(source).toContain("Number(record.qtyOnHand)");
    expect(source).not.toContain('status: "ON_HAND"');
    expect(source).not.toContain("postInventoryMovement");
    expect(migration).toContain("'INVENTORY_BALANCE'");
    expect(migration).toContain("DROP CONSTRAINT \"ProjectRecordLink_source_type_check\"");
    expect(taskPage).toContain('value="INVENTORY_BALANCE"');
  });
});
