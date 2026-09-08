import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerativeLofiEngine, MIN_ENV_GAIN, MUSIC_BAR, MUSIC_BEAT, MUSIC_PROGRESSIONS, MUSIC_SCALE, barEvents, midiToFreq, safeEnvelopeGain } from "../music";
import { mulberry32 } from "../random";

class MockParam {
  value = 0;
  private lastEventValue: number | null = null;
  setValueAtTime(value: number) {
    this.lastEventValue = value;
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number) {
    this.lastEventValue = value;
    this.value = value;
    return this;
  }
  /**
   * مطابق رفتارِ مرورگرهای منطبق بر استاندارد (و متنِ صریحِ مشخصه‌ی Web Audio):
   * بهره‌ی صفر یا منفی در پاکتِ نمایی خطا می‌دهد. با این رفتار، تست‌ها هر رویدادی
   * را که پاکتِ نامعتبر بسازد همان لحظه لو می‌دهند.
   */
  exponentialRampToValueAtTime(value: number) {
    const prev = this.lastEventValue ?? this.value;
    if (value <= 0) throw new DOMException("exponential ramp target <= 0", "NotSupportedError");
    if (prev <= 0) throw new DOMException("exponential ramp after non-positive value", "NotSupportedError");
    this.lastEventValue = value;
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number) {
    this.lastEventValue = value;
    this.value = value;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class MockNode {
  connect(node: MockNode) {
    return node;
  }
  disconnect() {
    /* noop */
  }
}

class MockGain extends MockNode {
  gain = new MockParam();
}
class MockBiquad extends MockNode {
  type = "lowpass";
  frequency = new MockParam();
  Q = new MockParam();
}
class MockDelay extends MockNode {
  delayTime = new MockParam();
}
class MockOscillator extends MockNode {
  type = "sine";
  frequency = new MockParam();
  detune = new MockParam();
  started = 0;
  stopped = 0;
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
}
class MockBufferSource extends MockNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = new MockParam();
  started = 0;
  start() {
    this.started++;
  }
  stop() {
    /* noop */
  }
}

class MockAudioContext {
  get currentTime(): number {
    return (Date.now() - this.epoch) / 1000;
  }
  readonly epoch = Date.now();
  sampleRate = 44100;
  destination = new MockNode();
  sources: MockBufferSource[] = [];
  oscillators: MockOscillator[] = [];
  gains: MockGain[] = [];
  delays = 0;
  buffers = 0;
  createGain() {
    const n = new MockGain();
    this.gains.push(n);
    return n;
  }
  createBiquadFilter() {
    return new MockBiquad();
  }
  createOscillator() {
    const n = new MockOscillator();
    this.oscillators.push(n);
    return n;
  }
  createBufferSource() {
    const n = new MockBufferSource();
    this.sources.push(n);
    return n;
  }
  createDelay() {
    this.delays++;
    return new MockDelay();
  }
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    this.buffers++;
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      duration: length / sampleRate,
      sampleRate,
      length,
      numberOfChannels: channels,
      getChannelData: (channel: number) => data[channel],
    } as unknown as AudioBuffer;
  }
}

const whiteBuffer = (ctx: MockAudioContext, duration = 12): AudioBuffer => ctx.createBuffer(2, ctx.sampleRate * duration, ctx.sampleRate);

afterEach(() => vi.useRealTimers());

describe("نمادهای موزیک لوفای", () => {
  it("midiToFreq مطابق A4=440 است و اکتاو می‌سازد", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(57)).toBeCloseTo(220);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });

  it("پروگرشن‌ها خوش‌دست‌اند: ۴ آکورد، باس در نتِ اول، و لحنِ مینورِ گرم", () => {
    expect(MUSIC_PROGRESSIONS.length).toBeGreaterThanOrEqual(3);
    for (const prog of MUSIC_PROGRESSIONS) {
      expect(prog).toHaveLength(4);
      for (const chord of prog) {
        expect(chord.length).toBeGreaterThanOrEqual(4);
        expect(chord[0]).toBeLessThanOrEqual(chord[1]); // باس پایین‌ترین نت است
      }
    }
    // گامِ ملودی پنتاتونیکِ مینور است و در محدوده‌ی گرم می‌ماند
    expect(MUSIC_SCALE[0]).toBe(57);
    expect(MUSIC_SCALE.length).toBeGreaterThanOrEqual(7);
  });

  it("barEvents با RNG ثابت قطعی است و در میزانِ زوج پد می‌سازد، در میزانِ فرد نه", () => {
    const rng = mulberry32(42);
    const even = barEvents(MUSIC_PROGRESSIONS[0], 0, rng);
    const pads = even.filter((e) => e.kind === "pad");
    expect(pads).toHaveLength(MUSIC_PROGRESSIONS[0][0].length * 2); // هر نتِ آکورد × ۲ دیتیون
    expect(even.some((e) => e.kind === "bass")).toBe(true);
    expect(even.some((e) => e.kind === "crackle")).toBe(true);
    expect(even.filter((e) => e.kind === "pluck").length).toBeLessThanOrEqual(4);
    // مرتب‌شده بر اساس زمانِ نسبی
    for (let i = 1; i < even.length; i++) expect(even[i].at).toBeGreaterThanOrEqual(even[i - 1].at);

    const odd = barEvents(MUSIC_PROGRESSIONS[0], 1, mulberry32(42));
    expect(odd.some((e) => e.kind === "pad")).toBe(false);
    expect(odd.some((e) => e.kind === "bass")).toBe(false);

    // با دو RNG هم‌بذر، خروجی کاملاً یکسان است (قابل تست/بازتولید)
    expect(barEvents(MUSIC_PROGRESSIONS[1], 6, mulberry32(7))).toEqual(barEvents(MUSIC_PROGRESSIONS[1], 6, mulberry32(7)));
  });

  it("pad طول دو میزان (نفسِ هارمونی) و pluck کوتاه است", () => {
    const events = barEvents(MUSIC_PROGRESSIONS[2], 4, mulberry32(1));
    const pad = events.find((e) => e.kind === "bass")!;
    expect(pad.dur).toBeCloseTo(MUSIC_BAR * 1.8);
    const actualPad = events.find((e) => e.kind === "pad")!;
    expect(actualPad.dur).toBeCloseTo(MUSIC_BAR * 2);
  });
});

describe("GenerativeLofiEngine", () => {
  beforeEach(() => vi.useFakeTimers());

  it("attach را دوباره‌باره انجام نمی‌دهد و با بافر مشترک، وینیلِ حلقوی می‌سازد", () => {
    const ctx = new MockAudioContext();
    const engine = new GenerativeLofiEngine();
    engine.attach(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, whiteBuffer(ctx));
    const buffersAfterAttach = ctx.buffers;
    const vinylSource = ctx.sources.find((s) => s.loop);
    expect(vinylSource).toBeDefined();
    expect(vinylSource!.started).toBe(1);
    engine.attach(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode);
    expect(ctx.buffers).toBe(buffersAfterAttach); // idempotent
    expect(ctx.gains.length).toBeGreaterThanOrEqual(4); // out + pad + pluck + (اکو و کراکل)
    engine.stop();
  });

  it("روی تیکِ زمان‌بند میزان‌های بعدی را برنامه‌ریزی می‌کند و با توقف، قطع می‌شود", () => {
    const ctx = new MockAudioContext();
    const engine = new GenerativeLofiEngine();
    engine.attach(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, whiteBuffer(ctx));
    const beforeSources = ctx.sources.length;
    engine.setEnabled(true);
    // میزانِ اول بلافاصله زمان‌بندی می‌شود: پدها + باس + شاید پلاك + کراکل
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    const afterFirstBar = ctx.oscillators.length + ctx.sources.length;

    vi.advanceTimersByTime(MUSIC_BEAT * 8 * 1000); // حدوداً دو میزان
    expect(ctx.oscillators.length + ctx.sources.length).toBeGreaterThan(afterFirstBar);

    engine.setEnabled(false);
    const frozen = ctx.oscillators.length + ctx.sources.length;
    vi.advanceTimersByTime(20_000);
    expect(ctx.oscillators.length + ctx.sources.length).toBe(frozen);

    // دوبار enable پشت سر هم، موتور را خراب نمی‌کند
    engine.setEnabled(true);
    engine.setEnabled(true);
    engine.setEnabled(false);
    expect(ctx.sources.length - beforeSources).toBeGreaterThan(0);
  });
});

describe("رگرسیون: کرشِ بخش موسیقی زنده", () => {
  beforeEach(() => vi.useFakeTimers());

  it("هیچ رویدادی با بهره‌ی صفر یا منفی ساخته نمی‌شود (پاکتِ نماییِ نامعتبر = خطای مرورگر)", () => {
    for (const prog of MUSIC_PROGRESSIONS) {
      for (let bar = 0; bar < 12; bar++) {
        const events = barEvents(prog, bar, mulberry32(bar * 7919 + 13));
        expect(events.length).toBeGreaterThan(0);
        for (const ev of events) {
          expect(ev.gain, `event ${ev.kind} @bar ${bar}`).toBeGreaterThanOrEqual(MIN_ENV_GAIN);
        }
      }
    }
  });

  it("safeEnvelopeGain مقادیر خطرناک را به بازه‌ی امن می‌بَرد", () => {
    expect(safeEnvelopeGain(0)).toBe(MIN_ENV_GAIN);
    expect(safeEnvelopeGain(-3)).toBe(MIN_ENV_GAIN);
    expect(safeEnvelopeGain(Number.NaN)).toBe(MIN_ENV_GAIN);
    expect(safeEnvelopeGain(0.5)).toBe(0.5);
  });

  it("موتور با ماکِ سخت‌گیر (پرتاب خطا روی بهره‌ی صفر) چندین میزان بی‌خطا می‌نوازد", () => {
    const ctx = new MockAudioContext();
    const engine = new GenerativeLofiEngine();
    engine.attach(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, whiteBuffer(ctx));

    engine.setEnabled(true); // اگر رویدادی پاکتِ نامعتبر بسازد همین‌جا پرتاب می‌شود
    const afterBar0 = ctx.oscillators.length;
    expect(afterBar0).toBeGreaterThan(0);

    // شش میزان کامل جلو برویم؛ زمان‌بندِ ۱۸۰ میلی‌ثانیه‌ای باید بی‌استثنا ادامه دهد
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(MUSIC_BAR * 1000);
    }
    expect(ctx.oscillators.length).toBeGreaterThan(afterBar0);
    engine.setEnabled(false);
  });

  it("اگر ساخت یک رویداد خطا بدهد، موتور قفل نمی‌شود و میزان‌ها جلو می‌روند", () => {
    const ctx = new MockAudioContext();
    const engine = new GenerativeLofiEngine();
    engine.attach(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, whiteBuffer(ctx));

    // خرابکاری: ساختِ اولین نوسان‌ساز خطا می‌دهد (شبیه مرورگری که در ساخت نود به مشکل می‌خورد)
    const originalCreate = ctx.createOscillator.bind(ctx);
    let failures = 1;
    ctx.createOscillator = () => {
      if (failures > 0) {
        failures--;
        throw new DOMException("node creation failed", "InvalidStateError");
      }
      return originalCreate();
    };

    // نه شروع، نه تیک‌های بعدی نباید استثنا به بیرون نشت کند
    expect(() => engine.setEnabled(true)).not.toThrow();
    const countWhileBroken = ctx.oscillators.length;
    vi.advanceTimersByTime(MUSIC_BAR * 4 * 1000);
    expect(() => vi.advanceTimersByTime(MUSIC_BAR * 4 * 1000)).not.toThrow();

    // بعد از «رفع مشکلِ» مرورگر، موسیقی دوباره ادامه دارد (موتور روی یک میزان گیر نکرده)
    expect(ctx.oscillators.length).toBeGreaterThan(countWhileBroken);
    engine.setEnabled(false);
  });

  it("بعد از پنهان‌بودنِ طولانی، هجومِ ساختِ صدها میزان نمی‌دهد (محافظِ جبرانِ عقب‌افتادگی)", () => {
    const ctx = new MockAudioContext();
    const engine = new GenerativeLofiEngine();
    engine.attach(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, whiteBuffer(ctx));
    engine.setEnabled(true);
    vi.advanceTimersByTime(1000);
    const before = ctx.oscillators.length;

    // سی دقیقه جلو بپر (مثل وقتی کاربر اپ را پنهان می‌کند و برمی‌گردد)
    vi.setSystemTime(Date.now() + 30 * 60 * 1000);
    vi.advanceTimersByTime(400); // یک چرخه‌ی زمان‌بند

    // حداکثر چند میزانِ آخر ساخته می‌شود، نه صدها میزان
    expect(ctx.oscillators.length - before).toBeLessThan(120);
    engine.setEnabled(false);
  });
});
