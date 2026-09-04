import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, ConfirmDialog, ProgressBar, RingProgress, SectionTitle, StatTile } from "../components/ui";
import { TaskRow } from "../components/shared";
import { formatJalaliLong, formatMinutes, toFa, todayKey } from "../lib/jalali";
import { classifyReviews } from "../lib/srs";
import { completedTopics, computeStreak, daysBehind, minutesOnDate, plannedMinutesOnDate, totalMinutes, weeklyAdherence } from "../lib/stats";
import { levelFromXp, levelTitle } from "../lib/gamification";
import type { StudyTask } from "../types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "شب‌بخیر";
  if (h < 12) return "صبح‌بخیر";
  if (h < 17) return "ظهر‌بخیر";
  if (h < 21) return "عصر‌بخیر";
  return "شب‌بخیر";
}

export default function HomePage() {
  const { state, startSession, replanPlan, toast } = useStore();
  const { go } = useNav();
  const today = todayKey();
  const [replanOpen, setReplanOpen] = useState(false);

  const todayTasks = useMemo(
    () => state.tasks.filter((t) => t.date === today).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.order - b.order),
    [state.tasks, today],
  );
  const overdueTasks = useMemo(() => state.tasks.filter((t) => t.date < today && t.status === "pending"), [state.tasks, today]);
  const planned = plannedMinutesOnDate(state.tasks, today);
  const studied = minutesOnDate(state.sessions, today);
  const pct = planned > 0 ? Math.min(100, Math.round((studied / planned) * 100)) : 0;
  const reviews = classifyReviews(state.reviews, today);
  const reviewsCount = reviews.today.length + reviews.overdue.length;
  const streak = computeStreak(state.sessions, today);
  const behind = daysBehind(state.tasks, today);
  const activePlans = state.plans.filter((p) => !p.archived && p.endDate >= today);
  const level = levelFromXp(state.settings.xp);

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
          <RingProgress value={pct} size={96} stroke={9} color="#ffffff">
            <div className="text-center">
              <div className="text-xl font-extrabold">{toFa(pct)}٪</div>
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
            {planned === 0 && <div className="text-[11px] text-teal-100 mt-2">برای امروز برنامه‌ای ثبت نشده است.</div>}
          </div>
        </div>
      </Card>

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

      {/* Today tasks */}
      <SectionTitle
        action={
          <button type="button" onClick={() => go("plan", { planSub: "calendar", date: today })} className="text-xs text-teal-600 dark:text-teal-400 font-medium">
            تقویم ←
          </button>
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
      ) : (
        <div className="flex flex-col gap-2">
          {todayTasks.map((t) => (
            <TaskRow key={t.id} task={t} onStart={onStart} />
          ))}
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
        <StatTile icon="🔥" label="Streak" value={`${toFa(streak)} روز`} sub={streak > 0 ? "ادامه بده!" : "امروز شروع کن"} />
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
