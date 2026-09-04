// ===== Notifications & sound (Web APIs, best-effort) =====

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

export function notify(title: string, body?: string, tag?: string): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  const icon = new URL("icon.svg", document.baseURI).href;
  const opts: NotificationOptions = { body, tag, dir: "rtl", lang: "fa", icon };
  try {
    // Prefer service worker notifications when available (reliable on Android / installed PWA,
    // and they keep working while the app is in the background).
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if (reg.showNotification) return reg.showNotification(title, opts);
          throw new Error("service worker has no showNotification");
        })
        .catch(() => {
          try {
            new Notification(title, opts);
          } catch (e) {
            console.warn("notification failed", e);
          }
        });
      return true;
    }
    new Notification(title, opts);
    return true;
  } catch (e) {
    console.warn("notification failed", e);
    return false;
  }
}

let audioCtx: AudioContext | null = null;

export function beep(pattern: "end" | "break" = "end") {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const ctx = audioCtx;
    const notes = pattern === "end" ? [660, 880, 990] : [523, 659];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
    if (navigator.vibrate) navigator.vibrate(pattern === "end" ? [120, 60, 120] : [80]);
  } catch {
    /* ignore */
  }
}
