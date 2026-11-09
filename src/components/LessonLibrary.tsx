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
  searchLessons,
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
  const { state, visitLesson, addLessonStudyTime, logManualSession, toast } = useStore();
  const url = lessonUrl(lesson);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
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

  const flush = useCallback(() => {
    const due = Math.floor(pending.current);
    if (due < 1) return;
    pending.current -= due;
    addLessonStudyTime(lessonId, due);
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
      if (due >= 1) addLessonStudyTime(lessonId, due);
    };
    // فقط یک‌بار در پایانِ عمرِ کامپوننت
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    flush();
    onClose();
  };

  const totalSeconds = progressOf(state.lessonProgress, lessonId).seconds + seconds;
  const pct = lesson.minutes > 0 ? Math.min(100, Math.round(((totalSeconds / 60) / lesson.minutes) * 100)) : 0;

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
          <iframe
            src={url}
            title={lesson.title}
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setIframeFailed(true)}
            onLoad={(e) => {
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
        )}
      </div>

      <div className="shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-3 py-2 flex flex-wrap items-center gap-1.5">
        <a href={`${url}${MCQ_ANCHOR}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="ghost" title="سؤال‌های تعاملیِ اختصاصیِ همین درسنامه (بخشی از فایلِ HTML)">
            ❓ {toFa(lesson.mcq)} سؤالِ تعاملیِ این درسنامه
          </Button>
        </a>
        {topic && (
          <Button
            size="sm"
            variant="ghost"
            title={`همین دقیقه‌ها را به آمارِ مطالعهٔ مبحثِ «${topic.name}» هم اضافه کن`}
            disabled={totalSeconds < 60}
            onClick={() => {
              logManualSession(topic.id, Math.max(1, Math.round(totalSeconds / 60)), "learn");
              toast("زمانِ مطالعهٔ درسنامه در آمارِ مبحث هم ثبت شد", "📊");
            }}
          >
            📊 ثبت در آمارِ «{topic.name}»
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={close}>
          بستن و ذخیرهٔ زمان
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
  const filtered = useMemo(() => {
    if (!manifest) return [];
    const q = query.trim();
    const list = q ? searchLessons(manifest, q) : manifest.lessons;
    return list.filter((l) => {
      if (subjectKey !== "all" && l.subject !== subjectKey) return false;
      if (onlyUnfinished && progressOf(state.lessonProgress, l.id).done) return false;
      return true;
    });
  }, [manifest, query, subjectKey, onlyUnfinished, state.lessonProgress]);

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

        {/* ————————— فیلترها ————————— */}
        {manifest && (
          <>
            <input
              className={inputClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 جست‌وجو در عنوانِ درسنامه، درس یا نامِ فایلِ مبدأ…"
              aria-label="جست‌وجوی درسنامه"
            />
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
            <label className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={onlyUnfinished} onChange={(e) => setOnlyUnfinished(e.target.checked)} />
              فقط درسنامه‌هایی که تمام نکرده‌ام
            </label>
          </>
        )}

        {/* ————————— فهرستِ درسنامه‌ها ————————— */}
        {manifest && filtered.length === 0 && (
          <EmptyState icon="🔍" title="درسنامه‌ای پیدا نشد" description="عبارتِ جست‌وجو یا فیلترِ درس را عوض کن." />
        )}

        {groups
          .filter((g) => subjectKey === "all" || g.subject.key === subjectKey)
          .map(({ subject, lessons }) => {
            const rows = lessons.filter((l) => filtered.includes(l));
            if (rows.length === 0) return null;
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
                  {rows.map((lesson) => (
                    <LessonRow
                      key={lesson.id}
                      lesson={lesson}
                      subject={subject}
                      onRead={() => openLesson(lesson)}
                      onOpenExternal={() => openExternal(lesson)}
                      onToggleDone={(done) => setLessonCompleted(lesson.id, done)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

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
