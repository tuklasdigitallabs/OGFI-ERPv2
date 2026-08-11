"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Badge } from "@ogfi/ui";

type PermissionFilter = "ALL" | "SENSITIVE" | "OVERRIDES" | "RECOMMENDED_DRIFT";

type PermissionOption = {
  id: string;
  code: string;
  description: string;
  label: string;
  recommended: boolean;
  sensitive: boolean;
  overrideState: string;
};

type PermissionGroup = {
  name: string;
  permissions: PermissionOption[];
  recommendedCount: number;
};

type RolePermissionEditorProps = {
  action: (formData: FormData) => void | Promise<void>;
  assignmentPage?: number | undefined;
  assignmentQuery?: string | undefined;
  enabledPermissionCodes: string[];
  groups: PermissionGroup[];
  integrityIssue: boolean;
  permissionFilter: PermissionFilter;
  permissionPage: number;
  permissionPageSize: number;
  permissionQuery: string;
  permissionTotal: number;
  returnPath: string;
  resetDraft?: boolean | undefined;
  roleId: string;
};

type PermissionDraft = {
  baselineSignature: string;
  codes: Set<string>;
};

const permissionDrafts = new Map<string, PermissionDraft>();

export function ApplyRecommendedRolePermissionsButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
      disabled={pending}
      type="submit"
    >
      {pending ? "Applying…" : "Apply Recommended Permissions"}
    </button>
  );
}

function SavePermissionOverridesButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Saving…" : "Save Permission Overrides"}
    </button>
  );
}

function equalSets(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  return Array.from(left).every((code) => right.has(code));
}

export function RolePermissionEditor({
  action,
  assignmentPage,
  assignmentQuery,
  enabledPermissionCodes,
  groups,
  integrityIssue,
  permissionFilter,
  permissionPage,
  permissionPageSize,
  permissionQuery,
  permissionTotal,
  returnPath,
  resetDraft = false,
  roleId,
}: RolePermissionEditorProps) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const initialCodes = useMemo(
    () => new Set(enabledPermissionCodes),
    [enabledPermissionCodes],
  );
  const savedSignature = useMemo(
    () => [...enabledPermissionCodes].sort().join("\u0000"),
    [enabledPermissionCodes],
  );
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(
    () =>
      new Set(permissionDrafts.get(roleId)?.codes ?? enabledPermissionCodes),
  );
  const totalPages = Math.max(
    1,
    Math.ceil(permissionTotal / permissionPageSize),
  );
  const hasDraftChanges = !equalSets(selectedCodes, initialCodes);

  useEffect(() => {
    const draft = permissionDrafts.get(roleId);
    if (resetDraft || (draft && draft.baselineSignature !== savedSignature)) {
      permissionDrafts.delete(roleId);
      setSelectedCodes(new Set(enabledPermissionCodes));
      return;
    }
    if (!draft) {
      setSelectedCodes(new Set(enabledPermissionCodes));
    }
  }, [enabledPermissionCodes, resetDraft, roleId, savedSignature]);

  function setDraft(next: Set<string>) {
    setSelectedCodes(next);
    if (equalSets(next, initialCodes)) permissionDrafts.delete(roleId);
    else {
      permissionDrafts.set(roleId, {
        baselineSignature: savedSignature,
        codes: new Set(next),
      });
    }
  }

  function togglePermission(code: string) {
    const next = new Set(selectedCodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setDraft(next);
  }

  function permissionHref(
    page: number,
    query = permissionQuery,
    filter = permissionFilter,
  ) {
    const params = new URLSearchParams({ permissionPage: String(page) });
    if (query.trim()) params.set("permissionQuery", query.trim());
    if (filter !== "ALL") params.set("permissionFilter", filter);
    if (assignmentQuery) params.set("assignmentQuery", assignmentQuery);
    if (assignmentPage && assignmentPage > 1)
      params.set("assignmentPage", String(assignmentPage));
    return `/admin/roles/${roleId}?${params.toString()}`;
  }

  function navigate(href: string) {
    startNavigation(() => router.push(href, { scroll: false }));
  }

  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const query = String(values.get("permissionQuery") ?? "");
    const filter = String(
      values.get("permissionFilter") ?? "ALL",
    ) as PermissionFilter;
    navigate(permissionHref(1, query, filter));
  }

  return (
    <div aria-busy={isNavigating}>
      <form
        className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={applyFilter}
      >
        <input
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
          name="permissionQuery"
          defaultValue={permissionQuery}
          placeholder="Search permission code or action"
        />
        <select
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
          name="permissionFilter"
          defaultValue={permissionFilter}
        >
          <option value="ALL">All permissions</option>
          <option value="SENSITIVE">Sensitive</option>
          <option value="OVERRIDES">Overrides</option>
          <option value="RECOMMENDED_DRIFT">Recommended drift</option>
        </select>
        <button
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:cursor-wait disabled:opacity-60"
          disabled={isNavigating}
          type="submit"
        >
          {isNavigating ? "Loading…" : "Filter"}
        </button>
      </form>

      <form action={action} className="mt-5">
        <input name="roleId" type="hidden" value={roleId} />
        <input name="returnPath" type="hidden" value={returnPath} />
        {Array.from(selectedCodes)
          .sort()
          .map((code) => (
            <input
              key={code}
              name="permissionCodes"
              type="hidden"
              value={code}
            />
          ))}

        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Permission selections are retained while you browse pages or apply
            filters. They reset when you refresh or cancel.
          </p>
          <Badge tone={hasDraftChanges ? "warning" : "neutral"} size="sm">
            {hasDraftChanges
              ? "Unsaved changes"
              : `${selectedCodes.size} enabled`}
          </Badge>
        </div>

        {permissionTotal === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No permissions match the current search or filter. Clear the filter
            to review the complete scoped permission catalog.
          </div>
        ) : null}

        <div className="space-y-4">
          {groups.map((group) => {
            const enabledOnPage = group.permissions.filter((permission) =>
              selectedCodes.has(permission.code),
            ).length;
            return (
              <section
                key={group.name}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <h3 className="font-bold text-slate-950">{group.name}</h3>
                    <p className="text-xs text-slate-500">
                      {enabledOnPage}/{group.permissions.length} enabled on this
                      page · {group.recommendedCount} recommended on this page
                    </p>
                  </div>
                  <Badge tone="neutral">
                    {group.permissions.length} permissions
                  </Badge>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.permissions.map((permission) => {
                    const enabled = selectedCodes.has(permission.code);
                    return (
                      <label
                        key={permission.id}
                        className="ogfi-toggle-row grid cursor-pointer gap-3 px-4 py-4 md:grid-cols-[1fr_auto] md:items-center"
                        data-testid="admin-role-permission-toggle"
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-950">
                              {permission.label}
                            </span>
                            {permission.recommended ? (
                              <Badge tone="info" size="sm">
                                Recommended
                              </Badge>
                            ) : null}
                            {permission.sensitive ? (
                              <Badge tone="warning" size="sm">
                                Sensitive
                              </Badge>
                            ) : null}
                            {permission.overrideState ===
                            "ADDED_FROM_RECOMMENDED" ? (
                              <Badge tone="warning" size="sm">
                                Added override
                              </Badge>
                            ) : null}
                            {permission.overrideState ===
                            "REMOVED_FROM_RECOMMENDED" ? (
                              <Badge tone="destructive" size="sm">
                                Removed override
                              </Badge>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-sm text-slate-600">
                            {permission.description}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-3 md:justify-end">
                          <span className="text-xs font-semibold text-slate-500">
                            {enabled ? "Enabled" : "Off"}
                          </span>
                          <input
                            checked={enabled}
                            className="peer sr-only"
                            disabled={integrityIssue}
                            onChange={() => togglePermission(permission.code)}
                            type="checkbox"
                          />
                          <span
                            aria-hidden="true"
                            className="h-7 w-12 rounded-full border border-slate-300 bg-slate-200 p-0.5 transition-colors peer-checked:border-blue-500 peer-checked:bg-blue-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                          >
                            <span className="block h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {permissionTotal > 0 ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-600">
              Showing page {permissionPage} of {totalPages} · {permissionTotal}{" "}
              permissions
            </p>
            <div className="flex gap-2">
              <button
                className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={isNavigating || permissionPage <= 1}
                onClick={() => navigate(permissionHref(permissionPage - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={isNavigating || permissionPage >= totalPages}
                onClick={() => navigate(permissionHref(permissionPage + 1))}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        {integrityIssue ? null : (
          <div className="sticky bottom-0 mt-5 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-[0_-18px_42px_-34px_rgba(15,23,42,0.7)] backdrop-blur">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Change reason
              <input
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                name="reason"
                placeholder="Explain why this role permission set is being changed"
                required
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <SavePermissionOverridesButton disabled={!hasDraftChanges} />
              <a
                className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                href="/admin?tab=roles"
                onClick={() => permissionDrafts.delete(roleId)}
              >
                Cancel and Return
              </a>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
