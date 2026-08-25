import * as React from "react";

export type WorkspaceToolbarProps = {
  refreshControl: React.ReactNode;
  loadedAt: string;
  testCaseCount: number;
  workItemCount: number;
  relationCount: number;
  unlinkedTestCaseCount: number;
  unlinkedWorkItemCount: number;
  focusedSuiteLabel?: string | null;
  onClearFocus?(): void;
  onMagicSort?(): void;
  isMagicSorting?: boolean;
  magicSortStatus?: string;
  mobileColumn: "test-cases" | "work-items";
  onMobileColumnChange(next: "test-cases" | "work-items"): void;
};

export function WorkspaceToolbar(props: WorkspaceToolbarProps): React.ReactElement {
  const testCaseButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const workItemButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const handleMobileSwitchKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      let next: "test-cases" | "work-items" | null = null;
      if (event.key === "ArrowLeft" || event.key === "Home") {
        next = "test-cases";
      } else if (event.key === "ArrowRight" || event.key === "End") {
        next = "work-items";
      }
      if (next === null) {
        return;
      }
      event.preventDefault();
      props.onMobileColumnChange(next);
      (next === "test-cases" ? testCaseButtonRef : workItemButtonRef).current?.focus();
    },
    [props.onMobileColumnChange]
  );

  return (
    <section className="relations-workspace-toolbar" aria-label="Relations workspace controls">
      <div className="relations-workspace-toolbar-primary">
        {props.refreshControl}
        <span className="relations-workspace-updated" title={formatFullTimestamp(props.loadedAt)}>
          Updated {formatRelativeTimestamp(props.loadedAt)}
        </span>
        {props.focusedSuiteLabel ? (
          <button
            type="button"
            className="relations-workspace-focus-chip"
            onClick={props.onClearFocus}
            aria-label={`Clear focused suite ${props.focusedSuiteLabel}`}
          >
            <span>Focused: {props.focusedSuiteLabel}</span>
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
        {props.onMagicSort ? (
          <>
            <button
              type="button"
              className="relations-workspace-magic-sort"
              aria-label="Magic Sort"
              onClick={props.onMagicSort}
              disabled={props.isMagicSorting}
            >
              <MagicWandIcon />
              <span>Magic Sort</span>
            </button>
            <span className="u-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
              {props.magicSortStatus ?? ""}
            </span>
          </>
        ) : null}
      </div>
      <div className="relations-workspace-summary" aria-label="Set summary">
        <span>{props.testCaseCount} test cases</span>
        <span>{props.workItemCount} work items</span>
        <span>{props.relationCount} relations</span>
        <span className={props.unlinkedTestCaseCount > 0 ? "relations-workspace-summary-attention" : ""}>
          {props.unlinkedTestCaseCount} tests unlinked
        </span>
        <span className={props.unlinkedWorkItemCount > 0 ? "relations-workspace-summary-attention" : ""}>
          {props.unlinkedWorkItemCount} items unlinked
        </span>
      </div>
      <div className="relations-mobile-tabs" role="group" aria-label="Visible relations column">
        <button
          ref={testCaseButtonRef}
          type="button"
          aria-pressed={props.mobileColumn === "test-cases"}
          className={props.mobileColumn === "test-cases" ? "relations-mobile-tab-active" : ""}
          onClick={() => props.onMobileColumnChange("test-cases")}
          onKeyDown={handleMobileSwitchKeyDown}
        >
          Test Cases
          <span>{props.testCaseCount}</span>
        </button>
        <button
          ref={workItemButtonRef}
          type="button"
          aria-pressed={props.mobileColumn === "work-items"}
          className={props.mobileColumn === "work-items" ? "relations-mobile-tab-active" : ""}
          onClick={() => props.onMobileColumnChange("work-items")}
          onKeyDown={handleMobileSwitchKeyDown}
        >
          Work Items
          <span>{props.workItemCount}</span>
        </button>
      </div>
    </section>
  );
}

function MagicWandIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m4 20 11-11 3 3L7 23H4v-3Z" />
      <path d="m15 4 .7 1.8L18 6.5l-2.3.7L15 9l-.7-1.8L12 6.5l2.3-.7L15 4Zm5 6 .45 1.05L22 11.5l-1.55.45L20 13l-.45-1.05L18 11.5l1.55-.45L20 10Z" />
    </svg>
  );
}

export function formatRelativeTimestamp(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "recently";
  }
  const elapsedSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (elapsedSeconds < 10) {
    return "just now";
  }
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }
  const minutes = Math.round(elapsedSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

function formatFullTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}
