import { permissions } from "./authorization";

export const phase2WorkflowDomains = [
  "RECIPE_VERSION",
  "MENU_PRICE_DECISION",
  "BRANCH_CHECKLIST",
  "FOOD_SAFETY_LOG",
  "OPERATIONAL_INCIDENT",
  "MAINTENANCE_TICKET"
] as const;

export type Phase2WorkflowDomain = (typeof phase2WorkflowDomains)[number];

export type Phase2WorkflowTransition = {
  domain: Phase2WorkflowDomain;
  action: string;
  fromStatus: string;
  toStatus: string;
  permissionCode: string;
  label: string;
  requiresReason: boolean;
  requiresEvidence: boolean;
  terminal: boolean;
};

export type Phase2WorkflowTransitionRequest = {
  domain: Phase2WorkflowDomain;
  action: string;
  fromStatus: string;
  permissionCodes: string[];
  reason?: string | null;
  evidenceReference?: string | null;
};

export type Phase2IndependentReviewMetadata = {
  domain: Phase2WorkflowDomain;
  action: string;
  riskLevel?: string | null;
};

const reviewEvidenceNotRequired = false;

export const phase2WorkflowTransitions = [
  {
    domain: "RECIPE_VERSION",
    action: "SUBMIT",
    fromStatus: "DRAFT",
    toStatus: "SUBMITTED",
    permissionCode: permissions.recipeSubmit,
    label: "Submit recipe version",
    requiresReason: false,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "RECIPE_VERSION",
    action: "START_REVIEW",
    fromStatus: "SUBMITTED",
    toStatus: "UNDER_REVIEW",
    permissionCode: permissions.recipeReview,
    label: "Start recipe review",
    requiresReason: false,
    requiresEvidence: reviewEvidenceNotRequired,
    terminal: false
  },
  {
    domain: "RECIPE_VERSION",
    action: "RETURN",
    fromStatus: "UNDER_REVIEW",
    toStatus: "RETURNED",
    permissionCode: permissions.recipeReview,
    label: "Return recipe version",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "RECIPE_VERSION",
    action: "APPROVE",
    fromStatus: "UNDER_REVIEW",
    toStatus: "APPROVED",
    permissionCode: permissions.recipeApprove,
    label: "Approve recipe version",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "RECIPE_VERSION",
    action: "PUBLISH",
    fromStatus: "APPROVED",
    toStatus: "PUBLISHED",
    permissionCode: permissions.recipePublish,
    label: "Publish recipe version",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "RECIPE_VERSION",
    action: "REJECT",
    fromStatus: "UNDER_REVIEW",
    toStatus: "REJECTED",
    permissionCode: permissions.recipeReview,
    label: "Reject recipe version",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "RECIPE_VERSION",
    action: "CANCEL",
    fromStatus: "DRAFT",
    toStatus: "CANCELLED",
    permissionCode: permissions.recipeArchive,
    label: "Cancel recipe draft",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "MENU_PRICE_DECISION",
    action: "SUBMIT",
    fromStatus: "DRAFT",
    toStatus: "SUBMITTED",
    permissionCode: permissions.menuPriceDecide,
    label: "Submit menu price decision",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "MENU_PRICE_DECISION",
    action: "START_REVIEW",
    fromStatus: "SUBMITTED",
    toStatus: "UNDER_REVIEW",
    permissionCode: permissions.menuPriceDecide,
    label: "Start menu price review",
    requiresReason: false,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "MENU_PRICE_DECISION",
    action: "APPROVE",
    fromStatus: "UNDER_REVIEW",
    toStatus: "APPROVED",
    permissionCode: permissions.menuPriceDecide,
    label: "Approve menu price decision",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "MENU_PRICE_DECISION",
    action: "APPLY",
    fromStatus: "APPROVED",
    toStatus: "APPLIED",
    permissionCode: permissions.menuPriceDecide,
    label: "Apply menu price",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "MENU_PRICE_DECISION",
    action: "REJECT",
    fromStatus: "UNDER_REVIEW",
    toStatus: "REJECTED",
    permissionCode: permissions.menuPriceDecide,
    label: "Reject menu price decision",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "BRANCH_CHECKLIST",
    action: "START_MANAGER_REVIEW",
    fromStatus: "SUBMITTED",
    toStatus: "MANAGER_REVIEW",
    permissionCode: permissions.branchOperationsReview,
    label: "Start manager review",
    requiresReason: false,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "BRANCH_CHECKLIST",
    action: "RETURN_FOR_CORRECTION",
    fromStatus: "MANAGER_REVIEW",
    toStatus: "RETURNED",
    permissionCode: permissions.branchOperationsCorrect,
    label: "Return checklist for correction",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "BRANCH_CHECKLIST",
    action: "CLOSE",
    fromStatus: "MANAGER_REVIEW",
    toStatus: "CLOSED",
    permissionCode: permissions.branchOperationsReview,
    label: "Close branch checklist",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "FOOD_SAFETY_LOG",
    action: "START_EXCEPTION_REVIEW",
    fromStatus: "SUBMITTED",
    toStatus: "EXCEPTION_REVIEW",
    permissionCode: permissions.foodSafetyReview,
    label: "Start exception review",
    requiresReason: false,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "FOOD_SAFETY_LOG",
    action: "RETURN_FOR_CORRECTION",
    fromStatus: "EXCEPTION_REVIEW",
    toStatus: "RETURNED",
    permissionCode: permissions.foodSafetyCorrect,
    label: "Return food-safety log for correction",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "FOOD_SAFETY_LOG",
    action: "CLOSE",
    fromStatus: "EXCEPTION_REVIEW",
    toStatus: "CLOSED",
    permissionCode: permissions.foodSafetyReview,
    label: "Close food-safety log",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "RESOLVE",
    fromStatus: "OPEN",
    toStatus: "RESOLVED",
    permissionCode: permissions.incidentResolve,
    label: "Resolve incident",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "RESOLVE",
    fromStatus: "IN_PROGRESS",
    toStatus: "RESOLVED",
    permissionCode: permissions.incidentResolve,
    label: "Resolve incident",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "RESOLVE",
    fromStatus: "PENDING_REVIEW",
    toStatus: "RESOLVED",
    permissionCode: permissions.incidentResolve,
    label: "Resolve incident",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "CANCEL",
    fromStatus: "OPEN",
    toStatus: "CANCELLED",
    permissionCode: permissions.incidentResolve,
    label: "Cancel incident",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "CANCEL",
    fromStatus: "IN_PROGRESS",
    toStatus: "CANCELLED",
    permissionCode: permissions.incidentResolve,
    label: "Cancel incident",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "CANCEL",
    fromStatus: "PENDING_REVIEW",
    toStatus: "CANCELLED",
    permissionCode: permissions.incidentResolve,
    label: "Cancel incident",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "DETAIL_CORRECTION",
    fromStatus: "OPEN",
    toStatus: "OPEN",
    permissionCode: permissions.incidentCreate,
    label: "Correct incident details",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "DETAIL_CORRECTION",
    fromStatus: "IN_PROGRESS",
    toStatus: "IN_PROGRESS",
    permissionCode: permissions.incidentCreate,
    label: "Correct incident details",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "OPERATIONAL_INCIDENT",
    action: "DETAIL_CORRECTION",
    fromStatus: "PENDING_REVIEW",
    toStatus: "PENDING_REVIEW",
    permissionCode: permissions.incidentCreate,
    label: "Correct incident details",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "COMPLETE",
    fromStatus: "OPEN",
    toStatus: "COMPLETED",
    permissionCode: permissions.maintenanceComplete,
    label: "Complete maintenance ticket",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "COMPLETE",
    fromStatus: "IN_PROGRESS",
    toStatus: "COMPLETED",
    permissionCode: permissions.maintenanceComplete,
    label: "Complete maintenance ticket",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "COMPLETE",
    fromStatus: "PENDING_VENDOR",
    toStatus: "COMPLETED",
    permissionCode: permissions.maintenanceComplete,
    label: "Complete maintenance ticket",
    requiresReason: true,
    requiresEvidence: true,
    terminal: true
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "CANCEL",
    fromStatus: "OPEN",
    toStatus: "CANCELLED",
    permissionCode: permissions.maintenanceComplete,
    label: "Cancel maintenance ticket",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "CANCEL",
    fromStatus: "IN_PROGRESS",
    toStatus: "CANCELLED",
    permissionCode: permissions.maintenanceComplete,
    label: "Cancel maintenance ticket",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "CANCEL",
    fromStatus: "PENDING_VENDOR",
    toStatus: "CANCELLED",
    permissionCode: permissions.maintenanceComplete,
    label: "Cancel maintenance ticket",
    requiresReason: true,
    requiresEvidence: false,
    terminal: true
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "DETAIL_CORRECTION",
    fromStatus: "OPEN",
    toStatus: "OPEN",
    permissionCode: permissions.maintenanceCorrect,
    label: "Correct maintenance ticket details",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "DETAIL_CORRECTION",
    fromStatus: "IN_PROGRESS",
    toStatus: "IN_PROGRESS",
    permissionCode: permissions.maintenanceCorrect,
    label: "Correct maintenance ticket details",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  },
  {
    domain: "MAINTENANCE_TICKET",
    action: "DETAIL_CORRECTION",
    fromStatus: "PENDING_VENDOR",
    toStatus: "PENDING_VENDOR",
    permissionCode: permissions.maintenanceCorrect,
    label: "Correct maintenance ticket details",
    requiresReason: true,
    requiresEvidence: false,
    terminal: false
  }
] as const satisfies readonly Phase2WorkflowTransition[];

const independentReviewActions = new Set(["RESOLVE", "COMPLETE", "CANCEL"]);
const independentReviewRiskLevels = new Set(["CRITICAL", "HIGH"]);

export function requiresPhase2IndependentReview({
  domain,
  action,
  riskLevel
}: Phase2IndependentReviewMetadata) {
  return (
    (domain === "OPERATIONAL_INCIDENT" || domain === "MAINTENANCE_TICKET") &&
    independentReviewActions.has(action) &&
    independentReviewRiskLevels.has(riskLevel?.trim().toUpperCase() ?? "")
  );
}

export function getPhase2WorkflowTransitions(domain: Phase2WorkflowDomain) {
  return phase2WorkflowTransitions.filter((transition) => transition.domain === domain);
}

export function getPhase2WorkflowActionsForStatus(
  domain: Phase2WorkflowDomain,
  status: string,
  permissionCodes: string[]
) {
  return getPhase2WorkflowTransitions(domain).filter(
    (transition) =>
      transition.fromStatus === status &&
      permissionCodes.includes(transition.permissionCode)
  );
}

export function getPhase2ReachableStatuses(domain: Phase2WorkflowDomain) {
  const statuses = new Set<string>();
  for (const transition of getPhase2WorkflowTransitions(domain)) {
    statuses.add(transition.fromStatus);
    statuses.add(transition.toStatus);
  }
  return [...statuses];
}

export function assertPhase2WorkflowTransitionAllowed(
  request: Phase2WorkflowTransitionRequest
) {
  const transition = getPhase2WorkflowTransitions(request.domain).find(
    (candidate) =>
      candidate.action === request.action &&
      candidate.fromStatus === request.fromStatus
  );

  if (!transition) {
    throw new Error("PHASE2_WORKFLOW_TRANSITION_NOT_ALLOWED");
  }
  if (!request.permissionCodes.includes(transition.permissionCode)) {
    throw new Error("PERMISSION_DENIED");
  }
  if (transition.requiresReason && !request.reason?.trim()) {
    throw new Error("PHASE2_WORKFLOW_REASON_REQUIRED");
  }
  if (transition.requiresEvidence && !request.evidenceReference?.trim()) {
    throw new Error("PHASE2_WORKFLOW_EVIDENCE_REQUIRED");
  }

  return transition;
}
