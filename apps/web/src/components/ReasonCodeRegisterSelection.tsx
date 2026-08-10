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

type ReasonCodeSelectionOption = {
  id: string;
  label: string;
};

type ReasonCodeRegisterSelectionProps = {
  children: ReactNode;
  initialReasonCodeId?: string | undefined;
  options: ReasonCodeSelectionOption[];
  registerHref: string;
};

const ReasonCodeSelectionContext = createContext<{
  selectedReasonCodeId: string;
  toggleReasonCode: (reasonCodeId: string) => void;
} | null>(null);

function useReasonCodeSelection() {
  const selection = useContext(ReasonCodeSelectionContext);
  if (!selection) throw new Error("REASON_CODE_SELECTION_CONTEXT_REQUIRED");
  return selection;
}

export function ReasonCodeSelectableRecord({
  children,
  label,
  reasonCodeId
}: {
  children: ReactNode;
  label: string;
  reasonCodeId: string;
}) {
  const selection = useReasonCodeSelection();
  const selected = selection.selectedReasonCodeId === reasonCodeId;
  const toggle = () => selection.toggleReasonCode(reasonCodeId);

  return (
    <div
      aria-label={`${label}. ${selected ? "Selected" : "Not selected"}. Press Enter or Space to toggle selection.`}
      aria-pressed={selected}
      className={cn(
        "ogfi-table-row grid cursor-pointer gap-4 px-5 py-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 lg:grid-cols-[12rem_1.1fr_0.75fr_8rem_8rem] lg:items-center",
        selected ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : "hover:bg-slate-50/70"
      )}
      data-selected={selected ? "true" : "false"}
      data-testid="reason-code-row"
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) return;
        toggle();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      }}
      role="button"
      tabIndex={0}
      title="Click to select or deselect this reason code"
    >
      {children}
      <span className="sr-only">{selected ? "Selected" : "Not selected"}</span>
    </div>
  );
}

export function ReasonCodeRegisterSelection({
  children,
  initialReasonCodeId,
  options,
  registerHref
}: ReasonCodeRegisterSelectionProps) {
  const validInitialReasonCodeId = options.some(({ id }) => id === initialReasonCodeId)
    ? initialReasonCodeId ?? ""
    : "";
  const [selectedReasonCodeId, setSelectedReasonCodeId] = useState(validInitialReasonCodeId);
  const selectedReasonCode = options.find(({ id }) => id === selectedReasonCodeId) ?? null;

  useEffect(() => {
    setSelectedReasonCodeId(validInitialReasonCodeId);
  }, [registerHref, validInitialReasonCodeId]);

  const selectionContext = useMemo(
    () => ({
      selectedReasonCodeId,
      toggleReasonCode: (reasonCodeId: string) => {
        setSelectedReasonCodeId((current) => current === reasonCodeId ? "" : reasonCodeId);
      }
    }),
    [selectedReasonCodeId]
  );

  const openDestination = useMemo(() => {
    if (!selectedReasonCodeId) return null;
    const destination = new URL(registerHref, "https://ogfi.invalid");
    destination.searchParams.set("reasonCodeId", selectedReasonCodeId);
    return {
      pathname: destination.pathname,
      searchEntries: Array.from(destination.searchParams.entries())
    };
  }, [registerHref, selectedReasonCodeId]);

  return (
    <ReasonCodeSelectionContext.Provider value={selectionContext}>
      <div>
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-atomic="true" aria-live="polite" className="text-sm text-slate-600">
            {selectedReasonCode
              ? `Selected: ${selectedReasonCode.label}`
              : "Select a reason code to review or maintain it."}
          </p>
          {openDestination ? (
            <form action={openDestination.pathname} method="get">
              {openDestination.searchEntries.map(([name, value]) => (
                <input key={name} name={name} type="hidden" value={value} />
              ))}
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                type="submit"
              >
                Open Reason Code
              </button>
            </form>
          ) : null}
        </div>
        {children}
      </div>
    </ReasonCodeSelectionContext.Provider>
  );
}
