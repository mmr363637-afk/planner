import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Card, Chip, EmptyState, Modal, ProgressBar, SectionTitle, inputClass } from "./ui";
import {
  LIBRARY_STALE_MS,
  clearLibraryCache,
  completedLessonCount,
  formatDurationFa,
  getLibraryBase,
  groupLessonsBySubject,
  lessonCompletion,
  lessonUrl,
  libraryHomeUrl,
  libraryQbankUrl,
  librarySubjectUrl,
  libraryVersionKey,
  loadLibraryManifest,
  progressOf,
  qbankPartUrl,
  qbankStandaloneUrl,
  continueReading,
  searchLessonsRanked,
  setLibraryBase,
  totalStudiedSeconds,
  type LibraryLoad,
} from "../lib/lessonLibrary";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import type { LessonMeta, LibrarySubjectMeta } from "../types";

/**
 * 📖 کتابخانهٔ درسنامه — نمایِ اپ از مخزنِ محتوای HTML.
 *
 * چه چیزی از مخزنِ محتوا (DATA) می‌آید و چه چیزی در اپ می‌ماند؟
 *
 *   از مخزن (منبعِ حقیقت، هرگز در اپ بازتولید نمی‌شود):
 *     عنوانِ درسنامه، درس/دسته‌بندی، مسیرِ فایلِ HTML، مدت‌زمانِ محتوا (دقیقه)،
 *     تعدادِ بخش/واژه/فلش‌کارت/جدول/سؤالِ تعاملی، فهرستِ درس‌ها و رنگِ هر درس،
 *     و بخش‌های بانکِ سؤالِ کتاب‌محورِ همان مخزن.
 *
 *   در اپ (دادهٔ اختصاصیِ کاربر، در state و ذخیره‌سازیِ خودِ اپ):
 *     زمانِ واقعیِ مطالعهٔ هر درسنامه، تعدادِ بازدید، آخرین/اولین زمانِ باز شدن،
 *     وضعیتِ «تمام شد»، و فلش‌کارت‌هایی که کاربر می‌سازد.
 *
 * بارگذاری تدریجی: در ورود به این بخش فقط `manifest.json` (≈۷۰ کیلوبایت) گرفته
 * می‌شود. فایلِ HTML یک درسنامه فقط وقتی کاربر همان درس را باز کند از گیت‌هاب
 * می‌آید؛ کلِ مخزن هرگز یک‌جا دانلود یا ذخیره نمی‌شود.
 *
 * دو بانک سؤال عمداً جدا نگه داشته شده‌اند:
 *   • «بانک سؤال پره‌انترنی/دستیاری» اپ → سؤال‌های واقعیِ آزمون‌ها بر اساسِ سال و مبحث
 *   • «آزمون‌های کتابخانه» → ۷۹۰ سؤالِ فصل‌به‌فصلِ کتاب‌محورِ مخزنِ محتوا
 * و «سؤال‌های تعاملیِ هر درسنامه» هم بخشی از خودِ همان فایلِ HTML است؛ هیچ‌کدام
 * به‌طور خودکار با بانکِ مستقل ادغام نمی‌شوند و عملکردشان در فایلِ HTML دست‌نخورده می‌ماند.
 */

/** لنگرِ بخشِ سؤال‌های تعاملی درونِ فایلِ درسنامه */
const MCQ_ANCHOR = "#mcqs";

/** چند ثانیه یک‌بار زمانِ مطالعه به state واریز شود (تا با بستنِ ناگهانی از دست نرود) */
const TICK_SECONDS = 20;

/** چند ردیف در هر بار نمایشِ فهرست (بقیه با «نمایش بیشتر») */
const LIST_PAGE = 40;

/**
 * برچسبِ کوتاهِ مدت‌زمان برای کاشیِ خلاصه (۴ کاشی در یک ردیفِ باریک جا می‌شوند).
 * مقدارِ دقیق در `title` همان کاشی می‌آید، پس دقت از دست نمی‌رود.
 */
function durationTile(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m < 60 ? `${toFa(m)} دقیقه` : `${toFa(Math.round(m / 60))} ساعت`;
}

interface LessonReaderProps {
  lesson: LessonMeta;
  subject?: LibrarySubjectMeta;
  onClose: () => void;
}

/**
 * درسنامه‌خوانِ درونِ اپ: همان فایلِ HTML مخزن در یک iframe + تایمرِ زمانِ واقعیِ
 * مطالعه. اگر iframe باز نشد (آفلاین/مسدود)، لینکِ مستقیم همان‌جا هست.
 *
 * تایمر فقط وقتی صفحه دیده می‌شود و iframe باز است می‌شمارد؛ با پنهان‌شدنِ تب متوقف
 * می‌شود تا «زمانِ مطالعهٔ واقعی» واقعاً واقعی باشد.
 */
function LessonReader({ lesson, subject, onClose }: LessonReaderProps) {
  const { state, visitLesson, addLessonStudyTime, creditLessonStudyTime, setLessonCompleted, toast } = useStore();
  const url = lessonUrl(lesson);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [framed, setFramed] = useState(false);
  const pending = useRef(0);
  const lessonId = lesson.id;
  const visited = useRef(false);

  // مبحثِ متناظر در اپ — برای واریزِ زمان به آمارِ کلیِ مطالعه
  const topic = useMemo(() => {
    const subjectRow = state.subjects.find((s) => (lesson.appSubjectKeys ?? []).includes(s.sampleId ?? ""));
    if (!subjectRow) return null;
    return state.topics.find((t) => t.subjectId === subjectRow.id) ?? null;
  }, [state.subjects, state.topics, lesson.appSubjectKeys]);

  useEffect(() => {
    if (visited.current) return;
    visited.current = true;
    visitLesson(lessonId);
  }, [lessonId, visitLesson]);

  /**
   * واریزِ ثانیه‌های معوق: هم رکوردِ درسنامه، هم — با پاس‌دادنِ مبحث — آمارِ
   * مطالعهٔ همان روز (دقیقه‌های کامل، هر دقیقه یک‌بار). این همان حلقه‌ای است که
   * قبلاً جا افتاده بود: خواندن درسنامه در خانه/آمار/زنجیره دیده نمی‌شد.
   */
  const topicIdRef = useRef<string | null>(null);
  topicIdRef.current = topic?.id ?? null;
  const flush = useCallback(() => {
    const due = Math.floor(pending.current);
    if (due < 1) return;
    pending.current -= due;
    addLessonStudyTime(lessonId, due, { topicId: topicIdRef.current });
  }, [addLessonStudyTime, lessonId]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      pending.current += 1;
      setSeconds((s) => s + 1);
      if (pending.current >= TICK_SECONDS) flush();
    }, 1000);
    return () => clearInterval(id);
  }, [paused, flush]);

  // با پنهان‌شدنِ تب/اپ، شمارش متوقف می‌شود (زمانِ واقعیِ مطالعه، نه زمانِ بازبودنِ پنجره)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setPaused(true);
        flush();
      } else setPaused(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [flush]);

  // موقعِ بستن، هر چه مانده واریز می‌شود تا یک ثانیه هم از دست نرود
  useEffect(() => {
    return () => {
      const due = Math.floor(pending.current);
      if (due >= 1) addLessonStudyTime(lessonId, due, { topicId: topicIdRef.current });
    };
    // فقط یک‌بار در پایانِ عمرِ کامپوننت
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * بستن: ثانیه‌ها واریز، و اگر مطالعه به یک دقیقهٔ کامل رسیده بود، همان دقیقه‌ها
   * یک‌بار به «آمارِ امروز» می‌روند. `once: "onClose"` تضمین می‌کند باز و بسته کردنِ
   * پشتِ‌سرهم یک درسنامه، زمان را چند بار ثبت نکند.
   */
  const close = () => {
    flush();
    const credited = creditLessonStudyTime({ lessonId, topicId: topicIdRef.current, once: "onClose" });
    if (credited.credited) toast(`${toFa(credited.minutes)} دقیقه به مطالعهٔ امروز اضافه شد`, "⏱");
    onClose();
  };

  /** بستن با Escape — همان رفتارِ بقیهٔ پنجره‌ها، برای خوانندهٔ تمام‌صفحه */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const record = progressOf(state.lessonProgress, lessonId);
  const totalSeconds = record.seconds + seconds;
  const pct = lesson.minutes > 0 ? Math.min(100, Math.round(((totalSeconds / 60) / lesson.minutes) * 100)) : 0;
  /** دقیقه‌های آمادهٔ واریز به آمارِ امروز (بعد از آخرین ثبت) */
  const pendingMinutes = Math.floor(Math.max(0, totalSeconds - (record.creditedSeconds ?? 0)) / 60);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 backdrop-blur-[2px]" dir="rtl" role="dialog" aria-modal="true" aria-label={`درسنامه: ${lesson.title}`}>
      <div className="shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={close} className="shrink-0 text-lg leading-none px-1" aria-label="بستنِ درسنامه">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold truncate text-slate-800 dark:text-slate-100">
              {subject?.icon ? `${subject.icon} ` : "📖 "}
              {lesson.title}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              محتوای درسنامه: {formatDurationFa(lesson.minutes, toFa)} · مطالعهٔ تو: {formatDurationFa(totalSeconds / 60, toFa)}
              {record.creditedSeconds ? ` · ${formatDurationFa(record.creditedSeconds / 60, toFa)} در آمارِ امروز` : ""}
              {paused && " · ⏸ متوقف"}
            </div>
          </div>
          <Button size="sm" variant={paused ? "primary" : "secondary"} onClick={() => setPaused((p) => !p)}>
            {paused ? "▶ ادامهٔ شمارش" : "⏸ توقف"}
          </Button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button size="sm" variant="outline" title="بازکردنِ همان فایل در تبِ جداگانه">
              ↗ تبِ جدا
            </Button>
          </a>
        </div>
        <div className="mt-1.5">
          <ProgressBar value={pct} height="h-1" color="#0d9488" />
        </div>
      </div>

      <div className="flex-1 min-h-0 relative bg-white">
        {iframeFailed ? (
          <div className="p-4 text-center text-[12px] text-slate-600 dark:text-slate-300">
            <p className="mb-2">درسنامه درونِ اپ باز نشد (احتمالاً آفلاین یا مسدود بودنِ قاب).</p>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Button size="sm">↗ بازکردن در تبِ تازه</Button>
            </a>
          </div>
        ) : (
          <>
            {/*
              ⏳ اسکلتِ سبک تا وقتی خودِ درسنامه (که گاهی ۹۰۰ کیلوبایت HTML با
              تصاویرِ base64 است) آماده شود؛ قبلاً این فاصله یعنی «صفحهٔ سفید +
              احساسِ کندی/کرش» روی گوشی.
            */}
            {!framed && (
              <div className="absolute inset-0 z-10 flex flex-col gap-3 p-4 bg-white" aria-hidden="true">
                <div className="h-6 w-1/2 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-40 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <p className="text-center text-[11px] text-slate-400 mt-1">در حال آوردنِ درسنامه…</p>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-center text-[11px] text-teal-600 dark:text-teal-300 underline underline-offset-4">
                  اگر دیر شد، در تبِ تازه بازش کن ↗
                </a>
              </div>
            )}
            <iframe
              src={url}
              title={lesson.title}
              className="w-full h-full border-0"
              // عمداً eager: خودِ همین درسنامه همان چیزی است که کاربر منتظرش است
              loading="eager"
              referrerPolicy="no-referrer"
              allow="fullscreen"
              onError={() => setIframeFailed(true)}
              onLoad={(e) => {
                setFramed(true);
                // مرورگر خطای شبکه را با onLoad هم گزارش می‌کند؛ اگر محتوا نیامد،
                // همان لینکِ مستقیم پیشنهاد می‌شود.
                try {
                  const doc = (e.target as HTMLIFrameElement).contentDocument;
                  if (doc && doc.body && doc.body.childElementCount === 0) setIframeFailed(true);
                } catch {
                  /* دسترسی به محتوای cross-origin نداریم — طبیعی است و یعنی صفحه آمده */
                }
              }}
            />
          </>
        )}
      </div>

      <div className="shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-3 py-2 flex flex-wrap items-center gap-1.5">
        <a href={`${url}${MCQ_ANCHOR}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="ghost" title="سؤال‌های تعاملیِ اختصاصیِ همین درسنامه (بخشی از فایلِ HTML)">
            ❓ {toFa(lesson.mcq)} سؤالِ تعاملیِ این درسنامه
          </Button>
        </a>
        {/*
          📊 ثبتِ دستیِ همان دقیقه‌ها. تایمر هر ۲۰ ثانیه خودش دقیقه‌های کامل را به
          آمارِ روز می‌ریزد؛ این دکمه برای بقیهٔ ثانیه‌ها و برای وقتی است که کاربر
          می‌خواهد همین حالا ثبت شود (هر دقیقه فقط یک‌بار — با `creditedSeconds`).
        */}
        <Button
          size="sm"
          variant="ghost"
          title={
            pendingMinutes > 0
              ? "همین دقیقه‌های مطالعه‌شده را به آمارِ مطالعهٔ امروز اضافه کن"
              : "همهٔ دقیقه‌های این درسنامه در آمارِ امروز ثبت شده است"
          }
          disabled={pendingMinutes < 1}
          onClick={() => {
            const res = creditLessonStudyTime({ lessonId, topicId: topic?.id ?? null });
            toast(
              res.credited
                ? `${toFa(res.minutes)} دقیقه به مطالعهٔ امروز اضافه شد`
                : "دقیقهٔ کاملی برای ثبت نمانده است",
              res.credited ? "📊" : "ℹ️",
            );
          }}
        >
          📊 ثبت در مطالعهٔ امروز{pendingMinutes > 0 ? ` (${toFa(pendingMinutes)})` : ""}
        </Button>
        <Button
          size="sm"
          variant={record.done ? "outline" : "secondary"}
          title="این درسنامه را در پیشرفتِ خودت «تمام‌شده» علامت بزن؛ زمانِ خوانده‌شده هم یک‌بار به آمارِ امروز می‌رود"
          onClick={() => {
            const res = creditLessonStudyTime({ lessonId, topicId: topic?.id ?? null, once: "onDone" });
            setLessonCompleted(lessonId, true);
            flush();
            toast(
              res.credited
                ? `«تمام شد» ثبت شد و ${toFa(res.minutes)} دقیقه به مطالعهٔ امروز اضافه شد`
                : "این درسنامه «تمام‌شده» ثبت شد",
              "✅",
            );
          }}
        >
          {record.done ? "✅ تمام شد" : "✓ تمام کردم"}
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={close} title="زمانِ خوانده‌شده هم ثبت می‌شود، هم در درسنامه و هم در آمارِ امروز">
          بستن و ثبتِ زمان
        </Button>
      </div>
    </div>
  );
}

export default function LessonLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, setLessonCompleted, setLibraryVersion, toast } = useStore();
  const [load, setLoad] = useState<LibraryLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [subjectKey, setSubjectKey] = useState<string | "all">("all");
  const [onlyUnfinished, setOnlyUnfinished] = useState(false);
  const [reading, setReading] = useState<LessonMeta | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [newVersion, setNewVersion] = useState<string | null>(null);

  const manifest = load?.manifest ?? null;

  const refresh = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        if (force) clearLibraryCache();
        const result = await loadLibraryManifest({ force });
        setLoad(result);
        if (result.manifest && result.source === "network") {
          // نسخهٔ محتوا از خودِ مانیفست خوانده می‌شود (نه از تاریخِ درخواست)
          const versionKey = libraryVersionKey(result.manifest);
          const seen = state.libraryVersion;
          if (seen && seen !== versionKey) {
            setNewVersion(versionKey);
            toast("محتوای کتابخانه در مخزن به‌روز شده — فهرستِ درسنامه‌ها تازه است", "📖");
          }
          setLibraryVersion(versionKey);
        }
      } finally {
        setLoading(false);
      }
    },
    [state.libraryVersion, setLibraryVersion, toast],
  );

  useEffect(() => {
    if (!open || load || loading) return;
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups = useMemo(() => groupLessonsBySubject(manifest), [manifest]);
  /**
   * جست‌وجوی امتیازدهی‌شده (نرمال‌سازیِ فارسی + فازی + چندواژه‌ای) — جای
   * `includes` خام که با یک «آورت» به‌جای «آئورت» یا «قلب» تنها، از کار می‌افتاد.
   */
  const filtered = useMemo(() => {
    if (!manifest) return [];
    const list = searchLessonsRanked(manifest, query);
    return list.filter((l) => {
      if (subjectKey !== "all" && l.subject !== subjectKey) return false;
      if (onlyUnfinished && progressOf(state.lessonProgress, l.id).done) return false;
      return true;
    });
  }, [manifest, query, subjectKey, onlyUnfinished, state.lessonProgress]);

  /** «از همین‌جا ادامه بده» — فقط وقتی جست‌وجو/فیلتری فعال نیست تا فهرست شلوغ نشود */
  const suggestions = useMemo(
    () =>
      query.trim() || onlyUnfinished || subjectKey !== "all"
        ? []
        : continueReading(manifest, state.lessonProgress, 3),
    [manifest, state.lessonProgress, query, onlyUnfinished, subjectKey],
  );
  /** فهرستِ کلی یک‌جا محدود می‌شود: ۱۵۰+ کارتِ کامل روی گوشی هم سنگین است، هم گم‌کننده */
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  useEffect(() => setListLimit(LIST_PAGE), [query, subjectKey, onlyUnfinished]);
  const searching = query.trim().length > 0;

  const studiedSeconds = useMemo(() => totalStudiedSeconds(state.lessonProgress), [state.lessonProgress]);
  const doneCount = useMemo(() => completedLessonCount(state.lessonProgress), [state.lessonProgress]);

  const openLesson = (lesson: LessonMeta) => setReading(lesson);

  const openExternal = (lesson: LessonMeta) => {
    // همان فایلِ HTML مخزن، مستقیم در تبِ تازه — بدونِ اینکه چیزی در اپ ذخیره شود
    window.open(lessonUrl(lesson), "_blank", "noopener,noreferrer");
  };

  return (
    <Modal open={open} onClose={onClose} title="📖 کتابخانهٔ درسنامه‌ها">
      <div className="px-4 pb-4 space-y-3 overflow-y-auto">
        {/* ————————— وضعیتِ اتصال ————————— */}
        <Card className="!p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-slate-800 dark:text-slate-100">مخزنِ محتوای درسنامه</div>
              {/* آدرسِ خامِ مخزن عمداً این‌جا چاپ نمی‌شود؛ فقط داخلِ ⚙️ دیده و عوض می‌شود */}
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                فهرستِ درسنامه‌ها از مخزنِ محتوا گرفته می‌شود
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setShowSettings((v) => !v)} title="تنظیمِ آدرسِ مخزنِ محتوا">
                ⚙️
              </Button>
              <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh(true)}>
                {loading ? "…" : "🔄 به‌روزرسانی"}
              </Button>
            </div>
          </div>

          {showSettings && (
            <div className="mt-2 space-y-1.5">
              <input
                className={inputClass}
                dir="ltr"
                value={urlDraft || getLibraryBase()}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://mmr363637-afk.github.io/DATA/lib/"
                aria-label="آدرسِ مخزنِ محتوا"
              />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  onClick={() => {
                    setLibraryBase(urlDraft.trim());
                    setUrlDraft("");
                    clearLibraryCache();
                    setLoad(null);
                    void refresh(true);
                  }}
                >
                  ذخیره و دریافت
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowSettings(false)}>
                  بستن
                </Button>
              </div>
              <p className="text-[9.5px] text-slate-400 leading-relaxed">
                فقط مانیفستِ فهرست از این آدرس گرفته می‌شود؛ فایلِ هر درسنامه هنگامِ بازکردنِ همان درس.
              </p>
            </div>
          )}

          {manifest ? (
            <>
              <div className="grid grid-cols-4 gap-1.5 mt-2">
                {([
                  { icon: "📚", label: "درسنامه", value: toFa(manifest.counts.lessons) },
                  { icon: "🧪", label: "درس", value: toFa(manifest.counts.subjects) },
                  {
                    icon: "⏱",
                    label: "محتوا",
                    value: durationTile(manifest.counts.minutes),
                    // ⚠️ این «مدت‌زمانِ خودِ محتوا»ست (از مخزن)، نه زمانِ مطالعهٔ کاربر
                    title: `مجموعِ مدت‌زمانِ محتوا: ${formatDurationFa(manifest.counts.minutes, toFa)}`,
                  },
                  { icon: "🃏", label: "فلش‌کارت", value: toFa(manifest.lessons.reduce((a, l) => a + l.flashcards, 0)) },
                ] as { icon: string; label: string; value: string; title?: string }[]).map((tile) => (
                  <div
                    key={tile.label}
                    title={tile.title}
                    className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-1.5 py-1.5 text-center"
                  >
                    <div className="text-[13px]">{tile.icon}</div>
                    <div className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">{tile.value}</div>
                    <div className="text-[9px] text-slate-400">{tile.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[9.5px] text-slate-400">
                <Chip className={cn("!text-[9.5px] !px-1.5 !py-0.5", load?.source === "cache" ? "!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300" : "!bg-teal-100 !text-teal-700 dark:!bg-teal-900/40 dark:!text-teal-300")}>
                  {load?.source === "network" ? "🟢 از مخزن" : "🟡 از کشِ محلی (آفلاین)"}
                </Chip>
                <span>نسخهٔ {toFa(String(manifest.version))} · {manifest.updatedAt || "—"}</span>
                <span>· کش تا {toFa(Math.round(LIBRARY_STALE_MS / 3_600_000))} ساعت</span>
              </div>
              {load?.error && load.source === "cache" && (
                <p className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  ⚠️ مخزن در دسترس نبود ({load.error})؛ فهرستِ ذخیره‌شدهٔ قبلی نمایش داده می‌شود و متنِ درسنامه با بازکردنِ هر درس گرفته می‌شود.
                </p>
              )}
              {newVersion && (
                <p className="mt-1.5 text-[10px] text-teal-700 dark:text-teal-300">
                  ✨ نسخهٔ محتوا عوض شده ({newVersion}). پیشرفتِ مطالعهٔ تو دست‌نخورده می‌ماند.
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {loading ? "در حالِ گرفتنِ فهرستِ درسنامه‌ها…" : load?.error ? `کتابخانه در دسترس نیست: ${load.error}` : "هنوز فهرستی گرفته نشده."}
            </p>
          )}

          {/* پیشرفتِ خودِ کاربر — جدا از دادهٔ محتوا */}
          <div className="mt-2 rounded-xl bg-teal-50/70 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 px-2.5 py-2">
            <div className="text-[10.5px] font-bold text-teal-800 dark:text-teal-200">پیشرفتِ مطالعهٔ تو (ذخیره در اپ)</div>
            <div className="text-[10px] text-teal-700/80 dark:text-teal-300/80 mt-0.5">
              {formatDurationFa(studiedSeconds / 60, toFa)} مطالعهٔ واقعی · {toFa(doneCount)} درسنامه تمام‌شده
            </div>
          </div>
        </Card>

        {/* ————————— «از همین‌جا ادامه بده» ————————— */}
        {manifest && suggestions.length > 0 && (
          <section aria-label="ادامهٔ مطالعه">
            <SectionTitle>
              ⏯ از همین‌جا ادامه بده
              <span className="text-[10px] font-normal text-slate-400 mr-1">بر اساسِ آخرین مطالعه‌ات</span>
            </SectionTitle>
            <div className="grid gap-1.5 sm:grid-cols-3 mt-1.5">
              {suggestions.map(({ lesson, kind }) => {
                const p = progressOf(state.lessonProgress, lesson.id);
                const pct = Math.round(lessonCompletion(state.lessonProgress, lesson) * 100);
                return (
                  <button
                    key={`${kind}:${lesson.id}`}
                    type="button"
                    onClick={() => openLesson(lesson)}
                    className="text-right rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/60 dark:bg-teal-900/15 px-2.5 py-2 hover:border-teal-400 transition-colors"
                  >
                    <div className="text-[10px] font-bold text-teal-700 dark:text-teal-300">
                      {kind === "resume" ? `⏯ ادامه · ${formatDurationFa(p.seconds / 60, toFa)} خوانده‌ای` : "🌱 تازه"}
                    </div>
                    <div className="text-[11.5px] font-bold text-slate-800 dark:text-slate-100 leading-relaxed line-clamp-2 mt-0.5">
                      {lesson.title}
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar value={pct} height="h-1" color="#0d9488" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ————————— فیلترها (چسبیده به بالا تا هنگامِ اسکرول گم نشود) ————————— */}
        {manifest && (
          <div className="sticky -top-1 z-10 -mx-1 px-1 py-2 bg-white/95 dark:bg-slate-800/95 backdrop-blur space-y-2 rounded-xl">
            <div className="relative">
              <input
                className={cn(inputClass, "!pl-9")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="🔍 جست‌وجو در درسنامه‌ها — عنوان، درس، نامِ فایل (فارسیِ بی‌نقطه و نیم‌فاصله هم قبول است)"
                aria-label="جست‌وجوی درسنامه"
                type="search"
                enterKeyHint="search"
              />
              {searching && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="پاک‌کردنِ جست‌وجو"
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200/80 dark:bg-slate-700 text-[11px] text-slate-500 dark:text-slate-300"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <Chip active={subjectKey === "all"} onClick={() => setSubjectKey("all")} className="!text-[10px]">
                همهٔ درس‌ها
              </Chip>
              {groups.map(({ subject, lessons }) => (
                <Chip key={subject.key} active={subjectKey === subject.key} onClick={() => setSubjectKey(subject.key)} className="!text-[10px]">
                  {subject.icon ?? ""} {subject.name} ({toFa(lessons.length)})
                </Chip>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={onlyUnfinished} onChange={(e) => setOnlyUnfinished(e.target.checked)} />
                فقط درسنامه‌هایی که تمام نکرده‌ام
              </label>
              <span className="text-[10px] text-slate-400" aria-live="polite">
                {searching
                  ? `${toFa(filtered.length)} نتیجه از ${toFa(manifest.lessons.length)} درسنامه`
                  : `${toFa(manifest.lessons.length)} درسنامه در ${toFa(manifest.subjects.length)} درس`}
              </span>
            </div>
          </div>
        )}

        {/* ————————— فهرستِ درسنامه‌ها ————————— */}
        {manifest && filtered.length === 0 && (
          <EmptyState
            icon="🔍"
            title="درسنامه‌ای پیدا نشد"
            description={searching ? "عبارت را کوتاه‌تر کن، یا فیلترِ درس را بردار؛ جست‌وجو با نیم‌فاصله/اعراب هم کار می‌کند." : "فیلترِ درس را عوض کن."}
            action={
              searching ? (
                <Button size="sm" variant="outline" onClick={() => { setQuery(""); setSubjectKey("all"); }}>
                  پاک‌کردنِ فیلترها
                </Button>
              ) : undefined
            }
          />
        )}

        {(() => {
          const bySubject = new Map(groups.map((g) => [g.subject.key, g.subject]));
          // ترتیبِ ردیف‌ها همان امتیازِ جست‌وجو است؛ وقتی مرتب‌سازی معنادار است
          // (جست‌وجو فعال) فهرست را «صاف» نشان می‌دهیم تا بهترین نتیجه اول باشد.
          if (searching) {
            const flat = filtered.slice(0, listLimit);
            return (
              <>
                <div className="space-y-1.5">
                  {flat.map((lesson) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      subject={bySubject.get(lesson.subject)}
                      onRead={() => openLesson(lesson)}
                      onOpenExternal={() => openExternal(lesson)}
                      onToggleDone={(done) => setLessonCompleted(lesson.id, done)}
                    />
                  ))}
                </div>
                {filtered.length > flat.length && (
                  <Button variant="outline" className="w-full mt-2" onClick={() => setListLimit((n) => n + LIST_PAGE)}>
                    نمایشِ {toFa(Math.min(LIST_PAGE, filtered.length - flat.length))} نتیجهٔ دیگر
                  </Button>
                )}
              </>
            );
          }
          let rendered = 0;
          return groups
            .filter((g) => subjectKey === "all" || g.subject.key === subjectKey)
            .map(({ subject, lessons }) => {
              const rows = lessons.filter((l) => filtered.includes(l));
              if (rows.length === 0) return null;
              // سقفِ نمایش: ردیف‌های بعدی با یک دکمه اضافه می‌شوند تا بازکردنِ
              // کتابخانه روی گوشی سنگین نشود (۱۵۰+ کارتِ کامل در یک صفحه).
              const room = Math.max(0, listLimit - rendered);
              if (room === 0) return null;
              const shown = rows.slice(0, room);
              rendered += shown.length;
              return (
                <section key={subject.key}>
                  <SectionTitle
                    action={
                      subject.page ? (
                        <a href={librarySubjectUrl(subject)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-teal-600 dark:text-teal-300">
                          صفحهٔ درس ↗
                        </a>
                      ) : undefined
                    }
                  >
                    {subject.icon ?? "📘"} {subject.name}
                    <span className="text-[10px] font-normal text-slate-400 mr-1">
                      {toFa(rows.length)} درسنامه · {formatDurationFa(subject.minutes || rows.reduce((a, l) => a + l.minutes, 0), toFa)}
                    </span>
                  </SectionTitle>
                  <div className="space-y-1.5 mt-1.5">
                    {shown.map((lesson) => (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        subject={subject}
                        onRead={() => openLesson(lesson)}
                        onOpenExternal={() => openExternal(lesson)}
                        onToggleDone={(done) => setLessonCompleted(lesson.id, done)}
                      />
                    ))}
                    {rows.length > shown.length && (
                      <p className="text-[10px] text-slate-400 text-center pt-1">و {toFa(rows.length - shown.length)} درسنامهٔ دیگر در این درس…</p>
                    )}
                  </div>
                </section>
              );
            })
            .concat(
              filtered.length > rendered
                ? [
                    <Button key="__more" variant="outline" className="w-full" onClick={() => setListLimit((n) => n + LIST_PAGE)}>
                      نمایشِ {toFa(Math.min(LIST_PAGE, filtered.length - rendered))} درسنامهٔ دیگر
                    </Button>,
                  ]
                : [],
            );
        })()}

        {/* ————————— آزمون‌های کتابخانه (جدا از بانکِ اپ) ————————— */}
        {manifest?.qbank && manifest.qbank.parts.length > 0 && (
          <section>
            <SectionTitle
              action={
                <a href={libraryQbankUrl(manifest)} target="_blank" rel="noopener noreferrer" className="text-[10px] text-teal-600 dark:text-teal-300">
                  فهرستِ آزمون‌ها ↗
                </a>
              }
            >
              🧪 آزمون‌های فصل‌به‌فصلِ کتابخانه
              <span className="text-[10px] font-normal text-slate-400 mr-1">{toFa(manifest.qbank.total ?? 0)} سؤال</span>
            </SectionTitle>
            <p className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2 py-1.5 mt-1 leading-relaxed">
              ⚠️ این‌ها سؤالِ کتاب‌محورِ مخزنِ محتواست و با «بانک سؤال پره‌انترنی و دستیاری» خودِ اپ (سؤال‌های واقعیِ آزمون‌ها بر
              اساسِ سال و مبحث) یکی نیست؛ عمداً جدا نگه داشته شده و با آن ادغام نمی‌شود.
            </p>
            <div className="grid gap-1.5 mt-1.5 sm:grid-cols-2">
              {manifest.qbank.parts.map((part) => (
                <Card key={part.part} className="!p-2.5">
                  <div className="text-[11.5px] font-bold text-slate-800 dark:text-slate-100 leading-relaxed">{part.title}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {toFa(part.count)} سؤال{part.chapters ? ` · ${toFa(part.chapters)} فصل` : ""}
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <a href={qbankPartUrl(part)} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button size="sm" variant="secondary" className="w-full">
                        آزمونِ آنلاین ↗
                      </Button>
                    </a>
                    <a href={qbankStandaloneUrl(part)} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button size="sm" variant="outline" className="w-full" title="نسخهٔ تک‌فایلی که بدونِ اینترنت هم کار می‌کند">
                        تک‌فایلِ آفلاین ↗
                      </Button>
                    </a>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {manifest && (
          <p className="text-[9.5px] text-slate-400 leading-relaxed pt-1">
            منبعِ محتوا: مخزنِ جداگانهٔ درسنامه‌ها. اپ فقط فهرست (مانیفست) را می‌گیرد و متنِ هر درسنامه را هنگامِ بازکردنِ همان
            درس؛ پیشرفتِ مطالعه و فلش‌کارت‌ها در ذخیره‌سازیِ خودِ اپ می‌مانند.
            {manifest.index && (
              <>
                {" · "}
                <a href={libraryHomeUrl(manifest)} target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-300">
                  صفحهٔ خانهٔ کتابخانه ↗
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {reading && (
        <LessonReader
          lesson={reading}
          subject={manifest?.subjects.find((s) => s.key === reading.subject)}
          onClose={() => setReading(null)}
        />
      )}
    </Modal>
  );
}

function LessonRow({
  lesson,
  subject,
  onRead,
  onOpenExternal,
  onToggleDone,
}: {
  lesson: LessonMeta;
  subject?: LibrarySubjectMeta;
  onRead: () => void;
  onOpenExternal: () => void;
  onToggleDone: (done: boolean) => void;
}) {
  const { state } = useStore();
  const progress = progressOf(state.lessonProgress, lesson.id);
  const pct = Math.round(lessonCompletion(state.lessonProgress, lesson) * 100);
  return (
    <Card className={cn("!p-2.5", progress.done && "!border-teal-400 dark:!border-teal-700")}>
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onRead} className="flex-1 min-w-0 text-right group">
          <div className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-relaxed group-hover:text-teal-700 dark:group-hover:text-teal-300">
            {subject?.icon ? `${subject.icon} ` : ""}
            {lesson.title}
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-1 text-[9.5px] text-slate-500 dark:text-slate-400">
            <span title="مدت‌زمانِ خودِ محتوا (از مخزن)">⏱ {formatDurationFa(lesson.minutes, toFa)}</span>
            {lesson.sections > 0 && <span title="تعدادِ بخش">· 📑 {toFa(lesson.sections)} بخش</span>}
            {lesson.flashcards > 0 && <span title="فلش‌کارتِ درونِ درسنامه">· 🃏 {toFa(lesson.flashcards)}</span>}
            {lesson.tables > 0 && <span title="جدول">· 📊 {toFa(lesson.tables)}</span>}
            {lesson.mcq > 0 && <span title="سؤالِ تعاملیِ اختصاصیِ همین درسنامه">· ❓ {toFa(lesson.mcq)}</span>}
          </div>
          {(progress.seconds > 0 || progress.visits > 0) && (
            <div className="mt-1 text-[9.5px] text-teal-700 dark:text-teal-300">
              مطالعهٔ تو: {formatDurationFa(progress.seconds / 60, toFa)}
              {progress.visits > 0 && ` · ${toFa(progress.visits)} بازدید`}
              {progress.lastAt > 0 && ` · آخرین: ${new Date(progress.lastAt).toLocaleDateString("fa-IR")}`}
            </div>
          )}
          {lesson.minutes > 0 && (progress.seconds > 0 || progress.done) && (
            <div className="mt-1">
              <ProgressBar value={pct} height="h-1" color={progress.done ? "#0d9488" : "#6366f1"} />
            </div>
          )}
        </button>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onToggleDone(!progress.done)}
            aria-pressed={!!progress.done}
            aria-label={`علامتِ «تمام شد» برای ${lesson.title}`}
            title={progress.done ? "«تمام شد» را بردار" : "علامتِ «تمام شد»"}
            className={cn(
              "w-7 h-7 rounded-lg border text-[12px] leading-none",
              progress.done
                ? "border-teal-500 bg-teal-500 text-white"
                : "border-slate-300 dark:border-slate-600 text-transparent hover:border-teal-400",
            )}
          >
            ✓
          </button>
        </div>
      </div>
      <div className="flex gap-1.5 mt-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={onRead} title="خواندنِ درسنامه درونِ اپ با ثبتِ زمانِ مطالعه">
          📖 مطالعه در اپ
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onOpenExternal} title="بازکردنِ همان فایلِ HTML در تبِ تازه">
          ↗ تبِ تازه
        </Button>
        {lesson.mcq > 0 && (
          <a href={`${lessonUrl(lesson)}${MCQ_ANCHOR}`} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button size="sm" variant="ghost" className="w-full" title="سؤال‌های تعاملیِ اختصاصیِ این درسنامه (درونِ همان فایل)">
              ❓ سؤال‌ها
            </Button>
          </a>
        )}
      </div>
    </Card>
  );
}
