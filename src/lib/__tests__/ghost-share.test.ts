import { describe, expect, it } from "vitest";
import { currentWeekDays, encodeGhostShare, ghostTotal, parseGhostShare } from "../ghost";
import type { StudySession } from "../../types";

function session(date: string, minutes: number): StudySession {
  return { id: `${date}-${minutes}`, topicId: null, startedAt: 0, endedAt: 0, durationMinutes: minutes, rating: null, mode: "free", date };
}

describe("اشتراک سایه با دوستان (آفلاین، کد متنی)", () => {
  it("roundtrip: کد ساخته‌شده دقیقاً همان داده برمی‌گردد", () => {
    const code = encodeGhostShare({ name: "سارا", days: [60, 90, 0, 45, 120, 30, 0], weekStart: "2026-09-19" });
    expect(code.startsWith("SPGHOST1:")).toBe(true);
    const parsed = parseGhostShare(code);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe("سارا");
    expect(parsed!.days).toEqual([60, 90, 0, 45, 120, 30, 0]);
    expect(parsed!.weekStart).toBe("2026-09-19");
  });

  it("ورودی نامعتبر رد می‌شود (نه crash)", () => {
    expect(parseGhostShare("سلام!")).toBeNull();
    expect(parseGhostShare("SPGHOST1:not-base64!!!")).toBeNull();
    expect(parseGhostShare("")).toBeNull();
    // همه‌صفر = سایه‌ای وجود ندارد
    const empty = encodeGhostShare({ name: "x", days: [0, 0, 0, 0, 0, 0, 0], weekStart: "" });
    expect(parseGhostShare(empty)).toBeNull();
  });

  it("نام بیش‌ازحد بلند کوتاه می‌شود و اعداد خراب صفر می‌شوند", () => {
    const code = encodeGhostShare({ name: "ن".repeat(60), days: [10, NaN, -5, 20, 0, 0, 0], weekStart: "bad" });
    const parsed = parseGhostShare(code)!;
    expect(parsed.name.length).toBeLessThanOrEqual(24);
    expect(parsed.days).toEqual([10, 0, 0, 20, 0, 0, 0]);
    expect(parsed.weekStart).toBe("");
  });

  it("دقایق هفته‌ی جاری از روی جلسات (شنبه..جمعه)", () => {
    // 2026-09-23 سه‌شنبه است؛ startOfWeek → شنبه 2026-09-19
    const sessions = [
      session("2026-09-19", 30), // شنبه
      session("2026-09-19", 15), // شنبه (دوم)
      session("2026-09-23", 60), // سه‌شنبه
      session("2026-09-10", 999), // هفته‌ی قبل — شمرده نمی‌شود
    ];
    const days = currentWeekDays(sessions, "2026-09-23");
    expect(days.length).toBe(7);
    expect(days[0]).toBe(45); // شنبه
    expect(days[4]).toBe(60); // سه‌شنبه
    expect(ghostTotal(days)).toBe(105);
  });
});
