import { useEffect, useRef, useState } from "react";
import { cn } from "../utils/cn";

/** یک میان‌بر در منو — `onClick` بعد از بستنِ منو اجرا می‌شود */
export interface MoreMenuItem {
  id: string;
  label: string;
  icon: string;
  hint?: string;
  /** شمارِ کنارِ آیتم (مثلاً تعداد مرورِ سررسید) — ۰ یا undefined یعنی بدونِ نشان */
  badge?: number;
  onClick: () => void;
  /** فقط روی صفحه‌های بزرگ دیده شود (مثلاً میان‌بُرهای صفحه‌کلید) */
  desktopOnly?: boolean;
}

export interface MoreMenuSection {
  id: string;
  title: string;
  items: MoreMenuItem[];
}

/**
 * ☰ منوی «همهٔ امکانات».
 *
 * چرا این کامپوننت وجود دارد؟ هر ویژگیِ تازه یک‌جای اپ اضافه شده بود و در نهایت
 * درسنامه‌ها زیرِ «دروس»، بانکِ سؤال زیرِ «امتحانات» و ابزارهای صوتی زیرِ «مرور»
 * گم شدند. این منو همان چیزهایی را که «جای اصلی» ندارند یک‌جا و دسته‌بندی‌شده
 * نشان می‌دهد، بدونِ اینکه نوارِ پایین (۶ تب) شلوغ‌تر شود.
 *
 * دسترس‌پذیری: دکمهٔ منو، دیالوگِ aria-modal، بستن با Esc و کلیکِ بیرون، فوکوسِ
 * اولیه روی اولین آیتم و برگشتِ فوکوس به دکمه بعد از بستن.
 */
export default function MoreMenu({
  open,
  onClose,
  sections,
  title = "همهٔ امکانات",
}: {
  open: boolean;
  onClose: () => void;
  sections: MoreMenuSection[];
  title?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')].filter((el) => el.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (!first) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-planner-dialog
        tabIndex={-1}
        className="relative w-full sm:max-w-lg max-h-[88vh] flex flex-col bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up"
      >
        <div className="shrink-0 px-5 pt-4 pb-2 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">☰ {title}</h3>
          <button
            type="button"
            onClick={onClose}
            title="بستن"
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-5 space-y-4">
          {sections.map((section) => (
            <section key={section.id} aria-label={section.title}>
              <div className="text-[11px] font-bold text-slate-400 mb-1.5 px-1">{section.title}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      // اجرای ناوبری بعد از بستنِ منو تا هیچ‌وقت دو دیالوگ روی هم نیفتد
                      setTimeout(item.onClick, 0);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-white dark:bg-slate-800/70 px-3 py-2.5 text-right hover:border-teal-400 dark:hover:border-teal-600 transition-colors",
                      item.desktopOnly && "hidden sm:flex",
                    )}
                  >
                    <span className="w-8 h-8 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-700/70 flex items-center justify-center text-base">{item.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12.5px] font-bold text-slate-800 dark:text-slate-100 truncate">{item.label}</span>
                      {item.hint && <span className="block text-[10px] text-slate-400 truncate">{item.hint}</span>}
                    </span>
                    {typeof item.badge === "number" && item.badge > 0 && (
                      <span className="shrink-0 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center">
                        {item.badge > 99 ? "۹۹+" : item.badge.toLocaleString("fa-IR")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** دکمهٔ همبرگریِ نوارِ بالا — همیشه یک شکل و یک اندازه */
export function MoreMenuButton({ onClick, label = "همهٔ امکانات" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}

/**
 * فهرستِ بخش‌های منو — یک‌جا و قابلِ تست.
 * خروجی فقط «چه چیزی کجا برود» است؛ هدف‌ها (onClick) در App ساخته می‌شوند تا این
 * ماژول به store/nav وابسته نشود.
 */
export const MORE_MENU_LAYOUT: { id: string; title: string; items: { id: string; label: string; icon: string; hint?: string; desktopOnly?: boolean }[] }[] = [
  {
    id: "content",
    title: "📚 محتوا و مطالعه",
    items: [
      { id: "library", label: "کتابخانهٔ درسنامه‌ها", icon: "📖", hint: "درسنامه‌های رفرنس با ثبتِ زمانِ مطالعه" },
      { id: "exambank", label: "بانکِ سؤال پره‌انترنی/دستیاری", icon: "🏥", hint: "سؤال‌های واقعیِ آزمون‌ها، مبحث‌محور" },
      { id: "qbank", label: "سؤال‌های فلش‌کارت", icon: "🧠", hint: "چهارگزینه‌ای/جاخالی از کارت‌های خودت" },
      { id: "audiostudio", label: "استودیوی صوتی", icon: "🎧", hint: "پادکست و پرسش‌وپاسخِ کارت‌ها" },
      { id: "podcast", label: "پادکستِ مرورهای امروز", icon: "📻", hint: "گوش‌دادن به مرورها" },
      { id: "autocard", label: "ساخت خودکار فلش‌کارت", icon: "🪄", hint: "از متن یا جزوه" },
    ],
  },
  {
    id: "tools",
    title: "🛠 ابزارها",
    items: [
      { id: "sources", label: "جزوهٔ متصل به منبع", icon: "📄", hint: "متن، PDF و تصویر" },
      { id: "textreader", label: "متن‌خوان", icon: "📰", hint: "خواندنِ متن با هایلایت" },
      { id: "studyroom", label: "اتاقِ مطالعهٔ دونفره", icon: "👥", hint: "مطالعهٔ هم‌زمان با یک دوست" },
      { id: "focus", label: "حالت تمرکز عمیق", icon: "🌙", hint: "بدونِ حاشیه، فقط مطالعه" },
      { id: "simulator", label: "شبیه‌ساز آزمون", icon: "🎓", hint: "آزمونِ زمان‌دار" },
      { id: "cram", label: "حالت جنگی", icon: "🏴‍☠️", hint: "برای شبِ امتحان" },
    ],
  },
  {
    id: "progress",
    title: "🏆 پیشرفت",
    items: [
      { id: "journey", label: "سفر مطالعه", icon: "🗺", hint: "خلاصهٔ مسیرِ یادگیری" },
      { id: "wrapped", label: "جمع‌بندیِ من", icon: "🎞", hint: "آمارِ جذابِ تلاش‌هایت" },
      { id: "skills", label: "نقشهٔ درس‌ها", icon: "🕸", hint: "نمای گرافیِ مباحث" },
      { id: "tests", label: "ثبتِ نتیجهٔ تست", icon: "🧪", hint: "دقتِ تست‌ها را ثبت کن" },
    ],
  },
  {
    id: "help",
    title: "❓ راهنما و برنامه",
    items: [
      { id: "guide", label: "ویدیوهای راهنمای اپ", icon: "🎬", hint: "آموزشِ آنلاینِ بخش‌ها" },
      { id: "whatsnew", label: "چه چیزهایی تازه شد؟", icon: "✨", hint: "تغییراتِ همین نسخه" },
      { id: "shortcuts", label: "میان‌بُرهای صفحه‌کلید", icon: "⌨️", hint: "Ctrl+K، ۱…۶ و ?", desktopOnly: true },
      { id: "settings", label: "تنظیمات", icon: "⚙️", hint: "تم، اعلان، داده‌ها" },
    ],
  },
];

/** آیا این آیتم باید در منو دیده شود؟ (برای تست و کنترلِ دسترسی) */
export function visibleMenuSections(): typeof MORE_MENU_LAYOUT {
  return MORE_MENU_LAYOUT;
}

/** تعدادِ آیتم‌های منو — برای شمارشِ «امکانات» در خلاصه/تست */
export function menuItemCount(): number {
  return MORE_MENU_LAYOUT.reduce((n, s) => n + s.items.length, 0);
}

/** یک درختِ ساده از آیتم‌ها برای جست‌وجوی پالت فرمان (مثلاً «درسنامه» → همان ورودی) */
export function flattenMenu(): { id: string; label: string; icon: string; section: string }[] {
  return MORE_MENU_LAYOUT.flatMap((s) => s.items.map((i) => ({ id: i.id, label: i.label, icon: i.icon, section: s.title })));
}

/** سازگاری: `useState` بدونِ استفاده نمانده باشد */
export function useMoreMenuState() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, toggle: () => setOpen((v) => !v), close: () => setOpen(false) };
}

/** فهرستِ یکتای شناسه‌ها — برای جلوگیری از تکرارِ کلید در منو */
export const MORE_MENU_IDS = MORE_MENU_LAYOUT.flatMap((s) => s.items.map((i) => i.id));
