// ===== دکمه‌ی شناور ➕ — افزودن سریع از هر جای اپ =====
// کار، عادت، فلش‌کارت، امتحان و یادداشت را در دو تپ می‌سازد؛ بدون گشتن در منوها.
import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Field, Modal, inputClass } from "./ui";
import { JalaliDatePicker } from "./shared";
import { leafTopics } from "../lib/topics";
import { toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";

type Action = "task" | "habit" | "card" | "exam" | "note";

const ACTIONS: { id: Action; icon: string; label: string }[] = [
  { id: "task", icon: "✅", label: "کار امروز" },
  { id: "habit", icon: "🌱", label: "عادت" },
  { id: "card", icon: "🃏", label: "فلش‌کارت" },
  { id: "exam", icon: "📝", label: "امتحان" },
  { id: "note", icon: "📝", label: "یادداشت" },
];

const HABIT_ICONS = ["🌱", "💧", "🏃", "📚", "🧘", "😴", "🍎", "✍️"];

export default function QuickAddFab() {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const pick = (a: Action) => {
    setOpen(false);
    setAction(a);
  };
  return (
    <>
      <div className="no-print fixed bottom-20 inset-x-0 z-40 pointer-events-none">
        <div className="max-w-xl mx-auto px-4 flex justify-end">
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            {open && (
              <div className="flex flex-col items-end gap-2 animate-slide-up">
                {ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => pick(a.id)}
                    className="flex items-center gap-2 pl-2 pr-3 py-2 rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200/70 dark:border-slate-700/60 text-sm font-medium text-slate-700 dark:text-slate-200 active:scale-95 transition"
                  >
                    <span className="text-lg">{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "بستن" : "افزودن سریع"}
              className={cn(
                "w-14 h-14 rounded-full text-white text-2xl shadow-xl shadow-teal-600/30 flex items-center justify-center transition-all active:scale-95",
                open ? "bg-slate-700 dark:bg-slate-600 rotate-45" : "bg-teal-600 hover:bg-teal-500",
              )}
            >
              ＋
            </button>
          </div>
        </div>
      </div>
      {open && (
        <button
          type="button"
          aria-label="بستن"
          onClick={() => setOpen(false)}
          className="no-print fixed inset-0 z-30 bg-slate-900/20 dark:bg-black/40"
        />
      )}
      <TaskForm open={action === "task"} onClose={() => setAction(null)} />
      <HabitForm open={action === "habit"} onClose={() => setAction(null)} />
      <CardForm open={action === "card"} onClose={() => setAction(null)} />
      <ExamForm open={action === "exam"} onClose={() => setAction(null)} />
      <NoteForm open={action === "note"} onClose={() => setAction(null)} />
    </>
  );
}

function useTopicOptions() {
  const { state } = useStore();
  return useMemo(() => {
    const subs = new Map(state.subjects.map((s) => [s.id, s]));
    return leafTopics(state.topics).map((t) => ({
      id: t.id,
      label: `${subs.get(t.subjectId)?.name ?? ""} · ${t.name}`,
    }));
  }, [state.subjects, state.topics]);
}

function TopicSelect({ value, onChange, allowEmpty, emptyLabel }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; emptyLabel?: string }) {
  const options = useTopicOptions();
  if (options.length === 0) {
    return <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5">هنوز مبحثی نداری — از «برنامه ← دروس» بساز.</div>;
  }
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">{emptyLabel ?? "بدون مبحث"}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}

function TaskForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addTask, toast } = useStore();
  const options = useTopicOptions();
  const [topicId, setTopicId] = useState("");
  const [minutes, setMinutes] = useState(45);
  const submit = () => {
    const id = topicId || options[0]?.id;
    if (!id) {
      toast("اول یک مبحث بساز", "⚠️");
      return;
    }
    addTask(id, todayKey(), Math.max(5, minutes));
    toast("کار امروز اضافه شد", "✅");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="✅ کار امروز" footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button onClick={submit}>افزودن</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="مبحث"><TopicSelect value={topicId} onChange={setTopicId} /></Field>
        <Field label={`زمان برنامه (${toFa(minutes)} دقیقه)`}>
          <input type="range" min={5} max={240} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-full accent-teal-600" />
        </Field>
      </div>
    </Modal>
  );
}

function HabitForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addHabit, toast } = useStore();
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState(HABIT_ICONS[0]);
  const [target, setTarget] = useState(7);
  const submit = () => {
    if (!title.trim()) {
      toast("اسم عادت را بنویس", "⚠️");
      return;
    }
    addHabit({ title: title.trim(), icon, targetPerWeek: target });
    toast("عادت ساخته شد", "🌱");
    setTitle("");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="🌱 عادت جدید" footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button onClick={submit}>ساختن</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="اسم عادت"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً ۸ لیوان آب" /></Field>
        <Field label="آیکون">
          <div className="flex flex-wrap gap-1.5">
            {HABIT_ICONS.map((i) => (
              <button key={i} type="button" onClick={() => setIcon(i)} className={cn("w-10 h-10 rounded-xl text-xl border-2 transition", icon === i ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30" : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-700")}>
                {i}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`هدف هفتگی (${toFa(target)} روز)`}>
          <input type="range" min={1} max={7} step={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-teal-600" />
        </Field>
      </div>
    </Modal>
  );
}

function CardForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addFlashcard, toast } = useStore();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [topicId, setTopicId] = useState("");
  const submit = () => {
    if (!front.trim() || !back.trim()) {
      toast("رو و پشت کارت را بنویس", "⚠️");
      return;
    }
    addFlashcard({ front: front.trim(), back: back.trim(), topicId: topicId || undefined });
    toast("فلش‌کارت ساخته شد", "🃏");
    setFront("");
    setBack("");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="🃏 فلش‌کارت سریع" footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button onClick={submit}>ساختن</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="مبحث (اختیاری)"><TopicSelect value={topicId} onChange={setTopicId} allowEmpty /></Field>
        <Field label="روی کارت (سوال)"><textarea className={inputClass} rows={2} value={front} onChange={(e) => setFront(e.target.value)} placeholder="سوال…" /></Field>
        <Field label="پشت کارت (جواب)"><textarea className={inputClass} rows={2} value={back} onChange={(e) => setBack(e.target.value)} placeholder="جواب…" /></Field>
      </div>
    </Modal>
  );
}

function ExamForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addExam, toast } = useStore();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayKey());
  const submit = () => {
    if (!title.trim()) {
      toast("اسم امتحان را بنویس", "⚠️");
      return;
    }
    addExam({ title: title.trim(), date });
    toast("امتحان ثبت شد", "📝");
    setTitle("");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="📝 امتحان جدید" footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button onClick={submit}>ثبت</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="اسم امتحان"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً میان‌ترم فیزیولوژی" /></Field>
        <Field label="تاریخ"><JalaliDatePicker value={date} onChange={setDate} /></Field>
      </div>
    </Modal>
  );
}

function NoteForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addNote, toast } = useStore();
  const [text, setText] = useState("");
  const [topicId, setTopicId] = useState("");
  const submit = () => {
    if (!text.trim()) {
      toast("متن یادداشت را بنویس", "⚠️");
      return;
    }
    addNote(text.trim(), topicId || undefined);
    toast("یادداشت ثبت شد", "📝");
    setText("");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="📝 یادداشت سریع" footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button onClick={submit}>ثبت</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="مبحث (اختیاری)"><TopicSelect value={topicId} onChange={setTopicId} allowEmpty /></Field>
        <Field label="متن"><textarea className={inputClass} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="نکته‌ای که نباید یادت برود…" /></Field>
      </div>
    </Modal>
  );
}
