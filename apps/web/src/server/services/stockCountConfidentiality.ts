import { permissions } from "./authorization";
import type { SessionContext } from "./context";

export type StockCountProtectedRead = {
  status: string;
  blindCount: boolean;
  createdByUserId: string;
  assignedToUserId?: string | null;
  lines: Array<{
    countedQuantityBaseUom: unknown;
    countedByUserId: string | null;
    countedAt: Date | null;
  }>;
};

export function hasCompleteStockCountLineage(count: StockCountProtectedRead) {
  return (
    count.lines.length > 0 &&
    count.lines.every(
      (line) =>
        line.countedQuantityBaseUom !== null &&
        Boolean(line.countedByUserId) &&
        Boolean(line.countedAt),
    )
  );
}

export function canExposeStockCountProtectedFacts(
  session: SessionContext,
  count: StockCountProtectedRead,
) {
  if (!session.permissionCodes.includes(permissions.stockCountReview)) {
    return false;
  }
  if (!count.blindCount) {
    return true;
  }
  if (count.status === "REVIEWED") {
    return true;
  }
  return canReviewStockCountCurrentActor(session, count);
}

export function canReviewStockCountCurrentActor(
  session: SessionContext,
  count: StockCountProtectedRead,
) {
  return (
    session.permissionCodes.includes(permissions.stockCountReview) &&
    count.status === "SUBMITTED" &&
    hasCompleteStockCountLineage(count) &&
    count.createdByUserId !== session.user.id &&
    count.assignedToUserId !== session.user.id &&
    count.lines.every((line) => line.countedByUserId !== session.user.id)
  );
}

