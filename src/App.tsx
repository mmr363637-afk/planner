import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { StoreProvider, useLookups, useStore } from "./store";
import { NavContext, type NavState, type PlanSubTab, type Tab } from "./nav";
import { CalendarIcon, ChartIcon, ChevronIcon, ExamIcon, HomeIcon, IconButton, RepeatIcon, SettingsIcon, TimerIcon } from "./components/ui";
import HomePage from "./pages/Home";
import PlanPage from "./pages/Plan";
import StudyPage, { phaseDurationMs, phaseElapsedMs, totalStudyMs } from "./pages/Study";
import ReviewsPage from "./pages/Reviews";
import StatsPage from "./pages/Stats";
import SettingsPage from "./pages/Settings";
import ExamsPage from "./pages/Exams";
import { beep, notify } from "./lib/notify";
import { diffDays, formatClock, todayKey } from "./lib/jalali";
import { classifyReviews } from "./lib/srs";
import { cn } from "./utils/cn";

const TABS: { id: Tab; label: string; icon: () => ReactElement }[] = [
  { id: "home", label: "خانه", icon: HomeIcon },
  { id: "plan", label: "برنامه", icon: CalendarIcon },
  { id: "study", label: "مطالعه", icon: TimerIcon },
  { id: "reviews", label: "مرور", icon: RepeatIcon },
  { id: "stats", label: "آمار", icon: ChartIcon },
  { id: "exams", label: "امتحانات", icon: ExamIcon },
];

function useTheme() {
  const { state } = useStore();
  const theme = state.settings.theme;
  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && !!mq?.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f172a" : "#0d9488");
    };
    apply();
    mq?.addEventListener?.("change", apply);
    return () => mq?.removeEventListener?.("change", apply);
  }, [theme]);
}

/** Global watcher: auto-advance pomodoro phases even when the study page is not visible */
function usePomodoroWatcher() {
  const { state, advancePhase } = useStore();
  const { topicById } = useLookups();
  const a = state.activeSession;
  useEffect(() => {
    if (!a || a.mode !== "pomodoro" || !a.running) return;
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = phaseElapsedMs(a, now);
      const dur = phaseDurationMs(a, state.settings.pomodoro);
      if (elapsed >= dur) {
        const n = state.settings.notifications;
        const topicName = topicById.get(a.topicId)?.name ?? "";
        if (a.phase === "work") {
          beep("break");
          if (n.enabled && n.studyStart) notify("وقت استراحت ☕", `سیکل مطالعه «${topicName}» تمام شد.`, "pomodoro");
        } else {
          beep("end");
          if (n.enabled && n.breakEnd) notify("پایان استراحت 📖", `برگرد سر «${topicName}».`, "pomodoro");
        }
        advancePhase();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [a, state.settings.pomodoro, state.settings.notifications, advancePhase, topicById]);
}

/** Daily reminders while the app is open (best-effort; a PWA has no background scheduler) */
function useDailyReminders() {
  const { state } = useStore();
  useEffect(() => {
    const n = state.settings.notifications;
    if (!n.enabled) return;
    const check = () => {
      const today = todayKey();
      const key = `reminders-${today}`;
      const sent = new Set<string>(JSON.parse(localStorage.getItem(key) ?? "[]"));
      const mark = (k: string) => {
        sent.add(k);
        localStorage.setItem(key, JSON.stringify([...sent]));
      };
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const groups = classifyReviews(state.reviews, today);
      const todayTasks = state.tasks.filter((t) => t.date === today && t.status === "pending");

      // Each reminder is independent (no else-if) so every enabled type can fire on its own day.
      if (n.dailyPlan && !sent.has("plan") && hhmm >= n.dailyReminderTime && todayTasks.length > 0) {
        if (notify("برنامه امروز 🗓️", `${todayTasks.length} مبحث برای امروز برنامه‌ریزی شده است.`, "daily")) mark("plan");
      }
      if (n.reviewsToday && !sent.has("reviews") && hhmm >= n.dailyReminderTime && groups.today.length > 0) {
        if (notify("مرورهای امروز 🔁", `${groups.today.length} مرور برای امروز داری.`, "reviews")) mark("reviews");
      }
      if (n.overdueReviews && !sent.has("overdue") && groups.overdue.length > 0) {
        if (notify("مرور عقب‌افتاده ⚠️", `${groups.overdue.length} مرور عقب‌افتاده داری.`, "overdue")) mark("overdue");
      }
      if (n.examReminder) {
        for (const ex of state.exams) {
          const d = diffDays(today, ex.date);
          if (d === 1 && !sent.has(`exam-tmr-${ex.id}`)) {
            if (notify("فردا امتحان داری 📝", `«${ex.title}» فردا برگزار می‌شود. آماده‌اش باش.`, `exam-tmr-${ex.id}`)) mark(`exam-tmr-${ex.id}`);
          } else if (d === 0 && !sent.has(`exam-today-${ex.id}`)) {
            if (notify("امروز امتحان داری 📝", `«${ex.title}» امروز برگزار می‌شود. موفق باشی!`, `exam-today-${ex.id}`)) mark(`exam-today-${ex.id}`);
          }
        }
      }
    };
    check();
    const id = setInterval(check, 60_000);
    // Re-check when the app becomes visible again (e.g. user reopens the tab after the reminder time).
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [state.settings.notifications, state.reviews, state.tasks, state.exams]);
}

function Shell() {
  const { state, toasts } = useStore();
  const { topicById } = useLookups();
  const [nav, setNav] = useState<NavState>({ tab: "home", planSub: "calendar", calendarDate: null });
  useTheme();
  usePomodoroWatcher();
  useDailyReminders();

  const go = useCallback((tab: Tab, opts?: { planSub?: PlanSubTab; date?: string }) => {
    setNav((n) => ({ tab, planSub: opts?.planSub ?? n.planSub, calendarDate: opts?.date ?? null }));
    window.scrollTo({ top: 0 });
  }, []);

  const navApi = useMemo(() => ({ ...nav, go }), [nav, go]);

  // Mini banner timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!state.activeSession || nav.tab === "study") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.activeSession, nav.tab]);

  const a = state.activeSession;
  const bannerMs = a ? (a.mode === "pomodoro" ? Math.max(0, phaseDurationMs(a, state.settings.pomodoro) - phaseElapsedMs(a, now)) : totalStudyMs(a, now)) : 0;

  return (
    <NavContext.Provider value={navApi}>
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors" dir="rtl">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-slate-50/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200/60 dark:border-slate-800">
          <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
            {nav.tab === "settings" ? (
              <IconButton onClick={() => go("home")} title="بازگشت">
                <ChevronIcon dir="right" />
              </IconButton>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-sm">م</div>
                <span className="font-bold text-slate-800 dark:text-slate-100">برنامه‌ریز مطالعه</span>
              </div>
            )}
            {nav.tab !== "settings" && (
              <IconButton onClick={() => go("settings")} title="تنظیمات">
                <SettingsIcon />
              </IconButton>
            )}
          </div>
        </header>

        {/* Active session banner */}
        {a && nav.tab !== "study" && (
          <button type="button" onClick={() => go("study")} className="sticky top-14 z-30 w-full bg-teal-600 text-white text-sm">
            <div className="max-w-xl mx-auto px-4 py-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full bg-white", a.running && "animate-pulse")} />
                {a.running ? "در حال مطالعه" : "متوقف"} · {topicById.get(a.topicId)?.name}
              </span>
              <span className="font-bold tabular-nums">{formatClock(bannerMs)}</span>
            </div>
          </button>
        )}

        <main className="max-w-xl mx-auto px-4 pt-4 pb-24">
          {nav.tab === "home" && <HomePage />}
          {nav.tab === "plan" && <PlanPage />}
          {nav.tab === "study" && <StudyPage />}
          {nav.tab === "reviews" && <ReviewsPage />}
          {nav.tab === "stats" && <StatsPage />}
          {nav.tab === "exams" && <ExamsPage />}
          {nav.tab === "settings" && <SettingsPage />}
        </main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-slate-200/70 dark:border-slate-700/60 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-xl mx-auto grid grid-cols-6 h-16">
            {TABS.map((t) => {
              const active = nav.tab === t.id;
              const Icon = t.icon;
              const badge = t.id === "reviews" ? (() => { const g = classifyReviews(state.reviews, todayKey()); return g.overdue.length + g.today.length; })() : 0;
              return (
                <button key={t.id} type="button" onClick={() => go(t.id)} className={cn("relative flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors", active ? "text-teal-600 dark:text-teal-400" : "text-slate-400 dark:text-slate-500")}>
                  <span className={cn("px-4 py-0.5 rounded-full transition-colors", active && "bg-teal-50 dark:bg-teal-900/40")}>
                    <Icon />
                  </span>
                  <span className={cn(active && "font-bold")}>{t.label}</span>
                  {badge > 0 && <span className="absolute top-2 right-1/2 translate-x-4 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center">{badge > 9 ? "۹+" : badge.toLocaleString("fa-IR")}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Toasts */}
        <div className="fixed bottom-20 inset-x-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
          {toasts.map((t) => (
            <div key={t.id} className="animate-slide-up bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 max-w-sm">
              {t.icon && <span>{t.icon}</span>}
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </NavContext.Provider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
