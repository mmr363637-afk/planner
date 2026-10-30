import { scheduledReviewTargets, type ReviewCleanupOptions } from "./lib/reviewCleanup";
import { saveHistory } from "./lib/history";
import { paceEstimates, planningFingerprint, type PaceEstimate } from "./lib/decisions";
import { sourceEvidenceValid, type SourceDraft } from "./lib/sourceLearning";
import type { SourceDocument, RemediationAttempt, CardQuestion, CardAttempt, FlashSessionResult, PlanTaskMove, BankQuestion, BankSessionResult } from "./types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  collapseStudyKinds,
  normalizeStudyKinds,
  DEFAULT_SETTINGS,
  SUBJECT_COLORS,
  type ActiveSession,
  type AppState,
  type Exam,
  type Flashcard,
  type Habit,
  type JournalEntry,
  type Mistake,
  type Priority,
  type Rating,
  type Review,
  type SessionMode,
  type SmartPlanConfig,
  type StudyApproach,
  type StudyPlan,
  type StudyKind,
  type StudySession,
  type TextAnnotation,
  type StudyTask,
  type Subject,
  type TimeCapsule,
  type Topic,
  type UserSettings,
} from "./types";
import { defaultId, generatePlan, replan as replanEngine, type PlanResult } from "./lib/planner";
import { buildRelearnTasks, creditStudyToTasks, rebalanceToday } from "./lib/planSync";
import { buildCramPlan } from "./lib/cram";
import { generateSmartPlan, type SmartPlanResult } from "./lib/smartPlan";
import { leafTopics } from "./lib/topics";
import { defaultScheduler } from "./lib/srs";
import { sm2Next } from "./lib/sm2";
import { calculateFsrsNext, mapQualityToFsrs } from "./lib/fsrs";
import { trackFeature } from "./lib/usage";
import { getAmbientSnapshot } from "./lib/ambientSnapshot";
import { makeTrashItem, pushTrash, restoreTrashItem, snapshotPlan, snapshotSubject, snapshotTopics } from "./lib/trash";
import { descendantsOf } from "./lib/topics";
import { ACHIEVEMENTS, MAX_STREAK_FREEZES, STREAK_FREEZE_COST, XP_DAILY_GOAL_BONUS, XP_PER_CARD, XP_PER_MASTERED, XP_PER_MINUTE, XP_PER_REVIEW, XP_PER_TASK, levelFromXp, levelTitle, xpStreakMultiplier } from "./lib/gamification";
import { addDays, toFa as toFaNum, todayKey } from "./lib/jalali";
import { mergeSampleData } from "./lib/sampleImport";
import { curatedCardKey, curatedPackById } from "./lib/curatedPacks";
import { planCardPackageImport, parseCardPackage, type ImportPlan } from "./lib/cardPackage";
import { ensureQuestionsForCards } from "./lib/cardQuiz";
import { makeBankAttempt } from "./lib/examBank";
import { normalizeAnnotations, remapAnnotationsForText } from "./lib/annotations";
import { computeStreak, minutesOnDate, settleStreakFreezes, shouldAwardDailyGoalBonus } from "./lib/stats";
import { loadDurable, loadMirror, persistState, newestLocalState } from "./lib/persist";
import { EMPTY_STATE, mergeSettings, parseStateText } from "./lib/stateIO";

// سازگاری با importهای قدیمی (تست‌ها) — منطق در lib/stateIO است
export { mergeSettings };

/**
 * تنظیم مجددِ یک برنامه روی state (خالص‌تر از متد store): تسک‌های انجام‌شده/ردشده
 * دست‌نخورده می‌مانند و فقط کارِ باقی‌مانده با مباحثِ فعلی برنامه بازچیده می‌شود.
 * برای «افزودن/حذف مبحث به برنامهٔ موجود» هم همین استفاده می‌شود.
 */
function normalizeName(value: string): string {
  return value
    .replace(/[\u064A\u0649]/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * امضای پایدارِ یک تسک برنامه — برای پیدا کردنِ همان تسک بعد از بازچینش،
 * چون بازچینش شناسه‌ی تسک‌های معلق را از نو می‌سازد.
 */
function planMoveSignature(t: StudyTask): string {
  return `${t.topicId}|${t.kind ?? ""}|${t.label ?? ""}`;
}

/**
 * جابه‌جایی دستیِ تسک‌ها به روز دیگر.
 * `moves` یا با `taskId` (وقتی هیچ بازچینشی رخ نداده) یا با امضا/دقیقه/ترتیب
 * (وقتی بازچینش شناسه‌ها را عوض کرده) تطبیق داده می‌شود. تاریخ مقصد باید در
 * بازهٔ [امروز، پایان برنامه] باشد؛ وگرنه جابه‌جایی شمرده نمی‌شود.
 */
function applyTaskMoves(
  tasks: StudyTask[],
  planId: string,
  moves: { taskId?: string; sig?: string; topicId?: string; plannedMinutes?: number; order?: number; target: string }[],
  today: string,
  maxDate: string,
): { tasks: StudyTask[]; applied: number; skipped: number } {
  const next = [...tasks];
  const used = new Set<number>();
  let applied = 0;
  let skipped = 0;
  for (const m of moves) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.target) || m.target < today || m.target > maxDate) {
      skipped += 1;
      continue;
    }
    const pool = next.map((t, i) => ({ t, i })).filter(({ t, i }) => !used.has(i) && t.planId === planId && t.status === "pending");
    let hit = m.taskId ? pool.find(({ t }) => t.id === m.taskId) : undefined;
    if (!hit && m.sig) {
      const same = pool.filter(({ t }) => planMoveSignature(t) === m.sig);
      hit =
        same.find(({ t }) => t.plannedMinutes === m.plannedMinutes && t.order === m.order) ??
        same.find(({ t }) => t.plannedMinutes === m.plannedMinutes) ??
        same[0];
    }
    // بازچینش ممکن است نوع/برچسبِ کار را عوض کند (برنامهٔ دستی، نوع ندارد)؛
    // در این حالت کارِ همان مبحث را جابه‌جا کن تا خواستهٔ کاربر از دست نرود.
    if (!hit && m.topicId) {
      const sameTopic = pool.filter(({ t }) => t.topicId === m.topicId);
      hit = sameTopic.find(({ t }) => t.plannedMinutes === m.plannedMinutes) ?? sameTopic[0];
    }
    if (!hit) {
      skipped += 1;
      continue;
    }
    used.add(hit.i);
    const maxOrder = next
      .filter((t, i) => i !== hit.i && t.date === m.target && t.planId === planId)
      .reduce((mx, t) => Math.max(mx, t.order), 0);
    next[hit.i] = { ...next[hit.i], date: m.target, order: maxOrder + 1 };
    applied += 1;
  }
  return { tasks: next, applied, skipped };
}

function replanState(s: AppState, plan: StudyPlan): { next: AppState; result: PlanResult | SmartPlanResult | null } {
  const today = todayKey();
  const planTasks = s.tasks.filter((t) => t.planId === plan.id);
  const keep = planTasks.filter((t) => t.status !== "pending");
  const doneByTopic: Record<string, number> = {};
  for (const t of planTasks) {
    const credit = t.status === "done" ? t.plannedMinutes : t.doneMinutes;
    doneByTopic[t.topicId] = (doneByTopic[t.topicId] ?? 0) + Math.max(0, credit);
  }
  const topics = leafTopics(s.topics.filter((t) => plan.topicIds.includes(t.id)));
  const end = plan.endDate < today ? addDays(today, 6) : plan.endDate;
  const start = plan.startDate > today ? plan.startDate : today;
  let created: StudyTask[] = [];
  let smartNotes = plan.smartNotes;
  let smartDayReasons = plan.smartDayReasons;
  let result: PlanResult | SmartPlanResult | null = null;
  let unplacedMinutes = 0;
  let suggestedEndDate: string | undefined;
  let neededExtraDays = 0;
  if (plan.smart) {
    const currentApproaches: Record<string, StudyApproach> = {};
    for (const sub of s.subjects) if (sub.approach) currentApproaches[sub.id] = sub.approach;
    const smartResult = generateSmartPlan({
      planId: plan.id,
      topics,
      subjects: s.subjects,
      startDate: start,
      endDate: end,
      examDate: plan.smart.examDate,
      studyDays: plan.studyDays,
      dailyMinutes: plan.dailyMinutes,
      classBlocks: s.classBlocks,
      reviewGaps: plan.smart.reviewGaps,
      goldenFirst: plan.smart.goldenFirst,
      maxSubjectsPerDay: plan.smart.maxSubjectsPerDay,
      maxSessionMinutes: plan.smart.maxSessionMinutes,
      dailyMinutesByWeekday: plan.smart.dailyMinutesByWeekday,
      includeHolidays: plan.smart.includeHolidays,
      doneMinutesByTopic: doneByTopic,
      approaches: { ...plan.smart.approaches, ...currentApproaches },
      tasks: s.tasks,
      sessions: s.sessions,
    });
    created = smartResult.tasks;
    smartNotes = smartResult.notes;
    smartDayReasons = smartResult.dayReasons;
    result = smartResult;
    unplacedMinutes = smartResult.unplacedMinutes;
    suggestedEndDate = smartResult.unplacedMinutes > 0 ? (smartResult.suggestedEndDate ?? undefined) : undefined;
    neededExtraDays = smartResult.neededExtraDays;
  } else {
    // برنامهٔ دستی: باقی‌ماندهٔ هر مبحث از برآورد منهای کارِ انجام‌شده
    const pseudo: Topic[] = topics
      .map((t) => ({
        ...t,
        estimatedMinutes: Math.max(0, Math.round(t.estimatedMinutes - (doneByTopic[t.id] ?? 0))),
        difficulty: 1 as const,
      }))
      .filter((t) => t.estimatedMinutes > 0);
    const subjectPriority: Record<string, Priority> = {};
    for (const sub of s.subjects) subjectPriority[sub.id] = sub.priority;
    const classicResult = generatePlan({
      planId: plan.id,
      topics: pseudo,
      subjectPriority,
      startDate: start,
      endDate: end,
      studyDays: plan.studyDays,
      dailyMinutes: plan.dailyMinutes,
    });
    created = classicResult.tasks;
    result = classicResult;
  }
  const next: AppState = {
    ...s,
    plans: s.plans.map((p) =>
      p.id === plan.id
        ? {
            ...p,
            startDate: start,
            endDate: end,
            topicIds: plan.topicIds,
            smartNotes,
            smartDayReasons,
            unplacedMinutes: unplacedMinutes > 0 ? unplacedMinutes : undefined,
            suggestedEndDate,
            neededExtraDays: neededExtraDays > 0 ? neededExtraDays : undefined,
          }
        : p,
    ),
    tasks: [...s.tasks.filter((t) => t.planId !== plan.id), ...keep, ...created],
  };
  return { next, result };
}

export interface Toast {
  id: number;
  message: string;
  icon?: string;
}

/**
 * توست‌ها عمداً از context اصلی store جدا هستند: تغییرِ فهرست توست‌ها نباید کل
 * مصرف‌کننده‌های state (یعنی تقریباً همه‌ی اپ) را re-render کند. ToastProvider
 * بیرونِ StoreProvider می‌نشیند و `toast` تابعی پایدار به store می‌دهد.
 */
interface ToastApi {
  toasts: Toast[];
  toast: (message: string, icon?: string) => void;
}
// پیش‌فرضِ امن: بدون Provider هم store کار کند (تست‌ها و embedهای خارج از App)
const ToastContext = createContext<ToastApi>({ toasts: [], toast: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, icon?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const api = useMemo(() => ({ toasts, toast }), [toasts, toast]);
  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

export function useToasts(): ToastApi {
  return useContext(ToastContext);
}

export interface CreatePlanInput {
  goal: string;
  startDate: string;
  endDate: string;
  topicIds: string[];
  studyDays: number[];
  dailyMinutes: number;
}

export interface CreateSmartPlanInput extends CreatePlanInput {
  examDate?: string;
  approaches: Record<string, StudyApproach>;
  bufferDays?: number | null;
  maxSubjectsPerDay?: number;
  maxSessionMinutes?: number;
  reviewGaps?: number[];
  goldenFirst?: boolean;
  dailyMinutesByWeekday?: Partial<Record<number, number>>;
  includeHolidays?: boolean;
}

export interface EndSessionResult {
  session: StudySession;
  /** مرور تازه‌ساخته‌شده‌ی همین جلسه (فقط جلسه‌ی مرور، یا اولین مرورِ مبحث) */
  review: Review | null;
  /**
   * اگر این جلسه «مرور» نبود، نزدیک‌ترین مرورِ در انتظارِ همان مبحث سر جایش ماند؛
   * تاریخش این‌جا برمی‌گردد تا در خلاصه‌ی جلسه صادقانه نشان داده شود.
   */
  keptReviewDue?: string | null;
}

/** آخرین حذف برای قابلیت بازگردانی (Undo) */
export interface DeletedInfo {
  label: string;
  restore: () => void;
  expiresAt: number;
  /** آیتم متناظر در سطل زباله — با undo پاک می‌شود تا سطل، آیتمِ زنده نگه ندارد */
  trashId?: string;
  action?: "delete" | "change";
}

interface StoreApi {
  state: AppState;
  replaceData: (json: string, label?: string) => Promise<boolean>;
  applySchedule: (tasks: StudyTask[], fingerprint: string) => boolean;
  acceptPace: (estimate: PaceEstimate, sampleKey: string) => void;
  saveSource: (doc: SourceDocument) => boolean;
  deleteSource: (id: string) => void;
  importSourceCards: (drafts: SourceDraft[], topicId?: string) => number;
  recordRemediation: (attempt: Omit<RemediationAttempt, "id" | "createdAt">) => void;
  toast: (message: string, icon?: string) => void;
  // subjects & topics
  addSubject: (data: Omit<Subject, "id" | "createdAt">) => Subject;
  updateSubject: (id: string, patch: Partial<Subject>) => void;
  deleteSubject: (id: string) => void;
  addTopic: (data: Omit<Topic, "id" | "createdAt">) => Topic;
  updateTopic: (id: string, patch: Partial<Topic>) => void;
  deleteTopic: (id: string) => void;
  // plans & tasks
  previewPlan: (input: CreatePlanInput) => PlanResult;
  createPlan: (input: CreatePlanInput) => StudyPlan;
  previewSmartPlan: (input: CreateSmartPlanInput) => SmartPlanResult;
  createSmartPlan: (input: CreateSmartPlanInput) => StudyPlan;
  deletePlan: (id: string) => void;
  replanPlan: (id: string) => PlanResult | SmartPlanResult | null;
  duplicatePlan: (id: string) => void;
  toggleArchiveSubject: (id: string) => void;
  // حالت جنگی
  startCram: (input: { examId?: string; hours: number; subjectId?: string }) => void;
  toggleCramItem: (id: string) => void;
  clearCram: () => void;
  addTask: (topicId: string, date: string, minutes: number) => void;
  updateTask: (id: string, patch: Partial<StudyTask>) => void;
  /** ترتیب تسک‌های یک روز را بر اساس آرایه‌ی id ها بازنویسی می‌کند (Drag & Drop) */
  reorderTasks: (orderedIds: string[]) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, date: string) => void;
  completeTask: (id: string) => void;
  // دفتر اشتباهات
  addMistake: (data: { topicId?: string; subjectId?: string; question: string; answer?: string; cause?: string }) => Mistake;
  reviewMistake: (id: string, remembered: boolean) => void;
  deleteMistake: (id: string) => void;
  // عادت‌ها
  addHabit: (data: { title: string; icon?: string; targetPerWeek?: number }) => Habit;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleHabit: (id: string, date: string) => void;
  // ژورنال بازتاب
  upsertJournal: (date: string, learned: string, mood?: number) => void;
  deleteJournal: (id: string) => void;
  // کپسول زمان
  addCapsule: (text: string, openDate: string, examId?: string) => TimeCapsule;
  openCapsule: (id: string) => void;
  deleteCapsule: (id: string) => void;
  // درخت تمرکز
  markTreeWilted: () => void;
  // sessions
  startSession: (topicId: string | null, mode: SessionMode, taskId?: string, targetMinutes?: number) => void;
  /** ثبت دستی مطالعه (مثلاً از روی ثبت صوتی) — بدون تایمر؛ دقیقه‌ها به تسک‌های همان مبحث واریز می‌شوند */
  logManualSession: (topicId: string | null, minutes: number, kind?: StudyKind | StudyKind[]) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  advancePhase: () => void;
  discardSession: () => void;
  /** کاربر می‌گوید «حواسم پریت شد» — فقط در حین اجرای جلسه شمرده می‌شود */
  logDistraction: () => void;
  endSession: (rating: Rating | null, kind?: StudyKind | StudyKind[]) => EndSessionResult | null;
  // reviews
  /**
   * ثبت نتیجه‌ی یک مرور فاصله‌دار. اگر تسک‌های «مرور» خودِ برنامه را هم بدهی،
   * در همین تراکنش تمام می‌شوند تا دو دفترِ مرور از هم جدا نیفتند.
   */
  completeReview: (id: string, rating: Rating, opts?: { completeTaskIds?: string[] }) => void;
  /** مرور/جلسه‌ی ضعیف → برنامه‌ریزی بازآموزی همان مبحث برای روزهای آینده */
  relearnForTopic: (topicId: string, rating: Rating) => void;
  postponeReview: (id: string, days: number) => void;
  clearScheduledReviews: (options: ReviewCleanupOptions) => Promise<boolean>;
  // flashcards (SM-2)
  addFlashcard: (data: Pick<Flashcard, "front" | "back" | "topicId"> & { dueDate?: string }) => Flashcard;
  updateFlashcard: (id: string, patch: Partial<Flashcard>) => void;
  deleteFlashcard: (id: string) => void;
  /** مرور کارت با کیفیت ۰..۵ (SM-2) — پاداش XP برای مرور روز */
  reviewFlashcard: (id: string, quality: 0 | 1 | 2 | 3 | 4 | 5) => void;
  /** افزودن کارت‌های انتخابیِ یک پک منتخب به کارت‌های شخصی (کارت تکراری نادیده گرفته می‌شود) */
  importCuratedCards: (packId: string, cardIndices: number[]) => number;
  /** کلیدهای کارت‌های منتخبی که قبلاً به کارت‌های شخصی اضافه شده‌اند (برای پیش‌فرضِ تیک‌ها) */
  importedCuratedKeys: Set<string>;
  /** کلید همه‌ی کارت‌های شخصی برای تشخیص تکراری هنگام import (فرانتِ نرمال‌شده) */
  existingCardFronts: Set<string>;
  /** پرچم «بررسی سوال» را عوض می‌کند — کاربر به جوابِ کارت شک دارد */
  toggleCardNeedsCheck: (id: string) => void;
  /** یادداشت شخصی روی کارت — از محتوای اصلی جداست */
  updateCardNote: (id: string, note: string) => void;
  /** علامت «باید دوباره مرور شود» */
  toggleCardBookmark: (id: string) => void;
  /** افزودن/برداشتن هایلایت روی کارت (متنِ عبارت) */
  toggleCardHighlight: (id: string, text: string) => void;
  /** 🖍 ذخیرهٔ نشانه‌گذاری‌های انتخابیِ متن کارت (هایلایت رنگی/زیرخط/خط‌خوردگی/یادداشت عبارت) */
  updateCardAnnotations: (id: string, annotations: TextAnnotation[]) => void;
  /** ذخیره/به‌روزرسانی سؤال چهارگزینه‌ایِ ساخته‌شده از کارت */
  saveCardQuestion: (question: CardQuestion) => void;
  /** ذخیرهٔ دسته‌ای (مثلاً پاسخنامه‌های AI) با یک به‌روزرسانی وضعیت */
  saveCardQuestions: (questions: CardQuestion[]) => void;
  /** علامت‌زدن سؤال نامعتبر (از آزمون‌های بعدی کنار می‌رود) */
  flagCardQuestion: (id: string) => void;
  deleteCardQuestion: (id: string) => void;
  /** ثبت یک پاسخ در جلسهٔ فلش‌کارت */
  recordCardAttempt: (attempt: Omit<CardAttempt, "id" | "at"> & { at?: number }) => void;
  /** ذخیرهٔ نتیجهٔ جلسه برای آمار و نمایش بعدی */
  saveFlashSession: (result: Omit<FlashSessionResult, "id" | "endedAt"> & { endedAt?: number }) => void;
  /** ساخت/به‌روزرسانی سؤال‌های یک مجموعه کارت (تولید تدریجی + ذخیره) */
  prepareCardQuestions: (cardIds: string[], kind?: "mcq" | "cloze") => { created: number; rebuilt: number; unsupported: number };
  /** 🏥 ثبت پاسخ به یک سؤال بانک آزمون (فقط متادیتای کوچک ذخیره می‌شود) */
  recordBankAnswer: (question: BankQuestion, selectedIndex: number | null, correct: boolean, ms?: number) => void;
  /** 🏥 ذخیرهٔ نتیجهٔ آزمون بانک */
  saveBankSession: (result: Omit<BankSessionResult, "id"> & { id?: string }) => void;
  /** 🏥 نشان‌دارکردن سؤال بانک برای مرور مجدد */
  toggleBankBookmark: (questionId: string) => void;
  /**
   * 📌 ساخت فلش‌کارت از «نکات پاسخنامهٔ» یک سؤال بانک — کارت شخصی و آفلاین،
   * با حفظ ارجاع به سؤال اصلی. مبحث با نام تطبیق داده می‌شود و اگر نبود، ساخته می‌شود.
   */
  addFlashcardsFromQuestion: (question: BankQuestion, points: string[]) => { added: number; topicId?: string };
  /** ورود بستهٔ اشتراکی فلش‌کارت با حفظ ساختار مبحث */
  importCardPackageText: (text: string) => { ok: boolean; error?: string; plan?: ImportPlan; added: number; topics: number };
  /** ویرایش مباحث یک برنامهٔ موجود — با حفظ تسک‌های انجام‌شده */
  editPlanTopics: (planId: string, changes: { add?: string[]; remove?: string[] }) => void;
  /**
   * ذخیرهٔ یک‌جای «ویرایش برنامه»: بازه/زمان روزانه/روزهای هفته/اولویت‌ها + افزودن و
   * حذف مبحث + جابه‌جایی دستیِ تسک‌ها، با یک بازچینش و حفظ کارِ انجام‌شده.
   * خروجی: چند جابه‌جایی اعمال و چند تا (مثلاً به‌خاطر تغییر بازه) کنار گذاشته شد.
   */
  savePlanEdit: (
    planId: string,
    patch: {
      endDate?: string;
      dailyMinutes?: number;
      studyDays?: number[];
      priorities?: Record<string, Priority>;
      add?: string[];
      remove?: string[];
      moves?: PlanTaskMove[];
    },
  ) => { applied: number; skipped: number };
  /** تغییر بازه/دقیقهٔ روزانه/روزهای مطالعه و بازچینش — با حفظ پیشرفت */
  updatePlanConfig: (
    planId: string,
    patch: {
      startDate?: string;
      endDate?: string;
      dailyMinutes?: number;
      studyDays?: number[];
      /** اولویتِ مبحث‌ها که هم‌زمان با بازچینش اعمال می‌شود (نه قبل از آن) */
      priorities?: Record<string, Priority>;
    },
  ) => PlanResult | SmartPlanResult | null;
  /** زمان دستی برای یک روش مطالعه (null = پاک‌کردن) */
  setTopicEstimate: (topicId: string, approach: StudyApproach, minutes: number | null) => void;
  // exams
  addExam: (data: Omit<Exam, "id" | "createdAt">) => Exam;
  updateExam: (id: string, patch: Partial<Exam>) => void;
  deleteExam: (id: string) => void;
  // notes
  addNote: (text: string, topicId?: string) => void;
  updateNote: (id: string, patch: Partial<import("./types").StudyNote>) => void;
  deleteNote: (id: string) => void;
  // ثبت تست (تمرین تست‌زنی)
  addTestLog: (data: { topicId?: string; subjectId?: string; total: number; correct: number }) => void;
  deleteTestLog: (id: string) => void;
  // بلوک‌های برنامه‌ی هفتگی
  addClassBlock: (data: Omit<import("./types").ClassBlock, "id" | "createdAt">) => void;
  updateClassBlock: (id: string, patch: Partial<import("./types").ClassBlock>) => void;
  deleteClassBlock: (id: string) => void;
  // سطل زباله
  restoreTrash: (id: string) => void;
  deleteTrashForever: (id: string) => void;
  emptyTrash: () => void;
  /** ثبت اینکه بکاپ گرفته شد (برای یادآوری خودکار) */
  markBackupDone: () => void;
  // topic tags
  toggleTopicTag: (topicId: string, tag: import("./types").TopicTag) => void;
  // gamification
  buyStreakFreeze: () => void;
  // undo
  lastDeleted: DeletedInfo | null;
  undoDelete: () => void;
  // settings & data
  updateSettings: (patch: Partial<UserSettings>) => void;
  exportData: () => string;
  importData: (json: string) => boolean;
  resetAll: () => void;
  loadSampleData: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // بوت بی‌درنگ از آینه‌ی localStorage؛ داده‌های ماندگار در IndexedDB همان لحظه هم نوشته می‌شوند.
  // فقط یک‌بار پارس می‌شود (پارسِ دوباره در هر رندر روی دیتای حجیم، بوت و تعامل را کند می‌کرد).
  const [boot] = useState(() => {
    const mirror = loadMirror();
    return { state: mirror ?? EMPTY_STATE, mirrorEmpty: mirror == null };
  });
  const [state, setState] = useState<AppState>(boot.state);
  const [hydrated, setHydrated] = useState(typeof indexedDB === "undefined");
  const { toast } = useToasts();
  const [deleted, setDeleted] = useState<DeletedInfo | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // persist (localStorage mirror + IndexedDB)
  useEffect(() => {
    if (hydrated) persistState(state);
  }, [state, hydrated]);

  // مهاجرت آنبوردینگ: کاربر قدیمی که دیتا دارد ولی فلگ ندارد، آنبوردد حساب می‌شود
  // تا آنبوردینگِ اولین نصب را نبیند (فقط نصبِ واقعاً تازه آن را می‌بیند).
  useEffect(() => {
    if (!hydrated) return;
    setState((st) =>
      !st.settings.onboarded && (st.subjects.length > 0 || st.sessions.length > 0)
        ? { ...st, settings: { ...st.settings, onboarded: true } }
        : st,
    );
  }, [hydrated]);

  // اگر آینه‌ی بوت خالی یا خراب بود ولی نسخه‌ی ماندگار در IndexedDB هست (مثلاً بعد از
  // پاک‌شدن localStorage یا در ارتقا از نسخه‌های قدیمی)، بازیابی کن.
  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    let cancelled = false;
    loadDurable().then((durable) => {
      if (!cancelled) {
        const best = newestLocalState(boot.mirrorEmpty ? null : boot.state, durable);
        if (best) setState(current => current === boot.state ? best : current);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // achievements watcher
  useEffect(() => {
    const unlocked = new Set(state.achievements.map((a) => a.id));
    const fresh = ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.check(state));
    if (fresh.length > 0) {
      setState((s) => ({
        ...s,
        achievements: [...s.achievements, ...fresh.map((a) => ({ id: a.id, unlockedAt: Date.now() }))],
        settings: { ...s.settings, xp: s.settings.xp + fresh.length * 50 },
      }));
      fresh.forEach((a) => toast(`دستاورد جدید: ${a.title}`, a.icon));
    }
  }, [state, toast]);

  // ❄️ یخ‌زدگیِ Streak: قبلاً موجودی هیچ‌وقت کم نمی‌شد (باگ) و هر بار محاسبه‌ی زنجیره
  // دوباره از همان بودجه‌ی «همیشگی» استفاده می‌کرد. اینجا، روزِ جاماندهٔ *گذشته* (نه
  // امروز) را یک‌بار و برای همیشه با یک یخ‌زدگی پوشش می‌دهیم: هم موجودی واقعاً کم
  // می‌شود، هم آن تاریخ در `streakFreezeDates` ثبت می‌شود تا دوباره مصرف نشود.
  useEffect(() => {
    if (!hydrated) return;
    const today = todayKey();
    const result = settleStreakFreezes(
      state.sessions,
      today,
      state.settings.streakFreezes,
      state.settings.streakFreezeDates ?? [],
      undefined,
      state.settings.streakFreezeBoughtOn ?? [],
    );
    if (result.consumed.length === 0) return;
    setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        streakFreezes: result.freezes,
        streakFreezeDates: result.frozenDates,
        streakFreezeBoughtOn: result.boughtOn,
      },
    }));
    toast(
      result.consumed.length === 1
        ? "❄️ یک یخ‌زدگی برای روز جامانده مصرف شد؛ زنجیره‌ات نشکست"
        : `❄️ ${toFaNum(result.consumed.length)} یخ‌زدگی برای روزهای جامانده مصرف شد`,
      "❄️",
    );
  }, [hydrated, state.sessions, state.settings.streakFreezes, state.settings.streakFreezeDates, state.settings.streakFreezeBoughtOn, toast]);

  // 🎖️ جشن لقب: اولین باری که به لقب تازه‌ای می‌رسی، یک‌بار خبرت می‌کند
  useEffect(() => {
    const title = levelTitle(levelFromXp(state.settings.xp).level);
    if (state.settings.lastTitle === title) return;
    const first = state.settings.lastTitle == null;
    setState((s) => ({ ...s, settings: { ...s.settings, lastTitle: title } }));
    if (!first) toast(`لقب تازه گرفتی: ${title}`, "🎖️");
  }, [state.settings.xp, state.settings.lastTitle, toast]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);

  const api = useMemo<StoreApi>(() => {
    const subjectPriorityMap = (s: AppState): Record<string, Priority> =>
      Object.fromEntries(s.subjects.map((sub) => [sub.id, sub.priority]));

    const addXp = (s: AppState, amount: number): AppState => ({
      ...s,
      settings: { ...s.settings, xp: Math.max(0, s.settings.xp + amount) },
    });

    /**
     * تیکِ «انجام شد» برای یک تسک — یک‌جا و خالص تا هم فهرست کارها و هم
     * «ثبت نتیجه‌ی مرور» از یک مسیر استفاده کنند:
     * ساعت مطالعه‌ی باقی‌مانده ثبت می‌شود، XP و پاداش هدف روزانه می‌رسد و اگر تسک
     * مال آینده بوده، معادلش از بار امروز به فردا می‌رود.
     */
    const completeTaskIn = (
      s: AppState,
      taskId: string,
      today: string,
    ): { state: AppState; remaining: number; movedMinutes: number } => {
      const t0 = s.tasks.find((t) => t.id === taskId);
      if (!t0 || t0.status === "done") return { state: s, remaining: 0, movedMinutes: 0 };
      const rem = Math.max(0, t0.plannedMinutes - t0.doneMinutes);
      const now = Date.now();
      const logSession: StudySession | null =
        rem > 0
          ? {
              id: defaultId(),
              topicId: t0.topicId,
              taskId: t0.id,
              startedAt: now - rem * 60_000,
              endedAt: now,
              durationMinutes: rem,
              rating: null,
              mode: "free",
              date: today,
              kind: t0.kind,
            }
          : null;
      let tasks = s.tasks.map((t) =>
        t.id === taskId ? { ...t, status: "done" as const, doneMinutes: Math.max(t.doneMinutes, t.plannedMinutes) } : t,
      );
      let movedMinutes = 0;
      if (rem > 0 && t0.date > today) {
        const reb = rebalanceToday(tasks, today, rem, t0.topicId, s.activeSession?.taskId);
        tasks = reb.tasks;
        movedMinutes = reb.movedMinutes;
      }
      const mult = xpStreakMultiplier(computeStreak(s.sessions, today, s.settings.streakFreezes, s.settings.streakFreezeDates, s.settings.streakFreezeBoughtOn));
      let xp = XP_PER_TASK + Math.round(rem * XP_PER_MINUTE * mult);
      const goalBonus = shouldAwardDailyGoalBonus(
        minutesOnDate(s.sessions, today), rem, s.settings.dailyGoalMinutes, s.settings.lastGoalBonusDate, today,
      );
      if (goalBonus) xp += XP_DAILY_GOAL_BONUS;
      const state = addXp(
        {
          ...s,
          tasks,
          sessions: rem > 0 && logSession ? [...s.sessions, { ...logSession, durationMinutes: rem }] : s.sessions,
          settings: goalBonus ? { ...s.settings, lastGoalBonusDate: today } : s.settings,
        },
        xp,
      );
      return { state, remaining: rem, movedMinutes };
    };

    // بازآموزی: هر مرور/جلسه‌ای که با تسلط کم (امتیاز ۰ یا ۱) تمام شود، برنامه
    // برای همان مبحث یادگیری دوباره در روزهای آینده می‌گذارد تا ضعف رها نشود.
    const scheduleRelearn = (topicId: string, rating: Rating) => {
      if (rating >= 2) return;
      const s = stateRef.current;
      const topic = s.topics.find((t) => t.id === topicId);
      if (!topic) return;
      const today = todayKey();
      const preview = buildRelearnTasks({ topic, rating, today, existingTasks: s.tasks });
      if (preview.length === 0) return;
      update((cur) => {
        const t = cur.topics.find((x) => x.id === topicId);
        if (!t) return cur;
        const fresh = buildRelearnTasks({ topic: t, rating, today, existingTasks: cur.tasks });
        if (fresh.length === 0) return cur;
        return { ...cur, tasks: [...cur.tasks, ...fresh] };
      });
      toast(
        rating === 0
          ? `تسلطت روی «${topic.name}» کافی نیست؛ بازآموزی برای فردا و ۳ روز دیگر برنامه‌ریزی شد`
          : `تسلطت روی «${topic.name}» کامل نیست؛ بازآموزی برای فردا برنامه‌ریزی شد`,
        "🩹",
      );
    };

    // ثبت آخرین حذف برای نوار «بازگردانی» — بعد از ~۷ ثانیه خودبه‌خود پاک می‌شود
    const markDeleted = (label: string, restore: () => void, trashId?: string, action: "delete" | "change" = "delete") => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      setDeleted({ label, restore, expiresAt: Date.now() + 7000, trashId, action });
      deleteTimer.current = setTimeout(() => setDeleted(null), 7000);
    };

    return {
      state,
      async replaceData(json, label = "پیش از بازیابی داده") {
        const before = stateRef.current;
        if (before.activeSession) { toast("ابتدا جلسهٔ فعال را پایان بده.", "⚠️"); return false; }
        try {
          const parsed = JSON.parse(json); const raw = parsed?.data ?? parsed;
          if (!Array.isArray(raw?.subjects) || !Array.isArray(raw?.topics) || !parseStateText(JSON.stringify(raw))) return false;
          await saveHistory(before, label);
          if (stateRef.current !== before) { toast("داده‌ها تغییر کردند؛ دوباره تلاش کن.", "⚠️"); return false; }
          const next = parseStateText(JSON.stringify(raw))!;
          // Local sync baselines must never be imported from another device.
          next.settings.supabase = { ...before.settings.supabase };
          next.settings.googleDrive = { ...before.settings.googleDrive };
          setState({ ...next, activeSession: null, settings: { ...next.settings, onboarded: true } });
          return true;
        } catch { toast("بازیابی انجام نشد؛ ذخیرهٔ نسخهٔ ایمنی یا اعتبارسنجی ناموفق بود.", "⚠️"); return false; }
      },
      applySchedule(tasks, fingerprint) {
        const current = stateRef.current;
        if (planningFingerprint(current) !== fingerprint) { toast("داده‌ها عوض شده‌اند؛ پیش‌نمایش تازه بساز.", "⚠️"); return false; }
        const original = new Map(current.tasks.map(t=>[t.id,t]));
        if (tasks.length !== current.tasks.length || new Set(tasks.map(t=>t.id)).size !== tasks.length || tasks.some(t=>{
          const before=original.get(t.id); if(!before)return true;
          if(before.status!=="pending" || before.id===current.activeSession?.taskId) return JSON.stringify(before)!==JSON.stringify(t);
          return JSON.stringify({...before,date:"",order:0})!==JSON.stringify({...t,date:"",order:0}) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date);
        })) { toast("پیش‌نمایش نامعتبر است؛ هیچ کاری حذف یا بازنویسی نشد.","⚠️"); return false; }
        const previous = current.tasks;
        update(s => ({ ...s, tasks }));
        markDeleted("بازچینی برنامه", () => update(s => {
          const before = new Map(previous.map(t => [t.id, t]));
          const applied = new Map(tasks.map(t => [t.id, t]));
          return { ...s, tasks: s.tasks.map(t => before.has(t.id) && JSON.stringify(t) === JSON.stringify(applied.get(t.id)) ? before.get(t.id)! : t) };
        }), undefined, "change");
        toast("برنامه با حفظ کارهای انجام‌شده اعمال شد.", "✅"); return true;
      },
      acceptPace(estimate, sampleKey) {
        const current = stateRef.current;
        const fresh = paceEstimates(current, todayKey()).find(e => e.subjectId === estimate.subjectId);
        if (!fresh || fresh.sampleKey !== sampleKey || JSON.stringify(fresh) !== JSON.stringify(estimate)) {
          toast("شواهد تخمین عوض شده‌اند؛ پیشنهاد تازه را بررسی کن.", "⚠️"); return;
        }
        const accepted = [...new Set([...(current.settings.paceAccepted?.[estimate.subjectId] ?? "").split("|"), ...sampleKey.split("|")].filter(Boolean).map(s => s.split(":")[0]))].sort().join("|");
        const changes = new Map(estimate.topicChanges.map(c => [c.id, c]));
        update(s => ({ ...s, topics: s.topics.map(t => changes.has(t.id) ? { ...t, estimatedMinutes: changes.get(t.id)!.after } : t), settings: { ...s.settings, paceAccepted: { ...s.settings.paceAccepted, [estimate.subjectId]: accepted } } }));
        toast("تخمین مباحث برای برنامه‌های بعدی اصلاح شد؛ برنامهٔ فعلی تغییر نکرد.", "✅");
      },
      saveSource(doc) {
        const sourceDocuments = [...(stateRef.current.sourceDocuments ?? []).filter(d => d.id !== doc.id), doc];
        if (!parseStateText(JSON.stringify({sourceDocuments}))) { toast("سقف منابع: ۳۰ منبع، هرکدام ۱۰۰ صفحه/۵۰۰هزار نویسه و مجموع ۲میلیون نویسه.","⚠️"); return false; }
        update(s => ({ ...s, sourceDocuments })); return true;
      },
      deleteSource(id) { update(s => ({ ...s, sourceDocuments: (s.sourceDocuments ?? []).filter(d => d.id !== id) })); },
      importSourceCards(drafts, topicId) {
        const s = stateRef.current; const fronts = new Set(s.flashcards.map(c => c.front.trim()));
        const fresh: Flashcard[] = [];
        for (const draft of drafts) {
          const doc = s.sourceDocuments?.find(d => d.id === draft.evidence.documentId);
          if (!doc || !sourceEvidenceValid(doc,draft.evidence) || !draft.front.trim() || !draft.back.trim() || !draft.evidence.quote.includes(draft.back.trim()) || fronts.has(draft.front.trim())) continue;
          fronts.add(draft.front.trim());
          fresh.push({ ...draft, front: draft.front.trim(), back: draft.back.trim(), topicId, id: defaultId(), createdAt: Date.now(), ef: 2.5, intervalDays: 0, repetitions: 0, lapses: 0, dueDate: todayKey() });
        }
        update(cur => ({ ...cur, flashcards: [...cur.flashcards, ...fresh] })); return fresh.length;
      },
      recordRemediation(attempt) { update(s => ({ ...s, remediationAttempts: [...(s.remediationAttempts ?? []), { ...attempt, id: defaultId(), createdAt: Date.now() }] })); },
      toast,
      lastDeleted: deleted,
      importedCuratedKeys: new Set(state.flashcards.filter((c) => c.packId).map((c) => curatedCardKey(c.packId!, c.front))),
      existingCardFronts: new Set(state.flashcards.map((c) => c.front.trim().toLowerCase())),
      undoDelete() {
        if (!deleted) return;
        deleted.restore();
        // چون با undo برگشت، آیتم سطل دیگر لازم نیست
        if (deleted.trashId) {
          const tid = deleted.trashId;
          update((cur) => ({ ...cur, trash: (cur.trash ?? []).filter((x) => x.id !== tid) }));
        }
        if (deleteTimer.current) clearTimeout(deleteTimer.current);
        setDeleted(null);
        toast("بازگردانی شد", "↩️");
      },

      addSubject(data) {
        const subject: Subject = { ...data, id: defaultId(), createdAt: Date.now() };
        update((s) => ({ ...s, subjects: [...s.subjects, subject] }));
        return subject;
      },
      updateSubject(id, patch) {
        update((s) => ({ ...s, subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      deleteSubject(id) {
        const s0 = stateRef.current;
        const subject = s0.subjects.find((x) => x.id === id);
        const subjectTrashSnap = snapshotSubject(s0, id);
        const subjectTrash = subjectTrashSnap ? makeTrashItem(defaultId(), "subject", subjectTrashSnap.label, subjectTrashSnap.snapshot) : null;
        if (subject) {
          const topicIds = new Set(s0.topics.filter((t) => t.subjectId === id).map((t) => t.id));
          const oldTopics = s0.topics.filter((t) => t.subjectId === id);
          const oldTasks = s0.tasks.filter((t) => topicIds.has(t.topicId));
          const oldReviews = s0.reviews.filter((r) => topicIds.has(r.topicId));
          const oldSessions = s0.sessions.filter((x) => x.topicId != null && topicIds.has(x.topicId));
          const oldCards = s0.flashcards.filter((c) => c.topicId != null && topicIds.has(c.topicId));
          const oldMistakes = (s0.mistakes ?? []).filter((m) => (m.topicId != null && topicIds.has(m.topicId)) || m.subjectId === id);
          const oldPlans = s0.plans.map((p) => ({ ...p, topicIds: [...p.topicIds] }));
          markDeleted(`درس «${subject.name}»`, () =>
            update((cur) => ({
              ...cur,
              subjects: [...cur.subjects, subject],
              topics: [...cur.topics, ...oldTopics],
              tasks: [...cur.tasks, ...oldTasks],
              reviews: [...cur.reviews, ...oldReviews],
              sessions: [...cur.sessions, ...oldSessions],
              flashcards: [...cur.flashcards, ...oldCards],
              mistakes: [...(cur.mistakes ?? []), ...oldMistakes],
              plans: oldPlans.map((op) => {
                const curPlan = cur.plans.find((cp) => cp.id === op.id);
                return curPlan ? { ...curPlan, topicIds: op.topicIds } : op;
              }),
            })),
            subjectTrash?.id,
          );
        }
        update((s) => {
          const topicIds = new Set(s.topics.filter((t) => t.subjectId === id).map((t) => t.id));
          return {
            ...s,
            subjects: s.subjects.filter((x) => x.id !== id),
            topics: s.topics.filter((t) => t.subjectId !== id),
            tasks: s.tasks.filter((t) => !topicIds.has(t.topicId)),
            reviews: s.reviews.filter((r) => !topicIds.has(r.topicId)),
            sessions: s.sessions.filter((x) => x.topicId == null || !topicIds.has(x.topicId)),
            flashcards: s.flashcards.filter((c) => c.topicId == null || !topicIds.has(c.topicId)),
            mistakes: (s.mistakes ?? []).filter((m) => !(m.topicId != null && topicIds.has(m.topicId)) && m.subjectId !== id),
            plans: s.plans.map((p) => ({ ...p, topicIds: p.topicIds.filter((t) => !topicIds.has(t)) })),
            activeSession: s.activeSession?.topicId != null && topicIds.has(s.activeSession.topicId) ? null : s.activeSession,
            trash: subjectTrash ? pushTrash(s.trash, subjectTrash) : s.trash,
          };
        });
      },
      addTopic(data) {
        const topic: Topic = { ...data, id: defaultId(), createdAt: Date.now() };
        update((s) => ({ ...s, topics: [...s.topics, topic] }));
        return topic;
      },
      updateTopic(id, patch) {
        update((s) => ({ ...s, topics: s.topics.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      deleteTopic(id) {
        const s0 = stateRef.current;
        const topic = s0.topics.find((t) => t.id === id);
        const kids = descendantsOf(id, s0.topics);
        const allIds = new Set([id, ...kids.map((k) => k.id)]);
        const topicTrashLabel = topic ? (kids.length > 0 ? `مبحث «${topic.name}» و ${kids.length} زیرمبحث` : `مبحث «${topic.name}»`) : "";
        const topicTrashSnap = topic ? snapshotTopics(s0, [id, ...kids.map((k) => k.id)], topicTrashLabel) : null;
        const topicTrash = topicTrashSnap ? makeTrashItem(defaultId(), "topic", topicTrashSnap.label, topicTrashSnap.snapshot) : null;
        if (topic) {
          const oldTopics = s0.topics.filter((t) => allIds.has(t.id));
          const oldTasks = s0.tasks.filter((t) => allIds.has(t.topicId));
          const oldReviews = s0.reviews.filter((r) => allIds.has(r.topicId));
          const oldSessions = s0.sessions.filter((x) => x.topicId != null && allIds.has(x.topicId));
          const oldCards = s0.flashcards.filter((c) => c.topicId != null && allIds.has(c.topicId));
          const oldMistakes = (s0.mistakes ?? []).filter((m) => m.topicId != null && allIds.has(m.topicId));
          const oldPlans = s0.plans.map((p) => ({ ...p, topicIds: [...p.topicIds] }));
          markDeleted(kids.length > 0 ? `مبحث «${topic.name}» و ${kids.length} زیرمبحث` : `مبحث «${topic.name}»`, () =>
            update((cur) => ({
              ...cur,
              topics: [...cur.topics, ...oldTopics],
              tasks: [...cur.tasks, ...oldTasks],
              reviews: [...cur.reviews, ...oldReviews],
              sessions: [...cur.sessions, ...oldSessions],
              flashcards: [...cur.flashcards, ...oldCards],
              mistakes: [...(cur.mistakes ?? []), ...oldMistakes],
              plans: oldPlans.map((op) => {
                const curPlan = cur.plans.find((cp) => cp.id === op.id);
                return curPlan ? { ...curPlan, topicIds: op.topicIds } : op;
              }),
            })),
            topicTrash?.id,
          );
        }
        update((s) => ({
          ...s,
          topics: s.topics.filter((t) => !allIds.has(t.id)),
          tasks: s.tasks.filter((t) => !allIds.has(t.topicId)),
          reviews: s.reviews.filter((r) => !allIds.has(r.topicId)),
          sessions: s.sessions.filter((x) => x.topicId == null || !allIds.has(x.topicId)),
          flashcards: s.flashcards.filter((c) => c.topicId == null || !allIds.has(c.topicId)),
          mistakes: (s.mistakes ?? []).filter((m) => m.topicId == null || !allIds.has(m.topicId)),
          plans: s.plans.map((p) => ({ ...p, topicIds: p.topicIds.filter((t) => !allIds.has(t)) })),
          activeSession: s.activeSession?.topicId != null && allIds.has(s.activeSession.topicId) ? null : s.activeSession,
          trash: topicTrash ? pushTrash(s.trash, topicTrash) : s.trash,
        }));
      },

      previewPlan(input) {
        const s = stateRef.current;
        const topics = s.topics.filter((t) => input.topicIds.includes(t.id));
        return generatePlan({
          planId: "preview",
          topics,
          subjectPriority: subjectPriorityMap(s),
          startDate: input.startDate,
          endDate: input.endDate,
          studyDays: input.studyDays,
          dailyMinutes: input.dailyMinutes,
        });
      },
      createPlan(input) {
        const plan: StudyPlan = { ...input, id: defaultId(), createdAt: Date.now(), archived: false };
        update((s) => {
          const topics = s.topics.filter((t) => input.topicIds.includes(t.id));
          const result = generatePlan({
            planId: plan.id,
            topics,
            subjectPriority: subjectPriorityMap(s),
            startDate: input.startDate,
            endDate: input.endDate,
            studyDays: input.studyDays,
            dailyMinutes: input.dailyMinutes,
          });
          return { ...s, plans: [...s.plans, plan], tasks: [...s.tasks, ...result.tasks] };
        });
        return plan;
      },
      previewSmartPlan(input) {
        const s = stateRef.current;
        const topics = leafTopics(s.topics.filter((t) => input.topicIds.includes(t.id)));
        return generateSmartPlan({
          planId: "preview",
          topics,
          subjects: s.subjects,
          startDate: input.startDate,
          endDate: input.endDate,
          examDate: input.examDate,
          studyDays: input.studyDays,
          dailyMinutes: input.dailyMinutes,
          classBlocks: s.classBlocks,
          reviewGaps: input.reviewGaps ?? s.settings.reviewIntervals.slice(0, 2),
          bufferDays: input.bufferDays,
          includeHolidays: input.includeHolidays,
          approaches: input.approaches,
          maxSubjectsPerDay: input.maxSubjectsPerDay,
          maxSessionMinutes: input.maxSessionMinutes,
          goldenFirst: input.goldenFirst,
          dailyMinutesByWeekday: input.dailyMinutesByWeekday,
          tasks: s.tasks,
          sessions: s.sessions,
        });
      },
      createSmartPlan(input) {
        trackFeature("smart_plan");
        const s0 = stateRef.current;
        const topics = leafTopics(s0.topics.filter((t) => input.topicIds.includes(t.id)));
        const result = generateSmartPlan({
          planId: "tmp",
          topics,
          subjects: s0.subjects,
          startDate: input.startDate,
          endDate: input.endDate,
          examDate: input.examDate,
          studyDays: input.studyDays,
          dailyMinutes: input.dailyMinutes,
          classBlocks: s0.classBlocks,
          reviewGaps: input.reviewGaps ?? s0.settings.reviewIntervals.slice(0, 2),
          bufferDays: input.bufferDays,
          includeHolidays: input.includeHolidays,
          approaches: input.approaches,
          maxSubjectsPerDay: input.maxSubjectsPerDay,
          maxSessionMinutes: input.maxSessionMinutes,
          goldenFirst: input.goldenFirst,
          dailyMinutesByWeekday: input.dailyMinutesByWeekday,
          tasks: s0.tasks,
          sessions: s0.sessions,
        });
        const smart: SmartPlanConfig = {
          examDate: input.examDate,
          bufferDays: result.bufferDates.length,
          reviewGaps: input.reviewGaps ?? s0.settings.reviewIntervals.slice(0, 2),
          maxSubjectsPerDay: input.maxSubjectsPerDay ?? 3,
          goldenFirst: input.goldenFirst ?? true,
          approaches: { ...input.approaches },
          maxSessionMinutes: input.maxSessionMinutes ?? 90,
          dailyMinutesByWeekday: input.dailyMinutesByWeekday ? { ...input.dailyMinutesByWeekday } : undefined,
          includeHolidays: input.includeHolidays ?? false,
        };
        const plan: StudyPlan = {
          goal: input.goal, startDate: input.startDate, endDate: input.endDate,
          topicIds: [...input.topicIds], studyDays: [...input.studyDays], dailyMinutes: input.dailyMinutes,
          id: defaultId(), createdAt: Date.now(), archived: false,
          smartNotes: result.notes, smart, smartDayReasons: result.dayReasons,
        };
        const tasks = result.tasks.map((t) => ({ ...t, planId: plan.id }));
        update((s) => ({
          ...s,
          subjects: s.subjects.map((sub) => (input.approaches[sub.id] ? { ...sub, approach: input.approaches[sub.id] } : sub)),
          plans: [...s.plans, plan],
          tasks: [...s.tasks, ...tasks],
        }));
        return plan;
      },
      duplicatePlan(id) {
        const s = stateRef.current;
        const plan = s.plans.find((p) => p.id === id);
        if (!plan) return;
        const newId = defaultId();
        const copy: StudyPlan = { ...plan, id: newId, goal: `${plan.goal} (کپی)`, createdAt: Date.now(), archived: false };
        const tasks = s.tasks
          .filter((x) => x.planId === id)
          .map((x) => ({ ...x, id: defaultId(), planId: newId, doneMinutes: 0, status: "pending" as const }));
        update((st) => ({ ...st, plans: [copy, ...st.plans], tasks: [...tasks, ...st.tasks] }));
        toast("برنامه تکثیر شد 📋", "✅");
      },
      toggleArchiveSubject(id) {
        const sub = stateRef.current.subjects.find((x) => x.id === id);
        if (!sub) return;
        const archived = !sub.archived;
        update((st) => ({ ...st, subjects: st.subjects.map((x) => (x.id === id ? { ...x, archived } : x)) }));
        toast(archived ? `«${sub.name}» بایگانی شد 📦` : `«${sub.name}» به فهرست برگشت 📂`, archived ? "📦" : "📂");
      },
      startCram(input) {
        const s = stateRef.current;
        const exam = input.examId ? s.exams.find((e) => e.id === input.examId) : undefined;
        const blocks = buildCramPlan({
          topics: s.topics,
          reviews: s.reviews,
          mistakes: s.mistakes ?? [],
          flashcards: s.flashcards,
          subjects: s.subjects,
          hours: input.hours,
          today: todayKey(),
          subjectId: input.subjectId || undefined,
        });
        if (blocks.length === 0) {
          toast("درس فعالی برای جنگیدن نیست", "⚠️");
          return;
        }
        update((st) => ({
          ...st,
          cram: {
            id: defaultId(),
            examId: exam?.id,
            examTitle: exam?.title,
            examDate: exam?.date,
            subjectId: input.subjectId || undefined,
            hours: input.hours,
            items: blocks.map((b) => ({ ...b, done: false })),
            createdAt: Date.now(),
            completedAt: null,
          },
        }));
        toast("حالت جنگی شروع شد 🏴‍☠️ موفق باشی، جنگجو!", "⚔️");
      },
      toggleCramItem(id) {
        const cur = stateRef.current.cram;
        if (!cur) return;
        const items = cur.items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
        const allDone = items.filter((i) => i.kind !== "break").every((i) => i.done);
        update((st) => (st.cram ? { ...st, cram: { ...st.cram, items, completedAt: allDone ? Date.now() : null } } : st));
        if (allDone && cur.completedAt == null) toast("جنگ را بردی! همه‌ی بلاک‌ها تمام شد 🏆", "🎉");
      },
      clearCram() {
        update((st) => ({ ...st, cram: null }));
      },
      deletePlan(id) {
        const s0 = stateRef.current;
        const snap = snapshotPlan(s0, id);
        const trashItem = snap ? makeTrashItem(defaultId(), "plan", snap.label, snap.snapshot) : null;
        update((s) => ({
          ...s,
          plans: s.plans.filter((p) => p.id !== id),
          tasks: s.tasks.filter((t) => t.planId !== id),
          trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash,
        }));
      },
      replanPlan(id) {
        const s = stateRef.current;
        const plan = s.plans.find((p) => p.id === id);
        if (!plan) return null;
        const today = todayKey();
        // برنامه‌ی هوشمند: تنظیم مجدد با همان موتور هوشمند و همان پیکربندی
        if (plan.smart) {
          const planTasks = s.tasks.filter((t) => t.planId === id);
          const keep = planTasks.filter((t) => t.status !== "pending");
          const doneByTopic: Record<string, number> = {};
          for (const t of planTasks) {
            const credit = t.status === "done" ? t.plannedMinutes : t.doneMinutes;
            doneByTopic[t.topicId] = (doneByTopic[t.topicId] ?? 0) + Math.max(0, credit);
          }
          const topics = leafTopics(s.topics.filter((t) => plan.topicIds.includes(t.id)));
          const end = plan.endDate < today ? addDays(today, 6) : plan.endDate;
          // مدل فعلی هر درس (اگر کاربر بعداً عوض کرده) بر پیکربندی ذخیره‌شده اولویت دارد
          const currentApproaches: Record<string, StudyApproach> = {};
          for (const sub of s.subjects) {
            if (sub.approach) currentApproaches[sub.id] = sub.approach;
          }
          const result = generateSmartPlan({
            planId: id,
            topics,
            subjects: s.subjects,
            startDate: plan.startDate > today ? plan.startDate : today,
            endDate: end,
            examDate: plan.smart.examDate,
            studyDays: plan.studyDays,
            dailyMinutes: plan.dailyMinutes,
            classBlocks: s.classBlocks,
            reviewGaps: plan.smart.reviewGaps,
            goldenFirst: plan.smart.goldenFirst,
            maxSubjectsPerDay: plan.smart.maxSubjectsPerDay,
            maxSessionMinutes: plan.smart.maxSessionMinutes,
            dailyMinutesByWeekday: plan.smart.dailyMinutesByWeekday,
            includeHolidays: plan.smart.includeHolidays,
            doneMinutesByTopic: doneByTopic,
            approaches: { ...plan.smart.approaches, ...currentApproaches },
            tasks: s.tasks,
            sessions: s.sessions,
          });
          update((cur) => ({
            ...cur,
            plans: cur.plans.map((x) => (x.id === id ? { ...x, endDate: end, smartNotes: result.notes, smartDayReasons: result.dayReasons } : x)),
            tasks: [...cur.tasks.filter((t) => t.planId !== id), ...keep, ...result.tasks],
          }));
          return result;
        }
        const { keep, created, result } = replanEngine({
          planId: id,
          tasks: s.tasks,
          topics: s.topics,
          subjectPriority: subjectPriorityMap(s),
          today,
          endDate: plan.endDate < today ? addDays(today, 6) : plan.endDate,
          studyDays: plan.studyDays,
          dailyMinutes: plan.dailyMinutes,
        });
        update((cur) => ({
          ...cur,
          plans: cur.plans.map((p) => (p.id === id && p.endDate < today ? { ...p, endDate: addDays(today, 6) } : p)),
          tasks: [...cur.tasks.filter((t) => t.planId !== id), ...keep, ...created],
        }));
        return result;
      },
      addTask(topicId, date, minutes) {
        update((s) => {
          const topic = s.topics.find((t) => t.id === topicId);
          const order = s.tasks.filter((t) => t.date === date).length;
          const task: StudyTask = {
            id: defaultId(),
            topicId,
            date,
            plannedMinutes: minutes,
            doneMinutes: 0,
            status: "pending",
            order,
            priority: topic?.priority ?? "medium",
          };
          return { ...s, tasks: [...s.tasks, task] };
        });
      },
      updateTask(id, patch) {
        update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
      },
      reorderTasks(orderedIds) {
        const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
        update((s) => ({ ...s, tasks: s.tasks.map((t) => (orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t)) }));
      },
      deleteTask(id) {
        const s0 = stateRef.current;
        const task = s0.tasks.find((t) => t.id === id);
        const taskTrash = task ? makeTrashItem(defaultId(), "task", "کار برنامه", { task }) : null;
        if (task) {
          const index = s0.tasks.findIndex((t) => t.id === id);
          markDeleted("کار برنامه", () =>
            update((cur) => {
              const tasks = [...cur.tasks];
              tasks.splice(Math.min(index, tasks.length), 0, task);
              return { ...cur, tasks };
            }),
            taskTrash?.id,
          );
        }
        update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id), trash: taskTrash ? pushTrash(s.trash, taskTrash) : s.trash }));
      },
      moveTask(id, date) {
        update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, date } : t)) }));
      },
      completeTask(id) {
        const s0 = stateRef.current;
        const task = s0.tasks.find((t) => t.id === id);
        if (!task || task.status === "done") return;
        const today = todayKey();
        // باقی‌مانده‌ی تسک همین حالا «خوانده شده» حساب می‌شود: هم در ساعت مطالعه ثبت
        // می‌شود و هم اگر تسک مال آینده باشد، معادلش از بار امروز به فردا منتقل می‌شود.
        // (همه‌ی این‌ها داخل completeTaskIn انجام می‌شود.)
        const remaining = Math.max(0, task.plannedMinutes - task.doneMinutes);
        // پیش‌نمایش بازچینی برای توست — محاسبه‌ی اصلی داخل update روی داده‌ی روز انجام می‌شود
        const advancePreview =
          remaining > 0 && task.date > today
            ? rebalanceToday(s0.tasks.map((t) => (t.id === id ? { ...t, status: "done" as const } : t)), today, remaining, task.topicId, s0.activeSession?.taskId)
            : null;
        update((s) => completeTaskIn(s, id, today).state);
        if (remaining > 0) {
          toast(`انجام شد؛ ${toFaNum(remaining)} دقیقه مطالعه هم برای این کار ثبت شد`, "✅");
        }
        if (advancePreview && advancePreview.movedMinutes > 0) {
          toast(`چون زودتر از موعد خواندی، ${toFaNum(advancePreview.movedMinutes)} دقیقه از برنامهٔ امروز به فردا منتقل شد`, "🧠");
        }
      },

      startSession(topicId, mode, taskId, targetMinutes) {
        trackFeature("session_start");
        const now = Date.now();
        // اگر جلسه از یک تسک برنامه شروع شده، نوع فعالیت همان تسک را به جلسه هم منتقل کن
        // تا پایان جلسه، زمان به تسک هم‌نوع واریز شود.
        const taskKind = taskId ? stateRef.current.tasks.find((t) => t.id === taskId)?.kind : undefined;
        const session: ActiveSession = {
          targetMinutes,
          topicId,
          // Time-only study must never change a scheduled task.
          taskId: topicId == null ? undefined : taskId,
          mode,
          phase: "work",
          cycle: 0,
          running: true,
          startedAt: now,
          accumulatedMs: 0,
          totalStudyMs: 0,
          sessionStartedAt: now,
          distractions: 0,
          kind: taskKind,
        };
        update((s) => {
          if (s.activeSession || (topicId != null && !s.topics.some((t) => t.id === topicId))) return s;
          return {
            ...s,
            activeSession: session,
            topics: s.topics.map((t) => (t.id === topicId && t.status === "not_started" ? { ...t, status: "learning" } : t)),
          };
        });
      },
      pauseSession() {
        update((s) => {
          const a = s.activeSession;
          if (!a || !a.running || a.startedAt == null) return s;
          const elapsed = Date.now() - a.startedAt;
          return {
            ...s,
            activeSession: {
              ...a,
              running: false,
              startedAt: null,
              accumulatedMs: a.accumulatedMs + elapsed,
              totalStudyMs: a.phase === "work" ? a.totalStudyMs + elapsed : a.totalStudyMs,
            },
          };
        });
      },
      resumeSession() {
        update((s) => {
          const a = s.activeSession;
          if (!a || a.running) return s;
          return { ...s, activeSession: { ...a, running: true, startedAt: Date.now() } };
        });
      },
      advancePhase() {
        update((s) => {
          const a = s.activeSession;
          if (!a) return s;
          const now = Date.now();
          const elapsed = a.running && a.startedAt != null ? now - a.startedAt : 0;
          const totalStudyMs = a.phase === "work" ? a.totalStudyMs + elapsed : a.totalStudyMs;
          let cycle = a.cycle;
          let phase: ActiveSession["phase"];
          if (a.phase === "work") {
            cycle += 1;
            phase = cycle % s.settings.pomodoro.cycles === 0 ? "long" : "short";
          } else {
            phase = "work";
          }
          return { ...s, activeSession: { ...a, phase, cycle, running: true, startedAt: now, accumulatedMs: 0, totalStudyMs } };
        });
      },
      discardSession() {
        update((s) => ({ ...s, activeSession: null }));
      },
      logDistraction() {
        update((s) => {
          const a = s.activeSession;
          if (!a || !a.running) return s; // فقط حین اجرای تایمر معنا دارد
          return { ...s, activeSession: { ...a, distractions: (a.distractions ?? 0) + 1 } };
        });
      },
      endSession(rating, kind) {
        trackFeature("session_end");
        const s = stateRef.current;
        const a = s.activeSession;
        if (!a) return null;
        // «چه شکلی خواندی؟» می‌تواند چند نوع باشد (درسنامه + تست در یک نوبت)
        const kinds = normalizeStudyKinds(kind ?? a.kind);
        const topicId = s.topics.find((t) => t.id === a.topicId)?.id ?? null;
        if (topicId != null && rating == null) return null; // topic study still requires an assessment
        const sessionRating = topicId == null ? null : rating;
        const now = Date.now();
        const elapsed = a.running && a.startedAt != null ? now - a.startedAt : 0;
        const totalMs = a.totalStudyMs + (a.phase === "work" ? elapsed : 0);
        const durationMinutes = Math.max(1, Math.round(totalMs / 60000));
        const today = todayKey();

        // صداهای تمرکزی که همین حالا پخش می‌شوند، برای آمارِ «با چه صدایی بیشتر می‌خوانی؟»
        // (از اسنپ‌شات سبک؛ چون موتور صوتی تنبل لود می‌شود، مستقیم از آن پرسیده نمی‌شود)
        let ambient: string[] | undefined;
        try {
          const ids = getAmbientSnapshot();
          if (ids.length > 0) ambient = [...ids];
        } catch {
          /* موتور صدا اختیاری است */
        }
        const distractions = a.distractions && a.distractions > 0 ? a.distractions : undefined;

        const session: StudySession = {
          id: defaultId(),
          topicId,
          taskId: topicId == null ? undefined : a.taskId,
          startedAt: a.sessionStartedAt,
          endedAt: now,
          durationMinutes,
          rating: sessionRating,
          mode: a.mode,
          date: today,
          cycles: a.mode === "pomodoro" && a.cycle > 0 ? a.cycle : undefined,
          ambient,
          distractions,
          // نوع فعالیت: انتخاب صریح کاربر (تک یا چندنوع)، یا نوع تسکی که جلسه از آن شروع شده
          kind: collapseStudyKinds(kinds),
          kinds: kinds.length > 1 ? kinds : undefined,
        };

        // ---- مرورِ فاصله‌دار: «خواندن» جای «مرور کردن» را نمی‌گیرد ----
        // فقط جلسه‌ای که خودِ کاربر با 🔁 مرور علامتش زده، زنجیره‌ی فاصله‌دار را جلو می‌برد.
        // اگر همین حالا مرورِ سررسیدشده‌ی مبحث را نخوانده‌ای، مرورهای در انتظار سرِ جایشان
        // می‌مانند (قبلاً یک جلسه‌ی یادگیری آن‌ها را حذف/جلو می‌برد — همان حسِ «مرور کم شد»).
        // استثنا: مبحثی که هنوز هیچ مروری ندارد، مثل قبل اولین مرورش را از همین جلسه می‌گیرد.
        const topicReviews = topicId != null ? s.reviews.filter((r) => r.topicId === topicId) : [];
        const isReviewSession = kinds.includes("review");
        const shouldScheduleReview =
          topicId != null && sessionRating != null && (isReviewSession || topicReviews.length === 0);
        const previous = [...topicReviews].sort((x, y) => y.reviewNumber - x.reviewNumber)[0] ?? null;
        const review = shouldScheduleReview
          ? defaultScheduler.next({
              topicId: topicId as string,
              previous,
              rating: sessionRating as Rating,
              today,
              intervals: s.settings.reviewIntervals,
              idFactory: defaultId,
            })
          : null;

        const newStatus: Topic["status"] = sessionRating === 3 ? "mastered" : sessionRating === 2 ? "learning" : "needs_review";

        // پیش‌نمایش واریز برای توستِ بعد از ثبت — محاسبه‌ی اصلی داخل update روی داده‌ی روز انجام می‌شود
        const creditPreview =
          topicId != null
            ? creditStudyToTasks({ tasks: s.tasks, topicId, minutes: durationMinutes, today, kinds, preferTaskId: session.taskId })
            : null;
        // دقیقه‌هایی که به هیچ تسکی واریز نشدند. اگر مبحث اصلاً در هیچ برنامه‌ای نیست،
        // این عدد معنایی ندارد و توست هم نمی‌دهیم؛ فقط وقتی «برنامه‌اش تمام شده» خبر می‌دهیم.
        const topicHasPlan = topicId != null && s.tasks.some((t) => t.topicId === topicId);
        const unplanned = topicId != null && topicHasPlan ? (creditPreview?.unplannedMinutes ?? 0) : 0;
        if (unplanned > 0) session.unplannedMinutes = unplanned;
        update((cur) => {
          if (!cur.activeSession || cur.activeSession.sessionStartedAt !== a.sessionStartedAt) return cur; // ignore a repeated end
          let tasks = cur.tasks;
          if (topicId != null && durationMinutes > 0) {
            // هماهنگی با برنامه: زمانِ خوانده‌شده به تسک‌های همان مبحث واریز می‌شود —
            // اول تسکِ خودِ جلسه، بعد بقیه‌ی تسک‌های در انتظار (ترجیحاً هم‌نوعِ فعالیت).
            // اگر تسکِ آینده پر شد، معادلش از بار امروز به فردا می‌رود.
            const credit = creditStudyToTasks({
              tasks: cur.tasks,
              topicId,
              minutes: durationMinutes,
              today,
              kinds,
              preferTaskId: session.taskId,
            });
            tasks = credit.tasks;
          }
          if (session.taskId && sessionRating != null && sessionRating >= 2) {
            // ارزیابی خوب یعنی تسکِ جلسه کامل است، حتی اگر دقیقه‌ها کمتر از برنامه باشد
            tasks = tasks.map((t) =>
              t.id === session.taskId && t.topicId === topicId
                ? { ...t, status: "done" as const, doneMinutes: Math.max(t.doneMinutes, t.plannedMinutes) }
                : t,
            );
          }
          const prevTopic = cur.topics.find((t) => t.id === topicId);
          // پاداش زنجیره: هرچه روزهای پیاپیِ مطالعه بیشتر، امتیاز هر دقیقه بیشتر
          const mult = xpStreakMultiplier(computeStreak(cur.sessions, today, cur.settings.streakFreezes, cur.settings.streakFreezeDates, cur.settings.streakFreezeBoughtOn));
          let xp = Math.round(durationMinutes * XP_PER_MINUTE * mult);
          if (prevTopic && newStatus === "mastered" && prevTopic.status !== "mastered") xp += XP_PER_MASTERED;
          if (session.taskId && tasks.find((t) => t.id === session.taskId)?.status === "done" && cur.tasks.find((t) => t.id === session.taskId)?.status !== "done") xp += XP_PER_TASK;
          // پاداش یک‌بار در روز برای رسیدن به هدف مطالعه‌ی روزانه
          const goalBonus = shouldAwardDailyGoalBonus(
            minutesOnDate(cur.sessions, today),
            durationMinutes,
            cur.settings.dailyGoalMinutes,
            cur.settings.lastGoalBonusDate,
            today,
          );
          if (goalBonus) xp += XP_DAILY_GOAL_BONUS;
          return addXp(
            {
              ...cur,
              activeSession: null,
              sessions: [...cur.sessions, session],
              tasks,
              topics: cur.topics.map((t) => (t.id === topicId ? { ...t, status: newStatus } : t)),
              settings: goalBonus ? { ...cur.settings, lastGoalBonusDate: today } : cur.settings,
              // مرورهای در انتظار فقط وقتی دست می‌خورند که خودِ جلسه «مرور» بوده باشد؛
              // جلسه‌ی یادگیری/تست هیچ مروری را حذف، جلو یا «انجام‌شده» نمی‌کند.
              // در جلسه‌ی مرور: مرورِ سررسیدشده «انجام‌شده» ثبت می‌شود (سابقه می‌ماند) و
              // مرورِ آیندهی بدون سررسید جای خود را به مرور تازه می‌دهد.
              reviews: review
                ? isReviewSession
                  ? [
                      ...cur.reviews
                        .map((r) =>
                          r.topicId === topicId && r.status === "pending" && r.dueDate <= today
                            ? { ...r, status: "done" as const, completedAt: Date.now(), rating: sessionRating ?? undefined }
                            : r,
                        )
                        .filter((r) => !(r.topicId === topicId && r.status === "pending")),
                      review,
                    ]
                  : [...cur.reviews, review]
                : cur.reviews,
            },
            xp,
          );
        });
        if (creditPreview && creditPreview.movedMinutes > 0) {
          toast(`چون زودتر از موعد خواندی، ${toFaNum(creditPreview.movedMinutes)} دقیقه از برنامهٔ امروز به فردا منتقل شد`, "🧠");
        }
        if (unplanned > 0) {
          const topicName = s.topics.find((t) => t.id === topicId)?.name ?? "این مبحث";
          toast(
            `${toFaNum(unplanned)} دقیقه بیشتر از برنامهٔ «${topicName}» خواندی؛ فقط در آمار ثبت شد و هیچ مروری از برنامه کم نشد`,
            "📚",
          );
        }
        // ارزیابی ضعیف بعد از مطالعه = تسلط ناکافی → برنامه یادگیری دوباره می‌گذارد
        if (topicId != null && sessionRating != null && sessionRating <= 1) {
          scheduleRelearn(topicId, sessionRating);
        }
        const keptReviewDue =
          review == null && topicId != null
            ? s.reviews
                .filter((r) => r.topicId === topicId && r.status === "pending")
                .sort((x, y) => x.dueDate.localeCompare(y.dueDate))[0]?.dueDate ?? null
            : null;
        return { session, review, keptReviewDue };
      },

      completeReview(id, rating, opts) {
        trackFeature("review_done");
        const s = stateRef.current;
        const review = s.reviews.find((r) => r.id === id);
        if (!review || review.status === "done") return;
        const today = todayKey();
        const next = defaultScheduler.next({
          topicId: review.topicId,
          previous: review,
          rating,
          today,
          intervals: s.settings.reviewIntervals,
          idFactory: defaultId,
        });
        const status: Topic["status"] = rating === 3 ? "mastered" : rating >= 2 ? "learning" : "needs_review";
        let taskMinutes = 0;
        update((cur) => {
          const withReview = addXp(
            {
              ...cur,
              reviews: [
                ...cur.reviews.map((r) => (r.id === id ? { ...r, status: "done" as const, completedAt: Date.now(), rating } : r)),
                next,
              ],
              topics: cur.topics.map((t) => (t.id === review.topicId ? { ...t, status } : t)),
            },
            XP_PER_REVIEW,
          );
          // اگر همین مرور، تسکِ «مرور» خودِ برنامه را هم پوشش می‌دهد، هر دو یک‌جا تمام می‌شوند
          // (قبلاً تسکِ برنامه بسته می‌شد ولی مرورِ فاصله‌دار باز می‌ماند و همان روز دوباره
          // به‌عنوان مرورِ سررسیدشده نشان داده می‌شد).
          const ids = opts?.completeTaskIds ?? [];
          if (ids.length === 0) return withReview;
          return ids.reduce((acc, taskId) => {
            const res = completeTaskIn(acc, taskId, today);
            taskMinutes += res.remaining;
            return res.state;
          }, withReview);
        });
        if (taskMinutes > 0) {
          toast(`مرور ثبت شد؛ ${toFaNum(taskMinutes)} دقیقه هم برای تسک مرورِ برنامه ثبت شد`, "✅");
        }
        // مرور ضعیف = تسلط ناکافی → برنامه یادگیری دوباره می‌گذارد
        scheduleRelearn(review.topicId, rating);
      },
      relearnForTopic(topicId, rating) {
        scheduleRelearn(topicId, rating);
      },
      async clearScheduledReviews(options) {
        const before = stateRef.current;
        if (before.activeSession) { toast("ابتدا جلسهٔ فعال را پایان بده؛ مرورها پاک نشدند.", "⚠️"); return false; }
        const targets = scheduledReviewTargets(before, options);
        if (!targets.reviews.length && !targets.tasks.length) return false;
        try {
          await saveHistory(before, "پیش از پاک‌کردن مرورهای برنامه‌ریزی‌شده");
          if (stateRef.current !== before) {
            toast("داده‌ها تغییر کردند؛ تعداد مرورها را دوباره بررسی و تأیید کن.", "⚠️"); return false;
          }
          const reviews = new Set(targets.reviews.map(r => r.id));
          const tasks = new Set(targets.tasks.map(t => t.id));
          update(s => ({...s, reviews: s.reviews.filter(r => !reviews.has(r.id)), tasks: s.tasks.filter(t => !tasks.has(t.id))}));
          toast("مرورهای انتخاب‌شده پاک شدند؛ نسخهٔ قبلی در تنظیمات ← وضعیت ذخیره و تاریخچه قابل بازیابی است.", "✅");
          return true;
        } catch {
          toast("ذخیرهٔ نسخهٔ ایمنی ناموفق بود؛ هیچ مروری پاک نشد.", "⚠️"); return false;
        }
      },
      postponeReview(id, days) {
        update((s) => ({
          ...s,
          reviews: s.reviews.map((r) => (r.id === id ? { ...r, dueDate: addDays(r.dueDate < todayKey() ? todayKey() : r.dueDate, days) } : r)),
        }));
      },


      // ---- فلش‌کارت‌ها (SM-2) ----
      addFlashcard(data) {
        const card: Flashcard = {
          id: defaultId(),
          topicId: data.topicId,
          front: data.front,
          back: data.back,
          ef: 2.5,
          intervalDays: 0,
          repetitions: 0,
          dueDate: data.dueDate ?? todayKey(),
          lapses: 0,
          createdAt: Date.now(),
        };
        update((s) => ({ ...s, flashcards: [...s.flashcards, card] }));
        return card;
      },
      updateFlashcard(id, patch) {
        update((s) => ({
          ...s,
          flashcards: s.flashcards.map((c) => {
            if (c.id !== id) return c;
            const next = { ...c, ...patch, evidence: patch.back != null && patch.back !== c.back ? undefined : (patch.evidence ?? c.evidence) };
            // 🖍 با ویرایشِ متن، نشانه‌گذاری‌ها تا حدِ ممکن حفظ و در صورت لزوم جابه‌جا می‌شوند
            if (next.annotations && (patch.front != null || patch.back != null)) {
              let list = next.annotations;
              if (patch.front != null) list = remapAnnotationsForText(list, next.front, "front");
              if (patch.back != null) list = remapAnnotationsForText(list, next.back, "back");
              next.annotations = list.length > 0 ? list : undefined;
            }
            return next;
          }),
        }));
      },
      deleteFlashcard(id) {
        const card = stateRef.current.flashcards.find((c) => c.id === id);
        const trashItem = card ? makeTrashItem(defaultId(), "flashcard", `فلش‌کارت «${card.front.slice(0, 32)}»`, { card }) : null;
        update((s) => ({ ...s, flashcards: s.flashcards.filter((c) => c.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
      },
      reviewFlashcard(id, quality) {
        trackFeature("card_review");
        const s = stateRef.current;
        const card = s.flashcards.find((c) => c.id === id);
        if (!card) return;
        const today = todayKey();
        // الگوریتم انتخابی کاربر: FSRS پیشرفته یا SM-2 کلاسیک (پیش‌فرض).
        // هر دو مسیر همان چهار دکمه‌ی ارزیابی را مصرف می‌کنند.
        const next =
          s.settings.srsAlgorithm === "fsrs"
            ? calculateFsrsNext(card, mapQualityToFsrs(quality), today)
            : sm2Next(card, { quality, today });
        update((cur) => addXp({ ...cur, flashcards: cur.flashcards.map((c) => (c.id === id ? next : c)) }, XP_PER_CARD));
      },
      importCuratedCards(packId, cardIndices) {
        const s = stateRef.current;
        const pack = curatedPackById(packId);
        if (!pack || cardIndices.length === 0) return 0;
        const topic = s.topics.find((t) => t.sampleId === (pack.topicSampleId ?? pack.id));
        const existing = new Set(s.flashcards.filter((c) => c.packId).map((c) => curatedCardKey(c.packId!, c.front)));
        const fronts = new Set(s.flashcards.map((c) => c.front.trim().toLowerCase()));
        const today = todayKey();
        const fresh: Flashcard[] = [];
        for (const i of cardIndices) {
          const src = pack.cards[i];
          if (!src) continue;
          if (existing.has(curatedCardKey(packId, src.f))) continue; // قبلاً اضافه شده
          if (fronts.has(src.f.trim().toLowerCase())) continue; // کارتِ هم‌متنِ خودِ کاربر
          fresh.push({
            id: defaultId(),
            topicId: topic?.id,
            front: src.f,
            back: src.b,
            ef: 2.5,
            intervalDays: 0,
            repetitions: 0,
            dueDate: today,
            lapses: 0,
            createdAt: Date.now(),
            origin: "curated",
            packId,
          });
          fronts.add(src.f.trim().toLowerCase());
        }
        if (fresh.length > 0) update((cur) => ({ ...cur, flashcards: [...cur.flashcards, ...fresh] }));
        return fresh.length;
      },
      toggleCardNeedsCheck(id) {
        update((s) => ({
          ...s,
          flashcards: s.flashcards.map((c) => {
            if (c.id !== id) return c;
            return c.needsCheck ? { ...c, needsCheck: false, needsCheckAt: undefined } : { ...c, needsCheck: true, needsCheckAt: Date.now() };
          }),
        }));
      },

      updateCardNote(id, note) {
        const text = note.trim().slice(0, 5000);
        update((s) => ({
          ...s,
          flashcards: s.flashcards.map((c) =>
            c.id === id ? { ...c, note: text || undefined, noteUpdatedAt: Date.now() } : c,
          ),
        }));
      },
      toggleCardBookmark(id) {
        update((s) => ({
          ...s,
          flashcards: s.flashcards.map((c) =>
            c.id === id ? { ...c, bookmark: !c.bookmark, bookmarkedAt: c.bookmark ? undefined : Date.now() } : c,
          ),
        }));
      },
      toggleCardHighlight(id, text) {
        const term = text.trim().slice(0, 300);
        if (!term) return;
        update((s) => ({
          ...s,
          flashcards: s.flashcards.map((c) => {
            if (c.id !== id) return c;
            const current = c.highlights ?? [];
            const exists = current.includes(term);
            const highlights = exists ? current.filter((h) => h !== term) : [...current, term].slice(-40);
            return { ...c, highlights: highlights.length > 0 ? highlights : undefined };
          }),
        }));
      },
      updateCardAnnotations(id, annotations) {
        // یک‌بار پاک‌سازی/مرتب‌سازی/حذف تکراری تا دادهٔ خراب یا تکراری وارد کارت نشود
        const clean = normalizeAnnotations(annotations);
        update((s) => ({
          ...s,
          flashcards: s.flashcards.map((c) => (c.id === id ? { ...c, annotations: clean.length > 0 ? clean : undefined } : c)),
        }));
      },
      saveCardQuestion(question) {
        update((s) => {
          const list = s.cardQuestions ?? [];
          const idx = list.findIndex((q) => q.id === question.id || (q.cardId === question.cardId && q.kind === question.kind));
          const next = idx >= 0 ? list.map((q, i) => (i === idx ? { ...question, createdAt: Date.now() } : q)) : [...list, { ...question, createdAt: Date.now() }];
          return { ...s, cardQuestions: next };
        });
      },
      saveCardQuestions(questions) {
        if (questions.length === 0) return;
        update((s) => {
          const map = new Map((s.cardQuestions ?? []).map((q) => [q.id, q]));
          for (const q of questions) map.set(q.id, q);
          return { ...s, cardQuestions: [...map.values()] };
        });
      },
      flagCardQuestion(id) {
        update((s) => ({
          ...s,
          cardQuestions: (s.cardQuestions ?? []).map((q) => (q.id === id ? { ...q, status: q.status === "flagged" ? "ok" : "flagged" } : q)),
        }));
      },
      deleteCardQuestion(id) {
        update((s) => ({ ...s, cardQuestions: (s.cardQuestions ?? []).filter((q) => q.id !== id) }));
      },
      recordCardAttempt(attempt) {
        const row: CardAttempt = { ...attempt, id: defaultId(), at: attempt.at ?? Date.now() };
        update((s) => ({ ...s, cardAttempts: [...(s.cardAttempts ?? []), row].slice(-5000) }));
      },
      saveFlashSession(result) {
        const row: FlashSessionResult = { ...result, id: defaultId(), endedAt: result.endedAt ?? Date.now() };
        update((s) => ({ ...s, flashSessions: [...(s.flashSessions ?? []), row].slice(-400) }));
      },
      recordBankAnswer(question, selectedIndex, correct, ms) {
        const row = makeBankAttempt(question, selectedIndex, correct, ms);
        update((s) => ({ ...s, examBankAttempts: [...(s.examBankAttempts ?? []), row].slice(-20000) }));
      },
      saveBankSession(result) {
        update((s) => ({
          ...s,
          examBankSessions: [...(s.examBankSessions ?? []), { ...result, id: result.id ?? defaultId() }].slice(-300),
        }));
      },
      toggleBankBookmark(questionId) {
        update((s) => {
          const list = s.examBankBookmarks ?? [];
          const has = list.includes(questionId);
          return { ...s, examBankBookmarks: has ? list.filter((id) => id !== questionId) : [...list, questionId].slice(-3000) };
        });
      },
      addFlashcardsFromQuestion(question, points) {
        const texts = [...new Set(points.map((p) => p.trim()).filter((p) => p.length >= 6))].slice(0, 8);
        if (texts.length === 0) return { added: 0 };
        const s = stateRef.current;
        // تطبیق مبحث با نام (مبحث موجود کاربر) — وگرنه مبحث تازه در همان درس/«بانک آزمون»
        const subject =
          s.subjects.find((x) => x.name.trim() === question.subject.trim()) ??
          s.subjects.find((x) => x.name.includes(question.subject) || question.subject.includes(x.name));
        let topic =
          s.topics.find((t) => t.name.trim() === question.topicTitle.trim() && (!subject || t.subjectId === subject.id)) ??
          s.topics.find((t) => t.name.trim() === question.topicTitle.trim());
        let subjectId = topic?.subjectId ?? subject?.id;
        const today = todayKey();
        const now = Date.now();
        const newTopicId = topic ? topic.id : defaultId();
        const newSubjectId = subjectId ?? defaultId();
        const existingFronts = new Set(s.flashcards.map((c) => `${c.topicId ?? ""}|${c.front.trim().toLowerCase()}`));
        const fresh: Flashcard[] = [];
        for (const point of texts) {
          const front = `📌 ${point}`;
          const key = `${newTopicId}|${front.toLowerCase()}`;
          // اگر همان نکته قبلاً از همین سؤال ساخته شده باشد، تکرار نمی‌شود
          if (existingFronts.has(key)) continue;
          if (s.flashcards.some((c) => c.sourceQuestion?.questionId === question.id && c.front === front)) continue;
          existingFronts.add(key);
          fresh.push({
            id: defaultId(),
            topicId: newTopicId,
            front,
            back: `${question.explanation}\n\n— از سؤال ${toFaNum(question.year)} (${question.examType === "residency" ? "دستیاری" : "پره‌انترنی"})`,
            ef: 2.5,
            intervalDays: 0,
            repetitions: 0,
            dueDate: today,
            lapses: 0,
            createdAt: now,
            origin: "user",
            sourceQuestion: {
              questionId: question.id,
              stem: question.stem,
              examType: question.examType,
              year: question.year,
              topicTitle: question.topicTitle,
            },
          });
        }
        if (fresh.length === 0) return { added: 0, topicId: newTopicId };
        update((cur) => {
          const draft: AppState = { ...cur };
          if (!subjectId) {
            draft.subjects = [
              ...cur.subjects,
              { id: newSubjectId, name: question.subject || "بانک آزمون", color: SUBJECT_COLORS[cur.subjects.length % SUBJECT_COLORS.length], priority: "medium", createdAt: now },
            ];
            subjectId = newSubjectId;
          }
          if (!topic) {
            draft.topics = [
              ...cur.topics,
              { id: newTopicId, subjectId: subjectId!, name: question.topicTitle, volume: 0, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: now },
            ];
          }
          draft.flashcards = [...cur.flashcards, ...fresh];
          return addXp(draft, fresh.length * 2);
        });
        return { added: fresh.length, topicId: newTopicId };
      },
      prepareCardQuestions(cardIds, kind = "mcq") {
        const s = stateRef.current;
        const wanted = new Set(cardIds);
        const cards = s.flashcards.filter((c) => wanted.has(c.id));
        if (cards.length === 0) return { created: 0, rebuilt: 0, unsupported: 0 };
        const result = ensureQuestionsForCards(cards, s.flashcards, s.cardQuestions ?? [], {
          kind,
          topics: s.topics,
        });
        if (result.created + result.rebuilt > 0) {
          // ادغام (نه جایگزینی): آماده‌سازیِ دو نوع سؤال پشتِ‌سرهم، سؤال‌های قبلی را پاک نکند
          update((cur) => {
            const map = new Map((cur.cardQuestions ?? []).map((q) => [q.id, q]));
            for (const q of result.questions) map.set(q.id, q);
            return { ...cur, cardQuestions: [...map.values()] };
          });
        }
        return { created: result.created, rebuilt: result.rebuilt, unsupported: result.unsupported.length };
      },
      importCardPackageText(text) {
        const s = stateRef.current;
        const parsed = parseCardPackage(text);
        if (!parsed.ok) return { ok: false, error: parsed.error, added: 0, topics: 0 };
        const plan = planCardPackageImport(parsed.pkg, { topics: s.topics, subjects: s.subjects, cards: s.flashcards });
        if (plan.cardsToAdd.length === 0 && plan.topicsToCreate.length === 0) {
          return { ok: true, plan, added: 0, topics: 0 };
        }
        const now = Date.now();
        // درس‌های تازه: یک‌بار برای هر نامِ یکتا ساخته می‌شوند (نه برای هر مبحث)
        const subjectNamesToCreate = [...new Set(plan.topicsToCreate.map((t) => t.newSubjectName).filter(Boolean))];
        const newSubjectIdByName = new Map(subjectNamesToCreate.map((name) => [name, defaultId()]));
        const subjectIdByKey = new Map<string, string>();
        for (const t of plan.topicsToCreate) {
          let subjectId = t.newSubjectName
            ? newSubjectIdByName.get(t.newSubjectName)
            : s.subjects.find((sub) => normalizeName(sub.name) === normalizeName(t.subjectName))?.id;
          if (!subjectId) {
            // درسِ ناموجود با نامِ متفاوت (مثلاً فاصله/نویسهٔ عربی) — درس تازه ساخته می‌شود
            subjectId = defaultId();
            newSubjectIdByName.set(t.subjectName || t.newSubjectName, subjectId);
          }
          subjectIdByKey.set(t.key, subjectId);
        }
        const topicIdByKey = new Map<string, string>();
        for (const t of plan.topicsToCreate) {
          const subjectId = subjectIdByKey.get(t.key);
          if (!subjectId) continue;
          topicIdByKey.set(t.key, defaultId());
        }
        update((cur) => {
          const topics = [...cur.topics];
          for (const t of plan.topicsToCreate) {
            const id = topicIdByKey.get(t.key);
            const subjectId = subjectIdByKey.get(t.key);
            if (!id || !subjectId || topics.some((x) => x.id === id)) continue;
            topics.push({
              id,
              subjectId,
              name: t.name,
              volume: 10,
              estimatedMinutes: 60,
              priority: "medium",
              difficulty: 2,
              status: "not_started",
              createdAt: now,
            });
          }
          const cards: Flashcard[] = plan.cardsToAdd.map((c) => ({
            id: defaultId(),
            topicId: c.matchedTopicId ?? (c.newTopicKey ? topicIdByKey.get(c.newTopicKey) : undefined),
            front: c.front,
            back: c.back,
            ef: 2.5,
            intervalDays: 0,
            repetitions: 0,
            dueDate: todayKey(),
            lapses: 0,
            createdAt: now,
            note: c.note,
            highlights: c.highlights,
            bookmark: c.bookmarked === true,
          }));
          return {
            ...cur,
            subjects: [
              ...cur.subjects,
              ...[...newSubjectIdByName.entries()]
                .filter(([name]) => !cur.subjects.some((sub) => normalizeName(sub.name) === normalizeName(name)))
                .map(([name, id]) => ({
                  id,
                  name,
                  color: "#0ea5a4",
                  priority: "medium" as const,
                  approach: "mixed" as const,
                  createdAt: now,
                })),
            ],
            topics,
            flashcards: [...cur.flashcards, ...cards],
          };
        });
        return { ok: true, plan, added: plan.cardsToAdd.length, topics: plan.topicsToCreate.length };
      },
      savePlanEdit(planId, patch) {
        const out = { applied: 0, skipped: 0 };
        const moves = patch.moves ?? [];
        update((s) => {
          const plan = s.plans.find((p) => p.id === planId);
          if (!plan) {
            out.skipped = moves.length;
            return s;
          }
          const today = todayKey();
          const add = [...new Set(patch.add ?? [])];
          const remove = new Set(patch.remove ?? []);
          const topicIds = [
            ...plan.topicIds.filter((id) => !remove.has(id)),
            ...add.filter((id) => !plan.topicIds.includes(id) && !remove.has(id)),
          ];
          const dailyMinutes =
            patch.dailyMinutes != null ? Math.max(15, Math.min(24 * 60, Math.round(patch.dailyMinutes))) : plan.dailyMinutes;
          const studyDays =
            patch.studyDays && patch.studyDays.length > 0 ? [...new Set(patch.studyDays)].sort((a, b) => a - b) : plan.studyDays;
          const endDate = patch.endDate ?? plan.endDate;
          const nextPlan: StudyPlan = { ...plan, endDate, dailyMinutes, studyDays, topicIds };
          const topics = patch.priorities
            ? s.topics.map((t) => (patch.priorities && patch.priorities[t.id] ? { ...t, priority: patch.priorities[t.id] } : t))
            : s.topics;
          const configChanged =
            endDate !== plan.endDate ||
            dailyMinutes !== plan.dailyMinutes ||
            studyDays.join(",") !== [...plan.studyDays].sort((a, b) => a - b).join(",");
          const topicsChanged = add.length > 0 || remove.size > 0;
          const prioritiesChanged = s.topics.some((t) => {
            const p = patch.priorities?.[t.id];
            return p != null && t.priority !== p;
          });
          // فقط «جابه‌جایی» تغییر کرده: بدون بازچینش، همان تسک‌های فعلی جابه‌جا می‌شوند
          // (شناسه‌ها معتبرند و بقیهٔ برنامه دست نمی‌خورد — دقیق‌ترین حالت).
          if (!configChanged && !topicsChanged && !prioritiesChanged) {
            const moved = applyTaskMoves(
              s.tasks,
              planId,
              moves.map((m) => ({ taskId: m.taskId, target: m.date })),
              today,
              endDate,
            );
            out.applied = moved.applied;
            out.skipped = moved.skipped;
            return moved.applied > 0 ? { ...s, tasks: moved.tasks } : s;
          }
          // بازچینش انجام می‌شود؛ امضای تسک‌های جابه‌جاشده را از وضعیت *قبل* می‌گیریم.
          const resolved = moves
            .map((m) => {
              const t = s.tasks.find((x) => x.id === m.taskId);
              return t
                ? { sig: planMoveSignature(t), topicId: t.topicId, plannedMinutes: t.plannedMinutes, order: t.order, target: m.date }
                : null;
            })
            .filter((x): x is { sig: string; topicId: string; plannedMinutes: number; order: number; target: string } => x != null);
          out.skipped = moves.length - resolved.length;
          const withEdits: AppState = {
            ...s,
            topics,
            plans: s.plans.map((p) => (p.id === planId ? nextPlan : p)),
            tasks: s.tasks.filter((t) => !(t.planId === planId && t.status === "pending" && remove.has(t.topicId))),
          };
          const { next } = replanState(withEdits, nextPlan);
          const moved = applyTaskMoves(next.tasks, planId, resolved, today, endDate);
          out.applied = moved.applied;
          out.skipped += moved.skipped;
          return moved.applied > 0 ? { ...next, tasks: moved.tasks } : next;
        });
        return out;
      },
      editPlanTopics(planId, changes) {
        const add = [...new Set(changes.add ?? [])];
        const remove = new Set(changes.remove ?? []);
        update((s) => {
          const plan = s.plans.find((p) => p.id === planId);
          if (!plan) return s;
          const topicIds = [
            ...plan.topicIds.filter((id) => !remove.has(id)),
            ...add.filter((id) => !plan.topicIds.includes(id) && !remove.has(id)),
          ];
          const nextPlan = { ...plan, topicIds };
          const withEdits: AppState = {
            ...s,
            plans: s.plans.map((p) => (p.id === planId ? nextPlan : p)),
            // کارِ *آیندهٔ* مبحثِ حذف‌شده می‌رود؛ تسک‌های انجام‌شده/ردشده (تاریخ) می‌مانند
            tasks: s.tasks.filter((t) => !(t.planId === planId && t.status === "pending" && remove.has(t.topicId))),
          };
          // بازچینشِ کارِ باقی‌مانده با مباحثِ جدید؛ پیشرفتِ انجام‌شده دوباره کسر نمی‌شود
          return replanState(withEdits, nextPlan).next;
        });
      },
      updatePlanConfig(planId, patch) {
        const s = stateRef.current;
        const plan = s.plans.find((p) => p.id === planId);
        if (!plan) return null;
        const nextPlan: StudyPlan = {
          ...plan,
          startDate: patch.startDate ?? plan.startDate,
          endDate: patch.endDate ?? plan.endDate,
          dailyMinutes: patch.dailyMinutes != null ? Math.max(15, Math.min(24 * 60, Math.round(patch.dailyMinutes))) : plan.dailyMinutes,
          studyDays: patch.studyDays && patch.studyDays.length > 0 ? [...new Set(patch.studyDays)].sort() : plan.studyDays,
        };
        const topics = patch.priorities
          ? s.topics.map((t) => (patch.priorities && patch.priorities[t.id] ? { ...t, priority: patch.priorities[t.id] } : t))
          : s.topics;
        const drafted: AppState = { ...s, topics, plans: s.plans.map((p) => (p.id === planId ? nextPlan : p)) };
        const { next, result } = replanState(drafted, nextPlan);
        update(() => next);
        return result;
      },
      setTopicEstimate(topicId, approach, minutes) {
        update((s) => ({
          ...s,
          topics: s.topics.map((t) => {
            if (t.id !== topicId) return t;
            const overrides = { ...(t.estimateOverrides ?? {}) };
            if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) delete overrides[approach];
            else overrides[approach] = Math.max(5, Math.min(60 * 40, Math.round(minutes)));
            return { ...t, estimateOverrides: Object.keys(overrides).length > 0 ? overrides : undefined };
          }),
        }));
      },

      // ---- دفتر اشتباهات ----
      addMistake(data) {
        trackFeature("mistake_add");
        const m: Mistake = {
          id: defaultId(), topicId: data.topicId, subjectId: data.subjectId,
          question: data.question.trim(), answer: data.answer?.trim() || undefined, cause: data.cause?.trim() || undefined,
          dueDate: todayKey(), reviewCount: 0, lapses: 0, createdAt: Date.now(),
        };
        update((s) => ({ ...s, mistakes: [...(s.mistakes ?? []), m] }));
        return m;
      },
      reviewMistake(id, remembered) {
        trackFeature("mistake_review");
        const INTERVALS = [1, 3, 7, 14, 30];
        const today = todayKey();
        update((cur) =>
          addXp(
            {
              ...cur,
              mistakes: (cur.mistakes ?? []).map((m) => {
                if (m.id !== id) return m;
                if (remembered) {
                  const gap = INTERVALS[Math.min(m.reviewCount, INTERVALS.length - 1)];
                  return { ...m, reviewCount: m.reviewCount + 1, dueDate: addDays(today, gap), lastReviewedAt: Date.now() };
                }
                return { ...m, lapses: m.lapses + 1, dueDate: addDays(today, 1), lastReviewedAt: Date.now() };
              }),
            },
            remembered ? XP_PER_REVIEW : 0,
          ),
        );
      },
      deleteMistake(id) {
        const mistake = (stateRef.current.mistakes ?? []).find((m) => m.id === id);
        const trashItem = mistake ? makeTrashItem(defaultId(), "mistake", `اشتباه: ${mistake.question.slice(0, 32)}`, { mistake }) : null;
        update((s) => ({ ...s, mistakes: (s.mistakes ?? []).filter((m) => m.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
      },

      // ---- عادت‌ها ----
      addHabit(data) {
        const h: Habit = {
          id: defaultId(), title: data.title.trim(), icon: data.icon || "✅",
          targetPerWeek: Math.max(1, Math.min(7, data.targetPerWeek ?? 7)),
          history: [], createdAt: Date.now(),
        };
        update((s) => ({ ...s, habits: [...(s.habits ?? []), h] }));
        return h;
      },
      updateHabit(id, patch) {
        update((s) => ({ ...s, habits: (s.habits ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
      },
      deleteHabit(id) {
        const habit = (stateRef.current.habits ?? []).find((h) => h.id === id);
        const trashItem = habit ? makeTrashItem(defaultId(), "habit", `عادت «${habit.title}»`, { habit }) : null;
        update((s) => ({ ...s, habits: (s.habits ?? []).filter((h) => h.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
      },
      toggleHabit(id, date) {
        update((cur) => {
          const h = (cur.habits ?? []).find((x) => x.id === id);
          if (!h) return cur;
          const history = h.history ?? [];
          const has = history.includes(date);
          const next = { ...h, history: has ? history.filter((d) => d !== date) : [...history, date] };
          const withHabit = { ...cur, habits: (cur.habits ?? []).map((x) => (x.id === id ? next : x)) };
          return has ? withHabit : addXp(withHabit, 5);
        });
      },

      // ---- ژورنال بازتاب ----
      upsertJournal(date, learned, mood) {
        const text = learned.trim();
        if (!text) return;
        update((cur) => {
          const exists = (cur.journal ?? []).some((j) => j.date === date);
          const entry: JournalEntry = exists
            ? { ...(cur.journal ?? []).find((j) => j.date === date)!, learned: text, mood }
            : { id: defaultId(), date, learned: text, mood, createdAt: Date.now() };
          const journal = exists ? (cur.journal ?? []).map((j) => (j.date === date ? entry : j)) : [...(cur.journal ?? []), entry];
          return addXp({ ...cur, journal }, exists ? 0 : 10);
        });
      },
      deleteJournal(id) {
        const entry = (stateRef.current.journal ?? []).find((j) => j.id === id);
        const trashItem = entry ? makeTrashItem(defaultId(), "journal", `بازتاب ${entry.date}`, { entry }) : null;
        update((s) => ({ ...s, journal: (s.journal ?? []).filter((j) => j.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
      },

      // ---- کپسول زمان ----
      addCapsule(text, openDate, examId) {
        trackFeature("capsule");
        const c: TimeCapsule = { id: defaultId(), text: text.trim(), openDate, examId, createdAt: Date.now() };
        update((s) => ({ ...s, capsules: [...(s.capsules ?? []), c] }));
        return c;
      },
      openCapsule(id) {
        update((s) => ({
          ...s,
          capsules: (s.capsules ?? []).map((c) => (c.id === id && todayKey() >= c.openDate && !c.openedAt ? { ...c, openedAt: Date.now() } : c)),
        }));
      },
      deleteCapsule(id) {
        const capsule = (stateRef.current.capsules ?? []).find((c) => c.id === id);
        const trashItem = capsule ? makeTrashItem(defaultId(), "capsule", `کپسول «${capsule.text.slice(0, 32)}»`, { capsule }) : null;
        update((s) => ({ ...s, capsules: (s.capsules ?? []).filter((c) => c.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
      },

      // ---- درخت تمرکز ----
      markTreeWilted() {
        const today = todayKey();
        update((s) => {
          if (s.focusTree?.date === today && s.focusTree.wilted) return s;
          return { ...s, focusTree: { date: today, wilted: true } };
        });
      },

      // ---- ثبت دستی مطالعه ----
      logManualSession(topicId, minutes, kind) {
        trackFeature("manual_log");
        const mins = Math.max(1, Math.min(1440, Math.round(minutes)));
        const today = todayKey();
        const now = Date.now();
        const kinds = normalizeStudyKinds(kind);
        const topicHasPlan = topicId != null && stateRef.current.tasks.some((t) => t.topicId === topicId);
        const unplanned = topicHasPlan
          ? creditStudyToTasks({ tasks: stateRef.current.tasks, topicId: topicId as string, minutes: mins, today, kinds, activeTaskId: stateRef.current.activeSession?.taskId }).unplannedMinutes
          : 0;
        const session: StudySession = {
          id: defaultId(), topicId, startedAt: now - mins * 60_000, endedAt: now,
          durationMinutes: mins, rating: null, mode: "free", date: today,
          kind: collapseStudyKinds(kinds),
          kinds: kinds.length > 1 ? kinds : undefined,
          ...(unplanned > 0 ? { unplannedMinutes: unplanned } : {}),
        };
        // هماهنگی با برنامه: ثبت دستی هم مثل تایمر، تسک‌های همان مبحث را پر می‌کند
        const creditPreview = topicId
          ? creditStudyToTasks({ tasks: stateRef.current.tasks, topicId, minutes: mins, today, kinds, activeTaskId: stateRef.current.activeSession?.taskId })
          : null;
        update((cur) => {
          const tasks = topicId
            ? creditStudyToTasks({ tasks: cur.tasks, topicId, minutes: mins, today, kinds, activeTaskId: cur.activeSession?.taskId }).tasks
            : cur.tasks;
          const mult = xpStreakMultiplier(computeStreak(cur.sessions, today, cur.settings.streakFreezes, cur.settings.streakFreezeDates, cur.settings.streakFreezeBoughtOn));
          let xp = Math.round(mins * XP_PER_MINUTE * mult);
          const goalBonus = shouldAwardDailyGoalBonus(
            minutesOnDate(cur.sessions, today), mins,
            cur.settings.dailyGoalMinutes, cur.settings.lastGoalBonusDate, today,
          );
          if (goalBonus) xp += XP_DAILY_GOAL_BONUS;
          return addXp(
            {
              ...cur,
              sessions: [...cur.sessions, session],
              tasks,
              topics: topicId ? cur.topics.map((t) => (t.id === topicId && t.status === "not_started" ? { ...t, status: "learning" as const } : t)) : cur.topics,
              settings: goalBonus ? { ...cur.settings, lastGoalBonusDate: today } : cur.settings,
            },
            xp,
          );
        });
        toast(`${mins.toLocaleString("fa-IR")} دقیقه مطالعه ثبت شد`, "🎙️");
        if (creditPreview && creditPreview.creditedMinutes > 0) {
          toast("برنامه هم به‌روز شد؛ این مطالعه به تسک‌های همان مبحث واریز شد", "🧩");
        }
        if (creditPreview && creditPreview.movedMinutes > 0) {
          toast(`چون زودتر از موعد خواندی، ${toFaNum(creditPreview.movedMinutes)} دقیقه از برنامهٔ امروز به فردا منتقل شد`, "🧠");
        }
        if (unplanned > 0) {
          toast(
            `${toFaNum(unplanned)} دقیقه بیشتر از برنامهٔ این مبحث بود؛ فقط در آمار ثبت شد و مروری از برنامه کم نشد`,
            "📚",
          );
        }
      },

      updateSettings(patch) {
        update((s) => ({ ...s, settings: { ...s.settings, ...patch, ...(patch.supabase ? { supabase: { ...s.settings.supabase, ...patch.supabase } } : {}), ...(patch.googleDrive ? { googleDrive: { ...s.settings.googleDrive, ...patch.googleDrive } } : {}) } }));
      },
      exportData() {
        return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: stateRef.current }, null, 2);
      },
      importData(json) {
        try {
          const parsed = JSON.parse(json);
          const data = (parsed?.data ?? parsed) as Partial<AppState>;
          if (!Array.isArray(data.subjects) || !Array.isArray(data.topics)) return false;
          const clean = parseStateText(JSON.stringify(data));
          if (!clean) return false;
          const merged = clean.settings;
          const hasContent = (Array.isArray(data.subjects) && data.subjects.length > 0) || (Array.isArray(data.sessions) && data.sessions.length > 0);
          setState({
            ...clean,
            settings: { ...merged, onboarded: merged.onboarded || hasContent },
            activeSession: null,
          });
          return true;
        } catch {
          return false;
        }
      },
      resetAll() {
        setState({
          ...EMPTY_STATE,
          settings: {
            ...DEFAULT_SETTINGS,
            theme: stateRef.current.settings.theme,
            accentColor: stateRef.current.settings.accentColor || DEFAULT_SETTINGS.accentColor,
            onboarded: true,
          },
        });
      },

      addExam(data) {
        const exam: Exam = { ...data, id: defaultId(), createdAt: Date.now() };
        update((s) => ({ ...s, exams: [...s.exams, exam] }));
        return exam;
      },
      updateExam(id, patch) {
        update((s) => ({ ...s, exams: s.exams.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      deleteExam(id) {
        const s0 = stateRef.current;
        const exam = s0.exams.find((x) => x.id === id);
        const examTrash = exam ? makeTrashItem(defaultId(), "exam", `امتحان «${exam.title}»`, { exam }) : null;
        if (exam) markDeleted(`امتحان «${exam.title}»`, () => update((cur) => ({ ...cur, exams: [...cur.exams, exam] })), examTrash?.id);
        update((s) => ({ ...s, exams: s.exams.filter((x) => x.id !== id), trash: examTrash ? pushTrash(s.trash, examTrash) : s.trash }));
      },
      addNote(text, topicId) {
        const note: import("./types").StudyNote = { id: defaultId(), text, topicId, createdAt: Date.now() };
        update((s) => ({ ...s, notes: [...(s.notes ?? []), note] }));
        toast("یادداشت ذخیره شد", "📝");
      },
      updateNote(id, patch) {
        update((s) => ({ ...s, notes: (s.notes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
      },
      deleteNote(id) {
        const note = (stateRef.current.notes ?? []).find((n) => n.id === id);
        const trashItem = note ? makeTrashItem(defaultId(), "note", `یادداشت «${note.text.slice(0, 32)}»`, { note }) : null;
        update((s) => ({ ...s, notes: (s.notes ?? []).filter((n) => n.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
        toast("یادداشت حذف شد", "🗑");
      },
      toggleTopicTag(topicId, tag) {
        update((s) => ({
          ...s,
          topics: s.topics.map((t) => {
            if (t.id !== topicId) return t;
            const tags = t.tags || [];
            const has = tags.includes(tag);
            return { ...t, tags: has ? tags.filter((x) => x !== tag) : [...tags, tag] };
          }),
        }));
      },
      addTestLog(data) {
        trackFeature("test_log");
        const total = Math.max(1, Math.floor(data.total));
        const correct = Math.max(0, Math.min(total, Math.floor(data.correct)));
        const log: import("./types").TestLog = { id: defaultId(), topicId: data.topicId, subjectId: data.subjectId, date: todayKey(), total, correct, createdAt: Date.now() };
        update((s) => ({ ...s, testLogs: [log, ...(s.testLogs ?? [])] }));
        toast(`${toFaNum(total)} تست ثبت شد · ${toFaNum(correct)} درست`, "🧪");
      },
      deleteTestLog(id) {
        const log = (stateRef.current.testLogs ?? []).find((x) => x.id === id);
        const trashItem = log ? makeTrashItem(defaultId(), "testLog", `ثبت تست (${log.correct} از ${log.total})`, { log }) : null;
        update((s) => ({ ...s, testLogs: (s.testLogs ?? []).filter((x) => x.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
      },
      addClassBlock(data) {
        const block: import("./types").ClassBlock = { ...data, id: defaultId(), createdAt: Date.now() };
        update((s) => ({ ...s, classBlocks: [...(s.classBlocks ?? []), block] }));
      },
      updateClassBlock(id, patch) {
        update((s) => ({ ...s, classBlocks: (s.classBlocks ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
      },
      deleteClassBlock(id) {
        const s0 = stateRef.current;
        const block = s0.classBlocks?.find((b) => b.id === id);
        const blockTrash = block ? makeTrashItem(defaultId(), "classBlock", `بلوک «${block.title}»`, { block }) : null;
        if (block) markDeleted(`بلوک «${block.title}»`, () => update((cur) => ({ ...cur, classBlocks: [...(cur.classBlocks ?? []), block] })), blockTrash?.id);
        update((s) => ({ ...s, classBlocks: (s.classBlocks ?? []).filter((b) => b.id !== id), trash: blockTrash ? pushTrash(s.trash, blockTrash) : s.trash }));
      },
      restoreTrash(id) {
        const item = (stateRef.current.trash ?? []).find((x) => x.id === id);
        if (!item) return;
        update((s) => {
          const next = restoreTrashItem(s, item);
          return { ...next, trash: (next.trash ?? []).filter((x) => x.id !== id) };
        });
        toast(`«${item.label}» برگشت`, "↩️");
      },
      deleteTrashForever(id) {
        update((s) => ({ ...s, trash: (s.trash ?? []).filter((x) => x.id !== id) }));
      },
      emptyTrash() {
        update((s) => ({ ...s, trash: [] }));
        toast("سطل زباله خالی شد", "🗑");
      },
      markBackupDone() {
        update((s) => ({ ...s, settings: { ...s.settings, autoBackup: { ...s.settings.autoBackup, lastBackupAt: Date.now() } } }));
      },
      buyStreakFreeze() {
        const s = stateRef.current;
        if (s.settings.streakFreezes >= MAX_STREAK_FREEZES) {
          toast(`بیشتر از ${MAX_STREAK_FREEZES} یخ‌زدگی نمی‌توانی نگه داری`, "❄️");
          return;
        }
        if (s.settings.xp < STREAK_FREEZE_COST) {
          toast(`برای خرید یخ‌زدگی ${STREAK_FREEZE_COST} XP لازم داری`, "⭐");
          return;
        }
        update((cur) => {
          // 🐛→✅ هر یخ‌زدگی تاریخِ خریدش را هم با خودش می‌برد تا *گذشته* را جبران
          // نکند: فقط روزهای جامانده‌ی بعد از امروز پوشش داده می‌شوند.
          const boughtOn = [...(cur.settings.streakFreezeBoughtOn ?? []), todayKey()].slice(0, MAX_STREAK_FREEZES);
          return {
            ...cur,
            settings: {
              ...cur.settings,
              streakFreezes: cur.settings.streakFreezes + 1,
              streakFreezeBoughtOn: boughtOn,
              xp: cur.settings.xp - STREAK_FREEZE_COST,
            },
          };
        });
        toast("یخ‌زدگی خریدی؛ از امروز به بعد روز جامانده زنجیره‌ات را نمی‌شکند", "❄️");
      },
      loadSampleData() {
        update((s) => {
          const { subjects, topics } = mergeSampleData(s.subjects, s.topics);
          return { ...s, subjects, topics };
        });
        toast("دروس نمونه به‌روز شدند؛ موارد قبلی بدون تغییر حفظ شدند", "📚");
      },
    };
  }, [state, toast, update, deleted]);

  return <StoreContext.Provider value={api}>{hydrated ? children : <div dir="rtl" role="status" className="p-8 text-center text-slate-500">در حال بررسی آخرین نسخهٔ داده‌ها…</div>}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** Derived lookups */
export function useLookups() {
  const { state } = useStore();
  return useMemo(() => {
    const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
    const topicById = new Map(state.topics.map((t) => [t.id, t]));
    const subjectOfTopic = (topicId: string) => {
      const t = topicById.get(topicId);
      return t ? subjectById.get(t.subjectId) : undefined;
    };
    return { subjectById, topicById, subjectOfTopic };
  }, [state.subjects, state.topics]);
}
