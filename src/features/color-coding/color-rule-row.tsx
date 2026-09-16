import * as React from "react";
import { COLOR_RULE_LABEL_MAX_LENGTH, isCustomColorRuleColor, type ColorRule, type ColorRuleMatchCount } from "../../domain/color-coding/color-rule.js";
import { COLOR_RULE_PALETTE, colorRuleColorLabel } from "../../shared/color-coding/color-rule-palette.js";
import { customColorRuleStyle } from "../../shared/color-coding/color-rule-style.js";

type ColorRuleRowProps = {
  rule: ColorRule;
  index: number;
  count: ColorRuleMatchCount;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp(): void;
  onMoveDown(): void;
  onChange(rule: ColorRule): void;
  onDelete(): void;
};

export function ColorRuleRow(props: ColorRuleRowProps): React.ReactElement {
  const { rule } = props;
  const customColor = isCustomColorRuleColor(rule.color);
  return <div className="color-rule-entry">
    <div className="color-rule-move-controls">
      <button type="button" aria-label={`Move color rule ${props.index + 1} up`} title="Move up" disabled={!props.canMoveUp} onClick={props.onMoveUp}>▲</button>
      <button type="button" aria-label={`Move color rule ${props.index + 1} down`} title="Move down" disabled={!props.canMoveDown} onClick={props.onMoveDown}>▼</button>
    </div>
    <div className="color-rule-row" role="group" aria-label={`Color rule ${props.index + 1}`}>
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
    <div className="color-rule-color-field">
      <div
        className="color-rule-preview"
        data-color-rule-preview=""
        data-color-rule-color={rule.color}
        style={customColorRuleStyle(rule.color)}
        role="img"
        aria-label={`Color preview: ${colorRuleColorLabel(rule.color)}`}
      >Aa</div>
      {customColor ? <>
        <input type="color" aria-label="Custom color" value={rule.color} onChange={event => {
          if (isCustomColorRuleColor(event.target.value)) props.onChange({ ...rule, color: event.target.value });
        }} />
        <span className="color-rule-hex">{rule.color.toUpperCase()}</span>
        <button type="button" aria-label="Choose preset color" title="Preset colors" onClick={() => props.onChange({ ...rule, color: "blue" })}>↩</button>
      </> : <>
        <button type="button" aria-label="Choose custom color" title="Custom color" onClick={() => props.onChange({ ...rule, color: "#2563eb" })}>＋</button>
        <select aria-label="Color" value={rule.color} onChange={event => props.onChange({ ...rule, color: event.target.value as ColorRule["color"] })}>
          {COLOR_RULE_PALETTE.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}
        </select>
      </>}
    </div>
    <button type="button" aria-label="Delete color rule" title="Delete color rule" className="color-rule-delete" onClick={props.onDelete}>×</button>
    </div>
    <div className="color-rule-entry-footer">
      <label className="color-rule-label-field">Label
        <input aria-label={`Rule label ${props.index + 1}`} value={rule.label ?? ""} maxLength={COLOR_RULE_LABEL_MAX_LENGTH}
          placeholder={rule.value.trim() || "Optional name"}
          onChange={event => props.onChange({ ...rule, label: event.target.value })} />
      </label>
      <span className="color-rule-match-count">{props.count.applied} colored / {props.count.matches} matches</span>
      {props.count.matches > props.count.applied && <span className="color-rule-overlap">
        {props.count.matches - props.count.applied} already colored by earlier rules
      </span>}
    </div>
  </div>;
}
