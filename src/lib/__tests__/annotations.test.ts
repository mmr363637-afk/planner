import { describe, expect, it } from "vitest";
import type { TextAnnotation } from "../../types";
import {
  MAX_ANNOTATIONS_PER_CARD,
  addAnnotation,
  annotationsOf,
  annotationCount,
  normalizeAnnotations,
  notedAnnotations,
  patchAnnotation,
  removeAnnotation,
  textSegments,
  wordSpanAt,
} from "../annotations";

const card = { front: "درمان آسم حاد: سالبوتامول و اکسیژن", back: "سالبوتامول نبولایز شده", highlights: ["سالبوتامول"] };

describe("نشانه‌گذاری انتخابی متن", () => {
  it("بازه‌ها را نرمال و مرتب می‌کند و دادهٔ خراب را دور می‌ریزد", () => {
    const list = normalizeAnnotations([
      { id: "a", side: "front", start: 10, end: 14, text: "آسم", style: "highlight", color: "green" },
      { id: "b", side: "front", start: 4, end: 4, text: "", style: "highlight" },
      { id: "c", side: "x", start: 0, end: 2, text: "بد", style: "highlight" },
      { id: "d", side: "back", start: 0, end: 5, text: "سال", style: "sparkle" },
      { id: "e", side: "back", start: 0, end: 5, text: "سال", style: "strike" },
    ]);
    expect(list.map((a) => a.id)).toEqual(["e", "a"]);
    expect(list[0].color).toBeUndefined();
  });

  it("هایلایت‌های قدیمی به نشانه‌گذاری با آفست تبدیل می‌شوند و متن کارت تغییر نمی‌کند", () => {
    const list = annotationsOf(card, "front");
    expect(list).toHaveLength(1);
    expect(card.front.slice(list[0].start, list[0].end)).toBe("سالبوتامول");
    // هایلایت قدیمی در هر دو سمتِ کارت دیده می‌شد؛ همان رفتار حفظ می‌شود
    expect(annotationCount(card)).toBe(2);
    // نشانه‌گذاری جدید هم‌پوشان، نسخهٔ قدیمی را تکراری نمی‌کند
    const next = addAnnotation(annotationsOf(card, "front"), {
      side: "front",
      start: list[0].start,
      end: list[0].end,
      text: "سالبوتامول",
      style: "highlight",
      color: "purple",
    });
    expect(next).toHaveLength(1);
    expect(next[0].color).toBe("purple");
  });

  it("افزودن زیرخط و خط‌خوردگی در همان بازه، جدا از هایلایت می‌ماند", () => {
    let list = addAnnotation([], { side: "front", start: 0, end: 4, text: "درمان", style: "highlight", color: "yellow" });
    list = addAnnotation(list, { side: "front", start: 0, end: 4, text: "درمان", style: "underline" });
    list = addAnnotation(list, { side: "front", start: 0, end: 4, text: "درمان", style: "strike" });
    expect(list.map((a) => a.style).sort()).toEqual(["highlight", "strike", "underline"]);
    expect(list.filter((a) => a.style === "underline")[0].color).toBeUndefined();
  });

  it("یادداشتِ عبارت نگه داشته می‌شود و با حذف/تغییر رنگ از بین نمی‌رود", () => {
    const list = addAnnotation([], { side: "back", start: 0, end: 11, text: "سالبوتامول ", style: "highlight", note: "دوز بزرگسال" });
    expect(notedAnnotations({ ...card, annotations: list })).toHaveLength(1);
    const patched = patchAnnotation(list, list[0].id, { color: "blue" });
    expect(patched[0].color).toBe("blue");
    expect(patched[0].note).toBe("دوز بزرگسال");
    expect(removeAnnotation(patched, patched[0].id)).toHaveLength(0);
  });

  it("بازهٔ خالی یا خارج از متن چیزی اضافه نمی‌کند", () => {
    expect(addAnnotation([], { side: "front", start: 5, end: 5, text: "الف" })).toHaveLength(0);
    expect(addAnnotation([], { side: "front", start: 0, end: 3, text: "   " })).toHaveLength(0);
  });

  it("سقف تعداد نشانه‌گذاری رعایت می‌شود (دادهٔ کارت بی‌نهایت رشد نمی‌کند)", () => {
    let list: TextAnnotation[] = [];
    const text = "ا".repeat(MAX_ANNOTATIONS_PER_CARD + 20);
    for (let i = 0; i < MAX_ANNOTATIONS_PER_CARD + 20; i++) {
      list = addAnnotation(list, { side: "front", start: i, end: i + 1, text }, i + 1);
    }
    expect(list.length).toBeLessThanOrEqual(MAX_ANNOTATIONS_PER_CARD);
  });

  it("متن به بازه‌های نشانه‌گذاری‌شده تقسیم می‌شود و ترتیب متن حفظ می‌شود", () => {
    const text = "پرفوراسیون آپاندیس";
    const list = [
      { id: "1", side: "front" as const, start: 0, end: 11, text: "پرفوراسیون", style: "highlight" as const, color: "yellow" as const, createdAt: 1 },
      { id: "2", side: "front" as const, start: 4, end: 11, text: "راسیون", style: "underline" as const, createdAt: 1 },
    ];
    const segs = textSegments(text, list);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    const overlap = segs.find((s) => s.start === 4)!;
    expect(overlap.marks.map((m) => m.style).sort()).toEqual(["highlight", "underline"]);
    expect(segs[0].marks).toHaveLength(1);
  });

  it("بازهٔ واژه را برای انتخاب سریع روی موبایل پیدا می‌کند", () => {
    const text = "دوز فوروزماید ۴۰";
    const span = wordSpanAt(text, 6)!;
    expect(text.slice(span.start, span.end)).toBe("فوروزماید");
    expect(wordSpanAt(text, 0)!.start).toBe(0);
    expect(wordSpanAt(text, 999)).toBeNull();
  });
});
