import { describe, expect, it } from "vitest";
import { buildDaySheet, buildWeekSheet, clockToMin, freeWindows, mergeIntervals, minToClock, sheetText } from "../daySheet";
import type { ClassBlock, Exam, StudySession, StudyTask, Subject, Topic } from "../../types";

const TODAY = "2026-10-02"; // جمعه
const SUBJECTS: Subject[] = [
  { id: "s1", name: "فیزیولوژی", color: "#0ea5a4", priority: "high", createdAt: 1 },
  { id: "s2", name: "آناتومی", color: "#8b5cf6", priority: "medium", createdAt: 2 },
];
const TOPICS: Topic[] = [
  { id: "t1", subjectId: "s1", name: "قلب", volume: 10, estimatedMinutes: 120, priority: "high", difficulty: 2, status: "learning", createdAt: 1 },
  { id: "t2", subjectId: "s2", name: "استخوان‌ها", volume: 10, estimatedMinutes: 90, priority: "medium", difficulty: 2, status: "not_started", createdAt: 2 },
];
const klass = (id: string, weekday: number, startMin: number, endMin: number, title = "کلاس"): ClassBlock => ({
  id, title, weekday, startMin, endMin, createdAt: 1,
});
const task = (over: Partial<StudyTask> & Pick<StudyTask, "id" | "topicId">): StudyTask => ({
  date: TODAY, plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 0, priority: "medium", kind: "learn", ...over,
});

function sheet(over: Partial<Parameters<typeof buildDaySheet>[0]> = {}) {
  return buildDaySheet({
    date: TODAY,
    weekday: 5, // جمعه
    dayStartMin: 7 * 60,
    dayEndMin: 23 * 60,
    classBlocks: [],
    tasks: [],
    sessions: [],
    topics: TOPICS,
    subjects: SUBJECTS,
    exams: [],
    ...over,
  });
}

describe("clockToMin / minToClock", () => {
  it("ساعت را رفت‌وبرگشت تبدیل می‌کند و ورودی بد را رد می‌کند", () => {
    expect(clockToMin("07:30")).toBe(450);
    expect(clockToMin("23:59")).toBe(1439);
    expect(clockToMin("24:00")).toBeNull();
    expect(clockToMin("۷:۳۰")).toBeNull();
    expect(clockToMin(undefined)).toBeNull();
    expect(minToClock(450)).toBe("۰۷:۳۰");
    expect(minToClock(0)).toBe("۰۰:۰۰");
    expect(minToClock(24 * 60)).toBe("۲۳:۵۹"); // داخل شبانه‌روز محدود می‌شود
  });
});

describe("پنجره‌های خالی", () => {
  it("بازه‌های هم‌پوشان را ادغام و فاصله‌های مفید را جدا می‌کند", () => {
    expect(mergeIntervals([{ start: 600, end: 700 }, { start: 650, end: 720 }, { start: 800, end: 900 }])).toEqual([
      { start: 600, end: 720 },
      { start: 800, end: 900 },
    ]);
    expect(freeWindows([{ start: 480, end: 600 }, { start: 720, end: 840 }], 420, 1200, 25)).toEqual([
      { start: 420, end: 480, minutes: 60 }, // صبح پیش از کلاس اول
      { start: 600, end: 720, minutes: 120 },
      { start: 840, end: 1200, minutes: 360 },
    ]);
    // فاصله‌ی کمتر از حدِ مفید حذف می‌شود
    expect(freeWindows([{ start: 600, end: 700 }, { start: 715, end: 900 }], 420, 1200, 25)).toEqual([
      { start: 420, end: 600, minutes: 180 },
      { start: 900, end: 1200, minutes: 300 },
    ]);
  });
});

describe("ساخت برنامه‌ی روز", () => {
  it("کلاس، امتحان، مطالعه‌ی ثبت‌شده و پیشنهاد را در یک تایم‌لاین می‌چیند", () => {
    const sessions: StudySession[] = [
      { id: "se1", topicId: "t1", startedAt: new Date(2026, 9, 2, 10, 0).getTime(), endedAt: new Date(2026, 9, 2, 11, 0).getTime(), durationMinutes: 60, rating: 2, mode: "free", date: TODAY, kind: "learn" },
    ];
    const exams: Exam[] = [{ id: "e1", title: "امتحان فیزیولوژی", date: TODAY, time: "14:00", subjectId: "s1", createdAt: 1 }];
    const res = sheet({
      classBlocks: [klass("c1", 5, 8 * 60, 10 * 60, "فیزیولوژی عملی")],
      tasks: [task({ id: "k1", topicId: "t2", plannedMinutes: 90 })],
      sessions,
      exams,
    });
    const byKind = (k: string) => res.items.filter((i) => i.kind === k);
    expect(byKind("class")).toHaveLength(1);
    expect(byKind("class")[0]).toMatchObject({ startMin: 480, endMin: 600, minutes: 120 });
    expect(byKind("recorded")[0]).toMatchObject({ startMin: 600, endMin: 660, title: "قلب", subtitle: "فیزیولوژی" });
    expect(byKind("exam")[0]).toMatchObject({ startMin: 840, label: "۱۴:۰۰", title: "امتحان فیزیولوژی" });
    // تسک در انتظار داخل پنجره‌های خالی چیده می‌شود و با چیزهای ثابت برخورد نمی‌کند
    const suggested = byKind("suggested");
    expect(suggested.length).toBeGreaterThan(0);
    for (const item of suggested) {
      expect(item.endMin).toBeLessThanOrEqual(23 * 60);
      const overlap = res.items.some(
        (other) => other.kind === "class" && item.startMin < other.endMin && other.startMin < item.endMin,
      );
      expect(overlap).toBe(false);
      expect(item.subtitle).toBe("آناتومی");
    }
    expect(res.totals.classMinutes).toBe(120);
    expect(res.totals.recordedMinutes).toBe(60);
    expect(res.totals.suggestedMinutes).toBe(90);
    // مرتب بر اساس دقیقه‌ی نزولی: آناتومی ۹۰ (پیشنهادی) و فیزیولوژی ۶۰ (ثبت‌شده)
    expect(res.bySubject.map((b) => b.name)).toEqual(["آناتومی", "فیزیولوژی"]);
    expect(res.bySubject.map((b) => b.minutes)).toEqual([90, 60]);
  });

  it("پنجره‌ی طلایی را علامت می‌زند و بازه‌ی محور را با کلاسِ صبحِ زود گسترش می‌دهد", () => {
    const res = sheet({
      classBlocks: [klass("c1", 5, 6 * 60, 6 * 60 + 45)],
      goldenWindow: { startHour: 9, endHour: 12 },
    });
    expect(res.rangeStartMin).toBe(6 * 60);
    expect(res.windows.filter((w) => w.best)).toHaveLength(1);
    const best = res.windows.find((w) => w.best)!;
    expect(best.minutes).toBe(Math.max(...res.windows.map((w) => w.minutes)));
    expect(res.windows.some((w) => w.golden)).toBe(true);
  });

  it("تسکِ بازمانده اول چیده می‌شود و برچسب «بازمانده» می‌گیرد", () => {
    const res = sheet({
      tasks: [
        task({ id: "today", topicId: "t1", order: 0 }),
        task({ id: "late", topicId: "t2", date: "2026-09-30", order: 5 }),
      ],
    });
    const first = res.items.find((i) => i.kind === "suggested")!;
    expect(first.taskId).toBe("late");
    expect(first.label).toContain("بازمانده");
  });

  it("اگر روز جا نداشته باشد، باقی کارها در «جا نشد» می‌مانند", () => {
    const res = sheet({
      classBlocks: [klass("c1", 5, 7 * 60, 22 * 60)],
      tasks: [task({ id: "k1", topicId: "t1", plannedMinutes: 120 })],
    });
    // تنها پنجره‌ی خالی ۲۲:۰۰–۲۳:۰۰ است؛ یک نوبت ۴۰ دقیقه‌ای جا می‌شود و بقیه «جا نشد»
    const placed = res.items.filter((i) => i.kind === "suggested");
    expect(placed.reduce((n, i) => n + i.minutes, 0)).toBe(40);
    expect(res.unplaced.reduce((n, u) => n + u.minutes, 0)).toBe(80);
    expect(res.unplaced[0].topicId).toBe("t1");
    expect(placed.every((i) => i.endMin <= 23 * 60)).toBe(true);
  });

  it("تسک بلند به چند نوبتِ تمرکز می‌شکند (بدون بخشِ زیر ۵ دقیقه)", () => {
    const res = sheet({ tasks: [task({ id: "k1", topicId: "t1", plannedMinutes: 125 })] });
    const suggested = res.items.filter((i) => i.kind === "suggested");
    expect(suggested).toHaveLength(3); // ۱۲۵ دقیقه بین سه نوبتِ متعادل تقسیم می‌شود
    expect(suggested.map((s) => s.minutes)).toEqual([40, 40, 45]);
    expect(suggested.reduce((n, s) => n + s.minutes, 0)).toBe(125);
    expect(suggested[0].label).toContain("بخش ۱/۳");
    expect(suggested.every((s) => s.minutes >= 5)).toBe(true);
  });

  it("تسک‌های انجام‌شده و امتحانِ بی‌ساعت به تایم‌لاین تحمیل نمی‌شوند", () => {
    const res = sheet({
      tasks: [task({ id: "done", topicId: "t1", status: "done", doneMinutes: 60 })],
      exams: [{ id: "e1", title: "امتحان بدون ساعت", date: TODAY, createdAt: 1 }],
    });
    expect(res.items.filter((i) => i.kind === "suggested")).toHaveLength(0);
    expect(res.allDay.map((i) => i.title)).toEqual(["امتحان بدون ساعت"]);
    expect(res.totals.plannedMinutes).toBe(0);
  });

  it("تداخل کلاس‌ها را گزارش می‌کند و مرورهای سررسید را می‌شمارد", () => {
    const res = sheet({
      classBlocks: [klass("c1", 5, 8 * 60, 10 * 60), klass("c2", 5, 9 * 60, 11 * 60)],
      reviews: [
        { topicId: "t1", status: "pending", dueDate: TODAY },
        { topicId: "t2", status: "pending", dueDate: "2026-10-05" },
        { topicId: "t1", status: "done", dueDate: TODAY },
      ],
    });
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].sort()).toEqual(["class:c1", "class:c2"]);
    expect(res.totals.reviewsDue).toBe(1);
  });
});

describe("نمای هفته و خروجی متنی", () => {
  it("برای هر روز یک برنامه‌ی مستقل می‌سازد", () => {
    const dates = ["2026-10-01", "2026-10-02"];
    const week = buildWeekSheet({
      dates,
      weekdayOf: (d) => (d === "2026-10-01" ? 4 : 5),
      holidayOf: (d) => (d === "2026-10-02" ? "جمعه" : null),
      dayStartMin: 7 * 60,
      dayEndMin: 23 * 60,
      classBlocks: [klass("c1", 5, 8 * 60, 10 * 60)],
      tasks: [task({ id: "k1", topicId: "t1" })],
      sessions: [],
      topics: TOPICS,
      subjects: SUBJECTS,
      exams: [],
    });
    expect(week.map((d) => d.date)).toEqual(dates);
    expect(week[0].holiday).toBeNull();
    expect(week[1].holiday).toBe("جمعه");
    expect(week[0].items.filter((i) => i.kind === "class")).toHaveLength(0);
    expect(week[1].items.filter((i) => i.kind === "class")).toHaveLength(1);
  });

  it("خروجی متنی زمان‌ها، کارها و جمعِ روز را دارد", () => {
    const res = sheet({
      classBlocks: [klass("c1", 5, 8 * 60, 10 * 60, "کلاس قلب")],
      tasks: [task({ id: "k1", topicId: "t1", plannedMinutes: 50 })],
    });
    const text = sheetText(res, "جمعه ۱۰ مهر ۱۴۰۵");
    expect(text).toContain("کلاس قلب");
    expect(text).toContain("۰۸:۰۰–۱۰:۰۰");
    expect(text).toContain("قلب");
    expect(text).toContain("خالی");
    expect(text).toContain("پیشنهادی");
  });
});
