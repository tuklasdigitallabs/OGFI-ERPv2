"use client";

export default function EvidenceRegisterError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-950"
      role="alert"
    >
      <p className="font-semibold">Controlled evidence could not be loaded.</p>
      <p className="mt-1">
        Try again. If the problem continues, contact support.
      </p>
      <button
        className="mt-4 min-h-10 rounded-lg border border-red-300 bg-white px-4 font-semibold text-red-800"
        type="button"
        onClick={reset}
      >
        Try again
      </button>
    </div>
  );
}
