/**
 * Shared deterministic ordering for the first registered My Tasks sources.
 * Every enrolled source currently emits high-priority, no-due-date task
 * projections. The global ordering is therefore oldest task first, then the
 * fixed source rank and source record ID. A future source with a different
 * priority/due contract must extend this tuple before joining the registry.
 */
export const dashboardTaskSources = [
  "PURCHASE_REQUEST",
  "PURCHASE_ORDER",
  "TRANSFER",
  "WASTAGE",
  "STOCK_ADJUSTMENT",
  "RECEIVING",
  "BRANCH_OPERATION",
  "FOOD_SAFETY"
] as const;

export type DashboardTaskSource = (typeof dashboardTaskSources)[number];

export type DashboardTaskCursor = {
  createdAt: string;
  sourceType: DashboardTaskSource;
  recordId: string;
};

function sourceRank(sourceType: DashboardTaskSource) {
  return dashboardTaskSources.indexOf(sourceType);
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
