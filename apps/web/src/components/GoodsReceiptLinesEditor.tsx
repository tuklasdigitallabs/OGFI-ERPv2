"use client";

import { useMemo, useState, type FormEvent } from "react";

type ReceivableLine = {
  id: string;
  lineNumber: number;
  description: string;
  outstandingQty: number;
  uomCode: string;
  requiresLot: boolean;
  requiresExpiry: boolean;
};

type ReceivableOrder = {
  id: string;
  publicReference: string;
  supplierName: string;
  expectedDeliveryDate: string;
  status: string;
  lines: ReceivableLine[];
};

type DraftLine = ReceivableLine & {
  deliveredQty: string;
  acceptedQty: string;
  rejectedQty: string;
  damagedQty: string;
  lotNumber: string;
  expiryDate: string;
  discrepancyReason: string;
  evidenceReference: string;
  notes: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  orders: ReceivableOrder[];
};

function makeLines(order: ReceivableOrder | undefined): DraftLine[] {
  return (order?.lines ?? []).map((line) => ({
    ...line,
    deliveredQty: String(line.outstandingQty),
    acceptedQty: String(line.outstandingQty),
    rejectedQty: "0",
    damagedQty: "0",
    lotNumber: "",
    expiryDate: "",
    discrepancyReason: "",
    evidenceReference: "",
    notes: ""
  }));
}

export function GoodsReceiptLinesEditor({ action, orders }: Props) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => makeLines(orders[0]));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [errors, setErrors] = useState<number[]>([]);
  const selected = lines[selectedIndex];
  const input = "min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";
  const invalidLines = useMemo(() => lines.flatMap((line, index) => {
    const delivered = Number(line.deliveredQty);
    const accepted = Number(line.acceptedQty);
    const rejected = Number(line.rejectedQty);
    const damaged = Number(line.damagedQty);
    const discrepancy = rejected > 0 || damaged > 0 || delivered < line.outstandingQty;
    const invalidQuantity = !Number.isFinite(delivered) || !Number.isFinite(accepted) || !Number.isFinite(rejected) || !Number.isFinite(damaged) || delivered < 0 || accepted < 0 || rejected < 0 || damaged < 0 || delivered > line.outstandingQty || accepted + rejected + damaged > delivered;
    return invalidQuantity || (discrepancy && (!line.discrepancyReason.trim() || !line.evidenceReference.trim())) ? [index] : [];
  }), [lines]);

  function selectOrder(nextOrderId: string) {
    setOrderId(nextOrderId);
    setLines(makeLines(orders.find((order) => order.id === nextOrderId)));
    setSelectedIndex(0);
    setErrors([]);
  }

  function update(values: Partial<DraftLine>) {
    setLines((current) => current.map((line, index) => index === selectedIndex ? { ...line, ...values } : line));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    if (invalidLines[0] === undefined) return;
    event.preventDefault();
    setErrors(invalidLines);
    setSelectedIndex(invalidLines[0]);
  }

  return <form action={action} className="flex h-full min-h-0 flex-col" onSubmit={submit}>
    <input name="purchaseOrderId" type="hidden" value={orderId} readOnly />
    {lines.map((line) => <input key={`delivered-${line.id}`} name={`line.${line.id}.deliveredQty`} type="hidden" value={line.deliveredQty} readOnly />)}
    {lines.map((line) => <input key={`accepted-${line.id}`} name={`line.${line.id}.acceptedQty`} type="hidden" value={line.acceptedQty} readOnly />)}
    {lines.map((line) => <input key={`rejected-${line.id}`} name={`line.${line.id}.rejectedQty`} type="hidden" value={line.rejectedQty} readOnly />)}
    {lines.map((line) => <input key={`damaged-${line.id}`} name={`line.${line.id}.damagedQty`} type="hidden" value={line.damagedQty} readOnly />)}
    {lines.map((line) => <input key={`lot-${line.id}`} name={`line.${line.id}.lotNumber`} type="hidden" value={line.lotNumber} readOnly />)}
    {lines.map((line) => <input key={`expiry-${line.id}`} name={`line.${line.id}.expiryDate`} type="hidden" value={line.expiryDate} readOnly />)}
    {lines.map((line) => <input key={`reason-${line.id}`} name={`line.${line.id}.discrepancyReason`} type="hidden" value={line.discrepancyReason} readOnly />)}
    {lines.map((line) => <input key={`evidence-${line.id}`} name={`line.${line.id}.evidenceReference`} type="hidden" value={line.evidenceReference} readOnly />)}
    {lines.map((line) => <input key={`notes-${line.id}`} name={`line.${line.id}.notes`} type="hidden" value={line.notes} readOnly />)}
    <div className="shrink-0 border-b border-slate-200 p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="grid gap-1 text-sm font-medium text-slate-700">Issued purchase order<select className={input} value={orderId} onChange={(event) => selectOrder(event.target.value)} required>{orders.map((order) => <option key={order.id} value={order.id}>{order.publicReference} / {order.supplierName} / {order.lines.length} open line{order.lines.length === 1 ? "" : "s"}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">Supplier DR / reference<input className={input} name="supplierDeliveryReceiptNumber" placeholder="Optional" /></label>
      </div>
      <p className="mt-3 text-sm text-slate-600">Only accepted quantities post to inventory. Rejected, damaged, and short quantities require a reason and evidence reference.</p>
    </div>
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
      <aside className="min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r"><div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-bold text-slate-950">Delivery lines</h3><p className="text-xs font-semibold text-slate-500">{lines.length} lines{errors.length ? ` / ${errors.length} need attention` : ""}</p></div><div className="max-h-48 divide-y divide-slate-100 overflow-y-auto lg:h-[calc(100%-4.5rem)] lg:max-h-none">{lines.map((line, index) => { const invalid = errors.includes(index); const hasDiscrepancy = Number(line.rejectedQty) > 0 || Number(line.damagedQty) > 0 || Number(line.deliveredQty) < line.outstandingQty; return <button key={line.id} className={`grid min-h-14 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left ${index === selectedIndex ? "bg-blue-50" : "hover:bg-slate-50"}`} onClick={() => setSelectedIndex(index)} type="button"><span className="text-sm font-bold text-slate-500">{line.lineNumber}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-950">{line.description}</span><span className="block truncate text-xs text-slate-500">Open {line.outstandingQty} {line.uomCode} / accepted {line.acceptedQty || "0"}</span></span><span className={invalid ? "text-xs font-bold text-rose-700" : hasDiscrepancy ? "text-xs font-bold text-amber-700" : "text-xs font-bold text-emerald-700"}>{invalid ? "Needs info" : hasDiscrepancy ? "Variance" : "Accepted"}</span></button>; })}</div></aside>
      <section className="min-h-0 overflow-y-auto p-4">{selected ? <><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">Receiving line {selectedIndex + 1} of {lines.length}</p><h3 className="text-lg font-bold text-slate-950">{selected.description}</h3><p className="text-sm text-slate-500">Outstanding {selected.outstandingQty} {selected.uomCode}</p></div><div className="flex gap-2"><button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={selectedIndex === 0} onClick={() => setSelectedIndex(selectedIndex - 1)} type="button">Previous</button><button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={selectedIndex === lines.length - 1} onClick={() => setSelectedIndex(selectedIndex + 1)} type="button">Next</button></div></div><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700">Delivered quantity<input className={input} min="0" max={selected.outstandingQty} step="0.001" type="number" value={selected.deliveredQty} onChange={(event) => update({ deliveredQty: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Accepted quantity<input className={input} min="0" step="0.001" type="number" value={selected.acceptedQty} onChange={(event) => update({ acceptedQty: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Rejected quantity<input className={input} min="0" step="0.001" type="number" value={selected.rejectedQty} onChange={(event) => update({ rejectedQty: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Damaged quantity<input className={input} min="0" step="0.001" type="number" value={selected.damagedQty} onChange={(event) => update({ damagedQty: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Lot number<input className={input} value={selected.lotNumber} onChange={(event) => update({ lotNumber: event.target.value })} placeholder={selected.requiresLot ? "Required" : "Optional"} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Expiry date<input className={input} type="date" value={selected.expiryDate} onChange={(event) => update({ expiryDate: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Discrepancy reason<input className={input} value={selected.discrepancyReason} onChange={(event) => update({ discrepancyReason: event.target.value })} placeholder="Required for rejected, damaged, or short quantities" /></label><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Discrepancy evidence reference<input className={input} value={selected.evidenceReference} onChange={(event) => update({ evidenceReference: event.target.value })} placeholder="Required for rejected, damaged, or short quantities" /></label><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Line notes<textarea className="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950" value={selected.notes} onChange={(event) => update({ notes: event.target.value })} /></label></div></> : null}</section>
    </div>
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-right"><button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Create Draft Receipt</button></div>
  </form>;
}
