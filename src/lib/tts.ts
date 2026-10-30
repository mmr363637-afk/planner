// ===== 🔈 موتور گفتار (Text to Speech) و صفِ پخشِ مرور صوتی =====
//
// دو موتور پشتیبانی می‌شود:
//  ۱) «system»: هر موتور TTS که روی دستگاه نصب است و Web Speech API آن را فهرست
//     می‌کند — از جمله موتور فارسیِ سومی که کاربر نصب می‌کند (گوگل/سامسونگ یا هر
//     موتور دیگر). انتخاب صدا/موتور ذخیره می‌شود و دفعهٔ بعد همان استفاده می‌شود.
//  ۲) «remote»: یک سرویسِ TTS محلی/آفلاین (مثلاً موتور جدید روی گوشی/لپ‌تاپ) که
//     متن را با POST می‌گیرد و صدا برمی‌گرداند (فایل صوتی، آدرس صدا یا base64).
//     آدرسش را خودِ کاربر در تنظیمات می‌گذارد؛ هیچ درخواستی به سرویسِ ثالث نمی‌رود.
//
// علاوه بر موتور، یک «کنترل‌گر صف» داریم: پخش/مکث/ادامه/بعدی/قبلی/پرش، مکثِ
// قابل‌تنظیم بین سؤال و پاسخ (برای یادآوری ذهنی)، تکرار، سرعت، توقف هنگام خروج.
// منطق خالصِ ساخت متن/تقسیم جمله‌ها تست می‌شود؛ پخش به APIهای مرورگر وابسته است و
// در محیط‌های بدون TTS بی‌صدا و بدون خطا شکست می‌خورد.

import type { TtsMode, TtsSettings } from "../types";
import { mediaSessionSupported } from "./mediaSession";

export const TTS_MAX_TEXT = 4000;
export const TTS_CHUNK_LEN = 190;
export const TTS_SPEEDS = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;

export interface SpeechVoiceInfo {
  uri: string;
  name: string;
  lang: string;
  /** پیش‌فرضِ سیستم */
  isDefault: boolean;
  /** صدا روی دستگاه است (آفلاین) — در مرورگرها معمولاً true */
  local: boolean;
  persian: boolean;
}

/** آیا Web Speech API در این محیط هست؟ (jsdom و بعضی WebViewها ندارند) */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
}

function normalizeLang(lang: string): string {
  return (lang || "").toLowerCase().replace("_", "-");
}

/** آیا این صدا فارسی است؟ (fa، fa-IR، per، یا نامِ شامل persian/farsi) */
export function isPersianVoice(v: { lang?: string; name?: string }): boolean {
  const lang = normalizeLang(v.lang ?? "");
  if (lang === "fa" || lang.startsWith("fa-") || lang === "per" || lang.startsWith("per-")) return true;
  const name = (v.name ?? "").toLowerCase();
  return name.includes("persian") || name.includes("farsi") || name.includes("فارسی");
}

/** فهرست صداهای موجود، با تشخیص فارسی بودن */
export function listVoices(): SpeechVoiceInfo[] {
  if (!speechSupported()) return [];
  let raw: SpeechSynthesisVoice[] = [];
  try {
    raw = window.speechSynthesis.getVoices() ?? [];
  } catch {
    return [];
  }
  return raw.map((v) => ({
    uri: v.voiceURI,
    name: v.name,
    lang: v.lang,
    isDefault: v.default,
    local: v.localService !== false,
    persian: isPersianVoice(v),
  }));
}

/** آیا فارسی در میان صداها هست؟ */
export function hasPersianVoice(voices: SpeechVoiceInfo[]): boolean {
  return voices.some((v) => v.persian);
}

/**
 * بهترین صدای فارسی: اول صدای انتخابیِ کاربر، بعد صدای پیش‌فرضِ فارسی، بعد اولین
 * فارسی. اگر هیچ صدای فارسی نبود `null` برمی‌گردد تا UI صریح هشدار بدهد (به‌جای
 * خواندن با صدای انگلیسی و تلفظ غلط).
 */
export function pickVoice(voices: SpeechVoiceInfo[], preferredURI?: string): SpeechVoiceInfo | null {
  if (preferredURI) {
    const chosen = voices.find((v) => v.uri === preferredURI);
    if (chosen) return chosen;
  }
  const persian = voices.filter((v) => v.persian);
  return persian.find((v) => v.isDefault) ?? persian.find((v) => v.local) ?? persian[0] ?? null;
}

/**
 * گرفتن «نام موتور» از نام صدا — فقط برای گروه‌بندیِ نمایشی در تنظیمات.
 * Web Speech نام موتور را جدا نمی‌دهد؛ ولی نام صداهای اندروید معمولاً با موتور
 * شروع می‌شود (مثل «Google فارسی» یا «Samsung ...»)؛ برای بقیه همان نام صدا.
 */
export function voiceGroupLabel(v: SpeechVoiceInfo): string {
  const known = ["google", "samsung", "microsoft", "espeak", "eSpeak", "acapela", "vocalizer", "nuance", "svox", "huawei", "xiaomi"];
  const lower = v.name.toLowerCase();
  const hit = known.find((k) => lower.includes(k.toLowerCase()));
  if (hit) {
    if (hit === "vocalizer" || hit === "svox" || hit === "nuance") return "Nuance";
    if (hit === "espeak") return "eSpeak";
    return hit.charAt(0).toUpperCase() + hit.slice(1);
  }
  return v.lang.toUpperCase();
}

/** تقسیم متن به جمله‌های کوتاه — کروم اندروید متن‌های خیلی بلند را می‌بُرد */
export function splitForSpeech(text: string, maxLen = TTS_CHUNK_LEN): string[] {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const parts = clean.split(/(?<=[.!?؟؛;:])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts.length > 0 ? parts : [clean]) {
    if (part.length > maxLen) {
      if (buf) {
        chunks.push(buf);
        buf = "";
      }
      // جملهٔ خیلی بلند: از نزدیک‌ترین فاصله به سقف می‌شکنیم
      let rest = part;
      while (rest.length > maxLen) {
        const cut = rest.lastIndexOf(" ", maxLen);
        const at = cut > 40 ? cut : maxLen;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) buf = rest;
      continue;
    }
    if ((buf + " " + part).trim().length > maxLen) {
      if (buf) chunks.push(buf);
      buf = part;
    } else {
      buf = (buf + " " + part).trim();
    }
  }
  if (buf) chunks.push(buf);
  return chunks.filter(Boolean).slice(0, 60);
}

export interface SpeechItem {
  /** شناسهٔ پایدار (شناسهٔ کارت یا سؤال) — برای پرش و نمایش */
  id: string;
  title: string;
  /** متن سؤال (یا متن اصلی) */
  question: string;
  /** متن پاسخ؛ خالی = فقط یک متن خوانده می‌شود */
  answer?: string;
  /** توضیح/نکتهٔ اضافی که بعد از پاسخ خوانده می‌شود (اختیاری) */
  extra?: string;
}

export interface SpeechOptions {
  rate: number;
  pitch: number;
  volume: number;
  voiceURI?: string;
  lang: string;
  /** مکث بین سؤال و پاسخ به ثانیه */
  answerPauseSec: number;
  /** مکث بین دو کارت */
  cardGapSec: number;
  repeat: number;
  mode: TtsMode;
  autoNext: boolean;
  /** موتور جایگزین (سرویسِ آفلاین) */
  remote?: { url: string; key?: string; voice?: string };
}

export function defaultSpeechOptions(settings?: Partial<TtsSettings>): SpeechOptions {
  const s = settings ?? {};
  return {
    rate: clampNumber(s.rate, 1, 0.5, 2),
    pitch: clampNumber(s.pitch, 1, 0.5, 1.5),
    volume: clampNumber(s.volume, 1, 0, 1),
    voiceURI: s.voiceURI || undefined,
    lang: "fa-IR",
    answerPauseSec: clampNumber(s.answerPauseSec, 4, 0, 60),
    cardGapSec: clampNumber(s.cardGapSec, 1.5, 0, 30),
    repeat: Math.round(clampNumber(s.repeat, 1, 1, 3)),
    mode: s.mode === "podcast" || s.mode === "rapid" || s.mode === "answer-first" ? s.mode : "qa",
    autoNext: s.autoNext !== false,
    remote:
      s.engine === "remote" && s.remoteUrl && s.remoteUrl.trim()
        ? { url: s.remoteUrl.trim(), key: s.remoteKey?.trim() || undefined, voice: s.remoteVoice?.trim() || undefined }
        : undefined,
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function modeLabel(mode: TtsMode): string {
  switch (mode) {
    case "qa":
      return "پرسش و پاسخ (سؤال → مکث → پاسخ)";
    case "answer-first":
      return "پاسخ اول (مرور سریع نکته‌ها)";
    case "rapid":
      return "پخش سریع (بدون مکث)";
    default:
      return "پادکست (با مقدمه و جمله‌بندی)";
  }
}

/**
 * ساخت «متنِ پادکست‌مانند» برای یک کارت — مقدمه/میان‌پرده فقط در حالت podcast.
 * خروجی خالص است تا در تست‌ها و در پیش‌نمایش هم استفاده شود.
 */
export function podcastScript(item: SpeechItem, index: number, total: number, mode: TtsMode): { question: string; answer: string } {
  if (mode !== "podcast") return { question: item.question, answer: item.answer ?? "" };
  const intro = index === 0 ? `به پادکست مرور خوش آمدی. ${total} مورد برای امروز آماده است. ` : "";
  const counter = `${toFaDigits(index + 1)} از ${toFaDigits(total)}. `;
  const bridge = item.answer ? "حالا پاسخ را بشنو. " : "";
  return {
    question: `${intro}${counter}${item.question}`,
    answer: `${bridge}${item.answer ?? ""}${item.extra ? ` ${item.extra}` : ""}`.trim(),
  };
}

function toFaDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export interface SpeechState {
  items: SpeechItem[];
  index: number;
  playing: boolean;
  paused: boolean;
  /** متنِ در حال خواندن — برای نمایش زنده */
  speaking: string;
  error?: string;
  finished: boolean;
}

type Listener = (state: SpeechState) => void;

/**
 * کنترل‌گر صفِ گفتار. یک نمونه به‌ازای هر بخش صوتی ساخته می‌شود (نه سراسری) تا
 * خروج از بخش، صدای آن را قطع کند و با صدای دیگری تداخل نداشته باشد.
 */
export class SpeechController {
  private items: SpeechItem[] = [];
  private opts: SpeechOptions = defaultSpeechOptions();
  private index = 0;
  private playing = false;
  private paused = false;
  private speaking = "";
  private error: string | undefined;
  private token = 0;
  private listeners = new Set<Listener>();
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private gapResolve: (() => void) | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private finished = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state());
    return () => this.listeners.delete(fn);
  }

  state(): SpeechState {
    return {
      items: this.items,
      index: this.index,
      playing: this.playing,
      paused: this.paused,
      speaking: this.speaking,
      error: this.error,
      finished: this.finished,
    };
  }

  private emit() {
    const s = this.state();
    this.listeners.forEach((fn) => fn(s));
  }

  get currentOptions(): SpeechOptions {
    return this.opts;
  }

  setItems(items: SpeechItem[]) {
    this.items = items;
    // وسطِ پخش، ایندکس را صفر نکن (وگرنه با هر تغییرِ تنظیمات، نمایش به کارت اول می‌پرد)
    if (!this.playing) this.index = 0;
    this.finished = false;
    this.error = undefined;
    this.emit();
  }

  /** تغییر تنظیمات وسط پخش — روی جملهٔ بعدی اثر می‌گذارد */
  setOptions(patch: Partial<SpeechOptions>) {
    this.opts = { ...this.opts, ...patch };
    if (patch.rate != null) this.opts.rate = clampNumber(patch.rate, 1, 0.5, 2);
    this.emit();
  }

  play(fromIndex?: number) {
    if (this.items.length === 0) return;
    this.stopAudio();
    this.playing = true;
    this.paused = false;
    this.finished = false;
    this.error = undefined;
    const start = fromIndex ?? this.index;
    this.index = Math.max(0, Math.min(this.items.length - 1, start));
    const token = ++this.token;
    void this.run(token, this.index);
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.paused = true;
    if (this.remoteAudio) {
      try {
        this.remoteAudio.pause();
      } catch {
        /* ignore */
      }
    } else if (speechSupported()) {
      try {
        window.speechSynthesis.pause();
      } catch {
        /* ignore */
      }
    }
    this.emit();
  }

  resume() {
    if (!this.playing || !this.paused) return;
    this.paused = false;
    if (this.remoteAudio) {
      void this.remoteAudio.play().catch(() => undefined);
    } else if (speechSupported()) {
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }
    this.emit();
  }

  toggle() {
    if (!this.playing) this.play();
    else if (this.paused) this.resume();
    else this.pause();
  }

  next() {
    const target = Math.min(this.items.length - 1, this.index + 1);
    this.play(target);
  }

  prev() {
    const target = Math.max(0, this.index - 1);
    this.play(target);
  }

  jump(i: number) {
    this.play(i);
  }

  stop() {
    this.token++;
    this.playing = false;
    this.paused = false;
    this.speaking = "";
    this.finished = false;
    this.clearGap();
    this.stopAudio();
    if (speechSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    this.emit();
  }

  dispose() {
    this.stop();
    this.listeners.clear();
    this.items = [];
    if (mediaSessionSupported()) {
      try {
        navigator.mediaSession.playbackState = "none";
      } catch {
        /* ignore */
      }
    }
  }

  private stopAudio() {
    if (this.remoteAudio) {
      try {
        this.remoteAudio.pause();
        this.remoteAudio.src = "";
      } catch {
        /* ignore */
      }
      this.remoteAudio = null;
    }
    if (speechSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }

  private clearGap() {
    if (this.gapTimer) clearTimeout(this.gapTimer);
    this.gapTimer = null;
    this.gapResolve?.();
    this.gapResolve = null;
  }

  /** مکثِ قابل‌لغو — با pause/resume کاربر هماهنگ است */
  private wait(ms: number, token: number): Promise<boolean> {
    if (ms <= 0) return Promise.resolve(token === this.token);
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (token !== this.token) {
          this.gapTimer = null;
          resolve(false);
          return;
        }
        if (this.paused) {
          this.gapTimer = setTimeout(tick, 120);
          return;
        }
        const elapsed = Date.now() - start;
        if (elapsed >= ms) {
          this.gapTimer = null;
          resolve(true);
          return;
        }
        this.gapTimer = setTimeout(tick, Math.min(200, ms - elapsed));
      };
      this.gapTimer = setTimeout(tick, Math.min(200, ms));
      this.gapResolve = () => resolve(false);
    });
  }

  private async run(token: number, from: number) {
    for (let i = from; i < this.items.length; i++) {
      if (token !== this.token) return;
      this.index = i;
      const item = this.items[i];
      const script = podcastScript(item, i, this.items.length, this.opts.mode);
      const question = script.question;
      const answer = script.answer;
      const reps = Math.max(1, this.opts.repeat);
      for (let r = 0; r < reps; r++) {
        if (token !== this.token) return;
        if (this.opts.mode === "answer-first") {
          if (answer && !(await this.speak(answer, token))) return;
          if (question && !(await this.speak(question, token))) return;
        } else {
          if (question && !(await this.speak(question, token))) return;
          if (answer) {
            const pauseMs =
              this.opts.mode === "rapid" ? 0 : this.opts.answerPauseSec * 1000;
            if (pauseMs > 0 && !(await this.wait(pauseMs, token))) return;
            if (!(await this.speak(answer, token))) return;
          }
        }
        if (item.extra && this.opts.mode === "podcast" && !(await this.speak(item.extra, token))) return;
        if (r < reps - 1 && !(await this.wait(900, token))) return;
      }
      this.emit();
      if (!this.opts.autoNext) {
        this.playing = false;
        this.emit();
        return;
      }
      if (i < this.items.length - 1 && !(await this.wait(this.opts.cardGapSec * 1000, token))) return;
    }
    if (token !== this.token) return;
    this.playing = false;
    this.finished = true;
    this.speaking = "";
    this.emit();
  }

  /** خواندن یک متن با موتور فعال؛ true یعنی تمام شد (نه لغو/خطا) */
  private async speak(text: string, token: number): Promise<boolean> {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, TTS_MAX_TEXT);
    if (!clean) return true;
    this.speaking = clean;
    this.emit();
    if (this.opts.remote) return this.speakRemote(clean, token);
    return this.speakSystem(clean, token);
  }

  private speakSystem(text: string, token: number): Promise<boolean> {
    if (!speechSupported()) {
      this.error = "مرورگر/دستگاه از تبدیل متن به گفتار پشتیبانی نمی‌کند.";
      this.playing = false;
      this.emit();
      return Promise.resolve(false);
    }
    const chunks = splitForSpeech(text);
    return new Promise<boolean>((resolve) => {
      let i = 0;
      const speakNext = () => {
        if (token !== this.token) return resolve(false);
        if (this.paused) {
          setTimeout(speakNext, 150);
          return;
        }
        if (i >= chunks.length) return resolve(true);
        const u = new SpeechSynthesisUtterance(chunks[i]);
        // صدای فارسی: اول انتخاب کاربر، بعد بهترین فارسی
        const voices = listVoices();
        const v = pickVoice(voices, this.opts.voiceURI);
        const raw = window.speechSynthesis.getVoices().find((x) => x.voiceURI === v?.uri);
        if (raw) u.voice = raw;
        u.lang = raw?.lang || this.opts.lang || "fa-IR";
        u.rate = this.opts.rate;
        u.pitch = this.opts.pitch;
        u.volume = this.opts.volume;
        u.onend = () => {
          i += 1;
          speakNext();
        };
        u.onerror = (e) => {
          // cancel عمدی خطا نیست
          if (token !== this.token || (e as SpeechSynthesisErrorEvent)?.error === "interrupted") return resolve(false);
          this.error = "پخشِ صدا با خطا متوقف شد؛ دوباره تلاش کن.";
          this.playing = false;
          this.emit();
          resolve(false);
        };
        try {
          window.speechSynthesis.speak(u);
        } catch {
          this.error = "پخش صدا ممکن نشد.";
          resolve(false);
        }
      };
      speakNext();
    });
  }

  private async speakRemote(text: string, token: number): Promise<boolean> {
    const remote = this.opts.remote;
    if (!remote) return false;
    try {
      const res = await fetch(remote.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(remote.key ? { Authorization: `Bearer ${remote.key}` } : {}),
        },
        body: JSON.stringify({ text, voice: remote.voice, rate: this.opts.rate, lang: this.opts.lang, format: "mp3" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (token !== this.token) return false;
      const type = res.headers.get("content-type") ?? "";
      let src = "";
      let revoke: (() => void) | undefined;
      if (type.includes("application/json")) {
        const data = (await res.json()) as { audio?: string; url?: string; base64?: string };
        if (data.url) src = data.url;
        else {
          const b64 = data.audio ?? data.base64;
          if (!b64) throw new Error("پاسخ سرویس صوتی خالی بود");
          const blob = base64ToBlob(b64, "audio/mpeg");
          src = URL.createObjectURL(blob);
          revoke = () => URL.revokeObjectURL(src);
        }
      } else {
        const blob = await res.blob();
        src = URL.createObjectURL(blob);
        revoke = () => URL.revokeObjectURL(src);
      }
      const audio = new Audio(src);
      this.remoteAudio = audio;
      if (this.paused) {
        // اگر کاربر وسط درخواست مکث کرده، تا ادامه صبر می‌کنیم
        await new Promise<void>((resolve) => {
          const check = () => (this.paused && token === this.token ? setTimeout(check, 120) : resolve());
          check();
        });
      }
      const done = await new Promise<boolean>((resolve) => {
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      });
      this.remoteAudio = null;
      revoke?.();
      if (!done && token === this.token) {
        this.error = "سرویس صوتی آفلاین پاسخ نداد؛ تنظیمات موتور صدا را چک کن.";
        this.emit();
      }
      return done && token === this.token;
    } catch (e) {
      if (token === this.token) {
        this.error = `اتصال به موتور صوتیِ آفلاین برقرار نشد${e instanceof Error ? `: ${e.message}` : ""}.`;
        this.playing = false;
        this.emit();
      }
      return false;
    }
  }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** متادیتای پخش در صفحهٔ قفل/نوتیفیکیشن — اختیاری و بدون خطا در پلتفرم‌های ناسازگار */
export function updateSpeechMediaSession(title: string, playing: boolean, subtitle = "مرور صوتی"): void {
  if (!mediaSessionSupported()) return;
  try {
    if (typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: subtitle, album: "برنامه‌ریز مطالعه" });
    }
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  } catch {
    /* ignore */
  }
}
