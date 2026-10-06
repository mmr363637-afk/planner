// ===== هماهنگی «ثبت مطالعه» با «تسک‌های برنامه» =====
// هدف: فرقی نمی‌کند مطالعه از کجا ثبت شود (تایمر، ثبت دستی، صدا، یا تکمیل تسک)؛
// برنامه باید همان لحظه آن را بفهمد:
//  ۱. واریز دقیقه‌ها به تسک‌های در انتظارِ همان مبحث (اول از همه‌ی تسکِ هم‌نوعِ فعالیت)
//  ۲. «پیش‌خوانی»: اگر مطالعه به تسکِ روزهای آینده واریز شد، معادلِ همان دقیقه‌ها از
//     بارِ امروز آزاد می‌شود و تسک‌های امروز (کم‌اولویت‌ترها، ترجیحاً از مبحث‌های دیگر)
//     به فردا می‌روند تا هدفِ زمانیِ روز ثابت بماند.

import { studyKindTaskKinds, type Rating, type StudyKind, type StudyTask, type TaskKind, type Topic } from "../types";
import { addDays } from "./jalali";

export interface CreditInput {
  tasks: StudyTask[];
  topicId: string;
  /** دقیقه‌های مطالعه‌ی تازه ثبت‌شده */
  minutes: number;
  today: string;
  /** نوع فعالیتِ انجام‌شده — اگر باشد، تسک‌های هم‌نوع اول واریز می‌شوند */
  kind?: StudyKind;
  /** چند نوع در یک نوبت (درسنامه + تست با هم) — جای `kind` را می‌گیرد */
  kinds?: StudyKind[];
  /** تسکِ جلسه‌ی فعال — نباید دست بخورد */
  activeTaskId?: string;
  /** اگر تسک مشخصی هدف جلسه بوده، اول به او واریز شود */
  preferTaskId?: string;
  /** بازچینی امروز بعد از پیش‌خوانی (پیش‌فرض روشن) */
  rebalance?: boolean;
}

export interface CreditResult {
  tasks: StudyTask[];
  /** مجموع دقیقه‌هایی که واقعاً به تسک‌ها واریز شد (تا سقف برنامه) */
  creditedMinutes: number;
  /** دقیقه‌هایی که به تسک‌های بعد از امروز واریز شد (پیش‌خوانی) */
  futureMinutes: number;
  creditedTaskIds: string[];
  /** تسک‌هایی که با این واریز کامل شدند */
  doneTaskIds: string[];
  movedTaskIds: string[];
  movedMinutes: number;
  /**
   * دقیقه‌هایی که به هیچ تسکی واریز نشد (برنامه‌ی این مبحث تمام شده بود).
   * این‌ها همان‌جا متوقف می‌شوند: نه مرورِ آینده را «انجام‌شده» می‌کنند و نه
   * تسکی را جلو می‌اندازند — فقط در آمار می‌مانند.
   */
  unplannedMinutes: number;
}

const PRIORITY_RANK: Record<StudyTask["priority"], number> = { high: 0, medium: 1, low: 2 };

/**
 * آزادسازی بار امروز به اندازه‌ی `minutes` — برای وقتی که کاربر زودتر از موعد خوانده.
 * تسک‌های در انتظارِ امروز به فردا منتقل می‌شوند: اول مبحث‌های دیگر، بعد کم‌اولویت‌ترها،
 * و در آخر آخرین تسک‌های چیده‌شده. تسک فعال و تسک‌های هم‌مبحثِ خوانده‌شده دیرتر جابه‌جا می‌شوند.
 */
export function rebalanceToday(
  tasks: StudyTask[],
  today: string,
  minutes: number,
  readTopicId?: string,
  activeTaskId?: string,
): { tasks: StudyTask[]; movedTaskIds: string[]; movedMinutes: number } {
  const tomorrow = addDays(today, 1);
  const candidates = tasks
    .filter((t) => t.status === "pending" && t.date === today && t.id !== activeTaskId)
    .sort((a, b) => {
      const aSame = a.topicId === readTopicId ? 1 : 0;
      const bSame = b.topicId === readTopicId ? 1 : 0;
      return (
        aSame - bSame ||
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || // کم‌اولویت‌تر زودتر جابه‌جا می‌شود
        b.order - a.order
      );
    });

  let out = tasks;
  const movedTaskIds: string[] = [];
  let movedMinutes = 0;
  for (const c of candidates) {
    if (movedMinutes >= minutes) break;
    out = out.map((t) => (t.id === c.id ? { ...t, date: tomorrow } : t));
    movedTaskIds.push(c.id);
    movedMinutes += Math.max(0, c.plannedMinutes - c.doneMinutes);
  }
  return { tasks: out, movedTaskIds, movedMinutes };
}

/**
 * واریز دقیقه‌های مطالعه به تسک‌های در انتظارِ یک مبحث.
 * ترتیب: تسک ترجیحی جلسه → تسک‌های هم‌نوعِ فعالیت → تسک‌های غیرِ مرور → قدیمی‌ترین تاریخ → ترتیب داخل روز.
 * هر تسک تا سقف برنامه‌اش پر می‌شود و سرریز به تسک بعدی می‌رود.
 *
 * ⚠️ قاعده‌ی مرور (اصلاح رفتار قدیمی): «زمانِ مطالعه ≠ انجامِ مرور».
 *  - تسک مرورِ روزهای آینده هرگز با مطالعه‌ی زودتر «انجام‌شده» نمی‌شود؛ روی سرجایش می‌ماند.
 *  - فقط مروری که سررسید شده (امروز یا عقب‌افتاده) می‌تواند از مطالعه واریز بگیرد، آن هم
 *    پس از تسک‌های دیگرِ همان روز، و هیچ «پیش‌خوانی‌ای» روی مرور آینده انجام نمی‌شود.
 *  - سرریزِ بی‌تسک در `unplannedMinutes` برمی‌گردد تا فقط در آمار بماند.
 */
export function creditStudyToTasks(input: CreditInput): CreditResult {
  let tasks = [...input.tasks];
  const empty: CreditResult = {
    tasks, creditedMinutes: 0, futureMinutes: 0, creditedTaskIds: [], doneTaskIds: [], movedTaskIds: [], movedMinutes: 0,
    unplannedMinutes: Math.max(0, Math.round(input.minutes)),
  };
  let need = Math.max(0, Math.round(input.minutes));
  if (need <= 0 || !input.topicId) return empty;

  const wanted = new Set<TaskKind>(studyKindTaskKinds(input.kinds, input.kind));
  const kindRank = (t: StudyTask) => (wanted.size > 0 && wanted.has(t.kind ?? "learn") ? 0 : 1);
  // مرور فقط وقتی سررسید شده باشد (امروز یا عقب‌افتاده) — نه مرورِ آینده
  const eligible = (t: StudyTask) => t.kind !== "review" || t.date <= input.today;

  const candidates = tasks
    .filter((t) => t.topicId === input.topicId && t.status === "pending" && t.id !== input.activeTaskId && eligible(t))
    .sort((a, b) => {
      const ap = a.id === input.preferTaskId ? 0 : 1;
      const bp = b.id === input.preferTaskId ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const am = kindRank(a);
      const bm = kindRank(b);
      if (am !== bm) return am - bm;
      // تسک‌های غیرِ مرور (یادگیری/تست/خلاصه) قبل از مرورِ سررسیدشده پر می‌شوند
      const ar = a.kind === "review" ? 1 : 0;
      const br = b.kind === "review" ? 1 : 0;
      if (ar !== br) return ar - br;
      return a.date.localeCompare(b.date) || a.order - b.order;
    });

  let credited = 0;
  let futureMinutes = 0;
  const creditedTaskIds: string[] = [];
  const doneTaskIds: string[] = [];
  for (const c of candidates) {
    if (need <= 0) break;
    const idx = tasks.findIndex((t) => t.id === c.id);
    if (idx < 0) continue;
    const t = tasks[idx];
    const remaining = Math.max(0, t.plannedMinutes - t.doneMinutes);
    if (remaining <= 0) continue;
    const add = Math.min(remaining, need);
    const doneMinutes = t.doneMinutes + add;
    const done = doneMinutes >= t.plannedMinutes;
    tasks[idx] = { ...t, doneMinutes, status: done ? "done" : t.status };
    credited += add;
    need -= add;
    creditedTaskIds.push(t.id);
    if (done) doneTaskIds.push(t.id);
    if (t.date > input.today) futureMinutes += add;
  }

  let movedTaskIds: string[] = [];
  let movedMinutes = 0;
  if (futureMinutes > 0 && (input.rebalance ?? true)) {
    const reb = rebalanceToday(tasks, input.today, futureMinutes, input.topicId, input.activeTaskId);
    tasks = reb.tasks;
    movedTaskIds = reb.movedTaskIds;
    movedMinutes = reb.movedMinutes;
  }

  return { tasks, creditedMinutes: credited, futureMinutes, creditedTaskIds, doneTaskIds, movedTaskIds, movedMinutes, unplannedMinutes: need };
}

// ===== بازآموزی بعد از مرورِ ضعیف =====
// وقتی نتیجه‌ی یک مرور (از هر مسیری) «بلد نیستم/ضعیف» باشد، برنامه تسلط را ناکافی
// می‌فهمد و برای همان مبحث، یادگیری دوباره در روزهای آینده می‌گذارد.

/** برچسب تسک‌های بازآموزی — برای تشخیص تکراری نبودن */
export const RELEARN_LABEL = "🩹 بازآموزی";

export interface RelearnInput {
  topic: Pick<Topic, "id" | "estimatedMinutes" | "priority">;
  /** نتیجه‌ی مرور؛ فقط ۰ و ۱ بازآموزی می‌سازند */
  rating: Rating;
  today: string;
  /** تسک‌های فعلی — اگر بازآموزیِ همان روز و مبحث از قبل هست، تکراری نمی‌سازیم */
  existingTasks: StudyTask[];
  idFactory?: () => string;
}

/** دقیقه‌ی بازآموزی: حدود یک‌سوم تخمین مبحث، گرد به ۵، بین ۲۰ تا ۹۰ */
export function relearnMinutes(estimatedMinutes: number): number {
  const raw = Math.round((estimatedMinutes * 0.3) / 5) * 5;
  return Math.max(20, Math.min(90, raw || 20));
}

/**
 * ساخت تسک بازآموزی بر اساس نتیجه‌ی مرور:
 *  - امتیاز ۰ (اصلاً بلد نبودم): بازآموزی فردا + یک نوبت دیگر ۳ روز بعد
 *  - امتیاز ۱ (ضعیف): فقط بازآموزی فردا
 *  - امتیاز ۲ و ۳: هیچ (تسلط کافی است)
 */
export function buildRelearnTasks(input: RelearnInput): StudyTask[] {
  if (input.rating >= 2) return [];
  const gaps = input.rating === 0 ? [1, 3] : [1];
  const minutes = relearnMinutes(input.topic.estimatedMinutes);
  const out: StudyTask[] = [];
  for (const gap of gaps) {
    const date = addDays(input.today, gap);
    const duplicate =
      input.existingTasks.some((t) => t.topicId === input.topic.id && t.date === date && t.status === "pending" && t.kind === "learn" && t.label === RELEARN_LABEL) ||
      out.some((t) => t.date === date);
    if (duplicate) continue;
    // پنجره‌ی طلایی: بازآموزی همیشه صدرِ صفِ همان روز می‌نشیند (ترتیب منفی)
    out.push({
      id: (input.idFactory ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`))(),
      topicId: input.topic.id,
      date,
      plannedMinutes: minutes,
      doneMinutes: 0,
      status: "pending",
      order: -1,
      priority: input.topic.priority,
      kind: "learn",
      label: RELEARN_LABEL,
    });
  }
  return out;
}
