import * as React from "react";

import type { Set } from "../../domain/sets/set.js";

export type SetManagerListProps = {
  sets: Set[];
  activeSetId: string | null;
  onCreate(): void;
  onEdit(setId: string): void;
  onDelete(setId: string): Promise<void>;
  onSetActive(setId: string | null): Promise<void>;
  /**
   * Confirmation hook — defaults to `window.confirm`, overridable so tests
   * (and future themed confirmation toasts) can replace the host dialog
   * without touching the component.
   */
  confirmDelete?(message: string): boolean;
};

/**
 * Read-side of the Set-Manager: lists existing sets with active toggle, edit
 * and delete actions, plus a "New set" affordance that hands off to the
 * editor. No persistence calls in here — the orchestrator wires them up.
 */
export function SetManagerList(props: SetManagerListProps): React.ReactElement {
  const { sets, activeSetId } = props;
  const confirmDelete =
    props.confirmDelete ??
    ((message: string) => (typeof confirm === "function" ? confirm(message) : true));

  return (
    <div className="set-manager-list">
      {sets.length === 0 ? (
        <p className="set-manager-empty">No sets yet — create your first one to start.</p>
      ) : (
        <ul>
          {sets.map((entry) => {
            const isActive = entry.id === activeSetId;
            return (
              <li key={entry.id} className="set-manager-row">
                <div className="set-manager-row-main">
                  <strong>{entry.name}</strong>
                  <span className="set-manager-row-meta">
                    {entry.planName ?? `Plan ${entry.planId}`} ·{" "}
                    {entry.queryName ?? "Saved query"}
                  </span>
                </div>
                <div className="set-manager-row-actions">
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => props.onSetActive(isActive ? null : entry.id)}
                  >
                    {isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button type="button" className="u-btn" onClick={() => props.onEdit(entry.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => {
                      if (confirmDelete(`Delete set "${entry.name}"?`)) {
                        void props.onDelete(entry.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <footer className="set-manager-list-footer">
        <button type="button" className="u-btn u-btn-primary" onClick={props.onCreate}>
          New set
        </button>
      </footer>
    </div>
  );
}
