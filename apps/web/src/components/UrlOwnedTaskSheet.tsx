"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SyntheticEvent
} from "react";
import { useRouter } from "next/navigation";
import { TaskSheet } from "@/components/TaskSheet";

type UrlOwnedTaskSheetFeedback = {
  code?: string;
  message: string;
  title: string;
  tone?: "error" | "success";
};

type PreservedSelectionParam = {
  selectName: string;
  paramName: string;
};

type UrlOwnedTaskSheetProps = {
  title: string;
  description: ReactNode;
  returnHref: string;
  focusTargetId: string;
  /** Optional stable focus destination after a successful action removes or changes the origin control. */
  successFocusTargetId?: string | undefined;
  children: ReactNode;
  size?: "default" | "workspace" | undefined;
  submitFormId?: string | undefined;
  submitLabel?: string | undefined;
  submitDisabled?: boolean | undefined;
  /** Live Server Action state; returning to false releases TaskSheet's duplicate-submit lock. */
  pending?: boolean | undefined;
  cancelLabel?: string | undefined;
  /** Stable, record-scoped key used to retain this task's uncontrolled draft within the current tab. */
  draftStorageKey?: string | undefined;
  /** Server-action feedback to render inside the still-open URL-owned task. */
  actionFeedback?: UrlOwnedTaskSheetFeedback | null | undefined;
  pendingSubmitLabel?: string | undefined;
  pendingLiveMessage?: string | undefined;
  /** Exact select-to-query mappings retained across same-page GET lookup navigation. */
  preserveSelectionParams?: readonly PreservedSelectionParam[] | undefined;
};

type StoredControl = {
  key: string;
  value?: string;
  values?: string[];
  checked?: boolean;
};

type StoredDraft = {
  version: 1;
  savedAt: number;
  dirty: boolean;
  controls: StoredControl[];
};

const draftPrefix = "ogfi:url-owned-task-sheet:v1:";
const draftTtlMs = 2 * 60 * 60 * 1000;
const maxDraftControls = 96;
const maxDraftValueLength = 512;
const maxStoredDraftLength = 64 * 1024;
const maxPreservedSelectionParams = 8;
const maxPreservedSelectionLength = 256;
const safeParamNamePattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

function boundedValue(value: string) {
  return value.slice(0, maxDraftValueLength);
}

function defaultDraftStorageKey(
  title: string,
  submitFormId: string | undefined,
  focusTargetId: string,
  returnHref: string
) {
  const url = new URL(returnHref, "https://ogfi.invalid");
  const supplierId = url.searchParams.get("supplier") ?? "no-record";
  return [url.pathname, supplierId, submitFormId ?? title, focusTargetId]
    .map((part) => encodeURIComponent(part).slice(0, 96))
    .join(":");
}

function draftControlKey(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  forms: HTMLFormElement[]
) {
  const form = control.form;
  const formIndex = form ? forms.indexOf(form) : -1;
  const formKey = form?.id || `form-${Math.max(0, formIndex)}`;
  const controls = form
    ? Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input:not([type='hidden']), select, textarea"
        )
      ).filter((candidate) => candidate.name === control.name && candidate.type === control.type)
    : [control];
  const occurrence = Math.max(0, controls.indexOf(control));
  return `${formKey}:${control.tagName.toLowerCase()}:${control.type}:${control.name}:${occurrence}`;
}

function draftControls(container: HTMLElement) {
  const forms = Array.from(container.querySelectorAll("form"));
  return Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:not([type='hidden']), select, textarea"
    )
  )
    .filter((control) => {
      if (!control.name || control.disabled || control.dataset.sensitive === "true") return false;
      return !["button", "file", "password", "reset", "submit"].includes(control.type);
    })
    .slice(0, maxDraftControls)
    .map<StoredControl>((control) => {
      const key = draftControlKey(control, forms);
      if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
        return { key, checked: control.checked, value: boundedValue(control.value) };
      }
      if (control instanceof HTMLSelectElement && control.multiple) {
        return {
          key,
          values: Array.from(control.selectedOptions, (option) => boundedValue(option.value))
        };
      }
      return { key, value: boundedValue(control.value) };
    });
}

function restoreDraftControls(container: HTMLElement, storedControls: StoredControl[]) {
  const forms = Array.from(container.querySelectorAll("form"));
  const storedByKey = new Map(storedControls.map((control) => [control.key, control]));
  let restored = false;
  for (const control of Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input:not([type='hidden']), select, textarea"
    )
  )) {
    if (!control.name || control.disabled || control.dataset.sensitive === "true") continue;
    const stored = storedByKey.get(draftControlKey(control, forms));
    if (!stored) continue;
    if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
      control.checked = Boolean(stored.checked);
    } else if (control instanceof HTMLSelectElement && control.multiple) {
      const selectedValues = new Set(stored.values ?? []);
      for (const option of Array.from(control.options)) {
        option.selected = selectedValues.has(option.value);
      }
    } else if (stored.value !== undefined) {
      control.value = stored.value;
    }
    restored = true;
  }
  return restored;
}

function boundedSelectionParams(mappings: readonly PreservedSelectionParam[]) {
  const seenSelectNames = new Set<string>();
  const seenParamNames = new Set<string>();
  return mappings.slice(0, maxPreservedSelectionParams).filter(({ selectName, paramName }) => {
    if (
      !safeParamNamePattern.test(selectName) ||
      !safeParamNamePattern.test(paramName) ||
      seenSelectNames.has(selectName) ||
      seenParamNames.has(paramName)
    ) {
      return false;
    }
    seenSelectNames.add(selectName);
    seenParamNames.add(paramName);
    return true;
  });
}

function applyPreservedSelections(
  url: URL,
  mutationForm: HTMLFormElement,
  mappings: readonly PreservedSelectionParam[]
) {
  const selects = Array.from(mutationForm.querySelectorAll<HTMLSelectElement>("select[name]"));
  for (const { selectName, paramName } of mappings) {
    const select = selects.find(
      (candidate) => candidate.name === selectName && !candidate.disabled && !candidate.multiple
    );
    const selectedValue = select?.value ?? "";
    const hasExactOption =
      selectedValue.length > 0 &&
      selectedValue.length <= maxPreservedSelectionLength &&
      Array.from(select?.options ?? []).some((option) => option.value === selectedValue);
    if (hasExactOption) {
      url.searchParams.set(paramName, selectedValue);
    } else {
      url.searchParams.delete(paramName);
    }
  }
}

function isSamePageUrl(url: URL) {
  return url.origin === window.location.origin && url.pathname === window.location.pathname;
}

function mutationFormById(container: HTMLElement, submitFormId: string | undefined) {
  if (!submitFormId) return null;
  return Array.from(container.querySelectorAll<HTMLFormElement>("form[id]")).find(
    (form) => form.id === submitFormId
  ) ?? null;
}

export function UrlOwnedTaskSheet({
  title,
  description,
  returnHref,
  focusTargetId,
  successFocusTargetId,
  children,
  size = "default",
  submitFormId,
  submitLabel,
  submitDisabled = false,
  pending = false,
  cancelLabel = "Cancel",
  draftStorageKey,
  actionFeedback = null,
  pendingSubmitLabel,
  pendingLiveMessage = "Submitting request…",
  preserveSelectionParams = []
}: UrlOwnedTaskSheetProps) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const selectionParams = useMemo(
    () => boundedSelectionParams(preserveSelectionParams),
    [preserveSelectionParams]
  );
  const storageKey = useMemo(
    () =>
      `${draftPrefix}${
        draftStorageKey ??
        defaultDraftStorageKey(title, submitFormId, focusTargetId, returnHref)
      }`.slice(0, 512),
    [draftStorageKey, focusTargetId, returnHref, submitFormId, title]
  );

  const clearStoredDraft = useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
  }, [storageKey]);

  const restoreStoredDraft = useCallback(() => {
    if (!contentRef.current) return;
    try {
      const serialized = window.sessionStorage.getItem(storageKey);
      if (!serialized) return;
      const draft = JSON.parse(serialized) as Partial<StoredDraft>;
      if (
        draft.version !== 1 ||
        typeof draft.savedAt !== "number" ||
        Date.now() - draft.savedAt > draftTtlMs ||
        !Array.isArray(draft.controls)
      ) {
        clearStoredDraft();
        return;
      }
      if (restoreDraftControls(contentRef.current, draft.controls)) {
        setDirty(Boolean(draft.dirty));
      }
    } catch {
      clearStoredDraft();
    }
  }, [clearStoredDraft, storageKey]);

  const persistDraft = useCallback(
    (forceDirty = false) => {
      if (!contentRef.current) return;
      try {
        const draft: StoredDraft = {
          version: 1,
          savedAt: Date.now(),
          dirty: forceDirty || dirty,
          controls: draftControls(contentRef.current)
        };
        while (draft.controls.length > 0 && JSON.stringify(draft).length > maxStoredDraftLength) {
          draft.controls.pop();
        }
        window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        // Draft retention is best-effort when session storage is unavailable or full.
      }
    },
    [dirty, storageKey]
  );

  useEffect(() => {
    restoreStoredDraft();
  }, [restoreStoredDraft]);

  const returnToContext = useCallback((nextFocusTargetId = focusTargetId) => {
    setOpen(false);
    setDirty(false);
    clearStoredDraft();
    router.replace(returnHref, { scroll: false });
    const restoreFocus = (attempt = 0) => {
      const target = Array.from(document.querySelectorAll<HTMLElement>("[data-focus-key]"))
        .find((candidate) => candidate.dataset.focusKey === nextFocusTargetId && candidate.offsetParent !== null)
        ?? document.getElementById(nextFocusTargetId);
      if (target) {
        target.focus({ preventScroll: true });
        return;
      }
      if (attempt < 20) window.setTimeout(() => restoreFocus(attempt + 1), 50);
    };
    window.setTimeout(restoreFocus, 0);
  }, [clearStoredDraft, focusTargetId, returnHref, router]);

  useEffect(() => {
    if (!actionFeedback) return;

    const focusTimer = window.setTimeout(
      () => feedbackRef.current?.focus({ preventScroll: true }),
      0
    );
    if (actionFeedback.tone !== "success") {
      setDirty(true);
      const restoreTimer = window.setTimeout(restoreStoredDraft, 0);
      return () => {
        window.clearTimeout(focusTimer);
        window.clearTimeout(restoreTimer);
      };
    }

    clearStoredDraft();
    setDirty(false);
    const returnTimer = window.setTimeout(
      () => returnToContext(successFocusTargetId ?? focusTargetId),
      1_200
    );
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(returnTimer);
    };
  }, [actionFeedback, clearStoredDraft, focusTargetId, restoreStoredDraft, returnToContext, successFocusTargetId]);

  const captureDraftChange = (_event: SyntheticEvent) => {
    persistDraft(true);
  };

  const captureDraftSubmit = (event: FormEvent<HTMLDivElement>) => {
    persistDraft(true);
    if (selectionParams.length === 0 || !(event.target instanceof HTMLFormElement)) return;

    const form = event.target;
    if (form.method.toLowerCase() !== "get" || (form.target && form.target !== "_self")) return;
    const destination = new URL(form.action, window.location.href);
    if (!isSamePageUrl(destination)) return;

    destination.search = "";
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    for (const [name, value] of new FormData(form, submitter).entries()) {
      destination.searchParams.append(name, typeof value === "string" ? value : value.name);
    }
    if (!contentRef.current) return;
    const mutationForm = mutationFormById(contentRef.current, submitFormId);
    if (!mutationForm) return;
    applyPreservedSelections(destination, mutationForm, selectionParams);
    event.preventDefault();
    window.location.assign(destination.href);
  };

  const captureLookupLink = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      selectionParams.length === 0 ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (
      !(target instanceof HTMLAnchorElement) ||
      (target.target && target.target !== "_self") ||
      target.hasAttribute("download")
    ) {
      return;
    }
    const destination = new URL(target.href, window.location.href);
    if (!isSamePageUrl(destination) || !contentRef.current) return;
    const mutationForm = mutationFormById(contentRef.current, submitFormId);
    if (!mutationForm) return;

    persistDraft(true);
    applyPreservedSelections(destination, mutationForm, selectionParams);
    event.preventDefault();
    window.location.assign(destination.href);
  };

  return (
    <TaskSheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) returnToContext();
      }}
      title={title}
      description={description}
      size={size}
      dirty={dirty}
      onDirtyChange={setDirty}
      pending={pending}
      footer={({ pending, requestClose }) => (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            disabled={pending}
            onClick={requestClose}
            type="button"
          >
            {cancelLabel}
          </button>
          {submitFormId && submitLabel ? (
            <button
              className="min-h-11 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={pending || submitDisabled}
              form={submitFormId}
              type="submit"
            >
              {pending ? pendingSubmitLabel ?? `${submitLabel}…` : submitLabel}
            </button>
          ) : null}
          <span aria-live="polite" className="sr-only" role="status">
            {pending ? pendingLiveMessage : ""}
          </span>
        </div>
      )}
    >
      <div
        ref={contentRef}
        onClickCapture={captureLookupLink}
        onChangeCapture={captureDraftChange}
        onInputCapture={captureDraftChange}
        onSubmitCapture={captureDraftSubmit}
      >
        {actionFeedback ? (
          <div
            ref={feedbackRef}
            className={
              actionFeedback.tone === "success"
                ? "mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
                : "mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950"
            }
            role={actionFeedback.tone === "success" ? "status" : "alert"}
            tabIndex={-1}
          >
            <p className="font-bold">{actionFeedback.title}</p>
            <p className="mt-1">{actionFeedback.message}</p>
            {actionFeedback.code ? (
              <p className="mt-2 text-xs font-semibold uppercase">{actionFeedback.code}</p>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </TaskSheet>
  );
}
