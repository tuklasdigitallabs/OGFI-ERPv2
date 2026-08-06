"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from "react";
import { cn } from "@ogfi/ui";

type SupplierSelectionOption = {
  id: string;
  label: string;
};

type SupplierRegisterSelectionProps = {
  children: ReactNode;
  initialSupplierId?: string | undefined;
  options: SupplierSelectionOption[];
  registerHref: string;
};

const SupplierSelectionContext = createContext<{
  selectedSupplierId: string;
  toggleSupplier: (supplierId: string) => void;
} | null>(null);

type SupplierSelectableProps = {
  children: ReactNode;
  label: string;
  supplierId: string;
};

function useSupplierSelection() {
  const selection = useContext(SupplierSelectionContext);
  if (!selection) throw new Error("SUPPLIER_SELECTION_CONTEXT_REQUIRED");
  return selection;
}

function shouldIgnoreSelectionClick(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a, button, input, select, textarea"));
}

export function SupplierSelectableRow({
  children,
  label,
  supplierId
}: SupplierSelectableProps) {
  const selection = useSupplierSelection();
  const selected = selection.selectedSupplierId === supplierId;
  const toggle = () => selection.toggleSupplier(supplierId);
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  };

  return (
    <tr
      aria-label={`${label}. ${selected ? "Selected" : "Not selected"}. Press Enter or Space to toggle selection.`}
      aria-selected={selected}
      className={cn(
        "cursor-pointer align-top outline-none transition-colors hover:bg-slate-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
        selected && "bg-blue-50 ring-1 ring-inset ring-blue-300 hover:bg-blue-50"
      )}
      data-selected={selected ? "true" : "false"}
      data-testid="supplier-row"
      onClick={(event: MouseEvent<HTMLTableRowElement>) => {
        if (!shouldIgnoreSelectionClick(event.target)) toggle();
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      title="Click to select or deselect this supplier"
    >
      <td className="px-4 py-4">
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md border text-sm font-bold",
            selected
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-transparent"
          )}
        >
          ✓
        </span>
        <span className="sr-only">{selected ? "Selected" : "Not selected"}</span>
      </td>
      {children}
    </tr>
  );
}

export function SupplierSelectableCard({
  children,
  label,
  supplierId
}: SupplierSelectableProps) {
  const selection = useSupplierSelection();
  const selected = selection.selectedSupplierId === supplierId;
  const toggle = () => selection.toggleSupplier(supplierId);

  return (
    <article
      aria-label={`${label}. ${selected ? "Selected" : "Not selected"}. Press Enter or Space to toggle selection.`}
      aria-pressed={selected}
      className={cn(
        "min-w-0 cursor-pointer rounded-xl border bg-white p-4 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500",
        selected ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300" : "border-slate-200"
      )}
      data-selected={selected ? "true" : "false"}
      data-testid="supplier-card"
      onClick={(event: MouseEvent<HTMLElement>) => {
        if (!shouldIgnoreSelectionClick(event.target)) toggle();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      }}
      role="button"
      tabIndex={0}
      title="Click to select or deselect this supplier"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-800">
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-md border text-sm font-bold",
            selected
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-transparent"
          )}
        >
          ✓
        </span>
        {selected ? "Selected" : "Select supplier"}
      </div>
      {children}
    </article>
  );
}

export function SupplierRegisterSelection({
  children,
  initialSupplierId,
  options,
  registerHref
}: SupplierRegisterSelectionProps) {
  const validInitialSupplierId = options.some(({ id }) => id === initialSupplierId)
    ? initialSupplierId ?? ""
    : "";
  const [selectedSupplierId, setSelectedSupplierId] = useState(validInitialSupplierId);
  const selectedSupplier = options.find(({ id }) => id === selectedSupplierId) ?? null;

  useEffect(() => {
    setSelectedSupplierId(validInitialSupplierId);
  }, [registerHref, validInitialSupplierId]);

  const selectionContext = useMemo(
    () => ({
      selectedSupplierId,
      toggleSupplier: (supplierId: string) => {
        setSelectedSupplierId((current) => current === supplierId ? "" : supplierId);
      }
    }),
    [selectedSupplierId]
  );

  const openDestination = useMemo(() => {
    if (!selectedSupplierId) return null;
    const destination = new URL(registerHref, "https://ogfi.invalid");
    destination.searchParams.set("supplier", selectedSupplierId);
    destination.searchParams.set("tab", "overview");
    return {
      pathname: destination.pathname,
      searchEntries: Array.from(destination.searchParams.entries())
    };
  }, [registerHref, selectedSupplierId]);

  return (
    <SupplierSelectionContext.Provider value={selectionContext}>
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-atomic="true" aria-live="polite" className="text-sm text-slate-600">
          {selectedSupplier
            ? `Selected: ${selectedSupplier.label}`
            : "Select a supplier to review its information and catalog."}
        </p>
        <form action={openDestination?.pathname ?? "/suppliers"} method="get">
          {openDestination?.searchEntries.map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <button
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-white",
              openDestination
                ? "bg-blue-600 hover:bg-blue-700"
                : "cursor-not-allowed bg-slate-300"
            )}
            disabled={!openDestination}
            id="open-selected-supplier"
            type="submit"
          >
            Open supplier
          </button>
        </form>
      </div>
      {children}
    </div>
    </SupplierSelectionContext.Provider>
  );
}
