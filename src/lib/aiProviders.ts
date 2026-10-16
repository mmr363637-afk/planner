// ===== 🆓 سرویس‌های رایگان، «بدون کلید» (برای دستیار اختیاری) =====
//
// درخواستِ دومِ کاربر: «من گفتم کلیدِ API را هم برای رایگان‌ها پیدا کن؛ اگر پیدا
// نمی‌شود حذفش کن.» — یعنی مدلِ «برو خودت از فلان سایت کلید بگیر» برای کاربر
// پذیرفتنی نیست. این فایل همان چیزی است که خواسته شد: هیچ کلیدی لازم نیست.
//
// سه مسیرِ بدونِ کلید:
//  • Pollinations (text.pollinations.ai) — درگاهِ بازِ متن با مدل‌های رایگان و
//    سطحِ «anonymous»؛ همان مسیرِ سازگارِ OpenAI را دارد و از مرورگر صدا زده
//    می‌شود (CORS باز). عملاً «بدونِ ثبت‌نام، بدونِ کلید».
//  • OVHcloud AI Endpoints — سطحِ ناشناسِ مستند (حدود ۲ درخواست در دقیقه برای هر
//    مدل)، سازگار با OpenAI، بدونِ ثبت‌نام و بدونِ کلید.
//  • Ollama لوکال — کاملاً رایگان و آفلاین؛ کلید ندارد.
//
// چرا هیچ کلیدی در خودِ اپ جاسازی نشده؟ چون اپ یک PWA سمتِ کلاینت است و هر
// کلیدی داخلِ باندل، در چند ساعت عمومی می‌شود و باطل می‌شود؛ درگاه‌های بالا دقیقاً
// همین مشکل را حل می‌کنند (هیچ کلیدی وجود ندارد که لو برود).
//
// اگر خودت کلیدِ یک سرویسِ دیگر را داری (Groq / Gemini / OpenRouter / …)، فیلدهای
// baseUrl/model/کلید را دستی پر کن؛ همان قراردادِ OpenAI کار می‌کند و کلید فقط در
// localStorage همین دستگاه می‌ماند. هیچ سرورِ واسطی در میان نیست و اپ آفلاین می‌ماند.

export interface AiProviderPreset {
  id: string;
  label: string;
  emoji: string;
  baseUrl: string;
  model: string;
  /** «بدونِ کلید» — یعنی برای همین قالب هیچ کلیدی لازم نیست */
  keyless: boolean;
  /** صفحه‌ی گرفتنِ کلید — فقط برای سرویس‌های کلیدداری */
  keyUrl?: string;
  /** سهمیه‌ی رایگان به‌زبانِ ساده */
  quota: string;
  /** توضیح یک‌خطی برای راهنما */
  note: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "pollinations",
    label: "بدونِ کلید (Pollinations)",
    emoji: "🆓",
    baseUrl: "https://text.pollinations.ai/openai",
    // نامِ مدل همان است که خودِ درگاه در /v1/models برمی‌گرداند (GPT-OSS 20B رایگان)
    model: "openai-fast",
    keyless: true,
    quota: "کاملاً رایگان و بدونِ کلید — بدونِ ثبت‌نام",
    note: "هیچ کلیدی نمی‌خواهد؛ فقط همین قالب را بزن و «اتصال» را بزن. مدل رایگانِ GPT-OSS 20B است.",
  },
  {
    id: "ovh",
    label: "بدونِ کلید (OVHcloud)",
    emoji: "🇪🇺",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    model: "gpt-oss-20b",
    keyless: true,
    quota: "رایگان و بدونِ کلید — حدود ۲ درخواست در دقیقه",
    note: "گزینه‌ی دومِ بدونِ کلید؛ اگر اولی شلوغ بود این را امتحان کن (سرورهای اروپا).",
  },
  {
    id: "ollama",
    label: "Ollama (روی کامپیوتر خودت)",
    emoji: "🏠",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    keyless: true,
    keyUrl: "https://ollama.com/download",
    quota: "کاملاً رایگان و آفلاین — بدون هیچ سهمیه‌ای",
    note: "بدون اینترنت و بدون کلید؛ فقط روی همان دستگاهی که Ollama نصب است کار می‌کند.",
  },
];

export function aiProviderPreset(id: string | undefined | null): AiProviderPreset | null {
  if (!id) return null;
  return AI_PROVIDER_PRESETS.find((p) => p.id === id) ?? null;
}

/** آیا این آدرس یکی از قالب‌های «بدونِ کلید» است؟ (برای پیام‌های راهنمای UI) */
export function isKeylessBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.trim().replace(/\/$/, "");
  return AI_PROVIDER_PRESETS.some((p) => p.keyless && p.baseUrl === normalized);
}
