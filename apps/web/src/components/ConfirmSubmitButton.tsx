"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  label,
  confirmation
}: {
  label: string;
  confirmation: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex min-h-10 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      {pending ? "Removing..." : label}
    </button>
  );
}
