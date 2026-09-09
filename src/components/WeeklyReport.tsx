import { useStore } from "../store";
import { Card } from "./ui";
import { addDays, formatMinutes, startOfWeek, toFa, todayKey, WEEKDAYS_SHORT_FA, weekdayOf, keyToJalali, jalaliToKey } from "../lib/jalali";
import { minutesInRange, minutesBySubject } from "../lib/stats";
import { cn } from "../utils/cn";

/**
 * گزارش هفتگی — مقایسه‌ی هفته‌ی جاری با هفته‌ی قبل.
 * نشان می‌دهد چند ساعت خواندی، کدام درس بیشترین بوده، و آیا بهتر یا بدتر شدی.
 */
export function WeeklyReport() {
  const { state } = useStore();
  const today = todayKey();
  const thisWeekStart = startOfWeek(today);
  const lastWeekStart = addDays(thisWeekStart, -7);

  const thisWeekMin = minutesInRange(state.sessions, thisWeekStart, addDays(thisWeekStart, 6));
  const lastWeekMin = minutesInRange(state.sessions, lastWeekStart, addDays(lastWeekStart, 6));
  const diff = thisWeekMin - lastWeekMin;

  // روز به روزِ این هفته
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(thisWeekStart, i);
    return {
      date: d,
      label: WEEKDAYS_SHORT_FA[weekdayOf(d)],
      minutes: minutesInRange(state.sessions, d, d),
      isToday: d === today,
    };
  });
  const maxDay = Math.max(60, ...days.map((d) => d.minutes));

  // درسِ بیشترین این هفته
  const bySubject = minutesBySubject(state.sessions, state.topics);
  const topSubject = state.subjects
    .map((s) => ({ name: s.name, color: s.color, min: bySubject[s.id] ?? 0 }))
    .filter((s) => s.min > 0)
    .sort((a, b) => b.min - a.min)[0];

  // مقایسه روز به روز با هفته قبل
  const lastWeekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(lastWeekStart, i);
    return minutesInRange(state.sessions, d, d);
  });

  return (
    <Card>
      {/* مقایسه کلی */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatMinutes(thisWeekMin)}</div>
          <div className="text-xs text-slate-500">این هفته</div>
        </div>
        <div className={cn("text-2xl font-bold tabular-nums", diff > 0 ? "text-emerald-500" : diff < 0 ? "text-rose-500" : "text-slate-400")}>
          {diff > 0 ? "↑" : diff < 0 ? "↓" : "="} {diff > 0 ? "+" : ""}{formatMinutes(Math.abs(diff))}
        </div>
        <div className="text-left">
          <div className="text-lg font-bold text-slate-500">{formatMinutes(lastWeekMin)}</div>
          <div className="text-xs text-slate-400">هفته قبل</div>
        </div>
      </div>

      {/* نمودار مقایسه‌ای روز به روز */}
      <div className="flex items-end justify-between gap-1.5 h-28 mb-3">
        {days.map((d, i) => {
          const h = Math.max(3, (d.minutes / maxDay) * 100);
          const lh = Math.max(0, (lastWeekDays[i] / maxDay) * 100);
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5">
              <span className="text-[9px] text-slate-400 tabular-nums">{d.minutes > 0 ? formatMinutes(d.minutes).replace(" دقیقه", "") : ""}</span>
              <div className="w-full flex items-end justify-center gap-0.5" style={{ height: "80%" }}>
                {/* هفته قبل */}
                <div className="w-2/5 rounded-t bg-slate-200 dark:bg-slate-700" style={{ height: `${lh}%` }} />
                {/* این هفته */}
                <div className={cn("w-2/5 rounded-t", d.isToday ? "bg-teal-500" : "bg-teal-300 dark:bg-teal-600")} style={{ height: `${h}%` }} />
              </div>
              <span className={cn("text-[9px]", d.isToday ? "text-teal-500 font-bold" : "text-slate-400")}>{d.label}</span>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 mb-3">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-teal-300 dark:bg-teal-600" /> این هفته</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200 dark:bg-slate-700" /> هفته قبل</span>
      </div>

      {/* درس بیشترین */}
      {topSubject && (
        <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-100 dark:border-slate-700/50 pt-3">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: topSubject.color }} />
          بیشترین مطالعه: <b className="text-slate-700 dark:text-slate-200">{topSubject.name}</b> ({formatMinutes(topSubject.min)})
        </div>
      )}
    </Card>
  );
}

/**
 * گزارش ماهانه — خلاصه مطالعه ماه جاری با مقایسه ماه قبل
 */
export function MonthlyReport() {
  const { state } = useStore();
  const today = todayKey();
  const j = keyToJalali(today);
  
  // شروع ماه جاری
  const thisMonthStart = jalaliToKey(j.jy, j.jm, 1);
  // شروع ماه قبل
  const prevMonth = j.jm === 1 ? 12 : j.jm - 1;
  const prevYear = j.jm === 1 ? j.jy - 1 : j.jy;
  const prevMonthStart = jalaliToKey(prevYear, prevMonth, 1);
  const prevMonthEnd = addDays(thisMonthStart, -1);

  const thisMonthMin = minutesInRange(state.sessions, thisMonthStart, today);
  const prevMonthMin = minutesInRange(state.sessions, prevMonthStart, prevMonthEnd);
  const diff = thisMonthMin - prevMonthMin;

  // روزهای باقیمانده ماه
  const nextMonth = j.jm === 12 ? 1 : j.jm + 1;
  const nextMonthYear = j.jm === 12 ? j.jy + 1 : j.jy;
  const nextMonthStart = jalaliToKey(nextMonthYear, nextMonth, 1);
  const daysLeft = Math.max(0, Math.round((new Date(nextMonthStart).getTime() - new Date(today).getTime()) / 86400000));
  const daysPassed = Math.max(1, Math.round((new Date(today).getTime() - new Date(thisMonthStart).getTime()) / 86400000) + 1);

  // میانگین روزانه
  const dailyAvg = Math.round(thisMonthMin / daysPassed);
  // پیش‌بینی پایان ماه
  const projected = dailyAvg * (daysPassed + daysLeft);

  return (
    <Card>
      <div className="grid grid-cols-3 gap-3 text-center mb-3">
        <div>
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatMinutes(thisMonthMin)}</div>
          <div className="text-[10px] text-slate-500">مطالعه ماه</div>
        </div>
        <div>
          <div className="text-lg font-bold text-teal-600 dark:text-teal-400">{formatMinutes(dailyAvg)}</div>
          <div className="text-[10px] text-slate-500">میانگین روزانه</div>
        </div>
        <div>
          <div className="text-lg font-bold text-violet-600 dark:text-violet-400">{formatMinutes(projected)}</div>
          <div className="text-[10px] text-slate-500">پیش‌بینی پایان ماه</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 dark:border-slate-700/50 pt-2">
        <span>{toFa(daysLeft)} روز مانده تا پایان ماه</span>
        {prevMonthMin > 0 && (
          <span className={cn(diff >= 0 ? "text-emerald-500" : "text-rose-500")}>
            {diff >= 0 ? "↑" : "↓"} {diff >= 0 ? "+" : ""}{formatMinutes(Math.abs(diff))} نسبت به ماه قبل
          </span>
        )}
      </div>
    </Card>
  );
}
