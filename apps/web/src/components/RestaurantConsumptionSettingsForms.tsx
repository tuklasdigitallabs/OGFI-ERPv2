"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type ServicePeriod = {
  code: string;
  label: string;
  start: string;
  end: string;
};

const dailyPeriod: ServicePeriod[] = [
  { code: "DAILY", label: "Full business day", start: "00:00", end: "00:00" },
];

const standardShifts: ServicePeriod[] = [
  { code: "OPEN", label: "Opening shift", start: "06:00", end: "14:00" },
  { code: "MID", label: "Mid shift", start: "14:00", end: "22:00" },
  { code: "LATE", label: "Late shift", start: "22:00", end: "06:00" },
];

function localDateTimeValue(date: Date, timeZone: string) {
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

export function ConsumptionConfigurationForm({
  action,
  locationId,
  inventoryLocations,
  initialMode = "SHIFT",
  initialPeriods,
  initialTimezone = "Asia/Manila",
  initialInventoryLocationId,
  inventoryItems,
  initialSentinelRules,
}: {
  action: (formData: FormData) => void | Promise<void>;
  locationId: string;
  inventoryLocations: Array<{
    id: string;
    code: string;
    name: string;
    storageType: string | null;
  }>;
  initialMode?: "DAILY" | "SHIFT";
  initialPeriods?: ServicePeriod[];
  initialTimezone?: string;
  initialInventoryLocationId?: string;
  inventoryItems: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    category: { categoryName: string };
  }>;
  initialSentinelRules?: {
    dailyCountItemIds?: string[];
    pilotDailyCountDays?: number;
    highRiskCountFrequencyDays?: number;
    generalCountFrequencyDays?: number;
  };
}) {
  const [mode, setMode] = useState<"DAILY" | "SHIFT">(initialMode);
  const [periods, setPeriods] = useState<ServicePeriod[]>(
    initialPeriods?.length
      ? initialPeriods
      : initialMode === "DAILY"
        ? dailyPeriod
        : standardShifts,
  );
  const serializedPeriods = useMemo(() => JSON.stringify(periods), [periods]);
  const [sentinelQuery, setSentinelQuery] = useState("");
  const [sentinelItemIds, setSentinelItemIds] = useState<string[]>(
    initialSentinelRules?.dailyCountItemIds ?? [],
  );
  const [pilotDailyCountDays, setPilotDailyCountDays] = useState(
    initialSentinelRules?.pilotDailyCountDays ?? 28,
  );
  const [highRiskCountFrequencyDays, setHighRiskCountFrequencyDays] = useState(
    initialSentinelRules?.highRiskCountFrequencyDays ?? 7,
  );
  const [generalCountFrequencyDays, setGeneralCountFrequencyDays] = useState(
    initialSentinelRules?.generalCountFrequencyDays ?? 30,
  );
  const filteredInventoryItems = useMemo(() => {
    const query = sentinelQuery.trim().toLocaleLowerCase();
    if (!query) return inventoryItems;
    return inventoryItems.filter((item) =>
      `${item.itemCode} ${item.itemName} ${item.category.categoryName}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [inventoryItems, sentinelQuery]);
  const sentinelRules = useMemo(
    () =>
      JSON.stringify({
        dailyCountItemIds: sentinelItemIds,
        pilotDailyCountDays,
        highRiskCountFrequencyDays,
        generalCountFrequencyDays,
      }),
    [
      generalCountFrequencyDays,
      highRiskCountFrequencyDays,
      pilotDailyCountDays,
      sentinelItemIds,
    ],
  );

  function changeMode(value: "DAILY" | "SHIFT") {
    setMode(value);
    setPeriods(value === "DAILY" ? dailyPeriod : standardShifts);
  }

  return (
    <form action={action} className="grid gap-4">
      <input name="locationId" type="hidden" value={locationId} />
      <input name="servicePeriods" type="hidden" value={serializedPeriods} />
      <input name="sentinelRules" type="hidden" value={sentinelRules} />
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Inventory issue location
          <select
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
            defaultValue={initialInventoryLocationId ?? ""}
            name="defaultIssueInventoryLocationId"
            required
          >
            <option value="">Select branch stock location</option>
            {inventoryLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} · {location.code}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Entry schedule
          <select
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
            name="servicePeriodMode"
            onChange={(event) =>
              changeMode(event.target.value as "DAILY" | "SHIFT")
            }
            value={mode}
          >
            <option value="SHIFT">Per shift with daily rollup</option>
            <option value="DAILY">One daily period</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Business timezone
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3"
            defaultValue={initialTimezone}
            name="timezone"
            required
          />
        </label>
      </div>
      {mode === "SHIFT" ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold">Service periods</h3>
              <p className="text-sm text-slate-500">
                Periods cannot overlap. Cross-midnight shifts belong to their
                starting business date.
              </p>
            </div>
            <button
              className="min-h-11 rounded-lg border border-blue-200 px-3 text-sm font-semibold text-blue-700"
              onClick={() =>
                setPeriods((current) => [
                  ...current,
                  {
                    code: `SHIFT_${current.length + 1}`,
                    label: `Shift ${current.length + 1}`,
                    start: "09:00",
                    end: "17:00",
                  },
                ])
              }
              type="button"
            >
              Add period
            </button>
          </div>
          {periods.map((period, index) => (
            <div
              className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[10rem_1fr_9rem_9rem_auto]"
              key={`${period.code}:${index}`}
            >
              <input
                aria-label={`Period ${index + 1} code`}
                className="min-h-11 rounded-lg border border-slate-300 px-3"
                onChange={(event) =>
                  setPeriods((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? {
                            ...candidate,
                            code: event.target.value
                              .toUpperCase()
                              .replace(/\s+/g, "_"),
                          }
                        : candidate,
                    ),
                  )
                }
                required
                value={period.code}
              />
              <input
                aria-label={`Period ${index + 1} label`}
                className="min-h-11 rounded-lg border border-slate-300 px-3"
                onChange={(event) =>
                  setPeriods((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, label: event.target.value }
                        : candidate,
                    ),
                  )
                }
                required
                value={period.label}
              />
              <input
                aria-label={`Period ${index + 1} start`}
                className="min-h-11 rounded-lg border border-slate-300 px-3"
                onChange={(event) =>
                  setPeriods((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, start: event.target.value }
                        : candidate,
                    ),
                  )
                }
                required
                type="time"
                value={period.start}
              />
              <input
                aria-label={`Period ${index + 1} end`}
                className="min-h-11 rounded-lg border border-slate-300 px-3"
                onChange={(event) =>
                  setPeriods((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, end: event.target.value }
                        : candidate,
                    ),
                  )
                }
                required
                type="time"
                value={period.end}
              />
              <button
                className="min-h-11 px-3 text-sm font-semibold text-rose-700 disabled:text-slate-400"
                disabled={periods.length === 1}
                onClick={() =>
                  setPeriods((current) =>
                    current.filter(
                      (_, candidateIndex) => candidateIndex !== index,
                    ),
                  )
                }
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 font-bold text-slate-950">
          High-shrink sentinel ingredients
        </legend>
        <p className="text-sm text-slate-500">
          Select only high-value, easily removed, highly perishable, or
          repeatedly variant ingredients for the pilot daily blind-count cohort.
          This does not post stock or automatically enroll other items.
        </p>
        <input
          className="min-h-11 rounded-lg border border-slate-300 px-3"
          onChange={(event) => setSentinelQuery(event.target.value)}
          placeholder="Search inventory item, code, or category"
          value={sentinelQuery}
        />
        <div className="max-h-56 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
          {filteredInventoryItems.map((item) => (
            <label
              className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:bg-blue-50"
              key={item.id}
            >
              <input
                checked={sentinelItemIds.includes(item.id)}
                onChange={() =>
                  setSentinelItemIds((current) =>
                    current.includes(item.id)
                      ? current.filter((id) => id !== item.id)
                      : [...current, item.id],
                  )
                }
                type="checkbox"
              />
              <span className="min-w-0 flex-1">
                <strong>{item.itemName}</strong>
                <span className="ml-2 text-slate-500">{item.itemCode}</span>
              </span>
              <span className="text-xs text-slate-500">
                {item.category.categoryName}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs font-semibold text-slate-500">
          {sentinelItemIds.length} sentinel ingredient
          {sentinelItemIds.length === 1 ? "" : "s"} selected
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Pilot daily-count days
            <input
              className="min-h-11 rounded-lg border border-slate-300 px-3"
              max={90}
              min={1}
              onChange={(event) =>
                setPilotDailyCountDays(Number(event.target.value))
              }
              required
              type="number"
              value={pilotDailyCountDays}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            High-risk count frequency
            <span className="sr-only">Days</span>
            <input
              className="min-h-11 rounded-lg border border-slate-300 px-3"
              max={90}
              min={1}
              onChange={(event) =>
                setHighRiskCountFrequencyDays(Number(event.target.value))
              }
              required
              type="number"
              value={highRiskCountFrequencyDays}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            General count frequency
            <span className="sr-only">Days</span>
            <input
              className="min-h-11 rounded-lg border border-slate-300 px-3"
              max={365}
              min={1}
              onChange={(event) =>
                setGeneralCountFrequencyDays(Number(event.target.value))
              }
              required
              type="number"
              value={generalCountFrequencyDays}
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Frequencies are days. The default pilot is daily for 28 days, followed
          by weekly high-risk and monthly general counts.
        </p>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Effective from
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3"
            defaultValue={localDateTimeValue(
              new Date(Date.now() + 60_000),
              initialTimezone,
            )}
            name="effectiveFrom"
            required
            type="datetime-local"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Reason for configuration
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3"
            name="reason"
            placeholder="Approved rollout or schedule update"
            required
          />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
        <input name="saveAsCompanyDefault" type="checkbox" />
        Use this timezone and service-period schedule as the company default for
        future branch configurations
      </label>
      <button
        className="min-h-11 rounded-lg bg-blue-600 px-4 font-bold text-white"
        type="submit"
      >
        Create configuration version
      </button>
    </form>
  );
}

type RecipeOption = {
  id: string;
  versionNo: number;
  recipe: {
    id?: string;
    brandId?: string | null;
    recipeCode: string;
    recipeName: string;
  };
};

type MenuItemOption = {
  id: string;
  menuItemCode: string;
  menuItemName: string;
};

type MenuPolicyMode =
  | "BRAND_DEFAULT"
  | "LOCATION_OVERRIDE"
  | "AVAILABILITY"
  | "SHARED_ADOPTION"
  | "MANAGE_POLICY";

type MenuPolicyRecord = {
  id: string;
  targetType:
    | "RECIPE_BRAND_ADOPTION"
    | "MENU_RECIPE_ASSIGNMENT"
    | "MENU_ITEM_LOCATION_AVAILABILITY";
  label: string;
  detail: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  locationId?: string | null;
  scopeType?: "BRAND_DEFAULT" | "LOCATION_OVERRIDE" | null;
};

export function MenuRecipeGovernanceWorkspace({
  brandDefaultAction,
  locationOverrideAction,
  availabilityAction,
  sharedAdoptionAction,
  recoveryAction,
  canAdopt,
  canManageBranchExceptions,
  brandId,
  brandName,
  locationName,
  locationId,
  menuItems,
  recipes,
  sharedRecipeCandidates = [],
  policyRecords = [],
  defaultEffectiveFrom,
  timeZone,
}: {
  brandDefaultAction: (formData: FormData) => void | Promise<void>;
  locationOverrideAction: (formData: FormData) => void | Promise<void>;
  availabilityAction: (formData: FormData) => void | Promise<void>;
  sharedAdoptionAction: (formData: FormData) => void | Promise<void>;
  recoveryAction: (formData: FormData) => void | Promise<void>;
  canAdopt: boolean;
  canManageBranchExceptions: boolean;
  brandId: string;
  brandName: string;
  locationName: string;
  locationId: string;
  menuItems: MenuItemOption[];
  recipes: RecipeOption[];
  sharedRecipeCandidates?: RecipeOption[];
  policyRecords?: MenuPolicyRecord[];
  defaultEffectiveFrom: string;
  timeZone: string;
}) {
  const [mode, setMode] = useState<MenuPolicyMode | null>(() =>
    canAdopt
      ? "BRAND_DEFAULT"
      : canManageBranchExceptions
        ? "AVAILABILITY"
        : null,
  );
  const [selectedMenuItemId, setSelectedMenuItemId] = useState(
    menuItems[0]?.id ?? "",
  );
  const [idempotencyKeys] = useState(() => ({
    BRAND_DEFAULT: crypto.randomUUID(),
    LOCATION_OVERRIDE: crypto.randomUUID(),
    AVAILABILITY: crypto.randomUUID(),
    SHARED_ADOPTION: crypto.randomUUID(),
    MANAGE_POLICY: crypto.randomUUID(),
  }));
  const manageablePolicyRecords = policyRecords.filter((record) => {
    const future = new Date(record.effectiveFrom).getTime() > Date.now();
    if (future) {
      if (record.targetType === "MENU_ITEM_LOCATION_AVAILABILITY")
        return canManageBranchExceptions;
      if (
        record.targetType === "MENU_RECIPE_ASSIGNMENT" &&
        record.scopeType === "LOCATION_OVERRIDE"
      )
        return canAdopt && canManageBranchExceptions;
      return canAdopt;
    }
    return (
      record.targetType === "MENU_RECIPE_ASSIGNMENT" &&
      record.scopeType === "LOCATION_OVERRIDE" &&
      canAdopt &&
      canManageBranchExceptions
    );
  });
  const [selectedPolicyId, setSelectedPolicyId] = useState(
    manageablePolicyRecords[0]?.id ?? "",
  );
  const selectedPolicy = manageablePolicyRecords.find(
    (record) => record.id === selectedPolicyId,
  );
  const selectedPolicyIsFuture = selectedPolicy
    ? new Date(selectedPolicy.effectiveFrom).getTime() > Date.now()
    : false;
  const tabs = [
    {
      id: "BRAND_DEFAULT" as const,
      allowed: canAdopt,
      label: "Brand default",
      detail: `Inherited by all active ${brandName} branches`,
    },
    {
      id: "LOCATION_OVERRIDE" as const,
      allowed: canAdopt && canManageBranchExceptions,
      label: "Branch override",
      detail: `Approved formula exception for ${locationName}`,
    },
    {
      id: "AVAILABILITY" as const,
      allowed: canManageBranchExceptions,
      label: "Availability",
      detail: "Temporarily offer or remove an item at this branch",
    },
    {
      id: "SHARED_ADOPTION" as const,
      allowed: canAdopt,
      label: "Adopt shared recipe",
      detail: `Explicitly allow a Company recipe for ${brandName}`,
    },
    {
      id: "MANAGE_POLICY" as const,
      allowed: manageablePolicyRecords.length > 0,
      label: "Revert or cancel",
      detail: "End a branch override or cancel a scheduled policy",
    },
  ].filter((tab) => tab.allowed);

  if (!mode) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
        role="status"
      >
        <p className="font-bold text-slate-950">Menu policy actions unavailable</p>
        <p className="mt-1">
          You may review effective menu readiness, but your current permissions do
          not allow brand adoption or branch exceptions.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div
        aria-label="Recipe adoption and branch exception actions"
        className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 md:grid-cols-2 xl:grid-cols-4"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            aria-selected={mode === tab.id}
            className={
              mode === tab.id
                ? "rounded-lg border border-blue-200 bg-white px-3 py-3 text-left text-blue-800 shadow-sm"
                : "rounded-lg border border-transparent px-3 py-3 text-left text-slate-600 hover:border-slate-200 hover:bg-white"
            }
            key={tab.id}
            onClick={() => setMode(tab.id)}
            role="tab"
            type="button"
          >
            <span className="block text-sm font-bold">{tab.label}</span>
            <span className="mt-1 block text-xs font-medium text-slate-500">
              {tab.detail}
            </span>
          </button>
        ))}
      </div>

      {mode === "MANAGE_POLICY" ? (
        <form
          action={recoveryAction}
          className="grid gap-4 rounded-xl border border-slate-200 p-4"
        >
          <input name="brandId" type="hidden" value={brandId} />
          <input
            name="idempotencyKey"
            type="hidden"
            value={`${idempotencyKeys.MANAGE_POLICY}:${selectedPolicyId}`}
          />
          <div>
            <h3 className="font-bold text-slate-950">
              Revert a branch exception or cancel a scheduled policy
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Ending an effective branch override resumes the inherited brand
              default at the selected time. A future record can be cancelled before
              it becomes effective; history is retained.
            </p>
          </div>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Selected policy record
            <select
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
              name="targetId"
              onChange={(event) => setSelectedPolicyId(event.target.value)}
              required
              value={selectedPolicyId}
            >
              {manageablePolicyRecords.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.label} · {record.detail}
                </option>
              ))}
            </select>
          </label>
          {selectedPolicy ? (
            <>
              <input
                name="recoveryKind"
                type="hidden"
                value={selectedPolicyIsFuture ? "CANCEL_FUTURE" : "END_OVERRIDE"}
              />
              <input
                name="targetType"
                type="hidden"
                value={selectedPolicy.targetType}
              />
              <input
                name="locationId"
                type="hidden"
                value={selectedPolicy.locationId ?? locationId}
              />
              {!selectedPolicyIsFuture ? (
                <EffectiveRangeFields
                  defaultFrom={defaultEffectiveFrom}
                  fromFieldName="effectiveTo"
                  single
                  timeZone={timeZone}
                />
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  This scheduled record starts {selectedPolicy.effectiveFrom} and
                  has not taken effect. Cancellation preserves its audit history.
                </p>
              )}
              <ReasonField
                placeholder={
                  selectedPolicyIsFuture
                    ? "Why this scheduled policy is being cancelled"
                    : "Why this branch is reverting to the brand default"
                }
              />
              <PrimaryButton
                label={
                  selectedPolicyIsFuture
                    ? "Cancel scheduled policy"
                    : "End override and resume brand default"
                }
              />
            </>
          ) : null}
        </form>
      ) : mode === "SHARED_ADOPTION" ? (
        <form
          action={sharedAdoptionAction}
          className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4"
        >
          <input name="brandId" type="hidden" value={brandId} />
          <input
            name="idempotencyKey"
            type="hidden"
            value={idempotencyKeys.SHARED_ADOPTION}
          />
          <div>
            <h3 className="font-bold text-slate-950">Adopt a Company-shared recipe</h3>
            <p className="mt-1 text-sm text-slate-600">
              Adoption makes the formula eligible for {brandName}; it does not
              sell the item, replace a brand default, or post inventory.
            </p>
          </div>
          {sharedRecipeCandidates.length ? (
            <>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Shared recipe
                <select
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
                  name="recipeId"
                  required
                >
                  <option value="">Select a Company-shared recipe</option>
                  {Array.from(
                    new Map(
                      sharedRecipeCandidates.map((version) => [
                        version.recipe.id ?? version.recipe.recipeCode,
                        version.recipe,
                      ]),
                    ).values(),
                  ).map((recipe) => (
                    <option
                      key={recipe.id ?? recipe.recipeCode}
                      value={recipe.id ?? ""}
                    >
                      {recipe.recipeName} · {recipe.recipeCode}
                    </option>
                  ))}
                </select>
              </label>
              <EffectiveRangeFields
                defaultFrom={defaultEffectiveFrom}
                timeZone={timeZone}
              />
              <ReasonField placeholder="Approved for this brand menu" />
              <PrimaryButton label={`Adopt recipe for ${brandName}`} />
            </>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              No unadopted Company-shared published recipe is available.
            </p>
          )}
        </form>
      ) : (
        <form
          action={
            mode === "BRAND_DEFAULT"
              ? brandDefaultAction
              : mode === "LOCATION_OVERRIDE"
                ? locationOverrideAction
                : availabilityAction
          }
          className="grid gap-4 rounded-xl border border-slate-200 p-4"
        >
          <input name="brandId" type="hidden" value={brandId} />
          <input name="locationId" type="hidden" value={locationId} />
          <input
            name="idempotencyKey"
            type="hidden"
            value={idempotencyKeys[mode]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Active brand menu item
              <select
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
                name="menuItemId"
                onChange={(event) => setSelectedMenuItemId(event.target.value)}
                required
                value={selectedMenuItemId}
              >
                <option value="">Select menu item</option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.menuItemName} · {item.menuItemCode}
                  </option>
                ))}
              </select>
            </label>
            {mode === "AVAILABILITY" ? (
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Branch availability
                <select
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
                  name="state"
                  required
                >
                  <option value="UNAVAILABLE">Unavailable at this branch</option>
                  <option value="AVAILABLE">Available / restore inheritance</option>
                </select>
              </label>
            ) : (
              <div className="grid gap-1">
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Published recipe version
                  <select
                    className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
                    disabled={recipes.length === 0}
                    name="recipeVersionId"
                    required
                  >
                    <option value="">Select approved recipe</option>
                    {recipes.map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.recipe.recipeName} · {recipe.recipe.recipeCode} · v
                        {recipe.versionNo}
                      </option>
                    ))}
                  </select>
                </label>
                {recipes.length === 0 ? (
                  <p className="text-xs font-semibold text-amber-700">
                    Publish a same-brand recipe or adopt a Company-shared recipe first.
                  </p>
                ) : null}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            {mode === "BRAND_DEFAULT"
              ? `This becomes the inherited formula for every active ${brandName} branch. Existing unavailable items and branch overrides are preserved.`
              : mode === "LOCATION_OVERRIDE"
                ? `This affects only ${locationName}; the ${brandName} default remains unchanged for other branches.`
                : "Unavailable masks both the branch override and brand default. Restoring availability resumes normal resolution precedence."}
          </div>
          <EffectiveRangeFields
            defaultFrom={defaultEffectiveFrom}
            timeZone={timeZone}
          />
          <ReasonField
            placeholder={
              mode === "AVAILABILITY"
                ? "Supply, equipment, launch, or restoration reason"
                : "Approved menu rollout or branch exception"
            }
          />
          <PrimaryButton
            disabled={
              !selectedMenuItemId ||
              (mode !== "AVAILABILITY" && recipes.length === 0)
            }
            label={
              mode === "BRAND_DEFAULT"
                ? "Set brand default"
                : mode === "LOCATION_OVERRIDE"
                  ? "Set branch override"
                  : "Save branch availability"
            }
          />
        </form>
      )}
    </div>
  );
}

function EffectiveRangeFields({
  defaultFrom,
  fromFieldName = "effectiveFrom",
  single = false,
  timeZone,
}: {
  defaultFrom: string;
  fromFieldName?: "effectiveFrom" | "effectiveTo";
  single?: boolean;
  timeZone: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <input name="timeZone" type="hidden" value={timeZone} />
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        {fromFieldName === "effectiveTo" ? "End at" : "Effective from"} ({timeZone})
        <input
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
          defaultValue={defaultFrom}
          name={fromFieldName}
          required
          type="datetime-local"
        />
      </label>
      {!single ? (
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Effective to ({timeZone}, optional)
          <input
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"
            name="effectiveTo"
            type="datetime-local"
          />
        </label>
      ) : null}
    </div>
  );
}

function ReasonField({ placeholder }: { placeholder: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-700">
      Reason
      <textarea
        className="min-h-20 rounded-lg border border-slate-300 bg-white px-3 py-2"
        name="reason"
        placeholder={placeholder}
        required
      />
    </label>
  );
}

function PrimaryButton({
  disabled = false,
  label,
}: {
  disabled?: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 rounded-lg bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
