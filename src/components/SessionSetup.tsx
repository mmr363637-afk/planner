import { useMemo, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, Segmented, Toggle, inputClass } from "./ui";
import { deckScopedCards } from "../lib/deckScope";
import { SESSION_COUNT_PRESETS, SESSION_TIME_PRESETS, type SessionMode } from "../lib/cardQuiz";
import { toFa, todayKey } from "../lib/jalali";
import { SESSION_MODES, type SessionConfig } from "./FlashcardSession";
import { cn } from "../utils/cn";

/**
 * تنظیم جلسه پیش از شروع.
 * کاربر اینجا حالت (کلاسیک/چهارگزینه‌ای/جاخالی/زمان‌دار/ترکیبی)، تعداد کارت، فیلتر
 * سررسید، ترتیب و زمان آزمون را انتخاب می‌کند. پیش‌فرض‌ها همان رفتار قبلی‌اند
 * (کلاسیک، همهٔ کارت‌های سررسید، ترتیب سررسید) تا عادتِ کاربر عوض نشود.
 */
export default function SessionSetup({
  deckKey,
  deckTitle,
  initial,
  onCancel,
  onStart,
}: {
  deckKey?: string;
  deckTitle?: string;
  initial?: Partial<SessionConfig>;
  onCancel: () => void;
  onStart: (config: SessionConfig) => void;
}) {
  const { state, prepareCardQuestions } = useStore();
  const { topicById } = useLookups();
  const today = todayKey();
  const scoped = useMemo(() => deckScopedCards(state.flashcards, deckKey, topicById), [state.flashcards, deckKey, topicById]);
  const dueCount = useMemo(() => scoped.filter((c) => c.dueDate <= today).length, [scoped, today]);
  const bookmarkedCount = useMemo(() => scoped.filter((c) => c.bookmark).length, [scoped]);
  const [mode, setMode] = useState<SessionMode>(initial?.mode ?? "classic");
  const [count, setCount] = useState<number>(initial?.count ?? 0);
  const [onlyDue, setOnlyDue] = useState<boolean>(initial?.onlyDue ?? dueCount > 0);
  const [order, setOrder] = useState<SessionConfig["order"]>(initial?.order ?? "due");
  const [timeLimitMin, setTimeLimitMin] = useState<number>(initial?.timeLimitMin ?? 15);

  const pool = useMemo(() => {
    let list = onlyDue ? scoped.filter((c) => c.dueDate <= today) : [...scoped];
    if (order === "bookmarked") list = list.filter((c) => c.bookmark);
    return list;
  }, [scoped, onlyDue, order, today]);

  const willReview = count > 0 ? Math.min(count, pool.length) : pool.length;
  const modeInfo = SESSION_MODES.find((m) => m.id === mode);

  const start = () => {
    if (willReview === 0) return;
    // تولیدِ تدریجی: فقط برای کارت‌های همین جلسه و فقط یک‌بار ساخته/ذخیره می‌شود
    const ids = pool.slice(0, willReview).map((c) => c.id);
    if (mode === "mcq" || mode === "timed") prepareCardQuestions(ids, "mcq");
    else if (mode === "cloze") prepareCardQuestions(ids, "cloze");
    else if (mode === "mixed") {
      prepareCardQuestions(ids, "mcq");
      prepareCardQuestions(ids, "cloze");
    }
    onStart({
      mode,
      count,
      onlyDue,
      order,
      timeLimitMin: mode === "timed" ? timeLimitMin : undefined,
    });
  };

  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">شروع جلسه {deckTitle ? `— ${deckTitle}` : ""}</h2>
          <p className="text-[11px] text-slate-400 mt-1">
            {toFa(scoped.length)} کارت در این مجموعه · {toFa(dueCount)} سررسید · {toFa(bookmarkedCount)} علامت مرور مجدد
          </p>
        </div>
        <button type="button" onClick={onCancel} className="text-xs text-slate-400 shrink-0">بستن ✕</button>
      </div>

      <div className="mt-3">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">حالت جلسه</div>
        <div className="grid grid-cols-2 gap-1.5">
          {SESSION_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "text-right rounded-xl border px-2.5 py-2 transition-colors",
                mode === m.id
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30"
                  : "border-slate-200 dark:border-slate-600 hover:border-teal-300",
              )}
            >
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{m.icon} {m.label}</div>
              <div className="text-[10px] text-slate-400 leading-snug mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {mode === "timed" && (
        <div className="mt-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">مدت آزمون (دقیقه)</div>
          <div className="flex flex-wrap gap-1.5">
            {SESSION_TIME_PRESETS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setTimeLimitMin(min)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold border",
                  timeLimitMin === min
                    ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    : "border-slate-200 dark:border-slate-600 text-slate-500",
                )}
              >
                {toFa(min)} دقیقه
              </button>
            ))}
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={240}
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(Math.max(1, Math.min(240, Number(e.target.value) || 1)))}
            className={cn(inputClass, "mt-2 text-xs w-28")}
            aria-label="مدت آزمون به دقیقه"
          />
        </div>
      )}

      <div className="mt-3">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">تعداد کارت</div>
        <div className="flex flex-wrap gap-1.5">
          {SESSION_COUNT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold border",
                count === n ? "border-teal-400 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" : "border-slate-200 dark:border-slate-600 text-slate-500",
              )}
            >
              {toFa(n)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCount(0)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold border",
              count === 0 ? "border-teal-400 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" : "border-slate-200 dark:border-slate-600 text-slate-500",
            )}
          >
            همه
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">ترتیب و فیلتر</div>
        <Segmented
          value={order}
          onChange={(v) => setOrder(v)}
          options={[
            { value: "due", label: "سررسید" },
            { value: "weak", label: "ضعیف‌ها" },
            { value: "random", label: "تصادفی" },
            { value: "bookmarked", label: "🔖 مرور مجدد" },
          ]}
        />
        <div className="flex items-center justify-between mt-2.5 gap-2">
          <div className="flex-1">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">فقط کارت‌های سررسید</div>
            <div className="text-[10px] text-slate-400">{toFa(dueCount)} کارت امروز نوبت دارند</div>
          </div>
          <Toggle checked={onlyDue} onChange={setOnlyDue} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        <Chip className="!bg-slate-100 !text-slate-600 dark:!bg-slate-700 dark:!text-slate-300">🃏 {toFa(willReview)} کارت</Chip>
        {modeInfo && <Chip className="!bg-violet-100 !text-violet-700 dark:!bg-violet-900/40 dark:!text-violet-300">{modeInfo.icon} {modeInfo.label}</Chip>}
        {mode === "timed" && <Chip className="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300">⏱️ {toFa(timeLimitMin)} دقیقه</Chip>}
      </div>

      {willReview === 0 && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 leading-relaxed">
          {scoped.length > 0
            ? "با این فیلتر کارتی پیدا نشد؛ «فقط کارت‌های سررسید» را خاموش کن یا ترتیب را عوض کن."
            : "هنوز کارتی در این مجموعه نداری؛ اول از بانک منتخب‌ها یا «کارت جدید» اضافه کن."}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Button className="flex-1" disabled={willReview === 0} onClick={start}>
          شروع {toFa(willReview)} کارت
        </Button>
        <Button variant="ghost" onClick={onCancel}>انصراف</Button>
      </div>
      {mode !== "classic" && (
        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
          سؤال‌ها یک‌بار از محتوای کارت‌ها ساخته و ذخیره می‌شوند؛ دفعهٔ بعد آفلاین و بدون ساخت دوباره می‌آیند.
          اگر برای کارتی گزینهٔ سالم کافی نباشد، همان کارت کلاسیک اجرا می‌شود.
        </p>
      )}
    </Card>
  );
}
