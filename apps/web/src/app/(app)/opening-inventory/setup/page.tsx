import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ButtonLink } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import {
  InventoryPilotSetupWorkspace,
  inventoryPilotSetupTabs,
  parsePurchaseRequestResolverEvidence,
  type InventoryPilotSetupMutationState,
  type InventoryPilotSetupRecord,
  type InventoryPilotSetupTab,
} from "@/components/opening-inventory/InventoryPilotSetupWorkspace";
import { parseInventoryPilotPendingSelections } from "@/components/opening-inventory/InventoryPilotSetupState";
import { inventoryPilotSelectionAuditChanges } from "@/components/opening-inventory/InventoryPilotSetupAudit";
import {
  getActionErrorFeedback,
  getActionSuccessFeedback,
} from "@/server/services/actionFeedback";
import { assertTrustedServerActionOrigin } from "@/server/services/authentication";
import {
  getDefaultAppRoute,
  permissions,
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  abandonInventoryPilotConfigurationDraft,
  createInventoryPilotConfigurationDraft,
  createInventoryPilotConfigurationSuccessorDraft,
  evaluateInventoryPilotConfigurationReadiness,
  getInventoryPilotConfigurationDraftSnapshot,
  getInventoryPilotConfigurationWorkspace,
  inventoryPilotConfigurationCapabilities,
  inventoryPilotConfigurationReadinessFamilies,
  inventoryPilotConfigurationResponsibilities,
  inventoryPilotConfigurationStableErrors,
  sealInventoryPilotConfigurationDraft,
  updateInventoryPilotConfigurationDraft,
} from "@/server/services/inventoryPilotConfiguration";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { searchParams?: Promise<SearchParams> };
type Workspace = Awaited<
  ReturnType<typeof getInventoryPilotConfigurationWorkspace>
>;

const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
const positive = (value: string | string[] | undefined) =>
  Math.max(1, Number.parseInt(one(value), 10) || 1);
const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
const asIso = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;
const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function safeSelectionAuditChanges(beforeSelections: Record<string, unknown>, afterSelections: Record<string, unknown>) {
  return inventoryPilotSelectionAuditChanges(beforeSelections, afterSelections);
}

function safeAuditDetail(entry: {
  beforeData: unknown;
  afterData: unknown;
  metadata: unknown;
}) {
  const before = jsonRecord(entry.beforeData);
  const after = jsonRecord(entry.afterData);
  const metadata = jsonRecord(entry.metadata);
  const fields: Array<[string, string]> = [
    ["status", "Status"],
    ["version", "Version"],
    ["revisionNumber", "Revision"],
    ["endpointCount", "Endpoints"],
    ["itemCount", "Items"],
    ["participantCount", "Named users"],
    ["routeCount", "Routes"],
    ["readinessReady", "Ready families"],
    ["blocking", "Readiness blocking"],
    ["errorCode", "Outcome"],
  ];
  const changes = fields.flatMap(([key, fieldLabel]) => {
    const from = before[key];
    const to = after[key];
    if (from === undefined && to === undefined) return [];
    if (
      !["string", "number", "boolean"].includes(typeof from) &&
      from !== undefined
    )
      return [];
    if (
      !["string", "number", "boolean"].includes(typeof to) &&
      to !== undefined
    )
      return [];
    return [`${fieldLabel}: ${from ?? "not set"} → ${to ?? "not set"}`];
  });
  const beforeSelections = jsonRecord(before.selections);
  const afterSelections = jsonRecord(after.selections);
  const selectionFields: Array<[string, string]> = [
    ["endpointMemberships", "Endpoints"],
    ["itemIds", "Items"],
    ["participants", "Named users"],
    ["routeReadiness", "Routes"],
  ];
  const selectionChanges = selectionFields.flatMap(([key, fieldLabel]) => {
    const from = Array.isArray(beforeSelections[key])
      ? beforeSelections[key].length
      : undefined;
    const to = Array.isArray(afterSelections[key])
      ? afterSelections[key].length
      : undefined;
    return from === undefined && to === undefined
      ? []
      : [`${fieldLabel}: ${from ?? "not set"} → ${to ?? "not set"}`];
  });
  const blockerCount = Array.isArray(after.blockerCodes)
    ? after.blockerCodes.length
    : null;
  const reason =
    typeof metadata.reason === "string"
      ? metadata.reason.trim().slice(0, 500)
      : "";
  return (
    [
      ...(reason ? [`Reason: ${reason}`] : []),
      ...changes,
      ...selectionChanges,
      ...safeSelectionAuditChanges(beforeSelections, afterSelections),
      ...(blockerCount === null ? [] : [`Readiness blockers: ${blockerCount}`]),
    ].join(" · ") ||
    "Audit evidence retained; no additional user-facing field summary was recorded."
  );
}

async function sessionForMutation() {
  await assertTrustedServerActionOrigin();
  const session = await getSessionContext();
  if (!session) throw new Error("PERMISSION_DENIED");
  return session;
}

async function mutationResult(
  successCode: string,
  mutate: () => Promise<{ draftId?: string } | void>,
): Promise<InventoryPilotSetupMutationState> {
  try {
    const result = await mutate();
    revalidatePath("/opening-inventory/setup");
    revalidatePath("/opening-inventory");
    return {
      status: "success",
      feedback: getActionSuccessFeedback(successCode),
      ...(result?.draftId ? { draftId: result.draftId } : {}),
    };
  } catch (error) {
    return { status: "error", feedback: getActionErrorFeedback(error) };
  }
}

async function currentDraftSnapshot(draftId: string) {
  const session = await sessionForMutation();
  const draft = await getInventoryPilotConfigurationDraftSnapshot(session, draftId);
  if (draft.status !== "DRAFT")
    throw new Error("INVENTORY_PILOT_CONFIGURATION_NOT_FOUND");
  return {
    session,
    draft,
    endpoints: draft.endpointMemberships.map((row) => ({
      capability: row.capability,
      inventoryLocationId: row.inventoryLocationId,
    })),
    itemIds: draft.itemMemberships.map((row) => row.itemId),
    participants: draft.participants.map((row) => ({
      responsibility: row.responsibility,
      userId: row.userId,
      roleAssignmentId: row.roleAssignmentId,
    })),
    routeBindings: draft.routeReadiness.map((row) => ({
      family: row.family,
      approvalRuleId: row.approvalRuleId,
    })),
  };
}

async function createAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_DRAFT_CREATED",
    async () => {
      const session = await sessionForMutation();
      const draft = await createInventoryPilotConfigurationDraft(session, {
        reason: formData.get("reason"),
      });
      return { draftId: draft.id };
    },
  );
}

async function createSuccessorAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_SUCCESSOR_DRAFT_CREATED",
    async () => {
      const session = await sessionForMutation();
      const draft = await createInventoryPilotConfigurationSuccessorDraft(
        session,
        {
          predecessorRevisionId: formData.get("revisionId"),
          reason: formData.get("reason"),
        },
      );
      return { draftId: draft.id };
    },
  );
}

async function updateEndpointsAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_DRAFT_UPDATED",
    async () => {
      const draftId = String(formData.get("draftId") ?? "");
      const snapshot = await currentDraftSnapshot(draftId);
      const endpoints = formData
        .getAll("endpoint")
        .map(String)
        .map((entry) => {
          const [inventoryLocationId, , capability] = entry.split("|");
          return { inventoryLocationId, capability };
        });
      await updateInventoryPilotConfigurationDraft(snapshot.session, {
        draftId,
        expectedVersion: formData.get("expectedVersion"),
        endpoints,
        itemIds: snapshot.itemIds,
        participants: snapshot.participants,
        routeBindings: snapshot.routeBindings,
        reason: formData.get("reason"),
      });
    },
  );
}

async function updateItemsAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_DRAFT_UPDATED",
    async () => {
      const draftId = String(formData.get("draftId") ?? "");
      const snapshot = await currentDraftSnapshot(draftId);
      await updateInventoryPilotConfigurationDraft(snapshot.session, {
        draftId,
        expectedVersion: formData.get("expectedVersion"),
        endpoints: snapshot.endpoints,
        itemIds: formData.getAll("itemId"),
        participants: snapshot.participants,
        routeBindings: snapshot.routeBindings,
        reason: formData.get("reason"),
      });
    },
  );
}

async function updateActorsAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_DRAFT_UPDATED",
    async () => {
      const draftId = String(formData.get("draftId") ?? "");
      const snapshot = await currentDraftSnapshot(draftId);
      const participants = inventoryPilotConfigurationResponsibilities.map(
        (responsibility) => {
          const [userId, roleAssignmentId] = String(
            formData.get(responsibility) ?? "",
          ).split("|");
          return { responsibility, userId, roleAssignmentId };
        },
      );
      await updateInventoryPilotConfigurationDraft(snapshot.session, {
        draftId,
        expectedVersion: formData.get("expectedVersion"),
        endpoints: snapshot.endpoints,
        itemIds: snapshot.itemIds,
        participants,
        routeBindings: snapshot.routeBindings,
        reason: formData.get("reason"),
      });
    },
  );
}

async function updateRoutesAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_DRAFT_UPDATED",
    async () => {
      const draftId = String(formData.get("draftId") ?? "");
      const snapshot = await currentDraftSnapshot(draftId);
      const routeBindings = inventoryPilotConfigurationReadinessFamilies.map(
        (family) => ({
          family,
          approvalRuleId: String(formData.get(family) ?? ""),
        }),
      );
      await updateInventoryPilotConfigurationDraft(snapshot.session, {
        draftId,
        expectedVersion: formData.get("expectedVersion"),
        endpoints: snapshot.endpoints,
        itemIds: snapshot.itemIds,
        participants: snapshot.participants,
        routeBindings,
        reason: formData.get("reason"),
      });
    },
  );
}

async function abandonAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_DRAFT_ABANDONED",
    async () => {
      const session = await sessionForMutation();
      await abandonInventoryPilotConfigurationDraft(session, {
        draftId: formData.get("draftId"),
        expectedVersion: formData.get("expectedVersion"),
        reason: formData.get("reason"),
      });
    },
  );
}

async function evaluateAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_READINESS_EVALUATED",
    async () => {
      const session = await sessionForMutation();
      await evaluateInventoryPilotConfigurationReadiness(session, {
        draftId: formData.get("draftId"),
      });
    },
  );
}

async function sealAction(
  _previous: InventoryPilotSetupMutationState,
  formData: FormData,
) {
  "use server";
  return mutationResult(
    "INVENTORY_PILOT_CONFIGURATION_REVISION_SEALED",
    async () => {
      const session = await sessionForMutation();
      await sealInventoryPilotConfigurationDraft(session, {
        draftId: formData.get("draftId"),
        expectedVersion: formData.get("expectedVersion"),
        idempotencyKey: formData.get("idempotencyKey"),
        reason: formData.get("reason"),
      });
    },
  );
}

function mapRecord(workspace: Workspace): InventoryPilotSetupRecord | null {
  const draft = workspace.selectedDraft;
  const revision = workspace.selectedRevision;
  if (!draft && !revision) return null;
  const endpointMemberships =
    draft?.endpointMemberships ?? revision?.endpointMemberships ?? [];
  const itemMemberships =
    draft?.itemMemberships ?? revision?.itemMemberships ?? [];
  const participantMemberships = workspace.selectedParticipantDetails;
  const routeMemberships =
    draft?.routeReadiness ?? revision?.routeReadinessMemberships ?? [];
  const selectedEndpointDetails = workspace.selectedEndpointDetails.map(
    (endpoint) => ({
      inventoryLocationId: endpoint.id,
      locationId: endpoint.locationId,
      code: endpoint.code,
      name: endpoint.name,
      locationName: `${endpoint.location.code} / ${endpoint.location.name}`,
      capabilities: endpointMemberships
        .filter((row) => row.inventoryLocationId === endpoint.id)
        .map((row) => row.capability),
    }),
  );
  const selectedItemDetails = workspace.selectedItemDetails.map((item) => ({
    id: item.id,
    code: item.itemCode,
    name: item.itemName,
    categoryName: `${item.category.categoryCode} — ${item.category.categoryName}`,
    status: item.status,
  }));
  const readinessCheckedAt = routeMemberships
    .map((row) =>
      "readinessCheckedAt" in row
        ? row.readinessCheckedAt
        : row.evidenceCutoffAt,
    )
    .filter(Boolean)
    .sort()
    .at(-1);
  const readiness = inventoryPilotConfigurationReadinessFamilies.map(
    (family) => ({
      family,
      label: label(family),
      ready: revision
        ? true
        : draft?.status === "DRAFT"
          ? !workspace.readiness.blockers.some(
              (blocker) => !blocker.family || blocker.family === family,
            )
          : null,
      blockers: revision
        ? []
        : workspace.readiness.blockers
            .filter((blocker) => !blocker.family || blocker.family === family)
            .map((blocker) => blocker.message),
      checkedAt: asIso(readinessCheckedAt),
    }),
  );
  const activity = workspace.activityPage.items.map((entry) => {
    const row = jsonRecord(entry);
    const sourceLabel =
      typeof row.sourceLabel === "string"
        ? row.sourceLabel
        : row.entityType === "InventoryPilotConfigurationDraft" && revision
          ? "Source draft history"
          : undefined;
    return {
      id: entry.id,
      action: label(entry.eventType),
      actorName: entry.actor?.displayName ?? "System",
      occurredAt: entry.occurredAt.toISOString(),
      detail: safeAuditDetail(entry),
      ...(sourceLabel ? { sourceLabel } : {}),
    };
  });
  const routes = inventoryPilotConfigurationReadinessFamilies.map((family) => {
    const route = routeMemberships.find((entry) => entry.family === family);
    return {
      family,
      label: label(family),
      approvalRuleId: route?.approvalRuleId ?? null,
      routeLabel: route
        ? `Rule ${route.approvalRuleId.slice(0, 8)} · version ${route.approvalRuleVersion}`
        : null,
      ready: Boolean(route),
      detail: route
        ? "Bound readiness evidence; live routing remains authoritative."
        : "Select one eligible approval rule for this family.",
      ...(family === "PurchaseRequest"
        ? {
            resolverEvidence: parsePurchaseRequestResolverEvidence(
              route?.resolverEvidenceCanonicalJson,
              route?.approvalRuleId,
            ),
          }
        : {}),
    };
  });
  if (draft)
    return {
      id: draft.id,
      label: `Configuration draft ${draft.id.slice(0, 8)}`,
      status: draft.status,
      version: draft.version,
      revisionNumber: draft.sealedRevisionNumber,
      predecessorRevisionNumber: draft.predecessorRevisionNumber,
      digest: draft.sealedRevisionDigest,
      sourceDecisionId: draft.sourceDecisionId,
      creatorUserId: draft.createdByUserId,
      editorUserId: draft.lastEditedByUserId,
      editorName: draft.lastEditedBy.displayName,
      sealedByName: null,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
      sealedAt: asIso(draft.sealedAt),
      endpointSelections: endpointMemberships.map((row) => ({
        inventoryLocationId: row.inventoryLocationId,
        locationId: row.locationId,
        capability: row.capability,
      })),
      itemIds: itemMemberships.map((row) => row.itemId),
      selectedEndpointDetails,
      selectedItemDetails,
      actorSelections: participantMemberships.map((row) => ({
        responsibility: row.responsibility,
        userId: row.userId,
        userName: row.displayName,
        roleAssignmentId: row.roleAssignmentId,
        roleAssignmentLabel: row.roleName,
      })),
      routes,
      readiness,
      activity,
    };
  return {
    id: revision!.id,
    label: `Inventory Pilot Revision ${revision!.revisionNumber}`,
    status: "SEALED",
    version: 1,
    revisionNumber: revision!.revisionNumber,
    predecessorRevisionNumber: revision!.predecessorRevisionNumber,
    digest: revision!.configurationDigest,
    sourceDecisionId: revision!.sourceDecisionId,
    creatorUserId: "",
    editorUserId: "",
    editorName: revision!.sealedBy.displayName,
    sealedByName: revision!.sealedBy.displayName,
    createdAt: revision!.sealedAt.toISOString(),
    updatedAt: revision!.sealedAt.toISOString(),
    sealedAt: revision!.sealedAt.toISOString(),
    endpointSelections: endpointMemberships.map((row) => ({
      inventoryLocationId: row.inventoryLocationId,
      locationId: row.locationId,
      capability: row.capability,
    })),
    itemIds: itemMemberships.map((row) => row.itemId),
    selectedEndpointDetails,
    selectedItemDetails,
    actorSelections: participantMemberships.map((row) => ({
      responsibility: row.responsibility,
      userId: row.userId,
      userName: row.displayName,
      roleAssignmentId: row.roleAssignmentId,
      roleAssignmentLabel: row.roleName,
    })),
    routes,
    readiness,
    activity,
  };
}

export default async function InventoryPilotSetupPage({ searchParams }: Props) {
  const session = await getSessionContext();
  if (!session) redirect("/sign-in");
  if (
    !session.permissionCodes.includes(
      permissions.inventoryPilotConfigurationView,
    )
  )
    redirect(getDefaultAppRoute(session.permissionCodes));
  const params = searchParams ? await searchParams : {};
  const tabValue = one(params.tab);
  const activeTab: InventoryPilotSetupTab = inventoryPilotSetupTabs.includes(
    tabValue as InventoryPilotSetupTab,
  )
    ? (tabValue as InventoryPilotSetupTab)
    : "endpoints";
  const userResponsibilityValue = one(params.userResponsibility);
  const userResponsibility =
    inventoryPilotConfigurationResponsibilities.includes(
      userResponsibilityValue as (typeof inventoryPilotConfigurationResponsibilities)[number],
    )
      ? (userResponsibilityValue as (typeof inventoryPilotConfigurationResponsibilities)[number])
      : inventoryPilotConfigurationResponsibilities[0];
  const ruleFamilyValue = one(params.ruleFamily);
  const ruleFamily = inventoryPilotConfigurationReadinessFamilies.includes(
    ruleFamilyValue as (typeof inventoryPilotConfigurationReadinessFamilies)[number],
  )
    ? (ruleFamilyValue as (typeof inventoryPilotConfigurationReadinessFamilies)[number])
    : inventoryPilotConfigurationReadinessFamilies[0];
  const query = {
    ...(one(params.draft) ? { draftId: one(params.draft) } : {}),
    ...(one(params.revision) ? { revisionId: one(params.revision) } : {}),
    queuePage: positive(params.page),
    endpointPage: positive(params.endpointPage),
    itemPage: positive(params.itemPage),
    userPage: positive(params.userPage),
    rulePage: positive(params.rulePage),
    activityPage: positive(params.activityPage),
    ...(one(params.itemQuery) ? { itemQuery: one(params.itemQuery) } : {}),
    itemStatus:
      one(params.itemStatus) === "INACTIVE"
        ? ("INACTIVE" as const)
        : ("ACTIVE" as const),
    ...(one(params.itemCategoryId)
      ? { itemCategoryId: one(params.itemCategoryId) }
      : {}),
    ...(one(params.userQuery) ? { userQuery: one(params.userQuery) } : {}),
    userResponsibility,
    ...(one(params.ruleQuery) ? { ruleQuery: one(params.ruleQuery) } : {}),
    ruleFamily,
  };
  let workspace: Workspace | null = null;
  let loadError: unknown = null;
  try {
    workspace = await getInventoryPilotConfigurationWorkspace(session, query);
  } catch (error) {
    loadError = error;
  }
  if (!workspace) {
    const errorCode = loadError instanceof Error ? loadError.message : "";
    const denied =
      errorCode === inventoryPilotConfigurationStableErrors.permissionDenied ||
      errorCode ===
        inventoryPilotConfigurationStableErrors.companyManageRequired ||
      errorCode === inventoryPilotConfigurationStableErrors.authorityStale;
    const missing =
      errorCode === inventoryPilotConfigurationStableErrors.notFound;
    const retryHref = `/opening-inventory/setup?${new URLSearchParams({ ...(one(params.draft) ? { draft: one(params.draft) } : {}), ...(one(params.revision) ? { revision: one(params.revision) } : {}), tab: activeTab })}`;
    return (
      <AppShell
        session={session}
        title="Inventory Pilot Setup Center"
        subtitle="Controlled draft, seal review, and immutable readiness evidence"
        activeNav="opening-inventory"
      >
        <section
          className="ogfi-data-surface max-w-2xl p-5 sm:p-6"
          role="alert"
        >
          <h2 className="font-bold text-slate-950">
            {denied
              ? "Setup Center permission denied"
              : missing
                ? "Configuration record unavailable"
                : "Setup Center could not be loaded"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {denied
              ? "Dedicated configuration view permission and exact Company Manage scope are required. No configuration details are shown."
              : missing
                ? "The selected record is no longer available in this company scope. Return to the Setup Center queue and choose an available revision."
                : "A temporary load error prevented the authorized workspace from opening. No draft changes were submitted. Retry the request or return to the opening-inventory queue."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {!denied ? (
              <ButtonLink href={retryHref} className="bg-blue-600 text-white">
                Retry Setup Center
              </ButtonLink>
            ) : null}
            <ButtonLink
              href={missing ? "/opening-inventory/setup" : "/opening-inventory"}
              className="bg-slate-100 text-blue-700"
            >
              {missing
                ? "Back to revision queue"
                : "Back to opening-inventory queue"}
            </ButtonLink>
          </div>
        </section>
      </AppShell>
    );
  }
  const selected = mapRecord(workspace);
  const selectedDraft = workspace.selectedDraft;
  const actorSelectionValues = selectedDraft
    ? parseInventoryPilotPendingSelections(
        params,
        inventoryPilotConfigurationResponsibilities,
        "actor",
        selectedDraft.version,
      )
    : {};
  const routeSelectionValues = selectedDraft
    ? parseInventoryPilotPendingSelections(
        params,
        inventoryPilotConfigurationReadinessFamilies,
        "route",
        selectedDraft.version,
      )
    : {};
  const queue = workspace.revisionQueuePage.items.map((entry) =>
    entry.recordType === "DRAFT"
      ? {
          id: entry.record.id,
          hrefType: "draft" as const,
          label: `Configuration draft ${entry.record.id.slice(0, 8)}`,
          status: entry.record.status,
          revisionNumber: null,
          updatedAt: entry.record.updatedAt.toISOString(),
          editorName: entry.record.lastEditedBy.displayName,
          endpointCount: entry.record._count.endpointMemberships,
          itemCount: entry.record._count.itemMemberships,
          readinessReady:
            selectedDraft?.id === entry.record.id
              ? inventoryPilotConfigurationReadinessFamilies.length -
                new Set(
                  workspace.readiness.blockers.flatMap((blocker) =>
                    blocker.family
                      ? [blocker.family]
                      : inventoryPilotConfigurationReadinessFamilies,
                  ),
                ).size
              : null,
          readinessTotal: selectedDraft?.id === entry.record.id ? 8 : null,
        }
      : {
          id: entry.record.id,
          hrefType: "revision" as const,
          label: `Inventory Pilot Revision ${entry.record.revisionNumber}`,
          status: "SEALED" as const,
          revisionNumber: entry.record.revisionNumber,
          updatedAt: entry.record.sealedAt.toISOString(),
          editorName: entry.record.sealedBy.displayName,
          endpointCount: entry.record._count.endpointMemberships,
          itemCount: entry.record._count.itemMemberships,
          readinessReady: entry.record._count.routeReadinessMemberships,
          readinessTotal: 8,
        },
  );
  const endpointOptions = workspace.candidateEndpoints.items.map(
    (endpoint) => ({
      inventoryLocationId: endpoint.id,
      locationId: endpoint.locationId,
      code: endpoint.code,
      name: endpoint.name,
      locationName: `${endpoint.location.code} / ${endpoint.location.name}`,
      capabilities: [...inventoryPilotConfigurationCapabilities],
    }),
  );
  const itemOptions = workspace.candidateItems.items.map((item) => ({
    id: item.id,
    code: item.itemCode,
    name: item.itemName,
    categoryName: `${item.category.categoryCode} — ${item.category.categoryName}`,
    status: item.status,
  }));
  const userOptions = workspace.candidateUsers.items.map((user) => ({
    id: user.id,
    name: user.displayName,
    email: user.email,
    roleAssignments: user.roleAssignments.map((assignment) => ({
      id: assignment.id,
      label: `${assignment.role.code} / ${assignment.role.name}`,
      eligibleResponsibilities: [...assignment.eligibleResponsibilities],
    })),
  }));
  const ruleOptions = workspace.candidateRules.items.flatMap((rule) =>
    rule.family
      ? [
          {
            id: rule.id,
            family: rule.family,
            label: `${rule.routeKey} / v${rule.version}`,
            status:
              rule.isActive && rule.definitionSealed
                ? "Active and sealed"
                : "Not ready",
          },
        ]
      : [],
  );
  const canEdit = workspace.canDraft && selected?.status === "DRAFT";
  const sealDisabledReason = workspace.sealEligibility.blockedReasons
    .map((reason) => getActionErrorFeedback(new Error(reason)).message)
    .join(" ");
  return (
    <AppShell
      session={session}
      title="Inventory Pilot Setup Center"
      subtitle="Controlled draft, seal review, and immutable readiness evidence"
      activeNav="opening-inventory"
    >
      <InventoryPilotSetupWorkspace
        companyName={workspace.company.name}
        locationName={session.context.locationName ?? "Company context"}
        requesterUserId={session.user.id}
        queue={queue}
        page={workspace.revisionQueuePage.page}
        pageSize={workspace.revisionQueuePage.pageSize}
        totalItems={workspace.revisionQueuePage.totalItems}
        selected={selected}
        activeTab={activeTab}
        endpointOptions={endpointOptions}
        endpointPage={workspace.candidateEndpoints.page}
        endpointPageSize={workspace.candidateEndpoints.pageSize}
        endpointTotalItems={workspace.candidateEndpoints.totalItems}
        itemOptions={itemOptions}
        itemPage={workspace.candidateItems.page}
        itemPageSize={workspace.candidateItems.pageSize}
        itemTotalItems={workspace.candidateItems.totalItems}
        itemQuery={one(params.itemQuery)}
        itemStatus={query.itemStatus}
        itemCategoryId={one(params.itemCategoryId)}
        itemCategories={workspace.itemCategories.items}
        userOptions={userOptions}
        userPage={workspace.candidateUsers.page}
        userPageSize={workspace.candidateUsers.pageSize}
        userTotalItems={workspace.candidateUsers.totalItems}
        userQuery={one(params.userQuery)}
        userResponsibility={userResponsibility}
        actorSelectionValues={actorSelectionValues}
        ruleOptions={ruleOptions}
        rulePage={workspace.candidateRules.page}
        rulePageSize={workspace.candidateRules.pageSize}
        ruleTotalItems={workspace.candidateRules.totalItems}
        ruleQuery={one(params.ruleQuery)}
        ruleFamily={ruleFamily}
        routeSelectionValues={routeSelectionValues}
        activityPage={workspace.activityPage.page}
        activityPageSize={workspace.activityPage.pageSize}
        activityTotalItems={workspace.activityPage.totalItems}
        canCreate={workspace.canDraft}
        canEdit={canEdit}
        canSeal={workspace.canSeal}
        {...(!workspace.canDraft
          ? {
              createDisabledReason:
                "Dedicated configuration draft permission and exact Company Manage scope are required.",
            }
          : {})}
        {...(!canEdit
          ? {
              editDisabledReason:
                "Dedicated configuration draft permission, exact Company Manage scope, and an editable draft are required.",
            }
          : {})}
        {...(sealDisabledReason ? { sealDisabledReason } : {})}
        mfaFresh={workspace.sealEligibility.mfaFresh}
        actions={{
          create: createAction,
          createSuccessor: createSuccessorAction,
          updateEndpoints: updateEndpointsAction,
          updateItems: updateItemsAction,
          updateActors: updateActorsAction,
          updateRoutes: updateRoutesAction,
          abandon: abandonAction,
          evaluate: evaluateAction,
          seal: sealAction,
        }}
      />
    </AppShell>
  );
}
