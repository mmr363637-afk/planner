import { useMemo, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, EmptyState, Field, Modal, inputClass } from "./ui";
import { diffDays, formatJalaliShort, relativeDayLabel, toFa, todayKey } from "../lib/jalali";
import { leafTopics } from "../lib/topics";

/**
 * 📓 دفتر اشتباهات — تست‌ها و نکاتی که غلط زده شده‌اند،
 * هر کدام با زمان‌بندی مرورِ خودشان (۱/۳/۷/۱۴/۳۰ روز).
 */
export default function MistakesView() {
  const { state, addMistake, reviewMistake, deleteMistake, toast } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const today = todayKey();
  const [formOpen, setFormOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [cause, setCause] = useState("");
  const [topicId, setTopicId] = useState("");

  const mistakes = useMemo(
    () => [...(state.mistakes ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [state.mistakes],
  );
  const due = mistakes.filter((m) => m.dueDate <= today);
  const upcoming = mistakes.filter((m) => m.dueDate > today);
  const topics = useMemo(() => leafTopics(state.topics), [state.topics]);

  const save = () => {
    if (!question.trim()) return;
    const topic = topicById.get(topicId);
    addMistake({
      question, answer: answer || undefined, cause: cause || undefined,
      topicId: topicId || undefined, subjectId: topic?.subjectId,
    });
    setQuestion(""); setAnswer(""); setCause(""); setTopicId("");
    setFormOpen(false);
    toast("به دفتر اشتباهات اضافه شد 📓", "✍️");
  };

  const nameOf = (m: (typeof mistakes)[number]) => {
    if (m.topicId) {
      const t = topicById.get(m.topicId);
      const s = subjectOfTopic(m.topicId);
      if (t) return `${s ? `${s.name} · ` : ""}${t.name}`;
    }
    return "بدون مبحث";
  };

  return (
    <div>
      <Button className="w-full mb-4" variant="secondary" onClick={() => setFormOpen(true)}>
        ✍️ ثبت اشتباه جدید
      </Button>

      {mistakes.length === 0 ? (
        <EmptyState
          icon="📓"
          title="دفتر اشتباهات خالی است"
          description="هر تستی که غلط می‌زنی این‌جا بنویس؛ خودش سرِ وقت برای مرور برمی‌گردد."
        />
      ) : (
        <>
          {due.length > 0 && (
            <div className="mb-5">
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">🔴 سررسید ({toFa(due.length)})</div>
              <div className="flex flex-col gap-2">
                {due.map((m) => (
                  <Card key={m.id} className="p-3 border-rose-200/60 dark:border-rose-900/40">
                    <div className="text-[11px] text-slate-400">{nameOf(m)}</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5 leading-relaxed">{m.question}</div>
                    {m.answer && <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">✅ {m.answer}</div>}
                    {m.cause && <div className="text-[11px] text-slate-500 mt-0.5">💭 علت: {m.cause}</div>}
                    <div className="flex gap-1.5 mt-2">
                      <Chip>{toFa(m.reviewCount)} مرور</Chip>
                      {m.lapses > 0 && <Chip>⚠️ {toFa(m.lapses)} لغزش</Chip>}
                      {m.dueDate < today && <Chip>⏰ {toFa(diffDays(m.dueDate, today))} روز تأخیر</Chip>}
                    </div>
                    <div className="flex gap-2 mt-2.5">
                      <Button size="sm" className="flex-1" onClick={() => { reviewMistake(m.id, true); toast("آفرین! دفعه‌ی بعد دیرتر برمی‌گردد (+۱۰ XP)", "🧠"); }}>
                        یادم بود ✓
                      </Button>
                      <Button size="sm" variant="danger" className="flex-1" onClick={() => { reviewMistake(m.id, false); toast("فردا دوباره می‌بینی‌اش", "🔁"); }}>
                        یادم نبود
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMistake(m.id)} title="حذف">🗑</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">🟢 آینده ({toFa(upcoming.length)})</div>
              <div className="flex flex-col gap-2">
                {upcoming.map((m) => (
                  <Card key={m.id} className="p-3">
                    <div className="text-[11px] text-slate-400">{nameOf(m)} · {relativeDayLabel(m.dueDate)} ({formatJalaliShort(m.dueDate)})</div>
                    <div className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 truncate">{m.question}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="✍️ اشتباه جدید">
        <Field label="صورت سؤال / نکته‌ای که غلط زدی">
          <textarea autoFocus className={inputClass} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="مثلاً تست ۱۲ آزمون: علت هیپوناترمی در…" />
        </Field>
        <Field label="پاسخ درست (اختیاری)">
          <input className={inputClass} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="گزینه ۲ — SIADH" />
        </Field>
        <Field label="علت اشتباهت (اختیاری)" hint="«عجله کردم»، «نکته را نمی‌دانستم»… — همین یک خط، نصف درمان است!">
          <input className={inputClass} value={cause} onChange={(e) => setCause(e.target.value)} placeholder="مثلاً گزینه‌ها را تا آخر نخواندم" />
        </Field>
        <Field label="مبحث (اختیاری)">
          <select className={inputClass} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">بدون مبحث</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Button className="w-full" disabled={!question.trim()} onClick={save}>ثبت در دفتر 📓</Button>
      </Modal>
    </div>
  );
}
