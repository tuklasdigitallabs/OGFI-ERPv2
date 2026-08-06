"use client";

import { useFormStatus } from "react-dom";

export function PendingActionButton({
  label,
  pendingLabel,
  confirmation,
  tone = "primary",
  pendingOverride,
}: {
  label: string;
  pendingLabel: string;
  confirmation?: string;
  tone?: "primary" | "danger";
  pendingOverride?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingOverride ?? formPending;
  return (
    <button
      className={tone === "danger"
        ? "min-h-11 rounded-md bg-red-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
        : "min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"}
      disabled={pending}
      onClick={(event) => {
        if (confirmation && !window.confirm(confirmation)) event.preventDefault();
      }}
      type="submit"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
