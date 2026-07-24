"use client";

import { useEffect, useState } from "react";

type Option = { id: string; code: string; label: string; status: string };
type Kind = "item" | "uom";
type Props = { action: (formData: FormData) => void | Promise<void>; returnQuery: string; returnPage: number; returnId?: string };

export function ConversionCreateComposer({ action, returnQuery, returnPage, returnId }: Props) {
  const [itemQuery, setItemQuery] = useState("");
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [fromPage, setFromPage] = useState(1);
  const [toPage, setToPage] = useState(1);
  const [items, setItems] = useState<Option[]>([]);
  const [fromUoms, setFromUoms] = useState<Option[]>([]);
  const [toUoms, setToUoms] = useState<Option[]>([]);
  const [itemId, setItemId] = useState("");
  const [fromUomId, setFromUomId] = useState("");
  const [toUomId, setToUomId] = useState("");
  const [itemPages, setItemPages] = useState(1);
  const [fromPages, setFromPages] = useState(1);
  const [toPages, setToPages] = useState(1);
  const [loading, setLoading] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  function load(kind: Kind, query: string, page: number, selectedId: string, apply: (options: Option[], total: number) => void) {
    const controller = new AbortController();
    setLoading(kind); setError(null);
    fetch(`/api/items/option-catalog?kind=${kind}&query=${encodeURIComponent(query)}&page=${page}&pageSize=25${selectedId ? `&selectedId=${encodeURIComponent(selectedId)}` : ""}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("OPTION_LOOKUP_UNAVAILABLE"); return response.json() as Promise<{ options: Option[]; total: number }>; })
      .then((result) => { apply(result.options, Math.max(1, Math.ceil(result.total / 25))); setLoading(null); })
      .catch((reason: unknown) => { if (reason instanceof DOMException && reason.name === "AbortError") return; setLoading(null); setError("Option lookup is unavailable. Retry or contact an administrator."); });
    return () => controller.abort();
  }

  useEffect(() => load("item", itemQuery, itemPage, itemId, (options, total) => { setItems(options); setItemPages(total); }), [itemQuery, itemPage, itemId, retry]);
  useEffect(() => load("uom", fromQuery, fromPage, fromUomId, (options, total) => { setFromUoms(options); setFromPages(total); }), [fromQuery, fromPage, fromUomId, retry]);
  useEffect(() => load("uom", toQuery, toPage, toUomId, (options, total) => { setToUoms(options); setToPages(total); }), [toQuery, toPage, toUomId, retry]);

  const input = "min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm";
  const pager = (label: string, page: number, pages: number, setPage: (value: number) => void) => <div className="flex items-center gap-2 text-xs text-slate-500"><span>Page {page} of {pages}</span><button className="min-h-11 rounded-md border border-slate-300 px-2 font-semibold disabled:text-slate-400" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{label} previous</button><button className="min-h-11 rounded-md border border-slate-300 px-2 font-semibold disabled:text-slate-400" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>{label} next</button></div>;

  return <form action={action} className="grid gap-3" aria-busy={loading !== null}>
    <input name="returnConversionQuery" type="hidden" value={returnQuery} readOnly /><input name="returnConversionPage" type="hidden" value={returnPage} readOnly />{returnId ? <input name="returnConversionId" type="hidden" value={returnId} readOnly /> : null}
    <label className="grid gap-1 text-sm font-medium text-slate-700">Search item<input className={input} value={itemQuery} onChange={(event) => { setItemQuery(event.target.value); setItemPage(1); }} placeholder="Code or item name" /></label>
    <select className={input} name="itemId" value={itemId} onChange={(event) => setItemId(event.target.value)} required><option value="">Select item</option>{items.map((option) => <option key={option.id} value={option.id}>{option.code} / {option.label}</option>)}</select>{pager("Item", itemPage, itemPages, setItemPage)}
    <div className="grid gap-3 md:grid-cols-2"><div className="grid gap-2"><label className="grid gap-1 text-sm font-medium text-slate-700">Search from UOM<input className={input} value={fromQuery} onChange={(event) => { setFromQuery(event.target.value); setFromPage(1); }} placeholder="Code or name" /></label><select className={input} name="fromUomId" value={fromUomId} onChange={(event) => setFromUomId(event.target.value)} required><option value="">From UOM</option>{fromUoms.map((option) => <option key={option.id} value={option.id}>{option.code} / {option.label}</option>)}</select>{pager("From UOM", fromPage, fromPages, setFromPage)}</div><div className="grid gap-2"><label className="grid gap-1 text-sm font-medium text-slate-700">Search to UOM<input className={input} value={toQuery} onChange={(event) => { setToQuery(event.target.value); setToPage(1); }} placeholder="Code or name" /></label><select className={input} name="toUomId" value={toUomId} onChange={(event) => setToUomId(event.target.value)} required><option value="">To UOM</option>{toUoms.map((option) => <option key={option.id} value={option.id}>{option.code} / {option.label}</option>)}</select>{pager("To UOM", toPage, toPages, setToPage)}</div></div>
    <div className="grid gap-3 md:grid-cols-2"><input aria-label="Conversion factor" className={input} name="conversionFactor" min="0.000001" step="0.000001" type="number" placeholder="Conversion factor" required /><select className={input} name="roundingRule" defaultValue="none" required><option value="none">none</option><option value="up">up</option><option value="down">down</option><option value="nearest">nearest</option></select></div>
    <input aria-label="Conversion creation reason" className={input} name="reason" placeholder="Creation reason" required />
    {loading ? <p className="text-xs font-semibold text-slate-600" role="status">Loading {loading} options…</p> : null}{error ? <div className="flex flex-wrap items-center gap-2" role="alert"><p className="text-sm text-rose-700">{error}</p><button className="min-h-11 rounded-md border border-rose-300 px-3 text-sm font-semibold text-rose-800" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div> : null}
    <button className="min-h-11 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" disabled={loading !== null}>Create Conversion</button>
  </form>;
}
