import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Segmented, inputClass } from "./ui";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";

interface TextReaderProps {
  /** متن اولیه برای خواندن (مثلاً نام/توضیح مبحث) */
  initialText?: string;
  onClose?: () => void;
}

/** متن را به جمله‌ها می‌شکند؛ جداکننده‌ها (. ؟ ! …) نگه داشته می‌شوند. */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/(?<=[.!؟?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * تشخیصِ همگامِ پشتیبانی مرورگر از Web Speech.
 * این بررسی نباید داخل useEffect انجام شود: تا state به‌روز شود، افکت‌های دیگر
 * (مثل خوندن فهرست صداها) با `window.speechSynthesis` undefined کرش می‌کنند —
 * در WebViewها/فایرفاکسِ بدون speech یا jsdom کل مودال سفید می‌شد.
 */
function speechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const s = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  return !!s && typeof s.getVoices === "function" && typeof window.SpeechSynthesisUtterance === "function";
}

/** انتخاب بهترین صدای مدنظر برای زبان انتخابی. */
function selectVoice(
  preferredURI: string | null,
  langCode: string,
  list: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (preferredURI) {
    const v = list.find((x) => x.voiceURI === preferredURI);
    if (v) return v;
  }
  const langMatch = list.filter((v) => v.lang.toLowerCase().startsWith(langCode));
  if (langMatch.length === 0) return null;
  // ترجیح صدای محلی/گوگل/Natural در همان زبان
  const preferred =
    langMatch.find((v) => /google|natural|online|local|native|premium/i.test(v.name)) ?? langMatch[0];
  return preferred;
}

/**
 * متن‌خوان هوشمند (AI Text Reader) — فارسی/انگلیسی با Web Speech API.
 * ۱۰۰٪ آفلاین: از موتور گفتارِ خود مرورگر استفاده می‌کند (بدون سرور).
 * قابلیت‌ها: تنظیم سرعت، زیروبم، انتخاب صدا، هایلایت جمله در حال خواندن.
 */
export default function TextReader({ initialText, onClose }: TextReaderProps) {
  const [text, setText] = useState(initialText ?? "");
  const [lang, setLang] = useState<"fa" | "en">("fa");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(speechAvailable);
  const [error, setError] = useState<string | null>(null);

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // refs برای خواندنِ تنظیماتِ به‌روز هنگام پردازشِ جمله‌ی بعد (بدون closure کهنه)
  const sentencesRef = useRef<string[]>([]);
  const langRef = useRef(lang);
  const rateRef = useRef(rate);
  const pitchRef = useRef(pitch);
  const voiceRef = useRef(voiceURI);

  const sentences = useMemo(() => splitSentences(text), [text]);
  sentencesRef.current = sentences;
  langRef.current = lang;
  rateRef.current = rate;
  pitchRef.current = pitch;
  voiceRef.current = voiceURI;

  // صداها ممکن است به‌صورت غیرهمزمان بارگذاری شوند
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) setVoices(list);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
  }, [supported]);

  // توقفِ کامل هنگام بستن/انصراف
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis?.cancel();
    };
  }, [supported]);

  const stop = () => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    utterRef.current = null;
    setSpeaking(false);
    setActiveIndex(null);
    setError(null);
  };

  const speakIndex = (index: number) => {
    if (!supported) return;
    const list = sentencesRef.current;
    if (index >= list.length) {
      setSpeaking(false);
      setActiveIndex(null);
      return;
    }
    setActiveIndex(index);
    const u = new SpeechSynthesisUtterance(list[index]);
    const voice = selectVoice(voiceRef.current, langRef.current, voices);
    if (voice) u.voice = voice;
    u.lang = langRef.current === "fa" ? "fa-IR" : "en-US";
    u.rate = rateRef.current;
    u.pitch = pitchRef.current;
    u.onend = () => {
      if (utterRef.current === u) speakIndex(index + 1);
    };
    u.onerror = () => {
      if (utterRef.current !== u) return;
      setSpeaking(false);
      setActiveIndex(null);
      setError("خطا در پخش صدا — دوباره تلاش کن.");
    };
    utterRef.current = u;
    try {
      window.speechSynthesis.speak(u);
    } catch {
      setSpeaking(false);
      setActiveIndex(null);
      setError("مشکلی در پخش صدا — دوباره تلاش کن.");
    }
  };

  const play = () => {
    const list = sentencesRef.current;
    if (list.length === 0) return;
    stop();
    setSpeaking(true);
    setError(null);
    speakIndex(0);
  };

  const jumpTo = (index: number) => {
    stop();
    setSpeaking(true);
    setError(null);
    speakIndex(index);
  };

  const toggle = () => {
    if (speaking) stop();
    else play();
  };

  // صداهای قابل انتخاب متناسب با زبان
  const languageVoices = useMemo(() => {
    const code = lang === "fa" ? "fa" : "en";
    const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(code));
    return matches.length > 0 ? matches : voices;
  }, [voices, lang]);

  if (!supported) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
          ⚠️ مرورگر شما از «متن‌خوان» پشتیبانی نمی‌کند (Web Speech API در دسترس نیست).
        </div>
        {onClose && (
          <Button variant="ghost" onClick={onClose} className="w-full">
            بستن
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* متن برای خواندن */}
      <textarea
        className={cn(inputClass, "resize-none min-h-[110px] text-sm leading-relaxed")}
        placeholder="متن را بنویس یا بچسبان تا خوانده شود…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (speaking) stop();
        }}
      />

      {/* کنترل‌ها */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <button
            type="button"
            onClick={toggle}
            disabled={sentences.length === 0}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40",
              speaking
                ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300"
                : "bg-teal-600 text-white hover:bg-teal-700",
            )}
          >
            {speaking ? "⏸ توقف" : "▶️ خواندن"}
          </button>
          <Button variant="ghost" size="sm" onClick={stop} disabled={!speaking && activeIndex === null}>
            ⏹
          </Button>
        </div>
        <span className="text-[11px] text-slate-400 shrink-0">{toFa(sentences.length)} جمله</span>
      </div>

      {/* زبان */}
      <Field label="زبان">
        <Segmented
          value={lang}
          onChange={(v) => {
            setLang(v);
          }}
          options={[
            { value: "fa", label: "فارسی" },
            { value: "en", label: "English" },
          ]}
        />
      </Field>

      {/* صدا */}
      <Field label="صدا">
        <select
          className={inputClass}
          value={voiceURI ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setVoiceURI(v === "" ? null : v);
          }}
        >
          <option value="">خودکار ({lang === "fa" ? "فارسی" : "English"})</option>
          {languageVoices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </Field>

      {/* سرعت */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0">سرعت</span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="flex-1 accent-teal-600"
          aria-label="سرعت خواندن"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums w-10 text-left">{toFa(rate.toFixed(1))}</span>
      </div>

      {/* زیروبم */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 dark:text-slate-400 w-16 shrink-0">زیروبم</span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={pitch}
          onChange={(e) => setPitch(Number(e.target.value))}
          className="flex-1 accent-teal-600"
          aria-label="زیروبم صدا"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums w-10 text-left">{toFa(pitch.toFixed(1))}</span>
      </div>

      {error && <div className="text-xs text-rose-600 dark:text-rose-400">{error}</div>}

      {/* جمله‌ها با هایلایتِ جمله در حال خواندن */}
      {sentences.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/50 p-3 space-y-1.5 max-h-48 overflow-y-auto">
          {sentences.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => jumpTo(i)}
              className={cn(
                "block w-full text-right text-sm leading-relaxed rounded-lg px-2 py-1 transition-colors text-slate-700 dark:text-slate-200",
                activeIndex === i
                  ? "bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 ring-1 ring-teal-300 dark:ring-teal-700"
                  : "hover:bg-slate-100 dark:hover:bg-slate-700/50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        بدون اینترنت و کاملاً آفلاین — از موتور گفتار خود مرورگر استفاده می‌کند. هنگام خواندن، روی هر جمله بزن تا از همان‌جا ادامه دهد.
      </p>

      {onClose && (
        <Button variant="ghost" onClick={onClose} className="w-full">
          بستن
        </Button>
      )}
    </div>
  );
}

/** فیلد کوچک برای برچسب‌گذاری — هم‌خانواده با ui.tsx ولی مستقل. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
