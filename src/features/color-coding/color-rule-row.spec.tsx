// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ColorRule } from "../../domain/color-coding/color-rule.js";
import { ColorRuleRow } from "./color-rule-row.js";

afterEach(cleanup);

const initialRule: ColorRule = { id: "login", field: "title", comparison: "contains", value: "Login", color: "blue" };

function StatefulRow(): React.ReactElement {
  const [rule, setRule] = React.useState(initialRule);
  return <ColorRuleRow rule={rule} index={0} onChange={setRule} onDelete={() => {}} />;
}

describe("color rule custom color editor", () => {
  it("chooses a custom color, previews it and returns to preset colors", () => {
    render(<StatefulRow />);
    expect((screen.getByRole("combobox", { name: "Color" }) as HTMLSelectElement).value).toBe("blue");
    fireEvent.click(screen.getByRole("button", { name: "Choose custom color" }));
    const picker = screen.getByLabelText("Custom color") as HTMLInputElement;
    expect(picker.value).toBe("#2563eb");
    fireEvent.change(picker, { target: { value: "#3a7fc2" } });
    const preview = screen.getByRole("img", { name: "Color preview: Custom #3A7FC2" });
    expect(preview.getAttribute("style")).toContain("--color-rule-applied: #3a7fc2");
    expect(screen.getByText("#3A7FC2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose preset color" }));
    expect((screen.getByRole("combobox", { name: "Color" }) as HTMLSelectElement).value).toBe("blue");
    expect(preview.style.getPropertyValue("--color-rule-applied")).toBe("");
  });
});
