"use client";

import { useMemo, useState, type FormEvent } from "react";
import { TRANSFER_MAX_LINES } from "@/lib/workflowLimits";

type SourceInventoryLocationOption = { id: string; name: string; locationName: string };
type TransferItemOption = { id: string; itemCode: string; itemName: string; baseUomCode: string };
type DestinationInventoryLocationOption = { id: string; name: string; locationName: string };
type TransferLinesEditorProps = { action: (formData: FormData) => void | Promise<void>; destinationInventoryLocation: DestinationInventoryLocationOption; sourceInventoryLocations: SourceInventoryLocationOption[]; items: TransferItemOption[] };
type DraftLine = { key: number; itemId: string; requestedQty: string; notes: string };

function emptyLine(key: number, itemId: string): DraftLine {
  return { key, itemId, requestedQty: "", notes: "" };
}

export function TransferLinesEditor({ action, destinationInventoryLocation, sourceInventoryLocations, items }: TransferLinesEditorProps) {
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine(1, items[0]?.id ?? "")]);
  const [selectedKey, setSelectedKey] = useState(1);
  const [errors, setErrors] = useState<number[]>([]);
  const selectedIndex = Math.max(0, lines.findIndex((line) => line.key === selectedKey));
  const selected = lines[selectedIndex] ?? lines[0]!;
  const incomplete = useMemo(() => lines.flatMap((line, index) => line.itemId && Number(line.requestedQty) > 0 ? [] : [index]), [lines]);
  const inputClass = "min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";

  function update(values: Partial<Omit<DraftLine, "key">>) {
    setLines((current) => current.map((line) => line.key === selected.key ? { ...line, ...values } : line));
  }
  function addLine() {
    if (lines.length >= TRANSFER_MAX_LINES) return;
    const key = Math.max(...lines.map((line) => line.key)) + 1;
    setLines((current) => [...current, emptyLine(key, items[0]?.id ?? "")]);
    setSelectedKey(key);
  }
  function removeLine() {
    if (lines.length === 1) return;
    const next = lines.filter((line) => line.key !== selected.key);
    setLines(next);
    setSelectedKey(next[Math.min(selectedIndex, next.length - 1)]!.key);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    if (incomplete[0] === undefined) return;
    event.preventDefault();
    setErrors(incomplete);
    setSelectedKey(lines[incomplete[0]]!.key);
  }

  return (
    <form action={action} className="flex h-full min-h-0 flex-col" onSubmit={submit}>
      {lines.map((line) => <input key={`item-${line.key}`} name="lineItemId" type="hidden" value={line.itemId} readOnly />)}
      {lines.map((line) => <input key={`qty-${line.key}`} name="lineRequestedQty" type="hidden" value={line.requestedQty} readOnly />)}
      {lines.map((line) => <input key={`notes-${line.key}`} name="lineNotes" type="hidden" value={line.notes} readOnly />)}
      <div className="shrink-0 border-b border-slate-200 p-4">
        <div className="ogfi-callout p-3 text-sm">This creates a request only. Stock moves when authorized source and destination users dispatch and receive it.</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">Source inventory location<select className={inputClass} defaultValue={sourceInventoryLocations[0]?.id} name="sourceInventoryLocationId" required>{sourceInventoryLocations.map((location) => <option key={location.id} value={location.id}>{location.locationName} / {location.name}</option>)}</select></label>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Destination<br /><strong className="text-slate-900">{destinationInventoryLocation.locationName} / {destinationInventoryLocation.name}</strong></div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Transfer type<select className={inputClass} name="transferType" required><option value="WAREHOUSE_TO_BRANCH">Warehouse to Branch</option><option value="BRANCH_TO_BRANCH">Branch to Branch</option><option value="RETURN_TO_WAREHOUSE">Return to Warehouse</option><option value="OTHER_INTERNAL">Other Internal Transfer</option></select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Required by<input className={inputClass} name="requiredByDate" type="date" /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 lg:col-span-4">Purpose<textarea className="min-h-16 rounded-md border border-slate-300 px-3 py-2" name="purpose" placeholder="Reason for the transfer request" required /></label>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
        <aside className="min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-950">Transfer lines</h3><p className="text-xs font-semibold text-slate-500">{lines.length} / {TRANSFER_MAX_LINES}{errors.length ? ` / ${errors.length} need attention` : ""}</p></div><button className="inline-flex min-h-10 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:text-slate-400" disabled={lines.length >= TRANSFER_MAX_LINES} onClick={addLine} type="button">Add line</button></div>
          <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto lg:h-[calc(100%-4.5rem)] lg:max-h-none">{lines.map((line, index) => { const item = items.find((option) => option.id === line.itemId); const invalid = errors.includes(index); return <button key={line.key} className={`grid min-h-14 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left ${line.key === selected.key ? "bg-blue-50" : "hover:bg-slate-50"}`} onClick={() => setSelectedKey(line.key)} type="button"><span className="text-sm font-bold text-slate-500">{index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-950">{item?.itemName ?? "Select an item"}</span><span className="block truncate text-xs text-slate-500">{line.requestedQty ? `${line.requestedQty} ${item?.baseUomCode ?? ""}` : "Quantity required"}</span></span><span className={invalid ? "text-xs font-bold text-rose-700" : "text-xs font-bold text-slate-500"}>{invalid ? "Needs info" : "Ready"}</span></button>; })}</div>
        </aside>
        <section className="min-h-0 overflow-y-auto p-4">
          <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">Editing line {selectedIndex + 1} of {lines.length}</p><h3 className="text-lg font-bold text-slate-950">{items.find((item) => item.id === selected.itemId)?.itemName ?? "Transfer line"}</h3></div><div className="flex gap-2"><button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={selectedIndex === 0} onClick={() => setSelectedKey(lines[selectedIndex - 1]!.key)} type="button">Previous</button><button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={selectedIndex === lines.length - 1} onClick={() => setSelectedKey(lines[selectedIndex + 1]!.key)} type="button">Next</button></div></div>
          <div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Item<select className={inputClass} value={selected.itemId} onChange={(event) => update({ itemId: event.target.value })}>{items.map((item) => <option key={item.id} value={item.id}>{item.itemCode} / {item.itemName} / {item.baseUomCode}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Requested quantity<input className={inputClass} min="0.001" step="0.001" type="number" value={selected.requestedQty} onChange={(event) => update({ requestedQty: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Handling notes<input className={inputClass} value={selected.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Optional handling note" /></label></div>
          {lines.length > 1 ? <div className="mt-5 border-t border-slate-200 pt-4"><button className="min-h-10 rounded-md px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={removeLine} type="button">Remove selected line</button></div> : null}
        </section>
      </div>
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-right"><button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Request Stock</button></div>
    </form>
  );
}
