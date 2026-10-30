import { useEffect, useMemo, useRef, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, inputClass } from "./ui";
import SourceCitation from "./SourceCitation";
import { hasCloze, maskCloze, revealCloze } from "../lib/cloze";
import AnnotatedText from "./AnnotatedText";
import { annotationsOf, mapAnnotationsToDisplay, remapAnnotationsForText } from "../lib/annotations";
import { formatJalaliShort, toFa, todayKey } from "../lib/jalali";
import {
  answerKey,
  buildQuizQueue,
  questionIsValid,
  formatClock,
  pickSessionCards,
  qualityForMcq,
  scoreSession,
  type AnswerRecord,
  type QuizItem,
  type SessionMode,
  type SessionOrder,
} from "../lib/cardQuiz";
import { deckCuratedPacks, curatedPendingCount, deckScopedCards } from "../lib/deckScope";
import { BulkAddCuratedButton } from "./BulkAddCuratedButton";
import { SpeechController, defaultSpeechOptions } from "../lib/tts";
import { cn } from "../utils/cn";
import type { TextAnnotation } from "../types";

export interface SessionConfig {
  mode: SessionMode;
  /** ۰ = همهٔ کارت‌های مجموعه */
  count: number;
  onlyDue: boolean;
  order: SessionOrder;
  /** فقط برای آزمون زمان‌دار — به دقیقه */
  timeLimitMin?: number;
  /**
   * 🎯 فهرست دقیقِ کارت‌های همین جلسه (از تنظیماتِ محدوده). اگر باشد، جلسه به‌جای
   * دامنهٔ مجموعه از همین کارت‌ها استفاده می‌کند تا «محدودهٔ انتخابی» عیناً اجرا شود.
   */
  cardIds?: string[];
  /** کلید/برچسب محدوده — برای نمایش در سرصفحه و نتیجه */
  scopeKey?: string;
  scopeLabel?: string;
}

export const SESSION_MODES: { id: SessionMode; label: string; icon: string; desc: string }[] = [
  { id: "classic", label: "مرور کلاسیک", icon: "🃏", desc: "کارت را می‌بینی، برمی‌گردانی و خودت ارزیابی می‌کنی." },
  { id: "mcq", label: "چهارگزینه‌ای", icon: "🅰️", desc: "همان کارت به سؤال چهارگزینه‌ای تبدیل می‌شود؛ پاسخنامهٔ کوتاه هم دارد." },
  { id: "cloze", label: "جاخالی", icon: "✏️", desc: "یک اصطلاح کلیدی پنهان می‌شود و از بین چهار گزینه انتخاب می‌کنی." },
  { id: "timed", label: "آزمون زمان‌دار", icon: "⏱️", desc: "با محدودیت زمانی و نتیجهٔ پایانی؛ مشابه شرایط آزمون." },
  { id: "mixed", label: "ترکیبی", icon: "🎲", desc: "چهارگزینه‌ای و جاخالی یکی‌درمیان؛ برای مرور فعال." },
];

const GRADES: { q: 1 | 3 | 4 | 5; label: string; emoji: string; className: string }[] = [
  { q: 1, label: "بلد نبودم", emoji: "😵", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  { q: 3, label: "سخت", emoji: "😅", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { q: 4, label: "خوب", emoji: "🙂", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  { q: 5, label: "آسون", emoji: "😎", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
];

/** نمایش متن با هایلایت عبارت‌هایی که خودِ کاربر علامت زده — بدون تغییر در محتوای کارت */
export function MarkedText({ text, highlights }: { text: string; highlights?: string[] }) {
  const terms = useMemo(
    () => [...new Set((highlights ?? []).map((h) => h.trim()).filter((h) => h.length >= 2))].sort((a, b) => b.length - a.length),
    [highlights],
  );
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "g"));
  const set = new Set(terms);
  return (
    <>
      {parts.map((part, i) =>
        set.has(part) ? (
          <mark key={i} className="rounded bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-500/40">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** کارت‌های دامنهٔ جلسه — برای پیش‌نمایش «چند کارت داری» در تنظیمات جلسه */
export function useDeckCards(deckKey: string | undefined) {
  const { state } = useStore();
  const { topicById } = useLookups();
  return useMemo(() => deckScopedCards(state.flashcards, deckKey, topicById), [state.flashcards, deckKey, topicById]);
}

/**
 * جلسهٔ فلش‌کارت — یک موتور برای پنج حالت.
 *
 * قواعد مهم:
 *  • وضعیت هر کارت (برگشتن، گزینهٔ انتخاب‌شده، درست/غلط) در `answers` نگه داشته می‌شود؛
 *    رفتن به کارت بعد و برگشت، همان وضعیت را برمی‌گرداند.
 *  • هر کارت در هر جلسه فقط یک‌بار پاسخ داده می‌شود: ثبت پاسخ با کلید یکتا انجام
 *    می‌شود و اگر قبلاً ثبت شده باشد، دوباره نه SM-2 را جلو می‌برد و نه آمار را.
 *  • آزمون زمان‌دار: شمارش معکوس مستقل از کارت‌ها؛ پایان زمان = پایان جلسه.
 */
export default function FlashcardSession({
  deckKey,
  deckTitle,
  config,
  onExit,
}: {
  deckKey?: string;
  deckTitle?: string;
  config: SessionConfig;
  onExit: () => void;
}) {
  const {
    state,
    reviewFlashcard,
    recordCardAttempt,
    saveFlashSession,
    updateCardNote,
    toggleCardBookmark,
    toggleCardNeedsCheck,
    updateCardAnnotations,
    prepareCardQuestions,
    completeReview,
    completeTask,
    toast,
  } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const today = todayKey();
  const [round, setRound] = useState(0);
  const [onlyDue, setOnlyDue] = useState(config.onlyDue);
  /** مرورِ سررسیدشدهٔ همین مبحث که هنوز «انجام دادم» نخورده — پیشنهاد بعد از جلسه */
  const [reviewNudge, setReviewNudge] = useState<null | { reviewId?: string; taskId?: string; state: string }>(null);
  const [retryIds, setRetryIds] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [finished, setFinished] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const startedAtRef = useRef(Date.now());
  const savedRef = useRef(false);
  const timeLimitSec = config.mode === "timed" ? Math.max(60, Math.round((config.timeLimitMin ?? 15) * 60)) : 0;
  const [remainingSec, setRemainingSec] = useState(timeLimitSec);
  const [usedSec, setUsedSec] = useState(0);
  /** 🔊 خواندن کارتِ جاری با موتور گفتارِ گوشی/سرویسِ انتخابی */
  const [speaking, setSpeaking] = useState(false);
  const speakRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    const c = speakRef.current;
    return () => {
      c?.stop();
      c?.dispose();
    };
  }, []);

  // «حوضچهٔ» جلسه فقط در شروع (یا شروع دوباره) ساخته می‌شود؛ ویرایش کارت یا
  // سررسیدشدنش وسط جلسه، صف را کوچک نمی‌کند (باگ قدیمی: پاسخ‌دادن کارت را از
  // صف حذف می‌کرد و جلسه نیمه‌کاره «خالی» می‌شد).
  const queuedIds = useMemo(() => (config.cardIds && config.cardIds.length > 0 ? new Set(config.cardIds) : null), [config.cardIds]);
  const queue = useMemo(() => {
    const scoped = queuedIds
      ? state.flashcards.filter((c) => queuedIds.has(c.id))
      : deckScopedCards(state.flashcards, deckKey, topicById);
    const base = retryIds ? scoped.filter((c) => retryIds.includes(c.id)) : scoped;
    const cards = retryIds
      ? base
      : pickSessionCards(base, {
          today,
          onlyDue,
          count: config.count,
          order: config.order,
          seed: Number(today.replace(/-/g, "")),
        });
    const built = buildQuizQueue(cards, state.cardQuestions ?? [], config.mode, {
      seed: Number(today.replace(/-/g, "")) + round,
    });
    return built;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, retryIds, onlyDue]);

  // تولید تدریجیِ سؤال برای همین جلسه (یک‌بار در شروع؛ نتیجه ذخیره می‌شود و در
  // جلسه‌های بعد همان سؤال‌ها آفلاین استفاده می‌شوند)
  useEffect(() => {
    speakRef.current?.stop();
    setSpeaking(false);
  }, [index]);

  useEffect(() => {
    if (config.mode === "classic") return;
    const missing = queue.items.filter((item) => !item.question).map((item) => item.card.id);
    if (missing.length === 0) return;
    if (config.mode === "mixed") {
      prepareCardQuestions(missing, "mcq");
      prepareCardQuestions(missing, "cloze");
    } else {
      prepareCardQuestions(missing, config.mode === "cloze" ? "cloze" : "mcq");
    }
    // فقط یک‌بار در شروع جلسه
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scopedCards = useMemo(
    () => (queuedIds ? state.flashcards.filter((c) => queuedIds.has(c.id)) : deckScopedCards(state.flashcards, deckKey, topicById)),
    [state.flashcards, deckKey, topicById, queuedIds],
  );
  // سؤال‌های ذخیره‌شده به کارت‌ها «وصل» می‌شوند بدون تغییرِ صف؛ تولید تدریجی هر لحظه
  // که برسد، کارت از حالت کلاسیک به چهارگزینه‌ای/جاخالی ارتقا می‌یابد و پایدار می‌ماند.
  const items: QuizItem[] = useMemo(
    () =>
      queue.items.map((item, i) => {
        if (config.mode === "classic" || item.question) return item;
        const want = config.mode === "mixed" ? (i % 2 === 1 ? "cloze" : "mcq") : config.mode === "cloze" ? "cloze" : "mcq";
        const q = (state.cardQuestions ?? []).find((candidate) => candidate.cardId === item.card.id && candidate.kind === want);
        return q && questionIsValid(q, item.card) ? { card: item.card, mode: want, question: q } : item;
      }),
    [queue, state.cardQuestions, config.mode],
  );
  const total = items.length;

  /** شروع دوبارهٔ جلسه — با اختیار «همهٔ کارت‌ها» یا کارت‌های تازه‌اضافه‌شده */
  const restart = (all = false) => {
    if (all) setOnlyDue(false);
    setRetryIds(null);
    setAnswers({});
    setFlipped({});
    setIndex(0);
    setFinished(false);
    setRemainingSec(timeLimitSec);
    setUsedSec(0);
    startedAtRef.current = Date.now();
    savedRef.current = false;
    setRound((r) => r + 1);
  };

  // تایمر آزمون زمان‌دار
  useEffect(() => {
    if (timeLimitSec <= 0 || finished) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setUsedSec(Math.min(timeLimitSec, elapsed));
      const left = timeLimitSec - elapsed;
      setRemainingSec(Math.max(0, left));
      if (left <= 0) setFinished(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timeLimitSec, finished]);

  // بعد از پایان جلسه، اگر مرورِ سررسیدشده‌ای برای همین مبحث باقی مانده،
  // «انجام دادم» را یک‌تپ پیشنهاد می‌دهیم (تا مبحث دوباره‌کشی «عقب‌افتاده» نشود).
  useEffect(() => {
    if (!finished) return;
    const topicId = deckKey?.startsWith("t:") ? deckKey.slice(2) : undefined;
    if (!topicId) {
      setReviewNudge(null);
      return;
    }
    const todayNow = todayKey();
    const pendingSrs = state.reviews.find((r) => r.status === "pending" && r.topicId === topicId && r.dueDate <= todayNow);
    if (pendingSrs) {
      setReviewNudge({ reviewId: pendingSrs.id, state: "srs" });
      return;
    }
    const pendingTask = state.tasks.find((t) => t.kind === "review" && t.status === "pending" && t.topicId === topicId && t.date <= todayNow);
    setReviewNudge(pendingTask ? { taskId: pendingTask.id, state: "task" } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // ذخیرهٔ نتیجه، فقط یک‌بار
  useEffect(() => {
    if (!finished || savedRef.current) return;
    savedRef.current = true;
    const score = scoreSession(items, answers);
    saveFlashSession({
      startedAt: startedAtRef.current,
      mode: config.mode,
      deckTitle,
      total: score.total,
      answered: score.answered,
      correct: score.correct,
      wrong: score.wrong,
      skipped: score.skipped,
      timeLimitSec: timeLimitSec > 0 ? timeLimitSec : undefined,
      usedSec: timeLimitSec > 0 ? Math.min(timeLimitSec, Math.floor((Date.now() - startedAtRef.current) / 1000)) : Math.floor((Date.now() - startedAtRef.current) / 1000),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (total === 0 && !finished) {
    const scopedCount = scopedCards.length;
    const deckPacks = deckCuratedPacks(deckKey, topicById);
    const pendingBank = curatedPendingCount(deckPacks, state.flashcards);
    return (
      <Card className="py-6">
        <div className="text-center">
          <div className="text-4xl mb-2">🃏</div>
          <div className="font-bold text-slate-800 dark:text-slate-100">
            {scopedCount > 0 ? "الان کارتِ سررسیدشده‌ای نداری" : "برای این مجموعه هنوز کارتی در «کارت‌های من» نیست"}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            {deckTitle && <span className="block">📚 {deckTitle}</span>}
            {scopedCount > 0
              ? `${toFa(scopedCount)} کارت داری؛ همه‌شان مرورشده و سررسیدشان نرسیده.`
              : pendingBank > 0
                ? "کارت‌های منتخب همین مبحث آماده‌اند — با یک تپ اضافه‌شان کن و مرور را همان‌جا شروع کن."
                : "برای همین مبحث از «🃏 کارت‌ها» کارت بساز یا از بانک منتخب‌ها اضافه کن."}
          </div>
        </div>
        <div className="flex flex-col gap-2 mt-5">
          <BulkAddCuratedButton
            packs={deckPacks}
            variant="primary"
            size="lg"
            label={(n) => `⭐ افزودن همه‌ی ${toFa(n)} کارت منتخب و شروع مرور`}
            onAdded={(n) => {
              if (n > 0) restart(true);
            }}
          />
          {scopedCount > 0 && (
            <Button size="lg" variant="secondary" onClick={() => restart(true)}>
              🔁 مرور همه‌ی {toFa(scopedCount)} کارت (حتی غیرسررسید)
            </Button>
          )}
          <Button variant="ghost" onClick={onExit}>بازگشت</Button>
        </div>
        <p className="text-[11px] text-slate-400 mt-4 leading-relaxed text-center">
          کارت‌های بیشتر را از «🃏 کارت‌ها ← بانک منتخب‌ها» می‌توانی تیک بزنی و انتخابی اضافه کنی؛
          بعد از مرور، در تب «مرور» همان مبحث را «✓ انجام دادم» بزن تا زنجیره‌ی مرور جلو برود.
        </p>
      </Card>
    );
  }

  if (finished) {
    const score = scoreSession(items, answers);
    const wrongItems = items.filter((item) => {
      const a = answers[answerKey(item)];
      return a ? !a.correct : false;
    });
    const elapsed = timeLimitSec > 0 ? Math.min(timeLimitSec, usedSec || Math.floor((Date.now() - startedAtRef.current) / 1000)) : Math.floor((Date.now() - startedAtRef.current) / 1000);
    return (
      <div>
        <Card className="text-center py-6">
          <div className="text-4xl mb-2">{score.accuracy != null && score.accuracy >= 80 ? "🏆" : score.accuracy != null && score.accuracy >= 50 ? "🎯" : "📚"}</div>
          <div className="font-extrabold text-lg text-slate-800 dark:text-slate-100">
            {config.mode === "timed" ? "آزمون زمان‌دار تمام شد" : "جلسه تمام شد"}
          </div>
          {(deckTitle || config.scopeLabel) && <div className="text-[11px] text-slate-400 mt-0.5">📚 {deckTitle ?? config.scopeLabel}</div>}
          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 py-2.5">
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-300">{toFa(score.correct)}</div>
              <div className="text-[10px] text-emerald-700/70 dark:text-emerald-400">درست</div>
            </div>
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-900/20 py-2.5">
              <div className="text-lg font-black text-rose-600 dark:text-rose-300">{toFa(score.wrong)}</div>
              <div className="text-[10px] text-rose-700/70 dark:text-rose-400">غلط</div>
            </div>
            <div className="rounded-2xl bg-slate-100 dark:bg-slate-800 py-2.5">
              <div className="text-lg font-black text-slate-600 dark:text-slate-300">{toFa(score.skipped)}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">بی‌پاسخ</div>
            </div>
            <div className="rounded-2xl bg-teal-50 dark:bg-teal-900/20 py-2.5">
              <div className="text-lg font-black text-teal-600 dark:text-teal-300">{score.accuracy == null ? "—" : `${toFa(score.accuracy)}٪`}</div>
              <div className="text-[10px] text-teal-700/70 dark:text-teal-400">عملکرد</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
            <span>⏱️ زمان: {formatClock(elapsed)}</span>
            <span>🃏 {toFa(score.total)} کارت</span>
            <span>{queue.fallback > 0 ? `${toFa(queue.fallback)} کارت بدون سؤال معتبر، کلاسیک شد` : "همهٔ کارت‌ها سؤال معتبر داشتند"}</span>
          </div>
        </Card>

        {reviewNudge && (
          <Card className="mt-3 !bg-teal-50/70 dark:!bg-teal-900/20 !border-teal-200 dark:!border-teal-800/60">
            <div className="text-xs font-bold text-teal-800 dark:text-teal-200">✅ مرورِ «{deckTitle ?? "این مبحث"}» را هم ثبت کن</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
              این مبحث یک مرورِ سررسیدشده دارد. چون همین حالا کارتش را مرور کردی، می‌توانی یک‌تپ «انجام دادم» بزنی تا از فهرستِ عقب‌افتاده‌ها بیرون بیاید.
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {([
                { r: 3 as const, label: "😎 بلد بودم" },
                { r: 2 as const, label: "🙂 خوب بود" },
                { r: 1 as const, label: "😅 ناقص" },
                { r: 0 as const, label: "😵 بلد نبودم" },
              ]).map(({ r, label }) => (
                <Button
                  key={r}
                  size="sm"
                  variant={r >= 2 ? "primary" : "outline"}
                  onClick={() => {
                    if (reviewNudge.reviewId) completeReview(reviewNudge.reviewId, r, reviewNudge.taskId ? { completeTaskIds: [reviewNudge.taskId] } : undefined);
                    else if (reviewNudge.taskId) completeTask(reviewNudge.taskId);
                    setReviewNudge(null);
                    toast("مرور ثبت شد — مبحث از فهرست عقب‌افتاده‌ها بیرون رفت", "✅");
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {wrongItems.length > 0 && (
          <Card className="mt-3">
            <div className="text-xs font-bold text-rose-600 dark:text-rose-300 mb-2">🔁 مرور اشتباه‌ها</div>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {wrongItems.slice(0, 20).map((item) => (
                <div key={item.card.id} className="text-[11px] text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700/60 pb-1.5">
                  <div className="truncate">❌ {revealCloze(item.question?.prompt ?? item.card.front)}</div>
                  <div className="text-emerald-600 dark:text-emerald-300 truncate">✅ {item.question ? item.question.options[item.question.correctIndex] : revealCloze(item.card.back)}</div>
                </div>
              ))}
            </div>
            <Button
              className="w-full mt-3"
              size="sm"
              onClick={() => {
                restart();
                setRetryIds(wrongItems.map((i) => i.card.id));
              }}
            >
              مرور {toFa(wrongItems.length)} کارت اشتباه
            </Button>
          </Card>
        )}

        <div className="flex gap-2 mt-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => restart()}
          >
            🔄 جلسهٔ تازه
          </Button>
          <Button className="flex-1" onClick={onExit}>بازگشت</Button>
        </div>
      </div>
    );
  }

  const item: QuizItem = items[Math.min(index, total - 1)];
  const card = item.card;
  const topic = card.topicId ? topicById.get(card.topicId) : undefined;
  const subject = topic ? subjectOfTopic(topic.id) : undefined;
  const key = answerKey(item);
  // اگر کاربر در فاصلهٔ کوتاهِ قبل از آماده‌شدن سؤال پاسخ داده باشد، همان پاسخ حفظ می‌شود
  const answer = answers[key] ?? answers[`${card.id}:classic`];
  const revealed = item.mode === "classic" ? !!flipped[card.id] : true;
  const currentQuestion = item.question;

  const saveNote = (value: string) => {
    updateCardNote(card.id, value);
    setNoteOpen(false);
  };


  /** ثبت پاسخ — یک‌بار برای هر کارت؛ بازگشت به کارت، ثبت دوباره نمی‌کند */
  const submit = (correct: boolean, selectedIndex: number | null, ms?: number) => {
    if (answers[key] || answers[`${card.id}:classic`]) return;
    setAnswers((cur) => ({ ...cur, [key]: { selectedIndex, correct, ms, answeredAt: Date.now() } }));
    recordCardAttempt({
      cardId: card.id,
      questionId: currentQuestion?.id,
      mode: item.mode === "classic" ? "classic" : item.mode,
      correct,
      selectedIndex: selectedIndex ?? undefined,
      ms,
    });
    reviewFlashcard(card.id, item.mode === "classic" && selectedIndex == null ? 4 : qualityForMcq(correct));
  };

  const chooseOption = (optionIndex: number) => {
    if (!currentQuestion || answers[key]) return;
    submit(optionIndex === currentQuestion.correctIndex, optionIndex);
  };

  const go = (delta: number) => {
    const next = Math.max(0, Math.min(total - 1, index + delta));
    setIndex(next);
    setNoteDraft(items[next]?.card.note ?? "");
    setNoteOpen(false);
  };

  const displayAnnotations = {
    front: mapAnnotationsToDisplay(annotationsOf(card, "front"), revealCloze(card.front), "front"),
    back: mapAnnotationsToDisplay(annotationsOf(card, "back"), revealCloze(card.back), "back"),
  };

  /**
   * ذخیرهٔ نشانه‌گذاری‌ها از داخل جلسه. آفست‌های رندرشده (متنِ بدون جاخالی) با جست‌وجوی
   * متن به آفست‌های متنِ خامِ کارت برمی‌گردند تا با ویرایش/نمایشِ بعدی هم بخوانند.
   */
  const saveAnnotations = (next: TextAnnotation[]) => {
    // هر AnnotatedText فقط یک سمت را برمی‌گرداند؛ نشانه‌گذاری‌های سمت دیگر باید بمانند
    const touched = new Set(next.map((a) => a.side));
    const preserved = (card.annotations ?? []).filter((a) => !touched.has(a.side));
    const frontRaw = next.filter((a) => a.side === "front");
    const backRaw = next.filter((a) => a.side === "back");
    const frontMapped = remapAnnotationsForText(frontRaw, card.front, "front");
    const backMapped = remapAnnotationsForText(backRaw, card.back, "back");
    updateCardAnnotations(card.id, [...preserved, ...frontMapped.filter((a) => a.side === "front"), ...backMapped.filter((a) => a.side === "back")]);
  };

  const correctLabel = currentQuestion ? currentQuestion.options[currentQuestion.correctIndex] : "";
  const isLast = index >= total - 1;
  const answeredCount = Object.keys(answers).length;

  return (
    <div>
      {/* نوار بالا */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
          کارت {toFa(index + 1)} از {toFa(total)}
          {(deckTitle || config.scopeLabel) && <span className="mr-1.5 px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 truncate max-w-[9rem]">📚 {deckTitle ?? config.scopeLabel}</span>}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {config.mode === "timed" && (
            <span className={cn("text-xs font-bold tabular-nums", remainingSec <= 60 ? "text-rose-600 dark:text-rose-400 animate-pulse" : "text-amber-600 dark:text-amber-400")}>
              ⏳ {formatClock(remainingSec)}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300">
            {SESSION_MODES.find((m) => m.id === config.mode)?.icon} {SESSION_MODES.find((m) => m.id === config.mode)?.label}
          </span>
          <button
            type="button"
            onClick={() => {
              if (speaking) {
                speakRef.current?.stop();
                setSpeaking(false);
                return;
              }
              const cardNow = queue.items[index]?.card;
              if (!cardNow) return;
              const text = revealed ? `${revealCloze(cardNow.front)} . ${revealCloze(cardNow.back)}` : revealCloze(cardNow.front);
              speakRef.current?.dispose();
              const c = new SpeechController();
              c.setOptions({ ...defaultSpeechOptions(state.settings.tts), mode: "rapid", answerPauseSec: 0, cardGapSec: 0, repeat: 1, autoNext: false });
              c.setItems([{ id: cardNow.id, title: "", question: text }]);
              c.subscribe((st) => setSpeaking(st.playing));
              speakRef.current = c;
              void c.play(0);
            }}
            className={cn("text-xs px-1 rounded-lg", speaking ? "text-teal-600 dark:text-teal-300 font-bold" : "text-slate-400")}
            title="خواندن همین کارت با صدای گوشی"
            aria-label="خواندن کارت"
          >
            {speaking ? "⏹" : "🔊"}
          </button>
          <button type="button" onClick={onExit} className="text-xs text-slate-400">پایان</button>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mb-4 overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${((index + (answer ? 1 : 0)) / total) * 100}%` }} />
      </div>

      {/* کارت */}
      <div className="w-full text-right rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 min-h-56 flex flex-col">
        {(subject || topic || card.origin === "curated") && (
          <div className="flex items-center gap-2 mb-3">
            {subject && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subject.color }} />}
            <span className="text-[11px] text-slate-400 truncate">{topic?.name ?? subject?.name}</span>
            {card.origin === "curated" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 shrink-0">⭐ منتخب</span>}
            {card.bookmark && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shrink-0">🔖 مرور مجدد</span>}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center">
          {item.mode === "classic" ? (
            <div className="text-right w-full">
              {revealed ? (
                <>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    <AnnotatedText
                      text={revealCloze(card.front)}
                      annotations={displayAnnotations.front}
                      side="front"
                      editable
                      onChange={saveAnnotations}
                      placeholderHint="یک واژه یا عبارت را انتخاب کن تا هایلایت/زیرخط/یادداشت بگذاری"
                    />
                  </div>
                  <hr className="my-4 border-slate-100 dark:border-slate-700" />
                  <div className="text-base text-slate-600 dark:text-slate-300">
                    <AnnotatedText
                      text={revealCloze(card.back)}
                      annotations={displayAnnotations.back}
                      side="back"
                      editable
                      onChange={saveAnnotations}
                    />
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => setFlipped((f) => ({ ...f, [card.id]: !f[card.id] }))} className="text-right w-full">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
                    {maskCloze(card.front)}
                    {hasCloze(card.front) && <span className="text-teal-600 dark:text-teal-400 text-[11px] font-normal"> (جاخالی)</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-4">برای دیدن پاسخ لمس کن 👆</div>
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="text-[10px] text-violet-500 dark:text-violet-300 mb-1.5">
                {item.mode === "cloze" ? "✏️ جای خالی را کامل کن" : "🅰️ گزینهٔ درست را انتخاب کن"}
              </div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                <MarkedText text={currentQuestion?.prompt ?? maskCloze(card.front)} highlights={card.highlights} />
              </div>
              <div className="grid gap-2 mt-4">
                {(currentQuestion?.options ?? []).map((option, i) => {
                  const chosen = answer?.selectedIndex === i;
                  const isCorrect = currentQuestion ? i === currentQuestion.correctIndex : false;
                  const show = !!answer;
                  return (
                    <button
                      key={`${option}-${i}`}
                      type="button"
                      disabled={show}
                      onClick={() => chooseOption(i)}
                      className={cn(
                        "text-right rounded-xl border px-3 py-2.5 text-sm transition-colors",
                        !show && "border-slate-200 dark:border-slate-600 hover:border-teal-400 active:scale-[0.99]",
                        show && isCorrect && "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 font-bold",
                        show && chosen && !isCorrect && "border-rose-400 bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200",
                        show && !chosen && !isCorrect && "border-slate-200 dark:border-slate-700 opacity-60",
                      )}
                    >
                      <span className="inline-block w-5 text-slate-400">{toFa(i + 1)}.</span> {option}
                      {show && isCorrect && " ✅"}
                      {show && chosen && !isCorrect && " ❌"}
                    </button>
                  );
                })}
              </div>
              {!currentQuestion && <div className="text-[11px] text-slate-400 mt-2">این کارت سؤال معتبر ندارد؛ در حالت کلاسیک نمایش داده می‌شود.</div>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <Chip>فاصله: {toFa(card.intervalDays)} روز</Chip>
          <Chip>EF {toFa(card.ef.toFixed(2))}</Chip>
          {card.note && <Chip className="!bg-sky-100 !text-sky-700 dark:!bg-sky-900/40 dark:!text-sky-300">📝 یادداشت</Chip>}
          {(card.annotations?.length ?? 0) + (card.highlights?.length ?? 0) > 0 && (
            <Chip className="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300">
              🖍 {toFa(annotationsOf(card, "front").length + annotationsOf(card, "back").length)} نشانه‌گذاری
            </Chip>
          )}
          {card.sourceQuestion && (
            <Chip
              className="!bg-teal-100 !text-teal-700 dark:!bg-teal-900/40 dark:!text-teal-300"
              title={`${card.sourceQuestion.stem}\n(${card.sourceQuestion.examType === "residency" ? "دستیاری" : "پره‌انترنی"} ${toFa(card.sourceQuestion.year)} · ${card.sourceQuestion.topicTitle})`}
            >
              🏥 از سؤال {toFa(card.sourceQuestion.year)}
            </Chip>
          )}
          {card.needsCheck && <Chip className="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300">🚩 بررسی سوال</Chip>}
          {card.dueDate > today && <Chip>{formatJalaliShort(card.dueDate)}</Chip>}
        </div>
      </div>

      {/* پاسخنامه / بازخورد */}
      {item.mode !== "classic" && answer && (
        <Card className={cn("mt-3 !p-3", answer.correct ? "!bg-emerald-50/70 dark:!bg-emerald-900/20 !border-emerald-200" : "!bg-rose-50/60 dark:!bg-rose-900/20 !border-rose-200")}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={cn("text-xs font-bold", answer.correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>
              {answer.correct ? "✅ درست" : "❌ اشتباه"}
            </span>
            {currentQuestion && <span className="text-[10px] text-slate-500 dark:text-slate-400">پاسخ درست: {correctLabel}</span>}
          </div>
          {currentQuestion?.explanation && (
            <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{currentQuestion.explanation}</div>
          )}
          {currentQuestion?.source === "offline" && (
            <div className="text-[10px] text-slate-400 mt-1">این پاسخنامه از محتوای کارت ساخته شده؛ جای بررسی با منبع را نمی‌گیرد.</div>
          )}
          {currentQuestion?.source === "ai" && (
            <div className="text-[10px] text-indigo-500 dark:text-indigo-300 mt-1 leading-relaxed">
              🤖 این پاسخنامه با AI نوشته شده و غیرقطعی است؛ برای آزمون واقعی با منبع بررسی کن.
              {currentQuestion.aiModel ? ` (مدل: ${currentQuestion.aiModel})` : ""}
            </div>
          )}
        </Card>
      )}

      <SourceCitation evidence={card.evidence} />

      {/* ابزارهای شخصی‌سازی — مستقل از محتوای اصلی کارت */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        <button
          type="button"
          onClick={() => {
            setNoteDraft(card.note ?? "");
            setNoteOpen((v) => !v);
          }}
          className={cn("text-[11px] px-2.5 py-1.5 rounded-lg border", card.note ? "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" : "border-slate-200 dark:border-slate-600 text-slate-500")}
        >
          📝 {card.note ? "ویرایش یادداشت" : "یادداشت من"}
        </button>
        <button
          type="button"
          onClick={() => toggleCardBookmark(card.id)}
          className={cn("text-[11px] px-2.5 py-1.5 rounded-lg border", card.bookmark ? "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "border-slate-200 dark:border-slate-600 text-slate-500")}
        >
          🔖 {card.bookmark ? "در فهرست مرور مجدد" : "نیاز به مرور مجدد"}
        </button>
      </div>

      {noteOpen && (
        <Card className="mt-2 !p-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
            یادداشت شخصی — جدا از متن کارت ذخیره می‌شود و کارت مشترک را تغییر نمی‌دهد.
          </div>
          <textarea
            className={cn(inputClass, "min-h-[64px] text-sm")}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="مثلاً: این نکته را با دوز و عوارض گره بزن…"
          />
          <div className="flex gap-1.5 mt-2">
            <Button size="sm" onClick={() => saveNote(noteDraft)}>ذخیرهٔ یادداشت</Button>
            {card.note && <Button size="sm" variant="ghost" onClick={() => saveNote("")}>حذف یادداشت</Button>}
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>بستن</Button>
          </div>
        </Card>
      )}

      {/* ارزیابی کلاسیک */}
      {item.mode === "classic" && (
        answer ? (
          <div className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
            ثبت شد — {answer.correct ? "درست" : "نیاز به تکرار"} · برای تغییر، جلسهٔ تازه شروع کن.
          </div>
        ) : revealed ? (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {GRADES.map((g) => (
              <button
                key={g.q}
                type="button"
                onClick={() => submit(g.q >= 3, null)}
                className={cn("rounded-2xl py-3 font-bold text-sm active:scale-95 transition", g.className)}
              >
                {g.emoji} {g.label}
              </button>
            ))}
          </div>
        ) : (
          <Button size="lg" className="w-full mt-3" onClick={() => setFlipped((f) => ({ ...f, [card.id]: true }))}>
            نمایش پاسخ
          </Button>
        )
      )}

      {item.mode === "classic" && revealed && !answer && (
        <button
          type="button"
          onClick={() => {
            toggleCardNeedsCheck(card.id);
            toast(card.needsCheck ? "علامت بررسی برداشته شد" : "به فهرست «بررسی سوال» اضافه شد — از «همه‌ی کارت‌ها» ویرایشش کن", "🚩");
          }}
          className={cn(
            "w-full mt-2.5 py-2.5 rounded-xl text-xs font-medium border transition-colors",
            card.needsCheck
              ? "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:border-amber-300 hover:text-amber-600",
          )}
        >
          🚩 {card.needsCheck ? "علامت «بررسی سوال» فعال — برداشتن" : "بررسی سوال — ممکنه جواب اشتباه باشه"}
        </button>
      )}

      {config.mode === "timed" && !isLast && (
        <Button variant="outline" className="w-full mt-3" onClick={() => setFinished(true)}>
          🏁 پایان آزمون و دیدن نتیجه
        </Button>
      )}

      {/* ناوبری */}
      <div className="flex items-center gap-2 mt-4">
        <Button variant="secondary" className="flex-1" disabled={index === 0} onClick={() => go(-1)}>
          ◀ قبلی
        </Button>
        <div className="text-[10px] text-slate-400 text-center min-w-16">
          {toFa(answeredCount)}/{toFa(total)} پاسخ
        </div>
        {isLast ? (
          <Button className="flex-1" onClick={() => setFinished(true)}>پایان و نتیجه</Button>
        ) : (
          <Button className="flex-1" onClick={() => go(1)}>بعدی ▶</Button>
        )}
      </div>
      <button type="button" onClick={onExit} className="w-full text-center text-[11px] text-slate-400 mt-3">
        پایان جلسه (بدون نتیجه)
      </button>
    </div>
  );
}
