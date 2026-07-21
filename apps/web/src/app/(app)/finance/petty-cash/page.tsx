import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  FileText,
  ReceiptText,
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
import { getSessionContext } from "@/server/services/context";
import {
  approvePettyCashLiquidation,
  approvePettyCashRequest,
  cancelPettyCashLiquidation,
  cancelPettyCashRequest,
  closePettyCashLiquidation,
  closePettyCashRequest,
  createPettyCashFund,
  createPettyCashDisbursementHandoff,
  createPettyCashRequest,
  fulfillPettyCashRequestOffline,
  getPettyCashDashboard,
  rejectPettyCashLiquidation,
  rejectPettyCashRequest,
  reversePettyCashLiquidation,
  returnPettyCashLiquidationForRevision,
  returnPettyCashRequestForRevision,
  submitPettyCashLiquidation,
  submitPettyCashRequest,
  voidPettyCashFulfillment
} from "@/server/services/pettyCash";

export const dynamic = "force-dynamic";

type PettyCashPageProps = {
  searchParams?: Promise<{ page?: string; tab?: string }>;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const metricIcons = {
  "active-funds": WalletCards,
  "cash-on-hand": ReceiptText,
  "open-requests": BadgeCheck,
  "open-liquidations": AlertTriangle
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0
  }).format(value);
}

function statusTone(status: string) {
  if (["ACTIVE", "APPROVED", "CLOSED"].includes(status)) {
    return "success" as const;
  }
  if (
    [
      "SUSPENDED",
      "DRAFT",
      "AWAITING_APPROVAL",
      "SUBMITTED",
      "UNDER_REVIEW",
      "RETURNED_FOR_REVISION",
      "FULFILLED_OFFLINE"
    ].includes(status)
  ) {
    return "warning" as const;
  }
  if (["ARCHIVED", "REJECTED", "CANCELLED", "VOIDED"].includes(status)) {
    return "destructive" as const;
  }
  return "neutral" as const;
}

function balanceStateTone(balanceState: string) {
  if (balanceState === "LOW_BALANCE") {
    return "warning" as const;
  }
  if (balanceState === "HEALTHY") {
    return "success" as const;
  }
  return "neutral" as const;
}

function pettyCashExceptionTone(severity: string) {
  if (severity === "HIGH") {
    return "destructive" as const;
  }
  if (severity === "MEDIUM") {
    return "warning" as const;
  }
  return "info" as const;
}

const pettyCashRequestActionLabels = {
  submit: "Submit",
  approve: "Approve",
  return: "Return",
  reject: "Reject",
  cancel: "Cancel",
  create_handoff: "Create Draft Disbursement",
  fulfill: "Record Cash Movement",
  void: "Void Movement",
  close: "Close"
} as const;

const pettyCashLiquidationActionLabels = {
  approve: "Approve",
  return: "Return",
  reject: "Reject",
  cancel: "Cancel",
  reverse: "Reverse",
  close: "Close"
} as const;

function optionalNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function requiredNumber(formData: FormData, key: string, errorCode: string) {
  const value = optionalNumber(formData, key);
  if (value == null) {
    throw new Error(errorCode);
  }
  return value;
}

function cleanField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredField(formData: FormData, key: string, errorCode: string) {
  const value = cleanField(formData, key);
  if (!value) {
    throw new Error(errorCode);
  }
  return value;
}

function optionalDate(formData: FormData, key: string) {
  const raw = cleanField(formData, key);
  if (!raw) {
    return undefined;
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("PETTY_CASH_DATE_INVALID");
  }
  return date;
}

function requiredDate(formData: FormData, key: string, errorCode: string) {
  const date = optionalDate(formData, key);
  if (!date) {
    throw new Error(errorCode);
  }
  return date;
}

async function runPettyCashRequestCreateAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const requestType = requiredField(
    formData,
    "requestType",
    "PETTY_CASH_REQUEST_TYPE_REQUIRED"
  );
  if (requestType !== "REPLENISHMENT" && requestType !== "DISBURSEMENT") {
    throw new Error("PETTY_CASH_REQUEST_TYPE_INVALID");
  }
  const pettyCashFundId = requiredField(
    formData,
    "pettyCashFundId",
    "PETTY_CASH_FUND_REQUIRED"
  );
  const requestedAmountPhp = requiredNumber(
    formData,
    "requestedAmountPhp",
    "PETTY_CASH_REQUEST_AMOUNT_REQUIRED"
  );
  const purpose = requiredField(
    formData,
    "purpose",
    "PETTY_CASH_REQUEST_PURPOSE_REQUIRED"
  );
  const justification = requiredField(
    formData,
    "justification",
    "PETTY_CASH_REQUEST_JUSTIFICATION_REQUIRED"
  );
  const dueBy = optionalDate(formData, "dueBy");
  const evidenceReference = cleanField(formData, "evidenceReference");

  await createPettyCashRequest(session, {
    pettyCashFundId,
    requestType,
    requestedAmountPhp,
    purpose,
    justification,
    ...(dueBy ? { dueBy } : {}),
    ...(evidenceReference ? { evidenceReference } : {}),
    idempotencyKey: `petty-cash-request-create-ui:${session.user.id}:${pettyCashFundId}:${requestType}:${requestedAmountPhp}:${purpose}:${dueBy?.toISOString() ?? "none"}`
  });

  revalidatePath("/finance/petty-cash");
}

async function runPettyCashFundCreateAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }

  const notes = cleanField(formData, "notes");
  await createPettyCashFund(session, {
    code: requiredField(formData, "code", "PETTY_CASH_FUND_CODE_REQUIRED"),
    name: requiredField(formData, "name", "PETTY_CASH_FUND_NAME_REQUIRED"),
    locationId: requiredField(
      formData,
      "locationId",
      "PETTY_CASH_FUND_LOCATION_REQUIRED"
    ),
    custodianUserId: requiredField(
      formData,
      "custodianUserId",
      "PETTY_CASH_FUND_CUSTODIAN_REQUIRED"
    ),
    openingBalancePhp: requiredNumber(
      formData,
      "openingBalancePhp",
      "PETTY_CASH_FUND_OPENING_BALANCE_REQUIRED"
    ),
    targetBalancePhp: requiredNumber(
      formData,
      "targetBalancePhp",
      "PETTY_CASH_FUND_TARGET_BALANCE_REQUIRED"
    ),
    lowBalanceAlertPhp: requiredNumber(
      formData,
      "lowBalanceAlertPhp",
      "PETTY_CASH_FUND_LOW_ALERT_REQUIRED"
    ),
    evidenceReference: requiredField(
      formData,
      "evidenceReference",
      "PETTY_CASH_FUND_EVIDENCE_REQUIRED"
    ),
    ...(notes ? { notes } : {}),
    idempotencyKey: `petty-cash-fund:${Date.now()}`
  });
  revalidatePath("/finance/petty-cash");
}

async function runPettyCashLiquidationSubmitAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const pettyCashFundId = requiredField(
    formData,
    "pettyCashFundId",
    "PETTY_CASH_FUND_REQUIRED"
  );
  const cycleStart = requiredDate(
    formData,
    "cycleStart",
    "PETTY_CASH_LIQUIDATION_CYCLE_START_REQUIRED"
  );
  const cycleEnd = requiredDate(
    formData,
    "cycleEnd",
    "PETTY_CASH_LIQUIDATION_CYCLE_END_REQUIRED"
  );
  const spendDate = requiredDate(
    formData,
    "spendDate",
    "PETTY_CASH_LIQUIDATION_SPEND_DATE_REQUIRED"
  );
  const spendDateText = cleanField(formData, "spendDate");
  const categoryCode = requiredField(
    formData,
    "categoryCode",
    "PETTY_CASH_LIQUIDATION_CATEGORY_REQUIRED"
  );
  const evidenceReference = requiredField(
    formData,
    "evidenceReference",
    "PETTY_CASH_LIQUIDATION_EVIDENCE_REQUIRED"
  );
  const supplierId = cleanField(formData, "supplierId");
  const lines = Array.from({ length: 5 }, (_, index) => {
    const lineNumber = index + 1;
    const description = cleanField(formData, `description_${lineNumber}`);
    const amountPhp = optionalNumber(formData, `amountPhp_${lineNumber}`);
    if (!description && amountPhp == null) {
      return null;
    }
    const receiptReference = cleanField(
      formData,
      `receiptReference_${lineNumber}`
    );
    const taxAmountPhp = optionalNumber(formData, `taxAmountPhp_${lineNumber}`);
    return {
      spendDate,
      categoryCode,
      description,
      amountPhp: amountPhp ?? Number.NaN,
      ...(taxAmountPhp != null ? { taxAmountPhp } : {}),
      ...(receiptReference ? { receiptReference } : {}),
      evidenceReference,
      ...(supplierId ? { supplierId } : {})
    };
  }).filter(Boolean) as Array<{
    spendDate: Date;
    categoryCode: string;
    description: string;
    amountPhp: number;
    taxAmountPhp?: number;
    receiptReference?: string;
    evidenceReference: string;
    supplierId?: string;
  }>;
  const claimedTotal = lines.reduce((sum, line) => sum + line.amountPhp, 0);

  await submitPettyCashLiquidation(session, {
    pettyCashFundId,
    cycleStart,
    cycleEnd,
    evidenceReference,
    idempotencyKey: `petty-cash-liquidation-submit-ui:${session.user.id}:${pettyCashFundId}:${cycleStart.toISOString()}:${cycleEnd.toISOString()}:${spendDateText}:${claimedTotal}:${lines.map((line) => line.description).join("|")}`,
    lines
  });

  revalidatePath("/finance/petty-cash");
}

async function runPettyCashRequestAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const pettyCashRequestId = String(formData.get("pettyCashRequestId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const referenceNo = String(formData.get("referenceNo") ?? "").trim() || undefined;
  const paymentReferenceLabel =
    String(formData.get("paymentReferenceLabel") ?? "").trim() || undefined;
  const approvedAmountPhp = optionalNumber(formData, "approvedAmountPhp");
  const amountPhp = optionalNumber(formData, "amountPhp") ?? 0;
  const baseInput = {
    pettyCashRequestId,
    idempotencyKey: `petty-cash-request-ui:${pettyCashRequestId}:${action}:${reason ?? "none"}:${referenceNo ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "submit":
      await submitPettyCashRequest(session, baseInput);
      break;
    case "approve":
      await approvePettyCashRequest(session, {
        ...baseInput,
        ...(approvedAmountPhp ? { approvedAmountPhp } : {})
      });
      break;
    case "return":
      await returnPettyCashRequestForRevision(session, baseInput);
      break;
    case "reject":
      await rejectPettyCashRequest(session, baseInput);
      break;
    case "cancel":
      await cancelPettyCashRequest(session, baseInput);
      break;
    case "create_handoff":
      await createPettyCashDisbursementHandoff(session, {
        ...baseInput,
        ...(paymentReferenceLabel ? { paymentReferenceLabel } : {})
      });
      break;
    case "fulfill":
      await fulfillPettyCashRequestOffline(session, {
        ...baseInput,
        amountPhp,
        ...(referenceNo ? { referenceNo } : {})
      });
      break;
    case "void":
      await voidPettyCashFulfillment(session, baseInput);
      break;
    case "close":
      await closePettyCashRequest(session, baseInput);
      break;
    default:
      throw new Error("PETTY_CASH_REQUEST_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/petty-cash");
}

async function runPettyCashLiquidationAction(formData: FormData) {
  "use server";

  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  const liquidationId = String(formData.get("liquidationId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const evidenceReference =
    String(formData.get("evidenceReference") ?? "").trim() || undefined;
  const approvedAmountPhp = optionalNumber(formData, "approvedAmountPhp");
  const varianceType = String(formData.get("varianceType") ?? "NONE");
  const shortageAmountPhp =
    varianceType === "OVERAGE"
      ? undefined
      : optionalNumber(formData, "shortageAmountPhp");
  const overageAmountPhp =
    varianceType === "SHORTAGE"
      ? undefined
      : optionalNumber(formData, "overageAmountPhp");
  const baseInput = {
    liquidationId,
    idempotencyKey: `petty-cash-liquidation-ui:${liquidationId}:${action}:${reason ?? "none"}`,
    ...(reason ? { reason } : {}),
    ...(evidenceReference ? { evidenceReference } : {})
  };

  switch (action) {
    case "approve":
      await approvePettyCashLiquidation(session, {
        ...baseInput,
        ...(approvedAmountPhp ? { approvedAmountPhp } : {}),
        ...(shortageAmountPhp != null ? { shortageAmountPhp } : {}),
        ...(overageAmountPhp != null ? { overageAmountPhp } : {})
      });
      break;
    case "return":
      await returnPettyCashLiquidationForRevision(session, baseInput);
      break;
    case "reject":
      await rejectPettyCashLiquidation(session, baseInput);
      break;
    case "cancel":
      await cancelPettyCashLiquidation(session, baseInput);
      break;
    case "reverse":
      await reversePettyCashLiquidation(session, baseInput);
      break;
    case "close":
      await closePettyCashLiquidation(session, baseInput);
      break;
    default:
      throw new Error("PETTY_CASH_LIQUIDATION_ACTION_NOT_SUPPORTED");
  }

  revalidatePath("/finance/petty-cash");
}

async function archivePettyCashEvidenceMetadata(formData: FormData) {
  "use server";

  const sourceType = String(formData.get("sourceType") ?? "").trim();
  if (
    sourceType !== "PETTY_CASH_FUND" &&
    sourceType !== "PETTY_CASH_REQUEST" &&
    sourceType !== "PETTY_CASH_LIQUIDATION"
  ) {
    throw new Error("PETTY_CASH_EVIDENCE_SOURCE_INVALID");
  }

  await archiveControlledEvidenceAttachment({
    controlledEvidenceAttachmentId: String(
      formData.get("controlledEvidenceAttachmentId") ?? ""
    ),
    archiveReason: String(formData.get("archiveReason") ?? "").trim(),
    requiredPermissionCode:
      sourceType === "PETTY_CASH_LIQUIDATION"
        ? permissions.financePettyCashLiquidate
        : permissions.financePettyCashCreate
  });

  revalidatePath("/finance/petty-cash");
}

export default async function PettyCashPage({ searchParams }: PettyCashPageProps) {
  const resolvedSearchParams = await searchParams;
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (
    !canUseFinance(session.permissionCodes) ||
    !session.permissionCodes.includes(permissions.financePettyCashView)
  ) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const dashboard = await getPettyCashDashboard(session);
  const fundEvidencePairs = await Promise.all(
    dashboard.funds.map(async (fund) => [
      fund.id,
      await listControlledEvidenceAttachments({
        sourceType: "PETTY_CASH_FUND",
        sourceRecordId: fund.id,
        requiredPermissionCode: permissions.financePettyCashView
      })
    ] as const)
  );
  const fundEvidenceById = new Map(fundEvidencePairs);
  const requestEvidencePairs = await Promise.all(
    dashboard.requests.map(async (request) => [
      request.id,
      await listControlledEvidenceAttachments({
        sourceType: "PETTY_CASH_REQUEST",
        sourceRecordId: request.id,
        requiredPermissionCode: permissions.financePettyCashView
      })
    ] as const)
  );
  const requestEvidenceById = new Map(requestEvidencePairs);
  const liquidationEvidencePairs = await Promise.all(
    dashboard.liquidations.map(async (liquidation) => [
      liquidation.id,
      await listControlledEvidenceAttachments({
        sourceType: "PETTY_CASH_LIQUIDATION",
        sourceRecordId: liquidation.id,
        requiredPermissionCode: permissions.financePettyCashView
      })
    ] as const)
  );
  const liquidationEvidenceById = new Map(liquidationEvidencePairs);
  const activeFundOptions = dashboard.draftOptions.funds;
  const fundSetupLocationOptions = dashboard.draftOptions.locations;
  const fundCustodianOptions = dashboard.draftOptions.custodians;
  const canCreatePettyCashFund =
    dashboard.permissions.canCreate &&
    fundSetupLocationOptions.length > 0 &&
    fundCustodianOptions.length > 0;
  const canCreatePettyCashRequest =
    dashboard.permissions.canCreate && activeFundOptions.length > 0;
  const canSubmitPettyCashLiquidation =
    dashboard.permissions.canLiquidate && activeFundOptions.length > 0;
  const tabs = [
    {
      id: "funds",
      label: "Funds",
      description: "Custody funds, balances, and evidence.",
      count: dashboard.funds.length
    },
    {
      id: "requests",
      label: "Requests",
      description: "Replenishment and disbursement request actions.",
      count: dashboard.requests.length
    },
    {
      id: "liquidations",
      label: "Liquidations",
      description: "Liquidation entry and review actions.",
      count: dashboard.liquidations.length
    },
    {
      id: "entry",
      label: "New entry",
      description: "Set up funds and create requests."
    },
    {
      id: "reports",
      label: "Reports",
      description: "Exception queue and report preview.",
      count: dashboard.reportRows.length
    },
    {
      id: "controls",
      label: "Controls",
      description: "Permissions and guardrails."
    }
  ];
  const activeTab = tabs.some((tab) => tab.id === resolvedSearchParams?.tab)
    ? String(resolvedSearchParams?.tab)
    : "funds";
  const paginate = <T,>(rows: T[]) => {
    const pagination = getPaginationState(rows.length, resolvedSearchParams?.page);
    return {
      pagination,
      rows: rows.slice(pagination.startIndex, pagination.endIndex)
    };
  };
  const pagedExceptionRows = paginate(dashboard.exceptionRows);
  const pagedReportRows = paginate(dashboard.reportRows);
  const pagedRequestRows = paginate(dashboard.requests);
  const pagedLiquidationRows = paginate(dashboard.liquidations);
  const pagedFundRows = paginate(dashboard.funds);

  return (
    <AppShell
      session={session}
      title="Petty Cash"
      subtitle="Custody funds, replenishment readiness, liquidations, and cash control visibility"
      activeNav="petty-cash"
    >
      <div className="ogfi-coordination-cue">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              <strong>Petty cash is custody control, not GL posting.</strong>{" "}
              Service actions now control fund activation, replenishment or
              disbursement requests, offline fulfillment, liquidation review,
              closure, evidence, and custody balances while payment release,
              journals, bank reconciliation, and period close stay in their own
              workflows.
            </p>
            <p className="mt-1 text-xs text-blue-900/75">
              Offline fund movements are tracked as reviewable markers only. They
              do not mutate bank accounts, payment releases, or journal records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              href="/finance/petty-cash?tab=entry"
            >
              Create Petty Cash Entry
            </Link>
            <Badge tone="info">Non-posting foundation</Badge>
          </div>
        </div>
      </div>

      <nav
        aria-label="Petty cash sections"
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
                href={`/finance/petty-cash?tab=${tab.id}`}
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
                Set Up Petty Cash Fund
              </h2>
              <p className="text-sm text-slate-500">
                Create a scoped custody fund with custodian, target balance, low
                alert, opening baseline, and evidence.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={canCreatePettyCashFund ? "info" : "warning"}>
                Draft fund
              </Badge>
              <EntryModal
                title="Set Up Petty Cash Fund"
                triggerLabel="Set Up Fund"
                disabled={!canCreatePettyCashFund}
              >
                <form
                  action={runPettyCashFundCreateAction}
                  className="grid gap-4 pt-5"
                >
                  {!canCreatePettyCashFund ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Fund setup needs at least one active scoped location and
                      one active user assigned to that location.
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium">
                      Fund code
                      <input
                        name="code"
                        required
                        placeholder="e.g. PC-SMNE-OPS"
                        className="ogfi-input"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      Fund name
                      <input
                        name="name"
                        required
                        placeholder="e.g. SM North Edsa Operations Fund"
                        className="ogfi-input"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1 text-sm font-medium">
                      Location
                      <select name="locationId" required className="ogfi-input">
                        <option value="">Select location</option>
                        {fundSetupLocationOptions.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      Custodian
                      <select
                        name="custodianUserId"
                        required
                        className="ogfi-input"
                      >
                        <option value="">Select custodian</option>
                        {fundCustodianOptions.map((custodian) => (
                          <option key={custodian.id} value={custodian.id}>
                            {custodian.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-1 text-sm font-medium">
                      Opening balance
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        name="openingBalancePhp"
                        required
                        defaultValue="0"
                        className="ogfi-input"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      Target balance
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        name="targetBalancePhp"
                        required
                        placeholder="10000"
                        className="ogfi-input"
                      />
                    </label>
                    <label className="grid gap-1 text-sm font-medium">
                      Low balance alert
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        name="lowBalanceAlertPhp"
                        required
                        placeholder="3000"
                        className="ogfi-input"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm font-medium">
                    External evidence reference
                    <input
                      name="evidenceReference"
                      required
                      placeholder="Board approval, fund policy, or opening count sheet"
                      className="ogfi-input"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Notes
                    <textarea
                      name="notes"
                      rows={3}
                      placeholder="Custody scope, replenishment policy, or opening-balance context"
                      className="ogfi-input"
                    />
                  </label>
                  <button
                    type="submit"
                    className="ogfi-primary-button w-full"
                    disabled={!canCreatePettyCashFund}
                  >
                    Create Petty Cash Fund
                  </button>
                </form>
              </EntryModal>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "entry" && dashboard.permissions.canCreate ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Create Petty Cash Request
              </h2>
              <p className="text-sm text-slate-500">
                Create a draft replenishment or disbursement request against an
                active scoped fund. Approval and cash movement stay separate.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={canCreatePettyCashRequest ? "info" : "warning"}>
                Draft only
              </Badge>
              <EntryModal
                title="Create Petty Cash Request"
                triggerLabel="Create Petty Cash Request"
                disabled={!canCreatePettyCashRequest}
              >

          <form
            action={runPettyCashRequestCreateAction}
            className="grid gap-4 pt-5"
          >
            {!canCreatePettyCashRequest ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Request entry needs at least one active petty cash fund in your
                authorized location scope.
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Fund
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="pettyCashFundId"
                  defaultValue={activeFundOptions[0]?.id ?? ""}
                  required
                >
                  {activeFundOptions.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">
                  {activeFundOptions[0]?.detail ?? "No active fund available"}
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Request type
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="requestType"
                  defaultValue="DISBURSEMENT"
                  required
                >
                  <option value="DISBURSEMENT">Disbursement</option>
                  <option value="REPLENISHMENT">Replenishment</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Requested amount
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  min="0.01"
                  name="requestedAmountPhp"
                  placeholder="2500"
                  step="0.01"
                  type="number"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Due by
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="dueBy"
                  type="date"
                />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  External evidence reference
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="evidenceReference"
                  placeholder="Cash voucher, custody memo, or approval reference"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Purpose
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="purpose"
                  placeholder="Minor store repair materials"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Justification
                </span>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="justification"
                  placeholder="Why this fund request is needed"
                  required
                />
              </label>
            </div>

            <button
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canCreatePettyCashRequest}
              type="submit"
            >
              Create Draft Petty Cash Request
            </button>
          </form>
              </EntryModal>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "liquidations" && dashboard.permissions.canLiquidate ? (
        <section className="ogfi-data-surface mb-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Submit Petty Cash Liquidation
              </h2>
              <p className="text-sm text-slate-500">
                Submit up to five receipt lines for a fund cycle in this view.
                Review, settlement markers, payment, bank, and journals remain
                separate.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={canSubmitPettyCashLiquidation ? "info" : "warning"}>
                Multi-line entry
              </Badge>
              <EntryModal
                title="Submit Petty Cash Liquidation"
                triggerLabel="Submit Liquidation"
                disabled={!canSubmitPettyCashLiquidation}
              >

          <form
            action={runPettyCashLiquidationSubmitAction}
            className="grid gap-4 pt-5"
          >
            {!canSubmitPettyCashLiquidation ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Liquidation entry needs at least one active petty cash fund in
                your authorized location scope.
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Fund
                </span>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="pettyCashFundId"
                  defaultValue={activeFundOptions[0]?.id ?? ""}
                  required
                >
                  {activeFundOptions.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Cycle start
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="cycleStart"
                  type="date"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Cycle end
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="cycleEnd"
                  type="date"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
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
                  External evidence reference
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  name="evidenceReference"
                  placeholder="Receipt pack, photo, or custody packet"
                  required
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
                      <tr key={`petty-cash-liquidation-line-${lineNumber}`}>
                        <td className="px-4 py-3 text-slate-500">
                          {lineNumber}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            name={`description_${lineNumber}`}
                            placeholder={
                              lineNumber === 1
                                ? "What was paid using petty cash"
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

            <button
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!canSubmitPettyCashLiquidation}
              type="submit"
            >
              Submit Petty Cash Liquidation
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
                Cash custody
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
              Petty Cash Exception Queue
            </h2>
            <p className="text-sm text-slate-500">
              Actionable custody issues for low balances, open cycles, and
              evidence gaps. Settlement, payment release, bank, and journal work
              remain outside this queue.
            </p>
          </div>
          <Badge tone={dashboard.exceptionRows.length > 0 ? "warning" : "success"}>
            {dashboard.exceptionRows.length} exception
            {dashboard.exceptionRows.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Issue</th>
                <th className="px-5 py-3">Fund</th>
                <th className="px-5 py-3">Custodian / Scope</th>
                <th className="px-5 py-3">Impact</th>
                <th className="px-5 py-3">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.exceptionRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No petty cash exceptions in this scope
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Low-balance funds, open requests, open liquidations, and
                      missing evidence will appear here when they need attention.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedExceptionRows.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={pettyCashExceptionTone(row.severity)}
                          size="sm"
                        >
                          {row.severity}
                        </Badge>
                        {row.blockerId ? (
                          <Badge tone="warning" size="sm">
                            {row.blockerId}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 font-bold text-slate-950">
                        {row.issueLabel}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.issueType.replaceAll("_", " ")}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.fundName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.publicReference}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.custodianName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {row.amountPhp != null ? (
                        <p className="font-bold text-slate-950">
                          {formatMoney(row.amountPhp)}
                        </p>
                      ) : row.count != null ? (
                        <p className="font-bold text-slate-950">
                          {row.count} open item{row.count === 1 ? "" : "s"}
                        </p>
                      ) : (
                        <p className="font-semibold text-slate-600">
                          Evidence control
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-lg text-sm leading-6 text-slate-600">
                        {row.nextAction}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          basePath="/finance/petty-cash"
          tab={activeTab}
          page={pagedExceptionRows.pagination.page}
          totalPages={pagedExceptionRows.pagination.totalPages}
          totalCount={dashboard.exceptionRows.length}
          startIndex={pagedExceptionRows.pagination.startIndex}
          endIndex={pagedExceptionRows.pagination.endIndex}
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
              Petty Cash Report Preview
            </h2>
            <p className="text-sm text-slate-500">
              Export-ready scoped rows for fund health, open cycles, custodian
              accountability, evidence, and ledger traceability.
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
                <th className="px-5 py-3">Fund</th>
                <th className="px-5 py-3">Custodian / Scope</th>
                <th className="px-5 py-3">Balance</th>
                <th className="px-5 py-3">Open Cycles</th>
                <th className="px-5 py-3">Evidence</th>
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
                      Petty cash report rows appear once funds exist in the
                      selected scope.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedReportRows.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">{row.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.publicReference} / {row.code}
                      </p>
                      <Badge tone={statusTone(row.status)} size="sm">
                        {row.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.custodianName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {formatMoney(row.currentBalancePhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Target {formatMoney(row.targetBalancePhp)} / needs{" "}
                        {formatMoney(row.availableToTargetPhp)}
                      </p>
                      <Badge tone={balanceStateTone(row.balanceState)} size="sm">
                        {row.balanceState.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.openRequestCount} request(s)
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.openLiquidationCount} liquidation(s)
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
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {row.ledgerEntryCount} ledger marker(s)
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
          basePath="/finance/petty-cash"
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
          activeTab === "requests" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Petty Cash Request Actions
            </h2>
            <p className="text-sm text-slate-500">
              Submit, approve, return, fulfill offline cash movement markers, and
              close petty cash requests without touching bank or journal records.
            </p>
          </div>
          <Badge tone="info">{dashboard.requests.length} request records</Badge>
        </div>

        <div className="divide-y divide-slate-100">
          {dashboard.requests.length === 0 ? (
            <div className="p-6">
              <p className="font-semibold text-slate-950">
                No petty cash request actions available
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Replenishment and disbursement requests will appear here once
                created for the selected scope.
              </p>
            </div>
          ) : (
            pagedRequestRows.rows.map((request) => (
              <div
                key={request.id}
                className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_28rem] xl:items-start"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">
                      {request.publicReference}
                    </p>
                    <Badge tone={statusTone(request.status)} size="sm">
                      {request.status.replaceAll("_", " ")}
                    </Badge>
                    <Badge tone="neutral" size="sm">
                      {request.requestType.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {request.fundName}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    Requested {formatMoney(request.requestedAmountPhp)} /
                    approved {formatMoney(request.approvedAmountPhp)}
                  </p>
                  {request.disbursementHandoffReference ? (
                    <p className="mt-2 text-xs font-semibold text-blue-700">
                      Draft disbursement handoff:{" "}
                      {request.disbursementHandoffReference}
                    </p>
                  ) : null}
                  <ControlledEvidencePanel
                    archiveAction={archivePettyCashEvidenceMetadata}
                    attachments={requestEvidenceById.get(request.id) ?? []}
                    canAdd={dashboard.permissions.canCreate}
                    sourceRecordId={request.id}
                    sourceType="PETTY_CASH_REQUEST"
                    triggerLabel="Add Request Evidence"
                  />
                </div>

                <div className="flex items-start justify-end">
                  {request.allowedActions.length === 0 ? (
                    <Badge tone="neutral">No available action</Badge>
                  ) : (
                    <EntryModal
                      title={`Manage ${request.publicReference}`}
                      triggerLabel="Manage Actions"
                      triggerClassName="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      <form action={runPettyCashRequestAction} className="grid gap-4 pt-5">
                        <input
                          name="pettyCashRequestId"
                          type="hidden"
                          value={request.id}
                        />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="font-bold text-slate-950">
                            {request.publicReference}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {request.fundName} / requested{" "}
                            {formatMoney(request.requestedAmountPhp)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <p className="font-semibold">Variance policy</p>
                          <p className="mt-1">
                            Choose one outcome only. Shortage means cash/receipts are
                            under the approved amount; overage means excess cash was
                            returned. Any variance requires reason and evidence.
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
                              placeholder="Required for return, reject, cancel, fulfill, close"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              External evidence reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="evidenceReference"
                              placeholder="Cash voucher, receipt, custody memo"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Handoff payee label
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="paymentReferenceLabel"
                              placeholder="Optional for draft disbursement handoff"
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
                              placeholder="Defaults to requested amount"
                              step="0.01"
                              type="number"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Cash movement amount
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              min="0"
                              name="amountPhp"
                              placeholder="Required for cash movement"
                              step="0.01"
                              type="number"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Movement reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="referenceNo"
                              placeholder="Offline voucher or proof no."
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                          {request.allowedActions.map((action) => (
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
                              {pettyCashRequestActionLabels[action]}
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
          basePath="/finance/petty-cash"
          tab={activeTab}
          page={pagedRequestRows.pagination.page}
          totalPages={pagedRequestRows.pagination.totalPages}
          totalCount={dashboard.requests.length}
          startIndex={pagedRequestRows.pagination.startIndex}
          endIndex={pagedRequestRows.pagination.endIndex}
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
              Petty Cash Liquidation Actions
            </h2>
            <p className="text-sm text-slate-500">
              Review liquidations, capture shortage or overage decisions, and close
              cycles with evidence while settlement stays a custody marker.
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
                No petty cash liquidation actions available
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Submitted liquidation cycles will appear here after receipt packages
                are entered for a fund.
              </p>
            </div>
          ) : (
            pagedLiquidationRows.rows.map((liquidation) => (
              <div
                key={liquidation.id}
                className="grid gap-4 px-5 py-4 xl:grid-cols-[1fr_28rem] xl:items-start"
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
                    {liquidation.fundName}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    Claimed {formatMoney(liquidation.claimedAmountPhp)} /
                    approved {formatMoney(liquidation.approvedAmountPhp)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Shortage {formatMoney(liquidation.shortageAmountPhp)} /
                    overage {formatMoney(liquidation.overageAmountPhp)}
                  </p>
                  <ControlledEvidencePanel
                    archiveAction={archivePettyCashEvidenceMetadata}
                    attachments={liquidationEvidenceById.get(liquidation.id) ?? []}
                    canAdd={dashboard.permissions.canLiquidate}
                    sourceRecordId={liquidation.id}
                    sourceType="PETTY_CASH_LIQUIDATION"
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
                        action={runPettyCashLiquidationAction}
                        className="grid gap-4 pt-5"
                      >
                        <input
                          name="liquidationId"
                          type="hidden"
                          value={liquidation.id}
                        />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="font-bold text-slate-950">
                            {liquidation.publicReference}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {liquidation.fundName} / claimed{" "}
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
                              placeholder="Required for return, reject, cancel, variance, reverse, close"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              External evidence reference
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="evidenceReference"
                              placeholder="Receipt pack, variance memo, closure proof"
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
                              placeholder="Defaults to claimed amount"
                              step="0.01"
                              type="number"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Variance decision
                            </span>
                            <select
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              name="varianceType"
                            >
                              <option value="NONE">No variance</option>
                              <option value="SHORTAGE">Shortage</option>
                              <option value="OVERAGE">Overage</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Shortage amount
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              min="0"
                              name="shortageAmountPhp"
                              placeholder="Use only when decision is shortage"
                              step="0.01"
                              type="number"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Overage amount
                            </span>
                            <input
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                              min="0"
                              name="overageAmountPhp"
                              placeholder="Use only when decision is overage"
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
                                action === "reject" || action === "cancel"
                                  ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                                  : "rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                              }
                              name="action"
                              type="submit"
                              value={action}
                            >
                              {pettyCashLiquidationActionLabels[action]}
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
          basePath="/finance/petty-cash"
          tab={activeTab}
          page={pagedLiquidationRows.pagination.page}
          totalPages={pagedLiquidationRows.pagination.totalPages}
          totalCount={dashboard.liquidations.length}
          startIndex={pagedLiquidationRows.pagination.startIndex}
          endIndex={pagedLiquidationRows.pagination.endIndex}
        />
      </section>

      <section
        className={cx(
          "ogfi-data-surface mb-5 overflow-hidden",
          activeTab === "funds" ? "" : "hidden"
        )}
      >
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Petty Cash Funds
            </h2>
            <p className="text-sm text-slate-500">
              Location-scoped funds, custodians, balances, request counts, and
              liquidation exceptions.
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
                <th className="px-5 py-3">Fund</th>
                <th className="px-5 py-3">Custodian / Scope</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Balance</th>
                <th className="px-5 py-3">Requests</th>
                <th className="px-5 py-3">Liquidations</th>
                <th className="px-5 py-3">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.funds.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <p className="font-semibold text-slate-950">
                      No petty cash funds in this scope yet
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Active funds, replenishment requests, ledger markers, and
                      liquidation cycles will appear here once configured.
                    </p>
                  </td>
                </tr>
              ) : (
                pagedFundRows.rows.map((fund) => (
                  <tr key={fund.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">{fund.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {fund.publicReference} / {fund.code}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {fund.custodianName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {fund.locationName}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={statusTone(fund.status)} size="sm">
                        {fund.status}
                      </Badge>
                      <p className="mt-2 text-xs text-slate-500">
                        {fund.ledgerEntryCount} ledger marker(s)
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">
                        {formatMoney(fund.currentBalancePhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Target {formatMoney(fund.targetBalancePhp)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Low alert {formatMoney(fund.lowBalanceAlertPhp)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {fund.openRequestCount} open
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {fund.requestCount} total request(s)
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {fund.openLiquidationCount} open
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {fund.liquidationCount} total cycle(s)
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950">
                        {fund.evidenceReference ?? "Pending evidence"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Top-up needed {formatMoney(fund.availableToTargetPhp)}
                      </p>
                      <ControlledEvidencePanel
                        archiveAction={archivePettyCashEvidenceMetadata}
                        attachments={fundEvidenceById.get(fund.id) ?? []}
                        canAdd={dashboard.permissions.canCreate}
                        sourceRecordId={fund.id}
                        sourceType="PETTY_CASH_FUND"
                        triggerLabel="Add Fund Evidence"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <FinancePagination
          basePath="/finance/petty-cash"
          tab={activeTab}
          page={pagedFundRows.pagination.page}
          totalPages={pagedFundRows.pagination.totalPages}
          totalCount={dashboard.funds.length}
          startIndex={pagedFundRows.pagination.startIndex}
          endIndex={pagedFundRows.pagination.endIndex}
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
              Petty cash boundaries before payment release, official journals,
              bank reconciliation, and period close.
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
