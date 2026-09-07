// ===== Google Calendar link + ICS export (pure helpers + DOM download) =====
// بدون سرور و بدون API: لینک رسمی calendar.google.com/render?action=TEMPLATE برای افزودن
// تک‌رویداد، و فایل .ics استاندارد (RFC 5545) برای افزودن گروهی به هر تقویمی
// (Google Calendar، Apple Calendar، Outlook و…).

import type { Exam, StudySession, StudyTask, Topic } from "../types";
import { fromDateKey, pad } from "./jalali";

export interface CalendarEvent {
  title: string;
  /** ISO yyyy-mm-dd (local) */
  date: string;
  /** HH:mm — اگر نباشد رویداد «تمام‌روز» است */
  time?: string;
  /** مدت به دقیقه — فقط وقتی time هست (پیش‌فرض ۶۰) */
  durationMinutes?: number;
  description?: string;
}

/** لینک افزودن رویداد به Google Calendar (بدون نیاز به API/سرور) */
export function googleCalendarUrl(ev: CalendarEvent): string {
  const [y, m, d] = ev.date.split("-").map(Number);
  const fmt = (n: number) => String(n).padStart(2, "0");
  let dates: string;
  if (ev.time) {
    const [hh, mm] = ev.time.split(":").map(Number);
    const start = `${y}${fmt(m)}${fmt(d)}T${fmt(hh)}${fmt(mm)}00`;
    const totalMin = hh * 60 + mm + (ev.durationMinutes ?? 60);
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    const end = `${y}${fmt(m)}${fmt(d)}T${fmt(endH)}${fmt(endM)}00`;
    dates = `${start}/${end}`;
  } else {
    // تمام‌روز: بازه تا روز بعد
    const next = new Date(y, m - 1, d + 1);
    dates = `${y}${fmt(m)}${fmt(d)}/${next.getFullYear()}${fmt(next.getMonth() + 1)}${fmt(next.getDate())}`;
  }
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates,
  });
  if (ev.description) params.set("details", ev.description);
  // URLSearchParams اسلش را %2F می‌کند؛ برای خوانایی لینک برمی‌گردانیم (برای گوگل معادل است)
  return `https://calendar.google.com/calendar/render?${params.toString().replace(/%2F/g, "/")}`;
}

/** escape متن طبق RFC 5545 */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** شکستن خطوط بلند (حداکثر ۷۵ کاراکتر در هر خط با تورفتگی CRLF + فاصله) */
export function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

function stampFor(dateKey: string, time?: string, durationMinutes = 60): { start: string; end?: string } {
  // ICS و لینک گوگل هر دو تاریخ میلادی می‌خواهند (استاندارد RFC 5545)؛ تاریخ نمایشی اپ شمسی است
  const d = fromDateKey(dateKey);
  const gy = d.getFullYear();
  const gm = d.getMonth() + 1;
  const gd = d.getDate();
  const p2 = (n: number) => pad(n);
  if (!time) return { start: `${gy}${p2(gm)}${p2(gd)}` };
  const [hh, mm] = time.split(":").map(Number);
  const startMin = hh * 60 + mm;
  const endMin = startMin + durationMinutes;
  const endH = Math.floor(endMin / 60);
  const endDayShift = Math.floor(endH / 24);
  const endDate = new Date(gy, gm - 1, gd + endDayShift);
  const start = `${gy}${p2(gm)}${p2(gd)}T${p2(hh)}${p2(mm)}00`;
  const end = `${endDate.getFullYear()}${p2(endDate.getMonth() + 1)}${p2(endDate.getDate())}T${p2(endH % 24)}${p2(endMin % 60)}00`;
  return { start, end };
}

/** ساخت فایل ICS از رویدادها (تمام‌روز یا ساعتی) */
export function buildICS(events: CalendarEvent[], calName = "برنامه مطالعه"): string {
  const now = new Date();
  const dtstamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Study Planner//Fa//",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:" + icsEscape(calName),
  ];
  events.forEach((ev, i) => {
    const { start, end } = stampFor(ev.date, ev.time, ev.durationMinutes);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:study-planner-${dtstamp}-${i}@local`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (ev.time) {
      lines.push(`DTSTART:${start}`);
      if (end) lines.push(`DTEND:${end}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${start}`);
    }
    lines.push(`SUMMARY:${icsEscape(ev.title)}`);
    if (ev.description) lines.push(icsFold(`DESCRIPTION:${icsEscape(ev.description)}`));
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** رویدادهای تقویم از داده‌های برنامه: امتحانات + تسک‌های برنامه‌ریزی‌شده */
export function eventsFromState(
  exams: Exam[],
  tasks: StudyTask[],
  topics: Topic[],
  sessions: StudySession[] = [],
): CalendarEvent[] {
  const topicName = new Map(topics.map((t) => [t.id, t.name]));
  const studiedByTask = new Map<string, number>();
  for (const s of sessions) {
    if (s.taskId) studiedByTask.set(s.taskId, (studiedByTask.get(s.taskId) ?? 0) + s.durationMinutes);
  }
  const examEvents: CalendarEvent[] = exams.map((e) => ({
    title: e.subject ? `امتحان ${e.subject}: ${e.title}` : `امتحان: ${e.title}`,
    date: e.date,
    time: e.time,
    description: e.note,
  }));
  const taskEvents: CalendarEvent[] = tasks
    .filter((t) => t.status !== "skipped")
    .map((t) => ({
      title: `مطالعه: ${topicName.get(t.topicId) ?? "مبحث"}`,
      date: t.date,
      durationMinutes: Math.max(30, t.plannedMinutes),
      description: `برنامه‌ریزی: ${t.plannedMinutes} دقیقه${studiedByTask.get(t.id) ? ` · مطالعه‌شده: ${studiedByTask.get(t.id)} دقیقه` : ""}`,
    }));
  return [...examEvents, ...taskEvents];
}

/** دانلود فایل ICS در مرورگر */
export function downloadICS(content: string, filename = "study-planner.ics"): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
