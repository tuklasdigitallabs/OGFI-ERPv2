import type { ModulePreviewConfig } from "@/components/ModulePreviewPage";
import type { SessionContext } from "@/server/services/context";
import {
  canUseApprovals,
  canUsePurchaseRequests,
  permissions
} from "../services/authorization";

type PreviewAction = {
  href: string;
  label: string;
};

export type DashboardSnapshotItem = {
  branch: string;
  detail: string;
  status: string;
};

export function getModulePreviewActions(
  config: ModulePreviewConfig,
  canAdminister: boolean,
  permissionCodes: string[] = []
): { primaryAction: PreviewAction; secondaryAction: PreviewAction } {
  if (config.activeNav === "dashboard" && !canAdminister) {
    const canAccessPurchaseRequests = canUsePurchaseRequests(permissionCodes);
    const canAccessApprovals = canUseApprovals(permissionCodes);
    const canViewInventory = permissionCodes.includes(permissions.inventoryBalanceView);

    return {
      primaryAction: canAccessPurchaseRequests
        ? { href: "/purchase-requests", label: "Open Requests" }
        : { href: "/dashboard", label: "Open Dashboard" },
      secondaryAction: canViewInventory
        ? { href: "/inventory", label: "Open Inventory" }
        : canAccessApprovals
          ? { href: "/approvals", label: "Open Approvals" }
          : { href: "/dashboard", label: "Open Dashboard" }
    };
  }

  return {
    primaryAction: { href: "/approvals", label: config.primaryLabel },
    secondaryAction: { href: "/reports", label: config.secondaryLabel }
  };
}

export function getDashboardSnapshotItems(
  session: SessionContext,
  canAdminister: boolean
): DashboardSnapshotItem[] {
  if (!canAdminister) {
    return [
      {
        branch: session.context.locationName,
        detail: `${session.context.brandName} / ${session.context.locationType.toLowerCase()} context`,
        status: "Ready"
      }
    ];
  }

  return [
    {
      branch: "Makati",
      detail: "Receiving exceptions",
      status: "Review"
    },
    {
      branch: "BGC",
      detail: "Transfer due today",
      status: "Pending"
    },
    {
      branch: "Main Warehouse",
      detail: "Dispatch queue healthy",
      status: "Ready"
    },
    {
      branch: "Commissary",
      detail: "Count variance review",
      status: "Review"
    }
  ];
}
