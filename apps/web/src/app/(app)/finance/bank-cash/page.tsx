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

export default async function BankCashPage({ searchParams }: FinancePageProps) {
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
    !session.permissionCodes.includes(permissions.financeReconciliationView)
  ) {
    redirect("/finance");
  }

  const dashboard = await getFinanceFoundationDashboard(session);

  return (
    <FinanceSubworkspace
      session={session}
      dashboard={dashboard}
      activeNav="bank-cash"
      kind="bank-cash"
      title="Bank & Cash"
      subtitle="Cash, bank, deposit, and reconciliation controls"
      narrative="Bank and cash reconciliation is gated while payment release, deposit evidence, statement import, and exception rules are completed."
      activeTab={resolvedSearchParams?.tab}
      activePage={resolvedSearchParams?.page}
    />
  );
}
