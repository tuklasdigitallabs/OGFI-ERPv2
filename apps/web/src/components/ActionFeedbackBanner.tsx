import type { ActionFeedback } from "@/server/services/actionFeedback";

type ActionFeedbackBannerProps = {
  feedback: ActionFeedback | null;
};

export function ActionFeedbackBanner({ feedback }: ActionFeedbackBannerProps) {
  if (!feedback) {
    return null;
  }

  return (
    <div
      className={feedback.tone === "success" ? "mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" : "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"}
      role={feedback.tone === "success" ? "status" : "alert"}
    >
      <p className="font-bold">{feedback.title}</p>
      <p className="mt-1">{feedback.message}</p>
      <p className={feedback.tone === "success" ? "mt-2 text-xs font-semibold uppercase text-emerald-700" : "mt-2 text-xs font-semibold uppercase text-amber-700"}>
        {feedback.code}
      </p>
    </div>
  );
}
