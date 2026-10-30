import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card, Segmented, inputClass } from "./ui";
import { SpeechController, TTS_SPEEDS, defaultSpeechOptions, listVoices, pickVoice, speechSupported, voiceGroupLabel, type SpeechVoiceInfo } from "../lib/tts";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import { DEFAULT_TTS, type TtsSettings } from "../types";

/**
 * 🔈 تنظیماتِ «مرور صوتی» در صفحهٔ تنظیمات.
 * همان تنظیماتی که استودیوی صوتی استفاده می‌کند: موتور صدا (هر موتورِ نصب‌شدهٔ
 * اندروید یا سرویسِ آفلاینِ دلخواه)، سرعت/زیروبمی/بلندی، مکث بین سؤال و پاسخ،
 * فاصلهٔ کارت‌ها و تکرار. تغییرات همان‌جا ذخیره می‌شوند و در همهٔ بخش‌ها اثر دارند.
 */
export default function AudioSettings() {
  const { state, updateSettings, toast } = useStore();
  const tts: TtsSettings = state.settings.tts ?? DEFAULT_TTS;
  const [voices, setVoices] = useState<SpeechVoiceInfo[]>(() => listVoices());
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const supported = speechSupported();

  useEffect(() => {
    if (!supported || typeof window === "undefined") return;
    const load = () => {
      const list = listVoices();
      setVoices(list);
      if (list.length > 0) setLoaded(true);
    };
    load();
    const t = setTimeout(load, 1200);
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => {
      clearTimeout(t);
      window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
    };
  }, [supported]);

  const chosen = useMemo(() => pickVoice(voices, tts.voiceURI), [voices, tts.voiceURI]);
  const persianVoices = voices.filter((v) => v.persian);
  const persianMissing = supported && tts.engine !== "remote" && loaded && persianVoices.length === 0;
  const save = (patch: Partial<TtsSettings>) => updateSettings({ tts: { ...DEFAULT_TTS, ...tts, ...patch } });

  const test = () => {
    if (tts.engine === "remote") {
      if (!tts.remoteUrl?.trim()) {
        toast("اول آدرس سرویس آفلاین را بگذار", "🔌");
        return;
      }
    } else if (!supported) {
      toast("این مرورگر گفتار ندارد", "⚠️");
      return;
    }
    setTesting(true);
    const c = new SpeechController();
    c.setOptions({ ...defaultSpeechOptions(tts), mode: "rapid", repeat: 1, answerPauseSec: 0, cardGapSec: 0 });
    c.setItems([{ id: "test", title: "تست", question: "سلام! این یک آزمونِ صدای فارسی است. اگر این جمله را می‌شنوی، آماده‌ای." }]);
    c.subscribe((st) => {
      if (!st.playing) {
        setTesting(false);
        c.dispose();
      }
    });
    void c.play(0);
    setTimeout(() => setTesting(false), 12_000);
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">🔈 مرور صوتی</div>
          <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
            صدای خواندن کارت‌ها، پادکست و آزمون صوتی — کاملاً از دستگاه، بدون سرویس ابری (مگر خودت آدرس بدهی).
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Segmented
          value={tts.engine ?? "system"}
          onChange={(v) => save({ engine: v })}
          options={[
            { value: "system", label: "📱 موتور گوشی" },
            { value: "remote", label: "🔌 سرویس آفلاین" },
          ]}
        />
      </div>

      {persianMissing && (
        <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[10px] text-amber-800 dark:text-amber-200 leading-relaxed">
          هیچ صدای فارسی روی این دستگاه پیدا نشد. یک موتور TTS فارسی در تنظیمات اندروید نصب/فعال کن
          (Settings ← Text-to-speech) و دوباره اپ را باز کن؛ یا همین‌جا «سرویس آفلاین» را روشن کن.
        </div>
      )}

      {tts.engine !== "remote" ? (
        <>
          <label className="block mt-2">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">صدا</span>
            <select
              className={cn(inputClass, "mt-1 text-xs py-1.5")}
              value={tts.voiceURI ?? ""}
              onChange={(e) => {
                const v = voices.find((x) => x.uri === e.target.value);
                save({ voiceURI: e.target.value || undefined, voiceLabel: v ? `${voiceGroupLabel(v)} — ${v.name}` : undefined });
              }}
              aria-label="انتخاب صدا"
            >
              <option value="">خودکار (بهترین صدای فارسی)</option>
              {[...voices]
                .sort((a, b) => Number(b.persian) - Number(a.persian) || a.name.localeCompare(b.name))
                .map((v) => (
                  <option key={v.uri} value={v.uri}>
                    {v.persian ? "🇮🇷 " : ""}
                    {voiceGroupLabel(v)} — {v.name} ({v.lang})
                  </option>
                ))}
            </select>
          </label>
          <div className="text-[10px] text-slate-400 mt-1">
            {chosen
              ? `فعلی: ${chosen.name} · ${chosen.persian ? "فارسی" : "غیرفارسی"} · ${chosen.local ? "آفلاین" : "آنلاین"}`
              : "هنوز صدایی شناسایی نشد — بعد از باز کردن اپ دوباره امتحان کن."}
          </div>
        </>
      ) : (
        <div className="mt-2 space-y-1.5">
          <div className="text-[10px] text-slate-400 leading-relaxed">
            آدرسِ سرویسِ TTSِ خودت (مثلاً یک سرورِ آفلاین/محلی). متن با POST فرستاده و صدا برگردانده می‌شود.
          </div>
          <input className={cn(inputClass, "text-xs py-1.5")} dir="ltr" placeholder="http://…/tts" value={tts.remoteUrl ?? ""} onChange={(e) => save({ remoteUrl: e.target.value })} aria-label="آدرس سرویس TTS" />
          <div className="grid grid-cols-2 gap-1.5">
            <input className={cn(inputClass, "text-xs py-1.5")} dir="ltr" placeholder="نام صدا (اختیاری)" value={tts.remoteVoice ?? ""} onChange={(e) => save({ remoteVoice: e.target.value })} aria-label="نام صدا" />
            <input className={cn(inputClass, "text-xs py-1.5")} dir="ltr" placeholder="کلید (اختیاری)" value={tts.remoteKey ?? ""} onChange={(e) => save({ remoteKey: e.target.value })} aria-label="کلید سرویس" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">سرعت</div>
          <div className="flex flex-wrap gap-1">
            {TTS_SPEEDS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => save({ rate: r })}
                className={cn("px-2 py-1 rounded-lg text-[11px] border", tts.rate === r ? "bg-teal-600 text-white border-teal-600 font-bold" : "border-slate-200 dark:border-slate-600 text-slate-500")}
              >
                {toFa(r)}×
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">تکرار هر کارت</div>
          <div className="flex gap-1">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => save({ repeat: n })}
                className={cn("px-2.5 py-1 rounded-lg text-[11px] border", tts.repeat === n ? "bg-teal-600 text-white border-teal-600 font-bold" : "border-slate-200 dark:border-slate-600 text-slate-500")}
              >
                {toFa(n)}×
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">مکث بین سؤال و پاسخ: {toFa(tts.answerPauseSec)} ثانیه</span>
          <input type="range" min={0} max={20} step={1} value={tts.answerPauseSec} onChange={(e) => save({ answerPauseSec: Number(e.target.value) })} className="w-full accent-teal-600 mt-1" aria-label="مکث بین سؤال و پاسخ" />
        </label>
        <label className="block">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">مکث بین کارت‌ها: {toFa(tts.cardGapSec)} ثانیه</span>
          <input type="range" min={0} max={15} step={0.5} value={tts.cardGapSec} onChange={(e) => save({ cardGapSec: Number(e.target.value) })} className="w-full accent-teal-600 mt-1" aria-label="مکث بین کارت‌ها" />
        </label>
        <label className="block">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">بلندی صدا: {toFa(Math.round(tts.volume * 100))}٪</span>
          <input type="range" min={0} max={1} step={0.05} value={tts.volume} onChange={(e) => save({ volume: Number(e.target.value) })} className="w-full accent-teal-600 mt-1" aria-label="بلندی صدا" />
        </label>
        <label className="block">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">زیر و بمی: {toFa(tts.pitch.toFixed(1))}</span>
          <input type="range" min={0.5} max={1.5} step={0.1} value={tts.pitch} onChange={(e) => save({ pitch: Number(e.target.value) })} className="w-full accent-teal-600 mt-1" aria-label="زیر و بمی صدا" />
        </label>
      </div>

      <div className="flex items-center gap-1.5 mt-3">
        <Button size="sm" variant="outline" onClick={test} disabled={testing}>
          {testing ? "در حال پخش…" : "▶ تست صدا"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => updateSettings({ tts: { ...DEFAULT_TTS } })}>
          بازگرداندن به پیش‌فرض
        </Button>
      </div>
      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
        برای مرور صوتیِ کارت‌ها به «کارت‌ها ← 🎧 مرور صوتی» یا «مرور ← 🎧 استودیوی صوتی» برو.
        در آن‌جا محدوده، حالت (پرسش‌وپاسخ/پادکست/سریع)، تایمر خواب و صف پخش هم هست.
      </p>
    </Card>
  );
}
