"use client";

import { useState } from "react";
import { TRANSFER_MAX_LINES } from "@/lib/workflowLimits";

type SourceInventoryLocationOption = {
  id: string;
  name: string;
  locationName: string;
};

type TransferItemOption = {
  id: string;
  itemCode: string;
  itemName: string;
  baseUomCode: string;
};

type DestinationInventoryLocationOption = {
  id: string;
  name: string;
  locationName: string;
};

type TransferLinesEditorProps = {
  action: (formData: FormData) => void | Promise<void>;
  destinationInventoryLocation: DestinationInventoryLocationOption;
  sourceInventoryLocations: SourceInventoryLocationOption[];
  items: TransferItemOption[];
};

type DraftLine = {
  key: number;
};

export function TransferLinesEditor({
  action,
  destinationInventoryLocation,
  sourceInventoryLocations,
  items,
}: TransferLinesEditorProps) {
  const [lines, setLines] = useState<DraftLine[]>([{ key: 1 }]);
  const canAddLine = lines.length < TRANSFER_MAX_LINES;

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
        This creates a request only. Stock moves when authorized source and
        destination users dispatch and receive it.
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Source inventory location
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            defaultValue={sourceInventoryLocations[0]?.id}
            name="sourceInventoryLocationId"
            required
          >
            {sourceInventoryLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.locationName} / {location.name}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Destination: {destinationInventoryLocation.locationName} /{" "}
          {destinationInventoryLocation.name}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Transfer type
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            name="transferType"
            required
          >
            <option value="WAREHOUSE_TO_BRANCH">Warehouse to Branch</option>
            <option value="BRANCH_TO_BRANCH">Branch to Branch</option>
            <option value="RETURN_TO_WAREHOUSE">Return to Warehouse</option>
            <option value="OTHER_INTERNAL">Other Internal Transfer</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Required by
          <input
            className="rounded-md border border-slate-300 px-3 py-2"
            name="requiredByDate"
            type="date"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Purpose
        <textarea
          className="min-h-20 rounded-md border border-slate-300 px-3 py-2"
          name="purpose"
          placeholder="Reason for the transfer request"
          required
        />
      </label>

      <div className="grid gap-3 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase text-slate-500">
              Transfer lines
            </h3>
            <p className="text-xs font-semibold text-slate-500">
              {lines.length} / {TRANSFER_MAX_LINES}
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
          <table className="min-w-[820px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="w-12 px-3 py-2">#</th>
                <th className="w-72 px-3 py-2">Item</th>
                <th className="w-32 px-3 py-2">Qty</th>
                <th className="w-72 px-3 py-2">Notes</th>
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
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} requested quantity`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      min="0.001"
                      name="lineRequestedQty"
                      step="0.001"
                      type="number"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${index + 1} notes`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      name="lineNotes"
                      placeholder="Optional handling note"
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
        Request Stock
      </button>
    </form>
  );
}
