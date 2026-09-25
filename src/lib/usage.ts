// ===== گزارش استفاده‌ی کاملاً محلی =====
// هدف: بدون هیچ سرور و بدون هیچ داده‌ی شخصی، فقط «چند بار از هر قابلیت استفاده شد» روی
// همین دستگاه شمرده شود تا (۱) کاربر بداند چه چیزهایی برایش جا افتاده و (۲) سازنده
// با نگاه به گزارشِ داوطلبانه‌ی کاربران بفهمد کدام فیچر واقعاً استفاده می‌شود.
// این داده عمداً داخل AppState نیست: با سینک ابر/بکاپ جابه‌جا نمی‌شود و پاک‌کردنِ
// داده‌های اپ هم پاکش نمی‌کند (فقط با دکمه‌ی اختصاصی خودش پاک می‌شود).

const KEY = "sp_usage_v1";

export interface UsageEntry {
  count: number;
  lastAt: number;
}
export type UsageMap = Record<string, UsageEntry>;

/** نام نمایشی قابلیت‌ها — هر کلید جدید باید اینجا برچسب فارسی بگیرد */
export const FEATURE_LABELS: Record<string, string> = {
  session_start: "شروع جلسه‌ی مطالعه",
  session_end: "پایان جلسه با ارزیابی",
  card_review: "مرور فلش‌کارت",
  review_done: "انجام مرور فاصله‌دار",
  mistake_add: "ثبت اشتباه در دفتر",
  mistake_review: "مرور اشتباه",
  ambient_mix: "استفاده از میکسر صدا",
  study_room: "اتاق مطالعه (دونفره/گروهی)",
  focus_mode: "حالت تمرکز عمیق",
  ocr_import: "استخراج متن از PDF/عکس",
  auto_card: "ساخت خودکار فلش‌کارت",
  ai_card: "ساخت کارت با دستیار هوشمند",
  ai_tutor: "توضیح هوشمند اشتباه",
  ai_report: "روایت هوشمند هفته",
  voice_log: "ثبت مطالعه با صدا",
  exam_sim: "شبیه‌ساز آزمون",
  ghost_share: "اشتراک سایه با دوست",
  ghost_import: "وارد کردن سایه‌ی دوست",
  anki_export: "خروجی Anki",
  calendar_sync: "ارسال امتحانات به تقویم گوگل",
  palette: "پالت فرمان",
  smart_plan: "ساخت برنامه‌ی هوشمند",
  test_log: "ثبت نتیجه‌ی تست",
  capsule: "کپسول زمان",
  manual_log: "ثبت دستی مطالعه",
  exam_debrief: "بازتاب بعد از امتحان",
};

export function readUsage(): UsageMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: UsageMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const e = v as Partial<UsageEntry>;
      if (typeof e?.count === "number" && Number.isFinite(e.count) && typeof e?.lastAt === "number") {
        out[k] = { count: Math.max(0, Math.floor(e.count)), lastAt: e.lastAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** یک استفاده از قابلیت را ثبت می‌کند — بی‌صدا؛ هیچ‌وقت جریان اپ را نمی‌شکند */
export function trackFeature(feature: string): void {
  try {
    const usage = readUsage();
    const prev = usage[feature] ?? { count: 0, lastAt: 0 };
    usage[feature] = { count: prev.count + 1, lastAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    /* پر بودن سهمیه یا مرورگر خصوصی — مهم نیست */
  }
}

export function resetUsage(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** فهرست مرتب (پراستفاده‌ترین اول) برای نمایش در تنظیمات/Wrapped */
export function usageReport(limit = 12): { key: string; label: string; count: number; lastAt: number }[] {
  const usage = readUsage();
  return Object.entries(usage)
    .map(([key, e]) => ({ key, label: FEATURE_LABELS[key] ?? key, count: e.count, lastAt: e.lastAt }))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit);
}
