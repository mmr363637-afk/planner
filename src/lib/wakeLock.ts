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

    /** آیا همین حالا قفلی «زنده» داریم؟ (sentinel می‌تواند released شده باشد) */
    const holding = () => sentinel.current != null && !sentinel.current.released;

    const acquire = async () => {
      try {
        const s = await nav.wakeLock!.request("screen");
        if (cancelled || holding()) {
          void s.release().catch(() => {});
          return;
        }
        // مرورگر خودش هم می‌تواند قفل را آزاد کند (مثلاً وقتی تب پنهان می‌شود)؛
        // با شنیدنِ همین رویداد، ref را پاک می‌کنیم تا دفعه‌ی بعد قفلِ تازه بگیریم.
        s.addEventListener?.("release", () => {
          if (sentinel.current === s) sentinel.current = null;
        });
        sentinel.current = s;
      } catch {
        /* مثلاً باتریِ کم یا سیاست مرورگر — بی‌صدا رد می‌شویم */
      }
    };
    void acquire();

    // 🐛→✅ قبلاً فقط «نبودِ sentinel» باعثِ گرفتنِ دوباره می‌شد؛ در حالی که مرورگر
    // با پنهان‌شدنِ تب قفل را آزاد می‌کند (released=true) و ref همچنان پُر می‌ماند.
    // نتیجه: بعد از برگشتن به اپ، صفحه وسطِ تایمرِ مطالعه خاموش می‌شد.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !holding()) void acquire();
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
