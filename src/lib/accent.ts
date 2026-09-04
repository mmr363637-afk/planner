// ===== تم رنگی (Accent Color) =====
// رنگ اصلی برنامه از حالت ثابت (فیروزه‌ای) به رنگ دلخواه کاربر تغییر می‌کند.
// از یک رنگ پایه، ۱۱ طیف (۵۰ تا ۹۵۰) می‌سازیم و به‌صورت متغیرهای CSS روی ریشه‌ی
// سند اعمال می‌کنیم؛ کلاس‌های teal-* تیلویند به این متغیرها متصل شده‌اند
// (بخش مربوطه در index.css) تا تمام دکمه‌ها، نوارها و نمودارها هماهنگ عوض شوند.

export const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/**
 * ضریب حرکتِ روشنایی به سمت سفید/سیاه نسبت به طیف ۶۰۰ (= رنگ انتخابی کاربر).
 * به‌جای اختلاف ثابت، نسبت استفاده می‌کنیم تا برای رنگ‌های روشن و تیره هم
 * پالت یکنواختی بسازیم (مانند مقیاس استاندارد تیلویند).
 */
const TO_WHITE: Record<number, number> = { 50: 0.97, 100: 0.85, 200: 0.7, 300: 0.5, 400: 0.3, 500: 0.14 };
const TO_BLACK: Record<number, number> = { 700: 0.28, 800: 0.45, 900: 0.62, 950: 0.85 };

/** رنگ‌های آماده برای انتخاب سریع در تنظیمات */
export const ACCENT_PRESETS: { color: string; label: string }[] = [
  { color: "#0d9488", label: "سبز دریایی (پیش‌فرض)" },
  { color: "#2563eb", label: "آبی" },
  { color: "#0ea5e9", label: "آبی آسمانی" },
  { color: "#16a34a", label: "سبز" },
  { color: "#65a30d", label: "سبز زیتونی" },
  { color: "#d97706", label: "کهربایی" },
  { color: "#ea580c", label: "نارنجی" },
  { color: "#e11d48", label: "قرمز" },
  { color: "#db2777", label: "سرخابی" },
  { color: "#7c3aed", label: "بنفش" },
  { color: "#a21caf", label: "ارغوانی" },
  { color: "#0f172a", label: "سرمه‌ای تیره" },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

/** ساخت ۱۱ طیف از یک رنگ پایه (پایه = طیف ۶۰۰) */
export function accentShades(hex: string): Record<number, string> {
  const rgb = hexToRgb(hex) ?? hexToRgb("#0d9488")!;
  const { h, s, l: baseL } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const out: Record<number, string> = {};
  for (const step of ACCENT_STEPS) {
    let l = baseL;
    if (step === 600) {
      l = baseL;
    } else if (step < 600) {
      l = baseL + TO_WHITE[step] * (98 - baseL); // روشن‌تر → نزدیک سفید
    } else {
      l = baseL - TO_BLACK[step] * (baseL - 4); // تیره‌تر → نزدیک سیاه
    }
    // رنگ‌های خیلی روشن را کمی بی‌رنگ‌تر می‌کنیم تا ملایم بمانند
    const soft = s * (step >= 500 ? 1 : 0.6 + (step / 500) * 0.4);
    const c = hslToRgb(h, soft, l);
    out[step] = rgbToHex(c.r, c.g, c.b);
  }
  return out;
}

/** آیا رنگ انتخاب‌شده آن‌قدر روشن است که نوشته‌ی سفید روی آن کم‌فروغ شود؟ */
export function isLightAccent(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  // روشنایی ادراکی (YIQ)
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 175;
}

/** اعمال طیف روی متغیرهای CSS ریشه‌ی سند؛ خروجی: نگاشت طیف‌ها */
export function applyAccentColor(hex: string): Record<number, string> {
  const shades = accentShades(hex);
  const root = document.documentElement;
  for (const step of ACCENT_STEPS) root.style.setProperty(`--acc-${step}`, shades[step]);
  return shades;
}
