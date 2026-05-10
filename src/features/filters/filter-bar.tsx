import * as React from "react";

export type FilterFacetKind =
  | "lastOutcomes"
  | "states"
  | "assignedTo"
  | "tags"
  | "workItemTypes";

export type FilterFacet = {
  kind: FilterFacetKind;
  label: string;
  options: readonly string[];
  selected: readonly string[];
};

export type FilterBarProps = {
  /** Heading shown above the title field — usually the column name. */
  ariaLabel: string;
  titleQuery: string;
  onTitleQueryChange(next: string): void;
  facets: readonly FilterFacet[];
  onToggleFacetValue(kind: FilterFacetKind, value: string): void;
  onClear(): void;
};

const FACET_LABELS: Record<FilterFacetKind, string> = {
  lastOutcomes: "Outcome",
  states: "State",
  assignedTo: "Assigned to",
  tags: "Tags",
  workItemTypes: "Type"
};

/**
 * Per-column filter UI. Title is a single text input; facets render as
 * `<details>` popovers so we don't need to track open/close state ourselves
 * and the keyboard / screen-reader semantics fall out of the platform.
 */
export function FilterBar(props: FilterBarProps): React.ReactElement {
  const activeCount = countActive(props);

  return (
    <div className="filter-bar" aria-label={`${props.ariaLabel} filters`}>
      <div className="filter-bar-row">
        <label className="filter-bar-title">
          <span className="filter-bar-title-label">Title</span>
          <input
            type="search"
            className="filter-bar-title-input"
            value={props.titleQuery}
            onChange={(event) => props.onTitleQueryChange(event.currentTarget.value)}
            placeholder="Search title…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        {activeCount > 0 ? (
          <button type="button" className="filter-bar-clear u-btn" onClick={props.onClear}>
            Clear ({activeCount})
          </button>
        ) : null}
      </div>
      <ul className="filter-bar-facets">
        {props.facets.map((facet) => (
          <li key={facet.kind} className="filter-bar-facet-item">
            <FacetPopover
              facet={facet}
              onToggle={(value) => props.onToggleFacetValue(facet.kind, value)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FacetPopover(props: {
  facet: FilterFacet;
  onToggle(value: string): void;
}): React.ReactElement {
  const { facet } = props;
  const selectedSet = React.useMemo(() => new Set(facet.selected), [facet.selected]);

  const summaryLabel = facet.label || FACET_LABELS[facet.kind];

  return (
    <details className="filter-bar-facet">
      <summary className="filter-bar-facet-summary">
        <span className="filter-bar-facet-label">{summaryLabel}</span>
        {facet.selected.length > 0 ? (
          <span className="filter-bar-facet-pill">{facet.selected.length}</span>
        ) : null}
      </summary>
      <div className="filter-bar-facet-panel" role="group" aria-label={summaryLabel}>
        {facet.options.length === 0 ? (
          <p className="filter-bar-facet-empty">No values to filter by.</p>
        ) : (
          <ul className="filter-bar-facet-options">
            {facet.options.map((option) => {
              const checked = selectedSet.has(option);
              return (
                <li key={option}>
                  <label className="filter-bar-facet-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => props.onToggle(option)}
                    />
                    <span>{option}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

function countActive(props: FilterBarProps): number {
  let count = props.titleQuery.trim().length > 0 ? 1 : 0;
  for (const facet of props.facets) {
    if (facet.selected.length > 0) {
      count += 1;
    }
  }
  return count;
}

/**
 * Pure helper: toggle one value in/out of a string list while keeping the
 * other selected values stable (first-seen order). Exported so the
 * relations-pane can use it without re-importing React state semantics.
 */
export function toggleStringList(
  current: readonly string[] | undefined,
  value: string
): string[] {
  const list = current ?? [];
  if (list.includes(value)) {
    return list.filter((entry) => entry !== value);
  }
  return [...list, value];
}
