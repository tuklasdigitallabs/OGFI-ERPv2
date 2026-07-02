"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@ogfi/ui";

type EntryModalProps = {
  title: string;
  triggerLabel: string;
  triggerClassName?: string;
  children: ReactNode;
};

export function EntryModal({
  title,
  triggerLabel,
  triggerClassName,
  children
}: EntryModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const triggerHasCustomBackground = /\bbg-/.test(triggerClassName ?? "");
  const triggerHasCustomTextColor =
    /\btext-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/.test(
      triggerClassName ?? ""
    );

  function closeModal() {
    setIsOpen(false);
    window.setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
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
      const firstField = dialogRef.current?.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
      >("[data-modal-body] input:not([type='hidden']):not(:disabled), [data-modal-body] select:not(:disabled), [data-modal-body] textarea:not(:disabled), [data-modal-body] button:not(:disabled)");
      firstField?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        className={cn(
          "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          !triggerHasCustomBackground && "bg-blue-600 hover:bg-blue-700",
          !triggerHasCustomTextColor && "text-white",
          triggerClassName
        )}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        {triggerLabel}
      </button>
      {isOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <section
            ref={dialogRef}
            aria-labelledby={titleId}
            aria-modal="true"
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
            role="dialog"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Transaction entry
                </p>
                <h2 id={titleId} className="mt-1 text-lg font-bold text-slate-950">
                  {title}
                </h2>
              </div>
              <button
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                type="button"
                aria-label="Close modal"
                onClick={closeModal}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div data-modal-body className="min-h-0 overflow-y-auto bg-white px-4 pb-5 sm:px-6 sm:pb-6">
              {children}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
