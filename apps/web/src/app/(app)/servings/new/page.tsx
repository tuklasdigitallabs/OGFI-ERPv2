import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { ButtonLink, EmptyState } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { RedirectActionToast } from "@/components/RedirectActionToast";
import { ServingDeclarationEditor } from "@/components/ServingDeclarationEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import { permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { dateOnlyInTimeZone } from "@/server/services/projectDates";
import {
  createServingDeclaration,
  getRestaurantConsumptionWorkspace,
  listRestaurantConsumptionCatalog,
  parseRestaurantConsumptionForm,
} from "@/server/services/restaurantConsumption";

export const dynamic = "force-dynamic";

async function createAction(formData: FormData) {
  "use server";
  let declarationId: string;
  try {
    const declaration = await createServingDeclaration(
      parseRestaurantConsumptionForm(formData),
    );
    declarationId = declaration.id;
  } catch (error) {
    redirect(actionErrorRedirectPath("/servings/new", error));
  }
  redirect(`/servings/${declarationId}?success=SERVING_DECLARATION_CREATED`);
}

export default async function NewServingDeclarationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.consumptionCreate))
    redirect("/servings");
  const [workspace, catalog] = await Promise.all([
    getRestaurantConsumptionWorkspace({
      ...session,
      permissionCodes: [
        ...new Set([...session.permissionCodes, permissions.consumptionView]),
      ],
    }),
    listRestaurantConsumptionCatalog(session),
  ]);
  const feedback = getActionFeedback(searchParams ? await searchParams : {});
  if (!workspace.configuration) {
    return (
      <AppShell
        session={session}
        activeNav="servings"
        title="Record servings"
        subtitle="Branch configuration required"
      >
        <section className="ogfi-data-surface p-5">
          <EmptyState
            title="This branch is not ready"
            description="Activate a service-period and issue-location configuration before entering serving facts."
          />
          <div className="mt-4 flex justify-center">
            <ButtonLink href="/servings">Back to declarations</ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  const periods = Array.isArray(workspace.configuration.servicePeriods)
    ? (workspace.configuration.servicePeriods as Array<{
        code: string;
        label: string;
      }>)
    : [];
  return (
    <AppShell
      session={session}
      activeNav="servings"
      title="Record servings"
      subtitle={`${session.context.locationName} · factual entry only; inventory changes after verification and posting`}
    >
      <RedirectActionToast cleanHref="/servings/new" feedback={feedback} />
      <div className="mb-4">
        <ButtonLink href="/servings" tone="secondary">
          Back to declarations
        </ButtonLink>
      </div>
      <ServingDeclarationEditor
        action={createAction}
        catalog={catalog}
        defaultBusinessDate={dateOnlyInTimeZone(
          new Date(),
          workspace.configuration.timezone,
        )}
        idempotencyKey={randomUUID()}
        periods={periods}
      />
    </AppShell>
  );
}
