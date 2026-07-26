import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  catalogSelectionReady,
  createItemCatalogRequestController,
  fetchItemMasterCatalog,
  type ItemCatalogResponse
} from "./itemCreateCatalogState";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function response(result: Partial<ItemCatalogResponse> = {}) {
  return new Response(JSON.stringify({
    options: [],
    page: 1,
    pageSize: 25,
    total: 0,
    hasMore: false,
    ...result
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Create Item catalog controller", () => {
  test("a required blank selector is unresolved and never auto-selects the first result", () => {
    const options = [{ id: "category-1", code: "FOOD", label: "Food", status: "ACTIVE" }];
    expect(catalogSelectionReady({ required: true, selectedId: "", options, loading: false, debouncing: false, error: null })).toBe(false);
    expect(options[0]?.id).toBe("category-1");
  });

  test("a later request wins even when an aborted earlier request resolves last", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const accepted: string[] = [];
    const controller = createItemCatalogRequestController(fetchItemMasterCatalog);
    const firstLoad = controller.load({ kind: "category", query: "old", page: 1, pageSize: 25, selectedId: "" }, (result) => accepted.push(result.options[0]!.id));
    const secondLoad = controller.load({ kind: "category", query: "new", page: 1, pageSize: 25, selectedId: "" }, (result) => accepted.push(result.options[0]!.id));

    expect(signals[0]?.aborted).toBe(true);
    second.resolve(response({ options: [{ id: "new", code: "NEW", label: "New", status: "ACTIVE" }], total: 1 }));
    await expect(secondLoad).resolves.toEqual({ accepted: true, aborted: false });
    first.resolve(response({ options: [{ id: "old", code: "OLD", label: "Old", status: "ACTIVE" }], total: 1 }));
    await expect(firstLoad).resolves.toEqual({ accepted: false, aborted: true });
    expect(accepted).toEqual(["new"]);
  });

  test("selected exact ID is retained across query and page and the accepted page is clamped", async () => {
    const retained = [{ id: "selected-uom", code: "CS", label: "Case", status: "ACTIVE" }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ options: retained, page: 1, pageSize: 25, total: 26, hasMore: true }))
      .mockResolvedValueOnce(response({ options: retained, page: 99, pageSize: 25, total: 26, hasMore: false }));
    vi.stubGlobal("fetch", fetchMock);
    const accepted: Array<{ page: number; id: string }> = [];
    const controller = createItemCatalogRequestController(fetchItemMasterCatalog);

    await controller.load({ kind: "uom", query: "", page: 1, pageSize: 25, selectedId: "selected-uom" }, (result) => {
      accepted.push({ page: result.page, id: result.options[0]!.id });
    });
    await controller.load({ kind: "uom", query: "bottle", page: 2, pageSize: 25, selectedId: "selected-uom" }, (result) => {
      accepted.push({ page: result.page, id: result.options[0]!.id });
    });

    const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
    const secondUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(firstUrl).toContain("page=1");
    expect(firstUrl).toContain("selectedId=selected-uom");
    expect(secondUrl).toContain("query=bottle");
    expect(secondUrl).toContain("page=2");
    expect(secondUrl).toContain("selectedId=selected-uom");
    expect(accepted).toEqual([{ page: 1, id: "selected-uom" }, { page: 2, id: "selected-uom" }]);
  });

  test("required submission readiness fails during debounce, load, errors, and unresolved selection", () => {
    const selected = [{ id: "uom-1", code: "EA", label: "Each", status: "ACTIVE" }];
    const ready = (overrides: Partial<Parameters<typeof catalogSelectionReady>[0]>) => catalogSelectionReady({
      required: true,
      selectedId: "uom-1",
      options: selected,
      loading: false,
      debouncing: false,
      error: null,
      ...overrides
    });
    expect(ready({ debouncing: true })).toBe(false);
    expect(ready({ loading: true })).toBe(false);
    expect(ready({ error: "unavailable" })).toBe(false);
    expect(ready({ options: [] })).toBe(false);
    expect(ready({})).toBe(true);
  });

  test("optional None remains safe through loading and lookup failure", () => {
    expect(catalogSelectionReady({ required: false, selectedId: "", options: [], loading: true, debouncing: true, error: "unavailable" })).toBe(true);
  });

  test("component wiring distinguishes true and filtered empty states and preserves recovery controls", () => {
    const source = readFileSync(path.resolve(__dirname, "ItemCreateComposer.tsx"), "utf8");
    expect(source).toContain("No active {kind === \"category\" ? \"categories\" : \"UOMs\"} are configured");
    expect(source).toContain("Close this composer, then open the");
    expect(source).toContain(">Clear search</button>");
    expect(source).toContain("setQuery(\"\"); setPage(1)");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("View item register");
    expect(source).toContain("The option catalogs were refreshed. Re-select");
  });
});
