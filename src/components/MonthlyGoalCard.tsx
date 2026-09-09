import { useStore } from "../store";
import { ProgressBar } from "./ui";
import { startOfMonth, formatMinutes, toFa } from "../lib/jalali";
import { minutesInRange } from "../lib/stats";
import { todayKey } from "../lib/jalali";

/**
 * کارت پیشرفت هدف ماهانه — در صفحه خانه و تنظیمات نمایش داده می‌شود.
 */
export function MonthlyGoalCard({ compact = false }: { compact?: boolean }) {
  const { state } = useStore();
  const goal = state.settings.monthlyGoalMinutes;
  if (goal <= 0) return null;

  const today = todayKey();
  const monthStart = startOfMonth(today);
  const actualMinutes = minutesInRange(state.sessions, monthStart, today);
  const percent = Math.min(100, Math.round((actualMinutes / goal) * 100));
  const remaining = Math.max(0, goal - actualMinutes);

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-600 dark:text-slate-300">🎯 هدف ماهانه</span>
        <div className="flex-1">
          <ProgressBar value={percent} />
        </div>
        <span className="text-xs text-slate-500 tabular-nums w-10 text-left">{toFa(percent)}٪</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">🎯 هدف ماهانه</span>
        <span className="text-xs text-slate-500">{formatMinutes(actualMinutes)} از {formatMinutes(goal)}</span>
      </div>
      <ProgressBar value={percent} />
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-slate-500">
          {percent >= 100 ? "✅ به هدف رسیدی!" : `${formatMinutes(remaining)} مانده تا پایان ماه`}
        </span>
        <span className={percent >= 100 ? "text-emerald-500 font-bold" : "text-slate-400"}>{toFa(percent)}٪</span>
      </div>
    </div>
  );
}
