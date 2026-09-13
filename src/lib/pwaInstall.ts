// ===== نصب PWA — دکمه‌ی نصب + تشخیص وضعیت =====
// رویداد beforeinstallprompt فقط در کروم/اندروید می‌آید؛ در iOS باید دستی با
// «اشتراک‌گذاری ← افزودن به صفحه اصلی» نصب کرد. همه‌چیز best-effort است.
import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** آیا اپ هم‌اکنون به‌صورت نصب‌شده (standalone) اجراست؟ */
export function isPwaInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if ((window.navigator as { standalone?: boolean }).standalone === true) return true; // iOS قدیمی
    if (typeof document !== "undefined" && document.referrer.startsWith("android-app://")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** آیفون/آیپد — جایی که دکمه‌ی نصبِ خودکار نداریم و باید راهنمای دستی داد */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => isPwaInstalled());

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setDeferred(null);
      return outcome === "accepted";
    } catch {
      return false;
    }
  }, [deferred]);

  return { installed, canPrompt: deferred != null, promptInstall, isIos: isIosDevice() };
}
