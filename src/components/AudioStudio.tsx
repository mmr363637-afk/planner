import { useEffect, useMemo, useRef, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, Modal, Segmented, Toggle, inputClass } from "./ui";
import { buildQuizScopes, cardsInQuizScope } from "../lib/quizScope";
import { revealCloze } from "../lib/cloze";
import {
  SpeechController,
  TTS_SPEEDS,
  defaultSpeechOptions,
  listVoices,
  modeLabel,
  pickVoice,
  speechSupported,
  updateSpeechMediaSession,
  voiceGroupLabel,
  type SpeechItem,
  type SpeechState,
  type SpeechVoiceInfo,
} from "../lib/tts";
import { buildPodcastQueue } from "../lib/podcast";
import { classifyReviews } from "../lib/srs";
import { classifyCards } from "../lib/sm2";
import { useWakeLock } from "../lib/wakeLock";
import { toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";
import { DEFAULT_TTS, type TtsMode, type TtsSettings } from "../types";

/**
 * 🎧 استودیوی مرور صوتی — از «خواندنِ سادهٔ کارت» به یک سیستمِ کامل تبدیل شده:
 *  • انتخاب محدوده (مبحث/درس/همه) و فیلتر (سررسید/همه/نشان‌دار)
 *  • چهار حالت: پرسش‌وپاسخ (با مکث برای یادآوری)، پادکست، پخش سریع، پاسخ‌اول
 *  • کنترل کامل: پخش/مکث/ادامه، قبلی/بعدی، پرش از فهرست، توقف، تایمر خواب
 *  • سرعت، مکث بین سؤال و پاسخ، مکث بین کارت‌ها، تکرار
 *  • انتخاب موتور صدا: هر موتور نصب‌شدهٔ گوشی (از جمله موتور فارسیِ دلخواه) یا
 *    سرویسِ آفلاینِ محلی با آدرسِ دلخواه
 * این بخش کاملاً آفلاین کار می‌کند (به‌جز حالتِ سرویسِ ریموت که خودِ کاربر انتخاب می‌کند).
 */
export default function AudioStudio({
  open,
  onClose,
  initialScopeKey,
}: {
  open: boolean;
  onClose: () => void;
  initialScopeKey?: string;
}) {
  const { state, updateSettings, toast } = useStore();
  const { topicById, subjectOfTopic, subjectById } = useLookups();
  const today = todayKey();
  const settings: TtsSettings = state.settings.tts ?? DEFAULT_TTS;

  const [source, setSource] = useState<"cards" | "today">("cards");
  const [scopeKey, setScopeKey] = useState(initialScopeKey ?? "all");
  const [filter, setFilter] = useState<"due" | "all" | "bookmarked">("due");
  const [voices, setVoices] = useState<SpeechVoiceInfo[]>(() => listVoices());
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sleepMin, setSleepMin] = useState<number | null>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const controllerRef = useRef<SpeechController | null>(null);
  const itemsRef = useRef<SpeechItem[]>([]);

  const scopes = useMemo(
    () => buildQuizScopes(state.flashcards, state.topics, state.subjects, today),
    [state.flashcards, state.topics, state.subjects, today],
  );

  const supported = speechSupported();
  const chosenVoice = useMemo(() => pickVoice(voices, settings.voiceURI), [voices, settings.voiceURI]);
  const persianMissing = supported && settings.engine === "system" && voicesLoaded && !voices.some((v) => v.persian);

  // صداها در مرورگرها غیرهم‌زمان بارگذاری می‌شوند
  useEffect(() => {
    if (!supported || typeof window === "undefined") return;
    const load = () => {
      const list = listVoices();
      setVoices(list);
      if (list.length > 0) setVoicesLoaded(true);
    };
    load();
    const timer = setTimeout(load, 1200);
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      clearTimeout(timer);
      window.speechSynthesis?.removeEventListener("voiceschanged", load);
    };
  }, [supported]);

  const options = useMemo(() => defaultSpeechOptions(settings), [settings]);

  /** ساخت صف از منبع انتخاب‌شده */
  const items = useMemo<SpeechItem[]>(() => {
    if (source === "today") {
      const reviews = classifyReviews(state.reviews, today);
      const cards = classifyCards(state.flashcards, today);
      return buildPodcastQueue({
        reviews: [...reviews.overdue, ...reviews.today],
        flashcards: [...cards.overdue, ...cards.due],
        mistakes: (state.mistakes ?? []).filter((m) => m.dueDate <= today),
        topicById,
        subjectOfTopic,
        subjectById,
        limit: 40,
      }).map((q, i) => ({ id: `today:${i}`, title: q.title, question: q.text, answer: "" }));
    }
    const scoped = cardsInQuizScope(state.flashcards, state.topics, scopeKey);
    const list =
      filter === "due" ? scoped.filter((c) => c.dueDate <= today) : filter === "bookmarked" ? scoped.filter((c) => c.bookmark) : scoped;
    return list
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
      .slice(0, 60)
      .map((c) => {
        const topic = c.topicId ? topicById.get(c.topicId) : undefined;
        return {
          id: c.id,
          title: `${topic?.name ? `${topic.name} · ` : ""}${revealCloze(c.front).slice(0, 44)}`,
          question: revealCloze(c.front),
          answer: revealCloze(c.back),
          extra: c.note ? `یادداشت تو: ${c.note}` : undefined,
        };
      });
  }, [source, scopeKey, filter, state.flashcards, state.topics, state.reviews, state.mistakes, topicById, subjectOfTopic, subjectById, today]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ساخت کنترل‌گر
  useEffect(() => {
    if (!open) return;
    const controller = new SpeechController();
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe((s: SpeechState) => {
      setPlaying(s.playing);
      setPaused(s.paused);
      setIndex(s.index);
      setSpeaking(s.speaking);
      setError(s.error);
      const item = s.items[s.index];
      updateSpeechMediaSession(item?.title ?? "مرور صوتی", s.playing, "استودیوی صوتی");
    });
    return () => {
      unsubscribe();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [open]);

  // صف تازه ⇐ کنترل‌گر تازه؛ تغییرِ تنظیمات ⇐ فقط گزینه‌ها (بدون پرش به کارت اول)
  useEffect(() => {
    // صفِ تازه وسطِ پخش، صدای قبلی را قطع می‌کند تا ایندکس/متن با هم جور بمانند
    controllerRef.current?.stop();
    controllerRef.current?.setItems(items);
    setIndex(0);
  }, [items]);
  useEffect(() => {
    controllerRef.current?.setOptions(options);
  }, [options]);

  useWakeLock(open && playing);

  // تایمر خواب
  useEffect(() => {
    if (!sleepMin || !playing) return;
    const id = setTimeout(() => {
      controllerRef.current?.stop();
      setSleepMin(null);
      toast("تایمر خواب صدا را قطع کرد", "🌙");
    }, sleepMin * 60_000);
    return () => clearTimeout(id);
  }, [sleepMin, playing, toast]);

  const saveTts = (patch: Partial<TtsSettings>) => updateSettings({ tts: { ...settings, ...patch } });
  const controller = controllerRef.current;
  const current = items[Math.min(index, Math.max(0, items.length - 1))];

  return (
    <Modal open={open} onClose={onClose} title="🎧 استودیوی مرور صوتی">
      {!supported && settings.engine === "system" && (
        <Card className="mb-3 !bg-amber-50 dark:!bg-amber-900/20 !border-amber-200 dark:!border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
          ⚠️ این مرورگر/دستگاه «تبدیل متن به گفتار» ندارد. در کروم اندروید (یا اپ نصب‌شده) باز کن، یا از پایین
          «موتور آفلاینِ دلخواه» را روشن کن و آدرس سرویس TTS خودت را بگذار.
        </Card>
      )}

      {/* منبع و محدوده */}
      <Segmented
        className="mb-2"
        value={source}
        onChange={(v) => setSource(v)}
        options={[
          { value: "cards", label: "🃏 کارت‌ها" },
          { value: "today", label: "📅 مرورهای امروز" },
        ]}
      />

      {source === "cards" && (
        <>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <select className={cn(inputClass, "text-xs py-1.5")} value={scopeKey} onChange={(e) => setScopeKey(e.target.value)} aria-label="محدودهٔ صوتی">
              {scopes.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.kind === "all" ? "همهٔ کارت‌ها" : s.label} ({toFa(s.count)})
                </option>
              ))}
            </select>
            <select className={cn(inputClass, "text-xs py-1.5")} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="فیلتر کارت‌ها">
              <option value="due">فقط سررسیدها</option>
              <option value="all">همهٔ کارت‌ها</option>
              <option value="bookmarked">🔖 نشان‌دارها</option>
            </select>
          </div>
        </>
      )}

      {/* حالت */}
      <div className="mb-2">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">حالت مرور صوتی</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(["qa", "podcast", "rapid", "answer-first"] as TtsMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                saveTts({ mode: m });
                controllerRef.current?.setOptions({ mode: m });
              }}
              className={cn(
                "text-right rounded-xl border px-2.5 py-2 text-[11px] font-bold",
                settings.mode === m ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300",
              )}
            >
              {m === "qa" ? "🅰️ پرسش و پاسخ" : m === "podcast" ? "📻 پادکست" : m === "rapid" ? "⚡ پخش سریع" : "🔁 پاسخ اول"}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">{modeLabel(settings.mode)}</p>
      </div>

      {items.length === 0 ? (
        <Card className="text-center py-6 text-sm text-slate-500">
          برای این محدوده/فیلتر چیزی برای خواندن نیست.
          {source === "cards" && filter === "due" && <span className="block text-[11px] mt-1">فیلتر را روی «همهٔ کارت‌ها» بگذار.</span>}
        </Card>
      ) : (
        <>
          {/* پخش‌کننده */}
          <Card className="!bg-gradient-to-br !from-teal-600 !to-emerald-600 !border-0 text-white text-center py-5">
            <div className={cn("text-4xl mb-1", playing && !paused && "animate-pulse")}>{playing && !paused ? "🔊" : "🎙️"}</div>
            <div className="font-bold text-sm line-clamp-2 min-h-[2.5rem]">{current?.title ?? "—"}</div>
            <div className="text-[11px] opacity-80 mt-0.5">
              مورد {toFa(Math.min(index + 1, items.length))} از {toFa(items.length)}
              {paused ? " · مکث" : playing ? " · در حال پخش" : ""}
            </div>
            <div className="h-1.5 rounded-full bg-white/25 mt-3 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${((index + (playing ? 0.5 : 0)) / items.length) * 100}%` }} />
            </div>
            {speaking && <div className="text-[10px] opacity-70 mt-2 line-clamp-2 leading-relaxed">{speaking}</div>}
            <div className="flex items-center justify-center gap-3 mt-3">
              <button type="button" aria-label="قبلی" className="w-10 h-10 rounded-full bg-white/20 active:scale-95" onClick={() => controller?.prev()}>
                ⏮
              </button>
              <button
                type="button"
                aria-label={playing && !paused ? "مکث" : "پخش"}
                className="w-14 h-14 rounded-full bg-white text-teal-700 text-2xl font-black active:scale-95"
                onClick={() => controller?.toggle()}
              >
                {playing && !paused ? "⏸" : "▶"}
              </button>
              <button type="button" aria-label="بعدی" className="w-10 h-10 rounded-full bg-white/20 active:scale-95" onClick={() => controller?.next()}>
                ⏭
              </button>
              <button type="button" aria-label="توقف" className="w-10 h-10 rounded-full bg-white/20 active:scale-95" onClick={() => controller?.stop()}>
                ⏹
              </button>
            </div>
            <div className="flex items-center justify-center gap-2 mt-2 text-[10px]">
              <span>خواب:</span>
              {[10, 20, 30].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSleepMin(sleepMin === m ? null : m)}
                  className={cn("px-2 py-1 rounded-lg", sleepMin === m ? "bg-white text-teal-700 font-bold" : "bg-white/20")}
                >
                  {toFa(m)}′
                </button>
              ))}
              {sleepMin && <span className="opacity-80">({toFa(sleepMin)} دقیقه)</span>}
            </div>
          </Card>

          {error && <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-2 leading-relaxed">⚠️ {error}</div>}

          {/* تنظیمات پخش */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">سرعت خواندن</div>
              <div className="flex flex-wrap gap-1">
                {TTS_SPEEDS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => saveTts({ rate: r })}
                    className={cn("px-2 py-1 rounded-lg text-[11px] border", settings.rate === r ? "bg-teal-600 text-white border-teal-600 font-bold" : "border-slate-200 dark:border-slate-600 text-slate-500")}
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
                    onClick={() => saveTts({ repeat: n })}
                    className={cn("px-2.5 py-1 rounded-lg text-[11px] border", settings.repeat === n ? "bg-teal-600 text-white border-teal-600 font-bold" : "border-slate-200 dark:border-slate-600 text-slate-500")}
                  >
                    {toFa(n)}×
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">مکث بین سؤال و پاسخ: {toFa(settings.answerPauseSec)} ثانیه</span>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={settings.answerPauseSec}
                onChange={(e) => saveTts({ answerPauseSec: Number(e.target.value) })}
                className="w-full accent-teal-600 mt-1"
                aria-label="مکث بین سؤال و پاسخ"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">مکث بین کارت‌ها: {toFa(settings.cardGapSec)} ثانیه</span>
              <input
                type="range"
                min={0}
                max={15}
                step={0.5}
                value={settings.cardGapSec}
                onChange={(e) => saveTts({ cardGapSec: Number(e.target.value) })}
                className="w-full accent-teal-600 mt-1"
                aria-label="مکث بین کارت‌ها"
              />
            </label>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div>
              <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">خواندن خودکار کارت بعدی</div>
              <div className="text-[10px] text-slate-400">برای گوش‌دادن در راه و قبل خواب</div>
            </div>
            <Toggle checked={settings.autoNext !== false} onChange={(v) => saveTts({ autoNext: v })} />
          </div>

          {/* موتور صدا */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">🔈 موتور صدا</span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full", settings.engine === "remote" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300")}>
                {settings.engine === "remote" ? "سرویس آفلاین" : "موتور گوشی"}
              </span>
            </div>
            {persianMissing && (
              <div className="mt-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2 text-[10px] text-amber-800 dark:text-amber-200 leading-relaxed">
                هیچ صدای فارسی روی این دستگاه پیدا نشد. موتور TTS فارسی را در تنظیمات اندروید نصب/فعال کن (یا همین‌جا موتور آفلاین را روشن کن)؛
                وگرنه متن با تلفظ انگلیسی خوانده می‌شود.
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => saveTts({ engine: "system", remoteUrl: settings.remoteUrl })}
                className={cn("rounded-xl border px-2.5 py-2 text-[11px] font-bold", settings.engine === "system" ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200" : "border-slate-200 dark:border-slate-600 text-slate-500")}
              >
                📱 موتور نصب‌شدهٔ گوشی
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemoteOpen(true);
                  saveTts({ engine: "remote" });
                }}
                className={cn("rounded-xl border px-2.5 py-2 text-[11px] font-bold", settings.engine === "remote" ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200" : "border-slate-200 dark:border-slate-600 text-slate-500")}
              >
                🔌 موتور آفلاین دلخواه
              </button>
            </div>

            {settings.engine === "system" && (
              <div className="mt-2">
                <select
                  className={cn(inputClass, "text-xs py-1.5")}
                  value={settings.voiceURI ?? ""}
                  onChange={(e) => {
                    const v = voices.find((x) => x.uri === e.target.value);
                    saveTts({ voiceURI: e.target.value || undefined, voiceLabel: v ? `${voiceGroupLabel(v)} — ${v.name}` : undefined });
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
                <div className="text-[10px] text-slate-400 mt-1">
                  {chosenVoice
                    ? `صدا: ${chosenVoice.name} · ${chosenVoice.persian ? "فارسی" : "غیرفارسی"}${chosenVoice.local ? " · آفلاین" : " · آنلاین"}`
                    : "هنوز صدایی شناسایی نشد."}
                </div>
              </div>
            )}

            {settings.engine === "remote" && (
              <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                متن به آدرسِ سرویس با POST فرستاده می‌شود و صدا (فایل، آدرس یا base64) برگردانده می‌شود.
                این سرویس می‌تواند موتور آفلاینِ فارسیِ خودت روی گوشی/لپ‌تاپ باشد؛ هیچ داده‌ای به سرویس دیگری نمی‌رود.
                {settings.remoteUrl ? "" : " آدرس هنوز تنظیم نشده."}
              </p>
            )}

            {remoteOpen && (
              <div className="mt-2 rounded-xl border border-indigo-200 dark:border-indigo-800/60 p-2.5 space-y-1.5">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  آدرس سرویس (نمونه: <code dir="ltr">http://192.168.1.20:8080/tts</code>)
                </div>
                <input
                  className={cn(inputClass, "text-xs py-1.5")}
                  dir="ltr"
                  value={settings.remoteUrl ?? ""}
                  onChange={(e) => saveTts({ remoteUrl: e.target.value })}
                  placeholder="http://…/tts"
                  aria-label="آدرس سرویس TTS"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    className={cn(inputClass, "text-xs py-1.5")}
                    dir="ltr"
                    value={settings.remoteVoice ?? ""}
                    onChange={(e) => saveTts({ remoteVoice: e.target.value })}
                    placeholder="نام صدا (اختیاری)"
                    aria-label="نام صدا در سرویس"
                  />
                  <input
                    className={cn(inputClass, "text-xs py-1.5")}
                    dir="ltr"
                    value={settings.remoteKey ?? ""}
                    onChange={(e) => saveTts({ remoteKey: e.target.value })}
                    placeholder="کلید (اختیاری)"
                    aria-label="کلید سرویس"
                  />
                </div>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">صدای سرویس معادل بلندی صدا</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.volume}
                    onChange={(e) => saveTts({ volume: Number(e.target.value) })}
                    className="w-24 accent-indigo-600"
                    aria-label="بلندی صدا"
                  />
                </label>
                <div className="text-[10px] text-slate-400">
                  قالبِ درخواست: <code dir="ltr">{'{"text":"…","voice":"…","rate":1,"lang":"fa-IR"}'}</code> — پاسخ:
                  فایل صوتی، <code dir="ltr">{"{url}"}</code> یا <code dir="ltr">{"{audio: base64}"}</code>.
                </div>
              </div>
            )}
            {settings.engine === "remote" && !remoteOpen && (
              <button type="button" className="text-[10px] text-indigo-600 dark:text-indigo-300 mt-1" onClick={() => setRemoteOpen(true)}>
                تنظیمات سرویس
              </button>
            )}
          </div>

          {/* صف */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">صف پخش ({toFa(items.length)})</span>
              {playing && (
                <button type="button" className="text-[10px] text-slate-400" onClick={() => controller?.stop()}>
                  توقف کامل
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => controller?.jump(i)}
                  className={cn(
                    "text-right text-[11px] p-2 rounded-xl border transition-colors flex items-center gap-2",
                    i === index ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20 font-bold text-teal-800 dark:text-teal-200" : "border-slate-200 dark:border-slate-700 text-slate-500",
                  )}
                >
                  <span className="shrink-0">{i === index && playing ? "🔊" : `${toFa(i + 1)}.`}</span>
                  <span className="truncate flex-1">{item.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => controller?.play(index)}>
              ▶ از همین‌جا بخوان
            </Button>
            <Button variant="secondary" onClick={() => controller?.play(0)}>
              از اول
            </Button>
          </div>
        </>
      )}

      <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
        صدای گفتار در همهٔ حالت‌ها آفلاین از دستگاه می‌آید (مگر حالت «سرویس آفلاین» که خودت آدرسش را می‌دهی).
        هنگام پخش، صفحه روشن می‌ماند و کنترل‌های پخش در صفحهٔ قفل گوشی هم دیده می‌شوند.
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Chip className="!bg-slate-100 !text-slate-600 dark:!bg-slate-700 dark:!text-slate-300">🔈 {settings.engine === "remote" ? "سرویس دلخواه" : "موتور گوشی"}</Chip>
        <Chip className="!bg-slate-100 !text-slate-600 dark:!bg-slate-700 dark:!text-slate-300">⏱️ مکث {toFa(settings.answerPauseSec)} ثانیه</Chip>
        <Chip className="!bg-slate-100 !text-slate-600 dark:!bg-slate-700 dark:!text-slate-300">{chosenVoice?.persian ? "🇮🇷 فارسی" : "زبان: نامشخص"}</Chip>
      </div>
    </Modal>
  );
}
