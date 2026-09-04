import { useState } from "react";
import { useLookups, useStore } from "../store";
import { PRIORITY_LABEL, RATING_LABEL, type Rating, type StudyTask } from "../types";
import { JALALI_MONTHS, addDays, formatHoursCompact, jalaliMonthLength, jalaliToKey, keyToJalali, relativeDayLabel, toFa, todayKey } from "../lib/jalali";
import { Button, CheckIcon, ChevronIcon, Field, Modal, MoreIcon, PlayIcon, PriorityDot, TrashIcon, inputClass } from "./ui";
import { cn } from "../utils/cn";

// ===== Jalali date picker (3 selects) =====
export function JalaliDatePicker({ value, onChange, min }: { value: string; onChange: (key: string) => void; min?: string }) {
  const { jy, jm, jd } = keyToJalali(value);
  const years = Array.from({ length: 4 }, (_, i) => jy - 1 + i);
  const days = Array.from({ length: jalaliMonthLength(jy, jm) }, (_, i) => i + 1);
  const set = (y: number, m: number, d: number) => {
    const dd = Math.min(d, jalaliMonthLength(y, m));
    const key = jalaliToKey(y, m, dd);
    onChange(min && key < min ? min : key);
  };
  const sel = cn(inputClass, "px-2 text-center appearance-none");
  return (
    <div className="grid grid-cols-3 gap-2" dir="rtl">
      <select className={sel} value={jy} onChange={(e) => set(Number(e.target.value), jm, jd)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {toFa(y)}
          </option>
        ))}
      </select>
      <select className={sel} value={jm} onChange={(e) => set(jy, Number(e.target.value), jd)}>
        {JALALI_MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select className={sel} value={jd} onChange={(e) => set(jy, jm, Number(e.target.value))}>
        {days.map((d) => (
          <option key={d} value={d}>
            {toFa(d)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ===== Task row =====
export function TaskRow({ task, onStart, compact }: { task: StudyTask; onStart?: (task: StudyTask) => void; compact?: boolean }) {
  const { completeTask, deleteTask, moveTask, updateTask } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const [menu, setMenu] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState(task.date < todayKey() ? todayKey() : addDays(task.date, 1));
  const topic = topicById.get(task.topicId);
  const subject = subjectOfTopic(task.topicId);
  if (!topic || !subject) return null;
  const done = task.status === "done";
  const progress = Math.min(100, Math.round((task.doneMinutes / task.plannedMinutes) * 100));

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border bg-white dark:bg-slate-800/80 p-3 transition-colors",
        done ? "border-emerald-200/60 dark:border-emerald-800/40 opacity-70" : "border-slate-200/70 dark:border-slate-700/60",
      )}
    >
      <button
        type="button"
        onClick={() => (done ? updateTask(task.id, { status: "pending" }) : completeTask(task.id))}
        className={cn(
          "w-7 h-7 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
          done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-500 hover:border-teal-500",
        )}
        title={done ? "بازگردانی" : "تکمیل"}
      >
        {done && <CheckIcon size={14} />}
      </button>
      <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium" style={{ color: subject.color }}>
            {subject.name}
          </span>
          <PriorityDot priority={task.priority} />
          {!compact && <span className="text-[10px] text-slate-400">اولویت {PRIORITY_LABEL[task.priority]}</span>}
        </div>
        <div className={cn("font-semibold text-sm text-slate-800 dark:text-slate-100 truncate", done && "line-through")}>{topic.name}</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          <span>⏱ {formatHoursCompact(task.plannedMinutes)}</span>
          {task.doneMinutes > 0 && !done && <span className="text-teal-600 dark:text-teal-400">• {toFa(progress)}٪ انجام شده</span>}
          {done && <span className="text-emerald-600 dark:text-emerald-400">• انجام شد</span>}
          {task.date !== todayKey() && <span>• {relativeDayLabel(task.date)}</span>}
        </div>
      </div>
      {!done && onStart && (
        <button
          type="button"
          onClick={() => onStart(task)}
          className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm shadow-teal-600/30 hover:bg-teal-700 shrink-0"
          title="شروع مطالعه"
        >
          <PlayIcon size={18} />
        </button>
      )}
      <button type="button" onClick={() => setMenu((m) => !m)} className="w-8 h-8 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center shrink-0">
        <MoreIcon />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
          <div className="absolute left-2 top-12 z-30 w-44 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl py-1 text-sm animate-fade">
            <MenuItem
              onClick={() => {
                setMenu(false);
                setMoveOpen(true);
              }}
            >
              <ChevronIcon /> جابه‌جایی به روز دیگر
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(false);
                moveTask(task.id, addDays(task.date < todayKey() ? todayKey() : task.date, 1));
              }}
            >
              ⏭ انتقال به فردا
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(false);
                deleteTask(task.id);
              }}
              danger
            >
              <TrashIcon /> حذف
            </MenuItem>
          </div>
        </>
      )}
      <Modal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="جابه‌جایی مبحث"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(false)}>
              انصراف
            </Button>
            <Button
              onClick={() => {
                moveTask(task.id, moveDate);
                setMoveOpen(false);
              }}
            >
              جابه‌جا کن
            </Button>
          </>
        }
      >
        <Field label="تاریخ جدید">
          <JalaliDatePicker value={moveDate} onChange={setMoveDate} />
        </Field>
      </Modal>
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-slate-50 dark:hover:bg-slate-700/60",
        danger ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

// ===== Rating picker =====
const RATING_STYLES: Record<Rating, string> = {
  3: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700",
  2: "border-teal-300 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700",
  1: "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  0: "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700",
};
const RATING_ICONS: Record<Rating, string> = { 3: "🎯", 2: "👍", 1: "🔁", 0: "😕" };

export function RatingPicker({ onPick }: { onPick: (r: Rating) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {([3, 2, 1, 0] as Rating[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onPick(r)}
          className={cn("flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-transform active:scale-[0.98]", RATING_STYLES[r])}
        >
          <span className="text-xl">{RATING_ICONS[r]}</span>
          {RATING_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

export function SubjectBadge({ subjectId }: { subjectId: string }) {
  const { subjectById } = useLookups();
  const s = subjectById.get(subjectId);
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: s.color }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
      {s.name}
    </span>
  );
}
