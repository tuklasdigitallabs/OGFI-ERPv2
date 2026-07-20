import type { ProjectTaskStatus } from "./projectTasks";

const expansionTaskMarkers = [
  "EXPANSION_FEASIBILITY_MODEL",
  "EXPANSION_CAPEX_PROCUREMENT_ITEM",
  "EXPANSION_POST_OPENING_REVIEW",
  "EXPANSION_PERMIT_DOCUMENT",
  "EXPANSION_CONSTRUCTION_TASK",
  "EXPANSION_OPENING_READINESS",
  "EXPANSION_PUNCH_LIST_ITEM"
] as const;

export type ExpansionSpecializedTaskKind =
  (typeof expansionTaskMarkers)[number];

const allowedTransitions: Record<ProjectTaskStatus, ProjectTaskStatus[]> = {
  BACKLOG: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "FOR_REVIEW", "CANCELLED"],
  WAITING_FOR_APPROVAL: ["IN_PROGRESS", "FOR_REVIEW", "BLOCKED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "FOR_REVIEW", "CANCELLED"],
  FOR_REVIEW: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["IN_PROGRESS"]
};

export function expansionSpecializedTaskNextStatuses(currentStatus: ProjectTaskStatus) {
  return allowedTransitions[currentStatus] ?? [];
}

export function getExpansionSpecializedTaskKind(
  description: string | null
): ExpansionSpecializedTaskKind | null {
  const marker = expansionTaskMarkers.find((candidate) =>
    description?.startsWith(`${candidate}:`)
  );
  return marker ?? null;
}

export function hasExpansionStructuredEvidence(input: {
  description: string | null;
  activeAttachmentCount: number;
  sourceRecordLinkCount: number;
}) {
  if (input.activeAttachmentCount > 0 || input.sourceRecordLinkCount > 0) {
    return true;
  }
  const firstLine = input.description?.split("\n")[0] ?? "";
  const separatorIndex = firstLine.indexOf(":");
  if (separatorIndex < 1) {
    return false;
  }
  try {
    const metadata = JSON.parse(firstLine.slice(separatorIndex + 1)) as {
      evidenceReference?: unknown;
      sourceReference?: unknown;
    };
    return [metadata.evidenceReference, metadata.sourceReference].some(
      (value) => typeof value === "string" && value.trim().length >= 5
    );
  } catch {
    return false;
  }
}

function readExpansionMetadata(description: string | null) {
  const firstLine = description?.split("\n")[0] ?? "";
  const separatorIndex = firstLine.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }
  try {
    return JSON.parse(firstLine.slice(separatorIndex + 1)) as {
      severity?: unknown;
      independentReviewerUserId?: unknown;
    };
  } catch {
    return null;
  }
}

export function assertExpansionSpecializedTaskTransition(input: {
  description: string | null;
  currentStatus: ProjectTaskStatus;
  nextStatus: ProjectTaskStatus;
  hasStructuredEvidence: boolean;
  actorUserId?: string;
  ownerUserId?: string;
  createdByUserId?: string;
  sponsorUserId?: string;
}) {
  const kind = getExpansionSpecializedTaskKind(input.description);
  if (!kind) {
    return null;
  }
  if (!allowedTransitions[input.currentStatus]?.includes(input.nextStatus)) {
    throw new Error("EXPANSION_TASK_INVALID_TRANSITION");
  }
  if (kind === "EXPANSION_PUNCH_LIST_ITEM" && input.nextStatus === "WAITING_FOR_APPROVAL") {
    throw new Error("EXPANSION_TASK_INVALID_TRANSITION");
  }
  if (input.nextStatus === "COMPLETED") {
    if (input.currentStatus !== "FOR_REVIEW") {
      throw new Error("EXPANSION_TASK_REVIEW_REQUIRED");
    }
    if (!input.hasStructuredEvidence) {
      throw new Error("EXPANSION_TASK_EVIDENCE_REQUIRED");
    }
    if (kind === "EXPANSION_PUNCH_LIST_ITEM") {
      const metadata = readExpansionMetadata(input.description);
      const isHighRisk = ["HIGH", "CRITICAL"].includes(
        String(metadata?.severity ?? "")
      );
      const configuredReviewer =
        typeof metadata?.independentReviewerUserId === "string"
          ? metadata.independentReviewerUserId
          : input.sponsorUserId;
      if (
        isHighRisk &&
        (!configuredReviewer ||
          input.actorUserId !== configuredReviewer ||
          input.actorUserId === input.ownerUserId ||
          input.actorUserId === input.createdByUserId)
      ) {
        throw new Error("EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEW_REQUIRED");
      }
    }
  }
  return kind;
}
