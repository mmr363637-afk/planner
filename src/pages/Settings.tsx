import { useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Card, ConfirmDialog, SectionTitle, Segmented, Toggle, inputClass } from "../components/ui";
import { notificationPermission, notify, requestNotificationPermission } from "../lib/notify";
import { ACCENT_PRESETS, isLightAccent } from "../lib/accent";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import { DEFAULT_SETTINGS, type NotificationSettings } from "../types";

export default function SettingsPage() {
  const { state, updateSettings, exportData, importData, resetAll, loadSampleData, toast } = useStore();
  const s = state.settings;
  const [resetOpen, setResetOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const perm = notificationPermission();

  const setPomodoro = (patch: Partial<typeof s.pomodoro>) => updateSettings({ pomodoro: { ...s.pomodoro, ...patch } });
  const setNotif = (patch: Partial<NotificationSettings>) => updateSettings({ notifications: { ...s.notifications, ...patch } });

  const toggleNotifications = async (on: boolean) => {
    if (on) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        toast(perm === "unsupported" ? "مرورگر شما از اعلان پشتیبانی نمی‌کند" : "دسترسی اعلان داده نشد", "⚠️");
        setNotif({ enabled: false });
        return;
      }
      setNotif({ enabled: true });
      notify("اعلان‌ها فعال شد ✅", "برنامه مطالعه به شما یادآوری خواهد کرد.");
    } else setNotif({ enabled: false });
  };

  const sendTestNotification = () => {
    if (!s.notifications.enabled) {
      toast("ابتدا اعلان‌ها را فعال کن", "⚠️");
      return;
    }
    const ok = notify("اعلان تست 🔔", "اگر این پیام را می‌بینی، اعلان‌ها به‌درستی کار می‌کنند.", "test");
    if (ok) toast("اعلان تست ارسال شد", "🔔");
    else toast(perm === "denied" ? "دسترسی اعلان در مرورگر مسدود شده؛ از تنظیمات سایت بازش کن" : "دسترسی اعلان داده نشد", "⚠️");
  };

  const download = () => {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `study-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("فایل پشتیبان دانلود شد", "💾");
  };

  const onImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importData(String(reader.result));
      toast(ok ? "داده‌ها بازیابی شد" : "فایل معتبر نیست", ok ? "✅" : "⚠️");
    };
    reader.readAsText(file);
  };

  const NumberRow = ({ label, value, onChange, min = 1, max = 180, unit = "دقیقه" }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string }) => (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200" onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </button>
        <span className="w-16 text-center text-sm font-bold text-slate-800 dark:text-slate-100">
          {toFa(value)} <span className="text-[10px] font-normal text-slate-400">{unit}</span>
        </span>
        <button type="button" className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200" onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
    </div>
  );

  const ToggleRow = ({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) => (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <div className="text-sm text-slate-700 dark:text-slate-200">{label}</div>
        {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );

  return (
    <div className="pb-8">
      <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50 mb-4">تنظیمات</h1>

      <SectionTitle>ظاهر</SectionTitle>
      <Card>
        <div className="text-sm text-slate-700 dark:text-slate-200 mb-2">حالت نمایش</div>
        <Segmented value={s.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: "light", label: "روشن" }, { value: "dark", label: "تیره" }, { value: "system", label: "سیستم" }]} />

        {/* تم رنگی (accent color) */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">🎨 رنگ برنامه</span>
            <span className="text-[10px] text-slate-400 text-left">دکمه‌ها، نوارها، نمودارها و … هماهنگ عوض می‌شوند</span>
          </div>
          <div className="grid grid-cols-6 gap-2 mt-3">
            {ACCENT_PRESETS.map((p) => {
              const selected = s.accentColor.toLowerCase() === p.color.toLowerCase();
              return (
                <button
                  key={p.color}
                  type="button"
                  title={p.label}
                  onClick={() => updateSettings({ accentColor: p.color })}
                  className={cn(
                    "aspect-square rounded-full transition-all",
                    selected ? "ring-2 ring-offset-2 ring-slate-700 dark:ring-white dark:ring-offset-slate-800 scale-110" : "hover:scale-110",
                  )}
                  style={{ backgroundColor: p.color }}
                />
              );
            })}
          </div>
          <label className="flex items-center gap-3 mt-3 cursor-pointer">
            <span className="relative inline-block w-9 h-9 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600">
              <input
                type="color"
                value={s.accentColor}
                onChange={(e) => updateSettings({ accentColor: e.target.value })}
                className="absolute -inset-2 w-16 h-16 cursor-pointer"
                title="انتخاب هر رنگ دلخواه"
              />
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              رنگ دلخواه خودت را انتخاب کن
              <span className="block text-[10px] mt-0.5" style={{ color: s.accentColor }}>نمونه: دکمه‌ها و نشانگرها به این رنگ درمی‌آیند</span>
            </span>
          </label>
          {isLightAccent(s.accentColor) && (
            <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2 leading-relaxed">
              ⚠️ این رنگ خیلی روشن است و نوشته‌های سفید روی دکمه‌ها خوانا نیستند؛ رنگ تیره‌تری انتخاب کن.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-700 dark:text-slate-200">زبان</span>
          <select className={inputClass + " w-32"} value="fa" onChange={() => toast("در نسخه فعلی فقط فارسی در دسترس است", "ℹ️")}>
            <option value="fa">فارسی</option>
            <option value="en">English (به‌زودی)</option>
          </select>
        </div>
      </Card>

      <SectionTitle>پومودورو</SectionTitle>
      <Card className="divide-y divide-slate-100 dark:divide-slate-700/60">
        <NumberRow label="زمان مطالعه" value={s.pomodoro.work} onChange={(v) => setPomodoro({ work: v })} min={5} max={120} />
        <NumberRow label="استراحت کوتاه" value={s.pomodoro.shortBreak} onChange={(v) => setPomodoro({ shortBreak: v })} min={1} max={30} />
        <NumberRow label="استراحت طولانی" value={s.pomodoro.longBreak} onChange={(v) => setPomodoro({ longBreak: v })} min={5} max={60} />
        <NumberRow label="تعداد سیکل تا استراحت طولانی" value={s.pomodoro.cycles} onChange={(v) => setPomodoro({ cycles: v })} min={2} max={8} unit="سیکل" />
      </Card>

      <SectionTitle>مرور فاصله‌دار</SectionTitle>
      <Card>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">فاصله مرورها (روز). بر اساس عملکرد شما این فاصله‌ها کوتاه‌تر یا بلندتر می‌شوند.</div>
        <div className="grid grid-cols-5 gap-2">
          {s.reviewIntervals.map((v, i) => (
            <div key={i} className="text-center">
              <div className="text-[10px] text-slate-400 mb-1">مرور {toFa(i + 1)}</div>
              <input
                type="number"
                min={1}
                className={inputClass + " text-center px-1"}
                value={v}
                onChange={(e) => {
                  const arr = [...s.reviewIntervals];
                  arr[i] = Math.max(1, Number(e.target.value) || 1);
                  updateSettings({ reviewIntervals: arr });
                }}
              />
            </div>
          ))}
        </div>
        <button type="button" className="text-xs text-teal-600 dark:text-teal-400 mt-3" onClick={() => updateSettings({ reviewIntervals: DEFAULT_SETTINGS.reviewIntervals })}>
          بازگشت به پیش‌فرض (۱، ۳، ۷، ۱۴، ۳۰)
        </button>
      </Card>

      <SectionTitle>اعلان‌ها</SectionTitle>
      <Card className="divide-y divide-slate-100 dark:divide-slate-700/60">
        <ToggleRow label="فعال‌سازی اعلان‌ها" checked={s.notifications.enabled} onChange={toggleNotifications} hint={perm === "denied" ? "دسترسی در مرورگر مسدود شده است" : perm === "unsupported" ? "پشتیبانی نمی‌شود" : "اعلان‌های داخل مرورگر / اپ نصب‌شده"} />
        <ToggleRow label="شروع زمان مطالعه" checked={s.notifications.studyStart} onChange={(v) => setNotif({ studyStart: v })} disabled={!s.notifications.enabled} />
        <ToggleRow label="مرورهای امروز" checked={s.notifications.reviewsToday} onChange={(v) => setNotif({ reviewsToday: v })} disabled={!s.notifications.enabled} />
        <ToggleRow label="مرورهای عقب‌افتاده" checked={s.notifications.overdueReviews} onChange={(v) => setNotif({ overdueReviews: v })} disabled={!s.notifications.enabled} />
        <ToggleRow label="یادآوری برنامه روزانه" checked={s.notifications.dailyPlan} onChange={(v) => setNotif({ dailyPlan: v })} disabled={!s.notifications.enabled} />
        <ToggleRow label="یادآوری امتحانات" checked={s.notifications.examReminder} onChange={(v) => setNotif({ examReminder: v })} disabled={!s.notifications.enabled} hint="روز قبل و روز امتحان" />
        <ToggleRow label="پایان زمان استراحت" checked={s.notifications.breakEnd} onChange={(v) => setNotif({ breakEnd: v })} disabled={!s.notifications.enabled} />
        <div className="flex items-center justify-between py-2.5">
          <span className="text-sm text-slate-700 dark:text-slate-200">ساعت یادآوری روزانه</span>
          <input type="time" className={inputClass + " w-32"} value={s.notifications.dailyReminderTime} onChange={(e) => setNotif({ dailyReminderTime: e.target.value })} disabled={!s.notifications.enabled} />
        </div>
        {perm === "denied" && (
          <div className="py-3 text-[11px] leading-relaxed text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-xl px-3 mt-2">
            دسترسی اعلان در مرورگر مسدود شده است. از آیکون قفل/تنظیمات کنار نوار آدرس، اعلان‌ها را مجاز کن و صفحه را بارگذاری کن.
          </div>
        )}
        <button
          type="button"
          onClick={sendTestNotification}
          disabled={!s.notifications.enabled}
          className="w-full mt-3 text-sm py-2.5 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🔔 ارسال اعلان تست
        </button>
      </Card>

      <SectionTitle>روز مطالعه</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">ساعت شروع روز</span>
            <input type="time" className={inputClass} value={s.dayStart} onChange={(e) => updateSettings({ dayStart: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">ساعت پایان روز</span>
            <input type="time" className={inputClass} value={s.dayEnd} onChange={(e) => updateSettings({ dayEnd: e.target.value })} />
          </label>
        </div>
      </Card>

      <SectionTitle>داده‌ها</SectionTitle>
      <Card className="flex flex-col gap-2">
        <Button variant="secondary" onClick={download}>
          💾 پشتیبان‌گیری (دانلود JSON)
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          📂 بازیابی از فایل پشتیبان
        </Button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
        <Button variant="ghost" onClick={() => { loadSampleData(); toast("نمونه دروس اضافه شد", "📚"); }}>
          افزودن نمونه دروس پزشکی
        </Button>
        <Button variant="danger" onClick={() => setResetOpen(true)}>
          🗑 حذف تمام داده‌ها
        </Button>
      </Card>

      <div className="text-center text-[11px] text-slate-400 mt-8 leading-relaxed">
        برنامه‌ریز مطالعه · نسخه ۱٫۰٫۰
        <br />
        همه داده‌ها فقط روی همین دستگاه ذخیره می‌شوند.
      </div>

      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} title="حذف تمام داده‌ها" message="تمام دروس، مباحث، برنامه‌ها، جلسات و مرورها برای همیشه حذف می‌شوند. این عمل قابل بازگشت نیست." confirmLabel="حذف همه" danger onConfirm={() => { resetAll(); toast("همه داده‌ها حذف شد", "🗑"); }} />
    </div>
  );
}
