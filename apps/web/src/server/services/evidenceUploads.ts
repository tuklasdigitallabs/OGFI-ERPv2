import { prisma, type TransactionClient } from "@ogfi/database";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  authorizeControlledEvidenceSourceAction,
  buildEvidenceSourceKey,
  evidenceAttachmentSourceTypes,
  type EvidenceAttachmentPurpose,
  type EvidenceAttachmentSourceType,
} from "./attachments";
import { requireSessionContext, type SessionContext } from "./context";
import { getControlledEvidenceStoragePolicy } from "./policySettings";
import {
  classifyEvidenceStorageEnvironment,
  readEvidenceStorageConfig,
  type EvidenceStorageConfig,
} from "./evidenceStorageConfig";
import {
  createEvidenceStorageAdapters,
  createOpaqueEvidenceObjectKey,
  type ObjectStorageAdapter,
} from "../storage";

const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
] as const;

const purposes = [
  "EVIDENCE",
  "REFERENCE",
  "APPROVAL_SUPPORT",
  "EXCEPTION_SUPPORT",
  "PAYMENT_PROOF",
  "RECONCILIATION_SUPPORT",
  "CLOSURE_SUPPORT",
] as const;

const checksumPattern = /^[A-Za-z0-9+/]{43}=$/;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function evidenceFilenameMatchesMimeType(
  filename: string,
  mimeType: string,
) {
  const extension = filename.toLowerCase().split(".").at(-1) ?? "";
  const extensionsByMimeType: Record<string, readonly string[]> = {
    "application/pdf": ["pdf"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "text/plain": ["txt"],
  };
  return extensionsByMimeType[mimeType]?.includes(extension) ?? false;
}

export const issueEvidenceUploadSchema = z
  .object({
    sourceType: z.enum(evidenceAttachmentSourceTypes),
    sourceRecordId: z.string().uuid(),
    sourceLineId: z.string().uuid().optional().nullable(),
    purpose: z.enum(purposes).default("EVIDENCE"),
    caption: z.string().trim().max(500).optional().nullable(),
    requiredForAction: z.string().trim().max(100).optional().nullable(),
    originalFilename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine((value) => !/[\\/\0]/.test(value)),
    mimeType: z.enum(allowedMimeTypes),
    sizeBytes: z.number().int().positive(),
    checksumSha256Base64: z.string().regex(checksumPattern),
    idempotencyKey: z.string().regex(idempotencyPattern),
  })
  .refine(
    (value) =>
      evidenceFilenameMatchesMimeType(value.originalFilename, value.mimeType),
    {
      path: ["originalFilename"],
      message: "Filename extension does not match the declared file type",
    },
  );

export type IssueEvidenceUploadInput = z.infer<
  typeof issueEvidenceUploadSchema
>;

type QuotaRow = {
  id: string;
  quotaLimitBytes: bigint | null;
  usedBytes: bigint;
  reservedBytes: bigint;
};

type UploadDependencies = {
  config?: EvidenceStorageConfig;
  objectStorage?: ObjectStorageAdapter;
};

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function tokenHash(token: string) {
  return sha256(token);
}

export function requiredEvidenceActionForSource(
  sourceType: EvidenceAttachmentSourceType,
) {
  const requirements: Partial<Record<EvidenceAttachmentSourceType, string>> = {
    PAYMENT_RELEASE: "RELEASE",
    BRANCH_CASH_DEPOSIT: "DEPOSIT_REVIEW",
    EXPENSE_REQUEST: "EXPENSE_REVIEW",
    CASH_ADVANCE_REQUEST: "RELEASE",
    CASH_ADVANCE_LIQUIDATION: "LIQUIDATION_REVIEW",
    PROJECT_REQUIREMENT: "PROJECT_REQUIREMENT_SUBMIT",
  };
  return requirements[sourceType] ?? null;
}

function requestHash(
  input: IssueEvidenceUploadInput,
  requiredForAction: string | null,
) {
  return sha256(
    JSON.stringify({
      sourceType: input.sourceType,
      sourceRecordId: input.sourceRecordId,
      sourceLineId: input.sourceLineId ?? null,
      purpose: input.purpose,
      caption: input.caption?.trim() || null,
      requiredForAction,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksumSha256Base64: input.checksumSha256Base64,
    }),
  );
}

export function evidenceStorageEnvironment(
  config: EvidenceStorageConfig,
  env: { [key: string]: string | undefined; APP_ENV?: string } = process.env,
) {
  return classifyEvidenceStorageEnvironment(config, env);
}

function newIntentToken() {
  return randomBytes(32).toString("base64url");
}

function safeTokenMatch(token: string, expectedHash: string) {
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function lockCompanyQuota(
  tx: TransactionClient,
  tenantId: string,
  companyId: string,
  storageEnvironment: string,
  defaultQuotaBytes: number,
) {
  await tx.$executeRawUnsafe(
    `INSERT INTO "AttachmentCompanyQuotaUsage"
       (id, "tenantId", "companyId", "storageEnvironment", "quotaLimitBytes", "usedBytes", "reservedBytes", "rowVersion", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::"AttachmentStorageEnvironment", $4::bigint, 0, 0, 1, now(), now())
     ON CONFLICT ("tenantId", "companyId", "storageEnvironment") DO NOTHING`,
    tenantId,
    companyId,
    storageEnvironment,
    defaultQuotaBytes,
  );
  const rows = await tx.$queryRawUnsafe<QuotaRow[]>(
    `SELECT id, "quotaLimitBytes", "usedBytes", "reservedBytes"
       FROM "AttachmentCompanyQuotaUsage"
      WHERE "tenantId" = $1::uuid
        AND "companyId" = $2::uuid
        AND "storageEnvironment" = $3::"AttachmentStorageEnvironment"
      FOR UPDATE`,
    tenantId,
    companyId,
    storageEnvironment,
  );
  const quota = rows[0];
  if (!quota || quota.quotaLimitBytes === null) {
    throw new Error("EVIDENCE_UPLOAD_QUOTA_NOT_CONFIGURED");
  }
  if (
    quota.quotaLimitBytes < 0n ||
    quota.usedBytes < 0n ||
    quota.reservedBytes < 0n ||
    quota.usedBytes + quota.reservedBytes > quota.quotaLimitBytes
  ) {
    throw new Error("EVIDENCE_UPLOAD_QUOTA_STATE_INVALID");
  }
  return quota;
}

export async function issueEvidenceUploadIntent(
  rawInput: IssueEvidenceUploadInput,
  dependencies: UploadDependencies = {},
) {
  const session = await requireSessionContext();
  return issueEvidenceUploadIntentForSession(session, rawInput, dependencies);
}

export async function issueEvidenceUploadIntentForSession(
  session: SessionContext,
  rawInput: IssueEvidenceUploadInput,
  dependencies: UploadDependencies = {},
) {
  const input = issueEvidenceUploadSchema.parse(rawInput);
  if (input.sourceLineId) {
    throw new Error("EVIDENCE_UPLOAD_SOURCE_LINE_UNSUPPORTED");
  }
  const requiredForAction = requiredEvidenceActionForSource(input.sourceType);
  if (
    input.requiredForAction?.trim() &&
    input.requiredForAction.trim() !== requiredForAction
  ) {
    throw new Error("EVIDENCE_UPLOAD_REQUIRED_ACTION_INVALID");
  }
  const config = dependencies.config ?? readEvidenceStorageConfig();
  if (input.sizeBytes > config.maxUploadBytes) {
    throw new Error("EVIDENCE_UPLOAD_SIZE_EXCEEDED");
  }
  await authorizeControlledEvidenceSourceAction({
    session,
    sourceType: input.sourceType,
    sourceRecordId: input.sourceRecordId,
    attemptedAction: "LINK",
  });
  const evidenceStoragePolicy =
    await getControlledEvidenceStoragePolicy(session);
  const policyMaximumBytes = Math.min(
    config.maxUploadBytes,
    evidenceStoragePolicy.policy.uploadLimitMb * 1024 * 1024,
  );
  if (input.sizeBytes > policyMaximumBytes) {
    throw new Error("EVIDENCE_UPLOAD_POLICY_SIZE_EXCEEDED");
  }

  const storageEnvironment = evidenceStorageEnvironment(config);
  const objectStorage =
    dependencies.objectStorage ??
    createEvidenceStorageAdapters(config).objectStorage;
  const digest = requestHash(input, requiredForAction);
  const token = newIntentToken();
  const expiresAt = new Date(Date.now() + config.uploadIntentTtlSeconds * 1000);
  const objectKey = createOpaqueEvidenceObjectKey();
  const expectedObjectVersionId = randomUUID();
  const attachmentId = randomUUID();

  const created = await prisma.$transaction(async (tx) => {
    const quota = await lockCompanyQuota(
      tx,
      session.context.tenantId,
      session.context.companyId,
      storageEnvironment,
      config.defaultCompanyQuotaBytes,
    );
    const existing = await tx.attachmentUploadIntent.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        idempotencyKey: input.idempotencyKey,
      },
      include: { attachment: true },
    });
    if (existing) {
      if (existing.requestHash !== digest) {
        throw new Error("EVIDENCE_UPLOAD_IDEMPOTENCY_COLLISION");
      }
      if (existing.status !== "ISSUED" || existing.expiresAt <= new Date()) {
        throw new Error("EVIDENCE_UPLOAD_IDEMPOTENCY_TERMINAL");
      }
      const absoluteExpiresAt = new Date(
        existing.createdAt.getTime() +
          config.uploadIntentAbsoluteTtlSeconds * 1000,
      );
      if (absoluteExpiresAt <= new Date()) {
        throw new Error("EVIDENCE_UPLOAD_IDEMPOTENCY_TERMINAL");
      }
      const rotatedExpiresAt = new Date(
        Math.min(expiresAt.getTime(), absoluteExpiresAt.getTime()),
      );
      const rotated = await tx.attachmentUploadIntent.update({
        where: { id: existing.id },
        data: {
          intentTokenHash: tokenHash(token),
          expiresAt: rotatedExpiresAt,
          rowVersion: { increment: 1 },
        },
      });
      await tx.attachment.update({
        where: { id: existing.attachmentId },
        data: {
          uploadIntentExpiresAt: rotatedExpiresAt,
          rowVersion: { increment: 1 },
        },
      });
      return {
        intent: rotated,
        attachment: existing.attachment,
        reused: true,
      };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [activeForUser, activeForCompany, hourlyForUser, hourlyForCompany] =
      await Promise.all([
        tx.attachmentUploadIntent.count({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            createdByUserId: session.user.id,
            status: { in: ["ISSUED", "UPLOADING"] },
          },
        }),
        tx.attachmentUploadIntent.count({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: { in: ["ISSUED", "UPLOADING"] },
          },
        }),
        tx.attachmentUploadIntent.count({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            createdByUserId: session.user.id,
            createdAt: { gte: oneHourAgo },
          },
        }),
        tx.attachmentUploadIntent.count({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            createdAt: { gte: oneHourAgo },
          },
        }),
      ]);
    if (
      activeForUser >= config.maxActiveUploadIntentsPerUser ||
      activeForCompany >= config.maxActiveUploadIntentsPerCompany ||
      hourlyForUser >= config.maxUploadIntentsPerUserHour ||
      hourlyForCompany >= config.maxUploadIntentsPerCompanyHour
    ) {
      throw new Error("EVIDENCE_UPLOAD_INTENT_RATE_LIMITED");
    }

    const requested = BigInt(input.sizeBytes);
    const quotaLimitBytes = quota.quotaLimitBytes;
    if (quotaLimitBytes === null) {
      throw new Error("EVIDENCE_UPLOAD_QUOTA_NOT_CONFIGURED");
    }
    if (quota.usedBytes + quota.reservedBytes + requested > quotaLimitBytes) {
      throw new Error("EVIDENCE_UPLOAD_QUOTA_EXCEEDED");
    }
    const projectRequirement =
      input.sourceType === "PROJECT_REQUIREMENT"
        ? await tx.projectRequirement.findFirst({
            where: {
              id: input.sourceRecordId,
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              ownerUserId: session.user.id,
              archivedAt: null,
              status: { in: ["PENDING", "RETURNED"] },
              kind: "EVIDENCE",
              evidenceType: { in: ["DOCUMENT", "PHOTO"] },
            },
            select: {
              id: true,
              projectId: true,
              taskId: true,
              evidenceType: true,
            },
          })
        : null;
    if (input.sourceType === "PROJECT_REQUIREMENT" && !projectRequirement) {
      throw new Error("PROJECT_REQUIREMENT_ATTACHMENT_NOT_ALLOWED");
    }
    if (
      projectRequirement?.evidenceType === "PHOTO" &&
      !input.mimeType.startsWith("image/")
    ) {
      throw new Error("PROJECT_REQUIREMENT_EVIDENCE_MIME_MISMATCH");
    }
    const attachment = await tx.attachment.create({
      data: {
        id: attachmentId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        storageEnvironment,
        storageProvider: objectStorage.provider,
        objectKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksumSha256Base64,
        uploadState: "INTENT_ISSUED",
        scanState: "PENDING",
        availabilityState: "QUARANTINED",
        physicalState: "ABSENT",
        uploadIntentIssuedAt: new Date(),
        uploadIntentExpiresAt: expiresAt,
        uploadedByUserId: session.user.id,
      },
    });
    const controlledLink = await tx.controlledEvidenceAttachment.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceType: input.sourceType,
        sourceRecordId: input.sourceRecordId,
        sourceLineId: input.sourceLineId ?? null,
        sourceKey: buildEvidenceSourceKey(input),
        attachmentId: attachment.id,
        purpose: input.purpose as EvidenceAttachmentPurpose,
        caption: input.caption?.trim() || null,
        requiredForAction,
        createdByUserId: session.user.id,
      },
    });
    if (projectRequirement) {
      const projectLink = await tx.projectAttachment.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          projectId: projectRequirement.projectId,
          taskId: projectRequirement.taskId,
          requirementId: projectRequirement.id,
          attachmentId: attachment.id,
          purpose: "EVIDENCE",
          caption: input.caption?.trim() || null,
          createdByUserId: session.user.id,
        },
      });
      await tx.projectActivityEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          projectId: projectRequirement.projectId,
          actorUserId: session.user.id,
          eventType: "project_attachment.upload_intent_issued",
          entityType: "ProjectAttachment",
          entityId: projectLink.id,
          afterData: {
            requirementId: projectRequirement.id,
            controlledEvidenceAttachmentId: controlledLink.id,
            availabilityState: "QUARANTINED",
          },
          metadata: {
            source: "controlled-evidence-upload",
            noSourceMutation: true,
          },
        },
      });
    }
    const intent = await tx.attachmentUploadIntent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        attachmentId: attachment.id,
        storageEnvironment,
        storageProvider: objectStorage.provider,
        objectKey,
        intentTokenHash: tokenHash(token),
        idempotencyKey: input.idempotencyKey,
        requestHash: digest,
        expectedMimeType: input.mimeType,
        expectedSizeBytes: input.sizeBytes,
        expectedChecksum: input.checksumSha256Base64,
        expectedObjectVersionId,
        expiresAt,
        createdByUserId: session.user.id,
      },
    });
    await tx.attachmentCompanyQuotaUsage.update({
      where: { id: quota.id },
      data: {
        reservedBytes: { increment: requested },
        rowVersion: { increment: 1 },
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "controlled_evidence_upload.intent_issued",
        entityType: "Attachment",
        entityId: attachment.id,
        afterData: {
          storageEnvironment,
          storageProvider: objectStorage.provider,
          sizeBytes: input.sizeBytes,
          sourceType: input.sourceType,
          sourceRecordId: input.sourceRecordId,
        },
        metadata: {
          noSourceMutation: true,
          quarantineOnly: true,
          storagePolicyKey: evidenceStoragePolicy.key,
          storagePolicySourceDecisionId: evidenceStoragePolicy.sourceDecisionId,
          storagePolicyOverridden: evidenceStoragePolicy.isOverridden,
          configuredUploadLimitMb: evidenceStoragePolicy.policy.uploadLimitMb,
          effectiveMaximumBytes: policyMaximumBytes,
        },
      },
    });
    return { intent, attachment, reused: false };
  });

  const upload = await objectStorage.createUploadIntent({
    key: created.attachment.objectKey,
    contentType: created.intent.expectedMimeType,
    checksumSha256Base64: created.intent.expectedChecksum as string,
    maximumBytes: created.intent.expectedSizeBytes,
    expiresInSeconds: config.uploadIntentTtlSeconds,
  });
  return {
    intentId: created.intent.id,
    attachmentId: created.attachment.id,
    intentToken: token,
    upload: {
      ...upload,
      expiresAt: upload.expiresAt.toISOString(),
      fields: { ...upload.fields },
    },
    reused: created.reused,
  };
}

async function loadAuthorizedIntent(
  session: SessionContext,
  intentId: string,
  token: string,
) {
  const intent = await prisma.attachmentUploadIntent.findFirst({
    where: {
      id: intentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    include: {
      attachment: {
        include: {
          controlledEvidenceLinks: {
            where: { status: "ACTIVE", archivedAt: null },
            take: 1,
          },
        },
      },
    },
  });
  const link = intent?.attachment.controlledEvidenceLinks[0];
  if (!intent || !link || !safeTokenMatch(token, intent.intentTokenHash)) {
    throw new Error("EVIDENCE_UPLOAD_INTENT_NOT_AVAILABLE");
  }
  await authorizeControlledEvidenceSourceAction({
    session,
    sourceType: link.sourceType as EvidenceAttachmentSourceType,
    sourceRecordId: link.sourceRecordId,
    attemptedAction: "LINK",
  });
  return intent;
}

type DurableIntent = Awaited<ReturnType<typeof loadAuthorizedIntent>>;

function assertStoredVersionMatchesIntent(
  intent: DurableIntent,
  exact: Awaited<ReturnType<ObjectStorageAdapter["headExactVersion"]>>,
  production: boolean,
) {
  if (
    exact.key !== intent.objectKey ||
    exact.versionId !== intent.expectedObjectVersionId ||
    exact.size !== intent.expectedSizeBytes ||
    exact.contentType !== intent.expectedMimeType ||
    exact.checksumSha256Base64 !== intent.expectedChecksum ||
    (production &&
      (!exact.encryptionVerified ||
        exact.encryptionAlgorithm !== "AES-256-GCM" ||
        !exact.encryptionKeyId ||
        !exact.storedChecksum))
  ) {
    throw new Error("EVIDENCE_UPLOAD_OBJECT_INTEGRITY_INVALID");
  }
}

async function finalizeDurableEvidenceUpload(input: {
  intent: DurableIntent;
  exact: Awaited<ReturnType<ObjectStorageAdapter["headExactVersion"]>>;
  config: EvidenceStorageConfig;
  actorUserId: string;
  recovered: boolean;
  uploadLeaseOwner?: string;
}) {
  const { intent, exact, config } = input;
  assertStoredVersionMatchesIntent(intent, exact, config.production);
  await prisma.$transaction(async (tx) => {
    const quota = await lockCompanyQuota(
      tx,
      intent.tenantId,
      intent.companyId,
      intent.storageEnvironment,
      config.defaultCompanyQuotaBytes,
    );
    if (quota.reservedBytes < BigInt(intent.expectedSizeBytes)) {
      throw new Error("EVIDENCE_UPLOAD_QUOTA_RESERVATION_INVALID");
    }
    const consumed = await tx.attachmentUploadIntent.updateMany({
      where: {
        id: intent.id,
        intentTokenHash: intent.intentTokenHash,
        ...(input.uploadLeaseOwner
          ? {
              status: "UPLOADING" as const,
              uploadLeaseOwner: input.uploadLeaseOwner,
            }
          : {
              OR: [
                { status: "ISSUED" as const },
                {
                  status: "UPLOADING" as const,
                  uploadLeaseExpiresAt: { lte: new Date() },
                },
              ],
            }),
      },
      data: {
        status: "CONSUMED",
        uploadLeaseOwner: null,
        uploadLeaseExpiresAt: null,
        consumedAt: new Date(),
        completedVersionId: intent.expectedObjectVersionId,
        rowVersion: { increment: 1 },
      },
    });
    if (consumed.count !== 1) throw new Error("EVIDENCE_UPLOAD_INTENT_RACE");
    const updated = await tx.attachment.updateMany({
      where: {
        id: intent.attachmentId,
        tenantId: intent.tenantId,
        companyId: intent.companyId,
        objectVersionId: null,
        uploadState: { in: ["INTENT_ISSUED", "UPLOADING"] },
        availabilityState: "QUARANTINED",
      },
      data: {
        objectVersionId: intent.expectedObjectVersionId,
        uploadState: "VERIFIED",
        scanState: "PENDING",
        physicalState: "DURABLE",
        detectedChecksum: exact.checksumSha256Base64 as string,
        storedChecksum: exact.storedChecksum ?? null,
        encryptionAlgorithm: exact.encryptionAlgorithm ?? null,
        encryptionKeyId: exact.encryptionKeyId ?? null,
        encryptedAt: exact.encryptionVerified ? new Date() : null,
        uploadConfirmedAt: new Date(),
        uploadVerifiedAt: new Date(),
        scanRequestedAt: new Date(),
        reconciliationNextAttemptAt: new Date(),
        rowVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new Error("EVIDENCE_UPLOAD_ATTACHMENT_RACE");
    await tx.attachmentCompanyQuotaUsage.update({
      where: { id: quota.id },
      data: {
        reservedBytes: { decrement: BigInt(intent.expectedSizeBytes) },
        usedBytes: { increment: BigInt(intent.expectedSizeBytes) },
        rowVersion: { increment: 1 },
      },
    });
    await tx.auditEvent.create({
      data: {
        tenantId: intent.tenantId,
        companyId: intent.companyId,
        actorUserId: input.actorUserId,
        eventType: input.recovered
          ? "controlled_evidence_upload.recovered"
          : "controlled_evidence_upload.completed",
        entityType: "Attachment",
        entityId: intent.attachmentId,
        afterData: {
          objectVersionId: intent.expectedObjectVersionId,
          uploadState: "VERIFIED",
          physicalState: "DURABLE",
          availabilityState: "QUARANTINED",
        },
        metadata: {
          noSourceMutation: true,
          exactVersionRequired: true,
          recoveredByReconciler: input.recovered,
        },
      },
    });
  });
}

async function acquireUploadLease(
  intent: DurableIntent,
  config: EvidenceStorageConfig,
) {
  const leaseOwner = randomUUID();
  const uploadStartedAt = new Date();
  const uploadLeaseExpiresAt = new Date(
    uploadStartedAt.getTime() + config.uploadLeaseSeconds * 1000,
  );
  await prisma.$transaction(async (tx) => {
    const leased = await tx.attachmentUploadIntent.updateMany({
      where: {
        id: intent.id,
        status: "ISSUED",
        intentTokenHash: intent.intentTokenHash,
        expiresAt: { gt: uploadStartedAt },
      },
      data: {
        status: "UPLOADING",
        uploadStartedAt,
        uploadLeaseOwner: leaseOwner,
        uploadLeaseExpiresAt,
        rowVersion: { increment: 1 },
      },
    });
    if (leased.count !== 1) throw new Error("EVIDENCE_UPLOAD_INTENT_RACE");
    const attachment = await tx.attachment.updateMany({
      where: {
        id: intent.attachmentId,
        uploadState: "INTENT_ISSUED",
        physicalState: "ABSENT",
        availabilityState: "QUARANTINED",
      },
      data: { uploadState: "UPLOADING", rowVersion: { increment: 1 } },
    });
    if (attachment.count !== 1) {
      throw new Error("EVIDENCE_UPLOAD_ATTACHMENT_RACE");
    }
  });
  return { leaseOwner, uploadLeaseExpiresAt };
}

function leasedUploadBody(input: {
  body: AsyncIterable<Uint8Array>;
  intentId: string;
  leaseOwner: string;
  initialLeaseExpiry: Date;
  leaseSeconds: number;
}) {
  return (async function* () {
    let leaseExpiry = input.initialLeaseExpiry.getTime();
    const renewLease = async () => {
      const nextExpiry = new Date(Date.now() + input.leaseSeconds * 1000);
      const renewed = await prisma.attachmentUploadIntent.updateMany({
        where: {
          id: input.intentId,
          status: "UPLOADING",
          uploadLeaseOwner: input.leaseOwner,
          uploadLeaseExpiresAt: { gt: new Date() },
        },
        data: {
          uploadLeaseExpiresAt: nextExpiry,
          rowVersion: { increment: 1 },
        },
      });
      if (renewed.count !== 1) {
        throw new Error("EVIDENCE_UPLOAD_LEASE_LOST");
      }
      leaseExpiry = nextExpiry.getTime();
    };
    for await (const chunk of input.body) {
      if (Date.now() >= leaseExpiry - Math.floor(input.leaseSeconds * 500)) {
        await renewLease();
      }
      yield chunk;
    }
    // Publication and fsync happen after the final body chunk. Renew once more so
    // the expiry reconciler cannot release quota while the broker is committing.
    await renewLease();
  })();
}

export async function storeEvidenceUploadContent(
  input: {
    intentId: string;
    intentToken: string;
    body: AsyncIterable<Uint8Array>;
    contentType: string;
  },
  dependencies: UploadDependencies = {},
) {
  const session = await requireSessionContext();
  const config = dependencies.config ?? readEvidenceStorageConfig();
  const intent = await loadAuthorizedIntent(
    session,
    input.intentId,
    input.intentToken,
  );
  if (
    intent.status !== "ISSUED" ||
    intent.expiresAt <= new Date() ||
    input.contentType !== intent.expectedMimeType ||
    !intent.expectedChecksum
  ) {
    throw new Error("EVIDENCE_UPLOAD_CONTENT_INVALID");
  }
  const objectStorage =
    dependencies.objectStorage ??
    createEvidenceStorageAdapters(config).objectStorage;
  if (intent.storageProvider !== objectStorage.provider) {
    throw new Error("EVIDENCE_UPLOAD_PROVIDER_MISMATCH");
  }
  const lease = await acquireUploadLease(intent, config);
  let exact: Awaited<ReturnType<ObjectStorageAdapter["writeExactVersion"]>>;
  try {
    exact = await objectStorage.writeExactVersion({
      key: intent.objectKey,
      versionId: intent.expectedObjectVersionId,
      body: leasedUploadBody({
        body: input.body,
        intentId: intent.id,
        leaseOwner: lease.leaseOwner,
        initialLeaseExpiry: lease.uploadLeaseExpiresAt,
        leaseSeconds: config.uploadLeaseSeconds,
      }),
      contentType: input.contentType,
      expectedSize: intent.expectedSizeBytes,
      expectedChecksumSha256Base64: intent.expectedChecksum,
    });
  } catch (error) {
    let objectAbsent = false;
    try {
      exact = await objectStorage.headExactVersion({
        key: intent.objectKey,
        versionId: intent.expectedObjectVersionId,
      });
    } catch (headError) {
      objectAbsent =
        headError instanceof Error &&
        (headError.message === "EVIDENCE_BROKER_OBJECT_NOT_FOUND" ||
          (config.provider === "local-private" &&
            (headError as NodeJS.ErrnoException).code === "ENOENT"));
      if (!objectAbsent) throw error;
    }
    if (!objectAbsent) {
      await finalizeDurableEvidenceUpload({
        intent,
        exact: exact!,
        config,
        actorUserId: session.user.id,
        recovered: true,
        uploadLeaseOwner: lease.leaseOwner,
      });
      return {
        attachmentId: intent.attachmentId,
        objectVersionId: intent.expectedObjectVersionId,
        status: "SCANNING" as const,
      };
    }
    if (intent.expiresAt > new Date()) {
      await prisma.$transaction(async (tx) => {
        const released = await tx.attachmentUploadIntent.updateMany({
          where: {
            id: intent.id,
            status: "UPLOADING",
            uploadLeaseOwner: lease.leaseOwner,
          },
          data: {
            status: "ISSUED",
            uploadStartedAt: null,
            uploadLeaseOwner: null,
            uploadLeaseExpiresAt: null,
            rowVersion: { increment: 1 },
          },
        });
        if (released.count === 1) {
          await tx.attachment.updateMany({
            where: { id: intent.attachmentId, uploadState: "UPLOADING" },
            data: {
              uploadState: "INTENT_ISSUED",
              rowVersion: { increment: 1 },
            },
          });
        }
      });
    }
    throw error;
  }
  await finalizeDurableEvidenceUpload({
    intent,
    exact,
    config,
    actorUserId: session.user.id,
    recovered: false,
    uploadLeaseOwner: lease.leaseOwner,
  });
  return {
    attachmentId: intent.attachmentId,
    objectVersionId: intent.expectedObjectVersionId,
    status: "SCANNING" as const,
  };
}

export async function recoverDurableEvidenceUploads(
  config: EvidenceStorageConfig,
  objectStorage: ObjectStorageAdapter,
  limit = 100,
) {
  const candidates = await prisma.attachmentUploadIntent.findMany({
    where: {
      OR: [
        { status: "ISSUED" },
        { status: "UPLOADING", uploadLeaseExpiresAt: { lte: new Date() } },
      ],
      storageProvider: objectStorage.provider,
      attachment: {
        objectVersionId: null,
        uploadState: { in: ["INTENT_ISSUED", "UPLOADING"] },
      },
    },
    include: {
      attachment: {
        include: {
          controlledEvidenceLinks: {
            where: { status: "ACTIVE", archivedAt: null },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 500)),
  });
  let recovered = 0;
  for (const intent of candidates) {
    let exact: Awaited<ReturnType<ObjectStorageAdapter["headExactVersion"]>>;
    try {
      exact = await objectStorage.headExactVersion({
        key: intent.objectKey,
        versionId: intent.expectedObjectVersionId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "EVIDENCE_BROKER_OBJECT_NOT_FOUND" ||
          (config.provider === "local-private" &&
            (error as NodeJS.ErrnoException).code === "ENOENT"))
      ) {
        continue;
      }
      throw error;
    }
    try {
      await finalizeDurableEvidenceUpload({
        intent: intent as DurableIntent,
        exact,
        config,
        actorUserId: intent.createdByUserId,
        recovered: true,
      });
      recovered += 1;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.endsWith("_RACE")) {
        throw error;
      }
    }
  }
  return { examined: candidates.length, recovered };
}

export function verifyIntentTokenForTest(token: string, hash: string) {
  return safeTokenMatch(token, hash);
}

export async function expireEvidenceUploadIntents(
  config: EvidenceStorageConfig = readEvidenceStorageConfig(),
  limit = 100,
  objectStorage?: ObjectStorageAdapter,
) {
  const candidates = await prisma.attachmentUploadIntent.findMany({
    where: {
      OR: [
        { status: "ISSUED", expiresAt: { lte: new Date() } },
        { status: "UPLOADING", uploadLeaseExpiresAt: { lte: new Date() } },
      ],
    },
    include: {
      attachment: {
        include: {
          controlledEvidenceLinks: {
            where: { status: "ACTIVE", archivedAt: null },
            take: 1,
          },
        },
      },
    },
    orderBy: { expiresAt: "asc" },
    take: Math.max(1, Math.min(limit, 500)),
  });
  let expired = 0;
  let recovered = 0;
  for (const intent of candidates) {
    if (objectStorage && intent.storageProvider === objectStorage.provider) {
      try {
        const exact = await objectStorage.headExactVersion({
          key: intent.objectKey,
          versionId: intent.expectedObjectVersionId,
        });
        await finalizeDurableEvidenceUpload({
          intent: intent as DurableIntent,
          exact,
          config,
          actorUserId: intent.createdByUserId,
          recovered: true,
        });
        recovered += 1;
        continue;
      } catch (error) {
        const absent =
          error instanceof Error &&
          (error.message === "EVIDENCE_BROKER_OBJECT_NOT_FOUND" ||
            (config.provider === "local-private" &&
              (error as NodeJS.ErrnoException).code === "ENOENT"));
        if (!absent) throw error;
      }
    }
    await prisma.$transaction(async (tx) => {
      const quota = await lockCompanyQuota(
        tx,
        intent.tenantId,
        intent.companyId,
        intent.storageEnvironment,
        config.defaultCompanyQuotaBytes,
      );
      const changed = await tx.attachmentUploadIntent.updateMany({
        where: {
          id: intent.id,
          OR: [
            { status: "ISSUED", expiresAt: { lte: new Date() } },
            {
              status: "UPLOADING",
              uploadLeaseExpiresAt: { lte: new Date() },
            },
          ],
        },
        data: {
          status: "EXPIRED",
          uploadLeaseOwner: null,
          uploadLeaseExpiresAt: null,
          invalidatedAt: new Date(),
          invalidationReason: "EVIDENCE_UPLOAD_INTENT_EXPIRED",
          rowVersion: { increment: 1 },
        },
      });
      if (changed.count !== 1) return;
      if (quota.reservedBytes < BigInt(intent.expectedSizeBytes)) {
        throw new Error("EVIDENCE_UPLOAD_QUOTA_RESERVATION_INVALID");
      }
      await tx.attachmentCompanyQuotaUsage.update({
        where: { id: quota.id },
        data: {
          reservedBytes: { decrement: BigInt(intent.expectedSizeBytes) },
          rowVersion: { increment: 1 },
        },
      });
      await tx.attachment.updateMany({
        where: {
          id: intent.attachmentId,
          uploadState: { in: ["INTENT_ISSUED", "UPLOADING"] },
          availabilityState: "QUARANTINED",
        },
        data: {
          uploadState: "EXPIRED",
          availabilityState: "EXPIRED",
          rowVersion: { increment: 1 },
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: intent.tenantId,
          companyId: intent.companyId,
          eventType: "controlled_evidence_upload.intent_expired",
          entityType: "Attachment",
          entityId: intent.attachmentId,
          metadata: { noSourceMutation: true, reservationReleased: true },
        },
      });
      expired += 1;
    });
  }
  return { examined: candidates.length, expired, recovered };
}
