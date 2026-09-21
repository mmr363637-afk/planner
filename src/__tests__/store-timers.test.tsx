// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { StoreProvider, useStore } from "../store";

describe("StoreProvider timer cleanup", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels a toast expiry callback when the provider unmounts", () => {
    const { result, unmount } = renderHook(useStore, { wrapper: StoreProvider });
    const timersBeforeToast = vi.getTimerCount();

    act(() => result.current.toast("پیام آزمایشی"));
    expect(vi.getTimerCount()).toBe(timersBeforeToast + 1);

    unmount();
    expect(vi.getTimerCount()).toBe(timersBeforeToast);
  });
});
