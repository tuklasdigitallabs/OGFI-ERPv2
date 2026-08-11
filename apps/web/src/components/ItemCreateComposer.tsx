"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search } from "lucide-react";
import { TaskSheet } from "@/components/TaskSheet";
import {
  catalogSelectionReady,
  createItemCatalogRequestController,
  fetchItemMasterCatalog,
  ItemCatalogRequestError,
  type ItemCatalogOption
} from "@/components/itemCreateCatalogState";

type CatalogKind = "category" | "uom";
type SelectorName = "category" | "baseUom" | "purchaseUom" | "issueUom";

export type ItemCreateActionState =
  | { status: "idle" }
  | { status: "error"; code: string; message: string }
  | { status: "success"; itemCode: string; itemName: string };

export type ItemCreateAction = (
  previousState: ItemCreateActionState,
  formData: FormData
) => Promise<ItemCreateActionState>;

type ItemCreateComposerProps = {
  action: ItemCreateAction;
  companyName: string;
  itemTypes: readonly string[];
};

type CatalogSelectorProps = {
  kind: CatalogKind;
  name: "itemCategoryId" | "baseUomId" | "purchaseUomId" | "issueUomId";
  selectorName: SelectorName;
  label: string;
  searchPlaceholder: string;
  selectedId: string;
  required: boolean;
  refreshKey: number;
  onSelectedIdChange: (value: string) => void;
  onResolutionChange: (name: SelectorName, ready: boolean) => void;
};

const pageSize = 25;
const inputClass =
  "min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function CatalogSelector({
  kind,
  name,
  selectorName,
  label,
  searchPlaceholder,
  selectedId,
  required,
  refreshKey,
  onSelectedIdChange,
  onResolutionChange
}: CatalogSelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const debouncedQuery = useDebouncedValue(query, 250);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [options, setOptions] = useState<ItemCatalogOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryAvailable, setRetryAvailable] = useState(true);
  const cooldownUntilRef = useRef(0);
  const cooldownTimerRef = useRef<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);
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
  }, [debouncedQuery, kind, page, refreshKey, retryKey, selectedId]);

  const selectableOptions = required
    ? options
    : [
        {
          id: "",
          code: "None",
          label: `No ${label.toLowerCase()} assigned`,
          status: "ACTIVE",
        },
        ...options,
      ];
  const lookupPending = loading || searchIsDebouncing;
  const ready = catalogSelectionReady({
    required,
    selectedId,
    options,
    loading,
    debouncing: searchIsDebouncing,
    error
  });

  useEffect(() => {
    onResolutionChange(selectorName, ready);
  }, [onResolutionChange, ready, selectorName]);

  useEffect(() => {
    setActiveIndex(0);
  }, [options]);

  const chooseOption = (option: ItemCatalogOption) => {
    onSelectedIdChange(option.id);
    setQuery(option.id ? `${option.code} / ${option.label}` : "");
    setOpen(false);
  };

  return (
    <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-bold text-slate-950">{label}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {required ? "Select one active company-scoped option." : "Choose None or one active company-scoped option."}
        </p>
      </div>
      <div className="relative text-sm font-medium text-slate-700">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400"
          />
        <input
          aria-activedescendant={
            open && selectableOptions[activeIndex]
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-label={label}
          aria-required={required}
          className={`${inputClass} w-full pl-9 pr-11`}
          value={query}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
            if (selectedId) onSelectedIdChange("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => {
                if (selectableOptions.length === 0) return 0;
                const step = event.key === "ArrowDown" ? 1 : -1;
                return (
                  (current + step + selectableOptions.length) %
                  selectableOptions.length
                );
              });
              return;
            }
            if (
              event.key === "Enter" &&
              open &&
              selectableOptions[activeIndex]
            ) {
              event.preventDefault();
              chooseOption(selectableOptions[activeIndex]);
            }
          }}
          placeholder={searchPlaceholder}
          role="combobox"
          type="text"
        />
          <button
            aria-label={`Show ${label.toLowerCase()} options`}
            className="absolute right-0 top-0 inline-flex min-h-11 min-w-11 items-center justify-center text-slate-500"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <input name={name} type="hidden" value={selectedId} />
        {open ? (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div
              className="max-h-64 overflow-y-auto p-1"
              id={listboxId}
              role="listbox"
            >
              {selectableOptions.map((option, index) => (
                <button
                  aria-selected={option.id === selectedId}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                    index === activeIndex
                      ? "bg-blue-50 text-blue-950"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                  id={`${listboxId}-option-${index}`}
                  key={option.id || "none"}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => chooseOption(option)}
                  role="option"
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{option.code}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {option.label}
                    </span>
                  </span>
                  {option.id === selectedId ? (
                    <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600" />
                  ) : null}
                </button>
              ))}
              {!lookupPending && !error && options.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500">
                  No matching active options.
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-2 text-xs text-slate-500">
              <span>Page {page} of {pages}</span>
              <div className="flex gap-1">
                <button
                  className="min-h-9 rounded-md border border-slate-300 bg-white px-3 font-semibold disabled:text-slate-400"
                  disabled={lookupPending || page <= 1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setPage((value) => value - 1)}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="min-h-9 rounded-md border border-slate-300 bg-white px-3 font-semibold disabled:text-slate-400"
                  disabled={lookupPending || page >= pages}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setPage((value) => value + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {lookupPending ? (
        <p className="text-xs font-semibold text-slate-600" role="status">
          Loading {label.toLowerCase()} options…
        </p>
      ) : null}
      {!lookupPending && !error && options.length === 0 && !debouncedQuery.trim() ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          No active {kind === "category" ? "categories" : "UOMs"} are configured for this company. Close this composer, then open the {kind === "category" ? "Categories" : "UOMs"} tab to create or reactivate the authoritative master record.
        </p>
      ) : null}
      {!lookupPending && !error && options.length === 0 && debouncedQuery.trim() ? (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600">
          <p>No active options match this search. Clear the search or try another code or name.</p>
          <button className="mt-2 min-h-11 rounded-md border border-slate-300 bg-white px-3 font-semibold text-blue-700" onClick={() => { setQuery(""); setPage(1); }} type="button">Clear search</button>
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3" role="alert">
          <p className="text-sm text-rose-800">{error}</p>
          <p className="mt-1 text-xs font-semibold text-rose-800">Your item draft has been preserved. Retry the lookup before selecting an option.</p>
          {!required && !selectedId ? (
            <p className="mt-1 text-xs font-semibold text-rose-800">None remains a valid explicit choice; this lookup failure does not add an assignment.</p>
          ) : null}
          <button
            className="mt-2 min-h-11 rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-800"
            disabled={!retryAvailable}
            onClick={() => {
              if (!retryAvailable) return;
              cooldownUntilRef.current = 0;
              setRetryKey((value) => value + 1);
            }}
            type="button"
          >
            {retryAvailable ? `Retry ${label} lookup` : "Retry available shortly"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ItemCreateComposer({
  action,
  companyName,
  itemTypes
}: ItemCreateComposerProps) {
  const router = useRouter();
  const formId = useId();
  const triggerContentRef = useRef<HTMLSpanElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showActionError, setShowActionError] = useState(false);
  const [createdItem, setCreatedItem] = useState<{ itemCode: string; itemName: string } | null>(null);
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState("inventory");
  const [categoryId, setCategoryId] = useState("");
  const [baseUomId, setBaseUomId] = useState("");
  const [purchaseUomId, setPurchaseUomId] = useState("");
  const [issueUomId, setIssueUomId] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [trackLot, setTrackLot] = useState(false);
  const [requiresReceivingInspection, setRequiresReceivingInspection] = useState(false);
  const [reason, setReason] = useState("");
  const [selectorResetKey, setSelectorResetKey] = useState(0);
  const [lookupRefreshKey, setLookupRefreshKey] = useState(0);
  const [selectorReady, setSelectorReady] = useState<Record<SelectorName, boolean>>({
    category: false,
    baseUom: false,
    purchaseUom: true,
    issueUom: true
  });

  const handleResolutionChange = useCallback((name: SelectorName, ready: boolean) => {
    setSelectorReady((current) => current[name] === ready ? current : { ...current, [name]: ready });
  }, []);

  const resetDraft = useCallback(() => {
    setItemCode("");
    setItemName("");
    setItemType("inventory");
    setCategoryId("");
    setBaseUomId("");
    setPurchaseUomId("");
    setIssueUomId("");
    setTrackInventory(true);
    setTrackExpiry(false);
    setTrackLot(false);
    setRequiresReceivingInspection(false);
    setReason("");
    setShowActionError(false);
    setSelectorReady({ category: false, baseUom: false, purchaseUom: true, issueUom: true });
    setSelectorResetKey((value) => value + 1);
  }, []);

  const returnFocus = useCallback(() => {
    window.setTimeout(() => triggerContentRef.current?.closest("button")?.focus(), 0);
  }, []);

  useEffect(() => {
    if (state.status === "error") {
      setShowActionError(true);
      setDirty(true);
      setLookupRefreshKey((value) => value + 1);
      window.setTimeout(() => errorRef.current?.focus(), 0);
    }
    if (state.status === "success") {
      setCreatedItem({ itemCode: state.itemCode, itemName: state.itemName });
      setDirty(false);
      setOpen(false);
      resetDraft();
      router.refresh();
      returnFocus();
    }
  }, [resetDraft, returnFocus, router, state]);

  const closeAndReset = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetDraft();
      returnFocus();
    }
  };

  const cancel = () => {
    if (pending) return;
    if (dirty && !window.confirm("Discard the information entered in this form?")) return;
    setDirty(false);
    setOpen(false);
    resetDraft();
    returnFocus();
  };

  const submitDisabled =
    pending ||
    !selectorReady.category ||
    !selectorReady.baseUom ||
    !selectorReady.purchaseUom ||
    !selectorReady.issueUom;

  const update = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setDirty(true);
  };

  const parentSelectionStale = state.status === "error" && [
    "ITEM_CATEGORY_NOT_FOUND",
    "BASE_UOM_NOT_FOUND",
    "PURCHASE_UOM_NOT_FOUND",
    "ISSUE_UOM_NOT_FOUND"
  ].includes(state.code);

  return (
    <>
    <TaskSheet
      open={open}
      onOpenChange={closeAndReset}
      title="Create Item"
      description="Create one company-scoped governed item master record."
      trigger={<span ref={triggerContentRef}>Create Item</span>}
      triggerClassName="min-h-11 bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
      size="workspace"
      dirty={dirty}
      onDirtyChange={setDirty}
      pending={pending}
      header={
        <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-950 sm:grid-cols-3">
          <div><span className="block font-bold uppercase tracking-wide text-blue-700">Company</span>{companyName}</div>
          <div><span className="block font-bold uppercase tracking-wide text-blue-700">Record type</span>Governed item master</div>
          <div><span className="block font-bold uppercase tracking-wide text-blue-700">Inventory effect</span>No stock movement</div>
        </div>
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {submitDisabled && !pending ? "Select a resolved active category and base UOM before creating." : "The server revalidates scope, active parents, and duplicate codes."}
          </p>
          <div className="flex gap-2">
            <button className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400" disabled={pending} onClick={cancel} type="button">Cancel</button>
            <button
              className="min-h-11 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={submitDisabled}
              form={formId}
              type="submit"
            >
              {pending ? "Creating Item…" : "Create Item"}
            </button>
          </div>
        </div>
      }
    >
      <form id={formId} action={formAction} className="grid gap-5" aria-busy={pending}>
        {state.status === "error" && showActionError ? (
          <div ref={errorRef} className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950" role="alert" tabIndex={-1}>
            <p className="font-bold">Item was not created</p>
            <p className="mt-1">{state.message} Your draft remains in this sheet so you can correct it and retry.</p>
            {parentSelectionStale ? <p className="mt-2 font-semibold">The option catalogs were refreshed. Re-select the category or UOM that is now unresolved, then retry.</p> : null}
          </div>
        ) : null}

        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div>
            <h3 className="text-base font-bold text-slate-950">Identity and classification</h3>
            <p className="mt-1 text-sm text-slate-600">Codes are normalized and duplicate active records are rejected by the server.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Item code
              <input className={inputClass} name="itemCode" value={itemCode} onChange={(event) => update(setItemCode, event.target.value)} maxLength={40} required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Item name
              <input className={inputClass} name="itemName" value={itemName} onChange={(event) => update(setItemName, event.target.value)} minLength={2} maxLength={180} required />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Item type
            <select className={inputClass} name="itemType" value={itemType} onChange={(event) => update(setItemType, event.target.value)} required>
              {itemTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <CatalogSelector key={`${selectorResetKey}-category`} kind="category" name="itemCategoryId" selectorName="category" label="Category" searchPlaceholder="Select or search categories" selectedId={categoryId} required refreshKey={lookupRefreshKey} onSelectedIdChange={(value) => update(setCategoryId, value)} onResolutionChange={handleResolutionChange} />
        </section>

        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div>
            <h3 className="text-base font-bold text-slate-950">Units of measure</h3>
            <p className="mt-1 text-sm text-slate-600">Base UOM is required. Purchase and issue UOM deliberately default to None.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <CatalogSelector key={`${selectorResetKey}-base`} kind="uom" name="baseUomId" selectorName="baseUom" label="Base UOM" searchPlaceholder="Select or search active UOMs" selectedId={baseUomId} required refreshKey={lookupRefreshKey} onSelectedIdChange={(value) => update(setBaseUomId, value)} onResolutionChange={handleResolutionChange} />
            <CatalogSelector key={`${selectorResetKey}-purchase`} kind="uom" name="purchaseUomId" selectorName="purchaseUom" label="Purchase UOM" searchPlaceholder="None, or search active UOMs" selectedId={purchaseUomId} required={false} refreshKey={lookupRefreshKey} onSelectedIdChange={(value) => update(setPurchaseUomId, value)} onResolutionChange={handleResolutionChange} />
            <CatalogSelector key={`${selectorResetKey}-issue`} kind="uom" name="issueUomId" selectorName="issueUom" label="Issue UOM" searchPlaceholder="None, or search active UOMs" selectedId={issueUomId} required={false} refreshKey={lookupRefreshKey} onSelectedIdChange={(value) => update(setIssueUomId, value)} onResolutionChange={handleResolutionChange} />
          </div>
        </section>

        <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div>
            <h3 className="text-base font-bold text-slate-950">Operational controls</h3>
            <p className="mt-1 text-sm text-slate-600">These settings govern future controlled transactions; creating the item does not post stock.</p>
          </div>
          <div className="grid gap-3 text-sm font-medium text-slate-700 md:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3"><input name="trackInventory" type="checkbox" checked={trackInventory} onChange={(event) => update(setTrackInventory, event.target.checked)} /> Track inventory</label>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3"><input name="trackExpiry" type="checkbox" checked={trackExpiry} onChange={(event) => update(setTrackExpiry, event.target.checked)} /> Track expiry</label>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3"><input name="trackLot" type="checkbox" checked={trackLot} onChange={(event) => update(setTrackLot, event.target.checked)} /> Track lot</label>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3"><input name="requiresReceivingInspection" type="checkbox" checked={requiresReceivingInspection} onChange={(event) => update(setRequiresReceivingInspection, event.target.checked)} /> Receiving inspection</label>
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Creation reason
            <textarea className={`${inputClass} min-h-24`} name="reason" value={reason} onChange={(event) => update(setReason, event.target.value)} minLength={5} maxLength={500} required />
          </label>
        </section>
      </form>
    </TaskSheet>
    {createdItem ? (
      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between" aria-live="polite" role="status">
        <div><p className="font-bold">Item created: {createdItem.itemCode} / {createdItem.itemName}</p><p className="mt-1">The governed master record is now available; no stock movement was posted.</p></div>
        <a className="inline-flex min-h-11 items-center justify-center rounded-md border border-emerald-300 bg-white px-4 font-semibold text-emerald-800 hover:bg-emerald-100" href="/items?tab=items">View item register</a>
      </div>
    ) : null}
    </>
  );
}
