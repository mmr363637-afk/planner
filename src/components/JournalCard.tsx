import { useState } from "react";
import { useStore } from "../store";
import { Button, Card, Modal, SectionTitle, inputClass } from "./ui";
import { formatJalaliShort, toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";

const MOODS = ["😞", "😐", "🙂", "😊", "🤩"];

/** ژورنال بازتاب روزانه: «امروز چی یاد گرفتم؟» */
export default function JournalCard() {
  const { state, upsertJournal, deleteJournal, toast } = useStore();
  const today = todayKey();
  const entries = [...(state.journal ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const todayEntry = entries.find((j) => j.date === today);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [mood, setMood] = useState<number | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);

  const startEdit = () => {
    setText(todayEntry?.learned ?? "");
    setMood(todayEntry?.mood);
    setEditing(true);
  };

  return (
    <div>
      <SectionTitle action={entries.length > 0 ? <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>📚 گذشته‌ها ({toFa(entries.length)})</Button> : undefined}>
        بازتاب امروز 🌙
      </SectionTitle>
      <Card>
        {!editing && !todayEntry && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              دو دقیقه وقت بذار: <b>امروز چی یاد گرفتی؟</b> ✍️ نوشتنش، ماندگاریش رو چند برابر می‌کنه.
            </p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={startEdit}>نوشتن بازتاب امروز</Button>
          </>
        )}
        {!editing && todayEntry && (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">«{todayEntry.learned}» {todayEntry.mood ? MOODS[todayEntry.mood - 1] : ""}</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="ghost" onClick={startEdit}>ویرایش</Button>
            </div>
          </>
        )}
        {editing && (
          <>
            <textarea
              autoFocus className={inputClass} rows={3} value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="امروز فهمیدم که… / مهم‌ترین نکته‌ای که یاد گرفتم…"
            />
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="text-[11px] text-slate-400 ml-1">حال امروز:</span>
              {MOODS.map((m, i) => (
                <button key={m} type="button" onClick={() => setMood(i + 1)} className={cn("w-9 h-9 rounded-xl text-xl border-2", mood === i + 1 ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20" : "border-transparent")}>{m}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>انصراف</Button>
              <Button
                size="sm" className="flex-1" disabled={!text.trim()}
                onClick={() => {
                  const isNew = !todayEntry;
                  upsertJournal(today, text, mood);
                  setEditing(false);
                  if (isNew) toast("بازتاب امروز ثبت شد (+۱۰ XP)", "🌙");
                }}
              >
                ثبت بازتاب
              </Button>
            </div>
          </>
        )}
      </Card>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="📚 بازتاب‌های گذشته">
        <div className="flex flex-col gap-2">
          {entries.map((j) => (
            <div key={j.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{formatJalaliShort(j.date)} {j.mood ? MOODS[j.mood - 1] : ""}</span>
                <button type="button" onClick={() => deleteJournal(j.id)} title="حذف">🗑</button>
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">{j.learned}</div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
