export type KeyedPreferenceField = "setLayouts" | "setFilters";

export type KeyedPreferencePatch<T extends object> = {
  values: Record<string, T> | undefined;
  touchedIds: Set<string> | null;
};

/**
 * Retains sanitized keyed values and explicit `{}` deletion intents.
 * Invalid or newer unknown non-empty objects are ignored instead of being
 * reinterpreted as destructive tombstones.
 */
export function sanitizeKeyedPreferencePatch<T extends object>(
  rawPreferences: unknown,
  field: KeyedPreferenceField,
  sanitizedValues: Record<string, T> | undefined
): KeyedPreferencePatch<T> {
  if (!isPlainRecord(rawPreferences)) {
    return { values: sanitizedValues, touchedIds: null };
  }
  const rawScope = rawPreferences[field];
  if (!isPlainRecord(rawScope)) {
    return { values: sanitizedValues, touchedIds: null };
  }

  const values: Record<string, T> = {};
  const touchedIds = new Set<string>();
  for (const [rawId, rawValue] of Object.entries(rawScope)) {
    const scopeId = rawId.trim();
    if (scopeId.length === 0) {
      continue;
    }

    const sanitizedValue = sanitizedValues?.[scopeId];
    if (sanitizedValue !== undefined) {
      values[scopeId] = sanitizedValue;
      touchedIds.add(scopeId);
      continue;
    }

    if (isExplicitEmptyRecord(rawValue)) {
      values[scopeId] = {} as T;
      touchedIds.add(scopeId);
    }
  }

  return {
    values: Object.keys(values).length > 0 ? values : undefined,
    touchedIds
  };
}

function isExplicitEmptyRecord(value: unknown): boolean {
  return isPlainRecord(value) && Object.keys(value).length === 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
