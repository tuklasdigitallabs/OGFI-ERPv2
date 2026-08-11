import { redirect } from "next/navigation";
import { Badge, EmptyState } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { RedirectActionToast } from "@/components/RedirectActionToast";
import { ServingsWorkspaceTabs } from "@/components/ServingsWorkspaceTabs";
import {
  ConsumptionConfigurationForm,
  MenuRecipeGovernanceWorkspace,
} from "@/components/RestaurantConsumptionSettingsForms";
import {
  actionErrorRedirectPath,
  getActionFeedback,
} from "@/server/services/actionFeedback";
import {
  canUseRestaurantConsumption,
  getGrantedPermissionCodes,
  permissions,
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  activateRestaurantConsumptionConfiguration,
  adoptSharedRecipeForBrand,
  assignBrandMenuRecipeDefault,
  assignLocationMenuRecipeOverride,
  configureRestaurantConsumption,
  cancelFutureRestaurantMenuPolicy,
  endLocationMenuRecipeOverride,
  getRestaurantConsumptionSettings,
  menuRecipePolicyPermissions,
  parseRestaurantConsumptionConfigurationForm,
  setMenuItemLocationAvailability,
} from "@/server/services/restaurantConsumption";

export const dynamic = "force-dynamic";

type ReadinessRow = {
  menuItemId: string;
  assignmentId?: string | null;
  offerState: "OFFERED" | "UNAVAILABLE" | "UNMAPPED";
  resolutionSource: "BRAND_DEFAULT" | "LOCATION_OVERRIDE" | null;
  effectiveFrom: string | Date | null;
  effectiveTo: string | Date | null;
  quantityReadiness: "READY" | "BLOCKED";
  quantityBlockers: string[];
  costReadiness: "READY" | "PENDING";
  costWarnings: string[];
  recipeName?: string | null;
  versionNo?: number | null;
  recipeVersion?: {
    versionNo: number;
    recipe: { recipeCode: string; recipeName: string };
  } | null;
};

function humanize(value: string) {
  return value.replaceAll("_", " ").toLocaleLowerCase();
}

function effectiveLabel(value: string | Date | null, timeZone: string) {
  if (!value) return "Open ended";
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
}

function dateTimeLocalValueInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((values, part) => {
      if (part.type !== "literal") values[part.type] = part.value;
      return values;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

async function configureAction(formData: FormData) {
  "use server";
  try {
    await configureRestaurantConsumption(
      parseRestaurantConsumptionConfigurationForm(formData),
    );
  } catch (error) {
    redirect(actionErrorRedirectPath("/servings/settings", error));
  }
  redirect(
    "/servings/settings?success=RESTAURANT_CONSUMPTION_CONFIGURATION_CREATED",
  );
}

function requiredFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("RESTAURANT_CONSUMPTION_INPUT_INVALID");
  }
  return value.trim();
}

function optionalFormValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function brandDefaultAction(formData: FormData) {
  "use server";
  try {
    await assignBrandMenuRecipeDefault({
      brandId: requiredFormValue(formData, "brandId"),
      menuItemId: requiredFormValue(formData, "menuItemId"),
      recipeVersionId: requiredFormValue(formData, "recipeVersionId"),
      idempotencyKey: requiredFormValue(formData, "idempotencyKey"),
      effectiveFrom: requiredFormValue(formData, "effectiveFrom"),
      effectiveTo: optionalFormValue(formData, "effectiveTo"),
      reason: requiredFormValue(formData, "reason"),
    });
  } catch (error) {
    redirect(actionErrorRedirectPath("/servings/settings", error));
  }
  redirect("/servings/settings?success=BRAND_MENU_RECIPE_DEFAULT_CREATED");
}

async function locationOverrideAction(formData: FormData) {
  "use server";
  try {
    await assignLocationMenuRecipeOverride({
      brandId: requiredFormValue(formData, "brandId"),
      locationId: requiredFormValue(formData, "locationId"),
      menuItemId: requiredFormValue(formData, "menuItemId"),
      recipeVersionId: requiredFormValue(formData, "recipeVersionId"),
      idempotencyKey: requiredFormValue(formData, "idempotencyKey"),
      effectiveFrom: requiredFormValue(formData, "effectiveFrom"),
      effectiveTo: optionalFormValue(formData, "effectiveTo"),
      reason: requiredFormValue(formData, "reason"),
    });
  } catch (error) {
    redirect(actionErrorRedirectPath("/servings/settings", error));
  }
  redirect("/servings/settings?success=LOCATION_MENU_RECIPE_OVERRIDE_CREATED");
}

async function availabilityAction(formData: FormData) {
  "use server";
  try {
    await setMenuItemLocationAvailability({
      brandId: requiredFormValue(formData, "brandId"),
      locationId: requiredFormValue(formData, "locationId"),
      menuItemId: requiredFormValue(formData, "menuItemId"),
      state: requiredFormValue(formData, "state") as
        | "AVAILABLE"
        | "UNAVAILABLE",
      idempotencyKey: requiredFormValue(formData, "idempotencyKey"),
      effectiveFrom: requiredFormValue(formData, "effectiveFrom"),
      effectiveTo: optionalFormValue(formData, "effectiveTo"),
      reason: requiredFormValue(formData, "reason"),
    });
  } catch (error) {
    redirect(actionErrorRedirectPath("/servings/settings", error));
  }
  redirect(
    "/servings/settings?success=MENU_ITEM_LOCATION_AVAILABILITY_UPDATED",
  );
}

async function sharedAdoptionAction(formData: FormData) {
  "use server";
  try {
    await adoptSharedRecipeForBrand({
      brandId: requiredFormValue(formData, "brandId"),
      recipeId: requiredFormValue(formData, "recipeId"),
      idempotencyKey: requiredFormValue(formData, "idempotencyKey"),
      effectiveFrom: requiredFormValue(formData, "effectiveFrom"),
      effectiveTo: optionalFormValue(formData, "effectiveTo"),
      reason: requiredFormValue(formData, "reason"),
    });
  } catch (error) {
    redirect(actionErrorRedirectPath("/servings/settings", error));
  }
  redirect("/servings/settings?success=SHARED_RECIPE_ADOPTED_FOR_BRAND");
}

async function recoveryAction(formData: FormData) {
  "use server";
  const recoveryKind = optionalFormValue(formData, "recoveryKind") ?? "";
  try {
    if (recoveryKind === "END_OVERRIDE") {
      await endLocationMenuRecipeOverride({
        brandId: requiredFormValue(formData, "brandId"),
        locationId: requiredFormValue(formData, "locationId"),
        assignmentId: requiredFormValue(formData, "targetId"),
        effectiveTo: requiredFormValue(formData, "effectiveTo"),
        idempotencyKey: requiredFormValue(formData, "idempotencyKey"),
        reason: requiredFormValue(formData, "reason"),
      });
    } else if (recoveryKind === "CANCEL_FUTURE") {
      await cancelFutureRestaurantMenuPolicy({
        brandId: requiredFormValue(formData, "brandId"),
        targetType: requiredFormValue(formData, "targetType"),
        targetId: requiredFormValue(formData, "targetId"),
        idempotencyKey: requiredFormValue(formData, "idempotencyKey"),
        reason: requiredFormValue(formData, "reason"),
      });
    } else {
      throw new Error("MENU_RECIPE_ASSIGNMENT_SCOPE_OR_STATE_INVALID");
    }
  } catch (error) {
    redirect(actionErrorRedirectPath("/servings/settings", error));
  }
  redirect(
    recoveryKind === "END_OVERRIDE"
      ? "/servings/settings?success=LOCATION_MENU_RECIPE_OVERRIDE_ENDED"
      : "/servings/settings?success=RESTAURANT_MENU_POLICY_FUTURE_CANCELLED",
  );
}

async function activateAction(formData: FormData) {
  "use server";
  try {
    await activateRestaurantConsumptionConfiguration(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/servings/settings", error));
  }
  redirect(
    "/servings/settings?success=RESTAURANT_CONSUMPTION_CONFIGURATION_ACTIVATED",
  );
}

export default async function RestaurantConsumptionSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  const grantedPermissionCodes = await getGrantedPermissionCodes(session);
  const canConfigureConsumption = grantedPermissionCodes.includes(
    permissions.consumptionConfigure,
  );
  const canOpenMenuPolicy = Object.values(menuRecipePolicyPermissions).some(
    (permission) => grantedPermissionCodes.includes(permission),
  );
  if (
    !canUseRestaurantConsumption(grantedPermissionCodes) &&
    !canOpenMenuPolicy
  )
    redirect("/servings");
  const settings = await getRestaurantConsumptionSettings(session);
  const canAdoptMenuRecipes = grantedPermissionCodes.includes(
    menuRecipePolicyPermissions.adopt,
  );
  const canManageBranchExceptions = grantedPermissionCodes.includes(
    menuRecipePolicyPermissions.branchException,
  );
  const canMutateBranchConfiguration =
    canConfigureConsumption || canOpenMenuPolicy;
  const feedback = getActionFeedback(searchParams ? await searchParams : {});
  const initialPeriods = Array.isArray(
    settings.latestConfiguration?.servicePeriods,
  )
    ? (settings.latestConfiguration.servicePeriods as Array<{
        code: string;
        label: string;
        start: string;
        end: string;
      }>)
    : settings.companyDefaultSchedule.periods;
  const initialSentinelRules =
    settings.latestConfiguration?.sentinelRules &&
    typeof settings.latestConfiguration.sentinelRules === "object" &&
    !Array.isArray(settings.latestConfiguration.sentinelRules)
      ? (settings.latestConfiguration.sentinelRules as {
          dailyCountItemIds?: string[];
          pilotDailyCountDays?: number;
          highRiskCountFrequencyDays?: number;
          generalCountFrequencyDays?: number;
        })
      : undefined;
  const extendedSettings = settings as typeof settings & {
    brandDefaults?: any[];
    locationOverrides?: any[];
    locationAvailabilities?: any[];
    menuReadiness?: Array<Omit<ReadinessRow, "recipeVersion">>;
    sharedRecipeAdoptions?: any[];
    sharedPublishedRecipes?: any[];
  };
  const readinessRows: ReadinessRow[] =
    extendedSettings.menuReadiness?.map((row): ReadinessRow => {
      const normalizedRow = row as unknown as Omit<
        ReadinessRow,
        "recipeVersion"
      >;
      const assignment = [
        ...(extendedSettings.locationOverrides ?? []),
        ...(extendedSettings.brandDefaults ?? []),
      ].find((candidate: any) => candidate.id === normalizedRow.assignmentId);
      return {
        ...normalizedRow,
        recipeVersion: assignment?.recipeVersion ?? null,
      };
    }) ??
    settings.menuItems.map((item: any): ReadinessRow => {
      const assignment = settings.assignments.find(
        (candidate: any) => candidate.menuItemId === item.id,
      );
      return {
        menuItemId: item.id,
        offerState: assignment ? "OFFERED" : "UNMAPPED",
        resolutionSource: assignment?.scopeType ?? null,
        effectiveFrom: assignment?.effectiveFrom ?? null,
        effectiveTo: assignment?.effectiveTo ?? null,
        quantityReadiness: assignment ? "READY" : "BLOCKED",
        quantityBlockers: assignment ? [] : ["MENU_RECIPE_ASSIGNMENT_MISSING"],
        costReadiness: "READY",
        costWarnings: [],
        recipeVersion: assignment?.recipeVersion ?? null,
      };
    });
  const readinessByMenuItemId = new Map(
    readinessRows.map((row) => [row.menuItemId, row]),
  );
  const blockedItems = readinessRows.filter(
    (row) => row.quantityReadiness === "BLOCKED",
  );
  const pendingCostItems = readinessRows.filter(
    (row) => row.costReadiness === "PENDING",
  );
  const displayTimezone = settings.companyTimezone;
  const effectiveConfiguration = settings.effectiveConfiguration;
  const effectivePeriods = Array.isArray(effectiveConfiguration?.servicePeriods)
    ? (effectiveConfiguration.servicePeriods as Array<{
        code: string;
        label: string;
        start: string;
        end: string;
      }>)
    : [];
  const effectiveSentinelRules =
    effectiveConfiguration?.sentinelRules &&
    typeof effectiveConfiguration.sentinelRules === "object" &&
    !Array.isArray(effectiveConfiguration.sentinelRules)
      ? (effectiveConfiguration.sentinelRules as {
          dailyCountItemIds?: string[];
          pilotDailyCountDays?: number;
          highRiskCountFrequencyDays?: number;
          generalCountFrequencyDays?: number;
        })
      : undefined;
  const effectiveSentinelItemIds = new Set(
    effectiveSentinelRules?.dailyCountItemIds ?? [],
  );
  const effectiveSentinelItems = settings.inventoryItems.filter((item: any) =>
    effectiveSentinelItemIds.has(item.id),
  );
  const defaultPolicyEffectiveFrom = dateTimeLocalValueInTimeZone(
    new Date(Date.now() + 5 * 60_000),
    displayTimezone,
  );
  const adoptedSharedRecipeIds = new Set(
    (extendedSettings.sharedRecipeAdoptions ?? [])
      .filter((adoption: any) => adoption.status === "ACTIVE")
      .map((adoption: any) => adoption.recipeId),
  );
  const eligiblePublishedRecipes = settings.publishedRecipes.filter(
    (version: any) =>
      (version.recipe.brandId !== null &&
        version.recipe.brandId === session.context.brandId) ||
      (version.recipe.brandId === null &&
        adoptedSharedRecipeIds.has(version.recipe.id)),
  );
  const sharedRecipeCandidates = (
    extendedSettings.sharedPublishedRecipes ?? []
  ).filter(
    (version: any) =>
      version.recipe.brandId === null &&
      !adoptedSharedRecipeIds.has(version.recipe.id),
  );
  const menuItemNameById = new Map<string, string>(
    settings.menuItems.map(
      (item: any) => [item.id, item.menuItemName] as const,
    ),
  );
  const policyRecords = [
    ...(extendedSettings.brandDefaults ?? []).map((record: any) => ({
      id: record.id,
      targetType: "MENU_RECIPE_ASSIGNMENT" as const,
      label: record.menuItem?.menuItemName ?? "Brand menu default",
      detail: `Brand default · ${record.recipeVersion?.recipe?.recipeName ?? "Published recipe"}`,
      effectiveFrom: new Date(record.effectiveFrom).toISOString(),
      effectiveTo: record.effectiveTo
        ? new Date(record.effectiveTo).toISOString()
        : null,
      locationId: null,
      scopeType: "BRAND_DEFAULT" as const,
    })),
    ...(extendedSettings.locationOverrides ?? []).map((record: any) => ({
      id: record.id,
      targetType: "MENU_RECIPE_ASSIGNMENT" as const,
      label: record.menuItem?.menuItemName ?? "Branch recipe override",
      detail: `Branch override · ${record.recipeVersion?.recipe?.recipeName ?? "Published recipe"}`,
      effectiveFrom: new Date(record.effectiveFrom).toISOString(),
      effectiveTo: record.effectiveTo
        ? new Date(record.effectiveTo).toISOString()
        : null,
      locationId: record.locationId,
      scopeType: "LOCATION_OVERRIDE" as const,
    })),
    ...(extendedSettings.locationAvailabilities ?? []).map((record: any) => ({
      id: record.id,
      targetType: "MENU_ITEM_LOCATION_AVAILABILITY" as const,
      label:
        menuItemNameById.get(record.menuItemId) ?? "Branch menu availability",
      detail: record.state,
      effectiveFrom: new Date(record.effectiveFrom).toISOString(),
      effectiveTo: record.effectiveTo
        ? new Date(record.effectiveTo).toISOString()
        : null,
      locationId: record.locationId,
      scopeType: null,
    })),
    ...(extendedSettings.sharedRecipeAdoptions ?? []).map((record: any) => ({
      id: record.id,
      targetType: "RECIPE_BRAND_ADOPTION" as const,
      label: record.recipe?.recipeName ?? "Shared recipe adoption",
      detail: "Company-shared recipe adoption",
      effectiveFrom: new Date(record.effectiveFrom).toISOString(),
      effectiveTo: record.effectiveTo
        ? new Date(record.effectiveTo).toISOString()
        : null,
      locationId: null,
      scopeType: null,
    })),
  ].filter((record) => {
    const startsInFuture =
      new Date(record.effectiveFrom).getTime() > Date.now();
    const isCurrentLocationOverride =
      record.targetType === "MENU_RECIPE_ASSIGNMENT" &&
      record.scopeType === "LOCATION_OVERRIDE" &&
      (!record.effectiveTo ||
        new Date(record.effectiveTo).getTime() > Date.now());
    return startsInFuture || isCurrentLocationOverride;
  });

  return (
    <AppShell
      session={session}
      activeNav="servings"
      title="Servings & Consumption"
      subtitle="Serving facts, controlled review, expected-consumption posting, and branch configuration"
    >
      <div className="grid gap-5">
        <ServingsWorkspaceTabs
          active="configuration"
          permissionCodes={grantedPermissionCodes}
        />
        <RedirectActionToast
          cleanHref="/servings/settings"
          feedback={feedback}
        />
        <section className="ogfi-data-surface p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
                Branch configuration
              </p>
              <h1 className="mt-1 text-xl font-bold text-slate-950">
                {session.context.locationName}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                The active version applies only to this selected branch. It
                controls its inventory issue location, service periods, count
                sentinels, and menu-recipe readiness.
              </p>
            </div>
            <Badge tone={canMutateBranchConfiguration ? "info" : "neutral"}>
              {canMutateBranchConfiguration ? "ADMINISTRATION" : "READ ONLY"}
            </Badge>
          </div>
          {!canMutateBranchConfiguration ? (
            <p
              className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
              role="status"
            >
              You can review the effective configuration for your branch. Only
              an authorized administrator can create, activate, adopt, override,
              or cancel configuration records.
            </p>
          ) : null}
        </section>

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Effective branch configuration
              </h2>
              <p className="text-sm text-slate-500">
                Current operational controls used by serving declarations and
                expected-consumption posting.
              </p>
            </div>
            <Badge tone={effectiveConfiguration ? "success" : "warning"}>
              {effectiveConfiguration
                ? `ACTIVE · v${effectiveConfiguration.version}`
                : "NOT ACTIVE"}
            </Badge>
          </div>
          {effectiveConfiguration ? (
            <div className="grid gap-5 p-5">
              <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">
                    Applied branch
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {session.context.locationName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">
                    Inventory issue location
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {effectiveConfiguration.defaultIssueInventoryLocation.name}
                  </dd>
                  <dd className="text-xs text-slate-500">
                    {effectiveConfiguration.defaultIssueInventoryLocation.code}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">
                    Entry schedule
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {effectiveConfiguration.servicePeriodMode === "SHIFT"
                      ? "Per shift with daily rollup"
                      : "One daily declaration"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">
                    Business timezone
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {effectiveConfiguration.timezone}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-slate-500">
                    Effective from
                  </dt>
                  <dd className="mt-1 font-semibold text-slate-950">
                    {effectiveLabel(
                      effectiveConfiguration.effectiveFrom,
                      displayTimezone,
                    )}
                  </dd>
                </div>
              </dl>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-slate-950">Service periods</h3>
                  <div className="mt-3 grid gap-2">
                    {effectivePeriods.map((period) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                        key={period.code}
                      >
                        <span className="font-semibold text-slate-950">
                          {period.label}
                        </span>
                        <span className="font-mono text-slate-600">
                          {period.start}–{period.end}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-slate-950">
                    High-shrink sentinel ingredients
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {effectiveSentinelItems.length
                      ? `${effectiveSentinelItems.length} item${effectiveSentinelItems.length === 1 ? "" : "s"} receive the configured enhanced count cadence.`
                      : "No enhanced sentinel cohort is configured."}
                  </p>
                  {effectiveSentinelItems.length ? (
                    <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      {effectiveSentinelItems.map((item: any) => (
                        <li
                          className="rounded-lg bg-slate-50 px-3 py-2"
                          key={item.id}
                        >
                          <span className="font-semibold text-slate-950">
                            {item.itemName}
                          </span>
                          <span className="ml-2 font-mono text-xs text-slate-500">
                            {item.itemCode}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No active branch configuration"
                description={
                  canConfigureConsumption
                    ? "Create and activate a branch configuration version before serving declarations can be posted."
                    : "An authorized administrator must activate a configuration before this branch can post expected consumption."
                }
              />
            </div>
          )}
        </section>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="ogfi-data-surface p-4">
            <p className="text-xs font-bold uppercase text-slate-500">
              Configuration
            </p>
            <div className="mt-2">
              <Badge
                tone={
                  settings.latestConfiguration?.enabled ? "success" : "warning"
                }
              >
                {settings.latestConfiguration
                  ? `v${settings.latestConfiguration.version} · ${settings.latestConfiguration.status}`
                  : "NOT CONFIGURED"}
              </Badge>
            </div>
          </article>
          <article className="ogfi-data-surface p-4">
            <p className="text-xs font-bold uppercase text-slate-500">
              Brand defaults
            </p>
            <p className="mt-2 text-3xl font-bold">
              {extendedSettings.brandDefaults?.length ??
                readinessRows.filter(
                  (row) => row.resolutionSource === "BRAND_DEFAULT",
                ).length}
              <span className="text-base font-normal text-slate-500">
                {" "}
                inherited
              </span>
            </p>
          </article>
          <article className="ogfi-data-surface p-4">
            <p className="text-xs font-bold uppercase text-slate-500">
              Branch exceptions
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {(extendedSettings.locationOverrides?.length ??
                readinessRows.filter(
                  (row) => row.resolutionSource === "LOCATION_OVERRIDE",
                ).length) +
                (extendedSettings.locationAvailabilities?.filter(
                  (exception: any) => exception.state === "UNAVAILABLE",
                ).length ??
                  readinessRows.filter(
                    (row) => row.offerState === "UNAVAILABLE",
                  ).length)}
            </p>
          </article>
          <article className="ogfi-data-surface p-4">
            <p className="text-xs font-bold uppercase text-slate-500">
              Quantity readiness
            </p>
            <p
              className={`mt-2 font-bold ${blockedItems.length ? "text-amber-700" : "text-emerald-700"}`}
            >
              {blockedItems.length
                ? `${blockedItems.length} menu item${blockedItems.length === 1 ? "" : "s"} blocked`
                : "All offered items ready"}
            </p>
            {pendingCostItems.length ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">
                {pendingCostItems.length} cost warning
                {pendingCostItems.length === 1 ? "" : "s"}; quantity remains
                separate
              </p>
            ) : null}
          </article>
        </section>

        {canConfigureConsumption &&
        settings.latestConfiguration?.status === "DRAFT" ? (
          <section className="ogfi-data-surface p-5">
            <h2 className="text-lg font-bold">
              Activate configuration v{settings.latestConfiguration.version}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Activation is explicit. The current effective version remains in
              force until this version&apos;s effective time.
            </p>
            {settings.activationReadiness.blockers.length ? (
              <div
                className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4"
                role="alert"
              >
                <p className="font-bold text-amber-950">
                  Resolve readiness blockers before activation
                </p>
                <ul className="mt-2 list-disc pl-5 text-sm text-amber-900">
                  {settings.activationReadiness.blockers.map(
                    (blocker: string) => (
                      <li key={blocker}>{blocker.replaceAll("_", " ")}</li>
                    ),
                  )}
                </ul>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                Issue location, active menu coverage, recipe publication, and
                recipe/UOM derivation checks are ready.
              </p>
            )}
            <form
              action={activateAction}
              className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end"
            >
              <input
                name="id"
                type="hidden"
                value={settings.latestConfiguration.id}
              />
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Activation reason
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3"
                  name="reason"
                  placeholder="Approved branch rollout"
                  required
                />
              </label>
              <button
                className="min-h-11 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                disabled={settings.activationReadiness.blockers.length > 0}
                type="submit"
              >
                Activate version
              </button>
            </form>
          </section>
        ) : null}

        {canConfigureConsumption ? (
          <section className="ogfi-data-surface p-5">
            <div className="mb-4">
              <h2 className="text-lg font-bold">
                Create branch configuration version
              </h2>
              <p className="text-sm text-slate-500">
                A new version preserves prior schedules and issue-location
                history. Activation is branch-specific and default-off.
              </p>
            </div>
            {settings.inventoryLocations.length ? (
              <ConsumptionConfigurationForm
                action={configureAction}
                initialMode={
                  settings.latestConfiguration?.servicePeriodMode ??
                  settings.companyDefaultSchedule.mode
                }
                initialPeriods={initialPeriods}
                {...(settings.latestConfiguration
                  ?.defaultIssueInventoryLocationId
                  ? {
                      initialInventoryLocationId:
                        settings.latestConfiguration
                          .defaultIssueInventoryLocationId,
                    }
                  : {})}
                initialTimezone={
                  settings.latestConfiguration?.timezone ??
                  settings.companyDefaultSchedule.timezone
                }
                {...(initialSentinelRules ? { initialSentinelRules } : {})}
                inventoryItems={settings.inventoryItems}
                inventoryLocations={settings.inventoryLocations}
                locationId={session.context.locationId}
              />
            ) : (
              <EmptyState
                title="No active issue location"
                description="Create an active Inventory Location for this branch before activating consumption posting."
              />
            )}
          </section>
        ) : null}

        {canOpenMenuPolicy ? (
          <section className="ogfi-data-surface p-5">
            <div className="mb-4">
              <h2 className="text-lg font-bold">
                Brand menu adoption and branch exceptions
              </h2>
              <p className="text-sm text-slate-500">
                Set the ordinary recipe once for {session.context.brandName}.
                Active branches inherit it automatically; create a branch record
                only for availability or an approved formula exception.
              </p>
            </div>
            {session.context.brandId && settings.menuItems.length ? (
              <MenuRecipeGovernanceWorkspace
                availabilityAction={availabilityAction}
                brandDefaultAction={brandDefaultAction}
                brandId={session.context.brandId ?? ""}
                brandName={session.context.brandName}
                canAdopt={canAdoptMenuRecipes}
                canManageBranchExceptions={canManageBranchExceptions}
                defaultEffectiveFrom={defaultPolicyEffectiveFrom}
                locationName={session.context.locationName}
                locationOverrideAction={locationOverrideAction}
                locationId={session.context.locationId}
                menuItems={settings.menuItems}
                policyRecords={policyRecords}
                recipes={eligiblePublishedRecipes}
                recoveryAction={recoveryAction}
                sharedAdoptionAction={sharedAdoptionAction}
                sharedRecipeCandidates={sharedRecipeCandidates}
                timeZone={displayTimezone}
              />
            ) : (
              <EmptyState
                title="Brand menu prerequisites are incomplete"
                description="Select a brand-owned branch, create an active brand menu item, and publish a same-brand recipe—or explicitly adopt a Company-shared recipe. Cross-brand recipes are never offered."
              />
            )}
          </section>
        ) : null}

        <section className="ogfi-data-surface overflow-hidden">
          <div className="ogfi-section-header">
            <div>
              <h2 className="text-lg font-bold">Menu readiness register</h2>
              <p className="text-sm text-slate-500">
                Effective brand inheritance, branch exceptions, quantity
                readiness, and separate cost evidence for{" "}
                {session.context.locationName}.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-200">
            {settings.menuItems.map((item: any) => {
              const readiness = readinessByMenuItemId.get(item.id);
              const source = readiness?.resolutionSource;
              const offerState = readiness?.offerState ?? "UNMAPPED";
              const unavailable = offerState === "UNAVAILABLE";
              const quantityReady = readiness?.quantityReadiness === "READY";
              const costReady = readiness?.costReadiness === "READY";
              return (
                <div
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[11rem_minmax(13rem,1fr)_minmax(15rem,1.2fr)_minmax(13rem,0.8fr)] lg:items-center"
                  key={item.id}
                >
                  <div>
                    <span className="font-mono text-xs text-slate-500">
                      {item.menuItemCode}
                    </span>
                    <p className="mt-1 font-semibold text-slate-950">
                      {item.menuItemName}
                    </p>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        tone={
                          offerState === "OFFERED"
                            ? "success"
                            : offerState === "UNAVAILABLE"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {offerState}
                      </Badge>
                      {source ? (
                        <Badge
                          tone={
                            source === "LOCATION_OVERRIDE" ? "warning" : "info"
                          }
                        >
                          {source === "LOCATION_OVERRIDE"
                            ? "BRANCH OVERRIDE"
                            : "BRAND DEFAULT"}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">UNMAPPED</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {source
                        ? `${effectiveLabel(readiness?.effectiveFrom ?? null, displayTimezone)} to ${effectiveLabel(readiness?.effectiveTo ?? null, displayTimezone)}`
                        : "No effective recipe adoption"}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-950">
                      {readiness?.recipeName
                        ? `${readiness.recipeName} · v${readiness.versionNo ?? "?"}`
                        : readiness?.recipeVersion
                          ? `${readiness.recipeVersion.recipe.recipeName} · v${readiness.recipeVersion.versionNo}`
                          : unavailable
                            ? "Hidden from serving entry at this branch"
                            : "No effective published recipe"}
                    </p>
                    {readiness?.quantityBlockers.length ? (
                      <p className="mt-1 text-xs font-semibold text-rose-700">
                        {readiness.quantityBlockers.map(humanize).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Badge tone={quantityReady ? "success" : "warning"}>
                      Quantity {quantityReady ? "ready" : "blocked"}
                    </Badge>
                    <Badge tone={costReady ? "success" : "warning"}>
                      Cost {costReady ? "ready" : "pending"}
                    </Badge>
                    {!costReady && readiness?.costWarnings.length ? (
                      <p className="w-full text-xs font-semibold text-amber-700 lg:text-right">
                        {readiness.costWarnings.map(humanize).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {settings.menuItems.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No active brand menu items"
                  description="Create an active menu item for the selected brand before adopting a recipe."
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
