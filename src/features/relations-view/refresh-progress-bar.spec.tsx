// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RefreshProgressBar } from "./refresh-progress-bar.js";

describe("RefreshProgressBar", () => {
  it("disappears after loading completes instead of leaving a Done state", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(
      <RefreshProgressBar
        progress={{ stage: "done", done: 1, total: 1 }}
        isLoading={false}
        error={null}
      />
    ));
    expect(host.querySelector(".refresh-progress")).toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});
