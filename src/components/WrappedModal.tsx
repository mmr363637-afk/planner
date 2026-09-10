// ===== «خلاصه‌ی سال» — مدال اسلایدی شبیه Spotify Wrapped =====
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { computeMonthWrapped, computeWrapped, currentJalaliMonthName, wrappedAvailable, wrappedMonthAvailable, wrappedSubjectName } from "../lib/wrapped";
import { gardenProgress } from "../lib/garden";
import { totalMinutes } from "../lib/stats";
import { formatJalaliShort, formatMinutes, toFa, todayKey, WEEKDAYS_FA } from "../lib/jalali";
import { levelFromXp, levelTitle } from "../lib/gamification";
import { harborShareSummary } from "../lib/wrappedShare";
import { shareText } from "../lib/share";
import { Button } from "./ui";
import { cn } from "../utils/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  /** سالانه (پیش‌فرض) یا ماهانه */
  mode?: "year" | "month";
}

const BG = [
  "from-slate-900 via-teal-950 to-slate-900",
  "from-indigo-950 via-slate-900 to-slate-950",
  "from-emerald-950 via-slate-900 to-slate-950",
  "from-amber-950 via-slate-900 to-slate-950",
  "from-rose-950 via-slate-900 to-slate-950",
  "from-violet-950 via-slate-900 to-slate-950",
] as const;

export default function WrappedModal({ open, onClose, mode = "year" }: Props) {
  const { state, toast } = useStore();
  const today = todayKey();
  const [slide, setSlide] = useState(0);

  const available = useMemo(
    () => (mode === "month" ? wrappedMonthAvailable(state.sessions, today) : wrappedAvailable(state.sessions, today)),
    [state.sessions, today, mode],
  );
  const wYear = useMemo(() => computeWrapped(state.sessions, state.topics, today), [state.sessions, state.topics, today]);
  const wMonth = useMemo(() => computeMonthWrapped(state.sessions, state.topics, today), [state.sessions, state.topics, today]);
  const w = mode === "month" ? { ...wMonth, jalaliYear: 0 } : wYear;
  const periodTitle = mode === "month" ? `ماه ${currentJalaliMonthName(today)}` : `سال ${toFa(wYear.jalaliYear)}`;
  const { stage } = gardenProgress(totalMinutes(state.sessions));
  const subjectName = useMemo(() => wrappedSubjectName(w, state.subjects), [w, state.subjects]);
  const level = levelFromXp(state.settings.xp);

  useEffect(() => {
    if (open) setSlide(0);
  }, [open]);

  if (!open) return null;

  const slides: { icon: string; title: string; big: string; sub?: string }[] = [
    {
      icon: "📦",
      title: `خلاصه‌ی ${periodTitle}`,
      big: "سلام!",
      sub: mode === "month" ? "بیا نگاهی به سفرت این ماه بندازیم" : "بیا نگاهی به سفرت امسال بندازیم",
    },
    {
      icon: "⏱",
      title: mode === "month" ? "مجموع مطالعه‌ی این ماه" : "مجموع مطالعه‌ی امسال",
      big: formatMinutes(w.totalMinutes),
      sub: `${toFa(w.sessionsCount)} جلسه در ${toFa(w.activeDays)} روز فعال`,
    },
    ...(w.bestDay
      ? [{ icon: "🏆", title: "بهترین روزت", big: formatMinutes(w.bestDay.minutes), sub: `${formatJalaliShort(w.bestDay.date)} — رکورددارِ امسال` }]
      : []),
    ...(subjectName
      ? [{ icon: "📚", title: "درسِ محبوبت", big: subjectName, sub: `${formatMinutes(w.topSubjectMinutes)} روی آن کار کردی` }]
      : []),
    {
      icon: "🔥",
      title: "طولانی‌ترین زنجیره",
      big: `${toFa(w.longestStreak)} روز`,
      sub: w.bestWeekday != null ? `و عاشقِ ${WEEKDAYS_FA[w.bestWeekday]}ها هستی` : undefined,
    },
    {
      icon: stage.icon,
      title: "باغت امسال",
      big: stage.label,
      sub: `سطح ${toFa(level.level)} · ${levelTitle(level.level)} — ${toFa(state.settings.xp)} XP`,
    },
  ];

  const last = slides.length - 1;
  const cur = slides[slide];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" dir="rtl" role="dialog" aria-label={mode === "month" ? "خلاصه‌ی ماه" : "خلاصه‌ی سال"}>
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div className={cn("relative w-full max-w-sm rounded-3xl bg-gradient-to-b p-8 text-white shadow-2xl overflow-hidden", BG[slide % BG.length])}>
        <div className="absolute top-3 left-3 right-3 flex gap-1" dir="ltr">
          {slides.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
              <div className={cn("h-full bg-white transition-all", i < slide ? "w-full" : i === slide ? "w-full animate-pulse" : "w-0")} />
            </div>
          ))}
        </div>

        {available ? (
          <>
            <div key={slide} className="min-h-[280px] flex flex-col items-center justify-center text-center animate-slide-up pt-6">
              <div className="text-6xl mb-5">{cur.icon}</div>
              <div className="text-white/60 text-sm mb-1">{cur.title}</div>
              <div className="text-4xl font-extrabold mb-2 leading-snug">{cur.big}</div>
              {cur.sub && <div className="text-white/70 text-sm leading-relaxed">{cur.sub}</div>}
            </div>

            <div className="flex items-center justify-between gap-2 mt-4">
              <button type="button" onClick={() => (slide === last ? onClose() : setSlide((s) => Math.min(last, s + 1)))} className="flex-1 py-3 rounded-2xl bg-white text-slate-900 font-bold text-sm hover:bg-white/90 transition-colors">
                {slide === last ? "تمام ✨" : "بعدی"}
              </button>
              {slide > 0 && (
                <button type="button" onClick={() => setSlide((s) => Math.max(0, s - 1))} className="px-4 py-3 rounded-2xl bg-white/15 text-white text-sm hover:bg-white/25 transition-colors">
                  قبلی
                </button>
              )}
              {slide === last && (
                <button
                  type="button"
                  onClick={async () => {
                    const text = mode === "month"
                      ? `🌙 خلاصه‌ی ${periodTitle} من در برنامه‌ریز مطالعه:\n⏱ ${formatMinutes(w.totalMinutes)} در ${toFa(w.activeDays)} روز فعال (${toFa(w.sessionsCount)} جلسه)${w.bestDay ? `\n🏆 بهترین روز: ${formatJalaliShort(w.bestDay.date)} با ${formatMinutes(w.bestDay.minutes)}` : ""}`
                      : harborShareSummary(state, today);
                    const r = await shareText(text, `خلاصه‌ی ${periodTitle}`);
                    toast(r === "shared" ? "اشتراک گذاشته شد" : r === "copied" ? "در حافظه کپی شد؛ جایی بفرست!" : "اشتراک در این مرورگر در دسترس نیست", "📤");
                    onClose();
                  }}
                  className="px-4 py-3 rounded-2xl bg-white/15 text-white text-sm hover:bg-white/25 transition-colors"
                >
                  📤
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="min-h-[200px] flex flex-col items-center justify-center text-center pt-6">
            <div className="text-6xl mb-4">🌱</div>
            <div className="text-lg font-bold mb-2">{mode === "month" ? "داده‌ی این ماه کمی است" : "داده‌ی امسال کمی است"}</div>
            <p className="text-white/70 text-sm leading-relaxed mb-5">
              {mode === "month" ? "برای «خلاصه‌ی ماه» حداقل ۳ روز مطالعه‌ی ثبت‌شده نیاز است." : "برای «خلاصه‌ی سال» حداقل ۵ روز مطالعه‌ی ثبت‌شده نیاز است."}
            </p>
            <Button onClick={onClose}>باشه!</Button>
          </div>
        )}
      </div>
    </div>
  );
}
