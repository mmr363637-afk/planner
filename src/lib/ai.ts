// ===== 🤖 دستیار هوشمند (اختیاری، BYO-Key) =====
// همان الگویی که اپ برای Supabase/Drive دارد: زیرساخت «کلیدِ خودِ کاربر».
// - کلید و آدرس سرویس فقط در localStorage همین دستگاه ذخیره می‌شود؛ داخل AppState
//   نمی‌رود، پس با بکاپ/سینک ابر جابه‌جا نمی‌شود و در کد بیلدشده هم نیست.
// - هر سرویس «سازگار با OpenAI» کار می‌کند: OpenRouter، Groq، Gemini
//   (endpoint سازگار)، Ollama لوکال و… — به‌شرط اینکه CORS مرورگر را قبول کند.
// - مهم‌تر از همه: هیچ چیزی اجباری نیست. سازنده‌های آفلاین (AutoFlashcard قاعده‌محور،
//   RemediationCoach، گزارش‌های عددی) بدون دستیار هم کامل کار می‌کنند.

export interface AiConfig {
  baseUrl: string; // مثلاً https://openrouter.ai/api/v1
  apiKey: string;
  model: string; // مثلاً openai/gpt-4o-mini
}

const KEY = "sp_ai_config";
const CONFIG_EVENT = "sp:ai-config-changed";

/** Keep the shared assistant in sync with Settings, including other browser tabs. */
export function subscribeAiConfig(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener(CONFIG_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CONFIG_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function configChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONFIG_EVENT));
}

export function loadAiConfig(): AiConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<AiConfig>;
    if (typeof c?.baseUrl !== "string" || typeof c?.apiKey !== "string" || typeof c?.model !== "string") return null;
    if (!c.baseUrl.trim() || !c.apiKey.trim() || !c.model.trim()) return null;
    return { baseUrl: c.baseUrl.trim().replace(/\/$/, ""), apiKey: c.apiKey.trim(), model: c.model.trim() };
  } catch {
    return null;
  }
}

export function saveAiConfig(c: AiConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
    configChanged();
  } catch {
    /* ignore */
  }
}

export function clearAiConfig(): void {
  try {
    localStorage.removeItem(KEY);
    configChanged();
  } catch {
    /* ignore */
  }
}

export function aiConfigured(): boolean {
  return loadAiConfig() != null;
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chat(cfg: AiConfig, messages: AiChatMessage[], timeoutMs = 45_000, signal?: AbortSignal): Promise<string> {
  const ctl = new AbortController();
  const cancel = () => ctl.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    if (signal?.aborted) throw new DOMException("درخواست لغو شد.", "AbortError");
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.4 }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) throw new Error("کلید API رد شد (۴۰۱/۴۰۳) — کلید را در تنظیمات بررسی کن.");
      if (res.status === 404) throw new Error("آدرس یا نام مدل پیدا نشد (۴۰۴) — baseUrl و model را چک کن.");
      if (res.status === 429) throw new Error("سهمیه/نرخ درخواست تمام شده (۴۲۹) — کمی بعد دوباره تلاش کن.");
      throw new Error(`سرویس خطا داد (${res.status}) ${body.slice(0, 120)}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("پاسخ خالی بود.");
    return text;
  } catch (e) {
    // A deliberate close/cancel is not a timeout or a service failure.
    if (signal?.aborted) throw new DOMException("درخواست لغو شد.", "AbortError");
    if ((e as Error)?.name === "AbortError") throw new Error("زمان درخواست تمام شد — سرویس کند یا در دسترس نیست.");
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (/Failed to fetch|NetworkError/i.test(msg)) {
      throw new Error("به سرویس نرسیدیم: اینترنت را چک کن؛ اگر درست است، سرویس باید CORS مرورگر را قبول کند (OpenRouter/Groq/Gemini/Ollama این را دارند).");
    }
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/** Shared BYO-key transport. Opening the assistant never calls this automatically. */
export async function requestAiChat(messages: AiChatMessage[], signal?: AbortSignal): Promise<string> {
  const cfg = loadAiConfig();
  if (!cfg) throw new Error("دستیار هوشمند در تنظیمات وصل نشده است.");
  return chat(cfg, messages, 45_000, signal);
}

/** تست اتصال با کمترین مصرف توکن */
export async function testAiConnection(cfg?: AiConfig): Promise<{ ok: boolean; error?: string }> {
  const c = cfg ?? loadAiConfig();
  if (!c) return { ok: false, error: "دستیار پیکربندی نشده است." };
  try {
    await chat(c, [{ role: "user", content: "ping" }], 20_000);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطای ناشناخته" };
  }
}

// ---------- ساخت فلش‌کارت ----------

export interface AiCard {
  front: string;
  back: string;
}

/** تعداد کارت‌های پیشنهادی در UI (کاربر گزارش داده بود سقفِ ۱۲ سؤال اصلی‌اش بوده) */
export const AI_CARD_COUNT_CHOICES = [12, 25, 50] as const;
/** سقفِ سختِ داخلی — از این بیشتر یعنی هزینه/تایم‌اوت سرویس‌های رایگان */
export const AI_CARD_COUNT_MAX = 60;

/** ورودیِ هر عددی (۰، منفی، NaN، متن) را به بازهٔ ۱..۶۰ می‌آورد؛ پیش‌فرض ۱۲ */
export function normalizeCardCount(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return 12;
  return Math.min(AI_CARD_COUNT_MAX, v);
}

export function buildCardPrompt(text: string, maxCards: number): AiChatMessage[] {
  return [
    {
      role: "system",
      content:
        "تو برای یک دانشجوی ایرانی از متنِ داده‌شده فلش‌کارت آموزشی می‌سازی. " +
        "خروجی را فقط به‌صورت یک آرایه‌ی JSON معتبر بده بدون هیچ توضیح اضافه: " +
        '[{"front":"سوال","back":"پاسخ"}] — حداکثر ' +
        normalizeCardCount(maxCards) +
        " کارت. سوال‌ها کوتاه و مشخص باشند (ترجیحاً یک نکته در هر کارت)، پاسخ‌ها دقیق و به فارسی. " +
        "اگر متن برای این تعداد کافی نبود، کارتِ تکراری/بی‌ارزش نساز و همان تعدادِ کافی را بده. از متن بیرون نرو.",
    },
    { role: "user", content: text.slice(0, 12_000) },
  ];
}

/** پیدا کردن اولین آرایه‌ی JSON در پاسخ مدل (تحمل ```json و متن اضافه) */
export function parseCardsResponse(raw: string): AiCard[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(body.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => {
        const c = x as Partial<AiCard>;
        if (typeof c?.front !== "string" || typeof c?.back !== "string") return null;
        const front = c.front.trim();
        const back = c.back.trim();
        if (!front || !back) return null;
        return { front, back };
      })
      .filter((x): x is AiCard => x != null);
  } catch {
    return [];
  }
}

export async function aiGenerateCards(text: string, maxCards = 12): Promise<AiCard[]> {
  const cfg = loadAiConfig();
  if (!cfg) throw new Error("دستیار هوشمند در تنظیمات وصل نشده است.");
  if (!text.trim()) throw new Error("متنی برای ساخت کارت داده نشده.");
  const limit = normalizeCardCount(maxCards);
  const raw = await chat(cfg, buildCardPrompt(text, limit));
  const cards = parseCardsResponse(raw);
  if (cards.length === 0) throw new Error("مدل خروجیِ قابل استفاده نداد؛ دوباره تلاش کن یا متن را کوتاه‌تر کن.");
  return cards.slice(0, limit);
}

// ---------- منتور اشتباهات ----------

export function buildTutorPrompt(mistake: { question: string; answer?: string; cause?: string }): AiChatMessage[] {
  return [
    {
      role: "system",
      content:
        "تو منتور مطالعه‌ی یک دانشجوی ایرانی هستی. برای اشتباهِ داده‌شده: (۱) در دو جمله توضیح بده چرا این اشتباه رخ می‌دهد، (۲) یک نکته‌ی عملی برای پیشگیری بگو، (۳) سه سوال تمرینیِ کوتاه و متفاوت بساز که همان علتِ ریشه‌ای را هدف بگیرند (هرکدام در یک خط با شماره). فارسی، ساده، بدون حشو. خروجی فقط متن ساده.",
    },
    {
      role: "user",
      content: `سوال: ${mistake.question}\nپاسخ درست: ${mistake.answer ?? "(ثبت نشده)"}\nعلت از نگاه دانشجو: ${mistake.cause ?? "(ثبت نشده)"}`,
    },
  ];
}

export async function aiTutorMistake(mistake: { question: string; answer?: string; cause?: string }): Promise<string> {
  const cfg = loadAiConfig();
  if (!cfg) throw new Error("دستیار هوشمند در تنظیمات وصل نشده است.");
  return chat(cfg, buildTutorPrompt(mistake));
}

// ---------- روایت هفته ----------

export function buildNarrativePrompt(context: unknown): AiChatMessage[] {
  return [
    {
      role: "system",
      content:
        "تو گزارش‌نویسِ هفته‌ی یک اپلیکیشن برنامه‌ریزی مطالعه هستی. از روی داده‌ی JSON داده‌شده، یک روایت فارسیِ گرم و مشخص بنویس: ۳ پاراگراف کوتاه — (۱) چه گذشت (با عدد)، (۲) قوی‌ترین نقطه و یک ریسک، (۳) یک پیشنهاد عملی و کوچک برای هفته‌ی بعد. فقط از داده‌های همان JSON استفاده کن؛ چیزی نساز. لحن دوستانه، بدون اغراق.",
    },
    { role: "user", content: JSON.stringify(context) },
  ];
}

export async function aiWeeklyNarrative(context: unknown): Promise<string> {
  const cfg = loadAiConfig();
  if (!cfg) throw new Error("دستیار هوشمند در تنظیمات وصل نشده است.");
  return chat(cfg, buildNarrativePrompt(context));
}
