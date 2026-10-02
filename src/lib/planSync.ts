// ===== هماهنگی «ثبت مطالعه» با «تسک‌های برنامه» =====
// هدف: فرقی نمی‌کند مطالعه از کجا ثبت شود (تایمر، ثبت دستی، صدا، یا تکمیل تسک)؛
// برنامه باید همان لحظه آن را بفهمد:
//  ۱. واریز دقیقه‌ها به تسک‌های در انتظارِ همان مبحث (اول از همه‌ی تسکِ هم‌نوعِ فعالیت)
//  ۲. «پیش‌خوانی»: اگر مطالعه به تسکِ روزهای آینده واریز شد، معادلِ همان دقیقه‌ها از
//     بارِ امروز آزاد می‌شود و تسک‌های امروز (کم‌اولویت‌ترها، ترجیحاً از مبحث‌های دیگر)
//     به فردا می‌روند تا هدفِ زمانیِ روز ثابت بماند.

import type { StudyTask, TaskKind } from "../types";
import { addDays } from "./jalali";

export interface CreditInput {
  tasks: StudyTask[];
  topicId: string;
  /** دقیقه‌های مطالعه‌ی تازه ثبت‌شده */
  minutes: number;
  today: string;
  /** نوع فعالیتِ انجام‌شده — اگر باشد، تسک‌های هم‌نوع اول واریز می‌شوند */
  kind?: TaskKind;
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
 * ترتیب: تسک ترجیحی جلسه → تسک‌های هم‌نوعِ فعالیت → قدیمی‌ترین تاریخ → ترتیب داخل روز.
 * هر تسک تا سقف برنامه‌اش پر می‌شود و سرریز به تسک بعدی می‌رود.
 */
export function creditStudyToTasks(input: CreditInput): CreditResult {
  let tasks = [...input.tasks];
  const empty: CreditResult = {
    tasks, creditedMinutes: 0, futureMinutes: 0, creditedTaskIds: [], doneTaskIds: [], movedTaskIds: [], movedMinutes: 0,
  };
  let need = Math.max(0, Math.round(input.minutes));
  if (need <= 0 || !input.topicId) return empty;

  const candidates = tasks
    .filter((t) => t.topicId === input.topicId && t.status === "pending" && t.id !== input.activeTaskId)
    .sort((a, b) => {
      const ap = a.id === input.preferTaskId ? 0 : 1;
      const bp = b.id === input.preferTaskId ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const am = input.kind && (a.kind ?? "learn") === input.kind ? 0 : 1;
      const bm = input.kind && (b.kind ?? "learn") === input.kind ? 0 : 1;
      if (am !== bm) return am - bm;
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

  return { tasks, creditedMinutes: credited, futureMinutes, creditedTaskIds, doneTaskIds, movedTaskIds, movedMinutes };
}
