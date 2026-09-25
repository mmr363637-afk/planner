import { describe, expect, it } from "vitest";
import { ankiBasic, ankiCloze, clozeToAnki } from "../ankiExport";
import type { Flashcard, Subject, Topic } from "../../types";

function card(partial: Partial<Flashcard> & { id: string }): Flashcard {
  return {
    front: "رو",
    back: "پشت",
    ef: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueDate: "2026-09-23",
    lapses: 0,
    createdAt: 0,
    ...partial,
  };
}

const subjects: Subject[] = [{ id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 0 }];
const topics: Topic[] = [
  { id: "t1", subjectId: "s1", name: "نوار قلب", volume: 1, estimatedMinutes: 30, priority: "medium", difficulty: 2, status: "learning", createdAt: 0 },
];

describe("خروجی Anki", () => {
  it("cloze اپ به سینتکس Anki با شماره‌های پیاپی تبدیل می‌شود", () => {
    expect(clozeToAnki("{{عضله}} و {{دریچه}}")).toBe("{{c1::عضله}} و {{c2::دریچه}}");
    expect(clozeToAnki("بدون جاخالی")).toBe("بدون جاخالی");
  });

  it("خروجی Basic: directiveها + سطرهای tab-separated با tag درس::مبحث", () => {
    const { text, count } = ankiBasic([card({ id: "c1", front: "سوال", back: "جواب", topicId: "t1" })], topics, subjects);
    expect(count).toBe(1);
    const lines = text.trim().split("\n");
    expect(lines[0]).toBe("#separator:tab");
    expect(lines).toContain("#notetype:Basic");
    expect(lines[4]).toBe("سوال\tجواب\tقلب::نوار_قلب");
  });

  it("کارت جاخالی به Basic نمی‌رود؛ در Cloze با notetype درست می‌نشیند", () => {
    const cards = [
      card({ id: "c1", front: "سوال ساده", back: "جواب" }),
      card({ id: "c2", front: "پمپ {{قلب}} است", back: "تعریف", topicId: "t1" }),
    ];
    const basic = ankiBasic(cards, topics, subjects);
    expect(basic.count).toBe(1);
    expect(basic.text).not.toContain("c1::");
    const cloze = ankiCloze(cards, topics, subjects);
    expect(cloze.count).toBe(1);
    expect(cloze.text).toContain("#notetype:Cloze");
    expect(cloze.text).toContain("{{c1::قلب}}");
  });

  it("فیلتر مبحث و کارت‌های تابو/خط‌شکسته پاکسازی می‌شوند", () => {
    const cards = [
      card({ id: "c1", topicId: "t1", front: "در\tمبحث", back: "خط اول\nخط دوم" }),
      card({ id: "c2", topicId: "other", front: "بیرون", back: "از مبحث" }),
    ];
    const { text, count } = ankiBasic(cards, topics, subjects, { topicId: "t1" });
    expect(count).toBe(1);
    expect(text).toContain("در مبحث\tخط اول خط دوم");
    expect(text).not.toContain("بیرون");
  });

  it("includeCurated=false کارت‌های منتخب واردشده را رد می‌کند", () => {
    const cards = [
      card({ id: "c1" }),
      card({ id: "c2", origin: "curated", packId: "p1" }),
    ];
    expect(ankiBasic(cards, topics, subjects, { includeCurated: false }).count).toBe(1);
    expect(ankiBasic(cards, topics, subjects).count).toBe(2);
  });
});
