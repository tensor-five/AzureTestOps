import * as React from "react";

import type { Set } from "../../domain/sets/set.js";
import { ChevronIcon } from "../../shared/ui/chevron-icon.js";

export type SetDropdownProps = {
  sets: Set[];
  activeSetId: string | null;
  isLoading: boolean;
  onSelect(setId: string): void;
  onManageSets(): void;
};

/**
 * Header dropdown that lists configured Sets and lets the user switch the
 * active one. Mirrors the AzureGanttOps query dropdown behaviour: click to
 * open, click outside / press Escape to close, "Manage sets…" footer for
 * CRUD.
 */
export function SetDropdown(props: SetDropdownProps): React.ReactElement {
  const { sets, activeSetId, isLoading, onSelect, onManageSets } = props;
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handleDocumentClick = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const activeSet = sets.find((entry) => entry.id === activeSetId) ?? null;
  const triggerLabel = isLoading
    ? "Loading sets…"
    : activeSet
      ? activeSet.name
      : sets.length === 0
        ? "No sets configured"
        : "Select a set…";

  return (
    <div className="set-dropdown" ref={containerRef}>
      <button
        type="button"
        className="set-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        disabled={isLoading}
      >
        <span className="set-dropdown-trigger-label">{triggerLabel}</span>
        <span aria-hidden="true" className="set-dropdown-trigger-caret">
          <ChevronIcon direction={open ? "up" : "down"} />
        </span>
      </button>
      {open ? (
        <div className="set-dropdown-panel" role="listbox">
          {sets.length === 0 ? (
            <p className="set-dropdown-empty">
              No sets yet. Use “Manage sets…” to create your first one.
            </p>
          ) : (
            <ul className="set-dropdown-list">
              {sets.map((entry) => {
                const isActive = entry.id === activeSetId;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className={`set-dropdown-item${isActive ? " set-dropdown-item-active" : ""}`}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        onSelect(entry.id);
                        setOpen(false);
                      }}
                    >
                      <span className="set-dropdown-item-name">{entry.name}</span>
                      {entry.planName ? (
                        <span className="set-dropdown-item-meta">{entry.planName}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="set-dropdown-footer">
            <button
              type="button"
              className="set-dropdown-manage"
              onClick={() => {
                onManageSets();
                setOpen(false);
              }}
            >
              Manage sets…
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
