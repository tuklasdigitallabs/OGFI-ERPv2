"use client";

import { useEffect, useRef, useState } from "react";
import {
  catalogSelectionReady,
  createItemCatalogRequestController,
  fetchItemMasterCatalog,
  ItemCatalogRequestError,
  type ItemCatalogOption
} from "./itemCreateCatalogState";

type Kind = "item" | "uom";
type Props = {
  action: (formData: FormData) => void | Promise<void>;
  returnQuery: string;
  returnPage: number;
  returnId?: string;
};

type ConversionCatalogSelectorProps = {
  kind: Kind;
  name: "itemId" | "fromUomId" | "toUomId";
  label: string;
  searchLabel: string;
  searchPlaceholder: string;
  selectedId: string;
  onSelectedIdChange: (value: string) => void;
  onReadyChange: (ready: boolean) => void;
};

const pageSize = 25;
const inputClass = "min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm";

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);
  return debouncedValue;
}

function ConversionCatalogSelector({
  kind,
  name,
  label,
  searchLabel,
  searchPlaceholder,
  selectedId,
  onSelectedIdChange,
  onReadyChange
}: ConversionCatalogSelectorProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [options, setOptions] = useState<ItemCatalogOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [retryAvailable, setRetryAvailable] = useState(true);
  const cooldownUntilRef = useRef(0);
  const cooldownTimerRef = useRef<number | null>(null);
  const controllerRef = useRef<ReturnType<typeof createItemCatalogRequestController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createItemCatalogRequestController(fetchItemMasterCatalog);
  }
  const searchIsDebouncing = query !== debouncedQuery;

  useEffect(() => () => {
    if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
  }, []);

  useEffect(() => {
    if (Date.now() < cooldownUntilRef.current) return;
    setLoading(true);
    setError(null);
    const controller = controllerRef.current!;
    void controller
      .load({ kind, query: debouncedQuery, page, pageSize, selectedId }, (result) => {
        setOptions(result.options.filter((option) => option.status === "ACTIVE"));
        setPage(result.page);
        setPages(result.pages);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setLoading(false);
        if (
          reason instanceof ItemCatalogRequestError &&
          reason.code === "OPTION_LOOKUP_RATE_LIMITED"
        ) {
          const retryAfterSeconds = reason.retryAfterSeconds ?? 2;
          cooldownUntilRef.current = Date.now() + retryAfterSeconds * 1_000;
          setRetryAvailable(false);
          setError("Too many option searches are in progress. Wait briefly, then retry.");
          if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
          cooldownTimerRef.current = window.setTimeout(() => {
            setRetryAvailable(true);
            cooldownTimerRef.current = null;
          }, retryAfterSeconds * 1_000);
          return;
        }
        setRetryAvailable(true);
        setError("This option lookup is unavailable. Retry or contact an administrator.");
      });
    return () => controller.abort();
  }, [debouncedQuery, kind, page, retryKey, selectedId]);

  const ready = catalogSelectionReady({
    required: true,
    selectedId,
    options,
    loading,
    debouncing: searchIsDebouncing,
    error
  });
  useEffect(() => onReadyChange(ready), [onReadyChange, ready]);

  const lookupPending = loading || searchIsDebouncing;
  return (
    <section className="grid gap-2" aria-busy={lookupPending}>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        {searchLabel}
        <input
          className={inputClass}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder={searchPlaceholder}
          type="search"
        />
      </label>
      <select
        className={inputClass}
        name={name}
        value={selectedId}
        onChange={(event) => onSelectedIdChange(event.target.value)}
        required
      >
        <option value="">{label}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code} / {option.label}</option>)}
      </select>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Page {page} of {pages}</span>
        <button className="min-h-11 rounded-md border border-slate-300 px-2 font-semibold disabled:text-slate-400" type="button" disabled={lookupPending || Boolean(error) || page <= 1} onClick={() => setPage((value) => value - 1)}>{label} previous</button>
        <button className="min-h-11 rounded-md border border-slate-300 px-2 font-semibold disabled:text-slate-400" type="button" disabled={lookupPending || Boolean(error) || page >= pages} onClick={() => setPage((value) => value + 1)}>{label} next</button>
      </div>
      {lookupPending ? <p className="text-xs font-semibold text-slate-600" role="status">Loading {label.toLowerCase()} options…</p> : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3" role="alert">
          <p className="text-sm text-rose-800">{error}</p>
          <p className="mt-1 text-xs font-semibold text-rose-800">Your current selection and conversion draft have not been changed.</p>
          <button
            className="mt-2 min-h-11 rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-800 disabled:text-rose-400"
            disabled={!retryAvailable}
            type="button"
            onClick={() => {
              if (!retryAvailable) return;
              cooldownUntilRef.current = 0;
              setRetryKey((value) => value + 1);
            }}
          >
            {retryAvailable ? `Retry ${label} lookup` : "Retry available shortly"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ConversionCreateComposer({ action, returnQuery, returnPage, returnId }: Props) {
  const [itemId, setItemId] = useState("");
  const [fromUomId, setFromUomId] = useState("");
  const [toUomId, setToUomId] = useState("");
  const [itemReady, setItemReady] = useState(false);
  const [fromReady, setFromReady] = useState(false);
  const [toReady, setToReady] = useState(false);

  return <form action={action} className="grid gap-3">
    <input name="returnConversionQuery" type="hidden" value={returnQuery} readOnly />
    <input name="returnConversionPage" type="hidden" value={returnPage} readOnly />
    {returnId ? <input name="returnConversionId" type="hidden" value={returnId} readOnly /> : null}
    <ConversionCatalogSelector kind="item" name="itemId" label="Select item" searchLabel="Search item" searchPlaceholder="Code or item name" selectedId={itemId} onSelectedIdChange={setItemId} onReadyChange={setItemReady} />
    <div className="grid gap-3 md:grid-cols-2">
      <ConversionCatalogSelector kind="uom" name="fromUomId" label="From UOM" searchLabel="Search from UOM" searchPlaceholder="Code or name" selectedId={fromUomId} onSelectedIdChange={setFromUomId} onReadyChange={setFromReady} />
      <ConversionCatalogSelector kind="uom" name="toUomId" label="To UOM" searchLabel="Search to UOM" searchPlaceholder="Code or name" selectedId={toUomId} onSelectedIdChange={setToUomId} onReadyChange={setToReady} />
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <input aria-label="Conversion factor" className={inputClass} name="conversionFactor" min="0.000001" step="0.000001" type="number" placeholder="Conversion factor" required />
      <select className={inputClass} name="roundingRule" defaultValue="none" required><option value="none">none</option><option value="up">up</option><option value="down">down</option><option value="nearest">nearest</option></select>
    </div>
    <input aria-label="Conversion creation reason" className={inputClass} name="reason" placeholder="Creation reason" required />
    <button className="min-h-11 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!itemReady || !fromReady || !toReady}>Create Conversion</button>
  </form>;
}
