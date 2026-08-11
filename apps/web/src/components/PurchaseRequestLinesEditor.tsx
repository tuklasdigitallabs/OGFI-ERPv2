"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { PURCHASE_REQUEST_MAX_LINES } from "@/lib/workflowLimits";

type DraftUomOption = { id: string; uomCode: string; uomName: string };
type DraftItemOption = { id: string; itemCode: string; itemName: string; defaultUomId?: string | null; uoms: DraftUomOption[] };
type DraftBudgetLineOption = { id: string; label: string; helper: string };
type Props = {
  action: (formData: FormData) => void | Promise<void>;
  items: DraftItemOption[];
  uoms: DraftUomOption[];
  budgetLines: DraftBudgetLineOption[];
};
type DraftLine = {
  key: number;
  itemId: string;
  itemName: string;
  budgetLineId: string;
  budgetLabel: string;
  requestedQty: string;
  uomId: string;
  uomCode: string;
  description: string;
  estimatedUnitCost: string;
  purpose: string;
};
type LookupPage<T> = { options: T[]; page?: number; totalPages?: number };

const urgencyOptions = ["Normal", "Urgent", "Emergency"] as const;
const inputClass =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";

function emptyLine(key: number): DraftLine {
  return {
    key,
    itemId: "",
    itemName: "",
    budgetLineId: "",
    budgetLabel: "",
    requestedQty: "",
    uomId: "",
    uomCode: "",
    description: "",
    estimatedUnitCost: "0",
    purpose: "",
  };
}

type SearchableLookupProps<T> = {
  disabled?: boolean;
  emptyText: string;
  getId: (option: T) => string;
  getLabel: (option: T) => string;
  getMeta?: ((option: T) => ReactNode) | undefined;
  label: string;
  loading: boolean;
  onPageChange: (page: number) => void;
  onQueryChange: (query: string) => void;
  onClear?: (() => void) | undefined;
  onSelect: (option: T) => void;
  options: T[];
  page: number;
  placeholder: string;
  query: string;
  selectedId: string;
  selectedLabel?: string | undefined;
  totalPages: number;
};

function SearchableLookup<T>({
  disabled = false,
  emptyText,
  getId,
  getLabel,
  getMeta,
  label,
  loading,
  onPageChange,
  onQueryChange,
  onClear,
  onSelect,
  options,
  page,
  placeholder,
  query,
  selectedId,
  selectedLabel,
  totalPages,
}: SearchableLookupProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();

  useEffect(() => {
    setActiveIndex(0);
  }, [options]);

  return (
    <div className="relative grid gap-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400"
        />
        <input
          aria-activedescendant={
            open && options[activeIndex]
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          className="min-h-11 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100"
          disabled={disabled}
          onBlur={() => window.setTimeout(() => setOpen(false), 100)}
          onChange={(event) => {
            onQueryChange(event.target.value);
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
                if (options.length === 0) return 0;
                const step = event.key === "ArrowDown" ? 1 : -1;
                return (current + step + options.length) % options.length;
              });
              return;
            }
            if (event.key === "Enter" && open && options[activeIndex]) {
              event.preventDefault();
              onSelect(options[activeIndex]);
              setOpen(false);
            }
          }}
          placeholder={selectedLabel || placeholder}
          role="combobox"
          value={query}
        />
        <button
          aria-label={`Show ${label.toLowerCase()} options`}
          className="absolute right-0 top-0 inline-flex min-h-11 min-w-11 items-center justify-center text-slate-500 disabled:cursor-not-allowed"
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {selectedLabel ? (
        <span className="flex min-w-0 items-center justify-between gap-2 text-xs font-semibold text-blue-700">
          <span className="truncate">Selected: {selectedLabel}</span>
          {onClear ? (
            <button
              className="shrink-0 rounded px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              onClick={onClear}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </span>
      ) : null}
      {open && !disabled ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div
            id={listId}
            className="max-h-64 overflow-y-auto p-1"
            role="listbox"
          >
            {loading ? (
              <p className="px-3 py-3 text-sm text-slate-500">
                Updating matches…
              </p>
            ) : null}
            {!loading && options.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">{emptyText}</p>
            ) : null}
            {options.map((option, index) => {
              const id = getId(option);
              const selected = id === selectedId;
              return (
                <button
                  aria-selected={selected}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-blue-50 ${selected || activeIndex === index ? "bg-blue-50 text-blue-900" : "text-slate-800"}`}
                  id={`${listId}-option-${index}`}
                  key={id}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {getLabel(option)}
                    </span>
                    {getMeta ? (
                      <span className="block truncate text-xs text-slate-500">
                        {getMeta(option)}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-blue-700"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 p-2">
              <button
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold disabled:text-slate-400"
                disabled={page <= 1 || loading}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPageChange(page - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="text-xs font-semibold text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold disabled:text-slate-400"
                disabled={page >= totalPages || loading}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPageChange(page + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PurchaseRequestLinesEditor({
  action,
  items: initialItems,
  uoms: initialUoms,
  budgetLines: initialBudgetLines,
}: Props) {
  const [urgency, setUrgency] =
    useState<(typeof urgencyOptions)[number]>("Normal");
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
  const [itemLoading, setItemLoading] = useState(false);
  const [uomLoading, setUomLoading] = useState(false);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [itemMessage, setItemMessage] = useState<string | null>(null);
  const [uomMessage, setUomMessage] = useState<string | null>(null);
  const [budgetMessage, setBudgetMessage] = useState<string | null>(null);
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
  const validUoms = useMemo(() => {
    const merged = new Map(
      (uomCache[selected.itemId] ?? []).map((uom) => [uom.id, uom]),
    );
    uomOptions.forEach((uom) => merged.set(uom.id, uom));
    return Array.from(merged.values());
  }, [selected.itemId, uomCache, uomOptions]);
  const selectedUom = validUoms.find((uom) => uom.id === selected.uomId);
  const selectedBudget = budgetLines.find(
    (line) => line.id === selected.budgetLineId,
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setItemLoading(true);
      fetch(
        `/api/purchase-requests/draft-lookup?kind=item&query=${encodeURIComponent(itemQuery.trim())}&page=${itemPage}&pageSize=25`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("LOOKUP_UNAVAILABLE");
          return response.json() as Promise<LookupPage<DraftItemOption>>;
        })
        .then((result) => {
          const options = result.options.map((item) => ({ ...item, uoms: [] }));
          setItemCache((current) => ({
            ...current,
            ...Object.fromEntries(options.map((item) => [item.id, item])),
          }));
          setItemOptions(options);
          setItemPage(result.page ?? itemPage);
          setItemTotalPages(result.totalPages ?? 1);
          setItemMessage(null);
          setItemLoading(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setItemLoading(false);
          setItemMessage(
            "Item lookup is unavailable. Retry or ask an administrator to verify the catalog.",
          );
        });
    }, 200);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [itemQuery, itemPage, lookupRetry]);

  useEffect(() => {
    if (!selected.itemId) {
      setUomOptions([]);
      setUomTotalPages(1);
      setUomMessage(null);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setUomLoading(true);
      fetch(
        `/api/purchase-requests/draft-lookup?kind=uom&itemId=${encodeURIComponent(selected.itemId)}&query=${encodeURIComponent(uomQuery.trim())}&page=${uomPage}&pageSize=25`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("LOOKUP_UNAVAILABLE");
          return response.json() as Promise<LookupPage<DraftUomOption>>;
        })
        .then((result) => {
          setUomCache((current) => {
            const merged = new Map(
              (current[selected.itemId] ?? []).map((uom) => [uom.id, uom]),
            );
            result.options.forEach((uom) => merged.set(uom.id, uom));
            return {
              ...current,
              [selected.itemId]: Array.from(merged.values()),
            };
          });
          setUomOptions(result.options);
          setUomPage(result.page ?? uomPage);
          setUomTotalPages(result.totalPages ?? 1);
          setUomMessage(
            result.options.length
              ? null
              : "No valid UOM is configured for the selected item.",
          );
          setUomLoading(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setUomLoading(false);
          setUomOptions([]);
          setUomMessage(
            "Valid UOM lookup is unavailable. Choose another item or ask an administrator.",
          );
        });
    }, 150);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [selected.itemId, uomQuery, uomPage, lookupRetry]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setBudgetLoading(true);
      fetch(
        `/api/purchase-requests/draft-lookup?kind=budget&query=${encodeURIComponent(budgetQuery.trim())}&page=${budgetPage}&pageSize=25`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("LOOKUP_UNAVAILABLE");
          return response.json() as Promise<
            LookupPage<{
              id: string;
              code: string;
              name: string;
              budget?: { publicReference: string; name: string } | null;
            }>
          >;
        })
        .then((result) => {
          const options = result.options.map((option) => ({
            id: option.id,
            label: `${option.code} / ${option.name}`,
            helper: option.budget
              ? `${option.budget.publicReference} / ${option.budget.name}`
              : "",
          }));
          setBudgetCache((current) => ({
            ...current,
            ...Object.fromEntries(options.map((line) => [line.id, line])),
          }));
          setBudgetOptions(options);
          setBudgetPage(result.page ?? budgetPage);
          setBudgetTotalPages(result.totalPages ?? 1);
          setBudgetMessage(null);
          setBudgetLoading(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setBudgetLoading(false);
          setBudgetMessage(
            "Budget lookup is unavailable. You may leave budget classification for Finance.",
          );
        });
    }, 200);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [budgetQuery, budgetPage, lookupRetry]);

  const incomplete = useMemo(
    () =>
      lines.flatMap((line, index) => {
        const catalog = Boolean(line.itemId);
        const valid =
          Number(line.requestedQty) > 0 &&
          line.purpose.trim() &&
          (isEmergency || catalog) &&
          (catalog ? line.uomId : line.uomCode.trim()) &&
          (!isEmergency ||
            ((catalog || line.description.trim()) &&
              Number(line.estimatedUnitCost) > 0));
        return valid ? [] : [index];
      }),
    [isEmergency, lines],
  );

  function update(values: Partial<Omit<DraftLine, "key">>) {
    setLines((current) =>
      current.map((line) =>
        line.key === selected.key ? { ...line, ...values } : line,
      ),
    );
  }

  function handleItemChange(item: DraftItemOption) {
    setItemCache((current) => ({ ...current, [item.id]: item }));
    setItemQuery("");
    setUomQuery("");
    setUomPage(1);
    setUomOptions([]);
    setUomMessage(null);
    update({
      itemId: item.id,
      itemName: item.itemName,
      uomId: item.defaultUomId ?? "",
      uomCode: "",
    });
  }

  function addLine() {
    if (lines.length >= PURCHASE_REQUEST_MAX_LINES) return;
    const key = Math.max(...lines.map((line) => line.key)) + 1;
    setLines((current) => [...current, emptyLine(key)]);
    setSelectedKey(key);
    setItemQuery("");
    setUomQuery("");
    setBudgetQuery("");
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
    <form
      action={action}
      className="flex h-full min-h-0 flex-col"
      onSubmit={submit}
    >
      {lines.map((line) => (
        <input
          key={`item-${line.key}`}
          name="lineItemId"
          type="hidden"
          value={line.itemId}
          readOnly
        />
      ))}
      {lines.map((line) => (
        <input
          key={`budget-${line.key}`}
          name="lineBudgetLineId"
          type="hidden"
          value={line.budgetLineId}
          readOnly
        />
      ))}
      {lines.map((line) => (
        <input
          key={`qty-${line.key}`}
          name="lineRequestedQty"
          type="hidden"
          value={line.requestedQty}
          readOnly
        />
      ))}
      {lines.map((line) => (
        <input
          key={`uom-${line.key}`}
          name="lineUomId"
          type="hidden"
          value={line.itemId ? line.uomId : ""}
          readOnly
        />
      ))}
      {lines.map((line) => (
        <input
          key={`uom-code-${line.key}`}
          name="lineUomCode"
          type="hidden"
          value={line.itemId ? "" : line.uomCode}
          readOnly
        />
      ))}
      {lines.map((line) => (
        <input
          key={`description-${line.key}`}
          name="lineDescription"
          type="hidden"
          value={
            isEmergency
              ? line.description
              : line.itemName || line.description || line.purpose
          }
          readOnly
        />
      ))}
      {lines.map((line) => (
        <input
          key={`cost-${line.key}`}
          name="lineEstimatedUnitCost"
          type="hidden"
          value={isEmergency ? line.estimatedUnitCost : "0"}
          readOnly
        />
      ))}
      {lines.map((line) => (
        <input
          key={`purpose-${line.key}`}
          name="linePurpose"
          type="hidden"
          value={line.purpose}
          readOnly
        />
      ))}

      <div className="shrink-0 border-b border-slate-200 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Required date
            <input
              className={inputClass}
              name="requiredDate"
              type="date"
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Urgency
            <select
              className={inputClass}
              name="urgency"
              value={urgency}
              onChange={(event) =>
                setUrgency(
                  event.target.value as (typeof urgencyOptions)[number],
                )
              }
              required
            >
              {urgencyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-3">
            Justification
            <textarea
              className="min-h-16 rounded-md border border-slate-300 px-3 py-2"
              name="justification"
              required
            />
          </label>
        </div>
        {isEmergency ? (
          <div className="mt-3 grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="text-sm font-bold text-amber-950">
                Emergency purchase support
              </p>
              <p className="text-xs text-amber-900">
                Emergency requests still follow approval, quotation/PO,
                receiving, and inventory controls.
              </p>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Emergency reason
              <input
                className={inputClass}
                name="emergencyReason"
                placeholder="Operational impact or outage risk"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Evidence reference
              <input
                className={inputClass}
                name="emergencyEvidenceReference"
                placeholder="Photo, incident, approval, or chat reference"
                required
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(19rem,0.72fr)_minmax(0,1.28fr)]">
        <aside className="min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">
                Request lines
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                {lines.length} / {PURCHASE_REQUEST_MAX_LINES}
                {errors.length ? ` / ${errors.length} need attention` : ""}
              </p>
            </div>
            <button
              className="min-h-11 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:text-slate-400"
              disabled={lines.length >= PURCHASE_REQUEST_MAX_LINES}
              onClick={addLine}
              type="button"
            >
              Add line
            </button>
          </div>
          <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto lg:h-[calc(100%-4.5rem)] lg:max-h-none">
            {lines.map((line, index) => {
              const item = items.find((option) => option.id === line.itemId);
              const invalid = errors.includes(index);
              return (
                <button
                  key={line.key}
                  className={`grid min-h-14 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left ${line.key === selected.key ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  onClick={() => {
                    setSelectedKey(line.key);
                    setItemQuery("");
                    setUomQuery("");
                    setUomOptions([]);
                    setBudgetQuery("");
                  }}
                  type="button"
                >
                  <span className="text-sm font-bold text-slate-500">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-950">
                      {item?.itemName ?? (line.description || "Select an item")}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {line.requestedQty
                        ? `${line.requestedQty} ${item?.uoms.find((uom) => uom.id === line.uomId)?.uomCode ?? line.uomCode}`
                        : "Quantity required"}
                    </span>
                  </span>
                  <span
                    className={
                      invalid
                        ? "text-xs font-bold text-rose-700"
                        : "text-xs font-bold text-slate-500"
                    }
                  >
                    {invalid ? "Needs info" : "Ready"}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">
                Editing line {selectedIndex + 1} of {lines.length}
              </p>
              <h3 className="text-lg font-bold text-slate-950">
                {selectedItem?.itemName ??
                  (selected.itemName ||
                    selected.description ||
                    "Purchase request line")}
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400"
                disabled={selectedIndex === 0}
                onClick={() => setSelectedKey(lines[selectedIndex - 1]!.key)}
                type="button"
              >
                Previous
              </button>
              <button
                className="min-h-11 rounded-md border border-slate-300 px-3 text-sm font-semibold disabled:text-slate-400"
                disabled={selectedIndex === lines.length - 1}
                onClick={() => setSelectedKey(lines[selectedIndex + 1]!.key)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <SearchableLookup
                emptyText="No active catalog items match this search."
                getId={(item) => item.id}
                getLabel={(item) => `${item.itemName} / ${item.itemCode}`}
                label="Catalog item"
                loading={itemLoading}
                onPageChange={setItemPage}
                onQueryChange={(query) => {
                  setItemQuery(query);
                  setItemPage(1);
                }}
                onClear={() => {
                  setItemQuery("");
                  setUomQuery("");
                  setUomOptions([]);
                  update({ itemId: "", itemName: "", uomId: "", uomCode: "" });
                }}
                onSelect={handleItemChange}
                options={itemOptions}
                page={itemPage}
                placeholder="Select or type to search the item catalog"
                query={itemQuery}
                selectedId={selected.itemId}
                selectedLabel={
                  selectedItem
                    ? `${selectedItem.itemName} / ${selectedItem.itemCode}`
                    : undefined
                }
                totalPages={itemTotalPages}
              />
            </div>
            <SearchableLookup
              emptyText="No active budget lines match this search."
              getId={(line) => line.id}
              getLabel={(line) => line.label}
              getMeta={(line) => line.helper || "Selected-company budget line"}
              label="Budget line"
              loading={budgetLoading}
              onPageChange={setBudgetPage}
              onQueryChange={(query) => {
                setBudgetQuery(query);
                setBudgetPage(1);
              }}
              onClear={() => {
                setBudgetQuery("");
                update({ budgetLineId: "", budgetLabel: "" });
              }}
              onSelect={(line) => {
                setBudgetCache((current) => ({ ...current, [line.id]: line }));
                setBudgetQuery("");
                update({ budgetLineId: line.id, budgetLabel: line.label });
              }}
              options={budgetOptions}
              page={budgetPage}
              placeholder="Optional — Finance can classify later"
              query={budgetQuery}
              selectedId={selected.budgetLineId}
              selectedLabel={
                selectedBudget?.label || selected.budgetLabel || undefined
              }
              totalPages={budgetTotalPages}
            />
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Quantity
              <input
                className={inputClass}
                min="0.000001"
                step="0.000001"
                type="number"
                value={selected.requestedQty}
                onChange={(event) =>
                  update({ requestedQty: event.target.value })
                }
              />
            </label>
            {selectedItem ? (
              <SearchableLookup
                emptyText="No valid UOM is configured for this item."
                getId={(uom) => uom.id}
                getLabel={(uom) => `${uom.uomCode} / ${uom.uomName}`}
                label="Valid UOM"
                loading={uomLoading}
                onPageChange={setUomPage}
                onQueryChange={(query) => {
                  setUomQuery(query);
                  setUomPage(1);
                }}
                onSelect={(uom) => {
                  setUomQuery("");
                  update({ uomId: uom.id, uomCode: uom.uomCode });
                }}
                options={uomOptions}
                page={uomPage}
                placeholder="Select or type to filter valid UOMs"
                query={uomQuery}
                selectedId={selected.uomId}
                selectedLabel={
                  selectedUom
                    ? `${selectedUom.uomCode} / ${selectedUom.uomName}`
                    : undefined
                }
                totalPages={uomTotalPages}
              />
            ) : isEmergency ? (
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Free-text UOM
                <input
                  className={inputClass}
                  value={selected.uomCode}
                  onChange={(event) => update({ uomCode: event.target.value })}
                  placeholder="e.g. PACK"
                />
              </label>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                Select a catalog item to load only its valid UOMs.
              </div>
            )}
            {isEmergency ? (
              <>
                <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
                  Emergency item detail
                  <input
                    className={inputClass}
                    value={selected.description}
                    onChange={(event) =>
                      update({ description: event.target.value })
                    }
                    placeholder={
                      selectedItem
                        ? "Optional local-store detail"
                        : "What will be bought locally"
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Estimated unit cost
                  <input
                    className={inputClass}
                    min="0.000001"
                    step="0.000001"
                    type="number"
                    value={selected.estimatedUnitCost}
                    onChange={(event) =>
                      update({ estimatedUnitCost: event.target.value })
                    }
                  />
                </label>
              </>
            ) : null}
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">
              Purpose / notes
              <input
                className={inputClass}
                value={selected.purpose}
                onChange={(event) => update({ purpose: event.target.value })}
                placeholder="Why this stock is needed"
              />
            </label>
          </div>

          {[itemMessage, uomMessage, budgetMessage]
            .filter((message): message is string => Boolean(message))
            .map((message) => (
              <div
                className="mt-4 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                key={message}
                role="status"
              >
                <span>{message}</span>
                <button
                  className="min-h-10 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold"
                  onClick={() => setLookupRetry((value) => value + 1)}
                  type="button"
                >
                  Retry
                </button>
              </div>
            ))}
          {lines.length > 1 ? (
            <div className="mt-5 border-t border-slate-200 pt-4">
              <button
                className="min-h-11 rounded-md px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                onClick={removeLine}
                type="button"
              >
                Remove selected line
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-right">
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
          Create Draft Purchase Request
        </button>
      </div>
    </form>
  );
}
