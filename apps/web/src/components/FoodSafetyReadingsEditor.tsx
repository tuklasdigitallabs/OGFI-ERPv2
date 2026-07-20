"use client";

import { useMemo, useState } from "react";
import { FOOD_SAFETY_MAX_READINGS } from "@/lib/workflowLimits";

type FoodSafetyReadingsEditorProps = {
  action: (formData: FormData) => void | Promise<void>;
  logTypeOptions: readonly string[];
  resultOptions: readonly string[];
  severityOptions: readonly string[];
  formId: string;
  logId?: string;
  initialReadings?: readonly FoodSafetyReading[];
};

type FoodSafetyReading = {
  id: string;
  lineNo: number;
  station: string;
  readingType: string;
  readingValue: string | number | null;
  readingUom: string | null;
  expectedMinValue: string | number | null;
  expectedMaxValue: string | number | null;
  result: string;
  severity: string;
  correctiveAction: string | null;
  evidenceReference: string | null;
};

type DraftReading = {
  key: number;
  station: string;
  readingType: string;
  readingValue: string;
  readingUom: string;
  expectedMinValue: string;
  expectedMaxValue: string;
  result: string;
  severity: string;
  correctiveAction: string;
  evidenceReference: string;
};

function emptyReading(key: number): DraftReading {
  return {
    key,
    station: "",
    readingType: "",
    readingValue: "",
    readingUom: "",
    expectedMinValue: "",
    expectedMaxValue: "",
    result: "PASS",
    severity: "NORMAL",
    correctiveAction: "",
    evidenceReference: ""
  };
}

function initialReading(reading: FoodSafetyReading): DraftReading {
  return {
    key: reading.lineNo,
    station: reading.station,
    readingType: reading.readingType,
    readingValue: reading.readingValue === null ? "" : String(reading.readingValue),
    readingUom: reading.readingUom ?? "",
    expectedMinValue: reading.expectedMinValue === null ? "" : String(reading.expectedMinValue),
    expectedMaxValue: reading.expectedMaxValue === null ? "" : String(reading.expectedMaxValue),
    result: reading.result,
    severity: reading.severity,
    correctiveAction: reading.correctiveAction ?? "",
    evidenceReference: reading.evidenceReference ?? ""
  };
}

export function FoodSafetyReadingsEditor({
  action,
  logTypeOptions,
  resultOptions,
  severityOptions,
  formId,
  logId,
  initialReadings
}: FoodSafetyReadingsEditorProps) {
  const isCorrection = Boolean(logId && initialReadings);
  const [readings, setReadings] = useState<DraftReading[]>(
    () => initialReadings?.map(initialReading) ?? [emptyReading(1)]
  );
  const [selectedKey, setSelectedKey] = useState(() => initialReadings?.[0]?.lineNo ?? 1);
  const [errors, setErrors] = useState<number[]>([]);
  const selectedIndex = Math.max(0, readings.findIndex((reading) => reading.key === selectedKey));
  const selected = readings[selectedIndex] ?? readings[0]!;
  const canAddReading = !isCorrection && readings.length < FOOD_SAFETY_MAX_READINGS;
  const incomplete = useMemo(
    () => readings.flatMap((reading, index) =>
      reading.station.trim() && reading.readingType.trim() ? [] : [index]
    ),
    [readings]
  );

  function update(field: keyof Omit<DraftReading, "key">, value: string) {
    setReadings((current) => current.map((reading) =>
      reading.key === selected.key ? { ...reading, [field]: value } : reading
    ));
  }

  function addReading() {
    if (!canAddReading) return;
    const key = Math.max(...readings.map((reading) => reading.key)) + 1;
    setReadings((current) => [...current, emptyReading(key)]);
    setSelectedKey(key);
  }

  function removeReading() {
    if (isCorrection || readings.length === 1) return;
    const next = readings.filter((reading) => reading.key !== selected.key);
    setReadings(next);
    setSelectedKey(next[Math.min(selectedIndex, next.length - 1)]!.key);
  }

  function selectOffset(offset: number) {
    setSelectedKey(readings[Math.min(readings.length - 1, Math.max(0, selectedIndex + offset))]!.key);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    const firstIncomplete = incomplete[0];
    if (firstIncomplete === undefined) return;
    event.preventDefault();
    setErrors(incomplete);
    setSelectedKey(readings[firstIncomplete]!.key);
  }

  const input = "min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950";
  const readingFields: Array<keyof Omit<DraftReading, "key">> = [
    "station",
    "readingType",
    "readingValue",
    "readingUom",
    "expectedMinValue",
    "expectedMaxValue",
    "result",
    "severity",
    "correctiveAction",
    "evidenceReference"
  ];

  return (
    <form action={action} className="flex h-full min-h-0 flex-col" id={formId} onSubmit={submit}>
      {logId ? <input name="logId" type="hidden" value={logId} /> : null}
      {readingFields.flatMap((field) => readings.map((reading, index) => (
        <input
          key={`${field}-${reading.key}`}
          name={`reading.${index + 1}.${field}`}
          type="hidden"
          value={reading[field]}
          readOnly
        />
      )))}

      {!isCorrection ? (
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">Business date<input className={input} name="businessDate" type="date" required /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Log type<select className={input} name="logType">{logTypeOptions.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Title<input className={input} name="title" placeholder="Opening temperature log" required /></label>
        </div>
      ) : null}

      {isCorrection ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Correct the returned readings, then resubmit for compliance review. Readings cannot be added or removed during correction, and the earlier history remains with this log.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
        <aside className="min-h-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Readings</h3>
              <p className="text-xs font-semibold text-slate-500">{readings.length} / {FOOD_SAFETY_MAX_READINGS}{errors.length ? ` / ${errors.length} need attention` : ""}</p>
            </div>
            {!isCorrection ? <button className="inline-flex min-h-10 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400" disabled={!canAddReading} onClick={addReading} type="button">Add reading</button> : null}
          </div>
          <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto lg:h-[calc(100%-4.5rem)] lg:max-h-none">
            {readings.map((reading, index) => {
              const invalid = errors.includes(index);
              return (
                <button key={reading.key} type="button" onClick={() => setSelectedKey(reading.key)} className={`grid min-h-14 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 text-left ${reading.key === selected.key ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <span className="text-sm font-bold text-slate-500">{index + 1}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-950">{reading.station || "Station required"}</span><span className="block truncate text-xs text-slate-500">{reading.readingType || "Reading type required"}</span></span>
                  <span className={invalid ? "text-xs font-bold text-rose-700" : "text-xs font-bold text-slate-500"}>{invalid ? "Needs info" : reading.result.toLowerCase()}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-xs font-bold uppercase text-slate-500">Editing reading {selectedIndex + 1} of {readings.length}</p><h3 className="truncate text-lg font-bold text-slate-950">{selected.station || "Food-safety reading"}</h3></div>
            <div className="flex gap-2"><button className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:text-slate-400" disabled={selectedIndex === 0} onClick={() => selectOffset(-1)} type="button">Previous</button><button className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:text-slate-400" disabled={selectedIndex === readings.length - 1} onClick={() => selectOffset(1)} type="button">Next</button></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">Station<input aria-label={`Reading ${selectedIndex + 1} station`} className={input} onChange={(event) => update("station", event.target.value)} placeholder="Chiller 1" value={selected.station} /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-1 xl:col-span-2">Reading type<input aria-label={`Reading ${selectedIndex + 1} type`} className={input} onChange={(event) => update("readingType", event.target.value)} placeholder="Temperature" value={selected.readingType} /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Value<input aria-label={`Reading ${selectedIndex + 1} value`} className={input} onChange={(event) => update("readingValue", event.target.value)} placeholder="3.5" value={selected.readingValue} /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">UOM<input aria-label={`Reading ${selectedIndex + 1} unit`} className={input} onChange={(event) => update("readingUom", event.target.value)} placeholder="C" value={selected.readingUom} /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Result<select aria-label={`Reading ${selectedIndex + 1} result`} className={input} onChange={(event) => update("result", event.target.value)} value={selected.result}>{resultOptions.map((result) => <option key={result} value={result}>{result.replaceAll("_", " ")}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Minimum<input aria-label={`Reading ${selectedIndex + 1} minimum expected value`} className={input} onChange={(event) => update("expectedMinValue", event.target.value)} placeholder="0" value={selected.expectedMinValue} /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Maximum<input aria-label={`Reading ${selectedIndex + 1} maximum expected value`} className={input} onChange={(event) => update("expectedMaxValue", event.target.value)} placeholder="5" value={selected.expectedMaxValue} /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Severity<select aria-label={`Reading ${selectedIndex + 1} severity`} className={input} onChange={(event) => update("severity", event.target.value)} value={selected.severity}>{severityOptions.map((severity) => <option key={severity} value={severity}>{severity.toLowerCase()}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3">Corrective action<input aria-label={`Reading ${selectedIndex + 1} corrective action`} className={input} onChange={(event) => update("correctiveAction", event.target.value)} placeholder="Corrective action" value={selected.correctiveAction} /></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3">Evidence reference<input aria-label={`Reading ${selectedIndex + 1} evidence reference`} className={input} onChange={(event) => update("evidenceReference", event.target.value)} placeholder="Photo or file reference" value={selected.evidenceReference} /></label>
          </div>
          {!isCorrection && readings.length > 1 ? <div className="mt-5 border-t border-slate-200 pt-4"><button className="inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={removeReading} type="button">Remove selected reading</button></div> : null}
          {isCorrection ? <div className="mt-5 grid gap-4 border-t border-slate-200 pt-4"><label className="grid gap-1 text-sm font-medium text-slate-700">Correction reason<textarea className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950" maxLength={1000} name="correctionReason" placeholder="Summarize the corrected reading, action, or evidence changes." required /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Evidence reference<input className={input} maxLength={255} name="evidenceReference" placeholder="Optional correction evidence reference" /></label></div> : null}
        </section>
      </div>
    </form>
  );
}
