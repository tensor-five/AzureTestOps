export type RelationsViewMode = "move-items" | "edit-relations";

export const DEFAULT_MODE: RelationsViewMode = "move-items";

export function nextMode(mode: RelationsViewMode): RelationsViewMode {
  return mode === "move-items" ? "edit-relations" : "move-items";
}

export function modeLabel(mode: RelationsViewMode): string {
  return mode === "move-items" ? "Move items" : "Edit relations";
}
