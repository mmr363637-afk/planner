import { useMemo, useState } from "react";
import { useStore, type CreatePlanInput } from "../store";
import { useNav } from "../nav";
import { Button, Card, ConfirmDialog, EmptyState, Field, Modal, PlusIcon, ProgressBar, TrashIcon, inputClass } from "../components/ui";
import { JalaliDatePicker } from "../components/shared";
import { WEEKDAYS_FA, WEEK_ORDER, addDays, diffDays, formatHoursCompact, formatJalaliNumeric, formatMinutes, toFa, todayKey } from "../lib/jalali";
import { overdueDays } from "../lib/planner";
import { planAdherence } from "../lib/stats";
import { cn } from "../utils/cn";
import type { StudyPlan } from "../types";

export default function PlansPage() {
  const { state, deletePlan, replanPlan, toast } = useStore();
  const { go } = useNav();
  const [wizard, setWizard] = useState(false);
  const [confirm, setConfirm] = useState<StudyPlan | null>(null);
  const today = todayKey();

  const plans = [...state.plans].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="pb-24">
      {plans.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="هنوز برنامه‌ای نساخته‌ای"
          description="هدف، بازه زمانی و مباحث را مشخص کن؛ موتور برنامه‌ریزی مطالعه را بین روزها تقسیم می‌کند."
          action={
            state.topics.length === 0 ? (
              <Button onClick={() => go("plan", { planSub: "subjects" })}>ابتدا درس و مبحث اضافه کن</Button>
            ) : (
              <Button onClick={() => setWizard(true)}>
                <PlusIcon /> ساخت اولین برنامه
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((p) => {
            const tasks = state.tasks.filter((t) => t.planId === p.id);
            const pct = planAdherence(tasks, p.startDate, p.endDate);
            const total = tasks.reduce((s, t) => s + t.plannedMinutes, 0);
            const overdue = overdueDays(tasks, today);
            const daysLeft = diffDays(today, p.endDate);
            const finished = daysLeft < 0 || (tasks.length > 0 && tasks.every((t) => t.status !== "pending"));
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 dark:text-slate-100">{p.goal}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {formatJalaliNumeric(p.startDate)} تا {formatJalaliNumeric(p.endDate)} · روزانه {formatHoursCompact(p.dailyMinutes)}
                    </div>
                  </div>
                  <button type="button" className="p-1.5 text-slate-400 hover:text-rose-500" onClick={() => setConfirm(p)}>
                    <TrashIcon />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar value={pct} className="flex-1" />
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400 w-10 text-left">{toFa(pct)}٪</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  <span>{toFa(p.topicIds.length)} مبحث</span>
                  <span>{formatMinutes(total)} کل</span>
                  <span>{tasks.filter((t) => t.status === "done").length ? `${toFa(tasks.filter((t) => t.status === "done").length)} تسک انجام‌شده` : ""}</span>
                  {!finished && daysLeft >= 0 && <span>{toFa(daysLeft)} روز مانده</span>}
                  {finished && <span className="text-emerald-600">پایان‌یافته</span>}
                </div>
                {overdue > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                    <span className="text-xs text-amber-800 dark:text-amber-200">{toFa(overdue)} روز عقب‌افتاده</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        replanPlan(p.id);
                        toast("برنامه دوباره توزیع شد", "✅");
                      }}
                    >
                      تنظیم مجدد
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {plans.length > 0 && (
        <button
          type="button"
          onClick={() => (state.topics.length === 0 ? go("plan", { planSub: "subjects" }) : setWizard(true))}
          className="fixed bottom-24 left-5 z-30 w-14 h-14 rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/40 flex items-center justify-center hover:bg-teal-700 active:scale-95 transition"
        >
          <PlusIcon />
        </button>
      )}

      {wizard && <PlanWizard onClose={() => setWizard(false)} />}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="حذف برنامه"
        message={`برنامه «${confirm?.goal}» و تمام تسک‌های آن حذف می‌شود. جلسات مطالعه ثبت‌شده باقی می‌مانند.`}
        confirmLabel="حذف"
        danger
        onConfirm={() => confirm && deletePlan(confirm.id)}
      />
    </div>
  );
}

function PlanWizard({ onClose }: { onClose: () => void }) {
  const { state, previewPlan, createPlan, toast } = useStore();
  const today = todayKey();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 20));
  const [dailyMinutes, setDailyMinutes] = useState(240);
  const [studyDays, setStudyDays] = useState<number[]>([6, 0, 1, 2, 3, 4]); // شنبه تا پنجشنبه
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const availableTopics = useMemo(() => state.topics.filter((t) => selectedSubjects.includes(t.subjectId) && t.status !== "mastered"), [state.topics, selectedSubjects]);

  const toggleSubject = (id: string) => {
    const on = selectedSubjects.includes(id);
    const next = on ? selectedSubjects.filter((x) => x !== id) : [...selectedSubjects, id];
    setSelectedSubjects(next);
    const subjTopics = state.topics.filter((t) => t.subjectId === id && t.status !== "mastered").map((t) => t.id);
    setSelectedTopics((cur) => (on ? cur.filter((x) => !subjTopics.includes(x)) : [...new Set([...cur, ...subjTopics])]));
  };

  const input: CreatePlanInput = { goal: goal.trim(), startDate, endDate, topicIds: selectedTopics, studyDays, dailyMinutes };
  const preview = useMemo(() => (step === 3 ? previewPlan(input) : null), [step, goal, startDate, endDate, selectedTopics, studyDays, dailyMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = [goal.trim().length > 0 && diffDays(startDate, endDate) >= 0 && dailyMinutes > 0 && studyDays.length > 0, selectedTopics.length > 0, true, true][step];

  const steps = ["هدف و زمان", "دروس و مباحث", "روزهای مطالعه", "پیش‌نمایش"];

  return (
    <Modal
      open
      onClose={onClose}
      title={`ساخت برنامه · ${steps[step]}`}
      footer={
        <>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              قبلی
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              انصراف
            </Button>
          )}
          {step < 3 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
              بعدی
            </Button>
          ) : (
            <Button
              disabled={!preview || preview.tasks.length === 0}
              onClick={() => {
                createPlan(input);
                toast("برنامه ساخته شد 🎯", "✅");
                onClose();
              }}
            >
              ساخت برنامه
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
            <input autoFocus className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="مثلاً آمادگی امتحان عفونی" />
          </Field>
          <Field label="تاریخ شروع">
            <JalaliDatePicker value={startDate} onChange={(d) => { setStartDate(d); if (endDate < d) setEndDate(d); }} />
          </Field>
          <Field label="تاریخ پایان" hint={`${toFa(diffDays(startDate, endDate) + 1)} روز`}>
            <JalaliDatePicker value={endDate} onChange={setEndDate} min={startDate} />
          </Field>
          <Field label="زمان مطالعه روزانه" hint={formatMinutes(dailyMinutes)}>
            <input type="range" min={30} max={720} step={15} value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} className="w-full accent-teal-600" />
          </Field>
        </>
      )}

      {step === 1 && (
        <>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">دروس</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {state.subjects.map((s) => {
              const on = selectedSubjects.includes(s.id);
              return (
                <button key={s.id} type="button" onClick={() => toggleSubject(s.id)} className={cn("px-3 py-1.5 rounded-full text-sm border-2 transition-colors", on ? "text-white" : "text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600")} style={on ? { backgroundColor: s.color, borderColor: s.color } : undefined}>
                  {s.name}
                </button>
              );
            })}
          </div>
          {selectedSubjects.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300">مباحث ({toFa(selectedTopics.length)})</div>
                <button type="button" className="text-xs text-teal-600" onClick={() => setSelectedTopics(selectedTopics.length === availableTopics.length ? [] : availableTopics.map((t) => t.id))}>
                  {selectedTopics.length === availableTopics.length ? "هیچ‌کدام" : "همه"}
                </button>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                {availableTopics.length === 0 && <div className="text-xs text-slate-400 text-center py-4">مبحث تکمیل‌نشده‌ای در این دروس نیست.</div>}
                {availableTopics.map((t) => {
                  const on = selectedTopics.includes(t.id);
                  return (
                    <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer">
                      <input type="checkbox" className="accent-teal-600 w-4 h-4" checked={on} onChange={() => setSelectedTopics((c) => (on ? c.filter((x) => x !== t.id) : [...c, t.id]))} />
                      <span className="flex-1 text-slate-700 dark:text-slate-200">{t.name}</span>
                      <span className="text-[11px] text-slate-400">{formatHoursCompact(t.estimatedMinutes)}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">روزهای مطالعه در هفته</div>
          <div className="grid grid-cols-7 gap-1.5 mb-5">
            {WEEK_ORDER.map((wd) => {
              const on = studyDays.includes(wd);
              return (
                <button key={wd} type="button" onClick={() => setStudyDays((d) => (on ? d.filter((x) => x !== wd) : [...d, wd]))} className={cn("py-2 rounded-xl text-[11px] font-medium border transition-colors", on ? "bg-teal-600 border-teal-600 text-white" : "border-slate-200 dark:border-slate-600 text-slate-500")}>
                  {WEEKDAYS_FA[wd].slice(0, 1)}
                </button>
              );
            })}
          </div>
          <Card className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <div>روزهای در دسترس: <b>{toFa(studyDays.length)}</b> روز در هفته</div>
            <div>ظرفیت روزانه: <b>{formatMinutes(dailyMinutes)}</b></div>
            <div>مجموع زمان مباحث: <b>{formatMinutes(state.topics.filter((t) => selectedTopics.includes(t.id)).reduce((s, t) => s + t.estimatedMinutes, 0))}</b></div>
          </Card>
        </>
      )}

      {step === 3 && preview && (
        <>
          {preview.tasks.length === 0 ? (
            <Card className="text-sm text-rose-600">در بازه انتخاب‌شده هیچ روز مطالعه‌ای وجود ندارد. تاریخ‌ها یا روزهای هفته را تغییر بده.</Card>
          ) : (
            <>
              <Card className={cn("text-sm mb-3", preview.scale < 1 ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200" : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200")}>
                {preview.scale < 1 ? (
                  <>
                    ⚠️ حجم مباحث ({formatMinutes(preview.totalNeeded)}) بیشتر از ظرفیت ({formatMinutes(preview.totalCapacity)}) است. زمان هر مبحث به نسبت <b>{toFa(Math.round(preview.scale * 100))}٪</b> فشرده شد.
                  </>
                ) : (
                  <>✅ برنامه در ظرفیت جا می‌شود: {formatMinutes(preview.totalNeeded)} در {toFa(preview.dates.length)} روز.</>
                )}
              </Card>
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {preview.dates.map((d) => {
                  const dayTasks = preview.tasks.filter((t) => t.date === d);
                  if (dayTasks.length === 0) return null;
                  return (
                    <div key={d} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5 flex justify-between">
                        <span>{formatJalaliNumeric(d)}</span>
                        <span className="text-slate-400 font-normal">{formatHoursCompact(dayTasks.reduce((s, t) => s + t.plannedMinutes, 0))}</span>
                      </div>
                      {dayTasks.map((t) => (
                        <div key={t.id} className="flex justify-between text-[12px] text-slate-600 dark:text-slate-300 py-0.5">
                          <span>{state.topics.find((x) => x.id === t.topicId)?.name}</span>
                          <span className="text-slate-400">{formatHoursCompact(t.plannedMinutes)}</span>
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
