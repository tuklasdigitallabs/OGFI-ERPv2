"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

export type ApprovalDecisionActionState =
  | { status: "idle" }
  | {
      status: "error";
      code: string;
      message: string;
      fieldErrors?: {
        decision?: string;
        remarks?: string;
        evidenceReference?: string;
      };
    };

export type ApprovalDecisionAction = (
  previousState: ApprovalDecisionActionState,
  formData: FormData
) => Promise<ApprovalDecisionActionState>;

export type ApprovalDecisionPresentation = {
  family: string;
  decisions: Array<{
    decision: string;
    label: string;
    supported: boolean;
    available: boolean;
    disabledReasonCode?: string | null;
    disabledReason?: string | null;
  }>;
  supportsSupplementalEvidence: boolean;
};

type Props = {
  approvalInstanceId: string;
  presentation: ApprovalDecisionPresentation;
  action: ApprovalDecisionAction;
  reviewToken?: string;
  reloadCurrentReviewHref?: string;
};

function decisionButtonClass(decision: string) {
  if (decision.toUpperCase() === "APPROVE") {
    return "bg-blue-600 text-white hover:bg-blue-700";
  }
  if (decision.toUpperCase() === "REJECT") {
    return "bg-red-600 text-white hover:bg-red-700";
  }
  return "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50";
}

export function ApprovalDecisionComposer({
  approvalInstanceId,
  presentation,
  action,
  reviewToken,
  reloadCurrentReviewHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [remarks, setRemarks] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const submitLockRef = useRef(false);
  const remarksRef = useRef<HTMLTextAreaElement>(null);
  const evidenceRef = useRef<HTMLInputElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const reasonPrefix = useId();
  const remarksErrorId = `${reasonPrefix}-remarks-error`;
  const evidenceErrorId = `${reasonPrefix}-evidence-error`;
  const decisionErrorId = `${reasonPrefix}-decision-error`;
  const supportedDecisions = presentation.decisions.filter((entry) => entry.supported);
  const staleReview =
    state.status === "error" && state.code === "APPROVAL_REVIEW_STALE";

  useEffect(() => {
    if (!pending) submitLockRef.current = false;
  }, [pending, state]);

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.fieldErrors?.remarks) remarksRef.current?.focus();
    else if (state.fieldErrors?.evidenceReference) evidenceRef.current?.focus();
    else errorSummaryRef.current?.focus();
  }, [state]);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-4"
      onSubmit={(event) => {
        if (pending || submitLockRef.current) {
          event.preventDefault();
          return;
        }
        submitLockRef.current = true;
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-slate-950">Decision composer</h3>
          <p className="text-sm text-slate-600">
            Choose one outcome for this approval step. Remarks are required for return or reject decisions.
          </p>
        </div>
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">One decision only</span>
      </div>

      <div className="mt-4 grid gap-3">
        <input name="approvalInstanceId" type="hidden" value={approvalInstanceId} readOnly />
        {reviewToken ? <input name="reviewToken" type="hidden" value={reviewToken} readOnly /> : null}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Decision remarks
          <textarea
            aria-describedby={state.status === "error" && state.fieldErrors?.remarks ? remarksErrorId : undefined}
            aria-invalid={state.status === "error" && Boolean(state.fieldErrors?.remarks)}
            className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 disabled:cursor-wait disabled:bg-slate-100"
            disabled={pending}
            name="remarks"
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Optional for approval; required for return or rejection"
            ref={remarksRef}
            value={remarks}
          />
          {state.status === "error" && state.fieldErrors?.remarks ? (
            <span className="text-sm font-semibold text-rose-700" id={remarksErrorId}>
              {state.fieldErrors.remarks}
            </span>
          ) : null}
        </label>

        {presentation.supportsSupplementalEvidence ? (
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Supplemental decision evidence reference
            <input
              aria-describedby={state.status === "error" && state.fieldErrors?.evidenceReference ? evidenceErrorId : undefined}
              aria-invalid={state.status === "error" && Boolean(state.fieldErrors?.evidenceReference)}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 disabled:cursor-wait disabled:bg-slate-100"
              disabled={pending}
              name="evidenceReference"
              onChange={(event) => setEvidenceReference(event.target.value)}
              placeholder="Approval memo, review note, or supporting reference"
              ref={evidenceRef}
              value={evidenceReference}
            />
            {state.status === "error" && state.fieldErrors?.evidenceReference ? (
              <span className="text-sm font-semibold text-rose-700" id={evidenceErrorId}>
                {state.fieldErrors.evidenceReference}
              </span>
            ) : null}
            <span className="text-xs font-normal text-slate-500">
              Adds decision-support context. It does not replace or verify evidence already attached to the source record.
            </span>
          </label>
        ) : null}

        {supportedDecisions.map((entry) => {
          if (entry.available || !entry.disabledReason) return null;
          const reasonId = `${reasonPrefix}-${entry.decision.toLowerCase()}-reason`;
          return (
            <p
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              id={reasonId}
              key={reasonId}
            >
              {entry.disabledReason}
            </p>
          );
        })}

        <div aria-describedby={state.status === "error" && state.fieldErrors?.decision ? decisionErrorId : undefined} className={`grid gap-2 ${supportedDecisions.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {supportedDecisions.map((entry) => {
            const disabled = pending || staleReview || !entry.available;
            const reasonId = !entry.available && entry.disabledReason
              ? `${reasonPrefix}-${entry.decision.toLowerCase()}-reason`
              : undefined;
            return (
              <button
                aria-describedby={reasonId}
                className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${decisionButtonClass(entry.decision)}`}
                disabled={disabled}
                key={entry.decision}
                name="decision"
                type="submit"
                value={entry.decision}
              >
                {pending ? "Decision in progress…" : entry.label}
              </button>
            );
          })}
        </div>
        {state.status === "error" && state.fieldErrors?.decision ? (
          <p className="text-sm font-semibold text-rose-700" id={decisionErrorId}>
            {state.fieldErrors.decision}
          </p>
        ) : null}

        <div aria-atomic="true" aria-live="polite">
          {pending ? <p className="text-sm font-semibold text-blue-800">Submitting one approval decision…</p> : null}
          {state.status === "error" ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950" ref={errorSummaryRef} role="alert" tabIndex={-1}>
              <p className="font-bold">Decision not completed</p>
              <p className="mt-1">{state.message} Your remarks and evidence draft remain available.</p>
              {staleReview && reloadCurrentReviewHref ? (
                <>
                  <p className="mt-2 font-medium">
                    Decisions are disabled because this reviewed snapshot is no longer current.
                  </p>
                  <a
                    className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-rose-300 bg-white px-4 font-semibold text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
                    href={reloadCurrentReviewHref}
                  >
                    Reload current review
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
