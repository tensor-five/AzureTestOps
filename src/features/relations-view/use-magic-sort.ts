import * as React from "react";

import {
  planMagicSort,
  type MagicSortInput,
  type MagicSortLayout
} from "./magic-sort-layout.js";

const STEP_DELAY_MS = 120;

export type MagicSortController = {
  isRunning: boolean;
  status: string;
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
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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
  }, []);

  const start = React.useCallback(() => {
    if (isRunning) {
      return;
    }
    const plan = planMagicSort({ ...inputRef.current, ...captureGeometryRef.current?.() });
    const finalLayout = plan.steps.at(-1)!;
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (plan.steps.length === 1) {
      setStatus("Magic Sort completed the layout optimization.");
      return;
    }
    if (reduceMotion) {
      applyLayoutRef.current(finalLayout);
      setStatus("Magic Sort completed the layout optimization.");
      return;
    }

    setIsRunning(true);
    setStatus("Magic Sort is optimizing the layout.");
    let stepIndex = 1;
    const applyNext = () => {
      const step = plan.steps[stepIndex];
      if (!step) {
        setIsRunning(false);
        setStatus("Magic Sort completed the layout optimization.");
        return;
      }
      applyLayoutRef.current(step);
      const isLastLayout = stepIndex === plan.steps.length - 1;
      stepIndex += 1;
      setStatus(isLastLayout
        ? "Magic Sort is finalizing the layout optimization."
        : "Magic Sort accepted a layout improvement.");
      timerRef.current = setTimeout(applyNext, STEP_DELAY_MS);
    };
    timerRef.current = setTimeout(applyNext, STEP_DELAY_MS);
  }, [isRunning]);

  return { isRunning, status, start };
}
