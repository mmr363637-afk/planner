// ===== 💡 موتور بینش محلی =====
// داده‌هایی که اپ از قبل دارد (جلسه‌ها، تست‌ها، مرورها، درس‌ها) را با هم ترکیب می‌کند و
// چند «بینش قابل توضیح» می‌سازد — هرکدام با عدد و دلیل، نه جملات انگیزشیِ توخالی.
// همه‌چیز روی دستگاه محاسبه می‌شود؛ هیچ داده‌ای بیرون نمی‌رود. فلسفه‌ی همان
// «پیشنهاد محلی و توضیح‌پذیر» که در کارت قدم بعدی هست، ولی برای گذشته‌ی کاربر.

import type { Review, StudySession, Subject, TestLog, Topic } from "../types";
import { addDays, WEEKDAYS_FA, todayKey, toFa, weekdayOf } from "./jalali";
import { minutesBySubject } from "./stats";

export interface Insight {
  id: string;
  icon: string;
  title: string;
  text: string;
}

export interface InsightInput {
  sessions: StudySession[];
  testLogs: TestLog[];
  reviews: Review[];
  topics: Topic[];
  subjects: Subject[];
}

type Bucket = "صبح" | "ظهر" | "عصر" | "شب";
const BUCKET_HOURS: [Bucket, number, number][] = [
  ["صبح", 5, 12],
  ["ظهر", 12, 17],
  ["عصر", 17, 22],
  ["شب", 22, 29], // ۲۲ تا ۵ بامداد
];
function bucketOfHour(h: number): Bucket {
  const hh = h < 5 ? h + 24 : h;
  for (const [name, from, to] of BUCKET_HOURS) if (hh >= from && hh < to) return name;
  return "شب";
}

/** دقت تست‌ها به تفکیک بازه‌ی ساعتِ ثبت (بر اساس createdAt) */
export function accuracyByDaypart(logs: TestLog[]): { bucket: Bucket; total: number; correct: number; pct: number }[] {
  const acc = new Map<Bucket, { total: number; correct: number }>();
  for (const l of logs) {
    if (l.total <= 0) continue;
    const b = bucketOfHour(new Date(l.createdAt).getHours());
    const cur = acc.get(b) ?? { total: 0, correct: 0 };
    acc.set(b, { total: cur.total + l.total, correct: cur.correct + l.correct });
  }
  return [...acc.entries()]
    .map(([bucket, v]) => ({ bucket, ...v, pct: Math.round((v.correct / v.total) * 100) }))
    .sort((a, b) => b.pct - a.pct);
}

/** وفاداری به مرور: چند درصد مرورهای انجام‌شده سرِ تاریخِ سررسید (یا زودتر) بوده‌اند؟ */
export function reviewAdherence(reviews: Review[]): { onTime: number; late: number; pct: number } | null {
  const done = reviews.filter((r) => r.status === "done" && r.completedAt);
  if (done.length < 5) return null;
  let onTime = 0;
  let late = 0;
  for (const r of done) {
    const at = new Date(r.completedAt!);
    const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
    if (day <= r.dueDate) onTime += 1;
    else late += 1;
  }
  return { onTime, late, pct: Math.round((onTime / done.length) * 100) };
}

/** تکانش درس‌ها: ۱۴ روز اخیر در برابر ۱۴ روزِ قبل از آن (به دقیقه) */
export function subjectMomentum(sessions: StudySession[], topics: Topic[], subjects: Subject[], today: string) {
  const from = addDays(today, -27);
  const mid = addDays(today, -13);
  const recent = sessions.filter((s) => s.date >= mid && s.date <= today);
  const prior = sessions.filter((s) => s.date >= from && s.date < mid);
  const rBy = minutesBySubject(recent, topics);
  const pBy = minutesBySubject(prior, topics);
  return subjects
    .map((s) => ({ subject: s, recent: rBy[s.id] ?? 0, prior: pBy[s.id] ?? 0, delta: (rBy[s.id] ?? 0) - (pBy[s.id] ?? 0) }))
    .filter((x) => x.recent + x.prior >= 60); // حداقل یک ساعت داده در یک ماه
}

/** رضایت (rating) جلسات بلند در برابر کوتاه */
export function longVsShortRating(sessions: StudySession[]): { longAvg: number; shortAvg: number; longN: number; shortN: number } | null {
  const rated = sessions.filter((s) => s.rating != null && s.durationMinutes > 0);
  const long = rated.filter((s) => s.durationMinutes >= 45);
  const short = rated.filter((s) => s.durationMinutes < 45);
  if (long.length < 5 || short.length < 5) return null;
  const avg = (xs: StudySession[]) => xs.reduce((a, s) => a + (s.rating ?? 0), 0) / xs.length;
  return { longAvg: avg(long), shortAvg: avg(short), longN: long.length, shortN: short.length };
}

/** بهترین روز هفته بر اساس مجموع دقایق (۹۰ روز اخیر) */
export function bestWeekday(sessions: StudySession[], today: string): { name: string; minutes: number } | null {
  const from = addDays(today, -89);
  const recent = sessions.filter((s) => s.date >= from && s.date <= today && s.durationMinutes > 0);
  if (recent.length < 10) return null;
  const byDay = new Map<number, number>();
  for (const s of recent) {
    const wd = weekdayOf(s.date);
    byDay.set(wd, (byDay.get(wd) ?? 0) + s.durationMinutes);
  }
  const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  return { name: WEEKDAYS_FA[best[0]], minutes: Math.round(best[1]) };
}

/** ساخت فهرست بینش‌ها — قوی‌ترین سیگنال‌ها اول، حداکثر max مورد */
export function buildInsights(input: InsightInput, today: string = todayKey(), max = 4): Insight[] {
  const out: Insight[] = [];
  const { sessions, testLogs, reviews, topics, subjects } = input;

  // ۱) دقت تست در بازه‌های روز
  const parts = accuracyByDaypart(testLogs);
  if (parts.length >= 2) {
    const [best, worst] = [parts[0], parts[parts.length - 1]];
    if (best.total >= 30 && worst.total >= 30 && best.pct - worst.pct >= 5) {
      out.push({
        id: "daypart-accuracy",
        icon: "🎯",
        title: `تست‌ها را در ${best.bucket} بهتر می‌زنی`,
        text: `دقتت در ${best.bucket} ${toFa(best.pct)}٪ است (${toFa(best.total)} سؤال) ولی در ${worst.bucket} ${toFa(worst.pct)}٪ (${toFa(worst.total)} سؤال). تمرینِ سنجشیِ درس‌های سخت را به ${best.bucket} منتقل کن.`,
      });
    }
  }

  // ۲) تکانش درس‌ها
  const momentum = subjectMomentum(sessions, topics, subjects, today).sort((a, b) => b.delta - a.delta);
  if (momentum.length >= 2) {
    const rising = momentum[0];
    const falling = momentum[momentum.length - 1];
    if (rising.delta >= 60) {
      out.push({
        id: "momentum-up",
        icon: "🚀",
        title: `${rising.subject.name} در حال اوج‌گیری است`,
        text: `دو هفته‌ی اخیر ${formatMin(rising.recent)} روی ${rising.subject.name} گذاشتی؛ ${formatMin(rising.prior)} در دو هفته‌ی قبل از آن. همین را نگه دار.`,
      });
    }
    if (falling.delta <= -60 && falling.subject.id !== rising.subject.id) {
      out.push({
        id: "momentum-down",
        icon: "🥀",
        title: `${falling.subject.name} سرد شده است`,
        text: `از ${formatMin(falling.prior)} در دو هفته‌ی قبل به ${formatMin(falling.recent)} در دو هفته‌ی اخیر رسیده. یک جلسه‌ی ۳۰ دقیقه‌ای همین هفته برگردانِ مسیر است.`,
      });
    }
  }

  // ۳) وفاداری به مرور
  const adh = reviewAdherence(reviews);
  if (adh) {
    if (adh.pct >= 80) {
      out.push({
        id: "review-ontime",
        icon: "⏰",
        title: "مرورهای به‌موقع",
        text: `${toFa(adh.pct)}٪ از مرورهایت را سرِ تاریخ انجام داده‌ای (${toFa(adh.onTime)} از ${toFa(adh.onTime + adh.late)}). این قوی‌ترین پیش‌بینی‌کننده‌ی ماندگاری حافظه است.`,
      });
    } else if (adh.pct < 60) {
      out.push({
        id: "review-late",
        icon: "⏰",
        title: "مرورها دیر انجام می‌شوند",
        text: `فقط ${toFa(adh.pct)}٪ مرورها سرِ تاریخ بوده‌اند. مرورِ دیر، منحنی فراموشی را از نو می‌شکند؛ بارِ فردا را سبک‌تر کن (کمتر، ولی به‌موقع).`,
      });
    }
  }

  // ۴) بلند یا کوتاه؟
  const lv = longVsShortRating(sessions);
  if (lv) {
    const diff = lv.longAvg - lv.shortAvg;
    if (diff >= 0.3) {
      out.push({
        id: "long-sessions",
        icon: "🧘",
        title: "جلسه‌های بلند به تو می‌سازد",
        text: `رضایتت بعد از جلسات ≥۴۵ دقیقه میانگین ${toFa(lv.longAvg.toFixed(1))} از ۳ است در برابر ${toFa(lv.shortAvg.toFixed(1))} برای جلسه‌های کوتاه‌تر. بلوک‌های عمیق‌تر بچین.`,
      });
    } else if (diff <= -0.3) {
      out.push({
        id: "short-sessions",
        icon: "🍅",
        title: "کوتاه و پیوسته، سبکِ تو است",
        text: `جلسه‌های زیر ۴۵ دقیقه رضایت بیشتری به تو می‌دهند (${toFa(lv.shortAvg.toFixed(1))} در برابر ${toFa(lv.longAvg.toFixed(1))}). پومودوروهای پیاپی بهتر از ماراتن جواب می‌دهد.`,
      });
    }
  }

  // ۵) بهترین روز هفته
  const bw = bestWeekday(sessions, today);
  if (bw) {
    out.push({
      id: "best-weekday",
      icon: "📅",
      title: `${bw.name}ها قوی‌ترینی`,
      text: `در ۹۰ روز اخیر مجموعاً ${formatMin(bw.minutes)} دقیقه در روزهای ${bw.name} خوانده‌ای — بیشتر از هر روز دیگر. سخت‌ترین درس‌ها را آنجا بگذار.`,
    });
  }

  return out.slice(0, max);
}

function formatMin(m: number): string {
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r > 0 ? `${toFa(h)}س ${toFa(r)}د` : `${toFa(h)} ساعت`;
  }
  return `${toFa(m)} دقیقه`;
}

/** خلاصه‌ی فشرده و بدون داده‌ی حساس برای دادن به دستیار هوشمند (roaayat هفته) */
export function weeklyContext(input: InsightInput, today: string = todayKey()): Record<string, unknown> {
  const from = addDays(today, -6);
  const week = input.sessions.filter((s) => s.date >= from && s.date <= today);
  const insights = buildInsights(input, today, 3);
  const bySubject = minutesBySubject(week, input.topics);
  const names: Record<string, number> = {};
  for (const s of input.subjects) if (bySubject[s.id]) names[s.name] = bySubject[s.id];
  return {
    today,
    weekMinutes: week.reduce((a, s) => a + s.durationMinutes, 0),
    weekSessions: week.length,
    minutesBySubject: names,
    insights: insights.map((i) => ({ title: i.title, text: i.text })),
  };
}
