"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ActionFeedback } from "@/server/services/actionFeedback";
import { useEntryModalFeedback } from "@/components/EntryModal";
import { useActionToast } from "@/components/ActionToastProvider";

type ShortMutationFormProps = {
  endpoint: string;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  children: ReactNode;
};

type OrganizationUpdateResponse = {
  status: "success" | "error";
  feedback: ActionFeedback | null;
};

export function ShortMutationForm({ endpoint, submitLabel = "Save changes", pendingLabel = "Saving…", className = "", children }: ShortMutationFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const modalFeedback = useEntryModalFeedback();
  const { showActionToast } = useActionToast();

  const reportFeedback = (feedback: ActionFeedback) => {
    if (modalFeedback) {
      modalFeedback.reportFeedback(feedback);
      return;
    }
    showActionToast(feedback);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    setIsPending(true);
    try {
      const response = await fetch(endpoint, { method: "POST", body: new FormData(event.currentTarget), headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as OrganizationUpdateResponse | null;
      if (!payload?.feedback) throw new Error("ORGANIZATION_UPDATE_RESPONSE_INVALID");
      reportFeedback(payload.feedback);
      if (payload.status === "success") router.refresh();
    } catch {
      reportFeedback({ code: "ACTION_FAILED", title: "Action not completed", message: "The update could not be completed. Review the form and try again.", tone: "error" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className={`ogfi-form-shell mt-4 grid gap-3 ${className}`}>
        {children}
        <button className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70" disabled={isPending} type="submit">
          {isPending ? pendingLabel : submitLabel}
        </button>
      </form>
    </>
  );
}

// Kept as an alias while Organization Scope uses the original import name.
export const OrganizationEditForm = ShortMutationForm;
