"use client";

import { useActionState, useEffect, useState } from "react";
import { TaskSheet } from "@/components/TaskSheet";
export type PurchaseOrderAmendmentActionState =
  | { status: "idle" }
  | { status: "error" | "conflict"; code: string; message: string }
  | { status: "success" };

export type PurchaseOrderAmendmentAction = (
  previousState: PurchaseOrderAmendmentActionState,
  formData: FormData
) => Promise<PurchaseOrderAmendmentActionState>;

type AmendmentLine = {
  id: string;
  lineNumber: number;
  description: string;
  uomCode: string;
  orderedQty: string;
  unitPrice: string;
  notes: string;
};

type PurchaseOrderAmendmentSheetProps = {
  orderId: string;
  publicReference: string;
  status: string;
  companyName: string;
  locationName: string;
  supplierName: string;
  expectedDeliveryDate: string;
  lines: AmendmentLine[];
  action: PurchaseOrderAmendmentAction;
};

const initialState: PurchaseOrderAmendmentActionState = { status: "idle" };

export function PurchaseOrderAmendmentSheet({
  orderId,
  publicReference,
  status,
  companyName,
  locationName,
  supplierName,
  expectedDeliveryDate,
  lines,
  action
}: PurchaseOrderAmendmentSheetProps) {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [state, formAction, pending] = useActionState(
    action,
    initialState
  );
  const [draft, setDraft] = useState(() => ({
    reason: "",
    expectedDeliveryDate,
    supplierNoticeReference: "",
    supplierNoticeUnavailableReason: "",
    lines: lines.map((line) => ({ ...line }))
  }));

  useEffect(() => {
    if (state.status === "error" || state.status === "conflict") {
      setDirty(true);
    }
    if (state.status === "success") {
      setDirty(false);
      setOpen(false);
      setResetKey((value) => value + 1);
    }
  }, [state.status]);

  const updateDraft = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const updateLine = (
    index: number,
    key: "orderedQty" | "unitPrice" | "notes",
    value: string
  ) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line
      )
    }));
    setDirty(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setDirty(false);
      setDraft({
        reason: "",
        expectedDeliveryDate,
        supplierNoticeReference: "",
        supplierNoticeUnavailableReason: "",
        lines: lines.map((line) => ({ ...line }))
      });
      setResetKey((value) => value + 1);
    }
  };

  return (
    <TaskSheet
      key={resetKey}
      open={open}
      onOpenChange={handleOpenChange}
      title="Request PO Amendment"
      trigger={<span>Request Amendment</span>}
      triggerClassName="bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800"
      size="workspace"
      bodyScroll="contained"
      bodyClassName="p-0"
      dirty={dirty}
      onDirtyChange={setDirty}
      pending={pending}
      header={
        <div className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">{publicReference} · {status}</p>
          <p>{companyName} · {locationName} · {supplierName}</p>
          <p className="mt-1">Changes require approval and remain in the PO audit history.</p>
        </div>
      }
    >
      <form action={formAction} className="mt-4 grid gap-4 px-4 pb-4 sm:px-6">
        <input name="id" type="hidden" value={orderId} readOnly />
        {state.status === "error" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
            <p className="font-semibold">Amendment was not saved</p>
            <p className="mt-1">{state.message} Your entered values remain in this sheet so you can correct and retry.</p>
          </div>
        ) : null}
        {state.status === "conflict" ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950" role="alert">
            <p className="font-semibold">The Purchase Order changed</p>
            <p className="mt-1">{state.message} Reload the current Purchase Order before retrying; the retained draft is not resubmitted automatically.</p>
            <button type="button" className="mt-3 min-h-10 rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold" onClick={() => window.location.reload()}>
              Reload current PO
            </button>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
            Amendment reason
            <textarea className="min-h-20 rounded-md border border-slate-300 px-3 py-2" name="reason" value={draft.reason} onChange={(event) => updateDraft("reason", event.target.value)} placeholder="Reason required for approval and audit" required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Expected delivery
            <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="expectedDeliveryDate" value={draft.expectedDeliveryDate} onChange={(event) => updateDraft("expectedDeliveryDate", event.target.value)} type="date" required />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Supplier notice reference
            <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="supplierNoticeReference" value={draft.supplierNoticeReference} onChange={(event) => updateDraft("supplierNoticeReference", event.target.value)} placeholder="Email, ticket, or reference" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
            If notice is unavailable, explain
            <input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="supplierNoticeUnavailableReason" value={draft.supplierNoticeUnavailableReason} onChange={(event) => updateDraft("supplierNoticeUnavailableReason", event.target.value)} placeholder="Why supplier notice is not available" />
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-violet-100 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Line</th><th className="px-3 py-2 text-left">Qty</th><th className="px-3 py-2 text-left">Unit price</th><th className="px-3 py-2 text-left">Notes</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {draft.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="px-3 py-2"><input name="lineId" type="hidden" value={line.id} readOnly /><p className="font-semibold text-slate-950">{line.lineNumber}. {line.description}</p><p className="text-xs text-slate-500">{line.uomCode}</p></td>
                  <td className="px-3 py-2"><input className="min-h-11 w-28 rounded-md border border-slate-300 px-3 py-2" name="orderedQty" value={line.orderedQty} onChange={(event) => updateLine(index, "orderedQty", event.target.value)} min="0.000001" step="0.000001" type="number" required /></td>
                  <td className="px-3 py-2"><input className="min-h-11 w-32 rounded-md border border-slate-300 px-3 py-2" name="unitPrice" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} min="0" step="0.000001" type="number" required /></td>
                  <td className="px-3 py-2"><input className="min-h-11 min-w-48 rounded-md border border-slate-300 px-3 py-2" name="notes" value={line.notes} onChange={(event) => updateLine(index, "notes", event.target.value)} placeholder="Optional line note" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end"><button disabled={pending || state.status === "conflict"} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-violet-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{pending ? "Submitting…" : "Request Amendment"}</button></div>
      </form>
    </TaskSheet>
  );
}
