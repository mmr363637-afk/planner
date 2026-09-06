// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AMBIENT_IDS,
  AMBIENT_PRESETS,
  AMBIENT_SOUNDS,
  AmbientEngine,
  ambientSupported,
  clampLevel,
  createSoftLimiterCurve,
  defaultVolumes,
  generateLoopNoise,
  mulberry32,
  normalizeVolumes,
  BROWN_LEAK,
} from "../ambient";
import { DEFAULT_AMBIENT } from "../../types";

// ===== بخش ۱: توابع خالص (بدون نیاز به Web Audio) =====

/** میانگین قدرمطلق اختلاف نمونه‌های متوالی = معیار «زبری» سیگنال */
function avgStep(buf: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < buf.length; i++) sum += Math.abs(buf[i] - buf[i - 1]);
  return sum / (buf.length - 1);
}

describe("مولد نویزِ بی‌درز", () => {
  it("قطعی است: seed یکسان ⇒ خروجی یکسان", () => {
    const a = generateLoopNoise(4096, "brown", 42);
    const b = generateLoopNoise(4096, "brown", 42);
    expect(a.length).toBe(4096);
    expect(Array.from(a.slice(0, 16))).toEqual(Array.from(b.slice(0, 16)));
    expect(Array.from(generateLoopNoise(4096, "brown", 43).slice(0, 16))).not.toEqual(Array.from(a.slice(0, 16)));
  });

  it("هر سه رنگِ نویز ساخته می‌شوند، دامنه‌ی نرمال دارند و ساکت نیستند", () => {
    for (const kind of ["white", "pink", "brown"] as const) {
      const buf = generateLoopNoise(2048, kind, 7);
      let peak = 0;
      let energy = 0;
      for (const v of buf) {
        peak = Math.max(peak, Math.abs(v));
        energy += v * v;
      }
      const rms = Math.sqrt(energy / buf.length);
      expect(peak).toBeLessThanOrEqual(0.96);
      expect(peak).toBeGreaterThan(0.5);
      expect(rms).toBeGreaterThan(0.01);
    }
  });

  it("نویز قهوه‌ای/صورتی از نویز سفید نرم‌تر است (همان چیزی که برای باران/رودخانه لازم است)", () => {
    const white = generateLoopNoise(8192, "white", 5);
    const brown = generateLoopNoise(8192, "brown", 5);
    expect(avgStep(brown)).toBeLessThan(avgStep(white) / 5);
  });

  it("نقطه‌ی loop پیوسته است: پرشِ آخر→اول در حدِ همان گام‌های معمولی سیگنال است", () => {
    for (const kind of ["brown", "pink", "white"] as const) {
      const buf = generateLoopNoise(22050, kind, 3);
      const seam = Math.abs(buf[0] - buf[buf.length - 1]);
      expect(seam, `seam of ${kind}`).toBeLessThan(avgStep(buf) * 4);
    }
  });

  it("این روش واقعاً لازم است: حلقه‌ی معمولی (بدون دوره‌ای‌سازی) در همان نقطه کلیک می‌زند", () => {
    const n = 22050;
    let naiveTotal = 0;
    let periodicTotal = 0;
    let periodicWorst = 0;

    // روی چند seed مختلف اندازه می‌گیریم؛ اندازه‌ی پرشِ یک حلقه‌ی معمولی کاملاً تصادفی است
    // (گاهی شانسی کوچک می‌شود)، ولی میانگینِ آن بسیار بزرگ‌تر از روش دوره‌ای ماست.
    for (let seed = 1; seed <= 8; seed++) {
      const rnd = mulberry32(seed);
      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) raw[i] = rnd() * 2 - 1;

      // روش ساده: یک بار انتگرال‌گیری از وضعیت صفر — وضعیتِ پایان به وضعیتِ اول نمی‌رسد
      const naive = new Float32Array(n);
      let y = 0;
      for (let i = 0; i < n; i++) {
        y = BROWN_LEAK * y + raw[i] * 0.05;
        naive[i] = y;
      }
      naiveTotal += Math.abs(naive[0] - naive[n - 1]) / avgStep(naive);

      const periodic = generateLoopNoise(n, "brown", seed);
      const ratio = Math.abs(periodic[0] - periodic[periodic.length - 1]) / avgStep(periodic);
      periodicTotal += ratio;
      periodicWorst = Math.max(periodicWorst, ratio);
    }

    expect(periodicWorst).toBeLessThan(4); // بدترین حالت هم در حد گام‌های معمولی سیگنال است
    expect(naiveTotal / 8).toBeGreaterThan((periodicTotal / 8) * 4);
  });

  it("mulberry32 همیشه در بازه‌ی [۰,۱) است", () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("final mix peak protection", () => {
  it("preserves quieter audio and smoothly bounds even the loudest mix", () => {
    const curve = createSoftLimiterCurve();
    expect(curve).toHaveLength(4097);
    expect(curve[2048]).toBe(0);
    // After the preceding 1/2 gain, a 0.5 signal enters the shaper at 0.25.
    expect(curve[2560]).toBe(0.5);
    for (let i = 0; i < curve.length; i++) {
      expect(Math.abs(curve[i])).toBeLessThan(0.981);
      expect(curve[i]).toBeCloseTo(-curve[curve.length - 1 - i], 6);
      if (i > 0) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });
});

describe("میکس (حجم صداها)", () => {
  it("clampLevel مقادیر نامعتبر را به بازه‌ی ۰ تا ۱ می‌آورد", () => {
    expect(clampLevel(0.4)).toBe(0.4);
    expect(clampLevel(-3)).toBe(0);
    expect(clampLevel(9)).toBe(1);
    expect(clampLevel(NaN)).toBe(0);
    expect(clampLevel(undefined)).toBe(0);
  });

  it("normalizeVolumes رکورد ناقص/خراب را کامل می‌کند", () => {
    expect(normalizeVolumes(undefined)).toEqual(DEFAULT_AMBIENT.volumes);
    expect(normalizeVolumes(null)).toEqual(DEFAULT_AMBIENT.volumes);
    expect(normalizeVolumes({ rain: 2, thunder: -1 })).toEqual({ ...DEFAULT_AMBIENT.volumes, rain: 1, thunder: 0 });
    expect(normalizeVolumes({} as never)).toEqual(DEFAULT_AMBIENT.volumes);
  });

  it("همهٔ صداها تعریف شده‌اند و پریست‌ها معتبرند", () => {
    expect(AMBIENT_SOUNDS.map((s) => s.id)).toEqual(AMBIENT_IDS);
    expect(AMBIENT_IDS).toHaveLength(12);
    // صداهای تازه اضافه‌شده باید پیش‌فرضِ خاموش باشند تا میکسِ قبلیِ کاربر را عوض نکنند
    expect(DEFAULT_AMBIENT.volumes).toEqual({
      rain: 0.65, thunder: 0.4, river: 0.55, brown: 0,
      forest: 0, wind: 0, fireplace: 0, ocean: 0, birds: 0, crickets: 0, cafe: 0, fan: 0,
    });
    expect(defaultVolumes()).toEqual(DEFAULT_AMBIENT.volumes);
    expect(new Set(AMBIENT_PRESETS.map((p) => p.id)).size).toBe(AMBIENT_PRESETS.length);
    for (const p of AMBIENT_PRESETS) {
      for (const id of AMBIENT_IDS) {
        expect(p.volumes[id]).toBeGreaterThanOrEqual(0);
        expect(p.volumes[id]).toBeLessThanOrEqual(1);
      }
    }
    // دست‌کم یک پریست باید همهٔ صداها را با هم میکس کند
    expect(AMBIENT_PRESETS.some((p) => AMBIENT_IDS.every((id) => p.volumes[id] > 0))).toBe(true);
  });
});

// ===== بخش ۲: موتور پخش با AudioContext ساختگی =====

class MockParam {
  value = 0;
  events = 0;
  setValueAtTime(v: number) {
    this.value = v;
    this.events++;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    this.events++;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.value = v;
    this.events++;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class MockAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  state: "suspended" | "running" = "suspended";
  created = { gain: 0, biquad: 0, oscillator: 0, source: 0, compressor: 0, buffer: 0, waveshaper: 0 };
  startedSources: MockBufferSource[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  destination = {} as unknown;

  async resume() {
    this.resumeCalls++;
    this.state = "running";
  }
  async suspend() {
    this.suspendCalls++;
    this.state = "suspended";
  }
  createGain() {
    this.created.gain++;
    return new MockGain(this);
  }
  createBiquadFilter() {
    this.created.biquad++;
    return new MockBiquad(this);
  }
  createOscillator() {
    this.created.oscillator++;
    return new MockOscillator(this);
  }
  createBufferSource() {
    this.created.source++;
    return new MockBufferSource(this);
  }
  createDynamicsCompressor() {
    this.created.compressor++;
    return new MockCompressor(this);
  }
  createWaveShaper() {
    this.created.waveshaper++;
    return new MockWaveShaper(this);
  }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    this.created.buffer++;
    const data = new Float32Array(length);
    return {
      length,
      sampleRate,
      numberOfChannels: _channels,
      duration: length / sampleRate,
      getChannelData: () => data,
    };
  }
}

class MockNode {
  ctx: MockAudioContext;
  connections: unknown[] = [];
  constructor(ctx: MockAudioContext) {
    this.ctx = ctx;
  }
  connect(dest: unknown) {
    this.connections.push(dest);
    return dest as never;
  }
  disconnect() {
    this.connections = [];
  }
}

class MockGain extends MockNode {
  gain = new MockParam();
}
class MockBiquad extends MockNode {
  type = "lowpass";
  frequency = new MockParam();
  Q = new MockParam();
  gain = new MockParam();
}
class MockWaveShaper extends MockNode {
  curve: Float32Array | null = null;
  oversample = "none";
}
class MockCompressor extends MockNode {
  threshold = new MockParam();
  knee = new MockParam();
  ratio = new MockParam();
  attack = new MockParam();
  release = new MockParam();
}
class MockOscillator extends MockNode {
  type = "sine";
  frequency = new MockParam();
  started = false;
  start() {
    this.started = true;
  }
  stop() {
    /* noop */
  }
}
class MockBufferSource extends MockNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = new MockParam();
  onended: (() => void) | null = null;
  startCalls: number[] = [];
  constructor(ctx: MockAudioContext) {
    super(ctx);
  }
  start(when = 0) {
    this.startCalls.push(when);
    this.ctx.startedSources.push(this);
  }
  stop() {
    /* noop */
  }
}

let mockCtx: MockAudioContext;

beforeEach(() => {
  mockCtx = new MockAudioContext();
  (window as unknown as { AudioContext: unknown }).AudioContext = function MockCtor() {
    return mockCtx;
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("موتور صداهای محیطی", () => {
  it("در مرورگر بدون Web Audio، بی‌سروصدا شکست می‌خورد (نه crash)", async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    expect(ambientSupported()).toBe(false);
    const engine = new AmbientEngine();
    await expect(engine.start()).resolves.toBe(false);
    expect(engine.playing).toBe(false);
    engine.stop(); // نباید خطا بدهد
  });

  it("گراف صوتی همهٔ لایه‌ها را می‌سازد و پخش را شروع/متوقف می‌کند", async () => {
    expect(ambientSupported()).toBe(true);
    const engine = new AmbientEngine();
    const ok = await engine.start({ rain: 0.5, thunder: 0.4, river: 0.6 }, 0.8);

    expect(ok).toBe(true);
    expect(engine.playing).toBe(true);
    expect(mockCtx.resumeCalls).toBe(1);
    expect(mockCtx.created.buffer).toBe(3); // سفید + صورتی + قهوه‌ای
    expect(mockCtx.created.compressor).toBe(1); // کمپرسور میکس
    expect(mockCtx.created.waveshaper).toBe(1); // محافظ اوج نهایی
    expect(mockCtx.created.gain).toBeGreaterThanOrEqual(5); // master + چهار باس
    expect(mockCtx.created.biquad).toBeGreaterThanOrEqual(8); // فیلترهای لایه‌ها
    expect(mockCtx.created.oscillator).toBeGreaterThanOrEqual(6); // LFOها
    // همهٔ لایه‌ها منبعِ حلقوی دارند و همه‌ی منابع loop هستند
    expect(mockCtx.startedSources.length).toBeGreaterThanOrEqual(7);
    expect(mockCtx.startedSources.every((s) => s.loop)).toBe(true);

    engine.stop();
    expect(engine.playing).toBe(false);
  });

  it("بافرهای نویز بلندند تا گوش الگوی تکراری پیدا نکند", async () => {
    const engine = new AmbientEngine();
    await engine.start();
    const buffers = mockCtx.startedSources.map((s) => s.buffer as { duration: number });
    const shortest = Math.min(...buffers.map((b) => b.duration));
    expect(shortest).toBeGreaterThanOrEqual(10); // دست‌کم ۱۰ ثانیه
  });

  it("رعد و برق را پیوسته و تصادفی زمان‌بندی می‌کند (لوپِ بی‌پایان)", async () => {
    vi.useFakeTimers();
    const engine = new AmbientEngine();
    await engine.start({ rain: 0.3, thunder: 0.8, river: 0.3 }, 1);
    const afterStart = mockCtx.created.source;

    vi.advanceTimersByTime(60_000); // یک دقیقه
    expect(mockCtx.created.source).toBeGreaterThan(afterStart); // دست‌کم یک رعد زده شده

    const afterFirstMinute = mockCtx.created.source;
    vi.advanceTimersByTime(5 * 60_000); // پنج دقیقه دیگر ⇒ رعد‌های بیشتر
    expect(mockCtx.created.source).toBeGreaterThan(afterFirstMinute);

    engine.stop();
    const afterStop = mockCtx.created.source;
    vi.advanceTimersByTime(5 * 60_000);
    expect(mockCtx.created.source).toBe(afterStop); // بعد از توقف، رعدی زمان‌بندی نمی‌شود
  });

  it("وقتی حجم رعد صفر است، رعدی زمان‌بندی نمی‌شود؛ با زیادکردن حجم از سر گرفته می‌شود", async () => {
    vi.useFakeTimers();
    const engine = new AmbientEngine();
    await engine.start({ rain: 0.6, thunder: 0, river: 0.6 }, 1);
    const base = mockCtx.created.source;

    vi.advanceTimersByTime(3 * 60_000);
    expect(mockCtx.created.source).toBe(base);

    engine.setLevel("thunder", 0.7);
    vi.advanceTimersByTime(60_000);
    expect(mockCtx.created.source).toBeGreaterThan(base);
    engine.stop();
  });

  it("تغییر حجم هر صدا مستقل از بقیه اعمال می‌شود (میکس همهٔ صداها)", async () => {
    const engine = new AmbientEngine();
    await engine.start({ rain: 0.2, thunder: 0.3, river: 0.4 }, 1);
    const gains = mockCtx.startedSources; // فقط برای اطمینان از ساخت گراف
    expect(gains.length).toBeGreaterThan(0);

    const others = { brown: 0, forest: 0, wind: 0, fireplace: 0, ocean: 0, birds: 0, crickets: 0, cafe: 0, fan: 0 };
    engine.setLevel("rain", 0.9);
    expect(engine.getLevels()).toEqual({ ...others, rain: 0.9, thunder: 0.3, river: 0.4 });
    engine.setLevel("river", 5); // خارج از بازه ⇒ clamp
    expect(engine.getLevels().river).toBe(1);
    engine.setLevels({ ...others, rain: 0.1, thunder: 0.1, river: 0.1, brown: 0.2 });
    expect(engine.getLevels()).toEqual({ ...others, rain: 0.1, thunder: 0.1, river: 0.1, brown: 0.2 });
    engine.setMaster(0.5);
    engine.stop();
  });

  it("نویز قهوه‌ای باس و فیلتر مستقل دارد، پیش‌فرض خاموش است و به تنهایی پخش می‌شود", async () => {
    const engine = new AmbientEngine();
    await engine.start({ rain: 0, thunder: 0, river: 0, brown: 0 }, 0.8);
    const brownSource = mockCtx.startedSources.find((source) => (source.connections[0] as MockBiquad)?.frequency?.value === 20)!;
    expect(brownSource).toBeDefined();
    expect(brownSource.loop).toBe(true);
    const highpass = brownSource.connections[0] as MockBiquad;
    const lowpass = highpass.connections[0] as MockBiquad;
    const bus = lowpass.connections[0] as MockGain;
    expect(highpass.type).toBe("highpass");
    expect(lowpass.type).toBe("lowpass");
    expect(lowpass.frequency.value).toBe(900);
    expect(bus.gain.value).toBe(0);
    engine.setLevel("brown", 0.6);
    expect(bus.gain.value).toBeCloseTo(0.45);
    expect(engine.getLevels()).toEqual({ rain: 0, thunder: 0, river: 0, brown: 0.6, forest: 0, wind: 0, fireplace: 0, ocean: 0, birds: 0, crickets: 0, cafe: 0, fan: 0 });
    const buffer = brownSource.buffer as { duration: number; getChannelData: (channel: number) => Float32Array };
    expect(buffer.duration).toBe(20);
    expect(avgStep(buffer.getChannelData(0))).toBeLessThan(0.1);
    engine.stop();
  });

  it("اجرای دوباره (start بعد از stop) گراف را از نو نمی‌سازد", async () => {
    const engine = new AmbientEngine();
    await engine.start({ rain: 0.5, thunder: 0, river: 0 }, 0.7);
    const buffers = mockCtx.created.buffer;
    const sources = mockCtx.created.source;
    engine.stop();
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000); // اجازه می‌دهیم suspend اجرا شود
    const ok = await engine.start({ rain: 0.5, thunder: 0, river: 0 }, 0.7);
    expect(ok).toBe(true);
    expect(mockCtx.created.buffer).toBe(buffers);
    expect(mockCtx.created.source).toBe(sources);
    engine.stop();
  });
});
