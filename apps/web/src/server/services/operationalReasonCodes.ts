import { prisma } from "@ogfi/database";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { assertCanManageCompanyScope } from "./coreAdmin";
import { requireSessionContext, type SessionContext } from "./context";

export const operationalReasonWorkflows = [
  "WASTAGE",
  "STOCK_ADJUSTMENT",
  "RECEIVING_DISCREPANCY",
  "TRANSFER_DISCREPANCY",
  "STOCK_COUNT_VARIANCE",
  "PURCHASE_ORDER_CANCELLATION",
  "PURCHASE_ORDER_CLOSURE",
  "REVERSAL",
  "MASTER_DATA_CHANGE"
] as const;

export type OperationalReasonWorkflow = (typeof operationalReasonWorkflows)[number];

const reasonWorkflowSchema = z.enum(operationalReasonWorkflows);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]+/g, "_"))
  .refine((value) => /^[A-Z0-9_]+$/.test(value), "Invalid reason code format");

const optionalAppliesToSchema = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((value) => value || undefined);

const checkboxSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal("false")])
  .optional()
  .transform((value) => value === "on" || value === "true");

const createReasonCodeSchema = z.object({
  workflow: reasonWorkflowSchema,
  code: reasonCodeSchema,
  label: z.string().trim().min(2).max(160),
  appliesTo: optionalAppliesToSchema,
  requiresEvidence: checkboxSchema,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
  notes: z.string().trim().max(500).optional()
});

const deactivateReasonCodeSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5).max(500)
});

async function assertCanManageReasonCodes(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);
  await assertCanManageCompanyScope(session, session.context.companyId);
}

export async function listOperationalReasonCodes(session: SessionContext) {
  await requirePermission(session, permissions.coreAdminister);

  const codes = await prisma.operationalReasonCode.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    orderBy: [
      { workflow: "asc" },
      { status: "asc" },
      { sortOrder: "asc" },
      { code: "asc" }
    ]
  });

  return codes.map((code) => ({
    id: code.id,
    workflow: code.workflow as OperationalReasonWorkflow,
    code: code.code,
    label: code.label,
    appliesTo: code.appliesTo,
    requiresEvidence: code.requiresEvidence,
    status: code.status,
    sortOrder: code.sortOrder,
    notes: code.notes
  }));
}

export async function listActiveOperationalReasonCodes(
  session: SessionContext,
  workflow: OperationalReasonWorkflow,
  appliesTo?: string | null
) {
  const codes = await prisma.operationalReasonCode.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      workflow,
      status: "ACTIVE",
      OR: [{ appliesTo: null }, ...(appliesTo ? [{ appliesTo }] : [])]
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
  });

  return codes.map((code) => ({
    id: code.id,
    code: code.code,
    label: code.label,
    appliesTo: code.appliesTo,
    requiresEvidence: code.requiresEvidence
  }));
}

export async function getActiveOperationalReasonCode(
  session: SessionContext,
  workflow: OperationalReasonWorkflow,
  code: string,
  appliesTo?: string | null
) {
  const normalizedCode = reasonCodeSchema.parse(code);
  return prisma.operationalReasonCode.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      workflow,
      code: normalizedCode,
      status: "ACTIVE",
      OR: [{ appliesTo: null }, ...(appliesTo ? [{ appliesTo }] : [])]
    },
    orderBy: [{ appliesTo: "desc" }, { sortOrder: "asc" }]
  });
}

export async function requireActiveOperationalReasonCode(
  session: SessionContext,
  workflow: OperationalReasonWorkflow,
  code: string,
  appliesTo?: string | null
) {
  const reasonCode = await getActiveOperationalReasonCode(
    session,
    workflow,
    code,
    appliesTo
  );
  if (!reasonCode) {
    throw new Error("OPERATIONAL_REASON_CODE_INVALID");
  }
  return {
    id: reasonCode.id,
    code: reasonCode.code,
    label: reasonCode.label,
    appliesTo: reasonCode.appliesTo,
    requiresEvidence: reasonCode.requiresEvidence
  };
}

export async function createOperationalReasonCode(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReasonCodes(session);
  const values = createReasonCodeSchema.parse(Object.fromEntries(formData));

  const code = await prisma.$transaction(async (tx) => {
    const existing = await tx.operationalReasonCode.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        workflow: values.workflow,
        code: values.code
      },
      select: { id: true }
    });
    if (existing) {
      throw new Error("OPERATIONAL_REASON_CODE_DUPLICATE");
    }

    const created = await tx.operationalReasonCode.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        workflow: values.workflow,
        code: values.code,
        label: values.label,
        appliesTo: values.appliesTo ?? null,
        requiresEvidence: values.requiresEvidence,
        sortOrder: values.sortOrder,
        notes: values.notes ?? null
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "operational_reason_code.created",
        entityType: "OperationalReasonCode",
        entityId: created.id,
        afterData: {
          workflow: created.workflow,
          code: created.code,
          label: created.label,
          appliesTo: created.appliesTo,
          requiresEvidence: created.requiresEvidence,
          status: created.status
        },
        metadata: { notes: values.notes ?? null }
      }
    });

    return created;
  });

  return code.id;
}

export async function deactivateOperationalReasonCode(formData: FormData) {
  const session = await requireSessionContext();
  await assertCanManageReasonCodes(session);
  const values = deactivateReasonCodeSchema.parse(Object.fromEntries(formData));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.operationalReasonCode.findFirst({
      where: {
        id: values.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      }
    });

    if (!existing) {
      throw new Error("OPERATIONAL_REASON_CODE_NOT_FOUND");
    }
    if (existing.status !== "ACTIVE") {
      throw new Error("OPERATIONAL_REASON_CODE_NOT_ACTIVE");
    }

    const updated = await tx.operationalReasonCode.update({
      where: { id: existing.id },
      data: { status: "INACTIVE" }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "operational_reason_code.deactivated",
        entityType: "OperationalReasonCode",
        entityId: updated.id,
        beforeData: {
          workflow: existing.workflow,
          code: existing.code,
          label: existing.label,
          status: existing.status
        },
        afterData: {
          workflow: updated.workflow,
          code: updated.code,
          label: updated.label,
          status: updated.status
        },
        metadata: { reason: values.reason }
      }
    });
  });
}
