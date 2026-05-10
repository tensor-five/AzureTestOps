import * as React from "react";

import type { Set, SetDraft } from "../../domain/sets/set.js";
import type { AdoContextApi } from "../ado-context/use-ado-context.js";

import { AdoContextSetup } from "./ado-context-setup.js";
import { SetEditor } from "./set-editor.js";
import { SetManagerList } from "./set-manager-list.js";

export type SetManagerDialogProps = {
  isOpen: boolean;
  sets: Set[];
  activeSetId: string | null;
  adoContext: AdoContextApi;
  onClose(): void;
  onCreate(draft: SetDraft & { setActive?: boolean }): Promise<Set>;
  onUpdate(setId: string, patch: Partial<SetDraft>): Promise<Set>;
  onDelete(setId: string): Promise<void>;
  onSetActive(setId: string | null): Promise<void>;
};

type Mode =
  | { kind: "list" }
  | { kind: "edit"; setId: string | null }
  | { kind: "ado-context" };

/**
 * Modal shell for the Set-Manager. Owns only mode/visibility state — list,
 * editor and ADO-context bootstrap are split into sibling components, and
 * persistence flows through dedicated hooks.
 *
 * The bootstrap step renders when {@link useAdoContext} reports
 * `hasContext === false`; once the user fills in org/project the editor
 * mounts in the same dialog without a flicker.
 */
export function SetManagerDialog(props: SetManagerDialogProps): React.ReactElement | null {
  const { isOpen, sets, activeSetId } = props;
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });
  const { adoContext } = props;

  React.useEffect(() => {
    if (!isOpen) {
      setMode({ kind: "list" });
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="set-manager-backdrop" role="presentation" onClick={props.onClose}>
      <div
        className="set-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Manage sets"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="set-manager-header">
          <h2>Manage sets</h2>
          <button
            type="button"
            className="set-manager-close"
            onClick={props.onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {mode.kind === "list" ? (
          <SetManagerList
            sets={sets}
            activeSetId={activeSetId}
            adoContext={adoContext.context}
            onEditAdoContext={
              adoContext.hasContext ? () => setMode({ kind: "ado-context" }) : undefined
            }
            onCreate={() => setMode({ kind: "edit", setId: null })}
            onEdit={(setId) => setMode({ kind: "edit", setId })}
            onDelete={props.onDelete}
            onSetActive={props.onSetActive}
          />
        ) : mode.kind === "ado-context" ? (
          <AdoContextSetup
            initial={adoContext.context}
            onSaved={async (context) => {
              await adoContext.save(context);
              setMode({ kind: "list" });
            }}
            onCancel={() => setMode({ kind: "list" })}
          />
        ) : adoContext.isLoading ? (
          <p className="set-editor-help">Checking ADO context…</p>
        ) : !adoContext.hasContext ? (
          <AdoContextSetup
            onSaved={async (context) => {
              await adoContext.save(context);
            }}
            onCancel={() => setMode({ kind: "list" })}
          />
        ) : (
          <SetEditor
            existing={mode.setId ? sets.find((entry) => entry.id === mode.setId) ?? null : null}
            hasAdoContext={adoContext.hasContext}
            onCancel={() => setMode({ kind: "list" })}
            onSubmit={async (draft, setActive, setId) => {
              if (setId) {
                await props.onUpdate(setId, draft);
                if (setActive) {
                  await props.onSetActive(setId);
                }
              } else {
                await props.onCreate({ ...draft, setActive });
              }
              setMode({ kind: "list" });
            }}
          />
        )}
      </div>
    </div>
  );
}
