import * as React from "react";
import { countColorRuleMatches, moveColorRule, type ColorRule, type ColorRuleSubject } from "../../domain/color-coding/color-rule.js";
import { ColorRuleRow } from "./color-rule-row.js";

export function useColorRuleEditor(options: {
  label: string;
  scopeKey: string | null;
  rules: readonly ColorRule[];
  subjects: readonly ColorRuleSubject[];
  onChange(rules: ColorRule[]): void;
  showLabels?: boolean;
  onShowLabelsChange?(showLabels: boolean): void;
}): { action: React.ReactElement; panel: React.ReactNode } {
  const [expanded, setExpanded] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const panelId = React.useId();
  const counts = React.useMemo(() => countColorRuleMatches(options.subjects, options.rules), [options.subjects, options.rules]);
  React.useEffect(() => { setExpanded(false); setAnnouncement(""); }, [options.scopeKey]);
  const label = `Toggle ${options.label} color rules`;
  const moveRule = (index: number, direction: -1 | 1): void => {
    options.onChange(moveColorRule(options.rules, index, direction));
    setAnnouncement(`Color rule moved to position ${index + direction + 1}.`);
  };
  return {
    action: <button type="button" className={`filter-bar-toggle color-rule-toggle${expanded ? " filter-bar-toggle-active" : ""}`} aria-label={label} title={label} aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H17A4 4 0 0 0 21 11c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10.5" cy="6.8" r="1"/><circle cx="15" cy="7.4" r="1"/><circle cx="6.8" cy="14.5" r="1"/></svg>
    </button>,
    panel: expanded ? <div id={panelId} className="color-rule-panel" role="group" aria-label="Color rules">
      <span className="u-visually-hidden" role="status" aria-live="polite">{announcement}</span>
      {options.onShowLabelsChange && <label className="color-rule-label-toggle">
        <input type="checkbox" checked={options.showLabels !== false} onChange={event => options.onShowLabelsChange?.(event.target.checked)} />
        Show labels on bugs
      </label>}
      {options.rules.map((rule, index) => <ColorRuleRow key={rule.id} rule={rule} index={index}
        count={counts[index]!} canMoveUp={index > 0} canMoveDown={index < options.rules.length - 1}
        onMoveUp={() => moveRule(index, -1)}
        onMoveDown={() => moveRule(index, 1)}
        onChange={updated => options.onChange(options.rules.map(current => current.id === rule.id ? updated : current))}
        onDelete={() => options.onChange(options.rules.filter(current => current.id !== rule.id))} />)}
      <button type="button" className="color-rule-add" aria-label="Add color rule" onClick={() => options.onChange([...options.rules, { id: globalThis.crypto.randomUUID(), field: "title", comparison: "contains", value: "", color: "blue" }])}>+ Add color rule</button>
      {options.rules.length > 0 && <p className="color-rule-hint">First matching rule wins. Title comparisons ignore case.</p>}
    </div> : null
  };
}
