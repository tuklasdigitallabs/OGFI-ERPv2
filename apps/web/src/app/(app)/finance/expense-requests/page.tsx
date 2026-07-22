import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  FileText,
  LockKeyhole,
  ReceiptText
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
  archiveControlledEvidenceAttachment,
  listControlledEvidenceAttachments
} from "@/server/services/attachments";
import {
  canUseFinance,
  getDefaultAppRoute,
  permissions
} from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import { canonicalApprovalDecisionsEnabled } from "@/server/services/approvalDecisionMode";
import { routeSourceWorkspaceApprovalDecision } from "@/server/services/sourceApprovalDecisionBridge";
import {
  approveExpenseRequest,
  cancelExpenseRequest,
  completeExpenseRequest,
  createDraftExpenseRequest,
  createExpenseRequestApInvoiceDraft,
  getExpenseRequestDashboard,
  markExpenseRequestPaymentHandoffReady,
  rejectExpenseRequest,
  returnExpenseRequestForRevision,
  submitExpenseRequestForApproval
} from "@/server/services/expenseRequests";

export const dynamic = "force-dynamic";

type ExpenseRequestsPageProps = {
  searchParams?: Promise<{ page?: string; tab?: string }>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const metricIcons = {
  "open-expense-requests": ClipboardList,
  "pending-approval": BadgeCheck,
  "open-value": ReceiptText,
  "budget-exceptions": AlertTriangle
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

function parseOptionalDateField(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function optionalNumberField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replaceAll(",", "").trim();
  return raw ? Number(raw) : undefined;
}

function statusTone(status: string) {
  if (["APPROVED", "COMPLETED"].includes(status)) {
    return "success" as const;
  }
  if (["AWAITING_APPROVAL", "ON_HOLD", "RETURNED_FOR_REVISION"].includes(status)) {
    return "warning" as const;
  }
  if (["REJECTED", "CANCELLED", "REVERSED", "VOIDED"].includes(status)) {
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

const expenseActionLabels = {
  submit: "Submit",
  approve: "Approve",
  return: "Return",
  reject: "Reject",
  cancel: "Cancel",
  complete: "Complete",
  handoff_ready: "Mark Handoff Ready",
  create_ap_invoice: "Create AP Draft"
} as const;

function allowedExpenseActions(input: {
  status: string;
  canonicalApprovalDecisions: boolean;
  permissions: {
    canSubmit: boolean;
    canApprove: boolean;
    canComplete: boolean;
  };
}) {
  const actions: Array<keyof typeof expenseActionLabels> = [];
  if (
    input.permissions.canSubmit &&
    ["DRAFT", "RETURNED_FOR_REVISION"].includes(input.status)
  ) {
    actions.push("submit");
  }
  if (
    !input.canonicalApprovalDecisions &&
    input.permissions.canApprove &&
    input.status === "AWAITING_APPROVAL"
  ) {
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
      "ON_HOLD"
    ].includes(input.status)
  ) {
    actions.push("cancel");
  }
  if (input.permissions.canComplete && ["APPROVED", "IN_PROGRESS"].includes(input.status)) {
    actions.push("complete", "handoff_ready", "create_ap_invoice");
  }
  if (input.permissions.canComplete && input.status === "COMPLETED") {
    actions.push("create_ap_invoice");
  }
  return actions;
}

async function runExpenseRequestDraftAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const title = String(formData.get("title") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
  const categoryCode = String(formData.get("categoryCode") ?? "").trim();
  const requestDateText = String(formData.get("requestDate") ?? "").trim();
  const requiredByDateText = String(formData.get("requiredByDate") ?? "").trim();
  const requestDate = parseDateField(formData, "requestDate");
  const requiredByDate = parseOptionalDateField(formData, "requiredByDate");
  const lines = Array.from({ length: 5 }, (_, index) => {
    const lineNumber = index + 1;
    const lineDescription = String(
      formData.get(`lineDescription_${lineNumber}`) ?? ""
    ).trim();
    const requestedAmountPhp = optionalNumberField(
      formData,
      `requestedAmountPhp_${lineNumber}`
    );
    if (!lineDescription && requestedAmountPhp == null) {
      return null;
    }
    return {
      lineDescription,
      lineDate: requestDate,
      requestedAmountPhp: requestedAmountPhp ?? Number.NaN,
      taxAmountPhp: optionalNumberField(formData, `taxAmountPhp_${lineNumber}`),
      discountAmountPhp: optionalNumberField(
        formData,
        `discountAmountPhp_${lineNumber}`
      )
    };
  }).filter(Boolean) as Array<{
    lineDescription: string;
    lineDate: Date;
    requestedAmountPhp: number;
    taxAmountPhp: number | null;
    discountAmountPhp: number | null;
  }>;
  const firstLine = lines[0];
  const requestedTotal = lines.reduce(
    (sum, line) =>
      sum +
      line.requestedAmountPhp +
      (line.taxAmountPhp ?? 0) -
      (line.discountAmountPhp ?? 0),
    0
  );

  await createDraftExpenseRequest(session, {
    title,
    requestReason: String(formData.get("requestReason") ?? "").trim(),
    urgency: String(formData.get("urgency") ?? "NORMAL") as
      | "NORMAL"
      | "URGENT"
      | "EMERGENCY",
    requestDate,
    requiredByDate,
    locationId,
    supplierId,
    categoryCode,
    expenseType: String(formData.get("expenseType") ?? "").trim() || "OPERATING",
    branchImpactFlag: formData.get("branchImpactFlag") === "on",
    evidenceReference:
      String(formData.get("evidenceReference") ?? "").trim() || undefined,
    lineDescription: firstLine?.lineDescription ?? "",
    lineDate: requestDate,
    requestedAmountPhp: firstLine?.requestedAmountPhp ?? Number.NaN,
    taxAmountPhp: firstLine?.taxAmountPhp ?? undefined,
    discountAmountPhp: firstLine?.discountAmountPhp ?? undefined,
    lines: lines.map((line) => ({
      lineDescription: line.lineDescription,
      lineDate: line.lineDate,
      requestedAmountPhp: line.requestedAmountPhp,
      taxAmountPhp: line.taxAmountPhp ?? undefined,
      discountAmountPhp: line.discountAmountPhp ?? undefined
    })),
    budgetLineId: String(formData.get("budgetLineId") ?? "").trim() || null,
    idempotencyKey: [
      "expense-draft-ui",
      session.user.id,
      locationId,
      supplierId ?? "no-supplier",
      categoryCode,
      title,
      lines.map((line) => line.lineDescription).join("|"),
      requestDateText,
      requiredByDateText || "no-required-date",
      requestedTotal
    ].join(":")
  });

  revalidatePath("/finance/expense-requests");
}

async function runExpenseRequestAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const expenseRequestId = String(formData.get("expenseRequestId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const supplierInvoiceNumber =
    String(formData.get("supplierInvoiceNumber") ?? "").trim() || undefined;
  const baseInput = {
    expenseRequestId,
    idempotencyKey: `expense-ui:${expenseRequestId}:${action}:${reason ?? "none"}:${evidenceReference ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "submit":
      await submitExpenseRequestForApproval(session, baseInput);
      break;
    case "approve":
      if (!(await routeSourceWorkspaceApprovalDecision(session, {
        documentType: "ExpenseRequest",
        documentId: expenseRequestId,
        action: "approve",
        remarks: reason,
        evidenceReference
      }))) {
        await approveExpenseRequest(session, baseInput);
      }
      break;
    case "return":
      if (!(await routeSourceWorkspaceApprovalDecision(session, {
        documentType: "ExpenseRequest",
        documentId: expenseRequestId,
        action: "return",
        remarks: reason ?? "",
        evidenceReference
      }))) {
        await returnExpenseRequestForRevision(session, baseInput);
      }
      break;
    case "reject":
      if (!(await routeSourceWorkspaceApprovalDecision(session, {
        documentType: "ExpenseRequest",
        documentId: expenseRequestId,
        action: "reject",
        remarks: reason ?? "",
        evidenceReference
      }))) {
        await rejectExpenseRequest(session, baseInput);
      }
      break;
    case "cancel":
      await cancelExpenseRequest(session, baseInput);
      break;
    case "complete":
      await completeExpenseRequest(session, baseInput);
      break;
    case "handoff_ready":
      await markExpenseRequestPaymentHandoffReady(session, baseInput);
      break;
    case "create_ap_invoice":
      await createExpenseRequestApInvoiceDraft(session, {
        ...baseInput,
        ...(supplierInvoiceNumber ? { supplierInvoiceNumber } : {})
      });
      break;
    default:
      throw new Error("EXPENSE_REQUEST_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/expense-requests");
}

async function archiveExpenseEvidenceMetadata(formData: FormData) {
  "use server";

  await archiveControlledEvidenceAttachment({
    controlledEvidenceAttachmentId: String(
      formData.get("controlledEvidenceAttachmentId") ?? ""
    ),
    archiveReason: String(formData.get("archiveReason") ?? "").trim(),
    requiredPermissionCode: permissions.financeExpenseRequestCreate
  });

  revalidatePath("/finance/expense-requests");
}

export default async function ExpenseRequestsPage({
  searchParams
}: ExpenseRequestsPageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (
    !canUseFinance(session.permissionCodes) ||
    !session.permissionCodes.includes(permissions.financeExpenseRequestView)
  ) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboard = await getExpenseRequestDashboard(session);
  const canonicalApprovalDecisions = canonicalApprovalDecisionsEnabled();
  const evidenceAttachmentPairs = await Promise.all(
    dashboard.requests.map(async (request) => [
      request.id,
      await listControlledEvidenceAttachments({
        sourceType: "EXPENSE_REQUEST",
        sourceRecordId: request.id,
        requiredPermissionCode: permissions.financeExpenseRequestView
      })
    ] as const)
  );
  const evidenceAttachmentsByRequestId = new Map(evidenceAttachmentPairs);
  const canCreateDraftRequest =
    dashboard.permissions.canCreate &&
    dashboard.draftOptions.locations.length > 0 &&
    dashboard.draftOptions.categories.length > 0;
  const tabs = [
    {
      id: "queue",
      label: "Request queue",
      description: "Review expense requests and evidence.",
      count: dashboard.requests.length
    },
    {
      id: "actions",
      label: "Actions",
      description: "Submit, approve, return, complete, and hand off.",
      count: dashboard.requests.filter(
        (request) =>
          allowedExpenseActions({
            status: request.status,
            canonicalApprovalDecisions,
            permissions: dashboard.permissions
          }).length > 0
      ).length
    },
    {
      id: "entry",
      label: "New request",
      description: "Create a controlled draft request."
    },
    {
      id: "handoff",
      label: "AP handoff",
      description: "Follow up AP draft readiness.",
      count: dashboard.apHandoffRows.length
    },
    {
      id: "reports",
      label: "Reports",
      description: "Expense exposure and budget due-date view.",
      count: dashboard.reportRows.length
    },
    {
      id: "controls",
      label: "Controls",
      description: "Policy and guardrails."
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
  const pagedReportRows = paginate(dashboard.reportRows);
  const pagedApHandoffRows = paginate(dashboard.apHandoffRows);
  const pagedActionRequests = paginate(dashboard.requests);
  const pagedQueueRequests = paginate(dashboard.requests);

  return (
    <AppShell
      session={session}
      title="Expense Requests"
      subtitle="Operational expense intent, evidence, and controlled approval readiness"
      activeNav="expense-requests"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Expense requests stop before payment and posting.</strong>{" "}
              Approval captures authorization and evidence, but payment release,
              AP settlement, and journals stay in their own controlled modules.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Budget context is warning-first until finance policy and UAT confirm
              hard-block behavior. Approved requests can be marked handoff-ready,
              but payment/AP records remain in a separate controlled slice.
            </p>
            <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <p className="font-semibold">Handoff policy</p>
              <p className="mt-1">
                Required path:{" "}
                {dashboard.handoffPolicy.policy.requiredHandoffPath.replaceAll(
                  "_",
                  " "
                )}
                . Direct payment request:{" "}
                {dashboard.handoffPolicy.policy.allowDirectPaymentRequest
                  ? "Allowed"
                  : "Blocked"}
                . Settlement mutation before UAT:{" "}
                {dashboard.handoffPolicy.policy.settlementMutationAllowed
                  ? "Allowed"
                  : "Blocked"}
                .
              </p>
              <p className="mt-1 text-blue-700">
                {dashboard.handoffPolicy.policy.decisionBasis}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              href="/finance/expense-requests?tab=entry"
            >
              Create Expense Request
            </Link>
            <Badge tone="info">Non-posting foundation</Badge>
          </div>
        </div>
      </div>

      <nav
        aria-label="Expense request sections"
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
                href={`/finance/expense-requests?tab=${tab.id}`}
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

      {activeTab === "entry" && dashboard.permissions.canCreate ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Create Draft Expense Request
              </h2>
              <p className="text-sm text-slate-500">
                Create a PHP draft request with up to five entry lines in this
                view. Approval, AP handoff, payment, and journals remain separate
                controlled steps.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={canCreateDraftRequest ? "info" : "warning"}>
                Draft only
              </Badge>
              <EntryModal
                title="Create Draft Expense Request"
                triggerLabel="Create Draft Expense Request"
                disabled={!canCreateDraftRequest}
              >

          <form action={runExpenseRequestDraftAction} className="grid gap-4 pt-5">
            {!canCreateDraftRequest ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Draft creation needs at least one authorized location and one
                configured expense category.
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Title
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="title"
                  placeholder="Emergency grill exhaust inspection"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Location
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="locationId"
                  defaultValue={session.context.locationId}
                  required
                >
                  {dashboard.draftOptions.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Urgency
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="urgency"
                  defaultValue="NORMAL"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Request date
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="requestDate"
                  type="date"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Required by
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="requiredByDate"
                  type="date"
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
                  Expense type
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="expenseType"
                  defaultValue="OPERATING"
                >
                  <option value="OPERATING">Operating</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="PROJECT">Project</option>
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
                  <option value="">No supplier yet</option>
                  {dashboard.draftOptions.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Budget line
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="budgetLineId"
                  defaultValue=""
                >
                  <option value="">Unbudgeted / not selected</option>
                  {dashboard.draftOptions.budgetLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-1">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Request reason
                </span>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="requestReason"
                  placeholder="Operational need, urgency, and business impact"
                  required
                />
              </label>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    Request lines
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
                      <th className="w-36 px-4 py-3">Discount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[1, 2, 3, 4, 5].map((lineNumber) => (
                      <tr key={`expense-draft-line-${lineNumber}`}>
                        <td className="px-4 py-3 text-slate-500">
                          {lineNumber}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            name={`lineDescription_${lineNumber}`}
                            placeholder={
                              lineNumber === 1
                                ? "What is being requested"
                                : "Optional line"
                            }
                            required={lineNumber === 1}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            min="0.01"
                            name={`requestedAmountPhp_${lineNumber}`}
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
                            min="0"
                            name={`discountAmountPhp_${lineNumber}`}
                            placeholder="0.00"
                            step="0.01"
                            type="number"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  External evidence reference
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="evidenceReference"
                  placeholder="Receipt, quotation, incident photo, or approval note"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  name="branchImpactFlag"
                  type="checkbox"
                />
                Branch impact
              </label>
            </div>

            <button
              className="inline-flex w-fit items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canCreateDraftRequest}
              type="submit"
            >
              Create Draft Expense Request
            </button>
          </form>
              </EntryModal>
            </div>
          </div>
        </section>
      ) : null}

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
                Expense control
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
              Expense Report Preview
            </h2>
            <p className="text-sm text-slate-500">
              Export-ready scoped rows for finance review. Source records remain
              the expense requests and linked AP records.
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
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3">Scope / Supplier</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Budget / Due</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Evidence</th>
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
                      Expense report rows appear once request records exist in the
                      selected scope.
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
                      <p className="mt-2 text-xs text-slate-500">
                        {row.sourceLinkCount} source link(s)
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          tone={
                            row.budgetStatus === "OVER_BUDGET"
                              ? "destructive"
                              : row.budgetStatus === "UNBUDGETED"
                                ? "warning"
                                : "success"
                          }
                          size="sm"
                        >
                          {row.budgetStatus.replaceAll("_", " ")}
                        </Badge>
                        <Badge tone={dueStateTone(row.dueState)} size="sm">
                          {row.dueState.replaceAll("_", " ")}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {formatMoney(row.totalRequestedAmount)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Outstanding {formatMoney(row.outstandingAmount)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        tone={
                          row.evidenceState === "COMPLETE" ? "success" : "warning"
                        }
                        size="sm"
                      >
                        {row.evidenceState}
                      </Badge>
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
          basePath="/finance/expense-requests"
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
          activeTab === "handoff" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              AP Handoff Queue
            </h2>
            <p className="text-sm text-slate-500">
              Draft AP invoices created from approved expense requests. This
              queue does not create payments, release cash, settle AP, or post
              journals.
            </p>
          </div>
          <Badge tone="info">
            {dashboard.apHandoffRows.length} AP handoff
            {dashboard.apHandoffRows.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Expense</th>
                <th className="px-5 py-3">AP Draft</th>
                <th className="px-5 py-3">Supplier / Scope</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Boundary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.apHandoffRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No AP handoffs yet
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Approved supplier-backed expense requests appear here after
                      finance creates a controlled AP draft from the request.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedApHandoffRows.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {row.expenseReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.expenseTitle}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {row.apInvoiceReference}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Supplier invoice {row.supplierInvoiceNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Created by {row.createdByName} on{" "}
                        {formatDate(row.createdAt)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.supplierName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {formatMoney(row.amountPhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Remaining snapshot {formatMoney(row.remainingAmountPhp)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(row.status)} size="sm">
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                      <p className="mt-2 max-w-md text-xs text-slate-500">
                        {row.boundary.replaceAll("_", " ")}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          basePath="/finance/expense-requests"
          tab={activeTab}
          page={pagedApHandoffRows.pagination.page}
          totalPages={pagedApHandoffRows.pagination.totalPages}
          totalCount={dashboard.apHandoffRows.length}
          startIndex={pagedApHandoffRows.pagination.startIndex}
          endIndex={pagedApHandoffRows.pagination.endIndex}
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
              Expense Workflow Actions
            </h2>
            <p className="text-sm text-slate-500">
              Submit, approve, return, complete, and hand off eligible expenses
              without creating payments or posting journals.
            </p>
          </div>
          <Badge tone="info">{dashboard.requests.length} request records</Badge>
        </div>

        <div className="divide-y divide-slate-100">
          {dashboard.requests.length === 0 ? (
            <div className="p-6">
              <p className="font-semibold text-slate-950">
                No expense actions available
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Expense workflow actions appear here when requests exist in the
                selected scope.
              </p>
            </div>
          ) : (
            pagedActionRequests.rows.map((request) => {
              const actions = allowedExpenseActions({
                status: request.status,
                canonicalApprovalDecisions,
                permissions: dashboard.permissions
              });
              return (
                <div
                  key={request.id}
                  className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_26rem] xl:items-start"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">{request.title}</p>
                      <Badge tone={statusTone(request.status)} size="sm">
                        {request.status.replaceAll("_", " ")}
                      </Badge>
                      <Badge
                        tone={
                          request.budgetStatus === "OVER_BUDGET"
                            ? "destructive"
                            : request.budgetStatus === "UNBUDGETED"
                              ? "warning"
                              : "success"
                        }
                        size="sm"
                      >
                        {request.budgetStatus.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {request.publicReference} / {request.requesterName} /{" "}
                      {request.locationName}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {formatMoney(request.totalRequestedAmount)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {request.lineCount} line(s), {request.sourceLinkCount} source
                      link(s), evidence {request.evidenceReference ?? "pending"}
                    </p>
                  </div>

                  <div className="grid justify-items-end gap-2">
                    {canonicalApprovalDecisions &&
                    request.status === "AWAITING_APPROVAL" ? (
                      <div className="max-w-md rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-right text-xs text-blue-900">
                        Assigned step actors decide this request in the{" "}
                        <Link className="font-bold underline" href="/approvals">
                          Approval Inbox
                        </Link>
                        . Source-page finance permission does not establish step
                        eligibility.
                      </div>
                    ) : null}
                    {actions.length === 0 ? (
                      <Badge tone="neutral">No available action</Badge>
                    ) : (
                      <EntryModal
                        title={`Manage ${request.publicReference}`}
                        triggerLabel="Manage Actions"
                        triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        <form action={runExpenseRequestAction} className="grid gap-4 pt-5">
                          <input
                            name="expenseRequestId"
                            type="hidden"
                            value={request.id}
                          />
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="font-bold text-slate-950">
                              {request.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {request.requesterName} / {request.locationName} /{" "}
                              {formatMoney(request.totalRequestedAmount)}
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
                                placeholder="Required for return, reject, cancel, complete, handoff"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                External evidence reference
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="evidenceReference"
                                placeholder="Receipt, memo, approval, or claim reference"
                              />
                            </label>
                            <label className="block md:col-span-2">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Supplier invoice number
                              </span>
                              <input
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                name="supplierInvoiceNumber"
                                placeholder={`EXP-${request.publicReference}`}
                              />
                            </label>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                            {actions.map((action) => (
                              <button
                                key={action}
                                className={
                                  action === "reject" || action === "cancel"
                                    ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                    : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                                }
                                name="action"
                                type="submit"
                                value={action}
                              >
                                {expenseActionLabels[action]}
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
          basePath="/finance/expense-requests"
          tab={activeTab}
          page={pagedActionRequests.pagination.page}
          totalPages={pagedActionRequests.pagination.totalPages}
          totalCount={dashboard.requests.length}
          startIndex={pagedActionRequests.pagination.startIndex}
          endIndex={pagedActionRequests.pagination.endIndex}
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
              Request Queue
            </h2>
            <p className="text-sm text-slate-500">
              Scoped expense requests, budget status, evidence, and source-link
              count.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={dashboard.permissions.canCreate ? "success" : "neutral"}>
              Create {dashboard.permissions.canCreate ? "enabled" : "disabled"}
            </Badge>
            {canonicalApprovalDecisions ? (
              <Badge tone="info">Decisions: Approval Inbox</Badge>
            ) : (
              <Badge tone={dashboard.permissions.canApprove ? "success" : "neutral"}>
                Approve {dashboard.permissions.canApprove ? "enabled" : "disabled"}
              </Badge>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Request</th>
                <th className="px-5 py-3">Requester / Scope</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Budget</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Evidence</th>
                <th className="px-5 py-3">Needed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No expense requests in this scope yet
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Draft and approved operational expenses will appear here after
                      the transaction-entry workflow is enabled.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedQueueRequests.rows.map((request) => {
                  const evidenceAttachments =
                    evidenceAttachmentsByRequestId.get(request.id) ?? [];
                  return (
                  <tr key={request.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">{request.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.publicReference} / {request.categoryCode}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.supplierName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {request.requesterName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusTone(request.status)} size="sm">
                          {request.status}
                        </Badge>
                        <Badge tone={request.urgency === "EMERGENCY" ? "warning" : "neutral"} size="sm">
                          {request.urgency}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Requested {formatDate(request.requestDate)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        tone={
                          request.budgetStatus === "OVER_BUDGET"
                            ? "destructive"
                            : request.budgetStatus === "UNBUDGETED"
                              ? "warning"
                              : "success"
                        }
                        size="sm"
                      >
                        {request.budgetStatus}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {formatMoney(request.totalRequestedAmount)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Settled {formatMoney(request.settledAmount)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {request.evidenceReference ?? "Pending evidence"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.lineCount} line(s), {request.sourceLinkCount} source link(s)
                      </p>
                      <ControlledEvidencePanel
                        archiveAction={archiveExpenseEvidenceMetadata}
                        archiveImpact="This archives the evidence link only. The file remains preserved for audit and recovery; no expense request status, amount, AP handoff, payment, or journal record is changed."
                        attachments={evidenceAttachments}
                        canAdd={dashboard.permissions.canCreate}
                        requiredForAction="EXPENSE_REVIEW"
                        sourceRecordId={request.id}
                        sourceType="EXPENSE_REQUEST"
                      />
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {formatDate(request.requiredByDate)}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          basePath="/finance/expense-requests"
          tab={activeTab}
          page={pagedQueueRequests.pagination.page}
          totalPages={pagedQueueRequests.pagination.totalPages}
          totalCount={dashboard.requests.length}
          startIndex={pagedQueueRequests.pagination.startIndex}
          endIndex={pagedQueueRequests.pagination.endIndex}
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
              Expense request boundaries before payment, AP settlement, and journals.
            </p>
          </div>
          <Badge tone="success">Source-safe</Badge>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-3">
          {dashboard.guardrails.map((guardrail) => (
            <div
              key={guardrail.label}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <LockKeyhole aria-hidden="true" className="h-4 w-4 text-blue-700" />
                <Badge tone={guardrail.tone} size="sm">
                  Control
                </Badge>
              </div>
              <p className="font-bold text-slate-950">{guardrail.label}</p>
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
