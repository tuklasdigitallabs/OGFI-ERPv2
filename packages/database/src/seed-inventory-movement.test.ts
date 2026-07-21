import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import {
  assertSingleCanonicalSeedInventoryMovement,
  type SeedInventoryMovement,
} from "./seed-inventory-movement";

const expectedMovement = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenantId: "00000000-0000-4000-8000-000000000001",
  companyId: "00000000-0000-4000-8000-000000000002",
  inventoryLocationId: "00000000-0000-4000-8000-000000000039",
  relatedInventoryLocationId: null,
  itemId: "00000000-0000-4000-8000-000000000024",
  movementType: "OPENING_BALANCE_IN" as const,
  occurredAt: new Date("2026-07-01T01:00:00.000Z"),
  enteredQuantity: 12,
  enteredUomId: "00000000-0000-4000-8000-000000000022",
  quantityDeltaBaseUom: 12,
  baseUomId: "00000000-0000-4000-8000-000000000022",
  lotNumber: "OB-LEGACY",
  expiryDate: new Date("2026-12-31T15:59:59.000Z"),
  unitCost: null,
  totalCost: null,
  sourceDocumentType: "DEMO_OPENING_BALANCE",
  sourceDocumentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  sourceDocumentLineId: null,
  sourceEventKey:
    "opening:00000000-0000-4000-8000-000000000039:00000000-0000-4000-8000-000000000024",
  reasonCode: "OPENING_BALANCE",
  notes: "Demo opening balance for legacy fixture.",
  reversalOfMovementId: null,
  postedByUserId: "00000000-0000-4000-8000-000000000014",
} satisfies SeedInventoryMovement;

function legacyMovement(
  overrides: Partial<Prisma.InventoryMovementGetPayload<object>> = {},
): Prisma.InventoryMovementGetPayload<object> {
  return {
    id: "12345678-1234-4123-8123-123456789abc",
    tenantId: expectedMovement.tenantId,
    companyId: expectedMovement.companyId,
    inventoryLocationId: expectedMovement.inventoryLocationId,
    relatedInventoryLocationId: null,
    itemId: expectedMovement.itemId,
    movementType: expectedMovement.movementType,
    occurredAt: expectedMovement.occurredAt,
    enteredQuantity: new Prisma.Decimal(expectedMovement.enteredQuantity),
    enteredUomId: expectedMovement.enteredUomId,
    quantityDeltaBaseUom: new Prisma.Decimal(
      expectedMovement.quantityDeltaBaseUom,
    ),
    baseUomId: expectedMovement.baseUomId,
    lotNumber: expectedMovement.lotNumber,
    expiryDate: expectedMovement.expiryDate,
    unitCost: null,
    totalCost: null,
    sourceDocumentType: expectedMovement.sourceDocumentType,
    sourceDocumentId: "10000000-0000-4000-8001-000000000001",
    sourceDocumentLineId: null,
    sourceEventKey: expectedMovement.sourceEventKey,
    reasonCode: expectedMovement.reasonCode,
    notes: expectedMovement.notes,
    reversalOfMovementId: null,
    postedByUserId: expectedMovement.postedByUserId,
    createdAt: new Date("2026-07-01T01:00:00.000Z"),
    ...overrides,
  };
}

describe("legacy append-only inventory seed compatibility", () => {
  test("accepts opaque predecessor IDs when semantic payload is unchanged", () => {
    expect(() =>
      assertSingleCanonicalSeedInventoryMovement(
        [legacyMovement()],
        expectedMovement,
      ),
    ).not.toThrow();
  });

  test("rejects a different immutable business payload", () => {
    expect(() =>
      assertSingleCanonicalSeedInventoryMovement(
        [legacyMovement({ quantityDeltaBaseUom: new Prisma.Decimal(11) })],
        expectedMovement,
      ),
    ).toThrow(
      `SEED_IMMUTABLE_MOVEMENT_MISMATCH:${expectedMovement.sourceEventKey}:quantityDeltaBaseUom`,
    );
  });

  test("rejects duplicate canonical seed movements", () => {
    expect(() =>
      assertSingleCanonicalSeedInventoryMovement(
        [
          legacyMovement(),
          legacyMovement({ id: "87654321-4321-4876-8876-cba987654321" }),
        ],
        expectedMovement,
      ),
    ).toThrow(
      `SEED_IMMUTABLE_MOVEMENT_MISSING_OR_DUPLICATE:${expectedMovement.sourceEventKey}`,
    );
  });
});

