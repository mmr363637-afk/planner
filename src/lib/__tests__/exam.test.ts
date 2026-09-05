import { describe, expect, it } from "vitest";
import {
  compareExams,
  countdownOf,
  countdownTo,
  examStartMs,
  formatCountdown,
  formatCountdownShort,
  formatExamTime,
  hasExamTime,
  isUpcomingExam,
  nextExam,
  parseExamTime,
} from "../exam";
import { todayKey } from "../jalali";
import type { Exam } from "../../types";

function makeExam(patch: Partial<Exam> = {}): Exam {
  return { id: "e1", title: "فیزیولوژی", date: todayKey(), createdAt: 0, ...patch };
}

/** یک لحظه‌ی ثابت تا تست‌ها به ساعتِ اجرای ماشین وابسته نباشند: ۱۰ مه ۲۰۲۶، ظهر */
const NOW = new Date(2026, 4, 10, 12, 0, 0).getTime();
const TODAY = "2026-05-10";

describe("ساعت امتحان", () => {
  it("ساعت معتبر را می‌خواند و ساعت نامعتبر را رد می‌کند", () => {
    expect(parseExamTime("08:30")).toEqual({ hour: 8, minute: 30 });
    expect(parseExamTime("23:59")).toEqual({ hour: 23, minute: 59 });
    expect(parseExamTime("0:05")).toEqual({ hour: 0, minute: 5 });
    expect(parseExamTime("")).toBeNull();
    expect(parseExamTime(undefined)).toBeNull();
    expect(parseExamTime("24:00")).toBeNull();
    expect(parseExamTime("12:75")).toBeNull();
    expect(parseExamTime("عصر")).toBeNull();
  });

  it("ساعت را با رقم فارسی نمایش می‌دهد", () => {
    expect(formatExamTime("08:30")).toBe("۰۸:۳۰");
    expect(formatExamTime("14:05")).toBe("۱۴:۰۵");
    expect(formatExamTime("bad")).toBeNull();
    expect(hasExamTime(makeExam({ time: "08:00" }))).toBe(true);
    expect(hasExamTime(makeExam())).toBe(false);
  });

  it("لحظه‌ی شروع را از تاریخ + ساعت می‌سازد و بدون ساعت به ابتدای روز برمی‌گردد", () => {
    const withTime = makeExam({ date: "2026-03-10", time: "08:30" });
    const d = new Date(examStartMs(withTime));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);

    const noTime = makeExam({ date: "2026-03-10" });
    expect(new Date(examStartMs(noTime)).getHours()).toBe(0);
    expect(examStartMs(noTime)).toBeLessThan(examStartMs(withTime));
  });
});

describe("شمارش معکوس", () => {
  it("زمان باقی‌مانده را به روز/ساعت/دقیقه/ثانیه می‌شکند", () => {
    const now = new Date(2026, 2, 10, 8, 0, 0).getTime();
    const target = now + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;
    const c = countdownTo(target, now);
    expect([c.days, c.hours, c.minutes, c.seconds]).toEqual([2, 3, 4, 5]);
    expect(c.started).toBe(false);
  });

  it("بعد از شروع امتحان روی صفر می‌ماند (منفی نمی‌شود)", () => {
    const now = new Date(2026, 2, 10, 9, 0, 0).getTime();
    const c = countdownTo(new Date(2026, 2, 10, 8, 0, 0).getTime(), now);
    expect(c.started).toBe(true);
    expect([c.days, c.hours, c.minutes, c.seconds]).toEqual([0, 0, 0, 0]);
    expect(formatCountdown(c)).toBe("شروع شد");
  });

  it("متن فارسیِ شمارش معکوس درست است", () => {
    const now = new Date(2026, 2, 10, 8, 0, 0).getTime();
    expect(formatCountdown(countdownTo(now + 2 * 86400_000 + 5 * 3600_000 + 7 * 60_000, now))).toBe("۲ روز و ۵ ساعت و ۷ دقیقه");
    expect(formatCountdown(countdownTo(now + 3 * 3600_000 + 12 * 60_000 + 40_000, now))).toBe("۳ ساعت و ۱۲ دقیقه و ۴۰ ثانیه");
    expect(formatCountdown(countdownTo(now + 45_000, now))).toBe("۴۵ ثانیه");
    expect(formatCountdownShort(countdownTo(now + 2 * 86400_000, now))).toBe("۲ روز");
  });

  it("countdownOf از ساعت ثبت‌شده‌ی امتحان استفاده می‌کند", () => {
    const now = new Date(2026, 2, 10, 6, 0, 0).getTime();
    const exam = makeExam({ date: "2026-03-10", time: "08:30" });
    const c = countdownOf(exam, now);
    expect([c.days, c.hours, c.minutes]).toEqual([0, 2, 30]);
  });
});

describe("نزدیک‌ترین امتحان", () => {
  it("بر اساس ساعت مرتب می‌کند، نه فقط تاریخ یا نام", () => {
    const a = makeExam({ id: "a", title: "الف", date: "2026-05-01", time: "18:00" });
    const b = makeExam({ id: "b", title: "ب", date: "2026-05-01", time: "08:00" });
    expect(compareExams(a, b)).toBeGreaterThan(0);
    expect([a, b].sort(compareExams)[0].id).toBe("b");
  });

  it("امتحانی که ساعتش گذشته اما امروز است، هنوز «پیش‌رو» است", () => {
    expect(isUpcomingExam(makeExam({ date: TODAY, time: "00:01" }), NOW)).toBe(true);
    expect(isUpcomingExam(makeExam({ date: "2026-05-09" }), NOW)).toBe(false);
    expect(isUpcomingExam(makeExam({ date: "2026-05-12" }), NOW)).toBe(true);
  });

  it("نزدیک‌ترین امتحانِ شروع‌نشده را انتخاب می‌کند", () => {
    const soon = makeExam({ id: "soon", date: TODAY, time: "14:00", title: "زودتر" });
    const later = makeExam({ id: "later", date: "2026-05-12", time: "08:00", title: "دیرتر" });
    expect(nextExam([later, soon], NOW)?.id).toBe("soon");
  });

  it("اگر امتحانِ امروز شروع شده باشد، سراغ امتحان بعدی می‌رود", () => {
    const started = makeExam({ id: "started", date: TODAY, time: "08:00" });
    const later = makeExam({ id: "later", date: TODAY, time: "16:00" });
    expect(nextExam([started, later], NOW)?.id).toBe("later");
    // وقتی امتحان بعدی وجود ندارد، همان امتحانِ امروز برمی‌گردد (کارت «شروع شد» نشان می‌دهد)
    expect(nextExam([started], NOW)?.id).toBe("started");
    expect(countdownOf(started, NOW).started).toBe(true);
  });

  it("امتحان گذشته را برنمی‌گرداند", () => {
    expect(nextExam([makeExam({ date: "2026-05-09", time: "08:00" })], NOW)).toBeNull();
    expect(nextExam([], NOW)).toBeNull();
  });

  it("امتحان بدون ساعتِ امروز را با وضعیت «امروز» نشان می‌دهد", () => {
    const exam = makeExam({ date: TODAY });
    expect(nextExam([exam], NOW)?.id).toBe(exam.id);
    expect(countdownOf(exam, NOW).started).toBe(true);
  });
});
