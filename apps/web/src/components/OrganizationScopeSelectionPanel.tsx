import { Badge, ButtonLink } from "@ogfi/ui";
import { EntryModal } from "@/components/EntryModal";
import { OrganizationEditForm } from "@/components/OrganizationEditForm";
import type { CoreAdminOrganizationRecordDetail } from "@/server/services/coreAdmin";

type OrganizationScopeSelectionPanelProps = {
  record: CoreAdminOrganizationRecordDetail | null;
  requestedRecordId: string | undefined;
  closeHref: string;
};

function EditForm({ record }: { record: CoreAdminOrganizationRecordDetail }) {
  if (record.section === "companies") {
    return <EntryModal title={`Edit ${record.name}`} triggerLabel="Edit Company">
      <OrganizationEditForm endpoint="/api/admin/organization/company">
        <input type="hidden" name="companyId" value={record.id} />
        <p className="text-sm text-slate-600">Company code: <strong>{record.code}</strong>. Code, tenant ownership, and company relationships are immutable here.</p>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Legal name<input className="min-h-11 rounded-md border border-slate-300 px-3" name="legalName" defaultValue={record.legalName} required /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Trading name<input className="min-h-11 rounded-md border border-slate-300 px-3" name="tradingName" defaultValue={record.tradingName ?? ""} /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Tax identifier<input className="min-h-11 rounded-md border border-slate-300 px-3" name="taxIdentifier" defaultValue={record.taxIdentifier ?? ""} /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Currency<input className="min-h-11 rounded-md border border-slate-300 px-3" name="currencyCode" defaultValue={record.currencyCode} maxLength={3} required /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Timezone<input className="min-h-11 rounded-md border border-slate-300 px-3" name="timezone" defaultValue={record.timezone} required /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Reason for change<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="reason" required minLength={5} /></label>
      </OrganizationEditForm>
    </EntryModal>;
  }
  if (record.section === "brands") {
    return <EntryModal title={`Edit ${record.name}`} triggerLabel="Edit Brand">
      <OrganizationEditForm endpoint="/api/admin/organization/brand">
        <input type="hidden" name="brandId" value={record.id} />
        <p className="text-sm text-slate-600">Brand code: <strong>{record.code}</strong>. Company and code are immutable here.</p>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Brand name<input className="min-h-11 rounded-md border border-slate-300 px-3" name="name" defaultValue={record.name} required /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Reason for change<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="reason" required minLength={5} /></label>
      </OrganizationEditForm>
    </EntryModal>;
  }
  if (record.section === "departments") {
    return <EntryModal title={`Edit ${record.name}`} triggerLabel="Edit Department">
      <OrganizationEditForm endpoint="/api/admin/organization/department">
        <input type="hidden" name="departmentId" value={record.id} />
        <p className="text-sm text-slate-600">Department code: <strong>{record.code}</strong>. Company and code are immutable here.</p>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Department name<input className="min-h-11 rounded-md border border-slate-300 px-3" name="name" defaultValue={record.name} required /></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Reason for change<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="reason" required minLength={5} /></label>
      </OrganizationEditForm>
    </EntryModal>;
  }
  return <EntryModal title={`Edit ${record.name}`} triggerLabel="Edit Location">
    <OrganizationEditForm endpoint="/api/admin/organization/location">
      <input type="hidden" name="locationId" value={record.id} />
      <p className="text-sm text-slate-600">Code, company, brand, and location type are immutable here.</p>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Location name<input className="min-h-11 rounded-md border border-slate-300 px-3" name="name" defaultValue={record.name} required /></label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Address<input className="min-h-11 rounded-md border border-slate-300 px-3" name="address" defaultValue={record.address ?? ""} /></label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Timezone<input className="min-h-11 rounded-md border border-slate-300 px-3" name="timezone" defaultValue={record.timezone} required /></label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Reason for change<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="reason" required minLength={5} /></label>
    </OrganizationEditForm>
  </EntryModal>;
}

export function OrganizationScopeSelectionPanel({ record, requestedRecordId, closeHref }: OrganizationScopeSelectionPanelProps) {
  if (!requestedRecordId) return null;
  if (!record) {
    return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" aria-live="polite">
      <p className="font-semibold">Selected record unavailable</p>
      <p className="mt-1">The record is not available in the selected company scope.</p>
      <ButtonLink href={closeHref} tone="ghost" className="mt-3">Close selection</ButtonLink>
    </section>;
  }
  const recordLabel = record.section === "companies" ? "company" : record.section.slice(0, -1);
  const auditHref = `/admin?tab=audit&entityType=${encodeURIComponent(record.section === "companies" ? "Company" : record.section === "brands" ? "Brand" : record.section === "departments" ? "Department" : "Location")}&entityId=${encodeURIComponent(record.id)}`;
  return <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/45 p-4 shadow-sm sm:p-5" aria-label={`Selected ${recordLabel} detail`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Selected {recordLabel}</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950">{record.name}</h3>
        <p className="mt-1 text-sm text-slate-600">{record.code} · {record.companyName}</p>
      </div>
      <Badge tone={record.status === "ACTIVE" ? "success" : "neutral"}>{record.status}</Badge>
    </div>
    <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</p><p className="mt-1 font-medium text-slate-950">{record.companyName}</p></div>
      {record.section === "locations" ? <><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brand</p><p className="mt-1 font-medium text-slate-950">{record.brandName ?? "Company-wide"}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location type</p><p className="mt-1 font-medium text-slate-950">{record.type.replaceAll("_", " ")}</p></div></> : null}
      {record.section === "companies" ? <><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brands</p><p className="mt-1 font-medium text-slate-950">{record.brandCount}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Locations</p><p className="mt-1 font-medium text-slate-950">{record.locationCount}</p></div></> : null}
      {record.section === "departments" ? <><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Budgets</p><p className="mt-1 font-medium text-slate-950">{record.budgetCount}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cost centers</p><p className="mt-1 font-medium text-slate-950">{record.costCenterCount}</p></div></> : null}
    </div>
    <p className="mt-4 text-sm text-slate-600">Codes, ownership, and organizational relationships are protected here. Changes require a recorded reason and remain available through Audit Trail.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <EditForm record={record} />
      <ButtonLink href={auditHref} tone="ghost">View audit history</ButtonLink>
      <ButtonLink href={closeHref} tone="ghost">Close selection</ButtonLink>
    </div>
  </section>;
}
