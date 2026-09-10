// ===== اشتراک‌گذاری با Web Share API (آفلاین) =====
// navigator.share روی دستگاه کاربر داده را به اپ‌های همان گوشی می‌دهد — هیچ سروری
// در کار نیست. در نبودِ API، متن در کلیپ‌بورد کپی می‌شود.

export type ShareResult = "shared" | "copied" | "failed";

export function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function canShareFiles(files: File[]): boolean {
  try {
    const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean };
    return typeof navigator !== "undefined" && typeof nav.canShare === "function" && nav.canShare({ files });
  } catch {
    return false;
  }
}

export async function shareText(text: string, title = "برنامه‌ریز مطالعه"): Promise<ShareResult> {
  if (canShare()) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (e) {
      // کاربر لغو کرد یا خطا — نسخه‌ی کپی امتحان می‌شود
      if ((e as Error)?.name === "AbortError") return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/** اشتراک فایل تصویر (کارت PNG)؛ در نبود پشتیبانی، دانلود می‌شود */
export async function shareFile(file: File, text?: string): Promise<"shared" | "failed"> {
  if (!canShareFiles([file])) return "failed";
  try {
    await navigator.share({ files: [file], title: "برنامه‌ریز مطالعه", text });
    return "shared";
  } catch {
    return "failed";
  }
}
