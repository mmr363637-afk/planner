// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { FEATURE_LABELS, readUsage, resetUsage, trackFeature, usageReport } from "../usage";

describe("گزارش استفاده‌ی محلی", () => {
  beforeEach(() => {
    localStorage.clear();
    resetUsage();
  });

  it("شمارش افزایشی و ثبت زمان", () => {
    trackFeature("card_review");
    trackFeature("card_review");
    trackFeature("session_start");
    const u = readUsage();
    expect(u.card_review.count).toBe(2);
    expect(u.session_start.count).toBe(1);
    expect(u.card_review.lastAt).toBeGreaterThan(0);
  });

  it("گزارش مرتب بر اساس پراستفاده‌ترین و با برچسب فارسی", () => {
    trackFeature("ambient_mix");
    trackFeature("card_review");
    trackFeature("card_review");
    trackFeature("card_review");
    const report = usageReport();
    expect(report[0].key).toBe("card_review");
    expect(report[0].label).toBe(FEATURE_LABELS.card_review);
    expect(report[0].count).toBe(3);
  });

  it("داده‌ی خراب در localStorage اپ را نمی‌شکند", () => {
    localStorage.setItem("sp_usage_v1", "{نه json}");
    expect(readUsage()).toEqual({});
    trackFeature("palette");
    expect(readUsage().palette.count).toBe(1);
  });

  it("reset پاک می‌کند", () => {
    trackFeature("palette");
    resetUsage();
    expect(readUsage()).toEqual({});
  });

  it("هر کلید استفاده‌شده در store/کامپوننت‌ها برچسب دارد (نگهبانِ فراموشی)", () => {
    const keysUsedInCode = [
      "session_start", "session_end", "card_review", "review_done", "mistake_add",
      "mistake_review", "capsule", "manual_log", "test_log", "smart_plan",
      "ambient_mix", "study_room", "focus_mode", "ocr_import", "auto_card",
      "ai_card", "ai_tutor", "ai_report", "voice_log", "exam_sim",
      "ghost_share", "ghost_import", "anki_export", "calendar_sync", "palette",
    ];
    for (const k of keysUsedInCode) expect(FEATURE_LABELS[k], `برچسبِ ${k} جا افتاده`).toBeTruthy();
  });
});
