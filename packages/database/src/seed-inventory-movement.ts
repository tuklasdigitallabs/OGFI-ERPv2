import { Prisma } from "@prisma/client";

export type SeedInventoryMovement =
  Prisma.InventoryMovementUncheckedCreateInput;

type ExistingInventoryMovement = Prisma.InventoryMovementGetPayload<object>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const semanticFields = [
  "tenantId",
  "companyId",
  "inventoryLocationId",
  "relatedInventoryLocationId",
  "itemId",
  "movementType",
  "occurredAt",
  "enteredQuantity",
  "enteredUomId",
  "quantityDeltaBaseUom",
  "baseUomId",
  "lotNumber",
  "expiryDate",
  "unitCost",
  "totalCost",
  "sourceDocumentType",
  "sourceDocumentLineId",
  "sourceEventKey",
  "reasonCode",
  "notes",
  "reversalOfMovementId",
  "postedByUserId",
] as const;

const decimalFields = new Set([
  "enteredQuantity",
  "quantityDeltaBaseUom",
  "unitCost",
  "totalCost",
]);

function normalizeField(field: string, value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (decimalFields.has(field)) {
    return Number(value).toFixed(6);
  }
  return String(value);
}

function assertOpaqueUuid(
  value: string | null | undefined,
  label: "id" | "sourceDocumentId",
  sourceEventKey: string,
) {
  if (!value || !UUID.test(value)) {
    throw new Error(
      `SEED_IMMUTABLE_MOVEMENT_${label === "id" ? "ID" : "SOURCE_DOCUMENT_ID"}_INVALID:${sourceEventKey}`,
    );
  }
}

export function assertSingleCanonicalSeedInventoryMovement(
  actualRows: ExistingInventoryMovement[],
  expected: SeedInventoryMovement,
) {
  if (actualRows.length !== 1) {
    throw new Error(
      `SEED_IMMUTABLE_MOVEMENT_MISSING_OR_DUPLICATE:${expected.sourceEventKey}`,
    );
  }

  const actual = actualRows[0]!;
  assertOpaqueUuid(actual.id, "id", expected.sourceEventKey);
  assertOpaqueUuid(
    actual.sourceDocumentId,
    "sourceDocumentId",
    expected.sourceEventKey,
  );

  for (const field of semanticFields) {
    const actualValue = normalizeField(field, actual[field]);
    const expectedValue = normalizeField(field, expected[field]);
    if (actualValue !== expectedValue) {
      throw new Error(
        `SEED_IMMUTABLE_MOVEMENT_MISMATCH:${expected.sourceEventKey}:${field}`,
      );
    }
  }

  return actual;
}

