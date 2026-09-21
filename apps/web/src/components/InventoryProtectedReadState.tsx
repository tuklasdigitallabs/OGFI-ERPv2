import { canUseStockCounts } from "@/server/services/authorization";
import { redirect } from "next/navigation";
import { ButtonLink, EmptyState } from "@ogfi/ui";
import { AppShell } from "./AppShell";
import { getSessionContext } from "@/server/services/context";
import { inventoryQuantityProtectedMessage } from "@/server/services/inventoryQuantityRead";

export async function InventoryProtectedReadState() {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  return (
    <AppShell session={session} title="Inventory details protected" subtitle="Blind-count confidentiality" activeNav="inventory">
      <section className="ogfi-data-surface p-5" role="status">
        <EmptyState title="Protected quantities are unavailable" description={inventoryQuantityProtectedMessage} />
        <div className="mt-4 flex flex-wrap gap-3">
          {canUseStockCounts(session.permissionCodes) ? <ButtonLink href="/counts">Open Stock Counts</ButtonLink> : null}
          <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
        </div>
      </section>
    </AppShell>
  );
}
