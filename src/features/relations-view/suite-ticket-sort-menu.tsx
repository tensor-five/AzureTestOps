import * as React from "react";

import type { TestSuiteTicketSort } from "./test-suite-ticket-sorting.js";

const SORT_OPTIONS: readonly { value: TestSuiteTicketSort; label: string }[] = [
  { value: "outcome-ascending", label: "Outcome · Aufsteigend" },
  { value: "outcome-descending", label: "Outcome · Absteigend" },
  { value: "title-ascending", label: "Titel · Aufsteigend" },
  { value: "title-descending", label: "Titel · Absteigend" }
];

export function SuiteTicketSortMenu(props: {
  suiteName: string;
  isOpen: boolean;
  onToggle(): void;
  onSelect(sort: TestSuiteTicketSort): void;
}): React.ReactElement {
  const menuId = React.useId();

  return (
    <div className="relations-view-suite-sort">
      <button
        type="button"
        className="relations-view-suite-sort-trigger"
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={props.isOpen}
        aria-label={`Testfälle in Suite ${props.suiteName} einmalig sortieren`}
        title="Testfälle einmalig sortieren"
        onClick={props.onToggle}
      >
        ⇅
      </button>
      {props.isOpen ? (
        <div
          id={menuId}
          className="relations-view-suite-sort-menu"
          role="menu"
          aria-label={`Sortieroptionen für ${props.suiteName}`}
        >
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked="false"
              className="relations-view-suite-sort-option"
              onClick={() => props.onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
