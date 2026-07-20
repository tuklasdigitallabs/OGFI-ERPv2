"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";
import { X } from "lucide-react";
import { cn } from "@ogfi/ui";

type TaskSheetProps = {
  title: string;
  children: ReactNode;
  /** Optional content rendered below the title in the persistent header. */
  header?: ReactNode;
  /** Optional persistent action area. Use a form attribute when its controls submit a form in children. */
  footer?: ReactNode;
  description?: ReactNode;
  trigger?: ReactNode;
  triggerClassName?: string;
  size?: "default" | "workspace";
  bodyScroll?: "auto" | "contained";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Lets callers reset pending state after an action completes without unmounting the sheet. */
  pending?: boolean;
  /** Lets callers explicitly mark a form dirty when changes do not emit input or change events. */
  dirty?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
  bodyClassName?: string;
};

const focusableSelector =
  "a[href], button:not(:disabled), input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

export function TaskSheet({
  title,
  children,
  header,
  footer,
  description,
  trigger,
  triggerClassName,
  size = "default",
  bodyScroll = "auto",
  open,
  defaultOpen = false,
  onOpenChange,
  pending = false,
  dirty,
  onDirtyChange,
  className,
  bodyClassName
}: TaskSheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const isOpen = open ?? uncontrolledOpen;
  const hasUnsavedChanges = dirty ?? isDirty;
  const isPending = pending || isSubmitting;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open]
  );

  const markDirty = useCallback(() => {
    if (dirty === undefined) {
      setIsDirty(true);
    }
    onDirtyChange?.(true);
  }, [dirty, onDirtyChange]);

  const close = useCallback(() => {
    if (isPending) {
      return;
    }

    if (hasUnsavedChanges && !window.confirm("Discard the information entered in this form?")) {
      return;
    }

    setIsDirty(false);
    setIsSubmitting(false);
    onDirtyChange?.(false);
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [hasUnsavedChanges, isPending, onDirtyChange, setOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab" || !sheetRef.current) {
        return;
      }

      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null
      );
      if (focusable.length === 0) {
        event.preventDefault();
        sheetRef.current.focus();
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
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => {
      const firstField = sheetRef.current?.querySelector<HTMLElement>(
        "[data-task-sheet-body] input:not([type='hidden']):not(:disabled), [data-task-sheet-body] select:not(:disabled), [data-task-sheet-body] textarea:not(:disabled), [data-task-sheet-body] button:not(:disabled)"
      );
      (firstField ?? sheetRef.current)?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen]);

  useEffect(() => {
    if (!pending) {
      setIsSubmitting(false);
    }
  }, [pending]);

  return (
    <>
      {trigger ? (
        <button
          ref={triggerRef}
          className={cn(
            "inline-flex min-h-10 items-center justify-center rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed",
            triggerClassName
          )}
          type="button"
          disabled={isPending}
          onClick={() => setOpen(true)}
        >
          {trigger}
        </button>
      ) : null}

      {isOpen ? (
        <div className={cn("fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm", size === "workspace" ? "flex items-center justify-center p-0 md:p-3" : "flex justify-end")} role="presentation">
          <section
            ref={sheetRef}
            aria-describedby={description ? descriptionId : undefined}
            aria-labelledby={titleId}
            aria-modal="true"
            aria-busy={isPending}
            className={cn(
              size === "workspace"
                ? "flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)] md:h-[calc(100%-1.5rem)] md:w-[calc(100%-1.5rem)] md:rounded-xl md:border md:border-slate-200 xl:w-[min(92vw,90rem)]"
                : "flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)] sm:max-w-3xl sm:border-l sm:border-slate-200",
              className
            )}
            role="dialog"
            tabIndex={-1}
            onSubmitCapture={(event) => {
              if (isPending) {
                event.preventDefault();
                return;
              }
              setIsSubmitting(true);
              setIsDirty(false);
              onDirtyChange?.(false);
            }}
          >
            <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-bold text-slate-950">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-sm text-slate-600">
                    {description}
                  </p>
                ) : null}
                {header ? <div className="mt-3">{header}</div> : null}
              </div>
              <button
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                type="button"
                aria-label={`Close ${title}`}
                disabled={isPending}
                onClick={close}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </header>
            <div
              data-task-sheet-body
              className={cn(bodyScroll === "contained" ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6", bodyClassName)}
              onChangeCapture={markDirty}
              onInputCapture={markDirty}
            >
              {children}
            </div>
            {footer ? (
              <footer className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
                {footer}
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
