"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ActionFeedbackToast } from "@/components/ActionFeedbackToast";
import type { ActionFeedback } from "@/server/services/actionFeedback";

type ActionToastController = {
  showActionToast: (feedback: ActionFeedback) => void;
};

const ActionToastContext = createContext<ActionToastController>({
  showActionToast: () => undefined
});

export function ActionToastProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const value = useMemo<ActionToastController>(() => ({ showActionToast: setFeedback }), []);
  return (
    <ActionToastContext.Provider value={value}>
      {children}
      <ActionFeedbackToast feedback={feedback} />
    </ActionToastContext.Provider>
  );
}

export function useActionToast() {
  return useContext(ActionToastContext);
}
