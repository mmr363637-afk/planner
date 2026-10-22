import { useMemo, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, Field, Modal, inputClass } from "./ui";
import { JalaliDatePicker } from "./shared";
import { WEEKDAYS_FA, WEEK_ORDER, diffDays, formatMinutes, toFa, todayKey } from "../lib/jalali";
import { leafTopics } from "../lib/topics";
import { cn } from "../utils/cn";
import { PRIORITY_LABEL, type Priority, type StudyPlan } from "../types";
import PlanDayBoard from "./PlanDayBoard";

/**
 * ویرایش برنامهٔ موجود — بدون از دست رفتن پیشرفت.
 * مباحث قابل افزودن/حذف، بازه، زمان روزانه و روزهای هفته تغییر می‌کنند و کارِ
 * باقی‌مانده دوباره چیده می‌شود؛ تسک‌های انجام‌شده/ردشده سر جایشان می‌مانند
 * (در store با `replanState` تضمین شده).
 */
export default function PlanEditModal({ plan, onClose }: { plan: StudyPlan; onClose: () => void }) {
  const { state, savePlanEdit, toast } = useStore();
  const { subjectOfTopic } = useLookups();
  const today = todayKey();
  const [endDate, setEndDate] = useState(plan.endDate);
  const [dailyMinutes, setDailyMinutes] = useState(plan.dailyMinutes);
  const [studyDays, setStudyDays] = useState<number[]>([...plan.studyDays]);
  const [add, setAdd] = useState<Set<string>>(new Set());
  const [remove, setRemove] = useState<Set<string>>(new Set());
  // اولویتِ مبحث (بالا/متوسط/پایین) — مستقیم روی مبحث ذخیره و در بازچینش اثر می‌کند
  const [priorities, setPriorities] = useState<Record<string, Priority>>({});
  // جابه‌جایی‌های دستیِ هنوز ذخیره‌نشده — با «ذخیره و بازچینش» اعمال می‌شوند
  const [moves, setMoves] = useState<Record<string, string>>({});

  const topics = useMemo(() => leafTopics(state.topics), [state.topics]);
  const archivedIds = useMemo(() => new Set(state.subjects.filter((s) => s.archived).map((s) => s.id)), [state.subjects]);
  const inPlan = useMemo(
    () => new Set([...plan.topicIds.filter((id) => !remove.has(id)), ...add]),
    [plan.topicIds, remove, add],
  );
  const available = topics.filter((t) => !inPlan.has(t.id) && t.status !== "mastered" && !archivedIds.has(t.subjectId));
  const doneTasks = state.tasks.filter((t) => t.planId === plan.id && t.status === "done");
  const doneMinutes = doneTasks.reduce((sum, t) => sum + (t.status === "done" ? t.plannedMinutes : t.doneMinutes), 0);
  const valid = studyDays.length > 0 && dailyMinutes > 0 && diffDays(today, endDate) >= 0 && inPlan.size > 0;

  const save = () => {
    if (!valid) return;
    const res = savePlanEdit(plan.id, {
      endDate,
      dailyMinutes,
      studyDays,
      priorities,
      add: [...add],
      remove: [...remove],
      moves: Object.entries(moves).map(([taskId, date]) => ({ taskId, date })),
    });
    if (res.skipped > 0) {
      toast(`برنامه به‌روز شد؛ ${toFa(res.skipped)} جابه‌جایی به‌خاطر بازچینش اعمال نشد`, "⚠️");
    } else if (res.applied > 0) {
      toast(`برنامه به‌روز شد و ${toFa(res.applied)} کار جابه‌جا شد`, "✅");
    } else {
      toast("برنامه به‌روز شد؛ کارِ انجام‌شده دست‌نخورده ماند", "✅");
    }
    onClose();
  };

  const renderTopic = (topicId: string, removable: boolean) => {
    const topic = topics.find((t) => t.id === topicId) ?? state.topics.find((t) => t.id === topicId);
    const subject = topic ? subjectOfTopic(topic.id) : undefined;
    const priority = priorities[topicId] ?? topic?.priority ?? "medium";
    return (
      <div key={topicId} className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-600 px-2.5 py-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: subject?.color ?? "#94a3b8" }} />
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-slate-800 dark:text-slate-100 truncate">{topic?.name ?? "مبحث حذف‌شده"}</span>
          <span className="block text-[10px] text-slate-400">{subject?.name ?? "—"}</span>
        </span>
        <select
          className="text-[10px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-1 text-slate-600 dark:text-slate-300"
          value={priority}
          onChange={(e) => {
            const next = e.target.value as Priority;
            setPriorities((cur) => ({ ...cur, [topicId]: next }));
          }}
          aria-label={`اولویت ${topic?.name ?? "مبحث"}`}
          title="اولویت در ترتیبِ چیده‌شدن اثر می‌گذارد"
        >
          {(["high", "medium", "low"] as Priority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
          ))}
        </select>
        {removable ? (
          <button
            type="button"
            onClick={() =>
              setRemove((cur) => {
                const next = new Set(cur);
                next.add(topicId);
                return next;
              })
            }
            className="text-[11px] px-2 py-1 rounded-lg text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
          >
            حذف
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              setAdd((cur) => {
                const next = new Set(cur);
                next.add(topicId);
                return next;
              })
            }
            className="text-[11px] px-2 py-1 rounded-lg text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
          >
            افزودن
          </button>
        )}
      </div>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`✏️ ویرایش «${plan.goal}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button disabled={!valid} onClick={save}>ذخیره و بازچینش</Button>
        </>
      }
    >
      <Card className="!p-2.5 !bg-slate-50 dark:!bg-slate-800/60 mb-3">
        <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          ✅ {toFa(doneTasks.length)} تسک انجام‌شده ({formatMinutes(doneMinutes)}) حفظ می‌شود؛ فقط کارِ باقی‌مانده دوباره توزیع می‌شود.
        </div>
      </Card>

      <Field label="پایان برنامه">
        <JalaliDatePicker value={endDate} onChange={setEndDate} min={today} />
        {diffDays(today, endDate) < 0 && <div className="text-[11px] text-rose-600 mt-1">تاریخ پایان نباید قبل از امروز باشد.</div>}
      </Field>

      <Field label="زمان روزانه (دقیقه)">
        <input
          type="number"
          min={15}
          max={900}
          step={15}
          className={cn(inputClass, "text-sm w-28")}
          value={dailyMinutes}
          onChange={(e) => setDailyMinutes(Math.max(15, Math.min(900, Number(e.target.value) || 15)))}
          aria-label="زمان روزانه به دقیقه"
        />
        <span className="text-[11px] text-slate-400 mr-2">{formatMinutes(dailyMinutes)}</span>
      </Field>

      <div className="mb-3">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">روزهای مطالعه</div>
        <div className="flex gap-1" dir="rtl">
          {WEEK_ORDER.map((wd) => {
            const on = studyDays.includes(wd);
            return (
              <button
                key={wd}
                type="button"
                onClick={() => setStudyDays((cur) => (on ? cur.filter((x) => x !== wd) : [...cur, wd]))}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-bold border",
                  on ? "bg-teal-600 text-white border-teal-600" : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-600",
                )}
                aria-pressed={on}
              >
                {WEEKDAYS_FA[wd].slice(0, 1)}
              </button>
            );
          })}
        </div>
        {studyDays.length === 0 && <div className="text-[11px] text-rose-600 mt-1">حداقل یک روز هفته را انتخاب کن.</div>}
      </div>

      <PlanDayBoard
        plan={plan}
        tasks={state.tasks}
        moves={moves}
        onMove={(taskId, date) => {
          const original = state.tasks.find((t) => t.id === taskId);
          setMoves((cur) => {
            const next = { ...cur };
            if (original && original.date === date) delete next[taskId];
            else next[taskId] = date;
            return next;
          });
        }}
        onResetMove={(taskId) =>
          setMoves((cur) => {
            const next = { ...cur };
            delete next[taskId];
            return next;
          })
        }
        onResetAll={() => setMoves({})}
        studyDays={studyDays}
        dailyMinutes={dailyMinutes}
        endDate={endDate}
        topicName={(topicId) => topics.find((t) => t.id === topicId)?.name ?? state.topics.find((t) => t.id === topicId)?.name ?? "مبحث"}
        subjectColor={(topicId) => subjectOfTopic(topicId)?.color}
      />

      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">مباحث برنامه</div>
        <Chip>{toFa(inPlan.size)} مبحث</Chip>
      </div>
      <div className="text-[10px] text-slate-400 mb-1.5">اولویت (بالا/متوسط/پایین) ترتیبِ چیده‌شدن را عوض می‌کند و بعد از «ذخیره و بازچینش» اعمال می‌شود.</div>
      <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto mb-2">
        {plan.topicIds.filter((id) => !remove.has(id)).map((id) => renderTopic(id, true))}
        {[...add].map((id) => renderTopic(id, true))}
        {inPlan.size === 0 && <div className="text-[11px] text-rose-600">برنامه بدون مبحث نمی‌تواند بازچینش شود.</div>}
      </div>

      {available.length > 0 && (
        <>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">افزودن مبحث (مثلاً کارهای روز دهم به بعد)</div>
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
            {available.slice(0, 40).map((t) => renderTopic(t.id, false))}
            {available.length > 40 && <div className="text-[10px] text-slate-400 text-center">و {toFa(available.length - 40)} مبحث دیگر…</div>}
          </div>
        </>
      )}
      {(add.size > 0 || remove.size > 0) && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
          {add.size > 0 && <>➕ {toFa(add.size)} افزوده </>}
          {remove.size > 0 && <>· ➖ {toFa(remove.size)} حذف (تسک انجام‌شده‌اش می‌ماند)</>}
        </div>
      )}
    </Modal>
  );
}
