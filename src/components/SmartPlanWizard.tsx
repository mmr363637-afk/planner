import { useMemo, useState } from "react";
import { useStore, type CreateSmartPlanInput } from "../store";
import { Button, Card, Chip, Field, Modal, inputClass } from "./ui";
import { JalaliDatePicker } from "./shared";
import { WEEKDAYS_FA, WEEK_ORDER, addDays, diffDays, formatHoursCompact, formatJalaliNumeric, formatMinutes, toFa, todayKey } from "../lib/jalali";
import { leafTopics } from "../lib/topics";
import { APPROACH_DESC, APPROACH_LABEL, TASK_KIND_ICON, TASK_KIND_LABEL, type StudyApproach, type TaskKind } from "../types";
import { cn } from "../utils/cn";

const APPROACHES: StudyApproach[] = ["qbank", "notes", "reference", "mixed"];
const APPROACH_ICON: Record<StudyApproach, string> = { qbank: "🧪", notes: "📝", reference: "📚", mixed: "🎯" };

/**
 * ویزارد «برنامه‌ی هوشمند» — کاربر فقط هدف/امتحان/ساعت را می‌گوید،
 * موتور smartPlan بقیه را می‌چیند: فازهای مدل هر درس، مرور خودکار، جمع‌بندی و توضیح «چرا».
 */
export default function SmartPlanWizard({ onClose }: { onClose: () => void }) {
  const { state, previewSmartPlan, createSmartPlan, toast } = useStore();
  const today = todayKey();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("");
  const [examId, setExamId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 29));
  const [dailyMinutes, setDailyMinutes] = useState(240);
  const [studyDays, setStudyDays] = useState<number[]>([6, 0, 1, 2, 3, 4]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [approaches, setApproaches] = useState<Record<string, StudyApproach>>({});

  const upcomingExams = useMemo(() => state.exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)), [state.exams, today]);
  const examDate = examId ? upcomingExams.find((e) => e.id === examId)?.date : undefined;

  const approachOf = (subjectId: string): StudyApproach =>
    approaches[subjectId] ?? state.subjects.find((s) => s.id === subjectId)?.approach ?? "mixed";

  const topicIds = useMemo(
    () => leafTopics(state.topics).filter((t) => selectedSubjects.includes(t.subjectId) && t.status !== "mastered").map((t) => t.id),
    [state.topics, selectedSubjects],
  );

  const toggleSubject = (id: string) =>
    setSelectedSubjects((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const input: CreateSmartPlanInput = {
    goal: goal.trim(), startDate, endDate, examDate, topicIds, studyDays, dailyMinutes,
    approaches: Object.fromEntries(selectedSubjects.map((sid) => [sid, approachOf(sid)])),
    bufferDays: null,
  };

  const preview = useMemo(
    () => (step === 2 ? previewSmartPlan(input) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, goal, examId, startDate, endDate, dailyMinutes, studyDays, selectedSubjects, approaches],
  );

  const canNext = [
    goal.trim().length > 0 && diffDays(startDate, endDate) >= 0 && dailyMinutes > 0 && studyDays.length > 0,
    selectedSubjects.length > 0 && topicIds.length > 0,
    true,
  ][step];

  const steps = ["هدف و امتحان", "درس‌ها و مدل", "پیش‌نمایش هوشمند"];

  const previewByDate = useMemo(() => {
    if (!preview) return [];
    const map = new Map<string, typeof preview.tasks>();
    for (const t of preview.tasks) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [preview]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`✨ برنامه هوشمند · ${steps[step]}`}
      footer={
        <>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>قبلی</Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>انصراف</Button>
          )}
          {step < 2 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>بعدی</Button>
          ) : (
            <Button
              disabled={!preview || preview.tasks.length === 0}
              onClick={() => {
                createSmartPlan(input);
                toast("برنامه هوشمند ساخته شد ✨", "🧠");
                onClose();
              }}
            >
              ✨ ساخت برنامه هوشمند
            </Button>
          )}
        </>
      }
    >
      <div className="flex gap-1 mb-5">
        {steps.map((_, i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-teal-500" : "bg-slate-200 dark:bg-slate-700")} />
        ))}
      </div>

      {step === 0 && (
        <>
          <Field label="هدف">
            <input autoFocus className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="مثلاً جمع‌بندی قلب برای امتحان ارتقا" />
          </Field>
          <Field label="امتحان هدف (اختیاری)" hint="اگر امتحان را انتخاب کنی، برنامه از روز قبلش به عقب چیده می‌شود">
            <select
              className={inputClass}
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                const ex = upcomingExams.find((x) => x.id === e.target.value);
                if (ex) {
                  const before = addDays(ex.date, -1);
                  setEndDate(before);
                  if (startDate > before) setStartDate(today > before ? before : today);
                }
              }}
            >
              <option value="">بدون امتحان خاص (برنامه آزاد)</option>
              {upcomingExams.map((e) => (
                <option key={e.id} value={e.id}>📝 {e.title} · {formatJalaliNumeric(e.date)}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="شروع">
              <JalaliDatePicker value={startDate} onChange={(d) => { setStartDate(d); if (endDate < d) setEndDate(d); }} />
            </Field>
            <Field label={`پایان · ${toFa(diffDays(startDate, endDate) + 1)} روز`}>
              <JalaliDatePicker value={endDate} onChange={setEndDate} min={startDate} />
            </Field>
          </div>
          <Field label="ساعت مطالعه روزانه" hint={formatMinutes(dailyMinutes)}>
            <input type="range" min={30} max={720} step={15} value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} className="w-full accent-teal-600" />
          </Field>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">روزهای مطالعه</div>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK_ORDER.map((wd) => {
              const on = studyDays.includes(wd);
              return (
                <button key={wd} type="button" onClick={() => setStudyDays((d) => (on ? d.filter((x) => x !== wd) : [...d, wd]))} className={cn("py-2 rounded-xl text-[11px] font-medium border transition-colors", on ? "bg-teal-600 border-teal-600 text-white" : "border-slate-200 dark:border-slate-600 text-slate-500")}>
                  {WEEKDAYS_FA[wd].slice(0, 1)}
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">کدام درس‌ها؟ (مدل هر درس را هم بگو)</div>
          {state.subjects.length === 0 && <Card className="text-sm text-slate-500">هنوز درسی نداری؛ اول از «برنامه ← دروس» درس بساز.</Card>}
          <div className="flex flex-col gap-2">
            {state.subjects.map((s) => {
              const on = selectedSubjects.includes(s.id);
              const count = leafTopics(state.topics).filter((t) => t.subjectId === s.id && t.status !== "mastered").length;
              return (
                <div key={s.id} className={cn("rounded-xl border-2 p-3 transition-colors", on ? "border-teal-500 bg-teal-50/50 dark:bg-teal-900/10" : "border-slate-200 dark:border-slate-700")}>
                  <button type="button" onClick={() => toggleSubject(s.id)} className="w-full flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="flex-1 text-right text-sm font-bold text-slate-700 dark:text-slate-200">{s.name}</span>
                    <span className="text-[11px] text-slate-400">{toFa(count)} مبحث</span>
                    <span className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center text-[12px]", on ? "bg-teal-500 border-teal-500 text-white" : "border-slate-300 dark:border-slate-600")}>{on ? "✓" : ""}</span>
                  </button>
                  {on && (
                    <div className="grid grid-cols-2 gap-1.5 mt-2.5">
                      {APPROACHES.map((a) => {
                        const active = approachOf(s.id) === a;
                        return (
                          <button
                            key={a}
                            type="button"
                            title={APPROACH_DESC[a]}
                            onClick={() => setApproaches((cur) => ({ ...cur, [s.id]: a }))}
                            className={cn("text-[11px] py-1.5 px-2 rounded-lg border font-medium transition-colors", active ? "bg-teal-600 border-teal-600 text-white" : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400")}
                          >
                            {APPROACH_ICON[a]} {APPROACH_LABEL[a]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {selectedSubjects.length > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-3">مجموع: {toFa(topicIds.length)} مبحث برای برنامه‌ریزی</div>
          )}
        </>
      )}

      {step === 2 && preview && (
        <>
          {preview.tasks.length === 0 ? (
            <Card className="text-sm text-rose-600">{preview.warnings[0] ?? "برنامه‌ای ساخته نشد؛ ورودی‌ها را بررسی کن."}</Card>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                {[
                  { v: toFa(preview.dates.length), l: "روز" },
                  { v: toFa(preview.bufferDates.length), l: "جمع‌بندی" },
                  { v: toFa(preview.tasks.length), l: "تسک" },
                  { v: formatHoursCompact(preview.tasks.reduce((s, t) => s + t.plannedMinutes, 0)), l: "مجموع" },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl bg-slate-50 dark:bg-slate-900/50 py-2 px-1">
                    <div className="font-extrabold text-teal-600 dark:text-teal-400 text-sm">{s.v}</div>
                    <div className="text-[10px] text-slate-400">{s.l}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {(Object.keys(preview.minutesByKind) as TaskKind[]).map((k) => (
                  preview.minutesByKind[k] > 0 && (
                    <Chip key={k}>{TASK_KIND_ICON[k]} {TASK_KIND_LABEL[k]} · {formatHoursCompact(preview.minutesByKind[k])}</Chip>
                  )
                ))}
              </div>

              {preview.warnings.map((w) => (
                <Card key={w} className="text-xs mb-2 bg-amber-50 dark:bg-amber-900/20 border-amber-200 leading-relaxed">{w}</Card>
              ))}

              <Card className="mb-3 bg-teal-50/60 dark:bg-teal-900/10 border-teal-200/60">
                <div className="text-xs font-bold text-teal-700 dark:text-teal-300 mb-1.5">🧠 چرا این‌طور چیده شد؟</div>
                <ul className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed flex flex-col gap-1">
                  {preview.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </Card>

              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {previewByDate.map(([d, dayTasks]) => {
                  const isBuffer = preview.bufferDates.includes(d);
                  return (
                    <div key={d} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 flex justify-between">
                        <span>{isBuffer ? "📦 " : ""}{formatJalaliNumeric(d)}</span>
                        <span className="text-slate-400 font-normal">{formatHoursCompact(dayTasks.reduce((s, t) => s + t.plannedMinutes, 0))}</span>
                      </div>
                      {dayTasks.map((t) => (
                        <div key={t.id} className="flex justify-between items-center text-[12px] text-slate-600 dark:text-slate-300 py-0.5 gap-2">
                          <span className="truncate">{TASK_KIND_ICON[t.kind ?? "learn"]} {state.topics.find((x) => x.id === t.topicId)?.name} <span className="text-slate-400">· {t.label}</span></span>
                          <span className="text-slate-400 shrink-0">{formatHoursCompact(t.plannedMinutes)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
