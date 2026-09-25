import { describe, expect, it } from "vitest";
import { accuracyByDaypart, buildInsights, longVsShortRating, reviewAdherence, subjectMomentum, weeklyContext } from "../insights";
import type { Review, StudySession, Subject, TestLog, Topic } from "../../types";

const TODAY = "2026-09-23";

const subjects: Subject[] = [
  { id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 0 },
  { id: "s2", name: "ریه", color: "#00f", priority: "medium", createdAt: 0 },
];
const topics: Topic[] = [
  { id: "t1", subjectId: "s1", name: "نوار قلب", volume: 1, estimatedMinutes: 30, priority: "medium", difficulty: 2, status: "learning", createdAt: 0 },
  { id: "t2", subjectId: "s2", name: "اسپیرومتری", volume: 1, estimatedMinutes: 30, priority: "medium", difficulty: 2, status: "learning", createdAt: 0 },
];

function session(date: string, minutes: number, topicId: string | null, extra: Partial<StudySession> = {}): StudySession {
  return {
    id: `${date}-${minutes}-${Math.random()}`,
    topicId,
    startedAt: 0,
    endedAt: 0,
    durationMinutes: minutes,
    rating: null,
    mode: "free",
    date,
    ...extra,
  };
}

function testLog(correct: number, total: number, createdAt: number): TestLog {
  return { id: `l${createdAt}-${Math.random()}`, topicId: "t1", subjectId: "s1", date: TODAY, total, correct, createdAt };
}

describe("موتور بینش محلی", () => {
  it("دقت تست به تفکیک بازه‌ی روز — صبحِ ساخته‌شده بالاتر است", () => {
    const morning = new Date(`${TODAY}T08:00:00`).getTime();
    const night = new Date(`${TODAY}T23:30:00`).getTime();
    const parts = accuracyByDaypart([
      testLog(40, 50, morning),
      testLog(20, 50, night),
    ]);
    expect(parts[0].bucket).toBe("صبح");
    expect(parts[0].pct).toBe(80);
    expect(parts.at(-1)!.bucket).toBe("شب");
  });

  it("بینش «تست‌ها را در صبح بهتر می‌زنی» با داده‌ی کافی ساخته می‌شود", () => {
    const morning = new Date(`${TODAY}T09:00:00`).getTime();
    const night = new Date(`${TODAY}T23:00:00`).getTime();
    const insights = buildInsights(
      {
        sessions: [],
        testLogs: [testLog(45, 50, morning), testLog(25, 50, night)],
        reviews: [],
        topics,
        subjects,
      },
      TODAY,
    );
    const hit = insights.find((i) => i.id === "daypart-accuracy");
    expect(hit).toBeTruthy();
    expect(hit!.text).toContain("۹۰٪");
  });

  it("وفاداری به مرور: دیرکردِ زیاد → بینش هشدار", () => {
    const reviews: Review[] = [];
    for (let i = 0; i < 10; i++) {
      reviews.push({
        id: `r${i}`,
        topicId: "t1",
        dueDate: "2026-09-20",
        reviewNumber: 1,
        stage: 0,
        intervalDays: 1,
        status: "done",
        completedAt: new Date(i < 4 ? "2026-09-20T10:00:00" : "2026-09-22T10:00:00").getTime(),
      });
    }
    const adh = reviewAdherence(reviews);
    expect(adh!.pct).toBe(40);
    const insights = buildInsights({ sessions: [], testLogs: [], reviews, topics, subjects }, TODAY);
    expect(insights.some((i) => i.id === "review-late")).toBe(true);
  });

  it("تکانش درس‌ها: افت ۶۰+ دقیقه‌ای بینش می‌سازد", () => {
    const sessions = [
      session("2026-09-01", 120, "t1"), // دو هفته‌ی قبل — قلب
      session("2026-09-20", 20, "t1"), // اخیر — قلب (سرد شده)
      session("2026-09-02", 60, "t2"), // دو هفته‌ی قبل — ریه
      session("2026-09-21", 65, "t2"), // اخیر — ریه
    ];
    const m = subjectMomentum(sessions, topics, subjects, TODAY);
    const s1 = m.find((x) => x.subject.id === "s1")!;
    expect(s1.prior).toBe(120);
    expect(s1.recent).toBe(20);
    const insights = buildInsights({ sessions, testLogs: [], reviews: [], topics, subjects }, TODAY);
    expect(insights.some((i) => i.id === "momentum-down")).toBe(true);
  });

  it("جلسه‌های بلند در برابر کوتاه — بدون داده‌ی کافی بینش نمی‌دهد", () => {
    expect(longVsShortRating([session(TODAY, 60, "t1", { rating: 3 })])).toBeNull();
  });

  it("weeklyContext فقط داده‌ی عددی/متنیِ بدون حساسیت می‌دهد", () => {
    const ctx = weeklyContext(
      { sessions: [session("2026-09-21", 45, "t1")], testLogs: [], reviews: [], topics, subjects },
      TODAY,
    );
    expect(ctx.weekMinutes).toBe(45);
    expect(JSON.parse(JSON.stringify(ctx))).toBeTruthy(); // JSON-پذیر است
    expect((ctx.minutesBySubject as Record<string, number>)["قلب"]).toBe(45);
  });
});
