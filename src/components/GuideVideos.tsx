import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Chip, EmptyState, Modal, ProgressBar, Segmented, inputClass } from "./ui";
import { scoreQuery } from "../lib/textSearch";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import {
  GUIDE_TOPICS,
  GUIDE_VIDEOS,
  formatVideoTime,
  guideTotals,
  guideVideoUrl,
  markGuideSeen,
  readSeenGuide,
  searchGuideVideos,
  type GuideVideo,
} from "../lib/guideVideos";

/**
 * 🎬 راهنمای ویدیوییِ اپ — پخشِ آنلاین و آفلاین، داخلِ خودِ اپ.
 *
 * چرا این‌جا؟ راهنماها به‌صورت فایل در پوشهٔ `info/` ریپو مانده بودند: هیچ‌کس
 * نمی‌دیدشان. حالا از منوی ☰ (و خانه) باز می‌شوند.
 *
 * ⚡ عملکرد — عمداً فقط **یک** تگِ <video> در کلِ درخت رندر می‌شود (همان قسمتی که
 * کاربر باز کرده). رندرِ ۱۰ تگِ ویدیو با `preload="auto"` یعنی ~۱۲ مگابایت
 * درخواستِ هم‌زمان روی گوشی و تجربهٔ «کند/کرش»؛ همان دستهٔ باگی که درسنامه‌ها را
 * کند کرده بود.
 */
export default function GuideVideos({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<GuideVideo["topic"] | "all">("all");
  const [playing, setPlaying] = useState<GuideVideo | null>(null);
  const [seen, setSeen] = useState<string[]>(() => readSeenGuide());

  const list = useMemo(() => searchGuideVideos(GUIDE_VIDEOS, query, topic, scoreQuery), [query, topic]);
  const totals = useMemo(() => guideTotals(), []);
  const watched = useMemo(() => GUIDE_VIDEOS.filter((v) => seen.includes(v.id)).length, [seen]);
  const searching = query.trim().length > 0;

  const play = useCallback((video: GuideVideo) => {
    setPlaying(video);
    setSeen(markGuideSeen(video.id));
  }, []);

  return (
    <Modal open={open} onClose={onClose} title="🎬 ویدیوهای راهنمای اپ" footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
      <div className="space-y-3">
        <Card className="!p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-slate-800 dark:text-slate-100">
                {toFa(GUIDE_VIDEOS.length)} قسمت · {formatVideoTime(totals.seconds)} دقیقه
              </div>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                ویدیوها داخلِ خودِ اپ هستند؛ با اینترنت پخش می‌شوند و بعد از یک‌بار دیدن همان قسمت، حتی آفلاین هم باز می‌شوند.
              </p>
            </div>
            <Chip className="shrink-0 !bg-teal-100 !text-teal-700 dark:!bg-teal-900/40 dark:!text-teal-300">
              ✅ {toFa(watched)} دیده‌شده
            </Chip>
          </div>
          <div className="mt-2">
            <ProgressBar value={GUIDE_VIDEOS.length ? Math.round((watched / GUIDE_VIDEOS.length) * 100) : 0} height="h-1.5" color="#0d9488" />
          </div>
        </Card>

        <div className="relative">
          <input
            className={cn(inputClass, "!pl-9")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 چه چیزی را می‌خواهی یاد بگیری؟ (مثلاً فلش‌کارت، تایمر، بکاپ)"
            aria-label="جست‌وجوی ویدیوی راهنما"
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

        <Segmented
          compact
          value={topic}
          onChange={setTopic}
          options={[{ value: "all" as const, label: "همه" }, ...GUIDE_TOPICS.map((t) => ({ value: t, label: t }))]}
        />

        {list.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="ویدیویی پیدا نشد"
            description="عبارتِ دیگری را امتحان کن یا فیلترِ موضوع را بردار."
            action={<Button size="sm" variant="outline" onClick={() => { setQuery(""); setTopic("all"); }}>پاک‌کردنِ فیلترها</Button>}
          />
        ) : (
          <div className="space-y-1.5">
            {list.map((video) => (
              <VideoRow key={video.id} video={video} seen={seen.includes(video.id)} onPlay={() => play(video)} />
            ))}
          </div>
        )}
      </div>

      {playing && <VideoPlayer video={playing} onClose={() => setPlaying(null)} />}
    </Modal>
  );
}

function VideoRow({ video, seen, onPlay }: { video: GuideVideo; seen: boolean; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="w-full text-right rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white dark:bg-slate-800/70 px-3 py-2.5 hover:border-teal-400 dark:hover:border-teal-600 transition-colors flex items-center gap-2.5"
    >
      <span className="w-10 h-10 shrink-0 rounded-xl bg-teal-600 text-white flex items-center justify-center text-sm font-black">
        {toFa(video.episode)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-bold text-slate-800 dark:text-slate-100 truncate">
          {seen && <span aria-label="دیده‌شده">✅ </span>}
          {video.title}
        </span>
        <span className="block text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{video.summary}</span>
        <span className="flex items-center gap-1.5 mt-1 text-[9.5px] text-slate-400">
          <span>▶ {formatVideoTime(video.seconds)}</span>
          <span>· {video.topic}</span>
          <span>· ≈ {toFa(String(video.mb).replace(".", "٫"))} مگابایت</span>
        </span>
      </span>
      <span className="shrink-0 text-teal-600 dark:text-teal-300 text-lg" aria-hidden="true">▷</span>
    </button>
  );
}

/** پخش‌کنندهٔ تک‌قسمتی — تنها تگِ ویدیوی کلِ اپ */
function VideoPlayer({ video, onClose }: { video: GuideVideo; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const src = guideVideoUrl(video);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/85 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`ویدیو: ${video.title}`}>
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 text-white">
        <button type="button" onClick={onClose} className="shrink-0 text-lg leading-none px-1" aria-label="بستنِ ویدیو">
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-bold truncate">قسمت {toFa(video.episode)} — {video.title}</div>
          <div className="text-[10px] text-white/70">{video.summary}</div>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-2 pb-2">
        {failed ? (
          <div className="text-center text-white/90 text-[12px] space-y-2 p-4">
            <p>این ویدیو پخش نشد (فایل در دسترس نیست یا مرورگر کدکِ آن را ندارد).</p>
            <a href={src} download className="inline-block px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 font-bold" target="_blank" rel="noopener noreferrer">
              ⬇ دانلودِ همین قسمت
            </a>
          </div>
        ) : (
          <video
            ref={ref}
            key={src}
            src={src}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="w-full max-w-2xl rounded-2xl bg-black"
            onError={() => setFailed(true)}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration > 0) setProgress(Math.min(100, Math.round((el.currentTime / el.duration) * 100)));
            }}
          >
            مرورگرِ تو از پخشِ ویدیو پشتیبانی نمی‌کند.
          </video>
        )}
      </div>
      <div className="shrink-0 px-3 pb-4">
        <ProgressBar value={progress} height="h-1" color="#2dd4bf" />
        <p className="text-center text-[10px] text-white/60 mt-1.5">
          برای رد شدن از این قسمت، Esc را بزن یا ← بالا.
        </p>
      </div>
    </div>
  );
}
