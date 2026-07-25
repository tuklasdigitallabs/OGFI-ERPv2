import { prisma, type Prisma } from "@ogfi/database";
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

const reasonCodePageInputSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  query: z.string().trim().max(120).default(""),
  workflow: reasonWorkflowSchema.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type OperationalReasonCodePageInput = z.input<
  typeof reasonCodePageInputSchema
>;

function projectReasonCode(code: {
  id: string;
  workflow: string;
  code: string;
  label: string;
  appliesTo: string | null;
  requiresEvidence: boolean;
  status: string;
  sortOrder: number;
  notes: string | null;
}) {
  return {
    id: code.id,
    workflow: code.workflow as OperationalReasonWorkflow,
    code: code.code,
    label: code.label,
    appliesTo: code.appliesTo,
    requiresEvidence: code.requiresEvidence,
    status: code.status,
    sortOrder: code.sortOrder,
    notes: code.notes,
  };
}

export async function listOperationalReasonCodePage(
  session: SessionContext,
  input: OperationalReasonCodePageInput = {},
) {
  await assertCanManageReasonCodes(session);
  const values = reasonCodePageInputSchema.parse(input);
  const query = values.query.trim();
  const baseWhere: Prisma.OperationalReasonCodeWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(values.status ? { status: values.status } : {}),
    ...(query
      ? {
          OR: [
            { code: { contains: query, mode: "insensitive" } },
            { label: { contains: query, mode: "insensitive" } },
            { appliesTo: { contains: query, mode: "insensitive" } },
            { notes: { contains: query, mode: "insensitive" } },
            { workflow: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const where: Prisma.OperationalReasonCodeWhereInput = {
    ...baseWhere,
    ...(values.workflow ? { workflow: values.workflow } : {}),
  };
  const workflowCounts = await Promise.all(
    operationalReasonWorkflows.map(async (workflow) => [
      workflow,
      await prisma.operationalReasonCode.count({
        where: { ...baseWhere, workflow },
      }),
    ] as const),
  );
  const [totalItems, activeItems, evidenceItems, items] = await Promise.all([
    prisma.operationalReasonCode.count({ where }),
    prisma.operationalReasonCode.count({
      where: { ...where, status: "ACTIVE" },
    }),
    prisma.operationalReasonCode.count({
      where: { ...where, requiresEvidence: true },
    }),
    prisma.operationalReasonCode.findMany({
      where,
      orderBy: [
        { workflow: "asc" },
        { status: "asc" },
        { sortOrder: "asc" },
        { code: "asc" },
        { id: "asc" },
      ],
      skip: (values.page - 1) * values.pageSize,
      take: values.pageSize,
    }),
  ]);
  return {
    items: items.map(projectReasonCode),
    page: values.page,
    pageSize: values.pageSize,
    totalItems,
    activeItems,
    evidenceItems,
    workflowCounts: Object.fromEntries(workflowCounts) as Record<
      OperationalReasonWorkflow,
      number
    >,
  };
}

export async function getOperationalReasonCodeDetail(
  session: SessionContext,
  reasonCodeId: string,
) {
  await assertCanManageReasonCodes(session);
  const id = z.string().uuid().parse(reasonCodeId);
  const code = await prisma.operationalReasonCode.findFirst({
    where: {
      id,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
    },
    select: {
      id: true,
      workflow: true,
      code: true,
      label: true,
      appliesTo: true,
      requiresEvidence: true,
      status: true,
      sortOrder: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return code ? { ...projectReasonCode(code), createdAt: code.createdAt.toISOString(), updatedAt: code.updatedAt.toISOString() } : null;
}

export async function listOperationalReasonCodes(session: SessionContext) {
  await assertCanManageReasonCodes(session);

  const codes = await prisma.operationalReasonCode.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    orderBy: [
      { workflow: "asc" },
      { status: "asc" },
      { sortOrder: "asc" },
      { code: "asc" },
      { id: "asc" }
    ]
  });

  return codes.map(projectReasonCode);
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

    const transition = await tx.operationalReasonCode.updateMany({
      where: {
        id: existing.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      data: { status: "INACTIVE" }
    });
    if (transition.count !== 1) {
      throw new Error("OPERATIONAL_REASON_CODE_NOT_ACTIVE");
    }
    const updated = await tx.operationalReasonCode.findUniqueOrThrow({
      where: { id: existing.id }
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
