import { scheduledReviewTargets } from "../lib/reviewCleanup";
import { Suspense, lazy, useState } from "react";
import { useLookups, useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, Chip, EmptyState, Modal, Segmented } from "../components/ui";
import MistakesView from "../components/MistakesView";
import { RatingPicker } from "../components/shared";
// ⚡ فلش‌کارت‌ها (هزار خط) و ابزارهای صوتی/خودکار فقط با ورود به تب‌شان لود می‌شوند
const FlashcardsView = lazy(() => import("../components/Flashcards"));
const ReviewPodcast = lazy(() => import("../components/ReviewPodcast"));
const SourceNotebook = lazy(() => import("../components/SourceNotebook"));
const AutoFlashcard = lazy(() => import("../components/AutoFlashcard"));
import { classifyReviews } from "../lib/srs";
import { reviewForecast } from "../lib/stats";
import { curatedPacksOfTopic } from "../lib/curatedPacks";
import { curatedPendingCount, deckScopedCards } from "../lib/deckScope";
import { WEEKDAYS_SHORT_FA, addDays, diffDays, formatJalaliShort, relativeDayLabel, toFa, todayKey, weekdayOf } from "../lib/jalali";
import type { Review, StudyTask } from "../types";
import { cn } from "../utils/cn";

/** یک قلم در فهرست مرورها: یا مرور فاصله‌دار (SRS) یا تسکِ «مرور» خودِ برنامه */
type ReviewRow =
  | { kind: "srs"; id: string; topicId: string; dueDate: string; review: Review }
  | { kind: "task"; id: string; topicId: string; dueDate: string; task: StudyTask };

/** نمودار جمع‌وجورِ بارِ مرورِ ۱۴ روزِ آینده (مبحث + فلش‌کارت) */
function ForecastCard({ reviews, flashcards }: { reviews: Review[]; flashcards: { dueDate: string }[] }) {
  const today = todayKey();
  const days = reviewForecast(reviews, flashcards, today, 14);
  const totalLoad = days.reduce((s, d) => s + d.count, 0);
  if (totalLoad === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">📅 بارِ مرورِ دو هفته‌ی آینده</div>
        <div className="text-[10px] text-slate-400">{toFa(totalLoad)} مورد</div>
      </div>
      <div className="flex items-end gap-1 h-14" dir="ltr">
        {days.map((d, i) => {
          const isToday = i === 0;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full" title={`${formatJalaliShort(d.date)} — ${toFa(d.count)} مرور`}>
              <div
                className={cn("w-full rounded-t transition-all", isToday ? "bg-teal-500" : d.count > 0 ? "bg-teal-300 dark:bg-teal-700" : "bg-slate-100 dark:bg-slate-700/60")}
                style={{ height: `${d.count === 0 ? 6 : Math.max(12, (d.count / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1" dir="ltr">
        {days.map((d, i) => (
          <div key={d.date} className={cn("flex-1 text-center text-[8px]", i === 0 ? "text-teal-600 font-bold" : "text-slate-400")} dir="rtl">
            {i === 0 ? "امروز" : WEEKDAYS_SHORT_FA[weekdayOf(d.date)]}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function ReviewsPage() {
  const { state, completeReview, postponeReview, clearScheduledReviews, startSession, completeTask, moveTask, relearnForTopic, toast } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const { go, reviewSub, reviewTopic } = useNav();
  const today = todayKey();
  const groups = classifyReviews(reviewTopic ? state.reviews.filter(r => r.topicId === reviewTopic) : state.reviews, today);
  const [rating, setRating] = useState<Review | null>(null);
  /** تسک «مرور» برنامه که کاربر می‌خواهد انجامش را با نتیجه ثبت کند */
  const [ratingTask, setRatingTask] = useState<StudyTask | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [tab, setTab] = useState<"reviews" | "cards" | "mistakes">(reviewSub ?? "reviews");
  const [podcastOpen, setPodcastOpen] = useState(false);
  const [autoCardOpen, setAutoCardOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [includeReviewTasks, setIncludeReviewTasks] = useState(true);
  const [clearingReviews, setClearingReviews] = useState(false);
  /** مبحثی که با «یک کلیک» برای مرور فلش‌کارتی انتخاب شده */
  const [cardTopic, setCardTopic] = useState<string | null>(null);
  const cleanupOptions = { topicId: reviewTopic, includeTasks: includeReviewTasks };
  const cleanupTargets = scheduledReviewTargets(state, cleanupOptions);
  const cleanupAvailable = scheduledReviewTargets(state, { topicId: reviewTopic, includeTasks: true });
  const doneCount = state.reviews.filter((r) => r.status === "done").length;

  // ---- ادغام مرورهای فاصله‌دار با تسک‌های «مرور» خودِ برنامه ----
  // اگر برنامه برای مبحثی مرور گذاشته باشد، اینجا هم دیده می‌شود؛ فقط وقتی هر دو
  // برای یک مبحث و یک روز باشند، نسخه‌ی فاصله‌دار نمایش داده می‌شود تا تکراری نباشد.
  const srsRows = (list: Review[]): ReviewRow[] =>
    list.map((review) => ({ kind: "srs" as const, id: review.id, topicId: review.topicId, dueDate: review.dueDate, review }));
  const srsPendingKeys = new Set(state.reviews.filter((r) => r.status === "pending").map((r) => `${r.topicId}|${r.dueDate}`));
  const planReviewRows: ReviewRow[] = state.tasks
    .filter(
      (t) =>
        t.kind === "review" &&
        t.status === "pending" &&
        t.id !== state.activeSession?.taskId &&
        (!reviewTopic || t.topicId === reviewTopic) &&
        !srsPendingKeys.has(`${t.topicId}|${t.date}`),
    )
    .map((task) => ({ kind: "task" as const, id: task.id, topicId: task.topicId, dueDate: task.date, task }));
  const byDue = (a: ReviewRow, b: ReviewRow) => a.dueDate.localeCompare(b.dueDate);
  const overdueRows = [...srsRows(groups.overdue), ...planReviewRows.filter((r) => r.dueDate < today)].sort(byDue);
  const todayRows = [...srsRows(groups.today), ...planReviewRows.filter((r) => r.dueDate === today)].sort(byDue);
  const upcomingRows = [...srsRows(groups.upcoming), ...planReviewRows.filter((r) => r.dueDate > today)].sort(byDue);

  const total = overdueRows.length + todayRows.length + upcomingRows.length;

  // ---- مرور یک‌کلیکه با فلش‌کارت ----
  /** کارت‌های خودِ کاربر در این مبحث — همان دامنه‌ای که جلسه‌ی فلش‌کارت می‌بیند */
  const myCardsForTopic = (topicId: string) => deckScopedCards(state.flashcards, `t:${topicId}`, topicById).length;
  /**
   * کارت‌های منتخبِ آماده‌ی همین مبحث که هنوز به «کارت‌های من» اضافه نشده‌اند.
   * اگر کاربر کارتی از بانک اضافه نکرده باشد، جلسه خالی می‌ماند؛ پس دکمه‌ی
   * «افزودن و مرور» همان‌جا یک‌تپ همه‌شان را اضافه می‌کند (قبلاً باید تک‌تک تیک می‌زد).
   */
  const bankPendingForTopic = (topicId: string) =>
    curatedPendingCount(curatedPacksOfTopic(topicById.get(topicId)?.sampleId), state.flashcards);
  const openCards = (topicId: string) => {
    if (myCardsForTopic(topicId) === 0 && bankPendingForTopic(topicId) === 0) {
      // کارتی از هیچ‌جا نیست؛ ولی به‌جای توستِ بن‌بست، کاربر را به خودِ بخش کارت‌ها می‌بریم
      toast("برای این مبحث فلش‌کارتی نداری؛ از همین‌جا بساز یا از بانک منتخب‌ها اضافه کن.", "🃏");
      setCardTopic(null);
      setTab("cards");
      return;
    }
    setCardTopic(topicId);
    setTab("cards");
  };
  /**
   * دو دفترِ مرورِ یک مبحث: مرورهای فاصله‌دارِ سررسیدشده و تسک‌های «مرور» برنامه‌ی
   * امروز/عقب‌افتاده. هر جا یکی انجام یا موکول شود، آن یکی هم همراه می‌آید تا مبحث
   * دوباره و دوباره به‌عنوان «مرورِ ناتمام» ظاهر نشود.
   */
  const dueSrsOfTopic = (topicId: string) =>
    state.reviews
      .filter((r) => r.status === "pending" && r.topicId === topicId && r.dueDate <= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const duePlanReviewTasksOfTopic = (topicId: string) =>
    state.tasks.filter((t) => t.kind === "review" && t.status === "pending" && t.topicId === topicId && t.date <= today);

  const postponeRow = (row: ReviewRow) => {
    const dueNow = row.dueDate <= today;
    if (row.kind === "srs") postponeReview(row.review.id, 1);
    else moveTask(row.task.id, addDays(dueNow ? today : row.dueDate, 1));
    if (dueNow) {
      for (const srs of dueSrsOfTopic(row.topicId)) {
        if (row.kind === "srs" && srs.id === row.review.id) continue;
        postponeReview(srs.id, 1);
      }
      if (row.kind === "srs") {
        for (const t of duePlanReviewTasksOfTopic(row.topicId)) moveTask(t.id, addDays(today, 1));
      }
    }
    toast("مرور به فردا موکول شد", "⏭");
  };

  const ReviewItem = ({ row, tone }: { row: ReviewRow; tone: "red" | "yellow" | "green" }) => {
    const topic = topicById.get(row.topicId);
    const subject = subjectOfTopic(row.topicId);
    if (!topic || !subject) return null;
    const actionable = tone !== "green";
    const isPlanTask = row.kind === "task";
    const myCards = myCardsForTopic(row.topicId);
    const bankPending = bankPendingForTopic(row.topicId);
    // اگر هنوز کارتی از بانک اضافه نشده، برچسب صریح می‌گوید که با یک تپ چه می‌شود
    const cardsButtonLabel = myCards > 0 ? "🃏 با فلش‌کارت" : bankPending > 0 ? "🃏 افزودن و مرور" : "🃏 افزودن کارت";
    const cardsButtonTitle =
      myCards > 0
        ? "مرور یک‌کلیکه با فلش‌کارت‌های همین مبحث"
        : bankPending > 0
          ? `${toFa(bankPending)} کارت منتخب برای این مبحث آماده است؛ در یک تپ اضافه و مرور می‌شود`
          : "برای این مبحث فلش‌کارتی نداری؛ از تب کارت‌ها بساز یا از بانک منتخب‌ها اضافه کن";
    return (
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: subject.color }} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px]" style={{ color: subject.color }}>{subject.name}</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{topic.name}</div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {row.kind === "srs" ? <Chip>مرور {toFa(row.review.reviewNumber)}</Chip> : <Chip>✨ {row.task.label ?? "مرور برنامه"}</Chip>}
              <Chip>{formatJalaliShort(row.dueDate)}</Chip>
              <Chip className={cn(tone === "red" && "!bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-300", tone === "yellow" && "!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300", tone === "green" && "!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-900/40 dark:!text-emerald-300")}>
                {tone === "red" ? `${toFa(diffDays(row.dueDate, today))} روز تأخیر` : relativeDayLabel(row.dueDate)}
              </Chip>
            </div>
          </div>
        </div>
        {actionable && (
          <div className="flex gap-2 mt-3">
            {cardsButtonLabel && (
              <Button size="sm" className="flex-1" onClick={() => openCards(row.topicId)} title={cardsButtonTitle}>
                {cardsButtonLabel}
              </Button>
            )}
            {row.kind === "srs" ? (
              <Button size="sm" className={cn(cardsButtonLabel ? "" : "flex-1")} onClick={() => setRating(row.review)}>
                ✓ انجام دادم
              </Button>
            ) : (
              <Button size="sm" className={cn(cardsButtonLabel ? "" : "flex-1")} onClick={() => setRatingTask(row.task)}>
                ✓ انجام دادم
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => postponeRow(row)}>
              فردا
            </Button>
            {row.kind === "srs" && (
              <Button size="sm" variant="danger" onClick={() => { completeReview(row.review.id, 0); toast("مرور با فاصله کوتاه‌تر تکرار می‌شود", "🔁"); }}>
                بلد نیستم
              </Button>
            )}
          </div>
        )}
        {actionable && (
          <button
            type="button"
            onClick={() => {
              if (state.activeSession) toast("یک جلسه فعال داری.", "⏳");
              else startSession(row.topicId, "free", isPlanTask ? row.task.id : undefined);
              go("study");
            }}
            className="w-full text-[11px] text-teal-600 dark:text-teal-400 mt-2 py-1"
          >
            ▶ مطالعه با تایمر قبل از مرور
          </button>
        )}
      </Card>
    );
  };

  return (
    <div className="pb-6">
      <div className="flex items-end justify-between mb-3">
        <div>
          {reviewTopic && <div className="mb-3 text-sm text-teal-700">پیشنهاد برای: {state.topics.find(t=>t.id===reviewTopic)?.name} <Button size="sm" variant="ghost" onClick={()=>go("reviews")}>همهٔ مباحث</Button></div>}
      <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50">مرورها</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {tab === "reviews" ? `مرور فاصله‌دار · ${toFa(doneCount)} مرور انجام‌شده` : tab === "cards" ? "فلش‌کارت‌ها به تفکیک مبحث، با الگوریتم SM-2" : "تست‌های غلطت، با مرورِ سرِ وقت"}
          </p>
        </div>
        {tab === "reviews" && (
          <div className="flex gap-1.5 text-[11px]">
            <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">🔴 {toFa(overdueRows.length)}</span>
            <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">🟡 {toFa(todayRows.length)}</span>
            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">🟢 {toFa(upcomingRows.length)}</span>
          </div>
        )}
      </div>

      <Button className="w-full mb-3" variant="secondary" onClick={()=>setSourceOpen(true)}>جزوهٔ متصل به منبع · متن، PDF و تصویر</Button>
      {sourceOpen && <Suspense fallback={<p role="status">در حال بارگذاری…</p>}><SourceNotebook onClose={()=>setSourceOpen(false)}/></Suspense>}
      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[{ value: "reviews", label: "🔁 مرور" }, { value: "cards", label: "🃏 کارت‌ها" }, { value: "mistakes", label: "📓 اشتباهات" }]}
      />

      {tab === "reviews" && (
        <>
          <button
            type="button"
            onClick={() => setPodcastOpen(true)}
            className="w-full mb-3 py-2.5 rounded-xl bg-gradient-to-l from-rose-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            📻 پادکست مرورهای امروز — گوش بده!
          </button>
          <ForecastCard reviews={state.reviews} flashcards={state.flashcards} />
          <Button variant="outline" className="w-full mb-4" disabled={!cleanupAvailable.reviews.length && !cleanupAvailable.tasks.length} onClick={() => { setIncludeReviewTasks(true); setCleanupOpen(true); }}>
            پاک‌کردن مرورهای برنامه‌ریزی‌شده
          </Button>
          <Modal open={cleanupOpen} onClose={() => { if (!clearingReviews) setCleanupOpen(false); }} title="پاک‌کردن مرورهای برنامه‌ریزی‌شده" footer={<>
            <Button variant="ghost" disabled={clearingReviews} onClick={() => setCleanupOpen(false)}>انصراف</Button>
            <Button variant="danger" disabled={clearingReviews || !!state.activeSession || (!cleanupTargets.reviews.length && !cleanupTargets.tasks.length)} onClick={async () => {
              setClearingReviews(true);
              try {
                if (await clearScheduledReviews(cleanupOptions)) { setCleanupOpen(false); setRating(null); }
              } finally { setClearingReviews(false); }
            }}>{clearingReviews ? "ذخیرهٔ نسخهٔ ایمنی…" : "تأیید و پاک‌کردن مرورها"}</Button>
          </>}>
            <div className="space-y-3 text-sm leading-7">
              <p>محدوده: <strong>{reviewTopic ? topicById.get(reviewTopic)?.name ?? "مبحث انتخاب‌شده" : "همهٔ مباحث"}</strong></p>
              <p>{toFa(cleanupTargets.reviews.length)} مرور فاصله‌دارِ انجام‌نشده (عقب‌افتاده، امروز و آینده) پاک می‌شود.</p>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-2" checked={includeReviewTasks} disabled={clearingReviews} onChange={e => setIncludeReviewTasks(e.target.checked)} />
                کارهای «مرور» انجام‌نشده در برنامهٔ مطالعه هم پاک شوند ({toFa(cleanupAvailable.tasks.length)} کار)
              </label>
              <p>مرورهای انجام‌شده، سابقهٔ مطالعه، فلش‌کارت‌ها و اشتباهات حذف نمی‌شوند. این کار فقط برنامهٔ مرور فعلی را پاک می‌کند؛ مطالعه‌های بعدی می‌توانند دوباره مرور بسازند.</p>
              <p className="text-slate-500">قبل از حذف، نسخهٔ ایمنی ذخیره می‌شود. برای بازیابی به تنظیمات ← وضعیت ذخیره و تاریخچه برو؛ بازیابی تاریخچه، کل وضعیت آن نسخه را برمی‌گرداند.</p>
              {state.activeSession && <p role="alert" className="text-amber-700 dark:text-amber-300">ابتدا جلسهٔ فعال را پایان بده.</p>}
            </div>
          </Modal>
        </>
      )}
      <Suspense fallback={null}>
        {podcastOpen && <ReviewPodcast open={podcastOpen} onClose={() => setPodcastOpen(false)} />}
      </Suspense>

      {tab === "mistakes" ? (
        <MistakesView topicFilter={reviewTopic} />
      ) : tab === "cards" ? (
        <>
          {cardTopic && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-violet-200 dark:border-violet-800/60 bg-violet-50/80 dark:bg-violet-900/20 px-3 py-2.5">
              <span className="text-xs font-bold text-violet-700 dark:text-violet-300 leading-relaxed">
                🃏 مرور «{topicById.get(cardTopic)?.name ?? "مبحث"}» — بعد از کارت‌ها، برگرد و مرور را «✓ انجام دادم» بزن
              </span>
              <button type="button" className="text-[11px] text-violet-600 dark:text-violet-400 shrink-0 font-medium" onClick={() => setCardTopic(null)}>
                همه‌ی مباحث ✕
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAutoCardOpen(true)}
            className="w-full mb-4 py-2.5 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-700 text-white font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            🪄 ساخت خودکار فلش‌کارت از متن
          </button>
          <Suspense fallback={null}>
            {autoCardOpen && <AutoFlashcard open={autoCardOpen} onClose={() => setAutoCardOpen(false)} />}
          </Suspense>
          <Suspense fallback={<div className="animate-pulse flex flex-col gap-2" aria-label="در حال بارگذاری…"><div className="h-16 rounded-2xl bg-slate-200/70 dark:bg-slate-700/60" /><div className="h-16 rounded-2xl bg-slate-200/70 dark:bg-slate-700/60" /></div>}>
            <FlashcardsView key={cardTopic ?? reviewTopic ?? "all"} initialTopicId={cardTopic ?? reviewTopic} />
          </Suspense>
        </>
      ) : total === 0 ? (
        <EmptyState icon="🔁" title="هنوز مروری ثبت نشده" description="پس از پایان هر جلسه مطالعه و ارزیابی یادگیری، مرورهای بعدی به‌صورت خودکار زمان‌بندی می‌شوند؛ مرورهای خودِ برنامه هم همین‌جا دیده می‌شوند." action={<Button onClick={() => go("study")}>شروع مطالعه</Button>} />
      ) : (
        <>
          <Section title="🔴 عقب‌افتاده" count={overdueRows.length} empty="هیچ مرور عقب‌افتاده‌ای نداری. عالی!">
            {overdueRows.map((row) => <ReviewItem key={`${row.kind}:${row.id}`} row={row} tone="red" />)}
          </Section>
          <Section title="🟡 امروز" count={todayRows.length} empty="امروز مروری نداری.">
            {todayRows.map((row) => <ReviewItem key={`${row.kind}:${row.id}`} row={row} tone="yellow" />)}
          </Section>
          <Section title="🟢 آینده" count={upcomingRows.length} empty="مرور آینده‌ای ثبت نشده.">
            {(showAllUpcoming ? upcomingRows : upcomingRows.slice(0, 5)).map((row) => <ReviewItem key={`${row.kind}:${row.id}`} row={row} tone="green" />)}
            {upcomingRows.length > 5 && (
              <button type="button" className="text-xs text-teal-600 dark:text-teal-400 py-2" onClick={() => setShowAllUpcoming((v) => !v)}>
                {showAllUpcoming ? "نمایش کمتر" : `نمایش ${toFa(upcomingRows.length - 5)} مورد دیگر`}
              </button>
            )}
          </Section>
        </>
      )}

      <Modal open={!!rating && tab === "reviews"} onClose={() => setRating(null)} title="نتیجه مرور چطور بود؟">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{rating && topicById.get(rating.topicId)?.name} · مرور {rating && toFa(rating.reviewNumber)}</p>
        <RatingPicker
          onPick={(v) => {
            if (rating) {
              // تسک‌های «مرور» برنامه‌ی همین مبحث (امروز/عقب‌افتاده) هم با همین نتیجه بسته می‌شوند
              completeReview(rating.id, v, {
                completeTaskIds: duePlanReviewTasksOfTopic(rating.topicId).map((t) => t.id),
              });
            }
            setRating(null);
            toast("مرور ثبت شد (+۱۰ XP)", "✅");
          }}
        />
      </Modal>

      <Modal open={!!ratingTask && tab === "reviews"} onClose={() => setRatingTask(null)} title="نتیجه مرور چطور بود؟">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {ratingTask && topicById.get(ratingTask.topicId)?.name} · {ratingTask?.label ?? "مرور برنامه"}
          <span className="block mt-1 text-[10px] text-slate-400">اگر خوب یاد نگرفتی، برنامه برایت یادگیری دوباره می‌گذارد.</span>
        </p>
        <RatingPicker
          onPick={(v) => {
            if (ratingTask) {
              const srs = dueSrsOfTopic(ratingTask.topicId)[0];
              if (srs) {
                // همین یک کار، مرورِ فاصله‌دار را هم می‌بندد و مرور بعدی را می‌چیند
                completeReview(srs.id, v, { completeTaskIds: [ratingTask.id] });
              } else {
                // مرورِ فاصله‌داری سررسید نشده؛ فقط تسک برنامه بسته می‌شود
                completeTask(ratingTask.id);
                relearnForTopic(ratingTask.topicId, v);
              }
            }
            setRatingTask(null);
          }}
        />
      </Modal>
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h2>
        <span className="text-xs text-slate-400">{toFa(count)}</span>
      </div>
      {count === 0 ? <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-3">{empty}</div> : <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
}
