"use client";

import { useActionState, type ReactNode } from "react";
import { UrlOwnedTaskSheet } from "@/components/UrlOwnedTaskSheet";

export type UrlOwnedActionState = {
  feedback: {
    code?: string;
    message: string;
    title: string;
    tone?: "error" | "success";
  } | null;
  status: "idle" | "error" | "success";
};

type UrlOwnedActionTaskSheetProps = {
  action: (
    previousState: UrlOwnedActionState,
    formData: FormData
  ) => Promise<UrlOwnedActionState>;
  title: string;
  description: ReactNode;
  returnHref: string;
  focusTargetId: string;
  successFocusTargetId?: string;
  formId: string;
  formClassName?: string;
  formChildren: ReactNode;
  beforeForm?: ReactNode;
  size?: "default" | "workspace";
  submitLabel: string;
  submitDisabled?: boolean;
  cancelLabel?: string;
  draftStorageKey?: string;
  pendingSubmitLabel?: string;
  pendingLiveMessage?: string;
  preserveSelectionParams?: Array<{ selectName: string; paramName: string }>;
};

const initialState: UrlOwnedActionState = {
  feedback: null,
  status: "idle"
};

export function UrlOwnedActionTaskSheet({
  action,
  title,
  description,
  returnHref,
  focusTargetId,
  successFocusTargetId,
  formId,
  formClassName,
  formChildren,
  beforeForm,
  size,
  submitLabel,
  submitDisabled,
  cancelLabel,
  draftStorageKey,
  pendingSubmitLabel,
  pendingLiveMessage,
  preserveSelectionParams
}: UrlOwnedActionTaskSheetProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <UrlOwnedTaskSheet
      actionFeedback={state.feedback}
      cancelLabel={state.status === "success" ? "Return to catalog" : cancelLabel}
      description={description}
      draftStorageKey={draftStorageKey}
      focusTargetId={focusTargetId}
      successFocusTargetId={successFocusTargetId}
      pending={pending}
      pendingLiveMessage={pendingLiveMessage}
      pendingSubmitLabel={pendingSubmitLabel}
      preserveSelectionParams={preserveSelectionParams}
      returnHref={returnHref}
      size={size}
      submitDisabled={submitDisabled || state.status === "success"}
      submitFormId={formId}
      submitLabel={submitLabel}
      title={title}
    >
      {beforeForm}
      <form action={formAction} className={formClassName} id={formId}>
        {formChildren}
      </form>
    </UrlOwnedTaskSheet>
  );
}
