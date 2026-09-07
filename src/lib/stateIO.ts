// ===== Pure state (de)serialization shared by persistence and import =====
import { DEFAULT_SETTINGS, type AmbientSettings, type AppState, type UserSettings } from "../types";

export const EMPTY_STATE: AppState = {
  subjects: [],
  topics: [],
  plans: [],
  tasks: [],
  sessions: [],
  reviews: [],
  achievements: [],
  exams: [],
  settings: DEFAULT_SETTINGS,
  activeSession: null,
};

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
      settings: mergeSettings(parsed.settings),
    };
  } catch {
    return null;
  }
}
