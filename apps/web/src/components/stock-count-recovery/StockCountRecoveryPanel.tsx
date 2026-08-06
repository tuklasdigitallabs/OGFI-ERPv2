import React from "react";
import Link from "next/link";

type StockCountRecoveryPanelProps = {
  inventoryLocationName: string;
  currentAttemptNumber: number | null;
  caseStatus: string;
  freezeMovements: boolean;
  canShowProtectedFacts: boolean;
  adjustment: {
    id: string;
    publicReference: string | null;
    status: string;
  } | null;
  attemptHistory: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    cutoffAt: string | null;
    reviewedAt: string | null;
    assignedToName: string | null;
    reviewedByName: string | null;
    hasEvidence: boolean;
    adjustment: {
      id: string;
      publicReference: string;
      status: string;
    } | null;
    recovery: {
      adjustmentDisposition: string;
      cutoffDisposition: string;
      occurredAt: string;
      linkedAdjustment?: {
        id: string;
        publicReference: string;
        status: string;
      } | null;
    } | null;
  }>;
};

export type StockCountRecoveryState = {
  label: string;
  description: string;
  adjustmentAction: "NONE" | "CANCEL" | "VOID" | "WAIT" | "REVERSE" | "READY";
};

/**
 * A deliberately non-mutating explanation of the DEC-0264 recovery contract.
 * The service does not yet expose an authorized recount admission action, so
 * this component must never imply that a browser-side click can recover a count.
 */
export function getStockCountRecoveryState(
  adjustmentStatus: string | null
): StockCountRecoveryState {
  if (!adjustmentStatus) {
    return {
      label: "No linked variance adjustment",
      description:
        "There is no linked variance adjustment to settle. Recount admission remains unavailable until the server-side permission, MFA, reason, evidence, idempotency, and immutable-attempt controls are active.",
      adjustmentAction: "NONE"
    };
  }

  if (
    ["DRAFT", "SUBMITTED", "RETURNED", "PENDING_APPROVAL"].includes(
      adjustmentStatus
    )
  ) {
    return {
      label: "Normal cancellation required",
      description:
        "The linked adjustment must complete its ordinary controlled cancellation before a successor attempt can be considered. This page cannot cancel it or start a recount.",
      adjustmentAction: "CANCEL"
    };
  }

  if (adjustmentStatus === "APPROVED") {
    return {
      label: "Approved adjustment requires protected void",
      description:
        "An approved but unposted adjustment must be atomically voided for recount before a successor can be created. The protected void action is not active on this page.",
      adjustmentAction: "VOID"
    };
  }

  if (adjustmentStatus === "POSTING") {
    return {
      label: "Posting outcome pending",
      description:
        "Wait for the adjustment to reach a terminal status. Recovery is blocked so a concurrent posting result cannot be bypassed.",
      adjustmentAction: "WAIT"
    };
  }

  if (adjustmentStatus === "POSTED") {
    return {
      label: "Full reversal required",
      description:
        "A posted adjustment is never voided for recount. Complete the durable full-document reversal first; only then may protected successor admission be evaluated.",
      adjustmentAction: "REVERSE"
    };
  }

  if (
    ["REVERSED", "CANCELLED", "VOIDED_FOR_RECOUNT"].includes(
      adjustmentStatus
    )
  ) {
    return {
      label: "Terminal disposition recorded",
      description:
        "The linked adjustment has a terminal recovery disposition. A successor attempt is still unavailable until server-side recount admission verifies live authority, MFA, reason, evidence, and exact scope.",
      adjustmentAction: "READY"
    };
  }

  return {
    label: "Adjustment disposition must be verified",
    description:
      "The linked adjustment is not in a recognized recovery state. Recount admission is blocked until an authorized server-side workflow verifies its terminal disposition.",
    adjustmentAction: "WAIT"
  };
}

export function StockCountRecoveryPanel({
  inventoryLocationName,
  currentAttemptNumber,
  caseStatus,
  freezeMovements,
  canShowProtectedFacts,
  adjustment,
  attemptHistory
}: StockCountRecoveryPanelProps) {
  const recovery = canShowProtectedFacts
    ? getStockCountRecoveryState(adjustment?.status ?? null)
    : null;

  return (
    <div className="mt-6 grid gap-4">
      <section
        aria-labelledby="stock-count-attempt-lineage-heading"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3
              id="stock-count-attempt-lineage-heading"
              className="text-lg font-bold text-slate-950"
            >
              Attempts &amp; lineage
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Attempt history is immutable. A later recount appends a successor; it
              never reopens or replaces prior count evidence.
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-700">
            Attempt {currentAttemptNumber ?? "unavailable"}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-500">Current attempt</dt>
            <dd className="mt-1 text-slate-950">
              {currentAttemptNumber === null
                ? "Immutable attempt projection is unavailable"
                : `Attempt ${currentAttemptNumber}`}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Stable case status</dt>
            <dd className="mt-1 text-slate-950">{caseStatus}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Cutoff rule</dt>
            <dd className="mt-1 text-slate-950">
              Any future successor begins with a new cutoff; prior cutoff retention
              is not enabled.
            </dd>
          </div>
        </dl>

        {canShowProtectedFacts ? (
          <ol className="mt-3 grid gap-2" aria-label="Immutable count attempts">
            {attemptHistory.map((attempt) => (
              <li
                className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
                key={attempt.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">
                    Attempt {attempt.attemptNumber} · {attempt.status}
                  </span>
                  <span className="text-slate-600">
                    {attempt.cutoffAt
                      ? `Cutoff ${new Date(attempt.cutoffAt).toLocaleString()}`
                      : "Cutoff pending"}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">
                  Counter: {attempt.assignedToName ?? "Unassigned"} · Reviewer:{" "}
                  {attempt.reviewedByName ?? "Pending"} · Evidence:{" "}
                  {attempt.hasEvidence ? "Recorded" : "Not recorded"}
                </p>
                {attempt.adjustment || attempt.recovery?.linkedAdjustment ? (
                  <p className="mt-1 text-slate-700">
                    Linked adjustment:{" "}
                    <Link
                      className="font-semibold text-blue-700 underline"
                      href={`/adjustments/${(attempt.adjustment ?? attempt.recovery?.linkedAdjustment)!.id}`}
                    >
                      {(attempt.adjustment ?? attempt.recovery?.linkedAdjustment)!.publicReference}
                    </Link>{" "}
                    / {(attempt.adjustment ?? attempt.recovery?.linkedAdjustment)!.status}
                  </p>
                ) : (
                  <p className="mt-1 text-slate-600">No linked adjustment</p>
                )}
                {attempt.recovery ? (
                  <p className="mt-1 text-slate-700">
                    Successor recorded · {attempt.recovery.cutoffDisposition} ·{" "}
                    {attempt.recovery.adjustmentDisposition}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Historic attempt details are restricted to an independently authorized
            reviewer. This protects blind-count evidence while preserving the
            immutable record as the source of truth.
          </p>
        )}
      </section>

      <section
        aria-labelledby="stock-count-recovery-heading"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4"
      >
        <h3
          id="stock-count-recovery-heading"
          className="text-lg font-bold text-amber-950"
        >
          Recount / correction
        </h3>
        <div className="mt-3 rounded-md border border-amber-200 bg-white/70 p-3 text-sm text-amber-950">
          <p className="font-semibold">Recovery summary</p>
          <p className="mt-1">
            {inventoryLocationName} · Attempt {currentAttemptNumber ?? "unavailable"}
            {" · "}Case {caseStatus} · {freezeMovements
              ? "movement-freeze policy applies"
              : "no movement freeze configured"}
          </p>
          <p className="mt-1">
            A protected recount requires independent authority, live scope
            verification, MFA, a reason, configured evidence, idempotency
            protection, and server-side immutable-attempt admission.
          </p>
        </div>

        {!canShowProtectedFacts ? (
          <p className="mt-3 text-sm leading-6 text-amber-950">
            Recount and adjustment recovery facts are restricted to the independent
            reviewer. No prior quantities, variance, review detail, or adjustment
            linkage is shown to this blind-count user.
          </p>
        ) : (
          <div className="mt-3 rounded-md border border-amber-200 bg-white/70 p-3 text-sm text-amber-950">
            <p className="font-semibold">
              Adjustment recovery: {recovery?.label}
            </p>
            {adjustment ? (
              <p className="mt-1">
                Linked adjustment:{" "}
                <Link
                  className="font-semibold underline"
                  href={`/adjustments/${adjustment.id}`}
                >
                  {adjustment.publicReference ?? "Open adjustment"}
                </Link>{" "}
                / {adjustment.status}
              </p>
            ) : null}
            <p className="mt-1 leading-6">{recovery?.description}</p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-amber-950">
            Recount recovery is default-off. No adjustment is cancelled, voided, reversed, posted, or created from this page.
          </p>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-70"
            disabled
            type="button"
          >
            Request protected recount (not available)
          </button>
        </div>
      </section>
    </div>
  );
}
