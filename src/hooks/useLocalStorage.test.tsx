import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useLocalStorage } from "./useLocalStorage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("applies functional updates against the latest committed value", () => {
    const { result } = renderHook(() => useLocalStorage("counter", 0));

    act(() => {
      result.current[1]((previous) => previous + 1);
      result.current[1]((previous) => previous + 1);
    });

    expect(result.current[0]).toBe(2);
    expect(localStorage.getItem("counter")).toBe("2");
  });

  it("syncs matching storage events from another tab", () => {
    const { result } = renderHook(() => useLocalStorage("shared", 0));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "shared",
          newValue: "7",
        }),
      );
    });

    expect(result.current[0]).toBe(7);
  });
});
