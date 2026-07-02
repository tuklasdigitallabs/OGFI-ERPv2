"use client";

import { useMemo, useState } from "react";
import { PURCHASE_REQUEST_MAX_LINES } from "@/lib/workflowLimits";

type QuoteRequestLine = {
  id: string;
  lineNumber: number;
  itemName: string | null;
  description: string;
  requestedQty: number;
  uomId: string | null;
  uomCode: string;
  purpose: string;
};

type QuoteRequestOption = {
  id: string;
  publicReference: string;
  requiredDate: string;
  lines: QuoteRequestLine[];
};

type SupplierOption = {
  id: string;
  supplierCode: string;
  legalName: string;
};

type UomOption = {
  id: string;
  uomCode: string;
  uomName: string;
};

type SupplierQuoteLinesEditorProps = {
  requests: QuoteRequestOption[];
  suppliers: SupplierOption[];
  uoms: UomOption[];
  action: (formData: FormData) => void | Promise<void>;
};

const inputClass = "h-9 w-full rounded-md border border-slate-300 px-2";

export function SupplierQuoteLinesEditor({
  requests,
  suppliers,
  uoms,
  action
}: SupplierQuoteLinesEditorProps) {
  const hasFormOptions =
    requests.length > 0 && suppliers.length > 0 && uoms.length > 0;
  const [selectedRequestId, setSelectedRequestId] = useState(
    requests[0]?.id ?? ""
  );
  const selectedRequest = useMemo(
    () =>
      requests.find((request) => request.id === selectedRequestId) ??
      requests[0] ??
      null,
    [requests, selectedRequestId]
  );

  return (
    <form action={action} className="ogfi-form-shell mt-4 grid gap-3">
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Purchase Request
        <select
          className={inputClass}
          name="purchaseRequestId"
          value={selectedRequest?.id ?? ""}
          disabled={!hasFormOptions}
          onChange={(event) => setSelectedRequestId(event.target.value)}
          required
        >
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.publicReference} / {request.lines.length} line
              {request.lines.length === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Supplier
        <select
          className={inputClass}
          name="supplierId"
          disabled={!hasFormOptions}
          required
        >
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.supplierCode} / {supplier.legalName}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Quote reference
        <input
          className={inputClass}
          name="quoteReference"
          disabled={!hasFormOptions}
          required
        />
      </label>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Quote date
          <input
            className={inputClass}
            name="quoteDate"
            type="date"
            disabled={!hasFormOptions}
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Valid until
          <input
            className={inputClass}
            name="validityDate"
            type="date"
            disabled={!hasFormOptions}
          />
        </label>
      </div>

      <div className="grid gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">Quoted lines</p>
          <p className="text-xs font-semibold text-slate-500">
            {selectedRequest?.lines.length ?? 0} / {PURCHASE_REQUEST_MAX_LINES}
          </p>
        </div>
        <div className="ogfi-line-table">
          <table className="min-w-[980px] table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="w-12 px-3 py-2">#</th>
                <th className="w-64 px-3 py-2">Requested line</th>
                <th className="w-28 px-3 py-2">Qty</th>
                <th className="w-32 px-3 py-2">UOM</th>
                <th className="w-32 px-3 py-2">Unit price</th>
                <th className="w-24 px-3 py-2">Lead</th>
                <th className="w-40 px-3 py-2">Availability</th>
                <th className="w-44 px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedRequest?.lines.map((line) => {
                const defaultUomId =
                  line.uomId ??
                  uoms.find((uom) => uom.uomCode === line.uomCode)?.id ??
                  uoms[0]?.id ??
                  "";

                return (
                  <tr key={line.id} className="align-top">
                    <td className="px-3 py-2 text-sm font-bold text-slate-500">
                      {line.lineNumber}
                      <input name="sourcePrLineId" type="hidden" value={line.id} />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-950">
                        {line.itemName ?? line.description}
                      </p>
                      <p className="text-xs text-slate-500">
                        {line.requestedQty} {line.uomCode} / {line.purpose}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Line ${line.lineNumber} quoted quantity`}
                        className={inputClass}
                        defaultValue={line.requestedQty}
                        min="0.000001"
                        name="lineQuantity"
                        step="0.000001"
                        type="number"
                        disabled={!hasFormOptions}
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Line ${line.lineNumber} quoted UOM`}
                        className={inputClass}
                        name="lineUomId"
                        defaultValue={defaultUomId}
                        disabled={!hasFormOptions}
                        required
                      >
                        {uoms.map((uom) => (
                          <option key={uom.id} value={uom.id}>
                            {uom.uomCode}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Line ${line.lineNumber} unit price`}
                        className={inputClass}
                        min="0.000001"
                        name="lineUnitPrice"
                        step="0.000001"
                        type="number"
                        disabled={!hasFormOptions}
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Line ${line.lineNumber} lead days`}
                        className={inputClass}
                        min="0"
                        name="lineLeadTimeDays"
                        type="number"
                        disabled={!hasFormOptions}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Line ${line.lineNumber} availability`}
                        className={inputClass}
                        name="lineAvailabilityStatus"
                        defaultValue="Available"
                        disabled={!hasFormOptions}
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Line ${line.lineNumber} notes`}
                        className={inputClass}
                        name="lineNotes"
                        disabled={!hasFormOptions}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Terms
        <input className={inputClass} name="terms" disabled={!hasFormOptions} />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Recording reason
        <input
          className={inputClass}
          name="reason"
          disabled={!hasFormOptions}
          required
        />
      </label>
      <button
        className="inline-flex min-h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
        disabled={!hasFormOptions}
      >
        Record Supplier Quote
      </button>
    </form>
  );
}
