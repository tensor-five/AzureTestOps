import * as React from "react";

import type { FacetOption } from "./facet-options.js";

export type FilterFacetKind =
  | "lastOutcomes"
  | "states"
  | "assignedTo"
  | "tags"
  | "workItemTypes";

export type FilterFacet = {
  kind: FilterFacetKind;
  label: string;
  options: readonly FacetOption[];
  selected: readonly string[];
};

export type FilterQuickAction = {
  id: string;
  label: string;
  pressed: boolean;
  /** False when the action is only a shortcut for an already-rendered facet. */
  showActiveChip?: boolean;
  onToggle(): void;
};

export type FilterBarProps = {
  ariaLabel: string;
  titleQuery: string;
  searchPlaceholder?: string;
  resultSummary?: string;
  facets: readonly FilterFacet[];
  quickActions?: readonly FilterQuickAction[];
  onTitleQueryChange(next: string): void;
  onToggleFacetValue(kind: FilterFacetKind, value: string): void;
  onReplaceFacetValues(kind: FilterFacetKind, values: readonly string[]): void;
  onClear(): void;
};

const FACET_LABELS: Record<FilterFacetKind, string> = {
  lastOutcomes: "Outcome",
  states: "State",
  assignedTo: "Assigned to",
  tags: "Tags",
  workItemTypes: "Type"
};

/** Compact search-first filtering with an optional expandable facet panel. */
export function FilterBar(props: FilterBarProps): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);
  const activeCount = countActive(props);
  const activeFacetValues = props.facets.flatMap((facet) =>
    facet.selected.map((value) => ({ kind: facet.kind, label: facet.label, value }))
  );
  const activeQuickActions = (props.quickActions ?? []).filter(
    (action) => action.pressed && action.showActiveChip !== false
  );

  return (
    <div className="filter-bar" aria-label={`${props.ariaLabel} filters`}>
      <div className="filter-bar-primary-row">
        <label className="filter-bar-search">
          <span className="filter-bar-search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <span className="u-visually-hidden">Search {props.ariaLabel}</span>
          <input
            type="search"
            className="filter-bar-title-input"
            value={props.titleQuery}
            onChange={(event) => props.onTitleQueryChange(event.currentTarget.value)}
            placeholder={props.searchPlaceholder ?? "Search titles…"}
            spellCheck={false}
            autoComplete="off"
          />
          {props.titleQuery.length > 0 ? (
            <button
              type="button"
              className="filter-bar-search-clear"
              aria-label={`Clear ${props.ariaLabel} search`}
              onClick={() => props.onTitleQueryChange("")}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </label>
        <button
          type="button"
          className={`filter-bar-toggle${expanded ? " filter-bar-toggle-active" : ""}`}
          aria-expanded={expanded}
          aria-label={`Toggle ${props.ariaLabel} filters`}
          onClick={() => setExpanded((current) => !current)}
        >
          <FilterIcon />
          {activeCount > 0 ? <span className="filter-bar-toggle-count">{activeCount}</span> : null}
        </button>
        {props.resultSummary ? (
          <span className="filter-bar-result-summary" role="status">
            {props.resultSummary}
          </span>
        ) : null}
      </div>

      {activeFacetValues.length > 0 || activeQuickActions.length > 0 ? (
        <div className="filter-bar-active-row" aria-label="Active filters">
          {activeQuickActions.map((action) => (
            <button
              type="button"
              className="filter-bar-active-chip"
              key={action.id}
              onClick={action.onToggle}
              aria-label={`Remove filter ${action.label}`}
            >
              <span>{action.label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {activeFacetValues.map((entry) => (
            <button
              type="button"
              className="filter-bar-active-chip"
              key={`${entry.kind}:${entry.value}`}
              onClick={() => props.onToggleFacetValue(entry.kind, entry.value)}
              aria-label={`Remove ${entry.label} filter ${entry.value}`}
            >
              <span>{entry.value}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="filter-bar-clear" onClick={props.onClear}>
            Clear all
          </button>
        </div>
      ) : null}

      {expanded ? (
        <div className="filter-bar-panel">
          {(props.quickActions?.length ?? 0) > 0 ? (
            <div className="filter-bar-quick-actions" aria-label="Quick filters">
              {props.quickActions?.map((action) => (
                <button
                  type="button"
                  className={`filter-bar-quick-action${action.pressed ? " filter-bar-quick-action-active" : ""}`}
                  aria-pressed={action.pressed}
                  key={action.id}
                  onClick={action.onToggle}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
          <ul className="filter-bar-facets">
            {props.facets.map((facet) => (
              <li key={facet.kind} className="filter-bar-facet-item">
                <FacetPopover
                  facet={facet}
                  onToggle={(value) => props.onToggleFacetValue(facet.kind, value)}
                  onReplace={(values) => props.onReplaceFacetValues(facet.kind, values)}
                />
              </li>
            ))}
          </ul>
          {activeCount > 0 ? (
            <button type="button" className="filter-bar-panel-clear" onClick={props.onClear}>
              Clear all filters
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FacetPopover(props: {
  facet: FilterFacet;
  onToggle(value: string): void;
  onReplace(values: readonly string[]): void;
}): React.ReactElement {
  const { facet } = props;
  const [search, setSearch] = React.useState("");
  const selectedSet = React.useMemo(() => new Set(facet.selected), [facet.selected]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleOptions = normalizedSearch.length === 0
    ? facet.options
    : facet.options.filter((option) => option.value.toLocaleLowerCase().includes(normalizedSearch));
  const allVisibleSelected = visibleOptions.length > 0 && visibleOptions.every((option) =>
    selectedSet.has(option.value)
  );
  const summaryLabel = facet.label || FACET_LABELS[facet.kind];

  const toggleVisible = (): void => {
    const next = new Set(facet.selected);
    visibleOptions.forEach((option) => {
      if (allVisibleSelected) {
        next.delete(option.value);
      } else {
        next.add(option.value);
      }
    });
    props.onReplace([...next]);
  };

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
          <>
            <div className="filter-bar-facet-search-row">
              <input
                type="search"
                className="filter-bar-facet-search"
                aria-label={`Search ${summaryLabel} filter values`}
                value={search}
                placeholder="Search values…"
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
              <button type="button" className="filter-bar-facet-bulk" onClick={toggleVisible}>
                {allVisibleSelected ? "Deselect visible" : "Select visible"}
              </button>
            </div>
            {visibleOptions.length === 0 ? (
              <p className="filter-bar-facet-empty">No matching values.</p>
            ) : (
              <ul className="filter-bar-facet-options">
                {visibleOptions.map((option) => {
                  const checked = selectedSet.has(option.value);
                  return (
                    <li key={option.value}>
                      <label className="filter-bar-facet-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => props.onToggle(option.value)}
                        />
                        <span className="filter-bar-facet-option-label">{option.value}</span>
                        <span className="filter-bar-facet-option-count">{option.count}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function SearchIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.7-3.7" />
    </svg>
  );
}

function FilterIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M4 5h16l-6.4 7.2v5.3l-3.2 1.5v-6.8L4 5Z" />
    </svg>
  );
}

function countActive(props: FilterBarProps): number {
  let count = props.titleQuery.trim().length > 0 ? 1 : 0;
  props.facets.forEach((facet) => {
    count += facet.selected.length;
  });
  count += (props.quickActions ?? []).filter(
    (action) => action.pressed && action.showActiveChip !== false
  ).length;
  return count;
}

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
