import { describe, expect, it } from "vitest";
import { seasonOf } from "../seasons";
import { jalaliToKey } from "../jalali";

describe("تم‌های فصلی", () => {
  it("نوروز: ۱ تا ۱۳ فروردین فعال است", () => {
    expect(seasonOf(jalaliToKey(1406, 1, 1))?.id).toBe("nowruz");
    expect(seasonOf(jalaliToKey(1406, 1, 13))?.id).toBe("nowruz");
    expect(seasonOf(jalaliToKey(1406, 1, 14))).toBeNull();
  });

  it("یلدا: ۳۰ آذر", () => {
    expect(seasonOf(jalaliToKey(1405, 9, 30))?.id).toBe("yalda");
    expect(seasonOf(jalaliToKey(1405, 9, 29))).toBeNull();
    expect(seasonOf(jalaliToKey(1405, 10, 1))).toBeNull();
  });

  it("چهارشنبه‌سوری: ۲۴ اسفند", () => {
    expect(seasonOf(jalaliToKey(1405, 12, 24))?.id).toBe("chaharshanbe");
    expect(seasonOf(jalaliToKey(1405, 12, 23))).toBeNull();
  });

  it("روزهای عادی تم فصلی ندارند", () => {
    expect(seasonOf(jalaliToKey(1405, 6, 31))).toBeNull();
  });

  it("هر تم پیام و ذره‌ی مخصوص خودش را دارد", () => {
    const n = seasonOf(jalaliToKey(1406, 1, 5))!;
    expect(n.greeting.length).toBeGreaterThan(5);
    expect(n.particle).toMatch(/petal|ember/);
  });
});
