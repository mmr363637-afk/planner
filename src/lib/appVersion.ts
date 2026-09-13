// ===== نسخه‌ی اپ (تک‌منبع: package.json → vite define) =====

/** مثل "1.5.0" — در dev اگر define تزریق نشده بود، "dev" */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__ ? __APP_VERSION__ : "dev";

/** نسخه با ارقام فارسی برای نمایش: "1.5.0" → "۱٫۵٫۰" */
export function faVersion(v: string = APP_VERSION): string {
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  return v.replace(/[0-9]/g, (d) => FA[Number(d)]).replace(/\./g, "٫");
}
