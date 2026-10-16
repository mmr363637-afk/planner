// ===== 🧯 خواندنِ امنِ JSON از localStorage =====
//
// چرا: در چند جای اپ (مثل «یادآورهای روزانه») مقدارِ localStorage با JSON.parse
// مستقیم خوانده می‌شد. اگر آن کلید خراب/دست‌کاری‌شده باشد یا مقدارش آرایه نباشد،
// JSON.parse (و new Set روی غیر-تکرارپذیر) استثنا می‌دهد؛ نتیجه در عمل این است که
// کلِ منطقِ آن بخش (مثلاً فرستادنِ همهٔ یادآورهای روز) بی‌صدا از کار می‌افتد.
// این ماژول همیشه یک آرایهٔ رشته‌ای برمی‌گرداند و هرگز throw نمی‌کند.

/** JSONِ ذخیره‌شده را می‌خواند و فقط رشته‌های غیرخالی را برمی‌گرداند (بقیه نامعتبر ⇒ []) */
export function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  } catch {
    return [];
  }
}

/** همان کار، مستقیم از روی localStorage (با محافظِ نبودِ localStorage در SSR/تست) */
export function readStringArray(key: string): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    return parseStringArray(localStorage.getItem(key));
  } catch {
    return [];
  }
}

/** نوشتنِ آرایهٔ رشته‌ای؛ اگر حافظه پر/مسدود باشد بی‌صدا رد می‌شود (نه crash) */
export function writeStringArray(key: string, values: readonly string[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    /* حالتِ private/حافظهٔ پر — بی‌صدا */
  }
}
