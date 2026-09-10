import { useMemo } from "react";
import { useStore } from "../store";
import { Card, ProgressBar, SectionTitle } from "./ui";
import { JOURNEY_STOPS, KM_PER_HOUR, journeyProgress } from "../lib/journey";
import { totalMinutes } from "../lib/stats";
import { toFa } from "../lib/jalali";

/** 🗺️ سفر مطالعه — هر ساعت مطالعه، ۲۵ کیلومتر سفر از تهران به دنیا */
export default function JourneyCard() {
  const { state } = useStore();
  const total = totalMinutes(state.sessions);
  const j = useMemo(() => journeyProgress(total), [total]);

  return (
    <div>
      <SectionTitle>سفر مطالعه‌ات 🗺️</SectionTitle>
      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-slate-800 dark:text-slate-100">
            {j.current.icon} {j.current.city}
          </span>
          {j.next ? (
            <span className="text-xs text-slate-500">مقصد بعدی: {j.next.icon} {j.next.city} · {toFa(j.next.km - j.km)} کیلومتر مانده</span>
          ) : (
            <span className="text-xs text-emerald-600 font-bold">🏁 دور دنیا را کامل کردی!</span>
          )}
        </div>
        <div className="mt-2.5">
          <ProgressBar value={j.pct} />
        </div>
        <div className="text-[11px] text-slate-400 mt-1.5">
          تا حالا {toFa(j.km)} کیلومتر سفر کرده‌ای · هر ساعت مطالعه = {toFa(KM_PER_HOUR)} کیلومتر 🧭
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {JOURNEY_STOPS.map((s) => {
            const visited = j.km >= s.km;
            return (
              <span
                key={s.city}
                title={`${s.city} — کیلومتر ${toFa(s.km)}`}
                className={`text-[10px] px-2 py-1 rounded-full ${visited ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-bold" : "bg-slate-100 dark:bg-slate-700/60 text-slate-400"}`}
              >
                {visited ? "✓ " : ""}{s.icon} {s.city}
              </span>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
