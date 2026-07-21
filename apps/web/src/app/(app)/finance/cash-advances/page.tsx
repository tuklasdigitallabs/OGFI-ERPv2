import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  FileText,
  HandCoins,
  WalletCards
} from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import { ControlledEvidencePanel } from "@/components/evidence/ControlledEvidencePanel";
import {
  FinancePagination,
  getPaginationState
} from "@/components/FinancePagination";
import {
  canUseFinance,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import {
  archiveControlledEvidenceAttachment,
  listControlledEvidenceAttachments
} from "@/server/services/attachments";
import {
  approveCashAdvanceRequest,
  approveCashAdvanceLiquidation,
  cancelCashAdvanceRequest,
  cancelCashAdvanceLiquidation,
  closeCashAdvanceRequest,
  closeCashAdvanceLiquidation,
  createDraftCashAdvanceRequest,
  createCashAdvanceDisbursementHandoff,
  getCashAdvanceDashboard,
  issueCashAdvanceOffline,
  markCashAdvanceLiquidationClosureReady,
  rejectCashAdvanceRequest,
  rejectCashAdvanceLiquidation,
  reverseCashAdvanceLiquidation,
  returnCashAdvanceForRevision,
  returnCashAdvanceLiquidationForRevision,
  submitCashAdvanceLiquidation,
  submitCashAdvanceForApproval,
  voidCashAdvanceOfflineIssue
} from "@/server/services/cashAdvances";
import { getSessionContext } from "@/server/services/context";

export const dynamic = "force-dynamic";

type CashAdvancesPageProps = {
  searchParams?: Promise<{ page?: string; tab?: string }>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const metricIcons = {
  "active-advances": HandCoins,
  "pending-approval": BadgeCheck,
  "outstanding-value": WalletCards,
  "overdue-liquidations": AlertTriangle
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila"
  }).format(new Date(value));
}

function parseDateField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  return new Date(`${value}T00:00:00.000Z`);
}

function optionalDateField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function parseNumberField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replaceAll(",", "");
  return raw ? Number(raw) : Number.NaN;
}

function optionalNumberField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replaceAll(",", "").trim();
  return raw ? Number(raw) : undefined;
}

function statusTone(status: string) {
  if (["APPROVED", "FULLY_LIQUIDATED", "CLOSED"].includes(status)) {
    return "success" as const;
  }
  if (
    [
      "AWAITING_APPROVAL",
      "RELEASE_PENDING",
      "RELEASED_OFFLINE",
      "PARTIALLY_LIQUIDATED",
      "RETURNED_FOR_REVISION",
      "ON_HOLD"
    ].includes(status)
  ) {
    return "warning" as const;
  }
  if (["REJECTED", "CANCELLED", "VOIDED"].includes(status)) {
    return "destructive" as const;
  }
  return "info" as const;
}

function dueStateTone(dueState: string) {
  if (dueState === "OVERDUE") {
    return "destructive" as const;
  }
  if (dueState === "DUE_SOON") {
    return "warning" as const;
  }
  if (dueState === "CLOSED") {
    return "success" as const;
  }
  return "neutral" as const;
}

const cashAdvanceActionLabels = {
  submit: "Submit",
  approve: "Approve",
  return: "Return",
  reject: "Reject",
  cancel: "Cancel",
  issue: "Record Issue",
  void_issue: "Void Issue",
  close: "Close"
} as const;

const liquidationActionLabels = {
  approve_liquidation: "Approve",
  return_liquidation: "Return",
  reject_liquidation: "Reject",
  cancel_liquidation: "Cancel",
  mark_liquidation_closure_ready: "Mark Closure Ready",
  reverse_liquidation: "Reverse",
  close_liquidation: "Close"
} as const;

function allowedCashAdvanceActions(input: {
  status: string;
  issuedAmountPhp: number;
  liquidatedAmountPhp: number;
  permissions: {
    canSubmit: boolean;
    canApprove: boolean;
    canReviewLiquidation: boolean;
  };
}) {
  const actions: Array<keyof typeof cashAdvanceActionLabels> = [];
  if (
    input.permissions.canSubmit &&
    ["DRAFT", "RETURNED_FOR_REVISION"].includes(input.status)
  ) {
    actions.push("submit");
  }
  if (input.permissions.canApprove && input.status === "AWAITING_APPROVAL") {
    actions.push("approve", "return", "reject");
  }
  if (
    input.permissions.canSubmit &&
    [
      "DRAFT",
      "SUBMITTED",
      "AWAITING_APPROVAL",
      "RETURNED_FOR_REVISION",
      "APPROVED",
      "RELEASE_PENDING",
      "ON_HOLD"
    ].includes(input.status)
  ) {
    actions.push("cancel");
  }
  if (
    input.permissions.canApprove &&
    ["APPROVED", "RELEASE_PENDING"].includes(input.status)
  ) {
    actions.push("issue");
  }
  if (
    input.permissions.canApprove &&
    input.status === "RELEASED_OFFLINE" &&
    input.issuedAmountPhp > 0 &&
    input.liquidatedAmountPhp <= 0
  ) {
    actions.push("void_issue");
  }
  if (input.permissions.canReviewLiquidation && input.status === "FULLY_LIQUIDATED") {
    actions.push("close");
  }
  return actions;
}

async function runCashAdvanceCreateAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const title = String(formData.get("title") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const categoryCode = String(formData.get("categoryCode") ?? "").trim();
  const requestDateText = String(formData.get("requestDate") ?? "").trim();
  const dueDateText = String(formData.get("dueDate") ?? "").trim();
  const requestedAmountPhp = parseNumberField(formData, "requestedAmountPhp");
  const supplierId =
    String(formData.get("supplierId") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;

  await createDraftCashAdvanceRequest(session, {
    title,
    purpose,
    categoryCode,
    requestedAmountPhp,
    requestDate: parseDateField(formData, "requestDate"),
    dueDate: optionalDateField(formData, "dueDate"),
    ...(supplierId ? { supplierId } : {}),
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: [
      "cash-advance-create-ui",
      session.user.id,
      requestDateText,
      dueDateText || "no-due-date",
      title,
      categoryCode,
      requestedAmountPhp
    ].join(":")
  });

  revalidatePath("/finance/cash-advances");
}

async function runCashAdvanceLiquidationSubmitAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const cashAdvanceRequestId = String(
    formData.get("cashAdvanceRequestId") ?? ""
  ).trim();
  const spendDateText = String(formData.get("spendDate") ?? "").trim();
  const categoryCode = String(formData.get("categoryCode") ?? "").trim();
  const evidenceReference = String(
    formData.get("evidenceReference") ?? ""
  ).trim();
  const supplierId =
    String(formData.get("supplierId") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const spendDate = parseDateField(formData, "spendDate");
  const lines = Array.from({ length: 5 }, (_, index) => {
    const lineNumber = index + 1;
    const description = String(
      formData.get(`description_${lineNumber}`) ?? ""
    ).trim();
    const amountPhp = optionalNumberField(formData, `amountPhp_${lineNumber}`);
    if (!description && amountPhp == null) {
      return null;
    }
    const receiptReference =
      String(formData.get(`receiptReference_${lineNumber}`) ?? "").trim() ||
      undefined;
    const taxAmountPhp = optionalNumberField(
      formData,
      `taxAmountPhp_${lineNumber}`
    );
    return {
      spendDate,
      description,
      categoryCode,
      amountPhp: amountPhp ?? Number.NaN,
      ...(taxAmountPhp == null ? {} : { taxAmountPhp }),
      ...(receiptReference ? { receiptReference } : {}),
      evidenceReference,
      ...(supplierId ? { supplierId } : {})
    };
  }).filter(Boolean) as Array<{
    spendDate: Date;
    description: string;
    categoryCode: string;
    amountPhp: number;
    taxAmountPhp?: number;
    receiptReference?: string;
    evidenceReference: string;
    supplierId?: string;
  }>;
  const claimedTotal = lines.reduce((sum, line) => sum + line.amountPhp, 0);

  await submitCashAdvanceLiquidation(session, {
    cashAdvanceRequestId,
    evidenceReference,
    ...(notes ? { notes } : {}),
    idempotencyKey: [
      "cash-advance-liquidation-ui",
      session.user.id,
      cashAdvanceRequestId,
      spendDateText,
      categoryCode,
      lines.map((line) => line.description).join("|"),
      claimedTotal
    ].join(":"),
    lines
  });

  revalidatePath("/finance/cash-advances");
}

async function runCashAdvanceLiquidationAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const liquidationId = String(formData.get("liquidationId") ?? "").trim();
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const baseInput = {
    liquidationId,
    idempotencyKey: `cash-advance-liquidation-ui:${liquidationId}:${action}:${reason ?? "none"}:${evidenceReference ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "approve_liquidation": {
      const approvedAmountPhp = optionalNumberField(
        formData,
        "approvedAmountPhp"
      );
      const amountReturnedPhp = optionalNumberField(
        formData,
        "amountReturnedPhp"
      );
      await approveCashAdvanceLiquidation(session, {
        ...baseInput,
        ...(approvedAmountPhp == null ? {} : { approvedAmountPhp }),
        ...(amountReturnedPhp == null ? {} : { amountReturnedPhp })
      });
      break;
    }
    case "return_liquidation":
      await returnCashAdvanceLiquidationForRevision(session, baseInput);
      break;
    case "reject_liquidation":
      await rejectCashAdvanceLiquidation(session, baseInput);
      break;
    case "cancel_liquidation":
      await cancelCashAdvanceLiquidation(session, baseInput);
      break;
    case "mark_liquidation_closure_ready":
      await markCashAdvanceLiquidationClosureReady(session, baseInput);
      break;
    case "reverse_liquidation":
      await reverseCashAdvanceLiquidation(session, baseInput);
      break;
    case "close_liquidation":
      await closeCashAdvanceLiquidation(session, baseInput);
      break;
    default:
      throw new Error("CASH_ADVANCE_LIQUIDATION_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/cash-advances");
}

async function runCashAdvanceDisbursementHandoffAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const cashAdvanceRequestId = String(
    formData.get("cashAdvanceRequestId") ?? ""
  ).trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const paymentReferenceLabel =
    String(formData.get("paymentReferenceLabel") ?? "").trim() || undefined;

  await createCashAdvanceDisbursementHandoff(session, {
    cashAdvanceRequestId,
    reason,
    ...(evidenceReference ? { evidenceReference } : {}),
    ...(paymentReferenceLabel ? { paymentReferenceLabel } : {}),
    idempotencyKey: `cash-advance-disbursement-ui:${cashAdvanceRequestId}`
  });

  revalidatePath("/finance/cash-advances");
}

async function runCashAdvanceAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const cashAdvanceRequestId = String(
    formData.get("cashAdvanceRequestId") ?? ""
  );
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const amountPhp = Number(formData.get("amountPhp") ?? 0);
  const referenceNo = String(formData.get("referenceNo") ?? "").trim() || undefined;
  const baseInput = {
    cashAdvanceRequestId,
    idempotencyKey: `cash-advance-ui:${cashAdvanceRequestId}:${action}:${referenceNo ?? "none"}:${reason ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "submit":
      await submitCashAdvanceForApproval(session, baseInput);
      break;
    case "approve":
      await approveCashAdvanceRequest(session, baseInput);
      break;
    case "return":
      await returnCashAdvanceForRevision(session, baseInput);
      break;
    case "reject":
      await rejectCashAdvanceRequest(session, baseInput);
      break;
    case "cancel":
      await cancelCashAdvanceRequest(session, baseInput);
      break;
    case "issue":
      await issueCashAdvanceOffline(session, {
        ...baseInput,
        amountPhp,
        ...(referenceNo ? { referenceNo } : {})
      });
      break;
    case "void_issue":
      await voidCashAdvanceOfflineIssue(session, baseInput);
      break;
    case "close":
      await closeCashAdvanceRequest(session, baseInput);
      break;
    default:
      throw new Error("CASH_ADVANCE_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/cash-advances");
}

async function archiveCashAdvanceEvidenceMetadata(formData: FormData) {
  "use server";

  const sourceType = String(formData.get("sourceType") ?? "").trim();
  if (
    sourceType !== "CASH_ADVANCE_REQUEST" &&
    sourceType !== "CASH_ADVANCE_LIQUIDATION"
  ) {
    throw new Error("CASH_ADVANCE_EVIDENCE_SOURCE_INVALID");
  }

  await archiveControlledEvidenceAttachment({
    controlledEvidenceAttachmentId: String(
      formData.get("controlledEvidenceAttachmentId") ?? ""
    ),
    archiveReason: String(formData.get("archiveReason") ?? "").trim(),
    requiredPermissionCode:
      sourceType === "CASH_ADVANCE_REQUEST"
        ? permissions.financeCashAdvanceCreate
        : permissions.financeCashAdvanceLiquidate
  });

  revalidatePath("/finance/cash-advances");
}

export default async function CashAdvancesPage({
  searchParams
}: CashAdvancesPageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (
    !canUseFinance(session.permissionCodes) ||
    !session.permissionCodes.includes(permissions.financeCashAdvanceView)
  ) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboard = await getCashAdvanceDashboard(session);
  const cashAdvanceEvidencePairs = await Promise.all(
    dashboard.advances.map(async (advance) => [
      advance.id,
      await listControlledEvidenceAttachments({
        sourceType: "CASH_ADVANCE_REQUEST",
        sourceRecordId: advance.id,
        requiredPermissionCode: permissions.financeCashAdvanceView
      })
    ] as const)
  );
  const cashAdvanceEvidenceById = new Map(cashAdvanceEvidencePairs);
  const liquidationEvidencePairs = await Promise.all(
    dashboard.liquidations.map(async (liquidation) => [
      liquidation.id,
      await listControlledEvidenceAttachments({
        sourceType: "CASH_ADVANCE_LIQUIDATION",
        sourceRecordId: liquidation.id,
        requiredPermissionCode: permissions.financeCashAdvanceView
      })
    ] as const)
  );
  const liquidationEvidenceById = new Map(liquidationEvidencePairs);
  const liquidatableAdvances = dashboard.advances.filter(
    (advance) =>
      ["RELEASED_OFFLINE", "PARTIALLY_LIQUIDATED"].includes(advance.status) &&
      advance.outstandingAmountPhp > 0
  );
  const canSubmitLiquidation =
    dashboard.permissions.canLiquidate && liquidatableAdvances.length > 0;
  const disbursementEligibleAdvances = dashboard.advances.filter(
    (advance) =>
      ["APPROVED", "RELEASE_PENDING"].includes(advance.status) &&
      advance.issuedAmountPhp <= 0 &&
      advance.disbursementRequestCount === 0 &&
      advance.payeeType !== "SUPPLIER"
  );
  const canCreateDisbursementHandoff =
    dashboard.permissions.canCreateDisbursement &&
    disbursementEligibleAdvances.length > 0;
  const canCreateCashAdvance = dashboard.permissions.canCreate;
  const recoveryExceptionRows = dashboard.reportRows.filter(
    (row) =>
      row.dueState === "OVERDUE" ||
      row.evidenceState === "MISSING" ||
      row.paymentHandoffReadiness === "NEEDS_PAYEE_CLASSIFICATION"
  );
  const tabs = [
    {
      id: "queue",
      label: "Advance queue",
      description: "Review outstanding advances and status.",
      count: dashboard.advances.length
    },
    {
      id: "actions",
      label: "Advance actions",
      description: "Submit, approve, issue, void, and close advances.",
      count: dashboard.advances.filter(
        (advance) =>
          allowedCashAdvanceActions({
            status: advance.status,
            issuedAmountPhp: advance.issuedAmountPhp,
            liquidatedAmountPhp: advance.liquidatedAmountPhp,
            permissions: dashboard.permissions
          }).length > 0
      ).length
    },
    {
      id: "liquidations",
      label: "Liquidations",
      description: "Submit and review liquidation records.",
      count: dashboard.liquidations.length
    },
    {
      id: "handoffs",
      label: "Disbursement handoffs",
      description: "Prepare controlled non-supplier disbursement requests.",
      count: dashboard.disbursementRequests.length
    },
    {
      id: "reports",
      label: "Reports",
      description: "Recovery exceptions and cash advance exposure.",
      count: dashboard.reportRows.length
    },
    {
      id: "controls",
      label: "Controls",
      description: "Recovery policy and guardrails."
    }
  ];
  const activeTab = tabs.some((tab) => tab.id === resolvedSearchParams?.tab)
    ? String(resolvedSearchParams?.tab)
    : "queue";
  const paginate = <T,>(rows: T[]) => {
    const pagination = getPaginationState(rows.length, resolvedSearchParams?.page);
    return {
      pagination,
      rows: rows.slice(pagination.startIndex, pagination.endIndex)
    };
  };
  const pagedDisbursementRows = paginate(dashboard.disbursementRequests);
  const pagedRecoveryRows = paginate(recoveryExceptionRows);
  const pagedReportRows = paginate(dashboard.reportRows);
  const pagedActionAdvances = paginate(dashboard.advances);
  const pagedLiquidations = paginate(dashboard.liquidations);
  const pagedQueueAdvances = paginate(dashboard.advances);

  return (
    <AppShell
      session={session}
      title="Cash Advances"
      subtitle="Controlled advances, liquidation readiness, and outstanding cash visibility"
      activeNav="cash-advances"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Cash advances stop before payment and posting.</strong>{" "}
              Service actions now control submission, approval, offline issue,
              liquidation review, closure, evidence, and outstanding exposure while
              payment release, journals, and reconciliation remain separate controls.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Linked expense and payment records are trace references only. They are
              not approved, settled, or mutated by cash advance actions.
            </p>
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Employee and custodian disbursement handoff now creates a controlled
              non-supplier disbursement request only. Payment release, bank
              movement, journals, and supplier AP settlement remain separate
              controls under the P3-BLOCK-001 production settlement UAT gate.
            </p>
            <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <p className="font-semibold">Recovery policy</p>
              <p className="mt-1">
                Due-soon window: {dashboard.recoveryPolicy.policy.dueSoonDays}{" "}
                day(s); escalation review:{" "}
                {dashboard.recoveryPolicy.policy.overdueEscalationDays} day(s)
                overdue. Due-date extensions require evidence:{" "}
                {dashboard.recoveryPolicy.policy
                  .requireEvidenceForDueDateExtension
                  ? "Yes"
                  : "No"}
                .
              </p>
              <p className="mt-1 text-blue-700">
                {dashboard.recoveryPolicy.policy.decisionBasis}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EntryModal
              title="Create Cash Advance Request"
              triggerLabel="Create Cash Advance"
              disabled={!canCreateCashAdvance}
            >
              <form action={runCashAdvanceCreateAction} className="grid gap-4 pt-5">
                {!canCreateCashAdvance ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Cash advance creation needs the cash advance create
                    permission in this finance scope.
                  </div>
                ) : null}
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Request title
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="title"
                      placeholder="Emergency branch operating cash"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Category
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="categoryCode"
                      defaultValue={dashboard.draftOptions.categories[0]?.id ?? ""}
                      required
                    >
                      {dashboard.draftOptions.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Request date
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="requestDate"
                      required
                      type="date"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Liquidation due date
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="dueDate"
                      type="date"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Requested amount
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      min="0.01"
                      name="requestedAmountPhp"
                      placeholder="0.00"
                      required
                      step="0.01"
                      type="number"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Supplier
                    </span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="supplierId"
                      defaultValue=""
                    >
                      <option value="">No supplier linked</option>
                      {dashboard.draftOptions.suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Purpose
                  </span>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="purpose"
                    placeholder="Operational reason, expected use, and liquidation plan"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    External evidence reference
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="evidenceReference"
                    placeholder="Approval memo, incident reference, or supporting note"
                  />
                </label>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
                  This creates a draft only. It does not release cash, create a
                  payment, post a journal, or mutate bank records.
                </div>
                <button
                  className="inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!canCreateCashAdvance}
                  type="submit"
                >
                  Create Draft Cash Advance
                </button>
              </form>
            </EntryModal>
            <Badge tone="info">Non-posting foundation</Badge>
          </div>
        </div>
      </div>

      <nav
        aria-label="Cash advance sections"
        className="mb-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                aria-current={selected ? "page" : undefined}
                className={cx(
                  "flex min-w-44 flex-col rounded-xl px-4 py-3 text-left transition",
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-50"
                )}
                href={`/finance/cash-advances?tab=${tab.id}`}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-bold">
                  {tab.label}
                  {tab.count != null ? (
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        selected
                          ? "bg-white/20 text-white"
                          : "bg-blue-50 text-blue-700"
                      )}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    "mt-1 text-xs leading-5",
                    selected
                      ? "text-blue-50"
                      : "text-slate-500"
                  )}
                >
                  {tab.description}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {activeTab === "liquidations" && dashboard.permissions.canLiquidate ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Submit Cash Advance Liquidation
              </h2>
              <p className="text-sm text-slate-500">
                Submit up to five receipt lines against an issued advance in this
                view. Review, closure, payment, bank, and journals stay separate.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={canSubmitLiquidation ? "info" : "warning"}>
                Multi-line entry
              </Badge>
              <EntryModal
                title="Submit Cash Advance Liquidation"
                triggerLabel="Submit Liquidation"
                disabled={!canSubmitLiquidation}
              >

          <form
            action={runCashAdvanceLiquidationSubmitAction}
            className="grid gap-4 pt-5"
          >
            {!canSubmitLiquidation ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Liquidation entry needs at least one issued advance with an
                outstanding amount in the selected scope.
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Cash advance
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="cashAdvanceRequestId"
                  defaultValue={liquidatableAdvances[0]?.id ?? ""}
                  required
                >
                  {liquidatableAdvances.map((advance) => (
                    <option key={advance.id} value={advance.id}>
                      {advance.publicReference} / {advance.title} /{" "}
                      {formatMoney(advance.outstandingAmountPhp)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Spend date
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="spendDate"
                  type="date"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Category
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="categoryCode"
                  defaultValue={dashboard.draftOptions.categories[0]?.id ?? ""}
                  required
                >
                  {dashboard.draftOptions.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Supplier
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="supplierId"
                  defaultValue=""
                >
                  <option value="">No supplier linked</option>
                  {dashboard.draftOptions.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Notes
                </span>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="notes"
                  placeholder="Operational context or reviewer note"
                />
              </label>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    Liquidation lines
                  </p>
                  <p className="text-xs text-slate-500">
                    Fill line 1 at minimum. Blank rows are ignored.
                  </p>
                </div>
                <Badge tone="info">Up to 5 lines</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[56rem] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3">#</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="w-36 px-4 py-3">Amount</th>
                      <th className="w-36 px-4 py-3">Tax</th>
                      <th className="w-44 px-4 py-3">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[1, 2, 3, 4, 5].map((lineNumber) => (
                      <tr key={`cash-advance-liquidation-line-${lineNumber}`}>
                        <td className="px-4 py-3 text-slate-500">
                          {lineNumber}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            name={`description_${lineNumber}`}
                            placeholder={
                              lineNumber === 1
                                ? "What was purchased or paid"
                                : "Optional line"
                            }
                            required={lineNumber === 1}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            min="0.01"
                            name={`amountPhp_${lineNumber}`}
                            placeholder="0.00"
                            required={lineNumber === 1}
                            step="0.01"
                            type="number"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            min="0"
                            name={`taxAmountPhp_${lineNumber}`}
                            placeholder="0.00"
                            step="0.01"
                            type="number"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            name={`receiptReference_${lineNumber}`}
                            placeholder="OR/SI/voucher"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-1">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  External evidence reference
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="evidenceReference"
                  placeholder="Receipt packet, photo, or claim file reference"
                  required
                />
              </label>
            </div>

            <button
              className="inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canSubmitLiquidation}
              type="submit"
            >
              Submit Liquidation
            </button>
          </form>
              </EntryModal>
            </div>
          </div>
        </section>
      ) : null}

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "handoffs" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Non-supplier Disbursement Handoffs
            </h2>
            <p className="text-sm text-slate-500">
              Convert approved employee or custodian cash advances into controlled
              draft disbursement requests without releasing cash or posting bank,
              AP, or journal entries.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={canCreateDisbursementHandoff ? "info" : "neutral"}>
              {dashboard.disbursementRequests.length} handoff request
              {dashboard.disbursementRequests.length === 1 ? "" : "s"}
            </Badge>
            <EntryModal
              title="Create Non-supplier Disbursement Handoff"
              triggerLabel="Create Disbursement Handoff"
              disabled={!canCreateDisbursementHandoff}
            >
              <form
                action={runCashAdvanceDisbursementHandoffAction}
                className="grid gap-4 pt-5"
              >
                {!canCreateDisbursementHandoff ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Handoff needs an approved or release-pending non-supplier
                    cash advance with no issued amount and no existing
                    disbursement request.
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Cash advance
                  </span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="cashAdvanceRequestId"
                    defaultValue={disbursementEligibleAdvances[0]?.id ?? ""}
                    required
                  >
                    {disbursementEligibleAdvances.map((advance) => (
                      <option key={advance.id} value={advance.id}>
                        {advance.publicReference} / {advance.payeeLabel} /{" "}
                        {formatMoney(advance.requestedAmountPhp)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Payee payment reference
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="paymentReferenceLabel"
                      placeholder="Employee/custodian cash advance"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      External evidence reference
                    </span>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      name="evidenceReference"
                      placeholder="Approved advance, voucher, or memo reference"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Handoff reason
                  </span>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    name="reason"
                    placeholder="Why this approved advance is ready for controlled disbursement preparation"
                    required
                  />
                </label>
                <button
                  className="inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!canCreateDisbursementHandoff}
                  type="submit"
                >
                  Create Disbursement Handoff
                </button>
              </form>
            </EntryModal>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Request</th>
                <th className="px-5 py-3">Payee / Scope</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.disbursementRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No disbursement handoffs yet
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Approved non-supplier advances can be converted into draft
                      disbursement requests here after finance review.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedDisbursementRows.rows.map((request) => (
                  <tr key={request.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {request.publicReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Requested by {request.requestedByName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {request.payeeLabel}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.payeeType.replaceAll("_", " ")} /{" "}
                        {request.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {request.sourceType.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.cashAdvanceReference}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-950">
                      {formatMoney(request.amountPhp)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(request.status)} size="sm">
                        {request.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {request.evidenceReference ?? "Pending evidence"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          basePath="/finance/cash-advances"
          tab={activeTab}
          page={pagedDisbursementRows.pagination.page}
          totalPages={pagedDisbursementRows.pagination.totalPages}
          totalCount={dashboard.disbursementRequests.length}
          startIndex={pagedDisbursementRows.pagination.startIndex}
          endIndex={pagedDisbursementRows.pagination.endIndex}
        />
      </section>

      <div
        className={cx(
          "mb-5 grid gap-4 md:grid-cols-4",
          activeTab === "reports" ? "" : "hidden"
        )}
      >
        {dashboard.metrics.map((metric) => {
          const Icon =
            metricIcons[metric.id as keyof typeof metricIcons] ?? FileText;
          return (
            <Panel key={metric.id} className="ogfi-metric-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-2 truncate text-2xl font-bold text-slate-950">
                    {metric.displayValue}
                  </p>
                </div>
                <span className="ogfi-icon-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">
                {metric.detail}
              </p>
              <Badge tone={metric.tone} size="sm">
                Cash control
              </Badge>
            </Panel>
          );
        })}
      </div>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "reports" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Recovery & Evidence Exceptions
            </h2>
            <p className="text-sm text-slate-500">
              Follow-up list for overdue advances, missing evidence, or payee
              classification gaps before production settlement or UAT signoff.
            </p>
          </div>
          <Badge tone={recoveryExceptionRows.length > 0 ? "warning" : "success"}>
            {recoveryExceptionRows.length} exception
            {recoveryExceptionRows.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Advance</th>
                <th className="px-5 py-3">Payee / Scope</th>
                <th className="px-5 py-3">Exposure</th>
                <th className="px-5 py-3">Exception</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recoveryExceptionRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No recovery exceptions in this scope
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Overdue liquidation, missing evidence, and payee
                      classification gaps appear here when they need follow-up.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedRecoveryRows.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {row.publicReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{row.title}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.payeeLabel}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {formatMoney(row.outstandingAmountPhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Issued {formatMoney(row.issuedAmountPhp)} / liquidated{" "}
                        {formatMoney(row.liquidatedAmountPhp)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={dueStateTone(row.dueState)} size="sm">
                          {row.dueState.replaceAll("_", " ")}
                        </Badge>
                        <Badge
                          tone={
                            row.evidenceState === "COMPLETE"
                              ? "success"
                              : "warning"
                          }
                          size="sm"
                        >
                          {row.evidenceState}
                        </Badge>
                        <Badge
                          tone={
                            row.paymentHandoffReadiness ===
                            "NEEDS_PAYEE_CLASSIFICATION"
                              ? "warning"
                              : "info"
                          }
                          size="sm"
                        >
                          {row.paymentHandoffReadiness.replaceAll("_", " ")}
                        </Badge>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          basePath="/finance/cash-advances"
          tab={activeTab}
          page={pagedRecoveryRows.pagination.page}
          totalPages={pagedRecoveryRows.pagination.totalPages}
          totalCount={recoveryExceptionRows.length}
          startIndex={pagedRecoveryRows.pagination.startIndex}
          endIndex={pagedRecoveryRows.pagination.endIndex}
        />
      </section>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "reports" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Cash Advance Report Preview
            </h2>
            <p className="text-sm text-slate-500">
              Export-ready scoped rows for outstanding exposure, due-state,
              liquidation count, evidence, and movement traceability.
            </p>
          </div>
          <Badge tone="info">
            {dashboard.reportRows.length} report rows
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Advance</th>
                <th className="px-5 py-3">Beneficiary / Scope</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Due / Evidence</th>
                <th className="px-5 py-3">Cash Exposure</th>
                <th className="px-5 py-3">Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.reportRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No report rows yet
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Cash advance report rows appear once controlled advances
                      exist in the selected scope.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedReportRows.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {row.publicReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{row.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.categoryCode}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.beneficiaryName}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Payee {row.payeeLabel} / {row.payeeType.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.locationName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.supplierName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(row.status)} size="sm">
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={dueStateTone(row.dueState)} size="sm">
                          {row.dueState.replaceAll("_", " ")}
                        </Badge>
                        <Badge
                          tone={
                            row.evidenceState === "COMPLETE" ? "success" : "warning"
                          }
                          size="sm"
                        >
                          {row.evidenceState}
                        </Badge>
                        <Badge
                          tone={
                            row.paymentHandoffReadiness ===
                            "PAYEE_IDENTIFIED_NO_SETTLEMENT"
                              ? "info"
                              : "warning"
                          }
                          size="sm"
                        >
                          {row.paymentHandoffReadiness.replaceAll("_", " ")}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {formatMoney(row.outstandingAmountPhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Issued {formatMoney(row.issuedAmountPhp)} / liquidated{" "}
                        {formatMoney(row.liquidatedAmountPhp)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.movementCount} movement(s)
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.liquidationCount} liquidation(s)
                      </p>
                      <p className="mt-2 max-w-md text-xs text-slate-500">
                        {row.exportSafeSummary}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          basePath="/finance/cash-advances"
          tab={activeTab}
          page={pagedReportRows.pagination.page}
          totalPages={pagedReportRows.pagination.totalPages}
          totalCount={dashboard.reportRows.length}
          startIndex={pagedReportRows.pagination.startIndex}
          endIndex={pagedReportRows.pagination.endIndex}
        />
      </section>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "actions" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Cash Advance Actions
            </h2>
            <p className="text-sm text-slate-500">
              Request-level transitions for approval, offline issue evidence, and
              closure. Liquidation entry remains a separate transaction workflow.
            </p>
          </div>
          <Badge tone="info">{dashboard.advances.length} advance records</Badge>
        </div>

        <div className="divide-y divide-slate-100">
          {dashboard.advances.length === 0 ? (
            <div className="p-6">
              <p className="font-semibold text-slate-950">
                No cash advance actions available
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Request-level actions appear here when cash advances exist in the
                selected scope.
              </p>
            </div>
          ) : (
            pagedActionAdvances.rows.map((advance) => {
              const actions = allowedCashAdvanceActions({
                status: advance.status,
                issuedAmountPhp: advance.issuedAmountPhp,
                liquidatedAmountPhp: advance.liquidatedAmountPhp,
                permissions: dashboard.permissions
              });
              return (
                <div
                  key={advance.id}
                  className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_26rem] xl:items-start"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">{advance.title}</p>
                      <Badge tone={statusTone(advance.status)} size="sm">
                        {advance.status.replaceAll("_", " ")}
                      </Badge>
                      <Badge tone="neutral" size="sm">
                        {advance.sourceType.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {advance.publicReference} / {advance.requesterName} /{" "}
                      {advance.locationName}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Payee {advance.payeeLabel} /{" "}
                      {advance.payeeType.replaceAll("_", " ")} /{" "}
                      {advance.paymentHandoffReadiness.replaceAll("_", " ")}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      Requested {formatMoney(advance.requestedAmountPhp)} / issued{" "}
                      {formatMoney(advance.issuedAmountPhp)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Outstanding {formatMoney(advance.outstandingAmountPhp)},{" "}
                      evidence {advance.evidenceReference ?? "pending"}
                    </p>
                    <ControlledEvidencePanel
                      archiveAction={archiveCashAdvanceEvidenceMetadata}
                      attachments={cashAdvanceEvidenceById.get(advance.id) ?? []}
                      canAdd={dashboard.permissions.canCreate}
                      requiredForAction="RELEASE"
                      sourceRecordId={advance.id}
                      sourceType="CASH_ADVANCE_REQUEST"
                      triggerLabel="Add Advance Evidence"
                    />
                  </div>

                  <div className="flex items-start justify-end">
                    {actions.length === 0 ? (
                      <Badge tone="neutral">No available action</Badge>
                    ) : (
                      <EntryModal
                        title={`Manage ${advance.publicReference}`}
                        triggerLabel="Manage Actions"
                        triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        <form action={runCashAdvanceAction} className="grid gap-4 pt-5">
                          <input
                            name="cashAdvanceRequestId"
                            type="hidden"
                            value={advance.id}
                          />
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="font-bold text-slate-950">
                              {advance.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {advance.publicReference} / {advance.requesterName} /{" "}
                              {formatMoney(advance.requestedAmountPhp)}
                            </p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Reason
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="reason"
                                placeholder="Required for return, reject, cancel, issue, void, close"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                External evidence reference
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="evidenceReference"
                                placeholder="Release proof, liquidation package, or memo"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Issue amount
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                min="0"
                                name="amountPhp"
                                placeholder="0.00"
                                step="0.01"
                                type="number"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Release reference
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="referenceNo"
                                placeholder="Offline cash voucher or proof no."
                              />
                            </label>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                            {actions.map((action) => (
                              <button
                                key={action}
                                className={
                                  action === "reject" ||
                                  action === "cancel" ||
                                  action === "void_issue"
                                    ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                    : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                }
                                name="action"
                                type="submit"
                                value={action}
                              >
                                {cashAdvanceActionLabels[action]}
                              </button>
                            ))}
                          </div>
                        </form>
                      </EntryModal>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <FinancePagination
          basePath="/finance/cash-advances"
          tab={activeTab}
          page={pagedActionAdvances.pagination.page}
          totalPages={pagedActionAdvances.pagination.totalPages}
          totalCount={dashboard.advances.length}
          startIndex={pagedActionAdvances.pagination.startIndex}
          endIndex={pagedActionAdvances.pagination.endIndex}
        />
      </section>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "liquidations" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Liquidation Actions
            </h2>
            <p className="text-sm text-slate-500">
              Review submitted liquidations, record closure readiness, and close
              liquidation packages without posting payment, bank, or journal entries.
            </p>
          </div>
          <Badge tone="info">
            {dashboard.liquidations.length} liquidation records
          </Badge>
        </div>

        <div className="divide-y divide-slate-100">
          {dashboard.liquidations.length === 0 ? (
            <div className="p-6">
              <p className="font-semibold text-slate-950">
                No liquidation actions available
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Liquidation review actions appear after an issued advance has a
                submitted liquidation package.
              </p>
            </div>
          ) : (
            pagedLiquidations.rows.map((liquidation) => (
              <div
                key={liquidation.id}
                className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_26rem] xl:items-start"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">
                      {liquidation.publicReference}
                    </p>
                    <Badge tone={statusTone(liquidation.status)} size="sm">
                      {liquidation.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {liquidation.advanceReference} / {liquidation.advanceTitle}
                  </p>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Submitted by
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {liquidation.submittedByName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Claimed / approved
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {formatMoney(liquidation.claimedAmountPhp)} /{" "}
                        {formatMoney(liquidation.approvedAmountPhp)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Evidence
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {liquidation.evidenceReference ?? "Pending evidence"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {liquidation.lineCount} line(s), submitted{" "}
                    {formatDate(liquidation.submittedAt)}
                  </p>
                  <ControlledEvidencePanel
                    archiveAction={archiveCashAdvanceEvidenceMetadata}
                    attachments={liquidationEvidenceById.get(liquidation.id) ?? []}
                    canAdd={dashboard.permissions.canLiquidate}
                    requiredForAction="LIQUIDATION_REVIEW"
                    sourceRecordId={liquidation.id}
                    sourceType="CASH_ADVANCE_LIQUIDATION"
                    triggerLabel="Add Liquidation Evidence"
                  />
                </div>

                <div className="flex items-start justify-end">
                  {liquidation.allowedActions.length === 0 ? (
                    <Badge tone="neutral">No available action</Badge>
                  ) : (
                    <EntryModal
                      title={`Review ${liquidation.publicReference}`}
                      triggerLabel="Manage Actions"
                      triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      <form
                        action={runCashAdvanceLiquidationAction}
                        className="grid gap-4 pt-5"
                      >
                        <input
                          name="liquidationId"
                          type="hidden"
                          value={liquidation.id}
                        />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="font-bold text-slate-950">
                            {liquidation.advanceTitle}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {liquidation.publicReference} / claimed{" "}
                            {formatMoney(liquidation.claimedAmountPhp)}
                          </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Reason
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="reason"
                              placeholder="Required for review, cancellation, reversal, and closure"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              External evidence reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="evidenceReference"
                              placeholder="Reviewed packet, receipt set, or memo"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Approved amount
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              min="0"
                              name="approvedAmountPhp"
                              placeholder={String(liquidation.claimedAmountPhp)}
                              step="0.01"
                              type="number"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Amount returned
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              min="0"
                              name="amountReturnedPhp"
                              placeholder="Optional"
                              step="0.01"
                              type="number"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                          {liquidation.allowedActions.map((action) => (
                            <button
                              key={action}
                              className={
                                action === "reject_liquidation" ||
                                action === "cancel_liquidation"
                                  ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                  : action === "reverse_liquidation"
                                    ? "rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50"
                                    : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                              }
                              name="action"
                              type="submit"
                              value={action}
                            >
                              {liquidationActionLabels[action]}
                            </button>
                          ))}
                        </div>
                      </form>
                    </EntryModal>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <FinancePagination
          basePath="/finance/cash-advances"
          tab={activeTab}
          page={pagedLiquidations.pagination.page}
          totalPages={pagedLiquidations.pagination.totalPages}
          totalCount={dashboard.liquidations.length}
          startIndex={pagedLiquidations.pagination.startIndex}
          endIndex={pagedLiquidations.pagination.endIndex}
        />
      </section>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "queue" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Advance Queue
            </h2>
            <p className="text-sm text-slate-500">
              Scoped cash advances, liquidation progress, due dates, and evidence
              references.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={dashboard.permissions.canCreate ? "success" : "neutral"}>
              Create {dashboard.permissions.canCreate ? "enabled" : "disabled"}
            </Badge>
            <Badge tone={dashboard.permissions.canApprove ? "success" : "neutral"}>
              Approve {dashboard.permissions.canApprove ? "enabled" : "disabled"}
            </Badge>
            <Badge
              tone={
                dashboard.permissions.canReviewLiquidation ? "success" : "neutral"
              }
            >
              Review {dashboard.permissions.canReviewLiquidation ? "enabled" : "disabled"}
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Advance</th>
                <th className="px-5 py-3">Requester / Scope</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Liquidation</th>
                <th className="px-5 py-3">Evidence</th>
                <th className="px-5 py-3">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.advances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No cash advances in this scope yet
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Draft, approved, released, and liquidated advances will
              appear here as controlled cash-advance and liquidation actions are
              recorded for the selected scope.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedQueueAdvances.rows.map((advance) => (
                  <tr key={advance.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">{advance.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {advance.publicReference} / {advance.categoryCode}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {advance.supplierName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {advance.requesterName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Beneficiary: {advance.beneficiaryName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {advance.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusTone(advance.status)} size="sm">
                          {advance.status}
                        </Badge>
                        <Badge tone="neutral" size="sm">
                          {advance.sourceType}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Requested {formatDate(advance.requestDate)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {formatMoney(advance.requestedAmountPhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Issued {formatMoney(advance.issuedAmountPhp)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        Outstanding {formatMoney(advance.outstandingAmountPhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Liquidated {formatMoney(advance.liquidatedAmountPhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {advance.liquidationCount} liquidation(s),{" "}
                        {advance.movementCount} movement(s)
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {advance.evidenceReference ?? "Pending evidence"}
                      </p>
                      {cashAdvanceEvidenceById.get(advance.id)?.length ? (
                        <p className="mt-1 text-xs font-semibold text-blue-700">
                          {cashAdvanceEvidenceById.get(advance.id)?.length} metadata
                          evidence link
                          {cashAdvanceEvidenceById.get(advance.id)?.length === 1
                            ? ""
                            : "s"}
                        </p>
                      ) : null}
                      <Badge
                        tone={
                          advance.budgetStatus === "OVER_BUDGET"
                            ? "destructive"
                            : advance.budgetStatus === "UNBUDGETED"
                              ? "warning"
                              : "success"
                        }
                        size="sm"
                      >
                        {advance.budgetStatus}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {formatDate(advance.dueDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          basePath="/finance/cash-advances"
          tab={activeTab}
          page={pagedQueueAdvances.pagination.page}
          totalPages={pagedQueueAdvances.pagination.totalPages}
          totalCount={dashboard.advances.length}
          startIndex={pagedQueueAdvances.pagination.startIndex}
          endIndex={pagedQueueAdvances.pagination.endIndex}
        />
      </section>

      <section
        className={cx(
          "ogfi-data-surface overflow-hidden",
          activeTab === "controls" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Guardrails
            </h2>
            <p className="text-sm text-slate-500">
              Cash advance boundaries before payment release, journals, and bank
              reconciliation.
            </p>
          </div>
          <Badge tone="info">Phase 3 foundation</Badge>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {dashboard.guardrails.map((guardrail) => (
            <div
              key={guardrail.label}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <Badge tone={guardrail.tone} size="sm">
                Guardrail
              </Badge>
              <p className="mt-3 font-bold text-slate-950">{guardrail.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {guardrail.detail}
              </p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
