/**
 * Domain-side projection of an Azure DevOps Work Item. Stripped down to the
 * fields the Test Cases ↔ Bugs view actually needs — keeps the domain
 * Azure-agnostic while leaving room for additional fields in later phases.
 */
export type WorkItem = {
  id: number;
  workItemType: string;
  title: string;
  state: string;
  assignedTo: string | null;
  tags: string[];
  areaPath: string | null;
  priority: number | null;
  /** Related work item ids (`System.LinkTypes.Related`). */
  relatedIds: number[];
};
