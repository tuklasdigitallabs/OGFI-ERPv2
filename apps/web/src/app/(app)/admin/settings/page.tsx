import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  FileText,
  Layers3,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import { Badge, Panel } from "@ogfi/ui";
import { ActionFeedbackBanner } from "@/components/ActionFeedbackBanner";
import { AppShell } from "@/components/AppShell";
import { EntryModal } from "@/components/EntryModal";
import {
  actionErrorRedirectPath,
  getActionFeedback
} from "@/server/services/actionFeedback";
import { getDefaultAppRoute, permissions } from "@/server/services/authorization";
import { getSessionContext } from "@/server/services/context";
import {
  listCompanyPolicySettings,
  policySettingCategories,
  resetCompanyPolicySetting,
  updateCompanyPolicySetting
} from "@/server/services/policySettings";

export const dynamic = "force-dynamic";

type AdminSettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PolicySetting = Awaited<
  ReturnType<typeof listCompanyPolicySettings>
>[number];
type PolicyOption = PolicySetting["options"][number];

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCategory(value: string | undefined) {
  return policySettingCategories.some((category) => category.id === value)
    ? value!
    : policySettingCategories[0]!.id;
}

function displayPolicyValue(setting: PolicySetting) {
  if (setting.valueType === "BOOLEAN") {
    return setting.value === true ? "Enabled" : "Disabled";
  }

  if (setting.valueType === "SELECT") {
    const option = setting.options.find(
      (item: PolicyOption) => item.value === String(setting.value)
    );
    return option?.label ?? String(setting.value);
  }

  if (setting.valueType === "JSON") {
    return setting.valueText;
  }

  return `${String(setting.value)}${setting.unit ? ` ${setting.unit}` : ""}`;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function yesNo(value: unknown) {
  return value === true ? "Yes" : value === false ? "No" : "Not set";
}

function formatYears(value: unknown) {
  return typeof value === "number" ? `${value} years` : "Not set";
}

function formatList(value: unknown) {
  return Array.isArray(value) && value.length > 0 ? value.join(", ") : "Not set";
}

const arrayPolicyOptions: Record<
  string,
  { value: string; label: string; description: string }[]
> = {
  "purchasing.supplier.po_allowed_statuses": [
    {
      value: "PENDING_REVIEW",
      label: "Pending review",
      description: "Supplier is active but not yet cleared for normal POs."
    },
    {
      value: "APPROVED",
      label: "Approved",
      description: "Supplier is accredited and can be used for normal POs."
    },
    {
      value: "SUSPENDED",
      label: "Suspended",
      description: "Supplier is temporarily blocked from normal POs."
    },
    {
      value: "BLOCKED",
      label: "Blocked",
      description: "Supplier is blocked until formally reviewed."
    }
  ],
  "inventory.lot_expiry.required_categories": [
    {
      value: "BEEF_CUTS",
      label: "Beef cuts",
      description: "Yakiniku beef items and high-value cuts."
    },
    {
      value: "POULTRY",
      label: "Poultry",
      description: "Chicken and other poultry items."
    },
    {
      value: "SEAFOOD",
      label: "Seafood",
      description: "Fish, shrimp, and other seafood ingredients."
    },
    {
      value: "FRESH_PRODUCE",
      label: "Fresh produce",
      description: "Vegetables, herbs, and other fresh produce."
    },
    {
      value: "SAUCES",
      label: "Sauces",
      description: "Prepared sauces and liquid flavoring bases."
    },
    {
      value: "READY_TO_EAT",
      label: "Ready to eat",
      description: "Prepared food items with expiry control."
    }
  ]
};

function isStringArrayPolicy(setting: PolicySetting) {
  return (
    setting.valueType === "JSON" &&
    Array.isArray(setting.defaultValue) &&
    arrayPolicyOptions[setting.key]
  );
}

function policySummaryLines(setting: PolicySetting) {
  const value = asRecord(setting.value);

  if (setting.key === "security.retention.matrix") {
    return [
      `Audit, security, and financial-control records: ${formatYears(
        value.audit_security_financial_control_years
      )}`,
      `Operational working records: ${formatYears(
        value.operational_working_record_years
      )}`,
      `Attachments: ${String(value.attachment_retention ?? "Not set").replaceAll("_", " ")}`,
      `PII minimization: ${yesNo(value.pii_minimization_required)}`,
      `Export redaction where not needed: ${yesNo(
        value.export_redaction_required_where_not_needed
      )}`
    ];
  }

  if (setting.key === "security.backup_restore.default_policy") {
    return [
      `Database backup frequency: ${String(value.database_backup_frequency ?? "Not set")}`,
      `Encrypted backup required: ${yesNo(value.encryption_required)}`,
      `Offsite copy required: ${yesNo(value.offsite_copy_required)}`,
      `Checksum verification required: ${yesNo(value.checksum_verification_required)}`,
      `Restore rehearsal frequency: ${String(
        value.restore_rehearsal_frequency ?? "Not set"
      )}`,
      `Pre-release backup/restore evidence required: ${yesNo(
        value.pre_release_backup_restore_evidence_required
      )}`
    ];
  }

  if (setting.key === "inventory.lot_expiry.required_categories") {
    return [`Required category codes: ${formatList(setting.value)}`];
  }

  if (setting.key === "purchasing.supplier.po_allowed_statuses") {
    return [`Allowed supplier accreditation statuses: ${formatList(setting.value)}`];
  }

  return [];
}

function renderPolicyValueField(setting: PolicySetting) {
  const labelClass = "grid gap-1 text-sm font-medium text-slate-700";
  const inputClass = "rounded-md border border-slate-300 px-3 py-2";

  if (setting.valueType === "BOOLEAN") {
    return (
      <label className={labelClass}>
        Setting value
        <select className={inputClass} name="value" defaultValue={String(setting.value)}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </label>
    );
  }

  if (setting.valueType === "SELECT") {
    return (
      <label className={labelClass}>
        Setting value
        <select className={inputClass} name="value" defaultValue={String(setting.value)}>
          {setting.options.map((option: PolicyOption) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (setting.valueType === "JSON") {
    if (isStringArrayPolicy(setting)) {
      const selectedValues = Array.isArray(setting.value)
        ? setting.value.map(String)
        : [];
      const options = arrayPolicyOptions[setting.key] ?? [];

      return (
        <fieldset className="grid gap-3">
          <legend className="text-sm font-bold text-slate-700">Setting value</legend>
          <input name="value" type="hidden" value="__VALUE_ITEMS__" />
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => {
              const inputId = `${setting.key}-${option.value}`;
              const isChecked = selectedValues.includes(option.value);

              return (
                <label
                  key={option.value}
                  className="flex min-h-20 cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-blue-200 hover:bg-blue-50/60"
                  htmlFor={inputId}
                >
                  <span>
                    <span className="block font-bold text-slate-950">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {option.description}
                    </span>
                  </span>
                  <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
                    <input
                      className="peer sr-only"
                      defaultChecked={isChecked}
                      id={inputId}
                      name="valueItem"
                      type="checkbox"
                      value={option.value}
                    />
                    <span className="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-blue-600" />
                    <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            Toggle the values allowed by this policy. Saving still writes an
            audited DEC-0036 company-policy change.
          </p>
        </fieldset>
      );
    }

    return (
      <label className={labelClass}>
        Setting value
        <textarea
          className="min-h-40 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
          name="value"
          defaultValue={setting.valueText}
          spellCheck={false}
        />
      </label>
    );
  }

  return (
    <label className={labelClass}>
      Setting value {setting.unit ? `(${setting.unit})` : ""}
      <input
        className={inputClass}
        name="value"
        defaultValue={String(setting.value)}
        min="0"
        step={setting.valueType === "NUMBER" ? "any" : undefined}
        type={setting.valueType === "NUMBER" ? "number" : "text"}
      />
    </label>
  );
}

async function updatePolicySettingAction(formData: FormData) {
  "use server";

  try {
    await updateCompanyPolicySetting(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/settings", error));
  }
  revalidatePath("/admin/settings");
  redirect("/admin/settings");
}

async function resetPolicySettingAction(formData: FormData) {
  "use server";

  try {
    await resetCompanyPolicySetting(formData);
  } catch (error) {
    redirect(actionErrorRedirectPath("/admin/settings", error));
  }
  revalidatePath("/admin/settings");
  redirect("/admin/settings");
}

export default async function AdminSettingsPage({
  searchParams
}: AdminSettingsPageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/sign-in");
  }
  if (!session.permissionCodes.includes(permissions.coreAdminister)) {
    redirect(getDefaultAppRoute(session.permissionCodes));
  }

  const params = searchParams ? await searchParams : {};
  const actionFeedback = getActionFeedback(params);
  const selectedCategory = normalizeCategory(getSearchParam(params, "category"));
  const settings = await listCompanyPolicySettings(session);
  const category = policySettingCategories.find((item) => item.id === selectedCategory)!;
  const visibleSettings = settings.filter(
    (setting) => setting.category === selectedCategory
  );
  const overriddenCount = settings.filter((setting) => setting.isOverridden).length;
  const defaultCount = settings.length - overriddenCount;

  return (
    <AppShell
      session={session}
      title="Admin Settings"
      subtitle="Configurable operating-policy defaults approved by DEC-0036"
      activeNav="admin-settings"
    >
      <ActionFeedbackBanner feedback={actionFeedback} />

      <section className="mb-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[var(--shadow-surface)]">
        <div className="grid gap-5 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 lg:grid-cols-[1.25fr_0.75fr] lg:p-6">
          <div>
            <Badge tone="info">Policy configuration</Badge>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">
              Start with recommended F&B defaults, override only when policy requires it.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              These settings turn DEC-0036 into company-scoped configuration. They do
              not bypass workflow controls; they provide the defaults that purchasing,
              inventory, reporting, projects, and release-readiness checks can consume.
            </p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white/85 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <p className="font-semibold text-slate-950">Audited overrides</p>
                <p className="mt-1 text-sm text-slate-600">
                  Changes require Core Admin permission, company Manage scope, and a
                  reason stored in the audit trail.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-3">
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Configured policies</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{settings.length}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Using recommendations</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{defaultCount}</p>
        </Panel>
        <Panel className="ogfi-detail-card">
          <p className="text-sm font-semibold text-slate-500">Company overrides</p>
          <p className="mt-2 text-3xl font-bold text-amber-700">{overriddenCount}</p>
        </Panel>
      </section>

      <section className="ogfi-data-surface mb-5 p-2">
        <div className="grid gap-2 lg:grid-cols-6">
          {policySettingCategories.map((item) => {
            const isActive = item.id === selectedCategory;
            const itemCount = settings.filter(
              (setting) => setting.category === item.id
            ).length;

            return (
              <a
                key={item.id}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "rounded-xl bg-blue-50 px-4 py-3 text-blue-700 ring-1 ring-blue-100"
                    : "rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }
                href={`/admin/settings?category=${item.id}`}
              >
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {itemCount} defaults
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <Panel className="ogfi-detail-card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Layers3 aria-hidden="true" className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-950">{category.label}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">{category.description}</p>
          </div>
          <Badge tone="info">Source DEC-0036</Badge>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[1.4fr_1fr_8rem_10rem] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 max-lg:hidden">
            <span>Policy</span>
            <span>Current value</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          <div className="divide-y divide-slate-100">
            {visibleSettings.map((setting) => (
              <div
                key={setting.key}
                className="grid gap-4 px-4 py-4 lg:grid-cols-[1.4fr_1fr_8rem_10rem] lg:items-center"
              >
                <div>
                  <p className="font-bold text-slate-950">{setting.label}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    {setting.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
                      <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                      {setting.sourceDecisionId}
                    </span>
                    {setting.updatedAt ? (
                      <span>Updated {new Date(setting.updatedAt).toLocaleDateString()}</span>
                    ) : (
                      <span>Recommended default</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950">
                    {displayPolicyValue(setting)}
                  </p>
                  {policySummaryLines(setting).length > 0 ? (
                    <ul className="mt-2 grid gap-1 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs leading-5 text-slate-700">
                      {policySummaryLines(setting).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    Default: {displayPolicyValue({ ...setting, value: setting.defaultValue })}
                  </p>
                </div>
                <div>
                  {setting.isOverridden ? (
                    <Badge tone="warning">Overridden</Badge>
                  ) : (
                    <Badge tone="success">
                      <BadgeCheck aria-hidden="true" className="mr-1 inline h-3 w-3" />
                      Recommended
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2">
                  <EntryModal
                    title={`Configure ${setting.label}`}
                    triggerLabel="Configure"
                    triggerClassName="w-full border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                  >
                    <form
                      action={updatePolicySettingAction}
                      className="ogfi-form-shell mt-4 grid gap-4"
                    >
                      <input name="key" type="hidden" value={setting.key} />
                      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                        <p className="font-bold text-slate-950">{setting.label}</p>
                        <p className="mt-1 text-sm leading-5 text-slate-600">
                          {setting.description}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-blue-700">
                          Recommended value: {displayPolicyValue({ ...setting, value: setting.defaultValue })}
                        </p>
                      </div>
                      {renderPolicyValueField(setting)}
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        Reason for change
                        <textarea
                          className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                          name="reason"
                          placeholder="Explain the policy reason for this override or reset."
                          required
                        />
                      </label>
                      <button className="min-h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                        Save Setting
                      </button>
                    </form>
                  </EntryModal>
                  {setting.isOverridden ? (
                    <form action={resetPolicySettingAction}>
                      <input name="key" type="hidden" value={setting.key} />
                      <button className="min-h-10 w-full rounded-md border border-emerald-200 bg-white px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                        Use Recommended
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <SlidersHorizontal
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 text-amber-700"
            />
            <p>
              A setting being visible here does not grant authority by itself.
              Workflow services must still enforce permissions, approvals, scope, audit,
              and inventory-ledger rules when they consume these values.
            </p>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
