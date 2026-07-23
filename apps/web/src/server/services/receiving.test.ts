import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { permissions } from "./authorization";
import {
  assertGoodsReceiptCanBePosted,
  assertGoodsReceiptCanBeReversed,
  assertPurchaseOrderCanBeReceived,
  calculatePurchaseOrderReceivingStatus,
  buildReceivingReportExportRows,
  getReceivingDashboardRead,
  isReceivingFollowUp,
  listReceivingDashboardProfilePage,
  listGoodsReceiptPage,
  listReceivingMyTaskPage,
  receivingDashboardProfileHref,
  receivingDashboardProfileWhere,
  receivingFollowUpInclusionReason,
  resolveReceivingDashboardProfile,
  validateReceivingQuantities
} from "./receiving";

const mockPrisma = vi.hoisted(() => ({
  goodsReceipt: { count: vi.fn(), findMany: vi.fn() },
  userRoleAssignment: { findMany: vi.fn() }
}));

vi.mock("@ogfi/database", () => ({ prisma: mockPrisma }));

const dashboardSession = {
  user: {
    id: "00000000-0000-4000-8000-000000000005",
    email: "receiver@example.test",
    displayName: "Receiver",
    role: "Receiver"
  },
  context: {
    tenantId: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000002",
    companyName: "OGFI Foods",
    brandId: "00000000-0000-4000-8000-000000000003",
    brandName: "OGFI",
    locationId: "00000000-0000-4000-8000-000000000004",
    locationName: "BGC",
    locationType: "BRANCH" as const
  },
  authorizedLocations: [],
  permissionCodes: [permissions.receivingView]
};

describe("receiving foundation rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.userRoleAssignment.findMany.mockResolvedValue([]);
  });

  test("service read gate allows every receiving action permission", () => {
    const source = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");

    expect(source).toContain("canUseReceiving(session.permissionCodes)");
    expect(source).toContain("receivingReverse");
  });

  test("ordinary register is server-paged with scoped tab predicates and stable ordering", async () => {
    mockPrisma.goodsReceipt.count.mockResolvedValue(25);
    mockPrisma.goodsReceipt.findMany.mockResolvedValue([]);
    const result = await listGoodsReceiptPage(dashboardSession as never, {
      tab: "discrepancies",
      page: 99,
      pageSize: 1000
    });
    expect(result.pageSize).toBe(50);
    expect(result.page).toBe(1);
    expect(mockPrisma.goodsReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 50,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: expect.objectContaining({
          tenantId: dashboardSession.context.tenantId,
          companyId: dashboardSession.context.companyId,
          receivingLocationId: dashboardSession.context.locationId,
          discrepancyFlag: true
        })
      })
    );
    const pageSource = readFileSync(path.resolve(__dirname, "../../app/(app)/receiving/page.tsx"), "utf8");
    expect(pageSource).toContain("listGoodsReceiptPage");
    expect(pageSource).toContain("totalItems={registerPage?.totalItems ?? 0}");
    expect(pageSource).not.toContain("visibleReceipts.slice(");
  });

  test("ordinary register query searches GRN, PO, and supplier without widening scope", async () => {
    mockPrisma.goodsReceipt.count.mockResolvedValue(0);
    mockPrisma.goodsReceipt.findMany.mockResolvedValue([]);
    await listGoodsReceiptPage(dashboardSession as never, { query: "Fresh", page: 1 });
    expect(mockPrisma.goodsReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: dashboardSession.context.tenantId,
          companyId: dashboardSession.context.companyId,
          receivingLocationId: dashboardSession.context.locationId,
          OR: expect.arrayContaining([
            expect.objectContaining({ publicReference: expect.any(Object) }),
            expect.objectContaining({ purchaseOrder: expect.any(Object) }),
            expect.objectContaining({ supplier: expect.any(Object) })
          ])
        })
      })
    );
  });

  test("dashboard read authorizes and queries only scoped, bounded receipt candidates", async () => {
    mockPrisma.goodsReceipt.count.mockResolvedValue(2);
    mockPrisma.goodsReceipt.findMany.mockResolvedValue([
      {
        id: "receipt-1",
        publicReference: "RR-2026-00001",
        status: "POSTED_WITH_DISCREPANCY",
        discrepancyFlag: false,
        receivedAt: new Date("2026-07-20T00:00:00.000Z"),
        supplier: { tradingName: "Fresh Foods", legalName: "Fresh Foods Inc." },
        purchaseOrder: { publicReference: "PO-2026-00001" }
      }
    ]);

    await expect(getReceivingDashboardRead(dashboardSession as never)).resolves.toEqual({
      followUpCount: 2,
      taskCandidates: [
        expect.objectContaining({
          supplierName: "Fresh Foods",
          purchaseOrderReference: "PO-2026-00001",
          inclusionReason: "Discrepancy recorded"
        })
      ]
    });
    expect(mockPrisma.goodsReceipt.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: dashboardSession.context.tenantId,
        companyId: dashboardSession.context.companyId,
        receivingLocationId: dashboardSession.context.locationId
      })
    });
    expect(mockPrisma.goodsReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              discrepancyFlag: false,
              status: { in: ["DRAFT", "POSTING"] }
            },
            { status: "POSTED_WITH_DISCREPANCY" },
            {
              discrepancyFlag: true,
              status: {
                in: [
                  "DRAFT",
                  "POSTING",
                  "POSTED",
                  "POSTED_WITH_DISCREPANCY",
                  "REVERSING"
                ]
              }
            }
          ]
        }),
        take: 8,
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        select: expect.not.objectContaining({ lines: expect.anything() })
      })
    );
  });

  test("resolves only the closed Receiving Follow-up profile and exact allow-list", () => {
    expect(resolveReceivingDashboardProfile("receiving-follow-up-v1")).toBe(
      "receiving-follow-up-v1"
    );
    expect(resolveReceivingDashboardProfile("all")).toBeNull();
    expect(resolveReceivingDashboardProfile("receiving-follow-up-v1&status=REVERSED")).toBeNull();
    expect(receivingDashboardProfileHref("receiving-follow-up-v1", {
      page: 2,
      query: "RR-25"
    })).toBe("/receiving?dashboard=receiving-follow-up-v1&q=RR-25&page=2");
    expect(receivingDashboardProfileWhere(
      dashboardSession as never,
      "receiving-follow-up-v1"
    )).toEqual({
      tenantId: dashboardSession.context.tenantId,
      companyId: dashboardSession.context.companyId,
      receivingLocationId: dashboardSession.context.locationId,
      OR: [
        { discrepancyFlag: false, status: { in: ["DRAFT", "POSTING"] } },
        { status: "POSTED_WITH_DISCREPANCY" },
        {
          discrepancyFlag: true,
          status: {
            in: [
              "DRAFT",
              "POSTING",
              "POSTED",
              "POSTED_WITH_DISCREPANCY",
              "REVERSING"
            ]
          }
        }
      ]
    });
    expect(receivingFollowUpInclusionReason({
      status: "POSTED",
      discrepancyFlag: true
    })).toBe("Discrepancy recorded");
    expect(receivingFollowUpInclusionReason({
      status: "DRAFT",
      discrepancyFlag: false
    })).toBe("Unposted draft");
    expect(receivingFollowUpInclusionReason({
      status: "REVERSING",
      discrepancyFlag: true
    })).toBe("Reversal in progress");
    expect(receivingFollowUpInclusionReason({
      status: "POSTING",
      discrepancyFlag: false
    })).toBe("Posting in progress");
  });

  test("fails closed across every current and future status/flag combination", () => {
    const included = new Set([
      "DRAFT:false",
      "DRAFT:true",
      "POSTING:false",
      "POSTING:true",
      "POSTED:true",
      "POSTED_WITH_DISCREPANCY:false",
      "POSTED_WITH_DISCREPANCY:true",
      "REVERSING:true"
    ]);
    for (const status of [
      "DRAFT",
      "POSTING",
      "POSTED",
      "POSTED_WITH_DISCREPANCY",
      "REVERSING",
      "REVERSED",
      "CANCELLED",
      "REJECTED",
      "FUTURE_STATUS"
    ]) {
      for (const discrepancyFlag of [false, true]) {
        expect(
          isReceivingFollowUp({ status, discrepancyFlag }),
          `${status}:${discrepancyFlag}`
        ).toBe(included.has(`${status}:${discrepancyFlag}`));
      }
    }
  });

  test("profile page applies additive search and deterministic server pagination", async () => {
    mockPrisma.goodsReceipt.count.mockResolvedValue(26);
    mockPrisma.goodsReceipt.findMany.mockResolvedValue([{
      id: "receipt-26",
      publicReference: "RR-2026-00026",
      status: "POSTED",
      discrepancyFlag: true,
      receivedAt: new Date("2026-07-22T00:00:00.000Z"),
      createdAt: new Date("2026-07-21T00:00:00.000Z"),
      supplier: { tradingName: "Fresh Foods", legalName: "Fresh Foods Inc." },
      purchaseOrder: { publicReference: "PO-2026-00026" },
      receivingLocation: { name: "BGC" }
    }]);

    await expect(listReceivingDashboardProfilePage(
      dashboardSession as never,
      "receiving-follow-up-v1",
      { page: 99, query: "  fresh  " }
    )).resolves.toEqual({
      items: [expect.objectContaining({
        id: "receipt-26",
        inclusionReason: "Discrepancy recorded",
        supplierName: "Fresh Foods",
        receivingLocationName: "BGC"
      })],
      totalItems: 26,
      page: 2,
      pageSize: 25,
      query: "fresh"
    });
    const countWhere = mockPrisma.goodsReceipt.count.mock.calls[0]?.[0]?.where;
    expect(countWhere).toMatchObject({
      tenantId: dashboardSession.context.tenantId,
      companyId: dashboardSession.context.companyId,
      receivingLocationId: dashboardSession.context.locationId,
      OR: expect.any(Array),
      AND: [expect.objectContaining({ OR: expect.any(Array) })]
    });
    expect(mockPrisma.goodsReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: countWhere,
        select: expect.not.objectContaining({ lines: expect.anything() }),
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        skip: 25,
        take: 25
      })
    );
  });

  test("profile export reuses the locked predicate and ignores unsupported raw filters", async () => {
    mockPrisma.goodsReceipt.findMany.mockResolvedValue([]);
    const rows = await buildReceivingReportExportRows(
      dashboardSession as never,
      "receiving-follow-up-v1",
      "PO-2026"
    );
    expect(mockPrisma.goodsReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: dashboardSession.context.tenantId,
          companyId: dashboardSession.context.companyId,
          receivingLocationId: dashboardSession.context.locationId,
          OR: expect.any(Array),
          AND: [expect.objectContaining({ OR: expect.any(Array) })]
        }),
        select: expect.not.objectContaining({
          lines: expect.anything(),
          receivedBy: expect.anything(),
          reversedBy: expect.anything()
        }),
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }]
      })
    );
    expect(rows[0]).toEqual([
      "Reference",
      "Status",
      "Follow-up Reason",
      "Supplier",
      "Purchase Order",
      "Receiving Location",
      "Received At",
      "Created At"
    ]);
  });

  test("dashboard read rejects callers without receiving access before querying", async () => {
    await expect(
      getReceivingDashboardRead({ ...dashboardSession, permissionCodes: [] } as never)
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(mockPrisma.goodsReceipt.count).not.toHaveBeenCalled();
  });

  test("returns only postable scoped draft receipts through the My Tasks contract", async () => {
    mockPrisma.goodsReceipt.count.mockResolvedValue(2);
    mockPrisma.goodsReceipt.findMany.mockResolvedValue([
      {
        id: "receipt-1",
        publicReference: "RR-2026-00001",
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
        supplier: { tradingName: "Fresh Foods", legalName: "Fresh Foods Inc." },
        purchaseOrder: { publicReference: "PO-2026-00001" },
        receivingLocation: { name: "BGC" }
      },
      {
        id: "receipt-2",
        publicReference: "RR-2026-00002",
        createdAt: new Date("2026-07-21T00:00:00.000Z"),
        supplier: { tradingName: null, legalName: "Fresh Foods Inc." },
        purchaseOrder: { publicReference: "PO-2026-00002" },
        receivingLocation: { name: "BGC" }
      }
    ]);

    await expect(
      listReceivingMyTaskPage(
        {
          ...dashboardSession,
          permissionCodes: [permissions.receivingPost]
        } as never,
        { take: 1 }
      )
    ).resolves.toEqual({
      totalCount: 2,
      items: [
        expect.objectContaining({
          taskId: "receiving-receipt-1",
          recordId: "receipt-1",
          actionLabel: "Post receipt"
        })
      ],
      nextCursor: {
        createdAt: "2026-07-20T00:00:00.000Z",
        sourceType: "RECEIVING",
        recordId: "receipt-1"
      }
    });
    expect(mockPrisma.goodsReceipt.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: dashboardSession.context.tenantId,
        companyId: dashboardSession.context.companyId,
        receivingLocationId: dashboardSession.context.locationId,
        status: "DRAFT"
      })
    });
  });

  test("receiving detail PO link uses the shared purchase-order read helper", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/[id]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("canReadPurchaseOrders");
    expect(source).toContain(
      "const canAccessPurchaseOrders = canReadPurchaseOrders(session.permissionCodes);"
    );
    expect(source).toContain("{canAccessPurchaseOrders ? (");
    expect(source).toContain("View Purchase Order");
  });

  test("allows receiving only from issued or partially received POs", () => {
    expect(() => assertPurchaseOrderCanBeReceived("ISSUED")).not.toThrow();
    expect(() => assertPurchaseOrderCanBeReceived("PARTIALLY_RECEIVED")).not.toThrow();
    expect(() => assertPurchaseOrderCanBeReceived("APPROVED")).toThrow(
      "PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING"
    );
    expect(() => assertPurchaseOrderCanBeReceived("CANCELLED")).toThrow(
      "PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING"
    );
    expect(() => assertPurchaseOrderCanBeReceived("CLOSED")).toThrow(
      "PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING"
    );
  });

  test("posts draft receipts only", () => {
    expect(() => assertGoodsReceiptCanBePosted("DRAFT")).not.toThrow();
    expect(() => assertGoodsReceiptCanBePosted("POSTED")).toThrow(
      "GOODS_RECEIPT_NOT_DRAFT_FOR_POSTING"
    );
  });

  test("reverses only posted unreversed receipts", () => {
    expect(() => assertGoodsReceiptCanBeReversed("POSTED", null)).not.toThrow();
    expect(() =>
      assertGoodsReceiptCanBeReversed("POSTED_WITH_DISCREPANCY", null)
    ).not.toThrow();
    expect(() => assertGoodsReceiptCanBeReversed("DRAFT", null)).toThrow(
      "GOODS_RECEIPT_NOT_POSTED_FOR_REVERSAL"
    );
    expect(() => assertGoodsReceiptCanBeReversed("REVERSED", new Date())).toThrow(
      "GOODS_RECEIPT_ALREADY_REVERSED"
    );
  });

  test("recalculates Purchase Order receiving status from restored quantities", () => {
    expect(
      calculatePurchaseOrderReceivingStatus([
        { orderedQty: 10, receivedQty: 0, cancelledQty: 0 }
      ])
    ).toBe("ISSUED");
    expect(
      calculatePurchaseOrderReceivingStatus([
        { orderedQty: 10, receivedQty: 5, cancelledQty: 0 }
      ])
    ).toBe("PARTIALLY_RECEIVED");
    expect(
      calculatePurchaseOrderReceivingStatus([
        { orderedQty: 10, receivedQty: 7, cancelledQty: 3 }
      ])
    ).toBe("FULLY_RECEIVED");
  });

  test("validates accepted, rejected, damaged, and short quantities", () => {
    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 10,
        acceptedQty: 8,
        rejectedQty: 2,
        damagedQty: 0,
        shortQty: 0,
        discrepancyReason: "Two packs rejected",
        evidenceReference: "photo-001"
      })
    ).not.toThrow();

    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 10,
        acceptedQty: 9,
        rejectedQty: 2,
        damagedQty: 0,
        shortQty: 0
      })
    ).toThrow("RECEIVING_LINE_OUTCOME_EXCEEDS_DELIVERED");

    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 8,
        acceptedQty: 8,
        rejectedQty: 0,
        damagedQty: 0,
        shortQty: 2
      })
    ).toThrow("RECEIVING_DISCREPANCY_REASON_REQUIRED");

    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 8,
        acceptedQty: 8,
        rejectedQty: 0,
        damagedQty: 0,
        shortQty: 2,
        discrepancyReason: "Supplier delivered short"
      })
    ).toThrow("RECEIVING_DISCREPANCY_EVIDENCE_REQUIRED");

    expect(() =>
      validateReceivingQuantities({
        deliveredQty: 11,
        acceptedQty: 11,
        rejectedQty: 0,
        damagedQty: 0,
        shortQty: 0,
        outstandingQty: 10
      })
    ).toThrow("RECEIVING_LINE_EXCEEDS_OUTSTANDING");
  });

  test("receipt reversal is a permissioned, source-linked ledger action", () => {
    const source = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");
    const detailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/[id]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("reverseGoodsReceipt");
    expect(source).toContain("permissions.receivingReverse");
    expect(source).toContain("GOODS_RECEIPT_SELF_REVERSAL_NOT_ALLOWED");
    expect(source).toContain('movementType: "REVERSAL"');
    expect(source).toContain('sourceEventKey: `reversed:${line.id}`');
    expect(source).toContain("reversalOfMovementId: original.id");
    expect(source).toContain('status: { in: ["DRAFT", "POSTING", "REVERSING"] }');
    expect(source).toContain('eventType: "goods_receipt.reversed"');
    expect(detailPage).toContain("Reverse Receipt");
    expect(detailPage).toContain("reverseGoodsReceipt");
  });

  test("receipt reversal migration hardens status and movement links", () => {
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260630233000_goods_receipt_reversal/migration.sql"
      ),
      "utf8"
    );

    expect(migration).toContain('"reversedByUserId" UUID');
    expect(migration).toContain('"reversedAt" TIMESTAMP(3)');
    expect(migration).toContain('"reversalReason" TEXT');
    expect(migration).toContain("'REVERSING'");
    expect(migration).toContain("'REVERSED'");
    expect(migration).toContain('"GoodsReceipt_reversed_fields_check"');
    expect(migration).toContain('"GoodsReceiptLine_postedMovementId_key"');
    expect(migration).toContain('"GoodsReceiptLine_postedMovementId_fkey"');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
  });

  test("receiving discrepancy evidence is stored and shown for damaged rejected or short lines", () => {
    const service = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");
    const page = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/page.tsx"),
      "utf8"
    );
    const editor = readFileSync(
      path.resolve(__dirname, "../../components/GoodsReceiptLinesEditor.tsx"),
      "utf8"
    );
    const detailPage = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/[id]/page.tsx"),
      "utf8"
    );
    const migration = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../packages/database/prisma/migrations/20260701073000_goods_receipt_discrepancy_evidence/migration.sql"
      ),
      "utf8"
    );

    expect(service).toContain("RECEIVING_DISCREPANCY_EVIDENCE_REQUIRED");
    expect(service).toContain("evidenceReference");
    expect(page).toContain("<GoodsReceiptLinesEditor");
    expect(editor).toContain("Discrepancy evidence reference");
    expect(detailPage).toContain("Evidence:");
    expect(migration).toContain('ADD COLUMN "evidenceReference" TEXT');
  });

  test("receiving export includes line-level discrepancy evidence references", () => {
    const service = readFileSync(path.resolve(__dirname, "receiving.ts"), "utf8");
    const route = readFileSync(
      path.resolve(__dirname, "../../app/(app)/receiving/export/route.ts"),
      "utf8"
    );

    expect(service).toContain("buildReceivingReportExportRows");
    expect(service).toContain("Evidence Reference");
    expect(service).toContain("Discrepancy Reason");
    expect(service).toContain("Posted Movement");
    expect(route).toContain("resolveReceivingDashboardProfile");
    expect(route).toContain("RECEIVING_DASHBOARD_PROFILE_UNSUPPORTED");
    expect(route).toContain("profile ? \"receiving-follow-up.csv\"");
    expect(route).toContain("canExportReceivingReports(session)");
    expect(route).toContain('eventType: "report.export_started"');
    expect(route).toContain('eventType: "report.export_completed"');
    expect(route).toContain("buildReportCsvMetadata");
    expect(route).toContain("logOperationalExportFailure");
    expect(route).not.toContain("postInventoryMovementInTransaction");
    expect(route).not.toContain("goodsReceipt.update");
  });
});
