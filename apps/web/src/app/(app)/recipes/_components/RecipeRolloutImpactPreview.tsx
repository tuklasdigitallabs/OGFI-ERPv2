"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type BranchReadiness = {
  locationId: string;
  locationCode: string;
  locationName: string;
  inheritedMenuItemIds: string[];
  localEffectiveTime: string | null;
  atServiceBoundary: boolean;
  blockers: string[];
};

type RolloutImpact = {
  adoptedMenuItemCount: number;
  safeToAdvance: boolean;
  blockers: string[];
  branchReadiness: BranchReadiness[];
  previewSnapshotHash: string;
};

const PAGE_SIZE = 6;

function RolloutButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 rounded-lg bg-blue-600 px-4 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Scheduling rollout…" : "Roll out published recipe"}
    </button>
  );
}

export function RecipeRolloutImpactPreview({
  action,
  brandId,
  effectiveFrom,
  impact,
  recipeId,
  recipeVersionId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  brandId: string;
  effectiveFrom: string;
  impact: RolloutImpact;
  recipeId: string;
  recipeVersionId: string;
}) {
  const [page, setPage] = useState(1);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const totalPages = Math.max(
    1,
    Math.ceil(impact.branchReadiness.length / PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleBranches = impact.branchReadiness.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const blockedBranchCount = impact.branchReadiness.filter(
    (branch) => branch.blockers.length > 0,
  ).length;

  return (
    <div className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Brand defaults</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">
            {impact.adoptedMenuItemCount}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Branches reviewed</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">
            {impact.branchReadiness.length}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Blocked branches</p>
          <p className={`mt-1 text-2xl font-bold ${blockedBranchCount ? "text-rose-700" : "text-emerald-700"}`}>
            {blockedBranchCount}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2">
          <h4 className="font-bold text-slate-950">Branch impact</h4>
          <p className="text-xs text-slate-500">
            Existing branch overrides and explicit unavailable decisions remain
            unchanged.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {visibleBranches.map((branch) => (
            <div
              className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={branch.locationId}
            >
              <div>
                <p className="font-semibold text-slate-950">
                  {branch.locationName}
                </p>
                <p className="text-xs text-slate-500">
                  {branch.locationCode} · {branch.inheritedMenuItemIds.length} inherited
                  item{branch.inheritedMenuItemIds.length === 1 ? "" : "s"} · local
                  boundary {branch.localEffectiveTime ?? "not resolved"}
                </p>
              </div>
              <span
                className={
                  branch.blockers.length
                    ? "rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700"
                    : "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"
                }
              >
                {branch.blockers.length ? "Blocked" : "Ready"}
              </span>
              {branch.blockers.length ? (
                <p className="text-xs font-semibold text-rose-700 sm:col-span-2">
                  {branch.blockers
                    .map((blocker) => blocker.replaceAll("_", " ").toLocaleLowerCase())
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-sm">
            <button
              className="min-h-10 rounded-lg border border-slate-200 px-3 font-semibold disabled:text-slate-400"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              Previous
            </button>
            <span className="font-semibold text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="min-h-10 rounded-lg border border-slate-200 px-3 font-semibold disabled:text-slate-400"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      {impact.blockers.length ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950" role="alert">
          <p className="font-bold">Rollout cannot be scheduled</p>
          <p className="mt-1">
            Resolve every branch boundary and recipe quantity blocker, then review a
            fresh impact snapshot.
          </p>
        </div>
      ) : null}

      <form action={action} className="grid gap-3">
        <input name="brandId" type="hidden" value={brandId} />
        <input name="effectiveFrom" type="hidden" value={effectiveFrom} />
        <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
        <input
          name="previewSnapshotHash"
          type="hidden"
          value={impact.previewSnapshotHash}
        />
        <input name="recipeId" type="hidden" value={recipeId} />
        <input name="recipeVersionId" type="hidden" value={recipeVersionId} />
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Rollout reason
          <textarea
            className="min-h-20 rounded-lg border border-slate-300 bg-white px-3 py-2"
            name="reason"
            placeholder="Approved version rollout and service-boundary reference"
            required
          />
        </label>
        <RolloutButton disabled={!impact.safeToAdvance} />
      </form>
    </div>
  );
}
