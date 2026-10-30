import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card, Chip, Segmented, Toggle, inputClass } from "./ui";
import { SESSION_COUNT_PRESETS, SESSION_TIME_PRESETS, pickSessionCards, type SessionMode } from "../lib/cardQuiz";
import { buildQuizScopes, cardsInQuizScope, recommendQuizScope } from "../lib/quizScope";
import { aiGenerateQuestions, cardsNeedingAiQuestions } from "../lib/aiQuizGen";
import { aiConfigured, subscribeAiConfig } from "../lib/ai";
import { toFa, todayKey } from "../lib/jalali";
import { SESSION_MODES, type SessionConfig } from "./FlashcardSession";
import { cn } from "../utils/cn";

/**
 * تنظیم جلسه پیش از شروع.
 *
 * 🔑 تغییرِ مهمِ ۱٫۲۲: کاربر **اول محدوده را انتخاب می‌کند** (یک مبحث، یک درس، یا
 * عمداً همه‌چیز) و بعد حالت، تعداد، ترتیب و منبع سؤال. قبلاً دکمهٔ «آزمون» یک آزمون
 * سراسری از تمام کارت‌ها می‌ساخت؛ حالا پیش‌فرضِ هر ورود همان مبحثِ انتخاب‌شده است.
 *
 * 🔑 منبع سؤال دو حالت دارد:
 *  • آفلاین (پیش‌فرض): اپ خودش از کارت‌های همان مبحث گزینه‌های هم‌موضوع می‌سازد.
 *  • آنلاین: اگر دستیار وصل باشد، AI از محتوای همان کارت‌ها سؤال استاندارد می‌سازد؛
 *    پاسخ درست با محتوای کارت اعتبارسنجی می‌شود و اگر AI چیزی نساخت، همان حالت آفلاین
 *    اجرا می‌شود (جلسه هرگز خالی/خراب نمی‌ماند).
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
  const { state, prepareCardQuestions, saveCardQuestions, toast } = useStore();
  const today = todayKey();
  const scopes = useMemo(
    () =>
      buildQuizScopes(
        state.flashcards,
        state.topics,
        state.subjects,
        today,
        new Set((state.cardQuestions ?? []).filter((q) => q.status !== "flagged").map((q) => q.cardId)),
      ),
    [state.flashcards, state.topics, state.subjects, state.cardQuestions, today],
  );

  // 🧠 «مرور هوشمند»: فهرست دقیقِ کارت‌ها از قبل می‌آید (ضعیف‌ترین مباحث)؛
  // در این حالت انتخاب محدوده لازم نیست و جلسه فقط همین کارت‌ها را می‌گیرد.
  const [smartIds] = useState<string[]>(initial?.cardIds ?? []);
  const smartMode = smartIds.length > 0;
  const smartSet = useMemo(() => new Set(smartIds), [smartIds]);
  // کلیدِ مجموعه فقط اگر دامنهٔ معتبری بسازد پذیرفته می‌شود (مثلاً مجموعه‌های پک که
  // مبحثشان در فهرست کاربر نیست)؛ وگرنه نزدیک‌ترین پیشنهاد، نه «همهٔ کارت‌ها» بی‌خبر.
  const validDeckScope = deckKey && scopes.some((s) => s.key === deckKey) ? deckKey : undefined;
  const initialScope = initial?.scopeKey && scopes.some((s) => s.key === initial.scopeKey) ? initial.scopeKey : undefined;
  const defaultScope = validDeckScope ?? initialScope ?? recommendQuizScope(scopes)?.key ?? "all";
  const [scopeKey, setScopeKey] = useState<string>(defaultScope);
  const activeScopeKey = scopes.some((s) => s.key === scopeKey) ? scopeKey : defaultScope;
  const scope = smartMode ? undefined : scopes.find((s) => s.key === activeScopeKey) ?? scopes[scopes.length - 1];
  const scoped = useMemo(
    () => (smartMode ? state.flashcards.filter((c) => smartSet.has(c.id)) : cardsInQuizScope(state.flashcards, state.topics, activeScopeKey)),
    [state.flashcards, state.topics, activeScopeKey, smartMode, smartSet],
  );
  const dueCount = useMemo(() => scoped.filter((c) => c.dueDate <= today).length, [scoped, today]);
  const bookmarkedCount = useMemo(() => scoped.filter((c) => c.bookmark).length, [scoped]);

  const [mode, setMode] = useState<SessionMode>(initial?.mode ?? "classic");
  const [count, setCount] = useState<number>(initial?.count ?? 0);
  const [onlyDue, setOnlyDue] = useState<boolean>(initial?.onlyDue ?? dueCount > 0);
  const [order, setOrder] = useState<SessionConfig["order"]>(initial?.order ?? "due");
  const [timeLimitMin, setTimeLimitMin] = useState<number>(initial?.timeLimitMin ?? 15);
  const [questionSource, setQuestionSource] = useState<"offline" | "ai">("offline");
  const [aiReady, setAiReady] = useState(() => aiConfigured());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [scopeQuery, setScopeQuery] = useState("");

  useEffect(() => subscribeAiConfig(() => setAiReady(aiConfigured())), []);

  // تغییر محدوده، فیلتر «فقط سررسید» را با واقعیتِ همان محدوده هماهنگ می‌کند
  useEffect(() => {
    setOnlyDue(dueCount > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScopeKey]);

  const pool = useMemo(() => {
    let list = onlyDue ? scoped.filter((c) => c.dueDate <= today) : [...scoped];
    if (order === "bookmarked") list = list.filter((c) => c.bookmark);
    return list;
  }, [scoped, onlyDue, order, today]);

  // تعدادِ دقیقِ کارت‌های این جلسه با همان الگوریتمِ جلسه — منبع سؤال هم برای همین‌ها آماده می‌شود
  const selectedCards = useMemo(
    () =>
      smartMode
        ? pool
        : pickSessionCards(pool, {
        today,
        onlyDue: false,
        count,
        order,
        seed: Number(today.replace(/-/g, "")),
      }),
    [pool, count, order, today, smartMode],
  );
  const willReview = selectedCards.length;
  const modeInfo = SESSION_MODES.find((m) => m.id === mode);
  const wrongModes = mode === "classic";
  const filteredScopes = useMemo(() => {
    const q = scopeQuery.trim();
    if (!q) return scopes;
    return scopes.filter((s) => s.label.includes(q) || (s.subjectName ?? "").includes(q));
  }, [scopes, scopeQuery]);

  const start = async () => {
    if (willReview === 0) return;
    const ids = selectedCards.map((c) => c.id);
    const usesQuestions = mode !== "classic";
    if (usesQuestions) {
      const kind = mode === "cloze" ? "cloze" : "mcq";
      if (mode === "mixed") {
        prepareCardQuestions(ids, "mcq");
        prepareCardQuestions(ids, "cloze");
      } else {
        prepareCardQuestions(ids, kind);
      }
    }

    if (usesQuestions && mode !== "cloze" && questionSource === "ai" && aiReady) {
      setBusy(true);
      setAiError(null);
      const existing = state.cardQuestions ?? [];
      const targets = cardsNeedingAiQuestions(ids.map((id) => state.flashcards.find((c) => c.id === id)!).filter(Boolean), existing, ids.length);
      if (targets.length === 0) {
        toast("همهٔ این کارت‌ها سؤال AI به‌روز دارند؛ همان‌ها استفاده می‌شوند", "🤖");
      } else {
        setProgress({ done: 0, total: targets.length });
        try {
          const res = await aiGenerateQuestions({
            cards: targets,
            topics: state.topics,
            maxQuestions: targets.length,
            onProgress: (done, total) => setProgress({ done, total }),
          });
          if (res.questions.length > 0) {
            saveCardQuestions(res.questions);
            toast(`${toFa(res.questions.length)} سؤال چهارگزینه‌ای با AI ساخته شد`, "🤖");
          }
          if (res.error) setAiError(res.error);
          if (res.rejected.length > 0) {
            // برای کارت‌هایی که AI سؤالِ قابل‌قبول نساخت، همان سؤال آفلاین (اگر باشد) می‌ماند
            setAiError((prev) => prev ?? `${toFa(res.rejected.length)} کارت خروجیِ قابل‌قبول از AI نگرفت؛ برای همان‌ها سؤال آفلاین استفاده می‌شود.`);
          }
        } finally {
          setBusy(false);
          setProgress(null);
        }
      }
    }

    onStart({
      mode,
      count,
      onlyDue,
      order,
      timeLimitMin: mode === "timed" ? timeLimitMin : undefined,
      cardIds: smartMode ? smartIds : ids,
      scopeKey: smartMode ? undefined : activeScopeKey,
      scopeLabel: smartMode ? "مرور هوشمند" : scope?.label ?? deckTitle,
    });
  };

  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {mode === "classic" ? "شروع مرور" : "شروع آزمون"} {smartMode ? "— مرور هوشمند" : scope ? `— ${scope.label}` : deckTitle ? `— ${deckTitle}` : ""}
          </h2>
          <p className="text-[11px] text-slate-400 mt-1">
            {toFa(scoped.length)} کارت در این محدوده · {toFa(dueCount)} سررسید · {toFa(bookmarkedCount)} علامت مرور مجدد
          </p>
        </div>
        <button type="button" onClick={onCancel} className="text-xs text-slate-400 shrink-0">بستن ✕</button>
      </div>

      {/* 🔑 انتخاب محدوده — قبل از هر چیز */}
      {smartMode ? (
        <div className="mt-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/25 px-3 py-2 text-[11px] text-indigo-800 dark:text-indigo-200 leading-relaxed">
          🧠 مرور هوشمند: {toFa(scoped.length)} کارت از ضعیف‌ترین مباحث (سررسید، فراموشی، پاسخ‌های غلط و اشتباهات) انتخاب شده‌اند.
          برای انتخاب دستی محدوده، این پنجره را ببند و از «آزمون» یا «مرور» شروع کن.
        </div>
      ) : (
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">۱) محدودهٔ مرور</span>
          <span className="text-[10px] text-slate-400">{toFa(scopes.length)} مجموعه</span>
        </div>
        {scopes.length > 6 && (
          <input
            className={cn(inputClass, "text-xs mb-1.5 py-1.5")}
            value={scopeQuery}
            onChange={(e) => setScopeQuery(e.target.value)}
            placeholder="جست‌وجوی مبحث…"
            aria-label="جست‌وجوی مبحث"
          />
        )}
        <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pl-0.5">
          {filteredScopes.map((s) => {
            const active = s.key === activeScopeKey;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setScopeKey(s.key)}
                className={cn(
                  "text-right rounded-xl border px-2.5 py-2 transition-colors flex items-center gap-2",
                  active ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30" : "border-slate-200 dark:border-slate-600 hover:border-teal-300",
                )}
              >
                <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: s.color ?? "#94a3b8" }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {s.kind === "all" ? "🗂 " : s.kind === "subject" ? "📚 " : "📖 "}
                    {s.label}
                  </span>
                  <span className="block text-[10px] text-slate-400 truncate">
                    {s.subjectName ? `${s.subjectName} · ` : ""}
                    {toFa(s.count)} کارت{s.dueCount > 0 ? ` · ${toFa(s.dueCount)} سررسید` : ""}
                  </span>
                </span>
                {active && <span className="text-teal-600 dark:text-teal-300 text-xs shrink-0">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
          سؤال‌ها فقط از کارت‌های همین محدوده ساخته می‌شوند؛ «همهٔ کارت‌ها» فقط اگر خودت انتخابش کنی.
        </p>
      </div>
      )}

      <div className="mt-3">
        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">۲) حالت جلسه</div>
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

      {/* 📡 منبع سؤال — فقط برای حالت‌های سؤالی */}
      {!wrongModes && mode !== "timed" && (
        <div className="mt-3">
          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">۳) منبع سؤال</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setQuestionSource("offline")}
              className={cn(
                "text-right rounded-xl border px-2.5 py-2",
                questionSource === "offline" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/25" : "border-slate-200 dark:border-slate-600",
              )}
            >
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">📴 آفلاین (اپ)</div>
              <div className="text-[10px] text-slate-400 leading-snug mt-0.5">گزینه‌ها از کارت‌های هم‌مبحث ساخته می‌شوند؛ بدون اینترنت</div>
            </button>
            <button
              type="button"
              disabled={!aiReady}
              onClick={() => setQuestionSource("ai")}
              className={cn(
                "text-right rounded-xl border px-2.5 py-2",
                questionSource === "ai" ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/25" : "border-slate-200 dark:border-slate-600",
                !aiReady && "opacity-50",
              )}
            >
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">🤖 آنلاین (AI)</div>
              <div className="text-[10px] text-slate-400 leading-snug mt-0.5">
                {aiReady ? "سؤال استاندارد از محتوای همین کارت‌ها؛ پاسخ درست اعتبارسنجی می‌شود" : "دستیار وصل نیست — تنظیمات ← دستیار هوشمند"}
              </div>
            </button>
          </div>
          {questionSource === "ai" && aiReady && (
            <p className="text-[10px] text-indigo-500 dark:text-indigo-300 mt-1 leading-relaxed">
              سؤال‌ها یک‌بار ساخته و ذخیره می‌شوند؛ دفعهٔ بعد بی‌نیاز از شبکه همان‌ها می‌آیند. کارت‌هایی که AI برایشان خروجیِ معتبر نسازد، آفلاین اجرا می‌شوند.
            </p>
          )}
        </div>
      )}

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
        {smartMode ? (
          <Chip className="!bg-indigo-100 !text-indigo-700 dark:!bg-indigo-900/40 dark:!text-indigo-300">🧠 مرور هوشمند</Chip>
        ) : (
          scope && <Chip className="!bg-teal-100 !text-teal-700 dark:!bg-teal-900/40 dark:!text-teal-300">📚 {scope.label}</Chip>
        )}
        {modeInfo && <Chip className="!bg-violet-100 !text-violet-700 dark:!bg-violet-900/40 dark:!text-violet-300">{modeInfo.icon} {modeInfo.label}</Chip>}
        {questionSource === "ai" && !wrongModes && <Chip className="!bg-indigo-100 !text-indigo-700 dark:!bg-indigo-900/40 dark:!text-indigo-300">🤖 سؤال با AI</Chip>}
        {mode === "timed" && <Chip className="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300">⏱️ {toFa(timeLimitMin)} دقیقه</Chip>}
      </div>

      {willReview === 0 && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 leading-relaxed">
          {scoped.length > 0
            ? "با این فیلتر کارتی پیدا نشد؛ «فقط کارت‌های سررسید» را خاموش کن یا محدوده را عوض کن."
            : "در این محدوده کارتی نداری؛ از بانک منتخب‌ها اضافه کن یا مبحث دیگری انتخاب کن."}
        </div>
      )}

      {busy && (
        <div className="mt-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-[11px] text-indigo-700 dark:text-indigo-200">
          🤖 در حال ساخت سؤال از {toFa(selectedCards.length)} کارت…
          {progress ? ` (${toFa(progress.done)}/${toFa(progress.total)})` : ""}
        </div>
      )}
      {aiError && !busy && (
        <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
          ⚠️ {aiError}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Button className="flex-1" disabled={willReview === 0 || busy} onClick={() => void start()}>
          {busy ? "در حال آماده‌سازی…" : `شروع ${toFa(willReview)} کارت`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>انصراف</Button>
      </div>
      {mode !== "classic" && (
        <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
          سؤال‌های آفلاین یک‌بار از محتوای کارت‌ها ساخته و ذخیره می‌شوند؛ دفعهٔ بعد بدون ساختِ دوباره می‌آیند.
          اگر برای کارتی گزینهٔ سالم کافی نباشد، همان کارت کلاسیک اجرا می‌شود.
        </p>
      )}
    </Card>
  );
}
