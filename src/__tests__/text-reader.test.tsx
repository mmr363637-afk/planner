// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TextReader from "../components/TextReader";

/**
 * متن‌خوان هوشمند — Web Speech API آفلاین.
 * دو چیز اینجا قفل می‌شود:
 *  ۱) اگر مرورگر گفتار نداشت، فقط پیام داده می‌شود (کرش نمی‌کند — تشخیص باید همگام باشد).
 *  ۲) اگر گفتار بود، متن جمله‌جمله و با زبان درست خوانده می‌شود.
 */

type FakeUtterance = {
  text: string;
  lang: string;
  rate: number;
  pitch: number;
  voice: unknown;
  onend?: () => void;
  onerror?: () => void;
};

const saved = () => {
  const synth = window.speechSynthesis;
  const Ctor = window.SpeechSynthesisUtterance;
  return () => {
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Ctor, configurable: true });
  };
};

const stubSpeech = (spoken: FakeUtterance[]) => {
  class Utterance implements FakeUtterance {
    lang = "";
    rate = 1;
    pitch = 1;
    voice: unknown = null;
    onend?: () => void;
    onerror?: () => void;
    constructor(public text: string) {}
  }
  const synth = {
    getVoices: () => [{ voiceURI: "fa-voice", name: "فارسی", lang: "fa-IR" } as unknown as SpeechSynthesisVoice],
    addEventListener: () => {},
    removeEventListener: () => {},
    cancel: () => {},
    // هم‌زمان صدا می‌زند تا جمله‌ی بعدی همان لحظه خوانده شود
    speak: (u: FakeUtterance) => {
      spoken.push(u);
      u.onend?.();
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
};

let restore: () => void;
beforeEach(() => {
  restore = saved();
});
afterEach(() => {
  cleanup(); // اول unmount تا effect cleanup با گفتارِ واقعیِ mock‌شده کار کند
  restore();
  vi.useRealTimers();
});

describe("🔊 متن‌خوان هوشمند", () => {
  it("متن را جمله‌جمله با زبان فارسی می‌خواند", () => {
    const spoken: FakeUtterance[] = [];
    stubSpeech(spoken);

    render(<TextReader initialText="قلب عضله‌ای پمپاژ است. برون‌داد قلب = ضربان × حجم ضربه‌ای." />);

    fireEvent.click(screen.getByRole("button", { name: /خواندن/ }));

    expect(spoken.map((u) => u.text)).toEqual([
      "قلب عضله‌ای پمپاژ است.",
      "برون‌داد قلب = ضربان × حجم ضربه‌ای.",
    ]);
    spoken.forEach((u) => {
      expect(u.lang).toBe("fa-IR");
      expect(u.rate).toBe(1);
      expect(u.pitch).toBe(1);
      expect(u.voice).not.toBeNull(); // صدای فارسیِ همان لیست انتخاب شد
    });
  });

  it("بدون Web Speech فقط هشدار می‌دهد و نمی‌کشد", () => {
    Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: undefined, configurable: true });

    render(<TextReader initialText="متن آزمایشی" />);

    expect(screen.getByText(/از «متن‌خوان» پشتیبانی نمی‌کند/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /خواندن/ })).toBeNull();
  });
});
