import * as React from "react";

import {
  planMagicSort,
  type MagicSortInput,
  type MagicSortLayout
} from "./magic-sort-layout.js";

const FEEDBACK_COMPLETE_MS = 650;

export type MagicSortFeedbackState = "idle" | "running" | "complete" | "confirmed";

export type MagicSortController = {
  isRunning: boolean;
  status: string;
  progress: number;
  feedbackState: MagicSortFeedbackState;
  start(): void;
  addSpacer?: boolean;
  setAddSpacer?(next: boolean): void;
};

export function useMagicSort(options: {
  input: MagicSortInput;
  contextKey?: string;
  applyLayout(layout: MagicSortLayout): void;
  captureGeometry?(): Pick<MagicSortInput, "measuredTestCaseSlotCenters" | "measuredWorkItemSlotCenters">;
}): MagicSortController {
  const [status, setStatus] = React.useState("");
  const [feedbackState, setFeedbackState] = React.useState<MagicSortFeedbackState>("idle");
  const feedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = React.useRef(options.input);
  const applyLayoutRef = React.useRef(options.applyLayout);
  const captureGeometryRef = React.useRef(options.captureGeometry);
  inputRef.current = options.input;
  applyLayoutRef.current = options.applyLayout;
  captureGeometryRef.current = options.captureGeometry;

  React.useEffect(() => () => {
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
    }
  }, []);

  const start = React.useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
    }
    setFeedbackState("idle");
    const startedInput = inputRef.current;
    const geometry = captureGeometryRef.current?.() ?? {};
    const plan = planMagicSort({ ...startedInput, ...geometry });
    const finalLayout = plan.steps.at(-1)!;
    if (layoutDiffersFromInput(finalLayout, startedInput)) {
      applyLayoutRef.current(finalLayout);
    }
    setStatus("Magic Sort completed the layout optimization.");
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) return;
    setFeedbackState("confirmed");
    feedbackTimerRef.current = setTimeout(() => setFeedbackState("idle"), FEEDBACK_COMPLETE_MS);
  }, []);

  // Compatibility fields remain inactive because planning and application are synchronous.
  return { isRunning: false, status, progress: 0, feedbackState, start };
}

function layoutDiffersFromInput(layout: MagicSortLayout, input: MagicSortInput): boolean {
  if (layout.workItemIds.some((id, index) => input.workItemIds[index] !== id)) {
    return true;
  }
  if (layout.suites.some((suite, index) => suite.testCaseIds.some(
    (id, testCaseIndex) => input.suites[index]?.testCaseIds[testCaseIndex] !== id
  ))) {
    return true;
  }
  return Object.entries(layout.workItemPositions ?? {}).some(([id, position]) =>
    input.workItemPositions?.[Number(id)] !== position
  );
}
