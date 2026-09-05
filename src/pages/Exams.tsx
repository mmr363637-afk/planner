import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card, ChevronIcon, ConfirmDialog, Field, IconButton, Modal, PlusIcon, SectionTitle, TrashIcon, inputClass } from "../components/ui";
import { ExamCountdownCard, ExamTimeChip, JalaliDatePicker, useTick } from "../components/shared";
import {
  JALALI_MONTHS,
  WEEKDAYS_SHORT_FA,
  WEEK_ORDER,
  diffDays,
  formatJalaliLong,
  jalaliMonthLength,
  jalaliToKey,
  keyToJalali,
  toFa,
  todayKey,
  weekdayOf,
} from "../lib/jalali";
import { compareExams, countdownOf, formatCountdown, hasExamTime, nextExam } from "../lib/exam";
import { cn } from "../utils/cn";
import type { Exam } from "../types";

const EXAM_COLORS = ["#ef4444", "#f97316", "#8b5cf6", "#0ea5a4", "#2563eb", "#db2777"];
/** ساعت‌های پرکاربرد برای ثبت سریع (تایپ کردن روی موبایل سخت است) */
const QUICK_TIMES = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];

type Tone = "rose" | "amber" | "slate";
function examCountdown(date: string, today: string): { label: string; tone: Tone; past: boolean } {
  const d = diffDays(today, date);
  if (d === 0) return { label: "امروز", tone: "rose", past: false };
  if (d === 1) return { label: "فردا", tone: "amber", past: false };
  if (d > 1) return { label: `${toFa(d)} روز دیگر`, tone: d <= 3 ? "amber" : "slate", past: false };
  return { label: `${toFa(-d)} روز پیش`, tone: "slate", past: true };
}
const TONE_CLASS: Record<Tone, string> = {
  rose: "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300",
  amber: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300",
  slate: "bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300",
};

export default function ExamsPage() {
  const { state, addExam, updateExam, deleteExam, toast } = useStore();
  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [creating, setCreating] = useState(false);
  const [delOpen, setDelOpen] = useState<Exam | null>(null);
  const timerEnabled = state.settings.examTimer.enabled;
  // برای زنده نگه‌داشتن «مانده تا امتحان» در ردیف‌ها (هر ۳۰ ثانیه کافی است)
  const now = useTick(timerEnabled, 30_000);

  const examsByDate = useMemo(() => {
    const m = new Map<string, Exam[]>();
    for (const e of state.exams) {
      const l = m.get(e.date) ?? [];
      l.push(e);
      m.set(e.date, l);
    }
    for (const l of m.values()) l.sort(compareExams); // روزهای یکسان بر اساس ساعت
    return m;
  }, [state.exams]);

  const upcoming = useMemo(() => state.exams.filter((e) => e.date >= today).sort(compareExams), [state.exams, today]);
  const past = useMemo(() => state.exams.filter((e) => e.date < today).sort((a, b) => compareExams(b, a)), [state.exams, today]);
  const next = useMemo(() => nextExam(state.exams, now), [state.exams, now]);

  const shiftMonth = (dir: 1 | -1) => {
    const { jy, jm } = keyToJalali(selected);
    const nm = jm + dir;
    const y = nm < 1 ? jy - 1 : nm > 12 ? jy + 1 : jy;
    const m = nm < 1 ? 12 : nm > 12 ? 1 : nm;
    setSelected(jalaliToKey(y, m, 1));
  };

  const selectedExams = examsByDate.get(selected) ?? [];

  const openAdd = () => {
    const blank: Exam = {
      id: "",
      title: "",
      date: selected,
      createdAt: 0,
      color: EXAM_COLORS[0],
    };
    setEditing(blank);
    setCreating(true);
  };

  const saveExam = (data: { title: string; date: string; time?: string; subject?: string; note?: string; color?: string }) => {
    if (!data.title.trim()) {
      toast("نام امتحان را وارد کن", "⚠️");
      return;
    }
    const payload = {
      title: data.title.trim(),
      date: data.date,
      time: data.time?.trim() || undefined,
      subject: data.subject?.trim() || undefined,
      note: data.note?.trim() || undefined,
      color: data.color,
    };
    if (creating) {
      addExam(payload);
      toast(payload.time ? `امتحان «${payload.title}» ساعت ${toFa(payload.time)} ثبت شد` : `امتحان «${payload.title}» ثبت شد`, "✅");
    } else if (editing && editing.id) {
      updateExam(editing.id, payload);
      toast("امتحان ویرایش شد", "✅");
    }
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="pb-24">
      {timerEnabled && next && <ExamCountdownCard exam={next} />}

      <div className="flex items-center justify-between mb-3">
        <IconButton onClick={() => shiftMonth(-1)} title="ماه قبل">
          <ChevronIcon dir="right" />
        </IconButton>
        <button type="button" onClick={() => setSelected(today)} className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {JALALI_MONTHS[keyToJalali(selected).jm - 1]} {toFa(keyToJalali(selected).jy)}
        </button>
        <IconButton onClick={() => shiftMonth(1)} title="ماه بعد">
          <ChevronIcon dir="left" />
        </IconButton>
      </div>

      <MonthGrid selected={selected} onSelect={setSelected} examsByDate={examsByDate} />

      {/* Selected day panel */}
      <div className="mt-3">
        {selectedExams.length === 0 ? (
          <Card className="text-center py-4 text-sm text-slate-500 dark:text-slate-400">
            برای {formatJalaliLong(selected)} امتحانی ثبت نشده است.
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedExams.map((e) => (
              <ExamRow key={e.id} exam={e} today={today} now={now} onEdit={() => { setCreating(false); setEditing(e); }} onDelete={() => setDelOpen(e)} />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={openAdd}
          className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-400 text-teal-600 dark:text-teal-400 py-3 text-sm font-medium hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
        >
          <PlusIcon /> افزودن امتحان در {formatJalaliLong(selected, false)}
        </button>
      </div>

      {/* Upcoming list */}
      <SectionTitle>امتحانات پیش‌رو</SectionTitle>
      {upcoming.length === 0 ? (
        <Card className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">
          هنوز امتحانی ثبت نشده. روی یک روز در تقویم بزن و امتحانت را علامت بزن.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {upcoming.slice(0, 8).map((e) => (
            <ExamRow key={e.id} exam={e} today={today} now={now} onEdit={() => { setCreating(false); setEditing(e); }} onDelete={() => setDelOpen(e)} />
          ))}
        </div>
      )}

      {/* Past list */}
      {past.length > 0 && (
        <>
          <SectionTitle>امتحانات گذشته</SectionTitle>
          <div className="flex flex-col gap-2 opacity-75">
            {past.slice(0, 5).map((e) => (
              <ExamRow key={e.id} exam={e} today={today} now={now} onEdit={() => { setCreating(false); setEditing(e); }} onDelete={() => setDelOpen(e)} />
            ))}
          </div>
        </>
      )}

      <ExamModal
        open={editing !== null}
        exam={editing}
        creating={creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={saveExam}
      />

      <ConfirmDialog
        open={delOpen !== null}
        onClose={() => setDelOpen(null)}
        title="حذف امتحان"
        message={`امتحان «${delOpen?.title}» حذف شود؟`}
        confirmLabel="حذف"
        danger
        onConfirm={() => {
          if (delOpen) {
            deleteExam(delOpen.id);
            toast("امتحان حذف شد", "🗑");
          }
          setDelOpen(null);
        }}
      />
    </div>
  );
}

function ExamRow({ exam, today, now, onEdit, onDelete }: { exam: Exam; today: string; now: number; onEdit: () => void; onDelete: () => void }) {
  const { state } = useStore();
  const c = examCountdown(exam.date, today);
  const color = exam.color ?? "#ef4444";
  const timerEnabled = state.settings.examTimer.enabled;
  const precise = hasExamTime(exam);
  const cd = countdownOf(exam, now);
  const liveLeft = timerEnabled && !c.past && precise && !cd.started;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-3">
      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
      <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-right">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{exam.title}</span>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0", TONE_CLASS[c.tone])}>{c.label}</span>
          <ExamTimeChip exam={exam} />
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{formatJalaliLong(exam.date)}</span>
          {exam.subject && <span>• {exam.subject}</span>}
          {liveLeft && <span className="text-rose-500 dark:text-rose-400 font-medium">• {formatCountdown(cd)} مانده</span>}
          {timerEnabled && precise && cd.started && !c.past && <span className="text-emerald-600 dark:text-emerald-400 font-medium">• شروع شد</span>}
        </div>
        {exam.note && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{exam.note}</div>}
      </button>
      <button type="button" onClick={onDelete} className="w-8 h-8 rounded-full text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center justify-center shrink-0" title="حذف">
        <TrashIcon />
      </button>
    </div>
  );
}

function MonthGrid({ selected, onSelect, examsByDate }: { selected: string; onSelect: (d: string) => void; examsByDate: Map<string, Exam[]> }) {
  const { jy, jm } = keyToJalali(selected);
  const len = jalaliMonthLength(jy, jm);
  const first = jalaliToKey(jy, jm, 1);
  const leading = WEEK_ORDER.indexOf(weekdayOf(first));
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
          const isSel = d === selected;
          const isToday = d === today;
          const exams = examsByDate.get(d) ?? [];
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                "aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-xs border transition-colors",
                isSel ? "bg-teal-600 text-white border-teal-600" : "bg-white dark:bg-slate-800/80 border-slate-200/70 dark:border-slate-700/60 text-slate-700 dark:text-slate-200",
                isToday && !isSel && "border-teal-500 font-bold",
              )}
            >
              <span>{toFa(keyToJalali(d).jd)}</span>
              {exams.length > 0 && (
                <div className="flex gap-0.5 h-1.5 items-center">
                  {exams.slice(0, 3).map((e) => (
                    <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSel ? "#ffffff" : e.color ?? "#ef4444" }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExamModal({
  open,
  exam,
  creating,
  onClose,
  onSave,
}: {
  open: boolean;
  exam: Exam | null;
  creating: boolean;
  onClose: () => void;
  onSave: (data: { title: string; date: string; time?: string; subject?: string; note?: string; color?: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState("");
  const [color, setColor] = useState(EXAM_COLORS[0]);

  // Reset form whenever the modal is (re)opened with a different exam.
  useEffect(() => {
    if (!open || !exam) return;
    setTitle(exam.title);
    setSubject(exam.subject ?? "");
    setNote(exam.note ?? "");
    setDate(exam.date);
    setTime(exam.time ?? "");
    setColor(exam.color ?? EXAM_COLORS[0]);
  }, [open, exam]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? "افزودن امتحان" : "ویرایش امتحان"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            onClick={() =>
              onSave({ title, date, time, subject, note, color })
            }
          >
            {creating ? "افزودن" : "ذخیره"}
          </Button>
        </>
      }
    >
      <Field label="نام امتحان">
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً فیزیولوژی" autoFocus />
      </Field>
      <Field label="درس / واحد (اختیاری)">
        <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثلاً درس مربوطه" />
      </Field>
      <Field label="تاریخ امتحان">
        <JalaliDatePicker value={date} onChange={setDate} />
      </Field>
      <Field
        label="ساعت امتحان (اختیاری)"
        hint={time ? "تایمر صفحه اصلی تا همین ساعت می‌شمارد." : "بدون ساعت، شمارش معکوس تا ابتدای همان روز است."}
      >
        <div className="flex items-center gap-2">
          <input type="time" className={cn(inputClass, "w-32 shrink-0")} value={time} onChange={(e) => setTime(e.target.value)} />
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK_TIMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTime(t)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-lg border transition-colors tabular-nums",
                  time === t
                    ? "border-teal-500 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-bold"
                    : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400",
                )}
              >
                {toFa(t)}
              </button>
            ))}
            {time && (
              <button type="button" onClick={() => setTime("")} className="text-[11px] px-2 py-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                حذف ساعت
              </button>
            )}
          </div>
        </div>
      </Field>
      <Field label="رنگ نشانگر">
        <div className="flex items-center gap-2">
          {EXAM_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn("w-7 h-7 rounded-full border-2 transition-transform", color === c ? "border-slate-800 dark:border-slate-100 scale-110" : "border-transparent")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </Field>
      <Field label="یادداشت (اختیاری)">
        <textarea className={inputClass + " resize-none h-20"} value={note} onChange={(e) => setNote(e.target.value)} placeholder="نکته یا محل برگزاری…" />
      </Field>
    </Modal>
  );
}
