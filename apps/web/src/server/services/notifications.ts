import { prisma, type TransactionClient } from "@ogfi/database";
import type { SessionContext } from "./context";

type NotificationClient = typeof prisma | TransactionClient;

type NotificationPriority = "CRITICAL" | "HIGH" | "NORMAL" | "INFORMATIONAL";
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type WorkflowNotificationInput = {
  tenantId: string;
  companyId?: string | null;
  locationId?: string | null;
  recipientUserIds: string[];
  notificationType: string;
  priority?: NotificationPriority;
  title: string;
  body: string;
  deepLink: string;
  entityType: string;
  entityId?: string | null;
  sourceEventKey: string;
  recipientBasis?: string;
  metadata?: JsonValue;
};

type ApprovalNotificationSourceInput = {
  tenantId: string;
  companyId: string;
  locationId: string | null;
  approvalInstanceId: string;
  publicReference: string;
  locationName: string;
  entityLabel: string;
  entityType: string;
  entityId: string;
};

type ApprovalOutcomeNotificationInput = ApprovalNotificationSourceInput & {
  recipientUserIds: string[];
  outcome: "APPROVED" | "RETURNED" | "REJECTED";
};

type ApprovalStepReadyNotificationInput = ApprovalNotificationSourceInput & {
  approvalInstanceStepId: string;
  stepOrder: number;
  recipientUserId: string;
};

type ScopedRecipientInput = {
  tenantId: string;
  companyId: string;
  locationId?: string | null;
  assignedUserId?: string | null;
  assignedRoleId?: string | null;
};

type ScopeFilter = {
  scopeType: "COMPANY" | "LOCATION";
  scopeId: string;
  status: "ACTIVE";
};

export async function resolveScopedNotificationRecipients(
  client: NotificationClient,
  input: ScopedRecipientInput
) {
  const scopeFilters: ScopeFilter[] = [
    {
      scopeType: "COMPANY" as const,
      scopeId: input.companyId,
      status: "ACTIVE" as const
    }
  ];
  if (input.locationId) {
    scopeFilters.push({
      scopeType: "LOCATION" as const,
      scopeId: input.locationId,
      status: "ACTIVE" as const
    });
  }

  const users = await client.user.findMany({
    where: {
      tenantId: input.tenantId,
      status: "ACTIVE",
      ...(input.assignedUserId ? { id: input.assignedUserId } : {}),
      ...(input.assignedRoleId
        ? {
            roleAssignments: {
              some: {
                roleId: input.assignedRoleId,
                status: "ACTIVE"
              }
            }
          }
        : {}),
      scopeAssignments: {
        some: {
          OR: scopeFilters
        }
      }
    },
    select: { id: true }
  });

  return [...new Set(users.map((user) => user.id))];
}

export async function recordWorkflowNotifications(
  client: NotificationClient,
  input: WorkflowNotificationInput
) {
  const uniqueRecipientIds = [...new Set(input.recipientUserIds)].filter(Boolean);
  if (uniqueRecipientIds.length === 0) {
    return [];
  }

  return Promise.all(
    uniqueRecipientIds.map((recipientUserId) =>
      client.notification.upsert({
        where: {
          tenantId_recipientUserId_sourceEventKey: {
            tenantId: input.tenantId,
            recipientUserId,
            sourceEventKey: input.sourceEventKey
          }
        },
        create: {
          tenantId: input.tenantId,
          companyId: input.companyId ?? null,
          locationId: input.locationId ?? null,
          recipientUserId,
          notificationType: input.notificationType,
          priority: input.priority ?? "NORMAL",
          channel: "IN_APP",
          title: input.title,
          body: input.body,
          deepLink: input.deepLink,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          sourceEventKey: input.sourceEventKey,
          recipientBasis: input.recipientBasis ?? null,
          ...(input.metadata ? { metadata: input.metadata } : {})
        },
        update: {
          title: input.title,
          body: input.body,
          deepLink: input.deepLink,
          priority: input.priority ?? "NORMAL",
          status: "UNREAD",
          archivedAt: null,
          ...(input.metadata ? { metadata: input.metadata } : {})
        }
      })
    )
  );
}

export async function recordApprovalOutcomeNotification(
  client: NotificationClient,
  input: ApprovalOutcomeNotificationInput
) {
  const outcomeLabel = input.outcome.toLowerCase();
  return recordWorkflowNotifications(client, {
    tenantId: input.tenantId,
    companyId: input.companyId,
    locationId: input.locationId,
    recipientUserIds: input.recipientUserIds,
    notificationType: `APPROVAL_OUTCOME_${input.outcome}`,
    priority: input.outcome === "REJECTED" ? "HIGH" : "NORMAL",
    title: `${input.publicReference} ${outcomeLabel}`,
    body: `${input.entityLabel} ${input.publicReference} at ${input.locationName} was ${outcomeLabel}.`,
    deepLink: `/approvals/${input.approvalInstanceId}`,
    entityType: input.entityType,
    entityId: input.entityId,
    sourceEventKey: `approval:${input.approvalInstanceId}:outcome:${input.outcome}`,
    recipientBasis: "requester_or_owner",
    metadata: {
      approvalInstanceId: input.approvalInstanceId,
      publicReference: input.publicReference,
      locationName: input.locationName,
      outcome: input.outcome
    }
  });
}

export async function recordApprovalStepReadyNotification(
  client: NotificationClient,
  input: ApprovalStepReadyNotificationInput
) {
  return recordWorkflowNotifications(client, {
    tenantId: input.tenantId,
    companyId: input.companyId,
    locationId: input.locationId,
    recipientUserIds: [input.recipientUserId],
    notificationType: "APPROVAL_STEP_READY",
    priority: "NORMAL",
    title: `Approval required: ${input.publicReference}`,
    body: `${input.entityLabel} ${input.publicReference} at ${input.locationName} is ready for approval step ${input.stepOrder}.`,
    deepLink: `/approvals/${input.approvalInstanceId}`,
    entityType: input.entityType,
    entityId: input.entityId,
    sourceEventKey: `approval:${input.approvalInstanceId}:step:${input.stepOrder}:ready`,
    recipientBasis: "assigned_user",
    metadata: {
      approvalInstanceId: input.approvalInstanceId,
      approvalInstanceStepId: input.approvalInstanceStepId,
      approvalStepOrder: input.stepOrder,
      assignmentMode: "DIRECT_USER",
      assignedUserId: input.recipientUserId
    }
  });
}

export async function listNotifications(
  session: SessionContext,
  filters: { status?: "UNREAD" | "ARCHIVED" | "ALL" } = {}
) {
  const status = filters.status ?? "ALL";
  const notifications = await prisma.notification.findMany({
    where: {
      tenantId: session.context.tenantId,
      recipientUserId: session.user.id,
      ...(status === "UNREAD"
        ? { status: "UNREAD", archivedAt: null }
        : status === "ARCHIVED"
          ? { archivedAt: { not: null } }
          : { archivedAt: null })
    },
    orderBy: { generatedAt: "desc" },
    take: 100
  });

  return notifications.map((notification) => ({
    id: notification.id,
    notificationType: notification.notificationType,
    priority: notification.priority,
    title: notification.title,
    body: notification.body,
    deepLink: notification.deepLink,
    entityType: notification.entityType,
    entityId: notification.entityId,
    status: notification.status,
    generatedAt: notification.generatedAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
    archivedAt: notification.archivedAt?.toISOString() ?? null
  }));
}

export async function getUnreadNotificationCount(session: SessionContext) {
  return prisma.notification.count({
    where: {
      tenantId: session.context.tenantId,
      recipientUserId: session.user.id,
      status: "UNREAD",
      archivedAt: null
    }
  });
}

export async function markNotificationRead(
  session: SessionContext,
  notificationId: string
) {
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      tenantId: session.context.tenantId,
      recipientUserId: session.user.id
    },
    data: {
      status: "READ",
      readAt: new Date()
    }
  });
}

export async function archiveNotification(
  session: SessionContext,
  notificationId: string
) {
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      tenantId: session.context.tenantId,
      recipientUserId: session.user.id
    },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date()
    }
  });
}
