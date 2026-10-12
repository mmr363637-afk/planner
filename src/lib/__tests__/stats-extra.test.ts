import { describe, expect, it } from "vitest";
import { reviewForecast, soundMinutes, studyByTopic, topSounds, totalDistractions } from "../stats";
import { addDays } from "../jalali";
import type { StudySession } from "../../types";

let n = 0;
const session = (over: Partial<StudySession>): StudySession => ({
  id: `s${++n}`,
  topicId: "t1",
  startedAt: 0,
  endedAt: 60_000,
  durationMinutes: 30,
  rating: 2,
  mode: "pomodoro",
  date: "2025-01-10",
  ...over,
});

describe("صدا ↔ مطالعه", () => {
  it("دقایقِ مطالعه به تفکیکِ صدای روشن‌شونده انباشته می‌شود", () => {
    const sessions = [
      session({ durationMinutes: 30, ambient: ["rain", "brown"] }),
      session({ durationMinutes: 20, ambient: ["rain"] }),
      session({ durationMinutes: 45 }), // بدون صدا
      session({ durationMinutes: 10, ambient: [] }), // صدای صفرعضوه
    ];
    expect(soundMinutes(sessions)).toEqual({ rain: 50, brown: 30 });
  });

  it("topSounds مرتب می‌شود، سقف دارد و وقتی داده نیست خالی است", () => {
    const sessions = [
      session({ durationMinutes: 30, ambient: ["rain", "brown", "ocean", "cafe", "fireplace"] }),
      session({ durationMinutes: 10, ambient: ["brown"] }),
    ];
    expect(topSounds(sessions, 4)).toEqual([
      { id: "brown", minutes: 40 },
      { id: "rain", minutes: 30 },
      { id: "ocean", minutes: 30 },
      { id: "cafe", minutes: 30 },
    ]);
    expect(topSounds([], 4)).toEqual([]);
  });

  it("topSounds برای هر دقیقه‌ای از سطرهای صدا جمع می‌شود نه فقط جلسه‌ی آخر", () => {
    const sessions = [session({ durationMinutes: 5, ambient: ["rain"] }), session({ durationMinutes: 5, ambient: ["rain"], id: "x2" })];
    expect(topSounds(sessions)).toEqual([{ id: "rain", minutes: 10 }]);
  });
});

describe("حواس‌پرتی", () => {
  it("مجموعِ کل جلسات، با تلرانسِ جلساتِ قدیمیِ بدون فیلد", () => {
    const sessions = [
      session({ distractions: 3 }),
      session({ distractions: 0 }),
      session({}), // فیلد اختیاری است
      session({ distractions: 7 }),
    ];
    expect(totalDistractions(sessions)).toBe(10);
    expect(totalDistractions([])).toBe(0);
  });
});

describe("پیش‌بینی مرور", () => {
  const today = "2025-03-05";
  const r = (dueDate: string, status: "pending" | "done" = "pending") => ({ dueDate, status });
  const c = (dueDate: string) => ({ dueDate });

  it("به‌ازای هر روزِ افق یک سطر می‌سازد", () => {
    const out = reviewForecast([], [], today, 14);
    expect(out).toHaveLength(14);
    expect(out[0].date).toBe(today);
    expect(out[1].date).toBe(addDays(today, 1));
    expect(out[13].date).toBe(addDays(today, 13));
    expect(out.every((d) => d.count === 0)).toBe(true);
  });

  it("مرورهای سررسیدِ pending شمرده می‌شوند و انجام‌شده‌ها نه", () => {
    const out = reviewForecast(
      [r(addDays(today, 2)), r(addDays(today, 2)), r(addDays(today, 2), "done")],
      [],
      today,
      14,
    );
    expect(out[2].count).toBe(2);
    expect(out.some((d, i) => i !== 2 && d.count > 0)).toBe(false);
  });

  it("عقب‌افتاده‌ها در روزِ اول (امروز) جمع می‌شوند", () => {
    const out = reviewForecast([r(addDays(today, -4)), r(addDays(today, -1))], [c(addDays(today, -2))], today, 14);
    expect(out[0].count).toBe(3);
    for (let i = 1; i < 14; i++) expect(out[i].count).toBe(0);
  });

  it("فلش‌کارت‌ها هم به همان سطرِ روزِ خودشان می‌افتند (تجمیعِ مبحث + کارت)", () => {
    const out = reviewForecast([r(addDays(today, 1))], [c(addDays(today, 1)), c(addDays(today, 5))], today, 14);
    expect(out[1].count).toBe(2);
    expect(out[5].count).toBe(1);
  });

  it("مرورهای بعد از انتهای افق می‌افتند بیرون و شامل نمی‌شوند", () => {
    const out = reviewForecast([r(addDays(today, 20))], [], today, 14);
    expect(out.every((d) => d.count === 0)).toBe(true);
    const wide = reviewForecast([r(addDays(today, 20))], [], today, 30);
    expect(wide[20].count).toBe(1);
  });

  it("افقِ نامعقول محدود می‌شود و پیش‌فرض ۱۴ روز است", () => {
    expect(reviewForecast([], [], today)).toHaveLength(14);
    expect(reviewForecast([], [], today, 999)).toHaveLength(60);
    expect(reviewForecast([], [], today, 0)).toHaveLength(1);
  });
});

describe("زمانِ هر مبحث (فصل) در برابر برآورد", () => {
  it("جلسه‌ها را به تفکیک مبحث جمع می‌کند و بازه را از کلِ تاریخچه جدا نگه می‌دارد", () => {
    const sessions = [
      session({ topicId: "t1", date: "2025-01-01", durationMinutes: 60, kind: "learn" }),
      session({ topicId: "t1", date: "2025-01-10", durationMinutes: 30, kind: "test", mode: "free" }),
      session({ topicId: "t2", date: "2025-01-10", durationMinutes: 20 }),
      session({ topicId: null, date: "2025-01-10", durationMinutes: 15 }),
    ];
    const map = studyByTopic(sessions, "2025-01-05", "2025-01-11");
    expect([...map.keys()].sort()).toEqual(["t1", "t2"]); // جلسهٔ بدون مبحث شمرده نمی‌شود
    expect(map.get("t1")).toMatchObject({
      minutes: 30,
      totalMinutes: 90,
      sessionCount: 1,
      lastDate: "2025-01-10",
      minutesByKind: { test: 30 },
      minutesByMode: { free: 30 },
      avgRating: 2,
    });
    expect(map.get("t2")).toMatchObject({ minutes: 20, totalMinutes: 20, avgRating: 2 });
  });

  it("بدون بازه، کلِ تاریخچه را جمع می‌کند و نوعِ ثبت‌نشده را حدس نمی‌زند", () => {
    const sessions = [
      session({ topicId: "t1", date: "2025-01-01", durationMinutes: 60 }), // بدون kind
      session({ topicId: "t1", date: "2025-06-01", durationMinutes: 40, kinds: ["learn", "test"] }),
    ];
    const stat = studyByTopic(sessions).get("t1")!;
    expect(stat.minutes).toBe(100);
    expect(stat.totalMinutes).toBe(100);
    expect(stat.minutesByKind).toEqual({ unknown: 60, learn: 40, test: 40 });
    expect(stat.lastDate).toBe("2025-06-01");
  });

  it("میانگین ارزیابی فقط از جلسه‌های ارزیابی‌شده و داخل بازه است و مبحثی بدون جلسه ساخته نمی‌شود", () => {
    const sessions = [
      session({ topicId: "t1", date: "2025-01-01", rating: 0 }),
      session({ topicId: "t1", date: "2025-01-02", rating: null }),
      session({ topicId: "t1", date: "2025-01-03", rating: 3 }),
      session({ topicId: "old", date: "2024-01-01", rating: 3 }),
    ];
    const map = studyByTopic(sessions, "2025-01-01", "2025-01-31");
    expect(map.get("t1")!.avgRating).toBe(1.5);
    expect(map.get("old")!.avgRating).toBeNull();
    expect(map.has("ghost")).toBe(false);
    expect(studyByTopic([]).size).toBe(0);
  });
});
