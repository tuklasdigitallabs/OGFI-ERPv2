import { prisma } from "@ogfi/database";
import { z } from "zod";
import {
  canUseProjects,
  permissions,
  canViewExpansionFinancialEstimates
} from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import type { CsvRow } from "./csv";
import { dateOnlyString, isProjectTaskOverdue } from "./projectDates";
import { notifyProjectTaskAssigned } from "./projectNotifications";
import { transitionProjectTask } from "./projectTasks";
import {
  expansionProjectTypes,
  type ExpansionProjectType
} from "./expansionProjectTypes";
import {
  getActiveProjectScopes,
  hasCompanyManageScope,
  listAuthorizedProjectAccess
} from "./projects";

const expansionProjectTypeSet = new Set<string>(
  expansionProjectTypes.map((type) => type.toUpperCase())
);
export { expansionProjectTypes, type ExpansionProjectType } from "./expansionProjectTypes";

export type ExpansionProjectRow = {
  id: string;
  version: number;
  code: string;
  name: string;
  description: string | null;
  status: string;
  projectType: string;
  brandName: string;
  siteName: string;
  sponsorName: string;
  managerName: string;
  targetOpeningDate: string | null;
  scheduleState: "ON_TRACK" | "WATCH" | "AT_RISK" | "NO_DATE";
  taskCount: number;
  completedTaskCount: number;
  completionPercent: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  openRiskCount: number;
  highRiskCount: number;
  openPunchListCount: number;
  linkedRecordCount: number;
  nextMilestoneTitle: string | null;
  nextMilestoneDate: string | null;
  isRestricted: boolean;
  createdAt: string;
};

export type ExpansionDashboardSummary = {
  projectCount: number;
  activeProjectCount: number;
  atRiskProjectCount: number;
  blockedTaskCount: number;
  overdueTaskCount: number;
  highRiskCount: number;
  openPunchListCount: number;
  linkedRecordCount: number;
  upcomingMilestoneCount: number;
  projects: ExpansionProjectRow[];
  recentActivity: Array<{
    id: string;
    projectId: string;
    projectName: string;
    eventType: string;
    actorName: string;
    occurredAt: string;
  }>;
};

export type ExpansionCreateOptions = {
  projectTypes: readonly ExpansionProjectType[];
  locations: Array<{
    id: string;
    name: string;
    locationType: string;
  }>;
  templates: Array<{
    id: string;
    code: string;
    name: string;
    projectType: string;
  }>;
  leadershipUsers: Array<{
    id: string;
    displayName: string;
    email: string;
  }>;
  canCreateProject: boolean;
};

export type ExpansionSitePipelineFilters = {
  query?: string;
  status?: string;
};

export type ExpansionLifecycleGateRow = {
  gateKey: string;
  gateOrder: number;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  brandName: string;
  siteName: string;
  status: "NOT_CREATED" | "PLANNED" | "ACHIEVED" | "CANCELLED";
  targetDate: string | null;
  ownerName: string | null;
  isAtRisk: boolean;
  atRiskReason: string | null;
  milestoneId: string | null;
  milestoneVersion: number | null;
  canMutate: boolean;
  canAchieve: boolean;
  canCancel: boolean;
  actionDeniedReason: string | null;
  reviewerName: string;
  evidenceReference: string | null;
  evidenceState: "MISSING" | "RECORDED" | "NOT_REQUIRED_YET";
  nextAction: string;
};

export type ExpansionLifecycleGateDashboard = {
  projectCount: number;
  gateCount: number;
  achievedGateCount: number;
  atRiskGateCount: number;
  missingGateCount: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    siteName: string;
    targetOpeningDate: string | null;
    canMutate: boolean;
    gateCount: number;
    achievedGateCount: number;
    atRiskGateCount: number;
  }>;
  gates: ExpansionLifecycleGateRow[];
};

export type ExpansionFeasibilityRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  brandName: string;
  siteName: string;
  title: string;
  modelType: string;
  status: string;
  priority: string;
  ownerName: string;
  dueDate: string | null;
  isOverdue: boolean;
  projectedAnnualSales: number | null;
  rentToSalesPercent: number | null;
  capexEstimate: number | null;
  paybackMonths: number | null;
  roiPercent: number | null;
  npvEstimate: number | null;
  irrPercent: number | null;
  evidenceReference: string | null;
  financialsMasked: boolean;
  canMutate: boolean;
  version: number;
  nextAction: string;
};

export type ExpansionFeasibilityDashboard = {
  canViewFinancialEstimates: boolean;
  projectCount: number;
  modelCount: number;
  openModelCount: number;
  reviewModelCount: number;
  approvedModelCount: number;
  exceptionCount: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    siteName: string;
    canMutate: boolean;
  }>;
  rows: ExpansionFeasibilityRow[];
};

export type ExpansionCapexProcurementRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  brandName: string;
  siteName: string;
  title: string;
  packageType: string;
  costCategory: string;
  status: string;
  priority: string;
  ownerName: string;
  dueDate: string | null;
  isOverdue: boolean;
  budgetEstimate: number | null;
  committedReferenceAmount: number | null;
  actualReferenceAmount: number | null;
  varianceReferenceAmount: number | null;
  sourceReference: string | null;
  responsibleParty: string | null;
  evidenceReference: string | null;
  financialsMasked: boolean;
  canMutate: boolean;
  version: number;
  nextAction: string;
};

export type ExpansionCapexProcurementDashboard = {
  canViewFinancialEstimates: boolean;
  projectCount: number;
  itemCount: number;
  openItemCount: number;
  reviewItemCount: number;
  overBudgetReferenceCount: number;
  evidenceMissingCount: number;
  completedItemCount: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    siteName: string;
    canMutate: boolean;
  }>;
  rows: ExpansionCapexProcurementRow[];
};

export type ExpansionPostOpeningReviewRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  brandName: string;
  siteName: string;
  title: string;
  reviewPeriod: string;
  status: string;
  priority: string;
  ownerName: string;
  dueDate: string | null;
  isOverdue: boolean;
  targetSales: number;
  actualSales: number;
  salesVariancePercent: number;
  targetFoodCostPercent: number;
  actualFoodCostPercent: number;
  targetLaborCostPercent: number;
  actualLaborCostPercent: number;
  guestCount: number;
  issueCount: number;
  stabilizationScore: number;
  sourceReference: string | null;
  evidenceReference: string | null;
  canMutate: boolean;
  version: number;
  nextAction: string;
};

export type ExpansionPostOpeningReviewDashboard = {
  projectCount: number;
  reviewCount: number;
  openReviewCount: number;
  performanceExceptionCount: number;
  evidenceMissingCount: number;
  completedReviewCount: number;
  averageStabilizationScore: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    siteName: string;
    canMutate: boolean;
  }>;
  rows: ExpansionPostOpeningReviewRow[];
};

export type ExpansionPermitDocumentRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  brandName: string;
  siteName: string;
  title: string;
  trackerType: string;
  authority: string | null;
  referenceNumber: string | null;
  status: string;
  priority: string;
  ownerName: string;
  dueDate: string | null;
  isOverdue: boolean;
  evidenceReference: string | null;
  attachmentCount: number;
  canMutate: boolean;
  version: number;
  nextAction: string;
};

export type ExpansionPermitDocumentDashboard = {
  projectCount: number;
  trackerCount: number;
  openTrackerCount: number;
  overdueTrackerCount: number;
  evidenceMissingCount: number;
  completedTrackerCount: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    siteName: string;
    canMutate: boolean;
  }>;
  rows: ExpansionPermitDocumentRow[];
};

export type ExpansionConstructionTaskRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  brandName: string;
  siteName: string;
  title: string;
  workstream: string;
  area: string | null;
  contractorName: string | null;
  status: string;
  priority: string;
  ownerName: string;
  dueDate: string | null;
  isOverdue: boolean;
  progressPercent: number;
  evidenceReference: string | null;
  attachmentCount: number;
  linkedRecordCount: number;
  canMutate: boolean;
  version: number;
  nextAction: string;
};

export type ExpansionConstructionBoardDashboard = {
  projectCount: number;
  taskCount: number;
  openTaskCount: number;
  blockedTaskCount: number;
  overdueTaskCount: number;
  completedTaskCount: number;
  averageProgressPercent: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    siteName: string;
    canMutate: boolean;
  }>;
  rows: ExpansionConstructionTaskRow[];
};

export type ExpansionOpeningReadinessRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  brandName: string;
  siteName: string;
  title: string;
  readinessArea: string;
  ownerName: string;
  status: string;
  priority: string;
  dueDate: string | null;
  isOverdue: boolean;
  checklistTotal: number;
  checklistCompleted: number;
  completionPercent: number;
  evidenceReference: string | null;
  canMutate: boolean;
  version: number;
  checklistItems: Array<{
    id: string;
    title: string;
    isCompleted: boolean;
    isRequired: boolean;
  }>;
  nextAction: string;
};

export type ExpansionOpeningReadinessDashboard = {
  projectCount: number;
  readinessCount: number;
  openReadinessCount: number;
  blockedReadinessCount: number;
  overdueReadinessCount: number;
  completedReadinessCount: number;
  averageCompletionPercent: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    siteName: string;
    canMutate: boolean;
  }>;
  rows: ExpansionOpeningReadinessRow[];
};

export type ExpansionPunchListRow = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  brandName: string;
  siteName: string;
  title: string;
  punchType: string;
  severity: string;
  area: string | null;
  responsibleParty: string | null;
  impactSummary: string;
  escalationOwner: string | null;
  independentReviewerName: string | null;
  status: string;
  priority: string;
  ownerName: string;
  dueDate: string | null;
  isOverdue: boolean;
  evidenceReference: string | null;
  closureEvidence: string | null;
  attachmentCount: number;
  linkedRecordCount: number;
  canMutate: boolean;
  requiresIndependentClosure: boolean;
  canClose: boolean;
  version: number;
  nextAction: string;
};

export type ExpansionPunchListDashboard = {
  projectCount: number;
  punchCount: number;
  openPunchCount: number;
  criticalPunchCount: number;
  overduePunchCount: number;
  completedPunchCount: number;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    siteName: string;
    canMutate: boolean;
    members: Array<{
      id: string;
      displayName: string;
    }>;
  }>;
  rows: ExpansionPunchListRow[];
};

export type ExpansionReportRollupRow = {
  reportId: string;
  reportName: string;
  sourceWorkspace: string;
  sourceHref: string;
  totalCount: number;
  openCount: number;
  exceptionCount: number;
  completedCount: number;
  health: "CLEAR" | "WATCH" | "AT_RISK";
  nextAction: string;
};

export type ExpansionReportRollups = {
  generatedAt: string;
  projectCount: number;
  exceptionCount: number;
  rollups: ExpansionReportRollupRow[];
};

const expansionGateMarker = "EXPANSION_LIFECYCLE_GATE";
const expansionFeasibilityMarker = "EXPANSION_FEASIBILITY_MODEL";
const expansionCapexProcurementMarker = "EXPANSION_CAPEX_PROCUREMENT_ITEM";
const expansionPostOpeningReviewMarker = "EXPANSION_POST_OPENING_REVIEW";
const expansionPermitDocumentMarker = "EXPANSION_PERMIT_DOCUMENT";
const expansionConstructionTaskMarker = "EXPANSION_CONSTRUCTION_TASK";
const expansionOpeningReadinessMarker = "EXPANSION_OPENING_READINESS";
const expansionPunchListMarker = "EXPANSION_PUNCH_LIST_ITEM";

export const expansionLifecycleGateControlMetadata = {
  decisionReference: "DEC-0036",
  policySource: "CONFIGURABLE_PILOT_BASELINE",
  reviewer: "PROJECT_SPONSOR",
  requiresExpectedVersion: true,
  requiresPriorGateAchievement: true,
  requiresAchievementReason: true,
  requiresEvidenceReference: true,
  forbidsOwnerOrCreatorSelfApproval: true
} as const;

const expansionLifecycleGateDefinitions = [
  {
    key: "SITE_EVALUATION",
    order: 1,
    title: "Site Evaluation",
    offsetDaysFromOpening: -180
  },
  {
    key: "INVESTMENT_APPROVAL",
    order: 2,
    title: "Business Case & Investment Approval",
    offsetDaysFromOpening: -150
  },
  {
    key: "LEASE_PERMITS",
    order: 3,
    title: "Lease, Legal & Permits",
    offsetDaysFromOpening: -120
  },
  {
    key: "DESIGN_TECHNICAL",
    order: 4,
    title: "Design, BOQ & Technical Planning",
    offsetDaysFromOpening: -90
  },
  {
    key: "PROCUREMENT_AWARD",
    order: 5,
    title: "Procurement & Contractor Award",
    offsetDaysFromOpening: -75
  },
  {
    key: "CONSTRUCTION_FIT_OUT",
    order: 6,
    title: "Construction / Fit-Out",
    offsetDaysFromOpening: -45
  },
  {
    key: "PRE_OPENING_READINESS",
    order: 7,
    title: "Pre-Opening Readiness",
    offsetDaysFromOpening: -14
  },
  {
    key: "OPENING_HANDOVER",
    order: 8,
    title: "Opening & Handover",
    offsetDaysFromOpening: 0
  },
  {
    key: "POST_OPENING_STABILIZATION",
    order: 9,
    title: "Post-Opening Stabilization",
    offsetDaysFromOpening: 30
  }
] as const;

const seedLifecycleGatesSchema = z.object({
  projectId: z.string().uuid()
});

const transitionExpansionGateSchema = z.object({
  milestoneId: z.string().uuid(),
  nextStatus: z.enum(["ACHIEVED", "CANCELLED"]),
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
  achievementReason: z.string().trim().max(1000).optional(),
  evidenceReference: z.string().trim().max(240).optional()
});

const feasibilityModelTypes = [
  "SITE_FEASIBILITY",
  "SALES_FORECAST",
  "RENT_REVIEW",
  "CAPEX_BUSINESS_CASE",
  "ROI_PAYBACK_REVIEW",
  "EXECUTIVE_DECISION"
] as const;

const createFeasibilityModelSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  modelType: z.enum(feasibilityModelTypes),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  projectedAnnualSales: z.coerce.number().min(0).default(0),
  rentToSalesPercent: z.coerce.number().min(0).max(100).default(0),
  capexEstimate: z.coerce.number().min(0).default(0),
  paybackMonths: z.coerce.number().min(0).max(240).default(0),
  roiPercent: z.coerce.number().min(-100).max(1000).default(0),
  npvEstimate: z.coerce.number().default(0),
  irrPercent: z.coerce.number().min(-100).max(1000).default(0),
  evidenceReference: z.string().trim().max(240).optional(),
  assumptions: z.string().trim().min(5).max(1600)
});

const transitionFeasibilityModelSchema = z.object({
  taskId: z.string().uuid(),
  nextStatus: z.enum([
    "PLANNED",
    "IN_PROGRESS",
    "WAITING_FOR_APPROVAL",
    "BLOCKED",
    "FOR_REVIEW",
    "COMPLETED",
    "CANCELLED"
  ]),
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
  completionNote: z.string().trim().max(1000).optional()
});

const capexProcurementPackageTypes = [
  "CAPEX_BUDGET",
  "BOQ_PACKAGE",
  "EQUIPMENT_PACKAGE",
  "CONTRACTOR_AWARD",
  "SUPPLIER_PROCUREMENT",
  "IT_SYSTEMS",
  "SIGNAGE_FURNITURE",
  "CONTINGENCY"
] as const;

const capexProcurementCostCategories = [
  "FIT_OUT",
  "KITCHEN_EQUIPMENT",
  "FURNITURE_FIXTURES",
  "IT_POS",
  "SIGNAGE",
  "PERMITS_LEGAL",
  "PRE_OPENING",
  "CONTINGENCY",
  "OTHER"
] as const;

const createCapexProcurementItemSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  packageType: z.enum(capexProcurementPackageTypes),
  costCategory: z.enum(capexProcurementCostCategories),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  budgetEstimate: z.coerce.number().min(0).default(0),
  committedReferenceAmount: z.coerce.number().min(0).default(0),
  actualReferenceAmount: z.coerce.number().min(0).default(0),
  sourceReference: z.string().trim().max(180).optional(),
  responsibleParty: z.string().trim().max(160).optional(),
  evidenceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1200).optional()
});

const transitionCapexProcurementItemSchema = z.object({
  taskId: z.string().uuid(),
  nextStatus: z.enum([
    "PLANNED",
    "IN_PROGRESS",
    "WAITING_FOR_APPROVAL",
    "BLOCKED",
    "FOR_REVIEW",
    "COMPLETED",
    "CANCELLED"
  ]),
  expectedVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(1000).optional(),
  completionNote: z.string().trim().max(1000).optional()
});

const postOpeningReviewPeriods = [
  "DAY_30",
  "DAY_60",
  "DAY_90",
  "FINAL_STABILIZATION"
] as const;

const createPostOpeningReviewSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  reviewPeriod: z.enum(postOpeningReviewPeriods),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  targetSales: z.coerce.number().min(0).default(0),
  actualSales: z.coerce.number().min(0).default(0),
  targetFoodCostPercent: z.coerce.number().min(0).max(100).default(0),
  actualFoodCostPercent: z.coerce.number().min(0).max(100).default(0),
  targetLaborCostPercent: z.coerce.number().min(0).max(100).default(0),
  actualLaborCostPercent: z.coerce.number().min(0).max(100).default(0),
  guestCount: z.coerce.number().int().min(0).default(0),
  issueCount: z.coerce.number().int().min(0).default(0),
  stabilizationScore: z.coerce.number().int().min(0).max(100).default(0),
  sourceReference: z.string().trim().max(180).optional(),
  evidenceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1600).optional()
});

const transitionPostOpeningReviewSchema = z.object({
  taskId: z.string().uuid(),
  nextStatus: z.enum([
    "PLANNED",
    "IN_PROGRESS",
    "WAITING_FOR_APPROVAL",
    "BLOCKED",
    "FOR_REVIEW",
    "COMPLETED",
    "CANCELLED"
  ]),
  expectedVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(1000).optional(),
  completionNote: z.string().trim().max(1000).optional()
});

const permitDocumentTypes = [
  "PERMIT",
  "LEASE_DOCUMENT",
  "MALL_REQUIREMENT",
  "DESIGN_DOCUMENT",
  "CONTRACT_REFERENCE",
  "INSPECTION",
  "CERTIFICATION",
  "COMPLIANCE_REQUIREMENT"
] as const;

const createPermitDocumentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  trackerType: z.enum(permitDocumentTypes),
  authority: z.string().trim().max(120).optional(),
  referenceNumber: z.string().trim().max(120).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  evidenceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1200).optional()
});

const transitionPermitDocumentSchema = z.object({
  taskId: z.string().uuid(),
  nextStatus: z.enum([
    "PLANNED",
    "IN_PROGRESS",
    "WAITING_FOR_APPROVAL",
    "BLOCKED",
    "FOR_REVIEW",
    "COMPLETED",
    "CANCELLED"
  ]),
  expectedVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(1000).optional(),
  completionNote: z.string().trim().max(1000).optional()
});

const constructionWorkstreams = [
  "SITE_PREPARATION",
  "CIVIL_WORKS",
  "MEP",
  "KITCHEN_EQUIPMENT",
  "IT_SYSTEMS",
  "SIGNAGE",
  "DESIGN_COORDINATION",
  "INSPECTION",
  "TURNOVER"
] as const;

const createConstructionTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  workstream: z.enum(constructionWorkstreams),
  area: z.string().trim().max(120).optional(),
  contractorName: z.string().trim().max(160).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  progressPercent: z.coerce.number().int().min(0).max(100).default(0),
  evidenceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1200).optional()
});

const recordConstructionProgressSchema = z.object({
  taskId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  progressPercent: z.coerce.number().int().min(0).max(100),
  evidenceReference: z.string().trim().min(5).max(240),
  progressNote: z.string().trim().min(5).max(1000)
});

const transitionConstructionTaskSchema = z.object({
  taskId: z.string().uuid(),
  nextStatus: z.enum([
    "PLANNED",
    "IN_PROGRESS",
    "WAITING_FOR_APPROVAL",
    "BLOCKED",
    "FOR_REVIEW",
    "COMPLETED",
    "CANCELLED"
  ]),
  expectedVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(1000).optional(),
  completionNote: z.string().trim().max(1000).optional()
});

const openingReadinessAreas = [
  "OPERATIONS",
  "HR_STAFFING",
  "TRAINING",
  "IT_SYSTEMS",
  "MARKETING",
  "PERMITS",
  "INVENTORY_STOCK",
  "EQUIPMENT",
  "FINANCE_CASH",
  "COMPLIANCE_SAFETY"
] as const;

const createOpeningReadinessSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  readinessArea: z.enum(openingReadinessAreas),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  evidenceReference: z.string().trim().max(240).optional(),
  checklistText: z.string().trim().max(3000).optional(),
  notes: z.string().trim().max(1200).optional()
});

const transitionOpeningReadinessSchema = z.object({
  taskId: z.string().uuid(),
  nextStatus: z.enum([
    "PLANNED",
    "IN_PROGRESS",
    "WAITING_FOR_APPROVAL",
    "BLOCKED",
    "FOR_REVIEW",
    "COMPLETED",
    "CANCELLED"
  ]),
  expectedVersion: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().max(1000).optional(),
  completionNote: z.string().trim().max(1000).optional()
});

const toggleOpeningReadinessChecklistSchema = z.object({
  checklistItemId: z.string().uuid(),
  isCompleted: z.coerce.boolean().default(false)
});

const punchListTypes = [
  "DEFECT",
  "SNAG",
  "RECTIFICATION",
  "INSPECTION_FINDING",
  "SAFETY_FINDING",
  "HANDOVER_EXCEPTION",
  "WARRANTY_FOLLOW_UP"
] as const;

const punchListSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const createPunchListItemSchema = z.object({
  projectId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  punchType: z.enum(punchListTypes),
  severity: z.enum(punchListSeverities).default("MEDIUM"),
  area: z.string().trim().max(120).optional(),
  responsibleParty: z.string().trim().max(160).optional(),
  impactSummary: z.string().trim().min(5).max(1000),
  escalationOwner: z.string().trim().max(160).optional(),
  independentReviewerUserId: z.string().uuid().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  evidenceReference: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1200).optional()
});

const transitionPunchListItemSchema = z.object({
  taskId: z.string().uuid(),
  nextStatus: z.enum([
    "PLANNED",
    "IN_PROGRESS",
    "WAITING_FOR_APPROVAL",
    "BLOCKED",
    "FOR_REVIEW",
    "COMPLETED",
    "CANCELLED"
  ]),
  expectedVersion: z.coerce.number().int().positive(),
  reason: z.string().trim().max(1000).optional(),
  completionNote: z.string().trim().max(1000).optional(),
  severity: z.enum(punchListSeverities).default("MEDIUM")
});

function assertExpansionAccess(session: SessionContext) {
  if (!canUseProjects(session.permissionCodes)) {
    throw new Error("PERMISSION_DENIED");
  }
}

export function isExpansionProjectType(projectType: string) {
  return expansionProjectTypeSet.has(projectType.toUpperCase());
}

function addUtcDays(value: Date, days: number) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate() + days
    )
  );
}

function expansionNotificationProject(project: {
  id: string;
  tenantId: string;
  companyId: string;
  locationId: string | null;
  code: string;
  name: string;
  isRestricted: boolean;
  managerUserId: string;
  sponsorUserId: string;
}) {
  return {
    id: project.id,
    tenantId: project.tenantId,
    companyId: project.companyId,
    locationId: project.locationId,
    code: project.code,
    name: project.name,
    isRestricted: project.isRestricted,
    managerUserId: project.managerUserId,
    sponsorUserId: project.sponsorUserId
  };
}

function gateDescription(input: {
  gateKey: string;
  gateOrder: number;
  title: string;
}) {
  return `${expansionGateMarker}:${input.gateKey}:${input.gateOrder} - ${input.title}`;
}

function permitDocumentDescription(input: {
  trackerType: (typeof permitDocumentTypes)[number];
  authority?: string | null | undefined;
  referenceNumber?: string | null | undefined;
  evidenceReference?: string | null | undefined;
  notes?: string | null | undefined;
}) {
  return `${expansionPermitDocumentMarker}:${JSON.stringify({
    trackerType: input.trackerType,
    authority: input.authority || null,
    referenceNumber: input.referenceNumber || null,
    evidenceReference: input.evidenceReference || null
  })}\n${input.notes || ""}`;
}

function parsePermitDocumentDescription(description: string | null) {
  if (!description?.startsWith(`${expansionPermitDocumentMarker}:`)) {
    return null;
  }
  const firstLine = description.split("\n")[0] ?? "";
  const jsonText = firstLine.slice(`${expansionPermitDocumentMarker}:`.length);
  try {
    const parsed = z
      .object({
        trackerType: z.enum(permitDocumentTypes).catch("PERMIT"),
        authority: z.string().nullable().optional(),
        referenceNumber: z.string().nullable().optional(),
        evidenceReference: z.string().nullable().optional()
      })
      .parse(JSON.parse(jsonText));
    return parsed;
  } catch {
    return null;
  }
}

function constructionTaskDescription(input: {
  workstream: (typeof constructionWorkstreams)[number];
  area?: string | null | undefined;
  contractorName?: string | null | undefined;
  progressPercent?: number | null | undefined;
  evidenceReference?: string | null | undefined;
  notes?: string | null | undefined;
}) {
  return `${expansionConstructionTaskMarker}:${JSON.stringify({
    workstream: input.workstream,
    area: input.area || null,
    contractorName: input.contractorName || null,
    progressPercent: input.progressPercent ?? 0,
    evidenceReference: input.evidenceReference || null
  })}\n${input.notes || ""}`;
}

function parseConstructionTaskDescription(description: string | null) {
  if (!description?.startsWith(`${expansionConstructionTaskMarker}:`)) {
    return null;
  }
  const firstLine = description.split("\n")[0] ?? "";
  const jsonText = firstLine.slice(`${expansionConstructionTaskMarker}:`.length);
  try {
    return z
      .object({
        workstream: z.enum(constructionWorkstreams).catch("SITE_PREPARATION"),
        area: z.string().nullable().optional(),
        contractorName: z.string().nullable().optional(),
        progressPercent: z.coerce.number().int().min(0).max(100).catch(0),
        evidenceReference: z.string().nullable().optional()
      })
      .parse(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function openingReadinessDescription(input: {
  readinessArea: (typeof openingReadinessAreas)[number];
  evidenceReference?: string | null | undefined;
  notes?: string | null | undefined;
}) {
  return `${expansionOpeningReadinessMarker}:${JSON.stringify({
    readinessArea: input.readinessArea,
    evidenceReference: input.evidenceReference || null
  })}\n${input.notes || ""}`;
}

function parseOpeningReadinessDescription(description: string | null) {
  if (!description?.startsWith(`${expansionOpeningReadinessMarker}:`)) {
    return null;
  }
  const firstLine = description.split("\n")[0] ?? "";
  const jsonText = firstLine.slice(`${expansionOpeningReadinessMarker}:`.length);
  try {
    return z
      .object({
        readinessArea: z.enum(openingReadinessAreas).catch("OPERATIONS"),
        evidenceReference: z.string().nullable().optional()
      })
      .parse(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function feasibilityModelDescription(input: {
  modelType: (typeof feasibilityModelTypes)[number];
  projectedAnnualSales: number;
  rentToSalesPercent: number;
  capexEstimate: number;
  paybackMonths: number;
  roiPercent: number;
  npvEstimate: number;
  irrPercent: number;
  evidenceReference?: string | null | undefined;
  assumptions: string;
}) {
  return `${expansionFeasibilityMarker}:${JSON.stringify({
    modelType: input.modelType,
    projectedAnnualSales: input.projectedAnnualSales,
    rentToSalesPercent: input.rentToSalesPercent,
    capexEstimate: input.capexEstimate,
    paybackMonths: input.paybackMonths,
    roiPercent: input.roiPercent,
    npvEstimate: input.npvEstimate,
    irrPercent: input.irrPercent,
    evidenceReference: input.evidenceReference || null
  })}\n${input.assumptions}`;
}

function parseFeasibilityModelDescription(description: string | null) {
  if (!description?.startsWith(`${expansionFeasibilityMarker}:`)) {
    return null;
  }
  const firstLine = description.split("\n")[0] ?? "";
  const jsonText = firstLine.slice(`${expansionFeasibilityMarker}:`.length);
  try {
    return z
      .object({
        modelType: z.enum(feasibilityModelTypes).catch("SITE_FEASIBILITY"),
        projectedAnnualSales: z.coerce.number().min(0).catch(0),
        rentToSalesPercent: z.coerce.number().min(0).max(100).catch(0),
        capexEstimate: z.coerce.number().min(0).catch(0),
        paybackMonths: z.coerce.number().min(0).max(240).catch(0),
        roiPercent: z.coerce.number().catch(0),
        npvEstimate: z.coerce.number().catch(0),
        irrPercent: z.coerce.number().catch(0),
        evidenceReference: z.string().nullable().optional()
      })
      .parse(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function capexProcurementDescription(input: {
  packageType: (typeof capexProcurementPackageTypes)[number];
  costCategory: (typeof capexProcurementCostCategories)[number];
  budgetEstimate: number;
  committedReferenceAmount: number;
  actualReferenceAmount: number;
  sourceReference?: string | null | undefined;
  responsibleParty?: string | null | undefined;
  evidenceReference?: string | null | undefined;
  notes?: string | null | undefined;
}) {
  return `${expansionCapexProcurementMarker}:${JSON.stringify({
    packageType: input.packageType,
    costCategory: input.costCategory,
    budgetEstimate: input.budgetEstimate,
    committedReferenceAmount: input.committedReferenceAmount,
    actualReferenceAmount: input.actualReferenceAmount,
    sourceReference: input.sourceReference || null,
    responsibleParty: input.responsibleParty || null,
    evidenceReference: input.evidenceReference || null
  })}\n${input.notes || ""}`;
}

function parseCapexProcurementDescription(description: string | null) {
  if (!description?.startsWith(`${expansionCapexProcurementMarker}:`)) {
    return null;
  }
  const firstLine = description.split("\n")[0] ?? "";
  const jsonText = firstLine.slice(
    `${expansionCapexProcurementMarker}:`.length
  );
  try {
    return z
      .object({
        packageType: z
          .enum(capexProcurementPackageTypes)
          .catch("CAPEX_BUDGET"),
        costCategory: z
          .enum(capexProcurementCostCategories)
          .catch("OTHER"),
        budgetEstimate: z.coerce.number().min(0).catch(0),
        committedReferenceAmount: z.coerce.number().min(0).catch(0),
        actualReferenceAmount: z.coerce.number().min(0).catch(0),
        sourceReference: z.string().nullable().optional(),
        responsibleParty: z.string().nullable().optional(),
        evidenceReference: z.string().nullable().optional()
      })
      .parse(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function postOpeningReviewDescription(input: {
  reviewPeriod: (typeof postOpeningReviewPeriods)[number];
  targetSales: number;
  actualSales: number;
  targetFoodCostPercent: number;
  actualFoodCostPercent: number;
  targetLaborCostPercent: number;
  actualLaborCostPercent: number;
  guestCount: number;
  issueCount: number;
  stabilizationScore: number;
  sourceReference?: string | null | undefined;
  evidenceReference?: string | null | undefined;
  notes?: string | null | undefined;
}) {
  return `${expansionPostOpeningReviewMarker}:${JSON.stringify({
    reviewPeriod: input.reviewPeriod,
    targetSales: input.targetSales,
    actualSales: input.actualSales,
    targetFoodCostPercent: input.targetFoodCostPercent,
    actualFoodCostPercent: input.actualFoodCostPercent,
    targetLaborCostPercent: input.targetLaborCostPercent,
    actualLaborCostPercent: input.actualLaborCostPercent,
    guestCount: input.guestCount,
    issueCount: input.issueCount,
    stabilizationScore: input.stabilizationScore,
    sourceReference: input.sourceReference || null,
    evidenceReference: input.evidenceReference || null
  })}\n${input.notes || ""}`;
}

function parsePostOpeningReviewDescription(description: string | null) {
  if (!description?.startsWith(`${expansionPostOpeningReviewMarker}:`)) {
    return null;
  }
  const firstLine = description.split("\n")[0] ?? "";
  const jsonText = firstLine.slice(
    `${expansionPostOpeningReviewMarker}:`.length
  );
  try {
    return z
      .object({
        reviewPeriod: z.enum(postOpeningReviewPeriods).catch("DAY_30"),
        targetSales: z.coerce.number().min(0).catch(0),
        actualSales: z.coerce.number().min(0).catch(0),
        targetFoodCostPercent: z.coerce.number().min(0).max(100).catch(0),
        actualFoodCostPercent: z.coerce.number().min(0).max(100).catch(0),
        targetLaborCostPercent: z.coerce.number().min(0).max(100).catch(0),
        actualLaborCostPercent: z.coerce.number().min(0).max(100).catch(0),
        guestCount: z.coerce.number().int().min(0).catch(0),
        issueCount: z.coerce.number().int().min(0).catch(0),
        stabilizationScore: z.coerce.number().int().min(0).max(100).catch(0),
        sourceReference: z.string().nullable().optional(),
        evidenceReference: z.string().nullable().optional()
      })
      .parse(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function punchListDescription(input: {
  punchType: (typeof punchListTypes)[number];
  severity: (typeof punchListSeverities)[number];
  area?: string | null | undefined;
  responsibleParty?: string | null | undefined;
  impactSummary: string;
  escalationOwner?: string | null | undefined;
  independentReviewerUserId?: string | null | undefined;
  evidenceReference?: string | null | undefined;
  notes?: string | null | undefined;
}) {
  return `${expansionPunchListMarker}:${JSON.stringify({
    punchType: input.punchType,
    severity: input.severity,
    area: input.area || null,
    responsibleParty: input.responsibleParty || null,
    impactSummary: input.impactSummary,
    escalationOwner: input.escalationOwner || null,
    independentReviewerUserId: input.independentReviewerUserId || null,
    evidenceReference: input.evidenceReference || null
  })}\n${input.notes || ""}`;
}

function parsePunchListDescription(description: string | null) {
  if (!description?.startsWith(`${expansionPunchListMarker}:`)) {
    return null;
  }
  const firstLine = description.split("\n")[0] ?? "";
  const jsonText = firstLine.slice(`${expansionPunchListMarker}:`.length);
  try {
    return z
      .object({
        punchType: z.enum(punchListTypes).catch("DEFECT"),
        severity: z.enum(punchListSeverities).catch("MEDIUM"),
        area: z.string().nullable().optional(),
        responsibleParty: z.string().nullable().optional(),
        impactSummary: z.string().catch("Impact not recorded"),
        escalationOwner: z.string().nullable().optional(),
        independentReviewerUserId: z.string().uuid().nullable().optional(),
        evidenceReference: z.string().nullable().optional()
      })
      .parse(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

function parseChecklistText(value: string | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function extractGateKey(description: string | null) {
  const match = description?.match(/EXPANSION_LIFECYCLE_GATE:([A-Z_]+):/);
  if (match?.[1]) {
    return match[1];
  }
  return undefined;
}

function effectiveGateMilestones<T extends { description: string | null; createdAt: Date }>(
  milestones: T[]
) {
  const effective = new Map<string, T>();
  for (const milestone of milestones) {
    const key = extractGateKey(milestone.description);
    if (!key) {
      continue;
    }
    const current = effective.get(key);
    if (!current || milestone.createdAt.getTime() >= current.createdAt.getTime()) {
      effective.set(key, milestone);
    }
  }
  return effective;
}

function activityEvidenceReference(metadata: unknown) {
  const parsed = z
    .object({ evidenceReference: z.string().trim().min(1) })
    .safeParse(metadata);
  return parsed.success ? parsed.data.evidenceReference : null;
}

export function assertExpansionGateTransition(input: {
  canMutate: boolean;
  actorUserId: string;
  reviewerUserId: string;
  ownerUserId: string;
  createdByUserId: string;
  currentStatus: "PLANNED" | "ACHIEVED" | "CANCELLED";
  currentVersion: number;
  expectedVersion: number;
  nextStatus: "ACHIEVED" | "CANCELLED";
  priorGateStatuses: Array<"PLANNED" | "ACHIEVED" | "CANCELLED">;
  achievementReason?: string | null;
  evidenceReference?: string | null;
  cancellationReason?: string | null;
}) {
  if (!input.canMutate) {
    throw new Error("PROJECT_MILESTONE_PERMISSION_DENIED");
  }
  if (input.currentVersion !== input.expectedVersion) {
    throw new Error("PROJECT_MILESTONE_STALE_VERSION");
  }
  if (input.currentStatus !== "PLANNED") {
    throw new Error("EXPANSION_GATE_TRANSITION_NOT_ALLOWED");
  }
  if (input.nextStatus === "CANCELLED") {
    if (!input.cancellationReason || input.cancellationReason.trim().length < 5) {
      throw new Error("PROJECT_MILESTONE_CANCEL_REASON_REQUIRED");
    }
    return;
  }
  if (input.actorUserId !== input.reviewerUserId) {
    throw new Error("EXPANSION_GATE_REVIEWER_REQUIRED");
  }
  if (
    input.actorUserId === input.ownerUserId ||
    input.actorUserId === input.createdByUserId
  ) {
    throw new Error("EXPANSION_GATE_SELF_APPROVAL_NOT_ALLOWED");
  }
  if (input.priorGateStatuses.some((status) => status !== "ACHIEVED")) {
    throw new Error("EXPANSION_GATE_PRIOR_GATE_REQUIRED");
  }
  if (!input.evidenceReference || input.evidenceReference.trim().length < 5) {
    throw new Error("EXPANSION_GATE_EVIDENCE_REQUIRED");
  }
  if (!input.achievementReason || input.achievementReason.trim().length < 5) {
    throw new Error("EXPANSION_GATE_ACHIEVEMENT_REASON_REQUIRED");
  }
}

function defaultGateTargetDate(input: {
  projectTargetDate: Date | null;
  gateOffsetDays: number;
}) {
  const baseDate = input.projectTargetDate ?? new Date();
  return addUtcDays(baseDate, input.gateOffsetDays);
}

function scheduleState(input: {
  targetDate: Date | null;
  blockedTaskCount: number;
  overdueTaskCount: number;
  highRiskCount: number;
}) {
  if (!input.targetDate) {
    return "NO_DATE" as const;
  }
  if (input.blockedTaskCount > 0 || input.highRiskCount > 0) {
    return "AT_RISK" as const;
  }
  if (input.overdueTaskCount > 0) {
    return "WATCH" as const;
  }
  return "ON_TRACK" as const;
}

function isPunchListTask(task: {
  title: string;
  description: string | null;
  status: string;
}) {
  const haystack = `${task.title} ${task.description ?? ""}`.toUpperCase();
  return (
    task.status !== "COMPLETED" &&
    task.status !== "CANCELLED" &&
    (haystack.includes("PUNCH") ||
      haystack.includes("DEFECT") ||
      haystack.includes("RECTIFICATION") ||
      haystack.includes("SNAG"))
  );
}

function mapExpansionProject(
  project: Awaited<ReturnType<typeof queryExpansionProjects>>[number],
  asOf: Date
): ExpansionProjectRow {
  const activeTasks = project.tasks.filter(
    (task) => task.archivedAt === null && task.status !== "CANCELLED"
  );
  const completedTasks = activeTasks.filter((task) => task.status === "COMPLETED");
  const overdueTasks = activeTasks.filter((task) =>
    isProjectTaskOverdue({
      dueDate: task.dueDate,
      dueAt: task.dueAt,
      status: task.status,
      asOf
    })
  );
  const blockedTasks = activeTasks.filter(
    (task) => task.status === "BLOCKED" || task.isBlocked
  );
  const openRisks = project.risks.filter((risk) =>
    ["OPEN", "MITIGATING", "ACCEPTED", "REALIZED"].includes(risk.status)
  );
  const highRisks = openRisks.filter((risk) =>
    ["HIGH", "CRITICAL"].includes(risk.severity)
  );
  const nextMilestone =
    project.milestones.find((milestone) => milestone.status === "PLANNED") ?? null;
  const taskLinkedRecordCount = project.tasks.reduce(
    (total, task) => total + task.recordLinks.length,
    0
  );
  const taskCount = activeTasks.length;
  const completionPercent =
    taskCount === 0 ? 0 : Math.round((completedTasks.length / taskCount) * 100);
  const targetDate = project.targetEndDate ?? project.targetEndAt;

  return {
    id: project.id,
    version: project.version,
    code: project.code,
    name: project.name,
    description: project.description,
    status: project.status,
    projectType: project.projectType,
    brandName: project.brand?.name ?? "Company-wide",
    siteName: project.location?.name ?? "Proposed site",
    sponsorName: project.sponsor.displayName,
    managerName: project.manager.displayName,
    targetOpeningDate: dateOnlyString(targetDate),
    scheduleState: scheduleState({
      targetDate,
      blockedTaskCount: blockedTasks.length,
      overdueTaskCount: overdueTasks.length,
      highRiskCount: highRisks.length
    }),
    taskCount,
    completedTaskCount: completedTasks.length,
    completionPercent,
    overdueTaskCount: overdueTasks.length,
    blockedTaskCount: blockedTasks.length,
    openRiskCount: openRisks.length,
    highRiskCount: highRisks.length,
    openPunchListCount: activeTasks.filter(isPunchListTask).length,
    linkedRecordCount: project.recordLinks.length + taskLinkedRecordCount,
    nextMilestoneTitle: nextMilestone?.title ?? null,
    nextMilestoneDate: dateOnlyString(
      nextMilestone?.targetDate ?? nextMilestone?.targetAt ?? null
    ),
    isRestricted: project.isRestricted,
    createdAt: project.createdAt.toISOString()
  };
}

async function queryExpansionProjects(session: SessionContext) {
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return [];
  }

  const projects = await prisma.project.findMany({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      id: { in: access.projectIds },
      archivedAt: null
    },
    include: {
      brand: true,
      location: true,
      sponsor: true,
      manager: true,
      tasks: {
        where: { archivedAt: null },
        include: {
          recordLinks: {
            where: { archivedAt: null },
            select: { id: true }
          }
        }
      },
      milestones: {
        where: { archivedAt: null },
        orderBy: [{ targetDate: "asc" }, { targetAt: "asc" }]
      },
      risks: {
        where: { archivedAt: null }
      },
      recordLinks: {
        where: { archivedAt: null },
        select: { id: true }
      }
    },
    orderBy: [{ targetEndDate: "asc" }, { targetEndAt: "asc" }, { createdAt: "desc" }]
  });

  return projects.filter((project) => isExpansionProjectType(project.projectType));
}

export async function getExpansionDashboard(session: SessionContext) {
  assertExpansionAccess(session);
  const asOf = new Date();
  const projects = await queryExpansionProjects(session);
  const rows = projects.map((project) => mapExpansionProject(project, asOf));
  const recentActivity =
    rows.length === 0
      ? []
      : await prisma.projectActivityEvent.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            projectId: { in: rows.map((project) => project.id) }
          },
          include: {
            actor: true,
            project: true
          },
          orderBy: { occurredAt: "desc" },
          take: 8
        });

  return {
    projectCount: rows.length,
    activeProjectCount: rows.filter((project) => project.status === "ACTIVE").length,
    atRiskProjectCount: rows.filter((project) => project.scheduleState === "AT_RISK")
      .length,
    blockedTaskCount: rows.reduce((total, project) => total + project.blockedTaskCount, 0),
    overdueTaskCount: rows.reduce((total, project) => total + project.overdueTaskCount, 0),
    highRiskCount: rows.reduce((total, project) => total + project.highRiskCount, 0),
    openPunchListCount: rows.reduce(
      (total, project) => total + project.openPunchListCount,
      0
    ),
    linkedRecordCount: rows.reduce((total, project) => total + project.linkedRecordCount, 0),
    upcomingMilestoneCount: rows.filter((project) => project.nextMilestoneTitle).length,
    projects: rows,
    recentActivity: recentActivity.map((event) => ({
      id: event.id,
      projectId: event.projectId,
      projectName: event.project.name,
      eventType: event.eventType,
      actorName: event.actor.displayName,
      occurredAt: event.occurredAt.toISOString()
    }))
  } satisfies ExpansionDashboardSummary;
}

export async function listExpansionProjectActivity(
  session: SessionContext,
  projectId: string,
  pagination: { page?: number; pageSize?: number } = {}
) {
  assertExpansionAccess(session);
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const pageSize = Math.min(Math.max(pagination.pageSize ?? 10, 1), 100);
  const requestedPage = Math.max(pagination.page ?? 1, 1);
  const where = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    projectId
  };
  const [totalCount, events] = await Promise.all([
    prisma.projectActivityEvent.count({ where }),
    prisma.projectActivityEvent.findMany({
      where,
      include: { actor: true },
      orderBy: { occurredAt: "desc" },
      skip: (requestedPage - 1) * pageSize,
      take: pageSize
    })
  ]);

  return {
    totalCount,
    events: events.map((event) => {
    const before = asActivityRecord(event.beforeData);
    const after = asActivityRecord(event.afterData);
    const statusChange =
      typeof before.status === "string" && typeof after.status === "string"
        ? `${humanizeExpansionStatus(before.status)} to ${humanizeExpansionStatus(after.status)}`
        : null;
    return {
      id: event.id,
      eventType: event.eventType,
      actorName: event.actor.displayName,
      occurredAt: event.occurredAt.toISOString(),
      reason: event.reason ?? null,
      summary:
        statusChange ??
        (before.reviewerUserId !== after.reviewerUserId
          ? "Reviewer assignment updated"
          : "Controlled project activity recorded")
    };
    })
  };
}

function asActivityRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function humanizeExpansionStatus(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export async function listExpansionSitePipeline(
  session: SessionContext,
  filters: ExpansionSitePipelineFilters = {}
) {
  assertExpansionAccess(session);
  const query = filters.query?.trim().toUpperCase();
  const status = filters.status?.trim().toUpperCase();
  const rows = (await queryExpansionProjects(session)).map((project) =>
    mapExpansionProject(project, new Date())
  );

  return rows.filter((row) => {
    const matchesQuery = query
      ? [
          row.code,
          row.name,
          row.projectType,
          row.brandName,
          row.siteName,
          row.managerName,
          row.sponsorName
        ]
          .join(" ")
          .toUpperCase()
          .includes(query)
      : true;
    const matchesStatus = status ? row.status === status : true;
    return matchesQuery && matchesStatus;
  });
}

export async function getExpansionCreateOptions(
  session: SessionContext
): Promise<ExpansionCreateOptions> {
  assertExpansionAccess(session);
  const hasCreatePermission = session.permissionCodes.includes(permissions.projectCreate);
  const scopes = hasCreatePermission ? await getActiveProjectScopes(session) : [];
  const hasCompanyManage = hasCompanyManageScope(
    scopes,
    session.context.companyId
  );
  const authorizedLocationIds = hasCompanyManage
    ? []
    : scopes
        .filter(
          (scope) =>
            scope.scopeType === "LOCATION" &&
            ["OPERATE", "MANAGE"].includes(scope.accessLevel)
        )
        .map((scope) => scope.scopeId);
  const canCreateProject =
    hasCreatePermission && (hasCompanyManage || authorizedLocationIds.length > 0);
  const [locations, templates, leadershipUsers] = await Promise.all([
    prisma.location.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE",
        ...(hasCompanyManage ? {} : { id: { in: authorizedLocationIds } })
      },
      select: {
        id: true,
        name: true,
        locationType: true
      },
      orderBy: [{ locationType: "asc" }, { name: "asc" }]
    }),
    canCreateProject
      ? prisma.projectTemplate.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "PUBLISHED"
          },
          select: {
            id: true,
            code: true,
            name: true,
            projectType: true
          },
          orderBy: [{ projectType: "asc" }, { name: "asc" }]
        })
      : Promise.resolve([]),
    canCreateProject
      ? prisma.user.findMany({
          where: {
            tenantId: session.context.tenantId,
            status: "ACTIVE",
            roleAssignments: {
              some: {
                status: "ACTIVE",
                role: {
                  status: "ACTIVE",
                  permissions: {
                    some: { permission: { code: permissions.projectView } }
                  }
                }
              }
            }
          },
          select: { id: true, displayName: true, email: true },
          orderBy: { displayName: "asc" }
        })
      : Promise.resolve([])
  ]);

  return {
    projectTypes: expansionProjectTypes,
    locations,
    templates: templates.filter((template) =>
      isExpansionProjectType(template.projectType)
    ),
    leadershipUsers,
    canCreateProject
  };
}

export async function getExpansionLifecycleGates(
  session: SessionContext
): Promise<ExpansionLifecycleGateDashboard> {
  assertExpansionAccess(session);
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      projectCount: 0,
      gateCount: 0,
      achievedGateCount: 0,
      atRiskGateCount: 0,
      missingGateCount: 0,
      projects: [],
      gates: []
    };
  }

  const projects = (
    await prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        brand: true,
        location: true,
        sponsor: true,
        manager: true,
        milestones: {
          where: { archivedAt: null },
          include: { owner: true },
          orderBy: [{ targetDate: "asc" }, { targetAt: "asc" }]
        },
        activityEvents: {
          where: {
            entityType: "ProjectMilestone",
            eventType: "expansion_lifecycle_gate.achieved"
          },
          orderBy: { occurredAt: "desc" }
        }
      },
      orderBy: [{ targetEndDate: "asc" }, { createdAt: "desc" }]
    })
  ).filter((project) => isExpansionProjectType(project.projectType));

  const gates = projects.flatMap((project): ExpansionLifecycleGateRow[] => {
    const gateMilestones = effectiveGateMilestones(project.milestones);
    const canMutate = access.canMutateByProjectId.get(project.id) ?? false;

    return expansionLifecycleGateDefinitions.map((definition) => {
      const milestone = gateMilestones.get(definition.key);
      const status = milestone?.status ?? "NOT_CREATED";
      const achievementEvent = milestone
        ? project.activityEvents.find((event) => event.entityId === milestone.id)
        : undefined;
      const evidenceReference = activityEvidenceReference(
        achievementEvent?.metadata
      );
      const priorGatesAchieved = expansionLifecycleGateDefinitions
        .filter((candidate) => candidate.order < definition.order)
        .every(
          (candidate) => gateMilestones.get(candidate.key)?.status === "ACHIEVED"
        );
      const isReviewer = session.user.id === project.sponsorUserId;
      const isOwnerOrCreator = Boolean(
        milestone &&
          (session.user.id === milestone.ownerUserId ||
            session.user.id === milestone.createdByUserId)
      );
      const canAchieve = Boolean(
        canMutate &&
          milestone &&
          status === "PLANNED" &&
          priorGatesAchieved &&
          isReviewer &&
          !isOwnerOrCreator
      );
      const canCancel = Boolean(canMutate && milestone && status === "PLANNED");
      const actionDeniedReason =
        status !== "PLANNED"
          ? status === "NOT_CREATED"
            ? canMutate
              ? null
              : "Read only: project milestone management is not assigned to you."
            : "No action: this gate is already closed."
          : !canMutate
            ? "Read only: project milestone management is not assigned to you."
            : !priorGatesAchieved
              ? "Blocked: achieve every prior lifecycle gate first."
              : !isReviewer
                ? `Review required from project sponsor ${project.sponsor.displayName}.`
                : isOwnerOrCreator
                  ? "Denied: the gate owner or creator cannot approve their own gate."
                  : null;
      return {
        gateKey: definition.key,
        gateOrder: definition.order,
        title: definition.title,
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        brandName: project.brand?.name ?? "Company-wide",
        siteName: project.location?.name ?? "Proposed site",
        status,
        targetDate: dateOnlyString(milestone?.targetDate ?? null),
        ownerName: milestone?.owner.displayName ?? null,
        isAtRisk: milestone?.isAtRisk ?? false,
        atRiskReason: milestone?.atRiskReason ?? null,
        milestoneId: milestone?.id ?? null,
        milestoneVersion: milestone?.version ?? null,
        canMutate,
        canAchieve,
        canCancel,
        actionDeniedReason,
        reviewerName: project.sponsor.displayName,
        evidenceReference,
        evidenceState:
          status === "ACHIEVED"
            ? evidenceReference && achievementEvent?.reason
              ? "RECORDED"
              : "MISSING"
            : status === "PLANNED" && milestone?.isAtRisk
              ? "MISSING"
              : "NOT_REQUIRED_YET",
        nextAction:
          status === "NOT_CREATED"
            ? "Generate lifecycle gate"
            : status === "PLANNED"
              ? canAchieve
                ? "Review evidence and approve gate achievement"
                : actionDeniedReason ?? "Await controlled gate review"
              : status === "ACHIEVED"
                ? "Monitor next gate"
                : "Review cancelled gate"
      };
    });
  });

  return {
    projectCount: projects.length,
    gateCount: gates.length,
    achievedGateCount: gates.filter((gate) => gate.status === "ACHIEVED").length,
    atRiskGateCount: gates.filter((gate) => gate.isAtRisk).length,
    missingGateCount: gates.filter((gate) => gate.status === "NOT_CREATED").length,
    projects: projects.map((project) => {
      const projectGates = gates.filter((gate) => gate.projectId === project.id);
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        siteName: project.location?.name ?? "Proposed site",
        targetOpeningDate: dateOnlyString(project.targetEndDate ?? project.targetEndAt),
        canMutate: access.canMutateByProjectId.get(project.id) ?? false,
        gateCount: projectGates.length,
        achievedGateCount: projectGates.filter((gate) => gate.status === "ACHIEVED")
          .length,
        atRiskGateCount: projectGates.filter((gate) => gate.isAtRisk).length
      };
    }),
    gates
  };
}

export async function seedExpansionLifecycleGates(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = seedLifecycleGatesSchema.parse({
    projectId: formData.get("projectId")
  });
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(values.projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (!access.canMutateByProjectId.get(values.projectId)) {
    throw new Error("PROJECT_MILESTONE_PERMISSION_DENIED");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      milestones: {
        where: { archivedAt: null }
      }
    }
  });
  if (!project || !isExpansionProjectType(project.projectType)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const existingGateKeys = new Set(
    project.milestones.flatMap((milestone) => {
      const gateKey = extractGateKey(milestone.description);
      return gateKey ? [gateKey] : [];
    })
  );
  const missingDefinitions = expansionLifecycleGateDefinitions.filter(
    (definition) => !existingGateKeys.has(definition.key)
  );
  if (missingDefinitions.length === 0) {
    return;
  }

  const projectTargetDate = project.targetEndDate ?? project.targetEndAt;
  await prisma.$transaction(async (tx) => {
    for (const definition of missingDefinitions) {
      const milestone = await tx.projectMilestone.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          projectId: project.id,
          title: definition.title,
          description: gateDescription({
            gateKey: definition.key,
            gateOrder: definition.order,
            title: definition.title
          }),
          targetDate: defaultGateTargetDate({
            projectTargetDate,
            gateOffsetDays: definition.offsetDaysFromOpening
          }),
          ownerUserId: project.managerUserId,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id
        }
      });

      await tx.projectActivityEvent.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          projectId: project.id,
          actorUserId: session.user.id,
          eventType: "expansion_lifecycle_gate.created",
          entityType: "ProjectMilestone",
          entityId: milestone.id,
          afterData: {
            gateKey: definition.key,
            gateOrder: definition.order,
            title: definition.title,
            targetDate: dateOnlyString(milestone.targetDate)
          },
          metadata: {
            source: "expansion-lifecycle-gates",
            sharedEngineEntity: "ProjectMilestone",
            control: expansionLifecycleGateControlMetadata
          }
        }
      });
    }
  });
}

export async function transitionExpansionLifecycleGate(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = transitionExpansionGateSchema.parse({
    milestoneId: formData.get("milestoneId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason") || undefined,
    achievementReason: formData.get("achievementReason") || undefined,
    evidenceReference: formData.get("evidenceReference") || undefined
  });
  const access = await listAuthorizedProjectAccess(session);

  await prisma.$transaction(async (tx) => {
    const milestone = await tx.projectMilestone.findFirst({
      where: {
        id: values.milestoneId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        archivedAt: null
      },
      include: {
        project: {
          include: {
            milestones: {
              where: { archivedAt: null }
            }
          }
        }
      }
    });
    const gateKey = extractGateKey(milestone?.description ?? null);
    const gateDefinition = expansionLifecycleGateDefinitions.find(
      (definition) => definition.key === gateKey
    );
    if (
      !milestone ||
      !gateDefinition ||
      !isExpansionProjectType(milestone.project.projectType) ||
      !access.projectIds.includes(milestone.projectId)
    ) {
      throw new Error("PROJECT_MILESTONE_NOT_FOUND");
    }

    const projectGateStatuses = new Map(
      Array.from(effectiveGateMilestones(milestone.project.milestones)).map(
        ([key, candidate]) => [key, candidate.status] as const
      )
    );
    const priorGateStatuses = expansionLifecycleGateDefinitions
      .filter((definition) => definition.order < gateDefinition.order)
      .map(
        (definition) => projectGateStatuses.get(definition.key) ?? "PLANNED"
      );

    assertExpansionGateTransition({
      canMutate: access.canMutateByProjectId.get(milestone.projectId) ?? false,
      actorUserId: session.user.id,
      reviewerUserId: milestone.project.sponsorUserId,
      ownerUserId: milestone.ownerUserId,
      createdByUserId: milestone.createdByUserId,
      currentStatus: milestone.status,
      currentVersion: milestone.version,
      expectedVersion: values.expectedVersion,
      nextStatus: values.nextStatus,
      priorGateStatuses,
      achievementReason: values.achievementReason ?? null,
      evidenceReference: values.evidenceReference ?? null,
      cancellationReason: values.reason ?? null
    });

    const now = new Date();
    const reason =
      values.nextStatus === "ACHIEVED"
        ? values.achievementReason ?? null
        : values.reason ?? null;
    const updated = await tx.projectMilestone.updateMany({
      where: {
        id: milestone.id,
        tenantId: milestone.tenantId,
        companyId: milestone.companyId,
        projectId: milestone.projectId,
        status: "PLANNED",
        version: values.expectedVersion
      },
      data: {
        status: values.nextStatus,
        achievedAt: values.nextStatus === "ACHIEVED" ? now : null,
        achievedByUserId:
          values.nextStatus === "ACHIEVED" ? session.user.id : null,
        cancelledAt: values.nextStatus === "CANCELLED" ? now : null,
        cancelledByUserId:
          values.nextStatus === "CANCELLED" ? session.user.id : null,
        cancelReason: values.nextStatus === "CANCELLED" ? reason : null,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_MILESTONE_STALE_VERSION");
    }

    const replacement =
      values.nextStatus === "CANCELLED"
        ? await tx.projectMilestone.create({
            data: {
              tenantId: milestone.tenantId,
              companyId: milestone.companyId,
              projectId: milestone.projectId,
              title: milestone.title,
              description: milestone.description,
              targetDate: milestone.targetDate,
              targetAt: milestone.targetAt,
              ownerUserId: milestone.ownerUserId,
              createdByUserId: session.user.id,
              updatedByUserId: session.user.id
            }
          })
        : null;

    await tx.projectActivityEvent.create({
      data: {
        tenantId: milestone.tenantId,
        companyId: milestone.companyId,
        projectId: milestone.projectId,
        actorUserId: session.user.id,
        eventType:
          values.nextStatus === "ACHIEVED"
            ? "expansion_lifecycle_gate.achieved"
            : "expansion_lifecycle_gate.cancelled",
        entityType: "ProjectMilestone",
        entityId: milestone.id,
        reason,
        beforeData: {
          gateKey,
          gateOrder: gateDefinition.order,
          status: milestone.status,
          version: milestone.version
        },
        afterData: {
          gateKey,
          gateOrder: gateDefinition.order,
          status: values.nextStatus,
          version: milestone.version + 1
        },
        metadata: {
          source: "expansion-lifecycle-gates",
          sharedEngineEntity: "ProjectMilestone",
          evidenceReference:
            values.nextStatus === "ACHIEVED"
              ? values.evidenceReference ?? null
              : null,
          control: expansionLifecycleGateControlMetadata,
          sourceBoundary:
            "coordination_only_no_capex_approval_no_payment_no_po_no_inventory_no_branch_mutation"
        }
      }
    });
    if (replacement) {
      await tx.projectActivityEvent.create({
        data: {
          tenantId: milestone.tenantId,
          companyId: milestone.companyId,
          projectId: milestone.projectId,
          actorUserId: session.user.id,
          eventType: "expansion_lifecycle_gate.reissued",
          entityType: "ProjectMilestone",
          entityId: replacement.id,
          reason,
          beforeData: { supersededMilestoneId: milestone.id, status: "CANCELLED" },
          afterData: { gateKey, status: "PLANNED", replacementMilestoneId: replacement.id },
          metadata: {
            source: "expansion-lifecycle-gates",
            reissuedFromMilestoneId: milestone.id,
            control: expansionLifecycleGateControlMetadata,
            sourceBoundary:
              "coordination_only_no_capex_approval_no_payment_no_po_no_inventory_no_branch_mutation"
          }
        }
      });
    }
  });
}

export async function getExpansionFeasibility(
  session: SessionContext
): Promise<ExpansionFeasibilityDashboard> {
  assertExpansionAccess(session);
  const canViewFinancialEstimates = canViewExpansionFinancialEstimates(session.permissionCodes);
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      canViewFinancialEstimates,
      projectCount: 0,
      modelCount: 0,
      openModelCount: 0,
      reviewModelCount: 0,
      approvedModelCount: 0,
      exceptionCount: 0,
      projects: [],
      rows: []
    };
  }

  const projects = (
    await prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        brand: true,
        location: true,
        members: {
          where: { status: "ACTIVE", user: { status: "ACTIVE" } },
          include: { user: true }
        },
        tasks: {
          where: {
            archivedAt: null,
            description: { startsWith: `${expansionFeasibilityMarker}:` }
          },
          include: { owner: true },
          orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
        }
      },
      orderBy: [{ targetEndDate: "asc" }, { createdAt: "desc" }]
    })
  ).filter((project) => isExpansionProjectType(project.projectType));

  const today = new Date().toISOString().slice(0, 10);
  const rows = projects.flatMap((project): ExpansionFeasibilityRow[] =>
    project.tasks.flatMap((task) => {
      const metadata = parseFeasibilityModelDescription(task.description);
      if (!metadata) {
        return [];
      }
      const dueDate = dateOnlyString(task.dueDate ?? task.dueAt);
      const isTerminal = task.status === "COMPLETED" || task.status === "CANCELLED";
      const isOverdue = Boolean(dueDate && dueDate < today && !isTerminal);

      return [
        {
          id: task.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          brandName: project.brand?.name ?? "Company-wide",
          siteName: project.location?.name ?? "Proposed site",
          title: task.title,
          modelType: metadata.modelType,
          status: task.status,
          priority: task.priority,
          ownerName: task.owner.displayName,
          dueDate,
          isOverdue,
          projectedAnnualSales: canViewFinancialEstimates ? metadata.projectedAnnualSales : null,
          rentToSalesPercent: canViewFinancialEstimates ? metadata.rentToSalesPercent : null,
          capexEstimate: canViewFinancialEstimates ? metadata.capexEstimate : null,
          paybackMonths: canViewFinancialEstimates ? metadata.paybackMonths : null,
          roiPercent: canViewFinancialEstimates ? metadata.roiPercent : null,
          npvEstimate: canViewFinancialEstimates ? metadata.npvEstimate : null,
          irrPercent: canViewFinancialEstimates ? metadata.irrPercent : null,
          evidenceReference: canViewFinancialEstimates ? metadata.evidenceReference ?? task.completionNote ?? null : null,
          financialsMasked: !canViewFinancialEstimates,
          canMutate: access.canMutateByProjectId.get(project.id) ?? false,
          version: task.version,
          nextAction:
            task.status === "COMPLETED"
              ? "Retain executive signoff evidence"
              : task.status === "CANCELLED"
                ? "Review cancellation"
                : task.status === "BLOCKED"
                  ? "Resolve blocker"
                  : task.status === "WAITING_FOR_APPROVAL" ||
                      task.status === "FOR_REVIEW"
                    ? "Review business case evidence"
                    : "Complete feasibility assumptions"
        }
      ];
    })
  );

  return {
    canViewFinancialEstimates,
    projectCount: projects.length,
    modelCount: rows.length,
    openModelCount: rows.filter(
      (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
    ).length,
    reviewModelCount: rows.filter((row) =>
      ["WAITING_FOR_APPROVAL", "FOR_REVIEW"].includes(row.status)
    ).length,
    approvedModelCount: rows.filter((row) => row.status === "COMPLETED").length,
    exceptionCount: rows.filter(
      (row) => row.isOverdue || row.status === "BLOCKED" || !row.evidenceReference
    ).length,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      siteName: project.location?.name ?? "Proposed site",
      canMutate: access.canMutateByProjectId.get(project.id) ?? false
    })),
    rows
  };
}

export async function createExpansionFeasibilityModel(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  if (!canViewExpansionFinancialEstimates(session.permissionCodes)) {
    throw new Error("EXPANSION_FINANCIAL_ESTIMATES_PERMISSION_DENIED");
  }
  const values = createFeasibilityModelSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    modelType: formData.get("modelType"),
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority") || "NORMAL",
    projectedAnnualSales: formData.get("projectedAnnualSales") || 0,
    rentToSalesPercent: formData.get("rentToSalesPercent") || 0,
    capexEstimate: formData.get("capexEstimate") || 0,
    paybackMonths: formData.get("paybackMonths") || 0,
    roiPercent: formData.get("roiPercent") || 0,
    npvEstimate: formData.get("npvEstimate") || 0,
    irrPercent: formData.get("irrPercent") || 0,
    evidenceReference: formData.get("evidenceReference") || undefined,
    assumptions: formData.get("assumptions")
  });
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(values.projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (!access.canMutateByProjectId.get(values.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    }
  });
  if (!project || !isExpansionProjectType(project.projectType)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const ownerMember =
    project.members.find((member) => member.userId === project.managerUserId) ??
    project.members.find((member) => member.userId === session.user.id) ??
    project.members[0];
  if (!ownerMember || ownerMember.user.status !== "ACTIVE") {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }

  const dueDate = new Date(`${values.dueDate}T00:00:00.000Z`);
  const createdTask = await prisma.$transaction(async (tx) => {
    const taskCount = await tx.projectTask.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id
      }
    });
    const task = await tx.projectTask.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskKey: `${project.code}-${String(taskCount + 1).padStart(3, "0")}`,
        title: values.title,
        description: feasibilityModelDescription(values),
        status: "PLANNED",
        priority: values.priority,
        ownerUserId: ownerMember.userId,
        dueAt: dueDate,
        dueDate,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskId: task.id,
        userId: ownerMember.userId,
        assignedByUserId: session.user.id
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "expansion_feasibility_model.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          title: task.title,
          modelType: values.modelType,
          projectedAnnualSales: values.projectedAnnualSales,
          rentToSalesPercent: values.rentToSalesPercent,
          capexEstimate: values.capexEstimate,
          paybackMonths: values.paybackMonths,
          roiPercent: values.roiPercent,
          npvEstimate: values.npvEstimate,
          irrPercent: values.irrPercent,
          dueDate: values.dueDate,
          status: task.status,
          priority: task.priority,
          ownerUserId: ownerMember.userId,
          evidenceReference: values.evidenceReference ?? null
        },
        metadata: {
          source: "expansion-feasibility",
          sharedEngineEntity: "ProjectTask",
          boundary:
            "coordination_only_no_capex_approval_no_payment_no_po_no_inventory_no_branch_mutation"
        }
      }
    });

    await notifyProjectTaskAssigned(tx, {
      project: expansionNotificationProject(project),
      task: {
        id: task.id,
        taskKey: task.taskKey,
        title: task.title,
        assigneeUserId: ownerMember.userId,
        actorUserId: session.user.id,
        priority: task.priority
      }
    });

    return task;
  });

  return createdTask.id;
}

export async function transitionExpansionFeasibilityModel(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = transitionFeasibilityModelSchema.parse({
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason") || undefined,
    completionNote: formData.get("completionNote") || undefined
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: { project: true }
  });
  if (
    !task ||
    !isExpansionProjectType(task.project.projectType) ||
    !parseFeasibilityModelDescription(task.description)
  ) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (
    values.nextStatus === "COMPLETED" &&
    (!values.completionNote || values.completionNote.trim().length < 5)
  ) {
    throw new Error("EXPANSION_FEASIBILITY_EVIDENCE_REQUIRED");
  }
  if (
    values.nextStatus === "CANCELLED" &&
    (!values.reason || values.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_CANCEL_REASON_REQUIRED");
  }

  await transitionProjectTask(formData);
}

export async function getExpansionCapexProcurement(
  session: SessionContext
): Promise<ExpansionCapexProcurementDashboard> {
  assertExpansionAccess(session);
  const canViewFinancialEstimates = canViewExpansionFinancialEstimates(session.permissionCodes);
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      canViewFinancialEstimates,
      projectCount: 0,
      itemCount: 0,
      openItemCount: 0,
      reviewItemCount: 0,
      overBudgetReferenceCount: 0,
      evidenceMissingCount: 0,
      completedItemCount: 0,
      projects: [],
      rows: []
    };
  }

  const projects = (
    await prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        brand: true,
        location: true,
        members: {
          where: { status: "ACTIVE", user: { status: "ACTIVE" } },
          include: { user: true }
        },
        tasks: {
          where: {
            archivedAt: null,
            description: { startsWith: `${expansionCapexProcurementMarker}:` }
          },
          include: { owner: true },
          orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
        }
      },
      orderBy: [{ targetEndDate: "asc" }, { createdAt: "desc" }]
    })
  ).filter((project) => isExpansionProjectType(project.projectType));

  const today = new Date().toISOString().slice(0, 10);
  const rows = projects.flatMap((project): ExpansionCapexProcurementRow[] =>
    project.tasks.flatMap((task) => {
      const metadata = parseCapexProcurementDescription(task.description);
      if (!metadata) {
        return [];
      }
      const dueDate = dateOnlyString(task.dueDate ?? task.dueAt);
      const isTerminal = task.status === "COMPLETED" || task.status === "CANCELLED";
      const isOverdue = Boolean(dueDate && dueDate < today && !isTerminal);
      const sourceAmount = Math.max(
        metadata.committedReferenceAmount,
        metadata.actualReferenceAmount
      );
      const varianceReferenceAmount = sourceAmount - metadata.budgetEstimate;
      const isOverBudget =
        metadata.budgetEstimate > 0 && varianceReferenceAmount > 0;

      return [
        {
          id: task.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          brandName: project.brand?.name ?? "Company-wide",
          siteName: project.location?.name ?? "Proposed site",
          title: task.title,
          packageType: metadata.packageType,
          costCategory: metadata.costCategory,
          status: task.status,
          priority: task.priority,
          ownerName: task.owner.displayName,
          dueDate,
          isOverdue,
          budgetEstimate: canViewFinancialEstimates ? metadata.budgetEstimate : null,
          committedReferenceAmount: canViewFinancialEstimates ? metadata.committedReferenceAmount : null,
          actualReferenceAmount: canViewFinancialEstimates ? metadata.actualReferenceAmount : null,
          varianceReferenceAmount: canViewFinancialEstimates ? varianceReferenceAmount : null,
          sourceReference: canViewFinancialEstimates ? metadata.sourceReference ?? null : null,
          responsibleParty: metadata.responsibleParty ?? null,
          evidenceReference: canViewFinancialEstimates ? metadata.evidenceReference ?? task.completionNote ?? null : null,
          financialsMasked: !canViewFinancialEstimates,
          canMutate: access.canMutateByProjectId.get(project.id) ?? false,
          version: task.version,
          nextAction:
            task.status === "COMPLETED"
              ? "Retain source evidence"
              : task.status === "CANCELLED"
                ? "Review cancellation"
                : task.status === "BLOCKED"
                  ? "Resolve budget or procurement blocker"
                  : canViewFinancialEstimates && isOverBudget
                    ? "Review source reference variance"
                    : !metadata.evidenceReference
                      ? "Record source reference evidence"
                      : "Track procurement package"
        }
      ];
    })
  );

  return {
    canViewFinancialEstimates,
    projectCount: projects.length,
    itemCount: rows.length,
    openItemCount: rows.filter(
      (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
    ).length,
    reviewItemCount: rows.filter((row) =>
      ["WAITING_FOR_APPROVAL", "FOR_REVIEW"].includes(row.status)
    ).length,
    overBudgetReferenceCount: canViewFinancialEstimates ? rows.filter(
      (row) =>
        (row.budgetEstimate ?? 0) > 0 &&
        Math.max(row.committedReferenceAmount ?? 0, row.actualReferenceAmount ?? 0) >
          (row.budgetEstimate ?? 0)
    ).length : 0,
    evidenceMissingCount: rows.filter((row) => !row.evidenceReference).length,
    completedItemCount: rows.filter((row) => row.status === "COMPLETED").length,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      siteName: project.location?.name ?? "Proposed site",
      canMutate: access.canMutateByProjectId.get(project.id) ?? false
    })),
    rows
  };
}

export async function createExpansionCapexProcurementItem(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  if (!canViewExpansionFinancialEstimates(session.permissionCodes)) {
    throw new Error("EXPANSION_FINANCIAL_ESTIMATES_PERMISSION_DENIED");
  }
  const values = createCapexProcurementItemSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    packageType: formData.get("packageType"),
    costCategory: formData.get("costCategory"),
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority") || "NORMAL",
    budgetEstimate: formData.get("budgetEstimate") || 0,
    committedReferenceAmount: formData.get("committedReferenceAmount") || 0,
    actualReferenceAmount: formData.get("actualReferenceAmount") || 0,
    sourceReference: formData.get("sourceReference") || undefined,
    responsibleParty: formData.get("responsibleParty") || undefined,
    evidenceReference: formData.get("evidenceReference") || undefined,
    notes: formData.get("notes") || undefined
  });
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(values.projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (!access.canMutateByProjectId.get(values.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    }
  });
  if (!project || !isExpansionProjectType(project.projectType)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const ownerMember =
    project.members.find((member) => member.userId === project.managerUserId) ??
    project.members.find((member) => member.userId === session.user.id) ??
    project.members[0];
  if (!ownerMember || ownerMember.user.status !== "ACTIVE") {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }

  const dueDate = new Date(`${values.dueDate}T00:00:00.000Z`);
  const createdTask = await prisma.$transaction(async (tx) => {
    const taskCount = await tx.projectTask.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id
      }
    });
    const task = await tx.projectTask.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskKey: `${project.code}-${String(taskCount + 1).padStart(3, "0")}`,
        title: values.title,
        description: capexProcurementDescription(values),
        status: "PLANNED",
        priority: values.priority,
        ownerUserId: ownerMember.userId,
        dueAt: dueDate,
        dueDate,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskId: task.id,
        userId: ownerMember.userId,
        assignedByUserId: session.user.id
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "expansion_capex_procurement.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          title: task.title,
          packageType: values.packageType,
          costCategory: values.costCategory,
          dueDate: values.dueDate,
          budgetEstimate: values.budgetEstimate,
          committedReferenceAmount: values.committedReferenceAmount,
          actualReferenceAmount: values.actualReferenceAmount,
          sourceReference: values.sourceReference ?? null,
          responsibleParty: values.responsibleParty ?? null,
          status: task.status,
          priority: task.priority,
          ownerUserId: ownerMember.userId,
          evidenceReference: values.evidenceReference ?? null
        },
        metadata: {
          source: "expansion-capex-procurement",
          sharedEngineEntity: "ProjectTask",
          boundary:
            "coordination_only_no_capex_approval_no_budget_mutation_no_payment_no_po_no_inventory_mutation"
        }
      }
    });

    await notifyProjectTaskAssigned(tx, {
      project: expansionNotificationProject(project),
      task: {
        id: task.id,
        taskKey: task.taskKey,
        title: task.title,
        assigneeUserId: ownerMember.userId,
        actorUserId: session.user.id,
        priority: task.priority
      }
    });

    return task;
  });

  return createdTask.id;
}

export async function transitionExpansionCapexProcurementItem(
  formData: FormData
) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = transitionCapexProcurementItemSchema.parse({
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason") || undefined,
    completionNote: formData.get("completionNote") || undefined
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: { project: true }
  });
  if (
    !task ||
    !isExpansionProjectType(task.project.projectType) ||
    !parseCapexProcurementDescription(task.description)
  ) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (
    values.nextStatus === "COMPLETED" &&
    (!values.completionNote || values.completionNote.trim().length < 5)
  ) {
    throw new Error("EXPANSION_CAPEX_PROCUREMENT_EVIDENCE_REQUIRED");
  }
  if (
    values.nextStatus === "CANCELLED" &&
    (!values.reason || values.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_CANCEL_REASON_REQUIRED");
  }

  await transitionProjectTask(formData);
}

export async function getExpansionPostOpeningReviews(
  session: SessionContext
): Promise<ExpansionPostOpeningReviewDashboard> {
  assertExpansionAccess(session);
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      projectCount: 0,
      reviewCount: 0,
      openReviewCount: 0,
      performanceExceptionCount: 0,
      evidenceMissingCount: 0,
      completedReviewCount: 0,
      averageStabilizationScore: 0,
      projects: [],
      rows: []
    };
  }

  const projects = (
    await prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        brand: true,
        location: true,
        tasks: {
          where: {
            archivedAt: null,
            description: { startsWith: `${expansionPostOpeningReviewMarker}:` }
          },
          include: { owner: true },
          orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
        }
      },
      orderBy: [{ targetEndDate: "asc" }, { createdAt: "desc" }]
    })
  ).filter((project) => isExpansionProjectType(project.projectType));

  const today = new Date().toISOString().slice(0, 10);
  const rows = projects.flatMap((project): ExpansionPostOpeningReviewRow[] =>
    project.tasks.flatMap((task) => {
      const metadata = parsePostOpeningReviewDescription(task.description);
      if (!metadata) {
        return [];
      }
      const dueDate = dateOnlyString(task.dueDate ?? task.dueAt);
      const isTerminal = task.status === "COMPLETED" || task.status === "CANCELLED";
      const isOverdue = Boolean(dueDate && dueDate < today && !isTerminal);
      const salesVariancePercent =
        metadata.targetSales > 0
          ? Math.round(
              ((metadata.actualSales - metadata.targetSales) /
                metadata.targetSales) *
                1000
            ) / 10
          : 0;
      const performanceException =
        salesVariancePercent < -5 ||
        metadata.actualFoodCostPercent > metadata.targetFoodCostPercent ||
        metadata.actualLaborCostPercent > metadata.targetLaborCostPercent ||
        metadata.stabilizationScore < 80;

      return [
        {
          id: task.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          brandName: project.brand?.name ?? "Company-wide",
          siteName: project.location?.name ?? "Proposed site",
          title: task.title,
          reviewPeriod: metadata.reviewPeriod,
          status: task.status,
          priority: task.priority,
          ownerName: task.owner.displayName,
          dueDate,
          isOverdue,
          targetSales: metadata.targetSales,
          actualSales: metadata.actualSales,
          salesVariancePercent,
          targetFoodCostPercent: metadata.targetFoodCostPercent,
          actualFoodCostPercent: metadata.actualFoodCostPercent,
          targetLaborCostPercent: metadata.targetLaborCostPercent,
          actualLaborCostPercent: metadata.actualLaborCostPercent,
          guestCount: metadata.guestCount,
          issueCount: metadata.issueCount,
          stabilizationScore: metadata.stabilizationScore,
          sourceReference: metadata.sourceReference ?? null,
          evidenceReference: metadata.evidenceReference ?? task.completionNote ?? null,
          canMutate: access.canMutateByProjectId.get(project.id) ?? false,
          version: task.version,
          nextAction:
            task.status === "COMPLETED"
              ? "Retain post-opening review evidence"
              : task.status === "CANCELLED"
                ? "Review cancellation"
                : task.status === "BLOCKED"
                  ? "Resolve stabilization blocker"
                  : performanceException
                    ? "Review operating variance"
                    : !metadata.evidenceReference
                      ? "Record review evidence"
                      : "Complete post-opening review"
        }
      ];
    })
  );
  const activeRows = rows.filter((row) => row.status !== "CANCELLED");
  const averageStabilizationScore =
    activeRows.length === 0
      ? 0
      : Math.round(
          activeRows.reduce((total, row) => total + row.stabilizationScore, 0) /
            activeRows.length
        );

  return {
    projectCount: projects.length,
    reviewCount: rows.length,
    openReviewCount: rows.filter(
      (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
    ).length,
    performanceExceptionCount: rows.filter(
      (row) =>
        row.isOverdue ||
        row.status === "BLOCKED" ||
        row.salesVariancePercent < -5 ||
        row.actualFoodCostPercent > row.targetFoodCostPercent ||
        row.actualLaborCostPercent > row.targetLaborCostPercent ||
        row.stabilizationScore < 80
    ).length,
    evidenceMissingCount: rows.filter((row) => !row.evidenceReference).length,
    completedReviewCount: rows.filter((row) => row.status === "COMPLETED").length,
    averageStabilizationScore,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      siteName: project.location?.name ?? "Proposed site",
      canMutate: access.canMutateByProjectId.get(project.id) ?? false
    })),
    rows
  };
}

export async function createExpansionPostOpeningReview(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = createPostOpeningReviewSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    reviewPeriod: formData.get("reviewPeriod"),
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority") || "NORMAL",
    targetSales: formData.get("targetSales") || 0,
    actualSales: formData.get("actualSales") || 0,
    targetFoodCostPercent: formData.get("targetFoodCostPercent") || 0,
    actualFoodCostPercent: formData.get("actualFoodCostPercent") || 0,
    targetLaborCostPercent: formData.get("targetLaborCostPercent") || 0,
    actualLaborCostPercent: formData.get("actualLaborCostPercent") || 0,
    guestCount: formData.get("guestCount") || 0,
    issueCount: formData.get("issueCount") || 0,
    stabilizationScore: formData.get("stabilizationScore") || 0,
    sourceReference: formData.get("sourceReference") || undefined,
    evidenceReference: formData.get("evidenceReference") || undefined,
    notes: formData.get("notes") || undefined
  });
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(values.projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (!access.canMutateByProjectId.get(values.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    }
  });
  if (!project || !isExpansionProjectType(project.projectType)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const ownerMember =
    project.members.find((member) => member.userId === project.managerUserId) ??
    project.members.find((member) => member.userId === session.user.id) ??
    project.members[0];
  if (!ownerMember || ownerMember.user.status !== "ACTIVE") {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }

  const dueDate = new Date(`${values.dueDate}T00:00:00.000Z`);
  const createdTask = await prisma.$transaction(async (tx) => {
    const taskCount = await tx.projectTask.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id
      }
    });
    const task = await tx.projectTask.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskKey: `${project.code}-${String(taskCount + 1).padStart(3, "0")}`,
        title: values.title,
        description: postOpeningReviewDescription(values),
        status: "PLANNED",
        priority: values.priority,
        ownerUserId: ownerMember.userId,
        dueAt: dueDate,
        dueDate,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskId: task.id,
        userId: ownerMember.userId,
        assignedByUserId: session.user.id
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "expansion_post_opening_review.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          title: task.title,
          reviewPeriod: values.reviewPeriod,
          dueDate: values.dueDate,
          targetSales: values.targetSales,
          actualSales: values.actualSales,
          targetFoodCostPercent: values.targetFoodCostPercent,
          actualFoodCostPercent: values.actualFoodCostPercent,
          targetLaborCostPercent: values.targetLaborCostPercent,
          actualLaborCostPercent: values.actualLaborCostPercent,
          guestCount: values.guestCount,
          issueCount: values.issueCount,
          stabilizationScore: values.stabilizationScore,
          sourceReference: values.sourceReference ?? null,
          status: task.status,
          priority: task.priority,
          ownerUserId: ownerMember.userId,
          evidenceReference: values.evidenceReference ?? null
        },
        metadata: {
          source: "expansion-post-opening-review",
          sharedEngineEntity: "ProjectTask",
          boundary:
            "coordination_only_no_sales_posting_no_finance_no_inventory_no_workforce_no_branch_mutation"
        }
      }
    });

    await notifyProjectTaskAssigned(tx, {
      project: expansionNotificationProject(project),
      task: {
        id: task.id,
        taskKey: task.taskKey,
        title: task.title,
        assigneeUserId: ownerMember.userId,
        actorUserId: session.user.id,
        priority: task.priority
      }
    });

    return task;
  });

  return createdTask.id;
}

export async function transitionExpansionPostOpeningReview(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = transitionPostOpeningReviewSchema.parse({
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason") || undefined,
    completionNote: formData.get("completionNote") || undefined
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: { project: true }
  });
  if (
    !task ||
    !isExpansionProjectType(task.project.projectType) ||
    !parsePostOpeningReviewDescription(task.description)
  ) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (
    values.nextStatus === "COMPLETED" &&
    (!values.completionNote || values.completionNote.trim().length < 5)
  ) {
    throw new Error("EXPANSION_POST_OPENING_EVIDENCE_REQUIRED");
  }
  if (
    values.nextStatus === "CANCELLED" &&
    (!values.reason || values.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_CANCEL_REASON_REQUIRED");
  }

  await transitionProjectTask(formData);
}

export async function getExpansionPermitDocuments(
  session: SessionContext
): Promise<ExpansionPermitDocumentDashboard> {
  assertExpansionAccess(session);
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      projectCount: 0,
      trackerCount: 0,
      openTrackerCount: 0,
      overdueTrackerCount: 0,
      evidenceMissingCount: 0,
      completedTrackerCount: 0,
      projects: [],
      rows: []
    };
  }

  const projects = (
    await prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        brand: true,
        location: true,
        tasks: {
          where: {
            archivedAt: null,
            description: { startsWith: `${expansionPermitDocumentMarker}:` }
          },
          include: {
            owner: true,
            attachments: {
              where: { status: "ACTIVE", archivedAt: null },
              select: { id: true }
            }
          },
          orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
        }
      },
      orderBy: [{ targetEndDate: "asc" }, { createdAt: "desc" }]
    })
  ).filter((project) => isExpansionProjectType(project.projectType));

  const today = new Date().toISOString().slice(0, 10);
  const rows = projects.flatMap((project): ExpansionPermitDocumentRow[] =>
    project.tasks.flatMap((task) => {
      const metadata = parsePermitDocumentDescription(task.description);
      if (!metadata) {
        return [];
      }
      const dueDate = dateOnlyString(task.dueDate ?? task.dueAt);
      const isTerminal = task.status === "COMPLETED" || task.status === "CANCELLED";
      const evidenceReference = metadata.evidenceReference ?? task.completionNote ?? null;
      const isOverdue = Boolean(dueDate && dueDate < today && !isTerminal);

      return [
        {
          id: task.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          brandName: project.brand?.name ?? "Company-wide",
          siteName: project.location?.name ?? "Proposed site",
          title: task.title,
          trackerType: metadata.trackerType,
          authority: metadata.authority ?? null,
          referenceNumber: metadata.referenceNumber ?? null,
          status: task.status,
          priority: task.priority,
          ownerName: task.owner.displayName,
          dueDate,
          isOverdue,
          evidenceReference,
          attachmentCount: task.attachments.length,
          canMutate: access.canMutateByProjectId.get(project.id) ?? false,
          version: task.version,
          nextAction:
            task.status === "COMPLETED"
              ? "Retain evidence"
              : task.status === "CANCELLED"
                ? "Review cancellation"
                : task.status === "BLOCKED"
                  ? "Resolve blocker"
                  : task.status === "WAITING_FOR_APPROVAL" ||
                      task.status === "FOR_REVIEW"
                    ? "Review evidence"
                    : "Progress requirement"
        }
      ];
    })
  );

  return {
    projectCount: projects.length,
    trackerCount: rows.length,
    openTrackerCount: rows.filter(
      (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
    ).length,
    overdueTrackerCount: rows.filter((row) => row.isOverdue).length,
    evidenceMissingCount: rows.filter(
      (row) => row.status === "COMPLETED" && !row.evidenceReference
    ).length,
    completedTrackerCount: rows.filter((row) => row.status === "COMPLETED").length,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      siteName: project.location?.name ?? "Proposed site",
      canMutate: access.canMutateByProjectId.get(project.id) ?? false
    })),
    rows
  };
}

export async function createExpansionPermitDocument(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = createPermitDocumentSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    trackerType: formData.get("trackerType"),
    authority: formData.get("authority") || undefined,
    referenceNumber: formData.get("referenceNumber") || undefined,
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority") || "NORMAL",
    evidenceReference: formData.get("evidenceReference") || undefined,
    notes: formData.get("notes") || undefined
  });
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(values.projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (!access.canMutateByProjectId.get(values.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    }
  });
  if (!project || !isExpansionProjectType(project.projectType)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const ownerMember =
    project.members.find((member) => member.userId === project.managerUserId) ??
    project.members.find((member) => member.userId === session.user.id) ??
    project.members[0];
  if (!ownerMember || ownerMember.user.status !== "ACTIVE") {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }

  const dueDate = new Date(`${values.dueDate}T00:00:00.000Z`);
  const createdTask = await prisma.$transaction(async (tx) => {
    const taskCount = await tx.projectTask.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id
      }
    });
    const task = await tx.projectTask.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskKey: `${project.code}-${String(taskCount + 1).padStart(3, "0")}`,
        title: values.title,
        description: permitDocumentDescription(values),
        status: "PLANNED",
        priority: values.priority,
        ownerUserId: ownerMember.userId,
        dueAt: dueDate,
        dueDate,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskId: task.id,
        userId: ownerMember.userId,
        assignedByUserId: session.user.id
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "expansion_permit_document.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          title: task.title,
          trackerType: values.trackerType,
          authority: values.authority ?? null,
          referenceNumber: values.referenceNumber ?? null,
          dueDate: values.dueDate,
          status: task.status,
          priority: task.priority,
          ownerUserId: ownerMember.userId,
          evidenceReference: values.evidenceReference ?? null
        },
        metadata: {
          source: "expansion-permits-documents",
          sharedEngineEntity: "ProjectTask",
          boundary:
            "coordination_only_no_legal_contract_authoring_no_payment_no_po_no_branch_mutation"
        }
      }
    });

    await notifyProjectTaskAssigned(tx, {
      project: expansionNotificationProject(project),
      task: {
        id: task.id,
        taskKey: task.taskKey,
        title: task.title,
        assigneeUserId: ownerMember.userId,
        actorUserId: session.user.id,
        priority: task.priority
      }
    });

    return task;
  });

  return createdTask.id;
}

export async function transitionExpansionPermitDocument(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = transitionPermitDocumentSchema.parse({
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason") || undefined,
    completionNote: formData.get("completionNote") || undefined
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: { project: true }
  });
  if (
    !task ||
    !isExpansionProjectType(task.project.projectType) ||
    !parsePermitDocumentDescription(task.description)
  ) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (
    values.nextStatus === "COMPLETED" &&
    (!values.completionNote || values.completionNote.trim().length < 5)
  ) {
    throw new Error("EXPANSION_PERMIT_EVIDENCE_REQUIRED");
  }
  if (
    values.nextStatus === "CANCELLED" &&
    (!values.reason || values.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_CANCEL_REASON_REQUIRED");
  }

  await transitionProjectTask(formData);
}

export async function getExpansionConstructionBoard(
  session: SessionContext
): Promise<ExpansionConstructionBoardDashboard> {
  assertExpansionAccess(session);
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      projectCount: 0,
      taskCount: 0,
      openTaskCount: 0,
      blockedTaskCount: 0,
      overdueTaskCount: 0,
      completedTaskCount: 0,
      averageProgressPercent: 0,
      projects: [],
      rows: []
    };
  }

  const projects = (
    await prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        brand: true,
        location: true,
        tasks: {
          where: {
            archivedAt: null,
            description: { startsWith: `${expansionConstructionTaskMarker}:` }
          },
          include: {
            owner: true,
            attachments: {
              where: { status: "ACTIVE", archivedAt: null },
              select: { id: true }
            },
            recordLinks: {
              where: { archivedAt: null },
              select: { id: true }
            }
          },
          orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
        }
      },
      orderBy: [{ targetEndDate: "asc" }, { createdAt: "desc" }]
    })
  ).filter((project) => isExpansionProjectType(project.projectType));

  const today = new Date().toISOString().slice(0, 10);
  const rows = projects.flatMap((project): ExpansionConstructionTaskRow[] =>
    project.tasks.flatMap((task) => {
      const metadata = parseConstructionTaskDescription(task.description);
      if (!metadata) {
        return [];
      }
      const dueDate = dateOnlyString(task.dueDate ?? task.dueAt);
      const isTerminal = task.status === "COMPLETED" || task.status === "CANCELLED";
      const isOverdue = Boolean(dueDate && dueDate < today && !isTerminal);
      const progressPercent =
        task.status === "COMPLETED"
          ? 100
          : task.status === "CANCELLED"
            ? metadata.progressPercent
            : metadata.progressPercent;

      return [
        {
          id: task.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          brandName: project.brand?.name ?? "Company-wide",
          siteName: project.location?.name ?? "Proposed site",
          title: task.title,
          workstream: metadata.workstream,
          area: metadata.area ?? null,
          contractorName: metadata.contractorName ?? null,
          status: task.status,
          priority: task.priority,
          ownerName: task.owner.displayName,
          dueDate,
          isOverdue,
          progressPercent,
          evidenceReference: metadata.evidenceReference ?? task.completionNote ?? null,
          attachmentCount: task.attachments.length,
          linkedRecordCount: task.recordLinks.length,
          canMutate: access.canMutateByProjectId.get(project.id) ?? false,
          version: task.version,
          nextAction:
            task.status === "COMPLETED"
              ? "Retain handover evidence"
              : task.status === "CANCELLED"
                ? "Review cancellation"
                : task.status === "BLOCKED"
                  ? "Resolve blocker"
                  : task.status === "FOR_REVIEW" ||
                      task.status === "WAITING_FOR_APPROVAL"
                    ? "Review progress evidence"
                    : "Record progress"
        }
      ];
    })
  );

  const activeRows = rows.filter((row) => row.status !== "CANCELLED");
  const averageProgressPercent =
    activeRows.length === 0
      ? 0
      : Math.round(
          activeRows.reduce((total, row) => total + row.progressPercent, 0) /
            activeRows.length
        );

  return {
    projectCount: projects.length,
    taskCount: rows.length,
    openTaskCount: rows.filter(
      (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
    ).length,
    blockedTaskCount: rows.filter((row) => row.status === "BLOCKED").length,
    overdueTaskCount: rows.filter((row) => row.isOverdue).length,
    completedTaskCount: rows.filter((row) => row.status === "COMPLETED").length,
    averageProgressPercent,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      siteName: project.location?.name ?? "Proposed site",
      canMutate: access.canMutateByProjectId.get(project.id) ?? false
    })),
    rows
  };
}

export async function createExpansionConstructionTask(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = createConstructionTaskSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    workstream: formData.get("workstream"),
    area: formData.get("area") || undefined,
    contractorName: formData.get("contractorName") || undefined,
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority") || "NORMAL",
    progressPercent: formData.get("progressPercent") || 0,
    evidenceReference: formData.get("evidenceReference") || undefined,
    notes: formData.get("notes") || undefined
  });
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(values.projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (!access.canMutateByProjectId.get(values.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    }
  });
  if (!project || !isExpansionProjectType(project.projectType)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const ownerMember =
    project.members.find((member) => member.userId === project.managerUserId) ??
    project.members.find((member) => member.userId === session.user.id) ??
    project.members[0];
  if (!ownerMember || ownerMember.user.status !== "ACTIVE") {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }

  const dueDate = new Date(`${values.dueDate}T00:00:00.000Z`);
  const createdTask = await prisma.$transaction(async (tx) => {
    const taskCount = await tx.projectTask.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id
      }
    });
    const task = await tx.projectTask.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskKey: `${project.code}-${String(taskCount + 1).padStart(3, "0")}`,
        title: values.title,
        description: constructionTaskDescription(values),
        status: values.progressPercent > 0 ? "IN_PROGRESS" : "PLANNED",
        priority: values.priority,
        ownerUserId: ownerMember.userId,
        dueAt: dueDate,
        dueDate,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskId: task.id,
        userId: ownerMember.userId,
        assignedByUserId: session.user.id
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "expansion_construction_task.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          title: task.title,
          workstream: values.workstream,
          area: values.area ?? null,
          contractorName: values.contractorName ?? null,
          dueDate: values.dueDate,
          progressPercent: values.progressPercent,
          status: task.status,
          priority: task.priority,
          ownerUserId: ownerMember.userId,
          evidenceReference: values.evidenceReference ?? null
        },
        metadata: {
          source: "expansion-construction-board",
          sharedEngineEntity: "ProjectTask",
          boundary:
            "coordination_only_no_boq_authoring_no_contractor_portal_no_payment_no_po_no_inventory_mutation"
        }
      }
    });

    await notifyProjectTaskAssigned(tx, {
      project: expansionNotificationProject(project),
      task: {
        id: task.id,
        taskKey: task.taskKey,
        title: task.title,
        assigneeUserId: ownerMember.userId,
        actorUserId: session.user.id,
        priority: task.priority
      }
    });

    return task;
  });

  return createdTask.id;
}

export async function recordExpansionConstructionProgress(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = recordConstructionProgressSchema.parse({
    taskId: formData.get("taskId"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    progressPercent: formData.get("progressPercent"),
    evidenceReference: formData.get("evidenceReference"),
    progressNote: formData.get("progressNote")
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      project: true,
      attachments: {
        where: { status: "ACTIVE", archivedAt: null },
        select: { id: true }
      },
      recordLinks: {
        where: { archivedAt: null },
        select: { id: true }
      }
    }
  });
  const metadata = parseConstructionTaskDescription(task?.description ?? null);
  if (!task || !metadata || !isExpansionProjectType(task.project.projectType)) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (values.expectedVersion && task.version !== values.expectedVersion) {
    throw new Error("PROJECT_TASK_STALE_VERSION");
  }
  const access = await listAuthorizedProjectAccess(session);
  if (!access.canMutateByProjectId.get(task.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }
  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    throw new Error("PROJECT_TASK_TERMINAL_STATUS");
  }
  if (["BLOCKED", "FOR_REVIEW"].includes(task.status)) {
    throw new Error("EXPANSION_CONSTRUCTION_PROGRESS_TRANSITION_DENIED");
  }

  const notes = task.description?.split("\n").slice(1).join("\n") ?? "";
  const nextDescription = constructionTaskDescription({
    ...metadata,
    progressPercent: values.progressPercent,
    evidenceReference: values.evidenceReference,
    notes
  });
  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectTask.updateMany({
      where: {
        id: task.id,
        ...(values.expectedVersion ? { version: values.expectedVersion } : {})
      },
      data: {
        description: nextDescription,
        status: values.progressPercent > 0 ? "IN_PROGRESS" : task.status,
        updatedByUserId: session.user.id,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new Error("PROJECT_TASK_STALE_VERSION");
    }

    await tx.projectActivityEvent.create({
      data: {
        tenantId: task.tenantId,
        companyId: task.companyId,
        projectId: task.projectId,
        actorUserId: session.user.id,
        eventType: "expansion_construction_task.progress_recorded",
        entityType: "ProjectTask",
        entityId: task.id,
        reason: values.progressNote,
        beforeData: {
          progressPercent: metadata.progressPercent,
          evidenceReference: metadata.evidenceReference ?? null,
          status: task.status
        },
        afterData: {
          progressPercent: values.progressPercent,
          evidenceReference: values.evidenceReference,
          status: values.progressPercent > 0 ? "IN_PROGRESS" : task.status
        },
        metadata: {
          source: "expansion-construction-board",
          boundary:
            "progress_evidence_only_no_boq_authoring_no_payment_no_po_no_inventory_mutation"
        }
      }
    });
  });
}

export async function transitionExpansionConstructionTask(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = transitionConstructionTaskSchema.parse({
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason") || undefined,
    completionNote: formData.get("completionNote") || undefined
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: { project: true }
  });
  if (
    !task ||
    !isExpansionProjectType(task.project.projectType) ||
    !parseConstructionTaskDescription(task.description)
  ) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (
    values.nextStatus === "COMPLETED" &&
    (!values.completionNote || values.completionNote.trim().length < 5)
  ) {
    throw new Error("EXPANSION_CONSTRUCTION_EVIDENCE_REQUIRED");
  }
  if (
    values.nextStatus === "CANCELLED" &&
    (!values.reason || values.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_CANCEL_REASON_REQUIRED");
  }

  await transitionProjectTask(formData);
}

export async function getExpansionOpeningReadiness(
  session: SessionContext
): Promise<ExpansionOpeningReadinessDashboard> {
  assertExpansionAccess(session);
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      projectCount: 0,
      readinessCount: 0,
      openReadinessCount: 0,
      blockedReadinessCount: 0,
      overdueReadinessCount: 0,
      completedReadinessCount: 0,
      averageCompletionPercent: 0,
      projects: [],
      rows: []
    };
  }

  const projects = (
    await prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        brand: true,
        location: true,
        members: {
          where: { status: "ACTIVE", user: { status: "ACTIVE" } },
          include: { user: true }
        },
        tasks: {
          where: {
            archivedAt: null,
            description: { startsWith: `${expansionOpeningReadinessMarker}:` }
          },
          include: {
            owner: true,
            checklistItems: {
              where: { archivedAt: null },
              orderBy: { position: "asc" }
            }
          },
          orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
        }
      },
      orderBy: [{ targetEndDate: "asc" }, { createdAt: "desc" }]
    })
  ).filter((project) => isExpansionProjectType(project.projectType));

  const today = new Date().toISOString().slice(0, 10);
  const rows = projects.flatMap((project): ExpansionOpeningReadinessRow[] =>
    project.tasks.flatMap((task) => {
      const metadata = parseOpeningReadinessDescription(task.description);
      if (!metadata) {
        return [];
      }
      const dueDate = dateOnlyString(task.dueDate ?? task.dueAt);
      const isTerminal = task.status === "COMPLETED" || task.status === "CANCELLED";
      const isOverdue = Boolean(dueDate && dueDate < today && !isTerminal);
      const checklistTotal = task.checklistItems.length;
      const checklistCompleted = task.checklistItems.filter(
        (item) => item.isCompleted
      ).length;
      const completionPercent =
        checklistTotal === 0
          ? task.status === "COMPLETED"
            ? 100
            : 0
          : Math.round((checklistCompleted / checklistTotal) * 100);

      return [
        {
          id: task.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          brandName: project.brand?.name ?? "Company-wide",
          siteName: project.location?.name ?? "Proposed site",
          title: task.title,
          readinessArea: metadata.readinessArea,
          ownerName: task.owner.displayName,
          status: task.status,
          priority: task.priority,
          dueDate,
          isOverdue,
          checklistTotal,
          checklistCompleted,
          completionPercent,
          evidenceReference: metadata.evidenceReference ?? task.completionNote ?? null,
          canMutate: access.canMutateByProjectId.get(project.id) ?? false,
          version: task.version,
          checklistItems: task.checklistItems.map((item) => ({
            id: item.id,
            title: item.title,
            isCompleted: item.isCompleted,
            isRequired: item.isRequired
          })),
          nextAction:
            task.status === "COMPLETED"
              ? "Retain opening evidence"
              : task.status === "CANCELLED"
                ? "Review cancellation"
                : task.status === "BLOCKED"
                  ? "Resolve blocker"
                  : completionPercent === 100
                    ? "Submit for readiness review"
                    : "Complete checklist"
        }
      ];
    })
  );
  const activeRows = rows.filter((row) => row.status !== "CANCELLED");
  const averageCompletionPercent =
    activeRows.length === 0
      ? 0
      : Math.round(
          activeRows.reduce((total, row) => total + row.completionPercent, 0) /
            activeRows.length
        );

  return {
    projectCount: projects.length,
    readinessCount: rows.length,
    openReadinessCount: rows.filter(
      (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
    ).length,
    blockedReadinessCount: rows.filter((row) => row.status === "BLOCKED").length,
    overdueReadinessCount: rows.filter((row) => row.isOverdue).length,
    completedReadinessCount: rows.filter((row) => row.status === "COMPLETED").length,
    averageCompletionPercent,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      siteName: project.location?.name ?? "Proposed site",
      canMutate: access.canMutateByProjectId.get(project.id) ?? false
    })),
    rows
  };
}

export async function createExpansionOpeningReadiness(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = createOpeningReadinessSchema.parse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    readinessArea: formData.get("readinessArea"),
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority") || "NORMAL",
    evidenceReference: formData.get("evidenceReference") || undefined,
    checklistText: formData.get("checklistText") || undefined,
    notes: formData.get("notes") || undefined
  });
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(values.projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (!access.canMutateByProjectId.get(values.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    }
  });
  if (!project || !isExpansionProjectType(project.projectType)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  const ownerMember =
    project.members.find((member) => member.userId === project.managerUserId) ??
    project.members.find((member) => member.userId === session.user.id) ??
    project.members[0];
  if (!ownerMember || ownerMember.user.status !== "ACTIVE") {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }

  const checklistLines = parseChecklistText(values.checklistText);
  const dueDate = new Date(`${values.dueDate}T00:00:00.000Z`);
  const createdTask = await prisma.$transaction(async (tx) => {
    const taskCount = await tx.projectTask.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id
      }
    });
    const task = await tx.projectTask.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskKey: `${project.code}-${String(taskCount + 1).padStart(3, "0")}`,
        title: values.title,
        description: openingReadinessDescription(values),
        status: "PLANNED",
        priority: values.priority,
        ownerUserId: ownerMember.userId,
        dueAt: dueDate,
        dueDate,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskId: task.id,
        userId: ownerMember.userId,
        assignedByUserId: session.user.id
      }
    });

    if (checklistLines.length > 0) {
      await tx.projectTaskChecklistItem.createMany({
        data: checklistLines.map((title, index) => ({
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          projectId: project.id,
          taskId: task.id,
          title,
          position: index + 1,
          isRequired: true,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id
        }))
      });
    }

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "expansion_opening_readiness.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          title: task.title,
          readinessArea: values.readinessArea,
          dueDate: values.dueDate,
          status: task.status,
          priority: task.priority,
          ownerUserId: ownerMember.userId,
          evidenceReference: values.evidenceReference ?? null,
          checklistCount: checklistLines.length
        },
        metadata: {
          source: "expansion-opening-readiness",
          sharedEngineEntity: "ProjectTask",
          boundary:
            "coordination_only_no_branch_creation_no_hiring_no_inventory_no_payment_no_po_mutation"
        }
      }
    });

    await notifyProjectTaskAssigned(tx, {
      project: expansionNotificationProject(project),
      task: {
        id: task.id,
        taskKey: task.taskKey,
        title: task.title,
        assigneeUserId: ownerMember.userId,
        actorUserId: session.user.id,
        priority: task.priority
      }
    });

    return task;
  });

  return createdTask.id;
}

export async function toggleExpansionOpeningReadinessChecklist(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = toggleOpeningReadinessChecklistSchema.parse({
    checklistItemId: formData.get("checklistItemId"),
    isCompleted: formData.get("isCompleted") === "true"
  });
  const item = await prisma.projectTaskChecklistItem.findFirst({
    where: {
      id: values.checklistItemId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      task: {
        include: { project: true }
      }
    }
  });
  if (
    !item ||
    !parseOpeningReadinessDescription(item.task.description) ||
    !isExpansionProjectType(item.task.project.projectType)
  ) {
    throw new Error("PROJECT_CHECKLIST_ITEM_NOT_FOUND");
  }
  const access = await listAuthorizedProjectAccess(session);
  if (!access.canMutateByProjectId.get(item.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.projectTaskChecklistItem.update({
      where: { id: item.id },
      data: {
        isCompleted: values.isCompleted,
        completedAt: values.isCompleted ? now : null,
        completedByUserId: values.isCompleted ? session.user.id : null,
        updatedByUserId: session.user.id
      }
    });
    await tx.projectActivityEvent.create({
      data: {
        tenantId: item.tenantId,
        companyId: item.companyId,
        projectId: item.projectId,
        actorUserId: session.user.id,
        eventType: values.isCompleted
          ? "expansion_opening_readiness.check_completed"
          : "expansion_opening_readiness.check_reopened",
        entityType: "ProjectTaskChecklistItem",
        entityId: item.id,
        beforeData: { isCompleted: item.isCompleted },
        afterData: { isCompleted: updated.isCompleted },
        metadata: {
          taskId: item.taskId,
          source: "expansion-opening-readiness"
        }
      }
    });
  });
}

export async function transitionExpansionOpeningReadiness(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = transitionOpeningReadinessSchema.parse({
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason") || undefined,
    completionNote: formData.get("completionNote") || undefined
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: { project: true }
  });
  if (
    !task ||
    !isExpansionProjectType(task.project.projectType) ||
    !parseOpeningReadinessDescription(task.description)
  ) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (
    values.nextStatus === "COMPLETED" &&
    (!values.completionNote || values.completionNote.trim().length < 5)
  ) {
    throw new Error("EXPANSION_READINESS_EVIDENCE_REQUIRED");
  }
  if (
    values.nextStatus === "CANCELLED" &&
    (!values.reason || values.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_CANCEL_REASON_REQUIRED");
  }

  await transitionProjectTask(formData);
}

export async function getExpansionPunchList(
  session: SessionContext
): Promise<ExpansionPunchListDashboard> {
  assertExpansionAccess(session);
  const access = await listAuthorizedProjectAccess(session);
  if (access.projectIds.length === 0) {
    return {
      projectCount: 0,
      punchCount: 0,
      openPunchCount: 0,
      criticalPunchCount: 0,
      overduePunchCount: 0,
      completedPunchCount: 0,
      projects: [],
      rows: []
    };
  }

  const projects = (
    await prisma.project.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        id: { in: access.projectIds },
        archivedAt: null
      },
      include: {
        brand: true,
        location: true,
        members: {
          where: { status: "ACTIVE", user: { status: "ACTIVE" } },
          include: { user: true }
        },
        tasks: {
          where: {
            archivedAt: null,
            description: { startsWith: `${expansionPunchListMarker}:` }
          },
          include: {
            owner: true,
            attachments: {
              where: { status: "ACTIVE", archivedAt: null },
              select: { id: true }
            },
            recordLinks: {
              where: { archivedAt: null },
              select: { id: true }
            }
          },
          orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
        }
      },
      orderBy: [{ targetEndDate: "asc" }, { createdAt: "desc" }]
    })
  ).filter((project) => isExpansionProjectType(project.projectType));

  const today = new Date().toISOString().slice(0, 10);
  const rows = projects.flatMap((project): ExpansionPunchListRow[] =>
    project.tasks.flatMap((task) => {
      const metadata = parsePunchListDescription(task.description);
      if (!metadata) {
        return [];
      }
      const dueDate = dateOnlyString(task.dueDate ?? task.dueAt);
      const isTerminal = task.status === "COMPLETED" || task.status === "CANCELLED";
      const isOverdue = Boolean(dueDate && dueDate < today && !isTerminal);

      return [
        {
          id: task.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          brandName: project.brand?.name ?? "Company-wide",
          siteName: project.location?.name ?? "Proposed site",
          title: task.title,
          punchType: metadata.punchType,
          severity: metadata.severity,
          area: metadata.area ?? null,
          responsibleParty: metadata.responsibleParty ?? null,
          impactSummary: metadata.impactSummary,
          escalationOwner: metadata.escalationOwner ?? null,
          independentReviewerName: metadata.independentReviewerUserId
            ? project.members.find(
                (member) => member.userId === metadata.independentReviewerUserId
              )?.user.displayName ?? "Assigned reviewer"
            : project.members.find(
                (member) => member.userId === project.sponsorUserId
              )?.user.displayName ?? null,
          status: task.status,
          priority: task.priority,
          ownerName: task.owner.displayName,
          dueDate,
          isOverdue,
          evidenceReference: metadata.evidenceReference ?? null,
          closureEvidence: task.completionNote ?? null,
          attachmentCount: task.attachments.length,
          linkedRecordCount: task.recordLinks.length,
          canMutate: access.canMutateByProjectId.get(project.id) ?? false,
          requiresIndependentClosure:
            metadata.severity === "HIGH" || metadata.severity === "CRITICAL",
          canClose:
            (access.canMutateByProjectId.get(project.id) ?? false) &&
            (metadata.severity !== "HIGH" && metadata.severity !== "CRITICAL"
              ? task.status === "FOR_REVIEW"
              : task.status === "FOR_REVIEW" &&
                session.user.id !== task.ownerUserId &&
                session.user.id !== task.createdByUserId &&
                session.user.id ===
                  (metadata.independentReviewerUserId ?? project.sponsorUserId)),
          version: task.version,
          nextAction:
            task.status === "COMPLETED"
              ? "Retain closure evidence"
              : task.status === "CANCELLED"
                ? "Review cancellation"
                : task.status === "BLOCKED"
                  ? "Resolve blocker"
                  : task.status === "FOR_REVIEW" ||
                      task.status === "WAITING_FOR_APPROVAL"
                    ? "Review inspection evidence"
                    : "Record rectification progress"
        }
      ];
    })
  );

  return {
    projectCount: projects.length,
    punchCount: rows.length,
    openPunchCount: rows.filter(
      (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
    ).length,
    criticalPunchCount: rows.filter(
      (row) =>
        row.severity === "CRITICAL" &&
        row.status !== "COMPLETED" &&
        row.status !== "CANCELLED"
    ).length,
    overduePunchCount: rows.filter((row) => row.isOverdue).length,
    completedPunchCount: rows.filter((row) => row.status === "COMPLETED").length,
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      siteName: project.location?.name ?? "Proposed site",
      canMutate: access.canMutateByProjectId.get(project.id) ?? false,
      members: project.members.map((member) => ({
        id: member.userId,
        displayName: member.user.displayName
      }))
    })),
    rows
  };
}

export async function createExpansionPunchListItem(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = createPunchListItemSchema.parse({
    projectId: formData.get("projectId"),
    ownerUserId: formData.get("ownerUserId"),
    title: formData.get("title"),
    punchType: formData.get("punchType"),
    severity: formData.get("severity") || "MEDIUM",
    area: formData.get("area") || undefined,
    responsibleParty: formData.get("responsibleParty") || undefined,
    impactSummary: formData.get("impactSummary"),
    escalationOwner: formData.get("escalationOwner") || undefined,
    independentReviewerUserId:
      formData.get("independentReviewerUserId") || undefined,
    dueDate: formData.get("dueDate"),
    priority: formData.get("priority") || "NORMAL",
    evidenceReference: formData.get("evidenceReference") || undefined,
    notes: formData.get("notes") || undefined
  });
  const access = await listAuthorizedProjectAccess(session);
  if (!access.projectIds.includes(values.projectId)) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (!access.canMutateByProjectId.get(values.projectId)) {
    throw new Error("PROJECT_TASK_PERMISSION_DENIED");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: values.projectId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true }
      }
    }
  });
  if (!project || !isExpansionProjectType(project.projectType)) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  if (
    (values.severity === "HIGH" || values.severity === "CRITICAL") &&
    !values.escalationOwner
  ) {
    throw new Error("EXPANSION_PUNCH_LIST_ESCALATION_OWNER_REQUIRED");
  }
  if (
    (values.severity === "HIGH" || values.severity === "CRITICAL") &&
    !values.evidenceReference
  ) {
    throw new Error("EXPANSION_PUNCH_LIST_INITIAL_EVIDENCE_REQUIRED");
  }
  const ownerMember = project.members.find(
    (member) => member.userId === values.ownerUserId
  );
  if (!ownerMember || ownerMember.user.status !== "ACTIVE") {
    throw new Error("PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER");
  }
  const reviewerMember = values.independentReviewerUserId
    ? project.members.find((member) => member.userId === values.independentReviewerUserId)
    : null;
  if (
    (values.severity === "HIGH" || values.severity === "CRITICAL") &&
    !reviewerMember
  ) {
    throw new Error("EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEWER_REQUIRED");
  }
  if (
    reviewerMember &&
    (reviewerMember.user.status !== "ACTIVE" ||
      reviewerMember.userId === ownerMember.userId ||
      reviewerMember.userId === session.user.id)
  ) {
    throw new Error("EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEWER_INVALID");
  }

  const dueDate = new Date(`${values.dueDate}T00:00:00.000Z`);
  const createdTask = await prisma.$transaction(async (tx) => {
    const taskCount = await tx.projectTask.count({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id
      }
    });
    const task = await tx.projectTask.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskKey: `${project.code}-${String(taskCount + 1).padStart(3, "0")}`,
        title: values.title,
        description: punchListDescription(values),
        status: "PLANNED",
        priority: values.priority,
        ownerUserId: ownerMember.userId,
        dueAt: dueDate,
        dueDate,
        createdByUserId: session.user.id,
        updatedByUserId: session.user.id
      }
    });

    await tx.projectTaskAssignee.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        taskId: task.id,
        userId: ownerMember.userId,
        assignedByUserId: session.user.id
      }
    });

    await tx.projectActivityEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        projectId: project.id,
        actorUserId: session.user.id,
        eventType: "expansion_punch_list_item.created",
        entityType: "ProjectTask",
        entityId: task.id,
        afterData: {
          taskKey: task.taskKey,
          title: task.title,
          punchType: values.punchType,
          severity: values.severity,
          area: values.area ?? null,
          responsibleParty: values.responsibleParty ?? null,
          impactSummary: values.impactSummary,
          escalationOwner: values.escalationOwner ?? null,
          independentReviewerUserId: reviewerMember?.userId ?? null,
          dueDate: values.dueDate,
          status: task.status,
          priority: task.priority,
          ownerUserId: ownerMember.userId,
          evidenceReference: values.evidenceReference ?? null
        },
        metadata: {
          source: "expansion-punch-list",
          sharedEngineEntity: "ProjectTask",
          boundary:
            "coordination_only_no_payment_no_po_no_inventory_no_contractor_portal_no_branch_mutation"
        }
      }
    });

    await notifyProjectTaskAssigned(tx, {
      project: expansionNotificationProject(project),
      task: {
        id: task.id,
        taskKey: task.taskKey,
        title: task.title,
        assigneeUserId: ownerMember.userId,
        actorUserId: session.user.id,
        priority: task.priority
      }
    });

    return task;
  });

  return createdTask.id;
}

export async function transitionExpansionPunchListItem(formData: FormData) {
  const session = await requireSessionContext();
  assertExpansionAccess(session);
  const values = transitionPunchListItemSchema.parse({
    taskId: formData.get("taskId"),
    nextStatus: formData.get("nextStatus"),
    expectedVersion: formData.get("expectedVersion") || undefined,
    reason: formData.get("reason") || undefined,
    completionNote: formData.get("completionNote") || undefined,
    severity: formData.get("severity") || "MEDIUM"
  });

  const task = await prisma.projectTask.findFirst({
    where: {
      id: values.taskId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      archivedAt: null
    },
    include: { project: true }
  });
  if (
    !task ||
    !isExpansionProjectType(task.project.projectType) ||
    !parsePunchListDescription(task.description)
  ) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  if (
    values.nextStatus === "COMPLETED" &&
    (!values.completionNote || values.completionNote.trim().length < 5)
  ) {
    throw new Error("EXPANSION_PUNCH_LIST_EVIDENCE_REQUIRED");
  }
  const metadata = parsePunchListDescription(task.description);
  if (!metadata) {
    throw new Error("PROJECT_TASK_NOT_FOUND");
  }
  const requiresIndependentClosure =
    metadata.severity === "HIGH" || metadata.severity === "CRITICAL";
  if (values.nextStatus === "WAITING_FOR_APPROVAL") {
    throw new Error("EXPANSION_PUNCH_LIST_INVALID_TRANSITION");
  }
  const allowedTransitions: Record<string, string[]> = {
    PLANNED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
    IN_PROGRESS: ["BLOCKED", "FOR_REVIEW", "CANCELLED"],
    BLOCKED: ["IN_PROGRESS", "FOR_REVIEW", "CANCELLED"],
    FOR_REVIEW: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
    COMPLETED: ["IN_PROGRESS"],
    CANCELLED: ["IN_PROGRESS"]
  };
  if (!allowedTransitions[task.status]?.includes(values.nextStatus)) {
    throw new Error("EXPANSION_PUNCH_LIST_INVALID_TRANSITION");
  }
  if (values.nextStatus === "COMPLETED" && task.status !== "FOR_REVIEW") {
    throw new Error("EXPANSION_PUNCH_LIST_REVIEW_REQUIRED");
  }
  if (values.nextStatus === "COMPLETED" && requiresIndependentClosure) {
    const reviewerUserId =
      metadata.independentReviewerUserId ?? task.project.sponsorUserId;
    if (
      session.user.id === task.ownerUserId ||
      session.user.id === task.createdByUserId ||
      !reviewerUserId ||
      session.user.id !== reviewerUserId
    ) {
      throw new Error("EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEW_REQUIRED");
    }
  }
  if (
    task.status === "FOR_REVIEW" &&
    values.nextStatus === "IN_PROGRESS" &&
    (!values.reason || values.reason.trim().length < 5)
  ) {
    throw new Error("EXPANSION_PUNCH_LIST_RETURN_REASON_REQUIRED");
  }
  if (
    values.nextStatus === "CANCELLED" &&
    (!values.reason || values.reason.trim().length < 5)
  ) {
    throw new Error("PROJECT_TASK_CANCEL_REASON_REQUIRED");
  }

  await transitionProjectTask(formData);
}

function reportHealth(exceptionCount: number) {
  if (exceptionCount >= 3) {
    return "AT_RISK" as const;
  }
  if (exceptionCount > 0) {
    return "WATCH" as const;
  }
  return "CLEAR" as const;
}

export async function getExpansionReportRollups(
  session: SessionContext
): Promise<ExpansionReportRollups> {
  assertExpansionAccess(session);
  const [
    dashboard,
    feasibility,
    capexProcurement,
    postOpening,
    gates,
    permits,
    construction,
    readiness,
    punchList
  ] = await Promise.all([
    getExpansionDashboard(session),
    getExpansionFeasibility(session),
    getExpansionCapexProcurement(session),
    getExpansionPostOpeningReviews(session),
    getExpansionLifecycleGates(session),
    getExpansionPermitDocuments(session),
    getExpansionConstructionBoard(session),
    getExpansionOpeningReadiness(session),
    getExpansionPunchList(session)
  ]);

  const rollups: ExpansionReportRollupRow[] = [
    {
      reportId: "phase-4-expansion-portfolio",
      reportName: "Expansion Portfolio",
      sourceWorkspace: "Expansion Dashboard",
      sourceHref: "/expansion",
      totalCount: dashboard.projectCount,
      openCount: dashboard.activeProjectCount,
      exceptionCount: dashboard.atRiskProjectCount,
      completedCount: dashboard.projects.filter(
        (project) => project.status === "COMPLETED" || project.status === "CLOSED"
      ).length,
      health: reportHealth(dashboard.atRiskProjectCount),
      nextAction:
        dashboard.atRiskProjectCount > 0
          ? "Review schedule risk and blocked work"
          : "Monitor active expansion projects"
    },
    {
      reportId: "phase-4-feasibility",
      reportName: "Feasibility",
      sourceWorkspace: "Feasibility",
      sourceHref: "/expansion/feasibility",
      totalCount: feasibility.modelCount,
      openCount: feasibility.openModelCount,
      exceptionCount: feasibility.exceptionCount,
      completedCount: feasibility.approvedModelCount,
      health: reportHealth(feasibility.exceptionCount),
      nextAction:
        feasibility.reviewModelCount > 0
          ? "Review business-case assumptions and evidence"
          : "Create or update feasibility assumptions"
    },
    {
      reportId: "phase-4-capex-procurement",
      reportName: "Capex & Procurement",
      sourceWorkspace: "Capex & Procurement",
      sourceHref: "/expansion/capex-procurement",
      totalCount: capexProcurement.itemCount,
      openCount: capexProcurement.openItemCount,
      exceptionCount:
        capexProcurement.overBudgetReferenceCount +
        capexProcurement.evidenceMissingCount,
      completedCount: capexProcurement.completedItemCount,
      health: reportHealth(
        capexProcurement.overBudgetReferenceCount +
          capexProcurement.evidenceMissingCount
      ),
      nextAction:
        capexProcurement.overBudgetReferenceCount > 0
          ? "Review budget variance against source records"
          : "Record source references and package evidence"
    },
    {
      reportId: "phase-4-lifecycle-gates",
      reportName: "Lifecycle Gates",
      sourceWorkspace: "Lifecycle Gates",
      sourceHref: "/expansion/gates",
      totalCount: gates.gateCount,
      openCount: gates.gateCount - gates.achievedGateCount,
      exceptionCount: gates.atRiskGateCount + gates.missingGateCount,
      completedCount: gates.achievedGateCount,
      health: reportHealth(gates.atRiskGateCount + gates.missingGateCount),
      nextAction:
        gates.missingGateCount > 0
          ? "Seed or complete missing gate milestones"
          : "Review at-risk gate evidence"
    },
    {
      reportId: "phase-4-post-opening-review",
      reportName: "Post-Opening Review",
      sourceWorkspace: "Post-Opening Review",
      sourceHref: "/expansion/post-opening",
      totalCount: postOpening.reviewCount,
      openCount: postOpening.openReviewCount,
      exceptionCount:
        postOpening.performanceExceptionCount + postOpening.evidenceMissingCount,
      completedCount: postOpening.completedReviewCount,
      health: reportHealth(
        postOpening.performanceExceptionCount + postOpening.evidenceMissingCount
      ),
      nextAction:
        postOpening.performanceExceptionCount > 0
          ? "Review operating variance and stabilization blockers"
          : "Record 30/60/90-day review evidence"
    },
    {
      reportId: "phase-4-permits-documents",
      reportName: "Permits & Documents",
      sourceWorkspace: "Permits & Documents",
      sourceHref: "/expansion/permits",
      totalCount: permits.trackerCount,
      openCount: permits.openTrackerCount,
      exceptionCount: permits.overdueTrackerCount + permits.evidenceMissingCount,
      completedCount: permits.completedTrackerCount,
      health: reportHealth(permits.overdueTrackerCount + permits.evidenceMissingCount),
      nextAction:
        permits.overdueTrackerCount > 0
          ? "Resolve overdue permit/document requirements"
          : "Attach evidence before closure"
    },
    {
      reportId: "phase-4-construction-board",
      reportName: "Construction Board",
      sourceWorkspace: "Construction Board",
      sourceHref: "/expansion/construction",
      totalCount: construction.taskCount,
      openCount: construction.openTaskCount,
      exceptionCount: construction.blockedTaskCount + construction.overdueTaskCount,
      completedCount: construction.completedTaskCount,
      health: reportHealth(
        construction.blockedTaskCount + construction.overdueTaskCount
      ),
      nextAction:
        construction.blockedTaskCount > 0
          ? "Resolve construction blockers"
          : "Record construction progress evidence"
    },
    {
      reportId: "phase-4-opening-readiness",
      reportName: "Opening Readiness",
      sourceWorkspace: "Opening Readiness",
      sourceHref: "/expansion/readiness",
      totalCount: readiness.readinessCount,
      openCount: readiness.openReadinessCount,
      exceptionCount:
        readiness.blockedReadinessCount + readiness.overdueReadinessCount,
      completedCount: readiness.completedReadinessCount,
      health: reportHealth(
        readiness.blockedReadinessCount + readiness.overdueReadinessCount
      ),
      nextAction:
        readiness.openReadinessCount > 0
          ? "Complete readiness checklist and evidence"
          : "Retain opening handover evidence"
    },
    {
      reportId: "phase-4-punch-list",
      reportName: "Punch List",
      sourceWorkspace: "Punch List",
      sourceHref: "/expansion/punch-list",
      totalCount: punchList.punchCount,
      openCount: punchList.openPunchCount,
      exceptionCount: punchList.criticalPunchCount + punchList.overduePunchCount,
      completedCount: punchList.completedPunchCount,
      health: reportHealth(
        punchList.criticalPunchCount + punchList.overduePunchCount
      ),
      nextAction:
        punchList.criticalPunchCount > 0
          ? "Close critical rectification items with evidence"
          : "Review open punch-list closure evidence"
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    projectCount: dashboard.projectCount,
    exceptionCount: rollups.reduce((total, rollup) => total + rollup.exceptionCount, 0),
    rollups
  };
}

function countByProjectId<T extends { projectId: string }>(
  rows: T[],
  predicate: (row: T) => boolean
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (predicate(row)) {
      counts.set(row.projectId, (counts.get(row.projectId) ?? 0) + 1);
    }
  }
  return counts;
}

function averageByProjectId<T extends { projectId: string }>(
  rows: T[],
  value: (row: T) => number
) {
  const totals = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const current = totals.get(row.projectId) ?? { total: 0, count: 0 };
    current.total += value(row);
    current.count += 1;
    totals.set(row.projectId, current);
  }
  const averages = new Map<string, number>();
  for (const [projectId, current] of totals.entries()) {
    averages.set(projectId, Math.round(current.total / Math.max(1, current.count)));
  }
  return averages;
}

export async function buildExpansionPortfolioExportRows(
  session: SessionContext
): Promise<CsvRow[]> {
  assertExpansionAccess(session);
  const [
    dashboard,
    feasibility,
    capexProcurement,
    postOpening,
    gates,
    permits,
    construction,
    readiness,
    punchList
  ] = await Promise.all([
    getExpansionDashboard(session),
    getExpansionFeasibility(session),
    getExpansionCapexProcurement(session),
    getExpansionPostOpeningReviews(session),
    getExpansionLifecycleGates(session),
    getExpansionPermitDocuments(session),
    getExpansionConstructionBoard(session),
    getExpansionOpeningReadiness(session),
    getExpansionPunchList(session)
  ]);

  const achievedGates = new Map(
    gates.projects.map((project) => [project.id, project.achievedGateCount])
  );
  const feasibilityOpen = countByProjectId(
    feasibility.rows,
    (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
  );
  const feasibilityExceptions = countByProjectId(
    feasibility.rows,
    (row) => row.isOverdue || row.status === "BLOCKED" || !row.evidenceReference
  );
  const capexOpen = countByProjectId(
    capexProcurement.rows,
    (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
  );
  const capexExceptions = countByProjectId(
    capexProcurement.rows,
    (row) =>
      !row.evidenceReference ||
      (!row.financialsMasked &&
        (row.budgetEstimate ?? 0) > 0 &&
        Math.max(row.committedReferenceAmount ?? 0, row.actualReferenceAmount ?? 0) >
          (row.budgetEstimate ?? 0))
  );
  const postOpeningOpen = countByProjectId(
    postOpening.rows,
    (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
  );
  const postOpeningExceptions = countByProjectId(
    postOpening.rows,
    (row) =>
      !row.evidenceReference ||
      row.isOverdue ||
      row.status === "BLOCKED" ||
      row.salesVariancePercent < -5 ||
      row.actualFoodCostPercent > row.targetFoodCostPercent ||
      row.actualLaborCostPercent > row.targetLaborCostPercent ||
      row.stabilizationScore < 80
  );
  const gateTotals = new Map(
    gates.projects.map((project) => [project.id, project.gateCount])
  );
  const permitOpen = countByProjectId(
    permits.rows,
    (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
  );
  const permitExceptions = countByProjectId(
    permits.rows,
    (row) => row.isOverdue || !row.evidenceReference
  );
  const constructionOpen = countByProjectId(
    construction.rows,
    (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
  );
  const constructionExceptions = countByProjectId(
    construction.rows,
    (row) => row.status === "BLOCKED" || row.isOverdue
  );
  const constructionAverageProgress = averageByProjectId(
    construction.rows,
    (row) => row.progressPercent
  );
  const readinessOpen = countByProjectId(
    readiness.rows,
    (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
  );
  const readinessExceptions = countByProjectId(
    readiness.rows,
    (row) => row.status === "BLOCKED" || row.isOverdue
  );
  const readinessAverageCompletion = averageByProjectId(
    readiness.rows,
    (row) => row.completionPercent
  );
  const punchOpen = countByProjectId(
    punchList.rows,
    (row) => row.status !== "COMPLETED" && row.status !== "CANCELLED"
  );
  const punchExceptions = countByProjectId(
    punchList.rows,
    (row) => row.severity === "CRITICAL" || row.isOverdue
  );

  return [
    [
      "Project Code",
      "Project Name",
      "Project Type",
      "Status",
      "Brand",
      "Site",
      "Target Opening Date",
      "Schedule State",
      "Task Completion %",
      "Task Count",
      "Completed Tasks",
      "Overdue Tasks",
      "Blocked Tasks",
      "High Risks",
      "Open Punch List",
      "Linked Source Records",
      "Next Milestone",
      "Next Milestone Date",
      "Open Feasibility Reviews",
      "Feasibility Exceptions",
      "Open Capex/Procurement Items",
      "Capex/Procurement Exceptions",
      "Open Post-Opening Reviews",
      "Post-Opening Exceptions",
      "Lifecycle Gates Achieved",
      "Lifecycle Gates Total",
      "Open Permit/Document Items",
      "Permit/Document Exceptions",
      "Open Construction Tasks",
      "Construction Exceptions",
      "Construction Avg Progress %",
      "Open Readiness Items",
      "Readiness Exceptions",
      "Readiness Avg Completion %",
      "Open Punch Items",
      "Punch Exceptions",
      "Source Boundary"
    ],
    ...dashboard.projects.map((project): CsvRow => [
      project.code,
      project.name,
      project.projectType,
      project.status,
      project.brandName,
      project.siteName,
      project.targetOpeningDate,
      project.scheduleState,
      project.completionPercent,
      project.taskCount,
      project.completedTaskCount,
      project.overdueTaskCount,
      project.blockedTaskCount,
      project.highRiskCount,
      project.openPunchListCount,
      project.linkedRecordCount,
      project.nextMilestoneTitle,
      project.nextMilestoneDate,
      feasibilityOpen.get(project.id) ?? 0,
      feasibilityExceptions.get(project.id) ?? 0,
      capexOpen.get(project.id) ?? 0,
      capexExceptions.get(project.id) ?? 0,
      postOpeningOpen.get(project.id) ?? 0,
      postOpeningExceptions.get(project.id) ?? 0,
      achievedGates.get(project.id) ?? 0,
      gateTotals.get(project.id) ?? 0,
      permitOpen.get(project.id) ?? 0,
      permitExceptions.get(project.id) ?? 0,
      constructionOpen.get(project.id) ?? 0,
      constructionExceptions.get(project.id) ?? 0,
      constructionAverageProgress.get(project.id) ?? 0,
      readinessOpen.get(project.id) ?? 0,
      readinessExceptions.get(project.id) ?? 0,
      readinessAverageCompletion.get(project.id) ?? 0,
      punchOpen.get(project.id) ?? 0,
      punchExceptions.get(project.id) ?? 0,
      "Expansion report is read-only coordination; source records remain in Finance, Procurement, Inventory, HR, and Admin modules."
    ])
  ];
}
