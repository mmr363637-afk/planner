import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card, Chip, EmptyState, Modal, SectionTitle, Segmented, inputClass } from "./ui";
import {
  clearHubCaches,
  formatBytesFa,
  hubDoneCount,
  hubStudiedSeconds,
  labInfo,
  labPageUrl,
  labSimulatorUrl,
  labsHomeUrl,
  loadLabsManifest,
  loadSketchManifest,
  sketchSetInfo,
  sketchSetUrl,
  sketchesHomeUrl,
  sketchTrackId,
  labTrackId,
  HUB_TABS,
  type HubSection,
  type LabsLoad,
  type SketchLoad,
} from "../lib/contentHub";
import { clearLibraryCache, getLibraryBase, setLibraryBase, LIBRARY_STALE_MS, progressOf } from "../lib/lessonLibrary";
import { clearLibraryCaches } from "../lib/libraryRepo";
import { useStudyTimer } from "./useStudyTimer";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import type { LessonProgress } from "../types";

/**
 * 🎨🧪 اسکچ‌نوت و آزمایشگاهِ تعاملی — نمایِ اپ از دو بخشِ تازهٔ مخزنِ محتوا (DATA).
 *
 * چه چیزی از مخزن می‌آید و چه چیزی در اپ می‌ماند؟
 *
 *   از مخزن (منبعِ حقیقت، هرگز در اپ بازتولید نمی‌شود):
 *     عنوان/تعداد/حجمِ مجموعه‌ها و آزمایشگاه‌ها، مسیرِ گالری‌ها و شبیه‌سازها.
 *
 *   در اپ (دادهٔ اختصاصیِ کاربر):
 *     زمانِ واقعیِ مطالعه و «تمام شد» روی هر مجموعه/آزمایشگاه — زیرِ همان
 *     `lessonProgress`ِ خودِ اپ با کلیدِ `sketch:<set>` / `lab:<lab>`.
 *
 * هر دو بخش در همان پایهٔ درسنامه‌ها منتشر شده‌اند و از همان تنظیمِ «آدرسِ
 * مخزنِ محتوا» (⚙️ داخلِ این پنجره) پیروی می‌کنند.
 */

// ─────────────────────────────── خوانندهٔ تمام‌صفحه ───────────────────────────────

interface TrackedFrameContent {
  trackId: string;
  title: string;
  /** خطِ دومِ عنوان — مثلاً «۴۷ تصویر · عفونی» */
  subtitle: string;
  url: string;
  icon: string;
  appKeys?: string[];
}

function HubTrackedFrame({ frame, onClose }: { frame: TrackedFrameContent; onClose: () => void }) {
  const { state, creditLessonStudyTime, setLessonCompleted, toast } = useStore();
  const [iframeFailed, setIframeFailed] = useState(false);
  const [framed, setFramed] = useState(false);

  // مبحثِ متناظر در اپ — برای واریزِ زمان به آمارِ مطالعهٔ همان روز و تسک‌ها
  const topic = useMemo(() => {
    const keys = frame.appKeys ?? [];
    if (keys.length === 0) return null;
    const subjectRow = state.subjects.find((s) => keys.includes(s.sampleId ?? ""));
    if (!subjectRow) return null;
    return state.topics.find((t) => t.subjectId === subjectRow.id) ?? null;
  }, [state.subjects, state.topics, frame.appKeys]);

  const { paused, setPaused, flush, record, totalSeconds } = useStudyTimer({ trackId: frame.trackId, topicId: topic?.id ?? null });
  const pendingMinutes = Math.floor(Math.max(0, totalSeconds - (record.creditedSeconds ?? 0)) / 60);

  const close = () => {
    flush();
    const credited = creditLessonStudyTime({ lessonId: frame.trackId, topicId: topic?.id ?? null, once: "onClose" });
    if (credited.credited) toast(`${toFa(credited.minutes)} دقیقه به مطالعهٔ امروز اضافه شد`, "⏱");
    onClose();
  };

  // بستن با Escape — همان رفتارِ خوانندهٔ درسنامه
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 backdrop-blur-[2px]" dir="rtl" role="dialog" aria-modal="true" aria-label={frame.title}>
      <div className="shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={close} className="shrink-0 text-lg leading-none px-1" aria-label="بستن">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold truncate text-slate-800 dark:text-slate-100">
              {frame.icon} {frame.title}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {frame.subtitle} · مطالعهٔ تو: {formatMinutes(totalSeconds / 60)}
              {paused && " · ⏸ متوقف"}
            </div>
          </div>
          <Button size="sm" variant={paused ? "primary" : "secondary"} onClick={() => setPaused((p) => !p)}>
            {paused ? "▶ ادامهٔ شمارش" : "⏸ توقف"}
          </Button>
          <a href={frame.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button size="sm" variant="outline" title="بازکردنِ همان صفحه در تبِ جداگانه">
              ↗ تبِ جدا
            </Button>
          </a>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative bg-white">
        {iframeFailed ? (
          <div className="p-4 text-center text-[12px] text-slate-600 dark:text-slate-300">
            <p className="mb-2">این صفحه درونِ اپ باز نشد (احتمالاً آفلاین یا مسدود بودنِ قاب).</p>
            <a href={frame.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm">↗ بازکردن در تبِ تازه</Button>
            </a>
          </div>
        ) : (
          <>
            {!framed && (
              <div className="absolute inset-0 z-10 flex flex-col gap-3 p-4 bg-white" aria-hidden="true">
                <div className="h-6 w-1/2 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <div className="h-40 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                <p className="text-center text-[11px] text-slate-400 mt-1">در حال آوردنِ صفحه…</p>
                <a href={frame.url} target="_blank" rel="noopener noreferrer" className="text-center text-[11px] text-teal-600 dark:text-teal-300 underline underline-offset-4">
                  اگر دیر شد، در تبِ تازه بازش کن ↗
                </a>
              </div>
            )}
            <iframe
              src={frame.url}
              title={frame.title}
              className="w-full h-full border-0"
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
                  /* محتوای cross-origin قابلِ دسترسی نیست — یعنی صفحه آمده */
                }
              }}
            />
          </>
        )}
      </div>

      <div className="shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-3 py-2 flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={pendingMinutes < 1}
          title={
            pendingMinutes > 0
              ? "همین دقیقه‌های مطالعه‌شده را به آمارِ مطالعهٔ امروز اضافه کن"
              : "همهٔ دقیقه‌های این بخش در آمارِ امروز ثبت شده است"
          }
          onClick={() => {
            const res = creditLessonStudyTime({ lessonId: frame.trackId, topicId: topic?.id ?? null });
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
          title="این بخش را در پیشرفتِ خودت «تمام‌شده» علامت بزن؛ زمانِ خوانده‌شده هم یک‌بار به آمارِ امروز می‌رود"
          onClick={() => {
            const res = creditLessonStudyTime({ lessonId: frame.trackId, topicId: topic?.id ?? null, once: "onDone" });
            setLessonCompleted(frame.trackId, true);
            flush();
            toast(
              res.credited
                ? `«تمام شد» ثبت شد و ${toFa(res.minutes)} دقیقه به مطالعهٔ امروز اضافه شد`
                : "این بخش «تمام‌شده» ثبت شد",
              "✅",
            );
          }}
        >
          {record.done ? "✅ تمام شد" : "✓ تمام کردم"}
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={close} title="زمانِ خوانده‌شده هم ثبت می‌شود، هم در این بخش و هم در آمارِ امروز">
          بستن و ثبتِ زمان
        </Button>
      </div>
    </div>
  );
}

const formatMinutes = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes));
  return m < 60 ? `${toFa(m)} دقیقه` : `${toFa(Math.floor(m / 60))} ساعت و ${toFa(m % 60)} دقیقه`;
};

// ─────────────────────────────── قطعهٔ کارتِ وضعیتِ مخزن ───────────────────────────────

function sourceChip(source: "network" | "cache" | "none" | undefined) {
  return (
    <Chip
      className={cn(
        "!text-[9.5px] !px-1.5 !py-0.5",
        source === "cache"
          ? "!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300"
          : "!bg-teal-100 !text-teal-700 dark:!bg-teal-900/40 dark:!text-teal-300",
      )}
    >
      {source === "cache" ? "🟡 از کشِ محلی (آفلاین)" : "🟢 از مخزن"}
    </Chip>
  );
}

// ─────────────────────────────── پنجرهٔ اصلی ───────────────────────────────

export default function ContentHub({ open, onClose, initialTab = "sketches" }: { open: boolean; onClose: () => void; initialTab?: HubSection }) {
  const { state, setLessonCompleted } = useStore();
  const [tab, setTab] = useState<HubSection>(initialTab);
  const [sketchLoad, setSketchLoad] = useState<SketchLoad | null>(null);
  const [labsLoad, setLabsLoad] = useState<LabsLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [frame, setFrame] = useState<TrackedFrameContent | null>(null);

  // ورود با میان‌برِ مشخص (از منو/خانه): همان تب باز شود
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      if (force) clearHubCaches();
      const [s, l] = await Promise.all([loadSketchManifest({ force }), loadLabsManifest({ force })]);
      setSketchLoad(s);
      setLabsLoad(l);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || loading) return;
    if (sketchLoad && labsLoad) return;
    void refresh(false);
    // فقط با باز شدنِ پنجره
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sketchManifest = sketchLoad?.manifest ?? null;
  const labsManifest = labsLoad?.manifest ?? null;
  const activeLoad = tab === "sketches" ? sketchLoad : labsLoad;

  const studiedByTab = useMemo(
    () => ({
      sketches: Math.round(hubStudiedSeconds(state.lessonProgress, "sketch:") / 60),
      labs: Math.round(hubStudiedSeconds(state.lessonProgress, "lab:") / 60),
    }),
    [state.lessonProgress],
  );
  const doneByTab = useMemo(
    () => ({
      sketches: hubDoneCount(state.lessonProgress, "sketch:"),
      labs: hubDoneCount(state.lessonProgress, "lab:"),
    }),
    [state.lessonProgress],
  );

  const sketchBytes = useMemo(() => sketchManifest?.sets.reduce((a, s) => a + s.bytes, 0) ?? 0, [sketchManifest]);
  const labsBytes = useMemo(() => labsManifest?.labs.reduce((a, l) => a + (l.bytes ?? 0), 0) ?? 0, [labsManifest]);
  const labsScenarios = useMemo(() => labsManifest?.labs.reduce((a, l) => a + l.scenarios, 0) ?? 0, [labsManifest]);

  const openFrame = (content: TrackedFrameContent) => setFrame(content);

  // خوانندهٔ تمام‌صفحه جای پنجرهٔ فهرست را می‌گیرد (مثلِ درسنامه‌ها)
  if (frame) return <HubTrackedFrame frame={frame} onClose={() => setFrame(null)} />;

  const tiles: { icon: string; label: string; value: string; title?: string }[] =
    tab === "sketches"
      ? [
          { icon: "🖼", label: "اسکچ‌نوت", value: toFa(sketchManifest?.total ?? 0) },
          { icon: "🗂", label: "مجموعه", value: toFa(sketchManifest?.sets.length ?? 0) },
          { icon: "📦", label: "حجم", value: sketchBytes > 0 ? formatBytesFa(sketchBytes, toFa) : "—", title: "حجمِ تقریبیِ همهٔ تصاویرِ اصلی (PNG)" },
          { icon: "⏱", label: "مطالعهٔ تو", value: `${toFa(studiedByTab.sketches)} دقیقه` },
        ]
      : [
          { icon: "🧪", label: "آزمایشگاه", value: toFa(labsManifest?.labs.length ?? 0) },
          { icon: "🫀", label: "سناریو", value: toFa(labsScenarios) },
          { icon: "📦", label: "حجم", value: labsBytes > 0 ? formatBytesFa(labsBytes, toFa) : "—" },
          { icon: "⏱", label: "مطالعهٔ تو", value: `${toFa(studiedByTab.labs)} دقیقه` },
        ];

  return (
    <Modal open={open} onClose={onClose} title="🎨 اسکچ‌نوت و آزمایشگاهِ تعاملی">
      <div className="px-4 pb-4 space-y-3 overflow-y-auto">
        {/* ————————— سربرگِ وضعیتِ مخزن (مشترک بین دو تب) ————————— */}
        <Card className="!p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-slate-800 dark:text-slate-100">مخزنِ محتوای مدیکال</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                همان مخزنِ درسنامه‌ها — اسکچ‌نوت‌ها و شبیه‌سازهای بالینی
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
                    clearHubCaches();
                    clearLibraryCaches();
                    setSketchLoad(null);
                    setLabsLoad(null);
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
                یک آدرس برای هر سه بخشِ مخزن (درسنامه‌ها، اسکچ‌نوت‌ها، آزمایشگاه) — فایلِ هر بخش فقط هنگامِ بازکردنِ همان بخش گرفته می‌شود.
              </p>
            </div>
          )}

          <Segmented
            className="mt-2"
            value={tab}
            onChange={(v) => setTab(v as HubSection)}
            options={HUB_TABS.map((t) => ({ value: t.id, label: `${t.icon} ${t.label}` }))}
          />

          <div className="grid grid-cols-4 gap-1.5 mt-2">
            {tiles.map((tile) => (
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
            {sourceChip(activeLoad?.source)}
            <span>کش تا {toFa(Math.round(LIBRARY_STALE_MS / 3_600_000))} ساعت</span>
            {doneByTab[tab] > 0 && <span>· {toFa(doneByTab[tab])} «تمام شد» ثبت کرده‌ای</span>}
          </div>
          {activeLoad?.error && activeLoad.source === "cache" && (
            <p className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
              ⚠️ مخزن در دسترس نبود ({activeLoad.error})؛ آخرین فهرستِ ذخیره‌شده نمایش داده می‌شود.
            </p>
          )}
        </Card>

        {/* ————————— محتوای تب‌ها ————————— */}
        {tab === "sketches" ? (
          <SketchesTab
            load={sketchLoad}
            loading={loading}
            onRetry={() => void refresh(true)}
            onOpenFrame={openFrame}
            onToggleDone={(trackId, done) => setLessonCompleted(trackId, done)}
            progress={state.lessonProgress}
          />
        ) : (
          <LabsTab
            load={labsLoad}
            loading={loading}
            onRetry={() => void refresh(true)}
            onOpenFrame={openFrame}
            onToggleDone={(trackId, done) => setLessonCompleted(trackId, done)}
            progress={state.lessonProgress}
          />
        )}

        <p className="text-[9.5px] text-slate-400 leading-relaxed px-1">
          محتوا از مخزنِ محتوای مدیکال (GitHub Pages) گرفته می‌شود و چیزی از آن در اپ ذخیره نمی‌شود؛ فقط زمانِ مطالعه در همین دستگاه می‌ماند.
        </p>
      </div>
    </Modal>
  );
}

// ─────────────────────────────── تبِ اسکچ‌نوت‌ها ───────────────────────────────

function SketchesTab({
  load,
  loading,
  onRetry,
  onOpenFrame,
  onToggleDone,
  progress,
}: {
  load: SketchLoad | null;
  loading: boolean;
  onRetry: () => void;
  onOpenFrame: (content: TrackedFrameContent) => void;
  onToggleDone: (trackId: string, done: boolean) => void;
  progress: Record<string, LessonProgress> | undefined;
}) {
  const manifest = load?.manifest ?? null;

  if (!manifest) {
    return loading ? (
      <Card className="!p-4 space-y-3" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
              <div className="h-6 w-40 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
          </div>
        ))}
        <p className="text-center text-[11px] text-slate-400">در حالِ گرفتنِ فهرستِ اسکچ‌نوت‌ها…</p>
      </Card>
    ) : (
      <EmptyState
        icon="📡"
        title="مخزن در دسترس نیست"
        description={load?.error ? `خطا: ${load.error}` : "فهرستِ اسکچ‌نوت‌ها گرفته نشد."}
        action={<Button onClick={onRetry}>🔄 تلاش دوباره</Button>}
      />
    );
  }

  return (
    <section aria-label="مجموعه‌های اسکچ‌نوت">
      <SectionTitle
        action={
          <a href={sketchesHomeUrl()} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 dark:text-teal-400 font-medium">
            همهٔ اسکچ‌نوت‌ها ↗
          </a>
        }
      >
        مجموعه‌ها
      </SectionTitle>
      <div className="space-y-2">
        {manifest.sets.map((set) => {
          const info = sketchSetInfo(set.key);
          const trackId = sketchTrackId(set.key);
          const record = progressOf(progress, trackId);
          const studiedMin = Math.round(record.seconds / 60);
          return (
            <Card key={set.key} className="!p-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: `hsl(${info.hue} ${info.chroma}% 93%)`, color: `hsl(${info.hue} ${info.chroma}% 30%)` }}
                  aria-hidden="true"
                >
                  {info.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100">اسکچ‌نوت‌های {info.name}</h4>
                    <Chip className="!text-[9.5px]">{toFa(set.count)} تصویر</Chip>
                    {record.done && <Chip className="!text-[9.5px] !bg-teal-100 !text-teal-700 dark:!bg-teal-900/40 dark:!text-teal-300">✅ تمام شد</Chip>}
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1">{info.blurb}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-400">
                    {set.bytes > 0 && <span>حجم {formatBytesFa(set.bytes, toFa)}</span>}
                    {studiedMin > 0 && <span>مطالعهٔ تو: {toFa(studiedMin)} دقیقه</span>}
                    {record.visits > 0 && <span>{toFa(record.visits)} بار باز شده</span>}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() =>
                        onOpenFrame({
                          trackId,
                          title: `اسکچ‌نوت‌های ${info.name}`,
                          subtitle: `${toFa(set.count)} تصویر با بزرگ‌نمایی تمام‌صفحه`,
                          url: sketchSetUrl(set),
                          icon: info.icon,
                          appKeys: info.appSubjectKeys,
                        })
                      }
                      title="گالری با جست‌وجو و زومِ تمام‌صفحه — با ثبتِ زمانِ مطالعه"
                    >
                      🖼 بازکردن گالری
                    </Button>
                    <Button
                      size="sm"
                      variant={record.done ? "outline" : "secondary"}
                      onClick={() => onToggleDone(trackId, !record.done)}
                      aria-label={`«تمام شد» برای اسکچ‌نوت‌های ${info.name}`}
                      title="این مجموعه را در پیشرفتِ خودت علامت بزن"
                    >
                      ✓
                    </Button>
                    <a href={sketchSetUrl(set)} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" title="بازکردن در تبِ تازه">
                        ↗
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────── تبِ آزمایشگاه ───────────────────────────────

function LabsTab({
  load,
  loading,
  onRetry,
  onOpenFrame,
  onToggleDone,
  progress,
}: {
  load: LabsLoad | null;
  loading: boolean;
  onRetry: () => void;
  onOpenFrame: (content: TrackedFrameContent) => void;
  onToggleDone: (trackId: string, done: boolean) => void;
  progress: Record<string, LessonProgress> | undefined;
}) {
  const manifest = load?.manifest ?? null;

  if (!manifest) {
    return loading ? (
      <Card className="!p-4 space-y-3" aria-hidden="true">
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-6 w-48 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400">در حالِ گرفتنِ فهرستِ آزمایشگاه‌ها…</p>
      </Card>
    ) : (
      <EmptyState
        icon="📡"
        title="مخزن در دسترس نیست"
        description={load?.error ? `خطا: ${load.error}` : "فهرستِ آزمایشگاه گرفته نشد."}
        action={<Button onClick={onRetry}>🔄 تلاش دوباره</Button>}
      />
    );
  }

  return (
    <section aria-label="شبیه‌سازهای بالینی">
      <SectionTitle
        action={
          <a href={labsHomeUrl()} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 dark:text-teal-400 font-medium">
            همهٔ آزمایشگاه‌ها ↗
          </a>
        }
      >
        شبیه‌سازهای بالینی
      </SectionTitle>
      <div className="space-y-2">
        {manifest.labs.map((lab) => {
          const info = labInfo(lab.key);
          const trackId = labTrackId(lab.key);
          const record = progressOf(progress, trackId);
          const studiedMin = Math.round(record.seconds / 60);
          const heavy = (lab.bytes ?? 0) >= 1024 * 1024;
          return (
            <Card key={lab.key} className="!p-3">
              <div className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: `hsl(${info.hue} ${info.chroma}% 93%)`, color: `hsl(${info.hue} ${info.chroma}% 30%)` }}
                  aria-hidden="true"
                >
                  {info.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100">{lab.name || info.name}</h4>
                    {lab.scenarios > 0 && <Chip className="!text-[9.5px]">{toFa(lab.scenarios)} سناریو</Chip>}
                    {record.done && <Chip className="!text-[9.5px] !bg-teal-100 !text-teal-700 dark:!bg-teal-900/40 dark:!text-teal-300">✅ تمام شد</Chip>}
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400 mt-1">{info.blurb}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-400">
                    {lab.bytes ? <span>حجم {formatBytesFa(lab.bytes, toFa)}</span> : null}
                    {studiedMin > 0 && <span>مطالعهٔ تو: {toFa(studiedMin)} دقیقه</span>}
                    {record.visits > 0 && <span>{toFa(record.visits)} بار باز شده</span>}
                  </div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <Button
                      size="sm"
                      className="flex-1 min-w-36"
                      onClick={() =>
                        onOpenFrame({
                          trackId,
                          title: lab.name || info.name,
                          subtitle: lab.scenarios > 0 ? `${toFa(lab.scenarios)} سناریوی بالینیِ تعاملی` : "شبیه‌ساز بالینیِ تعاملی",
                          url: labSimulatorUrl(lab),
                          icon: info.icon,
                          appKeys: info.appSubjectKeys,
                        })
                      }
                      title="اجرای شبیه‌ساز درونِ اپ — با ثبتِ زمانِ مطالعه"
                    >
                      ▶ اجرای شبیه‌ساز
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        onOpenFrame({
                          // همانِ مسیرِ پیشرفتِ خودِ آزمایشگاه — زمانِ صفحهٔ معرفی جزوِ همان مبحث ثبت می‌شود (نه کلیدِ سوم‌سطحیِ جدا)
                          trackId,
                          title: `${lab.name || info.name} — معرفی`,
                          subtitle: "فهرستِ سناریوها و روشِ کار",
                          url: labPageUrl(lab),
                          icon: info.icon,
                          appKeys: info.appSubjectKeys,
                        })
                      }
                      title="صفحهٔ معرفی و فهرستِ سناریوهای همین آزمایشگاه"
                    >
                      ℹ️ معرفی
                    </Button>
                    <Button
                      size="sm"
                      variant={record.done ? "outline" : "secondary"}
                      onClick={() => onToggleDone(trackId, !record.done)}
                      aria-label={`«تمام شد» برای ${lab.name || info.name}`}
                      title="این آزمایشگاه را در پیشرفتِ خودت علامت بزن"
                    >
                      ✓
                    </Button>
                    <a href={labSimulatorUrl(lab)} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" title="بازکردن در تبِ تازه">
                        ↗
                      </Button>
                    </a>
                  </div>
                  {heavy && (
                    <p className="text-[9.5px] text-slate-400 mt-1.5">
                      ⚠️ حجمِ شبیه‌ساز {lab.bytes ? formatBytesFa(lab.bytes, toFa) : "چند مگابایت"} است؛ با اینترنتِ کند ممکن است چند ثانیه طول بکشد — یک‌بار که باز شد، کشِ مرورگر نگهش می‌دارد.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
