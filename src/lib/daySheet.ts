// ===== «روز من» — از صبح تا آخر شب =====
// این ماژول داده‌ی خام (کلاس‌های ثابت هفته، تسک‌های برنامه، جلسه‌های واقعیِ ثبت‌شده،
// امتحان‌ها و مرورهای سررسید) را به یک تایم‌لاینِ قابل‌نمایش و قابل‌چاپ تبدیل می‌کند:
//  ۱. کلاس‌ها و امتحان‌ها ساعتِ واقعی دارند و همان‌جا می‌نشینند.
//  ۲. مطالعه‌ی ثبت‌شده‌ی آن روز از روی جلسه‌ها (startedAt/endedAt) بازسازی می‌شود.
//  ۳. تسک‌های در انتظار به‌صورت «پیشنهاد» داخل پنجره‌های خالی چیده می‌شوند — بدون
//     دست‌زدن به برنامه: فقط نمایش، تا ببینی روزت چطور جا می‌شود.
// همه‌ی توابع خالص‌اند (بدون تاریخِ سیستم) تا تست‌پذیر باشند.

import type { ClassBlock, Exam, Priority, Review, StudySession, StudyTask, Subject, Subject as SubjectT, TaskKind, Topic } from "../types";
import { TASK_KIND_ICON, TASK_KIND_LABEL } from "../types";
import { toFa } from "./jalali";

export type SheetItemKind = "class" | "exam" | "recorded" | "suggested";
export type SheetStatus = "done" | "pending" | "skipped";

export interface SheetItem {
  id: string;
  kind: SheetItemKind;
  title: string;
  /** خط دوم: درس، مبحث یا یادداشت */
  subtitle?: string;
  startMin: number;
  endMin: number;
  color: string;
  icon: string;
  /** چیپ کوتاه: «تست آموزشی»، «مرور ۳ روز بعد»، «بازمانده»… */
  label?: string;
  status?: SheetStatus;
  priority?: Priority;
  minutes: number;
  topicId?: string;
  subjectId?: string;
  /** برای تسک‌ها: شناسه‌ی تسک (دکمه‌ی «انجام شد» در UI) */
  taskId?: string;
}

export interface FreeWindow {
  start: number;
  end: number;
  minutes: number;
  /** بلندترین پنجره‌ی خالی روز — «پنجره‌ی طلایی» */
  best: boolean;
  /** آیا با ساعتِ طلاییِ خودِ کاربر همپوشانی دارد */
  golden?: boolean;
}

export interface SubjectTotal {
  subjectId: string;
  name: string;
  color: string;
  minutes: number;
}

export interface DaySheet {
  date: string;
  weekday: number;
  holiday: string | null;
  /** بازه‌ی نمایشِ محور زمان (با احتساب کلاس‌های زودتر یا تسک‌های دیرتر) */
  rangeStartMin: number;
  rangeEndMin: number;
  items: SheetItem[];
  allDay: SheetItem[];
  windows: FreeWindow[];
  unplaced: SheetItem[];
  conflicts: string[][];
  totals: {
    items: number;
    done: number;
    classMinutes: number;
    examMinutes: number;
    recordedMinutes: number;
    suggestedMinutes: number;
    plannedMinutes: number;
    freeMinutes: number;
    reviewsDue: number;
  };
  bySubject: SubjectTotal[];
  /** دقیقه‌ی «الان» اگر تاریخ انتخابی امروز باشد */
  nowMin: number | null;
}

export interface DaySheetInput {
  date: string;
  weekday: number;
  /** ساعت شروع/پایان روز از تنظیمات (دقیقه از نیمه‌شب) */
  dayStartMin: number;
  dayEndMin: number;
  classBlocks: ClassBlock[];
  tasks: StudyTask[];
  sessions: StudySession[];
  topics: Topic[];
  subjects: Subject[];
  exams: Exam[];
  reviews?: Pick<Review, "topicId" | "status" | "dueDate">[];
  holiday?: string | null;
  nowMin?: number | null;
  /** طول هر بلوکِ پیشنهادی مطالعه (پیش‌فرض ۵۰ دقیقه) */
  sessionMax?: number;
  /** حداقل طول یک پنجره‌ی خالیِ قابل‌استفاده (پیش‌فرض ۲۵ دقیقه) */
  minWindowMinutes?: number;
  /** پنجره‌ی طلاییِ کاربر از آمار (ساعت شروع/پایان) */
  goldenWindow?: { startHour: number; endHour: number } | null;
}

const DEFAULT_CLASS_COLORS = ["#0ea5a4", "#8b5cf6", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#10b981"];
const DEFAULT_SESSION_MAX = 50;
const DEFAULT_MIN_WINDOW = 25;
const MINUTE_STEP = 5;

/** «HH:mm» → دقیقه از نیمه‌شب؛ ورودی نامعتبر → null */
export function clockToMin(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 1440 ? v : null;
}

/** دقیقه → «۰۸:۳۰» (فارسی) */
export function minToClock(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return toFa(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

function round5(minutes: number): number {
  return Math.max(MINUTE_STEP, Math.round(minutes / MINUTE_STEP) * MINUTE_STEP);
}

/** ادغام بازه‌های هم‌پوشان/چسبیده — برای محاسبه‌ی زمانِ خالی */
export function mergeIntervals(list: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

/** فاصله‌های خالی بین بازه‌های پرمشغله، داخل [from, to] */
export function freeWindows(
  busy: { start: number; end: number }[],
  from: number,
  to: number,
  minMinutes = DEFAULT_MIN_WINDOW,
): { start: number; end: number; minutes: number }[] {
  const merged = mergeIntervals(busy).filter((i) => i.end > from && i.start < to);
  const out: { start: number; end: number; minutes: number }[] = [];
  let cursor = from;
  for (const b of merged) {
    if (b.start - cursor >= minMinutes) out.push({ start: cursor, end: b.start, minutes: b.start - cursor });
    cursor = Math.max(cursor, b.end);
  }
  if (to - cursor >= minMinutes) out.push({ start: cursor, end: to, minutes: to - cursor });
  return out;
}

/** زمانِ محلی یک timestamp به دقیقه‌ی همان روز؛ جلسه‌های چندروزه به روز خودشان چیده می‌شوند */
function sessionMinutes(s: StudySession): { start: number; end: number } | null {
  if (!Number.isFinite(s.startedAt) || !Number.isFinite(s.endedAt) || s.endedAt <= s.startedAt) return null;
  const start = new Date(s.startedAt);
  const end = new Date(s.endedAt);
  return { start: start.getHours() * 60 + start.getMinutes(), end: end.getHours() * 60 + end.getMinutes() };
}

export function buildDaySheet(input: DaySheetInput): DaySheet {
  const topics = new Map(input.topics.map((t) => [t.id, t]));
  const subjects = new Map(input.subjects.map((s) => [s.id, s]));
  const sessionMax = Math.max(15, Math.round(input.sessionMax ?? DEFAULT_SESSION_MAX));
  const minWindow = Math.max(10, Math.round(input.minWindowMinutes ?? DEFAULT_MIN_WINDOW));

  const dayClasses = input.classBlocks
    .filter((b) => b.weekday === input.weekday && b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const classItems: SheetItem[] = dayClasses.map((b, i) => ({
    id: `class:${b.id}`,
    kind: "class",
    title: b.title,
    subtitle: b.note,
    startMin: b.startMin,
    endMin: b.endMin,
    color: b.color || DEFAULT_CLASS_COLORS[i % DEFAULT_CLASS_COLORS.length],
    icon: "🏫",
    minutes: b.endMin - b.startMin,
  }));

  // امتحان‌ها: اگر ساعت داشته باشند روی تایم‌لاین می‌نشینند (۹۰ دقیقه)، وگرنه سربرگِ روز
  const dayExams = input.exams.filter((e) => e.date === input.date);
  const examItems: SheetItem[] = [];
  const allDay: SheetItem[] = [];
  for (const e of dayExams) {
    const at = clockToMin(e.time);
    const base: SheetItem = {
      id: `exam:${e.id}`,
      kind: "exam",
      title: e.title,
      subtitle: e.subject,
      startMin: at ?? 0,
      endMin: at != null ? at + 90 : 0,
      color: e.color || "#e11d48",
      icon: "🎓",
      label: at != null ? minToClock(at) : "بدون ساعت",
      minutes: at != null ? 90 : 0,
      subjectId: e.subjectId,
    };
    if (at != null) examItems.push(base);
    else allDay.push(base);
  }

  // مطالعه‌ی واقعیِ ثبت‌شده در همان تاریخ
  const daySessions = input.sessions.filter((s) => s.date === input.date && s.durationMinutes > 0);
  const recordedItems: SheetItem[] = [];
  const recordedBusy: { start: number; end: number }[] = [];
  for (const s of daySessions) {
    const span = sessionMinutes(s);
    if (!span) continue;
    const topic = s.topicId ? topics.get(s.topicId) : undefined;
    const subject = topic ? subjects.get(topic.subjectId) : undefined;
    recordedItems.push({
      id: `session:${s.id}`,
      kind: "recorded",
      title: topic?.name ?? "مطالعه بدون درس",
      subtitle: subject?.name,
      startMin: span.start,
      endMin: span.end,
      color: subject?.color ?? "#0d9488",
      icon: "✅",
      label: s.kind === "review" ? "مرور" : undefined,
      status: "done",
      minutes: s.durationMinutes,
      topicId: s.topicId ?? undefined,
      subjectId: subject?.id,
    });
    recordedBusy.push(span);
  }

  // پنجره‌های خالی: فقط کلاس‌ها و مطالعه‌ی ثبت‌شده پرمشغله حساب می‌شوند
  const dayStart = Math.max(0, Math.min(24 * 60 - 1, input.dayStartMin));
  const dayEnd = Math.max(dayStart + 60, Math.min(24 * 60, input.dayEndMin));
  const busyForFree = [...dayClasses.map((b) => ({ start: b.startMin, end: b.endMin })), ...recordedBusy];
  const golden = input.goldenWindow
    ? { start: input.goldenWindow.startHour * 60, end: input.goldenWindow.endHour * 60 }
    : null;
  const goldens = freeWindows(busyForFree, dayStart, dayEnd, minWindow);
  const longest = goldens.reduce<{ start: number; end: number; minutes: number } | null>(
    (acc, w) => (acc == null || w.minutes > acc.minutes ? w : acc),
    null,
  );
  const windows: FreeWindow[] = goldens.map((w) => ({
    start: w.start,
    end: w.end,
    minutes: w.minutes,
    best: longest != null && w.start === longest.start && w.end === longest.end,
    golden: golden != null && w.start < golden.end && golden.start < w.end,
  }));

  // ---- چیدن پیشنهادی تسک‌های در انتظار داخل پنجره‌های خالی ----
  const dayTasks = input.tasks.filter((t) => t.date === input.date && t.status === "pending");
  const leftoverTasks = input.tasks.filter((t) => t.date < input.date && t.status === "pending");
  const kindRank: Record<TaskKind, number> = { learn: 0, test: 1, summary: 2, review: 3 };
  const queue = [...leftoverTasks, ...dayTasks].sort((a, b) => {
    const aLate = a.date < input.date ? 0 : 1;
    const bLate = b.date < input.date ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
    return (a.order ?? 0) - (b.order ?? 0) || kindRank[a.kind ?? "learn"] - kindRank[b.kind ?? "learn"];
  });

  // شکستن هر تسک به بلوک‌هایی به اندازه‌ی یک نوبتِ تمرکز
  type Chunk = { task: StudyTask; minutes: number; late: boolean; index: number; total: number };
  const pool: Chunk[] = [];
  for (const t of queue) {
    const planned = Math.max(0, Math.round(t.plannedMinutes - t.doneMinutes));
    if (planned <= 0) continue;
    const count = Math.max(1, Math.ceil(planned / sessionMax));
    const each = Math.floor(planned / count / MINUTE_STEP) * MINUTE_STEP;
    const chunks: number[] = new Array(count).fill(each);
    chunks[count - 1] += planned - each * count;
    chunks.forEach((minutes, i) => {
      const m = round5(minutes);
      if (m > 0) pool.push({ task: t, minutes: m, late: t.date < input.date, index: i, total: count });
    });
  }

  const suggested: SheetItem[] = [];
  const unplacedChunks: Chunk[] = [];
  const remaining = [...pool];
  for (const w of windows) {
    let cursor = w.start;
    while (cursor < w.end) {
      const room = w.end - cursor;
      if (room < minWindow) break;
      // اولین بلوکی که در این پنجره جا می‌شود
      const idx = remaining.findIndex((c) => c.minutes <= room);
      if (idx < 0) break;
      const chunk = remaining.splice(idx, 1)[0];
      const topic = topics.get(chunk.task.topicId);
      const subject = topic ? subjects.get(topic.subjectId) : undefined;
      suggested.push({
        id: `suggested:${chunk.task.id}:${chunk.index}`,
        kind: "suggested",
        title: topic?.name ?? "مبحث حذف‌شده",
        subtitle: subject?.name,
        startMin: cursor,
        endMin: cursor + chunk.minutes,
        color: subject?.color ?? "#0d9488",
        icon: TASK_KIND_ICON[chunk.task.kind ?? "learn"],
        label: [chunk.task.label ?? TASK_KIND_LABEL[chunk.task.kind ?? "learn"], chunk.total > 1 ? `بخش ${toFa(chunk.index + 1)}/${toFa(chunk.total)}` : null, chunk.late ? "بازمانده" : null]
          .filter(Boolean)
          .join(" · "),
        status: "pending",
        priority: chunk.task.priority,
        minutes: chunk.minutes,
        topicId: topic?.id,
        subjectId: subject?.id,
        taskId: chunk.task.id,
      });
      cursor += chunk.minutes;
    }
  }
  unplacedChunks.push(...remaining);
  const unplaced: SheetItem[] = unplacedChunks.map((chunk) => {
    const topic = topics.get(chunk.task.topicId);
    const subject = topic ? subjects.get(topic.subjectId) : undefined;
    return {
      id: `unplaced:${chunk.task.id}:${chunk.index}`,
      kind: "suggested",
      title: topic?.name ?? "مبحث حذف‌شده",
      subtitle: subject?.name,
      startMin: 0,
      endMin: 0,
      color: subject?.color ?? "#0d9488",
      icon: TASK_KIND_ICON[chunk.task.kind ?? "learn"],
      label: chunk.task.label ?? TASK_KIND_LABEL[chunk.task.kind ?? "learn"],
      status: "pending",
      priority: chunk.task.priority,
      minutes: chunk.minutes,
      topicId: topic?.id,
      subjectId: subject?.id,
      taskId: chunk.task.id,
    };
  });

  const items = [...classItems, ...examItems, ...recordedItems, ...suggested].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );

  // تضادها: فقط بین چیزهای ثابتِ واقعی (کلاس و امتحان)
  const fixed = [...classItems, ...examItems].filter((i) => i.endMin > i.startMin);
  const conflicts: string[][] = [];
  for (let i = 0; i < fixed.length; i++) {
    const group = [fixed[i].id];
    for (let j = i + 1; j < fixed.length; j++) {
      if (fixed[i].startMin < fixed[j].endMin && fixed[j].startMin < fixed[i].endMin) group.push(fixed[j].id);
    }
    if (group.length > 1) conflicts.push(group);
  }

  const rangeStartMin = Math.min(dayStart, ...items.map((i) => i.startMin).filter((m) => m >= 0).concat([dayStart]));
  const rangeEndMin = Math.max(dayEnd, ...items.map((i) => i.endMin).concat([dayEnd]));

  const sum = (list: SheetItem[]) => list.reduce((n, i) => n + i.minutes, 0);
  const bySubjectMap = new Map<string, SubjectTotal>();
  for (const item of [...recordedItems, ...suggested]) {
    if (!item.subjectId) continue;
    const subject = subjects.get(item.subjectId);
    if (!subject) continue;
    const cur = bySubjectMap.get(subject.id) ?? { subjectId: subject.id, name: subject.name, color: subject.color, minutes: 0 };
    cur.minutes += item.minutes;
    bySubjectMap.set(subject.id, cur);
  }

  const dueReviews = (input.reviews ?? []).filter((r) => r.status === "pending" && r.dueDate <= input.date).length;

  return {
    date: input.date,
    weekday: input.weekday,
    holiday: input.holiday ?? null,
    rangeStartMin,
    rangeEndMin,
    items,
    allDay,
    windows,
    unplaced,
    conflicts,
    totals: {
      items: items.length,
      done: recordedItems.length,
      classMinutes: sum(classItems),
      examMinutes: sum(examItems),
      recordedMinutes: sum(recordedItems),
      suggestedMinutes: sum(suggested),
      plannedMinutes: sum(suggested) + sum(unplaced),
      freeMinutes: windows.reduce((n, w) => n + w.minutes, 0),
      reviewsDue: dueReviews,
    },
    bySubject: [...bySubjectMap.values()].sort((a, b) => b.minutes - a.minutes),
    nowMin: input.nowMin ?? null,
  };
}

/** یک هفته (۷ روز از شنبه) با همان موتور روز — برای نمای هفتگی */
export function buildWeekSheet(input: Omit<DaySheetInput, "date" | "weekday" | "holiday" | "nowMin"> & {
  dates: string[];
  weekdayOf: (date: string) => number;
  holidayOf?: (date: string) => string | null;
  nowDate?: string;
  nowMin?: number | null;
}): DaySheet[] {
  return input.dates.map((date) =>
    buildDaySheet({
      ...input,
      date,
      weekday: input.weekdayOf(date),
      holiday: input.holidayOf?.(date) ?? null,
      nowMin: date === input.nowDate ? (input.nowMin ?? null) : null,
    }),
  );
}

/** خروجی متنی برای اشتراک‌گذاری (تلگرام/واتساپ/یادداشت) */
export function sheetText(sheet: DaySheet, title: string): string {
  const lines: string[] = [`🗓️ ${title}`, "━━━━━━━━━━━━━━━━━━━━"];
  for (const item of sheet.items) {
    const time = `${minToClock(item.startMin)}–${minToClock(item.endMin)}`;
    lines.push(`${item.icon} ${time}  ${item.title}${item.subtitle ? ` (${item.subtitle})` : ""}${item.kind === "suggested" ? " · پیشنهاد" : ""}`);
  }
  for (const w of sheet.windows) {
    lines.push(`🕊 ${minToClock(w.start)}–${minToClock(w.end)}  خالی (${toFa(Math.round(w.minutes))} دقیقه)${w.best ? " ★" : ""}`);
  }
  if (sheet.unplaced.length > 0) {
    lines.push("⚠️ جا نشد:", ...sheet.unplaced.map((u) => `   • ${u.title} (${toFa(u.minutes)} دقیقه)`));
  }
  lines.push(
    "━━━━━━━━━━━━━━━━━━━━",
    `🏫 کلاس: ${toFa(Math.round(sheet.totals.classMinutes))} دقیقه · ✅ ثبت‌شده: ${toFa(Math.round(sheet.totals.recordedMinutes))} · 📖 پیشنهادی: ${toFa(Math.round(sheet.totals.suggestedMinutes))} · 🕊 خالی: ${toFa(Math.round(sheet.totals.freeMinutes))}`,
  );
  return lines.join("\n");
}

export const SHEET_SUBJECT_FALLBACK: Pick<SubjectT, "color"> = { color: "#0d9488" };
