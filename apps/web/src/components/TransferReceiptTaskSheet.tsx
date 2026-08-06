"use client";

import { useState, type FormEvent } from "react";
import { TaskSheet } from "@/components/TaskSheet";
import { EntryModal } from "@/components/EntryModal";
import { PendingActionButton } from "@/components/PendingActionButton";

export type TransferReceivableLine = {
  id: string;
  lineNumber: number;
  itemName: string;
  uomCode: string;
  remainingQty: number;
};

type ActionResponse = { status: "success" } | { status: "error"; message: string };

async function postAction(endpoint: string, form: HTMLFormElement): Promise<ActionResponse> {
  const response = await fetch(endpoint, { method: "POST", body: new FormData(form), headers: { accept: "application/json" }, cache: "no-store" });
  if (response.ok) return { status: "success" };
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return { status: "error", message: payload?.message ?? "The action could not be completed. Review the record and try again." };
}

export function TransferReceiptTaskSheet({
  transferId,
  idempotencyKey,
  publicReference,
  sourceLocationName,
  destinationLocationName,
  lines
}: {
  transferId: string;
  idempotencyKey: string;
  publicReference: string;
  sourceLocationName: string;
  destinationLocationName: string;
  lines: TransferReceivableLine[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setErrorMessage(null);
    try {
      const result = await postAction(`/api/transfers/${transferId}/receipt`, event.currentTarget);
      if (result.status === "error") {
        setErrorMessage(result.message);
        return;
      }
      setOpen(false);
      window.location.assign(`/transfers/${transferId}?receipt=posted`);
    } catch {
      setErrorMessage("The receipt request could not be completed. Review the transfer status and try again.");
    } finally {
      setPending(false);
    }
  };
  return <TaskSheet open={open} onOpenChange={setOpen} pending={pending} captureSubmit={false} title="Receive Transfer" description="Review every dispatched line, record accepted or discrepancy quantities, and post the destination receipt. The server rechecks destination scope, MFA, idempotency, and ledger effects." trigger={<span>Receive Transfer</span>} triggerClassName="min-h-11 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700" size="workspace" bodyScroll="auto" bodyClassName="p-0" header={<div className="grid gap-1 text-xs text-slate-600 sm:grid-cols-3"><span><strong className="font-semibold text-slate-800">Transfer:</strong> {publicReference}</span><span><strong className="font-semibold text-slate-800">From:</strong> {sourceLocationName}</span><span><strong className="font-semibold text-slate-800">To:</strong> {destinationLocationName}</span></div>}><form onSubmit={handleSubmit} className="grid gap-4 p-4 sm:p-6"><input name="id" type="hidden" value={transferId} readOnly /><input name="idempotencyKey" type="hidden" value={idempotencyKey} readOnly />{errorMessage ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950" role="alert"><p className="font-semibold">Receipt was not posted</p><p className="mt-1">{errorMessage} Review the form and try again.</p></div> : null}<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Accepted quantity posts destination stock. Rejected, damaged, and discrepancy quantities are recorded without increasing stock.</div><div className="grid gap-3">{lines.map((line) => <div key={line.id} className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-white p-3 lg:grid-cols-[1fr_repeat(4,7rem)]"><div><p className="text-sm font-semibold text-slate-950">#{line.lineNumber} {line.itemName}</p><p className="text-xs text-slate-500">Remaining: {line.remainingQty} {line.uomCode}</p></div><label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">Accepted<input className="min-h-11 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950" name={`lines.${line.id}.acceptedQty`} type="number" min="0" step="0.000001" defaultValue={line.remainingQty} /></label><label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">Rejected<input className="min-h-11 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950" name={`lines.${line.id}.rejectedQty`} type="number" min="0" step="0.000001" defaultValue={0} /></label><label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">Damaged<input className="min-h-11 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950" name={`lines.${line.id}.damagedQty`} type="number" min="0" step="0.000001" defaultValue={0} /></label><label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">Short<input className="min-h-11 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950" name={`lines.${line.id}.discrepancyQty`} type="number" min="0" step="0.000001" defaultValue={0} /></label><label className="grid gap-1 text-xs font-semibold uppercase text-slate-500 lg:col-span-3 lg:col-start-2">Discrepancy reason<input className="min-h-11 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950" name={`lines.${line.id}.discrepancyReason`} placeholder="Required for rejected, damaged, or short quantity" /></label><label className="grid gap-1 text-xs font-semibold uppercase text-slate-500">Evidence ref<input className="min-h-11 rounded-md border border-slate-300 px-2 py-2 text-sm font-normal text-slate-950" name={`lines.${line.id}.evidenceReference`} placeholder="Photo or document" /></label></div>)}</div><label className="grid gap-1 text-sm font-medium text-slate-700">Notes<input className="min-h-11 rounded-md border border-slate-300 px-3 py-2" name="notes" placeholder="Optional receiving note" /></label><PendingActionButton label="Post Receipt" pendingLabel="Posting Receipt…" tone="primary" pendingOverride={pending} /></form></TaskSheet>;
}

export function TransferReceiptReverseModal({ transferId, receiptId }: { transferId: string; receiptId: string }) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setErrorMessage(null);
    try {
      const result = await postAction(`/api/transfers/${transferId}/reversal`, event.currentTarget);
      if (result.status === "error") {
        setErrorMessage(result.message);
        return;
      }
      window.location.assign(`/transfers/${transferId}?receipt=reversed`);
    } catch {
      setErrorMessage("The reversal request could not be completed. Review the receipt status and try again.");
    } finally {
      setPending(false);
    }
  };
  return <EntryModal pending={pending} title="Reverse Transfer Receipt" triggerLabel="Reverse Receipt" triggerClassName="min-h-11"><form onSubmit={handleSubmit} className="mt-4 grid gap-3"><input name="id" type="hidden" value={transferId} readOnly /><input name="receiptId" type="hidden" value={receiptId} readOnly />{errorMessage ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-slate-950" role="alert">{errorMessage}</div> : null}<div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">This creates linked counter-movements for the accepted quantity and keeps the original receipt event for audit history.</div><label className="grid gap-1 text-sm font-medium text-slate-700">Reversal reason<input className="rounded-md border border-slate-300 px-3 py-2" name="reversalReason" placeholder="Reason required" required /></label><PendingActionButton label="Reverse Receipt" pendingLabel="Reversing Receipt…" tone="danger" confirmation="Reverse this posted receipt? Linked counter-movements will be created and the original receipt will remain in history." pendingOverride={pending} /></form></EntryModal>;
}
