import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { ButtonLink } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { RedirectActionToast } from "@/components/RedirectActionToast";
import {
  ServingDeclarationEditor,
  type ServingDeclarationEditorLine,
} from "@/components/ServingDeclarationEditor";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import { permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  getRestaurantConsumptionWorkspace,
  getServingDeclarationDetail,
  listRestaurantConsumptionCatalog,
  parseRestaurantConsumptionForm,
  updateServingDeclarationDraft,
} from "@/server/services/restaurantConsumption";

export const dynamic = "force-dynamic";

async function updateAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  try {
    await updateServingDeclarationDraft({
      ...parseRestaurantConsumptionForm(formData),
      id,
      version: formData.get("version"),
    });
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}/edit`, error));
  }
  redirect(`/servings/${id}?success=SERVING_DECLARATION_DRAFT_UPDATED`);
}

export default async function EditServingDeclarationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.consumptionCreate))
    redirect("/servings");
  const { id } = await params;
  const [declaration, workspace, catalog] = await Promise.all([
    getServingDeclarationDetail(
      {
        ...session,
        permissionCodes: [
          ...new Set([...session.permissionCodes, permissions.consumptionView]),
        ],
      },
      id,
    ),
    getRestaurantConsumptionWorkspace({
      ...session,
      permissionCodes: [
        ...new Set([...session.permissionCodes, permissions.consumptionView]),
      ],
    }),
    listRestaurantConsumptionCatalog(session),
  ]);
  if (!(["DRAFT", "RETURNED"] as string[]).includes(declaration.status)) {
    redirect(`/servings/${id}`);
  }
  if (!workspace.configuration) redirect("/servings");
  const periods = Array.isArray(workspace.configuration.servicePeriods)
    ? (workspace.configuration.servicePeriods as Array<{
        code: string;
        label: string;
      }>)
    : [];
  const initialLines: ServingDeclarationEditorLine[] = declaration.lines.map(
    (line: any) => ({
      menuItemId: line.menuItemId,
      disposition: line.disposition,
      quantityServed: String(line.quantityServed),
      complimentaryReason: line.complimentaryReason ?? "",
      complimentaryReference: line.complimentaryReference ?? "",
    }),
  );
  const feedback = getActionFeedback(searchParams ? await searchParams : {});
  return (
    <AppShell
      session={session}
      activeNav="servings"
      title="Edit serving declaration"
      subtitle="Draft facts can be changed until verification"
    >
      <RedirectActionToast
        cleanHref={`/servings/${id}/edit`}
        feedback={feedback}
      />
      <div className="mb-4">
        <ButtonLink href={`/servings/${id}`} tone="secondary">
          Cancel editing
        </ButtonLink>
      </div>
      <ServingDeclarationEditor
        action={updateAction}
        catalog={catalog}
        declarationId={id}
        declarationVersion={declaration.version}
        defaultBusinessDate={new Date(declaration.businessDate)
          .toISOString()
          .slice(0, 10)}
        defaultPeriodCode={declaration.servicePeriodCode}
        idempotencyKey={randomUUID()}
        initialLines={initialLines}
        periods={periods}
        submitLabel="Save draft changes"
      />
    </AppShell>
  );
}
