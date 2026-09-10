import * as React from "react";

import {
  planMagicSort,
  type MagicSortInput,
  type MagicSortLayout
} from "./magic-sort-layout.js";
import { buildMagicSortDebugOutput } from "./magic-sort-debug-output.js";
import { workItemSlots } from "./magic-sort-metrics.js";

const STEP_DELAY_MS = 120;
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
  isDebugOpen: boolean;
  toggleDebug(): void;
  debugReport: string | null;
};

export function useMagicSort(options: {
  input: MagicSortInput;
  contextKey?: string;
  applyLayout(layout: MagicSortLayout): void;
  captureGeometry?(): Pick<MagicSortInput, "measuredTestCaseSlotCenters" | "measuredWorkItemSlotCenters">;
}): MagicSortController {
  const [isRunning, setIsRunning] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [progress, setProgress] = React.useState(0);
  const [feedbackState, setFeedbackState] = React.useState<MagicSortFeedbackState>("idle");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugRunRef = React.useRef(0);
  const [isDebugOpen, setIsDebugOpen] = React.useState(false);
  const [debugReport, setDebugReport] = React.useState<string | null>(null);
  const inputRef = React.useRef(options.input);
  const applyLayoutRef = React.useRef(options.applyLayout);
  const captureGeometryRef = React.useRef(options.captureGeometry);
  const runKey = magicSortRunKey(options.input, options.contextKey);
  const runKeyRef = React.useRef(runKey);
  runKeyRef.current = runKey;
  const observationTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunRef = React.useRef<{ key: string; lastInput: string; expected?: string } | null>(null);
  const layoutKey = layoutSignature(options.input);
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
    if (observationTimerRef.current !== null) clearTimeout(observationTimerRef.current);
  }, []);

  const cancel = React.useCallback(() => {
    if (activeRunRef.current) setStatus("Magic Sort stopped because the view changed.");
    activeRunRef.current = null;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
    if (observationTimerRef.current !== null) clearTimeout(observationTimerRef.current);
    setIsRunning(false);
    setProgress(0);
    setFeedbackState("idle");
    setDebugReport(null);
  }, []);
  React.useEffect(() => { cancel(); }, [runKey, cancel]);
  React.useEffect(() => {
    const run = activeRunRef.current;
    if (!run) return;
    if (layoutKey === run.expected) { run.lastInput = layoutKey; run.expected = undefined; }
    else if (layoutKey !== run.lastInput) cancel();
  }, [layoutKey, cancel]);
  React.useEffect(() => {
    const onResize = () => { cancel(); };
    globalThis.addEventListener?.("resize", onResize);
    return () => globalThis.removeEventListener?.("resize", onResize);
  }, [cancel]);

  const start = React.useCallback(() => {
    if (isRunning) {
      return;
    }
    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
    }
    setProgress(0);
    setFeedbackState("idle");
    const startedKey = runKeyRef.current;
    const startedInput = inputRef.current;
    const activeRun = { key: startedKey, lastInput: layoutSignature(startedInput), expected: undefined as string | undefined };
    activeRunRef.current = activeRun;
    const apply = (layout: MagicSortLayout) => {
      activeRun.expected = layoutSignature(layout);
      applyLayoutRef.current(layout);
    };
    const geometry = captureGeometryRef.current?.() ?? {};
    const plan = planMagicSort({ ...startedInput, ...geometry });
    const observe = () => {
      if (!isDebugOpen) return;
      if (observationTimerRef.current !== null) clearTimeout(observationTimerRef.current);
      observationTimerRef.current = setTimeout(() => {
        if (runKeyRef.current !== startedKey) return;
        setDebugReport(buildMagicSortDebugOutput(debugRunRef.current, startedInput, geometry, plan, { input: inputRef.current, geometry: captureGeometryRef.current?.() ?? {} }));
      }, 0);
    };
    if (isDebugOpen) {
      debugRunRef.current += 1;
      setDebugReport(buildMagicSortDebugOutput(debugRunRef.current, inputRef.current, geometry, plan));
    }
    const initialLayout = plan.steps[0]!;
    const finalLayout = plan.steps.at(-1)!;
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (plan.steps.length === 1) {
      if (layoutDiffersFromInput(initialLayout, inputRef.current)) {
        apply(initialLayout);
      }
      setStatus("Magic Sort completed the layout optimization.");
      observe();
      activeRunRef.current = null;
      if (!reduceMotion) {
        setFeedbackState("confirmed");
        feedbackTimerRef.current = setTimeout(() => {
          setProgress(0);
          setFeedbackState("idle");
        }, FEEDBACK_COMPLETE_MS);
      }
      return;
    }
    if (reduceMotion) {
      apply(finalLayout);
      observe();
      activeRunRef.current = null;
      setStatus("Magic Sort completed the layout optimization.");
      return;
    }

    setIsRunning(true);
    setFeedbackState("running");
    if (layoutDiffersFromInput(initialLayout, inputRef.current)) {
      apply(initialLayout);
    }
    setStatus("Magic Sort is optimizing the layout.");
    let stepIndex = 1;
    const applyNext = () => {
      if (activeRunRef.current !== activeRun || runKeyRef.current !== startedKey) { cancel(); return; }
      const step = plan.steps[stepIndex];
      if (!step) {
        setIsRunning(false);
        setProgress(100);
        setFeedbackState("complete");
        setStatus("Magic Sort completed the layout optimization.");
        observe();
        activeRunRef.current = null;
        feedbackTimerRef.current = setTimeout(() => {
          setProgress(0);
          setFeedbackState("idle");
        }, FEEDBACK_COMPLETE_MS);
        return;
      }
      apply(step);
      const isLastLayout = stepIndex === plan.steps.length - 1;
      setProgress(Math.round((stepIndex / (plan.steps.length - 1)) * 100));
      stepIndex += 1;
      setStatus(isLastLayout
        ? "Magic Sort is finalizing the layout optimization."
        : "Magic Sort accepted a layout improvement.");
      timerRef.current = setTimeout(applyNext, STEP_DELAY_MS);
    };
    timerRef.current = setTimeout(applyNext, STEP_DELAY_MS);
  }, [cancel, isDebugOpen, isRunning]);

  return { isRunning, status, progress, feedbackState, start, isDebugOpen, toggleDebug: () => setIsDebugOpen((value) => !value), debugReport };
}

/** Membership and view context change a run; its own reordering does not. */
function magicSortRunKey(input: MagicSortInput, contextKey?: string): string {
  return JSON.stringify([
    contextKey, input.addSpacer,
    [...input.workItemIds].sort((a, b) => a - b),
    input.suites.map(suite => [suite.suiteId, [...suite.testCaseIds].sort((a, b) => a - b)]),
    input.visibleRows?.map(row => [row.kind, row.suiteId]),
    input.workItems.map(item => [item.id, [...item.relatedTestCaseIds].sort((a, b) => a - b)]).sort((a, b) => Number(a[0]) - Number(b[0]))
  ]);
}

function layoutSignature(layout: MagicSortLayout): string {
  return JSON.stringify([layout.suites.map(suite => [suite.suiteId, suite.testCaseIds]), layout.workItemIds, workItemSlots(layout)]);
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
