"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ActionFeedback } from "@/server/services/actionFeedback";

type ActionFeedbackToastProps = {
  feedback: ActionFeedback | null;
};

export function ActionFeedbackToast({ feedback }: ActionFeedbackToastProps) {
  const [isVisible, setIsVisible] = useState(Boolean(feedback));

  useEffect(() => {
    setIsVisible(Boolean(feedback));
    if (!feedback) return;
    const timeout = window.setTimeout(() => setIsVisible(false), 6_000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  if (!feedback || !isVisible) return null;

  const success = feedback.tone === "success";
  return (
    <div
      aria-live="polite"
      className={`fixed right-4 top-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-xl border p-4 shadow-xl ${success ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}
      role={success ? "status" : "alert"}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{feedback.title}</p>
          <p className="mt-1 text-sm leading-5">{feedback.message}</p>
        </div>
        <button aria-label="Dismiss notification" className="-m-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-black/5" onClick={() => setIsVisible(false)} type="button">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
