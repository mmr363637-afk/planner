// ===== Pure state (de)serialization shared by persistence and import =====
import { normalizeAnnotations } from "./annotations";
import { DEFAULT_SETTINGS, DEFAULT_TTS, type AmbientSettings, type AmbientSoundId, type AmbientUserPreset, type AppState, type BankAttempt, type TtsSettings, type UserSettings } from "../types";
import { todayKey } from "./jalali";
import { MAX_STREAK_FREEZES } from "./gamification";
import { isThemeFamilyId, isThemePackId, themeFamily } from "./themePacks";
import { normalizeCardCount } from "./ai";

export const EMPTY_STATE: AppState = {
  sourceDocuments: [],
  remediationAttempts: [],
  cardQuestions: [],
  cardAttempts: [],
  flashSessions: [],
  examBankAttempts: [],
  examBankSessions: [],
  examBankBookmarks: [],
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

/** عددِ امن: فقط عدد متناهی، داخل بازه؛ وگرنه مقدار پیش‌فرض */
function safeNum(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

/** رشته‌ی امن: فقط رشته‌ی غیرخالی؛ وگرنه مقدار پیش‌فرض */
function safeStr(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

const TOPIC_STATUSES = ["not_started", "learning", "needs_review", "mastered"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;

/** 🔈 سالم‌سازیِ تنظیمات صوتی — عددها در بازهٔ مجاز، موتور فقط system/remote */
function sanitizeTts(raw: Partial<TtsSettings> | undefined): TtsSettings {
  const t = raw ?? {};
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const mode = t.mode === "podcast" || t.mode === "rapid" || t.mode === "answer-first" ? t.mode : "qa";
  return {
    engine: t.engine === "remote" ? "remote" : "system",
    voiceURI: str(t.voiceURI, 300) || undefined,
    voiceLabel: str(t.voiceLabel, 120) || undefined,
    rate: num(t.rate, DEFAULT_TTS.rate, 0.5, 2),
    pitch: num(t.pitch, DEFAULT_TTS.pitch, 0.5, 1.5),
    volume: num(t.volume, DEFAULT_TTS.volume, 0, 1),
    answerPauseSec: num(t.answerPauseSec, DEFAULT_TTS.answerPauseSec, 0, 60),
    cardGapSec: num(t.cardGapSec, DEFAULT_TTS.cardGapSec, 0, 30),
    repeat: Math.round(num(t.repeat, DEFAULT_TTS.repeat, 1, 3)),
    mode,
    autoNext: t.autoNext !== false,
    remoteUrl: str(t.remoteUrl, 400) || undefined,
    remoteKey: str(t.remoteKey, 400) || undefined,
    remoteVoice: str(t.remoteVoice, 120) || undefined,
  };
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
    // ❄️ تاریخ‌های خریدِ یخ‌زدگی: فقط رشته‌های تاریخِ سالم و به‌تعداد موجودی (داده‌ی
    // خراب/دست‌کاری‌شده نباید بتواند پوششِ گذشته را برگرداند یا NaN بسازد).
    streakFreezes: Math.max(0, Math.min(MAX_STREAK_FREEZES, Math.floor(Number(s.streakFreezes ?? DEFAULT_SETTINGS.streakFreezes)) || 0)),
    streakFreezeDates: Array.isArray(s.streakFreezeDates) ? s.streakFreezeDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-400) : DEFAULT_SETTINGS.streakFreezeDates,
    streakFreezeBoughtOn: Array.isArray(s.streakFreezeBoughtOn)
      ? s.streakFreezeBoughtOn.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-MAX_STREAK_FREEZES)
      : DEFAULT_SETTINGS.streakFreezeBoughtOn,
    // 🎨 تمِ آمادهٔ پس‌زمینه: هر مقدارِ ناشناخته (داده‌ی قدیمی/دست‌کاری‌شده) ⇒ تمِ پیش‌فرض
    themePack: isThemePackId(s.themePack) ? s.themePack : DEFAULT_SETTINGS.themePack,
    // 🎨 خانوادهٔ تم: اگر نامعتبر/حذف‌شده باشد به خانوادهٔ پیش‌فرض برمی‌گردد
    themeFamily: isThemeFamilyId(s.themeFamily) ? themeFamily(s.themeFamily).id : DEFAULT_SETTINGS.themeFamily,
    // 🔈 تنظیمات صوتی: هر فیلد جدا سالم می‌شود تا دادهٔ قدیمی/ناقص، کل صدا را از کار نیندازد
    tts: sanitizeTts(s.tts),
    // 🃏 تعداد کارتِ ساخت هوشمند: فقط ۱۲/۲۵/۵۰ معتبر است (هر چیزِ دیگر ⇒ پیش‌فرض)
    // 🃏 تعداد کارت دستی وارد می‌شود: هر عددِ ۱..۶۰ قبول است و بقیه به پیش‌فرض برمی‌گردد
    aiCardCount: normalizeCardCount(s.aiCardCount),
    // 🎂 تولد: فقط ماه/روزِ معتبرِ شمسی; دادهٔ خراب بی‌صدا حذف می‌شود (نه کرش)
    birthday: (() => {
      const b = s.birthday;
      if (!b || typeof b !== "object") return undefined;
      const month = Math.floor(Number(b.month));
      const day = Math.floor(Number(b.day));
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return undefined;
      const year = Number(b.year);
      return {
        month,
        day,
        ...(Number.isFinite(year) && year >= 1300 && year <= 1499 ? { year: Math.floor(year) } : {}),
      };
    })(),
    lastBirthdayGreeted: typeof s.lastBirthdayGreeted === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.lastBirthdayGreeted)
      ? s.lastBirthdayGreeted
      : undefined,
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
    const collections = ["subjects","topics","tasks","plans","sessions","reviews","flashcards","achievements","exams","notes","testLogs","classBlocks","mistakes","habits","journal","capsules","trash","cardQuestions","cardAttempts","flashSessions","examBankAttempts","examBankSessions"] as const;
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
      // --- نرمال‌سازی موجودیت‌های کلیدی: داده‌ی ناقص (بکاپ قدیمی/QR/ابر) نباید در محاسبات
      // «NaN» بسازد یا صفحه‌ها را بیندازد؛ فقط فیلدهای غایب با مقدار سالم پر می‌شوند.
      topics: Array.isArray(parsed.topics)
        ? parsed.topics
            .filter((t) => t && typeof t.subjectId === "string")
            .map((t) => ({
              ...t,
              name: safeStr(t.name, "بدون نام"),
              subjectId: t.subjectId as string,
              volume: safeNum(t.volume, 0, 0),
              estimatedMinutes: safeNum(t.estimatedMinutes, 60, 0),
              priority: PRIORITIES.includes(t.priority as (typeof PRIORITIES)[number]) ? t.priority : "medium",
              difficulty: t.difficulty === 1 || t.difficulty === 3 ? t.difficulty : 2,
              status: TOPIC_STATUSES.includes(t.status as (typeof TOPIC_STATUSES)[number]) ? t.status : "not_started",
              createdAt: safeNum(t.createdAt, Date.now()),
              // ⏱ برآورد دستیِ هر روش مطالعه: فقط عددهای سالم و روش‌های شناخته‌شده
              estimateOverrides: (() => {
                const src = (t as { estimateOverrides?: unknown }).estimateOverrides;
                if (!src || typeof src !== "object" || Array.isArray(src)) return undefined;
                const out: Record<string, number> = {};
                for (const key of ["reference", "qbank", "notes", "mixed"]) {
                  const raw = (src as Record<string, unknown>)[key];
                  const n = Math.floor(Number(raw));
                  if (Number.isFinite(n) && n >= 5 && n <= 2400) out[key] = n;
                }
                return Object.keys(out).length > 0 ? out : undefined;
              })(),
            }))
        : [],
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks
            .filter((t) => t && typeof t.topicId === "string")
            .map((t) => ({
              ...t,
              topicId: t.topicId as string,
              date: safeStr(t.date, todayKey()),
              plannedMinutes: safeNum(t.plannedMinutes, 0, 0),
              doneMinutes: safeNum(t.doneMinutes, 0, 0),
              status: t.status === "done" || t.status === "skipped" ? t.status : "pending",
              order: safeNum(t.order, 0),
              priority: PRIORITIES.includes(t.priority as (typeof PRIORITIES)[number]) ? t.priority : "medium",
            }))
        : [],
      reviews: Array.isArray(parsed.reviews)
        ? parsed.reviews
            .filter((r) => r && typeof r.topicId === "string")
            .map((r) => ({
              ...r,
              topicId: r.topicId as string,
              dueDate: safeStr(r.dueDate, todayKey()),
              reviewNumber: safeNum(r.reviewNumber, 1, 1),
              stage: safeNum(r.stage, 0, 0),
              intervalDays: safeNum(r.intervalDays, 1, 1),
              status: r.status === "done" ? "done" : "pending",
            }))
        : [],
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.filter((x) => x && (x.topicId === null || typeof x.topicId === "string")).map((x) => ({
            ...x,
            date: safeStr(x.date, todayKey()),
            durationMinutes: safeNum(x.durationMinutes, 0, 0),
            startedAt: safeNum(x.startedAt, Date.now()),
            endedAt: safeNum(x.endedAt, Date.now()),
            mode: x.mode === "pomodoro" ? "pomodoro" : "free",
          }))
        : [],
      // فلش‌کارتِ بدون ef/intervalDays معتبر، در SM-2 عدد NaN و تاریخ «Invalid Date» می‌سازد
      flashcards: Array.isArray(parsed.flashcards)
        ? parsed.flashcards
            .filter((c) => c && typeof c.front === "string" && typeof c.back === "string")
            .map((c) => ({
              ...c,
              ef: Number.isFinite(c.ef) && (c.ef as number) >= 1.3 ? c.ef : 2.5,
              intervalDays: Number.isFinite(c.intervalDays) && (c.intervalDays as number) >= 0 ? c.intervalDays : 0,
              repetitions: Number.isFinite(c.repetitions) && (c.repetitions as number) >= 0 ? c.repetitions : 0,
              lapses: Number.isFinite(c.lapses) && (c.lapses as number) >= 0 ? c.lapses : 0,
              dueDate: typeof c.dueDate === "string" ? c.dueDate : todayKey(),
              createdAt: Number.isFinite(c.createdAt) ? c.createdAt : Date.now(),
              note: typeof c.note === "string" ? c.note.slice(0, 5000) : undefined,
              highlights: Array.isArray(c.highlights)
                ? (c.highlights as unknown[]).filter((h): h is string => typeof h === "string" && h.trim() !== "").map((h) => h.slice(0, 300)).slice(0, 40)
                : undefined,
              bookmark: c.bookmark === true,
              // 🖍 نشانه‌گذاری‌های انتخابی: ساختار خراب هرگز به رندر نمی‌رسد
              annotations: normalizeAnnotations(c.annotations),
              sourceQuestion:
                c.sourceQuestion && typeof c.sourceQuestion === "object" && typeof (c.sourceQuestion as { questionId?: unknown }).questionId === "string"
                  ? {
                      questionId: String((c.sourceQuestion as { questionId: string }).questionId).slice(0, 80),
                      stem: typeof (c.sourceQuestion as { stem?: unknown }).stem === "string" ? String((c.sourceQuestion as { stem: string }).stem).slice(0, 600) : "",
                      examType: (c.sourceQuestion as { examType?: unknown }).examType === "residency" ? "residency" : "pre_internship",
                      year: Number.isFinite((c.sourceQuestion as { year?: unknown }).year) ? Number((c.sourceQuestion as { year: number }).year) : 0,
                      topicTitle: typeof (c.sourceQuestion as { topicTitle?: unknown }).topicTitle === "string" ? String((c.sourceQuestion as { topicTitle: string }).topicTitle).slice(0, 120) : "",
                    }
                  : undefined,
            }))
        : [],
      cardQuestions: Array.isArray(parsed.cardQuestions)
        ? parsed.cardQuestions
            .filter((q) => q && typeof q.cardId === "string" && Array.isArray(q.options) && q.options.length === 4)
            .map((q) => ({
              ...q,
              source: q.source === "ai" ? "ai" : "offline",
              explanation: typeof q.explanation === "string" ? q.explanation.slice(0, 700) : undefined,
              aiModel: typeof q.aiModel === "string" ? q.aiModel.slice(0, 80) : undefined,
              aiAt: Number.isFinite(q.aiAt) ? q.aiAt : undefined,
            }))
        : [],
      cardAttempts: Array.isArray(parsed.cardAttempts)
        ? parsed.cardAttempts.filter((a) => a && typeof a.cardId === "string" && typeof a.correct === "boolean").slice(-5000)
        : [],
      flashSessions: Array.isArray(parsed.flashSessions)
        ? parsed.flashSessions.filter((f) => f && typeof f.total === "number" && typeof f.startedAt === "number").slice(-400)
        : [],
      // 🏥 بانک آزمون: فقط متادیتای کوچکِ پاسخ/نتیجه نگه داشته می‌شود (متن سؤال هیچ‌جا ذخیره نمی‌شود)
      examBankAttempts: Array.isArray(parsed.examBankAttempts)
        ? parsed.examBankAttempts
            .filter((a) => a && typeof a.questionId === "string" && typeof a.topicId === "string" && typeof a.correct === "boolean")
            .map((a) => ({
              ...a,
              examType: (a.examType === "residency" ? "residency" : "pre_internship") as BankAttempt["examType"],
              year: safeNum(a.year, 1400, 1390, 1500),
              at: safeNum(a.at, Date.now()),
              selectedIndex: typeof a.selectedIndex === "number" ? a.selectedIndex : undefined,
            }))
            .slice(-20000)
        : [],
      examBankSessions: Array.isArray(parsed.examBankSessions)
        ? parsed.examBankSessions
            .filter((s) => s && typeof s.total === "number" && typeof s.startedAt === "number")
            .slice(-300)
        : [],
      examBankBookmarks: Array.isArray(parsed.examBankBookmarks)
        ? [...new Set((parsed.examBankBookmarks as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0))].slice(-3000)
        : [],
      testLogs: Array.isArray(parsed.testLogs) ? parsed.testLogs.filter((x) => x && typeof x.total === "number" && typeof x.correct === "number") : [],
      classBlocks: Array.isArray(parsed.classBlocks) ? parsed.classBlocks.filter((x) => x && typeof x.startMin === "number" && typeof x.endMin === "number") : [],
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes.filter((x) => x && typeof x.question === "string") : [],
      // عادت‌های واردشده از بکاپ/QR قدیمی ممکن است «history» نداشته باشند؛ همان یک فیلد
      // غایب قبلاً کل تب عادت‌ها را با خطا می‌انداخت، پس این‌جا نرمال می‌شود.
      habits: Array.isArray(parsed.habits)
        ? parsed.habits
            .filter((x) => x && typeof x.title === "string")
            .map((x) => ({
              ...x,
              icon: typeof x.icon === "string" && x.icon ? x.icon : "✅",
              targetPerWeek: Number.isFinite(x.targetPerWeek) ? Math.max(1, Math.min(7, x.targetPerWeek as number)) : 7,
              history: Array.isArray(x.history) ? (x.history as unknown[]).filter((d): d is string => typeof d === "string") : [],
              createdAt: Number.isFinite(x.createdAt) ? x.createdAt : Date.now(),
            }))
        : [],
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
