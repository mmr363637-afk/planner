// ===== موتور صداهای محیطی (Colored Noise + طبیعت/محیط + موتورهای مولد) =====
// همه‌ی صداها — از باران و رعد تا قطار و خرخرِ گربه و حتی موسیقی لوفای — به‌صورت زنده
// با Web Audio API سنتز می‌شوند و هم‌زمان روی یک خروجی مشترک میکس می‌شوند
// (هر صدا با حجم مستقل).
//
// چرا سنتز به‌جای فایل صوتی؟
//  ۱) این اپ آفلاین است؛ هیچ دانلودی لازم نیست و چند مگابایت صوت به bundle اضافه نمی‌شود.
//  ۲) تکرارِ «بی‌درز» واقعی: بافرِ نویز به‌صورت *دوره‌ای* ساخته می‌شود (نمونه‌ی آخر دقیقاً به
//     نمونه‌ی اول وصل می‌شود)، پس نقطه‌ی loop هیچ کلیک یا درزی ندارد و گوش الگوی تکراری نمی‌شنود.
//  ۳) رعد، پرنده، جیرجیرک، قورباغه، ورق‌خوردن کاغذ و ترق‌وتروقِ آتش اساساً رویدادی‌اند؛
//     زمان‌بندی زنده‌ی آن‌ها از هر فایل لوپی طبیعی‌تر است.
//
// ⚡ این ماژول سنگین است و فقط با اولین «پخش» به‌صورت تنبل لود می‌شود
// (dynamic import در src/ambient.tsx). متادیتای سبک (نام/آیکون/پریست‌ها) در
// lib/ambientMeta.ts است تا باندل اولیه کوچک بماند و اپ روی گوشی زود باز شود.

import { GenerativeLofiEngine } from "./music";
import { droneEngine } from "./drone";
import { mulberry32 } from "./random";
import {
  AMBIENT_IDS,
  BINAURAL_BASE_HZ,
  audioCtor,
  binauralBeatOf,
  clampLevel,
  defaultVolumes,
  normalizeVolumes,
  primedAudioContext,
} from "./ambientMeta";
import { DEFAULT_AMBIENT, type AmbientSoundId, type BinauralBandId } from "../types";

// mulberry32 از lib/random می‌آید؛ این re-export برای سازگاری با importهای قدیمی است
export { mulberry32 };
// متادیتا این‌جا re-export می‌شود تا importهای قدیمی (مثلاً تست‌ها) همچنان کار کنند؛
// کدِ باندلِ اولیه باید مستقیم از lib/ambientMeta ایمپورت کند.
export {
  AMBIENT_GROUP_META,
  AMBIENT_IDS,
  AMBIENT_PRESETS,
  AMBIENT_QUICK_IDS,
  AMBIENT_SOUNDS,
  BINAURAL_BASE_HZ,
  BINAURAL_BANDS,
  ambientSupported,
  audioCtor,
  autoMixForHour,
  binauralBeatOf,
  clampLevel,
  defaultVolumes,
  normalizeVolumes,
  primeAudioContext,
  primedAudioContext,
} from "./ambientMeta";
export type { AmbientGroupId, AmbientPreset, AmbientSoundMeta, BinauralBandMeta } from "./ambientMeta";


/**
 * کانتکست صوتی با کمترین فشارِ CPU: «playback» یعنی بافرهای بلندتر و مصرفِ کمتر.
 * روی موبایل تفاوتش محسوس است (گزارشِ «هنگ کردنِ میکسر روی گوشی»). اگر مرورگر
 * گزینه‌ها را قبول نکند، بدون گزینه ساخته می‌شود.
 */
function createAudioContext(Ctor: typeof AudioContext): AudioContext {
  try {
    return new Ctor({ latencyHint: "playback" } as AudioContextOptions);
  } catch {
    return new Ctor();
  }
}

let cachedCurve: Float32Array<ArrayBuffer> | null = null;

/**
 * Final peak protection after the compressor. Its input is attenuated by 1/2;
 * this curve restores unity gain below 0.8 and smoothly rounds only loud peaks.
 * A compressor alone can overshoot full scale when all four layers are at 100%.
 */
export function createSoftLimiterCurve(): Float32Array<ArrayBuffer> {
  if (cachedCurve) return cachedCurve;
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1) * 2 - 1) * 2;
    const magnitude = Math.abs(x);
    curve[i] = magnitude <= 0.8 ? x : Math.sign(x) * (0.8 + 0.18 * Math.tanh((magnitude - 0.8) / 0.18));
  }
  cachedCurve = curve;
  return curve;
}

// ===== ساخت نویزِ دوره‌ای (قابل loop بدون درز) =====

export type NoiseKind = "white" | "pink" | "brown";

/**
 * بافرهای نویزی که هر صدا لازم دارد. هر صدا فقط همین‌ها را می‌سازد (تنبل)، پس
 * صداهای روشنِ کم‌هزینه هم خیلی سریع بالا می‌آیند. مرجعِ نهایی، کدِ خودِ سازنده‌هاست
 * و تستِ `ambient-buffer-kinds` نگاشت را با آن مقابله می‌کند.
 */
export const AMBIENT_BUFFER_KINDS: Record<AmbientSoundId, NoiseKind[]> = {
  rain: ["white", "pink"],
  river: ["white", "pink", "brown"],
  thunder: ["white", "pink", "brown"], // بدنه + شکاف (crack) + بارانِ رعد
  forest: ["white", "pink"],
  wind: ["white", "pink"],
  fireplace: ["white", "pink", "brown"], // غرشِ قهوه‌ای + درخشِ صورتی + ترق‌ترقِ سفید
  ocean: ["white", "pink"],
  cafe: ["white", "pink"],
  fan: ["white", "brown"],
  train: ["white", "pink", "brown"],
  airplane: ["white", "pink", "brown"],
  car: ["white", "pink", "brown"],
  waterfall: ["white", "pink", "brown"],
  underwater: ["white", "pink", "brown"],
  rainTent: ["white", "pink"],
  library: ["white", "pink"], // ورق‌زدن (سفید) + محیط (صورتی)
  purr: ["brown"],
  space: ["white", "pink", "brown"],
  binaural: [],
  brown: ["brown"],
  white: ["white"],
  pink: ["pink"],
  green: ["white"],
  violet: ["white"],
  grey: ["pink"],
  rainGlass: ["pink"],
  pageTurn: ["pink"],
  snowfall: ["pink"],
  nightCity: ["brown"],
  typing: ["white"],
  music: ["white"],
  drone: [], // کاملاً نوسان‌سازی
  // صداهای رویدادی (زنگ/پرنده/…) بافرِ نویز لازم ندارند
  chimes: [],
  singingBowl: [],
  birds: [],
  crickets: [],
  frogs: [],
  clock: ["white", "pink"], // تیک‌تاک از قطعه‌ی سفید می‌سازد
};

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

// انتگرال‌گیر نشتی‌دار → نویز قهوه‌ای. وضعیت (state) برگردانده می‌شود تا بتوان ادامه داد.
// ضریب نشتیِ انتگرال‌گیر: ~۳۵Hz یعنی غرش بمِ کاملاً شنیدنی روی بلندگوی موبایل
export const BROWN_LEAK = 0.995;

export function brownPass(raw: Float32Array, prev: number): { out: Float32Array; state: number } {
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
export function pinkPass(raw: Float32Array, s: PinkState): { out: Float32Array; state: PinkState } {
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

export function normalizePeak(input: Float32Array, peak = 0.95): Float32Array {
  let max = 0;
  const n = input.length;
  for (let i = 0; i < n; i++) {
    const v = Math.abs(input[i]);
    if (v > max) max = v;
  }
  if (max === 0) return input;
  const k = peak / max;
  for (let i = 0; i < n; i++) input[i] *= k;
  return input;
}

/**
 * نویزی می‌سازد که *دقیقاً* با دوره‌ی `length` تکرارپذیر است.
 *
 * روش کار: فیلترهای رنگی (قهوه‌ای/صورتی) IIR پایدارند، یعنی تمام قطب‌هایشان داخل دایره‌ی
 * واحد است؛ پس اگر یک پاس را از حالت صفر بزنیم و پاس دوم را با «حالتِ پایانیِ پاس اول» شروع
 * کنیم، وضعیت فیلتر در نقطه‌ی loop عملاً به همان مقدار اولیه برگشته است (خطا در حد a^L ≈ ۰).
 * نتیجه: نمونه‌ی آخر و نمونه‌ی اول به‌هم پیوسته‌اند و loop شدن هیچ کلیک/درزی ندارد.
 *
 * بهینه‌سازی عملکرد موبایل:
 * پاس اول بدون تخصیص آرایه‌ی میانی فقط وضعیت نهایی (state) را حساب می‌کند و پاس دوم
 * به‌صورت درجا (in-place) روی آرایه‌ی اصلی فیلتر و نرمال‌سازی را انجام می‌دهد.
 * این کار تخصیص‌های سنگین حافظه و فشار روی زباله‌روب (GC) را به صفر می‌رساند.
 */
export function generateLoopNoise(length: number, kind: NoiseKind = "white", seed = 1): Float32Array {
  const n = Math.max(2, Math.floor(length));
  const rnd = mulberry32(seed);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = rnd() * 2 - 1;

  if (kind === "white") return normalizePeak(raw);

  if (kind === "brown") {
    // پاس اول بدون تخصیص حافظه
    let state = 0;
    for (let i = 0; i < n; i++) {
      state = BROWN_LEAK * state + raw[i] * 0.05;
    }
    // پاس دوم به‌صورت درجا
    let y = state;
    for (let i = 0; i < n; i++) {
      y = BROWN_LEAK * y + raw[i] * 0.05;
      raw[i] = y;
    }
    return normalizePeak(raw);
  }

  // پاس اول نویز صورتی بدون تخصیص حافظه
  let { b0, b1, b2, b3, b4, b5, b6 } = PINK_ZERO;
  for (let i = 0; i < n; i++) {
    const w = raw[i];
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    b6 = w * 0.115926;
  }
  // پاس دوم نویز صورتی به‌صورت درجا
  for (let i = 0; i < n; i++) {
    const w = raw[i];
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.16;
    b6 = w * 0.115926;
  }
  return normalizePeak(raw);
}

// ===== موتور پخش =====


/** طول بافرهای نویز (ثانیه) — به‌اندازه‌ی کافی بلند تا گوش الگوی تکراری پیدا نکند */
const WHITE_SECONDS = 12;
const PINK_SECONDS = 16;
const BROWN_SECONDS = 20;

/**
 * 🐛→✅ گزارشِ «میکسر صدا روی گوشی هنگ می‌کند»: ساختِ بافرها + گرافِ کاملِ ۴۰ باس
 * روی رشته‌ی اصلی انجام می‌شد و روی گوشیِ میان‌رده چند ثانیه طول می‌کشید.
 *
 * سه اصلاح: (۱) بافرها روی گوشی کوتاه‌تر ساخته می‌شوند (RAM/CPU کمتر؛ کیفیتِ
 * «بی‌درزِ» لوپ به طولِ بافر وابسته نیست چون فیلترهای رنگی در نقطه‌ی حلقه بسته
 * می‌شوند)، (۲) فقط باسِ صداهایی که واقعاً روشن‌اند ساخته می‌شود، (۳) ساختِ باس‌ها
 * بین چند تسک تقسیم می‌شود تا رابط کاربری قفل نشود.
 */
function bufferScale(): number {
  if (typeof navigator === "undefined") return 1;
  const nav = navigator as Navigator & { deviceMemory?: number };
  // «لمسی بودن» و «حافظهٔ کم» نشانه‌های گوشی‌اند؛ نبودِ اطلاعات یعنی دسکتاپ.
  // (تعداد هسته معیار بدی است: بعضی دستگاه‌های دسکتاپ/سرورها هم ۲ هسته گزارش می‌کنند.)
  const coarse = typeof matchMedia === "function" ? matchMedia("(pointer: coarse)").matches : false;
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  return coarse || lowMemory ? 0.5 : 1;
}

/**
 * ضریب بلندی هر لایه تا صداها در حجم‌های یکسان، هم‌تراز شنیده شوند.
 * این عددها با شبیه‌سازی همان زنجیره‌ی فیلترها بیرون از مرورگر اندازه گرفته شده‌اند:
 * با میکس پیش‌فرض، RMS خروجی حدود ۱۸- دسی‌بل و اوج آن زیر ۰ دسی‌بل می‌ماند (بدون کلیپ).
 */
const TRIM: Record<AmbientSoundId, number> = {
  rain: 0.4,
  thunder: 1.1,
  river: 0.85,
  forest: 0.85,
  wind: 0.8,
  ocean: 0.9,
  waterfall: 0.8,
  rainTent: 0.4,
  underwater: 1.0,
  birds: 1.0,
  crickets: 1.0,
  frogs: 1.0,
  fireplace: 0.9,
  cafe: 0.85,
  library: 1.0,
  clock: 1.0,
  train: 0.8,
  airplane: 0.75,
  car: 0.75,
  fan: 0.8,
  brown: 0.75,
  pink: 0.65,
  white: 0.5,
  green: 0.7,
  violet: 0.45,
  grey: 0.55,
  purr: 0.9,
  space: 0.85,
  snowfall: 0.5,
  chimes: 0.7,
  singingBowl: 0.8,
  rainGlass: 0.45,
  pageTurn: 0.6,
  nightCity: 0.5,
  typing: 0.4,
  music: 2.4, // لنگه‌های لوفای ذاتاً ظریف‌اند تا در فضای میکس آرام بنشینند
  binaural: 1.0,
  drone: 1.5, // صدای فضایی مولد — ملایم
};

export type FocusPhase = "work" | "break" | null;

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<AmbientSoundId, GainNode>> = {};
  private thunderBus: GainNode | null = null;
  private buffers: { white?: AudioBuffer; pink?: AudioBuffer; brown?: AudioBuffer } = {};
  private sources: AudioBufferSourceNode[] = [];
  private lfos: OscillatorNode[] = [];
  private binauralOsc: { left: OscillatorNode; right: OscillatorNode } | null = null;
  /** ساختِ تنبلِ باس‌ها: تا وقتی یکی در جریان است، درخواست‌ها صف می‌شوند */
  private busSync: Promise<void> | null = null;
  private busSyncQueued = false;
  private music = new GenerativeLofiEngine();
  private thunderTimer: ReturnType<typeof setTimeout> | null = null;
  private birdTimer: ReturnType<typeof setTimeout> | null = null;
  private cricketTimer: ReturnType<typeof setTimeout> | null = null;
  private fireTimer: ReturnType<typeof setTimeout> | null = null;
  private frogTimer: ReturnType<typeof setTimeout> | null = null;
  private clockTimer: ReturnType<typeof setTimeout> | null = null;
  private libraryTimer: ReturnType<typeof setTimeout> | null = null;
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private tentDropTimer: ReturnType<typeof setTimeout> | null = null;
  private chimeTimer: ReturnType<typeof setTimeout> | null = null;
  private bowlTimer: ReturnType<typeof setTimeout> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private levels: Record<AmbientSoundId, number> = defaultVolumes();
  private masterLevel = DEFAULT_AMBIENT.master;
  private binauralBand: BinauralBandId = DEFAULT_AMBIENT.binauralBand ?? "alpha";
  /** ضریب واکنش به پومودورو: فاز استراحت → صدا نرم می‌شود */
  private duck = 1;
  private started = false;

  /** آیا موتور در حال پخش است؟ */
  get playing(): boolean {
    return this.started && this.ctx?.state === "running";
  }

  getLevels(): Record<AmbientSoundId, number> {
    return { ...this.levels };
  }

  /** ساخت/بازگردانی Context و شروع پخش؛ اگر مرورگر اجازه ندهد false برمی‌گرداند */
  async start(
    levels?: Partial<Record<AmbientSoundId, number>> | null,
    master?: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<boolean> {
    const Ctor = audioCtor();
    if (!Ctor) return false;
    if (levels) this.levels = normalizeVolumes(levels);
    if (master !== undefined) this.masterLevel = clampLevel(master);
    try {
      if (!this.ctx) {
        // ⚡ اگر کاربر در همان اشاره (لمس دکمهٔ پخش) کانتکست را آماده کرده باشد،
        // همان را برمی‌داریم: روی iOS، resume خارج از ژستِ کاربر رد می‌شود و پخش
        // «هیچ اتفاقی نمی‌افتد» می‌شد. وگرنه کانتکستِ تازه با تأخیرِ پخش (CPU کمتر).
        this.ctx = primedAudioContext() ?? createAudioContext(Ctor);
        this.buildCore(); // سبک: فقط زنجیره‌ی خروجی — باس‌ها تنبل ساخته می‌شوند
      }
      if (this.suspendTimer) {
        clearTimeout(this.suspendTimer);
        this.suspendTimer = null;
      }
      if (this.ctx.state !== "running") await this.ctx.resume();
      if (this.ctx.state !== "running") return false;
      this.started = true;
      // 🐛→✅ فقط صداهای روشن ساخته می‌شوند، آن هم تدریجی (بدون هنگ‌کردن رابط کاربری)
      await this.buildBuses(this.enabledBusIds(), onProgress);
      this.applyLevels(0.9); // fade in نرم تا صدا «پرتاب» نشود
      this.scheduleEvents(true);
      return true;
    } catch (e) {
      console.warn("ambient start failed", e);
      return false;
    }
  }

  /** توقف با fade out کوتاه، سپس suspend کردن Context تا CPU/باتری مصرف نشود */
  stop(): void {
    this.started = false;
    this.clearAllEventTimers();
    this.music.setEnabled(false);
    // 🐛→✅ لایه‌ی دِرون قبلاً با توقفِ میکسر خاموش نمی‌شد (نوسان‌سازها روشن می‌ماندند).
    try {
      droneEngine.stop();
    } catch (e) {
      console.warn("drone engine stop failed", e);
    }
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
    // صدای تازه‌روشن‌شده باسش هنوز ساخته نشده — همین‌جا (تنبل) ساخته می‌شود
    this.syncBuses();
    if (this.started) this.scheduleEvents();
  }

  setLevels(values: Record<AmbientSoundId, number>): void {
    this.levels = normalizeVolumes(values);
    this.applyLevels();
    this.syncBuses();
    if (this.started) this.scheduleEvents();
  }

  setMaster(value: number): void {
    this.masterLevel = clampLevel(value);
    this.applyLevels();
  }

  /** باند ضربان دوگوشی (آلفا/بتا/تتا/دلتا) — تغییرِ زنده‌ی فرکانس */
  setBinauralBand(band: BinauralBandId): void {
    this.binauralBand = band;
    const osc = this.binauralOsc;
    const ctx = this.ctx;
    if (osc && ctx) {
      try {
        const t = ctx.currentTime;
        osc.right.frequency.cancelScheduledValues(t);
        osc.right.frequency.setValueAtTime(osc.right.frequency.value, t);
        osc.right.frequency.linearRampToValueAtTime(BINAURAL_BASE_HZ + binauralBeatOf(band), t + 0.5);
      } catch {
        osc.right.frequency.value = BINAURAL_BASE_HZ + binauralBeatOf(band);
      }
    }
  }

  /** واکنش به فاز پومودورو: در استراحت صدا نرم می‌شود و در کار به حجمِ خودِ کاربر برمی‌گردد */
  setFocusPhase(phase: FocusPhase, enabled: boolean): void {
    const next = enabled && phase === "break" ? 0.45 : 1;
    if (Math.abs(next - this.duck) < 0.001) return;
    this.duck = next;
    this.applyLevels();
  }

  get duckLevel(): number {
    return this.duck;
  }

  // ----- ساخت گراف صوتی -----

  /**
   * بافرِ نویز فقط برای رنگ‌هایی که صدایِ درخواست‌شده لازم دارد ساخته می‌شود.
   * (قبلاً هر سه رنگ همیشه ساخته می‌شدند، حتی وقتی کاربر فقط «باران» را روشن کرده بود.)
   */
  private ensureBuffers(kinds: NoiseKind[]): void {
    const ctx = this.ctx!;
    const scale = bufferScale();
    const make = (seconds: number, kind: NoiseKind, seed: number): AudioBuffer => {
      const len = Math.max(1024, Math.floor(ctx.sampleRate * seconds * scale));
      const data = generateLoopNoise(len, kind, seed);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      // copyToChannel در بعضی تایپ‌ها/مرورگرهای قدیمی نیست؛ set() همیشه کار می‌کند
      buf.getChannelData(0).set(data);
      return buf;
    };
    for (const kind of kinds) {
      if (this.buffers[kind]) continue;
      if (kind === "white") this.buffers.white = make(WHITE_SECONDS, "white", 0x5eed);
      else if (kind === "pink") this.buffers.pink = make(PINK_SECONDS, "pink", 0x9a37);
      else this.buffers.brown = make(BROWN_SECONDS, "brown", 0x1b4d);
    }
  }

  /**
   * بافرهای لازمِ هر صدا — «تک‌منبعِ حقیقت».
   *
   * 🐛→✅ این نگاشت قبلاً دستی و نادرست بود: مثلاً «شومینه» بافرِ قهوه‌ای می‌خواست
   * ولی فقط سفید/صورتی ساخته می‌شد؛ نتیجه این‌که `loop()` روی بافرِ undefined خطا
   * می‌داد، `start()` بی‌صدا false می‌شد و کاربر «هیچ صدایی» نمی‌شنید (گزارش کاربر:
   * میکسر روی گوشی کار نمی‌کند). حالا تستِ `ambient-buffer-kinds.test.ts` همین
   * نگاشت را با کدِ واقعیِ سازنده‌ها مقابله می‌کند تا دوباره از هم جدا نشوند.
   */
  private buffersFor(id: AmbientSoundId): NoiseKind[] {
    return AMBIENT_BUFFER_KINDS[id] ?? [];
  }

  /**
   * صبر تا پایان ساختِ باس‌های در جریان (برای تست‌ها و برای UI که می‌خواهد بداند
   * صداها آماده‌اند). ساختِ تدریجی است، پس «آماده بودن» یک نقطه‌ی زمانی مشخص ندارد.
   */
  async settle(): Promise<void> {
    while (this.busSync) await this.busSync;
  }

  /** ساختِ اسکلتِ خروجی (سبک) — بدون هیچ باسِ صدایی */
  private buildCore(): void {
    const ctx = this.ctx!;
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
  }

  /** ساختِ یک باسِ صدا (تنها وقتی لازم شود) */
  private createBus(id: AmbientSoundId, dest: AudioNode): GainNode {
    switch (id) {
      case "rain": return this.buildRain(dest);
      case "river": return this.buildRiver(dest);
      case "thunder": {
        const bus = this.buildThunder(dest);
        this.thunderBus = bus;
        return bus;
      }
      case "forest": return this.buildForest(dest);
      case "wind": return this.buildWind(dest);
      case "fireplace": return this.buildFireplace(dest);
      case "ocean": return this.buildOcean(dest);
      case "cafe": return this.buildCafe(dest);
      case "fan": return this.buildFan(dest);
      case "train": return this.buildTrain(dest);
      case "airplane": return this.buildAirplane(dest);
      case "car": return this.buildCar(dest);
      case "waterfall": return this.buildWaterfall(dest);
      case "underwater": return this.buildUnderwater(dest);
      case "rainTent": return this.buildRainTent(dest);
      case "library": return this.buildLibrary(dest);
      case "purr": return this.buildPurr(dest);
      case "space": return this.buildSpace(dest);
      case "binaural": return this.buildBinaural(dest);
      case "brown": return this.buildNoiseLayer(dest, this.buffers.brown!, "brown");
      case "white": return this.buildNoiseLayer(dest, this.buffers.white!, "white");
      case "pink": return this.buildNoiseLayer(dest, this.buffers.pink!, "pink");
      // نویز سبز: باند میانیِ طبیعی (۲۰۰–۲۰۰۰ هرتز) — از نویز سفید فیلترشده
      case "green": return this.buildColoredNoise(dest, this.buffers.white!, 200, 2000);
      // نویز بنفش: فرکانس‌های بالا تقویت‌شده — برای Tinnitus masking
      case "violet": return this.buildColoredNoise(dest, this.buffers.white!, 5000, 18000);
      // نویز خاکستری: ادراک یکنواخت — فلتِ شنیداری
      case "grey": return this.buildGreyNoise(dest);
      // باران روی شیشه / ورق‌زدن / برف / شب شهری / تایپ
      case "rainGlass": return this.buildColoredNoise(dest, this.buffers.pink!, 800, 5000);
      case "pageTurn": return this.buildColoredNoise(dest, this.buffers.pink!, 2000, 6000);
      case "snowfall": return this.buildColoredNoise(dest, this.buffers.pink!, 30, 1200);
      case "nightCity": return this.buildColoredNoise(dest, this.buffers.brown!, 40, 400);
      case "typing": return this.buildColoredNoise(dest, this.buffers.white!, 2000, 5000);
      // موتور موسیقی تولیدی — خروجی‌اش روی باسِ مخصوص خودش می‌نشیند
      case "music": {
        const bus = this.emptyBus(dest);
        this.music.attach(this.ctx!, bus, this.buffers.white ?? null);
        return bus;
      }
      // موتور Ambient/Drone مولد — فقط اگر روشن باشد فعال می‌شود
      case "drone": {
        const bus = this.emptyBus(dest);
        if ((this.levels.drone ?? 0) > 0.001) droneEngine.start(bus, this.ctx!);
        return bus;
      }
      // بادچیم/کاسه تبتی/صداهای رویدادی: باسِ ساکت (رویدادها روی آن ساخته می‌شوند)
      case "chimes":
      case "singingBowl":
      case "birds":
      case "crickets":
      case "frogs":
      case "clock":
      default:
        return this.emptyBus(dest);
    }
  }

  /** صداهایی که الان حجمشان صفر نیست — فقط همین‌ها ساخته می‌شوند */
  private enabledBusIds(): AmbientSoundId[] {
    return AMBIENT_IDS.filter((id) => (this.levels[id] ?? 0) > 0.001 && !this.buses[id]);
  }

  /**
   * یک نفس به رشته‌ی اصلی: رابط کاربری (اسلایدر/دکمه) فرصت رندر پیدا می‌کند.
   * اولویت: scheduler.yield → MessageChannel → setTimeout. (MessageChannel عمداً
   * مقدم است: به تایمرِ مرورگر گره نمی‌خورد و در تست‌های با تایمر جعلی هم کار می‌کند.)
   */
  private yieldToUi(): Promise<void> {
    const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (typeof sched?.yield === "function") return sched.yield().catch(() => undefined) as Promise<void>;
    if (typeof MessageChannel === "function") {
      return new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          resolve();
        };
        channel.port2.postMessage(null);
      });
    }
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  /**
   * ساختِ تدریجیِ باس‌ها: بین هر باس به حلقه‌ی رویداد برمی‌گردیم تا «هنگ» نشود.
   * اگر قطعه‌ای بسازد و کاربر همان‌جا میکس را عوض کند، باس‌های نو در syncBuses می‌آیند.
   */
  private async buildBuses(ids: AmbientSoundId[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const master = this.master;
    if (!master) return;
    let done = 0;
    for (const id of ids) {
      if (!this.buses[id]) {
        this.ensureBuffers(this.buffersFor(id));
        this.buses[id] = this.createBus(id, master);
        this.applyLevels(0.25); // صدای همان باسِ تازه، بلافاصله نرم بالا می‌آید
      }
      done++;
      onProgress?.(done, ids.length);
      if (done < ids.length) await this.yieldToUi();
    }
  }

  /**
   * همگام‌سازیِ باس‌ها با میکسِ فعلی: صداهایی که کاربر تازه روشن کرده، این‌جا
   * (تنبل و تدریجی) ساخته می‌شوند. اگر همین حالا یک همگام‌سازی در جریان باشد،
   * درخواست بعدی در یک دور دیگر اجرا می‌شود تا ساختِ هم‌زمانِ تکراری رخ ندهد.
   */
  private syncBuses(): void {
    if (!this.started || !this.ctx || !this.master) return;
    if (this.busSync) {
      this.busSyncQueued = true;
      return;
    }
    const missing = this.enabledBusIds();
    if (missing.length === 0) return;
    this.busSync = this.yieldToUi()
      .then(() => this.buildBuses(this.enabledBusIds()))
      .catch((e) => console.warn("ambient bus build failed", e))
      .finally(() => {
        this.busSync = null;
        if (this.busSyncQueued) {
          this.busSyncQueued = false;
          this.syncBuses();
        }
      });
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

  /**
   * لایه‌ی ساده‌ی یک رنگِ نویز به‌تنهایی (سفید/صورتی/قهوه‌ای):
   * فقط لبه‌های شنوایی تمیز می‌شوند (زیرِ شنوایی + صدایِ بیش‌ازحدِ بالا).
   */
  private buildNoiseLayer(dest: AudioNode, buffer: AudioBuffer, kind: NoiseKind): GainNode {
    const bus = this.ctx!.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    const src = this.loop(buffer);
    // هر رنگ لبه‌ی بالای مخصوص خودش را دارد تا «شخصیت»‌اش حفظ شود
    const topHz = kind === "white" ? 15500 : kind === "pink" ? 12500 : 900;
    src
      .connect(this.filter("highpass", 22, 0.7))
      .connect(this.filter("lowpass", topHz, 0.7))
      .connect(bus);
    return bus;
  }

  /** نویز رنگیِ دلخواه: سفید یا صورتی با باندپس مشخص */
  private buildColoredNoise(dest: AudioNode, buffer: AudioBuffer, lowHz: number, highHz: number): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    const modGain = ctx.createGain();
    modGain.gain.value = 0.35;
    const src = this.loop(buffer);
    src
      .connect(this.filter("highpass", lowHz, 0.7))
      .connect(this.filter("lowpass", highHz, 0.7))
      .connect(modGain)
      .connect(bus);
    // LFO کند برای طبیعی‌تر شدن روی گین داخلی
    this.lfo(0.04 + Math.random() * 0.03, 0.08, modGain.gain);
    return bus;
  }

  /** نویز خاکستری: با چند باند فیلتر موازی سعی می‌کند ادراک یکنواخت بسازد */
  private buildGreyNoise(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    const sum = ctx.createGain();
    sum.gain.value = 0.35;
    sum.connect(bus);
    // باند بم
    const low = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("lowpass", 300, 0.7))
      .connect(low)
      .connect(sum);
    low.gain.value = 0.4;
    // باند میانی
    const mid = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 1500, 1.2))
      .connect(mid)
      .connect(sum);
    mid.gain.value = 0.3;
    // باند بالا
    const high = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 5000, 1.5))
      .connect(high)
      .connect(sum);
    high.gain.value = 0.2;
    // مدولاسیون روی گین داخلی
    this.lfo(0.025, 0.06, sum.gain);
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

  /** باسِ ساکت برای صداهای کاملاً «رویدادی» (پرنده/جیرجیرک/قورباغه/ساعت) که لایه‌ی پیوسته ندارند */
  private emptyBus(dest: AudioNode): GainNode {
    const bus = this.ctx!.createGain();
    bus.gain.value = 0;
    bus.connect(dest);
    return bus;
  }

  /** جنگل: نسیمِ ملایم زیر تاج درختان + خش‌خش‌های ریز برگ */
  private buildForest(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // نسیم در تاج درختان: بدنه‌ی صورتیِ بم با موجِ کُند
    const canopy = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 40, 0.7))
      .connect(this.filter("lowpass", 700, 0.8))
      .connect(canopy)
      .connect(bus);
    this.lfo(0.06, 0.14, canopy.gain, 0.7);
    this.lfo(0.021, 0.05, canopy.gain);

    // خش‌خش برگ: باند باریکِ میانی با tremoloی تند و نامنظم
    const rustle = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("bandpass", 2900, 3))
      .connect(rustle)
      .connect(bus);
    rustle.gain.value = 0.16;
    this.lfo(0.4, 0.07, rustle.gain);
    this.lfo(1.6, 0.045, rustle.gain);

    // شاخ‌وبرگِ دورتر: بمِ میانی ملایم
    const bough = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 480, 1.6))
      .connect(bough)
      .connect(bus);
    this.lfo(0.09, 0.05, bough.gain, 0.18);

    return bus;
  }

  /** باد: بدنه‌ی بم با جابه‌جاییِ طیف (گست‌ها) + لایه‌ی هواییِ سوت‌مانند */
  private buildWind(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بدنه‌ی باد: نویز صورتی که برشِ زیرِ آن کم‌وکم می‌شود (وزشِ تند/آرام)
    const gust = ctx.createGain();
    const lp = this.filter("lowpass", 650, 0.7);
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 35, 0.7))
      .connect(lp)
      .connect(gust)
      .connect(bus);
    this.lfo(0.05, 320, lp.frequency);
    this.lfo(0.11, 0.16, gust.gain, 0.8);

    // لایه‌ی «سوتِ» باد: باند باریک که مرکزش می‌لرزد تا صدای عبور هوا دهد
    const air = ctx.createGain();
    const bp = this.filter("bandpass", 950, 2.2);
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 300, 0.7))
      .connect(bp)
      .connect(air)
      .connect(bus);
    air.gain.value = 0.16;
    this.lfo(0.09, 620, bp.frequency);
    this.lfo(0.23, 0.05, air.gain);

    return bus;
  }

  /** شومینه: غرشِ بمِ آرامِ آتش + ترق‌وتروقِ تصادفیِ چوب (روی یک زمان‌بند) */
  private buildFireplace(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // غرشِ آتش: بمِ قهوه‌ایِ گرم با درخششِ کُند
    const roar = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 22, 0.7))
      .connect(this.filter("lowpass", 150, 0.9))
      .connect(roar)
      .connect(bus);
    this.lfo(0.07, 0.13, roar.gain, 0.5);
    this.lfo(0.4, 0.05, roar.gain);

    // لایه‌ی «درخش»ِ زیرینِ آتش
    const glow = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 900, 0.6))
      .connect(glow)
      .connect(bus);
    this.lfo(0.55, 0.09, glow.gain, 0.28);

    return bus;
  }

  /** امواج ساحل: ورود/خروجِ آب با پاکتِ بلندِ موج‌ها */
  private buildOcean(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // «شرشرِ» شکستن موج: بدنه‌ی صورتی که حجمش با ریتمِ موج بالا/پایین می‌رود
    const swell = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 30, 0.7))
      .connect(this.filter("lowpass", 600, 0.7))
      .connect(swell)
      .connect(bus);
    this.lfo(0.055, 0.3, swell.gain, 0.35); // موجِ بلندِ رفت‌وبرگشت
    this.lfo(0.16, 0.12, swell.gain);

    // «کفِ» اوجِ موج: هیسِ بالای موج که هم‌زمان با اوج بلند می‌شود
    const foam = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 2000, 0.7))
      .connect(this.filter("bandpass", 4300, 2))
      .connect(foam)
      .connect(bus);
    foam.gain.value = 0.06;
    this.lfo(0.055, 0.05, foam.gain);
    this.lfo(0.3, 0.03, foam.gain);

    return bus;
  }

  /** کافه: همهمه‌ی بسیار ملایم و پس‌زمینه‌ایِ جمعیت — چند لایه‌ی مستقل و دگرگون‌شونده */
  private buildCafe(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // «زمزمه»ی اصلی مردم: نویز صورتیِ باند میانی که سطحش آرام جابه‌جا می‌شود
    const murmur = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 900, 0.5))
      .connect(murmur)
      .connect(bus);
    this.lfo(0.13, 0.12, murmur.gain, 0.8);
    this.lfo(0.7, 0.05, murmur.gain);

    // لایه‌ی دومِ گفت‌وگو (با فاصله‌ی کمی متفاوت تا یکدست نشود)
    const talk = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 1600, 0.9))
      .connect(talk)
      .connect(bus);
    this.lfo(0.19, 0.09, talk.gain, 0.45);

    // خش‌خشِ تُنُکِ ظرف‌ها: هیسِ خیلی پایین
    const clinkBed = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 4000, 0.7))
      .connect(clinkBed)
      .connect(bus);
    this.lfo(0.3, 0.02, clinkBed.gain, 0.03);

    return bus;
  }

  /** پنکه: هم‌همِ یکنواخت و مینیمال (باندِ پهنِ کوتاه‌شده با لرزشِ محسوسِ خیلی کم) */
  private buildFan(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    const fan = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 150, 0.7))
      .connect(this.filter("lowpass", 950, 0.7))
      .connect(fan)
      .connect(bus);
    fan.gain.value = 0.85;
    // لرزشِ تقریباً نامحسوس تا حتی همین «ماشینِ نویز» هم مصنوعیِ ساکن نباشد
    this.lfo(0.9, 0.02, fan.gain);

    // کمی «وزوز»یِ ماشینیِ بم
    const hum = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 90, 0.9))
      .connect(hum)
      .connect(bus);
    hum.gain.value = 0.3;

    return bus;
  }

  /** قطار: غرشِ حرکت + ریتمِ ریل (بوژی‌ها روی درزهای ریل) */
  private buildTrain(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // غرشِ حرکت: بمِ قهوه‌ای با نوسانِ خیلی کُند
    const rumble = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 24, 0.7))
      .connect(this.filter("lowpass", 170, 0.9))
      .connect(rumble)
      .connect(bus);
    this.lfo(0.05, 0.1, rumble.gain, 0.85);

    // ریتمِ ریل: «کاترُک… کاترُک» — دو LFO با فرکانس نسبت ۲:۱ روی یک باندِ میانی
    const clack = ctx.createGain();
    const bp = this.filter("bandpass", 750, 1.1);
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 180, 0.7))
      .connect(bp)
      .connect(clack)
      .connect(bus);
    this.lfo(1.55, 0.3, clack.gain, 0.42);
    this.lfo(3.1, 0.14, clack.gain);

    // سوتِ ریزِ ریل در سرعت، خیلی خفیف
    const whine = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("bandpass", 2500, 4))
      .connect(whine)
      .connect(bus);
    whine.gain.value = 0.05;
    this.lfo(0.17, 0.02, whine.gain);

    return bus;
  }

  /** کابین هواپیما: وزوزِ پیوسته‌ی موتور + هیسِ تهویه + هامِ بم */
  private buildAirplane(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بدنه‌ی موتور: قهوه‌ایِ بم با نوسانِ خیلی کُند (تغییر دورِ موتور)
    const drone = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 26, 0.7))
      .connect(this.filter("lowpass", 260, 0.8))
      .connect(drone)
      .connect(bus);
    this.lfo(0.11, 0.07, drone.gain, 0.9);

    // هیسِ تهویه/باد بیرون: صورتی در باندِ بالا
    const air = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 700, 0.7))
      .connect(this.filter("lowpass", 4200, 0.7))
      .connect(air)
      .connect(bus);
    air.gain.value = 0.16;
    this.lfo(0.23, 0.03, air.gain);

    // هامِ پایدارِ الکتریکی ۱۲۰ هرتز — «قلب» کابین
    const humOsc = ctx.createOscillator();
    humOsc.type = "sine";
    humOsc.frequency.value = 120;
    const hum = ctx.createGain();
    hum.gain.value = 0.035;
    humOsc.connect(hum).connect(bus);
    humOsc.start(0);
    this.lfos.push(humOsc);

    return bus;
  }

  /** سفر جاده‌ای: غرشِ موتور + جاده + هیسِ باد آرام کنار پنجره */
  private buildCar(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // جاده: صورتیِ بم-میانی با نوسانِ کُند (جاده‌های متفاوت!)
    const road = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 45, 0.7))
      .connect(this.filter("lowpass", 620, 0.7))
      .connect(road)
      .connect(bus);
    this.lfo(0.045, 0.13, road.gain, 0.75);

    // موتور: بمِ قهوه‌ای یکنواخت
    const engine = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 130, 0.9))
      .connect(engine)
      .connect(bus);
    engine.gain.value = 0.45;

    // بادِ کنار شیشه، خیلی نرم
    const leak = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 1500, 0.7))
      .connect(this.filter("lowpass", 6000, 0.7))
      .connect(leak)
      .connect(bus);
    leak.gain.value = 0.05;
    this.lfo(0.09, 0.02, leak.gain);

    return bus;
  }

  /** آبشار: دیوارِ آب — سفیدِ پهن + بدنه‌ی صورتی + پایه‌ی قهوه‌ای */
  private buildWaterfall(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // پرده‌ی اصلی آب
    const sheet = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 300, 0.7))
      .connect(this.filter("lowpass", 9000, 0.7))
      .connect(sheet)
      .connect(bus);
    this.lfo(0.07, 0.12, sheet.gain, 0.8);

    // بدنه‌ی سنگینِ سقوط
    const mass = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("lowpass", 850, 0.8))
      .connect(mass)
      .connect(bus);
    this.lfo(0.11, 0.1, mass.gain, 0.55);

    // لرزشِ زمینیِ زیر آبشار
    const ground = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 120, 0.9))
      .connect(ground)
      .connect(bus);
    ground.gain.value = 0.3;

    return bus;
  }

  /** زیر آب: فشارِ خفه‌ی آبی + حباب‌های رویدادی */
  private buildUnderwater(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // «فشار» آب: صورتیِ خیلی خفه با تنفسِ کُند
    const pressure = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("lowpass", 210, 0.9))
      .connect(pressure)
      .connect(bus);
    this.lfo(0.05, 0.12, pressure.gain, 0.85);

    // عمق: بمِ قهوه‌ایِ یکدست
    const depth = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 95, 0.9))
      .connect(depth)
      .connect(bus);
    depth.gain.value = 0.4;

    // سوسوی نورِ آب: باندِ باریکِ بسیار آرام
    const shimmer = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("bandpass", 1200, 3))
      .connect(shimmer)
      .connect(bus);
    shimmer.gain.value = 0.05;
    this.lfo(0.13, 0.045, shimmer.gain);

    return bus;
  }

  /** باران روی چادر: بارانِ نرم + تپ‌وتیپِ رویدادی قطره‌ها روی پارچه */
  private buildRainTent(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بارانِ میدانِ نزدیک‌تر از لایه‌ی open-air: بم‌تر و فشرده‌تر
    const patter = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 90, 0.7))
      .connect(this.filter("bandpass", 760, 0.6))
      .connect(patter)
      .connect(bus);
    this.lfo(0.1, 0.13, patter.gain, 0.75);

    // هیسِ نرمِ باران اطراف
    const around = ctx.createGain();
    this.loop(this.buffers.white!)
      .connect(this.filter("highpass", 520, 0.7))
      .connect(this.filter("lowpass", 5400, 0.7))
      .connect(around)
      .connect(bus);
    around.gain.value = 0.2;
    this.lfo(0.16, 0.06, around.gain);

    return bus;
  }

  /** کتابخانه: سکوتِ «پُر» اتاق مطالعه + ورق‌خوردنِ رویدادی */
  private buildLibrary(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // «سکوتِ پر»: room-tone بسیار ظریف تا فضا مُرده نباشد
    const room = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("highpass", 70, 0.7))
      .connect(this.filter("lowpass", 380, 0.8))
      .connect(room)
      .connect(bus);
    room.gain.value = 0.14;
    this.lfo(0.04, 0.04, room.gain);

    return bus;
  }

  /** خرخر گربه: بمِ لرزان در ریتمِ ۲۰–۳۰ هرتز + تنفسِ بسیار کُند */
  private buildPurr(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // بدنه‌ی خرخر: قهوه‌ایِ بم
    const lp = this.filter("lowpass", 380, 0.8);
    const purr = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 30, 0.7))
      .connect(lp)
      .connect(purr)
      .connect(bus);
    // لرزشِ سریعِ خودِ خرخر (تریل)
    this.lfo(23, 0.34, purr.gain, 0.6);
    // در باز و بسته شدنِ فیلتر، لرزه‌ی نرمِ تند
    this.lfo(23, 130, lp.frequency);
    // نفسِ گربه: خیلی کُند
    this.lfo(0.21, 0.08, purr.gain);

    // زیرِ بمِ یکدست
    const sub = ctx.createGain();
    this.loop(this.buffers.brown!)
      .connect(this.filter("lowpass", 85, 0.9))
      .connect(sub)
      .connect(bus);
    sub.gain.value = 0.35;

    return bus;
  }

  /** زمزمه‌ی فضا: درونِ عمیق — قهوه‌ایِ خیلی بم با سوسوی آهسته‌ی طیف */
  private buildSpace(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    // درونِ اصلی
    const drone = ctx.createGain();
    const lp = this.filter("lowpass", 320, 0.6);
    this.loop(this.buffers.brown!)
      .connect(this.filter("highpass", 20, 0.7))
      .connect(lp)
      .connect(drone)
      .connect(bus);
    drone.gain.value = 0.85;
    // سوسوی بسیار کُندِ طیف — حسِ حرکت در خلأ
    this.lfo(0.028, 210, lp.frequency);
    this.lfo(0.05, 0.09, drone.gain);

    // برقِ دورِ کهکشان: باندِ باریکِ بسیار ظریف
    const halo = ctx.createGain();
    this.loop(this.buffers.pink!)
      .connect(this.filter("bandpass", 900, 5))
      .connect(halo)
      .connect(bus);
    halo.gain.value = 0.04;
    this.lfo(0.07, 0.03, halo.gain);

    return bus;
  }

  /** ضربان دوگوشی: دو اسیلاتور خالص با اختلافِ چند هرتز، پن به دو گوش */
  private buildBinaural(dest: AudioNode): GainNode {
    const ctx = this.ctx!;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(dest);

    const beat = binauralBeatOf(this.binauralBand);
    const left = ctx.createOscillator();
    left.type = "sine";
    left.frequency.value = BINAURAL_BASE_HZ;
    const right = ctx.createOscillator();
    right.type = "sine";
    right.frequency.value = BINAURAL_BASE_HZ + beat;

    // تون‌ها به‌سرعت خسته‌کننده‌اند؛ هر دو را خیلی کم به‌هر گوش می‌دهیم
    const gL = ctx.createGain();
    gL.gain.value = 0.09;
    const gR = ctx.createGain();
    gR.gain.value = 0.09;

    if (typeof ctx.createStereoPanner === "function") {
      const panL = ctx.createStereoPanner();
      panL.pan.value = -1;
      const panR = ctx.createStereoPanner();
      panR.pan.value = 1;
      left.connect(gL).connect(panL).connect(bus);
      right.connect(gR).connect(panR).connect(bus);
    } else {
      // مرورگرهای قدیمی: بدون جداسازی (فقط ضربانِ مونو)
      left.connect(gL).connect(bus);
      right.connect(gR).connect(bus);
    }
    left.start(0);
    right.start(0);
    this.lfos.push(left, right);
    this.binauralOsc = { left, right };

    return bus;
  }

  // ----- زمان‌بندهای رویدادی: رعد، پرنده، جیرجیرک، آتش، قورباغه، ساعت، کاغذ و حباب ----

  /** همه‌ی صداهایِ رویدادی را زمان‌بندی می‌کند (بسته به اینکه کدام حجم دارند) */
  private scheduleEvents(first = false): void {
    this.scheduleThunder(first);
    this.scheduleBirds();
    this.scheduleCrickets();
    this.scheduleFire();
    this.scheduleFrogs();
    this.scheduleClock();
    this.scheduleLibrary();
    this.scheduleBubbles();
    this.scheduleTentDrops();
    this.scheduleChimes();
    this.scheduleBowl();
  }

  private clearAllEventTimers(): void {
    this.clearThunderTimer();
    this.clearBirdTimer();
    this.clearCricketTimer();
    this.clearFireTimer();
    this.clearFrogTimer();
    this.clearClockTimer();
    this.clearLibraryTimer();
    this.clearBubbleTimer();
    this.clearTentDropTimer();
    this.clearChimeTimer();
    this.clearBowlTimer();
  }

  private clearBirdTimer(): void {
    if (this.birdTimer !== null) {
      clearTimeout(this.birdTimer);
      this.birdTimer = null;
    }
  }

  private clearCricketTimer(): void {
    if (this.cricketTimer !== null) {
      clearTimeout(this.cricketTimer);
      this.cricketTimer = null;
    }
  }

  private clearFireTimer(): void {
    if (this.fireTimer !== null) {
      clearTimeout(this.fireTimer);
      this.fireTimer = null;
    }
  }

  private clearFrogTimer(): void {
    if (this.frogTimer !== null) {
      clearTimeout(this.frogTimer);
      this.frogTimer = null;
    }
  }

  private clearClockTimer(): void {
    if (this.clockTimer !== null) {
      clearTimeout(this.clockTimer);
      this.clockTimer = null;
    }
  }

  private clearLibraryTimer(): void {
    if (this.libraryTimer !== null) {
      clearTimeout(this.libraryTimer);
      this.libraryTimer = null;
    }
  }

  private clearBubbleTimer(): void {
    if (this.bubbleTimer !== null) {
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
  }

  private clearTentDropTimer(): void {
    if (this.tentDropTimer !== null) {
      clearTimeout(this.tentDropTimer);
      this.tentDropTimer = null;
    }
  }

  private clearChimeTimer(): void {
    if (this.chimeTimer !== null) {
      clearTimeout(this.chimeTimer);
      this.chimeTimer = null;
    }
  }

  private clearBowlTimer(): void {
    if (this.bowlTimer !== null) {
      clearTimeout(this.bowlTimer);
      this.bowlTimer = null;
    }
  }

  // --- بادچیم (Wind chimes) ---
  //
  // 🐛→✅ این صدا (و «کاسه تبتی») قبلاً هیچ صدایی نداشت: در فهرست میکسر و پریست‌ها
  // بود ولی نه باسش صدا می‌ساخت و نه رویدادی زمان‌بندی می‌شد — کاربر انتخاب می‌کرد
  // و سکوتِ کامل می‌شنید. حالا با نوسان‌ساز + میرایی نمایی ساخته می‌شوند.

  private scheduleChimes(): void {
    this.clearChimeTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.chimes;
    if (level <= 0.001) return; // خاموش ⇒ هیچ تایمری کوک نمی‌شود
    // فاصله‌ها تصادفی‌اند تا ریتمِ مصنوعی حس نشود (هرچه بلندتر، بیشتر)
    const gap = Math.max(900, 2600 + Math.random() * 6400 - level * 1200);
    this.chimeTimer = setTimeout(() => {
      this.chimeTimer = null;
      this.chimeStrike(level);
      this.scheduleChimes();
    }, gap);
  }

  /** یک «نسیم» روی بادچیم: ۲ تا ۴ نتِ پشت‌سرهم */
  private chimeStrike(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.chimes;
    if (!ctx || !bus || !this.started) return;
    const count = 2 + Math.floor(Math.random() * 3);
    const amp = 0.075 * (0.5 + level * 0.5);
    let at = ctx.currentTime + 0.02 + Math.random() * 0.25;
    for (let i = 0; i < count; i++) {
      this.chimeNote(at, bus, amp);
      at += 0.14 + Math.random() * 0.5;
    }
  }

  /** یک نتِ زنگوله‌ای: پایه + دو جزئیِ فلزی، با حمله‌ی تیز و میراییِ نرم */
  private chimeNote(t0: number, bus: GainNode, amp: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // گامِ پنتاتونیکِ دو ماژور (دو، ر، می، سل، لا) — هر ترکیبی خوش‌صدا است
    const scale = [523.25, 587.33, 659.25, 783.99, 880];
    const freq = scale[Math.floor(Math.random() * scale.length)] / (Math.random() < 0.25 ? 2 : 1);
    const dur = 1.6 + Math.random() * 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(bus);
    const partials: [number, number][] = [[1, 1], [2.76, 0.32], [5.4, 0.14]];
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (const [mult, rel] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const pg = ctx.createGain();
      pg.gain.value = rel;
      osc.connect(pg).connect(g);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      oscs.push(osc);
      gains.push(pg);
    }
    oscs[oscs.length - 1].onended = () => {
      try {
        oscs.forEach((o) => o.disconnect());
        gains.forEach((n) => n.disconnect());
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- کاسه تبتی (Singing bowl) ---

  private scheduleBowl(): void {
    this.clearBowlTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.singingBowl;
    if (level <= 0.001) return;
    // یک ضربه هر ۱۰ تا ۲۰ ثانیه؛ با حجمِ بیشتر کمی نزدیک‌تر
    const gap = Math.max(5000, 12000 + Math.random() * 9000 - level * 2500);
    this.bowlTimer = setTimeout(() => {
      this.bowlTimer = null;
      this.bowlStrike(level);
      this.scheduleBowl();
    }, gap);
  }

  /** ضربه‌ی کاسه: دو جزئیِ کمی ناهمساز (ضربانِ آرام) + میراییِ بسیار بلند */
  private bowlStrike(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.singingBowl;
    if (!ctx || !bus || !this.started) return;
    const base = 196 + Math.random() * 70; // سل۲ تا دو۳ — کاسه‌های بزرگ‌تر بم‌ترند
    const dur = 9 + Math.random() * 5;
    const t0 = ctx.currentTime + 0.05;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.1 * (0.5 + level * 0.5), t0 + 0.3); // حمله‌ی نرم
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(bus);
    const partials: [number, number][] = [[1, 1], [1.004, 0.75], [2.71, 0.2], [5.18, 0.07]];
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    for (const [mult, rel] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = base * mult;
      const pg = ctx.createGain();
      pg.gain.value = rel;
      osc.connect(pg).connect(g);
      osc.start(t0);
      osc.stop(t0 + dur + 0.1);
      oscs.push(osc);
      gains.push(pg);
    }
    oscs[oscs.length - 1].onended = () => {
      try {
        oscs.forEach((o) => o.disconnect());
        gains.forEach((n) => n.disconnect());
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- پرندگان ---

  private scheduleBirds(): void {
    this.clearBirdTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.birds;
    if (level <= 0.001) return; // خاموش است؛ صدایی زمان‌بندی نمی‌شود
    // هرچه حجم بیشتر → پرنده‌ها پراکنده‌تر و بیشتر
    const gap = Math.max(1800, 4200 + Math.random() * 8000 - level * 2600);
    this.birdTimer = setTimeout(() => {
      this.birdTimer = null;
      this.birdCall(level);
      this.scheduleBirds();
    }, gap);
  }

  /** یک «جمله»ی پرنده: ۱ تا ۳ جیغ‌جیغِ کوتاه با فاصله */
  private birdCall(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.birds;
    if (!ctx || !bus || !this.started) return;
    const count = 1 + Math.floor(Math.random() * 3);
    let at = ctx.currentTime + 0.03 + Math.random() * 0.4;
    for (let i = 0; i < count; i++) {
      this.birdChirp(at, bus, 0.5 + level * 0.5);
      at += 0.2 + Math.random() * 0.8;
    }
  }

  /** یک جیغِ کوتاهِ پرنده: سینوس با شیبِ فرکانسِ بالا→پایین (دومرحله‌ای) */
  private birdChirp(t0: number, bus: GainNode, amp: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const dur = 0.12 + Math.random() * 0.2;
    const base = 2800 + Math.random() * 1900;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.exponentialRampToValueAtTime(base * 1.7, t0 + dur * 0.5);
    osc.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12 * amp, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- شب / جیرجیرک ---

  private scheduleCrickets(): void {
    this.clearCricketTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.crickets;
    if (level <= 0.001) return;
    // جیرجیرک‌ها در توالی‌های موزون می‌خوانند؛ با حجم بیشتر تندتر
    const gap = Math.max(500, 1100 + Math.random() * 900 - level * 600);
    this.cricketTimer = setTimeout(() => {
      this.cricketTimer = null;
      this.cricketTrill(level);
      this.scheduleCrickets();
    }, gap);
  }

  /** یک «تریل»ی کوتاه از ۱ تا ۳ جیرجیرکِ هم‌زمان در فرکانس‌های کمی متفاوت */
  private cricketTrill(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.crickets;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.01;
    const count = Math.random() < 0.45 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const freq = 3600 + Math.random() * 1600 + i * 120;
      // هر جیرجیرک = دو پالسِ کوتاه و تیز
      this.cricketPulse(t0, freq, bus, 0.3 + level * 0.7);
      this.cricketPulse(t0 + 0.06, freq, bus, 0.3 + level * 0.7);
    }
  }

  private cricketPulse(t0: number, freq: number, bus: GainNode, amp: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const dur = 0.04 + Math.random() * 0.03;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18 * amp, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- قورباغه‌های برکه (قورقورِ ریتمیکِ شب) ---

  private scheduleFrogs(): void {
    this.clearFrogTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.frogs;
    if (level <= 0.001) return;
    const gap = Math.max(900, 1600 + Math.random() * 3600 - level * 900);
    this.frogTimer = setTimeout(() => {
      this.frogTimer = null;
      this.frogCroak(level);
      this.scheduleFrogs();
    }, gap);
  }

  /** یک قورقور: ۲ تا ۴ پالسِ کوتاه پشت‌سرهم روی یک نتِ بم */
  private frogCroak(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.frogs;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.02;
    const pulses = 2 + Math.floor(Math.random() * 3);
    const base = 150 + Math.random() * 90;
    for (let i = 0; i < pulses; i++) {
      const at = t0 + i * (0.12 + Math.random() * 0.05);
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(base * 1.2, at);
      osc.frequency.exponentialRampToValueAtTime(base * 0.8, at + 0.09);
      const lp = this.filter("lowpass", 480, 0.8);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.11 * (0.4 + level * 0.6), at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
      osc.connect(lp).connect(g).connect(bus);
      osc.start(at);
      osc.stop(at + 0.12);
      osc.onended = () => {
        try {
          osc.disconnect();
          lp.disconnect();
          g.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    }
  }

  // --- ساعت دیواری (تیک‌تاکِ دقیقِ ثانیه‌ای) ---

  private scheduleClock(): void {
    this.clearClockTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.clock;
    if (level <= 0.001) return;
    this.clockTimer = setTimeout(() => {
      this.clockTimer = null;
      this.clockTick(level);
      this.scheduleClock();
    }, 1000);
  }

  private clockTickCount = 0;

  /** تیک/تاک: دو کلیک متفاوتِ باریک تا ریتم «یک‌درمیان» حس شود */
  private clockTick(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.clock;
    if (!ctx || !bus || !this.started || !this.buffers.white) return;
    this.clockTickCount++;
    const tock = this.clockTickCount % 2 === 0;
    const t0 = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.white;
    src.loop = true;
    src.playbackRate.value = 1.6;
    const bp = this.filter("bandpass", tock ? 3400 : 4300, 6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.13 * (0.4 + level * 0.6), t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
    src.connect(bp).connect(g).connect(bus);
    src.start(t0, Math.random() * 3);
    src.stop(t0 + 0.05);
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

  // --- کتابخانه: ورق‌خوردنِ کاغذ و حرکت‌های کوچک ---

  private scheduleLibrary(): void {
    this.clearLibraryTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.library;
    if (level <= 0.001) return;
    const gap = Math.max(4000, 8000 + Math.random() * 13000 - level * 4000);
    this.libraryTimer = setTimeout(() => {
      this.libraryTimer = null;
      this.pageTurn(level);
      this.scheduleLibrary();
    }, gap);
  }

  /** ورقِ برگ: جارویِ باردکی از پایین به بالا با خش‌خش نرم */
  private pageTurn(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.library;
    if (!ctx || !bus || !this.started || !this.buffers.white) return;
    const t0 = ctx.currentTime + 0.02;
    const dur = 0.3 + Math.random() * 0.15;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.white;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const bp = this.filter("bandpass", 700, 0.9);
    bp.frequency.setValueAtTime(700, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05 * (0.4 + level * 0.6), t0 + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(bus);
    src.start(t0, Math.random() * 4);
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
    // گاهی ورقِ دوم بلافاصله بعد
    if (Math.random() < 0.3 && this.started) {
      setTimeout(() => this.pageTurn(level * 0.7), 600 + Math.random() * 500);
    }
  }

  // --- زیر آب: حباب‌های رو به بالا ---

  private scheduleBubbles(): void {
    this.clearBubbleTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.underwater;
    if (level <= 0.001) return;
    const gap = Math.max(1200, 1800 + Math.random() * 4200 - level * 1200);
    this.bubbleTimer = setTimeout(() => {
      this.bubbleTimer = null;
      this.bubbleRise(level);
      this.scheduleBubbles();
    }, gap);
  }

  /** زنجیره‌ای از چند حباب: سینوسِ سریعِ بالارونده با دامنه‌ی کم */
  private bubbleRise(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.underwater;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.02;
    let at = t0;
    const count = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const dur = 0.08 + Math.random() * 0.08;
      const from = 350 + Math.random() * 250;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(from * 2.1, at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05 * (0.4 + level * 0.6), at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(bus);
      osc.start(at);
      osc.stop(at + dur + 0.02);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* already disconnected */
        }
      };
      at += dur * (0.6 + Math.random() * 0.6);
    }
  }

  // --- باران روی چادر: تپ‌وتیپِ قطره ---

  private scheduleTentDrops(): void {
    this.clearTentDropTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.rainTent;
    if (level <= 0.001) return;
    const gap = Math.max(300, 520 + Math.random() * 1200 - level * 500);
    this.tentDropTimer = setTimeout(() => {
      this.tentDropTimer = null;
      this.tentPlop(level);
      this.scheduleTentDrops();
    }, gap);
  }

  /** تپِ قطره روی پارچه: سینوسِ نزولیِ کوتاه + کلیکِ خفیف */
  private tentPlop(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.rainTent;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const from = 500 + Math.random() * 350;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(from * 0.45, t0 + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09 * (0.4 + level * 0.6), t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + 0.09);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }

  // --- ترق‌وتروقِ آتش ---

  private scheduleFire(): void {
    this.clearFireTimer();
    if (!this.started || !this.ctx) return;
    const level = this.levels.fireplace;
    if (level <= 0.001) return;
    const gap = 250 + Math.random() * 900;
    this.fireTimer = setTimeout(() => {
      this.fireTimer = null;
      this.firePop(level);
      this.scheduleFire();
    }, gap);
  }

  private firePop(level: number): void {
    const ctx = this.ctx;
    const bus = this.buses.fireplace;
    if (!ctx || !bus || !this.started) return;
    const t0 = ctx.currentTime + 0.01;
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      this.cracklePop(t0 + i * (0.04 + Math.random() * 0.15), bus, 0.3 + level * 0.7);
    }
  }

  /** یک ترقِ کوتاهِ چوب: نویزِ سفیدِ فیلترشده با پوسیدگیِ تند */
  private cracklePop(t0: number, bus: GainNode, amp: number): void {
    const ctx = this.ctx;
    const buf = this.buffers.white;
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const hp = this.filter("highpass", 2500 + Math.random() * 2500, 0.7);
    const dur = 0.04 + Math.random() * 0.09;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16 * amp, t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(hp).connect(g).connect(bus);
    src.start(t0, Math.random() * Math.max(0.05, buf.duration - 1));
    src.stop(t0 + dur + 0.02);
    src.onended = () => {
      try {
        src.disconnect();
        hp.disconnect();
        g.disconnect();
      } catch {
        /* already disconnected */
      }
    };
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
    // موتور موسیقی فقط وقتی لایه‌اش روشن و موتورِ اصلی فعال است به کار می‌افتد.
    // مهم: این فراخوانی از دلِ لایه‌ی React (افکت‌ها/رویدادها) می‌گذرد؛ پس هر خطای
    // غیرمنتظره‌ی موتور موسیقی باید همین‌جا مهار شود تا کل اپ کرش نکند.
    try {
      this.music.setEnabled(this.started && (this.levels.music ?? 0) > 0.001);
    } catch (e) {
      console.warn("music engine toggle failed", e);
    }
    // موتور Drone هم همین‌طور
    try {
      const droneLevel = this.started ? (this.levels.drone ?? 0) : 0;
      // ترتیب مهم است: اول موتور (در صورت نیاز) وصل می‌شود، بعد حجم اعمال می‌شود؛
      // وگرنه حجمِ روی گرهِ خاموش می‌نشیند و دِرون ساکت می‌ماند.
      if (this.started && droneLevel > 0.001 && !droneEngine.isPlaying) {
        const droneBus = this.buses.drone;
        if (droneBus && this.ctx) droneEngine.start(droneBus, this.ctx);
      }
      droneEngine.setLevel(droneLevel);
      if (!this.started && droneEngine.isPlaying) droneEngine.stop();
    } catch (e) {
      console.warn("drone engine toggle failed", e);
    }
    if (this.master && this.started) {
      try {
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(this.masterLevel * this.duck, t + Math.max(fade, 0.6));
      } catch {
        this.master.gain.value = this.masterLevel * this.duck;
      }
    }
  }
}

/** یک نمونه‌ی یکتا برای کل اپ تا صدا هنگام جابه‌جایی بین صفحه‌ها قطع نشود */
export const ambientEngine = new AmbientEngine();
