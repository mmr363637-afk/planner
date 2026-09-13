// ===== کارت «نقشه‌ی فردا» 🌙 — برنامه‌ی شب قبل =====
import { useMemo } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { Card } from "./ui";
import { buildNightPlan } from "../lib/nightBefore";
import { addDays, formatJalaliLong, formatMinutes, toFa, todayKey } from "../lib/jalali";

export default function NightPlanCard() {
  const { state } = useStore();
  const { go } = useNav();
  const tomorrow = addDays(todayKey(), 1);
  const plan = useMemo(
    () => buildNightPlan(state.tasks, state.reviews, state.exams, state.topics, tomorrow),
    [state.tasks, state.reviews, state.exams, state.topics, tomorrow],
  );
  const empty = plan.tasks.length === 0 && plan.reviewsDue === 0 && !plan.nextExam;
  return (
    <Card className="border-indigo-200/70 dark:border-indigo-800/40 bg-gradient-to-l from-indigo-50/90 via-white to-white dark:from-indigo-950/40 dark:via-slate-800/80 dark:to-slate-800/80">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">🌙 نقشه‌ی فردا</div>
        <div className="text-[10px] text-slate-400">{formatJalaliLong(tomorrow, false)}</div>
      </div>
      {empty ? (
        <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
          فردا خلوته 🎉 — بهترین فرصت برای مرور عقب‌افتاده‌ها یا یک استراحت حسابی.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          {plan.tasks.length > 0 && (
            <div className="flex items-start gap-1.5">
              <span className="shrink-0">📚</span>
              <span className="leading-6">
                {toFa(plan.tasks.length)} تسک · {formatMinutes(plan.totalMinutes)}:{" "}
                {plan.tasks.slice(0, 3).map((t) => plan.topicName(t.topicId)).join("، ")}
                {plan.tasks.length > 3 ? ` و ${toFa(plan.tasks.length - 3)} تای دیگر` : ""}
              </span>
            </div>
          )}
          {plan.reviewsDue > 0 && (
            <div className="flex items-center gap-1.5">
              <span>🔁</span>
              <button type="button" onClick={() => go("reviews")} className="text-teal-600 dark:text-teal-400 font-medium hover:underline">
                {toFa(plan.reviewsDue)} مرور سررسیده
              </button>
            </div>
          )}
          {plan.nextExam && (
            <div className="flex items-center gap-1.5">
              <span>📝</span>
              <button type="button" onClick={() => go("exams")} className="hover:underline">
                {plan.nextExam.title} ·{" "}
                {plan.nextExam.daysLeft === 0 ? (
                  <b className="text-rose-500">فرداست!</b>
                ) : (
                  <>{toFa(plan.nextExam.daysLeft)} روز مانده</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
