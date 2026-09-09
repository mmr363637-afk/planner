import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useLookups } from "../store";
import { formatClock, toFa } from "../lib/jalali";
import { phaseDurationMs, phaseElapsedMs, totalStudyMs } from "../pages/Study";
import { cn } from "../utils/cn";
import { useAmbient } from "../ambient";

interface FocusModeProps {
  open: boolean;
  onClose: () => void;
}

/**
 * حالت تمرکز عمیق — تمام‌صفحه تاریک، فقط تایمر + صدای محیطی.
 * بدون هیچ عنصر اضافی، برای تمرکز کامل.
 */
export default function FocusMode({ open, onClose }: FocusModeProps) {
  const { state } = useStore();
  const { topicById } = useLookups();
  const { playing, activeSounds } = useAmbient();
  const [now, setNow] = useState(Date.now());
  const a = state.activeSession;

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // کلید Escape برای خروج
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !a) return null;

  const topicName = a.topicId != null ? topicById.get(a.topicId)?.name ?? "مطالعه بدون درس" : "مطالعه آزاد";
  const isPomodoro = a.mode === "pomodoro";
  const totalMinutes = Math.floor(totalStudyMs(a, now) / 60000);
  const currentPhaseMs = isPomodoro
    ? Math.max(0, phaseDurationMs(a, state.settings.pomodoro) - phaseElapsedMs(a, now))
    : 0;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none cursor-default"
      onClick={onClose}
      role="dialog"
      aria-label="حالت تمرکز عمیق"
    >
      {/* ستاره‌های محو پس‌زمینه */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-[2px] h-[2px] rounded-full bg-white/20 animate-pulse"
            style={{
              top: `${(i * 37) % 100}%`,
              left: `${(i * 53) % 100}%`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${2 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      {/* محتوای اصلی */}
      <div className="relative flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
        {/* عنوان درس */}
        <div className="text-teal-400/70 text-sm font-medium tracking-wide">
          {a.running ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              {topicName}
            </span>
          ) : (
            <span className="text-amber-400/60">⏸ متوقف — {topicName}</span>
          )}
        </div>

        {/* تایمر بزرگ */}
        <div className="text-center">
          {isPomodoro ? (
            <>
              <div className={cn("text-[8rem] font-thin leading-none tabular-nums", a.phase === "work" ? "text-white/90" : "text-teal-300/70")}>
                {formatClock(currentPhaseMs)}
              </div>
              <div className="text-slate-500 text-sm mt-2">
                {a.phase === "work" ? "زمان مطالعه" : a.phase === "short" ? "استراحت کوتاه" : "استراحت طولانی"}
                {" · "}
                سیکل {toFa(a.cycle + 1)} از {toFa(state.settings.pomodoro.cycles)}
              </div>
            </>
          ) : (
            <>
              <div className="text-[8rem] font-thin leading-none text-white/90 tabular-nums">
                {formatClock(a.accumulatedMs + (a.running && a.startedAt ? now - a.startedAt : 0))}
              </div>
              <div className="text-slate-500 text-sm mt-2">
                مطالعه آزاد · مجموع: {toFa(totalMinutes)} دقیقه
              </div>
            </>
          )}
        </div>

        {/* نوار پیشرفت پومودورو */}
        {isPomodoro && (
          <div className="w-64 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500/60 transition-all duration-1000 rounded-full"
              style={{
                width: `${Math.min(100, ((phaseElapsedMs(a, now) / phaseDurationMs(a, state.settings.pomodoro)) * 100))}%`,
              }}
            />
          </div>
        )}

        {/* اطلاعات پایین */}
        <div className="flex items-center gap-6 text-slate-600 text-xs mt-4">
          {playing && activeSounds.length > 0 && (
            <span className="text-teal-600/50 flex items-center gap-1">
              🎧 {activeSounds.length} صدا در حال پخش
            </span>
          )}
          {(a.distractions ?? 0) > 0 && (
            <span className="text-amber-600/40">🙈 {toFa(a.distractions!)} حواس‌پرتی</span>
          )}
        </div>

        {/* راهنمای خروج */}
        <div className="text-slate-700 text-[11px] mt-8">
          برای خروج کلیک کن یا Escape بزن
        </div>
      </div>
    </div>
  );
}
