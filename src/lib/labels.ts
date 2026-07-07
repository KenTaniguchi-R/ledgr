// Centralized display labels for category names that may be null or unresolved.
//
// Two distinct fallbacks, kept separate on purpose:
//   UNCATEGORIZED    — a transaction/row has no category assigned (categoryId is
//                      null). An expected, normal state.
//   UNKNOWN_CATEGORY — a category id failed to resolve to a name (e.g. a stale
//                      join). Should be rare given the FK; a defensive fallback.

export const UNCATEGORIZED = "Uncategorized";
export const UNKNOWN_CATEGORY = "Unknown";

/** Label a category name that is null when no category is assigned. */
export function categoryLabel(name: string | null | undefined): string {
  return name ?? UNCATEGORIZED;
}

/** Label a category name resolved from an id lookup that may miss. */
export function resolvedCategoryLabel(name: string | null | undefined): string {
  return name ?? UNKNOWN_CATEGORY;
}
