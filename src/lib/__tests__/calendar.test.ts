import { describe, expect, it } from "vitest";
import { buildICS, eventsFromState, googleCalendarUrl, icsEscape, icsFold } from "../calendar";
import type { Exam, StudyTask, Topic } from "../../types";

describe("googleCalendarUrl", () => {
  it("رویداد تمام‌روز بازه‌ی درست می‌سازد", () => {
    const url = googleCalendarUrl({ title: "امتحان آناتومی", date: "2026-01-05" });
    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=");
    expect(url).toContain("dates=20260105/20260106");
  });

  it("رویداد ساعتی زمان شروع/پایان می‌گیرد", () => {
    const url = googleCalendarUrl({ title: "مطالعه", date: "2026-01-05", time: "08:30", durationMinutes: 90 });
    expect(url).toContain("dates=20260105T083000/20260105T100000");
  });
});

describe("ICS", () => {
  it("escape متن‌های فارسی و کاراکترهای خاص", () => {
    expect(icsEscape("سمینار; فصل 1,2")).toBe("سمینار\\; فصل 1\\,2");
    expect(icsEscape("خط اول\nخط دوم")).toBe("خط اول\\nخط دوم");
  });

  it("خطوط بلند طبق RFC 5545 تاشده‌اند (CRLF + فاصله)", () => {
    const long = "DESCRIPTION:" + "ابجد".repeat(100);
    const folded = icsFold(long);
    for (const line of folded.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it("فایل ICS کامل با VEVENT تمام‌روز و ساعتی", () => {
    const ics = buildICS([
      { title: "امتحان بافت; فصل 1,2", date: "2026-01-10" },
      { title: "مرور فیزیولوژی", date: "2026-01-08", time: "09:00", durationMinutes: 45 },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260110");
    expect(ics).toContain("DTSTART:20260108T090000");
    expect(ics).toContain("DTEND:20260108T094500");
    expect(ics).toContain("SUMMARY:امتحان بافت\\; فصل 1\\,2");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // همه‌ی خطوط با CRLF جدا شده‌اند
    expect(ics.includes("\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});

describe("eventsFromState", () => {
  it("امتحانات و تسک‌ها را به رویداد تبدیل می‌کند؛ تسک‌های حذف‌شده نه", () => {
    const exams: Exam[] = [{ id: "e1", title: "پاتولوژی", date: "2026-02-01", time: "10:00", createdAt: 1 }];
    const topics: Topic[] = [{ id: "t1", subjectId: "s1", name: "التهاب", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status: "learning", createdAt: 1 }];
    const tasks: StudyTask[] = [
      { id: "k1", topicId: "t1", date: "2026-01-20", plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 0, priority: "medium" },
      { id: "k2", topicId: "t1", date: "2026-01-21", plannedMinutes: 60, doneMinutes: 0, status: "skipped", order: 1, priority: "medium" },
    ];
    const events = eventsFromState(exams, tasks, topics);
    expect(events.length).toBe(2);
    expect(events[0].title).toBe("امتحان: پاتولوژی");
    expect(events[1].title).toBe("مطالعه: التهاب");
    expect(events[1].date).toBe("2026-01-20");
  });
});
