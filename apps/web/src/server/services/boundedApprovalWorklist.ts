import type { SessionContext } from "./context";
import { normalizedApprovalRoutingEnabled } from "./approvalRouting";
import {
  isBoundedUatEvidenceRuntimeRequested,
  isHardenedUatEvidenceRuntimeIdentity,
} from "./runtimeEnvironment";

/**
 * DEC-0270 is intentionally a closed, local-UAT surface.  This list must not
 * grow with the normalized routing registry: that registry is the global
 * cutover contract, whereas this worklist is only the connected Phase I
 * inventory-control chain.
 */
export const boundedInventoryUatApprovalFamilies = [
  "PurchaseRequest",
  "QuotationRecommendation",
  "PurchaseOrder",
  "InventoryTransfer",
  "StockCountAttemptReview",
  "WastageReport",
  "StockAdjustment",
] as const;

export type BoundedInventoryUatApprovalFamily =
  (typeof boundedInventoryUatApprovalFamilies)[number];

export function isBoundedInventoryUatApprovalFamily(
  value: string,
): value is BoundedInventoryUatApprovalFamily {
  return (boundedInventoryUatApprovalFamilies as readonly string[]).includes(value);
}

/**
 * This flag is separate from the global cutover flag and can activate only in
 * the exact optimized, hardened, automation-evidence UAT identity. Live
 * eligibility and exact scope are still derived by the routing service.
 */
export function boundedInventoryUatApprovalWorklistEnabled() {
  return (
    isBoundedUatEvidenceRuntimeRequested() &&
    !normalizedApprovalRoutingEnabled()
  );
}

export function approvalWorklistMode(): "GLOBAL" | "BOUNDED_UAT" | "DISABLED" {
  if (isHardenedUatEvidenceRuntimeIdentity()) {
    return boundedInventoryUatApprovalWorklistEnabled()
      ? "BOUNDED_UAT"
      : "DISABLED";
  }
  if (normalizedApprovalRoutingEnabled()) return "GLOBAL";
  return boundedInventoryUatApprovalWorklistEnabled()
    ? "BOUNDED_UAT"
    : "DISABLED";
}

export function assertBoundedInventoryUatApprovalCommand(
  session: SessionContext,
  family: string,
) {
  if (
    !boundedInventoryUatApprovalWorklistEnabled() ||
    !isBoundedInventoryUatApprovalFamily(family)
  ) {
    // Do not disclose whether the requested approval family or record exists.
    throw new Error("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
  }
  if (!session.context.tenantId || !session.context.companyId) {
    throw new Error("APPROVAL_WORKLIST_ITEM_UNAVAILABLE");
  }
}
