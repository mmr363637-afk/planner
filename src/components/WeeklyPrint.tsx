// ===== شیت چاپِ هفتگی — خروجی «چاپ / PDF» =====
// فقط هنگام window.print() دیده می‌شود (کلاس print-only در صفحه مخفی است).
// شامل: مشغله‌های ثابت هر روز هفته + کارهای مطالعه‌ی برنامه‌ریزی‌شده‌ی همین هفته.
import { useStore } from "../store";
import { WEEKDAYS_FA, formatJalaliNumeric, formatJalaliLong, todayKey, toFa, weekDates } from "../lib/jalali";
import type { AppState } from "../types";

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // ۰۶..۲۳

export interface WeekSheetDay {
  date: string;
  weekday: number;
  /** بلوک‌های مشغله‌ی ثابت (کلاس و…) */
  blocks: { title: string; startMin: number; endMin: number }[];
  /** کارهای مطالعه‌ی آن روز */
  tasks: { label: string; subject: string; minutes: number; done: boolean }[];
}

/** ساخت داده‌ی شیت هفتگی — تابع خالص و تست‌پذیر */
export function buildWeekSheet(state: AppState, today = todayKey()): {
  days: WeekSheetDay[];
  weekStart: string;
  weekEnd: string;
} {
  const dates = weekDates(today);
  const topicById = new Map(state.topics.map((t) => [t.id, t]));
  const subjectById = new Map(state.subjects.map((s) => [s.id, s]));

  const days: WeekSheetDay[] = dates.map((date) => ({
    date,
    weekday: new Date(date + "T12:00:00").getDay(),
    blocks: (state.classBlocks ?? [])
      .filter((b) => b.weekday === new Date(date + "T12:00:00").getDay())
      .map((b) => ({ title: b.title, startMin: b.startMin, endMin: b.endMin }))
      .sort((a, b) => a.startMin - b.startMin),
    tasks: [],
  }));

  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const t of state.tasks) {
    const day = byDate.get(t.date);
    if (!day) continue;
    const topic = topicById.get(t.topicId);
    const subject = topic ? subjectById.get(topic.subjectId) : undefined;
    day.tasks.push({
      label: topic?.name ?? "مبحث",
      subject: subject?.name ?? "",
      minutes: t.plannedMinutes,
      done: t.status === "done",
    });
  }
  for (const d of days) d.tasks.sort((a, b) => b.minutes - a.minutes);

  return { days, weekStart: dates[0], weekEnd: dates[6] };
}

const minToClock = (m: number) => `${toFa(String(Math.floor(m / 60)).padStart(2, "0"))}:${toFa(String(m % 60).padStart(2, "0"))}`;

/** شیت خودِ چاپ — فقط هنگام print رندر می‌شود */
export default function WeeklyPrint() {
  const { state } = useStore();
  const { days, weekStart, weekEnd } = buildWeekSheet(state);
  const today = todayKey();

  return (
    <div className="print-only print-sheet bg-white text-slate-900" dir="rtl">
      <div className="flex items-end justify-between mb-3 border-b-2 border-slate-800 pb-2">
        <div>
          <h1 className="text-lg font-extrabold">برنامه‌ی هفتگی مطالعه</h1>
          <p className="text-[11px] text-slate-500">
            هفته‌ی {formatJalaliNumeric(weekStart)} تا {formatJalaliNumeric(weekEnd)} · چاپ‌شده در {formatJalaliLong(today, false)}
          </p>
        </div>
        <div className="text-2xl font-black">📚</div>
      </div>

      <table className="w-full border-collapse text-[9px]" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th className="border border-slate-400 bg-slate-100 p-1 w-8">ساعت</th>
            {days.map((d) => (
              <th key={d.date} className={`border border-slate-400 p-1 bg-slate-100 ${d.date === today ? "bg-teal-100" : ""}`}>
                {WEEKDAYS_FA[d.weekday]}
                <div className="text-[8px] font-normal text-slate-500">{formatJalaliNumeric(d.date)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((h) => (
            <tr key={h} style={{ height: 22 }}>
              <td className="border border-slate-300 text-center text-[8px] text-slate-500 align-top pt-0.5">
                {toFa(String(h).padStart(2, "0"))}
              </td>
              {days.map((d) => {
                // مشغله‌های ثابت: در سطرِ ساعتی که با آن ساعت هم‌پوشانی دارند
                const blockItems = d.blocks
                  .filter((b) => b.startMin < h * 60 + 60 && b.endMin > h * 60)
                  .map((b) => ({ text: `${b.title} (${minToClock(b.startMin)}–${minToClock(b.endMin)})`, cls: "font-bold" }));
                // کارهای مطالعه زمان دقیق ندارند؛ در سطرِ اولِ روز می‌نشینند تا خوانده شوند
                const taskItems =
                  h === 6
                    ? d.tasks.map((t) => ({ text: `${t.done ? "☑" : "☐"} ${t.label} · ${toFa(t.minutes)}′`, cls: "" }))
                    : [];
                return (
                  <td key={d.date} className="border border-slate-300 p-0.5 align-top leading-tight">
                    {[...blockItems, ...taskItems].map((it, i) => (
                      <div key={i} className={it.cls}>
                        {it.text}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[8px] text-slate-400 mt-2 leading-relaxed">
        ☐ کارهای مطالعه‌ی برنامه‌ریزی‌شده‌ی همین هفته (برای هر روز) · متن‌های درون پرانتز، مشغله‌های ثابت روز هفته (کلاس و…) هستند.
      </p>
    </div>
  );
}
