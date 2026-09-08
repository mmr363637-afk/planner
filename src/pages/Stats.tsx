import { useMemo } from "react";
import { useStore } from "../store";
import { Button, Card, ProgressBar, SectionTitle, StatTile } from "../components/ui";
import { GardenCard } from "../components/GardenCard";
import { WEEKDAYS_SHORT_FA, addDays, formatHoursCompact, formatJalaliNumeric, formatMinutes, keyToJalali, startOfWeek, toFa, todayKey, weekdayOf } from "../lib/jalali";
import { UNASSIGNED_SUBJECT_ID, completedTopics, computeStreak, heatLevel, heatmapData, last7Days, minutesBySubject, minutesInRange, minutesOnDate, planAdherence, pomodoroStats, topSounds, totalDistractions, weeklyAdherence } from "../lib/stats";
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, MAX_STREAK_FREEZES, STREAK_FREEZE_COST, levelFromXp, levelTitle } from "../lib/gamification";
import { AMBIENT_SOUNDS } from "../lib/ambient";
import { cn } from "../utils/cn";
import type { StudySession } from "../types";

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
  const { state, buyStreakFreeze } = useStore();
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
  const streak = computeStreak(state.sessions, today, state.settings.streakFreezes);
  const pomo = pomodoroStats(state.sessions, today);
  const week = last7Days(state.sessions, today);
  const maxDay = Math.max(60, ...week.map((d) => d.minutes));
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
  const sounds = topSounds(state.sessions, 4);

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50">آمار</h1>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          🖨 چاپ / PDF
        </Button>
      </div>

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
