import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Card, Chip, ProgressBar, RingProgress, StatTile } from "./ui";
import { BANK_EXAM_LABEL, scoreBankSession } from "../lib/examBank";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import type { BankExamType, BankQuestion } from "../types";

export type BankRunMode = "practice" | "exam" | "timed";

export interface BankRun {
  questions: BankQuestion[];
  mode: BankRunMode;
  examType?: BankExamType | "mixed";
  source: "online" | "sample";
  /** ثانیه به‌ازای هر سؤال در حالت زمان‌دار */
  secPerQuestion?: number;
  /** عنوان کوتاه جلسه برای سرصفحه */
  title?: string;
}

/**
 * 🏥 جلسهٔ آزمون بانک — سه حالت:
 *  • تمرینی: بعد از هر انتخاب، پاسخ درست + پاسخنامه فوراً نشان داده می‌شود.
 *  • آزمونی: بدون بازخورد؛ رفت‌وبرگشت بین سؤال‌ها و «پایان آزمون» دستی.
 *  • زمان‌دار: مثل آزمون + شمارش معکوس (۹۰ ثانیه برای هر سؤال، قابل تغییر).
 * هر پاسخ همان لحظه به‌صورت متادیتای کوچک ذخیره می‌شود؛ متن سؤال‌ها فقط در حافظهٔ
 * همین جلسه است و با خروج پاک می‌شود (فقط نتیجه و پاسخ‌ها می‌مانند).
 */
export default function ExamBankSession({ run, onExit, onRestart }: { run: BankRun; onExit: () => void; onRestart: (questions: BankQuestion[]) => void }) {
  const { recordBankAnswer, saveBankSession, toggleBankBookmark, state, addFlashcardsFromQuestion, toast } = useStore();
  const questions = run.questions;
  const startedAt = useRef(Date.now()).current;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selectedIndex: number | null; correct: boolean }>>({});
  const [finished, setFinished] = useState(false);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(run.mode === "timed" ? (run.secPerQuestion ?? 90) * questions.length : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [savedSession, setSavedSession] = useState(false);
  const startedQuestionAt = useRef(Date.now());
  const bookmarks = useMemo(() => new Set(state.examBankBookmarks ?? []), [state.examBankBookmarks]);
  const current = questions[index];
  const instant = run.mode === "practice";
  const answer = current ? answers[current.id] : undefined;

  // شمارش معکوس
  useEffect(() => {
    if (remaining == null || finished) return;
    if (remaining <= 0) {
      setFinished(true);
      return;
    }
    const id = setTimeout(() => setRemaining((r) => (r == null ? r : r - 1)), 1000);
    return () => clearTimeout(id);
  }, [remaining, finished]);

  useEffect(() => {
    startedQuestionAt.current = Date.now();
    setPicked([]);
  }, [index]);

  // ذخیرهٔ نتیجه دقیقاً یک‌بار در پایان
  useEffect(() => {
    if (!finished || savedSession) return;
    setSavedSession(true);
    // جلسهٔ بی‌پاسخ (مثلاً خروجِ فوری) در تاریخچه ذخیره نمی‌شود
    if (Object.keys(answers).length === 0) return;
    const result = scoreBankSession(questions, answers, {
      startedAt,
      usedSec: (Date.now() - startedAt) / 1000,
      examType: run.examType,
      source: run.source,
    });
    saveBankSession(result);
  }, [finished, savedSession, questions, answers, run.examType, run.source, startedAt, saveBankSession]);

  const choose = (optionIndex: number) => {
    if (!current || answer) return; // پاسخ هر سؤال یک‌بار ثبت می‌شود؛ نه دوباره و نه تغییرپذیر
    const correct = optionIndex === current.correctIndex;
    setAnswers((a) => ({ ...a, [current.id]: { selectedIndex: optionIndex, correct } }));
    recordBankAnswer(current, optionIndex, correct, Date.now() - startedQuestionAt.current);
    if (instant) return;
    // در حالت آزمونی: با انتخاب، فقط انتخاب ثبت می‌شود؛ رفتن به بعدی دستی است
  };

  /** رد کردن سؤال = «بی‌پاسخ»؛ نه پاسخی ثبت می‌شود نه غلط حساب می‌شود */
  const skip = () => setIndex((i) => Math.min(i + 1, questions.length - 1));

  const answeredCount = Object.keys(answers).length;
  const score = useMemo(() => {
    const rows = questions.map((q) => ({ q, a: answers[q.id] }));
    return {
      correct: rows.filter((r) => r.a?.correct).length,
      wrong: rows.filter((r) => r.a && !r.a.correct).length,
      skipped: rows.filter((r) => !r.a).length,
      byTopic: Object.values(
        rows.reduce<Record<string, { topic: string; total: number; correct: number }>>((acc, r) => {
          const row = acc[r.q.topicId] ?? { topic: r.q.topicTitle, total: 0, correct: 0 };
          row.total += 1;
          if (r.a?.correct) row.correct += 1;
          acc[r.q.topicId] = row;
          return acc;
        }, {}),
      ).sort((a, b) => a.correct / Math.max(1, a.total) - b.correct / Math.max(1, b.total)),
    };
  }, [questions, answers]);

  // ---------- پایان جلسه ----------
  if (finished) {
    const pct = Math.round((score.correct / Math.max(1, questions.length)) * 100);
    const wrongQuestions = questions.filter((q) => answers[q.id] && !answers[q.id].correct);
    const list = onlyWrong ? wrongQuestions : questions;
    return (
      <div className="pb-6">
        <Card className="text-center">
          <div className="flex justify-center mb-2">
            <RingProgress value={pct} color={pct >= 70 ? "#0d9488" : pct >= 50 ? "#f59e0b" : "#e11d48"}>
              <div>
                <div className="text-2xl font-black">{toFa(pct)}٪</div>
                <div className="text-[10px] text-slate-400">دقت</div>
              </div>
            </RingProgress>
          </div>
          <div className="font-bold text-sm mb-1">{run.title ?? "نتیجهٔ آزمون"}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
            {toFa(score.correct)} درست · {toFa(score.wrong)} غلط · {toFa(score.skipped)} بی‌پاسخ · از {toFa(questions.length)} سؤال
            {run.source === "sample" && " · مجموعهٔ نمونهٔ داخلی"}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <StatTile icon="✅" label="درست" value={toFa(score.correct)} />
            <StatTile icon="❌" label="غلط" value={toFa(score.wrong)} />
            <StatTile icon="⬜" label="بی‌پاسخ" value={toFa(score.skipped)} />
          </div>
          {score.byTopic.length > 1 && (
            <div className="mt-3 text-right space-y-1.5">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">به تفکیک مبحث</div>
              {score.byTopic.map((t) => {
                const p = Math.round((t.correct / Math.max(1, t.total)) * 100);
                return (
                  <div key={t.topic} className="text-[11px]">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-slate-600 dark:text-slate-300">{t.topic}</span>
                      <span className={cn("font-bold", p >= 70 ? "text-teal-600" : p >= 50 ? "text-amber-600" : "text-rose-600")}>
                        {toFa(t.correct)}/{toFa(t.total)} · {toFa(p)}٪
                      </span>
                    </div>
                    <ProgressBar value={p} height="h-1.5" color={p >= 70 ? "#0d9488" : p >= 50 ? "#f59e0b" : "#e11d48"} />
                  </div>
                );
              })}
            </div>
          )}
          {score.byTopic.length > 0 && score.byTopic[0].correct / Math.max(1, score.byTopic[0].total) < 0.6 && (
            <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[10px] text-amber-800 dark:text-amber-200 text-right leading-relaxed">
              📌 ضعیف‌ترین مبحث: «{score.byTopic[0].topic}» — از پاسخنامهٔ همین سؤال‌ها فلش‌کارت بساز و چند روز بعد مرور کن.
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
            <Button variant={onlyWrong ? "secondary" : "outline"} size="sm" onClick={() => setOnlyWrong((v) => !v)}>
              {onlyWrong ? "همهٔ سؤال‌ها" : `فقط ${toFa(wrongQuestions.length)} غلط`}
            </Button>
            {wrongQuestions.length > 0 && (
              <Button size="sm" onClick={() => onRestart(wrongQuestions)}>
                🔁 مرور غلط‌ها
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => onRestart(questions)}>
              🔄 همین آزمون دوباره
            </Button>
            <Button size="sm" variant="ghost" onClick={onExit}>
              خروج
            </Button>
          </div>
        </Card>

        <div className="mt-3 space-y-2">
          {list.map((q, i) => {
            const a = answers[q.id];
            const points = q.keyPoints ?? [];
            return (
              <Card key={q.id} className="!p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] font-bold leading-relaxed flex-1">
                    <span className={cn("inline-block w-5 h-5 rounded-md text-center leading-5 ml-1", a?.correct ? "bg-teal-100 text-teal-700" : a ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500")}>
                      {a?.correct ? "✓" : a ? "✕" : "—"}
                    </span>
                    {toFa(i + 1)}. {q.stem}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBankBookmark(q.id)}
                    className={cn("shrink-0 text-base", bookmarks.has(q.id) ? "opacity-100" : "opacity-30")}
                    aria-label="نشان‌دارکردن سؤال"
                    title="نشان‌دار برای مرور مجدد"
                  >
                    🔖
                  </button>
                </div>
                <div className="mt-1.5 space-y-1">
                  {q.options.map((opt, oi) => (
                    <div
                      key={oi}
                      className={cn(
                        "text-[11px] px-2 py-1 rounded-lg border",
                        oi === q.correctIndex
                          ? "border-teal-400 bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200 font-bold"
                          : a?.selectedIndex === oi
                            ? "border-rose-300 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300"
                            : "border-slate-200 dark:border-slate-700 text-slate-500",
                      )}
                    >
                      {["۱", "۲", "۳", "۴"][oi]}) {opt}
                      {oi === q.correctIndex && " ✓"}
                    </div>
                  ))}
                </div>
                {q.explanation && (
                  <details className="mt-1.5" open={onlyWrong ? true : undefined}>
                    <summary className="text-[10px] text-indigo-600 dark:text-indigo-300 cursor-pointer">📝 پاسخنامه</summary>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-1 whitespace-pre-line">{q.explanation}</p>
                    {q.sourceRef && <div className="text-[10px] text-slate-400 mt-1">منبع: {q.sourceRef}</div>}
                  </details>
                )}
                {points.length > 0 && (
                  <div className="mt-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">🧠 نکات کلیدی — به فلش‌کارت تبدیل کن</div>
                    <div className="flex flex-col gap-1">
                      {points.map((p) => {
                        const key = `${q.id}|${p}`;
                        const on = picked.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setPicked((list) => (on ? list.filter((x) => x !== key) : [...list, key]))}
                            className={cn("text-right text-[11px] px-2 py-1 rounded-lg border leading-relaxed", on ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200" : "border-slate-200 dark:border-slate-700 text-slate-500")}
                          >
                            {on ? "☑" : "☐"} {p}
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      size="sm"
                      className="mt-1.5 w-full"
                      disabled={picked.filter((k) => k.startsWith(`${q.id}|`)).length === 0}
                      onClick={() => {
                        const chosen = picked.filter((k) => k.startsWith(`${q.id}|`)).map((k) => k.slice(q.id.length + 1));
                        const res = addFlashcardsFromQuestion(q, chosen);
                        if (res.added > 0) toast(`${toFa(res.added)} فلش‌کارت از پاسخنامه ساخته شد`, "📌");
                        else toast("این نکته‌ها قبلاً به کارت‌ها اضافه شده‌اند", "ℹ️");
                        setPicked((list) => list.filter((k) => !k.startsWith(`${q.id}|`)));
                      }}
                    >
                      📌 افزودن نکته‌های انتخابی به فلش‌کارت
                    </Button>
                  </div>
                )}
                <div className="text-[10px] text-slate-400 mt-1.5">
                  {BANK_EXAM_LABEL[q.examType]} · {toFa(q.year)} · {q.topicTitle}
                  {q.keyStatus === "doubtful" && " · 🚩 کلید مشکوک"}
                  {bookmarks.has(q.id) && " · 🔖 نشان‌دار"}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- نمایش سؤال ----------
  if (!current) return null;
  const locked = !!answer;
  const minutes = remaining != null ? Math.floor(remaining / 60) : 0;
  const seconds = remaining != null ? remaining % 60 : 0;

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between mb-2">
        <Button size="sm" variant="ghost" onClick={() => setFinished(true)} title="پاسخ‌ها ذخیره می‌شوند و نتیجه نشان داده می‌شود">
          ← پایان و خروج
        </Button>
        <div className="flex items-center gap-1.5">
          {remaining != null && (
            <Chip className={cn("!text-[11px] font-bold", remaining < 60 ? "!bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-300" : "!bg-slate-100 !text-slate-600 dark:!bg-slate-700 dark:!text-slate-300")}>
              ⏱ {toFa(minutes)}:{toFa(String(seconds).padStart(2, "0"))}
            </Chip>
          )}
          <Chip className="!text-[11px] !bg-slate-100 !text-slate-600 dark:!bg-slate-700 dark:!text-slate-300">
            {toFa(index + 1)} / {toFa(questions.length)}
          </Chip>
        </div>
        <button type="button" onClick={() => toggleBankBookmark(current.id)} className={cn("text-lg", bookmarks.has(current.id) ? "opacity-100" : "opacity-30")} aria-label="نشان‌دار">
          🔖
        </button>
      </div>

      <ProgressBar value={((index + 1) / questions.length) * 100} height="h-1.5" />

      <Card className="mt-2">
        <div className="text-[10px] text-slate-400 mb-1">
          {BANK_EXAM_LABEL[current.examType]} {toFa(current.year)} · {current.subject} · {current.topicTitle}
          {run.source === "sample" && " · نمونه"}
          {current.keyStatus === "doubtful" && (
            <span className="mr-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              🚩 کلید مشکوک
            </span>
          )}
        </div>
        <p className="text-sm font-bold leading-relaxed whitespace-pre-line">{current.stem}</p>
        <div className="mt-2 space-y-1.5">
          {current.options.map((opt, oi) => {
            const isPicked = answer?.selectedIndex === oi;
            const isCorrect = locked && oi === current.correctIndex;
            const isWrongPick = locked && isPicked && !answer?.correct;
            return (
              <button
                key={oi}
                type="button"
                aria-label={`${["۱", "۲", "۳", "۴"][oi]}) ${opt}`}
                onClick={() => choose(oi)}
                disabled={!!locked}
                className={cn(
                  "w-full text-right text-[12px] px-3 py-2 rounded-xl border transition-colors flex items-start gap-2",
                  isCorrect
                    ? "border-teal-500 bg-teal-50 dark:bg-teal-900/25 text-teal-900 dark:text-teal-100 font-bold"
                    : isWrongPick
                      ? "border-rose-400 bg-rose-50 dark:bg-rose-900/25 text-rose-800 dark:text-rose-200"
                      : isPicked
                        ? "border-slate-400 bg-slate-100 dark:bg-slate-700 font-bold"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300",
                )}
              >
                <span className="shrink-0 w-5 h-5 rounded-full border text-center text-[10px] leading-5">{["۱", "۲", "۳", "۴"][oi]}</span>
                <span className="flex-1 leading-relaxed">{opt}</span>
              </button>
            );
          })}
        </div>

        {locked && (
          <div className={cn("mt-2 rounded-xl px-3 py-2 text-[11px] leading-relaxed", answer?.correct ? "bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200" : "bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-200")}>
            <div className="font-bold mb-0.5">{answer?.correct ? "✅ درست" : "❌ غلط"}</div>
            {!answer?.correct && <div className="mb-1">پاسخ درست: {current.options[current.correctIndex]}</div>}
            {current.keyStatus === "doubtful" && (
              <div className="mb-1 text-amber-700 dark:text-amber-300">
                🚩 کلید این سؤال در بازبینی «مشکوک» علامت خورده؛ با منبع بررسی کن و اگر مطمئن شدی به‌عنوان بازخورد بفرست.
              </div>
            )}
            {current.explanation && <p className="whitespace-pre-line">{current.explanation}</p>}
            {current.sourceRef && <div className="opacity-70 mt-1">منبع: {current.sourceRef}</div>}
          </div>
        )}
      </Card>

      {/* پالت سؤال‌ها — فقط در حالت آزمونی */}
      {!instant && questions.length <= 60 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "w-7 h-7 rounded-lg text-[10px] font-bold border",
                i === index
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200"
                  : answers[q.id]
                    ? "border-slate-300 bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    : "border-slate-200 dark:border-slate-700 text-slate-400",
              )}
            >
              {toFa(i + 1)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-1.5">
        <Button variant="secondary" className="flex-1" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          ← قبلی
        </Button>
        {instant ? (
          <>
            <Button variant="ghost" onClick={skip} disabled={index === questions.length - 1}>
              بی‌پاسخ
            </Button>
            <Button
              className="flex-2"
              disabled={!answer}
              onClick={() => (index === questions.length - 1 ? setFinished(true) : setIndex((i) => i + 1))}
            >
              {index === questions.length - 1 ? "پایان و نتیجه" : "بعدی →"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={skip}>
              بی‌پاسخ
            </Button>
            {index < questions.length - 1 ? (
              <Button className="flex-1" onClick={() => setIndex((i) => i + 1)}>
                بعدی →
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => setFinished(true)}>
                پایان و نتیجه
              </Button>
            )}
          </>
        )}
      </div>

      {!instant && (
        <button type="button" className="w-full text-[10px] text-slate-400 mt-2" onClick={() => setFinished(true)}>
          پایان زودهنگام آزمون ({toFa(answeredCount)} از {toFa(questions.length)} پاسخ داده شد)
        </button>
      )}
    </div>
  );
}
