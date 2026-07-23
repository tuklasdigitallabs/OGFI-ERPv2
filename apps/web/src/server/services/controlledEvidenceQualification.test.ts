import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TransactionClient } from "@ogfi/database";
import {
  CONTROLLED_EVIDENCE_QUALIFICATION_RUNTIME_ENABLED,
  controlledEvidenceQualificationCanonicalJson,
  controlledEvidenceQualificationDigest,
  qualifyControlledEvidenceForAction,
  withControlledEvidenceQualificationTestAdapter,
  type ControlledEvidenceActionAdapter,
} from "./controlledEvidenceQualification";

const source = readFileSync(
  fileURLToPath(new URL("./controlledEvidenceQualification.ts", import.meta.url)),
  "utf8",
);

const syntheticAdapter: ControlledEvidenceActionAdapter = {
  actionCode: "TEST_ONLY_SYNTHETIC_ACTION",
  actionSchemaVersion: 1,
  supportedPolicySchemaVersions: [1],
  closeActionContext: () => ({
    tenantId: "10000000-0000-4000-8000-000000000001",
    companyId: "10000000-0000-4000-8000-000000000002",
    sourceType: "TEST_ONLY_SOURCE",
    sourceRecordId: "10000000-0000-4000-8000-000000000003",
    sourceVersion: "7",
    sourceLineId: null,
    executionKey: "test-only-execution",
    actorUserId: "10000000-0000-4000-8000-000000000004",
    actorAuthSessionId: null,
    actorPrivilegeEpoch: 3,
    approvalInstanceId: null,
    approvalStepId: null,
    provenance: { synthetic: true },
  }),
};

const policyDocument = {
  schemaVersion: 1,
  sourceType: "TEST_ONLY_SOURCE",
  purposeRequirements: [
    { purpose: "TEST_ONLY_EVIDENCE", minimumCount: 1, maximumCount: 1 },
  ],
} as const;

function syntheticTransaction(
  overrides: {
    policy?: unknown;
    policyConfigHash?: string;
    attachment?: Record<string, unknown>;
    scan?: Record<string, unknown>;
    link?: Record<string, unknown>;
  } = {},
) {
  const suppliedPolicy = overrides.policy ?? policyDocument;
  const canonicalPolicy = controlledEvidenceQualificationCanonicalJson(suppliedPolicy);
  const checksum = "a".repeat(64);
  const activationEventPayload = {
    schemaVersion: 1,
    tenantId: "10000000-0000-4000-8000-000000000001",
    companyId: "10000000-0000-4000-8000-000000000002",
    actionCode: "TEST_ONLY_SYNTHETIC_ACTION",
    pointerVersion: 1,
    policyVersionId: "10000000-0000-4000-8000-000000000011",
    policyVersion: 1,
    priorActivationEventId: null,
    activatedByUserId: "10000000-0000-4000-8000-000000000004",
    activatedAt: "2026-07-24T00:00:00.000Z",
    activationReason: "Synthetic contract fixture only",
    provenance: { synthetic: true },
  } as const;
  const activationCanonicalJson =
    controlledEvidenceQualificationCanonicalJson(activationEventPayload);
  const rows: unknown[][] = [
    [
      {
        id: "10000000-0000-4000-8000-000000000010",
        activeActivationEventId: "10000000-0000-4000-8000-000000000012",
        pointerVersion: 1,
      },
    ],
    [
      {
        id: "10000000-0000-4000-8000-000000000012",
        policyVersionId: "10000000-0000-4000-8000-000000000011",
        policyVersion: 1,
        priorActivationEventId: null,
        priorPolicyVersionId: null,
        priorPolicyVersion: null,
        pointerVersion: 1,
        activatedByUserId: "10000000-0000-4000-8000-000000000004",
        activatedAt: new Date("2026-07-24T00:00:00.000Z"),
        activationReason: "Synthetic contract fixture only",
        provenance: { synthetic: true },
        canonicalJson: activationCanonicalJson,
        activationHash:
          controlledEvidenceQualificationDigest(activationEventPayload),
      },
    ],
    [
      {
        id: "10000000-0000-4000-8000-000000000011",
        version: 1,
        schemaVersion: 1,
        policy: suppliedPolicy,
        canonicalJson: canonicalPolicy,
        configHash:
          overrides.policyConfigHash ??
          controlledEvidenceQualificationDigest(suppliedPolicy),
      },
    ],
    [
      {
        controlledEvidenceAttachmentId:
          "10000000-0000-4000-8000-000000000005",
        attachmentId: "10000000-0000-4000-8000-000000000006",
        objectVersionId: "synthetic-object-version-1",
        checksum,
        detectedChecksum: checksum,
        storedChecksum: "b".repeat(64),
        uploadState: "VERIFIED",
        scanState: "CLEAN",
        availabilityState: "AVAILABLE",
        physicalState: "DURABLE",
        status: "ACTIVE",
        rowVersion: 4,
        scanVerifiedObjectVersionId: "synthetic-object-version-1",
        replacedByAttachmentId: null,
        ...overrides.attachment,
      },
    ],
    [
      {
        id: "10000000-0000-4000-8000-000000000007",
        attachmentId: "10000000-0000-4000-8000-000000000006",
        objectVersionId: "synthetic-object-version-1",
        scanProvider: "test-only-scanner",
        scannerEngineVersion: "test-only-1",
        signatureVersion: "test-only-signatures-1",
        completedAt: new Date("2026-07-24T00:01:00.000Z"),
        result: "CLEAN",
        plaintextChecksum: checksum,
        ...overrides.scan,
      },
    ],
    [
      {
        id: "10000000-0000-4000-8000-000000000005",
        attachmentId: "10000000-0000-4000-8000-000000000006",
        sourceType: "TEST_ONLY_SOURCE",
        sourceRecordId: "10000000-0000-4000-8000-000000000003",
        sourceLineId: null,
        purpose: "TEST_ONLY_EVIDENCE",
        status: "ACTIVE",
        archivedAt: null,
        updatedAt: new Date("2026-07-24T00:02:00.000Z"),
        ...overrides.link,
      },
    ],
    [],
  ];
  const writes: unknown[] = [];
  let queryCount = 0;
  return {
    tx: {
      $queryRaw: async () => {
        queryCount += 1;
        return rows.shift() ?? [];
      },
      $executeRaw: async (query: unknown) => {
        writes.push(query);
        return 1;
      },
    } as unknown as TransactionClient,
    writes,
    get queryCount() {
      return queryCount;
    },
  };
}

function qualifyWithSyntheticAdapter(tx: TransactionClient) {
  return withControlledEvidenceQualificationTestAdapter(syntheticAdapter, () =>
    qualifyControlledEvidenceForAction({
      tx,
      actionCode: syntheticAdapter.actionCode,
      serverOwnedActionContext: Object.freeze({ synthetic: true }),
      controlledEvidenceAttachmentIds: [
        "10000000-0000-4000-8000-000000000005",
      ],
    }),
  );
}

describe("dormant controlled-evidence qualification foundation", () => {
  it("keeps the runtime adapter registry closed and fails before touching a transaction", async () => {
    expect(CONTROLLED_EVIDENCE_QUALIFICATION_RUNTIME_ENABLED).toBe(false);
    const tx = new Proxy(
      {},
      {
        get() {
          throw new Error("TRANSACTION_MUST_NOT_BE_TOUCHED");
        },
      },
    ) as TransactionClient;

    await expect(
      qualifyControlledEvidenceForAction({
        tx,
        actionCode: "PAYMENT_RELEASE",
        serverOwnedActionContext: {},
        controlledEvidenceAttachmentIds: [],
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED");
  });

  it("canonicalizes object keys recursively while preserving selection order", () => {
    const left = {
      z: [{ b: 2, a: 1 }, "second"],
      a: { d: false, c: null },
    };
    const right = {
      a: { c: null, d: false },
      z: [{ a: 1, b: 2 }, "second"],
    };
    expect(controlledEvidenceQualificationCanonicalJson(left)).toBe(
      controlledEvidenceQualificationCanonicalJson(right),
    );
    expect(controlledEvidenceQualificationDigest(left)).toBe(
      controlledEvidenceQualificationDigest(right),
    );
    expect(controlledEvidenceQualificationDigest(["first", "second"])).not.toBe(
      controlledEvidenceQualificationDigest(["second", "first"]),
    );
  });

  it("rejects non-canonical values rather than silently dropping them", () => {
    expect(() =>
      controlledEvidenceQualificationCanonicalJson({ unsafe: undefined }),
    ).toThrow("CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED");
    expect(() => controlledEvidenceQualificationCanonicalJson(Number.NaN)).toThrow(
      "CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED",
    );
  });

  it("allows an explicitly synthetic adapter only inside Vitest scope", async () => {
    const queries: string[] = [];
    const tx = {
      $queryRaw: async (query: { strings?: readonly string[] }) => {
        queries.push(query.strings?.join("?") ?? "query");
        return [];
      },
    } as unknown as TransactionClient;

    await expect(
      withControlledEvidenceQualificationTestAdapter(syntheticAdapter, () =>
        qualifyControlledEvidenceForAction({
          tx,
          actionCode: syntheticAdapter.actionCode,
          serverOwnedActionContext: Object.freeze({ synthetic: true }),
          controlledEvidenceAttachmentIds: [
            "10000000-0000-4000-8000-000000000005",
          ],
        }),
      ),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED");
    expect(queries).toHaveLength(1);
  });

  it("qualifies only exact locked synthetic evidence and derives stable hashes", async () => {
    const first = syntheticTransaction();
    const second = syntheticTransaction();
    const firstResult = await qualifyWithSyntheticAdapter(first.tx);
    const secondResult = await qualifyWithSyntheticAdapter(second.tx);

    expect(firstResult).toEqual(secondResult);
    expect(firstResult).toMatchObject({
      actionCode: "TEST_ONLY_SYNTHETIC_ACTION",
      policyVersion: 1,
      policyPointerVersion: 1,
      selectedCount: 1,
      identicalRetry: false,
    });
    expect(firstResult.executionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstResult.selectionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.writes).toHaveLength(2);
    expect(second.writes).toHaveLength(2);
  });

  it("fails closed for policy-hash, readiness, exact-version, checksum, and scope mismatches", async () => {
    const cases = [
      syntheticTransaction({ policyConfigHash: "f".repeat(64) }),
      syntheticTransaction({ attachment: { availabilityState: "QUARANTINED" } }),
      syntheticTransaction({
        attachment: { scanVerifiedObjectVersionId: "stale-object-version" },
      }),
      syntheticTransaction({ scan: { plaintextChecksum: "c".repeat(64) } }),
      syntheticTransaction({
        link: {
          sourceRecordId: "10000000-0000-4000-8000-000000000099",
        },
      }),
    ];

    await expect(qualifyWithSyntheticAdapter(cases[0]!.tx)).rejects.toThrow(
      "CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED",
    );
    for (const fixture of cases.slice(1)) {
      await expect(qualifyWithSyntheticAdapter(fixture.tx)).rejects.toThrow(
        "CONTROLLED_EVIDENCE_NOT_QUALIFIED",
      );
      expect(fixture.writes).toHaveLength(0);
    }
  });

  it("bounds selected IDs from approved purpose maxima before evidence locks", async () => {
    const fixture = syntheticTransaction();
    await expect(
      withControlledEvidenceQualificationTestAdapter(syntheticAdapter, () =>
        qualifyControlledEvidenceForAction({
          tx: fixture.tx,
          actionCode: syntheticAdapter.actionCode,
          serverOwnedActionContext: Object.freeze({ synthetic: true }),
          controlledEvidenceAttachmentIds: [
            "10000000-0000-4000-8000-000000000005",
            "10000000-0000-4000-8000-000000000009",
          ],
        }),
      ),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_NOT_QUALIFIED");
    expect(fixture.queryCount).toBe(3);
    expect(fixture.writes).toHaveLength(0);

    const unsafe = syntheticTransaction({
      policy: {
        ...policyDocument,
        purposeRequirements: [
          {
            purpose: "TEST_ONLY_EVIDENCE",
            minimumCount: 1,
            maximumCount: Number.MAX_SAFE_INTEGER + 1,
          },
        ],
      },
    });
    await expect(qualifyWithSyntheticAdapter(unsafe.tx)).rejects.toThrow(
      "CONTROLLED_EVIDENCE_POLICY_UNCONFIRMED",
    );
    expect(unsafe.queryCount).toBe(3);
    expect(unsafe.writes).toHaveLength(0);
  });

  it("encodes the required transaction, lock, authority, and runtime boundaries", () => {
    const pointerLock = source.indexOf(
      'FROM "ControlledEvidencePolicyActivation" pointer',
    );
    const activationEventRead = source.indexOf(
      'FROM "ControlledEvidencePolicyActivationEvent" event',
    );
    const attachmentLock = source.indexOf(
      'FROM "ControlledEvidenceAttachment" link\n      JOIN "Attachment" attachment',
    );
    const scanLock = source.indexOf('FROM "AttachmentScanAttempt" scan');
    const linkLock = source.lastIndexOf(
      'FROM "ControlledEvidenceAttachment" link',
    );

    expect(pointerLock).toBeGreaterThan(0);
    expect(activationEventRead).toBeGreaterThan(pointerLock);
    expect(attachmentLock).toBeGreaterThan(activationEventRead);
    expect(scanLock).toBeGreaterThan(attachmentLock);
    expect(linkLock).toBeGreaterThan(scanLock);
    expect(source).toContain("FOR SHARE OF pointer");
    expect(source).toContain("FOR UPDATE OF attachment");
    expect(source).toContain("FOR UPDATE OF link");
    expect(source).not.toContain("FOR UPDATE OF policy");
    expect(source).not.toContain("FOR UPDATE OF scan");
    expect(source).toContain('process.env.NODE_ENV === "test"');
    expect(source).toContain('process.env.VITEST === "true"');
    expect(source).not.toContain("requiredForAction");
    expect(source).not.toContain("originalFilename");
    expect(source).not.toMatch(/\b(fetch|axios|streamExactVersion)\s*\(/);
  });
});
