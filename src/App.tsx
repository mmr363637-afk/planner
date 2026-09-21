import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { StoreProvider, useLookups, useStore } from "./store";
import { AmbientProvider } from "./ambient";
import { NavContext, useNav, type NavState, type PlanSubTab, type Tab } from "./nav";
import { CalendarIcon, ChartIcon, ChevronIcon, ExamIcon, HomeIcon, IconButton, Modal, RepeatIcon, SettingsIcon, TimerIcon } from "./components/ui";
import { AmbientMixerModal, AmbientTrigger } from "./components/ambient";
import { CommandPalette, SearchTrigger } from "./components/CommandPalette";
import { PageBackdrop } from "./components/PageBackdrop";
import WhatsNewModal from "./components/WhatsNewModal";
import QuickAddFab from "./components/QuickAddFab";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { APP_VERSION } from "./lib/appVersion";
import HomePage from "./pages/Home";
import { phaseDurationMs, phaseElapsedMs, totalStudyMs } from "./lib/sessionTime";
// ⚡ همه‌ی صفحه‌ها به‌جز خانه تنبل لود می‌شوند: باندل اولیه فقط «خانه + پوسته» است و
// بقیه با اولین ورود به هر تب دانلود می‌شوند (و بعد در کش سرویس‌ورکر می‌مانند).
const PlanPage = lazy(() => import("./pages/Plan"));
const StudyPage = lazy(() => import("./pages/Study"));
const ReviewsPage = lazy(() => import("./pages/Reviews"));
const StatsPage = lazy(() => import("./pages/Stats"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const ExamsPage = lazy(() => import("./pages/Exams"));
const Onboarding = lazy(() => import("./components/Onboarding"));

/** اسکلت سبکِ انتظار برای چانکِ تنبل — بدون هیچ ایمپورتی تا بی‌درنگ رندر شود */
function PageSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-3 pt-2" aria-label="در حال بارگذاری…">
      <div className="h-8 w-40 rounded-xl bg-slate-200 dark:bg-slate-700" />
      <div className="h-28 rounded-2xl bg-slate-200/70 dark:bg-slate-700/60" />
      <div className="h-20 rounded-2xl bg-slate-200/70 dark:bg-slate-700/60" />
      <div className="h-20 rounded-2xl bg-slate-200/70 dark:bg-slate-700/60" />
    </div>
  );
}
import { beep, notify } from "./lib/notify";
import { applyAccentColor } from "./lib/accent";
import { setReviewBadge } from "./lib/appBadge";
import { backupFileName, backupStatus, downloadTextFile } from "./lib/backup";
import { quoteOfTheDay } from "./lib/quotes";
import { diffDays, formatClock, formatJalaliLong, todayKey } from "./lib/jalali";
import { examStartMs, formatExamTime } from "./lib/exam";
import { classifyReviews } from "./lib/srs";
import { classifyCards } from "./lib/sm2";
import { cn } from "./utils/cn";
import { ensureSyncIdentity, getSupabaseClient, getSupabaseConfig, isSupabaseConfigured, pushStateToCloud, shouldAutoConnect } from "./lib/supabaseSync";
import type { ActiveSession, AppState, PomodoroSettings } from "./types";

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
  const { theme, accentColor, dayStart, dayEnd } = state.settings;
  useEffect(() => {
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () => {
      let dark = false;
      if (theme === "dark") dark = true;
      else if (theme === "system") dark = !!mq?.matches;
      else if (theme === "auto") {
        // حالت خودکار: بر اساس ساعت — تاریک بعد از غروب
        const now = new Date();
        const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        // بعد از dayEnd یا قبل از dayStart = تاریک
        dark = hhmm >= dayEnd || hhmm < dayStart;
      }
      document.documentElement.classList.toggle("dark", dark);
      // رنگ اصلی برنامه (تم رنگی) را روی متغیرهای CSS اعمال کن
      const shades = applyAccentColor(accentColor);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f172a" : (shades[600] ?? accentColor));
    };
    apply();
    mq?.addEventListener?.("change", apply);
    // در حالت auto، هر دقیقه بررسی کن تا تم با تغییر ساعت عوض شود
    let autoTimer: ReturnType<typeof setInterval> | undefined;
    if (theme === "auto") {
      autoTimer = setInterval(apply, 60_000);
    }
    // هنگام چاپ/ذخیره PDF همیشه تم روشن چاپ شود و بعد از چاپ برگردد
    const beforePrint = () => document.documentElement.classList.remove("dark");
    const afterPrint = apply;
    window.addEventListener?.("beforeprint", beforePrint);
    window.addEventListener?.("afterprint", afterPrint);
    return () => {
      mq?.removeEventListener?.("change", apply);
      window.removeEventListener?.("beforeprint", beforePrint);
      window.removeEventListener?.("afterprint", afterPrint);
      if (autoTimer) clearInterval(autoTimer);
    };
  }, [theme, accentColor, dayStart, dayEnd]);
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
        const topicName = (a.topicId != null ? topicById.get(a.topicId)?.name : null) ?? "مطالعه بدون درس";
        if (a.phase === "work") {
          beep("break");
          if (n.enabled && n.studyStart) notify("وقت استراحت ☕", `سیکل مطالعه «${topicName}» تمام شد.`, "pomodoro");
        } else {
          beep("end");
          if (n.enabled && n.breakEnd) notify("پایان استراحت 📖", a.topicId == null ? "وقت ادامهٔ مطالعه است؛ تایمرت آماده است." : `برگرد سر «${topicName}».`, "pomodoro");
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
    const examTimer = state.settings.examTimer;
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

      // جمله‌ی انگیزشیِ همان روز؛ فقط به اولین اعلانِ صبحگاهی می‌چسبد تا تکراری نشود
      const quote = quoteOfTheDay(today);
      const quoteSuffix = (attach: boolean) =>
        attach && !sent.has("quote") ? `\n💪 ${quote.text}${quote.author ? ` — ${quote.author}` : ""}` : "";

      // Each reminder is independent (no else-if) so every enabled type can fire on its own day.
      if (n.dailyPlan && !sent.has("plan") && hhmm >= n.dailyReminderTime && todayTasks.length > 0) {
        const attachQuote = !sent.has("quote");
        if (notify("برنامه امروز 🗓️", `${todayTasks.length} مبحث برای امروز برنامه‌ریزی شده است.${quoteSuffix(attachQuote)}`, "daily")) {
          mark("plan");
          if (attachQuote) mark("quote");
        }
      }
      if (n.reviewsToday && !sent.has("reviews") && hhmm >= n.dailyReminderTime && groups.today.length > 0) {
        const attachQuote = !sent.has("quote");
        if (notify("مرورهای امروز 🔁", `${groups.today.length} مرور برای امروز داری.${quoteSuffix(attachQuote)}`, "reviews")) {
          mark("reviews");
          if (attachQuote) mark("quote");
        }
      }
      if (n.overdueReviews && !sent.has("overdue") && groups.overdue.length > 0) {
        if (notify("مرور عقب‌افتاده ⚠️", `${groups.overdue.length} مرور عقب‌افتاده داری.`, "overdue")) mark("overdue");
      }
      if (n.examReminder) {
        const nowMs = now.getTime();
        for (const ex of state.exams) {
          const d = diffDays(today, ex.date);
          const at = formatExamTime(ex.time);
          const when = at ? ` ساعت ${at}` : "";
          if (d === 1 && !sent.has(`exam-tmr-${ex.id}`)) {
            if (notify("فردا امتحان داری 📝", `«${ex.title}» فردا${when} برگزار می‌شود. آماده‌اش باش.`, `exam-tmr-${ex.id}`)) mark(`exam-tmr-${ex.id}`);
          } else if (d === 0 && !sent.has(`exam-today-${ex.id}`)) {
            if (notify("امروز امتحان داری 📝", `«${ex.title}» امروز${when} برگزار می‌شود. موفق باشی!`, `exam-today-${ex.id}`)) mark(`exam-today-${ex.id}`);
          }
          // یادآوری یک ساعت مانده به شروع — فقط وقتی ساعت امتحان ثبت شده باشد
          if (d === 0 && at && examTimer.oneHourAlert && !sent.has(`exam-1h-${ex.id}`)) {
            const left = examStartMs(ex) - nowMs;
            if (left > 0 && left <= 60 * 60 * 1000) {
              if (notify("یک ساعت تا امتحان ⏳", `«${ex.title}» ساعت ${at} شروع می‌شود. نفس عمیق بکش و برو سر جلسه.`, `exam-1h-${ex.id}`)) mark(`exam-1h-${ex.id}`);
            }
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
  }, [state.settings.notifications, state.settings.examTimer, state.reviews, state.tasks, state.exams]);
}

/** پشتیبان‌گیری خودکار: سررسید → دانلود JSON + یادآوری */
function useAutoBackup() {
  const { state, exportData, markBackupDone, toast } = useStore();
  useEffect(() => {
    let running = false;
    const check = () => {
      if (running) return;
      const ab = state.settings.autoBackup;
      if (!ab?.enabled || !backupStatus(ab).due) return;
      running = true;
      try {
        const ok = downloadTextFile(backupFileName(todayKey()), exportData());
        // فقط وقتی دانلود واقعاً موفق بود، سررسید ریست می‌شود (وگرنه کاربر بی‌بکاپ می‌ماند)
        if (ok) {
          markBackupDone();
          toast("بکاپ خودکار دانلود شد 💾 — فایل را جای امنی نگه دار", "🕐");
        } else toast("سررسید بکاپ است؛ از تنظیمات ← پشتیبان‌گیری استفاده کن", "💾");
      } catch {
        toast("سررسید بکاپ است؛ از تنظیمات ← پشتیبان‌گیری استفاده کن", "💾");
      } finally {
        running = false;
      }
    };
    // کمی صبر اولیه تا اپ کامل بالا بیاید
    const t0 = setTimeout(check, 4000);
    const id = setInterval(check, 30 * 60 * 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
    // exportData/markBackupDone/toast از useMemo پایدار store می‌آیند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.autoBackup?.enabled, state.settings.autoBackup?.intervalDays]);
}

/**
 * سینک خودکار ابری (Supabase): با هر تغییر وضعیت، نسخه‌ی تازه با چند ثانیه تأخیر
 * روی ابر ذخیره می‌شود. شناسه‌ی ناشناس خودکار ساخته می‌شود — کاربر هیچ کاری نمی‌کند.
 * حلقه‌شکن: اگر تنها تفاوتِ وضعیت نسبت به آخرین وضعیتِ سینک‌شده، زمان‌نگارهای خودِ
 * سینک باشد، دوباره push نمی‌کنیم.
 */
function useSupabaseAutoSync() {
  const store = useStore();
  const { state, updateSettings } = store;
  const lastPushedRef = useRef<AppState | null>(null);
  const identityRef = useRef<{ id: string; tried: boolean }>({ id: "", tried: false });

  // هر بار پیکربندی/کلید عوض شد، شناسه را دوباره بگیر
  const cfgKey = `${getSupabaseConfig(state.settings).url}|${getSupabaseConfig(state.settings).anonKey}`;
  useEffect(() => {
    identityRef.current = { id: "", tried: false };
    lastPushedRef.current = null;
  }, [cfgKey]);

  useEffect(() => {
    if (!isSupabaseConfigured(state.settings)) return;
    if (!shouldAutoConnect()) return;
    if (state.settings.supabase?.autoSync === false) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const current = state;
    const prev = lastPushedRef.current;
    if (prev && !needsPush(prev, current)) return;

    const timer = setTimeout(async () => {
      // وضعیت زنده را از استور بخوان (ممکن است در این چند ثانیه باز هم عوض شده باشد)
      const s = store.state;
      if (!isSupabaseConfigured(s.settings)) return;
      if (s.settings.supabase?.autoSync === false) return;
      try {
        const sb = getSupabaseClient(getSupabaseConfig(s.settings));
        if (!identityRef.current.id) {
          identityRef.current.tried = true;
          const id = await ensureSyncIdentity(sb);
          identityRef.current.id = id.userId;
          if (id.email && s.settings.supabase?.email !== id.email) {
            updateSettings({ supabase: { ...s.settings.supabase, email: id.email } });
          }
        }
        const at = await pushStateToCloud(sb, identityRef.current.id, s);
        lastPushedRef.current = s;
        // به‌روزرسانیِ زمان‌نگار سینک (این تغییر به‌خاطر needsPush دوباره push نمی‌کند)
        updateSettings({ supabase: { ...s.settings.supabase, lastSyncAt: at, lastRemoteSeenAt: Math.max(at, s.settings.supabase?.lastRemoteSeenAt ?? 0) } });
      } catch {
        // سینک پس‌زمینه هرگز نباید جلوی اپ را بگیرد؛ تغییر بعدی دوباره تلاش می‌کند
      }
    }, 6000);
    return () => clearTimeout(timer);
    // updateSettings/ensureSyncIdentity از ماژول/استور پایدارند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cfgKey]);
}

/**
 * آیا بین دو وضعیت تغییر «معناداری» هست که ارزش push داشته باشد؟
 * ⚡ مقایسه‌ی ارجاعیِ سطح-کلید (کلکسیون‌ها immutable آپدیت می‌شوند) تا اثرِ هر تغییر state،
 * یک stringify سنگین نباشد..activeSession و زمان‌نگارها/ایمیلِ سینک نادیده گرفته می‌شوند
 * (در payload ابری هم نیستند — stripStateForCloud).
 */
const PUSH_DATA_KEYS = [
  "subjects", "topics", "flashcards", "plans", "tasks", "sessions", "reviews", "achievements",
  "exams", "notes", "testLogs", "classBlocks", "mistakes", "habits", "journal", "capsules",
  "focusTree", "trash", "cram",
] as const;

export function needsPush(a: AppState, b: AppState): boolean {
  for (const k of PUSH_DATA_KEYS) {
    if (a[k] !== b[k]) return true;
  }
  const strip = (st: AppState["settings"]["supabase"]) =>
    st ? { ...st, lastSyncAt: 0, lastRemoteSeenAt: 0, email: "" } : st;
  const sa = { ...a.settings, supabase: strip(a.settings.supabase) };
  const sb = { ...b.settings, supabase: strip(b.settings.supabase) };
  return JSON.stringify(sa) !== JSON.stringify(sb);
}

/**
 * نسخه‌ی تازه‌ی اپ (سرویس‌ورکر در انتظار) را پیدا می‌کند تا بنر «به‌روزرسانی» نشان دهیم.
 * چون ناوبری کش-اول است، باز شدن همیشه آنی است و تازه‌سازی با انتخاب خود کاربر انجام می‌شود.
 */
function useSwUpdate() {
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const watch = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg || cancelled) return;
        if (reg.waiting) {
          setUpdateReady(true);
          return;
        }
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller && !cancelled) {
              setUpdateReady(true);
            }
          });
        });
      } catch {
        /* بدون سرویس‌ورکر هم اپ کار می‌کند */
      }
    };
    void watch();
    // هر بار که کاربر به اپ برمی‌گردد، یک‌بار دنبال نسخه‌ی تازه بگرد
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.update().catch(() => {}))
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const applyUpdate = useCallback(() => {
    try {
      const onChange = () => window.location.reload();
      navigator.serviceWorker.addEventListener("controllerchange", onChange, { once: true });
      void navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.waiting?.postMessage({ type: "SKIP_WAITING" }))
        .catch(() => window.location.reload());
      // کمربند ایمنی: اگر تا ۳ ثانیه کنترلر عوض نشد، خودمان رفرش کن
      setTimeout(() => window.location.reload(), 3000);
    } catch {
      window.location.reload();
    }
  }, []);
  return { updateReady, applyUpdate };
}

/** میان‌بُرهای صفحه‌کلید: ۱..۶ تب‌ها · t تم · ? راهنما */
function useKeyboardShortcuts(go: (tab: Tab, opts?: { planSub?: PlanSubTab }) => void, toggleHelp: () => void) {
  const { state, updateSettings } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const tabKeys: Record<string, Tab> = { "1": "home", "2": "plan", "3": "study", "4": "reviews", "5": "stats", "6": "exams" };
      const k = e.key === "?" || (e.shiftKey && e.key === "/") ? "?" : e.key;
      if (tabKeys[k]) {
        go(tabKeys[k]);
      } else if (k === "t" || k === "T") {
        const cur = state.settings.theme;
        updateSettings({ theme: cur === "dark" ? "light" : "dark" });
      } else if (k === "?") {
        e.preventDefault();
        toggleHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, toggleHelp, state.settings.theme, updateSettings]);
}

function ShortcutsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: { k: string; d: string }[] = [
    { k: "Ctrl/⌘ + K", d: "پالت فرمان و جستجوی سراسری" },
    { k: "1", d: "خانه" },
    { k: "2", d: "برنامه" },
    { k: "3", d: "مطالعه" },
    { k: "4", d: "مرور" },
    { k: "5", d: "آمار" },
    { k: "6", d: "امتحانات" },
    { k: "t", d: "تعویض تم روشن/تیره" },
    { k: "Esc", d: "بستن مودال/خروج از حالت تمرکز" },
    { k: "Space", d: "توقف/ادامه‌ی تایمر در حالت تمرکز عمیق" },
    { k: "؟", d: "همین راهنما" },
  ];
  return (
    <Modal open={open} onClose={onClose} title="⌨️ میان‌بُرهای صفحه‌کلید">
      <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/50">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-slate-600 dark:text-slate-300">{r.d}</span>
            <kbd className="text-[11px] px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono border border-slate-200 dark:border-slate-600" dir="ltr">{r.k}</kbd>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">میان‌برها وقتی داخل فیلدها هستی، کار نمی‌کنند.</p>
    </Modal>
  );
}

function Shell() {
  const { state, toasts, lastDeleted, undoDelete, updateSettings, exportData, markBackupDone, toast } = useStore();
  // بکاپ اضطراریِ صفحه‌ی کرش: داده را نجات می‌دهد و سررسید را هم به‌روز می‌کند
  const emergencyBackup = useCallback(() => {
    try {
      if (downloadTextFile(backupFileName(todayKey()), exportData())) {
        markBackupDone();
        toast("بکاپ اضطراری دانلود شد 💾", "✅");
      } else toast("دانلود ناموفق بود؛ دوباره تلاش کن", "⚠️");
    } catch {
      toast("دانلود ناموفق بود؛ دوباره تلاش کن", "⚠️");
    }
  }, [exportData, markBackupDone, toast]);
  const { topicById } = useLookups();
  // عمق‌لینک PWA: میانبرهای صفحه‌ی اصلی (?page=study|reviews|exams) صفحه‌ی مربوطه را باز می‌کنند
  const [nav, setNav] = useState<NavState>(() => {
    const page = typeof location !== "undefined" ? new URLSearchParams(location.search).get("page") : null;
    const valid: Tab[] = ["home", "plan", "study", "reviews", "stats", "exams", "settings"];
    const tab = (valid as string[]).includes(page ?? "") ? (page as Tab) : "home";
    return { tab, planSub: "calendar", calendarDate: null };
  });
  const tabName = TABS.find((x) => x.id === nav.tab)?.label ?? "صفحه";
  useTheme();
  usePomodoroWatcher();
  useDailyReminders();
  useAutoBackup();
  useSupabaseAutoSync();
  const { updateReady, applyUpdate } = useSwUpdate();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const go = useCallback((tab: Tab, opts?: { planSub?: PlanSubTab; date?: string }) => {
    setNav((n) => ({ tab, planSub: opts?.planSub ?? n.planSub, calendarDate: opts?.date ?? null }));
    window.scrollTo({ top: 0 });
  }, []);
  useKeyboardShortcuts(go, useCallback(() => setShortcutsOpen((v) => !v), []));

  const navApi = useMemo(() => ({ ...nav, go }), [nav, go]);

  const a = state.activeSession;

  // تعداد مرورهای سررسید (مبحث + کارت) — هم برای نشانِ تب مرور، هم برای App Badge روی آیکون PWA
  // ⚡ حفظ‌شده: طبقه‌بندیِ هزاران مرور/کارت نباید با هر رندرِ Shell تکرار شود
  const reviewsBadgeCount = useMemo(() => {
    const g = classifyReviews(state.reviews, todayKey());
    const c = classifyCards(state.flashcards, todayKey());
    return g.overdue.length + g.today.length + c.overdue.length + c.due.length;
  }, [state.reviews, state.flashcards]);
  useEffect(() => {
    setReviewBadge(reviewsBadgeCount);
  }, [reviewsBadgeCount]);

  return (
    <NavContext.Provider value={navApi}>
      <div className="relative isolate min-h-dvh bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors" dir="rtl">
        {state.settings.pageBackgrounds && <PageBackdrop tab={nav.tab} planSub={nav.planSub} animated={state.settings.animateBackgrounds !== false} />}
        {/* Top bar */}
        <header className="no-print sticky top-0 z-40 bg-slate-50/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200/60 dark:border-slate-800">
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
            <div className="flex items-center gap-1">
              {nav.tab !== "settings" && <SearchTrigger />}
              {nav.tab !== "settings" && <AmbientTrigger />}
              {nav.tab !== "settings" && (
                <IconButton onClick={() => go("settings")} title="تنظیمات">
                  <SettingsIcon />
                </IconButton>
              )}
            </div>
          </div>
        </header>

        {/* بنر نسخه‌ی تازه — وقتی سرویس‌ورکر جدید در انتظار فعال‌سازی است */}
        {updateReady && (
          <div className="no-print sticky top-14 z-30 w-full bg-gradient-to-l from-violet-600 to-indigo-600 text-white text-sm shadow-md">
            <div className="max-w-xl mx-auto px-4 py-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">✨ نسخه‌ی جدید آماده است!</span>
              <button
                type="button"
                onClick={applyUpdate}
                className="shrink-0 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 font-bold text-xs transition-colors"
              >
                🔄 به‌روزرسانی
              </button>
            </div>
          </div>
        )}

        {/* Active session banner */}
        {a && nav.tab !== "study" && (
          <SessionBanner session={a} topicName={(a.topicId != null ? topicById.get(a.topicId)?.name : null) ?? "مطالعه بدون درس"} pomodoro={state.settings.pomodoro} />
        )}

        {/* سربرگ چاپی — فقط در خروجی چاپ/PDF دیده می‌شود */}
        <div className="print-only max-w-xl mx-auto px-4 pt-2 pb-4">
          <div style={{ fontWeight: 800, fontSize: 16 }}>برنامه‌ریز مطالعه</div>
          <div style={{ fontSize: 11, color: "#475569" }}>{formatJalaliLong(todayKey())}</div>
          <hr style={{ marginTop: 8, borderColor: "#cbd5e1" }} />
        </div>

        <main className="max-w-xl mx-auto px-4 pt-4 pb-24">
          {/* مرز خطا: کرشِ یک تب، بقیه‌ی اپ (ناوبری، بنر جلسه) را از کار نمی‌اندازد */}
          <ErrorBoundary key={nav.tab} tabName={tabName} onHome={() => go("home")} onBackup={emergencyBackup}>
            {nav.tab === "home" && <HomePage />}
            {nav.tab !== "home" && (
              <Suspense fallback={<PageSkeleton />}>
                {nav.tab === "plan" && <PlanPage />}
                {nav.tab === "study" && <StudyPage />}
                {nav.tab === "reviews" && <ReviewsPage />}
                {nav.tab === "stats" && <StatsPage />}
                {nav.tab === "exams" && <ExamsPage />}
                {nav.tab === "settings" && <SettingsPage />}
              </Suspense>
            )}
          </ErrorBoundary>
        </main>

        {/* Bottom navigation */}
        <nav className="no-print fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-slate-200/70 dark:border-slate-700/60 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-xl mx-auto grid grid-cols-6 h-16">
            {TABS.map((t) => {
              const active = nav.tab === t.id;
              const Icon = t.icon;
                  const badge = t.id === "reviews" ? reviewsBadgeCount : 0;
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

        {/* دکمه‌ی شناور افزودن سریع — همه‌جا به‌جز تنظیمات */}
        {nav.tab !== "settings" && <QuickAddFab />}

        {/* نوار بازگردانی آخرین حذف (Undo) */}
        {lastDeleted && (
          <div className="no-print fixed bottom-36 inset-x-0 z-50 flex justify-center px-4">
            <div className="animate-slide-up bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm pl-2 pr-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3">
              <span>«{lastDeleted.label}» حذف شد</span>
              <button type="button" onClick={undoDelete} className="font-bold text-teal-300 dark:text-teal-600 px-2 py-1 rounded-lg bg-white/10 dark:bg-slate-900/10">
                ↩️ بازگردانی
              </button>
            </div>
          </div>
        )}

        {/* Toasts */}
        <div className="no-print fixed bottom-20 inset-x-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
          {toasts.map((t) => (
            <div key={t.id} className="animate-slide-up bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-sm px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 max-w-sm">
              {t.icon && <span>{t.icon}</span>}
              {t.message}
            </div>
          ))}
        </div>

        {/* میکسر صداهای محیطی — سراسری است تا صدا بین صفحه‌ها ادامه داشته باشد */}
        <AmbientMixerModal />

        {/* جستجوی سراسری Commander (Ctrl+K) */}
        <CommandPalette />

        {/* راهنمای میان‌بُرهای صفحه‌کلید (؟) */}
        <ShortcutsHelpModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        {/* آنبوردینگ اولین نصب (کاربران قدیمی در store به‌صورت خودکار onboarded می‌شوند) */}
        {!state.settings.onboarded && (
          <Suspense fallback={null}>
            <Onboarding />
          </Suspense>
        )}

        {/* «چی جدیده؟» — یک‌بار بعد از هر آپدیت (و فقط وقتی آنبوردینگ تمام شده) */}
        {state.settings.onboarded && state.settings.lastSeenVersion !== APP_VERSION && (
          <WhatsNewModal
            open
            lastSeen={state.settings.lastSeenVersion}
            onClose={() => updateSettings({ lastSeenVersion: APP_VERSION })}
          />
        )}
      </div>
    </NavContext.Provider>
  );
}

// ===== بنر جلسه‌ی فعال (بالای همه‌ی تب‌ها به‌جز مطالعه) =====
// ⚡ تیکِ ۱ ثانیه‌ای فقط همین بنرِ کوچک را رندر می‌کند، نه کل Shell را؛
// وقتی تایمر متوقف است اصلاً تیکی وجود ندارد.
const SessionBanner = memo(function SessionBanner({ session: a, topicName, pomodoro }: { session: ActiveSession; topicName: string; pomodoro: PomodoroSettings }) {
  const { go } = useNav();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!a.running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [a.running]);
  const ms = a.mode === "pomodoro" ? Math.max(0, phaseDurationMs(a, pomodoro) - phaseElapsedMs(a, now)) : totalStudyMs(a, now);
  return (
    <button type="button" onClick={() => go("study")} className="no-print sticky top-14 z-30 w-full bg-teal-600 text-white text-sm">
      <div className="max-w-xl mx-auto px-4 py-2 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full bg-white", a.running && "animate-pulse")} />
          {a.running ? "در حال مطالعه" : "متوقف"} · {topicName}
        </span>
        <span className="font-bold tabular-nums">{formatClock(ms)}</span>
      </div>
    </button>
  );
});

export default function App() {
  return (
    <StoreProvider>
      <AmbientProvider>
        <Shell />
      </AmbientProvider>
    </StoreProvider>
  );
}
