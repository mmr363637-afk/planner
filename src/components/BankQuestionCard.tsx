import { useMemo, useState, type ReactNode } from "react";
import { normalizeCardFront, useStore } from "../store";
import { Button, Card, Chip } from "./ui";
import { BANK_EXAM_LABEL } from "../lib/examBank";
import {
  analysisForQuestion,
  hasStructuredAnalysis,
  optionAnalysisFor,
  pointKey,
  teachingPoints,
  type QuestionAnalysis,
} from "../lib/examAnalysis";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import type { BankQuestion } from "../types";

/**
 * 🏥 کارتِ یک سؤالِ بانک — تنها جایی که سؤال/گزینه/پاسخنامه/نکات رندر می‌شود.
 *
 * چرا یک کامپوننتِ مشترک؟ چون ایرادِ نسخهٔ آزمایشی این بود که همین چهار بخش در
 * جاهای مختلف (حالتِ تمرینی، فهرستِ نتیجهٔ آزمون) جداگانه و ناسازگار پیاده شده
 * بودند: گزینه‌ها به شکلِ یک متنِ پیوسته درمی‌آمدند و رنگِ درست/غلط به کلِ کارت
 * می‌رفت. حالا یک ساختارِ واحد است:
 *
 *   ۱) سربرگ   — نوع آزمون، سال، درس، مبحث، وضعیتِ کلید، نشانه
 *   ۲) صورتِ سؤال
 *   ۳) گزینه‌ها — هرکدام در یک ردیفِ مستقل با رنگِ مستقل
 *                    (سبز = پاسخِ درست، قرمز = انتخابِ غلطِ کاربر، خنثی = بقیه)
 *                    تحلیلِ هر گزینه زیرِ ردیفِ خودش، نه در یک پاراگرافِ chung
 *   ۴) پاسخِ تشریحی — کلید، تحلیل، چرا کلید زیر سؤال است، یادداشتِ بازبینی، منبع
 *   ۵) نکاتِ آموزشی — هر نکته جداگانه، با دکمهٔ «افزودن به فلش‌کارت» که واقعاً
 *                    در سیستمِ فلش‌کارتِ اپ (SM-2) ذخیره می‌شود
 *
 * رنگ‌بندی فقط روی همان ردیفِ گزینه اعمال می‌شود؛ کلِ کارت یا کلِ متنِ گزینه‌ها
 * هرگز تغییرِ رنگ نمی‌دهند.
 */

/** شمارهٔ فارسیِ گزینه‌ها */
export const OPTION_NUMBERS = ["۱", "۲", "۳", "۴"] as const;

/** برچسبِ وضعیتِ کلیدِ سؤال — هیچ سؤالی حذف نمی‌شود، فقط شفاف برچسب می‌خورد */
export const KEY_BADGE: Record<"doubtful" | "incorrect", { label: string; cls: string; note: string }> = {
  doubtful: {
    label: "🚩 کلید مشکوک",
    cls: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700",
    note: "کلیدِ این سؤال در بازبینی «مشکوک» علامت خورده؛ با منبع بررسی کن و اگر مطمئن شدی به‌عنوان بازخورد بفرست.",
  },
  incorrect: {
    label: "🚫 کلید نامعتبر",
    cls: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700",
    note: "کلیدِ ذخیره‌شدهٔ این سؤال در بازبینی با منابع ناسازگار بوده؛ متنش برای مرور می‌آید ولی در حالتِ آزمونی کنار گذاشته می‌شود. یادداشتِ بازبینی پایین آمده.",
  },
};

export interface BankAnswerState {
  selectedIndex: number | null;
  correct: boolean;
}

export interface BankQuestionCardProps {
  question: BankQuestion;
  /** پاسخِ ثبت‌شدهٔ کاربر (اگر باشد) */
  answer?: BankAnswerState | null;
  /** نتیجهٔ پاسخ (رنگ‌ها + پاسخنامه + نکات) نشان داده شود؟ */
  reveal: boolean;
  /** کلیک روی گزینه پاسخ ثبت کند؟ */
  interactive?: boolean;
  onChoose?: (index: number) => void;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  /** سرصفحهٔ درس/مبحث/سال نشان داده شود؟ */
  showMeta?: boolean;
  /** برچسبِ شمارهٔ سؤال (مثلاً «۳.») */
  indexLabel?: string;
  /** متنِ راهنمای بالای گزینه‌ها در حالتِ تعاملی */
  prompt?: string;
  /** فهرستِ نتیجه اندازهٔ کوچک‌تری می‌خواهد */
  compact?: boolean;
  /** منبعِ سؤال‌ها — برچسبِ «نمونه» */
  source?: "online" | "sample";
  className?: string;
}

// ---------- رنگ‌بندیِ مستقلِ هر گزینه ----------

interface OptionTone {
  row: string;
  badge: string;
  mark: string;
}

const TONE_NEUTRAL: OptionTone = {
  row: "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-200",
  badge: "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-300",
  mark: "",
};

/** پاسخِ درست — سبز */
const TONE_CORRECT: OptionTone = {
  row: "border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-900 dark:text-teal-100",
  badge: "border-teal-600 bg-teal-600 text-white",
  mark: "✓",
};

/** انتخابِ غلطِ کاربر — قرمز */
const TONE_WRONG: OptionTone = {
  row: "border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-900 dark:text-rose-100",
  badge: "border-rose-600 bg-rose-600 text-white",
  mark: "✕",
};

/** گزینه‌ای که کاربر درست انتخاب کرده — سبز + تأکیدِ «انتخابِ تو» */
const TONE_PICKED_CORRECT: OptionTone = {
  row: "border-teal-600 bg-teal-100/70 dark:bg-teal-900/50 text-teal-950 dark:text-teal-50 ring-2 ring-teal-500/40",
  badge: "border-teal-700 bg-teal-700 text-white",
  mark: "✓",
};

/** گزینهٔ انتخاب‌شده وقتی نتیجه هنوز معلوم نیست (حالتِ آزمونی) */
const TONE_PICKED: OptionTone = {
  row: "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100 ring-2 ring-indigo-400/40",
  badge: "border-indigo-500 bg-indigo-500 text-white",
  mark: "",
};

function toneFor(index: number, question: BankQuestion, answer: BankAnswerState | null | undefined, reveal: boolean): OptionTone {
  const picked = answer?.selectedIndex === index;
  if (!reveal) return picked ? TONE_PICKED : TONE_NEUTRAL;
  const isCorrect = index === question.correctIndex;
  if (isCorrect) return picked ? TONE_PICKED_CORRECT : TONE_CORRECT;
  if (picked) return TONE_WRONG;
  return TONE_NEUTRAL;
}

/** نکته‌هایی که قبلاً به فلش‌کارت تبدیل شده‌اند — برای «✓ اضافه شد» به‌جای کلیکِ دوباره */
const addedKeysCache = new WeakMap<object, Set<string>>();

function useAddedPointKeys(): Set<string> {
  const { state } = useStore();
  const flashcards = state.flashcards;
  return useMemo(() => {
    const holder = flashcards as unknown as object;
    const cached = addedKeysCache.get(holder);
    if (cached) return cached;
    const set = new Set<string>();
    for (const card of flashcards) {
      if (card.sourceKey) set.add(card.sourceKey);
      // کارت‌های قدیمیِ این قابلیت `sourceKey` ندارند؛ با فرانتِ نرمال‌شده می‌شناسیمشان.
      // همان تابعی است که استور برای رفعِ تکرار استفاده می‌کند (`normalizeCardFront`)،
      // پس «قبلاً اضافه شده» در UI دقیقاً همان چیزی است که استور تکراری حساب می‌کند.
      if (card.sourceQuestion) set.add(normalizeCardFront(card.front));
    }
    addedKeysCache.set(holder, set);
    return set;
  }, [flashcards]);
}

/** یک بخشِ جدا از کارت با عنوانِ کوچک — تفکیکِ بصریِ پاسخنامه از گزینه‌ها و نکات */
function Block({ title, tone = "slate", children }: { title: ReactNode; tone?: "slate" | "indigo" | "teal" | "amber"; children: ReactNode }) {
  const tones = {
    slate: "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700",
    indigo: "bg-indigo-50/70 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800",
    teal: "bg-teal-50/70 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800",
    amber: "bg-amber-50/70 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
  } as const;
  const titles = {
    slate: "text-slate-500 dark:text-slate-400",
    indigo: "text-indigo-700 dark:text-indigo-300",
    teal: "text-teal-700 dark:text-teal-300",
    amber: "text-amber-700 dark:text-amber-300",
  } as const;
  return (
    <section className={cn("mt-3 rounded-xl border px-3 py-2.5", tones[tone])}>
      <h4 className={cn("text-[11px] font-extrabold mb-1.5", titles[tone])}>{title}</h4>
      {children}
    </section>
  );
}

export default function BankQuestionCard({
  question,
  answer = null,
  reveal,
  interactive = false,
  onChoose,
  bookmarked = false,
  onToggleBookmark,
  showMeta = true,
  indexLabel,
  prompt,
  compact = false,
  source,
  className,
}: BankQuestionCardProps) {
  const { addFlashcardsFromQuestion, toast } = useStore();
  const analysis: QuestionAnalysis = useMemo(() => analysisForQuestion(question), [question]);
  const points = useMemo(() => teachingPoints(question), [question]);
  const addedKeys = useAddedPointKeys();
  const [pickedPoints, setPickedPoints] = useState<string[]>([]);
  const [justAdded, setJustAdded] = useState<string[]>([]);

  const locked = !interactive || !!answer;
  const keyBadge = question.keyStatus && question.keyStatus !== "confirmed" ? KEY_BADGE[question.keyStatus] : null;
  const duplicateOptions = useMemo(
    () => new Set(question.options.map((o) => o.trim().toLowerCase())).size !== question.options.length,
    [question.options],
  );
  const stemSize = compact ? "text-[12px]" : "text-sm sm:text-[15px]";
  const optionSize = compact ? "text-[11px]" : "text-[12.5px] sm:text-[13.5px]";

  /** آیا این نکته قبلاً فلش‌کارت شده؟ */
  const isAdded = (point: string) => addedKeys.has(pointKey(question.id, point)) || addedKeys.has(normalizeCardFront(`📌 ${point}`));

  const addPoints = (list: string[]) => {
    if (list.length === 0) return;
    const result = addFlashcardsFromQuestion(question, list);
    if (result.added > 0) {
      setJustAdded((prev) => [...new Set([...prev, ...list.slice(0, result.added)])]);
      toast(
        result.skipped > 0
          ? `${toFa(result.added)} فلش‌کارت ساخته شد · ${toFa(result.skipped)} نکته تکراری بود`
          : `${toFa(result.added)} نکته به فلش‌کارت‌ها اضافه شد`,
        "📌",
      );
    } else {
      toast("این نکته‌ها قبلاً به فلش‌کارت‌ها اضافه شده‌اند", "ℹ️");
    }
    setPickedPoints((prev) => prev.filter((p) => !list.includes(p)));
  };

  const keyMismatch =
    reveal && analysis.keyIndex != null && analysis.keyIndex !== question.correctIndex ? analysis.keyIndex : null;

  return (
    <Card className={cn(compact ? "!p-3" : undefined, className)} data-testid="bank-question-card">
      {/* ————————— ۱) سربرگ ————————— */}
      {showMeta && (
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <Chip className="!text-[10px] !px-1.5 !py-0.5 !bg-slate-100 !text-slate-600 dark:!bg-slate-700 dark:!text-slate-300">
              {BANK_EXAM_LABEL[question.examType]} {toFa(question.year)}
            </Chip>
            <span>
              {question.subject} · {question.topicTitle}
            </span>
            {source === "sample" && <span className="text-amber-600 dark:text-amber-400">· نمونهٔ داخلی</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {keyBadge && (
              <span className={cn("px-1.5 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap", keyBadge.cls)} title={keyBadge.note}>
                {keyBadge.label}
              </span>
            )}
            {onToggleBookmark && (
              <button
                type="button"
                onClick={onToggleBookmark}
                aria-label={bookmarked ? "برداشتن نشانِ سؤال" : "نشان‌دارکردن سؤال"}
                title="نشان‌دار برای مرور مجدد"
                className={cn("text-base leading-none", bookmarked ? "opacity-100" : "opacity-30 hover:opacity-60")}
              >
                🔖
              </button>
            )}
          </div>
        </div>
      )}

      {/* ————————— ۲) صورتِ سؤال ————————— */}
      <div className={cn("font-bold leading-relaxed whitespace-pre-line text-slate-800 dark:text-slate-100", stemSize)}>
        {indexLabel && <span className="text-slate-400 ml-1">{indexLabel}</span>}
        {question.stem}
      </div>

      {/* ————————— ۳) گزینه‌ها — هرکدام یک ردیفِ مستقل ————————— */}
      <div className={cn("mt-2.5 space-y-1.5")} role={interactive ? "group" : undefined} aria-label="گزینه‌ها">
        {prompt && !locked && <p className="text-[10px] text-slate-400 mb-1">{prompt}</p>}
        {question.options.map((option, index) => {
          const tone = toneFor(index, question, answer, reveal);
          const picked = answer?.selectedIndex === index;
          const note = reveal ? optionAnalysisFor(analysis, index) : undefined;
          const RowTag = interactive && !locked ? "button" : "div";
          return (
            <div key={index} className="rounded-xl border transition-colors overflow-hidden" data-testid={`option-row-${index}`}>
              <RowTag
                {...(interactive && !locked ? { type: "button" as const, onClick: () => onChoose?.(index) } : {})}
                aria-label={`${OPTION_NUMBERS[index]}) ${option}`}
                disabled={interactive && locked ? true : undefined}
                className={cn(
                  "w-full text-right px-2.5 py-2 flex items-start gap-2",
                  tone.row,
                  interactive && !locked && "hover:brightness-[0.98] active:scale-[0.995] cursor-pointer",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-5 h-5 rounded-full border text-center text-[10px] leading-[18px] font-bold",
                    tone.badge,
                  )}
                  aria-hidden="true"
                >
                  {tone.mark || OPTION_NUMBERS[index]}
                </span>
                <span className={cn("flex-1 leading-relaxed whitespace-pre-line", optionSize, picked && "font-bold")}>{option}</span>
                {picked && (
                  <span className="shrink-0 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-white/70 dark:bg-slate-900/40 border border-current/20">
                    انتخابِ تو
                  </span>
                )}
              </RowTag>
              {/* تحلیلِ همین گزینه — زیرِ ردیفِ خودش، نه در یک متنِ پیوسته با بقیه */}
              {note && (
                <div
                  className={cn(
                    "px-2.5 pb-2 pt-0.5 text-[11px] leading-relaxed border-t border-dashed",
                    note.verdict === "correct"
                      ? "border-teal-300/70 dark:border-teal-700/60 text-teal-800 dark:text-teal-200 bg-teal-50/60 dark:bg-teal-900/20"
                      : note.verdict === "wrong"
                        ? "border-rose-300/70 dark:border-rose-700/60 text-rose-800 dark:text-rose-200 bg-rose-50/50 dark:bg-rose-900/15"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/40",
                  )}
                >
                  <span className="font-bold">
                    {note.verdict === "correct" ? "✔ چرا درست است: " : note.verdict === "wrong" ? "✖ چرا نادرست است: " : "• "}
                  </span>
                  {note.label && note.label !== option ? <span className="opacity-70">{note.label}: </span> : null}
                  {note.text}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {reveal && duplicateOptions && (
        <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">
          ⚠️ در دادهٔ این سؤال دو گزینه با متنِ یکسان هست؛ هیچ‌کدام حذف نشده‌اند تا سؤال از دست نرود.
        </p>
      )}

      {/* ————————— ۴) پاسخِ تشریحی ————————— */}
      {reveal && (
        <>
          <Block
            title={
              <span className="flex items-center gap-1.5 flex-wrap">
                📝 پاسخِ تشریحی
                {answer && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px] font-extrabold border",
                      answer.correct
                        ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-200 border-teal-300 dark:border-teal-700"
                        : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200 border-rose-300 dark:border-rose-700",
                    )}
                  >
                    {answer.correct
                      ? "✅ درست — همان گزینه‌ای که انتخاب کردی"
                      : `❌ غلط — پاسخِ تو گزینهٔ ${OPTION_NUMBERS[answer.selectedIndex ?? 0]} بود`}
                  </span>
                )}
              </span>
            }
            tone="indigo"
          >
            <div className="space-y-1.5 text-[11.5px] leading-relaxed">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-extrabold text-teal-700 dark:text-teal-300">
                  پاسخِ درست: گزینهٔ {OPTION_NUMBERS[question.correctIndex]}
                </span>
                <span className="text-slate-600 dark:text-slate-300">{question.options[question.correctIndex]}</span>
              </div>
              {analysis.keyLine && (
                <p className="text-slate-600 dark:text-slate-300 whitespace-pre-line">{analysis.keyLine}</p>
              )}
              {keyMismatch != null && (
                <p className="text-[10.5px] text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 rounded-lg px-2 py-1">
                  ⚠️ در پاسخنامه «گزینهٔ {OPTION_NUMBERS[keyMismatch]}» به‌عنوان کلید آمده، ولی کلیدِ ذخیره‌شدهٔ بانک «گزینهٔ{" "}
                  {OPTION_NUMBERS[question.correctIndex]}» است. رنگ‌بندیِ بالا بر اساسِ کلیدِ ذخیره‌شده است.
                </p>
              )}
              {hasStructuredAnalysis(analysis) ? (
                <>
                  {analysis.insights.map((text, i) => (
                    <p key={`ins-${i}`} className="text-slate-700 dark:text-slate-200 whitespace-pre-line">
                      💡 {text}
                    </p>
                  ))}
                  {analysis.doubts.map((text, i) => (
                    <p key={`d-${i}`} className="text-amber-800 dark:text-amber-200 whitespace-pre-line">
                      🔍 {text}
                    </p>
                  ))}
                  {analysis.notes.map((text, i) => (
                    <p key={`n-${i}`} className="text-slate-600 dark:text-slate-300 whitespace-pre-line">
                      {text}
                    </p>
                  ))}
                  {analysis.reviewNote && (
                    <p className="text-rose-800 dark:text-rose-200 whitespace-pre-line">🚩 یادداشتِ بازبینی: {analysis.reviewNote}</p>
                  )}
                </>
              ) : (
                question.explanation && (
                  <p className="text-slate-700 dark:text-slate-200 whitespace-pre-line">{question.explanation}</p>
                )
              )}
              {keyBadge && !analysis.reviewNote && (
                <p className={cn("text-[10.5px] whitespace-pre-line", question.keyStatus === "incorrect" ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300")}>
                  {keyBadge.note}
                </p>
              )}
              {question.sourceRef && <p className="text-[10px] text-slate-400">📚 منبع: {question.sourceRef}</p>}
            </div>
          </Block>

          {/* ————————— ۵) نکاتِ آموزشی → فلش‌کارت ————————— */}
          {points.length > 0 && (
            <Block
              title={
                <span className="flex items-center justify-between gap-2 w-full">
                  <span>🧠 نکاتِ آموزشی — {toFa(points.length)} نکته</span>
                  <span className="font-normal text-[9.5px] opacity-70">هر نکته جداگانه به فلش‌کارت می‌رود</span>
                </span>
              }
              tone="teal"
            >
              <ul className="space-y-1.5">
                {points.map((point, i) => {
                  const added = isAdded(point) || justAdded.includes(point);
                  const checked = pickedPoints.includes(point);
                  return (
                    <li key={`${question.id}-p-${i}`} className="rounded-lg border border-teal-200 dark:border-teal-800 bg-white/70 dark:bg-slate-900/30 overflow-hidden">
                      <div className="flex items-start gap-1.5 px-2 py-1.5">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`انتخابِ نکتهٔ ${toFa(i + 1)} برای افزودن به فلش‌کارت`}
                          disabled={added}
                          onClick={() => setPickedPoints((prev) => (checked ? prev.filter((p) => p !== point) : [...prev, point]))}
                          className={cn(
                            "shrink-0 w-5 h-5 rounded-md border text-[11px] leading-[18px] text-center disabled:opacity-40",
                            checked
                              ? "border-teal-600 bg-teal-600 text-white"
                              : "border-slate-300 dark:border-slate-600 text-transparent hover:border-teal-400",
                          )}
                        >
                          ✓
                        </button>
                        <p className="flex-1 text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">{point}</p>
                        <Button
                          size="sm"
                          variant={added ? "ghost" : "secondary"}
                          className="shrink-0 !px-2 !py-1 !text-[10px] whitespace-nowrap"
                          disabled={added}
                          title={added ? "این نکته قبلاً به فلش‌کارت‌ها اضافه شده" : "افزودنِ همین نکته به فلش‌کارت‌ها"}
                          onClick={() => addPoints([point])}
                        >
                          {added ? "✓ اضافه شد" : "＋ فلش‌کارت"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {pickedPoints.length > 0 && (
                <Button size="sm" className="mt-2 w-full" onClick={() => addPoints(pickedPoints)}>
                  📌 افزودنِ {toFa(pickedPoints.length)} نکتهٔ انتخاب‌شده به فلش‌کارت‌ها
                </Button>
              )}
              <p className="mt-1.5 text-[9.5px] text-slate-400 leading-relaxed">
                کارت‌ها در همان سیستمِ فلش‌کارتِ اپ با مرورِ فاصله‌دار (SM-2) ذخیره می‌شوند و ارجاعِ سؤالِ اصلی را نگه می‌دارند.
              </p>
            </Block>
          )}
        </>
      )}
    </Card>
  );
}
