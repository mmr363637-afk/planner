import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
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
  type StudySession,
  type StudyTask,
  type Subject,
  type TimeCapsule,
  type Topic,
  type UserSettings,
} from "./types";
import { defaultId, generatePlan, replan as replanEngine, type PlanResult } from "./lib/planner";
import { generateSmartPlan, type SmartPlanResult } from "./lib/smartPlan";
import { leafTopics } from "./lib/topics";
import { defaultScheduler } from "./lib/srs";
import { sm2Next } from "./lib/sm2";
import { AMBIENT_IDS, ambientEngine } from "./lib/ambient";
import { descendantsOf } from "./lib/topics";
import { ACHIEVEMENTS, MAX_STREAK_FREEZES, STREAK_FREEZE_COST, XP_DAILY_GOAL_BONUS, XP_PER_CARD, XP_PER_MASTERED, XP_PER_MINUTE, XP_PER_REVIEW, XP_PER_TASK } from "./lib/gamification";
import { addDays, toFa as toFaNum, todayKey } from "./lib/jalali";
import { mergeSampleData } from "./lib/sampleImport";
import { curatedCardKey, curatedPackById } from "./lib/curatedPacks";
import { minutesOnDate, shouldAwardDailyGoalBonus } from "./lib/stats";
import { loadDurable, loadMirror, persistState } from "./lib/persist";
import { EMPTY_STATE, mergeSettings } from "./lib/stateIO";

// سازگاری با importهای قدیمی (تست‌ها) — منطق در lib/stateIO است
export { mergeSettings };

export interface Toast {
  id: number;
  message: string;
  icon?: string;
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
}

export interface EndSessionResult {
  session: StudySession;
  review: Review | null;
}

/** آخرین حذف برای قابلیت بازگردانی (Undo) */
export interface DeletedInfo {
  label: string;
  restore: () => void;
  expiresAt: number;
}

interface StoreApi {
  state: AppState;
  toasts: Toast[];
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
  startSession: (topicId: string | null, mode: SessionMode, taskId?: string) => void;
  /** ثبت دستی مطالعه (مثلاً از روی ثبت صوتی) — بدون تایمر */
  logManualSession: (topicId: string | null, minutes: number) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  advancePhase: () => void;
  discardSession: () => void;
  /** کاربر می‌گوید «حواسم پریت شد» — فقط در حین اجرای جلسه شمرده می‌شود */
  logDistraction: () => void;
  endSession: (rating: Rating | null) => EndSessionResult | null;
  // reviews
  completeReview: (id: string, rating: Rating) => void;
  postponeReview: (id: string, days: number) => void;
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
  // بوت بی‌درنگ از آینه‌ی localStorage؛ داده‌های ماندگار در IndexedDB همان لحظه هم نوشته می‌شوند
  const [state, setState] = useState<AppState>(() => loadMirror() ?? EMPTY_STATE);
  const mirrorWasEmpty = useRef<boolean>(false);
  mirrorWasEmpty.current = loadMirror() == null;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deleted, setDeleted] = useState<DeletedInfo | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // persist (localStorage mirror + IndexedDB)
  useEffect(() => {
    persistState(state);
  }, [state]);

  // مهاجرت آنبوردینگ: کاربر قدیمی که دیتا دارد ولی فلگ ندارد، آنبوردد حساب می‌شود
  // تا آنبوردینگِ اولین نصب را نبیند (فقط نصبِ واقعاً تازه آن را می‌بیند).
  useEffect(() => {
    setState((st) =>
      !st.settings.onboarded && (st.subjects.length > 0 || st.sessions.length > 0)
        ? { ...st, settings: { ...st.settings, onboarded: true } }
        : st,
    );
  }, []);

  // اگر آینه‌ی بوت خالی یا خراب بود ولی نسخه‌ی ماندگار در IndexedDB هست (مثلاً بعد از
  // پاک‌شدن localStorage یا در ارتقا از نسخه‌های قدیمی)، بازیابی کن.
  useEffect(() => {
    if (!mirrorWasEmpty.current) return;
    let cancelled = false;
    loadDurable().then((durable) => {
      if (!cancelled && durable) setState(durable);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toast = useCallback((message: string, icon?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
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

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);

  const api = useMemo<StoreApi>(() => {
    const subjectPriorityMap = (s: AppState): Record<string, Priority> =>
      Object.fromEntries(s.subjects.map((sub) => [sub.id, sub.priority]));

    const addXp = (s: AppState, amount: number): AppState => ({
      ...s,
      settings: { ...s.settings, xp: Math.max(0, s.settings.xp + amount) },
    });

    // ثبت آخرین حذف برای نوار «بازگردانی» — بعد از ~۷ ثانیه خودبه‌خود پاک می‌شود
    const markDeleted = (label: string, restore: () => void) => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      setDeleted({ label, restore, expiresAt: Date.now() + 7000 });
      deleteTimer.current = setTimeout(() => setDeleted(null), 7000);
    };

    return {
      state,
      toasts,
      toast,
      lastDeleted: deleted,
      importedCuratedKeys: new Set(state.flashcards.filter((c) => c.packId).map((c) => curatedCardKey(c.packId!, c.front))),
      existingCardFronts: new Set(state.flashcards.map((c) => c.front.trim().toLowerCase())),
      undoDelete() {
        if (!deleted) return;
        deleted.restore();
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
          reviewGaps: s.settings.reviewIntervals.slice(0, 2),
          bufferDays: input.bufferDays,
          approaches: input.approaches,
        });
      },
      createSmartPlan(input) {
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
          reviewGaps: s0.settings.reviewIntervals.slice(0, 2),
          bufferDays: input.bufferDays,
          approaches: input.approaches,
        });
        const smart: SmartPlanConfig = {
          examDate: input.examDate,
          bufferDays: result.bufferDates.length,
          reviewGaps: s0.settings.reviewIntervals.slice(0, 2),
          maxSubjectsPerDay: 3,
          goldenFirst: true,
          approaches: { ...input.approaches },
        };
        const plan: StudyPlan = {
          goal: input.goal, startDate: input.startDate, endDate: input.endDate,
          topicIds: [...input.topicIds], studyDays: [...input.studyDays], dailyMinutes: input.dailyMinutes,
          id: defaultId(), createdAt: Date.now(), archived: false,
          smartNotes: result.notes, smart,
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
      deletePlan(id) {
        update((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id), tasks: s.tasks.filter((t) => t.planId !== id) }));
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
            doneMinutesByTopic: doneByTopic,
            approaches: { ...plan.smart.approaches, ...currentApproaches },
          });
          update((cur) => ({
            ...cur,
            plans: cur.plans.map((x) => (x.id === id ? { ...x, endDate: end, smartNotes: result.notes } : x)),
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
        if (task) {
          const index = s0.tasks.findIndex((t) => t.id === id);
          markDeleted("کار برنامه", () =>
            update((cur) => {
              const tasks = [...cur.tasks];
              tasks.splice(Math.min(index, tasks.length), 0, task);
              return { ...cur, tasks };
            }),
          );
        }
        update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
      },
      moveTask(id, date) {
        update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, date } : t)) }));
      },
      completeTask(id) {
        update((s) => {
          const task = s.tasks.find((t) => t.id === id);
          if (!task || task.status === "done") return s;
          return addXp(
            { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "done", doneMinutes: Math.max(t.doneMinutes, t.plannedMinutes) } : t)) },
            XP_PER_TASK,
          );
        });
      },

      startSession(topicId, mode, taskId) {
        const now = Date.now();
        const session: ActiveSession = {
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
      endSession(rating) {
        const s = stateRef.current;
        const a = s.activeSession;
        if (!a) return null;
        const topicId = s.topics.find((t) => t.id === a.topicId)?.id ?? null;
        if (topicId != null && rating == null) return null; // topic study still requires an assessment
        const sessionRating = topicId == null ? null : rating;
        const now = Date.now();
        const elapsed = a.running && a.startedAt != null ? now - a.startedAt : 0;
        const totalMs = a.totalStudyMs + (a.phase === "work" ? elapsed : 0);
        const durationMinutes = Math.max(1, Math.round(totalMs / 60000));
        const today = todayKey();

        // صداهای تمرکزی که همین حالا پخش می‌شوند، برای آمارِ «با چه صدایی بیشتر می‌خوانی؟»
        let ambient: string[] | undefined;
        try {
          if (ambientEngine.playing) {
            const lv = ambientEngine.getLevels();
            const ids = AMBIENT_IDS.filter((id) => (lv[id] ?? 0) > 0.05);
            if (ids.length > 0) ambient = ids;
          }
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
        };

        const previous =
          s.reviews
            .filter((r) => r.topicId === a.topicId)
            .sort((x, y) => y.reviewNumber - x.reviewNumber)[0] ?? null;
        const review = topicId != null && sessionRating != null ? defaultScheduler.next({
          topicId,
          previous,
          rating: sessionRating,
          today,
          intervals: s.settings.reviewIntervals,
          idFactory: defaultId,
        }) : null;

        const newStatus: Topic["status"] = sessionRating === 3 ? "mastered" : sessionRating === 2 ? "learning" : "needs_review";

        update((cur) => {
          if (!cur.activeSession || cur.activeSession.sessionStartedAt !== a.sessionStartedAt) return cur; // ignore a repeated end
          let tasks = cur.tasks;
          if (session.taskId) {
            tasks = tasks.map((t) => {
              if (t.id !== session.taskId || t.topicId !== topicId) return t;
              const doneMinutes = t.doneMinutes + durationMinutes;
              const done = (sessionRating != null && sessionRating >= 2) || doneMinutes >= t.plannedMinutes;
              return { ...t, doneMinutes, status: done ? "done" : t.status };
            });
          }
          const prevTopic = cur.topics.find((t) => t.id === topicId);
          let xp = durationMinutes * XP_PER_MINUTE;
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
              // remove other pending reviews for this topic, then add the new one
              reviews: review ? [...cur.reviews.filter((r) => !(r.topicId === topicId && r.status === "pending")), review] : cur.reviews,
            },
            xp,
          );
        });
        return { session, review };
      },

      completeReview(id, rating) {
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
        update((cur) =>
          addXp(
            {
              ...cur,
              reviews: [
                ...cur.reviews.map((r) => (r.id === id ? { ...r, status: "done" as const, completedAt: Date.now(), rating } : r)),
                next,
              ],
              topics: cur.topics.map((t) => (t.id === review.topicId ? { ...t, status } : t)),
            },
            XP_PER_REVIEW,
          ),
        );
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
        update((s) => ({ ...s, flashcards: s.flashcards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
      },
      deleteFlashcard(id) {
        update((s) => ({ ...s, flashcards: s.flashcards.filter((c) => c.id !== id) }));
      },
      reviewFlashcard(id, quality) {
        const s = stateRef.current;
        const card = s.flashcards.find((c) => c.id === id);
        if (!card) return;
        const next = sm2Next(card, { quality, today: todayKey() });
        update((cur) => addXp({ ...cur, flashcards: cur.flashcards.map((c) => (c.id === id ? next : c)) }, XP_PER_CARD));
      },
      importCuratedCards(packId, cardIndices) {
        const s = stateRef.current;
        const pack = curatedPackById(packId);
        if (!pack || cardIndices.length === 0) return 0;
        const topic = s.topics.find((t) => t.sampleId === pack.id);
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

      // ---- دفتر اشتباهات ----
      addMistake(data) {
        const m: Mistake = {
          id: defaultId(), topicId: data.topicId, subjectId: data.subjectId,
          question: data.question.trim(), answer: data.answer?.trim() || undefined, cause: data.cause?.trim() || undefined,
          dueDate: todayKey(), reviewCount: 0, lapses: 0, createdAt: Date.now(),
        };
        update((s) => ({ ...s, mistakes: [...(s.mistakes ?? []), m] }));
        return m;
      },
      reviewMistake(id, remembered) {
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
        update((s) => ({ ...s, mistakes: (s.mistakes ?? []).filter((m) => m.id !== id) }));
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
        update((s) => ({ ...s, habits: (s.habits ?? []).filter((h) => h.id !== id) }));
      },
      toggleHabit(id, date) {
        update((cur) => {
          const h = (cur.habits ?? []).find((x) => x.id === id);
          if (!h) return cur;
          const has = h.history.includes(date);
          const next = { ...h, history: has ? h.history.filter((d) => d !== date) : [...h.history, date] };
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
        update((s) => ({ ...s, journal: (s.journal ?? []).filter((j) => j.id !== id) }));
      },

      // ---- کپسول زمان ----
      addCapsule(text, openDate, examId) {
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
        update((s) => ({ ...s, capsules: (s.capsules ?? []).filter((c) => c.id !== id) }));
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
      logManualSession(topicId, minutes) {
        const mins = Math.max(1, Math.min(1440, Math.round(minutes)));
        const today = todayKey();
        const now = Date.now();
        const session: StudySession = {
          id: defaultId(), topicId, startedAt: now - mins * 60_000, endedAt: now,
          durationMinutes: mins, rating: null, mode: "free", date: today,
        };
        update((cur) => {
          let xp = mins * XP_PER_MINUTE;
          const goalBonus = shouldAwardDailyGoalBonus(
            minutesOnDate(cur.sessions, today), mins,
            cur.settings.dailyGoalMinutes, cur.settings.lastGoalBonusDate, today,
          );
          if (goalBonus) xp += XP_DAILY_GOAL_BONUS;
          return addXp(
            {
              ...cur,
              sessions: [...cur.sessions, session],
              topics: topicId ? cur.topics.map((t) => (t.id === topicId && t.status === "not_started" ? { ...t, status: "learning" as const } : t)) : cur.topics,
              settings: goalBonus ? { ...cur.settings, lastGoalBonusDate: today } : cur.settings,
            },
            xp,
          );
        });
        toast(`${mins.toLocaleString("fa-IR")} دقیقه مطالعه ثبت شد`, "🎙️");
      },

      updateSettings(patch) {
        update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      },
      exportData() {
        return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: stateRef.current }, null, 2);
      },
      importData(json) {
        try {
          const parsed = JSON.parse(json);
          const data = (parsed?.data ?? parsed) as Partial<AppState>;
          if (!Array.isArray(data.subjects) || !Array.isArray(data.topics)) return false;
          const merged = mergeSettings(data.settings);
          const hasContent = (Array.isArray(data.subjects) && data.subjects.length > 0) || (Array.isArray(data.sessions) && data.sessions.length > 0);
          setState({
            ...EMPTY_STATE,
            ...data,
            exams: Array.isArray(data.exams) ? data.exams : [],
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
        if (exam) markDeleted(`امتحان «${exam.title}»`, () => update((cur) => ({ ...cur, exams: [...cur.exams, exam] })));
        update((s) => ({ ...s, exams: s.exams.filter((x) => x.id !== id) }));
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
        update((s) => ({ ...s, notes: (s.notes ?? []).filter((n) => n.id !== id) }));
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
        const total = Math.max(1, Math.floor(data.total));
        const correct = Math.max(0, Math.min(total, Math.floor(data.correct)));
        const log: import("./types").TestLog = { id: defaultId(), topicId: data.topicId, subjectId: data.subjectId, date: todayKey(), total, correct, createdAt: Date.now() };
        update((s) => ({ ...s, testLogs: [log, ...(s.testLogs ?? [])] }));
        toast(`${toFaNum(total)} تست ثبت شد · ${toFaNum(correct)} درست`, "🧪");
      },
      deleteTestLog(id) {
        update((s) => ({ ...s, testLogs: (s.testLogs ?? []).filter((x) => x.id !== id) }));
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
        if (block) markDeleted(`بلوک «${block.title}»`, () => update((cur) => ({ ...cur, classBlocks: [...(cur.classBlocks ?? []), block] })));
        update((s) => ({ ...s, classBlocks: (s.classBlocks ?? []).filter((b) => b.id !== id) }));
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
        update((cur) => ({
          ...cur,
          settings: { ...cur.settings, streakFreezes: cur.settings.streakFreezes + 1, xp: cur.settings.xp - STREAK_FREEZE_COST },
        }));
        toast("یخ‌زدگی خریدی؛ یک روز جامانده، زنجیره‌ات نمی‌شکند", "❄️");
      },
      loadSampleData() {
        update((s) => {
          const { subjects, topics } = mergeSampleData(s.subjects, s.topics);
          return { ...s, subjects, topics };
        });
        toast("دروس نمونه به‌روز شدند؛ موارد قبلی بدون تغییر حفظ شدند", "📚");
      },
    };
  }, [state, toasts, toast, update, deleted]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
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
