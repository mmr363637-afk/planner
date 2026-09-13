// ===== Media Session API: کنترل صداها از صفحه‌ی قفل/نوتیفیکیشن =====
// با این، پخشِ صداهای تمرکز مثل یک پلیر موسیقی در سیستم‌عامل دیده می‌شود و
// کاربر می‌تواند بدون بازکردن اپ، میکس را play/pause کند.

// ⚡ عمداً از ambientMeta (سبک) ایمپورت می‌شود، نه از موتور سنگین — وگرنه کل موتور
// وارد باندل اولیه می‌شد و lazy بودنِ صداها بی‌اثر می‌شد.
import { AMBIENT_SOUNDS } from "./ambientMeta";
import type { AmbientSoundId } from "../types";

export function mediaSessionSupported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

// آرت‌ورک ثابت است؛ یک‌بار ساخته و کش می‌شود تا با هر تیکِ اسلایدر URL نسازیم
let cachedArtwork: MediaImage[] | null = null;
function artwork(): MediaImage[] {
  if (cachedArtwork) return cachedArtwork;
  try {
    const href = new URL("icon-512.png", document.baseURI).href;
    cachedArtwork = [{ src: href, sizes: "512x512", type: "image/png" }];
  } catch {
    cachedArtwork = [];
  }
  return cachedArtwork;
}

/** عنوانِ پخش جاری از روی لایه‌های روشنِ میکس */
export function activeMixLabel(levels: Record<AmbientSoundId, number>): string {
  const names = AMBIENT_SOUNDS.filter((s) => (levels[s.id] ?? 0) > 0.001).map((s) => s.label);
  return names.length > 0 ? names.join(" + ") : "همه‌ی صداها خاموش‌اند";
}

// ⚡ کشِ آخرین وضعیت: این تابع با هر تیکِ اسلایدر صدا می‌شود؛ ساختِ بیهوده‌ی
// MediaMetadata در هر تیک، روی گوشی‌های ضعیف باعث سکته‌ی چند میلی‌ثانیه‌ای می‌شد.
let lastMediaTitle: string | null = null;
let lastMediaPlaying: boolean | null = null;

/** متادیتا را با برچسبِ میکسِ فعلی به‌روز می‌کند (فقط وقتی چیزی عوض شده باشد) */
export function updateMediaSession(playing: boolean, levels: Record<AmbientSoundId, number>): void {
  if (!mediaSessionSupported()) return;
  try {
    const ms = navigator.mediaSession;
    const title = activeMixLabel(levels);
    if (typeof MediaMetadata !== "undefined" && title !== lastMediaTitle) {
      lastMediaTitle = title;
      ms.metadata = new MediaMetadata({
        title,
        artist: "صداهای تمرکز 🎧",
        album: "برنامه‌ریز مطالعه",
        artwork: artwork(),
      });
    }
    if (playing !== lastMediaPlaying) {
      lastMediaPlaying = playing;
      ms.playbackState = playing ? "playing" : "paused";
    }
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
  lastMediaTitle = null;
  lastMediaPlaying = null;
  if (!mediaSessionSupported()) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  } catch {
    /* سایلنت */
  }
}
