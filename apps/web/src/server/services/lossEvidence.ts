/** Reference coverage only. This does not qualify an uploaded artifact. */
export function assertRequiredLossEvidence(input: {
  required: boolean;
  evidenceReference?: string | null | undefined;
  lines: Array<{ evidenceReference?: string | null | undefined }>;
  errorCode: string;
}) {
  const headerCovered = Boolean(input.evidenceReference?.trim());
  const coveredLineCount = input.lines.filter(
    (line) => headerCovered || Boolean(line.evidenceReference?.trim()),
  ).length;
  if (input.required && (input.lines.length === 0 || coveredLineCount !== input.lines.length)) {
    throw new Error(input.errorCode);
  }
  return {
    required: input.required,
    coveredLineCount,
    lineCount: input.lines.length,
    assurance: "REFERENCE_PRESENCE_ONLY" as const,
  };
}

export function lossRepeatHistory(snapshot: unknown, lines: Array<{ itemId: string; description: string }>) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "Not evaluated";
  const history = (snapshot as Record<string, unknown>).repeatItemHistory;
  if (!Array.isArray(history)) return "Not evaluated";
  return history.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const { itemId, priorCount } = entry as Record<string, unknown>;
    if (typeof itemId !== "string" || typeof priorCount !== "number") return [];
    const label = lines.find(line => line.itemId === itemId)?.description || itemId;
    return [`${label} [${itemId}]: ${priorCount} prior lines`];
  }).join("; ") || "No prior lines";
}

export function lossEstimateAssurance(value: number) {
  return Number.isFinite(value) && value > 0
    ? "Unverified estimate — independent value review required"
    : "Value unknown — independent value review required";
}
