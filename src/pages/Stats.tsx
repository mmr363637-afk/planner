import { useMemo } from "react";
import { useStore } from "../store";
import { Card, ProgressBar, SectionTitle, StatTile } from "../components/ui";
import { WEEKDAYS_SHORT_FA, addDays, formatHoursCompact, formatMinutes, keyToJalali, startOfWeek, toFa, todayKey, weekdayOf } from "../lib/jalali";
import { completedTopics, computeStreak, last7Days, minutesBySubject, minutesInRange, minutesOnDate, planAdherence, weeklyAdherence } from "../lib/stats";
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, levelFromXp, levelTitle } from "../lib/gamification";
import { cn } from "../utils/cn";

export default function StatsPage() {
  const { state } = useStore();
  const today = todayKey();
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
  const streak = computeStreak(state.sessions, today);
  const week = last7Days(state.sessions, today);
  const maxDay = Math.max(60, ...week.map((d) => d.minutes));
  const bySubject = minutesBySubject(state.sessions, state.topics);
  const subjectRows = state.subjects.map((s) => ({ ...s, minutes: bySubject[s.id] ?? 0 })).sort((a, b) => b.minutes - a.minutes);
  const maxSubject = Math.max(1, ...subjectRows.map((s) => s.minutes));
  const adherence = planAdherence(state.tasks, addDays(today, -29), today);
  const level = levelFromXp(state.settings.xp);
  const unlocked = new Set(state.achievements.map((a) => a.id));
  const avgSession = state.sessions.length ? Math.round(state.sessions.reduce((s, x) => s + x.durationMinutes, 0) / state.sessions.length) : 0;

  return (
    <div className="pb-6">
      <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50 mb-4">آمار</h1>

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
      </Card>

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
      </div>

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
    </div>
  );
}
