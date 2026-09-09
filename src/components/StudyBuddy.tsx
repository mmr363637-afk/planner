import { useMemo, useState } from "react";
import { useStore } from "../store";
import { toFa, todayKey } from "../lib/jalali";
import { minutesOnDate, computeStreak } from "../lib/stats";
import { cn } from "../utils/cn";

const MOODS = [
  { min: 0, emoji: "😴", text: "هنوز شروع نکردی! یه قدم کوچیک بردار..." },
  { min: 1, emoji: "🌱", text: "آفرین! شروع کردن سخت‌ترین قدمه." },
  { min: 30, emoji: "🌿", text: "داری خوب پیش می‌ری! ادامه بده." },
  { min: 60, emoji: "🌳", text: "عالیه! یه ساعت خوندی! فوق‌العاده‌ای!" },
  { min: 120, emoji: "🔥", text: "آتش زدی به مال! غیرقابل‌توقفی!" },
  { min: 180, emoji: "🏆", text: "افسانه‌ای! سه ساعت مطالعه — واقعاً قهرمانی!" },
  { min: 300, emoji: "👑", text: "سلطان مطالعه! امروز رو فتح کردی!" },
];

const STREAK_MESSAGES = [
  "زنجیره‌ات رو حفظ کن!",
  "ادامه بده، فردا هم بخون!",
  "امروز رو هم بخون تا زنجیره نشکنه!",
];

const RANDOM_TIPS = [
  "می‌دونستی مرور بعد از ۲۴ ساعت، ماندگاری مطلب رو ۳ برابر می‌کنه؟ 🧠",
  "پومودورو ۲۵ دقیقه‌ای + ۵ دقیقه استراحت = تمرکز بهینه 🍅",
  "نویز قهوه‌ای برای تمرکز عمیق عالیه — امتحانش کن! 🟤",
  "بهترین زمان مرور: قبل از خواب شب 🌙",
  "هر بار که چیزی رو برای کسی توضیح می‌دی، خودت بهتر یاد می‌گیری 👨‍🏫",
  "آب خوردن یادت نره — مغزت به آب نیاز داره 💧",
  "یه فلش‌کارت بساز، ۱۰ بار مرور کن — برای همیشه یادت می‌مونه ♾️",
  "ورزش کردن قبل مطالعه = افزایش ۲۰٪ یادگیری 🏃",
  "مطالعه در سکوت مطلق همیشه بهتر نیست — صدای محیط ملایم کمک می‌کنه 🎧",
  "هدف کوچک تعیین کن: حتی ۱۰ دقیقه هم بهتر از ۰ دقیقه‌ست ✨",
];

/**
 * یار کمکی مطالعه — شخصیتی که بر اساس عملکرد امروزت، انگیزه می‌ده.
 * مثل Tamagotchi حالش خوبه وقتی می‌خونی و ناراحت وقتی نمی‌خونی!
 */
export default function StudyBuddy() {
  const { state } = useStore();
  const today = todayKey();
  const todayMin = minutesOnDate(state.sessions, today);
  const streak = computeStreak(state.sessions, today, state.settings.streakFreezes);
  const goal = state.settings.dailyGoalMinutes;
  const goalPct = goal > 0 ? Math.min(100, Math.round((todayMin / goal) * 100)) : 0;

  const mood = useMemo(() => {
    let m = MOODS[0];
    for (const candidate of MOODS) {
      if (todayMin >= candidate.min) m = candidate;
    }
    return m;
  }, [todayMin]);

  const tip = useMemo(() => {
    const dayNum = parseInt(today.slice(-2)) || 1;
    return RANDOM_TIPS[dayNum % RANDOM_TIPS.length];
  }, [today]);

  const [showTip, setShowTip] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-4">
      <div className="flex items-start gap-3">
        {/* شخصیت */}
        <div className={cn("text-4xl transition-transform", todayMin > 0 ? "animate-bounce" : "opacity-60")} style={{ animationDuration: "2s" }}>
          {mood.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-0.5">یار کمکی</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{mood.text}</div>
          
          {/* نوار هدف */}
          {goal > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", goalPct >= 100 ? "bg-emerald-500" : "bg-teal-500")}
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums">{toFa(goalPct)}٪</span>
            </div>
          )}
        </div>
      </div>

      {/* نکات مطالعه */}
      <button
        type="button"
        onClick={() => setShowTip(!showTip)}
        className="mt-3 w-full text-left text-[11px] text-teal-600 dark:text-teal-400 hover:underline"
      >
        {showTip ? "🤫 مخفی کن" : "💡 یه نکته بگو..."}
      </button>
      {showTip && (
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 bg-teal-50 dark:bg-teal-900/20 rounded-xl p-2.5 leading-relaxed">
          {tip}
        </div>
      )}

      {/* وضعیت زنجیره */}
      {streak > 0 && (
        <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
          🔥 {toFa(streak)} روز زنجیره — {STREAK_MESSAGES[streak % STREAK_MESSAGES.length]}
        </div>
      )}
    </div>
  );
}
