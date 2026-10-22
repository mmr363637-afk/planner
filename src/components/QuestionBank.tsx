import { useEffect, useMemo, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, Modal, inputClass } from "./ui";
import { questionIsValid } from "../lib/cardQuiz";
import { aiConfigured, subscribeAiConfig } from "../lib/ai";
import { aiEnrichQuestions, questionsNeedingAi, type AiQuestionInput } from "../lib/aiQuestions";
import { ankiFromQuestions } from "../lib/ankiExport";
import { downloadTextFile } from "../lib/backup";
import { toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";

/**
 * بانک سؤال — مستقل از کارت‌ها ولی متصل به آن‌ها.
 * هر سؤال شناسهٔ پایدار و link به کارت مبدأ دارد؛ ویرایش کارت، سؤالش را کهنه می‌کند
 * و اینجا می‌شود بازسازی/حذف/علامت‌گذاری کرد. سابقهٔ پاسخ‌ها هم از خاموشی درنمی‌آید.
 */
export default function QuestionBank({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, flagCardQuestion, deleteCardQuestion, prepareCardQuestions, saveCardQuestions, toast } = useStore();
  const { topicById } = useLookups();
  const [filter, setFilter] = useState<"all" | "flagged" | "stale" | "weak">("all");
  const [query, setQuery] = useState("");
  const [aiReady, setAiReady] = useState(() => aiConfigured());
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ updated: number; skipped: number } | null>(null);
  const [aiBatch, setAiBatch] = useState(8);

  useEffect(() => subscribeAiConfig(() => setAiReady(aiConfigured())), []);

  // هدفِ پیش‌فرض: سؤال‌های بدون پاسخنامهٔ AI (علامت‌خورده‌ها هرگز فرستاده نمی‌شوند)
  const aiTargets = useMemo(() => questionsNeedingAi(state.cardQuestions ?? [], aiBatch), [state.cardQuestions, aiBatch]);

  const runAi = async () => {
    const items: AiQuestionInput[] = [];
    for (const q of aiTargets) {
      const card = cardById.get(q.cardId);
      if (card) items.push({ question: q, card });
    }
    if (items.length === 0) return;
    setAiBusy(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await aiEnrichQuestions(items);
      if (res.updated.length > 0) {
        saveCardQuestions(res.updated);
        toast(`پاسخنامهٔ ${toFa(res.updated.length)} سؤال با AI نوشته شد`, "🤖");
      }
      setAiResult({ updated: res.updated.length, skipped: res.skipped.length });
      if (res.error) setAiError(res.error);
    } finally {
      setAiBusy(false);
    }
  };

  const cardById = useMemo(() => new Map(state.flashcards.map((c) => [c.id, c])), [state.flashcards]);
  const attemptsByQuestion = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    for (const a of state.cardAttempts ?? []) {
      if (!a.questionId) continue;
      const row = map.get(a.questionId) ?? { total: 0, correct: 0 };
      row.total += 1;
      if (a.correct) row.correct += 1;
      map.set(a.questionId, row);
    }
    return map;
  }, [state.cardAttempts]);

  const rows = useMemo(() => {
    let list = [...(state.cardQuestions ?? [])];
    if (filter === "flagged") list = list.filter((q) => q.status === "flagged");
    if (filter === "stale") list = list.filter((q) => !questionIsValid(q, cardById.get(q.cardId)));
    if (filter === "weak") {
      list = list.filter((q) => {
        const s = attemptsByQuestion.get(q.id);
        return s && s.total >= 2 && s.correct / s.total < 0.6;
      });
    }
    const q = query.trim();
    if (q) {
      list = list.filter(
        (x) =>
          x.prompt.includes(q) ||
          x.explanation?.includes(q) ||
          cardById.get(x.cardId)?.front.includes(q) ||
          (x.topicId != null && topicById.get(x.topicId)?.name.includes(q)),
      );
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [state.cardQuestions, filter, query, cardById, attemptsByQuestion, topicById]);

  const staleCount = (state.cardQuestions ?? []).filter((q) => !questionIsValid(q, cardById.get(q.cardId))).length;
  const flaggedCount = (state.cardQuestions ?? []).filter((q) => q.status === "flagged").length;

  return (
    <Modal open={open} onClose={onClose} title="🧠 بانک سؤال">
      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
        سؤال‌ها از کارت‌ها ساخته و همین‌جا ذخیره می‌شوند؛ آفلاین می‌مانند و با ویرایش کارت «کهنه» می‌شوند.
        پاسخنامه‌های آفلاین از محتوای همان کارت آمده‌اند و جای منبع را نمی‌گیرند.
      </div>
      <Card className="!p-3 mb-3 !bg-indigo-50/60 dark:!bg-indigo-900/15 !border-indigo-200/70 dark:!border-indigo-800/50">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-indigo-800 dark:text-indigo-200">🤖 پاسخنامه و گزینه‌های بهتر با AI (اختیاری)</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
              پاسخ درست همیشه از خودِ کارت می‌آید؛ AI فقط توضیح می‌نویسد و می‌تواند گزینه‌های انحرافیِ بهتری پیشنهاد دهد.
              هر گزینهٔ پیشنهادی با فیلترهای آفلاین بررسی می‌شود و اگر رد شود، سؤال دست‌نخورده می‌ماند. خروجی AI «غیرقطعی» است.
            </div>
          </div>
          <span className={cn("text-[10px] px-2 py-1 rounded-full shrink-0 font-medium", aiReady ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300")}>
            {aiReady ? "وصل است" : "وصل نیست"}
          </span>
        </div>
        {aiReady ? (
          <>
            <div className="flex items-end gap-2 mt-2.5">
              <label className="text-[10px] text-slate-500 dark:text-slate-400">
                تعداد در هر درخواست
                <select
                  className={cn(inputClass, "mt-1 text-xs py-1.5 w-24")}
                  value={aiBatch}
                  onChange={(e) => setAiBatch(Number(e.target.value))}
                >
                  {[5, 8, 12, 20].map((n) => (
                    <option key={n} value={n}>{toFa(n)}</option>
                  ))}
                </select>
              </label>
              <Button size="sm" disabled={aiBusy || aiTargets.length === 0} onClick={runAi}>
                {aiBusy ? "در حال نوشتن…" : `🤖 نوشتن پاسخنامه (${toFa(aiTargets.length)})`}
              </Button>
              {aiTargets.length === 0 && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">همهٔ سؤال‌ها پاسخنامهٔ AI دارند</span>}
            </div>
            {aiError && <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5 leading-relaxed">⚠️ {aiError} — پاسخنامهٔ آفلاین سر جایش است.</div>}
            {aiResult && !aiError && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                ✅ {toFa(aiResult.updated)} سؤال به‌روز شد
                {aiResult.skipped > 0 && <> · {toFa(aiResult.skipped)} سؤال خروجیِ قابل‌استفاده نگرفت</>}
              </div>
            )}
            <div className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              هر درخواست چند سؤال را یک‌جا می‌فرستد (هزینهٔ کمتر). فقط سؤال‌های همین دستگاه به سرویسِ خودت می‌روند.
            </div>
          </>
        ) : (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            برای فعال‌کردن: تنظیمات ← دستیار هوشمند. تا آن موقع، پاسخنامهٔ آفلاین از خود کارت ساخته می‌شود.
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: "all", label: `همه (${toFa((state.cardQuestions ?? []).length)})` },
            { id: "weak", label: "ضعیف" },
            { id: "flagged", label: `🚩 علامت‌دار (${toFa(flaggedCount)})` },
            { id: "stale", label: `♻️ کهنه (${toFa(staleCount)})` },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "text-[11px] px-2.5 py-1.5 rounded-lg border",
              filter === f.id ? "border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "border-slate-200 dark:border-slate-600 text-slate-500",
            )}
          >
            {f.label}
          </button>
        ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          title="خروجی سؤال‌ها برای Anki (Basic) — در Anki: File ← Import"
          onClick={() => {
            const out = ankiFromQuestions(state.cardQuestions ?? [], state.topics, state.subjects);
            if (out.count === 0) {
              toast("سؤال قابل خروجی پیدا نشد", "⚠️");
              return;
            }
            if (downloadTextFile(`anki-questions-${todayKey()}.txt`, out.text, "text/plain")) {
              toast(`${toFa(out.count)} سؤال برای Anki دانلود شد`, "📤");
            } else toast("دانلود ممکن نشد", "⚠️");
          }}
        >
          📤 Anki
        </Button>
      </div>
      <input className={cn(inputClass, "text-xs mb-2")} placeholder="جستجو در صورت سؤال، پاسخنامه یا کارت منبع…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto">
        {rows.length === 0 && <div className="text-xs text-slate-400 text-center py-5">سؤالی با این فیلتر نیست.</div>}
        {rows.slice(0, 80).map((q) => {
          const card = cardById.get(q.cardId);
          const valid = questionIsValid(q, card);
          const stats = attemptsByQuestion.get(q.id);
          return (
            <Card key={q.id} className="!p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2">{q.prompt}</div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 truncate">✅ {q.options[q.correctIndex]}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Chip>{q.kind === "mcq" ? "چهارگزینه‌ای" : "جاخالی"}</Chip>
                    {q.source === "ai" && (
                      <Chip
                        className="!bg-indigo-100 !text-indigo-700 dark:!bg-indigo-900/40 dark:!text-indigo-300"
                        title={q.aiModel ? `پاسخنامه با ${q.aiModel}` : undefined}
                      >
                        🤖 AI
                      </Chip>
                    )}
                    {q.topicId && <Chip>{topicById.get(q.topicId)?.name ?? "مبحث"}</Chip>}
                    {!valid && <Chip className="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300">♻️ نیاز به بازسازی</Chip>}
                    {q.status === "flagged" && <Chip className="!bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-300">🚩 علامت‌دار</Chip>}
                    {stats && <Chip>{toFa(stats.correct)}/{toFa(stats.total)} درست</Chip>}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 truncate">کارت منبع: {card ? card.front : "— (کارت حذف شده)"}</div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                <Button size="sm" variant="outline" onClick={() => flagCardQuestion(q.id)}>
                  {q.status === "flagged" ? "برداشتن علامت" : "🚩 نامعتبر"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!card}
                  onClick={() => {
                    const res = prepareCardQuestions([q.cardId], q.kind);
                    toast(res.created + res.rebuilt > 0 ? "سؤال بازسازی شد" : "برای این کارت سؤال سالم ساخته نشد", "♻️");
                  }}
                >
                  ♻️ بازسازی
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteCardQuestion(q.id)}>🗑 حذف</Button>
              </div>
              {q.explanation && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 whitespace-pre-wrap leading-relaxed">{q.explanation}</div>}
              {q.source === "ai" && (
                <div className="text-[9px] text-indigo-500 dark:text-indigo-300 mt-1">
                  🤖 نوشتهٔ AI{q.aiModel ? ` (${q.aiModel})` : ""} — غیرقطعی؛ با منبع بررسی کن.
                </div>
              )}
              {card?.note && <div className="text-[10px] text-sky-600 dark:text-sky-400 mt-1">📝 یادداشت من: {card.note}</div>}
            </Card>
          );
        })}
      </div>
    </Modal>
  );
}
