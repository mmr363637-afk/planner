import { describe, expect, it } from "vitest";
import { FLOWER_SPOTS, GARDEN_STAGES, gardenFlowers, gardenProgress } from "../garden";

describe("باغ مطالعه", () => {
  it("مرحله دقیقاً از آستانه‌ی fromMinutes شروع می‌شود", () => {
    expect(gardenProgress(0).stage.level).toBe(0);
    expect(gardenProgress(0).overall).toBe(0);
    expect(gardenProgress(59).stage.level).toBe(0);
    expect(gardenProgress(GARDEN_STAGES[1].fromMinutes).stage.level).toBe(1); // ۶۰ دقیقه
    expect(gardenProgress(300).stage.level).toBe(2);
    expect(gardenProgress(30_000).stage.level).toBe(6);
    expect(gardenProgress(999_999).stage.level).toBe(6); // بالاتر از آخرین مرحله نمی‌رود
    expect(gardenProgress(-50).stage.level).toBe(0); // عدد منفی خاک می‌شود
  });

  it("پیشرفتِ داخل مرحله و نسبتِ کلی بین صفر و یک می‌ماند", () => {
    for (const min of [0, 30, 89.9, 150, 420, 1200, 5999, 12_000, 29_999, 30_000, 50_000]) {
      const p = gardenProgress(min);
      expect(p.overall).toBeGreaterThanOrEqual(0);
      expect(p.overall).toBeLessThanOrEqual(1);
      expect(p.inStage).toBeGreaterThanOrEqual(0);
      expect(p.inStage).toBeLessThanOrEqual(1);
    }
    // مرحله‌ی آخر همیشه «کامل» است
    expect(gardenProgress(50_000).inStage).toBe(1);
    // کسرِ واقعیِ درون مرحله
    expect(gardenProgress(180).stage.level).toBe(1); // 60..300
    expect(gardenProgress(180).inStage).toBeCloseTo(0.5);
  });

  it("آستانه‌های مراحل صعودی‌اند و برچسب و نماد دارند", () => {
    expect(GARDEN_STAGES[0].fromMinutes).toBe(0);
    expect(GARDEN_STAGES[GARDEN_STAGES.length - 1].toMinutes).toBeNull();
    for (let i = 1; i < GARDEN_STAGES.length; i++) {
      expect(GARDEN_STAGES[i].fromMinutes).toBeGreaterThan(GARDEN_STAGES[i - 1].fromMinutes);
    }
    for (const s of GARDEN_STAGES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });

  it("گل‌های باغ از مباحثِ تسلط‌یافته می‌آیند و به سقفِ جای گل‌ها می‌رسند", () => {
    expect(gardenFlowers(0)).toBe(0);
    expect(gardenFlowers(1)).toBe(1);
    expect(gardenFlowers(14)).toBe(14);
    expect(gardenFlowers(1000)).toBe(FLOWER_SPOTS.length); // اشباع
    expect(gardenFlowers(-3)).toBe(0);
    expect(FLOWER_SPOTS).toHaveLength(14);
    for (const spot of FLOWER_SPOTS) {
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(100);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.y).toBeLessThan(100);
    }
  });
});
