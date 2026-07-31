"use client";

import { useFormStatus } from "react-dom";

export function OpeningInventorySubmitButton({ label, className, disabled = false }: { label: string; className: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={disabled || pending}>{pending ? "Submitting controlled request…" : label}</button>;
}
