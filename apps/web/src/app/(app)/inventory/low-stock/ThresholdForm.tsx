"use client";

import { useActionState } from "react";
import { saveThresholdAction } from "./actions";

export function ThresholdForm({ locations, initial }: {
  locations: Array<{ id: string; name: string }>;
  initial?: { inventoryLocationId: string; itemCode: string; thresholdQuantity: string; active: boolean; version: number; baseUomCode: string } | undefined;
}) {
  const [state, action, pending] = useActionState(saveThresholdAction, {});
  const control = "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2";
  return <form action={action} className="grid max-w-xl gap-4">
    {state.error && <p role="alert" className="rounded-md bg-red-50 p-4 text-red-800">{state.error}</p>}
    <input type="hidden" name="expectedVersion" value={initial?.version ?? 0} />
    <label className="grid gap-2">Storage location
      {initial ? <><input type="hidden" name="inventoryLocationId" value={initial.inventoryLocationId} /><span>{locations.find(location => location.id === initial.inventoryLocationId)?.name ?? "Inactive storage location"}</span></>
        : <select name="inventoryLocationId" required className={control}><option value="">Select storage location</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select>}
    </label>
    <label className="grid gap-2">Item code<input name="itemCode" required maxLength={80} readOnly={Boolean(initial)} defaultValue={initial?.itemCode} className={control} /></label>
    <label className="grid gap-2">Alert threshold {initial ? `(${initial.baseUomCode})` : "in the item’s base unit of measure"}
      <input name="thresholdQuantity" required inputMode="decimal" pattern="[0-9]{1,12}(\.[0-9]{1,6})?" defaultValue={initial?.thresholdQuantity} className={control} />
    </label>
    <p className="text-sm text-slate-600">Alerts appear when recorded on-hand is at or below this quantity. Use the item’s base UOM, not purchase packs. No default threshold is assumed.</p>
    <label className="grid gap-2">Monitoring<select name="active" defaultValue={initial?.active === false ? "false" : "true"} className={control}><option value="true">Active</option><option value="false">Deactivated</option></select></label>
    <label className="grid gap-2">Reason for change<textarea name="reason" required minLength={3} maxLength={1000} rows={3} className={control} /></label>
    <button disabled={pending} className="min-h-11 rounded-md bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{pending ? "Saving…" : "Save threshold"}</button>
  </form>;
}
