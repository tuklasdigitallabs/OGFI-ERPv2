import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");
const migrationPath = path.resolve(
  __dirname,
  "../prisma/migrations/20260727180000_inventory_transfer_receipt_idempotency/migration.sql"
);
const coherenceMigrationPath = path.resolve(
  __dirname,
  "../prisma/migrations/20260728100000_inventory_transfer_receipt_idempotency_coherence/migration.sql"
);

describe("Inventory Transfer receipt idempotency schema contract", () => {
  test("keeps legacy rows nullable and scopes uniqueness to tenant/company", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const model = schema.slice(
      schema.indexOf("model InventoryTransferReceipt {"),
      schema.indexOf("model InventoryTransferReceiptLine {")
    );

    expect(model).toMatch(/idempotencyKey\s+String\?/);
    expect(model).toMatch(/idempotencyRequestHash\s+String\?/);
    expect(model).toContain(
      "@@unique([tenantId, companyId, idempotencyKey], map: \"InventoryTransferReceipt_tenantId_companyId_idempotencyKey_key\")"
    );
  });

  test("uses additive columns and a durable unique index without backfill", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('ADD COLUMN "idempotencyKey" VARCHAR(200)');
    expect(migration).toContain('ADD COLUMN "idempotencyRequestHash" CHAR(64)');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "InventoryTransferReceipt_tenantId_companyId_idempotencyKey_key"'
    );
    expect(migration).not.toMatch(/UPDATE\s+"InventoryTransferReceipt"/i);
  });

  test("enforces paired replay identity without rewriting legacy rows", () => {
    const migration = readFileSync(coherenceMigrationPath, "utf8");

    expect(migration).toContain(
      'ADD CONSTRAINT "InventoryTransferReceipt_idempotency_pair_check"'
    );
    expect(migration).toContain("NOT VALID");
    expect(migration).toContain(
      'VALIDATE CONSTRAINT "InventoryTransferReceipt_idempotency_pair_check"'
    );
    expect(migration).toContain(
      "INVENTORY_TRANSFER_RECEIPT_IDEMPOTENCY_PAIR_PREFLIGHT_FAILED"
    );
    expect(migration).toContain('"idempotencyKey" IS NULL AND "idempotencyRequestHash" IS NULL');
    expect(migration).toContain('"idempotencyKey" IS NOT NULL');
    expect(migration).toContain("btrim(\"idempotencyRequestHash\"::text) ~ '^[0-9a-f]{64}$'");
    expect(migration).not.toMatch(/UPDATE\s+"InventoryTransferReceipt"/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"InventoryTransferReceipt"/i);
  });
});
