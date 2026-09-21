import { scheduledReviewTargets, type ReviewCleanupOptions } from "./lib/reviewCleanup";
import { saveHistory } from "./lib/history";
import { paceEstimates, planningFingerprint, type PaceEstimate } from "./lib/decisions";
import { sourceEvidenceValid, type SourceDraft } from "./lib/sourceLearning";
import type { SourceDocument, RemediationAttempt } from "./types";
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
import { buildCramPlan } from "./lib/cram";
import { generateSmartPlan, type SmartPlanResult } from "./lib/smartPlan";
import { leafTopics } from "./lib/topics";
import { defaultScheduler } from "./lib/srs";
import { sm2Next } from "./lib/sm2";
import { getAmbientSnapshot } from "./lib/ambientSnapshot";
import { makeTrashItem, pushTrash, restoreTrashItem, snapshotPlan, snapshotSubject, snapshotTopics } from "./lib/trash";
import { descendantsOf } from "./lib/topics";
import { ACHIEVEMENTS, MAX_STREAK_FREEZES, STREAK_FREEZE_COST, XP_DAILY_GOAL_BONUS, XP_PER_CARD, XP_PER_MASTERED, XP_PER_MINUTE, XP_PER_REVIEW, XP_PER_TASK } from "./lib/gamification";
import { addDays, toFa as toFaNum, todayKey } from "./lib/jalali";
import { mergeSampleData } from "./lib/sampleImport";
import { curatedCardKey, curatedPackById } from "./lib/curatedPacks";
import { minutesOnDate, shouldAwardDailyGoalBonus } from "./lib/stats";
import { loadDurable, loadMirror, persistState, newestLocalState } from "./lib/persist";
import { EMPTY_STATE, mergeSettings, parseStateText } from "./lib/stateIO";

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
  const [toasts, setToasts] = useState<Toast[]>([]);
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
      toasts,
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
        update((s) => {
          const task = s.tasks.find((t) => t.id === id);
          if (!task || task.status === "done") return s;
          return addXp(
            { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "done", doneMinutes: Math.max(t.doneMinutes, t.plannedMinutes) } : t)) },
            XP_PER_TASK,
          );
        });
      },

      startSession(topicId, mode, taskId, targetMinutes) {
        const now = Date.now();
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
        update((s) => ({ ...s, flashcards: s.flashcards.map((c) => (c.id === id ? { ...c, ...patch, evidence: patch.back != null && patch.back !== c.back ? undefined : (patch.evidence ?? c.evidence) } : c)) }));
      },
      deleteFlashcard(id) {
        const card = stateRef.current.flashcards.find((c) => c.id === id);
        const trashItem = card ? makeTrashItem(defaultId(), "flashcard", `فلش‌کارت «${card.front.slice(0, 32)}»`, { card }) : null;
        update((s) => ({ ...s, flashcards: s.flashcards.filter((c) => c.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
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
        const entry = (stateRef.current.journal ?? []).find((j) => j.id === id);
        const trashItem = entry ? makeTrashItem(defaultId(), "journal", `بازتاب ${entry.date}`, { entry }) : null;
        update((s) => ({ ...s, journal: (s.journal ?? []).filter((j) => j.id !== id), trash: trashItem ? pushTrash(s.trash, trashItem) : s.trash }));
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
