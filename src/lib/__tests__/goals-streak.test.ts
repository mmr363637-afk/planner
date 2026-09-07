import { describe, expect, it } from "vitest";
import { computeStreak, dailyGoalProgress, pomodoroStats, shouldAwardDailyGoalBonus } from "../stats";
import type { StudySession } from "../../types";

function sess(date: string, minutes = 30, extra: Partial<StudySession> = {}): StudySession {
  return { id: `s-${date}-${Math.random()}`, topicId: null, startedAt: 1, endedAt: 2, durationMinutes: minutes, rating: null, mode: "free", date, ...extra };
}

describe("computeStreak با یخ‌زدگی (Streak Freeze)", () => {
  // ۱،۲،۳ ژانویه مطالعه؛ ۴ غایب؛ ۵ امروز
  const gap = [sess("2025-01-01"), sess("2025-01-02"), sess("2025-01-03")];

  it("بدون یخ‌زدگی مثل قبل عمل می‌کند", () => {
    expect(computeStreak(gap, "2025-01-05")).toBe(0);
    expect(computeStreak(gap, "2025-01-03")).toBe(3);
  });

  it("یک روز جامانده را با یک یخ‌زدگی پوشش می‌دهد", () => {
    expect(computeStreak(gap, "2025-01-05", 1)).toBe(3);
  });

  it("دو روز جامانده با یک یخ‌زدگی پوشیده نمی‌شود", () => {
    const s = [sess("2025-01-01"), sess("2025-01-04")];
    expect(computeStreak(s, "2025-01-05", 1)).toBe(1);
    expect(computeStreak(s, "2025-01-05", 2)).toBe(2);
  });

  it("روزِ خالیِ امروز یخ‌زدگی مصرف نمی‌کند", () => {
    // امروز ۵ ژانویه خالی است؛ زنجیره تا دیروز ۳ روزه است
    expect(computeStreak(gap, "2025-01-05", 1)).toBe(3);
  });

  it("یخ‌زدگی به طول زنجیره اضافه نمی‌کند", () => {
    // ۱ تا ۳ مطالعه، ۴ غایب، ۵ مطالعه (امروز)
    const s = [...gap, sess("2025-01-05")];
    // با یک یخ‌زدگی: ۱،۲،۳ + (۴ یخ‌زده) + ۵ = ۴ روز مطالعه‌شده
    expect(computeStreak(s, "2025-01-05", 1)).toBe(4);
  });
});

describe("pomodoroStats", () => {
  it("فقط سیکل‌های جلسات پومودورو را می‌شمارد", () => {
    const sessions = [
      sess("2025-01-06", 50, { mode: "pomodoro", cycles: 4 } as Partial<StudySession>),
      sess("2025-01-07", 25, { mode: "pomodoro", cycles: 2 } as Partial<StudySession>),
      sess("2025-01-07", 30, { mode: "free" }), // بدون سیکل
      sess("2024-12-20", 75, { mode: "pomodoro", cycles: 6 } as Partial<StudySession>), // هفته‌ی قبل
    ];
    const stats = pomodoroStats(sessions, "2025-01-07");
    expect(stats.total).toBe(12);
    expect(stats.week).toBe(6);
    expect(stats.activeDays).toBe(3); // ۲ روز این هفته + ۱ روز هفته‌ی قبل (مجموع همه‌ی روزهای پومودورو)
  });
});

describe("هدف روزانه", () => {
  it("dailyGoalProgress درصد و وضعیت را می‌دهد", () => {
    expect(dailyGoalProgress(60, 120)).toEqual({ pct: 50, done: false, remaining: 60 });
    expect(dailyGoalProgress(130, 120)).toEqual({ pct: 100, done: true, remaining: 0 });
    expect(dailyGoalProgress(90, 0).done).toBe(false); // هدف خاموش
  });

  it("پاداش هدف فقط یک‌بار و فقط هنگام عبور از آستانه داده می‌شود", () => {
    expect(shouldAwardDailyGoalBonus(90, 30, 120, undefined, "2025-01-05")).toBe(true);
    expect(shouldAwardDailyGoalBonus(120, 30, 120, undefined, "2025-01-05")).toBe(false); // قبلاً رسیده
    expect(shouldAwardDailyGoalBonus(90, 30, 120, "2025-01-05", "2025-01-05")).toBe(false); // امروز گرفته
    expect(shouldAwardDailyGoalBonus(90, 30, 120, "2025-01-04", "2025-01-05")).toBe(true); // دیروز گرفته؛ امروز جدا است
    expect(shouldAwardDailyGoalBonus(50, 30, 120, undefined, "2025-01-05")).toBe(false); // هنوز نرسیده
    expect(shouldAwardDailyGoalBonus(90, 30, 0, undefined, "2025-01-05")).toBe(false); // هدف خاموش
  });
});
