import { describe, expect, it } from "vitest";
import {
  TTS_CHUNK_LEN,
  defaultSpeechOptions,
  hasPersianVoice,
  isPersianVoice,
  listVoices,
  modeLabel,
  pickVoice,
  podcastScript,
  splitForSpeech,
  speechSupported,
  voiceGroupLabel,
} from "../tts";

const voices = [
  { uri: "en-1", name: "Google US English", lang: "en-US", isDefault: true, local: true, persian: false },
  { uri: "fa-google", name: "Google فارسی", lang: "fa-IR", isDefault: false, local: true, persian: true },
  { uri: "fa-custom", name: "My Offline Persian Engine", lang: "fa-IR", isDefault: false, local: true, persian: true },
];

describe("موتور گفتار", () => {
  it("صدای فارسی را از زبان و نام تشخیص می‌دهد", () => {
    expect(isPersianVoice({ lang: "fa-IR", name: "" })).toBe(true);
    expect(isPersianVoice({ lang: "fa", name: "" })).toBe(true);
    expect(isPersianVoice({ lang: "en-US", name: "Persian Voice" })).toBe(true);
    expect(isPersianVoice({ lang: "ar-SA", name: "Arabic" })).toBe(false);
    expect(hasPersianVoice(voices)).toBe(true);
    expect(hasPersianVoice(voices.filter((v) => !v.persian))).toBe(false);
  });

  it("اولویت انتخاب صدا: انتخاب کاربر، بعد صدای فارسیِ موجود", () => {
    expect(pickVoice(voices, "fa-custom")?.uri).toBe("fa-custom");
    expect(pickVoice(voices)?.uri).toBe("fa-google");
    // انتخابِ ذخیره‌شدهٔ ناموجود (صدا از گوشی پاک شده) باعث خطا نمی‌شود
    expect(pickVoice(voices, "deleted")?.persian).toBe(true);
    expect(pickVoice(voices.filter((v) => !v.persian))).toBeNull();
  });

  it("گروه‌بندی نمایشی موتور صدا", () => {
    expect(voiceGroupLabel(voices[0])).toBe("Google");
    expect(voiceGroupLabel({ ...voices[2], name: "eSpeak Persian" })).toBe("eSpeak");
    expect(voiceGroupLabel({ ...voices[2], name: "صدای فارسی" })).toBe("FA-IR");
  });

  it("در محیط بدون Web Speech بی‌خطا خالی برمی‌گرداند", () => {
    // jsdom این API را ندارد؛ پس نباید throw کند
    expect(() => listVoices()).not.toThrow();
    expect(Array.isArray(listVoices())).toBe(true);
    expect(typeof speechSupported()).toBe("boolean");
  });

  it("متنِ بلند به تکه‌های کوتاه و کامل شکسته می‌شود (بدون گم‌شدن نویسه)", () => {
    const sentence = "بیمار با تنگی نفس و تب مراجعه کرد. ";
    const text = sentence.repeat(20).trim();
    const chunks = splitForSpeech(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= TTS_CHUNK_LEN)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
    expect(splitForSpeech("   ")).toEqual([]);
    expect(splitForSpeech("یک جملهٔ کوتاه.")).toEqual(["یک جملهٔ کوتاه."]);
  });

  it("تنظیماتِ صوتی سالم‌سازی می‌شوند (سرعت/تکرار/مکث)", () => {
    const o = defaultSpeechOptions({ rate: 9, repeat: 99, answerPauseSec: -5, mode: "podcast" });
    expect(o.rate).toBe(2);
    expect(o.repeat).toBe(3);
    expect(o.answerPauseSec).toBe(0);
    expect(o.mode).toBe("podcast");
    expect(o.autoNext).toBe(true);
    const remote = defaultSpeechOptions({ engine: "remote", remoteUrl: " http://127.0.0.1:8080/tts " });
    expect(remote.remote?.url).toBe("http://127.0.0.1:8080/tts");
    expect(defaultSpeechOptions({ engine: "remote" }).remote).toBeUndefined();
    expect(defaultSpeechOptions({ mode: "nonsense" as never }).mode).toBe("qa");
  });

  it("متن پادکست در حالت podcast مقدمه و شماره دارد ولی در حالت qa متن خام است", () => {
    const item = { id: "c1", title: "آسم", question: "درمان آسم حاد چیست؟", answer: "سالبوتامول" };
    const pod = podcastScript(item, 1, 5, "podcast");
    expect(pod.question).toContain("۲ از ۵");
    expect(pod.answer).toContain("سالبوتامول");
    const qa = podcastScript(item, 1, 5, "qa");
    expect(qa.question).toBe("درمان آسم حاد چیست؟");
    expect(modeLabel("qa")).toContain("پرسش");
  });
});
