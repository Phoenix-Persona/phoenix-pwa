import { describe, expect, it, spyOn } from "@/test/api";

import { verror, vlog, vwarn } from "./log";

describe("video logging", () => {
  it("does not write to the console by default", () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = spyOn(console, "error")
      .mockImplementation(() => undefined);

    vlog("pipeline", "prompt", { url: "https://example.com/secret.png" });
    vwarn("pipeline", "warning");
    verror("pipeline", "error");

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
