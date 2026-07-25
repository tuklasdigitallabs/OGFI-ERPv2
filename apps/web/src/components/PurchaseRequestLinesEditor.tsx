"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PURCHASE_REQUEST_MAX_LINES } from "@/lib/workflowLimits";

type DraftUomOption = { id: string; uomCode: string; uomName: string };
type DraftItemOption = { id: string; itemCode: string; itemName: string; defaultUomId?: string | null; uoms: DraftUomOption[] };
type DraftBudgetLineOption = { id: string; label: string; helper: string };
type Props = { action: (formData: FormData) => void | Promise<void>; items: DraftItemOption[]; uoms: DraftUomOption[]; budgetLines: DraftBudgetLineOption[] };
type DraftLine = { key: number; itemId: string; itemName: string; budgetLineId: string; budgetLabel: string; requestedQty: string; uomId: string; uomCode: string; description: string; estimatedUnitCost: string; purpose: string };
const urgencyOptions = ["Normal", "Urgent", "Emergency"] as const;
function emptyLine(key: number): DraftLine { return { key, itemId: "", itemName: "", budgetLineId: "", budgetLabel: "", requestedQty: "", uomId: "", uomCode: "", description: "", estimatedUnitCost: "0", purpose: "" }; }

export function PurchaseRequestLinesEditor({ action, items: initialItems, uoms: initialUoms, budgetLines: initialBudgetLines }: Props) {
  const [urgency, setUrgency] = useState<(typeof urgencyOptions)[number]>("Normal");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(1)]);
  const [selectedKey, setSelectedKey] = useState(1);
  const [errors, setErrors] = useState<number[]>([]);
  const [itemOptions, setItemOptions] = useState<DraftItemOption[]>(initialItems);
  const [budgetOptions, setBudgetOptions] = useState<DraftBudgetLineOption[]>(initialBudgetLines);
  const [uomOptions, setUomOptions] = useState<DraftUomOption[]>(initialUoms);
  const [itemCache, setItemCache] = useState<Record<string, DraftItemOption>>({});
  const [budgetCache, setBudgetCache] = useState<Record<string, DraftBudgetLineOption>>({});
  const [uomCache, setUomCache] = useState<Record<string, DraftUomOption[]>>({});
  const [itemQuery, setItemQuery] = useState("");
  const [uomQuery, setUomQuery] = useState("");
  const [budgetQuery, setBudgetQuery] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [uomPage, setUomPage] = useState(1);
  const [budgetPage, setBudgetPage] = useState(1);
  const [itemTotalPages, setItemTotalPages] = useState(1);
  const [uomTotalPages, setUomTotalPages] = useState(1);
  const [budgetTotalPages, setBudgetTotalPages] = useState(1);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const [lookupRetry, setLookupRetry] = useState(0);
  const isEmergency = urgency === "Emergency";
  const selectedIndex = Math.max(0, lines.findIndex((line) => line.key === selectedKey));
  const selected = lines[selectedIndex] ?? lines[0]!;
  const items = useMemo(() => {
    const merged = new Map(itemOptions.map((item) => [item.id, item]));
    Object.values(itemCache).forEach((item) => merged.set(item.id, item));
    return Array.from(merged.values());
  }, [itemCache, itemOptions]);
  const budgetLines = useMemo(() => {
    const merged = new Map(budgetOptions.map((line) => [line.id, line]));
    Object.values(budgetCache).forEach((line) => merged.set(line.id, line));
    return Array.from(merged.values());
  }, [budgetCache, budgetOptions]);
  const selectedItem = items.find((item) => item.id === selected.itemId);
  const uoms = uomOptions;
  const validUoms = useMemo(() => {
    if (!selectedItem) return uoms;
    const merged = new Map((uomCache[selected.itemId] ?? []).map((uom) => [uom.id, uom]));
    uoms.forEach((uom) => merged.set(uom.id, uom));
    return Array.from(merged.values());
  }, [selected.itemId, selectedItem, uomCache, uoms]);
  useEffect(() => {
    if (itemQuery.trim().length < 2) {
      setItemOptions((current) => { const retained = current.find((item) => item.id === selected.itemId); return retained ? [retained, ...initialItems.filter((item) => item.id !== retained.id)] : initialItems; });
      setItemTotalPages(1);
      return;
    }
    const controller = new AbortController();
    setLookupLoading(true);
    setLookupError(false);
    setLookupMessage(null);
    fetch(`/api/purchase-requests/draft-lookup?kind=item&query=${encodeURIComponent(itemQuery.trim())}&selectedId=${encodeURIComponent(selected.itemId)}&page=${itemPage}&pageSize=25`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("LOOKUP_UNAVAILABLE");
        return response.json() as Promise<{ options: DraftItemOption[] }>;
      })
      .then((result: { options: DraftItemOption[]; page?: number; totalPages?: number }) => { const options = result.options.map((item) => ({ ...item, uoms: [] })); setItemCache((current) => ({ ...current, ...Object.fromEntries(options.map((item) => [item.id, item])) })); setItemOptions((current) => { const retained = current.find((item) => item.id === selected.itemId); return retained && !options.some((item) => item.id === retained.id) ? [retained, ...options] : options; }); setItemPage(result.page ?? itemPage); setItemTotalPages(result.totalPages ?? 1); setLookupMessage(options.length ? null : "No active catalog items match this search."); setLookupLoading(false); })
      .catch((error: unknown) => { if (error instanceof DOMException && error.name === "AbortError") return; setLookupLoading(false); setLookupError(true); setLookupMessage("Item lookup is unavailable. Retry the search or contact an administrator."); });
    return () => controller.abort();
  }, [itemQuery, initialItems, selected.itemId, itemPage, lookupRetry]);
  useEffect(() => {
    if (!selected.itemId) {
      setUomOptions(initialUoms);
      setUomTotalPages(1);
      return;
    }
    const controller = new AbortController();
    setLookupLoading(true);
    setLookupError(false);
    fetch(`/api/purchase-requests/draft-lookup?kind=uom&itemId=${encodeURIComponent(selected.itemId)}&query=${encodeURIComponent(uomQuery.trim())}&selectedId=${encodeURIComponent(selected.uomId)}&page=${uomPage}&pageSize=25`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("LOOKUP_UNAVAILABLE");
        return response.json() as Promise<{ options: DraftUomOption[] }>;
      })
      .then((result: { options: DraftUomOption[]; page?: number; totalPages?: number }) => { setUomCache((current) => ({ ...current, [selected.itemId]: result.options })); setUomOptions(result.options); setUomPage(result.page ?? uomPage); setUomTotalPages(result.totalPages ?? 1); setLookupMessage(result.options.length ? null : "No valid UOMs are configured for this item."); setLookupLoading(false); })
      .catch((error: unknown) => { if (error instanceof DOMException && error.name === "AbortError") return; setLookupLoading(false); setLookupError(true); setUomOptions([]); setLookupMessage("No valid UOMs are available for this item. Choose another item or ask an administrator."); });
    return () => controller.abort();
  }, [selected.itemId, selected.uomId, uomQuery, uomPage, initialUoms, lookupRetry]);
  useEffect(() => {
    if (budgetQuery.trim().length < 2) {
      setBudgetOptions(initialBudgetLines);
      setBudgetTotalPages(1);
      return;
    }
    const controller = new AbortController();
    setLookupLoading(true);
    setLookupError(false);
    fetch(`/api/purchase-requests/draft-lookup?kind=budget&query=${encodeURIComponent(budgetQuery.trim())}&selectedId=${encodeURIComponent(selected.budgetLineId)}&page=${budgetPage}&pageSize=25`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("LOOKUP_UNAVAILABLE");
        return response.json() as Promise<{ options: Array<{ id: string; code: string; name: string; budget?: { publicReference: string; name: string } | null }>; page?: number; totalPages?: number }>;
      })
      .then((result) => { const options = result.options.map((option) => ({ id: option.id, label: `${option.code} / ${option.name}`, helper: option.budget ? `${option.budget.publicReference} / ${option.budget.name}` : "" })); setBudgetCache((current) => ({ ...current, ...Object.fromEntries(options.map((line) => [line.id, line])) })); setBudgetOptions(options); setBudgetPage(result.page ?? budgetPage); setBudgetTotalPages(result.totalPages ?? 1); setLookupMessage(options.length ? null : "No active budget lines match this search."); setLookupLoading(false); })
      .catch((error: unknown) => { if (error instanceof DOMException && error.name === "AbortError") return; setLookupLoading(false); setLookupError(true); setLookupMessage("Budget lookup is unavailable. You can leave budget classification for Finance."); });
    return () => controller.abort();
  }, [budgetQuery, initialBudgetLines, selected.budgetLineId, budgetPage, lookupRetry]);
  const incomplete = useMemo(() => lines.flatMap((line, index) => {
    const catalog = Boolean(line.itemId);
    const valid = Number(line.requestedQty) > 0 && line.purpose.trim() && (isEmergency || catalog) && (catalog ? line.uomId : line.uomCode.trim()) && (!isEmergency || ((catalog || line.description.trim()) && Number(line.estimatedUnitCost) > 0));
    return valid ? [] : [index];
  }), [isEmergency, lines]);
  const input = "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";
  function update(values: Partial<Omit<DraftLine, "key">>) { setLines((current) => current.map((line) => line.key === selected.key ? { ...line, ...values } : line)); }
  function handleItemChange(itemId: string) { const item = items.find((option) => option.id === itemId); if (item) setItemCache((current) => ({ ...current, [item.id]: item })); setUomQuery(""); setUomPage(1); update({ itemId, itemName: item?.itemName ?? "", uomId: item?.defaultUomId ?? "", uomCode: "" }); }
  function addLine() { if (lines.length >= PURCHASE_REQUEST_MAX_LINES) return; const key = Math.max(...lines.map((line) => line.key)) + 1; setLines((current) => [...current, emptyLine(key)]); setSelectedKey(key); }
  function removeLine() { if (lines.length === 1) return; const next = lines.filter((line) => line.key !== selected.key); setLines(next); setSelectedKey(next[Math.min(selectedIndex, next.length - 1)]!.key); }
  function submit(event: FormEvent<HTMLFormElement>) { if (incomplete[0] === undefined) return; event.preventDefault(); setErrors(incomplete); setSelectedKey(lines[incomplete[0]]!.key); }

  return <form action={action} className="flex h-full min-h-0 flex-col" onSubmit={submit}>
    <div className="grid shrink-0 gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-3" aria-busy={lookupLoading}>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Search catalog item<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" value={itemQuery} onChange={(event) => { setItemQuery(event.target.value); setItemPage(1); }} placeholder="Type at least 2 characters" /><span className="text-xs font-normal text-slate-500">Page {itemPage} of {itemTotalPages}</span></label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Search valid UOM<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" value={uomQuery} onChange={(event) => { setUomQuery(event.target.value); setUomPage(1); }} placeholder="Optional code or name" /><span className="text-xs font-normal text-slate-500">Page {uomPage} of {uomTotalPages}</span></label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Search budget line<input className="min-h-11 rounded-md border border-slate-300 bg-white px-3" value={budgetQuery} onChange={(event) => { setBudgetQuery(event.target.value); setBudgetPage(1); }} placeholder="Optional code or name" /><span className="text-xs font-normal text-slate-500">Page {budgetPage} of {budgetTotalPages}</span></label>
      {lookupMessage ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2" role="status">{lookupMessage}</p> : null}
      {lookupError ? <button className="min-h-11 justify-self-start rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900" type="button" onClick={() => setLookupRetry((value) => value + 1)}>Retry lookups</button> : null}
      {lookupLoading ? <p className="text-xs font-semibold text-slate-600 md:col-span-3" role="status">Updating lookup results…</p> : null}
      <div className="flex flex-wrap gap-2 md:col-span-3" aria-label="Lookup pagination">{itemQuery.trim().length >= 2 || itemTotalPages > 1 ? <><button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" type="button" disabled={itemPage <= 1} onClick={() => setItemPage((page) => page - 1)}>Previous items</button><button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" type="button" disabled={itemPage >= itemTotalPages} onClick={() => setItemPage((page) => page + 1)}>Next items</button></> : null}{selected.itemId && (uomQuery.trim().length > 0 || uomTotalPages > 1) ? <><button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" type="button" disabled={uomPage <= 1} onClick={() => setUomPage((page) => page - 1)}>Previous UOMs</button><button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" type="button" disabled={uomPage >= uomTotalPages} onClick={() => setUomPage((page) => page + 1)}>Next UOMs</button></> : null}{budgetQuery.trim().length >= 2 || budgetTotalPages > 1 ? <><button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" type="button" disabled={budgetPage <= 1} onClick={() => setBudgetPage((page) => page - 1)}>Previous budgets</button><button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" type="button" disabled={budgetPage >= budgetTotalPages} onClick={() => setBudgetPage((page) => page + 1)}>Next budgets</button></> : null}</div>
    </div>
    {lines.map((line) => <input key={`item-${line.key}`} name="lineItemId" type="hidden" value={line.itemId} readOnly />)}
    {lines.map((line) => <input key={`budget-${line.key}`} name="lineBudgetLineId" type="hidden" value={line.budgetLineId} readOnly />)}
    {lines.map((line) => <input key={`qty-${line.key}`} name="lineRequestedQty" type="hidden" value={line.requestedQty} readOnly />)}
    {lines.map((line) => <input key={`uom-${line.key}`} name="lineUomId" type="hidden" value={line.itemId ? line.uomId : ""} readOnly />)}
    {lines.map((line) => <input key={`uom-code-${line.key}`} name="lineUomCode" type="hidden" value={line.itemId ? "" : line.uomCode} readOnly />)}
    {lines.map((line) => <input key={`description-${line.key}`} name="lineDescription" type="hidden" value={isEmergency ? line.description : line.itemName || line.description || line.purpose} readOnly />)}
    {lines.map((line) => <input key={`cost-${line.key}`} name="lineEstimatedUnitCost" type="hidden" value={isEmergency ? line.estimatedUnitCost : "0"} readOnly />)}
    {lines.map((line) => <input key={`purpose-${line.key}`} name="linePurpose" type="hidden" value={line.purpose} readOnly />)}
    <div className="shrink-0 border-b border-slate-200 p-4"><div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1 text-sm font-medium text-slate-700">Required date<input className={input} name="requiredDate" type="date" required /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Urgency<select className={input} name="urgency" value={urgency} onChange={(event) => setUrgency(event.target.value as (typeof urgencyOptions)[number])} required>{urgencyOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-3">Justification<textarea className="min-h-16 rounded-md border border-slate-300 px-3 py-2" name="justification" required /></label></div>{isEmergency ? <div className="mt-3 grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 md:grid-cols-2"><div className="md:col-span-2"><p className="text-sm font-bold text-amber-950">Emergency purchase support</p><p className="text-xs text-amber-900">Emergency requests still follow approval, quotation/PO, receiving, and inventory controls.</p></div><label className="grid gap-1 text-sm font-medium text-slate-700">Emergency reason<input className={input} name="emergencyReason" placeholder="Operational impact or outage risk" required /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Evidence reference<input className={input} name="emergencyEvidenceReference" placeholder="Photo, incident, approval, or chat reference" required /></label></div> : null}</div>
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(19rem,0.72fr)_minmax(0,1.28fr)]">
      <aside className="min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r"><div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h3 className="text-sm font-bold text-slate-950">Request lines</h3><p className="text-xs font-semibold text-slate-500">{lines.length} / {PURCHASE_REQUEST_MAX_LINES}{errors.length ? ` / ${errors.length} need attention` : ""}</p></div><button className="min-h-11 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:text-slate-400" disabled={lines.length >= PURCHASE_REQUEST_MAX_LINES} onClick={addLine} type="button">Add line</button></div><div className="max-h-48 divide-y divide-slate-100 overflow-y-auto lg:h-[calc(100%-4.5rem)] lg:max-h-none">{lines.map((line, index) => { const item = items.find((option) => option.id === line.itemId); const invalid = errors.includes(index); return <button key={line.key} className={`grid min-h-14 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left ${line.key === selected.key ? "bg-blue-50" : "hover:bg-slate-50"}`} onClick={() => setSelectedKey(line.key)} type="button"><span className="text-sm font-bold text-slate-500">{index + 1}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-950">{item?.itemName ?? (line.description || "Select an item")}</span><span className="block truncate text-xs text-slate-500">{line.requestedQty ? `${line.requestedQty} ${(item?.uoms.find((uom) => uom.id === line.uomId)?.uomCode ?? line.uomCode)}` : "Quantity required"}</span></span><span className={invalid ? "text-xs font-bold text-rose-700" : "text-xs font-bold text-slate-500"}>{invalid ? "Needs info" : "Ready"}</span></button>; })}</div></aside>
      <section className="min-h-0 overflow-y-auto p-4"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">Editing line {selectedIndex + 1} of {lines.length}</p><h3 className="text-lg font-bold text-slate-950">{selectedItem?.itemName ?? (selected.itemName || selected.description || "Purchase request line")}</h3></div><div className="flex gap-2"><button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={selectedIndex === 0} onClick={() => setSelectedKey(lines[selectedIndex - 1]!.key)} type="button">Previous</button><button className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400" disabled={selectedIndex === lines.length - 1} onClick={() => setSelectedKey(lines[selectedIndex + 1]!.key)} type="button">Next</button></div></div><div className="grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Catalog item<select className={input} value={selected.itemId} onChange={(event) => handleItemChange(event.target.value)}><option value="">{isEmergency ? "Emergency free-text line" : "Select catalog item"}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.itemName} / {item.itemCode}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Budget line<select className={input} value={selected.budgetLineId} onChange={(event) => { const option = budgetOptions.find((entry) => entry.id === event.target.value); update({ budgetLineId: event.target.value, budgetLabel: option?.label ?? "" }); }}>{selected.budgetLineId && !budgetLines.some((line) => line.id === selected.budgetLineId) ? <option value={selected.budgetLineId}>{selected.budgetLabel || "Selected budget line"}</option> : null}<option value="">Finance to classify</option>{budgetLines.map((line) => <option key={line.id} value={line.id}>{line.label} / {line.helper}</option>)}</select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Quantity<input className={input} min="0.000001" step="0.000001" type="number" value={selected.requestedQty} onChange={(event) => update({ requestedQty: event.target.value })} /></label>{selectedItem ? <label className="grid gap-1 text-sm font-medium text-slate-700">UOM<select className={input} value={selected.uomId} onChange={(event) => { const option = validUoms.find((entry) => entry.id === event.target.value); update({ uomId: event.target.value, uomCode: option?.uomCode ?? selected.uomCode }); }}>{validUoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.uomCode} / {uom.uomName}</option>)}</select></label> : <label className="grid gap-1 text-sm font-medium text-slate-700">Free-text UOM<input className={input} value={selected.uomCode} onChange={(event) => update({ uomCode: event.target.value })} placeholder="e.g. PACK" /></label>}{isEmergency ? <><label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Emergency item detail<input className={input} value={selected.description} onChange={(event) => update({ description: event.target.value })} placeholder={selectedItem ? "Optional local-store detail" : "What will be bought locally"} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Estimated unit cost<input className={input} min="0.000001" step="0.000001" type="number" value={selected.estimatedUnitCost} onChange={(event) => update({ estimatedUnitCost: event.target.value })} /></label></> : null}<label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Purpose / notes<input className={input} value={selected.purpose} onChange={(event) => update({ purpose: event.target.value })} placeholder="Why this stock is needed" /></label></div>{lines.length > 1 ? <div className="mt-5 border-t border-slate-200 pt-4"><button className="min-h-11 rounded-md px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={removeLine} type="button">Remove selected line</button></div> : null}</section>
    </div>
    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-right"><button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Create Draft Purchase Request</button></div>
  </form>;
}
