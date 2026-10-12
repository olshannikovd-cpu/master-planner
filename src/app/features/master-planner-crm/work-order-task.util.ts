/** Keep the first occurrence and original ordering; task IDs remain opaque. */
export const normalizeWorkOrderTaskIds = (ids: readonly string[]): string[] => [
  ...new Set(ids.filter((id) => id.trim().length > 0)),
];
