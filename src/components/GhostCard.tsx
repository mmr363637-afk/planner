import { useMemo } from "react";
import { useStore } from "../store";
import { Card, ProgressBar, SectionTitle } from "./ui";
import { bestRollingWeek, currentWeekMinutes } from "../lib/ghost";
import { formatJalaliShort, formatMinutes, toFa, todayKey } from "../lib/jalali";

/** 👻 رقابت با سایه‌ی خودت — بهترین هفته‌ات در برابر هفته‌ی جاری */
export default function GhostCard() {
  const { state } = useStore();
  const today = todayKey();
  const ghost = useMemo(() => bestRollingWeek(state.sessions), [state.sessions]);
  const current = useMemo(() => currentWeekMinutes(state.sessions, today), [state.sessions, today]);

  if (!ghost || ghost.minutes <= 0) return null;
  const pct = Math.min(100, Math.round((current / ghost.minutes) * 100));
  const ahead = current >= ghost.minutes;

  return (
    <div>
      <SectionTitle>رقابت با سایه‌ات 👻</SectionTitle>
      <Card className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white border-0">
        <div className="flex items-center justify-between text-sm">
          <span className="opacity-90">👻 سایه‌ات (هفته‌ی {formatJalaliShort(ghost.start)})</span>
          <b>{formatMinutes(ghost.minutes)}</b>
        </div>
        <div className="flex items-center justify-between text-sm mt-1.5">
          <span className="opacity-90">🔥 این هفته</span>
          <b>{formatMinutes(current)}</b>
        </div>
        <div className="mt-3">
          <ProgressBar value={pct} className="bg-white/20" color="#fff" />
        </div>
        <div className="text-xs mt-2 opacity-90 leading-relaxed">
          {ahead
            ? "🏆 از سایه‌ات جلو زدی! رکورد جدید بزن."
            : `تا شکستن رکوردت ${formatMinutes(ghost.minutes - current)} مونده — می‌تونی! (${toFa(pct)}٪)`}
        </div>
      </Card>
    </div>
  );
}
