type SearchValue = string | string[] | undefined;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actorSelectionPattern = new RegExp(
  `^${uuidPattern.source.slice(1, -1)}\\|${uuidPattern.source.slice(1, -1)}$`,
  "i",
);

const first = (value: SearchValue) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export function inventoryPilotPendingSelectionParams(
  prefix: "actor" | "route",
  values: Record<string, string>,
  draftVersion: number,
) {
  return {
    selectionVersion: String(draftVersion),
    ...Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => value)
        .map(([key, value]) => [`${prefix}_${key}`, value]),
    ),
  };
}

export function parseInventoryPilotPendingSelections(
  params: Record<string, SearchValue>,
  keys: readonly string[],
  prefix: "actor" | "route",
  draftVersion: number,
) {
  if (first(params.selectionVersion) !== String(draftVersion)) return {};
  const pattern = prefix === "actor" ? actorSelectionPattern : uuidPattern;
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = first(params[`${prefix}_${key}`]);
      return pattern.test(value) ? [[key, value]] : [];
    }),
  );
}
