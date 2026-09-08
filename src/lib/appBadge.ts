// ===== App Badge: عددِ مرورهای سررسید روی آیکون اپ نصب‌شده (PWA) =====

interface NavigatorWithBadge {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export function appBadgeSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as unknown as NavigatorWithBadge).setAppBadge;
}

/**
 * روی آیکون اپ (در صورت نصب‌بودن و پشتیبانی مرورگر/سیستم‌عامل) شماره می‌گذارد.
 * عدد ۰ = پاک کردن نشان. هیچ‌وقت خطا پرتاب نمی‌کند تا حلقه‌ی رندر هرگز قطع نشود.
 */
export function setReviewBadge(count: number): void {
  const nav = navigator as unknown as NavigatorWithBadge;
  try {
    if (count > 0) {
      void nav.setAppBadge?.(count)?.catch(() => {});
    } else if (nav.clearAppBadge) {
      void nav.clearAppBadge().catch(() => {});
    } else {
      void nav.setAppBadge?.(0)?.catch(() => {});
    }
  } catch {
    /* سایلنت */
  }
}
