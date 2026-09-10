// ===== کارت «ساعت‌های طلایی» — بیشترین مطالعه در چه ساعتی؟ =====
import { useMemo } from "react";
import { useStore } from "../store";
import { goldenHours } from "../lib/goldenHours";
import { formatMinutes, toFa } from "../lib/jalali";
import { Card } from "./ui";
import { cn } from "../utils/cn";

export default function GoldenHoursCard() {
  const { state } = useStore();
  const data = useMemo(() => goldenHours(state.sessions, 90), [state.sessions]);
  if (data.totalSessions < 3) return null;

  const max = Math.max(1, ...data.buckets.map((b) => b.minutes));
  const inBest = (hour: number) =>
    data.bestWindow != null && hour >= data.bestWindow.startHour && hour < data.bestWindow.endHour;

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">🌅 ساعت‌های طلایی تو</div>
        <div className="text-[10px] text-slate-400">{toFa(data.days)} روز اخیر</div>
      </div>
      {data.bestWindow && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
          بیشترین تمرکزت حوالی <b className="text-teal-600 dark:text-teal-400">ساعت {toFa(data.bestWindow.startHour)} تا {toFa(data.bestWindow.endHour)}</b> است
          {" · "}{formatMinutes(data.bestWindow.minutes)}
        </p>
      )}
      <div className="flex items-end gap-[2px] h-20" dir="ltr">
        {data.buckets.map((b) => (
          <div key={b.hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`ساعت ${toFa(b.hour)} — ${b.minutes > 0 ? formatMinutes(b.minutes) : "—"}`}>
            <div
              className={cn(
                "w-full rounded-t transition-all duration-500",
                b.minutes === 0 ? "bg-slate-100 dark:bg-slate-700/40" : inBest(b.hour) ? "bg-teal-500" : "bg-teal-200 dark:bg-teal-800",
              )}
              style={{ height: b.minutes === 0 ? 3 : Math.max(5, (b.minutes / max) * 100) + "%" }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[8px] text-slate-400 mt-1" dir="ltr">
        <span>۰</span><span>۶</span><span>۱۲</span><span>۱۸</span><span>۲۴</span>
      </div>
      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
        نکته: مهم‌ترین مبحثِ روز را در ساعتِ طلایی‌ات بگذار.
      </p>
    </Card>
  );
}
