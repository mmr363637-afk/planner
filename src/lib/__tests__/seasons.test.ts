import { describe, expect, it } from "vitest";
import { seasonOf } from "../seasons";
import { jalaliMonthLength, jalaliToKey } from "../jalali";

describe("تم‌های فصلی", () => {
  it("نوروز: ۱ تا ۱۳ فروردین فعال است", () => {
    expect(seasonOf(jalaliToKey(1406, 1, 1))?.id).toBe("nowruz");
    expect(seasonOf(jalaliToKey(1406, 1, 13))?.id).toBe("nowruz");
    expect(seasonOf(jalaliToKey(1406, 1, 14))).toBeNull();
  });

  it("یلدا: ۳۰ آذر", () => {
    expect(seasonOf(jalaliToKey(1405, 9, 30))?.id).toBe("yalda");
    expect(seasonOf(jalaliToKey(1405, 9, 29))).toBeNull();
    // فردای یلدا، تم «اول زمستان» است نه هیچ
    expect(seasonOf(jalaliToKey(1405, 10, 1))?.id).toBe("winter");
  });

  it("چهارشنبه‌سوری: ۲۴ اسفند", () => {
    expect(seasonOf(jalaliToKey(1405, 12, 24))?.id).toBe("chaharshanbe");
    expect(seasonOf(jalaliToKey(1405, 12, 23))).toBeNull();
  });

  it("روزهای عادی تم فصلی ندارند", () => {
    expect(seasonOf(jalaliToKey(1405, 6, 31))).toBeNull();
    expect(seasonOf(jalaliToKey(1405, 2, 15))).toBeNull();
  });

  it("هر تم پیام، ایموجی و بنر مخصوص خودش را دارد", () => {
    const n = seasonOf(jalaliToKey(1406, 1, 5))!;
    expect(n.greeting.length).toBeGreaterThan(5);
    expect(n.emojis.length).toBeGreaterThan(0);
    expect(n.banner).toContain("gradient");
  });

  it("تم‌های مناسبتی شمسی فقط همان روز فعال‌اند", () => {
    expect(seasonOf(jalaliToKey(1405, 12, 5))?.id).toBe("teacher");
    expect(seasonOf(jalaliToKey(1405, 7, 16))?.id).toBe("mehregan"); // مهرگان
    expect(seasonOf(jalaliToKey(1405, 4, 1))?.id).toBe("summer");
    expect(seasonOf(jalaliToKey(1405, 7, 1))?.id).toBe("autumn");
    expect(seasonOf(jalaliToKey(1405, 10, 1))?.id).toBe("winter");
    expect(seasonOf(jalaliToKey(1405, 10, 2))).toBeNull();
  });

  it("تم‌های میلادی از تقویم میلادی خوانده می‌شوند", () => {
    expect(seasonOf("2026-11-20")?.id).toBe("children");
    expect(seasonOf("2026-12-25")?.id).toBe("christmas");
    expect(seasonOf("2026-12-31")?.id).toBe("gregorianNewYear");
    expect(seasonOf("2027-01-01")?.id).toBe("gregorianNewYear");
    expect(seasonOf("2027-02-14")?.id).toBe("valentine");
    expect(seasonOf("2026-10-31")?.id).toBe("halloween");
    expect(seasonOf("2026-11-21")).toBeNull();
  });

  it("روز برنامه‌نویس = روز ۲۵۶م سال میلادی", () => {
    expect(seasonOf("2026-09-13")?.id).toBe("programmer"); // 2026 non-leap
    expect(seasonOf("2028-09-12")?.id).toBe("programmer"); // 2028 leap
    expect(seasonOf("2026-09-14")).toBeNull();
  });

  it("در یک سال شمسی، فقط روزهای ویژه تم می‌گیرند (نه بیشتر، نه کمتر)", () => {
    const hits = new Map<string, string>();
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= jalaliMonthLength(1405, m); d++) {
        const s = seasonOf(jalaliToKey(1405, m, d));
        if (s) hits.set(`${m}/${d}`, s.id);
      }
    }
    // نوروز ۱/۱ تا ۱/۱۳ + یلدا + چهارشنبه‌سوری + معلم + مهرگان + ۳ اول فصل
    expect(hits.size).toBeGreaterThanOrEqual(20);
    expect(hits.get("1/1")).toBe("nowruz");
    expect(hits.get("1/13")).toBe("nowruz");
    expect(hits.get("9/30")).toBe("yalda");
    expect(hits.get("12/24")).toBe("chaharshanbe");
    expect(hits.get("7/16")).toBe("mehregan");
    expect(hits.get("4/1")).toBe("summer");
    // روزهای عادیِ وسط هر فصل بدون تم‌اند
    expect(hits.get("2/15")).toBeUndefined();
    expect(hits.get("6/31")).toBeUndefined();
  });
});
