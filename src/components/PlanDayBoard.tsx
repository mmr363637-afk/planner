import { useMemo, useState } from "react";
import { Button, Card } from "./ui";
import { JalaliDatePicker } from "./shared";
import { addDays, diffDays, formatJalaliLong, formatMinutes, relativeDayLabel, todayKey, toFa } from "../lib/jalali";
import { TASK_KIND_ICON, TASK_KIND_LABEL, type StudyPlan, type StudyTask } from "../types";
import { cn } from "../utils/cn";

export interface PlanDayBoardProps {
  plan: StudyPlan;
  /** همهٔ تسک‌های برنامه — فقط معلق‌ها روی برد می‌آیند */
  tasks: StudyTask[];
  /** جابه‌جایی‌های هنوز ذخیره‌نشده: taskId → تاریخ مقصد */
  moves: Record<string, string>;
  onMove: (taskId: string, date: string) => void;
  onResetMove: (taskId: string) => void;
  onResetAll: () => void;
  /** تنظیماتِ در حال ویرایش (نه ذخیره‌شده) — برای هشدار «بار زیاد» و روزهای مطالعه */
  studyDays: number[];
  dailyMinutes: number;
  endDate: string;
  topicName: (topicId: string) => string;
  subjectColor: (topicId: string) => string | undefined;
}

/**
 * «چیدن دستیِ روزها» در ویرایش برنامه.
 *
 * هر کارِ معلقِ برنامه یک چیپ است که با کشیدن‌ورهاکردن (در موبایل: دکمهٔ ↔ و تقویم)
 * به روز دیگری منتقل می‌شود. جابه‌جایی‌ها اول در حافظهٔ همین پنجره می‌مانند و با
 * «ذخیره و بازچینش» اعمال می‌شوند؛ کارهای انجام‌شده هرگز جابه‌جا نمی‌شوند.
 */
export default function PlanDayBoard({
  plan,
  tasks,
  moves,
  onMove,
  onResetMove,
  onResetAll,
  studyDays,
  dailyMinutes,
  endDate,
  topicName,
  subjectColor,
}: PlanDayBoardProps) {
  const today = todayKey();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ taskId: string } | null>(null);
  const [pickDate, setPickDate] = useState(today);

  const effective = useMemo(
    () =>
      tasks
        .filter((t) => t.planId === plan.id && t.status === "pending")
        .map((t) => ({ ...t, date: moves[t.id] ?? t.date })),
    [tasks, plan.id, moves],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, typeof effective>();
    for (const t of effective) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [effective]);

  // روزهای دارای کار + چند روزِ خالیِ نزدیک که می‌شود به آن‌ها کشید
  const dates = useMemo(() => {
    const set = new Set(byDate.keys());
    const horizon = Math.min(Math.max(diffDays(today, endDate), 0), 7);
    for (let i = 0; i <= horizon; i++) {
      const key = addDays(today, i);
      const onStudyDay = studyDays.length === 0 || studyDays.includes(new Date(`${key}T00:00:00`).getDay());
      if (onStudyDay && !set.has(key)) set.add(key);
      // فقط روزهای خالیِ نزدیک را نشان بده تا برد شلوغ نشود
      if (set.size > 30) break;
    }
    return [...set].sort();
  }, [byDate, today, endDate, studyDays]);

  const past = dates.filter((d) => d < today);
  const upcoming = dates.filter((d) => d >= today);
  const moveCount = Object.keys(moves).length;

  const drop = (date: string, overdue: boolean) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (id && !overdue) onMove(id, date);
    setDragId(null);
    setOverDate(null);
  };

  const renderTask = (t: (typeof effective)[number]) => {
    const name = topicName(t.topicId);
    const moved = moves[t.id] != null;
    return (
      <div
        key={t.id}
        data-task-id={t.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", t.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(t.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverDate(null);
        }}
        className={cn(
          "flex items-center gap-1 rounded-lg border bg-white dark:bg-slate-800 px-1.5 py-1 text-[10px] text-slate-700 dark:text-slate-200 cursor-grab active:cursor-grabbing",
          moved ? "border-amber-400 ring-1 ring-amber-300" : "border-slate-200/80 dark:border-slate-700",
          dragId === t.id && "opacity-50",
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: subjectColor(t.topicId) ?? "#94a3b8" }} />
        <span className="shrink-0" title={TASK_KIND_LABEL[t.kind ?? "learn"]}>{TASK_KIND_ICON[t.kind ?? "learn"]}</span>
        {/* نام و دقیقه در یک متن‌اند تا در فهرست مباحث/تست‌ها با نامِ خالیِ مبحث اشتباه نشوند */}
        <span className="flex-1 min-w-0 truncate">
          {name} · {toFa(t.plannedMinutes)}′
        </span>
        {moved && (
          <button
            type="button"
            onClick={() => onResetMove(t.id)}
            aria-label={`لغو جابه‌جایی ${name}`}
            title="لغو جابه‌جایی"
            className="shrink-0 px-1 rounded text-amber-700 dark:text-amber-300"
          >
            ↺
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setPicking({ taskId: t.id });
            setPickDate(t.date < today ? today : t.date);
          }}
          aria-label={`انتقال ${name} به روز دیگر`}
          title="انتقال به روز دیگر (برای موبایل)"
          className="shrink-0 px-1 rounded text-slate-400 hover:text-teal-600"
        >
          ↔
        </button>
      </div>
    );
  };

  const renderGroup = (date: string) => {
    const list = byDate.get(date) ?? [];
    const load = list.reduce((sum, t) => sum + t.plannedMinutes, 0);
    const overdue = date < today;
    const heavy = dailyMinutes > 0 && load > dailyMinutes;
    const onStudyDay = studyDays.length === 0 || studyDays.includes(new Date(`${date}T00:00:00`).getDay());
    return (
      <div
        key={date}
        onDragOver={(e) => {
          if (overdue) return;
          e.preventDefault();
          setOverDate(date);
        }}
        onDragLeave={() => setOverDate((d) => (d === date ? null : d))}
        onDrop={drop(date, overdue)}
        data-drop-date={date}
        className={cn(
          "rounded-xl border p-1.5 transition-colors",
          overDate === date && dragId
            ? "border-teal-500 bg-teal-50/70 dark:bg-teal-900/20"
            : overdue
              ? "border-slate-200/70 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40"
              : "border-slate-200 dark:border-slate-700",
        )}
      >
        <div className="flex items-center gap-1 mb-1 px-0.5">
          <span className={cn("text-[10px] font-bold", overdue ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300")}>
            {formatJalaliLong(date)}
          </span>
          {date === today && <span className="text-[9px] px-1 rounded bg-teal-600 text-white">امروز</span>}
          {overdue && <span className="text-[9px] px-1 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">گذشته</span>}
          {!onStudyDay && <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">روز غیرمطالعه</span>}
          <span className="flex-1" />
          {heavy && <span className="text-[9px] text-amber-600 dark:text-amber-400" title="بار این روز از زمان روزانهٔ تنظیم‌شده بیشتر است">⚠️</span>}
          <span className={cn("text-[9px]", heavy ? "text-amber-600 dark:text-amber-400" : "text-slate-400")}>
            {load > 0 ? formatMinutes(load) : "خالی"}
          </span>
        </div>
        {list.length > 0 ? (
          <div className="flex flex-col gap-1">{list.map(renderTask)}</div>
        ) : (
          <div className="text-[9px] text-slate-300 dark:text-slate-600 text-center py-1 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
            {overdue ? "—" : "کارت را اینجا رها کن"}
          </div>
        )}
      </div>
    );
  };

  const pickingTask = picking ? effective.find((t) => t.id === picking.taskId) : undefined;
  const pickTooLate = diffDays(pickDate, endDate) < 0 || pickDate > endDate;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">🗓 چیدن دستیِ روزها</div>
        {moveCount > 0 && (
          <button type="button" onClick={onResetAll} className="text-[10px] text-rose-600 dark:text-rose-400">
            بازگردانی همه ({toFa(moveCount)})
          </button>
        )}
      </div>
      <div className="text-[10px] text-slate-400 mb-1.5 leading-relaxed">
        کارت را بکش و روی روز دیگر رها کن؛ روی موبایل دکمهٔ ↔ و انتخاب تاریخ. کارهای انجام‌شده دست‌نخورده می‌مانند و
        جابه‌جایی‌ها با «ذخیره و بازچینش» اعمال می‌شوند.
      </div>

      {picking && (
        <Card className="!p-2 mb-2 !bg-teal-50/60 dark:!bg-teal-900/20 !border-teal-200 dark:!border-teal-800/60">
          <div className="text-[11px] font-bold text-teal-800 dark:text-teal-200 mb-1.5">
            انتقال «{pickingTask ? topicName(pickingTask.topicId) : "کار"}» به:
          </div>
          <JalaliDatePicker value={pickDate} onChange={setPickDate} min={today} />
          {pickTooLate && <div className="text-[10px] text-rose-600 mt-1">این روز بعد از پایان برنامه است.</div>}
          <div className="flex gap-1.5 mt-2">
            <Button
              size="sm"
              disabled={pickTooLate || pickDate < today}
              onClick={() => {
                onMove(picking.taskId, pickDate);
                setPicking(null);
              }}
            >
              انتقال
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicking(null)}>
              انصراف
            </Button>
            <span className="flex-1" />
            <span className="text-[10px] text-slate-400 self-center">{relativeDayLabel(pickDate)}</span>
          </div>
        </Card>
      )}

      <div className="max-h-60 overflow-y-auto flex flex-col gap-1.5 pl-0.5">
        {past.map(renderGroup)}
        {upcoming.map(renderGroup)}
        {dates.length === 0 && <div className="text-[11px] text-slate-400 text-center py-2">کارِ معلقی برای جابه‌جایی نیست.</div>}
      </div>
    </div>
  );
}
