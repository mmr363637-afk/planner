import { describe, expect, it } from "vitest";
import { THEME_FAMILIES, THEME_PACKS, DEFAULT_THEME_FAMILY, isThemeFamilyId, matchedThemeFamily, themeFamily } from "../themePacks";

describe("خانوادهٔ تمِ یکپارچه", () => {
  it("هر خانواده به یک تم پس‌زمینهٔ واقعی وصل است", () => {
    const packIds = new Set(THEME_PACKS.map((p) => p.id));
    for (const family of THEME_FAMILIES) {
      expect(packIds.has(family.pack)).toBe(true);
      expect(family.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(family.label.length).toBeGreaterThan(1);
    }
    expect(new Set(THEME_FAMILIES.map((f) => f.id)).size).toBe(THEME_FAMILIES.length);
  });

  it("تم پیش‌فرض سرمه‌ای است و خواسته‌های کاربر (سبز/آسمانی/اقیانوسی/بنفش/نارنجی/قرمز/OLED) را دارد", () => {
    expect(DEFAULT_THEME_FAMILY).toBe("navy");
    const ids = THEME_FAMILIES.map((f) => f.id);
    for (const id of ["navy", "green", "sky", "ocean", "purple", "teal", "orange", "red", "oled"]) {
      expect(ids).toContain(id);
    }
  });

  it("انتخاب تم، هم پالت و هم رنگ برنامه را با هم ست می‌کند", () => {
    const green = themeFamily("green");
    expect(green.pack).toBe("forest");
    expect(green.accent).toBe("#16a34a");
    expect(matchedThemeFamily(green.pack, green.accent)?.id).toBe("green");
    // مقدار ناشناخته/قدیمی ⇒ خانوادهٔ پیش‌فرض، نه crash
    expect(themeFamily("unknown")).toBe(themeFamily("navy"));
    expect(isThemeFamilyId("navy")).toBe(true);
    expect(isThemeFamilyId("nope")).toBe(false);
    // اگر فقط پالت ست شده باشد، همان خانواده به‌عنوان پیشنهاد برمی‌گردد
    expect(matchedThemeFamily("sky", "#000000")?.pack).toBe("sky");
  });
});
