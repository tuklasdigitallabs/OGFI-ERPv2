import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Bell, LogOut, ShieldCheck } from "lucide-react";
import { Badge, Kicker } from "@ogfi/ui";
import {
  ShellNavigation,
  type ShellActiveNav,
} from "@/components/ShellNavigation";
import { ThemeModeSelect } from "@/components/ThemeModeSelect";
import {
  canReadPurchaseOrders,
  canConfigureProjectTemplates,
  canUseBranchOperations,
  canUseFoodSafety,
  canUseIncidents,
  canUseMaintenance,
  canUseFinance,
  canUseWorkforce,
  canUseApprovals,
  canUsePurchaseRequests,
  canUseProjects,
  canUseRecipesAndCosting,
  canUseReceiving,
  canUseStockAdjustments,
  canUseStockCounts,
  canUseTransfers,
  canUseWastageReports,
  getDefaultAppRoute,
  permissions,
} from "@/server/services/authorization";
import {
  getSessionContext,
  type SessionContext,
} from "@/server/services/context";
import { getAuthMode } from "@/server/services/authentication";

async function switchLocationContext(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const requestedLocationId = String(formData.get("locationId") ?? "");
  const authorizedLocation = session.authorizedLocations.find(
    (location) => location.locationId === requestedLocationId,
  );
  const locationId =
    authorizedLocation?.locationId ?? session.context.locationId;
  const cookieStore = await cookies();
  cookieStore.set("ogfi_demo_location", locationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  const headerStore = await headers();
  const referer = headerStore.get("referer");
  if (referer) {
    redirect(new URL(referer).pathname);
  }
  redirect(getDefaultAppRoute(session.permissionCodes));
}

export function AppShell({
  session,
  children,
  title = "Purchase Requests",
  subtitle = "Phase I Core Administration",
  activeNav = "purchase-requests",
}: {
  session: SessionContext;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  activeNav?: ShellActiveNav;
}) {
  const canAdminister = session.permissionCodes.includes("core.administer");
  const canViewEvidenceRetention = session.permissionCodes.includes(
    permissions.evidenceRetentionView,
  );
  const canManageQuotes = session.permissionCodes.includes(
    permissions.quoteManage,
  );
  const canAccessPurchaseRequests = canUsePurchaseRequests(
    session.permissionCodes,
  );
  const canAccessApprovals = canUseApprovals(session.permissionCodes);
  const canViewPurchaseOrders = canReadPurchaseOrders(session.permissionCodes);
  const canAccessReceiving = canUseReceiving(session.permissionCodes);
  const canViewInventory = session.permissionCodes.includes(
    permissions.inventoryBalanceView,
  );
  const canViewInventoryLedger = session.permissionCodes.includes(
    permissions.inventoryLedgerView,
  );
  const canAccessTransfers = canUseTransfers(session.permissionCodes);
  const canAccessCounts = canUseStockCounts(session.permissionCodes);
  const canAccessWastage = canUseWastageReports(session.permissionCodes);
  const canAccessStockAdjustments = canUseStockAdjustments(
    session.permissionCodes,
  );
  const canAccessProjects = canUseProjects(session.permissionCodes);
  const canAccessProjectTemplates = canConfigureProjectTemplates(
    session.permissionCodes,
  );
  const canAccessRecipesAndCosting = canUseRecipesAndCosting(
    session.permissionCodes,
  );
  const canAccessBranchOperations = canUseBranchOperations(
    session.permissionCodes,
  );
  const canAccessFoodSafety = canUseFoodSafety(session.permissionCodes);
  const canAccessIncidents = canUseIncidents(session.permissionCodes);
  const canAccessMaintenance = canUseMaintenance(session.permissionCodes);
  const canAccessFinance = canUseFinance(session.permissionCodes);
  const canAccessWorkforce = canUseWorkforce(session.permissionCodes);
  const usesLocalAuthentication = getAuthMode() === "local";

  return (
    <ShellNavigation
      activeNav={activeNav}
      canAdminister={canAdminister}
      canViewEvidenceRetention={canViewEvidenceRetention}
      canManageQuotes={canManageQuotes}
      canUsePurchaseRequests={canAccessPurchaseRequests}
      canUseApprovals={canAccessApprovals}
      canUseReceiving={canAccessReceiving}
      canUseCounts={canAccessCounts}
      canUseStockAdjustments={canAccessStockAdjustments}
      canUseWastage={canAccessWastage}
      canUseTransfers={canAccessTransfers}
      canViewInventory={canViewInventory}
      canViewInventoryLedger={canViewInventoryLedger}
      canViewPurchaseOrders={canViewPurchaseOrders}
      canUseProjects={canAccessProjects}
      canUseProjectTemplates={canAccessProjectTemplates}
      canUseRecipesAndCosting={canAccessRecipesAndCosting}
      canUseBranchOperations={canAccessBranchOperations}
      canUseFoodSafety={canAccessFoodSafety}
      canUseIncidents={canAccessIncidents}
      canUseMaintenance={canAccessMaintenance}
      canUseFinance={canAccessFinance}
      canUseWorkforce={canAccessWorkforce}
      session={session}
    >
      <header className="shell-top-header bg-white/90 backdrop-blur-xl md:sticky md:top-0 md:z-10">
        <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="info" size="sm">
                {session.context.companyName}
              </Badge>
              <Badge size="sm">{session.context.brandName}</Badge>
              <Badge tone="success" size="sm">
                {session.context.locationType}
              </Badge>
            </div>
            <h1 className="page-title text-slate-950">{title}</h1>
            <p className="page-subtitle mt-1 max-w-2xl">{subtitle}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ThemeModeSelect />
            {usesLocalAuthentication ? (
              <a
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                href="/account/security"
              >
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                Security
              </a>
            ) : null}
            <form action={switchLocationContext} className="flex gap-2">
              <select
                aria-label="Location context"
                className="h-10 min-w-52 rounded-[var(--radius-control)] border border-slate-200 bg-white/95 px-4 text-sm font-semibold text-slate-800 shadow-sm focus:ring-2 focus:ring-blue-500"
                defaultValue={session.context.locationId}
                name="locationId"
              >
                {session.authorizedLocations.map((location) => (
                  <option
                    key={location.scopeAssignmentId}
                    value={location.locationId}
                  >
                    {location.locationName}
                  </option>
                ))}
              </select>
              <button
                className="h-10 rounded-[var(--radius-control)] border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 shadow-sm transition-colors hover:bg-blue-100"
                type="submit"
              >
                Switch
              </button>
            </form>
            <a
              aria-label="Open notifications"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              href="/notifications"
            >
              <Bell aria-hidden="true" className="h-4 w-4" />
            </a>
            <form action="/sign-out" method="post">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-slate-200 bg-white/95 px-3 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                type="submit"
              >
                <LogOut aria-hidden="true" className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="posting-context-bar flex flex-wrap items-center gap-3 px-4 py-3 md:px-8">
          <Kicker className="posting-context-kicker gap-1.5">
            <ShieldCheck
              aria-hidden="true"
              className="h-3.5 w-3.5 text-blue-600"
            />
            Posting context
          </Kicker>
          <span className="posting-context-location text-sm font-semibold">
            {session.context.locationName}
          </span>
          <span className="posting-context-user text-sm">
            {session.user.role} / {session.user.displayName}
          </span>
        </div>
      </header>
      <main className="px-4 pb-44 pt-6 md:px-8 md:pb-40 md:pt-7">
        {children}
      </main>
    </ShellNavigation>
  );
}
