// ===== موتور موسیقی Ambient/Drone (Generative) =====
// الهام از Brian Eno's Music for Airports — موسیقی‌ای که «اینجا» هست ولی توجه نمی‌خواهد.
// با Web Audio API ساخته می‌شود، بدون فایل صوتی، کاملاً آفلاین.
//
// منطق: چند لایه‌ی سینوسی با فرکانس‌های هارمونیک + LFO‌های بسیار کند
// که هر لایه را مدولاسیون می‌دهد. نتیجه صدایی مثل «نفس کشیدن» فضاست.

import { mulberry32 } from "./random";

/** تون‌های هارمونیک پایه — نسبت فرکانس‌ها از سری هارمونیک طبیعی */
const HARMONICS = [1, 1.5, 2, 2.5, 3, 4]; // پنجم، اکتاو، دسیّم، دوازدهم، دوازدهم+اکتاو، ...
const BASE_FREQ = 110; // La2 — پایه‌ی بم و گرم

export class GenerativeDroneEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private lfos: OscillatorNode[] = [];
  private enabled = false;
  private rng = mulberry32(Date.now());
  /** تایمرِ پاک‌سازیِ پس از خاموش‌شدنِ نرم — برای «برگشتنِ سریع» لغو می‌شود */
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  /** آخرین حجم خواسته‌شده؛ هنگام برگشتنِ سریع، همان دوباره اعمال می‌شود */
  private lastLevel = 0;

  /** شروع موتور — باید بعد از user gesture فراخوانی شود */
  start(dest: AudioNode, ctx: AudioContext): void {
    // 🐛→✅ قبلاً اگر کاربر «توقف» و بی‌درنگ «پخش» را می‌زد، این‌جا return می‌شد
    // (کانتکستِ قدیمی هنوز پاک نشده بود) و لایه‌ی دِرون تا تغییرِ حجمِ بعدی ساکت
    // می‌ماند. حالا خاموش‌شدنِ در جریان لغو و همان گره‌ها دوباره فعال می‌شوند.
    if (this.ctx) {
      if (this.ctx !== ctx) return; // کانتکستِ دیگری — نباید پیش بیاید
      if (this.stopTimer) {
        clearTimeout(this.stopTimer);
        this.stopTimer = null;
      }
      this.enabled = true;
      try {
        const t = ctx.currentTime;
        this.out?.gain.cancelScheduledValues(t);
        this.out?.gain.setValueAtTime(this.out.gain.value, t);
        this.out?.gain.linearRampToValueAtTime(this.lastLevel * 0.5, t + 0.6);
      } catch {
        /* برخی مرورگرها در حالتِ suspended زمان‌بندی را نمی‌پذیرند */
      }
      return;
    }
    this.ctx = ctx;
    this.enabled = true;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(dest);
    this.out = out;

    // هر هارمونیک: یک اسیلاتور سینوسی + LFO کند برای مدولاسیون حجم
    for (let i = 0; i < HARMONICS.length; i++) {
      const freq = BASE_FREQ * HARMONICS[i];
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq + (this.rng() - 0.5) * 2; // کمی detune طبیعی

      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(out);
      osc.start();

      // LFO: مدولاسیون بسیار کندِ حجم (مثل نفس کشیدن)
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.02 + this.rng() * 0.06; // 15-60 ثانیه یک cycle
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.04 / (i + 1); // هر هارمونیک بالاتر، دامنه کمتر
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();

      // مدولاسیون فرکانس LFO برای detune زنده
      const freqLfo = ctx.createOscillator();
      freqLfo.type = "sine";
      freqLfo.frequency.value = 0.005 + this.rng() * 0.015;
      const freqLfoGain = ctx.createGain();
      freqLfoGain.gain.value = 1 + this.rng() * 2; // ±۱ تا ۳ هرتز
      freqLfo.connect(freqLfoGain).connect(osc.frequency);
      freqLfo.start();

      this.oscillators.push(osc);
      this.gains.push(g);
      this.lfos.push(lfo, freqLfo);
    }

    // تنظیم اولیه حجم هر لایه — هارمونیک‌های بالاتر آهسته‌تر
    this.updateGains(0.3);
  }

  stop(): void {
    if (!this.ctx) return;
    this.enabled = false;
    if (this.stopTimer) clearTimeout(this.stopTimer);
    const t = this.ctx.currentTime;
    try {
      this.out?.gain.cancelScheduledValues(t);
      this.out?.gain.setValueAtTime(this.out.gain.value, t);
      this.out?.gain.linearRampToValueAtTime(0, t + 1.2);
    } catch {
      /* بی‌صدا */
    }
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      for (const osc of this.oscillators) try { osc.stop(); } catch {}
      for (const lfo of this.lfos) try { lfo.stop(); } catch {}
      this.oscillators = [];
      this.gains = [];
      this.lfos = [];
      try { this.out?.disconnect(); } catch {}
      this.out = null;
      this.ctx = null;
    }, 1400);
  }

  /** تنظیم حجم کلی — از ۰ تا ۱ */
  setLevel(v: number): void {
    this.lastLevel = v;
    if (this.ctx && this.out) {
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(v * 0.5, t + 0.8); // حداکثر ۰.۵ تا نرم باشد
    }
    this.updateGains(v);
  }

  private updateGains(master: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < this.gains.length; i++) {
      // هر هارمونیک: حجم پایه = 1 / (i+1)^2  تا هارمونیک‌های بالاتر ظریف‌تر باشند
      const base = master * 0.12 / ((i + 1) * (i + 1));
      this.gains[i].gain.cancelScheduledValues(t);
      this.gains[i].gain.setValueAtTime(this.gains[i].gain.value, t);
      this.gains[i].gain.linearRampToValueAtTime(base, t + 1.5);
    }
  }

  get isPlaying(): boolean {
    return this.enabled && this.ctx !== null;
  }
}

export const droneEngine = new GenerativeDroneEngine();
