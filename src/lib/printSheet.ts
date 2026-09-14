// ===== شیت چاپِ هفتگی — «به‌موقع» در DOM =====
// شیت تا زمانی که کاربر دکمه‌ی «چاپ / PDF» را نزده، اصلاً در DOM نیست:
//  - متن‌هایش (مثل «ساعت») با کوئری‌های متنِ تست‌ها و اسکرین‌ریدر تداخل ندارند
//  - چاپِ مستقیمِ Ctrl+P قبل از زدن دکمه، صفحه‌ی معمولی را چاپ می‌کند (رفتار پیش‌فرض مرورگر)
// بعد از اولین arm، شیت برای کلِ عمرِ آن بارگذاری صفحه می‌ماند تا Ctrl+P بعدی هم کار کند.

const EVENT = "planner:arm-weekly-print";

export function armWeeklyPrint(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** ثبتِ listener؛ تابع‌ی clean-up برمی‌گرداند */
export function onWeeklyPrintArmed(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
