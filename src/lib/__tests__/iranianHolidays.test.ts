import { describe, expect, it } from "vitest";
import { formatJalaliLong, jalaliToKey, weekdayOf } from "../jalali";
import { iranianHolidayLabel, iranianHolidaysOn, isIranianHoliday } from "../iranianHolidays";

describe("تقویم تعطیلات ایران", () => {
  it("روز و تاریخ شمسیِ نوروز را با هفته‌ی شنبه‌شروع درست نگه می‌دارد", () => {
    const nowruz = jalaliToKey(1405, 1, 1);
    expect(nowruz).toBe("2026-03-21");
    expect(weekdayOf(nowruz)).toBe(6);
    expect(formatJalaliLong(nowruz)).toContain("شنبه");
    expect(iranianHolidaysOn(nowruz).map((holiday) => holiday.name)).toEqual(expect.arrayContaining(["نوروز", "عید فطر"]));
  });

  it("جمعه را تعطیل هفتگی می‌شناسد و نام را برای تقویم برمی‌گرداند", () => {
    const friday = jalaliToKey(1405, 7, 3);
    expect(weekdayOf(friday)).toBe(5);
    expect(isIranianHoliday(friday)).toBe(true);
    expect(iranianHolidayLabel(friday)).toContain("تعطیلی هفتگی جمعه");
  });

  it("شهادت حضرت فاطمه را در ۳ آذر ۱۴۰۴ روی تاریخ شمسی درست می‌شناسد", () => {
    const date = jalaliToKey(1404, 9, 3);
    expect(iranianHolidayLabel(date)).toContain("شهادت حضرت فاطمه زهرا (س)");
  });

  it("تعطیلی‌های رسمی ثابت و قمریِ جدول سالانه را ترکیب می‌کند", () => {
    const ghadirAndKhomeiniDay = jalaliToKey(1405, 3, 14);
    expect(iranianHolidaysOn(ghadirAndKhomeiniDay).map((holiday) => holiday.name)).toEqual(
      expect.arrayContaining(["رحلت امام خمینی (ره)", "عید غدیر خم"]),
    );
  });

  it("در روز عادی تعطیلی ساختگی نشان نمی‌دهد", () => {
    const ordinaryDay = jalaliToKey(1405, 7, 6);
    expect(iranianHolidaysOn(ordinaryDay)).toEqual([]);
    expect(iranianHolidayLabel(ordinaryDay)).toBeNull();
  });
});
