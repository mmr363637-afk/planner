// ===== 🆓 سرویس‌های رایگان سازگار با OpenAI (برای دستیار اختیاری) =====
//
// گزارش/درخواست کاربر: «آیا سرویس AI رایگان هست که برای اپ استفاده کنیم؟»
// پاسخ: بله — چند سرویس، رایگان و بدون کارت بانکی، دقیقاً با همان قراردادِ فعلیِ
// اپ (BYO-Key + سازگار با OpenAI) کار می‌کنند. این فایل فقط «قالبِ آماده» است:
// یک تپ، baseUrl و model را در تنظیمات پر می‌کند؛ کلید را خودِ کاربر از پنلِ
// سرویس می‌گیرد و فقط در localStorage همین دستگاه می‌ماند. هیچ سروری در میان
// نیست، اپ آفلاین می‌ماند و بدون دستیار هم همه‌ی مسیرها کامل کار می‌کنند.
//
// ⚠️ نام مدل‌های رایگان مرتب عوض می‌شود؛ اگر مدلِ پیش‌فرض خطای ۴۰۴ داد، نام
// مدل را از پنل همان سرویس به‌روز کن (کارِ دیگری لازم نیست).
//
// نکته‌ی فنی: اپ روی GitHub Pages با https اجرا می‌شود، پس سرویس باید CORS را
// قبول کند (Groq/OpenRouter/Gemini/Cerebras قبول دارند). Ollama «لوکال» است و
// فقط وقتی کار می‌کند که روی همان دستگاه/شبکه بالا باشد.

export interface AiProviderPreset {
  id: string;
  label: string;
  emoji: string;
  baseUrl: string;
  model: string;
  /** صفحه‌ی گرفتن کلید (بدون کارت بانکی) */
  keyUrl: string;
  /** سهمیه‌ی رایگان به‌زبان ساده */
  quota: string;
  /** توضیح یک‌خطی برای راهنما */
  note: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "groq",
    label: "Groq",
    emoji: "⚡",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
    quota: "رایگان — بدون کارت بانکی؛ ~۳۰ درخواست در دقیقه",
    note: "سریع‌ترین گزینه و CORS را قبول دارد؛ برای ساخت فلش‌کارت و گفت‌وگو عالی است.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    emoji: "✨",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    quota: "رایگان — بدون کارت بانکی؛ روزانه تا ~۱۵۰۰ درخواست",
    note: "از AI Studio کلید بگیر؛ همین آدرس، حالتِ سازگار با OpenAI است.",
  },
  {
    id: "openrouter",
    label: "OpenRouter (مدل‌های :free)",
    emoji: "🧭",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    keyUrl: "https://openrouter.ai/keys",
    quota: "رایگان — بدون کارت بانکی؛ روزانه ۵۰ درخواست (۲۰ در دقیقه)",
    note: "هر مدلی که پسوند «:free» دارد رایگان است؛ اگر یکی شلوغ بود مدلِ :free دیگری بگذار.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    emoji: "🧠",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "llama3.1-8b",
    keyUrl: "https://cloud.cerebras.ai",
    quota: "رایگان — بدون کارت بانکی؛ روزانه ~۱ میلیون توکن",
    note: "سهمیه‌ی روزانه‌ی سخاوتمندانه؛ برای متن‌های بلند (ساخت کارت) مناسب است.",
  },
  {
    id: "ollama",
    label: "Ollama (روی کامپیوتر خودت)",
    emoji: "🏠",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    keyUrl: "https://ollama.com/download",
    quota: "کاملاً رایگان و آفلاین — بدون هیچ سهمیه‌ای",
    note: "بدون اینترنت و بدون کلید؛ در فیلد کلید هرچیزی بنویس (مثلاً «ollama»). فقط روی همان دستگاهی که Ollama نصب است کار می‌کند.",
  },
];

export function aiProviderPreset(id: string | undefined | null): AiProviderPreset | null {
  if (!id) return null;
  return AI_PROVIDER_PRESETS.find((p) => p.id === id) ?? null;
}
