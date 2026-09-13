// ===== اسنپ‌شات سبکِ «الان چه صداهایی پخش می‌شود؟» =====
// موتور صوتی (lib/ambient.ts) تنبل لود می‌شود، پس store نمی‌تواند مستقیم از آن بپرسد.
// Provider صدا (src/ambient.tsx) با هر تغییرِ پخش/میکس، این اسنپ‌شات را تازه می‌کند و
// store هنگام پایان جلسه، همان را روی StudySession می‌نویسد (برای آمار «با چه صدایی
// بیشتر می‌خوانی؟»). کاملاً حافظه‌ای است؛ چیزی ذخیره نمی‌شود.
import type { AmbientSoundId } from "../types";

let snapshot: AmbientSoundId[] = [];

/** آخرین ترکیبِ در حال پخش (خالی یعنی چیزی پخش نمی‌شود) */
export function getAmbientSnapshot(): AmbientSoundId[] {
  return snapshot;
}

export function setAmbientSnapshot(ids: AmbientSoundId[]): void {
  snapshot = ids;
}
