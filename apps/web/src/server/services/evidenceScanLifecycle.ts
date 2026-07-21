import { prisma, type Prisma, type TransactionClient } from "@ogfi/database";
import { createHash, randomUUID } from "node:crypto";
import {
  authorizeControlledEvidenceSourceAction,
  type EvidenceAttachmentSourceType,
} from "./attachments";
import type { SessionContext } from "./context";
import {
  expireEvidenceUploadIntents,
  evidenceFilenameMatchesMimeType,
  recoverDurableEvidenceUploads,
} from "./evidenceUploads";
import {
  readEvidenceStorageConfig,
  type EvidenceStorageConfig,
} from "./evidenceStorageConfig";
import {
  createEvidenceStorageAdapters,
  isCleanMalwareScanResult,
  type MalwareScanAssessment,
  type MalwareScanAdapter,
  type MalwareScanResult,
  type ObjectStorageAdapter,
} from "../storage";

const terminalResultStates = {
  THREATS_FOUND: "THREAT_FOUND",
  UNSUPPORTED: "UNSUPPORTED",
  ACCESS_DENIED: "ACCESS_DENIED",
  FAILED: "FAILED",
  INDETERMINATE: "FAILED",
} as const;

export function isRetryableEvidenceScanResult(
  result: MalwareScanResult,
  staleSignatures: boolean,
) {
  return (
    staleSignatures ||
    ["PENDING", "ACCESS_DENIED", "FAILED", "INDETERMINATE"].includes(result)
  );
}

type ScanDependencies = {
  config?: EvidenceStorageConfig;
  objectStorage?: ObjectStorageAdapter;
  malwareScan?: MalwareScanAdapter;
};

type ExactAttachment = {
  id: string;
  tenantId: string;
  companyId: string;
  storageProvider: string;
  objectKey: string;
  objectVersionId: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  uploadState: string;
  scanState: string;
  availabilityState: string;
  physicalState: string;
  scanRequestedAt: Date | null;
  scanVerifiedObjectVersionId: string | null;
  reconciliationAttemptCount: number;
  rowVersion: number;
};

function checksumsMatch(left: string, right: string) {
  const normalize = (value: string) =>
    value.startsWith("sha256:") ? value.slice(7).toLowerCase() : value;
  const a = normalize(left);
  const b = normalize(right);
  if (/^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b)) return a === b;
  return a === b;
}

function checksumHex(value: string | null) {
  if (!value) throw new Error("EVIDENCE_CHECKSUM_REQUIRED");
  const normalized = value.startsWith("sha256:") ? value.slice(7) : value;
  if (/^[a-f0-9]{64}$/.test(normalized)) return normalized;
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.byteLength !== 32) throw new Error("EVIDENCE_CHECKSUM_INVALID");
  return bytes.toString("hex");
}

function looksLikeUtf8Text(body: Buffer) {
  if (body.includes(0)) return false;
  return !body.toString("utf8").includes("\uFFFD");
}

export function detectEvidenceMimeType(body: Uint8Array) {
  const buffer = Buffer.from(body);
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return null;
  }
  if (looksLikeUtf8Text(buffer)) return "text/plain";
  return null;
}

function detectedMimeAcceptsDeclared(detected: string, declared: string) {
  return (
    detected === declared ||
    (detected === "text/plain" && declared === "text/plain")
  );
}

async function readAndVerifyExactVersion(input: {
  attachment: ExactAttachment;
  objectStorage: ObjectStorageAdapter;
  maximumBytes: number;
}) {
  const versionId = input.attachment.objectVersionId;
  if (!versionId) throw new Error("EVIDENCE_EXACT_VERSION_REQUIRED");
  const streamed = await input.objectStorage.streamExactVersion({
    key: input.attachment.objectKey,
    versionId,
  });
  const chunks: Buffer[] = [];
  let total = 0;
  const hash = createHash("sha256");
  for await (const chunk of streamed.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > input.maximumBytes || total > input.attachment.sizeBytes) {
      throw new Error("EVIDENCE_STREAM_SIZE_EXCEEDED");
    }
    chunks.push(bytes);
    hash.update(bytes);
  }
  if (
    total !== input.attachment.sizeBytes ||
    (streamed.contentLength !== undefined && streamed.contentLength !== total)
  ) {
    throw new Error("EVIDENCE_STREAM_SIZE_MISMATCH");
  }
  const digestBase64 = hash.digest("base64");
  if (
    !input.attachment.checksum ||
    !checksumsMatch(digestBase64, input.attachment.checksum) ||
    (streamed.checksumSha256Base64 !== undefined &&
      !checksumsMatch(digestBase64, streamed.checksumSha256Base64))
  ) {
    throw new Error("EVIDENCE_STREAM_CHECKSUM_MISMATCH");
  }
  const body = Buffer.concat(chunks);
  const detectedMimeType = detectEvidenceMimeType(body);
  if (
    !detectedMimeType ||
    !detectedMimeAcceptsDeclared(detectedMimeType, input.attachment.mimeType) ||
    !evidenceFilenameMatchesMimeType(
      input.attachment.originalFilename,
      detectedMimeType,
    ) ||
    (streamed.contentType !== undefined &&
      streamed.contentType !== input.attachment.mimeType)
  ) {
    throw new Error("EVIDENCE_STREAM_CONTENT_TYPE_MISMATCH");
  }
  return { body, digestBase64, detectedMimeType };
}

async function auditScanTransition(
  tx: TransactionClient,
  attachment: ExactAttachment,
  eventType: string,
  afterData: Record<string, unknown>,
) {
  await tx.auditEvent.create({
    data: {
      tenantId: attachment.tenantId,
      companyId: attachment.companyId,
      eventType,
      entityType: "Attachment",
      entityId: attachment.id,
      afterData: afterData as Prisma.InputJsonObject,
      metadata: {
        noSourceMutation: true,
        exactVersionRequired: true,
        providerResultReRead: true,
      },
    },
  });
}

async function rejectTimedOutAttachment(
  attachment: ExactAttachment,
  scanState: "TIMED_OUT" | "FAILED",
) {
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const changed = await tx.attachment.updateMany({
      where: {
        id: attachment.id,
        objectVersionId: attachment.objectVersionId,
        availabilityState: "QUARANTINED",
        rowVersion: attachment.rowVersion,
      },
      data: {
        scanState,
        availabilityState: "REJECTED",
        rejectedAt: now,
        scanCompletedAt: now,
        scanVerifiedObjectVersionId: attachment.objectVersionId,
        reconciliationLeaseOwner: null,
        reconciliationLeaseExpiresAt: null,
        reconciliationNextAttemptAt: null,
        lastReconciledAt: now,
        rowVersion: { increment: 1 },
      },
    });
    if (changed.count === 1) {
      await tx.attachmentScanAttempt.create({
        data: {
          tenantId: attachment.tenantId,
          companyId: attachment.companyId,
          attachmentId: attachment.id,
          objectVersionId: attachment.objectVersionId as string,
          scanProvider: "reconciler",
          scannerEngineVersion: "unavailable",
          signatureVersion: "unavailable",
          startedAt: now,
          completedAt: now,
          result: scanState,
          safeFailureCode:
            scanState === "TIMED_OUT"
              ? "EVIDENCE_SCAN_PENDING_TIMEOUT"
              : "EVIDENCE_SCAN_RETRY_EXHAUSTED",
          plaintextChecksum: checksumHex(attachment.checksum),
        },
      });
      await auditScanTransition(
        tx,
        attachment,
        scanState === "TIMED_OUT"
          ? "controlled_evidence_scan.timed_out"
          : "controlled_evidence_scan.retry_exhausted",
        { scanState, availabilityState: "REJECTED", alertRequired: true },
      );
    }
  });
}

export async function processEvidenceScan(
  attachmentId: string,
  dependencies: ScanDependencies = {},
) {
  const config = dependencies.config ?? readEvidenceStorageConfig();
  const adapters =
    !dependencies.objectStorage || !dependencies.malwareScan
      ? createEvidenceStorageAdapters(config)
      : null;
  const objectStorage = dependencies.objectStorage ?? adapters!.objectStorage;
  const malwareScan = dependencies.malwareScan ?? adapters!.malwareScan;
  const pendingTimeoutMinutes =
    config.provider === "hostinger-local" ? config.pendingTimeoutMinutes : 60;
  const retryIntervalSeconds =
    config.provider === "hostinger-local"
      ? config.reconciliationIntervalSeconds
      : 300;
  const attachment = (await prisma.attachment.findUnique({
    where: { id: attachmentId },
  })) as ExactAttachment | null;
  if (!attachment || !attachment.objectVersionId) {
    throw new Error("EVIDENCE_ATTACHMENT_NOT_AVAILABLE");
  }
  if (attachment.storageProvider !== objectStorage.provider) {
    throw new Error("EVIDENCE_SCAN_PROVIDER_MISMATCH");
  }
  if (
    attachment.uploadState !== "VERIFIED" ||
    attachment.physicalState !== "DURABLE" ||
    attachment.availabilityState === "REMOVED" ||
    attachment.availabilityState === "EXPIRED"
  ) {
    throw new Error("EVIDENCE_SCAN_STATE_INVALID");
  }
  if (
    attachment.availabilityState === "AVAILABLE" &&
    attachment.scanState === "CLEAN" &&
    attachment.scanVerifiedObjectVersionId === attachment.objectVersionId
  ) {
    return { status: "AVAILABLE" as const, alreadyProcessed: true };
  }

  const priorTerminalDetection = await prisma.attachmentScanAttempt.findFirst({
    where: {
      attachmentId: attachment.id,
      tenantId: attachment.tenantId,
      companyId: attachment.companyId,
      objectVersionId: attachment.objectVersionId,
      result: { in: ["THREAT_FOUND", "UNSUPPORTED"] },
    },
    orderBy: { completedAt: "asc" },
    select: { result: true },
  });
  if (priorTerminalDetection) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.attachment.updateMany({
        where: {
          id: attachment.id,
          objectVersionId: attachment.objectVersionId,
          availabilityState: { in: ["QUARANTINED", "AVAILABLE"] },
        },
        data: {
          scanState: priorTerminalDetection.result,
          availabilityState: "REJECTED",
          rejectedAt: new Date(),
          reconciliationLeaseOwner: null,
          reconciliationLeaseExpiresAt: null,
          reconciliationNextAttemptAt: null,
          lastReconciledAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
      if (changed.count === 1) {
        await auditScanTransition(
          tx,
          attachment,
          "controlled_evidence_scan.prior_terminal_result_enforced",
          {
            scanState: priorTerminalDetection.result,
            availabilityState: "REJECTED",
          },
        );
      }
    });
    return { status: "REJECTED" as const, alreadyProcessed: true };
  }

  const exact = {
    key: attachment.objectKey,
    versionId: attachment.objectVersionId,
  };
  if (
    attachment.scanRequestedAt &&
    attachment.scanRequestedAt.getTime() + pendingTimeoutMinutes * 60_000 <=
      Date.now()
  ) {
    await rejectTimedOutAttachment(attachment, "TIMED_OUT");
    return { status: "REJECTED" as const, alreadyProcessed: false };
  }
  const scanStartedAt = new Date();
  let assessment: MalwareScanAssessment;
  try {
    assessment = await malwareScan.scanExactVersion(exact);
  } catch {
    assessment = {
      result: "FAILED",
      engineVersion: "unavailable",
      signatureVersion: "unavailable",
    };
  }
  const scanCompletedAt = new Date();
  const staleSignatures =
    config.provider === "hostinger-local" &&
    (!assessment.signaturePublishedAt ||
      assessment.signaturePublishedAt.getTime() <
        Date.now() - config.maximumSignatureAgeHours * 60 * 60 * 1000);
  if (staleSignatures) {
    assessment = { ...assessment, result: "FAILED" };
  }
  if (!isCleanMalwareScanResult(assessment)) {
    if (assessment.result === "PENDING") {
      await prisma.attachment.updateMany({
        where: { id: attachment.id, rowVersion: attachment.rowVersion },
        data: {
          reconciliationNextAttemptAt: new Date(
            Date.now() +
              Math.min(
                retryIntervalSeconds *
                  1000 *
                  2 ** Math.max(0, attachment.reconciliationAttemptCount - 1),
                60 * 60 * 1000,
              ),
          ),
          reconciliationLeaseOwner: null,
          reconciliationLeaseExpiresAt: null,
          lastReconciledAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
      return { status: "QUARANTINED" as const, alreadyProcessed: false };
    }
    const retryableFailure = isRetryableEvidenceScanResult(
      assessment.result,
      staleSignatures,
    );
    if (retryableFailure) {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.attachment.updateMany({
          where: {
            id: attachment.id,
            objectVersionId: attachment.objectVersionId,
            scanState: "PENDING",
            availabilityState: "QUARANTINED",
            rowVersion: attachment.rowVersion,
          },
          data: {
            reconciliationNextAttemptAt: new Date(
              Date.now() +
                Math.min(
                  retryIntervalSeconds *
                    1000 *
                    2 ** Math.max(0, attachment.reconciliationAttemptCount - 1),
                  60 * 60 * 1000,
                ),
            ),
            reconciliationLeaseOwner: null,
            reconciliationLeaseExpiresAt: null,
            lastReconciledAt: new Date(),
            rowVersion: { increment: 1 },
          },
        });
        if (changed.count === 1) {
          await tx.attachmentScanAttempt.create({
            data: {
              tenantId: attachment.tenantId,
              companyId: attachment.companyId,
              attachmentId: attachment.id,
              objectVersionId: attachment.objectVersionId as string,
              scanProvider: malwareScan.provider,
              scannerEngineVersion: assessment.engineVersion,
              signatureVersion: assessment.signatureVersion,
              signaturePublishedAt: assessment.signaturePublishedAt ?? null,
              startedAt: scanStartedAt,
              completedAt: scanCompletedAt,
              result:
                assessment.result === "ACCESS_DENIED"
                  ? "ACCESS_DENIED"
                  : "FAILED",
              safeFailureCode: staleSignatures
                ? "EVIDENCE_SCAN_SIGNATURE_STALE"
                : `EVIDENCE_SCAN_${assessment.result}`,
              plaintextChecksum: checksumHex(attachment.checksum),
            },
          });
        }
      });
      return { status: "QUARANTINED" as const, alreadyProcessed: false };
    }
    const scanState =
      terminalResultStates[
        assessment.result as keyof typeof terminalResultStates
      ] ?? "FAILED";
    await prisma.$transaction(async (tx) => {
      await tx.attachmentScanAttempt.create({
        data: {
          tenantId: attachment.tenantId,
          companyId: attachment.companyId,
          attachmentId: attachment.id,
          objectVersionId: attachment.objectVersionId as string,
          scanProvider: malwareScan.provider,
          scannerEngineVersion: assessment.engineVersion,
          signatureVersion: assessment.signatureVersion,
          signaturePublishedAt: assessment.signaturePublishedAt ?? null,
          startedAt: scanStartedAt,
          completedAt: scanCompletedAt,
          result: scanState,
          safeFailureCode: staleSignatures
            ? "EVIDENCE_SCAN_SIGNATURE_STALE"
            : `EVIDENCE_SCAN_${assessment.result}`,
          plaintextChecksum: checksumHex(attachment.checksum),
        },
      });
      const changed = await tx.attachment.updateMany({
        where: {
          id: attachment.id,
          objectVersionId: attachment.objectVersionId,
          availabilityState: { in: ["QUARANTINED", "AVAILABLE"] },
        },
        data: {
          scanState,
          availabilityState: "REJECTED",
          rejectedAt: new Date(),
          scanCompletedAt,
          scanVerifiedObjectVersionId: attachment.objectVersionId,
          reconciliationLeaseOwner: null,
          reconciliationLeaseExpiresAt: null,
          reconciliationNextAttemptAt: null,
          lastReconciledAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
      if (changed.count === 1) {
        await auditScanTransition(
          tx,
          attachment,
          "controlled_evidence_scan.rejected",
          { scanState, availabilityState: "REJECTED" },
        );
      }
    });
    return { status: "REJECTED" as const, alreadyProcessed: false };
  }

  let verified: Awaited<ReturnType<typeof readAndVerifyExactVersion>>;
  try {
    verified = await readAndVerifyExactVersion({
      attachment,
      objectStorage,
      maximumBytes: config.maxUploadBytes,
    });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.attachmentScanAttempt.create({
        data: {
          tenantId: attachment.tenantId,
          companyId: attachment.companyId,
          attachmentId: attachment.id,
          objectVersionId: attachment.objectVersionId as string,
          scanProvider: malwareScan.provider,
          scannerEngineVersion: assessment.engineVersion,
          signatureVersion: assessment.signatureVersion,
          signaturePublishedAt: assessment.signaturePublishedAt ?? null,
          startedAt: scanStartedAt,
          completedAt: new Date(),
          result: "FAILED",
          safeFailureCode: "EVIDENCE_CONTENT_INTEGRITY_FAILED",
          plaintextChecksum: checksumHex(attachment.checksum),
        },
      });
      const changed = await tx.attachment.updateMany({
        where: {
          id: attachment.id,
          objectVersionId: attachment.objectVersionId,
          availabilityState: { in: ["QUARANTINED", "AVAILABLE"] },
        },
        data: {
          scanState: "FAILED",
          availabilityState: "REJECTED",
          rejectedAt: new Date(),
          scanCompletedAt: new Date(),
          scanVerifiedObjectVersionId: attachment.objectVersionId,
          reconciliationLeaseOwner: null,
          reconciliationLeaseExpiresAt: null,
          reconciliationNextAttemptAt: null,
          lastReconciledAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
      if (changed.count === 1) {
        await auditScanTransition(
          tx,
          attachment,
          "controlled_evidence_scan.integrity_rejected",
          {
            scanState: "FAILED",
            availabilityState: "REJECTED",
            reasonCode:
              error instanceof Error
                ? error.message
                : "EVIDENCE_CONTENT_INTEGRITY_FAILED",
          },
        );
      }
    });
    throw error;
  }

  const cleanTransitionApplied = await prisma.$transaction(async (tx) => {
    const terminalDetection = await tx.attachmentScanAttempt.findFirst({
      where: {
        attachmentId: attachment.id,
        tenantId: attachment.tenantId,
        companyId: attachment.companyId,
        objectVersionId: attachment.objectVersionId as string,
        result: { in: ["THREAT_FOUND", "UNSUPPORTED"] },
      },
      select: { id: true },
    });
    if (terminalDetection) return false;
    const changed = await tx.attachment.updateMany({
      where: {
        id: attachment.id,
        objectVersionId: attachment.objectVersionId,
        uploadState: "VERIFIED",
        scanState: "PENDING",
        availabilityState: "QUARANTINED",
        rowVersion: attachment.rowVersion,
      },
      data: {
        detectedMimeType: verified.detectedMimeType,
        detectedChecksum: verified.digestBase64,
        scanState: "CLEAN",
        availabilityState: "AVAILABLE",
        scanVerifiedObjectVersionId: attachment.objectVersionId,
        scanCompletedAt: new Date(),
        availableAt: new Date(),
        retentionClass: "PRESERVATION_PENDING_APPROVED_POLICY",
        retainUntil: null,
        reconciliationLeaseOwner: null,
        reconciliationLeaseExpiresAt: null,
        reconciliationNextAttemptAt: null,
        lastReconciledAt: new Date(),
        rowVersion: { increment: 1 },
      },
    });
    if (changed.count === 1) {
      await tx.attachmentScanAttempt.create({
        data: {
          tenantId: attachment.tenantId,
          companyId: attachment.companyId,
          attachmentId: attachment.id,
          objectVersionId: attachment.objectVersionId as string,
          scanProvider: malwareScan.provider,
          scannerEngineVersion: assessment.engineVersion,
          signatureVersion: assessment.signatureVersion,
          signaturePublishedAt: assessment.signaturePublishedAt ?? null,
          startedAt: scanStartedAt,
          completedAt: scanCompletedAt,
          result: "CLEAN",
          plaintextChecksum: checksumHex(attachment.checksum),
        },
      });
      await auditScanTransition(
        tx,
        attachment,
        "controlled_evidence_scan.available",
        {
          scanState: "CLEAN",
          availabilityState: "AVAILABLE",
          detectedMimeType: verified.detectedMimeType,
          retentionClass: "PRESERVATION_PENDING_APPROVED_POLICY",
          retainUntil: null,
        },
      );
    }
    return changed.count === 1;
  });
  if (!cleanTransitionApplied) {
    throw new Error("EVIDENCE_SCAN_STATE_RACE");
  }
  return { status: "AVAILABLE" as const, alreadyProcessed: false };
}

export async function readAvailableEvidenceAttachmentForSession(
  session: SessionContext,
  controlledEvidenceAttachmentId: string,
  dependencies: ScanDependencies = {},
) {
  const link = await prisma.controlledEvidenceAttachment.findFirst({
    where: {
      id: controlledEvidenceAttachmentId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      status: "ACTIVE",
      archivedAt: null,
    },
    include: { attachment: true },
  });
  if (!link) throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE");
  await authorizeControlledEvidenceSourceAction({
    session,
    sourceType: link.sourceType as EvidenceAttachmentSourceType,
    sourceRecordId: link.sourceRecordId,
    attemptedAction: "DOWNLOAD",
  });
  const attachment = link.attachment as ExactAttachment;
  if (
    attachment.uploadState !== "VERIFIED" ||
    attachment.scanState !== "CLEAN" ||
    attachment.availabilityState !== "AVAILABLE" ||
    attachment.physicalState !== "DURABLE" ||
    !attachment.objectVersionId ||
    attachment.scanVerifiedObjectVersionId !== attachment.objectVersionId
  ) {
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE");
  }
  const config = dependencies.config ?? readEvidenceStorageConfig();
  const objectStorage =
    dependencies.objectStorage ??
    createEvidenceStorageAdapters(config).objectStorage;
  if (attachment.storageProvider !== objectStorage.provider) {
    throw new Error("CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE");
  }
  const streamed = await objectStorage.streamExactVersion({
    key: attachment.objectKey,
    versionId: attachment.objectVersionId,
  });
  if (
    streamed.contentLength !== attachment.sizeBytes ||
    streamed.contentLength > config.maxUploadBytes ||
    streamed.contentType !== attachment.mimeType ||
    !attachment.checksum ||
    !streamed.checksumSha256Base64 ||
    !checksumsMatch(streamed.checksumSha256Base64, attachment.checksum)
  ) {
    throw new Error("EVIDENCE_STREAM_METADATA_MISMATCH");
  }
  await prisma.auditEvent.create({
    data: {
      tenantId: attachment.tenantId,
      companyId: attachment.companyId,
      actorUserId: session.user.id,
      eventType: "controlled_evidence_attachment.download_started",
      entityType: "ControlledEvidenceAttachment",
      entityId: link.id,
      metadata: {
        attachmentId: attachment.id,
        objectVersionId: attachment.objectVersionId,
        exactVersionVerified: true,
      },
    },
  });
  const body = streamed.body;
  const auditContext = {
    tenantId: attachment.tenantId,
    companyId: attachment.companyId,
    actorUserId: session.user.id,
    entityId: link.id,
    attachmentId: attachment.id,
    objectVersionId: attachment.objectVersionId,
  };
  return {
    body: (async function* () {
      const hash = createHash("sha256");
      let total = 0;
      try {
        for await (const chunk of body) {
          const bytes = Buffer.from(chunk);
          total += bytes.byteLength;
          if (total > attachment.sizeBytes || total > config.maxUploadBytes) {
            throw new Error("EVIDENCE_STREAM_SIZE_EXCEEDED");
          }
          hash.update(bytes);
          yield bytes;
        }
        if (
          total !== attachment.sizeBytes ||
          !checksumsMatch(hash.digest("base64"), attachment.checksum as string)
        ) {
          throw new Error("EVIDENCE_STREAM_INTEGRITY_FAILED");
        }
        await prisma.auditEvent.create({
          data: {
            tenantId: auditContext.tenantId,
            companyId: auditContext.companyId,
            actorUserId: auditContext.actorUserId,
            eventType: "controlled_evidence_attachment.downloaded",
            entityType: "ControlledEvidenceAttachment",
            entityId: auditContext.entityId,
            metadata: {
              attachmentId: auditContext.attachmentId,
              objectVersionId: auditContext.objectVersionId,
              exactVersionVerified: true,
              streamedBytes: total,
            },
          },
        });
      } catch (error) {
        await prisma.auditEvent.create({
          data: {
            tenantId: auditContext.tenantId,
            companyId: auditContext.companyId,
            actorUserId: auditContext.actorUserId,
            eventType: "controlled_evidence_attachment.download_failed",
            entityType: "ControlledEvidenceAttachment",
            entityId: auditContext.entityId,
            metadata: {
              attachmentId: auditContext.attachmentId,
              objectVersionId: auditContext.objectVersionId,
              safeFailureCode: "EVIDENCE_STREAM_INTEGRITY_FAILED",
              streamedBytes: total,
            },
          },
        });
        throw error;
      }
    })(),
    originalFilename: link.attachment.originalFilename,
    mimeType: link.attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  };
}

export async function reconcileEvidenceScans(
  dependencies: ScanDependencies = {},
) {
  const config = dependencies.config ?? readEvidenceStorageConfig();
  if (config.provider !== "hostinger-local" || !config.reconciliationEnabled) {
    return { claimed: 0, processed: 0 };
  }
  const objectStorage =
    dependencies.objectStorage ??
    createEvidenceStorageAdapters(config).objectStorage;
  const uploadRecovery = await recoverDurableEvidenceUploads(
    config,
    objectStorage,
    config.reconciliationBatchSize,
  );
  const uploadExpiry = await expireEvidenceUploadIntents(
    config,
    config.reconciliationBatchSize,
    objectStorage,
  );
  const owner = `evidence-reconcile:${randomUUID()}`;
  const leaseExpiresAt = new Date(
    Date.now() + config.reconciliationLeaseSeconds * 1000,
  );
  const exhausted = (await prisma.attachment.findMany({
    where: {
      uploadState: "VERIFIED",
      scanState: "PENDING",
      availabilityState: "QUARANTINED",
      OR: [
        {
          reconciliationAttemptCount: {
            gte: config.reconciliationMaxAttempts,
          },
        },
        {
          scanRequestedAt: {
            lte: new Date(Date.now() - config.pendingTimeoutMinutes * 60_000),
          },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: config.reconciliationBatchSize,
  })) as ExactAttachment[];
  for (const attachment of exhausted) {
    const timedOut =
      attachment.scanRequestedAt !== null &&
      attachment.scanRequestedAt.getTime() +
        config.pendingTimeoutMinutes * 60_000 <=
        Date.now();
    await rejectTimedOutAttachment(
      attachment,
      timedOut ? "TIMED_OUT" : "FAILED",
    );
  }
  const claimed = await prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(hashtext('ogfi-evidence-scan-reconcile')) AS acquired`,
    );
    if (!lock[0]?.acquired) return [];
    const candidates = await tx.attachment.findMany({
      where: {
        uploadState: "VERIFIED",
        scanState: "PENDING",
        availabilityState: "QUARANTINED",
        objectVersionId: { not: null },
        reconciliationAttemptCount: { lt: config.reconciliationMaxAttempts },
        AND: [
          {
            OR: [
              { reconciliationNextAttemptAt: null },
              { reconciliationNextAttemptAt: { lte: new Date() } },
            ],
          },
          {
            OR: [
              { reconciliationLeaseExpiresAt: null },
              { reconciliationLeaseExpiresAt: { lte: new Date() } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: config.reconciliationBatchSize,
      select: { id: true, rowVersion: true },
    });
    const ids: string[] = [];
    for (const candidate of candidates) {
      const leased = await tx.attachment.updateMany({
        where: { id: candidate.id, rowVersion: candidate.rowVersion },
        data: {
          reconciliationLeaseOwner: owner,
          reconciliationLeaseExpiresAt: leaseExpiresAt,
          reconciliationAttemptCount: { increment: 1 },
          rowVersion: { increment: 1 },
        },
      });
      if (leased.count === 1) ids.push(candidate.id);
    }
    return ids;
  });

  let processed = 0;
  for (const id of claimed) {
    try {
      await processEvidenceScan(id, dependencies);
      processed += 1;
    } catch {
      const failed = await prisma.attachment.findUnique({
        where: { id },
        select: { reconciliationAttemptCount: true },
      });
      const retryDelaySeconds = Math.min(
        config.reconciliationIntervalSeconds *
          2 ** Math.max(0, (failed?.reconciliationAttemptCount ?? 1) - 1),
        60 * 60,
      );
      await prisma.attachment.updateMany({
        where: { id, reconciliationLeaseOwner: owner },
        data: {
          reconciliationLeaseOwner: null,
          reconciliationLeaseExpiresAt: null,
          reconciliationNextAttemptAt: new Date(
            Date.now() + retryDelaySeconds * 1000,
          ),
          lastReconciledAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
    }
  }
  return {
    claimed: claimed.length,
    processed,
    terminalized: exhausted.length,
    recoveredUploads: uploadRecovery.recovered + uploadExpiry.recovered,
    expiredUploadIntents: uploadExpiry.expired,
  };
}

export type { MalwareScanResult };
