import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, ConfirmDialog, ProgressBar, RingProgress, SectionTitle, StatTile } from "../components/ui";
import { MonthlyGoalCard } from "../components/MonthlyGoalCard";
import StudyBuddy from "../components/StudyBuddy";
import { ExamCountdownCard, ExamTimeChip, SortableTasks, TaskRow } from "../components/shared";
import { diffDays, formatJalaliLong, formatMinutes, toFa, todayKey } from "../lib/jalali";
import { compareExams, nextExam } from "../lib/exam";
import { QUOTES, quoteOfTheDay } from "../lib/quotes";
import { classifyReviews } from "../lib/srs";
import { completedTopics, computeStreak, dailyGoalProgress, daysBehind, minutesOnDate, plannedMinutesOnDate, totalMinutes, weeklyAdherence } from "../lib/stats";
import { levelFromXp, levelTitle } from "../lib/gamification";
import { cn } from "../utils/cn";
import type { StudyTask } from "../types";

// ماتریس آیزنهاور: فوری = امروز یا عقب‌افتاده؛ مهم = پرچم important
function eisenhowerQuads(tasks: StudyTask[], today: string) {
  const urgentOf = (t: StudyTask) => t.date <= today;
  return [
    { key: "do", label: "همین حالا انجام بده", hint: "مهم و فوری", color: "#ef4444", icon: "🔥", items: tasks.filter((t) => !!t.important && urgentOf(t)) },
    { key: "schedule", label: "برنامه‌ریزی کن", hint: "مهم ولی غیرفوری", color: "#f59e0b", icon: "🎯", items: tasks.filter((t) => !!t.important && !urgentOf(t)) },
    { key: "quick", label: "سریع تمامش کن", hint: "فوری ولی کم‌اهمیت", color: "#3b82f6", icon: "⚡", items: tasks.filter((t) => !t.important && urgentOf(t)) },
    { key: "later", label: "بگذار برای بعد", hint: "نه مهم نه فوری", color: "#94a3b8", icon: "🌙", items: tasks.filter((t) => !t.important && !urgentOf(t)) },
  ];
}

function topicNameOf(state: { topics: { id: string; name: string }[] }, t: StudyTask): string {
  return state.topics.find((x) => x.id === t.topicId)?.name ?? "مبحث";
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "شب‌بخیر";
  if (h < 12) return "صبح‌بخیر";
  if (h < 17) return "ظهر‌بخیر";
  if (h < 21) return "عصر‌بخیر";
  return "شب‌بخیر";
}

export default function HomePage() {
  const { state, startSession, replanPlan, toast, reorderTasks } = useStore();
  const { go } = useNav();
  const today = todayKey();
  const [replanOpen, setReplanOpen] = useState(false);
  const [quoteOffset, setQuoteOffset] = useState(0);
  const [taskView, setTaskView] = useState<"list" | "matrix">("list");

  const todayTasks = useMemo(
    () => state.tasks.filter((t) => t.date === today).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.order - b.order),
    [state.tasks, today],
  );
  const overdueTasks = useMemo(() => state.tasks.filter((t) => t.date < today && t.status === "pending"), [state.tasks, today]);
  const pendingAll = useMemo(() => state.tasks.filter((t) => t.status === "pending").sort((a, b) => a.date.localeCompare(b.date)), [state.tasks]);
  const quads = useMemo(() => eisenhowerQuads(pendingAll, today), [pendingAll, today]);
  const planned = plannedMinutesOnDate(state.tasks, today);
  const studied = minutesOnDate(state.sessions, today);
  const pct = planned > 0 ? Math.min(100, Math.round((studied / planned) * 100)) : 0;
  const goal = state.settings.dailyGoalMinutes;
  const goalState = dailyGoalProgress(studied, goal);
  const ringPct = planned > 0 ? pct : goalState.pct;
  const reviews = classifyReviews(state.reviews, today);
  const reviewsCount = reviews.today.length + reviews.overdue.length;
  const streak = computeStreak(state.sessions, today, state.settings.streakFreezes);
  const behind = daysBehind(state.tasks, today);
  const activePlans = state.plans.filter((p) => !p.archived && p.endDate >= today);
  const level = levelFromXp(state.settings.xp);
  const upcomingExams = useMemo(() => state.exams.filter((e) => e.date >= today).sort(compareExams), [state.exams, today]);
  /** نزدیک‌ترین امتحان برای تایمر شمارش معکوس (بر اساس ساعت، اگر ثبت شده باشد) */
  const nextExamTarget = useMemo(() => nextExam(state.exams), [state.exams]);
  const examCountdown = (date: string) => {
    const d = diffDays(today, date);
    if (d === 0) return { text: "امروز", urgent: true };
    if (d === 1) return { text: "فردا", urgent: true };
    return { text: `${toFa(d)} روز دیگر`, urgent: d <= 3 };
  };

  const onStart = (task: StudyTask) => {
    if (state.activeSession) {
      toast("یک جلسه مطالعه فعال داری. ابتدا آن را پایان بده.", "⏳");
      go("study");
      return;
    }
    startSession(task.topicId, "free", task.id);
    go("study");
  };

  const handleReplan = () => {
    const planIds = new Set(overdueTasks.map((t) => t.planId).filter(Boolean) as string[]);
    if (planIds.size === 0) {
      toast("این تسک‌ها به برنامه‌ای متصل نیستند؛ از منوی هر تسک آن را جابه‌جا کن.", "ℹ️");
      return;
    }
    planIds.forEach((id) => replanPlan(id));
    toast("برنامه با توجه به زمان باقی‌مانده دوباره توزیع شد", "✅");
  };

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-50">{greeting()} 👋</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{formatJalaliLong(today)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
            ⭐ سطح {toFa(level.level)} · {levelTitle(level.level)}
          </span>
          <span className="text-[10px] text-slate-400">{toFa(state.settings.xp)} XP</span>
        </div>
      </div>

      {/* Daily motivational quote */}
      <Card className="mb-4 overflow-hidden border-teal-200/70 dark:border-teal-800/40 bg-gradient-to-l from-teal-50/90 via-white to-white dark:from-teal-950/40 dark:via-slate-800/80 dark:to-slate-800/80">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none text-teal-500 dark:text-teal-400 select-none">❝</span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] leading-7 font-medium text-slate-700 dark:text-slate-100">{quoteOfTheDay(today, quoteOffset).text}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-teal-600 dark:text-teal-300">{quoteOfTheDay(today, quoteOffset).author ?? "انگیزه‌ی امروز"}</div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="hidden sm:inline">هر روز یک جمله‌ی تازه · {toFa(QUOTES.length)} جمله آماده داریم</span>
                <button
                  type="button"
                  onClick={() => setQuoteOffset((o) => o + 1)}
                  className="px-2 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-medium hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors text-[11px]"
                  title="نمایش جمله‌ی بعدی"
                >
                  🔄 بعدی
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* یار کمکی مطالعه */}
      <StudyBuddy />

      {/* Replan banner */}
      {behind > 0 && (
        <Card className="mb-4 border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-900/20">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <div className="font-bold text-amber-800 dark:text-amber-200 text-sm">{toFa(behind)} روز از برنامه عقب افتاده‌ای</div>
              <div className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                {toFa(overdueTasks.length)} مبحث انجام‌نشده. برنامه را مجدداً تنظیم کنم؟
              </div>
            </div>
            <Button size="sm" onClick={() => setReplanOpen(true)}>
              تنظیم مجدد
            </Button>
          </div>
        </Card>
      )}

      {/* Today progress */}
      <Card className="mb-4 bg-gradient-to-br from-teal-600 to-teal-700 dark:from-teal-700 dark:to-teal-900 text-white border-0">
        <div className="flex items-center gap-4">
          <RingProgress value={ringPct} size={96} stroke={9} color="#ffffff">
            <div className="text-center">
              <div className="text-xl font-extrabold">{toFa(ringPct)}٪</div>
            </div>
          </RingProgress>
          <div className="flex-1">
            <div className="text-teal-100 text-xs mb-1">مطالعه امروز</div>
            <div className="text-lg font-bold leading-snug">
              {formatMinutes(studied)}
              {planned > 0 && <span className="text-teal-100 font-normal text-sm"> از {formatMinutes(planned)}</span>}
            </div>
            <div className="mt-3">
              <ProgressBar value={pct} color="#ffffff" className="bg-white/25" height="h-2" />
            </div>
            {goal > 0 ? (
              <div className="mt-2.5">
                <div className="flex items-center justify-between text-[11px] text-teal-100 mb-1">
                  <span>🎯 هدف روزانه: {formatMinutes(studied)} از {formatMinutes(goal)}</span>
                  <span className={cn(goalState.done && "font-bold")}>{goalState.done ? "✅ انجام شد" : `${toFa(goalState.remaining)} دقیقه مانده`}</span>
                </div>
                <ProgressBar value={goalState.pct} color="#ffffff" className="bg-white/25" height="h-1.5" />
              </div>
            ) : (
              <button type="button" onClick={() => go("settings")} className="text-[11px] text-teal-100 underline underline-offset-4 mt-2">
                🎯 برای امروزت هدف مطالعه تعیین کن
              </button>
            )}
            {planned === 0 && goal === 0 && <div className="text-[11px] text-teal-100 mt-2">برای امروز برنامه‌ای ثبت نشده است.</div>}
          </div>
        </div>
      </Card>

      {/* تایمر شمارش معکوس نزدیک‌ترین امتحان (اختیاری — از تنظیمات خاموش/روشن می‌شود) */}
      {state.settings.examTimer.enabled && nextExamTarget && <ExamCountdownCard exam={nextExamTarget} onOpen={() => go("exams")} />}

      {/* هدف ماهانه */}
      <MonthlyGoalCard />

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <Card onClick={() => go("reviews")} className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-xl">🔁</div>
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100">{toFa(reviewsCount)} مرور</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              برای امروز{reviews.overdue.length > 0 && <span className="text-rose-500"> ({toFa(reviews.overdue.length)} عقب‌افتاده)</span>}
            </div>
          </div>
        </Card>
        <Card onClick={() => go("study")} className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-xl">{state.activeSession ? "⏳" : "▶️"}</div>
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100">{state.activeSession ? "جلسه فعال" : "مطالعه آزاد"}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{state.activeSession ? "ادامه بده" : "شروع تایمر"}</div>
          </div>
        </Card>
      </div>

      {/* Upcoming exams */}
      <SectionTitle
        action={
          <button type="button" onClick={() => go("exams")} className="text-xs text-teal-600 dark:text-teal-400 font-medium">
            تقویم ←
          </button>
        }
      >
        امتحانات پیش‌رو
      </SectionTitle>
      {upcomingExams.length === 0 ? (
        <Card onClick={() => go("exams")} className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-xl">📝</div>
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100">هنوز امتحانی ثبت نشده</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">روی تقویم علامتشان بزن تا روزهای مانده را اینجا ببینی.</div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {upcomingExams.slice(0, 3).map((e, i) => {
            const c = examCountdown(e.date);
            return (
              <Card key={e.id} onClick={() => go("exams")} className={cn("flex items-center gap-3", i === 0 && "ring-1 ring-rose-300/60 dark:ring-rose-700/40")}>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0" style={{ backgroundColor: (e.color ?? "#ef4444") + "22" }}>
                  📝
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{e.title}</span>
                    <ExamTimeChip exam={e} />
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatJalaliLong(e.date)}</div>
                </div>
                <span className={cn("text-xs px-2.5 py-1 rounded-full font-bold shrink-0", c.urgent ? "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300")}>
                  {c.text}
                </span>
              </Card>
            );
          })}
        </div>
      )}

      {/* Today tasks */}
      <SectionTitle
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px]">
              <button type="button" onClick={() => setTaskView("list")} className={cn("px-2.5 py-1 rounded-lg font-medium", taskView === "list" ? "bg-white dark:bg-slate-700 shadow text-teal-600 dark:text-teal-300" : "text-slate-400")}>فهرست</button>
              <button type="button" onClick={() => setTaskView("matrix")} className={cn("px-2.5 py-1 rounded-lg font-medium", taskView === "matrix" ? "bg-white dark:bg-slate-700 shadow text-teal-600 dark:text-teal-300" : "text-slate-400")}>ماتریس</button>
            </div>
            <button type="button" onClick={() => go("plan", { planSub: "calendar", date: today })} className="text-xs text-teal-600 dark:text-teal-400 font-medium">
              تقویم ←
            </button>
          </div>
        }
      >
        کارهای امروز
      </SectionTitle>
      {todayTasks.length === 0 ? (
        <Card className="text-center py-8">
          <div className="text-3xl mb-2">🗓️</div>
          <div className="font-semibold text-slate-700 dark:text-slate-200 text-sm">برای امروز کاری برنامه‌ریزی نشده</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
            {state.subjects.length === 0 ? "ابتدا درس و مبحث اضافه کن، سپس یک برنامه بساز." : "یک برنامه بساز یا از تقویم مبحث اضافه کن."}
          </p>
          <div className="flex justify-center gap-2">
            {state.subjects.length === 0 ? (
              <Button size="sm" onClick={() => go("plan", { planSub: "subjects" })}>
                افزودن اولین درس
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={() => go("plan", { planSub: "plans" })}>
                  ساخت برنامه
                </Button>
                <Button size="sm" variant="secondary" onClick={() => go("plan", { planSub: "calendar", date: today })}>
                  افزودن دستی
                </Button>
              </>
            )}
          </div>
        </Card>
      ) : taskView === "list" ? (
        <SortableTasks tasks={todayTasks} onReorder={reorderTasks} renderRow={(t) => <TaskRow key={t.id} task={t} onStart={onStart} />} />
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-2">
            {quads.map((q) => (
              <div key={q.key} className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-2.5 min-h-28">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: q.color }} />
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight">{q.icon} {q.label}</span>
                </div>
                <div className="text-[9px] text-slate-400 mb-2">{q.hint}</div>
                <div className="flex flex-col gap-1">
                  {q.items.slice(0, 3).map((t) => (
                    <div key={t.id} className="text-[10px] text-slate-600 dark:text-slate-300 truncate bg-slate-50 dark:bg-slate-700/50 rounded-lg px-1.5 py-1">
                      {topicNameOf(state, t)}
                    </div>
                  ))}
                  {q.items.length > 3 && <div className="text-[9px] text-slate-400">و {toFa(q.items.length - 3)} مورد دیگر…</div>}
                  {q.items.length === 0 && <div className="text-[10px] text-slate-300 dark:text-slate-600 text-center py-1.5">خالی</div>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
            فوری یعنی امروز یا عقب‌افتاده؛ مهم را از منوی هر کار با ⭐ علامت بزن. همه‌ی کارهای در انتظار (نه فقط امروز) اینجا دیده می‌شوند.
          </p>
        </div>
      )}

      {overdueTasks.length > 0 && (
        <>
          <SectionTitle>عقب‌افتاده‌ها</SectionTitle>
          <div className="flex flex-col gap-2">
            {overdueTasks.slice(0, 5).map((t) => (
              <TaskRow key={t.id} task={t} onStart={onStart} compact />
            ))}
            {overdueTasks.length > 5 && <div className="text-xs text-slate-400 text-center">و {toFa(overdueTasks.length - 5)} مورد دیگر…</div>}
          </div>
        </>
      )}

      {/* Overall */}
      <SectionTitle>وضعیت کلی</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="🔥" label="Streak" value={`${toFa(streak)} روز`} sub={state.settings.streakFreezes > 0 ? `❄️ ${toFa(state.settings.streakFreezes)} یخ‌زدگی` : streak > 0 ? "ادامه بده!" : "امروز شروع کن"} />
        <StatTile icon="⏱" label="مجموع مطالعه" value={formatMinutes(totalMinutes(state.sessions))} />
        <StatTile icon="✅" label="مباحث تکمیل‌شده" value={`${toFa(completedTopics(state.topics))} از ${toFa(state.topics.length)}`} />
        <StatTile icon="📈" label="تحقق برنامه هفتگی" value={`${toFa(weeklyAdherence(state.tasks, today))}٪`} sub={activePlans.length > 0 ? `${toFa(activePlans.length)} برنامه فعال` : undefined} />
      </div>

      <ConfirmDialog
        open={replanOpen}
        onClose={() => setReplanOpen(false)}
        title="تنظیم مجدد برنامه"
        message={`${toFa(behind)} روز عقب افتاده‌ای. مباحث انجام‌نشده با توجه به روزهای باقی‌مانده تا پایان برنامه دوباره توزیع می‌شوند. کارهای انجام‌شده دست‌نخورده می‌مانند.`}
        confirmLabel="بله، دوباره برنامه‌ریزی کن"
        onConfirm={handleReplan}
      />
    </div>
  );
}
