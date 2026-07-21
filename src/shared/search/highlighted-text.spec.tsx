// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { HighlightedText, findHighlightRanges } from "./highlighted-text.js";

describe("HighlightedText", () => {
  it("finds every case-insensitive match", () => {
    expect(findHighlightRanges("Login LOGIN flow", "login")).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 }
    ]);
  });

  it("renders matching text in mark elements", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<HighlightedText text="Release Login" query="login" />));

    expect(host.textContent).toBe("Release Login");
    expect(host.querySelector("mark")?.textContent).toBe("Login");

    act(() => root.unmount());
    host.remove();
  });
});
