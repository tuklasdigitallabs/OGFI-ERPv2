"use client";

import { useMemo, useState, type FormEvent } from "react";
import { TaskSheet } from "@/components/TaskSheet";

type StockCountEntryLine = { id: string; lineNumber: number; itemCode: string; itemName: string; uomCode: string; lotNumber: string | null; expiryDate: string | null; countedQuantityBaseUom: number | null; varianceQuantityBaseUom: number | null; notes: string | null };
type Props = { action: (formData: FormData) => void | Promise<void>; countId: string; lines: StockCountEntryLine[] };
type DraftEntry = StockCountEntryLine & { countedQuantity: string; draftNotes: string };

export function StockCountEntriesEditor({ action, countId, lines: sourceLines }: Props) {
  const [lines, setLines] = useState<DraftEntry[]>(() => sourceLines.map((line) => ({ ...line, countedQuantity: line.countedQuantityBaseUom === null ? "" : String(line.countedQuantityBaseUom), draftNotes: line.notes ?? "" })));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [errors, setErrors] = useState<number[]>([]);
  const selected = lines[selectedIndex] ?? lines[0];
  const incomplete = useMemo(() => lines.flatMap((line, index) => line.countedQuantity !== "" && Number(line.countedQuantity) >= 0 ? [] : [index]), [lines]);
  const input = "min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";
  function update(values: Partial<Pick<DraftEntry, "countedQuantity" | "draftNotes">>) { setLines((current) => current.map((line, index) => index === selectedIndex ? { ...line, ...values } : line)); }
  function submit(event: FormEvent<HTMLFormElement>) { if (incomplete[0] === undefined) return; event.preventDefault(); setErrors(incomplete); setSelectedIndex(incomplete[0]); }

  return <TaskSheet title="Enter Count Lines" description="Record the physical quantity for every snapshot line." trigger={<span>Enter Count Lines</span>} triggerClassName="bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" size="workspace" bodyScroll="contained" bodyClassName="p-0">
    <form action={action} className="flex h-full min-h-0 flex-col" onSubmit={submit}>
      <input name="id" type="hidden" value={countId} />
      {lines.map((line) => <input key={`id-${line.id}`} name="lineId" type="hidden" value={line.id} readOnly />)}
      {lines.map((line) => <input key={`qty-${line.id}`} name="countedQuantityBaseUom" type="hidden" value={line.countedQuantity} readOnly />)}
      {lines.map((line) => <input key={`notes-${line.id}`} name="notes" type="hidden" value={line.draftNotes} readOnly />)}
      <div className="ogfi-callout m-4 shrink-0 p-3 text-sm">Save physical quantities here. Variance remains review-only until an authorized variance adjustment is generated and posted.</div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-slate-200 lg:grid lg:grid-cols-[minmax(19rem,0.72fr)_minmax(0,1.28fr)]">
        <aside className="min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r"><div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-bold text-slate-950">Snapshot lines</h3><p className="text-xs font-semibold text-slate-500">{lines.length} total{errors.length ? ` / ${errors.length} need a count` : ""}</p></div><div className="max-h-48 divide-y divide-slate-100 overflow-y-auto lg:h-[calc(100%-4.5rem)] lg:max-h-none">{lines.map((line, index) => { const invalid = errors.includes(index); return <button key={line.id} className={`grid min-h-14 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left ${index === selectedIndex ? "bg-blue-50" : "hover:bg-slate-50"}`} onClick={() => setSelectedIndex(index)} type="button"><span className="text-sm font-bold text-slate-500">{line.lineNumber}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-950">{line.itemName}</span><span className="block truncate text-xs text-slate-500">{line.lotNumber ?? "Untracked"} / {line.expiryDate ?? "No expiry"}</span></span><span className={invalid ? "text-xs font-bold text-rose-700" : "text-xs font-bold text-slate-500"}>{invalid ? "Count needed" : line.countedQuantity === "" ? "Not counted" : `${line.countedQuantity} ${line.uomCode}`}</span></button>; })}</div></aside>
        <section className="min-h-0 overflow-y-auto p-4">{selected ? <><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">Editing line {selectedIndex + 1} of {lines.length}</p><h3 className="text-lg font-bold text-slate-950">{selected.itemName}</h3><p className="text-sm text-slate-500">{selected.itemCode} / {selected.uomCode}</p></div><div className="flex gap-2"><button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={selectedIndex === 0} onClick={() => setSelectedIndex(selectedIndex - 1)} type="button">Previous</button><button className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={selectedIndex === lines.length - 1} onClick={() => setSelectedIndex(selectedIndex + 1)} type="button">Next</button></div></div><dl className="mb-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><dt className="font-semibold text-slate-500">Lot</dt><dd className="mt-1 font-bold text-slate-950">{selected.lotNumber ?? "Untracked"}</dd></div><div><dt className="font-semibold text-slate-500">Expiry</dt><dd className="mt-1 font-bold text-slate-950">{selected.expiryDate ?? "No expiry"}</dd></div><div><dt className="font-semibold text-slate-500">Current variance</dt><dd className="mt-1 font-bold text-slate-950">{selected.varianceQuantityBaseUom ?? "-"} {selected.uomCode}</dd></div></dl><div className="grid gap-4"><label className="grid gap-1 text-sm font-medium text-slate-700">Counted quantity ({selected.uomCode})<input className={input} min="0" step="0.000001" type="number" value={selected.countedQuantity} onChange={(event) => update({ countedQuantity: event.target.value })} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Notes<textarea className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={selected.draftNotes} onChange={(event) => update({ draftNotes: event.target.value })} /></label></div></> : null}</section>
      </div>
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-right"><button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Save Count Entries</button></div>
    </form>
  </TaskSheet>;
}
