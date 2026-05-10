// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./local-ui.css", () => ({}));

const bootstrapUiClient = vi.fn();
vi.mock("./ui-client.js", () => ({
  bootstrapUiClient
}));

describe("local-ui-entry", () => {
  beforeEach(() => {
    bootstrapUiClient.mockClear();
    document.body.innerHTML = "";
    vi.resetModules();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts the bootstrap client into the #app container when present", async () => {
    const container = document.createElement("div");
    container.id = "app";
    document.body.appendChild(container);

    await import("./local-ui-entry.js");

    expect(bootstrapUiClient).toHaveBeenCalledTimes(1);
    expect(bootstrapUiClient).toHaveBeenCalledWith({ container });
  });

  it("throws when the #app container is missing so the failure is loud at boot time", async () => {
    document.body.innerHTML = "";

    await expect(import("./local-ui-entry.js")).rejects.toThrow(
      /Missing required #app container/
    );
    expect(bootstrapUiClient).not.toHaveBeenCalled();
  });
});
