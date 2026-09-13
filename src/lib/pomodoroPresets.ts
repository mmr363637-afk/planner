// ===== پیش‌تنظیم‌های پومودورو 🍅 =====
// یک‌تپ بین ریتم‌های علمی مطالعه جابه‌جا شو — بدون ور رفتن با چهار عدد.
import type { PomodoroSettings } from "../types";

export interface PomodoroPreset {
  id: string;
  label: string;
  icon: string;
  hint: string;
  value: PomodoroSettings;
}

export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: "classic", label: "کلاسیک", icon: "🍅", hint: "۲۵/۵ استاندارد", value: { work: 25, shortBreak: 5, longBreak: 15, cycles: 4 } },
  { id: "short", label: "شروع تنبل‌ها", icon: "☕", hint: "۱۵/۳ برای روزهایی که حال نداری", value: { work: 15, shortBreak: 3, longBreak: 10, cycles: 4 } },
  { id: "deep", label: "عمیق", icon: "🧠", hint: "۵۰/۱۰ برای تمرکز طولانی", value: { work: 50, shortBreak: 10, longBreak: 30, cycles: 3 } },
  { id: "sprint", label: "سرعتی", icon: "⚡", hint: "۵۲/۱۷ پربازده‌ترین نسبت", value: { work: 52, shortBreak: 17, longBreak: 30, cycles: 3 } },
  { id: "ultradian", label: "اولترادین", icon: "🌊", hint: "۹۰/۲۰ ریتم طبیعی مغز", value: { work: 90, shortBreak: 20, longBreak: 30, cycles: 2 } },
];

/** آیا تنظیمات فعلی دقیقاً با یک پریست می‌خواند؟ */
export function matchPomodoroPreset(p: PomodoroSettings): string | null {
  const found = POMODORO_PRESETS.find(
    (x) => x.value.work === p.work && x.value.shortBreak === p.shortBreak && x.value.longBreak === p.longBreak && x.value.cycles === p.cycles,
  );
  return found?.id ?? null;
}
