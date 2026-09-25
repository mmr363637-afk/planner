import { useNav } from "../nav";
import PlanningTools from "../components/PlanningTools";
import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card, ProgressBar, SectionTitle, StatTile } from "../components/ui";
import { GardenCard } from "../components/GardenCard";
import GoldenHoursCard from "../components/GoldenHoursCard";
import TestStatsCard from "../components/TestStatsCard";
import GhostCard from "../components/GhostCard";
import JourneyCard from "../components/JourneyCard";
import WrappedModal from "../components/WrappedModal";
import { WEEKDAYS_SHORT_FA, addDays, formatHoursCompact, formatJalaliLong, formatJalaliNumeric, formatMinutes, keyToJalali, startOfWeek, toFa, todayKey, weekdayOf } from "../lib/jalali";
import { UNASSIGNED_SUBJECT_ID, avgFocusScore, completedTopics, computeStreak, doneMinutesOnDate, focusLast7Days, heatLevel, heatmapData, last7Days, minutesBySubject, minutesInRange, minutesOnDate, planAdherence, plannedMinutesOnDate, pomodoroStats, topSounds, totalDistractions, weeklyAdherence } from "../lib/stats";
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, MAX_STREAK_FREEZES, STREAK_FREEZE_COST, levelFromXp, levelTitle } from "../lib/gamification";
import { AMBIENT_SOUNDS } from "../lib/ambientMeta";
import { gardenProgress } from "../lib/garden";
import { renderShareCard, shareOrDownloadCard } from "../lib/shareCard";
import { harborShareSummary } from "../lib/wrappedShare";
import { shareText } from "../lib/share";
import { cn } from "../utils/cn";
import type { StudySession } from "../types";
import { WeeklyReport, MonthlyReport } from "../components/WeeklyReport";
import WeakSpotsCard from "../components/WeakSpotsCard";
import InsightsCard from "../components/InsightsCard";
import MemoryGardenCard from "../components/MemoryGardenCard";

/** نقشه‌ی حرارتی سالانه — سبک GitHub، هفته‌ی شنبه‌شروع، راست به چپ */
function YearHeatmap({ sessions, today }: { sessions: StudySession[]; today: string }) {
  const { cells, months } = heatmapData(sessions, today);
  // ستون‌بندی: هر هفته یک ستون؛ رندر راست‌به‌چپ (قدیمی‌ترین سمت راست)
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const rowLabels = ["ش", "ی", "د", "س", "چ", "پ", "ج"]; // شنبه تا جمعه
  const LEVEL_CLASS = [
    "bg-slate-100 dark:bg-slate-700/50",
    "bg-teal-200 dark:bg-teal-800",
    "bg-teal-300 dark:bg-teal-600",
    "bg-teal-500 dark:bg-teal-500",
    "bg-teal-700 dark:bg-teal-300",
  ];
  // برچسب ماه‌ها روی هفته‌ها (col از سمت راست)
  const monthByCol = new Map(months.map((m) => [weeks.length - 1 - m.col, m.label]));
  return (
    <div dir="ltr" className="overflow-x-auto">
      <div className="min-w-[560px]">
        {/* ماه‌ها */}
        <div className="flex gap-[3px] mb-1 mr-6">
          {weeks.map((_, col) => (
            <div key={col} className="w-[9px] text-[7px] text-slate-400 whitespace-nowrap" style={{ direction: "rtl" }}>
              {monthByCol.get(col) ?? ""}
            </div>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {/* برچسب روزها */}
          <div className="flex flex-col gap-[3px] mr-1 w-4 shrink-0">
            {rowLabels.map((l) => (
              <div key={l} className="h-[9px] text-[7px] text-slate-400 leading-[9px] text-center" style={{ direction: "rtl" }}>{l}</div>
            ))}
          </div>
          {weeks.map((week, col) => (
            <div key={col} className="flex flex-col gap-[3px] relative">
              {monthByCol.has(col) && <div className="absolute -top-3 right-0 text-[7px] text-slate-400" style={{ direction: "rtl" }}>{monthByCol.get(col)}</div>}
              {week.map((c) => {
                const future = c.date > today;
                return (
                  <div
                    key={c.date}
                    title={`${formatJalaliNumeric(c.date)}${future ? "" : ` — ${c.minutes > 0 ? formatMinutes(c.minutes) : "بدون مطالعه"}`}`}
                    className={cn("w-[9px] h-[9px] rounded-[2px]", future ? "bg-transparent" : LEVEL_CLASS[heatLevel(c.minutes)])}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-1 mt-2 text-[8px] text-slate-400" style={{ direction: "rtl" }}>
          <span>کمتر</span>
          {LEVEL_CLASS.map((c, i) => <span key={i} className={cn("w-[8px] h-[8px] rounded-[2px] inline-block", c)} />)}
          <span>بیشتر</span>
        </div>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { state, buyStreakFreeze, toast } = useStore();
  const {go} = useNav();
  const [showEmpty,setShowEmpty] = useState(false);
  const today = todayKey();
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [monthWrappedOpen, setMonthWrappedOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const shareCard = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const streakNow = computeStreak(state.sessions, today, state.settings.streakFreezes);
      const totalMin = state.sessions.reduce((s, x) => s + x.durationMinutes, 0);
      const level = levelFromXp(state.settings.xp);
      const { stage } = gardenProgress(totalMin);
      const weekStart0 = startOfWeek(today);
      const weekMin = minutesInRange(state.sessions, weekStart0, addDays(weekStart0, 6));
      const canvas = renderShareCard({
        dateLine: formatJalaliLong(today),
        streakDays: streakNow,
        totalHours: formatMinutes(totalMin),
        weekHours: formatMinutes(weekMin),
        xp: state.settings.xp,
        levelText: `سطح ${toFa(level.level)} · ${levelTitle(level.level)}`,
        mastered: completedTopics(state.topics),
        totalTopics: state.topics.length,
        gardenIcon: stage.icon,
        gardenLabel: stage.label,
        accent: state.settings.accentColor,
      });
      if (!canvas) {
        // در محیط‌های بدون canvas (مثلاً مرورگر قدیمی) متن به اشتراک گذاشته می‌شود
        const r = await shareText(harborShareSummary(state, today));
        toast(r === "copied" ? "خلاصه کپی شد" : "اشتراک گذاشته شد", "📤");
        return;
      }
      const r = await shareOrDownloadCard(canvas, "study-planner-summary.png", harborShareSummary(state, today));
      toast(r === "shared" ? "کارت ارسال شد 🎉" : r === "downloaded" ? "کارت دانلود شد" : "نشد 😔", "📤");
    } finally {
      setSharing(false);
    }
  };
  const { jy, jm } = keyToJalali(today);
  const monthStart = useMemo(() => {
    // first day of the current Jalali month
    let d = today;
    while (keyToJalali(addDays(d, -1)).jm === jm && keyToJalali(addDays(d, -1)).jy === jy) d = addDays(d, -1);
    return d;
  }, [today, jm, jy]);

  const weekStart = startOfWeek(today);
  const todayMin = minutesOnDate(state.sessions, today);
  const weekMin = minutesInRange(state.sessions, weekStart, addDays(weekStart, 6));
  const monthMin = minutesInRange(state.sessions, monthStart, today);
  const streak = computeStreak(state.sessions, today, state.settings.streakFreezes);
  const pomo = pomodoroStats(state.sessions, today);
  const week = last7Days(state.sessions, today);
  const maxDay = Math.max(60, ...week.map((d) => d.minutes));
  // برنامه‌ریزی‌شده در برابر انجام‌شده — از تسک‌های ۷ روز اخیر
  const planVsActual = week.map((d) => ({ date: d.date, planned: plannedMinutesOnDate(state.tasks, d.date), done: doneMinutesOnDate(state.tasks, d.date) }));
  const planVsMax = Math.max(60, ...planVsActual.map((d) => Math.max(d.planned, d.done)));
  const hasPlannedWeek = planVsActual.some((d) => d.planned > 0);
  const bySubject = minutesBySubject(state.sessions, state.topics);
  const subjectRows = state.subjects.map((s) => ({ id: s.id, name: s.name, color: s.color, minutes: bySubject[s.id] ?? 0 }));
  if (bySubject[UNASSIGNED_SUBJECT_ID]) {
    subjectRows.push({ id: UNASSIGNED_SUBJECT_ID, name: "مطالعه بدون درس", color: state.settings.accentColor, minutes: bySubject[UNASSIGNED_SUBJECT_ID] });
  }
  subjectRows.sort((a, b) => b.minutes - a.minutes);
  const maxSubject = Math.max(1, ...subjectRows.map((s) => s.minutes));
  const adherence = planAdherence(state.tasks, addDays(today, -29), today);
  const level = levelFromXp(state.settings.xp);
  const unlocked = new Set(state.achievements.map((a) => a.id));
  const avgSession = state.sessions.length ? Math.round(state.sessions.reduce((s, x) => s + x.durationMinutes, 0) / state.sessions.length) : 0;
  const distractions = totalDistractions(state.sessions);
  const focusWeek = focusLast7Days(state.sessions, today);
  const focusAvg = avgFocusScore(state.sessions.filter((s) => s.date >= addDays(today, -6)));
  const sounds = topSounds(state.sessions, 4);

  if (!state.sessions.length && !state.testLogs.length && !showEmpty) return <div className="pb-6"><h1 className="text-xl font-bold mb-4">آمار</h1><Card><h2 className="font-bold mb-2">اولین داده، اولین بینش</h2><p className="text-sm leading-7 text-slate-500 mb-4">هنوز مطالعه یا آزمونی ثبت نشده. بعد از اولین جلسه، زمان و پیشرفتت اینجا دیده می‌شود؛ برای تحلیل عادت زمانی و تخمین‌ها به چند جلسه نیاز داریم.</p><Button onClick={()=>go("study")}>شروع اولین جلسه</Button><Button variant="ghost" onClick={()=>setShowEmpty(true)}>دیدن ساختار گزارش‌ها</Button></Card><PlanningTools /></div>;

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50">آمار</h1>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={shareCard} disabled={sharing}>
            📤 کارت اشتراک
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWrappedOpen(true)}>
            ✨ سال
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMonthWrappedOpen(true)}>
            📅 ماه
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            🖨 چاپ
          </Button>
        </div>
      </div>

      <WrappedModal open={wrappedOpen} onClose={() => setWrappedOpen(false)} />
      <WrappedModal open={monthWrappedOpen} onClose={() => setMonthWrappedOpen(false)} mode="month" />

      {/* کلینیک و عیب‌یابی نقاط ضعف */}
      <WeakSpotsCard />

      <details className="mb-4"><summary className="text-sm font-medium cursor-pointer mb-3">انگیزه، امتیاز و باغ (اختیاری)</summary>
      <Card className="mb-4 bg-gradient-to-br from-amber-400 to-orange-500 text-white border-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-amber-50">سطح {toFa(level.level)} · {levelTitle(level.level)}</div>
            <div className="text-2xl font-extrabold mt-0.5">⭐ {toFa(state.settings.xp)} XP</div>
          </div>
          <div className="text-left">
            <div className="text-xs text-amber-50">🔥 Streak</div>
            <div className="text-2xl font-extrabold">{toFa(streak)} روز</div>
          </div>
        </div>
        <ProgressBar value={level.progress} color="#fff" className="bg-white/25 mt-3" height="h-1.5" />
        <div className="text-[10px] text-amber-50 mt-1">{toFa(level.next - state.settings.xp)} XP تا سطح بعد</div>
        {/* یخ‌زدگی Streak */}
        <div className="mt-3 pt-3 border-t border-white/25 flex items-center justify-between gap-2">
          <div className="text-[11px] text-amber-50 leading-snug">
            ❄️ یخ‌زدگی: <b>{toFa(state.settings.streakFreezes)}</b> از {toFa(MAX_STREAK_FREEZES)}
            <span className="block text-[10px] opacity-80">روز جامانده را پوشش می‌دهد تا زنجیره نشکند</span>
          </div>
          {state.settings.streakFreezes < MAX_STREAK_FREEZES && (
            <button
              type="button"
              onClick={buyStreakFreeze}
              className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
              title={`خرید با ${STREAK_FREEZE_COST} XP`}
            >
              خرید ({toFa(STREAK_FREEZE_COST)} XP)
            </button>
          )}
        </div>
      </Card>

      {/* باغ مجازی: رشدِ بصریِ مجموع زمان مطالعه */}
      <div className="mb-4">
        <GardenCard />
      </div>
      </details>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <StatTile icon="📅" label="امروز" value={formatHoursCompact(todayMin)} className="p-3" />
        <StatTile icon="🗓️" label="این هفته" value={formatHoursCompact(weekMin)} className="p-3" />
        <StatTile icon="📆" label="این ماه" value={formatHoursCompact(monthMin)} className="p-3" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatTile icon="⏱" label="تعداد جلسات" value={toFa(state.sessions.length)} sub={avgSession ? `میانگین ${formatMinutes(avgSession)}` : undefined} />
        <StatTile icon="✅" label="مباحث تکمیل‌شده" value={`${toFa(completedTopics(state.topics))} / ${toFa(state.topics.length)}`} />
        <StatTile icon="📈" label="تحقق برنامه (۳۰ روز)" value={`${toFa(adherence)}٪`} />
        <StatTile icon="🎯" label="تحقق این هفته" value={`${toFa(weeklyAdherence(state.tasks, today))}٪`} />
        {distractions > 0 && (
          <StatTile icon="🙈" label="حواس‌پرتی (کل)" value={toFa(distractions)} sub="با دکمه‌ی حین مطالعه ثبت می‌شود" className="col-span-2" />
        )}
      </div>

      {/* با چه صدایی بیشتر می‌خوانی؟ */}
      {sounds.length > 0 && (
        <>
          <SectionTitle>با چه صدایی بیشتر می‌خوانی؟ 🎧</SectionTitle>
          <Card>
            <div className="flex flex-wrap gap-2">
              {sounds.map((s) => {
                const meta = AMBIENT_SOUNDS.find((x) => x.id === s.id);
                return (
                  <span key={s.id} className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300">
                    <span aria-hidden="true">{meta?.icon ?? "🎵"}</span>
                    {meta?.label ?? s.id}
                    <b className="text-teal-600 dark:text-teal-400">{formatMinutes(s.minutes)}</b>
                  </span>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-2.5 leading-relaxed">
              صداهای تمرکزی که هنگام پایان هر جلسه پخش بوده‌اند، در همان جلسه ثبت می‌شوند.
            </p>
          </Card>
        </>
      )}

      {/* آمار پومودورو */}
      {pomo.total > 0 && (
        <>
          <SectionTitle>پومودورو 🍅</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <StatTile icon="✅" label="این هفته" value={`${toFa(pomo.week)} سیکل`} className="p-3" />
            <StatTile icon="🏅" label="مجموع" value={`${toFa(pomo.total)} سیکل`} className="p-3" />
            <StatTile icon="📆" label="روزهای فعال" value={toFa(pomo.activeDays)} className="p-3" />
          </div>
        </>
      )}

      {/* نمره تمرکز + روند حواس‌پرتی */}
      {state.sessions.length > 0 && (
        <>
          <SectionTitle>تمرکز 🧠</SectionTitle>
          <Card>
            <div className="flex items-center gap-4 mb-3">
              <div className="text-center shrink-0">
                <div className={cn("text-3xl font-extrabold", focusAvg == null ? "text-slate-300" : focusAvg >= 90 ? "text-emerald-500" : focusAvg >= 70 ? "text-teal-600 dark:text-teal-400" : focusAvg >= 50 ? "text-amber-500" : "text-rose-500")}>
                  {focusAvg == null ? "–" : toFa(focusAvg)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">نمره‌ی ۷ روز (از ۱۰۰)</div>
              </div>
              <div className="flex-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {focusAvg == null
                  ? "هنوز جلسه‌ای ثبت نشده."
                  : focusAvg >= 90
                    ? "🧘 تمرکزت عالیه! همین فرمون را ادامه بده."
                    : focusAvg >= 70
                      ? "🙂 خوب پیش می‌روی؛ چند حواس‌پرتی کمتر، نمره‌ات را بالا می‌برد."
                      : "🙈 حواس‌پرتی‌ها زیادن؛ حالت تمرکز عمیق + صدای قهوه‌ای را امتحان کن."}
                <span className="block mt-1">هر «🙈 حواسم پرت شد» ‎۱۰ نمره کم می‌کند — صادقانه ثبت کن تا روند واقعی را ببینی.</span>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 h-24">
              {focusWeek.map((d) => {
                const f = d.focus ?? 0;
                const h = d.sessions === 0 ? 4 : Math.max(10, f);
                const isToday = d.date === today;
                const color = d.sessions === 0 ? "bg-slate-100 dark:bg-slate-700/60" : f >= 90 ? "bg-emerald-400" : f >= 70 ? "bg-teal-500" : f >= 50 ? "bg-amber-400" : "bg-rose-400";
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${formatJalaliNumeric(d.date)} — ${d.sessions === 0 ? "بدون جلسه" : `تمرکز ${toFa(f)} · ${toFa(d.distractions)} حواس‌پرتی`}`}>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400">{d.sessions > 0 ? toFa(f) : ""}</span>
                    <div className="w-full flex items-end justify-center" style={{ height: "65%" }}>
                      <div className={cn("w-3/5 rounded-t-lg transition-all", color, isToday && d.sessions > 0 && "ring-2 ring-offset-1 ring-teal-600/40 dark:ring-offset-slate-800")} style={{ height: `${h}%` }} />
                    </div>
                    <span className={cn("text-[10px]", isToday ? "text-teal-600 font-bold" : "text-slate-400")}>{WEEKDAYS_SHORT_FA[weekdayOf(d.date)]}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <SectionTitle>مطالعه در ۷ روز اخیر</SectionTitle>
      <Card>
        <div className="flex items-end justify-between gap-2 h-40">
          {week.map((d) => {
            const h = Math.max(4, (d.minutes / maxDay) * 100);
            const isToday = d.date === today;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{d.minutes ? formatHoursCompact(d.minutes) : ""}</span>
                <div className="w-full flex items-end justify-center" style={{ height: "75%" }}>
                  <div className={cn("w-3/5 rounded-t-lg transition-all duration-700", isToday ? "bg-teal-600" : "bg-teal-300 dark:bg-teal-700")} style={{ height: `${h}%` }} />
                </div>
                <span className={cn("text-[10px]", isToday ? "text-teal-600 font-bold" : "text-slate-400")}>{WEEKDAYS_SHORT_FA[weekdayOf(d.date)]}</span>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-400 text-center mt-2">مجموع: {formatMinutes(week.reduce((s, d) => s + d.minutes, 0))}</div>
      </Card>

      {hasPlannedWeek && (
        <>
          <SectionTitle>برنامه در برابر واقعیت 🎯</SectionTitle>
          <Card>
            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 mb-3">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600 inline-block" /> برنامه‌ریزی‌شده</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-teal-500 inline-block" /> انجام‌شده</span>
            </div>
            <div className="flex items-end justify-between gap-2 h-40">
              {planVsActual.map((d) => {
                const hp = d.planned > 0 ? Math.max(3, (d.planned / planVsMax) * 100) : 0;
                const hd = d.done > 0 ? Math.max(3, (d.done / planVsMax) * 100) : 0;
                const isToday = d.date === today;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{d.planned ? formatHoursCompact(d.planned) : ""}</span>
                    <div className="w-full flex items-end justify-center gap-1" style={{ height: "75%" }}>
                      <div className="w-1/4 rounded-t-md bg-slate-300 dark:bg-slate-600" style={{ height: `${hp}%` }} title={`برنامه: ${formatMinutes(d.planned)}`} />
                      <div className={cn("w-1/4 rounded-t-md", isToday ? "bg-teal-600" : "bg-teal-400 dark:bg-teal-600")} style={{ height: `${hd}%` }} title={`انجام‌شده: ${formatMinutes(d.done)}`} />
                    </div>
                    <span className={cn("text-[10px]", isToday ? "text-teal-600 font-bold" : "text-slate-400")}>{WEEKDAYS_SHORT_FA[weekdayOf(d.date)]}</span>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] text-slate-400 text-center mt-2">
              تحقق برنامه‌ی این ۷ روز: {toFa(planVsActual.reduce((s, d) => s + d.planned, 0) > 0 ? Math.round((planVsActual.reduce((s, d) => s + d.done, 0) / planVsActual.reduce((s, d) => s + d.planned, 0)) * 100) : 0)}٪
            </div>
          </Card>
        </>
      )}

      {state.sessions.length >= 3 && <SectionTitle>ساعت‌های معمول مطالعهٔ تو 🌅</SectionTitle>}
      <GoldenHoursCard />

      <InsightsCard />

      <GhostCard />

      <JourneyCard />

      <SectionTitle>تمرینِ تست 🧪</SectionTitle>
      <TestStatsCard />

      <MemoryGardenCard />

      <SectionTitle>📊 گزارش و مقایسه هفته‌ها</SectionTitle>
      <WeeklyReport />

      <SectionTitle>📅 گزارش ماهانه</SectionTitle>
      <MonthlyReport />

      <SectionTitle>یک سال مطالعه 🔥</SectionTitle>
      <Card>
        <YearHeatmap sessions={state.sessions} today={today} />
      </Card>

      <SectionTitle>مطالعه بر اساس درس</SectionTitle>
      <Card>
        {subjectRows.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-4">هنوز درسی ثبت نشده.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {subjectRows.map((s) => (
              <div key={s.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">{formatMinutes(s.minutes)}</span>
                </div>
                <ProgressBar value={(s.minutes / maxSubject) * 100} color={s.color} height="h-2" />
              </div>
            ))}
          </div>
        )}
      </Card>

      <details className="mt-6"><summary className="text-base font-bold cursor-pointer">دستاوردها و نشان‌ها (اختیاری)</summary>
      <SectionTitle>دستاوردها</SectionTitle>

      {/* Overall progress */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            <span className="text-lg">🏆</span>
            <span>
              {toFa(unlocked.size)} از {toFa(ACHIEVEMENTS.length)} دستاورد
            </span>
          </div>
          <span className="text-[11px] text-slate-400">{toFa(Math.round((unlocked.size / ACHIEVEMENTS.length) * 100))}٪</span>
        </div>
        <ProgressBar value={(unlocked.size / ACHIEVEMENTS.length) * 100} height="h-2.5" />
        {(() => {
          const next = ACHIEVEMENTS.find((a) => !unlocked.has(a.id));
          return next ? (
            <div className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              🎯 دستاورد بعدی: <span className="font-bold text-slate-700 dark:text-slate-200">{next.icon} {next.title}</span>
              {" — "}
              {next.description}
            </div>
          ) : (
            <div className="mt-2.5 text-[11px] text-teal-600 dark:text-teal-300 font-medium">🎉 همه‌ی دستاوردها را به دست آوردی؛ فوق‌العاده‌ای!</div>
          );
        })()}
      </Card>

      {/* Grouped achievements */}
      {ACHIEVEMENT_GROUPS.map((g) => {
        const items = ACHIEVEMENTS.filter((a) => a.group === g.id);
        if (items.length === 0) return null;
        const groupUnlocked = items.filter((a) => unlocked.has(a.id)).length;
        return (
          <div key={g.id} className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <span>{g.icon}</span> {g.label}
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-300 font-medium">
                {toFa(groupUnlocked)}/{toFa(items.length)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {items.map((a) => {
                const on = unlocked.has(a.id);
                return (
                  <Card key={a.id} className={cn("flex items-center gap-3 p-3", !on && "opacity-55 grayscale")}>
                    <span className="text-2xl">{a.icon}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{a.title}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{a.description}</div>
                    </div>
                    {on && <span className="mr-auto text-emerald-500 text-xs shrink-0">✓</span>}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
      </details>
    </div>
  );
}
