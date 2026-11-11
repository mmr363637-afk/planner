// ===== رویدادهای سراسریِ سبک (بدونِ وابستگی به Shell) =====
//
// چرا رویداد و نه prop؟ صفحه‌های تنبل (Home/Settings/…) نمی‌توانند به `App.tsx`
// ایمپورت کنند (وابستگیِ حلقوی) ولی باید بتوانند یک دیالوگِ سراسری را باز کنند —
// مثلاً «راهنمای ویدیویی» یا «چه چیزهایی تازه شد؟».

/** «🎬 راهنمای ویدیویی را باز کن» */
export const OPEN_GUIDE_EVENT = "sp:open-guide";
/** «✨ یادداشت‌های همین نسخه را باز کن» */
export const OPEN_WHATS_NEW_EVENT = "sp:open-whats-new";

export function openGuideVideos(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_GUIDE_EVENT));
}

export function openWhatsNew(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_WHATS_NEW_EVENT));
}
