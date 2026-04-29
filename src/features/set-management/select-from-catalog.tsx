import * as React from "react";

export type SelectOption = { value: string; label: string; meta?: string };

export type SelectFromCatalogProps = {
  label: string;
  loading: boolean;
  disabled?: boolean;
  options: SelectOption[];
  value: string;
  onSelect(value: string, option: SelectOption | null): void;
  requiredText: string;
};

/**
 * Required-`<select>` populated from a remote catalog. Renders a disabled
 * placeholder option while loading and surfaces the matched {@link SelectOption}
 * on every change so callers can capture both the id and the human label.
 */
export function SelectFromCatalog(props: SelectFromCatalogProps): React.ReactElement {
  return (
    <label className="set-editor-field">
      <span>{props.label}</span>
      <select
        value={props.value}
        disabled={props.disabled || props.loading}
        required
        onChange={(event) => {
          const next = event.currentTarget.value;
          const option = props.options.find((entry) => entry.value === next) ?? null;
          props.onSelect(next, option);
        }}
      >
        <option value="" disabled>
          {props.loading ? "Loading…" : props.requiredText}
        </option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.meta ? ` — ${option.meta}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
