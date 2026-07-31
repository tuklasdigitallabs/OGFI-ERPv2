"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type Line = { id: string; itemId: string; itemCode: string; itemName: string; lotKey: string; lotNumber: string | null; expiryDate: Date | string | null; countedQuantityBaseUom: unknown; baseUomCode: string };
type Evidence = { id: string; purpose: string; attachment: { originalFilename: string } };
const pageSize = 10;

function PrepareButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={disabled || pending}>{pending ? "Preparing immutable batch…" : "Prepare immutable location batch"}</button>;
}

export function OpeningInventoryPreparationForm({ tenantId, userId, cohortId, attemptId, lines, evidence, action }: { tenantId: string; userId: string; cohortId: string; attemptId: string; lines: Line[]; evidence: Evidence[]; action: (formData: FormData) => void | Promise<void> }) {
  const storageKey = `ogfi:opening-inventory:${tenantId}:${userId}:${cohortId}:${attemptId}`;
  const [query, setQuery] = useState(""); const [saved, setSaved] = useState<Record<string, string>>({}); const [visibleCount, setVisibleCount] = useState(pageSize); const [showIncomplete, setShowIncomplete] = useState(false);
  useEffect(() => { try { setSaved(JSON.parse(window.sessionStorage.getItem(storageKey) ?? "{}")); } catch { /* invalid session draft is ignored */ } }, [storageKey]);
  const persist = (key: string, next: string) => setSaved((current) => { const updated = { ...current, [key]: next }; window.sessionStorage.setItem(storageKey, JSON.stringify(updated)); return updated; });
  const incompleteIds = useMemo(() => new Set(lines.filter((line) => Number(line.countedQuantityBaseUom) > 0 && !(Number(saved[`cost:${line.id}`]) > 0)).map((line) => line.id)), [lines, saved]);
  const matching = useMemo(() => lines.filter((line) => {
    const matchesQuery = `${line.itemCode} ${line.itemName} ${line.lotNumber ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return (showIncomplete && incompleteIds.has(line.id)) || (!showIncomplete && matchesQuery);
  }), [incompleteIds, lines, query, showIncomplete]);
  const visibleIds = new Set(matching.slice(0, visibleCount).map((line) => line.id));
  const currentEvidenceIds = new Set(evidence.map((attachment) => attachment.id));
  const retainedEvidenceIds = Object.entries(saved).flatMap(([key, selected]) => selected === "yes" && key.startsWith("evidence:") && !currentEvidenceIds.has(key.slice("evidence:".length)) ? [key.slice("evidence:".length)] : []);
  const selectedEvidenceCount = Object.entries(saved).filter(([key, selected]) => key.startsWith("evidence:") && selected === "yes").length;
  const showIncompleteLines = () => { setShowIncomplete(true); setQuery(""); setVisibleCount(pageSize); };
  return <form action={action} className="mt-4 grid gap-4" aria-label="Prepare immutable location batch">
    <input name="cohortId" type="hidden" value={cohortId} readOnly /><input name="stockCountAttemptId" type="hidden" value={attemptId} readOnly />
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="grid gap-1 text-sm font-medium text-slate-700">Search immutable count lines<input className="min-h-11 rounded-md border border-slate-300 px-3" value={query} onChange={(event) => { setQuery(event.target.value); setShowIncomplete(false); setVisibleCount(pageSize); }} placeholder="Item code, item name, or lot" /></label><button type="button" className="min-h-11 self-end rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-950" onClick={showIncompleteLines}>Show incomplete lines ({incompleteIds.size})</button></div>
    <p className="text-xs text-slate-600">Showing {Math.min(visibleCount, matching.length)} of {matching.length} matching immutable source lines. {incompleteIds.size ? `${incompleteIds.size} positive-count line(s) still need a unit cost.` : "All positive-count lines have a unit cost."}</p>
    <div className="grid gap-3">{lines.map((line) => { const visible = visibleIds.has(line.id); return <div key={line.id} className={visible ? "grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]" : "hidden"}>
      <input name="itemId" type="hidden" value={line.itemId} readOnly /><input name="lotKey" type="hidden" value={line.lotKey} readOnly />
      <div><p className="font-semibold text-slate-950">{line.itemCode} / {line.itemName}</p><p className="text-xs text-slate-600">{line.lotNumber ? `Lot ${line.lotNumber} · ` : ""}{line.expiryDate ? `Expiry ${new Date(line.expiryDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })} · ` : ""}Counted {String(line.countedQuantityBaseUom)} {line.baseUomCode}</p></div>
      <label className="grid gap-1 text-xs font-medium text-slate-700">Unit cost<input className="min-h-11 rounded-md border border-slate-300 px-3" name="unitCost" type="number" min="0" step="0.0001" required={visible && Number(line.countedQuantityBaseUom) > 0} value={saved[`cost:${line.id}`] ?? (Number(line.countedQuantityBaseUom) === 0 ? "0" : "")} onChange={(event) => persist(`cost:${line.id}`, event.target.value)} /></label>
      <p className="text-xs text-slate-500">{Number(line.countedQuantityBaseUom) === 0 ? "Explicit zero line" : incompleteIds.has(line.id) ? "Unit cost required" : "Cost recorded"}</p>
    </div>; })}</div>
    {matching.length > visibleCount ? <button type="button" className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-blue-700" onClick={() => setVisibleCount((count) => count + pageSize)}>Load 10 more immutable lines</button> : null}
    <fieldset className="grid gap-2"><legend className="text-sm font-semibold text-slate-950">Clean controlled evidence</legend>{retainedEvidenceIds.map((id) => <input key={id} name="evidenceAttachmentId" type="hidden" value={id} />)}{evidence.length ? evidence.map((attachment) => <label key={attachment.id} className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input name="evidenceAttachmentId" type="checkbox" value={attachment.id} checked={saved[`evidence:${attachment.id}`] === "yes"} onChange={(event) => persist(`evidence:${attachment.id}`, event.target.checked ? "yes" : "no")} />{attachment.attachment.originalFilename} / {attachment.purpose.replaceAll("_", " ")}</label>) : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">No eligible evidence appears on this page. Use evidence pagination or add a clean, available file.</p>}</fieldset>
    <label className="grid gap-1 text-sm font-medium text-slate-700">Evidence attestation note<textarea className="min-h-24 rounded-md border border-slate-300 px-3 py-2" name="evidenceNote" minLength={5} maxLength={1000} required value={saved.note ?? ""} onChange={(event) => persist("note", event.target.value)} /></label>
    <div className="sticky bottom-3 z-10 order-first flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:order-none sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">The server re-checks complete coverage, evidence, valuation, version, and scope before creating immutable facts. {selectedEvidenceCount} evidence file(s) selected across pages.</p><PrepareButton disabled={selectedEvidenceCount === 0 || incompleteIds.size > 0} /></div>
  </form>;
}
