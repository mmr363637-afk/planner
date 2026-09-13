// ===== سطل زباله‌ی ۳۰ روزه (توابع خالص) =====
// هر حذف، اسنپ‌شات کاملِ آیتم + وابسته‌هایش را نگه می‌دارد تا تا ۳۰ روز قابل
// بازگردانی باشد. بازگردانی با dedupe بر اساس id انجام می‌شود، پس اگر چیزی
// دوباره ساخته شده باشد، تکراری ایجاد نمی‌شود.
import type {
  AppState, Flashcard, Habit, JournalEntry, Mistake, Review, StudyNote, StudyPlan,
  StudySession, StudyTask, Subject, TimeCapsule, Topic, TrashKind, TrashedItem,
} from "../types";
import type { ClassBlock, Exam, TestLog } from "../types";

/** سقف تعداد آیتم‌های سطل (جلوگیری از باد کردن دیتا) */
export const TRASH_LIMIT = 100;
/** عمر آیتم‌ها به میلی‌ثانیه */
export const TRASH_TTL_MS = 30 * 24 * 3600 * 1000;

export const TRASH_KIND_META: Record<TrashKind, { label: string; icon: string }> = {
  subject: { label: "درس", icon: "📚" },
  topic: { label: "مبحث", icon: "📖" },
  plan: { label: "برنامه", icon: "🗓️" },
  task: { label: "کار", icon: "✅" },
  flashcard: { label: "فلش‌کارت", icon: "🃏" },
  exam: { label: "امتحان", icon: "📝" },
  habit: { label: "عادت", icon: "🌱" },
  mistake: { label: "اشتباه", icon: "📓" },
  note: { label: "یادداشت", icon: "📝" },
  capsule: { label: "کپسول", icon: "💌" },
  journal: { label: "بازتاب", icon: "🌙" },
  testLog: { label: "ثبت تست", icon: "🧪" },
  classBlock: { label: "کلاس", icon: "🏫" },
};

export interface SubjectSnapshot {
  subject: Subject;
  topics: Topic[];
  tasks: StudyTask[];
  reviews: Review[];
  sessions: StudySession[];
  cards: Flashcard[];
  mistakes: Mistake[];
  /** topicIds هر برنامه قبل از حذف — برای ترمیم عضویت مباحث */
  planTopicIds: Record<string, string[]>;
}

export interface TopicSnapshot {
  topics: Topic[];
  tasks: StudyTask[];
  reviews: Review[];
  sessions: StudySession[];
  cards: Flashcard[];
  mistakes: Mistake[];
  planTopicIds: Record<string, string[]>;
}

function planTopicIdsOf(plans: StudyPlan[]): Record<string, string[]> {
  return Object.fromEntries(plans.map((p) => [p.id, [...p.topicIds]]));
}

/** ساخت آیتم سطل (id بیرون ساخته و پاس داده می‌شود تا undo هم همان را بشناسد) */
export function makeTrashItem(id: string, kind: TrashKind, label: string, snapshot: unknown, deletedAt = Date.now()): TrashedItem {
  return { id, kind, label, deletedAt, snapshot };
}

/** افزودن به سطل با رعایت سقف — خالص */
export function pushTrash(trash: TrashedItem[] | undefined, item: TrashedItem): TrashedItem[] {
  return [item, ...(trash ?? [])].slice(0, TRASH_LIMIT);
}

/** حذف آیتم‌های منقضی — خالص */
export function purgeTrash(trash: TrashedItem[] | undefined, now = Date.now()): TrashedItem[] {
  return (trash ?? []).filter((t) => t && typeof t.deletedAt === "number" && now - t.deletedAt < TRASH_TTL_MS);
}

// ---------- اسنپ‌شات‌سازها (از state زنده، قبل از حذف) ----------

export function snapshotSubject(s: AppState, subjectId: string): { label: string; snapshot: SubjectSnapshot } | null {
  const subject = s.subjects.find((x) => x.id === subjectId);
  if (!subject) return null;
  const topicIds = new Set(s.topics.filter((t) => t.subjectId === subjectId).map((t) => t.id));
  return {
    label: `درس «${subject.name}»`,
    snapshot: {
      subject,
      topics: s.topics.filter((t) => t.subjectId === subjectId),
      tasks: s.tasks.filter((t) => topicIds.has(t.topicId)),
      reviews: s.reviews.filter((r) => topicIds.has(r.topicId)),
      sessions: s.sessions.filter((x) => x.topicId != null && topicIds.has(x.topicId)),
      cards: s.flashcards.filter((c) => c.topicId != null && topicIds.has(c.topicId)),
      mistakes: (s.mistakes ?? []).filter((m) => (m.topicId != null && topicIds.has(m.topicId)) || m.subjectId === subjectId),
      planTopicIds: planTopicIdsOf(s.plans),
    },
  };
}

export function snapshotTopics(s: AppState, topicIds: string[], label: string): { label: string; snapshot: TopicSnapshot } {
  const ids = new Set(topicIds);
  return {
    label,
    snapshot: {
      topics: s.topics.filter((t) => ids.has(t.id)),
      tasks: s.tasks.filter((t) => ids.has(t.topicId)),
      reviews: s.reviews.filter((r) => ids.has(r.topicId)),
      sessions: s.sessions.filter((x) => x.topicId != null && ids.has(x.topicId)),
      cards: s.flashcards.filter((c) => c.topicId != null && ids.has(c.topicId)),
      mistakes: (s.mistakes ?? []).filter((m) => m.topicId != null && ids.has(m.topicId)),
      planTopicIds: planTopicIdsOf(s.plans),
    },
  };
}

export function snapshotPlan(s: AppState, planId: string): { label: string; snapshot: { plan: StudyPlan; tasks: StudyTask[] } } | null {
  const plan = s.plans.find((p) => p.id === planId);
  if (!plan) return null;
  return { label: `برنامه «${plan.goal}»`, snapshot: { plan, tasks: s.tasks.filter((t) => t.planId === planId) } };
}

// ---------- بازگردانی (خالص) ----------

function mergeById<T extends { id: string }>(cur: T[] | undefined, back: T[] | undefined): T[] {
  const have = new Set((cur ?? []).map((x) => x.id));
  const fresh = (back ?? []).filter((x) => x && !have.has(x.id));
  return [...(cur ?? []), ...fresh];
}

function healPlanTopics(plans: StudyPlan[], saved: Record<string, string[]> | undefined): StudyPlan[] {
  if (!saved) return plans;
  return plans.map((p) => {
    const want = saved[p.id];
    if (!want) return p;
    const merged = [...p.topicIds];
    for (const id of want) if (!merged.includes(id)) merged.push(id);
    return { ...p, topicIds: merged };
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

/**
 * بازگردانی یک آیتم سطل روی state — خالص. آیتم‌های خراب/ناشناس نادیده گرفته
 * می‌شوند (state دست‌نخورده برمی‌گردد) تا هیچ‌وقت کرش نکنیم.
 */
export function restoreTrashItem(state: AppState, item: TrashedItem): AppState {
  const snap = item.snapshot;
  if (!isRecord(snap)) return state;
  try {
    switch (item.kind) {
      case "subject": {
        const s = snap as unknown as SubjectSnapshot;
        if (!s.subject) return state;
        return {
          ...state,
          subjects: mergeById(state.subjects, [s.subject]),
          topics: mergeById(state.topics, s.topics),
          tasks: mergeById(state.tasks, s.tasks),
          reviews: mergeById(state.reviews, s.reviews),
          sessions: mergeById(state.sessions, s.sessions),
          flashcards: mergeById(state.flashcards, s.cards),
          mistakes: mergeById(state.mistakes, s.mistakes),
          plans: healPlanTopics(state.plans, s.planTopicIds),
        };
      }
      case "topic": {
        const s = snap as unknown as TopicSnapshot;
        if (!Array.isArray(s.topics)) return state;
        return {
          ...state,
          topics: mergeById(state.topics, s.topics),
          tasks: mergeById(state.tasks, s.tasks),
          reviews: mergeById(state.reviews, s.reviews),
          sessions: mergeById(state.sessions, s.sessions),
          flashcards: mergeById(state.flashcards, s.cards),
          mistakes: mergeById(state.mistakes, s.mistakes),
          plans: healPlanTopics(state.plans, s.planTopicIds),
        };
      }
      case "plan": {
        const s = snap as unknown as { plan: StudyPlan; tasks: StudyTask[] };
        if (!s.plan) return state;
        return { ...state, plans: mergeById(state.plans, [s.plan]), tasks: mergeById(state.tasks, s.tasks) };
      }
      case "task": {
        const s = snap as unknown as { task: StudyTask };
        return s.task ? { ...state, tasks: mergeById(state.tasks, [s.task]) } : state;
      }
      case "flashcard": {
        const s = snap as unknown as { card: Flashcard };
        return s.card ? { ...state, flashcards: mergeById(state.flashcards, [s.card]) } : state;
      }
      case "exam": {
        const s = snap as unknown as { exam: Exam };
        return s.exam ? { ...state, exams: mergeById(state.exams, [s.exam]) } : state;
      }
      case "habit": {
        const s = snap as unknown as { habit: Habit };
        return s.habit ? { ...state, habits: mergeById(state.habits, [s.habit]) } : state;
      }
      case "mistake": {
        const s = snap as unknown as { mistake: Mistake };
        return s.mistake ? { ...state, mistakes: mergeById(state.mistakes, [s.mistake]) } : state;
      }
      case "note": {
        const s = snap as unknown as { note: StudyNote };
        return s.note ? { ...state, notes: mergeById(state.notes, [s.note]) } : state;
      }
      case "capsule": {
        const s = snap as unknown as { capsule: TimeCapsule };
        return s.capsule ? { ...state, capsules: mergeById(state.capsules, [s.capsule]) } : state;
      }
      case "journal": {
        const s = snap as unknown as { entry: JournalEntry };
        return s.entry ? { ...state, journal: mergeById(state.journal, [s.entry]) } : state;
      }
      case "testLog": {
        const s = snap as unknown as { log: TestLog };
        return s.log ? { ...state, testLogs: mergeById(state.testLogs, [s.log]) } : state;
      }
      case "classBlock": {
        const s = snap as unknown as { block: ClassBlock };
        return s.block ? { ...state, classBlocks: mergeById(state.classBlocks, [s.block]) } : state;
      }
      default:
        return state;
    }
  } catch {
    return state;
  }
}
