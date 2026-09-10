import { useState } from "react";
import { useStore } from "../store";
import { Button, Card, Field, Modal, SectionTitle, inputClass } from "./ui";
import { JalaliDatePicker } from "./shared";
import { addDays, diffDays, formatJalaliShort, toFa, todayKey } from "../lib/jalali";

/** 💌 کپسول زمان — نامه به خودِ آینده که سرِ تاریخ مقرر باز می‌شود */
export default function TimeCapsules() {
  const { state, addCapsule, openCapsule, deleteCapsule, toast } = useStore();
  const today = todayKey();
  const [modal, setModal] = useState(false);
  const [text, setText] = useState("");
  const [openDate, setOpenDate] = useState(addDays(today, 30));
  const [examId, setExamId] = useState("");
  const capsules = [...(state.capsules ?? [])].sort((a, b) => a.openDate.localeCompare(b.openDate));

  const save = () => {
    if (!text.trim()) return;
    addCapsule(text, openDate, examId || undefined);
    setText(""); setExamId(""); setOpenDate(addDays(today, 30));
    setModal(false);
    toast("کپسول زمان بسته شد 💌 — سرِ وقتش باز می‌شود", "🔒");
  };

  return (
    <div>
      <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => setModal(true)}>＋ نامه جدید</Button>}>
        کپسول زمان 💌
      </SectionTitle>
      {capsules.length === 0 ? (
        <Card className="text-center py-6">
          <div className="text-3xl mb-2">💌</div>
          <div className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            یه نامه به خودِ روز امتحانت بنویس («یادت میاد چقدر خوندی؟ برو بترکون!»).
            <br />تا اون روز قفل می‌مونه. 🔒
          </div>
          <Button size="sm" className="mt-3" variant="secondary" onClick={() => setModal(true)}>نوشتن اولین نامه</Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {capsules.map((c) => {
            const sealed = today < c.openDate && !c.openedAt;
            const exam = state.exams.find((e) => e.id === c.examId);
            return (
              <Card key={c.id} className="p-3">
                {c.openedAt || !sealed ? (
                  <>
                    <div className="text-[11px] text-slate-400">
                      📬 باز شد {c.openedAt ? `· ${formatJalaliShort(todayKey())}` : ""}{exam ? ` · برای ${exam.title}` : ""}
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-200 mt-1 leading-relaxed whitespace-pre-wrap">«{c.text}»</div>
                    <div className="flex justify-end mt-2">
                      <button type="button" className="text-[11px] text-slate-400" onClick={() => deleteCapsule(c.id)}>حذف 🗑</button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🔒</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">نامه‌ی قفل‌شده</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        باز می‌شود: {formatJalaliShort(c.openDate)} ({toFa(diffDays(today, c.openDate))} روز دیگر){exam ? ` · ${exam.title}` : ""}
                      </div>
                      {today >= c.openDate && (
                        <Button
                          size="sm" className="mt-2"
                          onClick={() => { openCapsule(c.id); toast("کپسول زمان باز شد! 🎉", "💌"); }}
                        >
                          🔓 بازش کن!
                        </Button>
                      )}
                    </div>
                    <button type="button" className="text-slate-400 text-sm" onClick={() => deleteCapsule(c.id)} title="حذف">🗑</button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="💌 نامه به آینده">
        <Field label="به خودِ آینده‌ات چی می‌خوای بگی؟">
          <textarea autoFocus className={inputClass} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="سلامِ روز امتحان! یادت میاد چقدر خوندی؟ آروم باش، نفس عمیق، برو بترکون…" />
        </Field>
        <Field label="تاریخ باز شدن">
          <JalaliDatePicker value={openDate} onChange={setOpenDate} min={today} />
        </Field>
        <Field label="وصل به امتحان (اختیاری)" hint="اگر امتحان را انتخاب کنی، تاریخ باز شدن همان روز امتحان می‌شود.">
          <select
            className={inputClass} value={examId}
            onChange={(e) => {
              setExamId(e.target.value);
              const ex = state.exams.find((x) => x.id === e.target.value);
              if (ex && ex.date >= today) setOpenDate(ex.date);
            }}
          >
            <option value="">بدون امتحان</option>
            {state.exams.filter((e) => e.date >= today).map((e) => (
              <option key={e.id} value={e.id}>📝 {e.title} · {formatJalaliShort(e.date)}</option>
            ))}
          </select>
        </Field>
        <Button className="w-full" disabled={!text.trim()} onClick={save}>🔒 بستن کپسول</Button>
      </Modal>
    </div>
  );
}
