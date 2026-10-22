import { describe, expect, it } from "vitest";
import { jalaliToKey } from "../jalali";
import {
  OCCASION_CATEGORIES,
  OCCASIONS,
  healthOccasionsOn,
  occasionMatches,
  occasionsOn,
  upcomingOccasions,
} from "../occasions";

const names = (date: string) => occasionsOn(date).map((o) => o.name);

describe("فهرست مناسبت‌ها", () => {
  it("به‌اندازهٔ کافی مناسبت دارد و شناسه‌ها یکتا هستند", () => {
    expect(OCCASIONS.length).toBeGreaterThanOrEqual(80);
    expect(new Set(OCCASIONS.map((o) => o.id)).size).toBe(OCCASIONS.length);
    expect(OCCASIONS.every((o) => o.name.trim().length > 0 && o.emoji.length > 0)).toBe(true);
  });

  it("همهٔ دسته‌ها استفاده شده‌اند و برچسب دارند", () => {
    const used = new Set(OCCASIONS.map((o) => o.category));
    for (const c of OCCASION_CATEGORIES) {
      expect(used.has(c.id)).toBe(true);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("مناسبت‌های تاریخ ثابت میلادی درست پیدا می‌شوند", () => {
    expect(names("2026-02-04")).toContain("روز جهانی سرطان");
    expect(names("2026-04-07")).toContain("روز جهانی بهداشت");
    expect(names("2026-11-14")).toContain("روز جهانی دیابت");
    expect(names("2026-12-01")).toContain("روز جهانی ایدز");
    // همان روز در سال دیگر هم ثابت است
    expect(names("2027-11-14")).toContain("روز جهانی دیابت");
  });

  it("مناسبت‌های شمسی درست پیدا می‌شوند", () => {
    expect(names(jalaliToKey(1405, 2, 12))).toContain("روز معلم");
    expect(names(jalaliToKey(1405, 6, 1))).toContain("روز پزشک");
    expect(names(jalaliToKey(1405, 9, 30))).toContain("شب یلدا");
    expect(names(jalaliToKey(1406, 1, 1))).toContain("نوروز");
  });

  it("قاعدهٔ «n-امین روز هفته» و «آخرین روز ماه» درست کار می‌کند", () => {
    // دومین پنجشنبهٔ اکتبر ۲۰۲۶ = ۸ اکتبر
    expect(names("2026-10-08")).toContain("روز جهانی بینایی");
    expect(names("2026-10-01")).not.toContain("روز جهانی بینایی");
    // سومین چهارشنبهٔ نوامبر ۲۰۲۶ = ۱۸ نوامبر
    expect(names("2026-11-18")).toContain("روز جهانی COPD");
    // آخرین روز فوریه: ۲۰۲۶ (۲۸) و ۲۰۲۸ (۲۹)
    expect(names("2026-02-28")).toContain("روز جهانی بیماری‌های نادر");
    expect(names("2028-02-29")).toContain("روز جهانی بیماری‌های نادر");
    expect(names("2028-02-28")).not.toContain("روز جهانی بیماری‌های نادر");
  });

  it("مناسبت قمری با تاریخ متغیر پیدا می‌شود (عید فطر ۲۰۲۶)", () => {
    expect(names("2026-03-20")).toContain("عید فطر");
    expect(names("2025-03-30")).toContain("عید فطر");
    expect(names("2026-03-21")).not.toContain("عید فطر");
  });

  it("در یک روز، مناسبت تکراری نمایش داده نمی‌شود", () => {
    const list = occasionsOn("2026-10-08");
    expect(new Set(list.map((o) => o.name)).size).toBe(list.length);
  });

  it("فیلتر دسته و مناسبت‌های سلامت کار می‌کند", () => {
    const onlyHealth = occasionsOn("2026-11-14", ["health"]);
    expect(onlyHealth.every((o) => o.category === "health")).toBe(true);
    expect(healthOccasionsOn("2026-05-12").map((o) => o.name)).toContain("روز جهانی پرستاری");
  });

  it("پیش‌روها مرتب و بدون تاریخ تکراریِ نامنظم‌اند", () => {
    const list = upcomingOccasions("2026-10-01", 60);
    expect(list.length).toBeGreaterThan(5);
    const dates = list.map((x) => x.date);
    expect([...dates].sort()).toEqual(dates);
    expect(list.some((x) => x.occasion.name === "روز جهانی سلامت روان")).toBe(true);
    expect(list.some((x) => x.occasion.name === "روز جهانی دیابت")).toBe(true);
  });

  it("قاعدهٔ خالی/نامعتبر هیچ روزی را نمی‌گیرد", () => {
    const odd = { ...OCCASIONS[0], rule: { type: "jalali", month: 13, day: 1 } as never };
    expect(occasionMatches(odd, "2026-01-01")).toBe(false);
  });
});
