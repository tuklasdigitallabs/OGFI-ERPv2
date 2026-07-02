"use client";

import { useState } from "react";
import { WASTAGE_MAX_LINES } from "@/lib/workflowLimits";

type WastageItemOption = {
  id: string;
  itemCode: string;
  itemName: string;
  baseUomCode: string;
  trackLot: boolean;
  trackExpiry: boolean;
  defaultWastageRequiresPhoto: boolean;
};

type WastageReasonOption = {
  id: string;
  code: string;
  label: string;
  appliesTo: string | null;
};

type InventoryLocationOption = {
  id: string;
  name: string;
};

type WastageLinesEditorProps = {
  action: (formData: FormData) => void | Promise<void>;
  inventoryLocations: InventoryLocationOption[];
  items: WastageItemOption[];
  reasonCodes: WastageReasonOption[];
  wastageTypes: readonly string[];
};

type DraftLine = {
  key: number;
};

export function WastageLinesEditor({
  action,
  inventoryLocations,
  items,
  reasonCodes,
  wastageTypes,
}: WastageLinesEditorProps) {
  const [lines, setLines] = useState<DraftLine[]>([{ key: 1 }]);
  const canAddLine = lines.length < WASTAGE_MAX_LINES;

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
      <div className="ogfi-callout p-3 text-sm">
        Draft wastage records capture evidence first. Approval does not change
        stock; only the separate Post Wastage action creates WASTAGE_OUT
        movements and updates balances.
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Inventory location
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            defaultValue={inventoryLocations[0]?.id}
            name="inventoryLocationId"
            required
          >
            {inventoryLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Type
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            defaultValue="SPOILAGE_EXPIRY"
            name="wastageType"
            required
          >
            {wastageTypes.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Reason code
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            name="reasonCode"
            required
          >
            {reasonCodes.map((reason) => (
              <option key={reason.id} value={reason.code}>
                {reason.code} / {reason.label}
                {reason.appliesTo ? ` / ${reason.appliesTo}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Report evidence reference
        <input
          className="rounded-md border border-slate-300 px-3 py-2"
          name="evidenceReference"
          placeholder="Photo filename, incident ref, or note"
        />
      </label>

      <div className="grid gap-3 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase text-slate-500">
              Wastage lines
            </h3>
            <p className="text-xs font-semibold text-slate-500">
              {lines.length} / {WASTAGE_MAX_LINES}
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

        <div className="ogfi-line-table max-h-[58vh]">
          <table className="min-w-[1180px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="w-12 px-3 py-2">#</th>
                <th className="w-64 px-3 py-2">Item</th>
                <th className="w-28 px-3 py-2">Qty</th>
                <th className="w-28 px-3 py-2">Unit Cost</th>
                <th className="w-40 px-3 py-2">Lot</th>
                <th className="w-40 px-3 py-2">Expiry</th>
                <th className="w-56 px-3 py-2">Line Evidence</th>
                <th className="w-56 px-3 py-2">Notes</th>
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
                    <select
                      aria-label={`Line ${index + 1} item`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineItemId"
                      required
                    >
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.itemCode} / {item.itemName} / {item.baseUomCode}
                          {item.defaultWastageRequiresPhoto ? " / photo" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} quantity`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      min="0.000001"
                      name="lineQuantity"
                      step="0.000001"
                      type="number"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} estimated unit cost`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      min="0"
                      name="lineEstimatedUnitCost"
                      step="0.01"
                      type="number"
                      defaultValue="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} lot number`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineLotNumber"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} expiry date`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineExpiryDate"
                      type="date"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} evidence reference`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineEvidenceReference"
                      placeholder="Line ref"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} notes`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineNotes"
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

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Notes
        <textarea
          className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
          name="notes"
          placeholder="Operational context"
        />
      </label>

      <button className="relative z-20 mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
        Create Draft Report
      </button>
    </form>
  );
}
