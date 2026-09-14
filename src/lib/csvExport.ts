// ===== خروجی CSV برای اکسل/گوگل‌شیت (آفلاین، بدون سرور) =====
// جداکننده «;» انتخاب شده چون اکسلِ فارسی‌زبان بر اساس همان کاراکتر ستون‌ها را می‌شکند.
// BOM اول فایل باعث می‌شود اکسل متنِ فارسی را درست بخواند.

import type { AppState } from "../types";
import { formatJalaliNumeric } from "./jalali";

const SEP = ";";

function esc(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** تبدیل سطرها به متن CSV (با BOM و پایان سطر CRLF برای سازگاری با اکسل) */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(esc).join(SEP)).join("\r\n");
}

const MODE_FA: Record<string, string> = { free: "آزاد", pomodoro: "پومودورو" };
const RATING_FA: Record<number, string> = { 1: "بلد نبودم", 2: "سخت بود", 3: "مسلط شدم" };

/** خروجی CSVِ ثبت‌های تست: تاریخ؛درس؛مبحث؛کل سؤالات؛درست؛درصد */
export function testLogsCsv(state: AppState): string {
  const topicById = new Map(state.topics.map((t) => [t.id, t]));
  const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
  const rows: (string | number)[][] = [["تاریخ", "تاریخ شمسی", "درس", "مبحث", "کل سؤالات", "درست", "درصد"]];
  for (const log of [...(state.testLogs ?? [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const topic = log.topicId ? topicById.get(log.topicId) : undefined;
    const subject = log.subjectId ? subjectById.get(log.subjectId) : topic ? subjectById.get(topic.subjectId) : undefined;
    const pct = log.total > 0 ? Math.round((log.correct / log.total) * 100) : 0;
    rows.push([log.date, formatJalaliNumeric(log.date), subject?.name ?? "—", topic?.name ?? "—", log.total, log.correct, pct]);
  }
  return toCsv(rows);
}

/** خروجی CSVِ جلسات مطالعه: تاریخ؛درس؛مبحث؛دقیقه؛حالت؛ارزیابی؛حواس‌پرتی */
export function sessionsCsv(state: AppState): string {
  const topicById = new Map(state.topics.map((t) => [t.id, t]));
  const subjectById = new Map(state.subjects.map((s) => [s.id, s]));
  const rows: (string | number)[][] = [["تاریخ", "درس", "مبحث", "دقیقه", "حالت", "ارزیابی", "حواس‌پرتی"]];
  for (const s of [...state.sessions].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))) {
    const topic = s.topicId ? topicById.get(s.topicId) : undefined;
    const subject = topic ? subjectById.get(topic.subjectId) : undefined;
    rows.push([
      s.date,
      subject?.name ?? "—",
      topic?.name ?? "بدون مبحث",
      s.durationMinutes,
      MODE_FA[s.mode] ?? s.mode,
      s.rating != null ? (RATING_FA[s.rating] ?? s.rating) : "—",
      s.distractions ?? "—",
    ]);
  }
  return toCsv(rows);
}
