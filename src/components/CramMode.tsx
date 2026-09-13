// ===== حالت جنگی 🏴‍☠️ — برنامه‌ی فشرده‌ی لحظه‌ی آخری =====
// «تا امتحان X ساعت مونده» → موتور lib/cram از اشتباه‌ها، مرورها، مباحث ضعیف و
// کارت‌ها بلاک‌های ۵۰/۱۰ می‌چیند. این فایل فقط ویزارد + کارت نمایش است.
import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { buildCramPlan, cramTotals, CRAM_KIND_META } from "../lib/cram";
import { Button, Card, ConfirmDialog, Field, Modal, ProgressBar } from "./ui";
import { diffDays, formatJalaliLong, formatMinutes, toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";
import type { CramItem } from "../types";

const HOUR_PRESETS = [3, 6, 12];

/** ویزارد ساخت جنگ: امتحان (اختیاری) + ساعت + درس (اختیاری) + پیش‌نمایش زنده */
export function CramWizardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, startCram } = useStore();
  const today = todayKey();
  const upcoming = useMemo(() => state.exams.filter((e) => e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1)), [state.exams, today]);
  const activeSubjects = useMemo(() => state.subjects.filter((s) => !s.archived), [state.subjects]);
  const [examId, setExamId] = useState("");
  const [hours, setHours] = useState(6);
  const [subjectId, setSubjectId] = useState("");

  const preview = useMemo(
    () => (open ? buildCramPlan({ topics: state.topics, reviews: state.reviews, mistakes: state.mistakes ?? [], flashcards: state.flashcards, subjects: state.subjects, hours, today, subjectId: subjectId || undefined }) : []),
    [open, state.topics, state.reviews, state.mistakes, state.flashcards, state.subjects, hours, today, subjectId],
  );
  const totals = cramTotals(preview);
  const workCount = preview.filter((b) => b.kind !== "break").length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🏴‍☠️ جنگ تازه"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button disabled={preview.length === 0} onClick={() => { startCram({ examId: examId || undefined, hours, subjectId: subjectId || undefined }); onClose(); }}>
            شروع جنگ ⚔️
          </Button>
        </>
      }
    >
      <Field label="امتحان هدف (اختیاری)">
        <select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200">
          <option value="">بدون امتحان خاص — فقط جمع‌بندی</option>
          {upcoming.map((e) => (
            <option key={e.id} value={e.id}>{e.title} · {formatJalaliLong(e.date, false)}</option>
          ))}
        </select>
      </Field>
      <Field label="چند ساعت وقت داری؟">
        <div className="flex gap-2">
          {HOUR_PRESETS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              aria-pressed={hours === h}
              className={cn(
                "flex-1 py-2 rounded-xl border text-sm font-bold transition-colors",
                hours === h ? "border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300" : "border-slate-200 dark:border-slate-600 text-slate-500",
              )}
            >
              {toFa(h)} ساعت
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={24}
            value={hours}
            onChange={(e) => setHours(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
            aria-label="ساعت دلخواه"
            className="w-20 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-sm text-center text-slate-700 dark:text-slate-200"
          />
        </div>
      </Field>
      <Field label="درس (اختیاری)">
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200">
          <option value="">همه‌ی دروس فعال</option>
          {activeSubjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </Field>
      <Card className={cn("text-sm", preview.length === 0 ? "border-amber-200" : "bg-rose-50/60 dark:bg-rose-900/10 border-rose-200/60")}>
        {preview.length === 0 ? (
          <span className="text-amber-700 dark:text-amber-300 text-[13px]">محتوایی برای جنگ نیست — درس فعالی نداری یا همه‌چیز تسلط شده 🏆</span>
        ) : (
          <div className="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
            ⚔️ {toFa(workCount)} بلاک جنگی · {formatMinutes(totals.work)} کار + {formatMinutes(totals.rest)} استراحت
            <div className="text-[11px] text-slate-400 mt-1">اول اشتباه‌ها و مرورهای سررسیده، بعد مباحث ضعیف و نخوانده — با استراحت ۱۰ دقیقه‌ای بینشان.</div>
          </div>
        )}
      </Card>
    </Modal>
  );
}

/** کارت جنگِ فعال: پیشرفت + بلاک‌ها با تیک و دکمه‌ی شروع مستقیم جلسه */
export function CramCard() {
  const { state, toggleCramItem, clearCram, startSession, toast } = useStore();
  const { go } = useNav();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const cram = state.cram;
  const today = todayKey();
  const totals = useMemo(() => cramTotals(cram?.items ?? []), [cram]);
  if (!cram) return null;
  const pct = totals.work > 0 ? Math.round((totals.doneWork / totals.work) * 100) : 0;
  const examLeft = cram.examDate ? diffDays(today, cram.examDate) : null;
  const complete = cram.completedAt != null;

  const playTopic = (item: CramItem) => {
    if (!item.topicId) return;
    if (state.activeSession) {
      toast("جلسه‌ی فعلی ادامه دارد — اول تمامش کن", "⏳");
      go("study");
      return;
    }
    startSession(item.topicId, "free");
    go("study");
  };

  return (
    <Card className="mb-4 border-rose-200/70 dark:border-rose-900/50 bg-gradient-to-l from-rose-50/80 to-white dark:from-rose-950/30 dark:to-slate-800/80">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-extrabold text-slate-800 dark:text-slate-100">🏴‍☠️ حالت جنگی{complete ? " — بردی! 🏆" : ""}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {cram.examTitle ? `${cram.examTitle} · ` : ""}{formatMinutes(totals.work)} کار
            {examLeft != null && examLeft >= 0 && <> · {examLeft === 0 ? <b className="text-rose-500">امتحان امروز است!</b> : <>{toFa(examLeft)} روز تا امتحان</>}</>}
          </div>
        </div>
        <span className="text-xs font-extrabold text-rose-600 dark:text-rose-300 shrink-0">{toFa(pct)}٪</span>
      </div>
      <ProgressBar value={pct} className="mt-2" />
      <div className="flex flex-col gap-1.5 mt-3">
        {cram.items.map((item) => {
          const meta = CRAM_KIND_META[item.kind];
          const isBreak = item.kind === "break";
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-2.5 py-2",
                item.done ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-900/10 opacity-70" : "border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/60",
              )}
            >
              <button
                type="button"
                onClick={() => toggleCramItem(item.id)}
                title={item.done ? "برگردان به انجام‌نشده" : "انجام شد"}
                aria-pressed={item.done}
                className={cn(
                  "w-6 h-6 rounded-lg border-2 flex items-center justify-center text-xs shrink-0 transition-colors",
                  item.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 dark:border-slate-500",
                )}
              >
                {item.done ? "✓" : ""}
              </button>
              <span className="text-base shrink-0" aria-hidden="true">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={cn("text-[13px] font-medium truncate", item.done ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-200")}>
                  {item.label} <span className="text-[10px] text-slate-400 font-normal">· {formatMinutes(item.minutes)}</span>
                </div>
                {!item.done && <div className="text-[10px] text-slate-400 truncate" title={item.detail}>{item.reason}</div>}
              </div>
              {!isBreak && item.topicId && !item.done && (
                <button
                  type="button"
                  onClick={() => playTopic(item)}
                  title="شروع مستقیم جلسه روی این مبحث"
                  className="shrink-0 w-8 h-8 rounded-xl bg-teal-600 text-white text-sm flex items-center justify-center active:scale-95 transition"
                >
                  ▶
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" variant="ghost" onClick={() => (complete ? clearCram() : setConfirmEnd(true))}>
          {complete ? "بستن جنگ 🎉" : "پایان جنگ"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="پایان جنگ"
        message="برنامه‌ی جنگی حذف می‌شود (پیشرفتت در آمار می‌ماند). مطمئنی؟"
        confirmLabel="بله، تمامش کن"
        danger
        onConfirm={() => { clearCram(); setConfirmEnd(false); }}
      />
    </Card>
  );
}
