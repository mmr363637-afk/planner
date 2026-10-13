// ===== پیش‌فرض‌های بیلد برای پروژهٔ Supabase =====
// یک جا، تا هم سینک ابری و هم «دستیار عمومی» از همان پروژه استفاده کنند.
// anon key ذاتاً عمومی است (در هر کلاینتی دیده می‌شود)؛ امنیت با RLS و توابع سمت سرور اعمال می‌شود.
// با VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY در زمان build قابل‌بازنویسی است.

export interface SupabaseDefaults {
  url: string;
  anonKey: string;
}

const DEFAULT_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://qylxqzzuzwwbhwglxhme.supabase.co";
const DEFAULT_ANON_KEY: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5bHhxenp1end3Ymh3Z2x4aG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5OTgxNTQsImV4cCI6MjEwNTU3NDE1NH0.uFfTOFXzENwQPfk1QmgOtnu3KYMIzI0CJZdaqC1ofUI";

/** پیکربندیِ پروژهٔ پیش‌فرضِ بیلد (پروژهٔ سازنده) — بدون در نظر گرفتن تنظیمات کاربر. */
export function defaultSupabaseConfig(): SupabaseDefaults {
  return { url: DEFAULT_URL.trim().replace(/\/$/, ""), anonKey: DEFAULT_ANON_KEY.trim() };
}
