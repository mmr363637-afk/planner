// ===== Wake Lock: بیدار نگه‌داشتن صفحه هنگام تایمر مطالعه =====
import { useEffect, useRef } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
}

interface NavigatorWithWakeLock {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
}

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as unknown as NavigatorWithWakeLock).wakeLock;
}

/**
 * تا وقتی active است، صفحه خاموش/قفل نمی‌شود (مثلاً حین تایمر پومودورو).
 * روی مرورگرهای بدون پشتیبانی یا در حالت بی‌صدا-شکست (silent fail) هیچ خطایی نمی‌دهد.
 * وقتی تب دوباره دیده می‌شود، قفل را از نو می‌گیرد.
 */
export function useWakeLock(active: boolean): void {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    const nav = navigator as unknown as NavigatorWithWakeLock;
    if (!active || !nav.wakeLock) return;
    let cancelled = false;

    const acquire = async () => {
      try {
        const s = await nav.wakeLock!.request("screen");
        if (cancelled) {
          void s.release().catch(() => {});
          return;
        }
        sentinel.current = s;
      } catch {
        /* مثلاً باتریِ کم یا سیاست مرورگر — بی‌صدا رد می‌شویم */
      }
    };
    void acquire();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !sentinel.current) void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      const s = sentinel.current;
      sentinel.current = null;
      if (s && !s.released) void s.release().catch(() => {});
    };
  }, [active]);
}
