// ===== 🎨 تم‌های آمادهٔ پس‌زمینه (Theme Packs) =====
//
// گزارش کاربر: «تم تیره الان آبیِ پُررنگ است و تم روشن سفید؛ می‌شود تم‌های بیشتری
// اضافه کرد؟» — این فایل فقط *متادیتا* و منطقِ اعمال است؛ خودِ پالت‌ها در
// `src/index.css` (بخشِ تولیدشدهٔ `npm run gen:themes`) هستند.
//
// چرا پالت‌ها در CSS و نه در JS؟
//  • هر تم باید همان ۱۱ متغیرِ `--color-slate-*` را در دو حالتِ روشن/تیره عوض کند؛
//    در CSS هم انتخابگر `:root[data-theme-pack="…"]` و هم `:root.dark[…]` را داریم،
//    پس حالتِ روشن و تیره هرکدام پالتِ خودشان را می‌گیرند (با متغیرِ درون‌خطیِ JS
//    فقط یک پالت می‌شد).
//  • صفر هزینهٔ زمان‌اجرا: فقط یک attribute روی <html> عوض می‌شود.
//
// ⚠️ رنگ‌های `background` این‌جا باید با خروجیِ `npm run gen:themes` یکی باشند؛
// تستِ `theme-packs.test.ts` همین را می‌سنجد (تا تم و پیش‌نمایشش از هم جدا نشوند).

export type ThemePackId =
  | "default"
  | "paper"
  | "coffee"
  | "forest"
  | "plum"
  | "rose"
  | "neutral"
  | "oled";

export interface ThemePack {
  id: ThemePackId;
  label: string;
  emoji: string;
  hint: string;
  /** رنگِ پس‌زمینهٔ صفحه در حالت روشن/تیره — همان مقدارِ تولیدشده در index.css */
  background: { light: string; dark: string };
}

/**
 * تم‌ها به‌ترتیبِ نمایش در تنظیمات. «پیش‌فرض» عیناً همان پالتِ فعلیِ اپ است، پس
 * هیچ‌کس با آپدیت، ظاهرش بی‌دلیل عوض نمی‌شود؛ بقیه فقط ته‌رنگ (و برای OLED،
 * سیاهیِ سطوح) را عوض می‌کنند و قراردادِ روشناییِ پالت — یعنی خواناییِ متن — ثابت است.
 */
export const THEME_PACKS: ThemePack[] = [
  { id: "default", label: "پیش‌فرض", emoji: "🌊", hint: "همان تمِ آبی‌خاکستریِ همیشگی", background: { light: "#f8fafc", dark: "#0f172a" } },
  { id: "paper", label: "کاغذی", emoji: "📜", hint: "کِرِمِ ملایم؛ حسِ کاغذ و مرکب (کم‌خستگیِ چشم)", background: { light: "#f9f5ee", dark: "#291e10" } },
  { id: "coffee", label: "قهوه‌ای", emoji: "☕", hint: "قهوه و شکلات؛ گرم و بی‌آبی", background: { light: "#f9f1ec", dark: "#281a11" } },
  { id: "forest", label: "جنگلی", emoji: "🌲", hint: "سبزِ نعنایی در روشن، سبزِ شب در تیره", background: { light: "#f2f9f6", dark: "#112820" } },
  { id: "plum", label: "نیمه‌شب", emoji: "🌌", hint: "بنفشِ آرام؛ برای مطالعهٔ شبانه", background: { light: "#f7f3f9", dark: "#231227" } },
  { id: "rose", label: "رُز", emoji: "🌸", hint: "صورتیِ ملایم و آرام‌بخش", background: { light: "#f9f2f4", dark: "#261319" } },
  { id: "neutral", label: "خاکستری خنثی", emoji: "🩶", hint: "بدون هیچ آبی؛ خاکستریِ خالص", background: { light: "#fafafa", dark: "#1d1d1d" } },
  { id: "oled", label: "مشکی OLED", emoji: "⚫", hint: "مشکیِ واقعی در تیره (صرفه‌جویی باتری)", background: { light: "#ffffff", dark: "#050505" } },
];

export const DEFAULT_THEME_PACK: ThemePackId = "default";

const BY_ID = new Map<string, ThemePack>(THEME_PACKS.map((p) => [p.id, p]));

export function isThemePackId(value: unknown): value is ThemePackId {
  return typeof value === "string" && BY_ID.has(value);
}

/** تمِ ذخیره‌شده (هر مقدارِ ناشناخته ⇒ تمِ پیش‌فرض) */
export function themePack(id: string | undefined | null): ThemePack {
  return (id != null ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_THEME_PACK)!;
}

/** رنگِ نوار مرورگر (theme-color) برای هر تم/حالت */
export function themePackBackground(id: string | undefined | null, dark: boolean): string {
  const pack = themePack(id);
  return dark ? pack.background.dark : pack.background.light;
}

/**
 * اعمال تم روی سند. تمِ پیش‌فرض attribute را برمی‌دارد تا پالتِ پایهٔ index.css
 * دست‌نخورده بماند (بدون هیچ سرریزِ CSS اضافه).
 */
export function applyThemePack(id: string | undefined | null): ThemePackId {
  const pack = themePack(id);
  if (typeof document === "undefined") return pack.id;
  const root = document.documentElement;
  if (pack.id === DEFAULT_THEME_PACK) root.removeAttribute("data-theme-pack");
  else root.setAttribute("data-theme-pack", pack.id);
  return pack.id;
}
