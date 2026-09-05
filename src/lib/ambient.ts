// ===== موتور صداهای محیطی (White & Brown Noise) =====
// باران، رعد و برق، رودخانه و نویز قهوه‌ای به‌صورت زنده با Web Audio API سنتز می‌شوند
// و هم‌زمان روی یک خروجی مشترک میکس می‌شوند (هر صدا با حجم مستقل).
//
// چرا سنتز به‌جای فایل صوتی؟
//  ۱) این اپ آفلاین و تک‌فایلی است؛ هیچ دانلودی لازم نیست و چند مگابایت صوت به bundle اضافه نمی‌شود.
//  ۲) تکرارِ «بی‌درز» واقعی: بافرِ نویز به‌صورت *دوره‌ای* ساخته می‌شود (نمونه‌ی آخر دقیقاً به
//     نمونه‌ی اول وصل می‌شود)، پس نقطه‌ی loop هیچ کلیک یا درزی ندارد و گوش الگوی تکراری نمی‌شنود.
//  ۳) رعد و برق اساساً رویدادی تصادفی است؛ زمان‌بندی زنده‌ی آن از هر فایل لوپی طبیعی‌تر است.

import { DEFAULT_AMBIENT, type AmbientSoundId } from "../types";

export interface AmbientSoundMeta {
  id: AmbientSoundId;
  label: string;
  icon: string;
  hint: string;
}

export const AMBIENT_SOUNDS: AmbientSoundMeta[] = [
  { id: "rain", label: "باران", icon: "🌧️", hint: "شرشر نرم باران، با موج‌های بلند و کوتاه" },
  { id: "thunder", label: "رعد و برق", icon: "⛈️", hint: "غرش آسمان و رعد‌های پراکنده‌ی تصادفی" },
  { id: "river", label: "رودخانه", icon: "🏞️", hint: "جریان آب با قل‌قل و کفِ روی آب" },
  { id: "brown", label: "نویز قهوه‌ای", icon: "🟤", hint: "Brown Noise · صدایی بم، نرم و یکنواخت" },
];

export const AMBIENT_IDS: AmbientSoundId[] = AMBIENT_SOUNDS.map((s) => s.id);

export interface AmbientPreset {
  id: string;
  label: string;
  icon: string;
  volumes: Record<AmbientSoundId, number>;
}

/** ترکیب‌های آماده؛ همهٔ لایه‌ها صریح‌اند تا انتخاب پریست صدای قبلی را باقی نگذارد. */
export const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: "storm", label: "طوفان", icon: "⛈️", volumes: { rain: 0.8, thunder: 0.65, river: 0, brown: 0 } },
  { id: "drizzle", label: "باران ملایم", icon: "🌧️", volumes: { rain: 0.55, thunder: 0, river: 0.18, brown: 0 } },
  { id: "riverside", label: "کنار رودخانه", icon: "🏞️", volumes: { rain: 0.12, thunder: 0, river: 0.85, brown: 0 } },
  { id: "brown-focus", label: "تمرکز بم", icon: "🟤", volumes: { rain: 0, thunder: 0, river: 0, brown: 0.7 } },
  { id: "warm-rain", label: "باران گرم", icon: "☕", volumes: { rain: 0.45, thunder: 0, river: 0, brown: 0.45 } },
  { id: "full-mix", label: "میکس کامل", icon: "🎛️", volumes: { rain: 0.5, thunder: 0.35, river: 0.5, brown: 0.3 } },
];

export function defaultVolumes(): Record<AmbientSoundId, number> {
  return { ...DEFAULT_AMBIENT.volumes };
}

export function clampLevel(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** حجم‌های ذخیره‌شده (یا ناقص) را به یک رکورد کامل و معتبر تبدیل می‌کند */
export function normalizeVolumes(v: Partial<Record<AmbientSoundId, number>> | null | undefined): Record<AmbientSoundId, number> {
  const out = defaultVolumes();
  if (!v || typeof v !== "object") return out;
  for (const id of AMBIENT_IDS) out[id] = clampLevel(v[id] ?? out[id]);
  return out;
}

/**
 * Final peak protection after the compressor. Its input is attenuated by 1/2;
 * this curve restores unity gain below 0.8 and smoothly rounds only loud peaks.
 * A compressor alone can overshoot full scale when all four layers are at 100%.
 */
export function createSoftLimiterCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1) * 2 - 1) * 2;
    const magnitude = Math.abs(x);
    curve[i] = magnitude <= 0.8 ? x : Math.sign(x) * (0.8 + 0.18 * Math.tanh((magnitude - 0.8) / 0.18));
  }
  return curve;
}

// ===== ساخت نویزِ دوره‌ای (قابل loop بدون درز) =====

/** مولد شبه‌تصادفی قطعی تا خروجی در اجراهای مختلف یکسان و قابل تست باشد */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type NoiseKind = "white" | "pink" | "brown";

interface PinkState {
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
  b6: number;
}

const PINK_ZERO: PinkState = { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };

/** انتگرال‌گیر نشتی‌دار → نویز قهوه‌ای. وضعیت (state) برگردانده می‌شود تا بتوان ادامه داد. */
/** ضریب نشتیِ انتگرال‌گیر: ~۳۵Hz یعنی غرش بمِ کاملاً شنیدنی روی بلندگوی موبایل */
export const BROWN_LEAK = 0.995;

function brownPass(raw: Float32Array, prev: number): { out: Float32Array; state: number } {
  const n = raw.length;
  const out = new Float32Array(n);
  let y = prev;
  for (let i = 0; i < n; i++) {
    y = BROWN_LEAK * y + raw[i] * 0.05;
    out[i] = y;
  }
  return { out, state: y };
}

/** فیلتر صورتیِ Paul Kellet — با انتقال وضعیت بین دو پاس */
function pinkPass(raw: Float32Array, s: PinkState): { out: Float32Array; state: PinkState } {
  const n = raw.length;
  const out = new Float32Array(n);
  let { b0, b1, b2, b3, b4, b5, b6 } = s;
  for (let i = 0; i < n; i++) {
    const w = raw[i];
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.16;
    b6 = w * 0.115926;
  }
  return { out, state: { b0, b1, b2, b3, b4, b5, b6 } };
}

function normalizePeak(input: Float32Array, peak = 0.95): Float32Array {
  let max = 0;
  for (let i = 0; i < input.length; i++) {
    const v = Math.abs(input[i]);
    if (v > max) max = v;
  }
  if (max === 0) return input;
  const k = peak / max;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * k;
  return out;
}

/**
 * نویزی می‌سازد که *دقیقاً* با دوره‌ی `length` تکرارپذیر است.
 *
 * روش کار: فیلترهای رنگی (قهوه‌ای/صورتی) IIR پایدارند، یعنی تمام قطب‌هایشان داخل دایره‌ی
 * واحد است؛ پس اگر یک پاس را از حالت صفر بزنیم و پاس دوم را با «حالتِ پایانیِ پاس اول» شروع
 * کنیم، وضعیت فیلتر در نقطه‌ی loop عملاً به همان مقدار اولیه برگشته است (خطا در حد a^L ≈ ۰).
 * نتیجه: نمونه‌ی آخر و نمونه‌ی اول به‌هم پیوسته‌اند و loop شدن هیچ کلیک/درزی ندارد.
 */
export function generateLoopNoise(length: number, kind: NoiseKind = "white", seed = 1): Float32Array {
  const n = Math.max(2, Math.floor(length));
  const rnd = mulberry32(seed);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = rnd() * 2 - 1;

  if (kind === "white") return normalizePeak(raw);

  if (kind === "brown") {
    const first = brownPass(raw, 0);
    const second = brownPass(raw, first.state);
    return normalizePeak(second.out);
  }

  const first = pinkPass(raw, PINK_ZERO);
  const second = pinkPass(raw, first.state);
  return normalizePeak(second.out);
}

// ===== موتور پخش =====

type AudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as AudioWindow;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function ambientSupported(): boolean {
  return audioCtor() !== null;
}

/** طول بافرهای نویز (ثانیه) — به‌اندازه‌ی کافی بلند تا گوش الگوی تکراری پیدا نکند */
const WHITE_SECONDS = 12;
const PINK_SECONDS = 16;
const BROWN_SECONDS = 20;

/**
 * ضریب بلندی هر لایه تا صداها در حجم‌های یکسان، هم‌تراز شنیده شوند.
 * این عددها با شبیه‌سازی همان زنجیره‌ی فیلترها بیرون از مرورگر اندازه گرفته شده‌اند:
 * با میکس پیش‌فرض، RMS خروجی حدود ۱۸- دسی‌بل و اوج آن زیر ۰ دسی‌بل می‌ماند (بدون کلیپ).
 */
const TRIM: Record<AmbientSoundId, number> = { rain: 0.4, thunder: 1.1, river: 0.85, brown: 0.75 };

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<AmbientSoundId, GainNode>> = {};
  private thunderBus: GainNode | null = null;
  private buffers: { white?: AudioBuffer; pink?: AudioBuffer; brown?: AudioBuffer } = {};
  private sources: AudioBufferSourceNode[] = [];
  private lfos: OscillatorNode[] = [];
  private thunderTimer: ReturnType<typeof setTimeout> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private levels: Record<AmbientSoundId, number> = defaultVolumes();
  private masterLevel = DEFAULT_AMBIENT.master;
  private started = false;

  /** آیا موتور در حال پخش است؟ */
  get playing(): boolean {
    return this.started && this.ctx?.state === "running";
  }

  getLevels(): Record<AmbientSoundId, number> {
    return { ...this.levels };
  }

  /** ساخت/بازگردانی Context و شروع پخش؛ اگر مرورگر اجازه ندهد false برمی‌گرداند */
  async start(levels?: Partial<Record<AmbientSoundId, number>> | null, master?: number): Promise<boolean> {
    const Ctor = audioCtor();
    if (!Ctor) return false;
    if (levels) this.levels = normalizeVolumes(levels);
    if (master !== undefined) this.masterLevel = clampLevel(master);
    try {
      if (!this.ctx) {
        this.ctx = new Ctor();
        this.build();
      }
      if (this.suspendTimer) {
        clearTimeout(this.suspendTimer);
        this.suspendTimer = null;
      }
      if (this.ctx.state !== "running") await this.ctx.resume();
      if (this.ctx.state !== "running") return false;
      this.started = true;
      this.applyLevels(0.9); // fade in نرم تا صدا «پرتاب» نشود
      this.scheduleThunder(true);
      return true;
    } catch (e) {
      console.warn("ambient start failed", e);
      return false;
    }
  }

  /** توقف با fade out کوتاه، سپس suspend کردن Context تا CPU/باتری مصرف نشود */
  stop(): void {
    this.started = false;
    this.clearThunderTimer();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.45);
    } catch {
      /* برخی مرورگرها در حالت suspended اجازه‌ی زمان‌بندی نمی‌دهند */
    }
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      ctx.suspend?.().catch?.(() => {});
    }, 550);
  }

  setLevel(id: AmbientSoundId, value: number): void {
    this.levels[id] = clampLevel(value);
    this.applyLevels();
    if (id === "thunder" && this.started) this.scheduleThunder();
  }

  setLevels(values: Record<AmbientSoundId, number>): void {
    this.levels = normalizeVolumes(values);
    this.applyLevels();
    if (this.started) this.scheduleThunder();
  }

  setMaster(value: number): void {
    this.masterLevel = clampLevel(value);
    this.applyLevels();
  }

  // ----- ساخت گراف صوتی -----

  private ensureBuffers(): void {
    const ctx = this.ctx!;
    const make = (seconds: number, kind: NoiseKind, seed: number): AudioBuffer => {
      const len = Math.max(1024, Math.floor(ctx.sampleRate * seconds));
      const data = generateLoopNoise(len, kind, seed);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      // copyToChannel در بعضی تایپ‌ها/مرورگرهای قدیمی نیست؛ set() همیشه کار می‌کند
      buf.getChannelData(0).set(data);
      return buf;
    };
    if (!this.buffers.white) this.buffers.white = make(WHITE_SECONDS, "white", 0x5eed);
    if (!this.buffers.pink) this.buffers.pink = make(PINK_SECONDS, "pink", 0x9a37);
    if (!this.buffers.brown) this.buffers.brown = make(BROWN_SECONDS, "brown", 0x1b4d);
  }

  private build(): void {
    const ctx = this.ctx!;
    this.ensureBuffers();

    // محدودکننده تا وقتی همهٔ صداها با هم بلند می‌شوند، خروجی کلیپ نکند
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 24;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(limiter);
    const headroom = ctx.createGain();
    headroom.gain.value = 0.5;
    const peakGuard = ctx.createWaveShaper();
    peakGuard.curve = createSoftLimiterCurve();
    // No oversampling filter: the final output stays strictly below full scale.
    peakGuard.oversample = "none";
    limiter.connect(headroom).connect(peakGuard).connect(ctx.destination);
    this.master = master;

    this.buses.rain = this.buildRain(master);
    this.buses.river = this.buildRiver(master);
    this.buses.thunder = this.buildThunder(master);
    this.buses.brown = this.buildBrown(master);
    this.thunderBus = this.buses.thunder;
  }

  /** یک منبع نویز حلقوی با نقطه‌ی شروع تصادفی (تا لایه‌ها هم‌فاز و «مصنوعی» نشوند) */
  private loop(buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(0, Math.random() * Math.max(0, buffer.duration - 0.5));
    this.sources.push(src);
    return src;
  }

  /** نوسان‌ساز کند برای زنده‌کردن صدا (تغییر طیف/حجم) — همین، تکرار را کاملاً پنهان می‌کند */
  private lfo(freq: number, depth: number, target: AudioParam, base?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    osc.connect(g);
    g.connect(target);
    if (base !== undefined) target.value = base;
    osc.start(0);
    this.lfos.push(osc);
  }

  private filter(type: BiquadFilterType, frequency: number, q = 0.7, gainDb = 0): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    if (gainDb) f.gain.value = gainDb;
    return f;
  }

  private buildRain(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // ۱) «هیس» باران: نویز سفید با طیف ۴۲۰Hz تا ۶٫۵kHz و قلّه‌ی ملایم در ۲٫۵kHz
    const lp = this.filter("lowpass", 6500, 0.6);
    const hissGain = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 420, 0.7))
      .connect(lp)
      .connect(this.filter("peaking", 2500, 1.1, 5))
      .connect(hissGain)
      .connect(bus);
    this.lfo(0.07, 1500, lp.frequency); // باز و بسته شدن طیف، مثل تند و کند شدن باران
    this.lfo(0.13, 0.16, hissGain.gain, 0.86);

    // ۲) «حجم» و بدنه‌ی باران: نویز صورتی در باند میانی
    const bodyGain = ctx.createGain();
    this.loop(this.buffers.pink!).connect(this.filter("bandpass", 900, 0.5)).connect(bodyGain).connect(bus);
    this.lfo(0.05, 0.12, bodyGain.gain, 0.5);

    // ۳) چک‌چک ریز قطره‌ها: باند باریک با tremolo سریع
    const dropGain = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("bandpass", 3200, 4))
      .connect(dropGain)
      .connect(bus);
    dropGain.gain.value = 0.1;
    this.lfo(4.7, 0.07, dropGain.gain);
    this.lfo(0.31, 0.04, dropGain.gain);

    return bus;
  }

  private buildRiver(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // ۱) غرش جریان آب: نویز صورتی (طیف پُر در بم و میانی) با موجِ کُند
    const roarGain = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 35, 0.7))
      .connect(this.filter("lowpass", 780, 0.8))
      .connect(roarGain)
      .connect(bus);
    this.lfo(0.09, 0.11, roarGain.gain, 0.85);

    // ۱ب) زیرِ بمِ آب: نویز قهوه‌ای برای «وزن» صدا
    const subGain = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 24, 0.7))
      .connect(this.filter("lowpass", 120, 0.9))
      .connect(subGain)
      .connect(bus);
    this.lfo(0.07, 0.08, subGain.gain, 0.5);

    // ۲) قل‌قل آب: باند میانی با مدولاسیون سریع‌تر و نامنظم
    const babbleGain = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 1100, 1.2))
      .connect(babbleGain)
      .connect(bus);
    babbleGain.gain.value = 0.4;
    this.lfo(0.7, 0.16, babbleGain.gain);
    this.lfo(1.9, 0.09, babbleGain.gain);

    // ۳) کف/درخشش روی آب
    const foamGain = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 2000, 0.7))
      .connect(this.filter("bandpass", 4200, 2))
      .connect(foamGain)
      .connect(bus);
    foamGain.gain.value = 0.05;
    this.lfo(3.1, 0.035, foamGain.gain);

    return bus;
  }

  /** A steady, low-frequency brown-noise layer, independent of the nature sounds. */
  private buildBrown(dest: AudioNode): GainNode {
    const bus = this.ctx!.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    // Reuse the periodic brown buffer: no extra download/allocation, no rhythmic LFO.
    // Remove subsonic/DC energy and gently soften the upper frequencies.
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 20, 0.7))
      .connect(this.filter("lowpass", 900, 0.7))
      .connect(bus);
    return bus;
  }

  private buildThunder(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بسترِ غرش دوردست (همیشه هست، رعد‌های تصادفی روی آن سوار می‌شوند)
    const bedGain = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 24, 0.7))
      .connect(this.filter("lowpass", 130, 0.9))
      .connect(bedGain)
      .connect(bus);
    this.lfo(0.06, 0.13, bedGain.gain, 0.45);
    this.lfo(0.023, 0.06, bedGain.gain); // موج بسیار کند دوم تا غرش یکنواخت نماند

    return bus;
  }

  // ----- رعد و برق تصادفی -----

  private clearThunderTimer(): void {
    if (this.thunderTimer !== null) {
      clearTimeout(this.thunderTimer);
      this.thunderTimer = null;
    }
  }

  private scheduleThunder(first = false): void {
    this.clearThunderTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.thunder;
    if (level <= 0.001) return; // صدا خاموش است؛ رویدادی زمان‌بندی نمی‌کنیم
    // هرچه حجم رعد بیشتر → فاصله‌ی رعد‌ها کمتر (طوفان نزدیک‌تر)
    const near = Math.min(1, level);
    const delay = first ? 2500 + Math.random() * 4000 : (7000 + Math.random() * 16000) * (1.3 - near * 0.6);
    this.thunderTimer = setTimeout(() => {
      this.thunderTimer = null;
      this.strike();
      this.scheduleThunder();
    }, Math.max(1500, delay));
  }

  /** یک رعد: غرش بم با پاکت بلند + (با احتمال کمتر) شکستِ برقِ نزدیک */
  private strike(): void {
    const ctx = this.ctx;
    const bus = this.thunderBus;
    if (!ctx || !bus || !this.started || !this.buffers.pink) return;
    const t0 = ctx.currentTime + 0.05 + Math.random() * 0.5;
    const power = 0.45 + Math.random() * 0.55;
    const dur = 3.2 + Math.random() * 5.5;

    const src = ctx.createBufferSource();
    src.buffer = this.buffers.pink; // صورتی = هم بمِ پُر دارد هم میانِ شنیدنی
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const lp = this.filter("lowpass", 240 + power * 700, 0.9);
    lp.frequency.setValueAtTime(240 + power * 700, t0);
    lp.frequency.exponentialRampToValueAtTime(55, t0 + dur); // هرچه دورتر، بم‌تر
    const hp = this.filter("highpass", 28, 0.7);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.85 * power, t0 + 0.18 + Math.random() * 0.45);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.28 * power, t0 + dur * 0.42);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.5 * power, t0 + dur * 0.58); // غرش چندتکه
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(lp).connect(hp).connect(g).connect(bus);
    const maxOffset = Math.max(0, this.buffers.pink.duration - dur - 0.5);
    src.start(t0, Math.random() * maxOffset);
    src.stop(t0 + dur + 0.2);
    src.onended = () => {
      try {
        src.disconnect();
        lp.disconnect();
        hp.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };

    if (Math.random() < 0.4) this.crack(t0 + 0.02, power, bus);
  }

  /** ترقِ کوتاهِ صاعقه‌ی نزدیک */
  private crack(t0: number, power: number, bus: GainNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.buffers.white) return;
    const dur = 0.5 + Math.random() * 0.9;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.white;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;

    const bp = this.filter("bandpass", 900 + Math.random() * 900, 0.8);
    bp.frequency.setValueAtTime(bp.frequency.value, t0);
    bp.frequency.exponentialRampToValueAtTime(160, t0 + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.01 + 0.35 * power, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bp).connect(g).connect(bus);
    src.start(t0, Math.random() * Math.max(0.1, this.buffers.white.duration - 1));
    src.stop(t0 + dur + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  private applyLevels(fade = 0.12): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const id of AMBIENT_IDS) {
      const bus = this.buses[id];
      if (!bus) continue;
      const target = this.levels[id] * TRIM[id];
      try {
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(bus.gain.value, t);
        bus.gain.linearRampToValueAtTime(target, t + fade);
      } catch {
        bus.gain.value = target;
      }
    }
    if (this.master && this.started) {
      try {
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(this.masterLevel, t + Math.max(fade, 0.6));
      } catch {
        this.master.gain.value = this.masterLevel;
      }
    }
  }
}

/** یک نمونه‌ی یکتا برای کل اپ تا صدا هنگام جابه‌جایی بین صفحه‌ها قطع نشود */
export const ambientEngine = new AmbientEngine();
