import { useMemo } from "react";
import { useStore } from "../store";
import { Button, Card } from "./ui";
import { smartReviewHeadline, smartReviewCardIds, smartWeakSpots } from "../lib/smartReview";
import { toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";

/**
 * 🧠 «امروز چه بخوانم؟» — کارتِ کوچک بالای صفحهٔ کارت‌ها.
 * ضعف‌ها را از دادهٔ خودِ کاربر (سررسید، فراموشی، پاسخ‌های غلطِ آزمون کارتی،
 * اشتباهات و بانک سؤال) می‌سازد و دقیقاً می‌گوید چرا. دکمهٔ اصلی، یک جلسهٔ
 * محدود به همان کارت‌ها می‌سازد؛ دکمهٔ هر مبحث، آزمون چهارگزینه‌ایِ همان مبحث.
 */
export default function SmartReviewCard({
  onStartSmart,
  onStartTopic,
}: {
  onStartSmart: (cardIds: string[]) => void;
  onStartTopic: (scopeKey: string) => void;
}) {
  const { state } = useStore();
  const today = todayKey();
  const spots = useMemo(
    () =>
      smartWeakSpots({
        flashcards: state.flashcards,
        topics: state.topics,
        cardAttempts: state.cardAttempts,
        mistakes: state.mistakes,
        bankAttempts: state.examBankAttempts,
        today,
        limit: 3,
      }),
    [state.flashcards, state.topics, state.cardAttempts, state.mistakes, state.examBankAttempts, today],
  );
  if (spots.length === 0) return null;
  const ids = smartReviewCardIds(spots);

  return (
    <Card className="mb-4 !p-3 !bg-gradient-to-l !from-slate-50 !to-white dark:!from-slate-800 dark:!to-slate-800/60">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">🧠 مرور هوشمند امروز</div>
        <span className="text-[10px] text-slate-400">{toFa(spots.length)} نقطهٔ ضعف</span>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{smartReviewHeadline(spots)}</p>
      <div className="mt-2 space-y-1">
        {spots.map((spot) => (
          <div key={spot.key} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => (spot.kind === "topic" ? onStartTopic(`t:${spot.key.slice(6)}`) : undefined)}
              disabled={spot.kind === "bank"}
              className={cn("flex-1 text-right text-[11px] px-2 py-1.5 rounded-xl border", spot.kind === "topic" ? "border-slate-200 dark:border-slate-700 hover:border-indigo-300" : "border-slate-100 dark:border-slate-700/60 opacity-80")}
              title={spot.kind === "bank" ? "این ضعف از بانک سؤال است؛ در بخش «بانک آزمون» تمرین کن" : "آزمون همین مبحث"}
            >
              <span className="font-bold text-slate-700 dark:text-slate-200">{spot.kind === "bank" ? "🏥" : "📚"} {spot.label}</span>
              <span className="text-[10px] text-slate-400 mr-1">· {spot.reasons.join(" · ")}</span>
            </button>
          </div>
        ))}
      </div>
      <Button size="sm" className="w-full mt-2" disabled={ids.length === 0} onClick={() => onStartSmart(ids)}>
        شروع مرور هوشمند ({toFa(ids.length)} کارت)
      </Button>
    </Card>
  );
}
