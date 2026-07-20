"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormHTMLAttributes,
  type ReactElement
} from "react";
import { Plus, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cn } from "@ogfi/ui";

type ExpansionEntrySheetProps = {
  title: string;
  triggerLabel: string;
  submitLabel?: string;
  triggerClassName?: string;
  disabled?: boolean;
  disabledReason?: string;
  children: ReactElement<FormHTMLAttributes<HTMLFormElement>>;
};

type SheetActionsProps = {
  submitLabel: string;
  onCancel: () => void;
};

function SheetActions({ submitLabel, onCancel }: SheetActionsProps) {
  const { pending } = useFormStatus();

  return (
    <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
      <button
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:bg-blue-400"
        type="submit"
        disabled={pending}
        aria-disabled={pending}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {pending ? "Submitting…" : submitLabel}
      </button>
    </div>
  );
}

export function ExpansionEntrySheet({
  title,
  triggerLabel,
  submitLabel = triggerLabel,
  triggerClassName,
  disabled = false,
  disabledReason,
  children
}: ExpansionEntrySheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const disabledReasonId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const isDirtyRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const triggerHasCustomBackground = /\bbg-/.test(triggerClassName ?? "");
  const triggerHasCustomTextColor =
    /\btext-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/.test(
      triggerClassName ?? ""
    );

  const closeSheet = useCallback(() => {
    isDirtyRef.current = false;
    isSubmittingRef.current = false;
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const requestClose = useCallback(() => {
    if (isSubmittingRef.current) {
      return;
    }

    if (
      isDirtyRef.current &&
      !window.confirm("Discard the information entered in this form?")
    ) {
      return;
    }

    closeSheet();
  }, [closeSheet]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"
        )
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => {
      const firstField = dialogRef.current?.querySelector<HTMLElement>(
        "[data-entry-sheet-body] input:not([type='hidden']):not(:disabled), [data-entry-sheet-body] select:not(:disabled), [data-entry-sheet-body] textarea:not(:disabled), [data-entry-sheet-body] button:not(:disabled)"
      );
      (firstField ?? dialogRef.current)?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, requestClose]);

  const onlyChild = Children.only(children);
  if (!isValidElement<FormHTMLAttributes<HTMLFormElement>>(onlyChild)) {
    return null;
  }

  const form = cloneElement(onlyChild, {
    className: "flex min-h-0 flex-1 flex-col",
    onInputCapture: () => {
      isDirtyRef.current = true;
    },
    onChangeCapture: () => {
      isDirtyRef.current = true;
    },
    onSubmitCapture: () => {
      isSubmittingRef.current = true;
      isDirtyRef.current = false;
    },
    children: (
      <>
        <div
          data-entry-sheet-body
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6",
            onlyChild.props.className
          )}
        >
          {onlyChild.props.children}
        </div>
        <SheetActions submitLabel={submitLabel} onCancel={requestClose} />
      </>
    )
  });

  return (
    <>
      <div className="grid gap-1">
        <button
          ref={triggerRef}
          aria-describedby={disabled && disabledReason ? disabledReasonId : undefined}
          className={cn(
            "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            !triggerHasCustomBackground && "bg-blue-600 hover:bg-blue-700",
            !triggerHasCustomTextColor && "text-white",
            disabled && "cursor-not-allowed opacity-50 hover:bg-blue-600",
            triggerClassName
          )}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(true)}
        >
          {triggerLabel}
        </button>
        {disabled && disabledReason ? (
          <p id={disabledReasonId} className="max-w-72 text-xs leading-5 text-slate-500">
            {disabledReason}
          </p>
        ) : null}
      </div>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-sm"
          role="presentation"
        >
          <section
            ref={dialogRef}
            aria-describedby={descriptionId}
            aria-labelledby={titleId}
            aria-modal="true"
            className="flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)] sm:max-w-3xl sm:border-l sm:border-slate-200"
            role="dialog"
            tabIndex={-1}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Expansion entry
                </p>
                <h2 id={titleId} className="mt-1 text-lg font-bold text-slate-950">
                  {title}
                </h2>
                <p id={descriptionId} className="mt-1 text-sm text-slate-600">
                  Complete the required details, then review before submitting.
                </p>
              </div>
              <button
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                type="button"
                aria-label={`Close ${title}`}
                onClick={requestClose}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            {form}
          </section>
        </div>
      ) : null}
    </>
  );
}
