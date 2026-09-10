import { useStore } from "../store";
import { Card } from "./ui";
import { treeEmoji, treeMessage, treeStage } from "../lib/focusTree";
import { minutesOnDate } from "../lib/stats";
import { toFa, todayKey } from "../lib/jalali";

/**
 * 🌳 درخت تمرکزِ امروز — با دقایق مطالعه رشد می‌کند؛
 * اگر وسط جلسه‌ی فعال اپ را رها کنی، پژمرده می‌شود (مثل Forest).
 */
export default function FocusTree({ compact = false }: { compact?: boolean }) {
  const { state } = useStore();
  const today = todayKey();
  const minutes = minutesOnDate(state.sessions, today);
  const goal = state.settings.dailyGoalMinutes;
  const wilted = state.focusTree?.date === today && state.focusTree.wilted;
  const stage = treeStage(minutes, goal);
  const emoji = treeEmoji(stage, wilted);
  const pct = goal > 0 ? Math.min(100, Math.round((minutes / goal) * 100)) : Math.min(100, Math.round((minutes / 180) * 100));

  if (compact) {
    return (
      <div className="flex items-center gap-2" title={treeMessage(stage, wilted)}>
        <span className="text-3xl transition-transform">{emoji}</span>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">درخت امروز {wilted ? "پژمرد 🥀" : `${toFa(pct)}٪`}</div>
        </div>
      </div>
    );
  }

  return (
    <Card className="flex items-center gap-4 overflow-hidden">
      <div className="text-6xl leading-none transition-transform duration-500" style={{ transform: `scale(${1 + stage * 0.06})` }}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">🌳 درخت تمرکز امروز</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{treeMessage(stage, wilted)}</div>
        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 mt-2 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Card>
  );
}
