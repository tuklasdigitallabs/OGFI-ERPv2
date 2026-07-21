import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const schemaSource = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);
const migrationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/migrations/20260721180000_evidence_legal_hold_controls/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const seedSource = readFileSync(
  fileURLToPath(new URL("./seed.ts", import.meta.url)),
  "utf8",
);

describe("evidence legal-hold database controls", () => {
  it("requires coherent authority, case reference, actor, time, and reason", () => {
    expect(schemaSource).toContain("legalHoldAuthority");
    expect(schemaSource).toContain("legalHoldCaseReference");
    expect(migrationSource).toContain(
      'DROP CONSTRAINT "Attachment_legal_hold_coherence_chk"',
    );
    for (const field of [
      '"legalHoldSetAt" IS NOT NULL',
      '"legalHoldSetByUserId" IS NOT NULL',
      'nullif(btrim("legalHoldAuthority"), \'\') IS NOT NULL',
      'nullif(btrim("legalHoldCaseReference"), \'\') IS NOT NULL',
      'nullif(btrim("legalHoldReason"), \'\') IS NOT NULL',
    ]) {
      expect(migrationSource).toContain(field);
    }
  });

  it("deploys dedicated permissions only to configured admin authorities", () => {
    for (const code of [
      "evidence.legal_hold.set",
      "evidence.retention.view",
    ]) {
      expect(migrationSource).toContain(code);
      expect(seedSource).toContain(code);
    }
    expect(migrationSource).toContain(
      "'CONFIGURED_ADMIN', 'CONFIGURED_SUPER_USER'",
    );
    expect(migrationSource).toContain('SET "privilegeEpoch" =');
    expect(migrationSource).toContain("Evidence-governance permissions deployed");
  });

  it("adds no hold-release, physical-purge, or deletion mutation", () => {
    expect(migrationSource).not.toContain("legal_hold.release");
    expect(migrationSource).not.toContain("evidence.purge");
    expect(migrationSource).not.toMatch(/DELETE FROM "Attachment"/);
  });
});
