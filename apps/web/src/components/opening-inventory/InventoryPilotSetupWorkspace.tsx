"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Badge, ButtonLink, PaginationBar } from "@ogfi/ui";
import { EntryModal, useEntryModalFeedback } from "@/components/EntryModal";
import { useActionToast } from "@/components/ActionToastProvider";
import { inventoryPilotPendingSelectionParams } from "@/components/opening-inventory/InventoryPilotSetupState";
import type { ActionFeedback } from "@/server/services/actionFeedback";

export const inventoryPilotSetupTabs = [
  "endpoints",
  "items",
  "actors",
  "routes",
  "readiness",
  "activity",
] as const;
export type InventoryPilotSetupTab = (typeof inventoryPilotSetupTabs)[number];

export type InventoryPilotSetupMutationState =
  | { status: "idle" }
  | { status: "success"; feedback: ActionFeedback; draftId?: string }
  | { status: "error"; feedback: ActionFeedback };

export type InventoryPilotSetupMutationAction = (
  previousState: InventoryPilotSetupMutationState,
  formData: FormData,
) => Promise<InventoryPilotSetupMutationState>;

type QueueEntry = {
  id: string;
  hrefType: "draft" | "revision";
  label: string;
  status: "DRAFT" | "SEALED" | "ABANDONED";
  revisionNumber: number | null;
  updatedAt: string;
  editorName: string;
  endpointCount: number | null;
  itemCount: number | null;
  readinessReady: number | null;
  readinessTotal: number | null;
};

type EndpointOption = {
  inventoryLocationId: string;
  locationId: string;
  code: string;
  name: string;
  locationName: string;
  capabilities: string[];
};

type ItemOption = {
  id: string;
  code: string;
  name: string;
  categoryName: string;
  status: string;
};
type UserOption = {
  id: string;
  name: string;
  email: string;
  roleAssignments: Array<{
    id: string;
    label: string;
    eligibleResponsibilities: string[];
  }>;
};
type RouteOption = {
  family: string;
  label: string;
  approvalRuleId: string | null;
  routeLabel: string | null;
  ready: boolean;
  detail: string;
  resolverEvidence?: PurchaseRequestResolverEvidence;
};
type RuleOption = { id: string; family: string; label: string; status: string };
type ReadinessResult = {
  family: string;
  label: string;
  ready: boolean | null;
  blockers: string[];
  checkedAt: string | null;
};
type ActivityEntry = {
  id: string;
  action: string;
  actorName: string;
  occurredAt: string;
  detail: string;
  sourceLabel?: string;
};

export type PurchaseRequestResolverEvidence =
  | {
      status: "retained";
      resolverId: "purchase_request_approval_rule_v1";
      isEmergency: false;
      selectedRouteKey: "DEFAULT";
      routeType: "normal";
      fallbackUsed: false;
    }
  | { status: "unavailable" };

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parsePurchaseRequestResolverEvidence(
  canonicalJson: string | null | undefined,
  approvalRuleId: string | null | undefined,
): PurchaseRequestResolverEvidence {
  if (!canonicalJson || !approvalRuleId) return { status: "unavailable" };
  try {
    const evidence = objectValue(JSON.parse(canonicalJson));
    const ruleDefinition = objectValue(evidence?.ruleDefinition);
    const resolverInput = objectValue(evidence?.resolverInput);
    const resolverOutcome = objectValue(evidence?.resolverOutcome);
    const selectedApprovalRuleId = resolverOutcome?.selectedApprovalRuleId;
    if (
      resolverInput?.resolverId !== "purchase_request_approval_rule_v1" ||
      resolverInput.isEmergency !== false ||
      ruleDefinition?.routeKey !== "DEFAULT" ||
      resolverOutcome?.requiredRouteKey !== "DEFAULT" ||
      resolverOutcome.routeType !== "normal" ||
      resolverOutcome.fallbackUsed !== false ||
      typeof ruleDefinition.id !== "string" ||
      selectedApprovalRuleId !== ruleDefinition.id ||
      selectedApprovalRuleId !== approvalRuleId
    )
      return { status: "unavailable" };
    return {
      status: "retained",
      resolverId: "purchase_request_approval_rule_v1",
      isEmergency: false,
      selectedRouteKey: "DEFAULT",
      routeType: "normal",
      fallbackUsed: false,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export type InventoryPilotSetupRecord = {
  id: string;
  label: string;
  status: "DRAFT" | "SEALED" | "ABANDONED";
  version: number;
  revisionNumber: number | null;
  predecessorRevisionNumber: number | null;
  digest: string | null;
  sourceDecisionId: string;
  editorName: string;
  creatorUserId: string;
  editorUserId: string;
  sealedByName: string | null;
  createdAt: string;
  updatedAt: string;
  sealedAt: string | null;
  endpointSelections: Array<{
    inventoryLocationId: string;
    locationId: string;
    capability: string;
  }>;
  itemIds: string[];
  selectedEndpointDetails: EndpointOption[];
  selectedItemDetails: ItemOption[];
  actorSelections: Array<{
    responsibility: string;
    userId: string;
    userName: string;
    roleAssignmentId: string;
    roleAssignmentLabel: string;
  }>;
  routes: RouteOption[];
  readiness: ReadinessResult[];
  activity: ActivityEntry[];
};

export type InventoryPilotSetupWorkspaceProps = {
  companyName: string;
  locationName: string;
  requesterUserId: string;
  queue: QueueEntry[];
  page: number;
  pageSize: number;
  totalItems: number;
  selected: InventoryPilotSetupRecord | null;
  activeTab: InventoryPilotSetupTab;
  endpointOptions: EndpointOption[];
  endpointPage: number;
  endpointPageSize: number;
  endpointTotalItems: number;
  itemOptions: ItemOption[];
  itemPage: number;
  itemPageSize: number;
  itemTotalItems: number;
  itemQuery: string;
  itemStatus: string;
  itemCategoryId: string;
  itemCategories: Array<{ id: string; label: string }>;
  userOptions: UserOption[];
  userPage: number;
  userPageSize: number;
  userTotalItems: number;
  userQuery: string;
  userResponsibility: string;
  actorSelectionValues: Record<string, string>;
  activityPage: number;
  activityPageSize: number;
  activityTotalItems: number;
  ruleOptions: RuleOption[];
  rulePage: number;
  rulePageSize: number;
  ruleTotalItems: number;
  ruleQuery: string;
  ruleFamily: string;
  routeSelectionValues: Record<string, string>;
  canCreate: boolean;
  canEdit: boolean;
  canSeal: boolean;
  createDisabledReason?: string;
  editDisabledReason?: string;
  sealDisabledReason?: string;
  mfaFresh: boolean;
  actions: {
    create: InventoryPilotSetupMutationAction;
    createSuccessor: InventoryPilotSetupMutationAction;
    updateEndpoints: InventoryPilotSetupMutationAction;
    updateItems: InventoryPilotSetupMutationAction;
    updateActors: InventoryPilotSetupMutationAction;
    updateRoutes: InventoryPilotSetupMutationAction;
    abandon: InventoryPilotSetupMutationAction;
    evaluate: InventoryPilotSetupMutationAction;
    seal: InventoryPilotSetupMutationAction;
  };
};

const inputClass =
  "min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
const responsibilities = [
  ["PREPARER", "Opening preparer"],
  ["SUBMITTER", "Opening submitter"],
  ["OPERATIONS_REVIEWER", "Operations reviewer"],
  ["ACCOUNTING_REVIEWER", "Accounting reviewer"],
  ["COMMAND_REQUESTER", "Command requester"],
] as const;
const capabilityLabels: Record<string, string> = {
  TRANSFER_SOURCE: "Transfer source",
  TRANSFER_DESTINATION: "Transfer destination",
  COUNT_LOCATION: "Count location",
  OPENING_STOCK_LOCATION: "Opening-stock location",
};

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function MutationForm({
  action,
  children,
  className = "",
  submitLabel,
  pendingLabel,
  disabled = false,
  successHref,
}: {
  action: InventoryPilotSetupMutationAction;
  children: ReactNode;
  className?: string;
  submitLabel: string;
  pendingLabel: string;
  disabled?: boolean;
  successHref?: (
    state: Extract<InventoryPilotSetupMutationState, { status: "success" }>,
  ) => string | null;
}) {
  const router = useRouter();
  const modalFeedback = useEntryModalFeedback();
  const { showActionToast } = useActionToast();
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  });
  const successHrefRef = useRef(successHref);
  successHrefRef.current = successHref;

  useEffect(() => {
    if (state.status === "idle") return;
    (modalFeedback?.reportFeedback ?? showActionToast)(state.feedback);
    if (state.status !== "success") return;
    const href = successHrefRef.current?.(state) ?? null;
    if (href) router.replace(href, { scroll: false });
    else router.refresh();
  }, [modalFeedback, router, showActionToast, state]);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className={`grid gap-4 ${className}`}
    >
      {children}
      <button
        className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-slate-400"
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

function SealIdempotencyKey() {
  const [key, setKey] = useState("");
  useEffect(() => setKey(crypto.randomUUID()), []);
  return <input name="idempotencyKey" type="hidden" value={key} readOnly />;
}

function statusTone(status: QueueEntry["status"]) {
  return status === "SEALED"
    ? ("success" as const)
    : status === "ABANDONED"
      ? ("destructive" as const)
      : ("warning" as const);
}

export function inventoryPilotRecordIdentity(
  record: Pick<InventoryPilotSetupRecord, "id" | "status">,
) {
  return record.status === "SEALED"
    ? { revision: record.id }
    : { draft: record.id };
}

export function inventoryPilotSetupHref(
  record: Pick<InventoryPilotSetupRecord, "id" | "status">,
  tab: InventoryPilotSetupTab,
  extra: Record<string, string> = {},
) {
  return `/opening-inventory/setup?${new URLSearchParams({ ...inventoryPilotRecordIdentity(record), tab, ...extra })}`;
}

function Queue({
  entries,
  selected,
  activeTab,
  page,
  pageSize,
  totalItems,
}: {
  entries: QueueEntry[];
  selected: InventoryPilotSetupRecord | null;
  activeTab: InventoryPilotSetupTab;
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  return (
    <aside className="ogfi-data-surface min-w-0 overflow-hidden lg:sticky lg:top-4 lg:h-fit">
      <div className="ogfi-section-header">
        <div>
          <h2 className="font-bold text-slate-950">Revision queue</h2>
          <p className="text-sm text-slate-500">
            Drafts and immutable revisions
          </p>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-950">No pilot revisions yet</p>
          <p className="mt-1">
            Create the first company-scoped draft to begin configuration.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <ButtonLink
              key={`${entry.hrefType}:${entry.id}`}
              href={`/opening-inventory/setup?${new URLSearchParams({ [entry.hrefType]: entry.id, tab: activeTab })}`}
              className={`block min-h-0 w-full rounded-none p-4 text-left ${entry.id === selected?.id ? "bg-blue-50" : "bg-white hover:bg-slate-50"}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-950">
                    {entry.label}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Editor {entry.editorName}
                  </span>
                </span>
                <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
              </span>
              <span className="mt-3 grid grid-cols-2 gap-1 text-xs text-slate-600">
                <span>
                  {entry.endpointCount === null
                    ? "Open to review endpoints"
                    : `${entry.endpointCount} endpoint roles`}
                </span>
                <span>
                  {entry.itemCount === null
                    ? "Open to review items"
                    : `${entry.itemCount} items`}
                </span>
                <span>
                  {entry.readinessReady === null ||
                  entry.readinessTotal === null
                    ? "Open readiness review"
                    : `${entry.readinessReady}/${entry.readinessTotal} ready`}
                </span>
                <span>{formatDate(entry.updatedAt)}</span>
              </span>
            </ButtonLink>
          ))}
        </div>
      )}
      {totalItems > 0 ? (
        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          itemLabel="configuration revisions"
          getPageHref={(next) =>
            `/opening-inventory/setup?${new URLSearchParams({ ...(selected ? inventoryPilotRecordIdentity(selected) : {}), tab: activeTab, page: String(next) })}`
          }
        />
      ) : null}
    </aside>
  );
}

function EndpointEditor({
  record,
  options,
  action,
  disabledReason,
  page,
  pageSize,
  totalItems,
}: {
  record: InventoryPilotSetupRecord;
  options: EndpointOption[];
  action: InventoryPilotSetupMutationAction;
  disabledReason?: string;
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  const selectionSeed = useMemo(
    () =>
      new Set(
        record.endpointSelections.map(
          (entry) =>
            `${entry.inventoryLocationId}|${entry.locationId}|${entry.capability}`,
        ),
      ),
    [record.endpointSelections],
  );
  const [selected, setSelected] = useState(() => new Set(selectionSeed));
  useEffect(
    () => setSelected(new Set(selectionSeed)),
    [record.id, record.version, selectionSeed],
  );
  const selectedEndpointRoles = record.selectedEndpointDetails
    .flatMap((option) =>
      option.capabilities.map((capability) => ({
        option,
        capability,
        value: `${option.inventoryLocationId}|${option.locationId}|${capability}`,
      })),
    )
    .filter((entry) => selected.has(entry.value));
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">Endpoint capabilities</h3>
          <p className="text-sm text-slate-500">
            Select exact inventory locations and explicit pilot roles. Names or
            location types never imply membership.
          </p>
        </div>
      </div>
      <MutationForm
        action={action}
        className="p-4 sm:p-5"
        submitLabel="Save endpoint selections"
        pendingLabel="Saving endpoints…"
        disabled={Boolean(disabledReason)}
      >
        <input name="draftId" type="hidden" value={record.id} />
        <input name="expectedVersion" type="hidden" value={record.version} />
        {[...selected].map((value) => (
          <input key={value} name="endpoint" type="hidden" value={value} />
        ))}
        <section className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
          <strong>{selected.size} endpoint role(s) retained.</strong>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedEndpointRoles
              .slice(0, 10)
              .map(({ option, capability, value }) => (
                <span
                  key={value}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  {option.code} / {capabilityLabels[capability] ?? capability}
                  <button
                    aria-label={`Remove ${option.name} ${capability}`}
                    className="min-h-8 px-1 text-rose-700"
                    disabled={Boolean(disabledReason)}
                    onClick={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        next.delete(value);
                        return next;
                      })
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </span>
              ))}
            {selectedEndpointRoles.length > 10 ? (
              <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold text-blue-900">
                and {selectedEndpointRoles.length - 10} more
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs">Paging never removes a selection.</p>
        </section>
        <fieldset disabled={Boolean(disabledReason)} className="grid gap-3">
          <legend className="sr-only">Endpoint selections</legend>
          {options.map((option) => (
            <div
              key={option.inventoryLocationId}
              className="rounded-lg border border-slate-200 p-4"
            >
              <p className="font-bold text-slate-950">
                {option.code} / {option.name}
              </p>
              <p className="text-sm text-slate-500">{option.locationName}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {option.capabilities.map((capability) => {
                  const value = `${option.inventoryLocationId}|${option.locationId}|${capability}`;
                  return (
                    <label
                      key={capability}
                      className="flex min-h-11 items-center gap-3 rounded-md bg-slate-50 px-3 text-sm font-medium text-slate-700"
                    >
                      <input
                        checked={selected.has(value)}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(value);
                            else next.delete(value);
                            return next;
                          })
                        }
                        type="checkbox"
                      />
                      {capabilityLabels[capability] ??
                        capability.replaceAll("_", " ")}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
        {totalItems > 0 ? (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            itemLabel="eligible endpoints"
            getPageHref={(next) =>
              `/opening-inventory/setup?${new URLSearchParams({ draft: record.id, tab: "endpoints", endpointPage: String(next) })}`
            }
          />
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Endpoint change reason
          <textarea
            className={`${inputClass} min-h-20`}
            name="reason"
            minLength={10}
            maxLength={1000}
            required
            disabled={Boolean(disabledReason)}
          />
        </label>
        {disabledReason ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            Disabled: {disabledReason}
          </p>
        ) : null}
      </MutationForm>
    </section>
  );
}

function ItemEditor({
  record,
  options,
  action,
  disabledReason,
  page,
  pageSize,
  totalItems,
  query,
  status,
  category,
  categories,
}: {
  record: InventoryPilotSetupRecord;
  options: ItemOption[];
  action: InventoryPilotSetupMutationAction;
  disabledReason?: string;
  page: number;
  pageSize: number;
  totalItems: number;
  query: string;
  status: string;
  category: string;
  categories: Array<{ id: string; label: string }>;
}) {
  const selectionSeed = useMemo(
    () => new Set(record.itemIds),
    [record.itemIds],
  );
  const [chosen, setChosen] = useState(() => new Set(selectionSeed));
  useEffect(
    () => setChosen(new Set(selectionSeed)),
    [record.id, record.version, selectionSeed],
  );
  const selectedItems = record.selectedItemDetails.filter((item) =>
    chosen.has(item.id),
  );
  const href = (next: number) =>
    `/opening-inventory/setup?${new URLSearchParams({ draft: record.id, tab: "items", itemPage: String(next), ...(query ? { itemQuery: query } : {}), ...(status ? { itemStatus: status } : {}), ...(category ? { itemCategoryId: category } : {}) })}`;
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">High-risk pilot catalog</h3>
          <p className="text-sm text-slate-500">
            Only checked Item IDs enter the catalog. Category, name, and search
            labels never expand it.
          </p>
        </div>
        <Badge tone="info">{chosen.size} selected</Badge>
      </div>
      <form
        className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_10rem_12rem_auto]"
        method="get"
      >
        <input name="draft" type="hidden" value={record.id} />
        <input name="tab" type="hidden" value="items" />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Search items
          <input
            className={inputClass}
            name="itemQuery"
            defaultValue={query}
            maxLength={120}
            placeholder="Item code or name"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Status
          <select
            className={inputClass}
            name="itemStatus"
            defaultValue={status}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Category
          <select
            className={inputClass}
            name="itemCategoryId"
            defaultValue={category}
          >
            <option value="">All categories</option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <button className="mt-auto min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-blue-700">
          Apply filters
        </button>
      </form>
      <MutationForm
        action={action}
        className="p-4 sm:p-5"
        submitLabel="Save item selections"
        pendingLabel="Saving items…"
        disabled={Boolean(disabledReason)}
      >
        <input name="draftId" type="hidden" value={record.id} />
        <input name="expectedVersion" type="hidden" value={record.version} />
        {[...chosen].map((id) => (
          <input key={id} name="itemId" type="hidden" value={id} />
        ))}
        <section className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <h4 className="text-sm font-bold text-blue-950">
            Selected items ({chosen.size})
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedItems.slice(0, 10).map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              >
                {item.code} / {item.name}
                <button
                  aria-label={`Remove ${item.name}`}
                  className="min-h-8 px-1 text-rose-700"
                  disabled={Boolean(disabledReason)}
                  onClick={() =>
                    setChosen((current) => {
                      const next = new Set(current);
                      next.delete(item.id);
                      return next;
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              </span>
            ))}
            {selectedItems.length > 10 ? (
              <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold text-blue-900">
                and {selectedItems.length - 10} more
              </span>
            ) : null}
          </div>
        </section>
        <fieldset disabled={Boolean(disabledReason)} className="grid gap-2">
          <legend className="sr-only">Pilot item candidates</legend>
          {options.map((item) => {
            const selected = chosen.has(item.id);
            const inactiveCandidate = item.status !== "ACTIVE" && !selected;
            return (
              <label
                key={item.id}
                className={`grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-4 py-3 ${inactiveCandidate ? "border-slate-200 bg-slate-50 text-slate-500" : "border-slate-200"}`}
              >
                <input
                  aria-describedby={
                    inactiveCandidate ? `inactive-item-${item.id}` : undefined
                  }
                  checked={selected}
                  disabled={inactiveCandidate}
                  onChange={(event) =>
                    setChosen((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    })
                  }
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-950">
                    {item.code} / {item.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {item.categoryName}
                  </span>
                  {inactiveCandidate ? (
                    <span
                      className="block text-xs text-amber-700"
                      id={`inactive-item-${item.id}`}
                    >
                      Inactive items are reviewable but cannot be newly
                      selected.
                    </span>
                  ) : null}
                </span>
                <Badge tone={item.status === "ACTIVE" ? "success" : "neutral"}>
                  {item.status}
                </Badge>
              </label>
            );
          })}
        </fieldset>
        {totalItems > 0 ? (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            itemLabel="eligible items"
            getPageHref={href}
          />
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Catalog change reason
          <textarea
            className={`${inputClass} min-h-20`}
            name="reason"
            minLength={10}
            maxLength={1000}
            required
            disabled={Boolean(disabledReason)}
          />
        </label>
        {options.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
            No inventory items match the current company filters.
          </p>
        ) : null}
        {disabledReason ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            Disabled: {disabledReason}
          </p>
        ) : null}
      </MutationForm>
    </section>
  );
}

export function ReadOnlyEndpointSummary({
  record,
  page,
  pageSize,
}: {
  record: InventoryPilotSetupRecord;
  page: number;
  pageSize: number;
}) {
  const rows = record.selectedEndpointDetails.flatMap((endpoint) =>
    endpoint.capabilities.map((capability) => ({
      key: `${endpoint.inventoryLocationId}:${capability}`,
      title: `${endpoint.code} / ${endpoint.name}`,
      detail: `${endpoint.locationName} · ${capabilityLabels[capability] ?? capability}`,
    })),
  );
  const reviewPageSize = Math.min(10, pageSize);
  const safePage = Math.min(
    page,
    Math.max(1, Math.ceil(rows.length / reviewPageSize)),
  );
  const visible = rows.slice(
    (safePage - 1) * reviewPageSize,
    safePage * reviewPageSize,
  );
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">
            Immutable endpoint capabilities
          </h3>
          <p className="text-sm text-slate-500">
            This sealed revision retains {rows.length} exact endpoint role(s).
            Correction requires a successor draft.
          </p>
        </div>
        <Badge tone="success">Read-only</Badge>
      </div>
      <div className="divide-y divide-slate-100">
        {visible.map((row) => (
          <article key={row.key} className="ogfi-list-row">
            <p className="font-bold text-slate-950">{row.title}</p>
            <p className="text-sm text-slate-600">{row.detail}</p>
          </article>
        ))}
      </div>
      {rows.length > reviewPageSize ? (
        <PaginationBar
          page={safePage}
          pageSize={reviewPageSize}
          totalItems={rows.length}
          itemLabel="retained endpoint roles"
          getPageHref={(next) =>
            inventoryPilotSetupHref(record, "endpoints", {
              endpointPage: String(next),
            })
          }
        />
      ) : null}
    </section>
  );
}

export function ReadOnlyItemSummary({
  record,
  page,
  pageSize,
}: {
  record: InventoryPilotSetupRecord;
  page: number;
  pageSize: number;
}) {
  const reviewPageSize = Math.min(10, pageSize);
  const safePage = Math.min(
    page,
    Math.max(1, Math.ceil(record.selectedItemDetails.length / reviewPageSize)),
  );
  const visible = record.selectedItemDetails.slice(
    (safePage - 1) * reviewPageSize,
    safePage * reviewPageSize,
  );
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">
            Immutable high-risk catalog
          </h3>
          <p className="text-sm text-slate-500">
            This sealed revision retains {record.selectedItemDetails.length}{" "}
            exact Item ID(s). Correction requires a successor draft.
          </p>
        </div>
        <Badge tone="success">Read-only</Badge>
      </div>
      <div className="divide-y divide-slate-100">
        {visible.map((item) => (
          <article key={item.id} className="ogfi-list-row">
            <p className="font-bold text-slate-950">
              {item.code} / {item.name}
            </p>
            <p className="text-sm text-slate-600">
              {item.categoryName} · {item.status}
            </p>
          </article>
        ))}
      </div>
      {record.selectedItemDetails.length > reviewPageSize ? (
        <PaginationBar
          page={safePage}
          pageSize={reviewPageSize}
          totalItems={record.selectedItemDetails.length}
          itemLabel="retained pilot items"
          getPageHref={(next) =>
            inventoryPilotSetupHref(record, "items", { itemPage: String(next) })
          }
        />
      ) : null}
    </section>
  );
}

export function ActorEditor({
  record,
  options,
  action,
  disabledReason,
  page,
  pageSize,
  totalItems,
  query,
  activeResponsibility,
  selectionValues,
}: {
  record: InventoryPilotSetupRecord;
  options: UserOption[];
  action: InventoryPilotSetupMutationAction;
  disabledReason?: string;
  page: number;
  pageSize: number;
  totalItems: number;
  query: string;
  activeResponsibility: string;
  selectionValues: Record<string, string>;
}) {
  const persisted = useMemo(
    () =>
      new Map(
        record.actorSelections.map((entry) => [
          entry.responsibility,
          `${entry.userId}|${entry.roleAssignmentId}`,
        ]),
      ),
    [record.actorSelections],
  );
  const selectionSeed = useMemo(
    () =>
      Object.fromEntries(
        responsibilities.map(([responsibility]) => [
          responsibility,
          selectionValues[responsibility] ??
            persisted.get(responsibility) ??
            "",
        ]),
      ),
    [persisted, selectionValues],
  );
  const [byResponsibility, setByResponsibility] =
    useState<Record<string, string>>(selectionSeed);
  useEffect(
    () => setByResponsibility(selectionSeed),
    [record.id, record.version, selectionSeed],
  );
  const selectionParams = inventoryPilotPendingSelectionParams(
    "actor",
    byResponsibility,
    record.version,
  );
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">
            Named opening-inventory users
          </h3>
          <p className="text-sm text-slate-500">
            These names capture seal-time readiness evidence only. They do not
            grant roles, scope, permissions, or executor authority.
          </p>
        </div>
      </div>
      <form
        className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-[13rem_minmax(0,1fr)_auto]"
        data-retains-draft-selections="true"
        method="get"
      >
        <input name="draft" type="hidden" value={record.id} />
        <input name="tab" type="hidden" value="actors" />
        {Object.entries(selectionParams).map(([name, value]) => (
          <input key={name} name={name} type="hidden" value={value} />
        ))}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Responsibility
          <select
            className={inputClass}
            defaultValue={activeResponsibility}
            name="userResponsibility"
          >
            {responsibilities.map(([value, responsibilityLabel]) => (
              <option key={value} value={value}>
                {responsibilityLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Find eligible users
          <input
            className={inputClass}
            name="userQuery"
            defaultValue={query}
            maxLength={120}
            placeholder="Name or email"
          />
        </label>
        <button className="mt-auto min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-blue-700">
          Search named users
        </button>
      </form>
      <MutationForm
        action={action}
        className="p-4 sm:p-5"
        submitLabel="Save named users"
        pendingLabel="Saving named users…"
        disabled={Boolean(disabledReason)}
      >
        <input name="draftId" type="hidden" value={record.id} />
        <input name="expectedVersion" type="hidden" value={record.version} />
        <fieldset
          disabled={Boolean(disabledReason)}
          className="grid gap-4 md:grid-cols-2"
        >
          <legend className="sr-only">Named opening inventory users</legend>
          {responsibilities.map(([responsibility, label]) => {
            const current = record.actorSelections.find(
              (entry) => entry.responsibility === responsibility,
            );
            const candidates = options.flatMap((user) =>
              user.roleAssignments
                .filter((assignment) =>
                  assignment.eligibleResponsibilities.includes(responsibility),
                )
                .map((assignment) => ({ user, assignment })),
            );
            const selectedValue = byResponsibility[responsibility] ?? "";
            const selectedVisible = candidates.some(
              ({ user, assignment }) =>
                `${user.id}|${assignment.id}` === selectedValue,
            );
            const selectedPersisted =
              current &&
              `${current.userId}|${current.roleAssignmentId}` === selectedValue;
            return (
              <label
                key={responsibility}
                className="grid gap-1 text-sm font-medium text-slate-700"
              >
                {label}
                <select
                  className={inputClass}
                  name={responsibility}
                  onChange={(event) =>
                    setByResponsibility((values) => ({
                      ...values,
                      [responsibility]: event.target.value,
                    }))
                  }
                  required
                  value={selectedValue}
                >
                  <option value="">
                    Select an eligible named user and role assignment
                  </option>
                  {selectedValue && !selectedVisible ? (
                    <option value={selectedValue}>
                      {selectedPersisted
                        ? `${current.userName} / ${current.roleAssignmentLabel}`
                        : "Selected eligible user retained from another result page"}
                    </option>
                  ) : null}
                  {candidates.map(({ user, assignment }) => (
                    <option
                      key={`${user.id}:${assignment.id}`}
                      value={`${user.id}|${assignment.id}`}
                    >
                      {user.name} / {assignment.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </fieldset>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          The server rejects prohibited role combinations. The opening executor
          is deployment-controlled and cannot be selected here.
        </p>
        {disabledReason ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            Disabled: {disabledReason}
          </p>
        ) : null}
        {totalItems > 0 ? (
          <div data-retains-draft-selections="true">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              totalItems={totalItems}
              itemLabel="eligible named users"
              getPageHref={(next) =>
                inventoryPilotSetupHref(record, "actors", {
                  userPage: String(next),
                  userResponsibility: activeResponsibility,
                  ...(query ? { userQuery: query } : {}),
                  ...selectionParams,
                })
              }
            />
          </div>
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Named-user change reason
          <textarea
            className={`${inputClass} min-h-20`}
            name="reason"
            minLength={10}
            maxLength={1000}
            required
            disabled={Boolean(disabledReason)}
          />
        </label>
      </MutationForm>
    </section>
  );
}

function ReadOnlyActors({ record }: { record: InventoryPilotSetupRecord }) {
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">
            Immutable named-user evidence
          </h3>
          <p className="text-sm text-slate-500">
            Seal-time evidence only; these names never become current
            permissions, scope, or executor authority.
          </p>
        </div>
        <Badge tone="success">Read-only</Badge>
      </div>
      <div className="divide-y divide-slate-100">
        {record.actorSelections.map((actor) => (
          <article key={actor.responsibility} className="ogfi-list-row">
            <p className="font-bold text-slate-950">
              {labelResponsibility(actor.responsibility)}
            </p>
            <p className="text-sm text-slate-600">
              {actor.userName} · {actor.roleAssignmentLabel}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function labelResponsibility(value: string) {
  return (
    responsibilities.find(
      ([responsibility]) => responsibility === value,
    )?.[1] ?? value.replaceAll("_", " ")
  );
}

function PurchaseRequestResolverEvidencePanel({
  evidence,
}: {
  evidence: PurchaseRequestResolverEvidence | undefined;
}) {
  return (
    <section
      aria-label="Purchase Request resolver evidence"
      className="border-y border-blue-100 bg-blue-50 p-4 text-sm text-blue-950"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-bold">Purchase Request resolver evidence</h4>
          <p className="text-xs text-blue-800">
            Bounded standard, non-emergency evidence only; live routing is
            revalidated when work occurs.
          </p>
        </div>
        <Badge
          tone={evidence?.status === "retained" ? "success" : "destructive"}
        >
          {evidence?.status === "retained"
            ? "Exact evidence retained"
            : "Evidence unavailable"}
        </Badge>
      </div>
      {evidence?.status === "retained" ? (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <dt className="text-xs font-bold uppercase text-blue-700">
              Resolver
            </dt>
            <dd className="break-all font-mono text-xs">
              {evidence.resolverId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-blue-700">
              Emergency request
            </dt>
            <dd className="font-semibold">{String(evidence.isEmergency)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-blue-700">
              Selected route
            </dt>
            <dd className="font-semibold">{evidence.selectedRouteKey}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-blue-700">
              Route type
            </dt>
            <dd className="font-semibold">{evidence.routeType}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-blue-700">
              Fallback used
            </dt>
            <dd className="font-semibold">{String(evidence.fallbackUsed)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 rounded-md border border-rose-200 bg-white p-3 text-rose-800">
          Resolver evidence is missing, malformed, or does not match the exact
          DEFAULT / normal / no-fallback contract. This record fails closed and
          cannot support Purchase Request readiness.
        </p>
      )}
    </section>
  );
}

export function Routes({
  record,
  rules,
  action,
  disabledReason,
  page,
  pageSize,
  totalItems,
  query,
  activeFamily,
  selectionValues,
}: {
  record: InventoryPilotSetupRecord;
  rules: RuleOption[];
  action: InventoryPilotSetupMutationAction;
  disabledReason?: string;
  page: number;
  pageSize: number;
  totalItems: number;
  query: string;
  activeFamily: string;
  selectionValues: Record<string, string>;
}) {
  const selectionSeed = useMemo(
    () =>
      Object.fromEntries(
        record.routes.map((route) => [
          route.family,
          selectionValues[route.family] ?? route.approvalRuleId ?? "",
        ]),
      ),
    [record.routes, selectionValues],
  );
  const [byFamily, setByFamily] =
    useState<Record<string, string>>(selectionSeed);
  useEffect(
    () => setByFamily(selectionSeed),
    [record.id, record.version, selectionSeed],
  );
  const selectionParams = inventoryPilotPendingSelectionParams(
    "route",
    byFamily,
    record.version,
  );
  const purchaseRequestEvidence = record.routes.find(
    (route) => route.family === "PurchaseRequest",
  )?.resolverEvidence;
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">Approval routes</h3>
          <p className="text-sm text-slate-500">
            Bind one exact live candidate rule per family for seal-time
            evidence. This draft never creates or changes approval authority.
          </p>
          <p className="mt-2 text-xs text-blue-700">
            Purchase Request readiness covers only the standard, non-emergency
            pilot scenario resolved through the DEFAULT route. A valid emergency
            purchasing route may coexist, but it is not selected or evidenced
            here.
          </p>
        </div>
      </div>
      <PurchaseRequestResolverEvidencePanel
        evidence={purchaseRequestEvidence}
      />
      <form
        className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-[14rem_minmax(0,1fr)_auto]"
        data-retains-draft-selections="true"
        method="get"
      >
        <input name="draft" type="hidden" value={record.id} />
        <input name="tab" type="hidden" value="routes" />
        {Object.entries(selectionParams).map(([name, value]) => (
          <input key={name} name={name} type="hidden" value={value} />
        ))}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Workflow family
          <select
            className={inputClass}
            defaultValue={activeFamily}
            name="ruleFamily"
          >
            {record.routes.map((route) => (
              <option key={route.family} value={route.family}>
                {route.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Find eligible approval rules
          <input
            className={inputClass}
            name="ruleQuery"
            defaultValue={query}
            maxLength={120}
            placeholder="Route key or family"
          />
        </label>
        <button className="mt-auto min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-blue-700">
          Search routes
        </button>
      </form>
      <MutationForm
        action={action}
        className="p-4 sm:p-5"
        submitLabel="Save route bindings"
        pendingLabel="Saving routes…"
        disabled={Boolean(disabledReason)}
      >
        <input name="draftId" type="hidden" value={record.id} />
        <input name="expectedVersion" type="hidden" value={record.version} />
        <fieldset
          disabled={Boolean(disabledReason)}
          className="grid gap-4 md:grid-cols-2"
        >
          <legend className="sr-only">Approval route bindings</legend>
          {record.routes.map((route) => {
            const visibleRules = rules.filter(
              (rule) => rule.family === route.family,
            );
            const selectedValue = byFamily[route.family] ?? "";
            const selectedVisible = visibleRules.some(
              (rule) => rule.id === selectedValue,
            );
            const selectedPersisted = route.approvalRuleId === selectedValue;
            return (
              <label
                key={route.family}
                className="grid gap-1 text-sm font-medium text-slate-700"
              >
                {route.label}
                <select
                  className={inputClass}
                  name={route.family}
                  onChange={(event) =>
                    setByFamily((values) => ({
                      ...values,
                      [route.family]: event.target.value,
                    }))
                  }
                  required
                  value={selectedValue}
                >
                  <option value="">Select an eligible route</option>
                  {selectedValue && !selectedVisible ? (
                    <option value={selectedValue}>
                      {selectedPersisted
                        ? (route.routeLabel ?? "Currently bound rule")
                        : "Selected eligible rule retained from another result page"}
                    </option>
                  ) : null}
                  {visibleRules.map((rule) => (
                    <option key={rule.id} value={rule.id}>
                      {rule.label} / {rule.status}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal text-slate-500">
                  {route.detail}
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
          Route bindings are readiness evidence only. Live authorization and
          routing are revalidated when each workflow action occurs.
        </p>
        {totalItems > 0 ? (
          <div data-retains-draft-selections="true">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              totalItems={totalItems}
              itemLabel="eligible approval rules"
              getPageHref={(next) =>
                inventoryPilotSetupHref(record, "routes", {
                  rulePage: String(next),
                  ruleFamily: activeFamily,
                  ...(query ? { ruleQuery: query } : {}),
                  ...selectionParams,
                })
              }
            />
          </div>
        ) : null}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Route-binding change reason
          <textarea
            className={`${inputClass} min-h-20`}
            name="reason"
            minLength={10}
            maxLength={1000}
            required
            disabled={Boolean(disabledReason)}
          />
        </label>
        {disabledReason ? (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            Disabled: {disabledReason}
          </p>
        ) : null}
      </MutationForm>
    </section>
  );
}

export function ReadOnlyRoutes({
  record,
}: {
  record: InventoryPilotSetupRecord;
}) {
  const purchaseRequestEvidence = record.routes.find(
    (route) => route.family === "PurchaseRequest",
  )?.resolverEvidence;
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">Immutable route evidence</h3>
          <p className="text-sm text-slate-500">
            These eight bindings record the seal-time cutoff only. Live approval
            routing remains authoritative.
          </p>
          <p className="mt-2 text-xs text-blue-700">
            Purchase Request evidence represents the standard, non-emergency
            DEFAULT route only; emergency purchasing routes may coexist
            independently.
          </p>
        </div>
        <Badge tone="success">Read-only</Badge>
      </div>
      <PurchaseRequestResolverEvidencePanel
        evidence={purchaseRequestEvidence}
      />
      <div className="divide-y divide-slate-100">
        {record.routes.map((route) => (
          <article
            key={route.family}
            className="ogfi-list-row grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div>
              <p className="font-bold text-slate-950">{route.label}</p>
              <p className="text-sm text-slate-600">
                {route.routeLabel ?? "No retained route"}
              </p>
            </div>
            <Badge tone={route.ready ? "success" : "destructive"}>
              {route.ready ? "Retained at seal" : "Unavailable"}
            </Badge>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Readiness({
  record,
  action,
  canEdit,
}: {
  record: InventoryPilotSetupRecord;
  action: InventoryPilotSetupMutationAction;
  canEdit: boolean;
}) {
  const purchaseRequestEvidence = record.routes.find(
    (route) => route.family === "PurchaseRequest",
  )?.resolverEvidence;
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">Seal-time readiness</h3>
          <p className="text-sm text-slate-500">
            Eight exact families. Results are point-in-time evidence, never
            current or permanent authorization.
          </p>
          <p className="mt-2 text-xs text-blue-700">
            Purchase Request readiness is evaluated for the standard,
            non-emergency DEFAULT route only. Emergency purchasing readiness is
            outside this pilot evidence check.
          </p>
        </div>
        {record.status === "DRAFT" && canEdit ? (
          <MutationForm
            action={action}
            submitLabel="Validate readiness"
            pendingLabel="Validating readiness…"
          >
            <input name="draftId" type="hidden" value={record.id} />
            <input
              name="expectedVersion"
              type="hidden"
              value={record.version}
            />
          </MutationForm>
        ) : null}
      </div>
      <PurchaseRequestResolverEvidencePanel
        evidence={purchaseRequestEvidence}
      />
      <div className="divide-y divide-slate-100">
        {record.readiness.map((result) => (
          <article key={result.family} className="ogfi-list-row">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold text-slate-950">{result.label}</p>
                <p className="text-xs text-slate-500">
                  {record.status === "SEALED"
                    ? "Seal-time evidence cutoff"
                    : "Last route evidence capture"}{" "}
                  {formatDate(result.checkedAt)}
                </p>
              </div>
              <Badge
                tone={
                  result.ready === null
                    ? "neutral"
                    : result.ready
                      ? "success"
                      : "destructive"
                }
              >
                {result.ready === null
                  ? "Not retained"
                  : result.ready
                    ? record.status === "SEALED"
                      ? "Ready at cutoff"
                      : "Ready now; live recheck required"
                    : "Blocked"}
              </Badge>
            </div>
            {result.blockers.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-800">
                {result.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                {result.ready === null
                  ? "This abandoned draft has no immutable readiness result. Its activity and selections remain available for audit context."
                  : "No readiness blockers were found at this cutoff. Live checks still apply when work occurs."}
              </p>
            )}
          </article>
        ))}
      </div>
      {record.readiness.length === 0 ? (
        <div className="p-5 text-sm text-slate-600">
          <p className="font-semibold text-slate-950">
            Readiness has not been validated
          </p>
          <p className="mt-1">
            Save the endpoint, item, named-user, and route inputs, then validate
            all eight families.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function Activity({
  entries,
  record,
  page,
  pageSize,
  totalItems,
}: {
  entries: ActivityEntry[];
  record: InventoryPilotSetupRecord;
  page: number;
  pageSize: number;
  totalItems: number;
}) {
  return (
    <section className="ogfi-data-surface overflow-hidden">
      <div className="ogfi-section-header">
        <div>
          <h3 className="font-bold text-slate-950">Configuration activity</h3>
          <p className="text-sm text-slate-500">
            Retained audit context for draft changes, validation, abandonment,
            and seal outcomes.
          </p>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="p-5 text-sm text-slate-600">
          No visible activity is available for this revision.
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <li key={entry.id} className="ogfi-list-row">
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                <div>
                  <p className="font-bold text-slate-950">{entry.action}</p>
                  {entry.sourceLabel ? (
                    <p className="text-xs font-medium text-blue-700">
                      {entry.sourceLabel}
                    </p>
                  ) : null}
                </div>
                <time className="text-xs text-slate-500">
                  {formatDate(entry.occurredAt)}
                </time>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {entry.actorName} · {entry.detail}
              </p>
            </li>
          ))}
        </ol>
      )}
      {totalItems > 0 ? (
        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          itemLabel="configuration activity events"
          getPageHref={(next) =>
            inventoryPilotSetupHref(record, "activity", {
              activityPage: String(next),
            })
          }
        />
      ) : null}
    </section>
  );
}

export function InventoryPilotSetupWorkspace(
  props: InventoryPilotSetupWorkspaceProps,
) {
  const { selected } = props;
  const [dirty, setDirty] = useState(false);
  const tabHref = (tab: InventoryPilotSetupTab) =>
    selected
      ? inventoryPilotSetupHref(selected, tab)
      : `/opening-inventory/setup?tab=${tab}`;
  const selectionReadOnlyReason =
    selected?.status !== "DRAFT"
      ? "Sealed and abandoned configurations are immutable."
      : props.editDisabledReason;
  const allReady =
    selected?.readiness.length === 8 &&
    selected.readiness.every((entry) => entry.ready);
  const editorSealerConflict = Boolean(
    selected &&
    (selected.creatorUserId === props.requesterUserId ||
      selected.editorUserId === props.requesterUserId),
  );

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => setDirty(false), [selected?.id, selected?.version]);

  const sealReason = useMemo(() => {
    if (!selected || selected.status !== "DRAFT")
      return "Only an active draft can be sealed.";
    if (!props.canSeal)
      return (
        props.sealDisabledReason ??
        "Dedicated seal permission and exact Company Manage scope are required."
      );
    if (!props.mfaFresh) return "Fresh MFA is required before sealing.";
    if (editorSealerConflict)
      return "The draft creator or last material editor cannot seal the same draft.";
    if (!allReady)
      return "Validate all eight readiness families and resolve every blocker before sealing.";
    return null;
  }, [
    allReady,
    editorSealerConflict,
    props.canSeal,
    props.mfaFresh,
    props.sealDisabledReason,
    selected,
  ]);

  return (
    <div
      className="grid gap-5"
      onClickCapture={(event) => {
        if (!dirty) return;
        const anchor = (event.target as HTMLElement).closest("a");
        if (anchor?.closest('[data-retains-draft-selections="true"]')) return;
        if (
          anchor &&
          !window.confirm(
            "Discard unsaved configuration changes and leave this section?",
          )
        )
          event.preventDefault();
      }}
    >
      <nav aria-label="Opening inventory workspace" className="ogfi-tab-list">
        <ButtonLink href="/opening-inventory" className="ogfi-tab">
          Cutover queue
        </ButtonLink>
        <ButtonLink
          href="/opening-inventory/setup"
          className="ogfi-tab is-active"
        >
          Setup Center
        </ButtonLink>
      </nav>
      <section className="ogfi-data-surface overflow-hidden">
        <div className="ogfi-section-header">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
              Company-scoped configuration
            </p>
            <h2 className="text-lg font-bold text-slate-950">
              {props.companyName} Inventory Pilot Setup Center
            </h2>
            <p className="text-sm text-slate-500">
              Context: {props.companyName} / {props.locationName}. Changing
              company context reloads this workspace; selections cannot be
              submitted to another company.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <EntryModal
              title="Create inventory pilot configuration draft"
              triggerLabel="Create configuration draft"
              disabled={!props.canCreate}
              {...(props.createDisabledReason
                ? { disabledReason: props.createDisabledReason }
                : {})}
            >
              <MutationForm
                action={props.actions.create}
                className="ogfi-form-shell mt-4"
                submitLabel="Create configuration draft"
                pendingLabel="Creating draft…"
                successHref={(state) =>
                  state.draftId
                    ? `/opening-inventory/setup?draft=${encodeURIComponent(state.draftId)}`
                    : "/opening-inventory/setup"
                }
              >
                <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                  Creates an editable company draft only. It does not activate a
                  pilot, alter a route, create an opening cohort, or post stock.
                </p>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Draft purpose
                  <textarea
                    className={`${inputClass} min-h-24`}
                    name="reason"
                    minLength={10}
                    maxLength={1000}
                    required
                    placeholder="Why this configuration draft is being prepared"
                  />
                </label>
              </MutationForm>
            </EntryModal>
          </div>
        </div>
      </section>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(17rem,0.34fr)_minmax(0,1fr)]">
        <Queue
          entries={props.queue}
          selected={selected}
          activeTab={props.activeTab}
          page={props.page}
          pageSize={props.pageSize}
          totalItems={props.totalItems}
        />
        <main className="min-w-0">
          {!selected ? (
            <section className="ogfi-data-surface p-5">
              <h2 className="font-bold text-slate-950">
                Select a configuration revision
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose a draft to configure, or an immutable sealed revision to
                review its digest, lineage, readiness evidence, and activity.
              </p>
            </section>
          ) : (
            <>
              <section className="ogfi-data-surface mb-5 overflow-hidden">
                <div className="ogfi-section-header">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {selected.revisionNumber
                        ? `Sealed revision ${selected.revisionNumber}`
                        : "Mutable draft"}
                    </p>
                    <h2 className="text-lg font-bold text-slate-950">
                      {selected.label}
                    </h2>
                    <p className="text-sm text-slate-500">
                      Editor {selected.editorName} · updated{" "}
                      {formatDate(selected.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={statusTone(selected.status)}>
                    {selected.status}
                  </Badge>
                </div>
                <div className="grid gap-3 border-t border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Company
                    </span>
                    {props.companyName}
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Brand
                    </span>
                    Company-level configuration · no brand binding
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Location scope
                    </span>
                    Exact endpoint roles listed in Endpoints
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Status / next action
                    </span>
                    {selected.status === "DRAFT"
                      ? "Draft · complete readiness, then independent seal"
                      : selected.status === "SEALED"
                        ? "Sealed · eligible only through a separately authorized runtime path"
                        : "Abandoned · retained history"}
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Owner / requester
                    </span>
                    {selected.editorName}
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Created / updated
                    </span>
                    {formatDate(selected.createdAt)} ·{" "}
                    {formatDate(selected.updatedAt)}
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Activity
                    </span>
                    {selected.activity.length} visible event(s)
                  </div>
                  {selected.digest ? (
                    <div className="sm:col-span-2 xl:col-span-4">
                      <span className="block text-xs font-bold uppercase text-slate-500">
                        Immutable SHA-256 digest
                      </span>
                      <code className="break-all text-xs">
                        {selected.digest}
                      </code>
                    </div>
                  ) : null}
                  {selected.revisionNumber ||
                  selected.predecessorRevisionNumber ? (
                    <div>
                      <span className="block text-xs font-bold uppercase text-slate-500">
                        Lineage
                      </span>
                      {selected.revisionNumber
                        ? selected.predecessorRevisionNumber
                          ? `Successor to revision ${selected.predecessorRevisionNumber}`
                          : "First sealed revision"
                        : `Draft successor to sealed revision ${selected.predecessorRevisionNumber}`}
                    </div>
                  ) : null}
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Decision source
                    </span>
                    {selected.sourceDecisionId}
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-500">
                      Sealed by / at
                    </span>
                    {selected.sealedByName
                      ? `${selected.sealedByName} · ${formatDate(selected.sealedAt)}`
                      : "Not sealed"}
                  </div>
                </div>
              </section>
              <div className="mb-5 flex flex-wrap gap-2">
                {selected.status === "SEALED" && props.canCreate ? (
                  <EntryModal
                    title="Create successor configuration draft"
                    triggerLabel="Create successor draft"
                  >
                    <MutationForm
                      action={props.actions.createSuccessor}
                      className="ogfi-form-shell mt-4"
                      submitLabel="Create successor draft"
                      pendingLabel="Creating successor…"
                      successHref={(state) =>
                        state.draftId
                          ? `/opening-inventory/setup?draft=${encodeURIComponent(state.draftId)}`
                          : null
                      }
                    >
                      <input
                        name="revisionId"
                        type="hidden"
                        value={selected.id}
                      />
                      <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                        Copies this sealed content into a new mutable draft.
                        Existing cohorts and submission evidence remain pinned
                        to revision {selected.revisionNumber} and its digest.
                      </p>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Successor reason
                        <textarea
                          className={`${inputClass} min-h-24`}
                          name="reason"
                          minLength={10}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </MutationForm>
                  </EntryModal>
                ) : null}
                {selected.status === "DRAFT" && props.canEdit ? (
                  <EntryModal
                    title="Abandon configuration draft"
                    triggerLabel="Abandon draft"
                    triggerClassName="border border-rose-200 bg-white text-rose-700 shadow-none"
                  >
                    <MutationForm
                      action={props.actions.abandon}
                      className="ogfi-form-shell mt-4"
                      submitLabel="Abandon configuration draft"
                      pendingLabel="Abandoning draft…"
                    >
                      <input name="draftId" type="hidden" value={selected.id} />
                      <input
                        name="expectedVersion"
                        type="hidden"
                        value={selected.version}
                      />
                      <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">
                        Abandoning stops further edits and preserves the draft
                        and activity history. It does not delete or activate
                        anything.
                      </p>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Abandonment reason
                        <textarea
                          className={`${inputClass} min-h-24`}
                          name="reason"
                          minLength={10}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </MutationForm>
                  </EntryModal>
                ) : null}
                {selected.status === "DRAFT" ? (
                  <EntryModal
                    title="Seal inventory pilot configuration"
                    triggerLabel="Seal configuration revision"
                    disabled={Boolean(sealReason)}
                    {...(sealReason ? { disabledReason: sealReason } : {})}
                  >
                    <MutationForm
                      action={props.actions.seal}
                      className="ogfi-form-shell mt-4"
                      submitLabel="Seal immutable revision"
                      pendingLabel="Sealing revision…"
                    >
                      <input name="draftId" type="hidden" value={selected.id} />
                      <input
                        name="expectedVersion"
                        type="hidden"
                        value={selected.version}
                      />
                      <SealIdempotencyKey />
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        <strong>Irreversible seal boundary.</strong> The server
                        rechecks fresh MFA, exact Company Manage scope,
                        creator/editor–sealer separation, all eight readiness
                        families, normalized selections, and digest integrity.
                        Sealing has no activation, approval, cohort, posting,
                        ledger, custody, or financial effect.
                      </div>
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Seal reason
                        <textarea
                          className={`${inputClass} min-h-24`}
                          name="reason"
                          minLength={10}
                          maxLength={1000}
                          required
                        />
                      </label>
                    </MutationForm>
                  </EntryModal>
                ) : null}
                {selected.status === "DRAFT" && !props.mfaFresh ? (
                  <ButtonLink
                    href="/account/security"
                    className="bg-slate-100 text-blue-700"
                  >
                    Refresh MFA in Account Security
                  </ButtonLink>
                ) : null}
              </div>
              <nav
                aria-label="Configuration sections"
                className="ogfi-tab-list mb-5"
              >
                {inventoryPilotSetupTabs.map((tab) => (
                  <ButtonLink
                    key={tab}
                    href={tabHref(tab)}
                    className={
                      tab === props.activeTab
                        ? "ogfi-tab is-active"
                        : "ogfi-tab"
                    }
                  >
                    {tab === "actors"
                      ? "Named users"
                      : tab[0]!.toUpperCase() + tab.slice(1)}
                  </ButtonLink>
                ))}
              </nav>
              {dirty ? (
                <div
                  className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                  role="status"
                >
                  <strong>Unsaved configuration changes.</strong> Save this
                  section before changing tabs, filters, pages, or company
                  context.
                </div>
              ) : null}
              <div
                onChangeCapture={(event) => {
                  const form = (event.target as HTMLElement).closest("form");
                  if (form?.method.toLowerCase() !== "get") setDirty(true);
                }}
                onSubmitCapture={(event) => {
                  const form = event.target as HTMLFormElement;
                  if (form.dataset.retainsDraftSelections === "true") return;
                  if (
                    form.method.toLowerCase() === "get" &&
                    dirty &&
                    !window.confirm(
                      "Discard unsaved configuration changes and apply these filters?",
                    )
                  )
                    event.preventDefault();
                }}
              >
                {props.activeTab === "endpoints" ? (
                  selected.status === "DRAFT" ? (
                    <EndpointEditor
                      key={`endpoints:${selected.id}:${selected.version}`}
                      record={selected}
                      options={props.endpointOptions}
                      action={props.actions.updateEndpoints}
                      {...(selectionReadOnlyReason
                        ? { disabledReason: selectionReadOnlyReason }
                        : {})}
                      page={props.endpointPage}
                      pageSize={props.endpointPageSize}
                      totalItems={props.endpointTotalItems}
                    />
                  ) : (
                    <ReadOnlyEndpointSummary
                      record={selected}
                      page={props.endpointPage}
                      pageSize={props.endpointPageSize}
                    />
                  )
                ) : null}
                {props.activeTab === "items" ? (
                  selected.status === "DRAFT" ? (
                    <ItemEditor
                      key={`items:${selected.id}:${selected.version}`}
                      record={selected}
                      options={props.itemOptions}
                      action={props.actions.updateItems}
                      {...(selectionReadOnlyReason
                        ? { disabledReason: selectionReadOnlyReason }
                        : {})}
                      page={props.itemPage}
                      pageSize={props.itemPageSize}
                      totalItems={props.itemTotalItems}
                      query={props.itemQuery}
                      status={props.itemStatus}
                      category={props.itemCategoryId}
                      categories={props.itemCategories}
                    />
                  ) : (
                    <ReadOnlyItemSummary
                      record={selected}
                      page={props.itemPage}
                      pageSize={props.itemPageSize}
                    />
                  )
                ) : null}
                {props.activeTab === "actors" ? (
                  selected.status === "DRAFT" ? (
                    <ActorEditor
                      record={selected}
                      options={props.userOptions}
                      action={props.actions.updateActors}
                      {...(selectionReadOnlyReason
                        ? { disabledReason: selectionReadOnlyReason }
                        : {})}
                      page={props.userPage}
                      pageSize={props.userPageSize}
                      totalItems={props.userTotalItems}
                      query={props.userQuery}
                      activeResponsibility={props.userResponsibility}
                      selectionValues={props.actorSelectionValues}
                    />
                  ) : (
                    <ReadOnlyActors record={selected} />
                  )
                ) : null}
                {props.activeTab === "routes" ? (
                  selected.status === "DRAFT" ? (
                    <Routes
                      record={selected}
                      rules={props.ruleOptions}
                      action={props.actions.updateRoutes}
                      {...(selectionReadOnlyReason
                        ? { disabledReason: selectionReadOnlyReason }
                        : {})}
                      page={props.rulePage}
                      pageSize={props.rulePageSize}
                      totalItems={props.ruleTotalItems}
                      query={props.ruleQuery}
                      activeFamily={props.ruleFamily}
                      selectionValues={props.routeSelectionValues}
                    />
                  ) : (
                    <ReadOnlyRoutes record={selected} />
                  )
                ) : null}
                {props.activeTab === "readiness" ? (
                  <Readiness
                    record={selected}
                    action={props.actions.evaluate}
                    canEdit={props.canEdit}
                  />
                ) : null}
                {props.activeTab === "activity" ? (
                  <Activity
                    entries={selected.activity}
                    record={selected}
                    page={props.activityPage}
                    pageSize={props.activityPageSize}
                    totalItems={props.activityTotalItems}
                  />
                ) : null}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
