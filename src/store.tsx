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
import { ACHIEVEMENTS, XP_PER_MASTERED, XP_PER_MINUTE, XP_PER_REVIEW, XP_PER_TASK } from "./lib/gamification";
import { addDays, todayKey } from "./lib/jalali";
import { SAMPLE_SUBJECTS } from "./lib/sampleData";

const STORAGE_KEY = "study-planner-v1";

const EMPTY_STATE: AppState = {
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

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...EMPTY_STATE,
      ...parsed,
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
        pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...(parsed.settings?.pomodoro ?? {}) },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.settings?.notifications ?? {}) },
      },
    };
  } catch (e) {
    console.error("Failed to load state", e);
    return EMPTY_STATE;
  }
}

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
  review: Review;
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
  deleteTask: (id: string) => void;
  moveTask: (id: string, date: string) => void;
  completeTask: (id: string) => void;
  // sessions
  startSession: (topicId: string, mode: SessionMode, taskId?: string) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  advancePhase: () => void;
  discardSession: () => void;
  endSession: (rating: Rating) => EndSessionResult | null;
  // reviews
  completeReview: (id: string, rating: Rating) => void;
  postponeReview: (id: string, days: number) => void;
  // exams
  addExam: (data: Omit<Exam, "id" | "createdAt">) => Exam;
  updateExam: (id: string, patch: Partial<Exam>) => void;
  deleteExam: (id: string) => void;
  // settings & data
  updateSettings: (patch: Partial<UserSettings>) => void;
  exportData: () => string;
  importData: (json: string) => boolean;
  resetAll: () => void;
  loadSampleData: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to persist", e);
    }
  }, [state]);

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

    return {
      state,
      toasts,
      toast,

      addSubject(data) {
        const subject: Subject = { ...data, id: defaultId(), createdAt: Date.now() };
        update((s) => ({ ...s, subjects: [...s.subjects, subject] }));
        return subject;
      },
      updateSubject(id, patch) {
        update((s) => ({ ...s, subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      deleteSubject(id) {
        update((s) => {
          const topicIds = new Set(s.topics.filter((t) => t.subjectId === id).map((t) => t.id));
          return {
            ...s,
            subjects: s.subjects.filter((x) => x.id !== id),
            topics: s.topics.filter((t) => t.subjectId !== id),
            tasks: s.tasks.filter((t) => !topicIds.has(t.topicId)),
            reviews: s.reviews.filter((r) => !topicIds.has(r.topicId)),
            sessions: s.sessions.filter((x) => !topicIds.has(x.topicId)),
            plans: s.plans.map((p) => ({ ...p, topicIds: p.topicIds.filter((t) => !topicIds.has(t)) })),
            activeSession: s.activeSession && topicIds.has(s.activeSession.topicId) ? null : s.activeSession,
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
      deleteTask(id) {
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
          taskId,
          mode,
          phase: "work",
          cycle: 0,
          running: true,
          startedAt: now,
          accumulatedMs: 0,
          totalStudyMs: 0,
          sessionStartedAt: now,
        };
        update((s) => ({
          ...s,
          activeSession: session,
          topics: s.topics.map((t) => (t.id === topicId && t.status === "not_started" ? { ...t, status: "learning" } : t)),
        }));
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
        const now = Date.now();
        const elapsed = a.running && a.startedAt != null ? now - a.startedAt : 0;
        const totalMs = a.totalStudyMs + (a.phase === "work" ? elapsed : 0);
        const durationMinutes = Math.max(1, Math.round(totalMs / 60000));
        const today = todayKey();

        const session: StudySession = {
          id: defaultId(),
          topicId: a.topicId,
          taskId: a.taskId,
          startedAt: a.sessionStartedAt,
          endedAt: now,
          durationMinutes,
          rating,
          mode: a.mode,
          date: today,
        };

        const previous =
          s.reviews
            .filter((r) => r.topicId === a.topicId)
            .sort((x, y) => y.reviewNumber - x.reviewNumber)[0] ?? null;
        const review = defaultScheduler.next({
          topicId: a.topicId,
          previous,
          rating,
          today,
          intervals: s.settings.reviewIntervals,
          idFactory: defaultId,
        });

        const newStatus: Topic["status"] = rating === 3 ? "mastered" : rating === 2 ? "learning" : "needs_review";

        update((cur) => {
          let tasks = cur.tasks;
          if (a.taskId) {
            tasks = tasks.map((t) => {
              if (t.id !== a.taskId) return t;
              const doneMinutes = t.doneMinutes + durationMinutes;
              const done = rating >= 2 || doneMinutes >= t.plannedMinutes;
              return { ...t, doneMinutes, status: done ? "done" : t.status };
            });
          }
          const prevTopic = cur.topics.find((t) => t.id === a.topicId);
          let xp = durationMinutes * XP_PER_MINUTE;
          if (newStatus === "mastered" && prevTopic?.status !== "mastered") xp += XP_PER_MASTERED;
          if (a.taskId && tasks.find((t) => t.id === a.taskId)?.status === "done" && cur.tasks.find((t) => t.id === a.taskId)?.status !== "done") xp += XP_PER_TASK;
          return addXp(
            {
              ...cur,
              activeSession: null,
              sessions: [...cur.sessions, session],
              tasks,
              topics: cur.topics.map((t) => (t.id === a.topicId ? { ...t, status: newStatus } : t)),
              // remove other pending reviews for this topic, then add the new one
              reviews: [...cur.reviews.filter((r) => !(r.topicId === a.topicId && r.status === "pending")), review],
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
            settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
            activeSession: null,
          });
          return true;
        } catch {
          return false;
        }
      },
      resetAll() {
        setState({ ...EMPTY_STATE, settings: { ...DEFAULT_SETTINGS, theme: stateRef.current.settings.theme, onboarded: true } });
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
        update((s) => ({ ...s, exams: s.exams.filter((x) => x.id !== id) }));
      },
      loadSampleData() {
        update((s) => {
          const subjects: Subject[] = [];
          const topics: Topic[] = [];
          SAMPLE_SUBJECTS.forEach((sub, i) => {
            const subject: Subject = { id: defaultId(), name: sub.name, color: sub.color, priority: i === 0 ? "high" : "medium", createdAt: Date.now() + i };
            subjects.push(subject);
            sub.topics.forEach((topic, j) => {
              topics.push({
                id: defaultId(),
                subjectId: subject.id,
                name: topic.name,
                volume: Math.round(topic.minutes / 6),
                estimatedMinutes: topic.minutes,
                priority: j === 0 ? "high" : "medium",
                difficulty: topic.difficulty,
                status: "not_started",
                createdAt: Date.now() + i * 10 + j,
              });
            });
          });
          return { ...s, subjects: [...s.subjects, ...subjects], topics: [...s.topics, ...topics] };
        });
      },
    };
  }, [state, toasts, toast, update]);

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
