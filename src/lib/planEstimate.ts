// ===== تخمین واقع‌بینانهٔ زمان مطالعه =====
// زمان یک مبحث ثابت نیست: همان فصل با رفرنس ۴–۸ ساعت، با بانک سؤال ~۹۰ دقیقه و با
// میکرودرسنامه ~۲۵ دقیقه وقت می‌برد. این ماژول:
//  ۱) ضریب هر روش مطالعه را روی برآورد پایهٔ کاربر اعمال می‌کند،
//  ۲) اگر کاربر برای همان روش عدد دستی گذاشته باشد، همان را مقدم می‌داند،
//  ۳) و با سابقهٔ واقعی (زمان ثبت‌شده در برابر زمان برنامه‌ریزی‌شدهٔ تسک‌های انجام‌شده)
//     تخمین را آرام و محدود اصلاح می‌کند — نه با یک جلسه، نه بی‌سقف.
// همه‌چیز آفلاین و خالص است.
import type { StudyApproach, StudySession, StudyTask, TaskKind, Topic } from "../types";

/** ضریب زمانِ هر روش نسبت به «ترکیبی» — مثال‌های خودِ کاربر مبنا گرفته شده‌اند */
export const APPROACH_TIME_FACTOR: Record<StudyApproach, number> = {
  reference: 1.35, // کتاب مرجع: عمیق‌ترین و طولانی‌ترین
  mixed: 1,
  notes: 0.75, // جزوه/درسنامهٔ کوتاه
  qbank: 0.6, // بانک سؤال: سریع‌ترین مسیرِ پوشش
};

export const APPROACH_TIME_NOTE: Record<StudyApproach, string> = {
  reference: "خواندن عمیق رفرنس؛ بیشترین زمان",
  mixed: "ترکیب متعادل درس و تست؛ زمان مبنا",
  notes: "جزوه/درسنامهٔ کوتاه؛ حدود ۷۵٪ زمان مبنا",
  qbank: "بانک سؤال؛ حدود ۶۰٪ زمان مبنا",
};

/**
 * حداقل زمانِ معنادار برای هر نوع تسک. کمتر از این، «۱۵ دقیقه برای مبحث ۹۰ دقیقه‌ای»
 * می‌سازد که عملاً اجراشدنی نیست.
 */
export const MIN_KIND_CHUNK: Record<TaskKind, number> = {
  learn: 30,
  test: 20,
  review: 10,
  summary: 15,
};

const DIFFICULTY_FACTOR: Record<number, number> = { 1: 1, 2: 1.2, 3: 1.5 };
const ROUND_TO = 5;
const MIN_TOPIC_MINUTES = 20;

function round5(n: number): number {
  return Math.max(ROUND_TO, Math.round(n / ROUND_TO) * ROUND_TO);
}

export interface TopicPace {
  /** دقیقه‌های برنامه‌ریزی‌شدهٔ تسک‌های انجام‌شدهٔ این مبحث */
  plannedMinutes: number;
  /** دقیقه‌های واقعیِ ثبت‌شده روی همان تسک‌ها */
  actualMinutes: number;
  samples: number;
  /** ضریب اصلاح ۰٫۶..۱٫۶ — ۱ یعنی سابقهٔ کافی/هم‌خوان نداریم */
  factor: number;
}

/**
 * ضریب سرعتِ واقعی از تسک‌های انجام‌شده: اگر کاربر برای تسک ۴۵ دقیقه‌ای همیشه
 * ۷۰ دقیقه وقت می‌گذارد، تخمین‌های بعدی باید بزرگ‌تر شوند (و برعکس).
 * فقط با حداقل ۳ تسک و ۳۰ دقیقه سابقه اعمال می‌شود تا یک جلسهٔ استثنایی کل برنامه را خراب نکند.
 */
export function topicPace(topicId: string, tasks: StudyTask[], sessions: StudySession[]): TopicPace {
  const doneTasks = tasks.filter((t) => t.topicId === topicId && t.status === "done" && t.plannedMinutes > 0);
  if (doneTasks.length === 0) return { plannedMinutes: 0, actualMinutes: 0, samples: 0, factor: 1 };
  const taskIds = new Set(doneTasks.map((t) => t.id));
  let actual = 0;
  for (const s of sessions) {
    if (s.topicId === topicId && s.taskId && taskIds.has(s.taskId)) actual += Math.max(0, s.durationMinutes);
  }
  const planned = doneTasks.reduce((sum, t) => sum + t.plannedMinutes, 0);
  if (doneTasks.length < 3 || planned < 30 || actual <= 0) {
    return { plannedMinutes: planned, actualMinutes: actual, samples: doneTasks.length, factor: 1 };
  }
  const raw = actual / planned;
  return {
    plannedMinutes: planned,
    actualMinutes: actual,
    samples: doneTasks.length,
    factor: Math.max(0.6, Math.min(1.6, raw)),
  };
}

export interface TopicEstimate {
  /** دقیقهٔ مؤثرِ نهایی (گردشده، حداقل ۲۰) */
  minutes: number;
  /** برآورد پایهٔ خود کاربر (با ضریب سختی) */
  base: number;
  approach: StudyApproach;
  approachFactor: number;
  /** ضریب اصلاح از سابقه — ۱ یعنی اصلاحی اعمال نشد */
  paceFactor: number;
  source: "manual" | "history" | "approach";
  /** توضیح کوتاهِ قابل‌نمایش */
  reason: string;
}

/**
 * برآورد زمان یک مبحث برای روش مطالعهٔ انتخاب‌شده.
 * اولویت: عدد دستیِ همان روش → برآورد پایه × ضریب روش × اصلاح سابقه.
 */
export function estimateTopicMinutes(
  topic: Topic,
  approach: StudyApproach = "mixed",
  opts: { tasks?: StudyTask[]; sessions?: StudySession[] } = {},
): TopicEstimate {
  const base = Math.max(1, (topic.estimatedMinutes || 0) * (DIFFICULTY_FACTOR[topic.difficulty] ?? 1));
  const manual = topic.estimateOverrides?.[approach];
  if (typeof manual === "number" && Number.isFinite(manual) && manual > 0) {
    return {
      minutes: Math.max(MIN_TOPIC_MINUTES, round5(manual)),
      base,
      approach,
      approachFactor: 1,
      paceFactor: 1,
      source: "manual",
      reason: `زمان دستیِ خودت برای روش «${approach}»`,
    };
  }
  const factor = APPROACH_TIME_FACTOR[approach] ?? 1;
  const pace = topicPace(topic.id, opts.tasks ?? [], opts.sessions ?? []);
  const paceFactor = pace.factor;
  const minutes = Math.max(MIN_TOPIC_MINUTES, round5(base * factor * paceFactor));
  const source: TopicEstimate["source"] = paceFactor !== 1 ? "history" : "approach";
  const reason =
    paceFactor > 1.02
      ? `سابقهٔ تو نشان می‌دهد این مبحث بیشتر از برآورد وقت می‌گیرد (×${paceFactor.toFixed(2)})`
      : paceFactor < 0.98
        ? `سابقهٔ تو نشان می‌دهد این مبحث سریع‌تر تمام می‌شود (×${paceFactor.toFixed(2)})`
        : APPROACH_TIME_NOTE[approach];
  return { minutes, base, approach, approachFactor: factor, paceFactor, source, reason };
}

/** حداقل زمانِ یک نوبت برای هر نوع تسک، هم‌خوان با سقف تمرکز کاربر */
export function minChunkForKind(kind: TaskKind | undefined, maxSessionMinutes?: number): number {
  const floor = MIN_KIND_CHUNK[kind ?? "learn"] ?? MIN_KIND_CHUNK.learn;
  return maxSessionMinutes && maxSessionMinutes > 0 ? Math.min(floor, maxSessionMinutes) : floor;
}

export interface PlanLoadEstimate {
  totalMinutes: number;
  byTopic: { topicId: string; minutes: number; approach: StudyApproach }[];
  bySubject: Record<string, number>;
}

/** جمعِ برآوردها برای نمایشِ «با این روش‌ها چقدر کار داری؟» در ویزارد */
export function estimatePlanLoad(
  topics: Topic[],
  approaches: Record<string, StudyApproach> = {},
  opts: { subjectOf?: (topic: Topic) => string; tasks?: StudyTask[]; sessions?: StudySession[] } = {},
): PlanLoadEstimate {
  const byTopic: PlanLoadEstimate["byTopic"] = [];
  const bySubject: Record<string, number> = {};
  let totalMinutes = 0;
  for (const topic of topics) {
    const approach = approaches[topic.subjectId] ?? "mixed";
    const est = estimateTopicMinutes(topic, approach, opts);
    byTopic.push({ topicId: topic.id, minutes: est.minutes, approach });
    totalMinutes += est.minutes;
    const subjectId = opts.subjectOf ? opts.subjectOf(topic) : topic.subjectId;
    bySubject[subjectId] = (bySubject[subjectId] ?? 0) + est.minutes;
  }
  return { totalMinutes, byTopic, bySubject };
}
