// ===== Media Session API: کنترل صداها از صفحه‌ی قفل/نوتیفیکیشن =====
// با این، پخشِ صداهای تمرکز مثل یک پلیر موسیقی در سیستم‌عامل دیده می‌شود و
// کاربر می‌تواند بدون بازکردن اپ، میکس را play/pause کند.

import { AMBIENT_SOUNDS } from "./ambient";
import type { AmbientSoundId } from "../types";

export function mediaSessionSupported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

function artwork(): MediaImage[] {
  try {
    const href = new URL("icon-512.png", document.baseURI).href;
    return [{ src: href, sizes: "512x512", type: "image/png" }];
  } catch {
    return [];
  }
}

/** عنوانِ پخش جاری از روی لایه‌های روشنِ میکس */
export function activeMixLabel(levels: Record<AmbientSoundId, number>): string {
  const names = AMBIENT_SOUNDS.filter((s) => (levels[s.id] ?? 0) > 0.001).map((s) => s.label);
  return names.length > 0 ? names.join(" + ") : "همه‌ی صداها خاموش‌اند";
}

/** متادیتا را با برچسبِ میکسِ فعلی به‌روز می‌کند */
export function updateMediaSession(playing: boolean, levels: Record<AmbientSoundId, number>): void {
  if (!mediaSessionSupported()) return;
  try {
    const ms = navigator.mediaSession;
    const artworkList = typeof MediaMetadata !== "undefined" ? artwork() : [];
    if (typeof MediaMetadata !== "undefined") {
      ms.metadata = new MediaMetadata({
        title: activeMixLabel(levels),
        artist: "صداهای تمرکز 🎧",
        album: "برنامه‌ریز مطالعه",
        artwork: artworkList,
      });
    }
    ms.playbackState = playing ? "playing" : "paused";
  } catch {
    /* هر خطای پلتفرمی — سایلنت */
  }
}

/** کلیدهای سیستمی (play/pause/stop) را به کنترل‌گرهای اپ وصل می‌کند */
export function bindMediaSessionHandlers(handlers: { onPlay: () => void; onPause: () => void }): void {
  if (!mediaSessionSupported()) return;
  try {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", handlers.onPlay);
    ms.setActionHandler("pause", handlers.onPause);
    ms.setActionHandler("stop", handlers.onPause);
  } catch {
    /* سایلنت */
  }
}

/** هنگام خروج کامل از اپ، وضعیت پخش را خنثی می‌کند */
export function clearMediaSession(): void {
  if (!mediaSessionSupported()) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  } catch {
    /* سایلنت */
  }
}
