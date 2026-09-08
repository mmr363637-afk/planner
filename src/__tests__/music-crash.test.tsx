// @vitest-environment jsdom
/**
 * رگرسیونِ «کرش با بخش موسیقی زنده»
 *
 * مشکل: رویدادهای پدِ موتورِ لوفای برای نتِ ریشه بهره‌ی صفر می‌ساختند و
 * exponentialRampToValueAtTime با مقدار صفر در مرورگرهای منطبق بر استاندارد
 * استثنا پرتاب می‌کند. چون این استثنا از دلِ افکت/رویدادهای رابط کاربری و تایمرِ
 * زمان‌بند بیرون می‌زد، پخش شکست می‌خورد و زمان‌بند هر ۱۸۰ میلی‌ثانیه خطای
 * مهارنشده می‌ساخت — در عمل اپ قفل/کرش می‌کرد.
 *
 * این تست همان جریان کاربری را با یک ماکِ سخت‌گیر از Web Audio اجرا می‌کند
 * (پرتاب خطا روی پاکتِ نمایی با بهره‌ی صفر/منفی و خطای قبلیِ صفر).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";

/* ---------------- ماکِ سخت‌گیرِ Web Audio ---------------- */

class StrictParam {
  value: number;
  private lastEventValue: number | null = null;
  constructor(def = 0) {
    this.value = def;
  }
  private assertFinite(v: number, t: number, name: string) {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new TypeError(`${name}: non-finite argument`);
  }
  setValueAtTime(v: number, t: number) {
    this.assertFinite(v, t, "setValueAtTime");
    this.lastEventValue = v;
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.assertFinite(v, t, "linearRampToValueAtTime");
    this.lastEventValue = v;
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.assertFinite(v, t, "exponentialRampToValueAtTime");
    const prev = this.lastEventValue ?? this.value;
    if (v <= 0) throw new DOMException("exponential ramp target <= 0", "NotSupportedError");
    if (prev <= 0) throw new DOMException("exponential ramp after non-positive value", "NotSupportedError");
    this.lastEventValue = v;
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    if (!Number.isFinite(v) || !Number.isFinite(t) || !Number.isFinite(tc) || tc <= 0) {
      throw new TypeError("setTargetAtTime: bad argument");
    }
    this.lastEventValue = v;
    this.value = v;
    return this;
  }
  cancelScheduledValues(_t: number) {
    return this;
  }
}

class StrictNode {
  connect(dest: StrictNode) {
    if (!dest) throw new TypeError("connect(null)");
    return dest;
  }
  disconnect() {
    /* noop */
  }
}

class StrictGain extends StrictNode {
  gain = new StrictParam(1);
}
class StrictBiquad extends StrictNode {
  type = "lowpass";
  frequency = new StrictParam(350);
  Q = new StrictParam(1);
  gain = new StrictParam(0);
}
class StrictDelay extends StrictNode {
  delayTime = new StrictParam(0);
}
class StrictStereoPanner extends StrictNode {
  pan = new StrictParam(0);
}
class StrictCompressor extends StrictNode {
  threshold = new StrictParam(-24);
  knee = new StrictParam(30);
  ratio = new StrictParam(12);
  attack = new StrictParam(0.003);
  release = new StrictParam(0.25);
}
class StrictWaveShaper extends StrictNode {
  private _curve: Float32Array | null = null;
  oversample = "none";
  set curve(c: Float32Array | null) {
    if (c && c.length < 2) throw new DOMException("curve must have >= 2 samples", "NotSupportedError");
    this._curve = c;
  }
  get curve() {
    return this._curve;
  }
}
class StrictOscillator extends StrictNode {
  type = "sine";
  frequency = new StrictParam(440);
  detune = new StrictParam(0);
  private started = false;
  private stopped = false;
  start() {
    if (this.started) throw new DOMException("already started", "InvalidStateError");
    this.started = true;
  }
  stop() {
    if (!this.started) throw new DOMException("stop before start", "InvalidStateError");
    if (this.stopped) throw new DOMException("already stopped", "InvalidStateError");
    this.stopped = true;
  }
}
class StrictBuffer {
  duration: number;
  private channels: Float32Array[];
  constructor(channelsN: number, length: number, public sampleRate: number) {
    if (length <= 0) throw new RangeError("bad buffer length");
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: channelsN }, () => new Float32Array(length));
  }
  get length() {
    return this.channels[0].length;
  }
  getChannelData(ch: number) {
    if (ch < 0 || ch >= this.channels.length) throw new DOMException("bad channel", "IndexSizeError");
    return this.channels[ch];
  }
}
class StrictBufferSource extends StrictNode {
  buffer: StrictBuffer | null = null;
  loop = false;
  playbackRate = new StrictParam(1);
  private started = false;
  private stopped = false;
  onended: (() => void) | null = null;
  start(_when?: number, offset?: number) {
    if (this.started) throw new DOMException("already started", "InvalidStateError");
    this.started = true;
    if (this.buffer && offset !== undefined && (offset < 0 || offset > this.buffer.duration)) {
      throw new DOMException(`offset out of range [0, ${this.buffer.duration}]`, "IndexSizeError");
    }
  }
  stop() {
    if (!this.started) throw new DOMException("stop before start", "InvalidStateError");
    if (this.stopped) throw new DOMException("already stopped", "InvalidStateError");
    this.stopped = true;
  }
}
class StrictDestination extends StrictNode {}

let simulatedNow = 0;

class StrictAudioContext {
  state = "suspended";
  get currentTime() {
    return simulatedNow;
  }
  sampleRate = 48000;
  destination = new StrictDestination();
  static instances: StrictAudioContext[] = [];
  constructor() {
    StrictAudioContext.instances.push(this);
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
  createGain() {
    return new StrictGain();
  }
  createBiquadFilter() {
    return new StrictBiquad();
  }
  createDelay(maxDelay = 1) {
    if (!(maxDelay > 0 && maxDelay <= 180)) throw new DOMException("bad maxDelay", "NotSupportedError");
    return new StrictDelay();
  }
  createStereoPanner() {
    return new StrictStereoPanner();
  }
  createDynamicsCompressor() {
    return new StrictCompressor();
  }
  createWaveShaper() {
    return new StrictWaveShaper();
  }
  createOscillator() {
    return new StrictOscillator();
  }
  createBufferSource() {
    return new StrictBufferSource();
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return new StrictBuffer(channels, length, sampleRate);
  }
}

function installAudio() {
  simulatedNow = 0;
  StrictAudioContext.instances = [];
  // @ts-expect-error injecting test double
  globalThis.AudioContext = StrictAudioContext;
}

function seedTopic() {
  localStorage.setItem(
    "study-planner-v1",
    JSON.stringify({
      subjects: [{ id: "s1", name: "فیزیولوژی", color: "#0ea5a4", priority: "high", createdAt: 1 }],
      topics: [{ id: "t1", subjectId: "s1", name: "قلب", volume: 10, estimatedMinutes: 45, priority: "high", difficulty: 2, status: "not_started", createdAt: 1 }],
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  seedTopic();
  installAudio();
});

afterEach(() => {
  cleanup();
  delete (globalThis as Record<string, unknown>).AudioContext;
});

describe("کرشِ بخش موسیقی زنده (رگرسیون)", () => {
  it("روشن‌کردن لایه‌ی موسیقی و پخش، اپ را بالا نگه می‌دارد و پخش واقعاً شروع می‌شود", async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("صداهای تمرکز"));

    // لایه‌ی «موسیقی زنده» را روشن کن (به‌طور پیش‌فرض خاموش است)
    fireEvent.click(screen.getByTitle("روشن کردن موسیقی زنده"));

    // شروع پخش — اگر پاکتِ نامعتبر ساخته شود، این‌جا پخش شکست می‌خورد/استثنا می‌دهد
    fireEvent.click(screen.getByRole("button", { name: /شروع پخش/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /توقف/ }).length).toBeGreaterThan(0), { timeout: 2000 });

    // چند تیکِ زمان‌بندِ موسیقی (هر ۱۸۰ میلی‌ثانیه) با پیش‌روی زمانِ صوتی
    for (let i = 0; i < 12; i++) {
      simulatedNow += 0.25;
      await new Promise((r) => setTimeout(r, 30));
    }

    // اپ هنوز زنده است، در حال پخش است و خطایی به بیرون نشت نکرده
    expect(screen.getAllByRole("button", { name: /توقف/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("🎧 صداهای تمرکز")).toBeTruthy();
  }, 20000);

  it("تغییر حجمِ لایه‌ی موسیقی حین پخش بی‌خطر است", async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("صداهای تمرکز"));
    fireEvent.click(screen.getByTitle("روشن کردن موسیقی زنده"));
    fireEvent.click(screen.getByRole("button", { name: /شروع پخش/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /توقف/ }).length).toBeGreaterThan(0), { timeout: 2000 });

    // کشیدن اسلایدرِ موسیقی — همین مسیر از دلِ افکتِ ری‌اکت می‌گذرد و قبلاً می‌توانست کرش‌زا باشد
    fireEvent.change(screen.getByLabelText("حجم موسیقی زنده"), { target: { value: "80" } });
    simulatedNow += 0.3;
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.change(screen.getByLabelText("حجم موسیقی زنده"), { target: { value: "0" } });
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getAllByRole("button", { name: /توقف/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("🎧 صداهای تمرکز")).toBeTruthy();
  }, 20000);
});
