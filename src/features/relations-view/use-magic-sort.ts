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
};

export function useMagicSort(options: {
  input: MagicSortInput;
  applyLayout(layout: MagicSortLayout): void;
}): MagicSortController {
  const [isRunning, setIsRunning] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
  }, []);

  const start = React.useCallback(() => {
    if (isRunning) {
      return;
    }
    const plan = planMagicSort(options.input);
    const finalLayout = plan.steps.at(-1)!;
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || plan.steps.length === 1) {
      options.applyLayout(finalLayout);
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
      options.applyLayout(step);
      const isLastLayout = stepIndex === plan.steps.length - 1;
      stepIndex += 1;
      setStatus(isLastLayout
        ? "Magic Sort is finalizing the layout optimization."
        : "Magic Sort accepted a layout improvement.");
      timerRef.current = setTimeout(applyNext, STEP_DELAY_MS);
    };
    timerRef.current = setTimeout(applyNext, STEP_DELAY_MS);
  }, [isRunning, options]);

  return { isRunning, status, start };
}
