import { useState } from "react";
import { useLookups, useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, Chip, EmptyState, Modal } from "../components/ui";
import { RatingPicker } from "../components/shared";
import { classifyReviews } from "../lib/srs";
import { diffDays, formatJalaliShort, relativeDayLabel, toFa, todayKey } from "../lib/jalali";
import type { Review } from "../types";
import { cn } from "../utils/cn";

export default function ReviewsPage() {
  const { state, completeReview, postponeReview, startSession, toast } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const { go } = useNav();
  const today = todayKey();
  const groups = classifyReviews(state.reviews, today);
  const [rating, setRating] = useState<Review | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const doneCount = state.reviews.filter((r) => r.status === "done").length;

  const total = groups.overdue.length + groups.today.length + groups.upcoming.length;

  const ReviewItem = ({ r, tone }: { r: Review; tone: "red" | "yellow" | "green" }) => {
    const topic = topicById.get(r.topicId);
    const subject = subjectOfTopic(r.topicId);
    if (!topic || !subject) return null;
    const actionable = tone !== "green";
    return (
      <Card className="p-3">
        <div className="flex items-center gap-3">
          <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: subject.color }} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px]" style={{ color: subject.color }}>{subject.name}</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{topic.name}</div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <Chip>مرور {toFa(r.reviewNumber)}</Chip>
              <Chip>{formatJalaliShort(r.dueDate)}</Chip>
              <Chip className={cn(tone === "red" && "!bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-300", tone === "yellow" && "!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300", tone === "green" && "!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-900/40 dark:!text-emerald-300")}>
                {tone === "red" ? `${toFa(diffDays(r.dueDate, today))} روز تأخیر` : relativeDayLabel(r.dueDate)}
              </Chip>
            </div>
          </div>
        </div>
        {actionable && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="flex-1" onClick={() => setRating(r)}>
              ✓ انجام دادم
            </Button>
            <Button size="sm" variant="outline" onClick={() => { postponeReview(r.id, 1); toast("مرور به فردا موکول شد", "⏭"); }}>
              فردا
            </Button>
            <Button size="sm" variant="danger" onClick={() => { completeReview(r.id, 0); toast("مرور با فاصله کوتاه‌تر تکرار می‌شود", "🔁"); }}>
              بلد نیستم
            </Button>
          </div>
        )}
        {actionable && (
          <button
            type="button"
            onClick={() => {
              if (state.activeSession) toast("یک جلسه فعال داری.", "⏳");
              else startSession(r.topicId, "free");
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
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50">مرورها</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">مرور فاصله‌دار · {toFa(doneCount)} مرور انجام‌شده</p>
        </div>
        <div className="flex gap-1.5 text-[11px]">
          <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">🔴 {toFa(groups.overdue.length)}</span>
          <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">🟡 {toFa(groups.today.length)}</span>
          <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">🟢 {toFa(groups.upcoming.length)}</span>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState icon="🔁" title="هنوز مروری ثبت نشده" description="پس از پایان هر جلسه مطالعه و ارزیابی یادگیری، مرورهای بعدی به‌صورت خودکار زمان‌بندی می‌شوند." action={<Button onClick={() => go("study")}>شروع مطالعه</Button>} />
      ) : (
        <>
          <Section title="🔴 عقب‌افتاده" count={groups.overdue.length} empty="هیچ مرور عقب‌افتاده‌ای نداری. عالی!">
            {groups.overdue.map((r) => <ReviewItem key={r.id} r={r} tone="red" />)}
          </Section>
          <Section title="🟡 امروز" count={groups.today.length} empty="امروز مروری نداری.">
            {groups.today.map((r) => <ReviewItem key={r.id} r={r} tone="yellow" />)}
          </Section>
          <Section title="🟢 آینده" count={groups.upcoming.length} empty="مرور آینده‌ای ثبت نشده.">
            {(showAllUpcoming ? groups.upcoming : groups.upcoming.slice(0, 5)).map((r) => <ReviewItem key={r.id} r={r} tone="green" />)}
            {groups.upcoming.length > 5 && (
              <button type="button" className="text-xs text-teal-600 dark:text-teal-400 py-2" onClick={() => setShowAllUpcoming((v) => !v)}>
                {showAllUpcoming ? "نمایش کمتر" : `نمایش ${toFa(groups.upcoming.length - 5)} مورد دیگر`}
              </button>
            )}
          </Section>
        </>
      )}

      <Modal open={!!rating} onClose={() => setRating(null)} title="نتیجه مرور چطور بود؟">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{rating && topicById.get(rating.topicId)?.name} · مرور {rating && toFa(rating.reviewNumber)}</p>
        <RatingPicker
          onPick={(v) => {
            if (rating) completeReview(rating.id, v);
            setRating(null);
            toast("مرور ثبت شد (+۱۰ XP)", "✅");
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
