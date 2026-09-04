import { useEffect, useMemo, useState } from "react";
import { useLookups, useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, ChevronIcon, Field, IconButton, Modal, PlusIcon, Segmented, inputClass } from "../components/ui";
import { TaskRow } from "../components/shared";
import {
  JALALI_MONTHS,
  WEEKDAYS_SHORT_FA,
  WEEK_ORDER,
  addDays,
  formatHoursCompact,
  formatJalaliLong,
  jalaliMonthLength,
  jalaliToKey,
  keyToJalali,
  relativeDayLabel,
  toFa,
  todayKey,
  weekDates,
  weekdayOf,
} from "../lib/jalali";
import { minutesOnDate, plannedMinutesOnDate } from "../lib/stats";
import { cn } from "../utils/cn";
import type { StudyTask } from "../types";

type View = "day" | "week" | "month";

export default function CalendarPage() {
  const { state, startSession, addTask, toast } = useStore();
  const { topicById, subjectById } = useLookups();
  const nav = useNav();
  const today = todayKey();
  const [view, setView] = useState<View>("day");
  const [selected, setSelected] = useState(nav.calendarDate ?? today);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    if (nav.calendarDate) setSelected(nav.calendarDate);
  }, [nav.calendarDate]);

  const tasksByDate = useMemo(() => {
    const m = new Map<string, StudyTask[]>();
    for (const t of state.tasks) {
      const l = m.get(t.date) ?? [];
      l.push(t);
      m.set(t.date, l);
    }
    for (const l of m.values()) l.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.order - b.order);
    return m;
  }, [state.tasks]);

  const reviewCount = (d: string) => state.reviews.filter((r) => r.status === "pending" && r.dueDate === d).length;
  const examDates = useMemo(() => new Set(state.exams.map((e) => e.date)), [state.exams]);

  const onStart = (task: StudyTask) => {
    if (state.activeSession) {
      toast("یک جلسه فعال داری.", "⏳");
    } else {
      startSession(task.topicId, "free", task.id);
    }
    nav.go("study");
  };

  const shift = (dir: 1 | -1) => {
    if (view === "day") setSelected(addDays(selected, dir));
    else if (view === "week") setSelected(addDays(selected, dir * 7));
    else {
      const { jy, jm } = keyToJalali(selected);
      const nm = jm + dir;
      const y = nm < 1 ? jy - 1 : nm > 12 ? jy + 1 : jy;
      const m = nm < 1 ? 12 : nm > 12 ? 1 : nm;
      setSelected(jalaliToKey(y, m, 1));
    }
  };

  const dayTasks = tasksByDate.get(selected) ?? [];

  return (
    <div className="pb-24">
      <Segmented value={view} onChange={setView} options={[{ value: "day", label: "روز" }, { value: "week", label: "هفته" }, { value: "month", label: "ماه" }]} className="mb-4" />

      <div className="flex items-center justify-between mb-3">
        <IconButton onClick={() => shift(-1)}>
          <ChevronIcon dir="right" />
        </IconButton>
        <button type="button" onClick={() => setSelected(today)} className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {view === "month" ? `${JALALI_MONTHS[keyToJalali(selected).jm - 1]} ${toFa(keyToJalali(selected).jy)}` : formatJalaliLong(selected, view === "day")}
        </button>
        <IconButton onClick={() => shift(1)}>
          <ChevronIcon dir="left" />
        </IconButton>
      </div>

      {view === "week" && (
        <WeekStrip selected={selected} onSelect={setSelected} tasksByDate={tasksByDate} sessions={state.sessions} reviewCount={reviewCount} />
      )}
      {view === "month" && (
        <MonthGrid selected={selected} onSelect={(d) => { setSelected(d); }} tasksByDate={tasksByDate} sessions={state.sessions} reviewCount={reviewCount} examDates={examDates} />
      )}
      {view === "day" && <WeekStrip selected={selected} onSelect={setSelected} tasksByDate={tasksByDate} sessions={state.sessions} reviewCount={reviewCount} mini />}

      {/* Day summary */}
      <DaySummary date={selected} tasks={dayTasks} studied={minutesOnDate(state.sessions, selected)} reviews={reviewCount(selected)} onReviews={() => nav.go("reviews")} />

      <div className="flex flex-col gap-2 mt-3">
        {dayTasks.length === 0 ? (
          <Card className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">
            برای این روز مبحثی برنامه‌ریزی نشده.
          </Card>
        ) : (
          dayTasks.map((t) => <TaskRow key={t.id} task={t} onStart={onStart} compact />)
        )}
      </div>

      <button
        type="button"
        onClick={() => (state.topics.length === 0 ? nav.go("plan", { planSub: "subjects" }) : setAddOpen(true))}
        className="fixed bottom-24 left-5 z-30 w-14 h-14 rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/40 flex items-center justify-center hover:bg-teal-700 active:scale-95 transition"
        title="افزودن مبحث به این روز"
      >
        <PlusIcon />
      </button>

      <AddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        date={selected}
        topics={state.topics}
        subjectName={(id) => subjectById.get(id)?.name ?? ""}
        onAdd={(topicId, minutes) => {
          addTask(topicId, selected, minutes);
          setAddOpen(false);
          toast(`«${topicById.get(topicId)?.name}» به برنامه اضافه شد`, "✅");
        }}
      />
    </div>
  );
}

function DaySummary({ date, tasks, studied, reviews, onReviews }: { date: string; tasks: StudyTask[]; studied: number; reviews: number; onReviews: () => void }) {
  const planned = tasks.filter((t) => t.status !== "skipped").reduce((s, t) => s + t.plannedMinutes, 0);
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <div className="grid grid-cols-3 gap-2 mt-4">
      <Card className="p-3 text-center">
        <div className="text-[11px] text-slate-500 dark:text-slate-400">برنامه</div>
        <div className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-0.5">{planned ? formatHoursCompact(planned) : "—"}</div>
        <div className="text-[10px] text-slate-400">{toFa(done)}/{toFa(tasks.length)} مبحث</div>
      </Card>
      <Card className="p-3 text-center">
        <div className="text-[11px] text-slate-500 dark:text-slate-400">مطالعه‌شده</div>
        <div className="font-bold text-teal-600 dark:text-teal-400 text-sm mt-0.5">{studied ? formatHoursCompact(studied) : "—"}</div>
        <div className="text-[10px] text-slate-400">{date === todayKey() ? "امروز" : relativeDayLabel(date)}</div>
      </Card>
      <Card className="p-3 text-center" onClick={onReviews}>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">مرورها</div>
        <div className="font-bold text-violet-600 dark:text-violet-400 text-sm mt-0.5">{toFa(reviews)}</div>
        <div className="text-[10px] text-slate-400">مشاهده ←</div>
      </Card>
    </div>
  );
}

function DayCell({ date, selected, onSelect, tasks, studied, reviews, mini }: { date: string; selected: boolean; onSelect: () => void; tasks: StudyTask[]; studied: number; reviews: number; mini?: boolean }) {
  const isToday = date === todayKey();
  const planned = tasks.reduce((s, t) => s + t.plannedMinutes, 0);
  const pct = planned ? Math.min(100, (studied / planned) * 100) : 0;
  const { jd } = keyToJalali(date);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center rounded-2xl border transition-colors py-2 gap-1",
        selected ? "bg-teal-600 border-teal-600 text-white" : "bg-white dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/60 text-slate-700 dark:text-slate-200",
        isToday && !selected && "border-teal-500",
      )}
    >
      <span className={cn("text-[10px]", selected ? "text-teal-100" : "text-slate-400")}>{WEEKDAYS_SHORT_FA[weekdayOf(date)]}</span>
      <span className="text-sm font-bold">{toFa(jd)}</span>
      {!mini && <span className={cn("text-[9px]", selected ? "text-teal-100" : "text-slate-400")}>{planned ? formatHoursCompact(planned) : "·"}</span>}
      <div className="flex items-center gap-0.5 h-2">
        {tasks.length > 0 && <span className={cn("w-1.5 h-1.5 rounded-full", pct >= 100 ? "bg-emerald-400" : selected ? "bg-white/80" : "bg-teal-500")} />}
        {reviews > 0 && <span className={cn("w-1.5 h-1.5 rounded-full", selected ? "bg-violet-200" : "bg-violet-500")} />}
      </div>
    </button>
  );
}

function WeekStrip({ selected, onSelect, tasksByDate, sessions, reviewCount, mini }: { selected: string; onSelect: (d: string) => void; tasksByDate: Map<string, StudyTask[]>; sessions: { date: string; durationMinutes: number }[]; reviewCount: (d: string) => number; mini?: boolean }) {
  const dates = weekDates(selected);
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {dates.map((d) => (
        <DayCell key={d} date={d} selected={d === selected} onSelect={() => onSelect(d)} tasks={tasksByDate.get(d) ?? []} studied={sessions.filter((s) => s.date === d).reduce((a, s) => a + s.durationMinutes, 0)} reviews={reviewCount(d)} mini={mini} />
      ))}
    </div>
  );
}

function MonthGrid({ selected, onSelect, tasksByDate, sessions, reviewCount, examDates }: { selected: string; onSelect: (d: string) => void; tasksByDate: Map<string, StudyTask[]>; sessions: { date: string; durationMinutes: number }[]; reviewCount: (d: string) => number; examDates?: Set<string> }) {
  const { jy, jm } = keyToJalali(selected);
  const len = jalaliMonthLength(jy, jm);
  const first = jalaliToKey(jy, jm, 1);
  const firstWd = weekdayOf(first);
  const leading = WEEK_ORDER.indexOf(firstWd);
  const cells: (string | null)[] = [...Array<null>(leading).fill(null), ...Array.from({ length: len }, (_, i) => jalaliToKey(jy, jm, i + 1))];
  const today = todayKey();
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK_ORDER.map((wd) => (
          <div key={wd} className="text-center text-[10px] text-slate-400 py-1">
            {WEEKDAYS_SHORT_FA[wd]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const tasks = tasksByDate.get(d) ?? [];
          const planned = plannedMinutesOnDate(tasks, d);
          const studied = sessions.filter((s) => s.date === d).reduce((a, s) => a + s.durationMinutes, 0);
          const pct = planned ? Math.min(100, (studied / planned) * 100) : 0;
          const rv = reviewCount(d);
          const isSel = d === selected;
          const hasExam = examDates?.has(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                "aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs border transition-colors",
                isSel ? "bg-teal-600 text-white border-teal-600" : "bg-white dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/60 text-slate-700 dark:text-slate-200",
                d === today && !isSel && "border-teal-500 font-bold",
              )}
            >
              <span>{toFa(keyToJalali(d).jd)}</span>
              <div className="flex gap-0.5 h-1.5">
                {tasks.length > 0 && <span className={cn("w-1.5 h-1.5 rounded-full", pct >= 100 ? "bg-emerald-400" : isSel ? "bg-white/80" : "bg-teal-500")} />}
                {rv > 0 && <span className={cn("w-1.5 h-1.5 rounded-full", isSel ? "bg-violet-200" : "bg-violet-500")} />}
                {hasExam && <span className={cn("w-1.5 h-1.5 rounded-full", isSel ? "bg-rose-200" : "bg-rose-500")} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddTaskModal({ open, onClose, date, topics, subjectName, onAdd }: { open: boolean; onClose: () => void; date: string; topics: { id: string; name: string; subjectId: string; estimatedMinutes: number; status: string }[]; subjectName: (id: string) => string; onAdd: (topicId: string, minutes: number) => void }) {
  const [topicId, setTopicId] = useState("");
  const [minutes, setMinutes] = useState(45);
  const [query, setQuery] = useState("");
  const list = topics.filter((t) => t.status !== "mastered" && (t.name.includes(query) || subjectName(t.subjectId).includes(query)));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`افزودن مبحث به ${formatJalaliLong(date)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button disabled={!topicId || minutes <= 0} onClick={() => onAdd(topicId, minutes)}>
            افزودن
          </Button>
        </>
      }
    >
      <Field label="جستجوی مبحث">
        <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="نام مبحث یا درس…" />
      </Field>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 mb-4">
        {list.length === 0 && <div className="text-xs text-slate-400 text-center py-4">مبحثی یافت نشد</div>}
        {list.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTopicId(t.id);
              setMinutes(Math.min(t.estimatedMinutes, 120));
            }}
            className={cn("w-full text-right px-3 py-2.5 text-sm flex items-center justify-between", topicId === t.id ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300" : "text-slate-700 dark:text-slate-200")}
          >
            <span>
              {t.name} <span className="text-[11px] text-slate-400">· {subjectName(t.subjectId)}</span>
            </span>
            <span className="text-[11px] text-slate-400">{formatHoursCompact(t.estimatedMinutes)}</span>
          </button>
        ))}
      </div>
      <Field label="مدت برنامه‌ریزی‌شده (دقیقه)">
        <input type="number" min={5} step={5} className={inputClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
      </Field>
    </Modal>
  );
}
