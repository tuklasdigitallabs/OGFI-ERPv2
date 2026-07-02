"use client";

import { useState } from "react";
import { PURCHASE_REQUEST_MAX_LINES } from "@/lib/workflowLimits";

type DraftItemOption = {
  id: string;
  itemCode: string;
  itemName: string;
};

type DraftUomOption = {
  id: string;
  uomCode: string;
  uomName: string;
};

type PurchaseRequestLinesEditorProps = {
  action: (formData: FormData) => void | Promise<void>;
  items: DraftItemOption[];
  uoms: DraftUomOption[];
};

type DraftLine = {
  key: number;
};

export function PurchaseRequestLinesEditor({
  action,
  items,
  uoms,
}: PurchaseRequestLinesEditorProps) {
  const [lines, setLines] = useState<DraftLine[]>([{ key: 1 }]);
  const canAddLine = lines.length < PURCHASE_REQUEST_MAX_LINES;

  function addLine() {
    if (!canAddLine) {
      return;
    }
    setLines((current) => [
      ...current,
      { key: Math.max(...current.map((line) => line.key)) + 1 },
    ]);
  }

  function removeLine(key: number) {
    setLines((current) =>
      current.length === 1
        ? current
        : current.filter((line) => line.key !== key),
    );
  }

  return (
    <form action={action} className="ogfi-form-shell relative isolate mt-4 grid gap-3">
      <label className="relative z-0 grid gap-1 text-sm font-medium text-slate-700">
        Required date
        <input
          className="rounded-md border border-slate-300 px-3 py-2"
          name="requiredDate"
          type="date"
          required
        />
      </label>
      <label className="relative z-0 grid gap-1 text-sm font-medium text-slate-700">
        Urgency
        <input
          className="rounded-md border border-slate-300 px-3 py-2"
          name="urgency"
          required
        />
      </label>
      <label className="relative z-0 grid gap-1 text-sm font-medium text-slate-700">
        Justification
        <textarea
          className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
          name="justification"
          required
        />
      </label>

      <div className="grid gap-3 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase text-slate-500">
              Request lines
            </h3>
            <p className="text-xs font-semibold text-slate-500">
              {lines.length} / {PURCHASE_REQUEST_MAX_LINES}
            </p>
          </div>
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            type="button"
            onClick={addLine}
            disabled={!canAddLine}
          >
            Add Line
          </button>
        </div>

        <div className="ogfi-line-table max-h-[62vh] overflow-auto">
          <table className="min-w-[920px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="w-12 px-3 py-2">#</th>
                <th className="w-56 px-3 py-2">Description</th>
                <th className="w-56 px-3 py-2">Catalog item</th>
                <th className="w-28 px-3 py-2">Qty</th>
                <th className="w-32 px-3 py-2">Free UOM</th>
                <th className="w-44 px-3 py-2">Catalog unit</th>
                <th className="w-44 px-3 py-2">Purpose</th>
                <th className="w-20 px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, index) => (
                <tr key={line.key} className="align-top">
                  <td className="px-3 py-2 text-sm font-bold text-slate-500">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} description`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineDescription"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Line ${index + 1} catalog item`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineItemId"
                    >
                      <option value="">Free-text line</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.itemName} / {item.itemCode}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} quantity`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      min="0.000001"
                      name="lineRequestedQty"
                      step="0.000001"
                      type="number"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} free-text UOM`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineUomCode"
                      placeholder="CASE"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Line ${index + 1} catalog unit`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineUomId"
                    >
                      <option value="">Use free-text UOM</option>
                      {uoms.map((uom) => (
                        <option key={uom.id} value={uom.id}>
                          {uom.uomCode} / {uom.uomName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} purpose`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="linePurpose"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    {lines.length > 1 ? (
                      <button
                        className="inline-flex min-h-9 items-center justify-center rounded-md px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                        type="button"
                        onClick={() => removeLine(line.key)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button className="relative z-20 mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
        Create Draft Purchase Request
      </button>
    </form>
  );
}
