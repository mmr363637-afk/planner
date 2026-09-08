// ===== Pure state (de)serialization shared by persistence and import =====
import { DEFAULT_SETTINGS, type AmbientSettings, type AmbientSoundId, type AmbientUserPreset, type AppState, type UserSettings } from "../types";

export const EMPTY_STATE: AppState = {
  subjects: [],
  topics: [],
  flashcards: [],
  plans: [],
  tasks: [],
  sessions: [],
  reviews: [],
  achievements: [],
  exams: [],
  settings: DEFAULT_SETTINGS,
  activeSession: null,
};

/** پریست‌های کاربر سالم‌سازی می‌شوند: فقط موارد با id/label معتبر و حجم در بازه‌ی ۰..۱ */
function sanitizeCustomPresets(list: unknown): AmbientUserPreset[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out: AmbientUserPreset[] = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const { id, label, icon, volumes } = p as Partial<AmbientUserPreset>;
    if (typeof id !== "string" || typeof label !== "string" || label.trim() === "" || !volumes || typeof volumes !== "object") continue;
    const clean: Partial<Record<AmbientSoundId, number>> = {};
    for (const [k, v] of Object.entries(volumes)) {
      const n = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
      clean[k as AmbientSoundId] = n;
    }
    out.push({ id, label: label.trim().slice(0, 40), icon: typeof icon === "string" && icon ? icon.slice(0, 8) : "🎧", volumes: clean });
  }
  return out.slice(0, 24); // سقف معقول برای جلوگیری از رشد بدون‌مرز داده
}

/**
 * ادغام تنظیمات ذخیره‌شده با پیش‌فرض‌ها. گروه‌های تودرتو (پومودورو، اعلان‌ها، تایمر
 * امتحان، صداهای محیطی) جداگانه ادغام می‌شوند تا داده‌ی قدیمی/نقصانی باعث ازبین‌رفتن
 * کلیدهای جدید نشود.
 */
export function mergeSettings(saved: Partial<UserSettings> | undefined): UserSettings {
  const s = saved ?? {};
  const ambient: Partial<AmbientSettings> = s.ambient ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...(s.pomodoro ?? {}) },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(s.notifications ?? {}) },
    examTimer: { ...DEFAULT_SETTINGS.examTimer, ...(s.examTimer ?? {}) },
    ambient: {
      ...DEFAULT_SETTINGS.ambient,
      ...ambient,
      volumes: { ...DEFAULT_SETTINGS.ambient.volumes, ...(ambient.volumes ?? {}) },
      customPresets: sanitizeCustomPresets(ambient.customPresets) ?? [],
      binauralBand: ambient.binauralBand === "alpha" || ambient.binauralBand === "beta" || ambient.binauralBand === "theta" || ambient.binauralBand === "delta" ? ambient.binauralBand : (DEFAULT_SETTINGS.ambient.binauralBand ?? "alpha"),
      reactiveDuck: ambient.reactiveDuck === true,
    },
  };
}

/** تبدیل متن JSON (آینه‌ی localStorage، خروجی IndexedDB یا فایل پشتیبان) به AppState */
export function parseStateText(raw: string | null | undefined): AppState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...EMPTY_STATE,
      ...parsed,
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [],
      settings: mergeSettings(parsed.settings),
    };
  } catch {
    return null;
  }
}
