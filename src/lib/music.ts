// ===== موتور موسیقی تولیدی (Generative Lo-Fi) =====
// همان فلسفه‌ی موتور صداهای محیطی: هیچ فایل صوتی‌ای وجود ندارد؛ ملودی و هارمونی
// *در لحظه* با Web Audio ساخته می‌شود، بنابراین آفلاین است و تکرارِ فایلِ لوپ را ندارد.
//
// موسیقی از سه بخش تشکیل می‌شود:
//  ۱) پدِ آکورد (هارمونی آرام)  ۲) ملودیِ پنتاتونیکِ تنکِ تصادفی  ۳) کراکِ وینیل + باس.
// منطقِ انتخاب نت‌ها (barEvents) تابعی خالص با RNG‌ی تزریق‌شده است تا دقیقاً قابل تست باشد.

import { mulberry32 } from "./random";

export const MUSIC_BPM = 70;
export const MUSIC_BEAT = 60 / MUSIC_BPM;
export const MUSIC_BAR = MUSIC_BEAT * 4;

export type MusicEventKind = "pad" | "bass" | "pluck" | "crackle";

export interface MusicEvent {
  kind: MusicEventKind;
  /** زمان نسبت به آغاز میزان (ثانیه) */
  at: number;
  dur: number;
  /** فرکانس برای نت‌ها؛ برای crackle صفر است */
  freq: number;
  gain: number;
  /** انحراف جزئی کوک برای پدها (سنت) */
  detune?: number;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * کتابخانه‌ی پروگرشن‌های لوفای (اعداد MIDI). هر آکورد: [باس, ...صداهای پد].
 * همه در مینورِ طبیعی تا حس «مطالعه‌ی شبانه» حفظ شود و هیچ‌وقت با ملودی نجنگند.
 */
export const MUSIC_PROGRESSIONS: readonly (readonly number[])[][] = [
  // Am9 → Fmaj9 → Cmaj9 → Em9
  [
    [45, 48, 52, 55, 59],
    [41, 48, 52, 57, 60],
    [48, 52, 55, 59, 62],
    [40, 47, 50, 54, 59],
  ],
  // Dm9 → B♭maj7 → Fmaj9 → Am9
  [
    [50, 53, 57, 60, 64],
    [46, 50, 53, 57, 60],
    [41, 48, 52, 57, 60],
    [45, 48, 52, 55, 59],
  ],
  // Em9 → Cmaj9 → Gmaj9 → Dmaj9(no3)
  [
    [40, 47, 50, 54, 59],
    [48, 52, 55, 59, 62],
    [43, 47, 50, 54, 57],
    [38, 45, 47, 50, 52],
  ],
];

/** پنتاتونیک مینورِ La برای ملودی (محدوده‌ی میانی تا گرم بماند) */
export const MUSIC_SCALE = [57, 60, 62, 64, 67, 69, 72, 76]; // A3..E5

const MAX_PLUCKS_PER_BAR = 4;

/**
 * رویدادهای یک میزان را می‌سازد — تابع خالص و قطعی.
 * - آکورد میزان: پد کامل (هر دو میزان یک‌بار تازه می‌شود تا پیوسته بماند)
 * - باس: نتِ ریشه با دو ضرب نرم
 * - ملودی: با احتمالِ آرام روی ضرب‌آهنگ‌های هشتم — هر بار متفاوت ولی کوانتیزشده
 * - کراکِ وینیل: چند ترقِ ریز و پراکنده
 */
export function barEvents(progression: readonly (readonly number[])[], bar: number, rng: () => number): MusicEvent[] {
  const chord = progression[bar % progression.length];
  const events: MusicEvent[] = [];

  // پد: فقط در میزان‌های زوج تعویض می‌شود تا هارمونی «نفس» بکشد
  if (bar % 2 === 0) {
    for (const midi of chord) {
      for (const cents of [-7, 7]) {
        events.push({ kind: "pad", at: 0, dur: MUSIC_BAR * 2, freq: midiToFreq(midi), gain: midi === chord[0] ? 0 : 0.024, detune: cents });
      }
    }
    events.push({ kind: "bass", at: 0, dur: MUSIC_BAR * 1.8, freq: midiToFreq(chord[0]), gain: 0.05 });
  }

  // ملودی: اسلات‌های ۱/۸ — هر اسلات با احتمال ۰٫۳ و حداکثر ۴ نت در میزان
  let plucks = 0;
  for (let slot = 0; slot < 8 && plucks < MAX_PLUCKS_PER_BAR; slot++) {
    // نت اول میزان کمی محتمل‌تر است تا ملودی «زمین» داشته باشد
    const p = slot === 0 ? 0.45 : 0.27;
    if (rng() >= p) continue;
    const midi = MUSIC_SCALE[Math.floor(rng() * MUSIC_SCALE.length)];
    events.push({ kind: "pluck", at: slot * MUSIC_BEAT * 0.5, dur: MUSIC_BEAT * (1.2 + rng() * 1.4), freq: midiToFreq(midi), gain: 0.045 + rng() * 0.03 });
    plucks++;
  }

  // کراکِ وینیل: ۱ تا ۴ ترقِ ریز، خیلی احتمالی
  const pops = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < pops; i++) {
    events.push({ kind: "crackle", at: rng() * MUSIC_BAR, dur: 0.02 + rng() * 0.03, freq: 0, gain: 0.006 + rng() * 0.014 });
  }

  return events.sort((a, b) => a.at - b.at);
}

/** موتور زنده: زمان‌بندِ رویدادهای بالا را به نودهای Web Audio تبدیل می‌کند */
export class GenerativeLofiEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private padBus: GainNode | null = null;
  private pluckBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private rng: () => number = Math.random;
  private whiteBuffer: AudioBuffer | null = null;
  private progression: readonly number[][] = MUSIC_PROGRESSIONS[0].map((c) => [...c]);
  private barIndex = 0;
  private nextBarTime = 0;
  private enabled = false;

  /** به موتورِ صدای محیطی متصل می‌شود؛ در صورت نبودِ بافر نویز، کراکل داخلی ساخته می‌شود */
  attach(ctx: AudioContext, dest: AudioNode, whiteBuffer: AudioBuffer | null = null): void {
    if (this.ctx) return;
    this.ctx = ctx;
    this.whiteBuffer = whiteBuffer;

    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(dest);
    this.out = out;

    // پدها: گرم و لبه‌دارِ بم، با کمی تاریکی (پیش‌برشِ زیرها)
    const padBus = ctx.createGain();
    padBus.gain.value = 0.9;
    const padLp = ctx.createBiquadFilter();
    padLp.type = "lowpass";
    padLp.frequency.value = 1350;
    padLp.Q.value = 0.4;
    padBus.connect(padLp).connect(out);
    this.padBus = padBus;

    // ملودی + اکوی شبه‌لوفای (تأخیرِ نظم‌دارِ ضرب)
    const pluckBus = ctx.createGain();
    pluckBus.gain.value = 1;
    pluckBus.connect(out);
    try {
      const delay = ctx.createDelay?.(2);
      if (delay) {
        delay.delayTime.value = MUSIC_BEAT * 0.75;
        const echoFilter = ctx.createBiquadFilter();
        echoFilter.type = "lowpass";
        echoFilter.frequency.value = 2400;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.32;
        const echoOut = ctx.createGain();
        echoOut.gain.value = 0.35;
        pluckBus.connect(delay);
        delay.connect(echoFilter);
        echoFilter.connect(feedback);
        feedback.connect(delay);
        echoFilter.connect(echoOut);
        echoOut.connect(out);
      }
    } catch {
      /* اکو اختیاری است */
    }
    this.pluckBus = pluckBus;

    // کراکِ پیوسته‌ی خیلی خفیفِ وینیل
    if (whiteBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = whiteBuffer;
      src.loop = true;
      src.playbackRate.value = 0.9;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3600;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = 0.008;
      src.connect(bp).connect(g).connect(out);
      src.start(0, 0.37);
    }

    this.rng = mulberry32(0x1ace + Math.floor(performance?.now?.() ?? Date.now()) % 100000);
    const prog = MUSIC_PROGRESSIONS[Math.floor(this.rng() * MUSIC_PROGRESSIONS.length)];
    this.progression = prog.map((c) => [...c]);
  }

  /** شروع/توقف را با لایه‌ی «موسیقی زنده»ی میکسر هم‌گام می‌کند */
  setEnabled(on: boolean): void {
    if (on && this.enabled) return;
    if (on) this.start();
    else this.stop();
  }

  private start(): void {
    const ctx = this.ctx;
    if (!ctx || this.enabled) return;
    this.enabled = true;
    this.barIndex = 0;
    this.nextBarTime = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.scheduleAhead(), 180);
    this.scheduleAhead();
  }

  stop(): void {
    this.enabled = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleAhead(): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    while (this.nextBarTime < ctx.currentTime + 0.6) {
      const events = barEvents(this.progression, this.barIndex, this.rng);
      for (const ev of events) this.playEvent(ev, this.nextBarTime + ev.at);
      this.barIndex++;
      this.nextBarTime += MUSIC_BAR;
    }
  }

  private playEvent(ev: MusicEvent, when: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.padBus || !this.pluckBus) return;
    if (ev.kind === "pad") {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = ev.freq;
      if (ev.detune) osc.detune.value = ev.detune;
      const g = ctx.createGain();
      const a = 1.1; // حمله‌ی آرام تا تعویض آکورد حس نشود
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(ev.gain, when + a);
      g.gain.setValueAtTime(ev.gain, when + ev.dur - 1.4);
      g.gain.exponentialRampToValueAtTime(0.0001, when + ev.dur + 0.6);
      osc.connect(g).connect(this.padBus);
      osc.start(when);
      osc.stop(when + ev.dur + 0.7);
      return;
    }
    if (ev.kind === "bass") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = ev.freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(ev.gain, when + 0.5);
      g.gain.setValueAtTime(ev.gain, when + ev.dur - 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, when + ev.dur + 0.4);
      osc.connect(g).connect(this.out);
      osc.start(when);
      osc.stop(when + ev.dur + 0.5);
      return;
    }
    if (ev.kind === "pluck") {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = ev.freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(ev.gain, when + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, when + ev.dur);
      osc.connect(g).connect(this.pluckBus);
      osc.start(when);
      osc.stop(when + ev.dur + 0.05);
      return;
    }
    // crackle: ترقِ ریزِ نویزی
    const src = ctx.createBufferSource();
    if (this.whiteBuffer) {
      src.buffer = this.whiteBuffer;
      src.playbackRate.value = 0.8 + Math.random() * 0.6;
    } else {
      const len = Math.max(1, Math.floor(ctx.sampleRate * 0.2));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      src.buffer = buf;
    }
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200 + Math.random() * 2600;
    bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(ev.gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + ev.dur);
    src.connect(bp).connect(g).connect(this.out);
    src.start(when, this.whiteBuffer ? Math.random() * Math.max(0.01, this.whiteBuffer.duration - ev.dur - 0.05) : 0);
    src.stop(when + ev.dur + 0.03);
  }
}
