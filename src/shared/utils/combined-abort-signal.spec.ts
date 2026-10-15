import { expect, it } from 'vitest';
import { combinedAbortSignal } from './combined-abort-signal.js';

it('preserves missing and identical cancellation scopes', () => {
  const controller = new AbortController();
  expect(combinedAbortSignal()).toBeUndefined();
  expect(combinedAbortSignal(controller.signal)).toBe(controller.signal);
  expect(combinedAbortSignal(undefined, controller.signal)).toBe(controller.signal);
  expect(combinedAbortSignal(controller.signal, controller.signal)).toBe(controller.signal);
});
it.each([0, 1])('stops combined work when scope %s aborts without aborting the other scope', index => {
  const controllers = [new AbortController(), new AbortController()];
  const combined = combinedAbortSignal(controllers[0].signal, controllers[1].signal)!;
  controllers[index].abort();
  expect(combined.aborted).toBe(true);
  expect(controllers[1 - index].signal.aborted).toBe(false);
});
