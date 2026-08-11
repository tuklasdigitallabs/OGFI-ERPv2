import { redirect } from "next/navigation";
import { Badge, ButtonLink, EmptyState } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { RedirectActionToast } from "@/components/RedirectActionToast";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import { permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  cancelServingDeclaration,
  cancelVerifiedServingDeclaration,
  createServingCorrection,
  getServingDeclarationDetail,
  postServingConsumption,
  returnServingDeclaration,
  reverseServingConsumption,
  submitServingDeclaration,
  verifyServingDeclaration,
} from "@/server/services/restaurantConsumption";

export const dynamic = "force-dynamic";

async function submitServingAction(id: string, formData: FormData) {
  "use server";
  try {
    formData.set("id", id);
    await submitServingDeclaration(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}`, error));
  }
  redirect(`/servings/${id}?success=SERVING_DECLARATION_SUBMITTED`);
}

async function verifyServingAction(id: string, formData: FormData) {
  "use server";
  try {
    formData.set("id", id);
    await verifyServingDeclaration(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}`, error));
  }
  redirect(`/servings/${id}?success=SERVING_DECLARATION_VERIFIED`);
}

async function postConsumptionAction(id: string, formData: FormData) {
  "use server";
  try {
    formData.set("id", id);
    await postServingConsumption(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}`, error));
  }
  redirect(`/servings/${id}?success=SERVING_CONSUMPTION_POSTED`);
}

async function reverseConsumptionAction(id: string, formData: FormData) {
  "use server";
  try {
    formData.set("id", id);
    await reverseServingConsumption(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}`, error));
  }
  redirect(`/servings/${id}?success=SERVING_CONSUMPTION_REVERSED`);
}

async function returnServingAction(id: string, formData: FormData) {
  "use server";
  try {
    formData.set("id", id);
    await returnServingDeclaration(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}`, error));
  }
  redirect(`/servings/${id}?success=SERVING_DECLARATION_RETURNED`);
}

async function cancelServingAction(id: string, formData: FormData) {
  "use server";
  try {
    formData.set("id", id);
    await cancelServingDeclaration(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}`, error));
  }
  redirect(`/servings/${id}?success=SERVING_DECLARATION_CANCELLED`);
}

async function cancelVerifiedServingAction(id: string, formData: FormData) {
  "use server";
  try {
    formData.set("id", id);
    await cancelVerifiedServingDeclaration(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}`, error));
  }
  redirect(`/servings/${id}?success=SERVING_DECLARATION_VERIFIED_CANCELLED`);
}

async function createCorrectionAction(id: string, formData: FormData) {
  "use server";
  let correctionId: string;
  try {
    formData.set("id", id);
    const correction = await createServingCorrection(formData);
    correctionId = correction.id;
  } catch (error) {
    redirect(actionErrorRedirectPath(`/servings/${id}`, error));
  }
  redirect(
    `/servings/${correctionId}/edit?success=SERVING_DECLARATION_CORRECTION_CREATED`,
  );
}

export default async function ServingDeclarationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (!session.permissionCodes.includes(permissions.consumptionView))
    redirect("/servings");
  const { id } = await params;
  const declaration = await getServingDeclarationDetail(session, id);
  const feedback = getActionFeedback(searchParams ? await searchParams : {});
  const blockers = Array.isArray(declaration.readinessBlockers)
    ? (declaration.readinessBlockers as string[])
    : [];
  const submitAction = submitServingAction.bind(null, id);
  const verifyAction = verifyServingAction.bind(null, id);
  const postAction = postConsumptionAction.bind(null, id);
  const reverseAction = reverseConsumptionAction.bind(null, id);
  const returnAction = returnServingAction.bind(null, id);
  const cancelAction = cancelServingAction.bind(null, id);
  const cancelVerifiedAction = cancelVerifiedServingAction.bind(null, id);
  const correctionAction = createCorrectionAction.bind(null, id);
  return (
    <AppShell
      session={session}
      activeNav="servings"
      title={`Serving declaration · ${new Date(declaration.businessDate).toISOString().slice(0, 10)}`}
      subtitle={`${declaration.servicePeriodCode} · ${session.context.locationName}`}
    >
      <div className="grid gap-5">
        <RedirectActionToast
          cleanHref={`/servings/${id}`}
          feedback={feedback}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/servings" tone="secondary">
              Back to declarations
            </ButtonLink>
            {(["DRAFT", "RETURNED"] as string[]).includes(declaration.status) &&
            session.permissionCodes.includes(permissions.consumptionCreate) ? (
              <ButtonLink href={`/servings/${id}/edit`}>Edit draft</ButtonLink>
            ) : null}
          </div>
          <Badge
            tone={
              declaration.status === "POSTED"
                ? "success"
                : declaration.status.includes("BLOCKED") ||
                    declaration.status === "RETURNED"
                  ? "warning"
                  : "info"
            }
          >
            {declaration.status.replaceAll("_", " ")}
          </Badge>
        </div>
        <section className="ogfi-data-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">
                Business date
              </p>
              <p className="mt-1 font-semibold">
                {new Date(declaration.businessDate).toISOString().slice(0, 10)}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">
                Service period
              </p>
              <p className="mt-1 font-semibold">
                {declaration.servicePeriodCode}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">
                Issue location
              </p>
              <p className="mt-1 font-semibold">
                {declaration.configuration.defaultIssueInventoryLocation.name}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">
                Snapshot
              </p>
              <p className="mt-1 truncate font-mono text-xs">
                {declaration.derivationSnapshotHash ?? "Not verified"}
              </p>
            </div>
          </div>
        </section>
        {blockers.length ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="font-bold text-amber-950">
              Posting readiness blockers
            </h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold">Menu servings</h2>
              <p className="text-sm text-slate-500">
                Verified facts are immutable; corrections use return before
                verification or reversal after posting.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-200">
            {declaration.lines.map((line: any) => (
              <div
                className="grid gap-2 px-4 py-3 md:grid-cols-[5rem_minmax(14rem,1fr)_8rem_12rem]"
                key={line.id}
              >
                <span className="text-sm text-slate-500">
                  Line {line.lineNo}
                </span>
                <span className="font-semibold">
                  {line.menuItemNameSnapshot}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {line.menuItemCodeSnapshot}
                  </span>
                </span>
                <span>{Number(line.quantityServed).toLocaleString()}</span>
                <span>
                  {line.disposition === "COMPLIMENTARY"
                    ? `Complimentary · ${line.complimentaryReason}`
                    : "Paid"}
                </span>
              </div>
            ))}
          </div>
        </section>
        {declaration.ingredientSnapshots.length ? (
          <section className="ogfi-data-surface overflow-hidden">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold">
                  Expected ingredient consumption
                </h2>
                <p className="text-sm text-slate-500">
                  Book consumption from the pinned recipe snapshot; not independent physical actual evidence.
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-200">
              {declaration.ingredientSnapshots.map((snapshot: any) => (
                <div
                  className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_10rem_10rem]"
                  key={snapshot.id}
                >
                  <span>
                    <strong>{snapshot.item.itemName}</strong>
                    <span className="ml-2 font-mono text-xs text-slate-500">
                      {snapshot.item.itemCode} · path {snapshot.recipeLinePath}
                    </span>
                  </span>
                  <span>
                    {Number(snapshot.roundedQuantityBaseUom).toLocaleString()}{" "}
                    {snapshot.baseUom.uomCode}
                  </span>
                  <span className="text-slate-500">Recipe v pinned</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {declaration.posting ? (
          <section className="ogfi-data-surface overflow-hidden">
            <div className="ogfi-section-header">
              <div>
                <h2 className="text-lg font-bold">Inventory posting</h2>
                <p className="text-sm text-slate-500">
                  Immutable FEFO lot allocations for expected/book consumption.
                </p>
              </div>
              <Badge
                tone={
                  declaration.posting.status === "POSTED"
                    ? "success"
                    : declaration.posting.status === "REVERSED"
                      ? "danger"
                      : "info"
                }
              >
                {declaration.posting.status}
              </Badge>
            </div>
            <div className="divide-y divide-slate-200">
              {declaration.posting.allocations.map((allocation: any) => (
                <div
                  className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[5rem_minmax(12rem,1fr)_10rem_12rem]"
                  key={allocation.id}
                >
                  <span className="text-slate-500">
                    #{allocation.allocationNo}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {allocation.item.itemName}
                    <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                      {allocation.item.itemCode}
                    </span>
                  </span>
                  <span>
                    {Number(allocation.quantityBaseUom).toLocaleString()}{" "}
                    {allocation.baseUom.uomCode}
                  </span>
                  <span className="text-slate-500">
                    Lot {allocation.lotNumber ?? "Untracked"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="ogfi-data-surface p-4">
          <h2 className="font-bold">Available action</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {["DRAFT", "RETURNED"].includes(declaration.status) &&
            session.permissionCodes.includes(permissions.consumptionCreate) ? (
              <form action={submitAction}>
                <button className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white">
                  Submit facts
                </button>
              </form>
            ) : null}
            {(["SUBMITTED", "DERIVATION_BLOCKED"] as string[]).includes(
              declaration.status,
            ) &&
            session.permissionCodes.includes(permissions.consumptionVerify) ? (
              <form action={verifyAction}>
                <button className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white">
                  Verify facts and derive recipe use
                </button>
              </form>
            ) : null}
            {(["SUBMITTED", "DERIVATION_BLOCKED"] as string[]).includes(
              declaration.status,
            ) &&
            session.permissionCodes.includes(permissions.consumptionVerify) ? (
              <form action={returnAction} className="flex gap-2">
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3"
                  name="reason"
                  placeholder="Return reason"
                  required
                />
                <button className="min-h-11 rounded-lg border border-amber-300 px-4 font-semibold text-amber-800">
                  Return
                </button>
              </form>
            ) : null}
            {declaration.status === "READY_TO_POST" &&
            session.permissionCodes.includes(permissions.consumptionPost) ? (
              <form action={postAction}>
                <button className="min-h-11 rounded-lg bg-emerald-600 px-4 font-semibold text-white">
                  Post expected consumption
                </button>
              </form>
            ) : null}
            {declaration.status === "READY_TO_POST" &&
            session.permissionCodes.includes(permissions.consumptionVerify) ? (
              <form action={cancelVerifiedAction} className="flex gap-2">
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3"
                  name="reason"
                  placeholder="Verified cancellation reason"
                  required
                />
                <button className="min-h-11 rounded-lg border border-rose-300 px-4 font-semibold text-rose-700">
                  Cancel verified facts
                </button>
              </form>
            ) : null}
            {declaration.status === "POSTED" &&
            session.permissionCodes.includes(permissions.consumptionReverse) ? (
              <form
                action={reverseAction}
                className="grid gap-2 sm:grid-cols-[1fr_auto]"
              >
                <input
                  name="idempotencyKey"
                  type="hidden"
                  value={`reverse:${declaration.id}`}
                />
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3"
                  name="reason"
                  placeholder="Reversal reason"
                  required
                />
                <button className="min-h-11 rounded-lg border border-rose-300 px-4 font-semibold text-rose-700">
                  Reverse full posting
                </button>
              </form>
            ) : null}
            {(["DRAFT", "RETURNED"] as string[]).includes(declaration.status) &&
            session.permissionCodes.includes(permissions.consumptionCreate) ? (
              <form action={cancelAction} className="flex gap-2">
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3"
                  name="reason"
                  placeholder="Cancellation reason"
                  required
                />
                <button className="min-h-11 rounded-lg border border-rose-300 px-4 font-semibold text-rose-700">
                  Cancel declaration
                </button>
              </form>
            ) : null}
            {(["REVERSED", "CANCELLED"] as string[]).includes(
              declaration.status,
            ) &&
            session.permissionCodes.includes(permissions.consumptionCreate) ? (
              <form action={correctionAction}>
                <input
                  name="idempotencyKey"
                  type="hidden"
                  value={`correction:${declaration.id}`}
                />
                <button className="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white">
                  Create corrected revision
                </button>
              </form>
            ) : null}
            {!(
              [
                "DRAFT",
                "RETURNED",
                "SUBMITTED",
                "DERIVATION_BLOCKED",
                "READY_TO_POST",
                "POSTED",
              ] as string[]
            ).includes(declaration.status) ? (
              <EmptyState
                title="No action available"
                description="This declaration is in a terminal or controlled transition state."
              />
            ) : null}
          </div>
        </section>
        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold">Activity and audit history</h2>
              <p className="text-sm text-slate-500">
                Fact, verification, posting, reversal, and denied-transition
                evidence remains chronological and non-destructive.
              </p>
            </div>
          </div>
          {declaration.activity.length ? (
            <div className="divide-y divide-slate-200">
              {declaration.activity.map((event: any) => (
                <div
                  className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[14rem_1fr_16rem] md:items-center"
                  key={event.id}
                >
                  <span className="font-semibold text-slate-900">
                    {event.eventType
                      .replaceAll("_", " ")
                      .replaceAll(".", " · ")}
                  </span>
                  <span className="text-slate-600">
                    {event.actor?.displayName ?? event.actor?.email ?? "System"}
                  </span>
                  <time className="text-slate-500">
                    {new Intl.DateTimeFormat("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: declaration.configuration.timezone,
                    }).format(new Date(event.occurredAt))}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-slate-500">
              No activity has been recorded.
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
