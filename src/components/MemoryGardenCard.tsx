import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Card, ProgressBar, SectionTitle } from "./ui";
import { buildMemoryGarden, recallLevel } from "../lib/recall";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";

/**
 * 🧠 باغ حافظه — «نیمه‌عمرِ» دانسته‌هایت روی نمودار.
 * برای هر مبحث، میانگین احتمال یادآوریِ امروز را از منحنی فراموشی حساب می‌کند
 * (همان فرمول FSRS). کاملاً آفلاین و از داده‌ی خود دستگاه.
 */
export default function MemoryGardenCard() {
  const { state } = useStore();
  const [expanded, setExpanded] = useState(false);
  const garden = useMemo(
    () => buildMemoryGarden(state.flashcards, state.topics, state.subjects),
    [state.flashcards, state.topics, state.subjects],
  );
  const subjectById = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);

  const reviewed = garden.topics.filter((t) => t.avgRecall != null);
  if (reviewed.length === 0) return null; // هنوز کارتی مرور نشده — کارتی نشان نده

  const shown = expanded ? reviewed : reviewed.slice(0, 5);
  const overallPct = garden.overall != null ? Math.round(garden.overall * 100) : 0;

  return (
    <div>
      <SectionTitle>باغ حافظه 🧠</SectionTitle>
      <Card>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            میانگین یادآوری امروزِ کارت‌هایت
          </span>
          <b className="text-lg text-teal-600 dark:text-teal-400">{toFa(overallPct)}٪</b>
        </div>
        <ProgressBar value={overallPct} />
        <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
          هر مبحث یک باغچه است؛ رنگش می‌گوید چقدر در خاطر می‌ماند. زیر ۷۵٪ یعنی «تشنه» — مرورش نزدیک است.
        </p>

        {garden.thirsty.length > 0 && (
          <div className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 p-2.5">
            <div className="text-[12px] font-bold text-rose-700 dark:text-rose-300 mb-1">
              🥀 {toFa(garden.thirsty.length)} باغچه در حال خشک شدن
            </div>
            <div className="text-[11px] text-rose-600/90 dark:text-rose-300/80">
              {garden.thirsty.slice(0, 3).map((t) => t.topicName).join(" · ")}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {shown.map((t) => {
            const pct = t.avgRecall != null ? Math.round(t.avgRecall * 100) : 0;
            const lvl = recallLevel(t.avgRecall);
            const subject = subjectById.get(t.subjectId);
            return (
              <div key={t.topicId} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: subject?.color ?? "#94a3b8" }} aria-hidden />
                <span className="text-[12px] text-slate-700 dark:text-slate-200 flex-1 truncate" title={t.topicName}>
                  {t.topicName}
                  <span className="text-slate-400 text-[10px]"> · {toFa(t.cards)} کارت</span>
                </span>
                <span className={cn("text-[10px] shrink-0", pct < 75 ? "text-rose-500" : pct < 90 ? "text-amber-500" : "text-emerald-500")}>
                  {lvl.label}
                </span>
                <span className="text-[11px] font-bold tabular-nums w-9 text-left shrink-0 text-slate-600 dark:text-slate-300">{toFa(pct)}٪</span>
              </div>
            );
          })}
        </div>

        {reviewed.length > 5 && (
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="mt-3 text-xs text-teal-600 dark:text-teal-400 font-bold w-full text-center"
          >
            {expanded ? "بستن فهرست ▲" : `دیدنِ همه‌ی ${toFa(reviewed.length)} باغچه ▼`}
          </button>
        )}
      </Card>
    </div>
  );
}
