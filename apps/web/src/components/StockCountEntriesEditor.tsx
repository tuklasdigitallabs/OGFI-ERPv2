"use client";

import { EntryModal } from "@/components/EntryModal";

type StockCountEntryLine = {
  id: string;
  lineNumber: number;
  itemCode: string;
  itemName: string;
  uomCode: string;
  lotNumber: string | null;
  expiryDate: string | null;
  countedQuantityBaseUom: number | null;
  varianceQuantityBaseUom: number | null;
  notes: string | null;
};

type StockCountEntriesEditorProps = {
  action: (formData: FormData) => void | Promise<void>;
  countId: string;
  lines: StockCountEntryLine[];
};

export function StockCountEntriesEditor({
  action,
  countId,
  lines
}: StockCountEntriesEditorProps) {
  return (
    <EntryModal title="Enter Count Lines" triggerLabel="Enter Count Lines">
      <form action={action} className="ogfi-form-shell mt-4 grid gap-3">
        <input name="id" type="hidden" value={countId} />
        <div className="ogfi-callout p-3 text-sm">
          Save counted quantities here. Variance remains review-only until an
          authorized variance adjustment is generated and posted.
        </div>
        <div className="ogfi-line-table">
          <table className="min-w-[980px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="w-14 px-3 py-2">#</th>
                <th className="w-72 px-3 py-2">Item</th>
                <th className="w-36 px-3 py-2">Lot</th>
                <th className="w-32 px-3 py-2">Expiry</th>
                <th className="w-36 px-3 py-2">Counted</th>
                <th className="w-28 px-3 py-2">Variance</th>
                <th className="w-64 px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="px-3 py-2 text-sm font-bold text-slate-500">
                    {line.lineNumber}
                    <input name="lineId" type="hidden" value={line.id} />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-950">{line.itemName}</p>
                    <p className="text-xs text-slate-500">
                      {line.itemCode} / {line.uomCode}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {line.lotNumber ?? "Untracked"}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {line.expiryDate ?? "No expiry"}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${line.lineNumber} counted quantity`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      defaultValue={line.countedQuantityBaseUom ?? ""}
                      min="0"
                      name="countedQuantityBaseUom"
                      required
                      step="0.000001"
                      type="number"
                    />
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-950">
                    {line.varianceQuantityBaseUom ?? "-"} {line.uomCode}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Line ${line.lineNumber} notes`}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-2"
                      defaultValue={line.notes ?? ""}
                      name="notes"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:w-fit">
          Save Count Entries
        </button>
      </form>
    </EntryModal>
  );
}
