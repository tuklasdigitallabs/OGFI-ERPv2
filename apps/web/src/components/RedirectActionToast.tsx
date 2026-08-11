"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActionToast } from "@/components/ActionToastProvider";
import type { ActionFeedback } from "@/server/services/actionFeedback";

export function RedirectActionToast({
  feedback,
  cleanHref,
}: {
  feedback: ActionFeedback | null;
  cleanHref: string;
}) {
  const shown = useRef(false);
  const router = useRouter();
  const { showActionToast } = useActionToast();

  useEffect(() => {
    if (!feedback || shown.current) return;
    shown.current = true;
    showActionToast(feedback);
    router.replace(cleanHref, { scroll: false });
  }, [cleanHref, feedback, router, showActionToast]);

  return null;
}
