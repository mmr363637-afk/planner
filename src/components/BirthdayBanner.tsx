import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { Button } from "./ui";
import { checkBirthday } from "../lib/birthday";
import { notificationPermission, notify, notificationsSupported } from "../lib/notify";
import { toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";

/**
 * بنر تولد — یک‌بار در روز، فقط اگر کاربر تاریخ تولد را ثبت کرده باشد.
 * • تاریخ محلی است و آفلاین کار می‌کند؛ هیچ درخواست شبکه‌ای ندارد.
 * • «ممنون» تاریخ را در `lastBirthdayGreeted` ثبت می‌کند تا تا فردا دوباره نیاید.
 * • اگر اجازهٔ اعلان داده شده باشد، یک اعلان محلی هم می‌فرستد (اختیاری و بدون تکرار).
 */
export default function BirthdayBanner() {
  const { state, updateSettings } = useStore();
  const birthday = state.settings.birthday;
  const today = todayKey();
  const check = checkBirthday(birthday, today, state.settings.lastBirthdayGreeted);
  const notifiedRef = useRef<string | null>(null);
  const message = check?.message ?? "";

  useEffect(() => {
    if (!check?.shouldGreet) return;
    if (notifiedRef.current === today) return;
    notifiedRef.current = today;
    if (!notificationsSupported()) return;
    if (notificationPermission() !== "granted") return;
    notify("تولدت مبارک! 🎂", message, `birthday-${today}`);
  }, [check?.shouldGreet, message, today]);

  if (!check?.shouldGreet) return null;

  return (
    <div
      className={cn(
        "mb-4 rounded-2xl border p-4 relative overflow-hidden",
        "bg-gradient-to-l from-rose-100 via-amber-50 to-teal-50 dark:from-rose-900/30 dark:via-amber-900/20 dark:to-teal-900/20",
        "border-rose-200/80 dark:border-rose-800/60",
      )}
      role="status"
    >
      <div className="absolute -top-3 -left-2 text-3xl opacity-30 rotate-12 select-none" aria-hidden>🎈</div>
      <div className="absolute -bottom-3 left-8 text-2xl opacity-30 -rotate-12 select-none" aria-hidden>🎊</div>
      <div className="text-sm font-extrabold text-rose-700 dark:text-rose-200">
        {check.emoji} {check.age != null ? `${toFa(check.age)} سالگی‌ات مبارک!` : "تولدت مبارک!"}
      </div>
      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-1">{toFa(check.message)}</p>
      <div className="flex gap-2 mt-2.5">
        <Button
          size="sm"
          onClick={() => updateSettings({ lastBirthdayGreeted: today })}
        >
          ممنون 🎉
        </Button>
        <Button size="sm" variant="ghost" onClick={() => updateSettings({ birthday: undefined, lastBirthdayGreeted: undefined })}>
          دیگر نشانم نده
        </Button>
      </div>
    </div>
  );
}
