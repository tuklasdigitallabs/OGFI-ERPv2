import { createHash } from "node:crypto";
import {
  canUseStockAdjustments,
  canUseTransfers,
  canUseWastageReports,
  canUseReceiving,
  canUsePurchaseRequests,
  canReadPurchaseOrders,
  permissions
} from "./authorization";
import {
  signInternalServerValue,
  verifyInternalServerValue
} from "./authentication";
import type { SessionContext } from "./context";
import {
  compareDashboardTaskOrder,
  dashboardTaskSources,
  type DashboardTaskCursor,
  type DashboardTaskSource
} from "./dashboardTasks";
import { listStockAdjustmentMyTaskPage } from "./stockAdjustments";
import { listReceivingMyTaskPage } from "./receiving";
import { listPurchaseRequestMyTaskPage } from "./purchaseRequests";
import { listPurchaseOrderMyTaskPage } from "./purchaseOrders";
import { listTransferMyTaskPage } from "./transfers";
import { listWastageMyTaskPage } from "./wastage";
import { listBranchOperationMyTaskPage } from "./branchOperations";

const myTasksCursorDomain = "my-tasks-v1";
const myTasksCursorTtlMs = 15 * 60 * 1000;
const defaultPageSize = 20;
const maxPageSize = 25;

type MyTasksCursorPayload = {
  version: 1;
  scopeHash: string;
  issuedAt: number;
  anchor: DashboardTaskCursor;
};

export type MyTask = DashboardTaskCursor & {
  taskId: string;
  publicReference: string;
  status: string;
  actionLabel: string;
  sourceLabel: string;
  locationLabel: string;
  href: string;
};

export type MyTasksPage = {
  items: MyTask[];
  nextCursor: string | null;
  totalCount: number | null;
  isComplete: boolean;
  enrolledSources: Array<{ type: DashboardTaskSource; label: string }>;
  unavailableSources: Array<{ type: DashboardTaskSource; label: string }>;
};

function taskScopeHash(session: SessionContext) {
  const values = [
    session.user.id,
    session.context.tenantId,
    session.context.companyId,
    session.context.brandId,
    session.context.locationId,
    ...[...session.permissionCodes].sort(),
    ...dashboardTaskSources
  ];
  return createHash("sha256").update(values.join("\u0000")).digest("base64url");
}

function isDashboardTaskCursor(value: unknown): value is DashboardTaskCursor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const cursor = value as Record<string, unknown>;
  return (
    typeof cursor.createdAt === "string" &&
    !Number.isNaN(new Date(cursor.createdAt).getTime()) &&
    typeof cursor.recordId === "string" &&
    dashboardTaskSources.includes(cursor.sourceType as DashboardTaskSource)
  );
}

function invalidCursor(): never {
  throw new Error("MY_TASK_CURSOR_INVALID");
}

export function encodeMyTasksCursor(session: SessionContext, anchor: DashboardTaskCursor) {
  const payload: MyTasksCursorPayload = {
    version: 1,
    scopeHash: taskScopeHash(session),
    issuedAt: Date.now(),
    anchor
  };
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${value}.${signInternalServerValue(myTasksCursorDomain, value)}`;
}

export function decodeMyTasksCursor(session: SessionContext, cursor: string) {
  const [value, signature, ...extra] = cursor.split(".");
  if (!value || !signature || extra.length > 0) {
    return invalidCursor();
  }
  if (!verifyInternalServerValue(myTasksCursorDomain, value, signature)) {
    return invalidCursor();
  }

  let payload: MyTasksCursorPayload;
  try {
    payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return invalidCursor();
  }
  const now = Date.now();
  if (
    payload.version !== 1 ||
    payload.scopeHash !== taskScopeHash(session) ||
    !Number.isInteger(payload.issuedAt) ||
    payload.issuedAt > now + 60_000 ||
    now - payload.issuedAt > myTasksCursorTtlMs ||
    !isDashboardTaskCursor(payload.anchor)
  ) {
    return invalidCursor();
  }
  return payload.anchor;
}

function normalizedPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize)) {
    return defaultPageSize;
  }
  return Math.min(Math.max(Math.floor(pageSize), 1), maxPageSize);
}

type EnrolledSource = {
  type: DashboardTaskSource;
  label: string;
  read: (after: DashboardTaskCursor | undefined, take: number) => Promise<{
    totalCount: number;
    nextCursor: DashboardTaskCursor | null;
    items: MyTask[];
  }>;
};

function enrolledSources(session: SessionContext): EnrolledSource[] {
  const sources: EnrolledSource[] = [];
  if (canUsePurchaseRequests(session.permissionCodes)) {
    sources.push({
      type: "PURCHASE_REQUEST",
      label: "Purchase requests",
      read: async (after, take) => {
        const page = await listPurchaseRequestMyTaskPage(session, {
          take,
          ...(after ? { after } : {})
        });
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            sourceType: "PURCHASE_REQUEST" as const,
            sourceLabel: "Purchase request",
            locationLabel: `${item.requestLocationName} · required ${item.requiredDate}`,
            href: `/purchase-requests/${item.recordId}`
          }))
        };
      }
    });
  }
  if (canReadPurchaseOrders(session.permissionCodes)) {
    sources.push({
      type: "PURCHASE_ORDER",
      label: "Purchase orders",
      read: async (after, take) => {
        const page = await listPurchaseOrderMyTaskPage(session, { take, ...(after ? { after } : {}) });
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            sourceType: "PURCHASE_ORDER" as const,
            sourceLabel: "Purchase order",
            locationLabel: `${item.deliveryLocationName} · ${item.supplierName}`,
            href: `/purchase-orders/${item.recordId}`
          }))
        };
      }
    });
  }
  if (canUseTransfers(session.permissionCodes)) {
    sources.push({
      type: "TRANSFER",
      label: "Transfers",
      read: async (after, take) => {
        const page = await listTransferMyTaskPage(session, {
          take,
          ...(after ? { after } : {})
        });
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            sourceType: "TRANSFER" as const,
            sourceLabel: "Transfer",
            locationLabel: `${item.sourceLocationName} → ${item.destinationLocationName}`,
            href: `/transfers/${item.recordId}`
          }))
        };
      }
    });
  }
  if (canUseWastageReports(session.permissionCodes)) {
    sources.push({
      type: "WASTAGE",
      label: "Wastage",
      read: async (after, take) => {
        const page = await listWastageMyTaskPage(session, {
          take,
          ...(after ? { after } : {})
        });
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            sourceType: "WASTAGE" as const,
            sourceLabel: "Wastage",
            locationLabel: item.inventoryLocationName,
            href: `/wastage/${item.recordId}`
          }))
        };
      }
    });
  }
  if (canUseStockAdjustments(session.permissionCodes)) {
    sources.push({
      type: "STOCK_ADJUSTMENT",
      label: "Stock adjustments",
      read: async (after, take) => {
        const page = await listStockAdjustmentMyTaskPage(session, {
          take,
          ...(after ? { after } : {})
        });
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            sourceType: "STOCK_ADJUSTMENT" as const,
            sourceLabel: "Stock adjustment",
            status: "APPROVED",
            locationLabel: item.inventoryLocationName,
            href: `/adjustments/${item.recordId}`
          }))
        };
      }
    });
  }
  if (canUseReceiving(session.permissionCodes)) {
    sources.push({
      type: "RECEIVING",
      label: "Receiving",
      read: async (after, take) => {
        const page = await listReceivingMyTaskPage(session, {
          take,
          ...(after ? { after } : {})
        });
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            sourceType: "RECEIVING" as const,
            sourceLabel: "Receiving",
            locationLabel: `${item.receivingLocationName} · PO ${item.purchaseOrderReference}`,
            href: `/receiving/${item.recordId}`
          }))
        };
      }
    });
  }
  if (
    session.permissionCodes.includes(permissions.branchOperationsReview) ||
    session.permissionCodes.includes(permissions.branchOperationsCreate)
  ) {
    sources.push({
      type: "BRANCH_OPERATION",
      label: "Branch operations",
      read: async (after, take) => {
        const page = await listBranchOperationMyTaskPage(session, {
          take,
          ...(after ? { after } : {})
        });
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            sourceType: "BRANCH_OPERATION" as const,
            sourceLabel: "Branch checklist",
            locationLabel: `${item.locationName} · ${item.businessDate} · ${item.shiftType.toLowerCase()}`,
            href: `/branch-operations/${item.recordId}`
          }))
        };
      }
    });
  }
  return sources;
}

/**
 * A server-owned, cursor-paginated queue for the first enrolled controlled
 * actions. Authorization and source filters stay in their authoritative
 * services; a failed source never becomes a misleading zero count.
 */
export async function getMyTasksPage(
  session: SessionContext,
  input: { cursor?: string; pageSize?: number } = {}
): Promise<MyTasksPage> {
  const after = input.cursor ? decodeMyTasksCursor(session, input.cursor) : undefined;
  const take = normalizedPageSize(input.pageSize);
  const sources = enrolledSources(session);
  const reads = await Promise.allSettled(
    sources.map(async (source) => ({ source, page: await source.read(after, take) }))
  );
  const successful = reads.filter(
    (result): result is PromiseFulfilledResult<{ source: EnrolledSource; page: Awaited<ReturnType<EnrolledSource["read"]>> }> =>
      result.status === "fulfilled"
  );
  const unavailableSources = reads.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ type: sources[index]!.type, label: sources[index]!.label }]
      : []
  );
  const merged = successful
    .flatMap((result) => result.value.page.items)
    .sort(compareDashboardTaskOrder);
  const items = merged.slice(0, take);
  const last = items.at(-1);
  const hasMore = merged.length > take || successful.some((result) => result.value.page.nextCursor);

  return {
    items,
    nextCursor: last && hasMore ? encodeMyTasksCursor(session, last) : null,
    totalCount:
      unavailableSources.length === 0
        ? successful.reduce((sum, result) => sum + result.value.page.totalCount, 0)
        : null,
    isComplete: unavailableSources.length === 0,
    enrolledSources: sources.map(({ type, label }) => ({ type, label })),
    unavailableSources
  };
}
