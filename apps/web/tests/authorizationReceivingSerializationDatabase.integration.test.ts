import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "../src/server/services/context";
import {
  assertDisposableAuthorizationDatabaseConfigured,
  assertDisposableAuthorizationDatabaseMarker,
} from "./authorizationDatabaseSafety";

const mockContext = vi.hoisted(() => ({
  requireSessionContext: vi.fn()
}));

vi.mock("../src/server/services/context", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/context")
  >("../src/server/services/context");
  return {
    ...actual,
    requireSessionContext: mockContext.requireSessionContext
  };
});

vi.mock("../src/server/services/authorization", async () => {
  const actual = await vi.importActual<
    typeof import("../src/server/services/authorization")
  >("../src/server/services/authorization");
  return {
    ...actual,
    requirePermission: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock("../src/server/services/privilegedMfaGuard", () => ({
  assertPrivilegedMfaForAction: vi.fn().mockResolvedValue(undefined)
}));

const databaseEnabled =
  process.env.AUTHORIZATION_DATABASE_INTEGRATION === "yes";

describe.skipIf(!databaseEnabled)(
  "receiving serialization against disposable PostgreSQL",
  () => {
    let prisma: PrismaClient;
    let expectedDatabase: string;

    beforeAll(async () => {
      expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(
        process.env
      );
      ({ prisma } = await import("@ogfi/database"));
      await prisma.$connect();
      await assertDisposableAuthorizationDatabaseMarker(prisma, process.env);
      const identity = await prisma.$queryRaw<
        Array<{ currentDatabase: string }>
      >`SELECT current_database() AS "currentDatabase"`;
      if (identity[0]?.currentDatabase !== expectedDatabase) {
        throw new Error("RECEIVING_SERIALIZATION_DATABASE_IDENTITY_MISMATCH");
      }
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it("serializes receiving against authority revocation, concurrent drafts, and PO closure", async () => {
      const suffix = randomUUID().slice(0, 8);
      const fixtureIds = {
        tenant: randomUUID(),
        company: randomUUID(),
        location: randomUUID(),
        inventoryLocation: randomUUID(),
        user: randomUUID(),
        reverseUser: randomUUID(),
        role: randomUUID(),
        uom: randomUUID(),
        category: randomUUID(),
        item: randomUUID(),
        supplier: randomUUID(),
        purchaseRequest: randomUUID(),
        purchaseRequestLine: randomUUID(),
        quotationRequest: randomUUID(),
        supplierQuotation: randomUUID(),
        supplierQuotationLine: randomUUID(),
        recommendation: randomUUID(),
        purchaseOrder: randomUUID(),
        purchaseOrderLine: randomUUID()
      };
      const fixture = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            id: fixtureIds.tenant,
            name: `Receiving Serialization Tenant ${suffix}`,
            loginCode: `recv-ser-${suffix}`
          }
        });
        const company = await tx.company.create({
          data: {
            id: fixtureIds.company,
            tenantId: tenant.id,
            code: `RS-${suffix}`,
            legalName: `Receiving Serialization Company ${suffix}`,
            currencyCode: "PHP"
          }
        });
        const deliveryLocation = await tx.location.create({
          data: {
            id: fixtureIds.location,
            tenantId: tenant.id,
            companyId: company.id,
            locationType: "BRANCH",
            code: `RS-LOC-${suffix}`,
            name: `Receiving Serialization Branch ${suffix}`
          }
        });
        await tx.inventoryLocation.create({
          data: {
            id: fixtureIds.inventoryLocation,
            tenantId: tenant.id,
            companyId: company.id,
            locationId: deliveryLocation.id,
            code: `RS-INV-${suffix}`,
            name: `Receiving Serialization Store ${suffix}`
          }
        });
        const user = await tx.user.create({
          data: {
            id: fixtureIds.user,
            tenantId: tenant.id,
            email: `receiving-serialization-${suffix}@example.test`,
            displayName: `Receiving Serialization User ${suffix}`
          }
        });
        const reverseUser = await tx.user.create({
          data: {
            id: fixtureIds.reverseUser,
            tenantId: tenant.id,
            email: `receiving-reversal-${suffix}@example.test`,
            displayName: `Receiving Reversal User ${suffix}`
          }
        });
        const receiptPermissions = await tx.permission.findMany({
          where: {
            code: {
              in: [
                "inventory.receiving.create",
                "inventory.receiving.post",
                "inventory.receiving.reverse"
              ]
            }
          },
          select: { id: true }
        });
        if (receiptPermissions.length !== 3) {
          throw new Error("RECEIVING_SERIALIZATION_PERMISSION_FIXTURE_MISSING");
        }
        const role = await tx.role.create({
          data: {
            id: fixtureIds.role,
            tenantId: tenant.id,
            code: `RS-ROLE-${suffix}`,
            name: `Receiving Serialization Role ${suffix}`,
            permissions: {
              create: receiptPermissions.map((permission) => ({
                permission: { connect: { id: permission.id } }
              }))
            }
          }
        });
        await tx.userRoleAssignment.createMany({
          data: [
            { userId: user.id, roleId: role.id },
            { userId: reverseUser.id, roleId: role.id }
          ]
        });
        await tx.userScopeAssignment.createMany({
          data: [
            {
              userId: user.id,
              scopeType: "LOCATION",
              scopeId: deliveryLocation.id,
              accessLevel: "MANAGE"
            },
            {
              userId: reverseUser.id,
              scopeType: "LOCATION",
              scopeId: deliveryLocation.id,
              accessLevel: "MANAGE"
            }
          ]
        });
        const uom = await tx.uom.create({
          data: {
            id: fixtureIds.uom,
            tenantId: tenant.id,
            companyId: company.id,
            uomCode: `EA-${suffix}`,
            uomName: "Each",
            uomType: "COUNT"
          }
        });
        const category = await tx.itemCategory.create({
          data: {
            id: fixtureIds.category,
            tenantId: tenant.id,
            companyId: company.id,
            categoryCode: `RS-CAT-${suffix}`,
            categoryName: "Receiving Serialization Items",
            inventoryClass: "STOCK"
          }
        });
        const item = await tx.item.create({
          data: {
            id: fixtureIds.item,
            tenantId: tenant.id,
            companyId: company.id,
            itemCode: `RS-ITEM-${suffix}`,
            itemName: "Receiving Serialization Item",
            itemCategoryId: category.id,
            itemType: "INVENTORY",
            baseUomId: uom.id,
            purchaseUomId: uom.id,
            issueUomId: uom.id,
            trackInventory: true
          }
        });
        const supplier = await tx.supplier.create({
          data: {
            id: fixtureIds.supplier,
            tenantId: tenant.id,
            companyId: company.id,
            supplierCode: `RS-SUP-${suffix}`,
            legalName: `Receiving Serialization Supplier ${suffix}`,
            accreditationStatus: "APPROVED"
          }
        });
        const purchaseRequest = await tx.purchaseRequest.create({
          data: {
            id: fixtureIds.purchaseRequest,
            publicReference: `RS-PR-${suffix}`,
            tenantId: tenant.id,
            companyId: company.id,
            requestLocationId: deliveryLocation.id,
            requesterUserId: user.id,
            requiredDate: new Date("2026-07-30T00:00:00.000Z"),
            urgency: "NORMAL",
            justification: "Disposable receiving serialization test",
            status: "APPROVED"
          }
        });
        const purchaseRequestLine = await tx.purchaseRequestLine.create({
          data: {
            id: fixtureIds.purchaseRequestLine,
            purchaseRequestId: purchaseRequest.id,
            itemId: item.id,
            uomId: uom.id,
            lineNumber: 1,
            description: item.itemName,
            requestedQty: 10,
            estimatedUnitCost: 5,
            estimatedLineTotal: 50,
            uomCode: uom.uomCode,
            purpose: "Serialization verification"
          }
        });
        const quotationRequest = await tx.quotationRequest.create({
          data: {
            id: fixtureIds.quotationRequest,
            tenantId: tenant.id,
            companyId: company.id,
            publicReference: `RS-RFQ-${suffix}`,
            purchaseRequestId: purchaseRequest.id,
            status: "CLOSED",
            requiredDate: purchaseRequest.requiredDate,
            createdByUserId: user.id
          }
        });
        const supplierQuotation = await tx.supplierQuotation.create({
          data: {
            id: fixtureIds.supplierQuotation,
            quotationRequestId: quotationRequest.id,
            tenantId: tenant.id,
            companyId: company.id,
            supplierId: supplier.id,
            quoteReference: `RS-QUOTE-${suffix}`,
            quoteDate: new Date("2026-07-21T00:00:00.000Z"),
            currencyCode: "PHP",
            totalAmount: 50,
            status: "RECORDED"
          }
        });
        const supplierQuotationLine = await tx.supplierQuotationLine.create({
          data: {
            id: fixtureIds.supplierQuotationLine,
            supplierQuotationId: supplierQuotation.id,
            sourcePrLineId: purchaseRequestLine.id,
            itemId: item.id,
            quantity: 10,
            uomId: uom.id,
            unitPrice: 5,
            lineTotal: 50,
            availabilityStatus: "AVAILABLE"
          }
        });
        const recommendation = await tx.quotationRecommendation.create({
          data: {
            id: fixtureIds.recommendation,
            tenantId: tenant.id,
            companyId: company.id,
            quotationRequestId: quotationRequest.id,
            selectedSupplierQuotationId: supplierQuotation.id,
            preparedByUserId: user.id,
            status: "APPROVED",
            currencyCode: "PHP",
            selectedEvaluatedTotal: 50,
            lowestEvaluatedTotal: 50,
            quoteCount: 1,
            isLowestEvaluatedCost: true,
            selectionReason: "Disposable serialization test",
            singleSourceJustification: "Disposable test fixture",
            evaluationSnapshot: { disposableTest: true },
            submittedAt: new Date("2026-07-21T00:00:00.000Z"),
            approvedAt: new Date("2026-07-21T00:01:00.000Z")
          }
        });
        const order = await tx.purchaseOrder.create({
          data: {
            id: fixtureIds.purchaseOrder,
            tenantId: tenant.id,
            companyId: company.id,
            publicReference: `RS-PO-${suffix}`,
            purchaseRequestId: purchaseRequest.id,
            quotationRequestId: quotationRequest.id,
            quotationRecommendationId: recommendation.id,
            selectedSupplierQuotationId: supplierQuotation.id,
            supplierId: supplier.id,
            deliveryLocationId: deliveryLocation.id,
            currencyCode: "PHP",
            subtotalAmount: 50,
            totalAmount: 50,
            expectedDeliveryDate: new Date("2026-07-22T00:00:00.000Z"),
            status: "PARTIALLY_RECEIVED",
            sourceSnapshot: { disposableTest: true },
            createdByUserId: user.id,
            lines: {
              create: {
                id: fixtureIds.purchaseOrderLine,
                tenantId: tenant.id,
                companyId: company.id,
                sourcePrLineId: purchaseRequestLine.id,
                sourceSupplierQuoteLineId: supplierQuotationLine.id,
                itemId: item.id,
                uomId: uom.id,
                lineNumber: 1,
                description: item.itemName,
                orderedQty: 10,
                receivedQty: 1,
                unitPrice: 5,
                lineTotal: 50
              }
            }
          },
          include: {
            company: true,
            deliveryLocation: true,
            lines: {
              orderBy: [{ lineNumber: "asc" }, { id: "asc" }],
              include: { item: true, uom: true }
            }
          }
        });
        return { order, user, reverseUser };
      });
      const { order, user, reverseUser } = fixture;

      const session: SessionContext = {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: "Receiving serialization tester"
        },
        context: {
          tenantId: order.tenantId,
          companyId: order.companyId,
          companyName: order.company.legalName,
          brandId: order.brandId ?? "",
          brandName: order.brandId ? "Selected brand" : "Company-wide",
          locationId: order.deliveryLocationId,
          locationName: order.deliveryLocation.name,
          locationType: order.deliveryLocation.locationType
        },
        authorizedLocations: [
          {
            tenantId: order.tenantId,
            companyId: order.companyId,
            companyName: order.company.legalName,
            brandId: order.brandId ?? "",
            brandName: order.brandId ? "Selected brand" : "Company-wide",
            locationId: order.deliveryLocationId,
            locationName: order.deliveryLocation.name,
            locationType: order.deliveryLocation.locationType,
            scopeAssignmentId: `receiving-serialization-${randomUUID()}`,
            accessLevel: "MANAGE"
          }
        ],
        permissionCodes: [
          "inventory.receiving.create",
          "inventory.receiving.post"
        ]
      };

      const createForm = new FormData();
      createForm.set("purchaseOrderId", order.id);
      createForm.set(
        "supplierDeliveryReceiptNumber",
        `SERIALIZATION-${process.env.AUTHORIZATION_TEST_RUN_ID}-${randomUUID()}`
      );
      for (const line of order.lines) {
        if (!line.itemId || !line.item?.trackInventory) {
          continue;
        }
        const outstandingQty =
          Number(line.orderedQty) -
          Number(line.receivedQty) -
          Number(line.cancelledQty);
        if (outstandingQty <= 0) {
          continue;
        }
        createForm.set(
          `line.${line.id}.deliveredQty`,
          "1"
        );
        createForm.set(
          `line.${line.id}.acceptedQty`,
          "1"
        );
        createForm.set(`line.${line.id}.rejectedQty`, "0");
        createForm.set(`line.${line.id}.damagedQty`, "0");
        createForm.set(
          `line.${line.id}.discrepancyReason`,
          "Supplier delivered a partial quantity"
        );
        createForm.set(
          `line.${line.id}.evidenceReference`,
          `partial-delivery-${suffix}`
        );
      }

      const {
        createGoodsReceiptFromPurchaseOrder,
        postGoodsReceipt,
        reverseGoodsReceipt
      } = await import("../src/server/services/receiving");
      const authSession = await prisma.authSession.create({
        data: {
          tenantId: order.tenantId,
          userId: user.id,
          tokenHash: `receiving-create-${suffix}-${randomUUID()}`,
          status: "ACTIVE",
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: new Date(),
          privilegeEpochAtIssue: user.privilegeEpoch,
          idleExpiresAt: new Date(Date.now() + 30 * 60_000),
          absoluteExpiresAt: new Date(Date.now() + 60 * 60_000)
        }
      });
      const authenticatedSession: SessionContext = {
        ...session,
        authentication: {
          sessionId: authSession.id,
          assuranceLevel: "MFA",
          mfaAuthenticatedAt: authSession.mfaAuthenticatedAt,
          absoluteExpiresAt: authSession.absoluteExpiresAt
        }
      };
      const previousAuthMode = process.env.AUTH_MODE;
      process.env.AUTH_MODE = "local";
      mockContext.requireSessionContext.mockResolvedValue(authenticatedSession);

      let releaseCreateLock = () => undefined;
      const createGate = new Promise<void>((resolve) => {
        releaseCreateLock = resolve;
      });
      let confirmCreateLock = () => undefined;
      const createLocked = new Promise<void>((resolve) => {
        confirmCreateLock = resolve;
      });
      try {
        const heldCreateLock = prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT po.id
              FROM "PurchaseOrder" po
             WHERE po.id = ${order.id}::uuid
             FOR UPDATE OF po
          `;
          confirmCreateLock();
          await createGate;
        });
        await createLocked;
        let createSettled = false;
        const createOutcome = createGoodsReceiptFromPurchaseOrder(createForm).then(
          (value) => {
            createSettled = true;
            return { value, error: null as unknown };
          },
          (error: unknown) => {
            createSettled = true;
            return { value: null, error };
          }
        );
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(createSettled).toBe(false);
        await prisma.authSession.update({
          where: { id: authSession.id },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            revocationReason: "receiving serialization race"
          }
        });
        releaseCreateLock();
        await heldCreateLock;
        const outcome = await createOutcome;
        expect(outcome.value).toBeNull();
        expect((outcome.error as Error).message).toBe("AUTH_REQUIRED");
        expect(
          await prisma.goodsReceipt.count({
            where: { purchaseOrderId: order.id }
          })
        ).toBe(0);
        expect(
          await prisma.auditEvent.count({
            where: {
              tenantId: order.tenantId,
              companyId: order.companyId,
              entityType: "GoodsReceipt",
              eventType: "goods_receipt.created"
            }
          })
        ).toBe(0);
      } finally {
        releaseCreateLock();
        if (previousAuthMode === undefined) {
          delete process.env.AUTH_MODE;
        } else {
          process.env.AUTH_MODE = previousAuthMode;
        }
      }

      mockContext.requireSessionContext.mockResolvedValue(session);
      const receiptId = await createGoodsReceiptFromPurchaseOrder(createForm);
      createForm.set(
        "supplierDeliveryReceiptNumber",
        `SERIALIZATION-SECOND-${process.env.AUTHORIZATION_TEST_RUN_ID}-${randomUUID()}`
      );
      const staleReceiptId = await createGoodsReceiptFromPurchaseOrder(createForm);
      expect(
        await prisma.auditEvent.count({
          where: {
            tenantId: order.tenantId,
            companyId: order.companyId,
            entityType: "GoodsReceipt",
            entityId: receiptId,
            eventType: "goods_receipt.created"
          }
        })
      ).toBe(1);

      const postForm = new FormData();
      postForm.set("id", receiptId);
      const originalStatus = order.status;
      let releaseClosure = () => undefined;
      const closureGate = new Promise<void>((resolve) => {
        releaseClosure = resolve;
      });
      let confirmClosureLock = () => undefined;
      const closureLocked = new Promise<void>((resolve) => {
        confirmClosureLock = resolve;
      });

      try {
        const closureCommit = prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT po.id
              FROM "PurchaseOrder" po
             WHERE po.id = ${order.id}::uuid
               AND po."tenantId" = ${order.tenantId}::uuid
               AND po."companyId" = ${order.companyId}::uuid
             FOR UPDATE OF po
          `;
          await tx.purchaseOrder.update({
            where: { id: order.id },
            data: { status: "CLOSED" }
          });
          confirmClosureLock();
          await closureGate;
        });
        await closureLocked;

        let postingSettled = false;
        const postingOutcome = postGoodsReceipt(postForm).then(
          (value) => {
            postingSettled = true;
            return { value, error: null as unknown };
          },
          (error: unknown) => {
            postingSettled = true;
            return { value: null, error };
          }
        );
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(postingSettled).toBe(false);

        releaseClosure();
        await closureCommit;
        const outcome = await postingOutcome;
        expect(outcome.value).toBeNull();
        expect(outcome.error).toBeInstanceOf(Error);
        expect((outcome.error as Error).message).toBe(
          "PURCHASE_ORDER_NOT_RECEIVABLE"
        );

        const currentReceipt = await prisma.goodsReceipt.findUniqueOrThrow({
          where: { id: receiptId }
        });
        expect(currentReceipt.status).toBe("DRAFT");
        expect(
          await prisma.inventoryMovement.count({
            where: {
              tenantId: order.tenantId,
              companyId: order.companyId,
              sourceDocumentType: "GoodsReceipt",
              sourceDocumentId: receiptId
            }
          })
        ).toBe(0);
        expect(
          await prisma.auditEvent.count({
            where: {
              tenantId: order.tenantId,
              companyId: order.companyId,
              entityType: "GoodsReceipt",
              entityId: receiptId,
              eventType: "goods_receipt.posted"
            }
          })
        ).toBe(0);
      } finally {
        releaseClosure();
        await prisma.purchaseOrder.update({
          where: { id: order.id },
          data: { status: originalStatus }
        });
      }

      const postingRoleAssignment =
        await prisma.userRoleAssignment.findFirstOrThrow({
          where: { userId: user.id, roleId: fixtureIds.role }
        });
      let releasePermissionLock = () => undefined;
      const permissionGate = new Promise<void>((resolve) => {
        releasePermissionLock = resolve;
      });
      let confirmPermissionLock = () => undefined;
      const permissionLocked = new Promise<void>((resolve) => {
        confirmPermissionLock = resolve;
      });
      try {
        const heldPermissionLock = prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT po.id
              FROM "PurchaseOrder" po
             WHERE po.id = ${order.id}::uuid
             FOR UPDATE OF po
          `;
          confirmPermissionLock();
          await permissionGate;
        });
        await permissionLocked;
        let postingSettled = false;
        const postingOutcome = postGoodsReceipt(postForm).then(
          (value) => {
            postingSettled = true;
            return { value, error: null as unknown };
          },
          (error: unknown) => {
            postingSettled = true;
            return { value: null, error };
          }
        );
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(postingSettled).toBe(false);
        await prisma.$transaction(async (tx) => {
          await tx.userRoleAssignment.update({
            where: { id: postingRoleAssignment.id },
            data: { status: "INACTIVE", endsAt: new Date() }
          });
          await tx.user.update({
            where: { id: user.id },
            data: { privilegeEpoch: { increment: 1 } }
          });
        });
        releasePermissionLock();
        await heldPermissionLock;
        const outcome = await postingOutcome;
        expect(outcome.value).toBeNull();
        expect((outcome.error as Error).message).toBe("PERMISSION_DENIED");
        expect(
          (await prisma.goodsReceipt.findUniqueOrThrow({
            where: { id: receiptId }
          })).status
        ).toBe("DRAFT");
        expect(
          await prisma.inventoryMovement.count({
            where: {
              sourceDocumentType: "GoodsReceipt",
              sourceDocumentId: receiptId
            }
          })
        ).toBe(0);
        expect(
          await prisma.auditEvent.count({
            where: {
              entityType: "GoodsReceipt",
              entityId: receiptId,
              eventType: "goods_receipt.posted"
            }
          })
        ).toBe(0);
      } finally {
        releasePermissionLock();
      }
      await prisma.userRoleAssignment.update({
        where: { id: postingRoleAssignment.id },
        data: { status: "ACTIVE", endsAt: null }
      });

      await prisma.companyPolicySetting.create({
        data: {
          tenantId: order.tenantId,
          companyId: order.companyId,
          key: "security.privileged_mfa.enforcement_mode",
          category: "SECURITY",
          label: "Privileged MFA enforcement",
          description: "Disposable receiving serialization test policy",
          value: "enforce_all_sensitive",
          defaultValue: "warn_and_audit",
          valueType: "ENUM",
          sourceDecisionId: "DEC-0040",
          isDefault: false
        }
      });
      const postingMfa = await prisma.privilegedMfaEnrollment.create({
        data: {
          tenantId: order.tenantId,
          companyId: order.companyId,
          targetUserId: user.id,
          providerName: `receiving-post-${suffix}`,
          status: "VERIFIED",
          evidenceReference: `mfa-evidence-${suffix}`,
          attestationNote: "Disposable receiving serialization test",
          attestedByUserId: reverseUser.id,
          verifiedByUserId: reverseUser.id,
          verificationNote: "Disposable test verification",
          verifiedAt: new Date()
        }
      });

      let releaseMfaLock = () => undefined;
      const mfaGate = new Promise<void>((resolve) => {
        releaseMfaLock = resolve;
      });
      let confirmMfaLock = () => undefined;
      const mfaLocked = new Promise<void>((resolve) => {
        confirmMfaLock = resolve;
      });
      try {
        const heldMfaLock = prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT po.id
              FROM "PurchaseOrder" po
             WHERE po.id = ${order.id}::uuid
             FOR UPDATE OF po
          `;
          confirmMfaLock();
          await mfaGate;
        });
        await mfaLocked;
        let postingSettled = false;
        const postingOutcome = postGoodsReceipt(postForm).then(
          (value) => {
            postingSettled = true;
            return { value, error: null as unknown };
          },
          (error: unknown) => {
            postingSettled = true;
            return { value: null, error };
          }
        );
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(postingSettled).toBe(false);
        await prisma.privilegedMfaEnrollment.update({
          where: { id: postingMfa.id },
          data: {
            status: "REVOKED",
            revokedByUserId: reverseUser.id,
            revokedAt: new Date(),
            revocationReason: "receiving serialization race"
          }
        });
        releaseMfaLock();
        await heldMfaLock;
        const outcome = await postingOutcome;
        expect(outcome.value).toBeNull();
        expect((outcome.error as Error).message).toBe(
          "PRIVILEGED_MFA_REQUIRED"
        );
        expect(
          (await prisma.goodsReceipt.findUniqueOrThrow({
            where: { id: receiptId }
          })).status
        ).toBe("DRAFT");
        expect(
          await prisma.inventoryMovement.count({
            where: {
              sourceDocumentType: "GoodsReceipt",
              sourceDocumentId: receiptId
            }
          })
        ).toBe(0);
        expect(
          await prisma.auditEvent.count({
            where: {
              entityType: "GoodsReceipt",
              entityId: receiptId,
              eventType: "goods_receipt.posted"
            }
          })
        ).toBe(0);
      } finally {
        releaseMfaLock();
      }

      await prisma.privilegedMfaEnrollment.update({
        where: { id: postingMfa.id },
        data: {
          status: "VERIFIED",
          verifiedAt: new Date(),
          revokedByUserId: null,
          revokedAt: null,
          revocationReason: null
        }
      });
      await expect(postGoodsReceipt(postForm)).resolves.toBe(order.id);

      const stalePostForm = new FormData();
      stalePostForm.set("id", staleReceiptId);
      await expect(postGoodsReceipt(stalePostForm)).rejects.toThrow(
        "GOODS_RECEIPT_DISCREPANCY_CONFLICT"
      );
      expect(
        (await prisma.goodsReceipt.findUniqueOrThrow({
          where: { id: staleReceiptId }
        })).status
      ).toBe("DRAFT");
      expect(
        await prisma.inventoryMovement.count({
          where: {
            sourceDocumentType: "GoodsReceipt",
            sourceDocumentId: staleReceiptId
          }
        })
      ).toBe(0);
      expect(
        await prisma.auditEvent.count({
          where: {
            entityType: "GoodsReceipt",
            entityId: staleReceiptId,
            eventType: "goods_receipt.posted"
          }
        })
      ).toBe(0);
      await prisma.goodsReceipt.update({
        where: { id: staleReceiptId },
        data: { status: "CANCELLED" }
      });

      await prisma.privilegedMfaEnrollment.create({
        data: {
          tenantId: order.tenantId,
          companyId: order.companyId,
          targetUserId: reverseUser.id,
          providerName: `receiving-reverse-${suffix}`,
          status: "VERIFIED",
          evidenceReference: `reverse-mfa-evidence-${suffix}`,
          attestationNote: "Disposable receiving reversal test",
          attestedByUserId: user.id,
          verifiedByUserId: user.id,
          verificationNote: "Disposable test verification",
          verifiedAt: new Date()
        }
      });
      const closure = await prisma.purchaseOrderBalanceClosure.create({
        data: {
          tenantId: order.tenantId,
          companyId: order.companyId,
          purchaseOrderId: order.id,
          requestedByUserId: user.id,
          reason: "Supplier confirmed remaining balance closure",
          supplierNoticeReference: `closure-${suffix}`,
          lineSnapshot: { disposableTest: true },
          totalClosedQuantity: 8,
          totalClosedValue: 40
        }
      });
      const reverseSession: SessionContext = {
        ...session,
        user: {
          id: reverseUser.id,
          email: reverseUser.email,
          displayName: reverseUser.displayName,
          role: "Receiving reversal tester"
        },
        permissionCodes: ["inventory.receiving.reverse"]
      };
      mockContext.requireSessionContext.mockResolvedValue(reverseSession);
      const reverseForm = new FormData();
      reverseForm.set("id", receiptId);
      reverseForm.set(
        "reversalReason",
        "Disposable closure versus reversal serialization test"
      );
      let releaseApprovedClosure = () => undefined;
      const approvedClosureGate = new Promise<void>((resolve) => {
        releaseApprovedClosure = resolve;
      });
      let confirmApprovedClosure = () => undefined;
      const approvedClosureLocked = new Promise<void>((resolve) => {
        confirmApprovedClosure = resolve;
      });
      try {
        const closureApproval = prisma.$transaction(async (tx) => {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT po.id
              FROM "PurchaseOrder" po
             WHERE po.id = ${order.id}::uuid
             FOR UPDATE OF po
          `;
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT pol.id
              FROM "PurchaseOrderLine" pol
             WHERE pol."purchaseOrderId" = ${order.id}::uuid
             ORDER BY pol."lineNumber", pol.id
             FOR UPDATE OF pol
          `;
          await tx.purchaseOrderLine.update({
            where: { id: fixtureIds.purchaseOrderLine },
            data: { cancelledQty: 8 }
          });
          await tx.purchaseOrder.update({
            where: { id: order.id },
            data: { status: "CLOSED" }
          });
          await tx.purchaseOrderBalanceClosure.update({
            where: { id: closure.id },
            data: {
              status: "APPROVED",
              approvedByUserId: reverseUser.id,
              approvedAt: new Date()
            }
          });
          confirmApprovedClosure();
          await approvedClosureGate;
        });
        await approvedClosureLocked;
        let reversalSettled = false;
        const reversalOutcome = reverseGoodsReceipt(reverseForm).then(
          (value) => {
            reversalSettled = true;
            return { value, error: null as unknown };
          },
          (error: unknown) => {
            reversalSettled = true;
            return { value: null, error };
          }
        );
        await new Promise((resolve) => setTimeout(resolve, 75));
        expect(reversalSettled).toBe(false);
        releaseApprovedClosure();
        await closureApproval;
        const outcome = await reversalOutcome;
        expect(outcome.value).toBeNull();
        expect((outcome.error as Error).message).toBe(
          "GOODS_RECEIPT_REVERSAL_PO_CLOSED"
        );
        expect(
          (await prisma.purchaseOrder.findUniqueOrThrow({
            where: { id: order.id }
          })).status
        ).toBe("CLOSED");
        expect(
          (await prisma.goodsReceipt.findUniqueOrThrow({
            where: { id: receiptId }
          })).status
        ).toBe("POSTED_WITH_DISCREPANCY");
        expect(
          await prisma.inventoryMovement.count({
            where: {
              sourceDocumentType: "GoodsReceipt",
              sourceDocumentId: receiptId,
              movementType: "REVERSAL"
            }
          })
        ).toBe(0);
        expect(
          await prisma.auditEvent.count({
            where: {
              entityType: "GoodsReceipt",
              entityId: receiptId,
              eventType: "goods_receipt.reversed"
            }
          })
        ).toBe(0);
      } finally {
        releaseApprovedClosure();
      }
    }, 60_000);
  }
);
