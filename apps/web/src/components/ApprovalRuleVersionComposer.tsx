"use client";

import { useActionState, useMemo, useState } from "react";

export type ApprovalRuleComposerState = {
  error?: string;
};

type TransactionOption = {
  value: string;
  label: string;
  requiredPermissionCode: string;
  routes: Array<{ value: string; label: string }>;
};

type RoleOption = {
  id: string;
  label: string;
  code: string;
  permissionCodes: string[];
};

type StepDraft = {
  key: string;
  roleId: string;
};

type Props = {
  action: (
    state: ApprovalRuleComposerState,
    formData: FormData,
  ) => Promise<ApprovalRuleComposerState>;
  idempotencyKey: string;
  transactionOptions: TransactionOption[];
  roleOptions: RoleOption[];
  initial?: {
    sourceRuleId?: string;
    transactionType: string;
    routeKey: string;
    priority: number;
    expectedLifecycleVersion?: number;
    expectedActiveRuleId?: string | null;
    steps: Array<{ roleId: string }>;
  };
  mode: "create" | "revise";
};

const inputClass =
  "min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function newStep(roleId = ""): StepDraft {
  return { key: globalThis.crypto.randomUUID(), roleId };
}

export function ApprovalRuleVersionComposer({
  action,
  idempotencyKey,
  transactionOptions,
  roleOptions,
  initial,
  mode,
}: Props) {
  const firstTransaction = initial?.transactionType ?? transactionOptions[0]?.value ?? "";
  const firstPermissionCode = transactionOptions.find(
    (option) => option.value === firstTransaction,
  )?.requiredPermissionCode;
  const firstEligibleRoleId = roleOptions.find((role) =>
    firstPermissionCode ? role.permissionCodes.includes(firstPermissionCode) : false,
  )?.id;
  const [transactionType, setTransactionType] = useState(firstTransaction);
  const availableRoutes = useMemo(
    () => transactionOptions.find((option) => option.value === transactionType)?.routes ?? [],
    [transactionOptions, transactionType],
  );
  const [routeKey, setRouteKey] = useState(
    initial?.routeKey ?? availableRoutes[0]?.value ?? "DEFAULT",
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps.length
      ? initial.steps.map((step) => newStep(step.roleId))
      : [newStep(firstEligibleRoleId)],
  );
  const [state, formAction, pending] = useActionState(action, {});
  const requiredPermissionCode = transactionOptions.find(
    (option) => option.value === transactionType,
  )?.requiredPermissionCode;
  const eligibleRoleOptions = roleOptions.filter((role) =>
    requiredPermissionCode
      ? role.permissionCodes.includes(requiredPermissionCode)
      : false,
  );

  function updateRole(index: number, roleId: string) {
    setSteps((current) =>
      current.map((step, stepIndex) =>
        stepIndex === index ? { ...step, roleId } : step,
      ),
    );
  }

  function moveStep(index: number, offset: -1 | 1) {
    setSteps((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function removeStep(index: number) {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  }

  const actionLabel = mode === "create" ? "Create Inactive Rule" : "Create Inactive Revision";

  return (
    <form action={formAction} className="grid gap-5" aria-busy={pending}>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input
        name="stepsJson"
        type="hidden"
        value={JSON.stringify(steps.map((step, index) => ({
          stepOrder: index + 1,
          roleId: step.roleId,
        })))}
      />
      {initial?.sourceRuleId ? (
        <input name="sourceRuleId" type="hidden" value={initial.sourceRuleId} />
      ) : null}
      {initial?.expectedLifecycleVersion !== undefined ? (
        <input name="expectedLifecycleVersion" type="hidden" value={initial.expectedLifecycleVersion} />
      ) : null}
      {initial?.expectedActiveRuleId ? (
        <input name="expectedActiveRuleId" type="hidden" value={initial.expectedActiveRuleId} />
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold text-slate-950">Route definition</h2>
        <p className="mt-1 text-sm text-slate-600">
          This version is saved inactive. Activation is a separate MFA-protected action.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Transaction type
            <select
              className={inputClass}
              disabled={mode === "revise"}
              name="transactionType"
              value={transactionType}
              onChange={(event) => {
                const nextTransaction = event.target.value;
                const nextRoutes = transactionOptions.find(
                  (option) => option.value === nextTransaction,
                )?.routes;
                setTransactionType(nextTransaction);
                setRouteKey(nextRoutes?.[0]?.value ?? "DEFAULT");
                const requiredPermission = transactionOptions.find(
                  (option) => option.value === nextTransaction,
                )?.requiredPermissionCode;
                const firstEligibleRole = roleOptions.find((role) =>
                  requiredPermission
                    ? role.permissionCodes.includes(requiredPermission)
                    : false,
                );
                setSteps((current) => current.map((step) => ({
                  ...step,
                  roleId: firstEligibleRole?.id ?? "",
                })));
              }}
              required
            >
              {transactionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {mode === "revise" ? (
              <input name="transactionType" type="hidden" value={transactionType} />
            ) : null}
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Route template
            <select
              className={inputClass}
              disabled={mode === "revise"}
              name="routeKey"
              value={routeKey}
              onChange={(event) => setRouteKey(event.target.value)}
              required
            >
              {availableRoutes.map((route) => (
                <option key={route.value} value={route.value}>{route.label}</option>
              ))}
            </select>
            {mode === "revise" ? (
              <input name="routeKey" type="hidden" value={routeKey} />
            ) : null}
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Priority
            <input
              className={inputClass}
              defaultValue={initial?.priority ?? 100}
              min={1}
              max={10_000}
              name="priority"
              type="number"
              required
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Required sequential steps</h2>
            <p className="mt-1 text-sm text-slate-600">
              Roles are revalidated for approval permission and selected-company membership when saved and activated.
            </p>
          </div>
          <button
            className="min-h-11 rounded-md border border-blue-200 px-3 text-sm font-semibold text-blue-700 disabled:text-slate-400"
            disabled={pending || steps.length >= 20 || eligibleRoleOptions.length === 0}
            onClick={() => setSteps((current) => [...current, newStep(eligibleRoleOptions[0]?.id)])}
            type="button"
          >
            Add Step
          </button>
        </div>
        {eligibleRoleOptions.length === 0 ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            No eligible approval roles are available. Configure an active role with the required permission and selected-company member first.
          </p>
        ) : null}
        <ol className="mt-4 grid gap-3">
          {steps.map((step, index) => (
            <li key={step.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
                <span className="flex min-h-11 items-center text-sm font-bold text-slate-700">
                  Step {index + 1}
                </span>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Approval role
                  <select
                    aria-label={`Approval role for step ${index + 1}`}
                    className={inputClass}
                    disabled={pending || roleOptions.length === 0}
                    value={step.roleId}
                    onChange={(event) => updateRole(index, event.target.value)}
                    required
                  >
                    <option value="">Select a role</option>
                    {eligibleRoleOptions.map((role) => (
                      <option key={role.id} value={role.id}>{role.label} / {role.code}</option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={pending || index === 0} onClick={() => moveStep(index, -1)} type="button">Move up</button>
                  <button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={pending || index === steps.length - 1} onClick={() => moveStep(index, 1)} type="button">Move down</button>
                  <button className="min-h-11 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-700 disabled:text-slate-400" disabled={pending || steps.length === 1} onClick={() => removeStep(index)} type="button">Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Change reason
          <textarea
            className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            maxLength={500}
            minLength={5}
            name="reason"
            placeholder="Explain the routing policy change and its approved purpose."
            required
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Named users, arbitrary filters, parallel steps, delegation, and escalation are intentionally unavailable in this Phase I composer.
        </p>
      </section>

      {state.error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {state.error}
        </p>
      ) : null}

      <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 py-4 backdrop-blur sm:flex-row sm:justify-end">
        <a className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700" href={mode === "create" ? "/admin?tab=approval-rules" : "../"}>Cancel</a>
        <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300" disabled={pending || eligibleRoleOptions.length === 0 || steps.some((step) => !eligibleRoleOptions.some((role) => role.id === step.roleId))} type="submit">
          {pending ? "Saving…" : actionLabel}
        </button>
      </div>
    </form>
  );
}
