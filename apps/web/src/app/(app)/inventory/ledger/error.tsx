"use client";

export default function InventoryLedgerError({ reset }: { reset: () => void }) {
  return (
    <section
      className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-950"
      role="alert"
    >
      <h2 className="font-semibold">Inventory ledger could not be loaded.</h2>
      <p className="mt-1">
        No inventory records were changed. Try again, or contact support if the problem continues.
      </p>
      <button
        className="mt-4 min-h-11 rounded-lg border border-red-300 bg-white px-4 font-semibold text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        type="button"
        onClick={reset}
      >
        Try again
      </button>
    </section>
  );
}
