import { describe, expect, it } from "vitest";
import type { Subject, Topic } from "../../types";
import { busyMinutesByWeekday, generateSmartPlan } from "../smartPlan";
import { jalaliToKey, weekdayOf } from "../jalali";

let n = 0;
const nid = () => `t${++n}`;

function subj(id: string, priority: Subject["priority"] = "high", approach: Subject["approach"] = "mixed"): Subject {
  return { id, name: id, color: "#000", priority, approach, createdAt: n };
}

function topic(id: string, subjectId: string, est = 120, difficulty: Topic["difficulty"] = 2): Topic {
  n += 1;
  return { id, subjectId, name: id, volume: 10, estimatedMinutes: est, priority: "high", difficulty, status: "not_started", createdAt: n };
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

describe("موتور برنامه‌ریزی هوشمند", () => {
  it("برای هر مبحث فازهای مدل درسش را می‌سازد", () => {
    const subjects = [subj("q", "high", "qbank"), subj("n", "high", "notes")];
    const topics = [topic("a", "q", 200), topic("b", "n", 200)];
    const r = generateSmartPlan({
      planId: "p", topics, subjects,
      startDate: "2026-01-01", endDate: "2026-01-20",
      studyDays: ALL_DAYS, dailyMinutes: 240, idFactory: nid,
    });
    expect(r.tasks.length).toBeGreaterThan(0);
    expect(r.scale).toBe(1);
    expect(r.warnings.join(" ")).not.toContain("فشرده");
    const kinds = new Set(r.tasks.map((t) => t.kind));
    expect(kinds.has("learn")).toBe(true);
    expect(kinds.has("test")).toBe(true); // از مدل qbank
    expect(kinds.has("summary")).toBe(true); // از مدل notes + جمع‌بندی
    // همه‌ی تسک‌ها kind و label دارند
    expect(r.tasks.every((t) => t.kind && t.label)).toBe(true);
    // مرور خودکار هم هست
    expect(r.tasks.some((t) => t.kind === "review" && (t.label ?? "").includes("روز بعد"))).toBe(true);
  });

  it("در روزهای تعطیل چیزی نمی‌چیند", () => {
    const subjects = [subj("s")];
    const topics = [topic("a", "s", 300)];
    const studyDays = [6, 0, 1, 2, 3]; // جمعه تعطیل
    const r = generateSmartPlan({
      planId: "p", topics, subjects,
      startDate: "2026-01-01", endDate: "2026-01-30",
      studyDays, dailyMinutes: 180, idFactory: nid,
    });
    for (const t of r.tasks) {
      expect(studyDays).toContain(weekdayOf(t.date));
    }
  });

  it("از روز امتحان به عقب برمی‌گردد و جمع‌بندی می‌گذارد", () => {
    const subjects = [subj("s")];
    const topics = [topic("a", "s", 600)];
    const r = generateSmartPlan({
      planId: "p", topics, subjects,
      startDate: "2026-01-01", endDate: "2026-02-10",
      examDate: "2026-01-25", studyDays: ALL_DAYS, dailyMinutes: 240, idFactory: nid,
    });
    // هیچ تسکی در روز امتحان یا بعدش نیست
    for (const t of r.tasks) {
      expect(t.date < "2026-01-25").toBe(true);
    }
    // روزهای بافر تسک جمع‌بندی دارند
    expect(r.bufferDates.length).toBeGreaterThan(0);
    for (const d of r.bufferDates) {
      const day = r.tasks.filter((t) => t.date === d);
      expect(day.some((t) => t.kind === "summary")).toBe(true);
      expect(day.some((t) => t.kind === "learn")).toBe(false); // مطلب جدید در بافر نیست
    }
    expect(r.notes.join(" ")).toContain("عقب");
  });

  it("سقف تعداد درس در روز را برای فازهای اصلی رعایت می‌کند", () => {
    const subjects = [subj("s1"), subj("s2"), subj("s3"), subj("s4")];
    const topics = subjects.flatMap((s) => [topic(`${s.id}-a`, s.id, 400)]);
    const r = generateSmartPlan({
      planId: "p", topics, subjects,
      startDate: "2026-01-01", endDate: "2026-02-20",
      studyDays: ALL_DAYS, dailyMinutes: 300, maxSubjectsPerDay: 2, idFactory: nid,
    });
    const byDate = new Map<string, Set<string>>();
    for (const t of r.tasks) {
      if (t.kind === "review") continue; // مرورهای خودکار از سقف مستثنا هستند
      const topic = topics.find((x) => x.id === t.topicId)!;
      const set = byDate.get(t.date) ?? new Set<string>();
      set.add(topic.subjectId);
      byDate.set(t.date, set);
    }
    for (const set of byDate.values()) {
      expect(set.size).toBeLessThanOrEqual(2);
    }
  });

  it("طول تسک‌ها را با زمان تمرکز پیوسته‌ی انتخاب‌شده هماهنگ می‌کند", () => {
    const r = generateSmartPlan({
      planId: "p", topics: [topic("a", "s", 180)], subjects: [subj("s")],
      startDate: "2026-01-01", endDate: "2026-01-10", studyDays: ALL_DAYS,
      dailyMinutes: 240, maxSessionMinutes: 25, reviewGaps: [1], bufferDays: 0, idFactory: nid,
    });
    expect(r.tasks.length).toBeGreaterThan(3);
    expect(r.tasks.every((task) => task.plannedMinutes <= 25)).toBe(true);
    expect(r.notes.join(" ")).toContain("۲۵ دقیقه");
  });

  it("ظرفیتِ متفاوتِ هر روز هفته را در پخش تسک‌ها رعایت می‌کند", () => {
    const r = generateSmartPlan({
      planId: "p", topics: [topic("a", "s", 150)], subjects: [subj("s")],
      startDate: "2026-09-20", endDate: "2026-09-26", studyDays: [0, 6],
      dailyMinutes: 120, dailyMinutesByWeekday: { 0: 30, 6: 120 },
      reviewGaps: [], bufferDays: 0, idFactory: nid,
    });
    const minutesOn = (date: string) => r.tasks.filter((task) => task.date === date).reduce((sum, task) => sum + task.plannedMinutes, 0);
    expect(minutesOn("2026-09-20")).toBeLessThanOrEqual(30);
    expect(minutesOn("2026-09-26")).toBeLessThanOrEqual(120);
    expect(r.notes.join(" ")).toContain("یکشنبه");
  });

  it("مباحث سخت را اول روز می‌چیند (پنجره‌ی طلایی)", () => {
    const subjects = [subj("s")];
    const topics = [topic("easy", "s", 60, 1), topic("hard", "s", 60, 3)];
    const r = generateSmartPlan({
      planId: "p", topics, subjects,
      startDate: "2026-01-01", endDate: "2026-01-05",
      studyDays: ALL_DAYS, dailyMinutes: 400, goldenFirst: true, idFactory: nid,
    });
    const firstDay = r.dates[0];
    const learns = r.tasks.filter((t) => t.date === firstDay && t.kind === "learn").sort((a, b) => a.order - b.order);
    expect(learns.length).toBeGreaterThanOrEqual(2);
    expect(learns[0].topicId).toBe("hard");
  });

  it("کلاس‌های هفتگی ظرفیت همان روز را کم می‌کنند", () => {
    const busy = busyMinutesByWeekday(
      [{ id: "c", title: "کلاس", weekday: 6, startMin: 480, endMin: 720, createdAt: 0 }],
      240,
    );
    expect(busy[6]).toBe(168); // سقف ۷۰٪ از ۲۴۰
    expect(busy[0]).toBe(0);
  });

  it("تعطیلات رسمی ایران را پیش‌فرض خالی می‌گذارد و علت را برای همان روز نشان می‌دهد", () => {
    const date = jalaliToKey(1405, 1, 1);
    const r = generateSmartPlan({
      planId: "p", topics: [topic("a", "s", 120)], subjects: [subj("s")],
      startDate: date, endDate: date, studyDays: [weekdayOf(date)], dailyMinutes: 180, bufferDays: 0, idFactory: nid,
    });
    expect(r.tasks).toEqual([]);
    expect(r.warnings.join(" ")).toContain("تعطیل رسمی");
    expect(r.dayReasons).toHaveLength(1);
    expect(r.dayReasons[0].reason).toContain("نوروز");
  });

  it("با اجازه‌ی کاربر در تعطیلی رسمی هم برنامه می‌چیند", () => {
    const date = jalaliToKey(1405, 1, 1);
    const r = generateSmartPlan({
      planId: "p", topics: [topic("a", "s", 120)], subjects: [subj("s")],
      startDate: date, endDate: date, studyDays: [weekdayOf(date)], dailyMinutes: 180, bufferDays: 0, includeHolidays: true, idFactory: nid,
    });
    expect(r.tasks.length).toBeGreaterThan(0);
    expect(r.tasks.every((task) => task.date === date)).toBe(true);
  });

  it("برای روزهای خالی توضیح می‌دهد که حجم کار زودتر تمام شده", () => {
    const r = generateSmartPlan({
      planId: "p", topics: [topic("small", "s", 30)], subjects: [subj("s")],
      startDate: "2026-09-20", endDate: "2026-09-24", studyDays: ALL_DAYS, dailyMinutes: 180, bufferDays: 0, idFactory: nid,
    });
    expect(r.tasks.length).toBeGreaterThan(0);
    expect(r.dayReasons.length).toBeGreaterThan(0);
    expect(r.dayReasons.some((day) => day.reason.includes("حجم مباحث در روزهای قبل جا شد"))).toBe(true);
  });

  it("روزهای انتخاب‌نشده را با یک توضیح کلی می‌گوید و برای روزهای مطالعه دلیلِ موردی نگه می‌دارد", () => {
    const r = generateSmartPlan({
      planId: "p", topics: [topic("a", "s", 60)], subjects: [subj("s")],
      startDate: "2026-09-20", endDate: "2026-09-26", studyDays: [6], dailyMinutes: 120, bufferDays: 0, idFactory: nid,
    });
    expect(r.dayReasons.every((day) => [6].includes(weekdayOf(day.date)))).toBe(true);
    expect(r.notes.join(" ")).toContain("در روزهای مطالعه انتخاب نشده‌اند");
  });

  it("ورودی خالی، هشدار می‌دهد و تسکی نمی‌سازد", () => {
    const r = generateSmartPlan({
      planId: "p", topics: [], subjects: [],
      startDate: "2026-01-01", endDate: "2026-01-10",
      studyDays: ALL_DAYS, dailyMinutes: 120, idFactory: nid,
    });
    expect(r.tasks).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("حجم زیاد را فشرده می‌کند و هشدار می‌دهد", () => {
    const subjects = [subj("s")];
    const topics = [topic("a", "s", 5000)];
    const r = generateSmartPlan({
      planId: "p", topics, subjects,
      startDate: "2026-01-01", endDate: "2026-01-05",
      studyDays: ALL_DAYS, dailyMinutes: 60, idFactory: nid,
    });
    expect(r.scale).toBeLessThan(1);
    expect(r.warnings.join(" ")).toContain("فشرده");
  });
});
