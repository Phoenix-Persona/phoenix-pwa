import { afterEach, describe, expect, it } from "vitest";

import { readDevEnv } from "./env";

describe("readDevEnv", () => {
  afterEach(() => {
    delete process.env.VITE_ZUKA_RUNTIME;
    delete process.env.VITE_PPQ_API_KEY;
  });

  it("returns undefined for dev-only pins in production runtime", () => {
    process.env.VITE_ZUKA_RUNTIME = "production";
    process.env.VITE_PPQ_API_KEY = "shared-prod-key";

    expect(readDevEnv("VITE_PPQ_API_KEY")).toBeUndefined();
  });

  it("returns env values outside production runtime", () => {
    process.env.VITE_ZUKA_RUNTIME = "development";
    process.env.VITE_PPQ_API_KEY = "dev-key";

    expect(readDevEnv("VITE_PPQ_API_KEY")).toBe("dev-key");
  });
});
