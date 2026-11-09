// ===== چیدمان شخصی‌سازی‌شده‌ی صفحه‌ی خانه =====
// کاربر می‌تواند ترتیب کارت‌ها را عوض کند یا کارت‌های اضافی را مخفی کند تا
// خانه‌ی شلوغ، خلوت و شخصی شود. در settings.homeLayout ذخیره می‌شود.
import type { HomeCardId, HomeCardLayout } from "../types";

export const HOME_CARD_META: { id: HomeCardId; label: string; icon: string }[] = [
  { id: "quote", label: "جمله‌ی انگیزشی", icon: "❝" },
  { id: "buddy", label: "یار کمکی", icon: "🐣" },
  { id: "tree", label: "درخت تمرکز", icon: "🌳" },
  { id: "replan", label: "بنر عقب‌افتادگی", icon: "⚠️" },
  { id: "progress", label: "پیشرفت امروز", icon: "⭕" },
  { id: "examCountdown", label: "شمارش معکوس امتحان", icon: "⏳" },
  { id: "monthlyGoal", label: "هدف ماهانه", icon: "📅" },
  { id: "quickActions", label: "دسترسی سریع", icon: "⚡" },
  { id: "contentLibrary", label: "بانک سؤال و درسنامه‌ها", icon: "📚" },
  { id: "exams", label: "امتحانات پیش‌رو", icon: "📝" },
  { id: "night", label: "نقشه‌ی فردا", icon: "🌙" },
  { id: "tasks", label: "کارهای امروز", icon: "✅" },
  { id: "overdue", label: "عقب‌افتاده‌ها", icon: "🔴" },
  { id: "habits", label: "عادت‌ها", icon: "🌱" },
  { id: "journal", label: "بازتاب امروز", icon: "🌙" },
  { id: "stats", label: "وضعیت کلی", icon: "📊" },
];

// «کارهای امروز» اول می‌ماند (قلبِ اپ)، ولی کارتِ محتوا بلافاصله بعدش می‌آید تا
// در همان صفحهٔ اول و بدونِ اسکرول دیده شود.
const PRIMARY: HomeCardId[] = ["tasks", "contentLibrary", "examCountdown", "exams", "replan", "overdue", "progress", "quickActions"];

/**
 * کارت‌هایی که در همین نسخه اضافه شده‌اند و باید برای کاربرِ قدیمی هم **دیده‌شده**
 * بیایند — وگرنه `resolveHomeLayout` کارتِ تازه را با `visible: false` ته فهرست
 * می‌چسباند و فیچرِ جدید عملاً در صفحهٔ اول دیده نمی‌شود.
 * کاربر همان‌جا می‌تواند خاموشش کند یا جابه‌جایش کند؛ انتخابِ صریحش همیشه می‌ماند.
 */
const VISIBLE_WHEN_NEW: HomeCardId[] = ["contentLibrary"];
export const DEFAULT_HOME_LAYOUT: HomeCardLayout[] = [
  ...PRIMARY.map(id => ({ id, visible: true })),
  ...HOME_CARD_META.filter(m => !PRIMARY.includes(m.id)).map(m => ({ id: m.id, visible: false })),
];

/**
 * ترکیب چیدمان ذخیره‌شده با پیش‌فرض: کارت‌های تازه‌ی نسخه‌های بعدی انتها اضافه
 * می‌شوند و شناسه‌های ناشناس/تکراری دور ریخته می‌شوند (مقاوم به آپدیت).
 */
export function resolveHomeLayout(saved: HomeCardLayout[] | undefined): HomeCardLayout[] {
  if (!saved || saved.length === 0) return DEFAULT_HOME_LAYOUT.map((c) => ({ ...c }));
  const known = new Set<HomeCardId>(HOME_CARD_META.map((m) => m.id));
  const seen = new Set<HomeCardId>();
  const out: HomeCardLayout[] = [];
  for (const c of saved) {
    if (!c || !known.has(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ id: c.id, visible: c.visible !== false });
  }
  for (const m of HOME_CARD_META) {
    if (!seen.has(m.id)) out.push({ id: m.id, visible: VISIBLE_WHEN_NEW.includes(m.id) });
  }
  // کارتِ تازهٔ دیده‌شده اولِ فهرست می‌آید تا در همان صفحهٔ اول دیده شود
  // (فقط اگر کاربر قبلاً ندیده‌باشدش؛ ترتیبِ کارت‌های خودش دست‌نخورده می‌ماند)
  const fresh = out.filter((c) => c.visible && !seen.has(c.id));
  if (fresh.length > 0) return [...fresh, ...out.filter((c) => !fresh.includes(c))];
  return out;
}

/** جابه‌جایی یک کارت یک قدم بالا/پایین (خالص — برای تست‌پذیری) */
export function moveHomeCard(layout: HomeCardLayout[], id: HomeCardId, dir: -1 | 1): HomeCardLayout[] {
  const i = layout.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= layout.length) return layout;
  const next = [...layout];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
