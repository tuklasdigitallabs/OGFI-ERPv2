"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TaskSheet } from "@/components/TaskSheet";

export type SelectedItemActionState =
  | { status: "idle" }
  | { status: "error"; code: string; message: string }
  | { status: "success"; itemCode: string; itemName: string };

export type SelectedItemAction = (
  previousState: SelectedItemActionState,
  formData: FormData
) => Promise<SelectedItemActionState>;

type SelectedItem = {
  id: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  itemCategoryId: string;
  baseUomId: string;
  purchaseUomId: string | null;
  issueUomId: string | null;
  categoryName: string;
  baseUomCode: string;
  purchaseUomCode: string | null;
  issueUomCode: string | null;
  trackInventory: boolean;
  trackExpiry: boolean;
  trackLot: boolean;
  requiresReceivingInspection: boolean;
  status: string;
  updatedAt: string;
};

type Props = {
  item: SelectedItem;
  companyName: string;
  returnHref: string;
  updateAction: SelectedItemAction;
  canEdit: boolean;
};

const inputClass =
  "min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

export function SelectedItemTaskSheet({
  item,
  companyName,
  returnHref,
  updateAction,
  canEdit,
}: Props) {
  const router = useRouter();
  const formId = useId();
  const errorRef = useRef<HTMLDivElement | null>(null);
  const successRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(updateAction, { status: "idle" });
  const [itemName, setItemName] = useState(item.itemName);
  const [reason, setReason] = useState("");

  const returnToRegister = useCallback(() => {
    setOpen(false);
    document.getElementById("item-register-heading")?.focus({ preventScroll: true });
    router.replace(returnHref, { scroll: false });
  }, [returnHref, router]);

  useEffect(() => {
    if (state.status === "error") {
      setDirty(true);
      window.setTimeout(() => errorRef.current?.focus(), 0);
    } else if (state.status === "success") {
      setDirty(false);
      window.setTimeout(() => successRef.current?.focus(), 0);
    }
  }, [state]);

  const refreshRequired = state.status === "error" &&
    (state.code === "ITEM_UPDATE_CONFLICT" || state.code === "ITEM_NOT_ACTIVE");

  const requestClose = () => {
    if (pending) return;
    if (dirty && !window.confirm("Discard the item-name correction draft?")) return;
    setDirty(false);
    returnToRegister();
  };

  const discardAndReturn = () => {
    if (pending) return;
    setDirty(false);
    returnToRegister();
  };

  return (
    <TaskSheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) returnToRegister();
      }}
      title={item.status === "ACTIVE" && canEdit ? "Correct Item Name" : "Item details"}
      description={item.status === "ACTIVE" && canEdit ? "Apply a non-material item-name correction. Governed classification, UOM, control, and lifecycle changes are read-only here." : item.status === "ACTIVE" ? "You have read-only access to this item. Governed classification, UOM, control, and lifecycle changes remain read-only." : `This ${item.status.toLowerCase()} item is retained as read-only history.`}
      size="workspace"
      dirty={dirty}
      onDirtyChange={setDirty}
      captureDirty={false}
      pending={pending}
      header={
        <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-950 sm:grid-cols-2 xl:grid-cols-4">
          <div><span className="block font-bold uppercase tracking-wide text-blue-700">Company</span>{companyName}</div>
          <div><span className="block font-bold uppercase tracking-wide text-blue-700">Selected item</span>{item.itemCode} / {state.status === "success" ? state.itemName : item.itemName}</div>
          <div><span className="block font-bold uppercase tracking-wide text-blue-700">Status</span>{item.status}</div>
          <div><span className="block font-bold uppercase tracking-wide text-blue-700">Current parents</span>{item.categoryName} / Base {item.baseUomCode} / Purchase {item.purchaseUomCode ?? "None"} / Issue {item.issueUomCode ?? "None"}</div>
          <div className="sm:col-span-2 xl:col-span-4"><span className="block font-bold uppercase tracking-wide text-blue-700">Control summary</span>{item.itemType.replaceAll("_", " ")} · {item.trackInventory ? "Inventory tracked" : "Non-tracked"} · {item.trackExpiry ? "Expiry tracked" : "No expiry tracking"} · {item.trackLot ? "Lot tracked" : "No lot tracking"} · {item.requiresReceivingInspection ? "Receiving inspection" : "No receiving inspection"}</div>
        </div>
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {item.status !== "ACTIVE" || !canEdit ? (
            <button className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" onClick={discardAndReturn} type="button">Close Item Details</button>
          ) : state.status === "success" ? (
            <button className="min-h-11 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white" onClick={discardAndReturn} type="button">Return to Item Register</button>
          ) : refreshRequired ? (
            <button className="min-h-11 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white" onClick={discardAndReturn} type="button">Return to refreshed register</button>
          ) : (
            <>
              <button className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:text-slate-400" disabled={pending} onClick={requestClose} type="button">Cancel</button>
              <button className="min-h-11 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300" disabled={pending || itemName.trim().length < 2 || itemName.trim() === item.itemName.trim() || reason.trim().length < 5} form={formId} type="submit">{pending ? "Saving Item Name…" : "Save Item Name"}</button>
            </>
          )}
        </div>
      }
    >
      {item.status !== "ACTIVE" || !canEdit ? (
        <div className="grid gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
            <h3 className="font-bold text-slate-950">Read-only {item.status.toLowerCase()} item</h3>
            <p className="mt-2">{item.status !== "ACTIVE" ? "This item is not active, so corrections and lifecycle actions are unavailable. It remains visible to preserve historical transaction and audit references. Reactivation is not available from this workspace." : "Your current role can view this item but cannot make master-data corrections. Contact a user with Edit item master access for a controlled correction."}</p>
          </div>
          <p className="text-sm text-slate-600">Admin Audit is the authoritative company-scoped history. Its bounded results and sensitive-field redaction rules still apply.</p>
          <a className="inline-flex min-h-11 w-fit items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-blue-700" href={`/admin?tab=audit&entityType=Item&entityId=${item.id}`}>View item audit history</a>
        </div>
      ) : (
        <div className="grid gap-5">
          {state.status === "success" ? (
            <div ref={successRef} className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950" role="status" tabIndex={-1}>
              <h3 className="font-bold">Item name saved: {state.itemCode} / {state.itemName}</h3>
              <p className="mt-1">The non-material correction and its reason were recorded together in audit history. Governed classification, UOM, controls, and lifecycle state were unchanged.</p>
            </div>
          ) : null}
          {state.status === "error" ? (
            <div ref={errorRef} className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950" role="alert" tabIndex={-1}>
              <p className="font-bold">Item name was not saved</p>
              <p className="mt-1">{state.message} Your correction draft remains available.</p>
              {refreshRequired ? <p className="mt-2 font-semibold">Return to the refreshed register and reopen the item before making another correction.</p> : null}
            </div>
          ) : null}
          {state.status !== "success" ? <form
            id={formId}
            {...(refreshRequired ? {} : { action: formAction })}
            className="grid gap-5"
            aria-busy={pending}
            onSubmit={refreshRequired ? (event) => event.preventDefault() : undefined}
          >
            <input name="itemId" type="hidden" value={item.id} readOnly />
            <input name="expectedUpdatedAt" type="hidden" value={item.updatedAt} readOnly />
            <input name="itemCategoryId" type="hidden" value={item.itemCategoryId} readOnly />
            <input name="itemType" type="hidden" value={item.itemType} readOnly />
            <input name="baseUomId" type="hidden" value={item.baseUomId} readOnly />
            <input name="purchaseUomId" type="hidden" value={item.purchaseUomId ?? ""} readOnly />
            <input name="issueUomId" type="hidden" value={item.issueUomId ?? ""} readOnly />
            <input name="trackInventory" type="hidden" value={String(item.trackInventory)} readOnly />
            <input name="trackExpiry" type="hidden" value={String(item.trackExpiry)} readOnly />
            <input name="trackLot" type="hidden" value={String(item.trackLot)} readOnly />
            <input name="requiresReceivingInspection" type="hidden" value={String(item.requiresReceivingInspection)} readOnly />
            <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div><h3 className="font-bold text-slate-950">Non-material correction</h3><p className="mt-1 text-sm text-slate-600">Only the display name can be corrected here. The server rejects forged changes to classification, UOMs, type, and operational controls.</p></div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Item code<input className={inputClass} value={item.itemCode} disabled /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Item name<input className={inputClass} name="itemName" value={itemName} onChange={(event) => { setItemName(event.target.value); setDirty(true); }} minLength={2} maxLength={180} required disabled={refreshRequired} /></label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Correction reason<textarea className={`${inputClass} min-h-24`} name="reason" value={reason} onChange={(event) => { setReason(event.target.value); setDirty(true); }} minLength={5} maxLength={500} required disabled={refreshRequired} /></label>
            </section>
          </form> : null}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <h3 className="font-bold text-slate-950">Governed fields are read-only</h3>
            <p className="mt-2">Category: {item.categoryName}. Item type: {item.itemType.replaceAll("_", " ")}. Base UOM: {item.baseUomCode}. Purchase UOM: {item.purchaseUomCode ?? "None"}. Issue UOM: {item.issueUomCode ?? "None"}.</p>
            <p className="mt-2">Inventory: {item.trackInventory ? "Tracked" : "Not tracked"}. Expiry: {item.trackExpiry ? "Tracked" : "Not tracked"}. Lot: {item.trackLot ? "Tracked" : "Not tracked"}. Receiving inspection: {item.requiresReceivingInspection ? "Required" : "Not required"}.</p>
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <h3 className="font-bold text-amber-950">Deactivation unavailable</h3>
            <p id={`item-deactivation-policy-${item.id}`} className="mt-2 text-sm text-amber-900">This item remains Active. Deactivation requires Warehouse/Purchasing review, checks of on-hand stock and open procurement/inventory transactions, and a replacement plan where the item is in use. That governed workflow is not implemented, no deactivation request is recorded here, and you must contact the master-data owner.</p>
            <button aria-describedby={`item-deactivation-policy-${item.id}`} className="mt-3 min-h-11 rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed" disabled type="button">Deactivate Item</button>
          </section>
          <p className="text-sm text-slate-600">Admin Audit is the authoritative company-scoped history. Its bounded results and sensitive-field redaction rules still apply.</p>
          <a className="inline-flex min-h-11 w-fit items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-blue-700" href={`/admin?tab=audit&entityType=Item&entityId=${item.id}`} target="_blank" rel="noopener noreferrer">View authoritative item audit history (opens in new tab)</a>
        </div>
      )}
    </TaskSheet>
  );
}

export function UnavailableSelectedItemTaskSheet({ returnHref }: { returnHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    document.getElementById("item-register-heading")?.focus({ preventScroll: true });
    router.replace(returnHref, { scroll: false });
  };
  return (
    <TaskSheet open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) close(); }} title="Item details unavailable" description="The selected item cannot be opened from the current company context." footer={<div className="flex justify-end"><button className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" onClick={close} type="button">Return to Item Register</button></div>}>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950" role="status">
        This item is unavailable, outside the selected company scope, or no longer exists. Return to the Item Register and choose an available record.
      </div>
    </TaskSheet>
  );
}
