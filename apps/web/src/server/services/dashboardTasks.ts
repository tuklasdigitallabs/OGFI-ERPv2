/**
 * Shared deterministic ordering for registered My Tasks sources. Ordering is
 * priority, dated work before undated work, absolute due date, age, source,
 * then record ID. Absolute due dates keep cursor traversal stable at midnight;
 * overdue/today/future is derived for display in the operational timezone.
 */
export const dashboardTaskSources = [
  "PURCHASE_REQUEST",
  "PURCHASE_ORDER",
  "TRANSFER",
  "WASTAGE",
  "STOCK_ADJUSTMENT",
  "RECEIVING",
  "BRANCH_OPERATION",
  "FOOD_SAFETY",
  "INCIDENT",
  "MAINTENANCE",
  "STOCK_COUNT"
] as const;

export type DashboardTaskSource = (typeof dashboardTaskSources)[number];

export const dashboardTaskPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type DashboardTaskPriority = (typeof dashboardTaskPriorities)[number];

/**
 * Source-qualified status catalog for the currently enrolled actionable
 * obligations. These are not a cross-module lifecycle; each source retains
 * its own status semantics and action predicate.
 */
export const dashboardTaskStatusCatalog: Record<DashboardTaskSource, readonly string[]> = {
  PURCHASE_REQUEST: ["DRAFT"],
  PURCHASE_ORDER: ["DRAFT", "APPROVED"],
  TRANSFER: ["REQUESTED", "DISPATCHED", "PARTIALLY_RECEIVED", "DISPUTED"],
  WASTAGE: ["SUBMITTED", "APPROVED"],
  STOCK_ADJUSTMENT: ["APPROVED"],
  RECEIVING: ["DRAFT"],
  BRANCH_OPERATION: ["SUBMITTED", "MANAGER_REVIEW", "RETURNED"],
  FOOD_SAFETY: ["SUBMITTED", "EXCEPTION_REVIEW", "RETURNED"],
  INCIDENT: ["OPEN", "IN_PROGRESS", "PENDING_REVIEW"],
  MAINTENANCE: ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"],
  STOCK_COUNT: ["DRAFT", "IN_PROGRESS"]
};

export type DashboardTaskFilter = {
  priority?: DashboardTaskPriority;
  status?: string;
  due?: {
    kind: "OVERDUE" | "TODAY" | "UPCOMING" | "NO_DUE";
    from?: string;
    to?: string;
  };
};

export type DashboardTaskCursor = {
  priority?: DashboardTaskPriority;
  dueAt?: string | null;
  createdAt: string;
  sourceType: DashboardTaskSource;
  recordId: string;
};

function sourceRank(sourceType: DashboardTaskSource) {
  return dashboardTaskSources.indexOf(sourceType);
}

function priorityRank(priority: DashboardTaskPriority | undefined) {
  return dashboardTaskPriorities.indexOf(priority ?? "HIGH");
}

/**
 * Builds the source-local seek predicate for rows after a global cursor.
 * A source after the cursor's source rank may include the same timestamp;
 * a source before it may not. This prevents skips and duplicates when source
 * records share an identical timestamp.
 */
export function dashboardTaskAfterWhere(
  sourceType: DashboardTaskSource,
  cursor: DashboardTaskCursor | undefined
) {
  if (!cursor) {
    return null;
  }
  const fixedPriority: DashboardTaskPriority = "HIGH";
  const fixedPriorityRank = priorityRank(fixedPriority);
  const cursorPriorityRank = priorityRank(cursor.priority);
  if (fixedPriorityRank > cursorPriorityRank) {
    return null;
  }
  if (fixedPriorityRank < cursorPriorityRank) {
    return { id: { in: [] as string[] } };
  }
  if (cursor.dueAt) {
    return null;
  }

  const cursorDate = new Date(cursor.createdAt);
  if (Number.isNaN(cursorDate.getTime())) {
    throw new Error("DASHBOARD_TASK_CURSOR_INVALID");
  }
  const currentRank = sourceRank(sourceType);
  const cursorRank = sourceRank(cursor.sourceType);
  if (cursorRank < 0) {
    throw new Error("DASHBOARD_TASK_CURSOR_INVALID");
  }

  const sameTimestampPredicate =
    currentRank > cursorRank
      ? { createdAt: cursorDate }
      : currentRank === cursorRank
        ? { createdAt: cursorDate, id: { gt: cursor.recordId } }
        : null;

  return {
    OR: [
      { createdAt: { gt: cursorDate } },
      ...(sameTimestampPredicate ? [sameTimestampPredicate] : [])
    ]
  };
}

export function compareDashboardTaskOrder(
  left: DashboardTaskCursor,
  right: DashboardTaskCursor
) {
  const priorityDifference = priorityRank(left.priority) - priorityRank(right.priority);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }
  const leftDueNullRank = left.dueAt ? 0 : 1;
  const rightDueNullRank = right.dueAt ? 0 : 1;
  if (leftDueNullRank !== rightDueNullRank) {
    return leftDueNullRank - rightDueNullRank;
  }
  if (left.dueAt && right.dueAt) {
    const dueDifference = new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    if (dueDifference !== 0) {
      return dueDifference;
    }
  }
  const timestampDifference =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (timestampDifference !== 0) {
    return timestampDifference;
  }
  const sourceDifference = sourceRank(left.sourceType) - sourceRank(right.sourceType);
  return sourceDifference !== 0
    ? sourceDifference
    : left.recordId.localeCompare(right.recordId);
}
