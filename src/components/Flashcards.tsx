// ===== فلش‌کارت‌ها: جلسه‌ی مرور SM-2 + مدیریت کارت‌ها =====
import { useMemo, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, ConfirmDialog, EmptyState, Modal, PlusIcon, TrashIcon, inputClass } from "./ui";
import { classifyCards } from "../lib/sm2";
import { formatJalaliShort, toFa, todayKey } from "../lib/jalali";
import { leafTopics } from "../lib/topics";
import type { Flashcard, Topic } from "../types";
import { cn } from "../utils/cn";

/** چهار دکمه‌ی ارزیابی → کیفیت SM-2 */
const GRADES: { q: 1 | 3 | 4 | 5; label: string; emoji: string; className: string }[] = [
  { q: 1, label: "بلد نبودم", emoji: "😵", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  { q: 3, label: "سخت", emoji: "😅", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { q: 4, label: "خوب", emoji: "🙂", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  { q: 5, label: "آسون", emoji: "😎", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
];

export default function FlashcardsView() {
  const { state } = useStore();
  const today = todayKey();
  const [session, setSession] = useState(false);
  const groups = classifyCards(state.flashcards, today);
  const dueCount = groups.overdue.length + groups.due.length;

  if (session) return <ReviewSession onExit={() => setSession(false)} />;

  return (
    <div>
      {/* خلاصه */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card className="text-center py-3">
          <div className="text-lg font-extrabold text-rose-500">{toFa(dueCount)}</div>
          <div className="text-[10px] text-slate-400">آماده‌ی مرور</div>
        </Card>
        <Card className="text-center py-3">
          <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{toFa(state.flashcards.length)}</div>
          <div className="text-[10px] text-slate-400">کل کارت‌ها</div>
        </Card>
        <Card className="text-center py-3">
          <div className="text-lg font-extrabold text-emerald-500">{toFa(groups.upcoming.length)}</div>
          <div className="text-[10px] text-slate-400">آینده</div>
        </Card>
      </div>

      {state.flashcards.length === 0 ? (
        <EmptyState
          icon="🃏"
          title="هنوز کارتی نساخته‌ای"
          description="فلش‌کارت‌ها با الگوریتم SM-2 مرور می‌شوند؛ هر کارت را با سوال و جواب بساز و برنامه هر روز کارت‌های سررسید را نشانت می‌دهد."
        />
      ) : (
        <Button size="lg" className="w-full mb-4" disabled={dueCount === 0} onClick={() => setSession(true)}>
          {dueCount > 0 ? `شروع مرور ${toFa(dueCount)} کارت` : "کارت سررسیدی برای امروز نیست ✅"}
        </Button>
      )}

      <ManageCards />
    </div>
  );
}

// ================= جلسه‌ی مرور =================

function ReviewSession({ onExit }: { onExit: () => void }) {
  const { state, reviewFlashcard, toast } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const today = todayKey();

  // صف مرور: عقب‌افتاده‌ها اول، بعد امروز؛ به ترتیب سررسید
  const queue = useMemo(() => {
    const g = classifyCards(state.flashcards, today);
    return [...g.overdue, ...g.due];
    // صف از لحظه‌ی شروع ثابت می‌ماند تا کارت‌های جدید وسط جلسه اضافه نشوند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ good: number; again: number }>({ good: 0, again: 0 });
  const [finished, setFinished] = useState(false);

  if (queue.length === 0 || finished) {
    return (
      <Card className="text-center py-8">
        <div className="text-4xl mb-2">🎉</div>
        <div className="font-bold text-slate-800 dark:text-slate-100">جلسه تمام شد</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
          {toFa(results.good + results.again)} کارت مرور شد · 😎 {toFa(results.good)} درست · 😵 {toFa(results.again)} برای تکرار
        </div>
        <Button onClick={onExit}>بازگشت</Button>
      </Card>
    );
  }

  const card = queue[index];
  const topic: Topic | undefined = card.topicId != null ? topicById.get(card.topicId) : undefined;
  const subject = topic ? subjectOfTopic(topic.id) : undefined;

  const grade = (q: 1 | 3 | 4 | 5) => {
    reviewFlashcard(card.id, q);
    setResults((r) => ({ good: r.good + (q >= 3 ? 1 : 0), again: r.again + (q < 3 ? 1 : 0) }));
    if (index + 1 >= queue.length) {
      toast(`${toFa(queue.length)} کارت مرور شد (+${toFa(queue.length * 2)} XP)`, "🃏");
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  };

  return (
    <div>
      {/* پیشرفت */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          کارت {toFa(index + 1)} از {toFa(queue.length)}
        </span>
        <button type="button" onClick={onExit} className="text-xs text-slate-400">
          پایان جلسه
        </button>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mb-5 overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      {/* کارت */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="w-full text-right rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 min-h-56 flex flex-col active:scale-[0.99] transition"
      >
        {(subject || topic) && (
          <div className="flex items-center gap-2 mb-3">
            {subject && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subject.color }} />}
            <span className="text-[11px] text-slate-400 truncate">{topic?.name ?? subject?.name}</span>
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-relaxed">{card.front}</div>
          {flipped ? (
            <>
              <hr className="my-4 border-slate-100 dark:border-slate-700" />
              <div className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">{card.back}</div>
            </>
          ) : (
            <div className="text-[11px] text-slate-400 mt-4">برای دیدن پاسخ لمس کن 👆</div>
          )}
        </div>
        <div className="flex gap-1.5 mt-3">
          <Chip>فاصله: {toFa(card.intervalDays)} روز</Chip>
          <Chip>EF {toFa(card.ef.toFixed(2))}</Chip>
        </div>
      </button>

      {/* ارزیابی */}
      {flipped ? (
        <div className="grid grid-cols-2 gap-2 mt-4">
          {GRADES.map((g) => (
            <button
              key={g.q}
              type="button"
              onClick={() => grade(g.q)}
              className={cn("rounded-2xl py-3 font-bold text-sm active:scale-95 transition", g.className)}
            >
              {g.emoji} {g.label}
            </button>
          ))}
        </div>
      ) : (
        <Button size="lg" className="w-full mt-4" onClick={() => setFlipped(true)}>
          نمایش پاسخ
        </Button>
      )}
    </div>
  );
}

// ================= مدیریت کارت‌ها =================

function ManageCards() {
  const { state, addFlashcard, updateFlashcard, deleteFlashcard, toast } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Flashcard | null>(null);
  const today = todayKey();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...state.flashcards].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (!q) return list;
    return list.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || (c.topicId != null && topicById.get(c.topicId)?.name.includes(query)));
  }, [state.flashcards, query, topicById]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">همه‌ی کارت‌ها</h2>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <PlusIcon /> کارت جدید
        </Button>
      </div>
      {state.flashcards.length > 6 && (
        <input className={cn(inputClass, "mb-2 text-sm")} placeholder="جستجو در کارت‌ها…" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="flex flex-col gap-2">
        {filtered.slice(0, 60).map((c) => {
          const topic = c.topicId != null ? topicById.get(c.topicId) : undefined;
          const subject = topic ? subjectOfTopic(topic.id) : undefined;
          const due = c.dueDate <= today;
          return (
            <Card key={c.id} className="p-3" onClick={() => setEditing(c)}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{c.front}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.back}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(subject || topic) && <Chip color={subject?.color}>{topic?.name ?? subject?.name}</Chip>}
                    <Chip className={cn(due && "!bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-300")}>
                      {due ? "سررسید" : formatJalaliShort(c.dueDate)}
                    </Chip>
                    {c.lapses > 0 && <Chip>گزیده: {toFa(c.lapses)}</Chip>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(c);
                  }}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 flex items-center justify-center shrink-0"
                  title="حذف کارت"
                >
                  <TrashIcon />
                </button>
              </div>
            </Card>
          );
        })}
        {filtered.length > 60 && <div className="text-xs text-slate-400 text-center py-2">و {toFa(filtered.length - 60)} کارت دیگر…</div>}
        {filtered.length === 0 && <div className="text-xs text-slate-400 text-center py-4">کارتی یافت نشد</div>}
      </div>

      {(creating || editing) && (
        <CardEditor
          key={editing?.id ?? "new"}
          card={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(front, back, topicId) => {
            if (editing) {
              updateFlashcard(editing.id, { front, back, topicId: topicId || undefined });
              toast("کارت به‌روز شد", "🃏");
            } else {
              addFlashcard({ front, back, topicId: topicId || undefined });
              toast("کارت ساخته شد (+ مرور از امروز)", "🃏");
            }
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف کارت"
        message={`کارت «${deleting?.front ?? ""}» حذف می‌شود.`}
        confirmLabel="حذف"
        danger
        onConfirm={() => {
          if (deleting) deleteFlashcard(deleting.id);
          setDeleting(null);
          toast("کارت حذف شد", "🗑");
        }}
      />
    </div>
  );
}

function CardEditor({
  card,
  onClose,
  onSave,
}: {
  card?: Flashcard;
  onClose: () => void;
  onSave: (front: string, back: string, topicId: string | undefined) => void;
}) {
  const { state } = useStore();
  const { subjectOfTopic } = useLookups();
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [topicId, setTopicId] = useState<string | "">(card?.topicId ?? "");
  const valid = front.trim().length > 0 && back.trim().length > 0;
  const topics = useMemo(() => leafTopics(state.topics), [state.topics]);

  return (
    <Modal
      open
      onClose={onClose}
      title={card ? "ویرایش کارت" : "کارت جدید"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            disabled={!valid}
            onClick={() => onSave(front.trim(), back.trim(), topicId || undefined)}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">روی کارت (سوال) *</span>
          <textarea autoFocus className={cn(inputClass, "min-h-[64px] resize-y")} value={front} onChange={(e) => setFront(e.target.value)} placeholder="مثلاً: مکانیسم اثر فوروزماید؟" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">پشت کارت (پاسخ) *</span>
          <textarea className={cn(inputClass, "min-h-[64px] resize-y")} value={back} onChange={(e) => setBack(e.target.value)} placeholder="پاسخ کوتاه و دقیق بهتر یاد می‌ماند" />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">مبحث مرتبط (اختیاری)</span>
          <select className={inputClass} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">— بدون مبحث —</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {subjectOfTopic(t.id)?.name ? `${subjectOfTopic(t.id)!.name} › ` : ""}
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
