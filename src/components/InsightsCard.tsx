import { useMemo } from "react";
import { useStore } from "../store";
import { Card, SectionTitle } from "./ui";
import { buildInsights } from "../lib/insights";
import { todayKey } from "../lib/jalali";

/**
 * 💡 بینش‌های محلی — داده‌هایی که اپ از قبل دارد (تست‌ها، مرورها، جلسات) را
 * ترکیب می‌کند و «چرا»های قابل توضیح می‌سازد. هیچ محاسبه‌ای بیرون از دستگاه
 * انجام نمی‌شود و اگر داده‌ی کافی نباشد، صادقانه چیزی نشان نمی‌دهد.
 */
export default function InsightsCard() {
  const { state } = useStore();
  const insights = useMemo(
    () =>
      buildInsights({
        sessions: state.sessions,
        testLogs: state.testLogs,
        reviews: state.reviews,
        topics: state.topics,
        subjects: state.subjects,
      }, todayKey()),
    [state.sessions, state.testLogs, state.reviews, state.topics, state.subjects],
  );

  if (insights.length === 0) return null;

  return (
    <div>
      <SectionTitle>بینش‌های تو 💡</SectionTitle>
      <div className="flex flex-col gap-3">
        {insights.map((ins) => (
          <Card key={ins.id} className="border-sky-100 dark:border-sky-900/40">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0" aria-hidden>{ins.icon}</span>
              <div>
                <div className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100 mb-1">{ins.title}</div>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">{ins.text}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-2 px-1">
        همه‌ی بینش‌ها روی همین دستگاه و از داده‌ی خودت حساب می‌شوند — با عدد و دلیل، نه حدس.
      </p>
    </div>
  );
}
