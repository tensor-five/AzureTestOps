import * as React from "react";
import type { ColorRule } from "../../domain/color-coding/color-rule.js";

export function ColorRuleRow(props: { rule: ColorRule; index: number; onChange(rule: ColorRule): void; onDelete(): void }): React.ReactElement {
  const { rule } = props;
  return <div className="color-rule-row" role="group" aria-label={`Color rule ${props.index + 1}`}>
    <select aria-label="Field" value={rule.field} onChange={event => {
      const field = event.target.value as ColorRule["field"];
      props.onChange({ ...rule, field, comparison: field === "title" ? "contains" : "equals" });
    }}>
      <option value="title">Title</option><option value="state">State</option><option value="tag">Tag</option>
    </select>
    <select aria-label="Comparison" value={rule.comparison} onChange={event => props.onChange({ ...rule, comparison: event.target.value as ColorRule["comparison"] })}>
      {rule.field === "title" && <><option value="contains">Contains</option><option value="notContains">Does not contain</option><option value="startsWith">Starts with</option></>}
      <option value="equals">Equals</option>
    </select>
    <input aria-label="Value" className="color-rule-value" value={rule.value} placeholder="Value" onChange={event => props.onChange({ ...rule, value: event.target.value })} />
    <select aria-label="Color" value={rule.color} onChange={event => props.onChange({ ...rule, color: event.target.value as ColorRule["color"] })}>
      <option value="blue">Blue</option><option value="orange">Orange</option><option value="green">Green</option><option value="violet">Violet</option>
    </select>
    <button type="button" aria-label="Delete color rule" title="Delete color rule" className="color-rule-delete" onClick={props.onDelete}>×</button>
  </div>;
}
