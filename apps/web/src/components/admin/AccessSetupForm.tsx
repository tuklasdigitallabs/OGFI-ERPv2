"use client";

import { useMemo, useState } from "react";

type RoleOption = {
  id: string;
  name: string;
  code: string;
  systemRole: boolean;
  canAssignDirectly?: boolean;
  assignmentEligibility?: string;
};

type LocationOption = {
  id: string;
  name: string;
  code: string | null;
  locationType: string;
};

type AccessLevel = "VIEW" | "OPERATE" | "APPROVE" | "MANAGE";

const accessLevels: Array<{ value: AccessLevel; label: string; description: string }> = [
  { value: "VIEW", label: "View", description: "Read authorized records and dashboards." },
  { value: "OPERATE", label: "Operate", description: "Create drafts, perform routine work, and submit tasks." },
  { value: "APPROVE", label: "Approve", description: "Review and approve assigned workflows." },
  { value: "MANAGE", label: "Manage", description: "Configure and administer the assigned scope." },
];

export function AccessSetupForm({
  action,
  roleOptions,
  locationOptions,
}: {
  action: (formData: FormData) => void | Promise<void>;
  roleOptions: RoleOption[];
  locationOptions: LocationOption[];
}) {
  const [noAccess, setNoAccess] = useState(false);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("OPERATE");
  const [roleId, setRoleId] = useState("");

  const activeRoles = useMemo(
    () => roleOptions.filter((role) => !role.systemRole || role.canAssignDirectly !== undefined),
    [roleOptions],
  );
  const selectedRole = activeRoles.find((role) => role.id === roleId);
  const selectedRoleRequiresApproval = Boolean(selectedRole && (selectedRole.systemRole || !selectedRole.canAssignDirectly));
  const selectedAccessRequiresApproval = accessLevel === "APPROVE" || accessLevel === "MANAGE";
  const directSetupRequiresApproval = selectedRoleRequiresApproval || selectedAccessRequiresApproval;
  const quickLocations = useMemo(
    () => locationOptions.filter((location) => !["WAREHOUSE", "COMMISSARY", "CENTRAL_KITCHEN", "HEAD_OFFICE", "PROJECT_SITE", "TEMPORARY_SITE"].includes(location.locationType)),
    [locationOptions],
  );

  return (
    <form action={action} className="ogfi-form-shell mt-4 grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Full name
          <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="displayName" required />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Email
          <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="email" type="email" required />
        </label>
      </div>

      <fieldset className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <legend className="px-1 text-sm font-bold text-slate-900">Initial access</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-blue-200 bg-white p-3">
          <input
            className="mt-1 h-4 w-4"
            type="radio"
            name="setupMode"
            value="access"
            checked={!noAccess}
            onChange={() => setNoAccess(false)}
          />
          <span>
            <span className="block font-semibold text-slate-950">Grant access now</span>
            <span className="block text-xs font-normal text-slate-600">Choose the first location, access level, and role for this user.</span>
          </span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <input
            className="mt-1 h-4 w-4"
            type="radio"
            name="setupMode"
            value="none"
            checked={noAccess}
            onChange={() => {
              setNoAccess(true);
              setRoleId("");
            }}
          />
          <span>
            <span className="block font-semibold text-slate-950">Create without access</span>
            <span className="block text-xs font-normal text-slate-600">Creates an active account with no role or location. An administrator must add access later.</span>
          </span>
        </label>
      </fieldset>

      {!noAccess ? (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            First location
            <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="initialLocationId" required disabled={noAccess}>
              <option value="">Select a branch or operating location</option>
              {quickLocations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}{location.code ? ` / ${location.code}` : ""}</option>
              ))}
            </select>
            {quickLocations.length === 0 ? <span className="text-xs font-normal text-amber-700">No low-risk locations are available for quick setup. Controlled locations require an approved request.</span> : null}
            {locationOptions.length > quickLocations.length ? <span className="text-xs font-normal text-slate-500">Warehouse, head-office, and other controlled locations require a separate approval request.</span> : null}
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Role
            <select className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2" name="initialRoleId" value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={noAccess}>
              <option value="">No role yet</option>
              {activeRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name} · {role.systemRole ? "System role" : role.canAssignDirectly ? "Quick setup" : "Approval required"}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">Roles define what the user can do. The location below defines where they can do it.</span>
            {selectedRoleRequiresApproval ? (
              <span className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-normal leading-5 text-amber-900" role="alert">
                <strong>{selectedRole?.name}</strong> includes controlled permissions. Save the role freely, but user assignment requires approval. Choose “Create without access” and submit the access request after the account is created.
              </span>
            ) : null}
          </label>
        </div>
      ) : (
        <input type="hidden" name="initialLocationId" value="" />
      )}

      {!noAccess ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-slate-700">Location access level</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {accessLevels.map((level) => (
              <label key={level.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${accessLevel === level.value ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}>
                <input className="mt-1 h-4 w-4" type="radio" name="accessLevel" value={level.value} checked={accessLevel === level.value} onChange={() => setAccessLevel(level.value)} />
                <span><span className="block font-semibold text-slate-950">{level.label}</span><span className="block text-xs font-normal text-slate-600">{level.description}</span></span>
              </label>
            ))}
          </div>
          <span className="text-xs text-slate-500">View and Operate can be granted directly for a safe role at a branch. Approve and Manage always require a controlled request.</span>
          {selectedAccessRequiresApproval ? (
            <span className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900" role="alert">
              {accessLevel === "APPROVE" ? "Approve access" : "Manage access"} requires a controlled request, even for a safe role. Choose “Create without access” and request this access after the account is created.
            </span>
          ) : null}
        </fieldset>
      ) : (
        <input type="hidden" name="accessLevel" value="VIEW" />
      )}

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Setup reason
        <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="reason" required placeholder={noAccess ? "Why is an account being created before access is assigned?" : "For example: SM North EDSA branch inventory staff"} />
      </label>
      <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-slate-700">
        Access is recorded and audited. Quick setup applies only to safe roles at ordinary branches with View or Operate. Controlled roles, Approve or Manage access, and controlled locations follow the approval workflow.
      </p>
      <button disabled={directSetupRequiresApproval} className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 md:w-fit">
        {noAccess ? "Create user without access" : "Create user and access"}
      </button>
    </form>
  );
}
