// ===== ساعت امتحان + تایمر شمارش معکوس =====
// توابع خالص (بدون React) تا هم در UI و هم در تست‌ها قابل استفاده باشند.

import { fromDateKey, pad, toDateKey, toFa } from "./jalali";
import type { Exam } from "../types";

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export interface ExamTime {
  hour: number;
  minute: number;
}

/** «08:30» → { hour: 8, minute: 30 } ؛ اگر معتبر نبود null */
export function parseExamTime(time?: string | null): ExamTime | null {
  if (!time) return null;
  const m = TIME_RE.exec(time.trim());
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function hasExamTime(exam: Pick<Exam, "time">): boolean {
  return parseExamTime(exam.time) !== null;
}

/** نمایش فارسی ساعت: «۰۸:۳۰» */
export function formatExamTime(time?: string | null): string | null {
  const t = parseExamTime(time);
  if (!t) return null;
  return toFa(`${pad(t.hour)}:${pad(t.minute)}`);
}

/**
 * لحظه‌ی شروع امتحان به‌صورت timestamp.
 * اگر ساعت ثبت نشده باشد، ابتدای همان روز (۰۰:۰۰) در نظر گرفته می‌شود.
 */
export function examStartMs(exam: Pick<Exam, "date" | "time">): number {
  const d = fromDateKey(exam.date);
  const t = parseExamTime(exam.time);
  if (!t) return d.getTime();
  d.setHours(t.hour, t.minute, 0, 0);
  return d.getTime();
}

/**
 * آیا این امتحان هنوز «پیش‌رو» است؟
 * معیار، روز امتحان است (نه ساعت): امتحانِ امروز تا پایان همان روز در فهرست پیش‌رو می‌ماند،
 * حتی اگر ساعت شروعش گذشته باشد — چون هنوز اتفاقِ مهمِ امروز است.
 */
export function isUpcomingExam(exam: Exam, now: number = Date.now()): boolean {
  return exam.date >= toDateKey(new Date(now));
}

/** مرتب‌سازی بر اساس لحظه‌ی شروع (و در صورت تساوی، بر اساس نام) */
export function compareExams(a: Exam, b: Exam): number {
  const d = examStartMs(a) - examStartMs(b);
  if (d !== 0) return d;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

/**
 * نزدیک‌ترین امتحان پیش‌رو: اولین امتحانی که هنوز شروع نشده است.
 * اگر همه‌ی امتحان‌های امروز شروع شده باشند، همان امروز را برمی‌گرداند تا کارت
 * شمارش معکوس وضعیت «امروز/شروع شد» نشان دهد.
 */
export function nextExam(exams: Exam[], now: number = Date.now()): Exam | null {
  const candidates = exams.filter((e) => isUpcomingExam(e, now)).sort(compareExams);
  if (candidates.length === 0) return null;
  return candidates.find((e) => examStartMs(e) >= now) ?? candidates[0];
}

export interface Countdown {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** true یعنی لحظه‌ی شروع امتحان رسیده/گذشته است */
  started: boolean;
}

export function countdownTo(target: number, now: number = Date.now()): Countdown {
  const totalMs = target - now;
  const s = Math.max(0, Math.floor(totalMs / 1000));
  return {
    totalMs,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    started: totalMs <= 0,
  };
}

export function countdownOf(exam: Exam, now: number = Date.now()): Countdown {
  return countdownTo(examStartMs(exam), now);
}

/** «۲ روز و ۳ ساعت و ۱۵ دقیقه» — برای نمایش متنیِ باقی‌مانده تا امتحان */
export function formatCountdown(c: Countdown): string {
  if (c.started) return "شروع شد";
  if (c.days > 0) return `${toFa(c.days)} روز و ${toFa(c.hours)} ساعت و ${toFa(c.minutes)} دقیقه`;
  if (c.hours > 0) return `${toFa(c.hours)} ساعت و ${toFa(c.minutes)} دقیقه و ${toFa(c.seconds)} ثانیه`;
  if (c.minutes > 0) return `${toFa(c.minutes)} دقیقه و ${toFa(c.seconds)} ثانیه`;
  return `${toFa(c.seconds)} ثانیه`;
}

/** نسخه‌ی کوتاه برای چیپ‌ها: «۲ روز» / «۵ ساعت» / «۱۲ دقیقه» */
export function formatCountdownShort(c: Countdown): string {
  if (c.started) return "شروع شد";
  if (c.days > 0) return `${toFa(c.days)} روز`;
  if (c.hours > 0) return `${toFa(c.hours)} ساعت`;
  if (c.minutes > 0) return `${toFa(c.minutes)} دقیقه`;
  return `${toFa(c.seconds)} ثانیه`;
}
