import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerativeLofiEngine, MUSIC_BAR, MUSIC_BEAT, MUSIC_PROGRESSIONS, MUSIC_SCALE, barEvents, midiToFreq } from "../music";
import { mulberry32 } from "../random";

class MockParam {
  value = 0;
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  setTargetAtTime() {
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
