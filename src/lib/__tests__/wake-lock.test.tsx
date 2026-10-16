// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWakeLock, wakeLockSupported } from "../wakeLock";

// ===== 🐛 گزارشِ بازبینی: قفلِ بیداری بعد از برگشت به اپ از نو گرفته نمی‌شد =====
// مرورگر وقتی تب پنهان می‌شود خودش Wake Lock را آزاد می‌کند (sentinel.released=true)
// ولی ref همچنان پر می‌ماند؛ نتیجه: صفحه وسطِ تایمرِ مطالعه خاموش می‌شد.

type FakeSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", cb: () => void) => void;
  fire: () => void;
};

function installFakeWakeLock() {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    const listeners: (() => void)[] = [];
    const s: FakeSentinel = {
      released: false,
      release: async () => {
        s.released = true;
      },
      addEventListener: (_t, cb) => listeners.push(cb),
      fire: () => {
        s.released = true;
        listeners.forEach((cb) => cb());
      },
    };
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, sentinels };
}

function setVisible(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

describe("useWakeLock — قفلِ بیداریِ صفحه", () => {
  it("بدون پشتیبانی مرورگر، امن است و خطا نمی‌دهد", () => {
    expect(wakeLockSupported()).toBe(false);
    expect(() => renderHook(({ active }: { active: boolean }) => useWakeLock(active), { initialProps: { active: true } })).not.toThrow();
  });

  it("با فعال‌شدن، قفل را می‌گیرد و با خاموش‌شدن آزاد می‌کند", async () => {
    const { request, sentinels } = installFakeWakeLock();
    const { rerender } = renderHook(({ active }: { active: boolean }) => useWakeLock(active), { initialProps: { active: false } });
    expect(request).toHaveBeenCalledTimes(0);
    rerender({ active: true });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    rerender({ active: false });
    await vi.waitFor(() => expect(sentinels[0].released).toBe(true));
    // در حالت غیرفعال، برگشتن به تب قفلِ تازه نمی‌گیرد
    setVisible("visible");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("بعد از آزادشدنِ خودکارِ مرورگر (پنهان‌شدن تب) با برگشت به اپ قفل دوباره گرفته می‌شود", async () => {
    const { request, sentinels } = installFakeWakeLock();
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    // مرورگر با پنهان‌شدن تب قفل را آزاد می‌کند (رویداد release)
    setVisible("hidden");
    sentinels[0].fire();
    expect(sentinels[0].released).toBe(true);

    setVisible("visible");
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(sentinels[1].released).toBe(false);
  });

  it("اگر قفلِ زنده داریم، برگشتن به تب درخواستِ تکراری نمی‌فرستد", async () => {
    const { request } = installFakeWakeLock();
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    setVisible("hidden");
    setVisible("visible");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
