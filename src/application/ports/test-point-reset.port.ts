/** Resets one physical test point; no execution or result is created. */
export interface TestPointResetPort {
  resetToActive(planId: number, suiteId: number, pointId: number): Promise<void>;
}
