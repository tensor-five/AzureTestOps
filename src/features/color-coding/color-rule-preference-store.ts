import { createUserPreferenceStore } from "../../shared/user-preferences/create-user-preference-store.js";
import { sanitizeSetColorRules, type SetColorRules } from "../../shared/user-preferences/color-rule-preference.js";

export const colorRulePreferenceStore = createUserPreferenceStore<SetColorRules>({
  storageKey: "azure-testops.color-rules.v1",
  readFromServerCache: (preferences, scopeKey) => scopeKey ? preferences.setColorRules?.[scopeKey] : null,
  sanitize: sanitizeSetColorRules,
  buildPatch: (value, _preferences, scopeKey) => scopeKey ? { setColorRules: { [scopeKey]: value } } : {}
});
