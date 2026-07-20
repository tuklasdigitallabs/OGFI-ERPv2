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

export default async function AccountsPayablePage({
  searchParams
}: FinancePageProps) {
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
    !session.permissionCodes.includes(permissions.financePayablesView)
  ) {
    redirect("/finance");
  }

  const dashboard = await getFinanceFoundationDashboard(session);

  return (
    <FinanceSubworkspace
      session={session}
      dashboard={dashboard}
      activeNav="accounts-payable"
      kind="payables"
      title="Accounts Payable"
      subtitle="Supplier invoice and three-way match readiness"
      narrative="AP captures supplier invoices, links them to PO and receiving source records, and evaluates three-way match status. Payment requests and release remain gated follow-up work."
      activeTab={resolvedSearchParams?.tab}
      activePage={resolvedSearchParams?.page}
    />
  );
}
