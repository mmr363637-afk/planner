// ===== Pure state (de)serialization shared by persistence and import =====
import { DEFAULT_SETTINGS, type AmbientSettings, type AmbientSoundId, type AmbientUserPreset, type AppState, type UserSettings } from "../types";

export const EMPTY_STATE: AppState = {
  sourceDocuments: [],
  remediationAttempts: [],
  subjects: [],
  topics: [],
  flashcards: [],
  plans: [],
  tasks: [],
  sessions: [],
  reviews: [],
  achievements: [],
  exams: [],
  notes: [],
  testLogs: [],
  classBlocks: [],
  mistakes: [],
  habits: [],
  journal: [],
  capsules: [],
  focusTree: null,
  trash: [],
  cram: null,
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
    autoBackup: {
      ...DEFAULT_SETTINGS.autoBackup,
      ...(s.autoBackup ?? {}),
      intervalDays: Math.max(1, Math.min(30, Math.floor(Number(s.autoBackup?.intervalDays ?? DEFAULT_SETTINGS.autoBackup.intervalDays)) || DEFAULT_SETTINGS.autoBackup.intervalDays)),
    },
    googleDrive: s.googleDrive ? { ...s.googleDrive } : undefined,
    supabase: s.supabase ? { ...s.supabase } : undefined,
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
    // بدون این چک، «42» یا «[]» به یک وضعیتِ خالیِ ظاهراً سالم ترجمه می‌شد و
    // importData می‌توانست داده‌ی محلی کاربر را با هیچ جایگزین کند (ابر/فایل خراب).
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const collections = ["subjects","topics","tasks","plans","sessions","reviews","flashcards","achievements","exams","notes","testLogs","classBlocks","mistakes","habits","journal","capsules","trash"] as const;
    for (const key of collections) {
      const value = parsed[key];
      if (value != null && (!Array.isArray(value) || value.some(x => !x || typeof x !== "object" || typeof x.id !== "string"))) return null;
      if (value === null) return null;
    }
    if (parsed.sourceDocuments != null) {
      if (!Array.isArray(parsed.sourceDocuments) || parsed.sourceDocuments.length > 30) return null;
      let total = 0;
      for (const doc of parsed.sourceDocuments) {
        if (!doc || typeof doc.id !== "string" || typeof doc.title !== "string" || !Array.isArray(doc.pages) || doc.pages.length > 100) return null;
        let chars = 0; const pages = new Set<number>();
        for (const p of doc.pages) {
          if (!p || !Number.isInteger(p.number) || p.number < 1 || typeof p.text !== "string" || pages.has(p.number)) return null;
          pages.add(p.number); chars += p.text.length;
        }
        if (chars > 500000) return null;
        total += chars;
      }
      if (total > 2000000) return null;
    }
    return {
      ...EMPTY_STATE,
      ...parsed,
      sourceDocuments: Array.isArray(parsed.sourceDocuments) ? parsed.sourceDocuments.filter(d => d && typeof d.id === "string" && typeof d.title === "string" && Array.isArray(d.pages) && d.pages.every(p => p && Number.isInteger(p.number) && p.number > 0 && typeof p.text === "string")).slice(0, 30) : [],
      remediationAttempts: Array.isArray(parsed.remediationAttempts) ? parsed.remediationAttempts.filter(a => a && typeof a.id === "string" && Array.isArray(a.mistakeIds) && Number.isFinite(a.correct) && Number.isFinite(a.total) && a.total > 0 && a.correct >= 0 && a.correct <= a.total) : [],
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [],
      testLogs: Array.isArray(parsed.testLogs) ? parsed.testLogs.filter((x) => x && typeof x.total === "number" && typeof x.correct === "number") : [],
      classBlocks: Array.isArray(parsed.classBlocks) ? parsed.classBlocks.filter((x) => x && typeof x.startMin === "number" && typeof x.endMin === "number") : [],
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes.filter((x) => x && typeof x.question === "string") : [],
      habits: Array.isArray(parsed.habits) ? parsed.habits.filter((x) => x && typeof x.title === "string") : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal.filter((x) => x && typeof x.date === "string") : [],
      capsules: Array.isArray(parsed.capsules) ? parsed.capsules.filter((x) => x && typeof x.text === "string") : [],
      focusTree: parsed.focusTree && typeof parsed.focusTree === "object" && typeof (parsed.focusTree as { date?: unknown }).date === "string" ? (parsed.focusTree as AppState["focusTree"]) : null,
      // حالت جنگی: فقط اگر آیتم‌های سالم داشته باشد (وگرنه null تا UI قاطی نکند)
      cram: parsed.cram && typeof parsed.cram === "object" && Array.isArray((parsed.cram as { items?: unknown }).items)
        ? (parsed.cram as AppState["cram"])
        : null,
      // سطل زباله: فقط آیتم‌های سالمِ کمتر از ۳۰ روز نگه داشته می‌شوند
      trash: Array.isArray(parsed.trash)
        ? parsed.trash.filter((x) => x && typeof x.id === "string" && typeof x.deletedAt === "number" && Date.now() - x.deletedAt < 30 * 24 * 3600 * 1000)
        : [],
      settings: mergeSettings(parsed.settings),
    };
  } catch {
    return null;
  }
}
