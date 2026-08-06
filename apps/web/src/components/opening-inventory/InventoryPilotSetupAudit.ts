const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const label = (value: string) => {
  const spaced = value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  const normalized = spaced === spaced.toUpperCase() ? spaced.toLowerCase() : spaced;
  return normalized.replace(/^./, (character) => character.toUpperCase());
};

function selectionRows(value: unknown, kind: "endpoint" | "item" | "actor" | "route") {
  if (!Array.isArray(value)) return new Map<string, string>();
  return new Map(value.flatMap((raw): Array<[string, string]> => {
    if (kind === "item") return typeof raw === "string" ? [[raw, `item ${raw}`]] : [];
    const row = record(raw);
    if (kind === "endpoint") {
      const capability = typeof row.capability === "string" ? row.capability : "";
      const endpointId = typeof row.inventoryLocationId === "string" ? row.inventoryLocationId : "";
      const locationId = typeof row.locationId === "string" ? row.locationId : "";
      return capability && endpointId ? [[`${capability}|${endpointId}`, `${label(capability)} at endpoint ${endpointId}${locationId ? ` / location ${locationId}` : ""}`]] : [];
    }
    if (kind === "actor") {
      const responsibility = typeof row.responsibility === "string" ? row.responsibility : "";
      const userId = typeof row.userId === "string" ? row.userId : "";
      const roleAssignmentId = typeof row.roleAssignmentId === "string" ? row.roleAssignmentId : "";
      return responsibility && userId && roleAssignmentId ? [[responsibility, `${label(responsibility)}: user ${userId} / role assignment ${roleAssignmentId}`]] : [];
    }
    const family = typeof row.family === "string" ? row.family : "";
    const ruleId = typeof row.approvalRuleId === "string" ? row.approvalRuleId : "";
    const version = typeof row.approvalRuleVersion === "number" ? row.approvalRuleVersion : null;
    return family && ruleId ? [[family, `${label(family)}: rule ${ruleId}${version === null ? "" : ` / version ${version}`}`]] : [];
  }));
}

export function inventoryPilotSelectionAuditChanges(beforeSelections: Record<string, unknown>, afterSelections: Record<string, unknown>) {
  const groups: Array<[string, "endpoint" | "item" | "actor" | "route", string]> = [
    ["Endpoint roles", "endpoint", "endpointMemberships"],
    ["Items", "item", "itemIds"],
    ["Named users", "actor", "participants"],
    ["Routes", "route", "routeReadiness"],
  ];
  const changes = groups.flatMap(([groupLabel, kind, key]) => {
    const before = selectionRows(beforeSelections[key], kind);
    const after = selectionRows(afterSelections[key], kind);
    const removed = [...before].filter(([entryKey]) => !after.has(entryKey)).map(([, description]) => `${groupLabel} removed: ${description}`);
    const added = [...after].filter(([entryKey]) => !before.has(entryKey)).map(([, description]) => `${groupLabel} added: ${description}`);
    const changed = [...after].flatMap(([entryKey, description]) => {
      const previous = before.get(entryKey);
      return previous && previous !== description ? [`${groupLabel} changed: ${previous} → ${description}`] : [];
    });
    return [...removed, ...added, ...changed];
  });
  const visible = changes.slice(0, 8);
  return [...visible, ...(changes.length > visible.length ? [`${changes.length - visible.length} more selection change(s) retained in the audit record`] : [])];
}
