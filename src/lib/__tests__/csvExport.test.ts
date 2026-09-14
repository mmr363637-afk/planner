import { describe, expect, it } from "vitest";
import { sessionsCsv, testLogsCsv, toCsv } from "../csvExport";
import type { AppState } from "../../types";

function baseState(): AppState {
  return {
    subjects: [{ id: "s1", name: "داخلی", color: "#000", priority: "high", createdAt: 1 }],
    topics: [{ id: "t1", subjectId: "s1", name: "قلبی", volume: 1, estimatedMinutes: 10, priority: "medium", difficulty: 1, status: "learning", createdAt: 1 }],
    testLogs: [
      { id: "l1", topicId: "t1", subjectId: "s1", date: "2026-01-10", total: 20, correct: 15, createdAt: 1 },
      { id: "l2", date: "2026-01-11", total: 10, correct: 4, createdAt: 2 },
    ],
    sessions: [
      { id: "a", topicId: "t1", startedAt: 1000, endedAt: 3600000, durationMinutes: 60, rating: 3, mode: "pomodoro", date: "2026-01-10", distractions: 2 },
      { id: "b", startedAt: 2000, endedAt: 3400000, durationMinutes: 56, rating: null, mode: "free", date: "2026-01-10" },
    ],
    settings: { onboarded: true },
  } as unknown as AppState;
}

describe("csvExport", () => {
  it("toCsv: اکرش، BOM و جداکننده‌ی ;", () => {
    const csv = toCsv([
      ["a", "b"],
      ['حالت "گرفته"', "متن;بافاصله"],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("a;b");
    expect(csv).toContain('"حالت ""گرفته""";"متن;بافاصله"');
  });

  it("testLogsCsv: ستون‌ها، درصد و ترتیب تاریخ", () => {
    const csv = testLogsCsv(baseState());
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe("تاریخ;تاریخ شمسی;درس;مبحث;کل سؤالات;درست;درصد");
    expect(lines[1]).toBe("2026-01-10;۱۴۰۴/۱۰/۲۰;داخلی;قلبی;20;15;75");
    expect(lines[2]).toContain("2026-01-11");
    expect(lines[2]).toContain("—"); // بدون درس/مبحث
  });

  it("sessionsCsv: حالت و ارزیابی فارسی + جلسات بدون مبحث", () => {
    const csv = sessionsCsv(baseState());
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe("تاریخ;درس;مبحث;دقیقه;حالت;ارزیابی;حواس‌پرتی");
    expect(lines[1]).toBe("2026-01-10;داخلی;قلبی;60;پومودورو;مسلط شدم;2");
    expect(lines[2]).toBe("2026-01-10;—;بدون مبحث;56;آزاد;—;—");
  });
});
