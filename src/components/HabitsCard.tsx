import { useState } from "react";
import { useStore } from "../store";
import { Button, Card, Field, Modal, SectionTitle, inputClass } from "./ui";
import { habitStreak, habitWeekCount } from "../lib/habits";
import { toFa, todayKey } from "../lib/jalali";
import type { Habit } from "../types";
import { cn } from "../utils/cn";

const HABIT_ICONS = ["✅", "💧", "🏃", "😴", "📖", "🧘", "🚭", "🥗", "⏰", "📵"];

/** عادت‌های روزانه/هفتگی — مستقل از مطالعه، با زنجیره‌ی خودشان */
export default function HabitsCard() {
  const { state, addHabit, updateHabit, deleteHabit, toggleHabit, toast } = useStore();
  const today = todayKey();
  const [modal, setModal] = useState<null | { editing?: Habit }>(null);
  const habits = state.habits ?? [];

  return (
    <div>
      <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => setModal({})}>＋ عادت</Button>}>
        عادت‌های من 🌱
      </SectionTitle>
      {habits.length === 0 ? (
        <Card className="text-center py-6">
          <div className="text-3xl mb-2">🌱</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">هنوز عادتی نساخته‌ای؛ مثلاً «۸ لیوان آب» یا «خواب قبل ۱۲».</div>
          <Button size="sm" className="mt-3" variant="secondary" onClick={() => setModal({})}>ساخت اولین عادت</Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {habits.map((h) => {
            const done = h.history.includes(today);
            const streak = habitStreak(h.history, today);
            const week = habitWeekCount(h.history, today);
            return (
              <Card key={h.id} className="p-3 flex items-center gap-3">
                <button
                  type="button"
                  title={done ? "نزده علامت بزن" : "انجام شد"}
                  onClick={() => {
                    toggleHabit(h.id, today);
                    if (!done) toast(`آفرین! «${h.title}» ثبت شد (+۵ XP)`, h.icon);
                  }}
                  className={cn(
                    "w-9 h-9 rounded-full border-2 shrink-0 flex items-center justify-center text-lg transition-all active:scale-90",
                    done ? "bg-emerald-500 border-emerald-500" : "border-slate-300 dark:border-slate-500 hover:border-teal-500",
                  )}
                >
                  {done ? "✓" : h.icon}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-semibold truncate", done ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-100")}>{h.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    🔥 {toFa(streak)} روز پیاپی · این هفته {toFa(week)} از {toFa(h.targetPerWeek)}
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.min(100, (week / h.targetPerWeek) * 100)}%` }} />
                  </div>
                </div>
                <button type="button" className="text-slate-400 hover:text-slate-600 text-sm px-1" title="ویرایش" onClick={() => setModal({ editing: h })}>✏️</button>
              </Card>
            );
          })}
        </div>
      )}

      {modal !== null && (
        <HabitModal
          key={modal.editing?.id ?? "new"}
          open
          editing={modal.editing}
          onClose={() => setModal(null)}
        onSave={(data) => {
          if (modal?.editing) updateHabit(modal.editing.id, data);
          else addHabit(data);
          setModal(null);
        }}
          onDelete={modal.editing ? () => { deleteHabit(modal.editing!.id); setModal(null); } : undefined}
        />
      )}
    </div>
  );
}

function HabitModal({ open, editing, onClose, onSave, onDelete }: {
  open: boolean; editing?: Habit; onClose: () => void;
  onSave: (d: { title: string; icon: string; targetPerWeek: number }) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? "✅");
  const [target, setTarget] = useState(editing?.targetPerWeek ?? 7);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "ویرایش عادت" : "عادت جدید"}
    >
      <Field label="عنوان عادت">
        <input autoFocus className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً ۸ لیوان آب" />
      </Field>
      <Field label="آیکون">
        <div className="flex flex-wrap gap-1.5">
          {HABIT_ICONS.map((i) => (
            <button key={i} type="button" onClick={() => setIcon(i)} className={cn("w-10 h-10 rounded-xl text-xl border-2", icon === i ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20" : "border-slate-200 dark:border-slate-600")}>{i}</button>
          ))}
        </div>
      </Field>
      <Field label={`هدف هفتگی: ${toFa(target)} روز`}>
        <input type="range" min={1} max={7} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-teal-600" />
      </Field>
      <div className="flex gap-2">
        {onDelete && <Button variant="danger" onClick={onDelete}>حذف</Button>}
        <Button className="flex-1" disabled={!title.trim()} onClick={() => onSave({ title: title.trim(), icon, targetPerWeek: target })}>ذخیره</Button>
      </div>
    </Modal>
  );
}
