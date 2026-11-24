export interface PreparationInputUpdate {
  key: string;
  value: string;
}

/**
 * Merges candidate input updates into the latest persisted values.
 *
 * The caller holds the preparation row lock while invoking this function, so
 * two concurrent requests are serialized. Each request still merges against
 * the values written by the previous request instead of replacing the whole
 * input object.
 */
export function mergePreparationInputUpdates(
  existing: Record<string, string>,
  allowedKeys: Iterable<string>,
  updates: PreparationInputUpdate[],
): Record<string, string> {
  const allowed = new Set(allowedKeys);
  const merged: Record<string, string> = { ...existing };
  for (const update of updates) {
    const key = update.key.trim();
    if (!key) continue;
    if (!allowed.has(key)) {
      throw new Error(`PREPARATION_INPUT_NOT_ALLOWED:${key}`);
    }
    merged[key] = update.value.trim();
  }
  return merged;
}
