/** Explainable, local decisions: no model scores masquerading as learning outcomes. */
import type { AppState, StudyTask } from "../types";
import { addDays, diffDays, weekdayOf } from "./jalali";
import { leafTopics } from "./topics";
import { diagnoseWeakSpots } from "./diagnostics";
import { matchExamSubject } from "./readiness";

export function eisenhowerQuads(tasks: StudyTask[], today: string) {
  const urgent = (t: StudyTask) => t.date <= today;
  return [
    {
      key: "do",
      label: "همین حالا انجام بده",
      hint: "مهم و فوری",
      color: "#ef4444",
      icon: "🔥",
      items: tasks.filter((t) => t.important && urgent(t)),
    },
    {
      key: "schedule",
      label: "برنامه‌ریزی کن",
      hint: "مهم ولی غیرفوری",
      color: "#f59e0b",
      icon: "🎯",
      items: tasks.filter((t) => t.important && !urgent(t)),
    },
    {
      key: "quick",
      label: "سریع تمامش کن",
      hint: "فوری ولی کم‌اهمیت",
      color: "#3b82f6",
      icon: "⚡",
      items: tasks.filter((t) => !t.important && urgent(t)),
    },
    {
      key: "later",
      label: "بگذار برای بعد",
      hint: "نه مهم نه فوری",
      color: "#94a3b8",
      icon: "🌙",
      items: tasks.filter((t) => !t.important && !urgent(t)),
    },
  ];
}

export interface Recommendation {
  key: string;
  topicId?: string;
  taskId?: string;
  kind: "study" | "review" | "cards" | "mistakes";
  title: string;
  minutes: number;
  reasons: string[];
  score: number;
}
export function recommendNext(
  state: AppState,
  today: string,
  budget = 25,
  energy: "normal" | "low" = "normal",
): Recommendation[] {
  const active = new Set(
    state.subjects.filter((s) => !s.archived).map((s) => s.id),
  );
  const weak = new Set(diagnoseWeakSpots(state).map((s) => s.topicId));
  const exams = state.exams.filter(
    (e) => e.date >= today && diffDays(today, e.date) <= 14,
  );
  const candidates: Recommendation[] = [];
  for (const topic of leafTopics(state.topics).filter((t) =>
    active.has(t.subjectId),
  )) {
    const tasks = state.tasks
      .filter(
        (t) =>
          t.topicId === topic.id && t.status === "pending" && t.date <= today,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    const review = state.reviews.some(
      (r) =>
        r.topicId === topic.id && r.status === "pending" && r.dueDate <= today,
    );
    const cards = state.flashcards.filter(
      (c) => c.topicId === topic.id && c.dueDate <= today,
    ).length;
    const mistakes = state.mistakes.filter(
      (m) => m.topicId === topic.id && m.dueDate <= today,
    ).length;
    if (
      topic.status === "mastered" &&
      !tasks.length &&
      !review &&
      !cards &&
      !mistakes
    )
      continue;
    const reasons: string[] = [];
    let score = 0;
    if (tasks.length) {
      score += 30;
      reasons.push(
        tasks[0].date < today ? "کار عقب‌افتاده داری" : "در برنامهٔ امروزت است",
      );
    }
    if (review) {
      score += 35;
      reasons.push("مرور این مبحث سررسید شده");
    }
    if (cards) {
      score += 15;
      reasons.push(`${cards} کارت سررسیدشده دارد`);
    }
    if (mistakes) {
      score += 40;
      reasons.push("اشتباه ثبت‌شده برای تمرین دارد");
    }
    if (weak.has(topic.id)) {
      score += 20;
      reasons.push("در داده‌های ثبت‌شده نیاز به تمرین دارد");
    }
    const exam = exams.find(
      (e) => matchExamSubject(e, state.subjects)?.id === topic.subjectId,
    );
    if (exam) {
      score += 30 - diffDays(today, exam.date);
      reasons.push(`امتحان «${exam.title}» نزدیک است`);
    }
    if (topic.priority === "high") score += 10;
    if (energy === "low") {
      score += topic.difficulty === 1 ? 15 : -10;
      if (topic.difficulty === 1) reasons.push("برای انرژی کم، سبک‌تر است");
    }
    const kind = mistakes
      ? "mistakes"
      : review
        ? "review"
        : cards
          ? "cards"
          : "study";
    const desired =
      kind === "study"
        ? Math.max(
            5,
            (tasks[0]?.plannedMinutes ?? topic.estimatedMinutes) -
              (tasks[0]?.doneMinutes ?? 0),
          )
        : 15;
    candidates.push({
      key: `${kind}:${topic.id}`,
      topicId: topic.id,
      taskId: kind === "study" ? tasks[0]?.id : undefined,
      kind,
      title: topic.name,
      minutes: Math.max(5, Math.min(budget, desired)),
      reasons: reasons.length ? reasons : ["یک قدم کوتاه از مباحث باقی‌مانده"],
      score,
    });
  }
  const standalone = state.flashcards.filter(
    (c) => !c.topicId && c.dueDate <= today,
  ).length;
  if (standalone)
    candidates.push({
      key: "cards:free",
      kind: "cards",
      title: "کارت‌های مستقل",
      minutes: Math.min(15, budget),
      reasons: [`${standalone} کارت سررسید شده`],
      score: 25,
    });
  return candidates.sort(
    (a, b) => b.score - a.score || a.key.localeCompare(b.key),
  );
}

export interface PaceEstimate {
  subjectId: string;
  name: string;
  samples: number;
  sampleKey: string;
  factor: number;
  topicChanges: { id: string; before: number; after: number }[];
}
/** Median completed learning-task ratios; do not compare a whole topic with one session. */
export function paceEstimates(state: AppState, today: string): PaceEstimate[] {
  return state.subjects
    .filter((s) => !s.archived)
    .flatMap((subject) => {
      const topicIds = new Set(
        state.topics.filter((t) => t.subjectId === subject.id).map((t) => t.id),
      );
      const accepted = new Set(
        (state.settings.paceAccepted?.[subject.id] ?? "")
          .split("|")
          .map((s) => s.split(":")[0]),
      );
      const observations = state.tasks
        .filter(
          (t) =>
            t.status === "done" &&
            !accepted.has(t.id) &&
            (!t.kind || t.kind === "learn") &&
            topicIds.has(t.topicId) &&
            t.plannedMinutes >= 5 &&
            t.date >= addDays(today, -90) &&
            t.date <= today,
        )
        .map((t) => ({
          task: t,
          actual:
            state.sessions
              .filter((s) => s.taskId === t.id)
              .reduce((n, s) => n + s.durationMinutes, 0) || t.doneMinutes,
        }))
        .filter((x) => x.actual >= 5);
      const samples = observations
        .map((x) => x.actual / x.task.plannedMinutes)
        .sort((a, b) => a - b);
      if (samples.length < 3) return [];
      const median =
        samples.length % 2
          ? samples[Math.floor(samples.length / 2)]
          : (samples[samples.length / 2 - 1] + samples[samples.length / 2]) / 2;
      const factor = Math.max(0.5, Math.min(2, median));
      if (Math.abs(factor - 1) < 0.15) return [];
      const topicChanges = leafTopics(state.topics)
        .filter((t) => topicIds.has(t.id) && t.status !== "mastered")
        .map((t) => ({
          id: t.id,
          before: t.estimatedMinutes,
          after: Math.max(5, Math.round((t.estimatedMinutes * factor) / 5) * 5),
        }));
      return [
        {
          subjectId: subject.id,
          name: subject.name,
          samples: samples.length,
          sampleKey: observations
            .map(
              ({ task, actual }) =>
                `${task.id}:${task.plannedMinutes}:${actual}`,
            )
            .sort()
            .join("|"),
          factor,
          topicChanges,
        },
      ];
    });
}

export interface ScheduleOptions {
  today: string;
  end: string;
  dailyMinutes: number;
  todayMinutes?: number;
  offDays?: number[];
  lowEnergy?: boolean;
  prioritize?: boolean;
}
export interface SchedulePreview {
  tasks: StudyTask[];
  changes: { id: string; from: string; to: string }[];
  unscheduled: StudyTask[];
  days: { date: string; capacity: number; minutes: number }[];
  warnings: string[];
  coverage: number;
  totalMinutes: number;
}
/** Union, not sum: overlapping fixed classes must not consume capacity twice. */
export function classMinutes(state: AppState, weekday: number): number {
  const blocks = state.classBlocks
    .filter((b) => b.weekday === weekday)
    .sort((a, b) => a.startMin - b.startMin);
  let end = 0,
    total = 0;
  for (const b of blocks) {
    total += Math.max(0, b.endMin - Math.max(end, b.startMin));
    end = Math.max(end, b.endMin);
  }
  return total;
}
export function schedulePreview(
  state: AppState,
  options: ScheduleOptions,
): SchedulePreview {
  const { today, end } = options;
  const days: SchedulePreview["days"] = [];
  const span = Math.max(0, Math.min(90, diffDays(today, end) + 1));
  for (let i = 0; i < span; i++) {
    const date = addDays(today, i),
      wd = weekdayOf(date);
    const capacity = options.offDays?.includes(wd)
      ? 0
      : i === 0 && options.todayMinutes != null
        ? Math.max(0, options.todayMinutes)
        : Math.max(
            0,
            options.dailyMinutes -
              classMinutes(state, wd) -
              (i === 0
                ? state.sessions
                    .filter((s) => s.date === today)
                    .reduce((n, s) => n + s.durationMinutes, 0)
                : 0),
          );
    days.push({ date, capacity, minutes: 0 });
  }
  const archived = new Set(
    state.subjects.filter((s) => s.archived).map((s) => s.id),
  );
  const topics = new Map(state.topics.map((t) => [t.id, t]));
  const plans = new Map(state.plans.map((p) => [p.id, p]));
  const weak = new Set(diagnoseWeakSpots(state).map((s) => s.topicId));
  const candidates = state.tasks.filter(
    (t) =>
      t.status === "pending" &&
      t.date <= end &&
      t.id !== state.activeSession?.taskId &&
      topics.has(t.topicId) &&
      !archived.has(topics.get(t.topicId)!.subjectId) &&
      !plans.get(t.planId ?? "")?.archived,
  );
  const urgency = (t: StudyTask) =>
    (t.kind === "review" ? 100 : 0) +
    (t.important ? 40 : 0) +
    (weak.has(t.topicId) ? 30 : 0) +
    (t.priority === "high" ? 20 : 0) +
    (options.lowEnergy
      ? (3 - (topics.get(t.topicId)?.difficulty ?? 2)) * 10
      : 0);
  candidates.sort(
    (a, b) =>
      (options.prioritize || options.lowEnergy ? urgency(b) - urgency(a) : 0) ||
      a.date.localeCompare(b.date) ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
  // Tasks not in the preview still reserve their original capacity.
  const selected = new Set(candidates.map((t) => t.id));
  for (const t of state.tasks.filter(
    (t) => t.status === "pending" && !selected.has(t.id),
  )) {
    const day = days.find((d) => d.date === t.date);
    if (day) day.minutes += Math.max(0, t.plannedMinutes - t.doneMinutes);
  }
  // Keep the existing sequence of phases within a topic while choosing priorities between topics.
  const predecessor = new Map<string, StudyTask>();
  const chains = new Map<string, StudyTask[]>();
  for (const t of candidates)
    chains.set(t.topicId, [...(chains.get(t.topicId) ?? []), t]);
  for (const chain of chains.values()) {
    chain.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.order - b.order ||
        a.id.localeCompare(b.id),
    );
    for (let i = 1; i < chain.length; i++)
      predecessor.set(chain[i].id, chain[i - 1]);
  }
  const ordered: StudyTask[] = [],
    remaining = [...candidates],
    visited = new Set<string>();
  while (remaining.length) {
    const index = remaining.findIndex(
      (t) => !predecessor.has(t.id) || visited.has(predecessor.get(t.id)!.id),
    );
    const next = remaining.splice(Math.max(0, index), 1)[0];
    ordered.push(next);
    visited.add(next.id);
  }
  const assignments = new Map<string, string>(),
    unscheduled: StudyTask[] = [];
  for (const t of ordered) {
    const plan = plans.get(t.planId ?? "");
    const subjectId = topics.get(t.topicId)?.subjectId;
    const examDates = state.exams
      .filter(
        (e) =>
          e.date >= today &&
          matchExamSubject(e, state.subjects)?.id === subjectId,
      )
      .map((e) => addDays(e.date, -1));
    const deadline = [
      end,
      ...(plan ? [plan.endDate] : []),
      ...examDates,
    ].sort()[0];
    const minutes = Math.max(0, t.plannedMinutes - t.doneMinutes);
    // Never advance a spaced review before its scheduled day.
    let earliest =
      t.kind === "review" ? (t.date > today ? t.date : today) : today;
    if (plan && plan.startDate > earliest) earliest = plan.startDate;
    const previous = predecessor.get(t.id);
    if (previous) {
      const placed = assignments.get(previous.id);
      if (!placed) {
        unscheduled.push(t);
        continue;
      }
      const nextAfter = addDays(
        placed,
        t.kind === "review" ? Math.max(0, diffDays(previous.date, t.date)) : 0,
      );
      if (nextAfter > earliest) earliest = nextAfter;
    }
    const day = days.find(
      (d) =>
        d.date >= earliest &&
        d.date <= deadline &&
        (!plan || plan.studyDays.includes(weekdayOf(d.date))) &&
        d.minutes + minutes <= d.capacity,
    );
    if (!day) {
      unscheduled.push(t);
      continue;
    }
    day.minutes += minutes;
    assignments.set(t.id, day.date);
  }
  const changes = candidates
    .filter((t) => assignments.has(t.id) && assignments.get(t.id) !== t.date)
    .map((t) => ({ id: t.id, from: t.date, to: assignments.get(t.id)! }));
  const totalMinutes = candidates.reduce(
    (n, t) => n + Math.max(0, t.plannedMinutes - t.doneMinutes),
    0,
  );
  const missing = unscheduled.reduce(
    (n, t) => n + Math.max(0, t.plannedMinutes - t.doneMinutes),
    0,
  );
  const warnings: string[] = [];
  if (unscheduled.length)
    warnings.push(
      `${unscheduled.length} کار در ظرفیت یا مهلت موجود جا نمی‌شود؛ چیزی حذف نشده و اعمال برنامه تا رفع کمبود غیرفعال است.`,
    );
  const due =
    state.reviews.filter((r) => r.status === "pending" && r.dueDate <= today)
      .length + state.flashcards.filter((c) => c.dueDate <= today).length;
  if (due)
    warnings.push(
      `${due} مرور/کارت سررسیدشده جدا از تسک‌هاست؛ برای آن‌ها زمان کنار بگذار. این ابزار موعد مرورها را عوض نمی‌کند.`,
    );
  if (state.activeSession)
    warnings.push("جلسهٔ فعال و کار متصل به آن جابه‌جا نمی‌شوند.");
  if (!candidates.length)
    warnings.push("کاری در این بازه برای بازچینی وجود ندارد.");
  return {
    tasks: state.tasks.map((t) =>
      assignments.has(t.id) ? { ...t, date: assignments.get(t.id)! } : t,
    ),
    changes,
    unscheduled,
    days,
    warnings,
    coverage: totalMinutes
      ? Math.round(((totalMinutes - missing) / totalMinutes) * 100)
      : 100,
    totalMinutes,
  };
}
/** Reject a stale preview instead of overwriting work done in another tab/dialog. */
export function planningFingerprint(s: AppState): string {
  return JSON.stringify([
    s.tasks,
    s.topics,
    s.plans,
    s.exams,
    s.classBlocks,
    s.sessions,
    s.activeSession,
    s.reviews,
    s.flashcards,
    s.mistakes,
    s.subjects,
  ]);
}
