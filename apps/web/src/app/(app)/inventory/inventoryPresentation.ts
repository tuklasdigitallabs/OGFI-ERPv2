export const defaultInventoryTimeZone = "Asia/Manila";

export function resolveInventoryTimeZone(value: string | null | undefined) {
  const candidate = value?.trim() || defaultInventoryTimeZone;
  try {
    new Intl.DateTimeFormat("en-PH", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return defaultInventoryTimeZone;
  }
}

export function formatInventoryUpdatedDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: resolveInventoryTimeZone(timeZone),
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}
