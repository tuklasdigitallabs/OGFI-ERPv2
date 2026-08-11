"use client";

import { useMemo, useState } from "react";

type CatalogItem = {
  id: string;
  menuItemCode: string;
  menuItemName: string;
  menuCategory: string | null;
  recipeName?: string | null;
  versionNo?: number | null;
  offerState?: "OFFERED" | "UNMAPPED";
  resolutionSource?: "BRAND_DEFAULT" | "LOCATION_OVERRIDE" | null;
  pendingCostLineCount?: number;
  quantityReadiness?: "READY" | "BLOCKED";
  quantityBlockers?: string[];
};

type Period = { code: string; label: string };

type Line = {
  key: string;
  menuItemId: string;
  disposition: "PAID" | "COMPLIMENTARY";
  quantityServed: string;
  complimentaryReason: string;
  complimentaryReference: string;
};

export type ServingDeclarationEditorLine = Omit<Line, "key">;

function newLine(): Line {
  return {
    key: crypto.randomUUID(),
    menuItemId: "",
    disposition: "PAID",
    quantityServed: "",
    complimentaryReason: "",
    complimentaryReference: "",
  };
}

function MenuItemCombobox({
  items,
  value,
  onChange,
}: {
  items: CatalogItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = items.find((item) => item.id === value);
  const [query, setQuery] = useState(
    selected ? `${selected.menuItemCode} — ${selected.menuItemName}` : "",
  );
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (
      !normalized ||
      (selected &&
        query === `${selected.menuItemCode} — ${selected.menuItemName}`)
    )
      return items;
    return items.filter((item) =>
      `${item.menuItemCode} ${item.menuItemName} ${item.menuCategory ?? ""}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [items, query, selected]);

  return (
    <div className="relative">
      <input
        aria-autocomplete="list"
        aria-expanded={open}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Select or search active menu items"
        role="combobox"
        value={query}
      />
      {open ? (
        <div
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
          role="listbox"
        >
          {filtered.length ? (
            filtered.map((item) => (
              <button
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50"
                key={item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item.id);
                  setQuery(`${item.menuItemCode} — ${item.menuItemName}`);
                  setOpen(false);
                }}
                role="option"
                aria-selected={item.id === value}
                type="button"
              >
                <span className="min-w-0">
                  <strong>{item.menuItemName}</strong>
                  <span className="ml-2 text-slate-500">
                    {item.menuItemCode}
                  </span>
                  {item.recipeName ? (
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {item.recipeName}
                      {item.versionNo ? ` · v${item.versionNo}` : ""}
                    </span>
                  ) : item.offerState === "UNMAPPED" ? (
                    <span className="mt-1 block truncate text-xs font-semibold text-amber-700">
                      No effective recipe assignment
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-slate-500">
                  <span>{item.menuCategory ?? "Uncategorized"}</span>
                  {item.resolutionSource ? (
                    <span
                      className={
                        item.resolutionSource === "LOCATION_OVERRIDE"
                          ? "rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-semibold text-violet-700"
                          : "rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-700"
                      }
                    >
                      {item.resolutionSource === "LOCATION_OVERRIDE"
                        ? "Branch override"
                        : "Brand default"}
                    </span>
                  ) : null}
                  {item.pendingCostLineCount ? (
                    <span className="font-semibold text-amber-700">
                      Cost evidence pending
                    </span>
                  ) : null}
                  {item.quantityReadiness === "BLOCKED" ? (
                    <span className="font-semibold text-rose-700">
                      Posting setup incomplete
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-slate-500">
              No matching active menu item.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuantityReadinessWarning({
  item,
}: {
  item: CatalogItem | undefined;
}) {
  if (item?.quantityReadiness !== "BLOCKED") return null;
  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 lg:col-span-4"
      role="status"
    >
      <strong>Serving can be recorded; verification will be blocked.</strong>{" "}
      Complete the published recipe and brand assignment before this declaration
      can derive or post inventory consumption.
      {item.quantityBlockers?.length ? (
        <span className="mt-1 block text-xs font-semibold">
          {item.quantityBlockers
            .map((blocker) =>
              blocker.replaceAll("_", " ").toLocaleLowerCase(),
            )
            .join(" · ")}
        </span>
      ) : null}
    </div>
  );
}

export function ServingDeclarationEditor({
  action,
  catalog,
  periods,
  idempotencyKey,
  defaultBusinessDate,
  defaultPeriodCode,
  initialLines,
  declarationId,
  declarationVersion,
  submitLabel = "Create draft serving declaration",
}: {
  action: (formData: FormData) => void | Promise<void>;
  catalog: CatalogItem[];
  periods: Period[];
  idempotencyKey: string;
  defaultBusinessDate: string;
  defaultPeriodCode?: string;
  initialLines?: ServingDeclarationEditorLine[];
  declarationId?: string;
  declarationVersion?: number;
  submitLabel?: string;
}) {
  const [lines, setLines] = useState<Line[]>(
    initialLines?.length
      ? initialLines.map((line) => ({ ...line, key: crypto.randomUUID() }))
      : [newLine()],
  );
  const payload = lines.map(({ key: _key, ...line }) => ({
    ...line,
    quantityServed: Number(line.quantityServed),
  }));

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      {declarationId ? (
        <input name="id" type="hidden" value={declarationId} />
      ) : null}
      {declarationVersion ? (
        <input name="version" type="hidden" value={declarationVersion} />
      ) : null}
      <input name="lines" type="hidden" value={JSON.stringify(payload)} />
      <section className="ogfi-data-surface grid gap-4 p-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Business date
          <input
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2"
            defaultValue={defaultBusinessDate}
            name="businessDate"
            required
            type="date"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Service period
          <select
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2"
            defaultValue={defaultPeriodCode}
            name="servicePeriodCode"
            required
          >
            {periods.map((period) => (
              <option key={period.code} value={period.code}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="ogfi-data-surface overflow-visible">
        <div className="ogfi-section-header">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Served menu items
            </h2>
            <p className="text-sm text-slate-500">
              Record completed menu servings. Prepared but unserved items belong
              in Wastage.
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Every active brand menu item remains selectable unless this branch
              explicitly marks it unavailable. Missing recipe setup is shown as a
              posting warning, not hidden from factual serving entry. Pending cost
              evidence does not block quantity entry.
            </p>
          </div>
          <button
            className="min-h-11 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            disabled={catalog.length === 0}
            onClick={() => setLines((current) => [...current, newLine()])}
            type="button"
          >
            Add menu item
          </button>
        </div>
        <div className="grid gap-3 p-4">
          {lines.map((line, index) => (
            <article
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(18rem,2fr)_10rem_9rem_auto] lg:items-start"
              key={line.key}
            >
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Menu item {index + 1}
                <MenuItemCombobox
                  items={catalog}
                  onChange={(menuItemId) =>
                    updateLine(line.key, { menuItemId })
                  }
                  value={line.menuItemId}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Quantity served
                <input
                  className="min-h-11 rounded-lg border border-slate-300 px-3 py-2"
                  min="0.000001"
                  onChange={(event) =>
                    updateLine(line.key, { quantityServed: event.target.value })
                  }
                  required
                  step="0.000001"
                  type="number"
                  value={line.quantityServed}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Disposition
                <select
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2"
                  onChange={(event) =>
                    updateLine(line.key, {
                      disposition: event.target.value as Line["disposition"],
                    })
                  }
                  value={line.disposition}
                >
                  <option value="PAID">Paid</option>
                  <option value="COMPLIMENTARY">Complimentary</option>
                </select>
              </label>
              <button
                className="min-h-11 rounded-lg px-3 text-sm font-semibold text-rose-700 disabled:text-slate-400 lg:mt-6"
                disabled={lines.length === 1}
                onClick={() =>
                  setLines((current) =>
                    current.filter((candidate) => candidate.key !== line.key),
                  )
                }
                type="button"
              >
                Remove
              </button>
              {line.disposition === "COMPLIMENTARY" ? (
                <div className="grid gap-3 lg:col-span-4 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Complimentary reason
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2"
                      onChange={(event) =>
                        updateLine(line.key, {
                          complimentaryReason: event.target.value,
                        })
                      }
                      placeholder="VIP, service recovery, promotion…"
                      required
                      value={line.complimentaryReason}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-700">
                    Operational reference
                    <input
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2"
                      onChange={(event) =>
                        updateLine(line.key, {
                          complimentaryReference: event.target.value,
                        })
                      }
                      placeholder="Table, transaction, guest, event, or incident"
                      required
                      value={line.complimentaryReference}
                    />
                  </label>
                </div>
              ) : null}
              <QuantityReadinessWarning
                item={catalog.find((item) => item.id === line.menuItemId)}
              />
            </article>
          ))}
        </div>
        {catalog.length === 0 ? (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950" role="status">
            <p className="font-bold">No menu items are offered at this branch</p>
            <p className="mt-1">
              No active item is available in the selected brand, or every item has
              an effective branch-unavailable exception. Missing recipe setup alone
              does not remove an item from this list.
            </p>
          </div>
        ) : null}
      </section>
      <div className="sticky bottom-3 z-10 flex justify-end rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <button
          className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white disabled:bg-slate-300"
          disabled={
            catalog.length === 0 ||
            lines.some(
              (line) =>
                !line.menuItemId ||
                !Number(line.quantityServed) ||
                (line.disposition === "COMPLIMENTARY" &&
                  (!line.complimentaryReason.trim() ||
                    !line.complimentaryReference.trim())),
            )
          }
          type="submit"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
