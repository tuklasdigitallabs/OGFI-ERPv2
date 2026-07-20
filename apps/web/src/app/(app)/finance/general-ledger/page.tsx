import { redirect } from "next/navigation";
import { FinanceSubworkspace } from "@/components/FinanceSubworkspace";
import {
  canUseFinance,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { getFinanceFoundationDashboard } from "@/server/services/finance";

export const dynamic = "force-dynamic";

type FinancePageProps = {
  searchParams?: Promise<{ page?: string; tab?: string }>;
};

export default async function GeneralLedgerPage({ searchParams }: FinancePageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!canUseFinance(session.permissionCodes)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }
  if (
    !session.permissionCodes.includes(permissions.coreAdminister) &&
    !session.permissionCodes.includes(permissions.financeLedgerView)
  ) {
    redirect("/finance");
  }

  const dashboard = await getFinanceFoundationDashboard(session);

  return (
    <FinanceSubworkspace
      session={session}
      dashboard={dashboard}
      activeNav="general-ledger"
      kind="ledger"
      title="General Ledger"
      subtitle="Guarded journal and posting foundation"
      narrative="Manual journal posting is controlled by balance, open-period, approval, idempotency, audit, and reversal checks; automated source postings remain gated."
      activeTab={resolvedSearchParams?.tab}
      activePage={resolvedSearchParams?.page}
    />
  );
}
