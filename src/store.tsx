import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
  type ActiveSession,
  type AppState,
  type Exam,
  type Priority,
  type Rating,
  type Review,
  type SessionMode,
  type StudyPlan,
  type StudySession,
  type StudyTask,
  type Subject,
  type Topic,
  type UserSettings,
} from "./types";
import { defaultId, generatePlan, replan as replanEngine, type PlanResult } from "./lib/planner";
import { defaultScheduler } from "./lib/srs";
import { ACHIEVEMENTS, MAX_STREAK_FREEZES, STREAK_FREEZE_COST, XP_DAILY_GOAL_BONUS, XP_PER_MASTERED, XP_PER_MINUTE, XP_PER_REVIEW, XP_PER_TASK } from "./lib/gamification";
import { addDays, todayKey } from "./lib/jalali";
import { mergeSampleData } from "./lib/sampleImport";
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
  deletePlan: (id: string) => void;
  replanPlan: (id: string) => PlanResult | null;
  addTask: (topicId: string, date: string, minutes: number) => void;
  updateTask: (id: string, patch: Partial<StudyTask>) => void;
  /** ترتیب تسک‌های یک روز را بر اساس آرایه‌ی id ها بازنویسی می‌کند (Drag & Drop) */
  reorderTasks: (orderedIds: string[]) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, date: string) => void;
  completeTask: (id: string) => void;
  // sessions
  startSession: (topicId: string | null, mode: SessionMode, taskId?: string) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  advancePhase: () => void;
  discardSession: () => void;
  endSession: (rating: Rating | null) => EndSessionResult | null;
  // reviews
  completeReview: (id: string, rating: Rating) => void;
  postponeReview: (id: string, days: number) => void;
  // exams
  addExam: (data: Omit<Exam, "id" | "createdAt">) => Exam;
  updateExam: (id: string, patch: Partial<Exam>) => void;
  deleteExam: (id: string) => void;
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
          const oldPlans = s0.plans.map((p) => ({ ...p, topicIds: [...p.topicIds] }));
          markDeleted(`درس «${subject.name}»`, () =>
            update((cur) => ({
              ...cur,
              subjects: [...cur.subjects, subject],
              topics: [...cur.topics, ...oldTopics],
              tasks: [...cur.tasks, ...oldTasks],
              reviews: [...cur.reviews, ...oldReviews],
              sessions: [...cur.sessions, ...oldSessions],
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
        if (topic) {
          const oldTasks = s0.tasks.filter((t) => t.topicId === id);
          const oldReviews = s0.reviews.filter((r) => r.topicId === id);
          const oldSessions = s0.sessions.filter((x) => x.topicId === id);
          const oldPlans = s0.plans.map((p) => ({ ...p, topicIds: [...p.topicIds] }));
          markDeleted(`مبحث «${topic.name}»`, () =>
            update((cur) => ({
              ...cur,
              topics: [...cur.topics, topic],
              tasks: [...cur.tasks, ...oldTasks],
              reviews: [...cur.reviews, ...oldReviews],
              sessions: [...cur.sessions, ...oldSessions],
              plans: oldPlans.map((op) => {
                const curPlan = cur.plans.find((cp) => cp.id === op.id);
                return curPlan ? { ...curPlan, topicIds: op.topicIds } : op;
              }),
            })),
          );
        }
        update((s) => ({
          ...s,
          topics: s.topics.filter((t) => t.id !== id),
          tasks: s.tasks.filter((t) => t.topicId !== id),
          reviews: s.reviews.filter((r) => r.topicId !== id),
          sessions: s.sessions.filter((x) => x.topicId !== id),
          plans: s.plans.map((p) => ({ ...p, topicIds: p.topicIds.filter((t) => t !== id) })),
          activeSession: s.activeSession?.topicId === id ? null : s.activeSession,
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
      deletePlan(id) {
        update((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id), tasks: s.tasks.filter((t) => t.planId !== id) }));
      },
      replanPlan(id) {
        const s = stateRef.current;
        const plan = s.plans.find((p) => p.id === id);
        if (!plan) return null;
        const today = todayKey();
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
          setState({
            ...EMPTY_STATE,
            ...data,
            exams: Array.isArray(data.exams) ? data.exams : [],
            settings: mergeSettings(data.settings),
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
