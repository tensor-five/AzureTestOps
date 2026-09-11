import * as React from "react";
import type { ColorRule } from "../../domain/color-coding/color-rule.js";
import type { SetColorRules } from "../../shared/user-preferences/color-rule-preference.js";
import { colorRulePreferenceStore } from "./color-rule-preference-store.js";

const EMPTY_RULES: readonly ColorRule[] = Object.freeze([]);
export type SetColorRulesApi = {
  scopeKey: string | null;
  testCases: readonly ColorRule[];
  bugs: readonly ColorRule[];
  setRules(column: keyof SetColorRules, rules: ColorRule[]): void;
};

export function useSetColorRules(setId: string | null): SetColorRulesApi {
  const [state, setState] = React.useState(() => ({ setId, value: load(setId) }));
  const current = React.useRef(state);
  // A set switch must never briefly expose the previous set's rules or save into its scope.
  const scoped = state.setId === setId ? state : { setId, value: load(setId) };
  current.current = scoped;
  React.useEffect(() => {
    if (state.setId !== setId) setState({ setId, value: load(setId) });
  }, [setId, state.setId]);

  const setRules = React.useCallback((column: keyof SetColorRules, rules: ColorRule[]) => {
    if (!setId) return;
    const value = { ...current.current.value, [column]: rules };
    const next = { setId, value };
    current.current = next;
    setState(next);
    colorRulePreferenceStore.save(value, { scopeKey: setId });
  }, [setId]);

  return { scopeKey: setId, testCases: scoped.value.testCases ?? EMPTY_RULES, bugs: scoped.value.bugs ?? EMPTY_RULES, setRules };
}

function load(setId: string | null): SetColorRules {
  return setId ? colorRulePreferenceStore.load({ scopeKey: setId }) ?? {} : {};
}
