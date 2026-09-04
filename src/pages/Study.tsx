import { useEffect, useMemo, useState } from "react";
import { useLookups, useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, ConfirmDialog, Modal, PauseIcon, PlayIcon, SectionTitle, Segmented } from "../components/ui";
import { RatingPicker } from "../components/shared";
import { formatClock, formatJalaliShort, formatMinutes, relativeDayLabel, toFa, todayKey } from "../lib/jalali";
import { RATING_LABEL, type ActiveSession, type PomodoroSettings, type Rating, type SessionMode } from "../types";
import { cn } from "../utils/cn";

const PHASE_LABEL = { work: "زمان مطالعه", short: "استراحت کوتاه", long: "استراحت طولانی" } as const;

export function phaseDurationMs(a: ActiveSession, p: PomodoroSettings): number {
  const minutes = a.phase === "work" ? p.work : a.phase === "short" ? p.shortBreak : p.longBreak;
  return minutes * 60_000;
}

export function phaseElapsedMs(a: ActiveSession, now: number): number {
  return a.accumulatedMs + (a.running && a.startedAt != null ? now - a.startedAt : 0);
}

export function totalStudyMs(a: ActiveSession, now: number): number {
  return a.totalStudyMs + (a.phase === "work" && a.running && a.startedAt != null ? now - a.startedAt : 0);
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

interface SessionSummary {
  minutes: number;
  rating: Rating;
  due: string;
}

export default function StudyPage() {
  const { state } = useStore();
  const { go } = useNav();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  return (
    <>
      {state.activeSession ? <ActiveSessionView session={state.activeSession} onFinished={setSummary} /> : <StartView />}
      <Modal
        open={!!summary}
        onClose={() => setSummary(null)}
        title="جلسه ثبت شد 🎉"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSummary(null)}>
              جلسه جدید
            </Button>
            <Button
              onClick={() => {
                setSummary(null);
                go("home");
              }}
            >
              بازگشت به خانه
            </Button>
          </>
        }
      >
        {summary && (
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
            <div>⏱ {formatMinutes(summary.minutes)} مطالعه ثبت شد (+{toFa(summary.minutes)} XP)</div>
            <div>🧠 ارزیابی: {RATING_LABEL[summary.rating]}</div>
            <div>
              🔁 مرور بعدی: <b>{formatJalaliShort(summary.due)}</b> ({relativeDayLabel(summary.due)})
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ===== Start view =====
function StartView() {
  const { state, startSession } = useStore();
  const { topicById, subjectById } = useLookups();
  const { go } = useNav();
  const [mode, setMode] = useState<SessionMode>("free");
  const [topicId, setTopicId] = useState<string>("");
  const [query, setQuery] = useState("");
  const today = todayKey();

  const todayTasks = useMemo(() => state.tasks.filter((t) => t.date === today && t.status !== "done"), [state.tasks, today]);
  const topics = useMemo(
    () => state.topics.filter((t) => t.status !== "mastered" && (query === "" || t.name.toLowerCase().includes(query.toLowerCase()) || subjectById.get(t.subjectId)?.name.includes(query))),
    [state.topics, query, subjectById],
  );
  const selectedTask = todayTasks.find((t) => t.topicId === topicId);
  const p = state.settings.pomodoro;

  if (state.topics.length === 0) {
    return (
      <div className="text-center py-16 px-6">
        <div className="text-5xl mb-4">⏱️</div>
        <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">هنوز مبحثی برای مطالعه نداری</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">ابتدا درس و مبحث اضافه کن تا بتوانی تایمر مطالعه را شروع کنی.</p>
        <Button onClick={() => go("plan", { planSub: "subjects" })}>افزودن درس</Button>
      </div>
    );
  }

  return (
    <div className="pb-6">
      <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50 mb-4">شروع مطالعه</h1>
      <Segmented value={mode} onChange={setMode} options={[{ value: "free", label: "تایمر آزاد" }, { value: "pomodoro", label: `پومودورو ${toFa(p.work)}/${toFa(p.shortBreak)}` }]} className="mb-5" />

      {todayTasks.length > 0 && (
        <>
          <SectionTitle>از برنامه امروز</SectionTitle>
          <div className="flex flex-col gap-2 mb-2">
            {todayTasks.map((t) => {
              const topic = topicById.get(t.topicId);
              const subject = topic ? subjectById.get(topic.subjectId) : undefined;
              if (!topic || !subject) return null;
              const on = topicId === t.topicId;
              return (
                <button key={t.id} type="button" onClick={() => setTopicId(t.topicId)} className={cn("flex items-center gap-3 rounded-2xl border p-3 text-right transition-colors", on ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30" : "border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/80")}>
                  <span className="w-1.5 h-8 rounded-full" style={{ backgroundColor: subject.color }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px]" style={{ color: subject.color }}>{subject.name}</span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{topic.name}</span>
                  </span>
                  <span className="text-[11px] text-slate-400">{formatMinutes(Math.max(0, t.plannedMinutes - t.doneMinutes))}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle>همه مباحث</SectionTitle>
      <input className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500/40 mb-2 text-slate-800 dark:text-slate-100" placeholder="جستجو…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 divide-y divide-slate-100 dark:divide-slate-700/60 max-h-64 overflow-y-auto">
        {topics.length === 0 && <div className="text-xs text-slate-400 text-center py-5">مبحثی یافت نشد</div>}
        {topics.map((t) => {
          const subject = subjectById.get(t.subjectId);
          const on = topicId === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTopicId(t.id)} className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-right text-sm", on && "bg-teal-50 dark:bg-teal-900/30")}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subject?.color }} />
              <span className="flex-1 text-slate-800 dark:text-slate-100">{t.name}</span>
              <span className="text-[11px] text-slate-400">{subject?.name}</span>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-20 mt-5">
        <Button size="lg" className="w-full" disabled={!topicId} onClick={() => startSession(topicId, mode, selectedTask?.id)}>
          <PlayIcon size={20} /> شروع {mode === "pomodoro" ? "پومودورو" : "مطالعه"}
        </Button>
      </div>
    </div>
  );
}

// ===== Active session view =====
function ActiveSessionView({ session, onFinished }: { session: ActiveSession; onFinished: (s: SessionSummary) => void }) {
  const { state, pauseSession, resumeSession, endSession, advancePhase, discardSession, toast } = useStore();
  const { topicById, subjectById } = useLookups();
  const now = useNow(true);
  const [rateOpen, setRateOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const topic = topicById.get(session.topicId);
  const subject = topic ? subjectById.get(topic.subjectId) : undefined;
  const p = state.settings.pomodoro;
  const elapsed = phaseElapsedMs(session, now);
  const total = totalStudyMs(session, now);
  const isPomo = session.mode === "pomodoro";
  const phaseMs = phaseDurationMs(session, p);
  const remaining = Math.max(0, phaseMs - elapsed);
  const pct = isPomo ? Math.min(100, (elapsed / phaseMs) * 100) : 0;
  const isBreak = session.phase !== "work";

  const finish = (rating: Rating) => {
    const res = endSession(rating);
    setRateOpen(false);
    if (res) onFinished({ minutes: res.session.durationMinutes, rating, due: res.review.dueDate });
  };

  return (
    <div className="pb-6 flex flex-col min-h-[70vh]">
      <div className="text-center mt-2 mb-6">
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: (subject?.color ?? "#0d9488") + "22", color: subject?.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subject?.color }} />
          {subject?.name}
        </div>
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-50 mt-2">{topic?.name}</h1>
        {isPomo && (
          <div className={cn("text-sm mt-1 font-medium", isBreak ? "text-emerald-600 dark:text-emerald-400" : "text-teal-600 dark:text-teal-400")}>
            {isBreak ? "☕ " : "📖 "}
            {PHASE_LABEL[session.phase]}
          </div>
        )}
      </div>

      {/* Big timer */}
      <div className="relative mx-auto mb-6" style={{ width: 260, height: 260 }}>
        <svg width={260} height={260} className="-rotate-90">
          <circle cx={130} cy={130} r={118} strokeWidth={12} fill="none" className="stroke-slate-100 dark:stroke-slate-700" />
          <circle
            cx={130}
            cy={130}
            r={118}
            strokeWidth={12}
            fill="none"
            strokeLinecap="round"
            stroke={isBreak ? "#10b981" : subject?.color ?? "#0d9488"}
            strokeDasharray={2 * Math.PI * 118}
            strokeDashoffset={2 * Math.PI * 118 * (1 - (isPomo ? pct / 100 : (elapsed % 3_600_000) / 3_600_000))}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={cn("text-5xl font-extrabold tabular-nums tracking-wider text-slate-800 dark:text-slate-50", !session.running && "animate-pulse opacity-70")} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatClock(isPomo ? remaining : elapsed)}
          </div>
          <div className="text-xs text-slate-400 mt-2">{session.running ? (isBreak ? "در حال استراحت" : "در حال مطالعه") : "متوقف شده"}</div>
          {isPomo && (
            <div className="flex gap-1.5 mt-3">
              {Array.from({ length: p.cycles }, (_, i) => (
                <span key={i} className={cn("w-2 h-2 rounded-full", i < session.cycle % p.cycles || (session.cycle > 0 && session.cycle % p.cycles === 0) ? "bg-teal-500" : "bg-slate-200 dark:bg-slate-600")} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Card className="mb-5 flex items-center justify-around text-center">
        <div>
          <div className="text-[11px] text-slate-400">مطالعه خالص</div>
          <div className="font-bold text-slate-800 dark:text-slate-100">{formatMinutes(Math.floor(total / 60000))}</div>
        </div>
        {isPomo && (
          <div>
            <div className="text-[11px] text-slate-400">سیکل</div>
            <div className="font-bold text-slate-800 dark:text-slate-100">{toFa(session.cycle)}</div>
          </div>
        )}
        <div>
          <div className="text-[11px] text-slate-400">حالت</div>
          <div className="font-bold text-slate-800 dark:text-slate-100">{isPomo ? "پومودورو" : "آزاد"}</div>
        </div>
      </Card>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mt-auto">
        <button type="button" onClick={() => setDiscardOpen(true)} className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center text-xs font-medium" title="انصراف">
          لغو
        </button>
        <button
          type="button"
          onClick={() => (session.running ? pauseSession() : resumeSession())}
          className="w-20 h-20 rounded-full text-white flex items-center justify-center shadow-xl active:scale-95 transition"
          style={{ backgroundColor: isBreak ? "#10b981" : subject?.color ?? "#0d9488" }}
        >
          {session.running ? <PauseIcon size={32} /> : <PlayIcon size={32} />}
        </button>
        <button type="button" onClick={() => setRateOpen(true)} className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 flex items-center justify-center text-xs font-bold" title="پایان">
          پایان
        </button>
      </div>
      {isPomo && (
        <button type="button" onClick={() => { advancePhase(); toast(isBreak ? "شروع سیکل بعدی" : "شروع استراحت", "⏭"); }} className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4 underline underline-offset-4">
          رد کردن این مرحله
        </button>
      )}

      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title="چقدر از این مبحث را یاد گرفتی؟">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          مدت مطالعه خالص: <b>{formatMinutes(Math.max(1, Math.round(total / 60000)))}</b>. بر اساس پاسخت، زمان مرور بعدی تعیین می‌شود.
        </p>
        <RatingPicker onPick={finish} />
      </Modal>

      <ConfirmDialog open={discardOpen} onClose={() => setDiscardOpen(false)} title="لغو جلسه" message="این جلسه بدون ثبت زمان حذف می‌شود. مطمئنی؟" confirmLabel="بله، لغو کن" danger onConfirm={discardSession} />
    </div>
  );
}
