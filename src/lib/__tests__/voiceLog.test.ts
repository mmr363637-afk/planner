import { describe, expect, it } from "vitest";
import { parseVoiceLog } from "../voiceLog";

describe("استخراج دقیقه از جمله‌ی صوتی", () => {
  it("اعداد فارسی + دقیقه", () => {
    const r = parseVoiceLog("۴۵ دقیقه قلب خوندم");
    expect(r.minutes).toBe(45);
    expect(r.rest).toContain("قلب");
  });

  it("ساعت انگلیسی", () => {
    expect(parseVoiceLog("2 ساعت ریاضی").minutes).toBe(120);
  });

  it("نیم ساعت", () => {
    expect(parseVoiceLog("نیم ساعت زیست").minutes).toBe(30);
  });

  it("یک ساعت و نیم", () => {
    expect(parseVoiceLog("یک ساعت و نیم فیزیک خوندم").minutes).toBe(90);
  });

  it("عدد حروفی + دقیقه", () => {
    expect(parseVoiceLog("چهل و پنج دقیقه شیمی").minutes).toBe(45);
    expect(parseVoiceLog("بیست دقیقه زبان").minutes).toBe(20);
  });

  it("بدون زمان، null", () => {
    expect(parseVoiceLog("قلب خوندم").minutes).toBeNull();
  });
});
