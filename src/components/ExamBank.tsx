import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Card, Chip, ProgressBar, SectionTitle, StatTile, Toggle, inputClass } from "./ui";
import {
  BANK_EXAM_LABEL,
  BANK_MAX_QUESTIONS_PER_RUN,
  availableYears,
  bankConfigured,
  bankPerformance,
  bankStudyAdvice,
  clearBankCache,
  loadBankManifest,
  loadQuestionsForTopics,
  selectBankQuestions,
  setBankBaseUrl,
  weakBankTopics,
} from "../lib/examBank";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import type { BankExamType, BankManifest } from "../types";
import ExamBankSession, { type BankRun, type BankRunMode } from "./ExamBankSession";

/**
 * 🏥 بانک سؤال پره‌انترنی/دستیاری — مرکز آزمون.
 * ورود به بخش فقط مانیفست (چند کیلوبایت) را می‌گیرد؛ سؤال‌ها فقط برای مبحثِ
 * انتخاب‌شده و در حافظهٔ همین نشست دانلود می‌شوند و با خروج پاک می‌شوند.
 * عملکرد (پاسخ‌ها/نتیجه‌ها) کوچک است و ماندگار ذخیره می‌شود تا تحلیل ضعف‌ها
 * حتی بدون متن سؤال‌ها کار کند.
 */
export default function ExamBank({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, toast, toggleBankBookmark } = useStore();
  const [manifest, setManifest] = useState<BankManifest | null>(null);
  const [source, setSource] = useState<"online" | "sample">("sample");
  const [configError, setConfigError] = useState<string | undefined>();
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [tab, setTab] = useState<"start" | "analytics" | "bookmarks" | "settings">("start");
  const [examType, setExamType] = useState<BankExamType | "all">("all");
  const [year, setYear] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(20);
  const [mode, setMode] = useState<BankRunMode>("practice");
  const [secPerQuestion, setSecPerQuestion] = useState(90);
  /**
   * سؤال‌هایی که کلیدشان در بازبینیِ محتوا «مشکوک» علامت خورده، در حالتِ آزمونی
   * کنار گذاشته می‌شوند (پیش‌فرض روشن). در تمرین هم با برچسب دیده می‌شوند.
   */
  const [excludeDoubtful, setExcludeDoubtful] = useState(true);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<BankRun | null>(null);
  /** هر آزمون/شروع دوباره کلید یکتا می‌گیرد تا وضعیت پاسخ‌های قبلی پاک شود */
  const [runId, setRunId] = useState(0);
  const [url, setUrl] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const attempts = state.examBankAttempts ?? [];
  const bookmarks = useMemo(() => new Set(state.examBankBookmarks ?? []), [state.examBankBookmarks]);
  const performance = useMemo(() => bankPerformance(attempts), [attempts]);
  const weak = useMemo(() => weakBankTopics(attempts), [attempts]);
  const advice = useMemo(() => bankStudyAdvice(attempts, state.examBankSessions ?? []), [attempts, state.examBankSessions]);
  const perfByTopic = useMemo(() => new Map(performance.map((p) => [p.topicId, p])), [performance]);

  // ورود: فقط مانیفست
  useEffect(() => {
    if (!open || manifest) return;
    void refreshManifest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, manifest]);

  const refreshManifest = async () => {
    setLoadingManifest(true);
    setConfigError(undefined);
    try {
      const res = await loadBankManifest({ force: true });
      setManifest(res.manifest);
      setSource(res.source);
      setConfigError(res.error);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "خطای نامشخص");
    } finally {
      setLoadingManifest(false);
    }
  };

  const years = useMemo(() => availableYears(manifest), [manifest]);

  const topics = useMemo(() => {
    const list = (manifest?.topics ?? []).filter((t) => {
      if (examType !== "all" && !(t.byExamType[examType] ?? 0)) return false;
      if (year !== "all" && !t.years.includes(year)) return false;
      if (query.trim() && !`${t.topicTitle} ${t.subject}`.includes(query.trim())) return false;
      return true;
    });
    return list.sort((a, b) => a.subject.localeCompare(b.subject, "fa") || b.count - a.count);
  }, [manifest, examType, year, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof topics>();
    for (const t of topics) {
      const arr = map.get(t.subject) ?? [];
      arr.push(t);
      map.set(t.subject, arr);
    }
    return [...map.entries()];
  }, [topics]);

  const selectedCount = selected.size;
  const availableCount = useMemo(
    () =>
      [...selected].reduce((sum, id) => {
        const meta = manifest?.topics.find((t) => t.topicId === id);
        if (!meta) return sum;
        if (examType === "all" && year === "all") return sum + meta.count;
        return sum + (meta.byExamType[examType === "all" ? "pre_internship" : examType] ?? 0);
      }, 0),
    [selected, manifest, examType, year],
  );

  const toggleTopic = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startRun = async (opts?: { topics?: string[]; onlyIds?: string[]; label?: string }) => {
    const topicIds = opts?.topics ?? [...selected];
    if (topicIds.length === 0) {
      toast("اول مبحث (یا درس) را انتخاب کن", "🎯");
      return;
    }
    // سقفِ منطقیِ دانلود هم‌زمان: گرفتن ده‌ها شارد پشتِ‌سرهم روی موبایل کند است و
    // هیچ آزمونی هم بیشتر از ۱۲۰ سؤال نمی‌گیرد.
    const capped = topicIds.slice(0, 24);
    if (capped.length < topicIds.length) toast(`برای سرعتِ موبایل فقط ${toFa(capped.length)} مبحثِ اول گرفته می‌شود`, "⚡");
    setBusy(true);
    abortRef.current?.abort();
    const aborter = new AbortController();
    abortRef.current = aborter;
    try {
      const loaded = await loadQuestionsForTopics(capped, { manifest: manifest ?? undefined, signal: aborter.signal });
      if (aborter.signal.aborted) return;
      if (loaded.questions.length === 0) {
        toast("سؤالی برای این انتخاب پیدا نشد؛ اتصال را بررسی کن یا مبحث دیگری انتخاب کن", "⚠️");
        return;
      }
      const picked = selectBankQuestions(loaded.questions, {
        count: opts?.onlyIds ? opts.onlyIds.length : count,
        examTypes: examType === "all" ? undefined : [examType],
        yearFrom: year === "all" ? undefined : year,
        yearTo: year === "all" ? undefined : year,
        onlyIds: opts?.onlyIds,
        excludeDoubtful: excludeDoubtful && mode !== "practice",
        seed: Date.now() % 100000,
      });
      if (picked.length === 0) {
        toast("با این فیلترِ سال/نوع، سؤالی نماند", "⚠️");
        return;
      }
      if (loaded.failed.length > 0) toast(`${toFa(loaded.failed.length)} مبحث آنلاین نشد؛ از نسخهٔ نمونه استفاده شد`, "📶");
      setRunId((n) => n + 1);
      setRun({
        questions: picked,
        mode,
        examType: examType === "all" ? "mixed" : examType,
        source: loaded.source,
        secPerQuestion,
        title: opts?.label ?? `${toFa(picked.length)} سؤال${selected.size === 1 ? ` از ${manifest?.topics.find((t) => t.topicId === [...selected][0])?.topicTitle ?? ""}` : ""}`,
      });
    } catch {
      toast("بارگذاری سؤال‌ها ناموفق بود", "⚠️");
    } finally {
      setBusy(false);
    }
  };

  const startWeak = () => {
    const ids = weak.map((w) => w.topicId);
    if (ids.length === 0) {
      toast("برای تحلیل ضعف، اول حداقل ۵ پاسخ در هر مبحث ثبت کن", "ℹ️");
      return;
    }
    void startRun({ topics: ids, label: "آزمون مباحث ضعیف" });
  };

  const startBookmarks = async () => {
    if (bookmarks.size === 0) {
      toast("هنوز سؤالی نشان‌دار نکرده‌ای", "🔖");
      return;
    }
    const topicsOfBookmarks = [...new Set(attempts.filter((a) => bookmarks.has(a.questionId)).map((a) => a.topicId))];
    // اگر سؤالی نشان‌دار باشد ولی هنوز پاسخ داده نشده باشد، مبحثش را نمی‌دانیم؛
    // برای جلوگیری از دانلود کلِ بانک، همین‌جا شفاف می‌گوییم چه کاری لازم است.
    if (topicsOfBookmarks.length === 0) {
      toast("مبحثِ سؤال‌های نشان‌دار هنوز معلوم نیست؛ اول یک آزمون از همان مبحث بزن", "🔖");
      return;
    }
    await startRun({ topics: topicsOfBookmarks, onlyIds: [...bookmarks], label: "مرور سؤال‌های نشان‌دار" });
  };

  if (!open) return null;

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-50 dark:bg-slate-900" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {children}
    </div>
  );

  if (run) {
    return shell(
      <div className="mx-auto max-w-2xl px-3 pt-3">
        <ExamBankSession
          key={runId}
          run={run}
          onExit={() => {
            setRun(null);
            clearBankCache(); // متن سؤال‌ها روی گوشی نمی‌ماند
          }}
          onRestart={(questions) => {
            setRun({ ...run, questions, title: `مرور ${toFa(questions.length)} سؤال` });
          }}
        />
      </div>,
    );
  }

  return shell(
    <div className="mx-auto max-w-2xl px-3 pb-6 pt-3">
      <div className="flex items-center justify-between mb-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          ← بازگشت
        </Button>
        <div className="flex items-center gap-1.5">
          <Chip className={cn("!text-[10px]", source === "online" ? "!bg-teal-100 !text-teal-700 dark:!bg-teal-900/40 dark:!text-teal-300" : "!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300")}>
            {source === "online"
              ? `📚 بانک کامل${manifest ? ` · ${toFa(manifest.topics.reduce((sum, t) => sum + t.count, 0))} سؤال` : ""}`
              : "📦 نمونهٔ داخلی (۲۵ سؤال)"}
          </Chip>
          <Chip className="!text-[10px] !bg-slate-100 !text-slate-600 dark:!bg-slate-700 dark:!text-slate-300">
            {toFa(attempts.length)} پاسخ ثبت‌شده
          </Chip>
        </div>
      </div>

      <SectionTitle action={<button type="button" className="text-[11px] text-teal-600 dark:text-teal-300" onClick={() => setTab("settings")}>تنظیمات</button>}>
        🏥 بانک سؤال پره‌انترنی و دستیاری
      </SectionTitle>

      {configError && source === "sample" && (
        <Card className="mb-2 !bg-amber-50 dark:!bg-amber-900/20 !border-amber-200 dark:!border-amber-800/60 text-[10px] text-amber-800 dark:text-amber-200 leading-relaxed">
          بانک آنلاین در دسترس نیست ({configError}). نسخهٔ نمونهٔ داخلی نمایش داده می‌شود؛ آدرس بانک را در «تنظیمات» بگذار.
        </Card>
      )}

      <div className="flex gap-1 mb-2 overflow-x-auto">
        {([
          ["start", "🎯 آزمون تازه"],
          ["analytics", "📊 تحلیل"],
          ["bookmarks", "🔖 نشان‌دارها"],
          ["settings", "⚙️ بانک"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border",
              tab === key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "start" && (
        <>
          {advice.length > 0 && (
            <Card className="mb-2 !bg-indigo-50 dark:!bg-indigo-900/20 !border-indigo-200 dark:!border-indigo-800/60">
              <div className="text-[11px] font-bold text-indigo-800 dark:text-indigo-200 mb-1">💡 پیشنهاد امروز</div>
              {advice.slice(0, 2).map((a) => (
                <div key={a} className="text-[10px] text-indigo-700 dark:text-indigo-300 leading-relaxed">• {a}</div>
              ))}
            </Card>
          )}

          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <select className={cn(inputClass, "text-[11px] py-1.5")} value={examType} onChange={(e) => setExamType(e.target.value as BankExamType | "all")} aria-label="نوع آزمون">
              <option value="all">هر دو آزمون</option>
              <option value="pre_internship">پره‌انترنی</option>
              <option value="residency">دستیاری</option>
            </select>
            <select className={cn(inputClass, "text-[11px] py-1.5")} value={year} onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="سال آزمون">
              <option value="all">همهٔ سال‌ها</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {toFa(y)}
                </option>
              ))}
            </select>
            <input className={cn(inputClass, "text-[11px] py-1.5")} placeholder="جست‌وجوی مبحث…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="جست‌وجوی مبحث" />
          </div>

          {loadingManifest ? (
            <Card className="text-center py-6 text-sm text-slate-500">در حال گرفتن فهرست مباحث…</Card>
          ) : topics.length === 0 ? (
            <Card className="text-center py-6 text-[12px] text-slate-500">مبحثی با این فیلتر نماند.</Card>
          ) : (
            <div className="space-y-1.5 mb-2">
              {grouped.map(([subject, list]) => {
                // ۳۷۰ مبحث در ۱۳ درس؛ هر درس جمع‌شده است تا صفحه روی موبایل سبک بماند.
                // جست‌وجو یا انتخابِ قبلی، درس را خودکار باز می‌کند.
                const chosen = list.filter((t) => selected.has(t.topicId)).length;
                const total = list.reduce((sum, t) => sum + t.count, 0);
                const openByDefault = !!query.trim() || chosen > 0;
                return (
                <details key={subject} open={openByDefault || undefined} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5">
                  <summary className="flex items-center justify-between gap-2 cursor-pointer list-none">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      {subject}
                      <span className="text-[10px] font-normal text-slate-400 mr-1">
                        · {toFa(list.length)} مبحث · {toFa(total)} سؤال
                        {chosen > 0 && ` · ${toFa(chosen)} انتخاب‌شده`}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-[10px] text-teal-600 dark:text-teal-300 shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelected((prev) => {
                          const next = new Set(prev);
                          const allOn = list.every((t) => next.has(t.topicId));
                          for (const t of list) {
                            if (allOn) next.delete(t.topicId);
                            else next.add(t.topicId);
                          }
                          return next;
                        });
                      }}
                    >
                      {list.every((t) => selected.has(t.topicId)) ? "برداشتن همه" : "انتخاب درس"}
                    </button>
                  </summary>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {list.map((t) => {
                      const on = selected.has(t.topicId);
                      const perf = perfByTopic.get(t.topicId);
                      return (
                        <button
                          key={t.topicId}
                          type="button"
                          onClick={() => toggleTopic(t.topicId)}
                          className={cn(
                            "text-right text-[11px] px-2 py-1 rounded-lg border leading-tight",
                            on ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 font-bold" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300",
                          )}
                          title={`${toFa(t.count)} سؤال · سال‌ها: ${t.years.map(toFa).join("، ")}`}
                        >
                          {on ? "☑" : "☐"} {t.topicTitle}
                          <span className="text-[9px] opacity-70"> ({toFa(t.count)})</span>
                          {perf && (
                            <span className={cn("text-[9px] mr-1 font-bold", perf.accuracy >= 70 ? "text-teal-600" : perf.accuracy >= 50 ? "text-amber-600" : "text-rose-600")}>
                              {toFa(perf.accuracy)}٪
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </details>
                );
              })}
            </div>
          )}

          <Card className="!p-2.5">
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">۳) حالت و تعداد</div>
            <div className="grid grid-cols-3 gap-1 mb-2">
              {([
                ["practice", "📖 تمرینی"],
                ["exam", "📝 آزمونی"],
                ["timed", "⏱ زمان‌دار"],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn("rounded-xl border px-2 py-1.5 text-[11px] font-bold", mode === m ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200" : "border-slate-200 dark:border-slate-700 text-slate-500")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 mb-2">
              {[10, 20, 40, BANK_MAX_QUESTIONS_PER_RUN].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={cn("flex-1 rounded-lg border px-1 py-1 text-[11px]", count === n ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 font-bold" : "border-slate-200 dark:border-slate-700 text-slate-500")}
                >
                  {toFa(n)}
                </button>
              ))}
            </div>
            {mode === "timed" && (
              <label className="block mb-2 text-[10px] text-slate-500 dark:text-slate-400">
                زمان هر سؤال: {toFa(secPerQuestion)} ثانیه
                <input type="range" min={30} max={180} step={15} value={secPerQuestion} onChange={(e) => setSecPerQuestion(Number(e.target.value))} className="w-full accent-indigo-600" aria-label="زمان هر سؤال" />
              </label>
            )}
            <label className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed flex-1">
                کنار گذاشتنِ سؤال‌های با «کلید مشکوک» در آزمون ({toFa(364)} سؤال در بازبینی علامت خورده‌اند)
              </span>
              <Toggle checked={excludeDoubtful} onChange={setExcludeDoubtful} label="کلید مشکوک" />
            </label>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
              {selectedCount > 0 ? (
                <>
                  {toFa(selectedCount)} مبحث انتخاب شده · حدود {toFa(Math.min(count, availableCount || count))} سؤال
                  {year !== "all" && ` · سال ${toFa(year)}`}
                </>
              ) : (
                "مبحث یا درس را انتخاب کن؛ آزمون بی‌محدوده شروع نمی‌شود."
              )}
            </div>
            <Button className="w-full" disabled={busy || selectedCount === 0} onClick={() => void startRun()}>
              {busy ? "در حال گرفتن سؤال‌ها…" : `شروع آزمون (${toFa(Math.min(count, availableCount || count))} سؤال)`}
            </Button>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Button variant="outline" size="sm" onClick={startWeak}>
                🎯 مباحث ضعیف من
              </Button>
              <Button variant="outline" size="sm" onClick={() => void startBookmarks()}>
                🔖 سؤال‌های نشان‌دار
              </Button>
            </div>
          </Card>
        </>
      )}

      {tab === "analytics" && (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <StatTile icon="📝" label="پاسخ‌ها" value={toFa(attempts.length)} />
            <StatTile icon="✅" label="دقت کل" value={`${toFa(attempts.length ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100) : 0)}٪`} />
            <StatTile icon="📚" label="آزمون‌ها" value={toFa((state.examBankSessions ?? []).length)} />
          </div>
          {performance.length === 0 ? (
            <Card className="text-center py-6 text-[12px] text-slate-500">هنوز پاسخی ثبت نشده. یک آزمون تمرینی بزن تا تحلیل بسازم.</Card>
          ) : (
            <Card className="!p-2.5">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">نقاط ضعف (کم‌دقت‌ترین مباحث)</div>
              {performance.slice(0, 10).map((p) => (
                <div key={p.topicId} className="mb-2">
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-slate-600 dark:text-slate-300">{p.topicTitle}</span>
                    <span className={cn("font-bold", p.accuracy >= 70 ? "text-teal-600" : p.accuracy >= 50 ? "text-amber-600" : "text-rose-600")}>
                      {toFa(p.correct)}/{toFa(p.answered)} · {toFa(p.accuracy)}٪
                    </span>
                  </div>
                  <ProgressBar value={p.accuracy} height="h-1.5" color={p.accuracy >= 70 ? "#0d9488" : p.accuracy >= 50 ? "#f59e0b" : "#e11d48"} />
                </div>
              ))}
              <Button
                size="sm"
                className="w-full mt-1"
                onClick={() => void startRun({ topics: performance.slice(0, 3).map((p) => p.topicId), label: "آزمون سه مبحث ضعیف" })}
              >
                🎯 آزمون از سه مبحث ضعیف
              </Button>
            </Card>
          )}
          {(state.examBankSessions ?? []).length > 0 && (
            <Card className="mt-2 !p-2.5">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">آزمون‌های اخیر</div>
              {[...(state.examBankSessions ?? [])]
                .slice(-5)
                .reverse()
                .map((s) => (
                  <div key={s.id} className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700/50 py-1 last:border-0">
                    <span>
                      {toFa(s.correct)}/{toFa(s.total)} درست · {toFa(Math.round(s.usedSec / 60))} دقیقه
                      {s.examType && s.examType !== "mixed" && ` · ${BANK_EXAM_LABEL[s.examType]}`}
                    </span>
                    <span className="font-bold">{toFa(s.answered ? Math.round((s.correct / s.answered) * 100) : 0)}٪</span>
                  </div>
                ))}
            </Card>
          )}
        </>
      )}

      {tab === "bookmarks" && (
        <>
          <Card className="mb-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {toFa(bookmarks.size)} سؤال نشان‌دار شده است. متن سؤال‌ها روی گوشی ذخیره نمی‌شود؛ برای مرور، همان مبحث
            از بانک (آنلاین) دوباره خوانده و فقط سؤال‌های نشان‌دار نمایش داده می‌شوند.
          </Card>
          <Button className="w-full" disabled={busy || bookmarks.size === 0} onClick={() => void startBookmarks()}>
            {busy ? "در حال گرفتن…" : "🔖 شروع مرور نشان‌دارها"}
          </Button>
          <div className="mt-2">
            {attempts
              .filter((a) => bookmarks.has(a.questionId))
              .slice(-40)
              .reverse()
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between text-[11px] border-b border-slate-100 dark:border-slate-700/50 py-1.5">
                  <span className="text-slate-600 dark:text-slate-300">
                    {a.topicTitle ?? a.topicId} · {toFa(a.year)} {a.correct ? "✅" : "❌"}
                  </span>
                  <button type="button" className="text-[10px] text-rose-500" onClick={() => toggleBankBookmark(a.questionId)}>
                    برداشتن
                  </button>
                </div>
              ))}
          </div>
        </>
      )}

      {tab === "settings" && (
        <Card className="space-y-2">
          <div>
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">آدرس بانک سؤال</div>
            <input className={cn(inputClass, "text-[11px] py-1.5")} dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/qbank" aria-label="آدرس بانک" />
            <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              خالی بگذار تا از بانکِ همراهِ اپ (<code dir="ltr">qbank</code> کنار اپ) استفاده شود. ساختار: <code dir="ltr">manifest.json</code> +{" "}
              <code dir="ltr">topics/&lt;topicId&gt;.json.gz</code>. با <code dir="ltr">npm run bank:build</code> شاردها از خروجیِ JSONL ساخته می‌شوند.
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <Button
                size="sm"
                onClick={() => {
                  setBankBaseUrl(url);
                  setManifest(null);
                  clearBankCache();
                  toast("آدرس بانک ذخیره شد", "☁️");
                  void refreshManifest();
                }}
              >
                ذخیره و اتصال
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setUrl("");
                  setBankBaseUrl("");
                  setManifest(null);
                  clearBankCache();
                  void refreshManifest();
                }}
              >
                برگشت به داخلی
              </Button>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/60 pt-2 leading-relaxed">
            <div>وضعیت: {bankConfigured() ? "آدرس سفارشی تنظیم شده" : source === "online" ? "بانک همراهِ اپ (پوشهٔ qbank)" : "فقط نمونهٔ داخلی"}</div>
            {manifest && (
              <>
                <div>نسخه: {manifest.version}{manifest.encoding === "gzip" ? " · فشرده (gzip)" : ""}</div>
                <div>{toFa(manifest.topics.length)} مبحث · {toFa(manifest.topics.reduce((s, t) => s + t.count, 0))} سؤال</div>
              </>
            )}
            <div>متن سؤال‌ها بعد از خروج از آزمون پاک می‌شود؛ فقط پاسخ‌ها و نتیجه‌ها می‌مانند.</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void refreshManifest()} disabled={loadingManifest}>
            {loadingManifest ? "…" : "🔄 به‌روزرسانی فهرست"}
          </Button>
        </Card>
      )}
    </div>,
  );
}