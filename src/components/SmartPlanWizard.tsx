import { useMemo, useState } from "react";
import { useStore, type CreateSmartPlanInput } from "../store";
import { Button, Card, Chip, Field, Modal, inputClass } from "./ui";
import { JalaliDatePicker } from "./shared";
import { WEEKDAYS_FA, WEEK_ORDER, addDays, diffDays, formatHoursCompact, formatJalaliLong, formatJalaliNumeric, formatMinutes, toFa, todayKey } from "../lib/jalali";
import { leafTopics } from "../lib/topics";
import { APPROACH_DESC, APPROACH_LABEL, TASK_KIND_ICON, TASK_KIND_LABEL, type StudyApproach, type TaskKind } from "../types";
import { cn } from "../utils/cn";

const APPROACHES: StudyApproach[] = ["qbank", "notes", "reference", "mixed"];
const APPROACH_ICON: Record<StudyApproach, string> = { qbank: "🧪", notes: "📝", reference: "📚", mixed: "🎯" };
type ReviewIntensity = "light" | "balanced" | "frequent";

/**
 * ویزارد «برنامه‌ی هوشمند» — هدف، دسترس‌پذیری، درس‌ها و ریتم مطالعه‌ی شخصی را می‌پرسد؛
 * موتور smartPlan با همان ورودی‌ها فازها، مرورها، جمع‌بندی و دلیل روزهای خالی را می‌چیند.
 */
export default function SmartPlanWizard({ onClose }: { onClose: () => void }) {
  const { state, previewSmartPlan, createSmartPlan, toast } = useStore();
  const today = todayKey();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("");
  const [examId, setExamId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 29));
  const [dailyMinutes, setDailyMinutes] = useState(state.settings.dailyGoalMinutes || 120);
  const [studyDays, setStudyDays] = useState<number[]>([6, 0, 1, 2, 3, 4]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [approaches, setApproaches] = useState<Record<string, StudyApproach>>({});
  const [includeHolidays, setIncludeHolidays] = useState(false);
  const [customizeDayMinutes, setCustomizeDayMinutes] = useState(false);
  const [dailyMinutesByWeekday, setDailyMinutesByWeekday] = useState<Partial<Record<number, number>>>({});
  const [maxSessionMinutes, setMaxSessionMinutes] = useState(45);
  const [maxSubjectsPerDay, setMaxSubjectsPerDay] = useState(3);
  const [reviewIntensity, setReviewIntensity] = useState<ReviewIntensity>("balanced");
  const [goldenFirst, setGoldenFirst] = useState(true);

  const upcomingExams = useMemo(() => state.exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)), [state.exams, today]);
  const examDate = examId ? upcomingExams.find((e) => e.id === examId)?.date : undefined;

  const approachOf = (subjectId: string): StudyApproach =>
    approaches[subjectId] ?? state.subjects.find((s) => s.id === subjectId)?.approach ?? "mixed";

  const topicIds = useMemo(
    () => leafTopics(state.topics).filter((t) => selectedSubjects.includes(t.subjectId) && t.status !== "mastered").map((t) => t.id),
    [state.topics, selectedSubjects],
  );

  const reviewGaps = reviewIntensity === "light"
    ? state.settings.reviewIntervals.slice(0, 1)
    : reviewIntensity === "frequent"
      ? state.settings.reviewIntervals.slice(0, 3)
      : state.settings.reviewIntervals.slice(0, 2);
  const perDayMinutes = customizeDayMinutes
    ? Object.fromEntries(studyDays.map((day) => [day, dailyMinutesByWeekday[day] ?? dailyMinutes]))
    : undefined;

  const toggleSubject = (id: string) =>
    setSelectedSubjects((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const input: CreateSmartPlanInput = {
    goal: goal.trim(), startDate, endDate, examDate, topicIds, studyDays, dailyMinutes,
    approaches: Object.fromEntries(selectedSubjects.map((sid) => [sid, approachOf(sid)])),
    bufferDays: null,
    reviewGaps,
    maxSubjectsPerDay,
    maxSessionMinutes,
    goldenFirst,
    dailyMinutesByWeekday: perDayMinutes,
    includeHolidays,
  };

  const preview = useMemo(
    () => (step === 3 ? previewSmartPlan(input) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, goal, examId, startDate, endDate, dailyMinutes, studyDays, selectedSubjects, approaches, includeHolidays, customizeDayMinutes, dailyMinutesByWeekday, maxSessionMinutes, maxSubjectsPerDay, reviewIntensity, goldenFirst],
  );

  const canNext = [
    goal.trim().length > 0 && diffDays(startDate, endDate) >= 0 && dailyMinutes > 0 && studyDays.length > 0,
    selectedSubjects.length > 0 && topicIds.length > 0,
    true,
    true,
  ][step];

  const steps = ["هدف و دسترس‌پذیری", "درس‌ها و مدل", "سبک مطالعه", "پیش‌نمایش هوشمند"];

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
          {step < 3 ? (
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
          <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
            <input type="checkbox" checked={customizeDayMinutes} onChange={(e) => setCustomizeDayMinutes(e.target.checked)} className="mt-1 accent-teal-600" />
            <span>
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">زمان آزادم در همه‌ی روزها یکسان نیست</span>
              <span className="block text-[10px] text-slate-400 mt-1 leading-relaxed">اگر بعضی روزها وقت بیشتری داری یا سرت شلوغ‌تر است، جداگانه تنظیمش کن.</span>
            </span>
          </label>
          {customizeDayMinutes && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3">
              {WEEK_ORDER.filter((wd) => studyDays.includes(wd)).map((wd) => {
                const minutes = dailyMinutesByWeekday[wd] ?? dailyMinutes;
                return (
                  <label key={wd}>
                    <span className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300">
                      <span>{WEEKDAYS_FA[wd]}</span><span>{formatMinutes(minutes)}</span>
                    </span>
                    <input type="range" min={30} max={720} step={15} value={minutes} onChange={(e) => setDailyMinutesByWeekday((current) => ({ ...current, [wd]: Number(e.target.value) }))} className="w-full accent-teal-600" />
                  </label>
                );
              })}
              <div className="text-[10px] text-slate-400">موتور، زمان کلاس‌های هفتگی را هم از ظرفیت همان روز کم می‌کند.</div>
            </div>
          )}
          <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
            <input type="checkbox" checked={includeHolidays} onChange={(e) => setIncludeHolidays(e.target.checked)} className="mt-1 accent-teal-600" />
            <span>
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">در تعطیلات رسمی هم برنامه‌ریزی کن</span>
              <span className="block text-[10px] text-slate-400 mt-1 leading-relaxed">پیش‌فرض: جمعه و تعطیلات رسمی ایران برای استراحت آزاد می‌مانند. با روشن‌کردن این گزینه، فقط تعطیلی‌هایی برنامه می‌گیرند که در روزهای مطالعه انتخاب کرده‌ای.</span>
            </span>
          </label>
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

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">چند سؤال کوتاه کمک می‌کند برنامه با ریتم یادگیری خودت هماهنگ شود؛ پاسخ‌ها در ساخت و تنظیم مجدد برنامه استفاده می‌شوند.</p>

          <Field label="معمولاً چند دقیقه می‌توانی پیوسته روی یک مبحث تمرکز کنی؟" hint="این عدد سقف هر نوبت می‌شود؛ تسک‌های کوتاه‌تر هم ممکن‌اند.">
            <div className="grid grid-cols-4 gap-1.5">
              {[25, 45, 60, 90].map((minutes) => (
                <button key={minutes} type="button" onClick={() => setMaxSessionMinutes(minutes)} className={cn("rounded-xl border py-2 text-[11px] font-medium", maxSessionMinutes === minutes ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300")}>
                  {toFa(minutes)} دقیقه
                </button>
              ))}
            </div>
          </Field>

          <Field label="در یک روز چند درس برایت قابل‌مدیریت است؟" hint="یک درس یعنی تمرکز عمیق؛ تعداد بیشتر یعنی تنوع بیشتر در روز.">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { count: 1, label: "یک درس · تمرکز" },
                { count: 2, label: "دو درس · متعادل" },
                { count: 3, label: "سه درس · متنوع" },
              ].map(({ count, label }) => (
                <button key={count} type="button" onClick={() => setMaxSubjectsPerDay(count)} className={cn("rounded-xl border px-2 py-2 text-[10px] font-medium", maxSubjectsPerDay === count ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300")}>
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="مرورهای خودکار را چقدر پرتکرار بگذارم؟" hint="فاصله‌ها از تنظیم مرور اپ استفاده می‌کنند.">
            <div className="flex flex-col gap-1.5">
              {([
                { id: "light", label: "کم · یک مرور", count: 1 },
                { id: "balanced", label: "متعادل · دو مرور", count: 2 },
                { id: "frequent", label: "بیشتر · سه مرور", count: 3 },
              ] as const).map(({ id, label, count }) => (
                <button key={id} type="button" onClick={() => setReviewIntensity(id)} className={cn("flex items-center justify-between rounded-xl border px-3 py-2 text-right text-[11px]", reviewIntensity === id ? "border-teal-600 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300")}>
                  <span>{label}</span>
                  <span className="text-[10px] opacity-70">{toFa(state.settings.reviewIntervals.slice(0, count).length)} فاصله</span>
                </button>
              ))}
            </div>
          </Field>

          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
            <input type="checkbox" checked={goldenFirst} onChange={(e) => setGoldenFirst(e.target.checked)} className="mt-1 accent-teal-600" />
            <span>
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">مبحث‌های سخت را اولِ هر روز بگذار</span>
              <span className="block text-[10px] text-slate-400 mt-1 leading-relaxed">اگر صبح یا ابتدای زمان مطالعه تمرکز بیشتری داری، این گزینه را روشن بگذار.</span>
            </span>
          </label>
        </div>
      )}

      {step === 3 && preview && (
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
                        <span>{isBuffer ? "📦 " : ""}{formatJalaliLong(d)}</span>
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
          {preview.dayReasons.length > 0 && (
            <Card className="mt-3 border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10">
              <details open={preview.tasks.length === 0}>
                <summary className="cursor-pointer text-xs font-bold text-amber-800 dark:text-amber-200">
                  📅 چرا {toFa(preview.dayReasons.length)} روز برنامه ندارند؟
                </summary>
                <ul className="mt-2 max-h-40 overflow-y-auto flex flex-col gap-1.5 text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {preview.dayReasons.slice(0, 60).map(({ date, reason }) => (
                    <li key={date}><b>{formatJalaliLong(date)}:</b> {reason}</li>
                  ))}
                  {preview.dayReasons.length > 60 && <li>و {toFa(preview.dayReasons.length - 60)} روز دیگر…</li>}
                </ul>
              </details>
            </Card>
          )}
        </>
      )}
    </Modal>
  );
}
