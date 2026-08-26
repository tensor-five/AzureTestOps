import * as React from "react";

import {
  planMagicSort,
  type MagicSortInput,
  type MagicSortLayout
} from "./magic-sort-layout.js";

const STEP_DELAY_MS = 120;
const FEEDBACK_COMPLETE_MS = 650;

export type MagicSortFeedbackState = "idle" | "running" | "complete";

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
  applyLayout(layout: MagicSortLayout): void;
  captureGeometry?(): Pick<MagicSortInput, "measuredTestCaseSlotCenters" | "measuredWorkItemSlotCenters">;
}): MagicSortController {
  const [isRunning, setIsRunning] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const [feedbackState, setFeedbackState] = React.useState<MagicSortFeedbackState>("idle");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = React.useRef(options.input);
  const applyLayoutRef = React.useRef(options.applyLayout);
  const captureGeometryRef = React.useRef(options.captureGeometry);
  inputRef.current = options.input;
  applyLayoutRef.current = options.applyLayout;
  captureGeometryRef.current = options.captureGeometry;

  React.useEffect(() => () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
    }
  }, []);

  const start = React.useCallback(() => {
    if (isRunning) {
      return;
    }
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
    }
    setProgress(0);
    setFeedbackState("idle");
    const plan = planMagicSort({ ...inputRef.current, ...captureGeometryRef.current?.() });
    const initialLayout = plan.steps[0]!;
    const finalLayout = plan.steps.at(-1)!;
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (plan.steps.length === 1) {
      if (layoutDiffersFromInput(initialLayout, inputRef.current)) {
        applyLayoutRef.current(initialLayout);
      }
      setStatus("Magic Sort completed the layout optimization.");
      return;
    }
    if (reduceMotion) {
      applyLayoutRef.current(finalLayout);
      setStatus("Magic Sort completed the layout optimization.");
      return;
    }

    setIsRunning(true);
    setFeedbackState("running");
    if (layoutDiffersFromInput(initialLayout, inputRef.current)) {
      applyLayoutRef.current(initialLayout);
    }
    setStatus("Magic Sort is optimizing the layout.");
    let stepIndex = 1;
    const applyNext = () => {
      const step = plan.steps[stepIndex];
      if (!step) {
        setIsRunning(false);
        setProgress(100);
        setFeedbackState("complete");
        setStatus("Magic Sort completed the layout optimization.");
        feedbackTimerRef.current = setTimeout(() => {
          setProgress(0);
          setFeedbackState("idle");
        }, FEEDBACK_COMPLETE_MS);
        return;
      }
      applyLayoutRef.current(step);
      const isLastLayout = stepIndex === plan.steps.length - 1;
      setProgress(Math.round((stepIndex / (plan.steps.length - 1)) * 100));
      stepIndex += 1;
      setStatus(isLastLayout
        ? "Magic Sort is finalizing the layout optimization."
        : "Magic Sort accepted a layout improvement.");
      timerRef.current = setTimeout(applyNext, STEP_DELAY_MS);
    };
    timerRef.current = setTimeout(applyNext, STEP_DELAY_MS);
  }, [isRunning]);

  return { isRunning, status, progress, feedbackState, start };
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
