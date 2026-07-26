import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("shared URL-owned task sheet contracts", () => {
  test("dirty and pending callback changes do not rerun the open-transition focus lifecycle", () => {
    const source = readFileSync(path.resolve(__dirname, "TaskSheet.tsx"), "utf8");

    expect(source).toContain("closeRef.current = close");
    expect(source).toContain("}, [close]);");
    expect(source).toContain("closeRef.current();");
    expect(source).toContain("}, [isOpen]);");
    expect(source).not.toContain("[close, isOpen]");
  });

  test("retains bounded non-hidden drafts through URL navigation and clears deliberate closes", () => {
    const source = readFileSync(path.resolve(__dirname, "UrlOwnedTaskSheet.tsx"), "utf8");

    expect(source).toContain('const draftTtlMs = 2 * 60 * 60 * 1000');
    expect(source).toContain("const maxDraftControls = 96");
    expect(source).toContain("const maxStoredDraftLength = 64 * 1024");
    expect(source).toContain('"input:not([type=\'hidden\']), select, textarea"');
    expect(source).toContain('!["button", "file", "password", "reset", "submit"].includes(control.type)');
    expect(source).toContain('control.dataset.sensitive === "true"');
    expect(source).toContain('if (!control.name || control.disabled || control.dataset.sensitive === "true") continue');
    expect(source).toContain("window.sessionStorage.setItem(storageKey");
    expect(source).toContain("window.sessionStorage.getItem(storageKey)");
    expect(source).toContain("window.sessionStorage.removeItem(storageKey)");
    expect(source).toContain("onSubmitCapture={captureDraftSubmit}");
    expect(source).toContain("clearStoredDraft();\n    router.replace(returnHref");
  });

  test("enrolls exact bounded select values into same-page GET lookup navigation", () => {
    const source = readFileSync(path.resolve(__dirname, "UrlOwnedTaskSheet.tsx"), "utf8");

    expect(source).toContain("const maxPreservedSelectionParams = 8");
    expect(source).toContain("const maxPreservedSelectionLength = 256");
    expect(source).toContain("safeParamNamePattern");
    expect(source).toContain("seenSelectNames.has(selectName)");
    expect(source).toContain("seenParamNames.has(paramName)");
    expect(source).toContain("option.value === selectedValue");
    expect(source).toContain("url.origin === window.location.origin");
    expect(source).toContain("url.pathname === window.location.pathname");
    expect(source).toContain('form.method.toLowerCase() !== "get"');
    expect(source).toContain("new FormData(form, submitter)");
    expect(source).toContain("mutationFormById(contentRef.current, submitFormId)");
    expect(source).toContain('target.closest("a[href]")');
    expect(source).toContain("event.button !== 0");
    expect(source).toContain("applyPreservedSelections(destination");
    expect(source).toContain("window.location.assign(destination.href)");
    expect(source).toContain("onClickCapture={captureLookupLink}");
  });

  test("keeps action feedback and pending progress perceivable inside the open task", () => {
    const source = readFileSync(path.resolve(__dirname, "UrlOwnedTaskSheet.tsx"), "utf8");

    expect(source).toContain("feedbackRef.current?.focus({ preventScroll: true })");
    expect(source).toContain("setDirty(true)");
    expect(source).toContain("returnToContext(successFocusTargetId ?? focusTargetId)");
    expect(source).toContain("window.clearTimeout(returnTimer)");
    expect(source).toContain('role={actionFeedback.tone === "success" ? "status" : "alert"}');
    expect(source).toContain("pending={pending}");
    expect(source).toContain("pending ? pendingSubmitLabel");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('role="status"');
    expect(source).toContain("pending ? pendingLiveMessage : \"\"");
  });
});
