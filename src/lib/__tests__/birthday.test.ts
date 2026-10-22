import { describe, expect, it } from "vitest";
import { jalaliToKey } from "../jalali";
import { birthdayMessage, checkBirthday, isValidBirthday, safeDatePart } from "../birthday";

describe("تبریک تولد", () => {
  it("ماه/روز معتبر را می‌پذیرد و ۳۱ را رد می‌کند", () => {
    expect(isValidBirthday(2, 12)).toBe(true);
    expect(isValidBirthday(12, 30)).toBe(true);
    expect(isValidBirthday(7, 31)).toBe(false);
    expect(isValidBirthday(13, 1)).toBe(false);
    expect(isValidBirthday(0, 1)).toBe(false);
  });

  it("در روز تولد یک‌بار تبریک می‌دهد و بعد از ثبت، تکرار نمی‌کند", () => {
    const today = jalaliToKey(1405, 2, 12);
    const first = checkBirthday({ month: 2, day: 12, year: 1379 }, today)!;
    expect(first.isBirthday).toBe(true);
    expect(first.shouldGreet).toBe(true);
    expect(first.age).toBe(26);
    expect(first.message).toContain("۲۶".replace("۲۶", "26"));
    const second = checkBirthday({ month: 2, day: 12, year: 1379 }, today, today)!;
    expect(second.alreadyGreeted).toBe(true);
    expect(second.shouldGreet).toBe(false);
  });

  it("روزهای دیگر تبریک نمی‌دهد", () => {
    const other = jalaliToKey(1405, 2, 13);
    const check = checkBirthday({ month: 2, day: 12 }, other)!;
    expect(check.isBirthday).toBe(false);
    expect(check.shouldGreet).toBe(false);
  });

  it("سالِ بعد دوباره تبریک می‌دهد", () => {
    const today = jalaliToKey(1406, 2, 12);
    const check = checkBirthday({ month: 2, day: 12 }, today, jalaliToKey(1405, 2, 12))!;
    expect(check.shouldGreet).toBe(true);
  });

  it("بدون تاریخ تولد یا با دادهٔ خراب null می‌دهد", () => {
    expect(checkBirthday(undefined, "2026-01-01")).toBeNull();
    expect(checkBirthday({ month: 12, day: 31 }, "2026-01-01")).toBeNull();
  });

  it("۳۰ اسفند در سال غیرکبیسه به ۲۹ اسفند برمی‌گردد", () => {
    // ۱۴۰۴ کبیسه نیست؛ ۲۹ اسفند ۱۴۰۴ = 2026-03-20
    const today = jalaliToKey(1404, 12, 29);
    const check = checkBirthday({ month: 12, day: 30 }, today)!;
    expect(check.isBirthday).toBe(true);
  });

  it("پیام بدون سال هم ساخته می‌شود", () => {
    expect(birthdayMessage(null).length).toBeGreaterThan(10);
    expect(birthdayMessage(30)).toContain("30");
  });

  it("تجزیهٔ تاریخ خراب کرش نمی‌کند", () => {
    expect(safeDatePart("not-a-date")).toBeNull();
    expect(safeDatePart("2026-01-01")).toEqual({ month: 10, day: 11 });
  });
});
