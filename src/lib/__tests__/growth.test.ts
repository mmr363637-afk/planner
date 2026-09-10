import { describe, expect, it } from "vitest";
import { habitStreak, habitWeekCount, habitWeekDone } from "../habits";
import { treeEmoji, treeStage } from "../focusTree";
import { bestRollingWeek, currentWeekMinutes } from "../ghost";
import { JOURNEY_STOPS, journeyProgress } from "../journey";
import type { StudySession } from "../../types";

describe("عادت‌ها", () => {
  it("زنجیره‌ی پیاپی تا امروز", () => {
    expect(habitStreak(["2026-01-08", "2026-01-09", "2026-01-10"], "2026-01-10")).toBe(3);
    // امروز انجام نشده ولی دیروز شده: زنجیره حفظ است
    expect(habitStreak(["2026-01-09"], "2026-01-10")).toBe(1);
    // گسستگی: فقط دنباله‌ی آخر
    expect(habitStreak(["2026-01-01", "2026-01-09", "2026-01-10"], "2026-01-10")).toBe(2);
    expect(habitStreak([], "2026-01-10")).toBe(0);
  });

  it("شمارش هفته و تحقق هدف", () => {
    // ۲۰۲۶-۰۱-۱۰ شنبه است؛ هفته: ۱۰ تا ۱۶ ژانویه
    expect(habitWeekCount(["2026-01-10", "2026-01-12", "2026-01-03"], "2026-01-12")).toBe(2);
    expect(habitWeekDone(["2026-01-10", "2026-01-12"], 2, "2026-01-12")).toBe(true);
    expect(habitWeekDone(["2026-01-10"], 2, "2026-01-12")).toBe(false);
  });
});

describe("درخت تمرکز", () => {
  it("مرحله بر اساس درصد هدف", () => {
    expect(treeStage(0, 120)).toBe(0);
    expect(treeStage(10, 120)).toBe(1);
    expect(treeStage(40, 120)).toBe(2);
    expect(treeStage(70, 120)).toBe(3);
    expect(treeStage(95, 120)).toBe(4);
    expect(treeStage(120, 120)).toBe(5);
  });

  it("بدون هدف، آستانه‌های پیش‌فرض", () => {
    expect(treeStage(0, 0)).toBe(0);
    expect(treeStage(15, 0)).toBe(1);
    expect(treeStage(45, 0)).toBe(2);
    expect(treeStage(90, 0)).toBe(3);
    expect(treeStage(150, 0)).toBe(4);
    expect(treeStage(200, 0)).toBe(5);
  });

  it("پژمردگی ایموجی جدا دارد", () => {
    expect(treeEmoji(4, true)).not.toBe(treeEmoji(4, false));
  });
});

function sess(date: string, minutes: number): StudySession {
  return { id: date + minutes, topicId: null, startedAt: 0, endedAt: 0, durationMinutes: minutes, rating: null, mode: "free", date };
}

describe("سایه‌ی بهترین هفته", () => {
  it("بهترین پنجره‌ی ۷ روزه را پیدا می‌کند", () => {
    const sessions = [sess("2026-01-01", 60), sess("2026-01-02", 60), sess("2026-02-01", 30)];
    const best = bestRollingWeek(sessions);
    expect(best?.minutes).toBe(120);
    expect(best?.start).toBe("2026-01-01");
  });

  it("بدون سابقه null است", () => {
    expect(bestRollingWeek([])).toBeNull();
  });

  it("دقایق هفته‌ی جاری", () => {
    const sessions = [sess("2026-01-10", 50), sess("2026-01-11", 20), sess("2026-01-03", 99)];
    expect(currentWeekMinutes(sessions, "2026-01-12")).toBe(70);
  });
});

describe("سفر مطالعه", () => {
  it("از تهران شروع می‌شود", () => {
    const p = journeyProgress(0);
    expect(p.current.city).toBe("تهران");
    expect(p.next?.city).toBe("قم");
    expect(p.finished).toBe(false);
  });

  it("با ساعت بیشتر جلو می‌رود", () => {
    // ۶ ساعت × ۲۵ = ۱۵۰ کیلومتر = قم
    const p = journeyProgress(360);
    expect(p.current.city).toBe("قم");
    const far = journeyProgress(60000);
    expect(far.current.city).toBe(JOURNEY_STOPS[JOURNEY_STOPS.length - 1].city);
    expect(far.finished).toBe(true);
  });
});
