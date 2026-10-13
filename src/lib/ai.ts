// ===== 🤖 دستیار هوشمند — دو راه اتصال: «شخصی» (BYO-Key) و «عمومی» (سرور سازنده) =====
//
// 🔑 شخصی — همان الگویی که اپ برای Supabase/Drive دارد: زیرساخت «کلیدِ خودِ کاربر».
// - کلید و آدرس سرویس فقط در localStorage همین دستگاه ذخیره می‌شود؛ داخل AppState
//   نمی‌رود، پس با بکاپ/سینک ابر جابه‌جا نمی‌شود و در کد بیلدشده هم نیست.
// - هر سرویس «سازگار با OpenAI» کار می‌کند: OpenRouter، Groq، Gemini
//   (endpoint سازگار)، Ollama لوکال و… — به‌شرط اینکه CORS مرورگر را قبول کند.
//
// 🌐 عمومی — برای کسی که کلید ندارد. مرورگر هیچ کلیدی ندارد؛ پیام به تابع
//   `ai-chat` روی پروژهٔ Supabase سازنده می‌رود (کد در supabase/functions/ai-chat)
//   و همان‌جا کلیدِ سازنده، سهمیهٔ روزانهٔ هر کاربر و سقف کلی اعمال می‌شود.
//   هویت کاربر یک «ورود ناشناس» Supabase است (مثل سینک) که فقط برای شمردن سهمیه
//   به کار می‌رود؛ هیچ پیامی روی سرور سازنده ذخیره نمی‌شود.
//
// - مهم‌تر از همه: هیچ چیزی اجباری نیست. سازنده‌های آفلاین (AutoFlashcard قاعده‌محور،
//   RemediationCoach، گزارش‌های عددی) بدون دستیار هم کامل کار می‌کنند.

import { defaultSupabaseConfig } from "./supabaseDefaults";

export interface AiConfig {
  baseUrl: string; // مثلاً https://openrouter.ai/api/v1
  apiKey: string;
  model: string; // مثلاً openai/gpt-4o-mini
}

/** کدام اتصال فعال است: کلید شخصی یا سرور عمومی سازنده */
export type AiMode = "personal" | "shared";

export interface SharedAiEndpoint {
  /** آدرس پروژهٔ Supabase سازنده — مثلاً https://xxx.supabase.co */
  url: string;
  anonKey: string;
}

export type AiProvider =
  | { kind: "personal"; config: AiConfig }
  | { kind: "shared"; endpoint: SharedAiEndpoint };

/** سهمیهٔ امروزِ دستیار عمومی — آخرین مقداری که سرور گزارش داده */
export interface AiQuota {
  used: number;
  limit: number;
  /** ISO؛ لحظهٔ صفر شدن سهمیه (نیمه‌شب تهران) */
  resetAt: string | null;
  model?: string;
}

const KEY = "sp_ai_config";
const MODE_KEY = "sp_ai_mode";
const AUTH_KEY = "sp_ai_auth";
const CONFIG_EVENT = "sp:ai-config-changed";
const QUOTA_EVENT = "sp:ai-quota-changed";

/** Keep the shared assistant in sync with Settings, including other browser tabs. */
export function subscribeAiConfig(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === MODE_KEY || event.key === null) listener();
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

// ---------- 🔑 پیکربندی شخصی ----------

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

/** ذخیرهٔ کلید شخصی؛ همزمان حالت فعال را «شخصی» می‌کند (کاربر آگاهانه کلید وارد کرده). */
export function saveAiConfig(c: AiConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
    localStorage.setItem(MODE_KEY, "personal");
    configChanged();
  } catch {
    /* ignore */
  }
}

/** حذف کلید شخصی. اگر حالت فعال «شخصی» بود، دستیار قطع می‌شود؛ حالت «عمومی» دست‌نخورده می‌ماند. */
export function clearAiConfig(): void {
  try {
    localStorage.removeItem(KEY);
    if (localStorage.getItem(MODE_KEY) === "personal") localStorage.removeItem(MODE_KEY);
    configChanged();
  } catch {
    /* ignore */
  }
}

// ---------- 🌐 حالت و endpoint دستیار عمومی ----------

/** انتخاب صریح کاربر (اگر کرده باشد). بدون انتخاب، کلید شخصی — اگر باشد — فعال است. */
export function loadAiMode(): AiMode | null {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === "personal" || raw === "shared" ? raw : null;
  } catch {
    return null;
  }
}

function writeAiMode(mode: AiMode | null): void {
  try {
    if (mode) localStorage.setItem(MODE_KEY, mode);
    else localStorage.removeItem(MODE_KEY);
    configChanged();
  } catch {
    /* ignore */
  }
}

/**
 * endpoint دستیار عمومی = همان پروژهٔ Supabase پیش‌فرضِ بیلد (پروژهٔ سازنده).
 * با `VITE_SHARED_AI=off` در زمان build، گزینهٔ عمومی به‌کلی از UI حذف می‌شود (برای fork بدون سرور).
 */
export function sharedAiEndpoint(): SharedAiEndpoint | null {
  const off = typeof import.meta !== "undefined" && import.meta.env?.VITE_SHARED_AI === "off";
  if (off) return null;
  const { url, anonKey } = defaultSupabaseConfig();
  if (!/^https:\/\/.+/.test(url) || anonKey.length < 40) return null;
  return { url, anonKey };
}

/** اتصالِ مؤثر: انتخاب صریح کاربر، وگرنه کلید شخصی اگر وجود دارد. */
export function activeAiProvider(): AiProvider | null {
  const mode = loadAiMode();
  const personal = loadAiConfig();
  if (mode === "shared") {
    const endpoint = sharedAiEndpoint();
    if (endpoint) return { kind: "shared", endpoint };
  }
  if (personal) return { kind: "personal", config: personal };
  return null;
}

export function aiConfigured(): boolean {
  return activeAiProvider() != null;
}

/** فقط نوع اتصال فعال — برای نمایش در UI (مقدار اولیه‌ی useSyncExternalStore باید پایدار باشد). */
export function activeAiKind(): AiMode | null {
  return activeAiProvider()?.kind ?? null;
}

// ---------- سهمیهٔ عمومی (فقط حافظه؛ هر بار از سرور تازه می‌شود) ----------

let quota: AiQuota | null = null;

export function getAiQuota(): AiQuota | null {
  return quota;
}

export function subscribeAiQuota(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(QUOTA_EVENT, listener);
  return () => window.removeEventListener(QUOTA_EVENT, listener);
}

function setQuota(next: AiQuota | null): void {
  quota = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUOTA_EVENT));
}

function quotaFrom(data: Record<string, unknown> | null | undefined, previous?: AiQuota | null): AiQuota | null {
  if (!data) return previous ?? null;
  const used = Number(data.used);
  const limit = Number(data.limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit)) return previous ?? null;
  return {
    used,
    limit,
    resetAt: typeof data.resetAt === "string" ? data.resetAt : (previous?.resetAt ?? null),
    model: typeof data.model === "string" ? data.model : previous?.model,
  };
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ---------- زمان‌بندی مشترک (timeout + لغو) ----------

async function withDeadline<T>(timeoutMs: number, signal: AbortSignal | undefined, run: (inner: AbortSignal) => Promise<T>, network: string): Promise<T> {
  const ctl = new AbortController();
  const cancel = () => ctl.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    if (signal?.aborted) throw new DOMException("درخواست لغو شد.", "AbortError");
    return await run(ctl.signal);
  } catch (e) {
    // A deliberate close/cancel is not a timeout or a service failure.
    if (signal?.aborted) throw new DOMException("درخواست لغو شد.", "AbortError");
    if ((e as Error)?.name === "AbortError") throw new Error("زمان درخواست تمام شد — سرویس کند یا در دسترس نیست.");
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (/Failed to fetch|NetworkError/i.test(msg)) throw new Error(network);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

// ---------- 🔑 حمل‌ونقل شخصی ----------

async function chat(cfg: AiConfig, messages: AiChatMessage[], timeoutMs = 45_000, signal?: AbortSignal): Promise<string> {
  return withDeadline(timeoutMs, signal, async (inner) => {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      signal: inner,
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
  }, "به سرویس نرسیدیم: اینترنت را چک کن؛ اگر درست است، سرویس باید CORS مرورگر را قبول کند (OpenRouter/Groq/Gemini/Ollama این را دارند).");
}

// ---------- 🌐 حمل‌ونقل عمومی (Edge Function سازنده) ----------

interface SharedSession {
  accessToken: string;
  refreshToken: string;
  /** ms epoch */
  expiresAt: number;
}

function readSession(): SharedSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SharedSession>;
    if (typeof s?.accessToken !== "string" || typeof s?.refreshToken !== "string" || typeof s?.expiresAt !== "number") return null;
    return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt };
  } catch {
    return null;
  }
}

function writeSession(s: SharedSession | null): void {
  try {
    if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

const SHARED_NETWORK_ERROR = "به سرور دستیار عمومی نرسیدیم — اینترنت را چک کن و دوباره تلاش کن.";

/** ورود ناشناس / تازه‌سازی نشست با REST خودِ GoTrue — بدون کلاینت دوم Supabase. */
async function gotrue(ep: SharedAiEndpoint, path: string, body: unknown, signal: AbortSignal): Promise<SharedSession> {
  const res = await fetch(`${ep.url}/auth/v1/${path}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", apikey: ep.anonKey, Authorization: `Bearer ${ep.anonKey}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(data.error_code ?? data.code ?? data.msg ?? data.error ?? "");
    if (/anonymous/i.test(code) || res.status === 422) throw new Error("ورود ناشناس در پروژهٔ Supabase سازنده خاموش است؛ دستیار عمومی تا فعال‌شدن آن کار نمی‌کند.");
    if (res.status === 429) throw new Error("سرور دستیار فعلاً شلوغ است (محدودیت ورود)؛ چند دقیقه بعد دوباره تلاش کن.");
    throw new Error(`ورود به سرور دستیار ناموفق بود (${res.status}).`);
  }
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") throw new Error("پاسخ ورودِ سرور دستیار نامعتبر بود.");
  const expiresIn = Number(data.expires_in);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
  };
}

async function sharedToken(ep: SharedAiEndpoint, signal: AbortSignal, force = false): Promise<string> {
  const current = readSession();
  if (current && !force && current.expiresAt - 60_000 > Date.now()) return current.accessToken;
  if (current?.refreshToken) {
    try {
      const next = await gotrue(ep, "token?grant_type=refresh_token", { refresh_token: current.refreshToken }, signal);
      writeSession(next);
      return next.accessToken;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // قطعی شبکه نشست را باطل نمی‌کند؛ فقط ردِ صریحِ سرور (توکن منقضی/باطل) هویت تازه می‌گیرد.
      if (signal.aborted || /Failed to fetch|NetworkError/i.test(msg)) throw e;
      writeSession(null);
    }
  }
  const fresh = await gotrue(ep, "signup", { data: {} }, signal);
  writeSession(fresh);
  return fresh.accessToken;
}

/** خطای سرور عمومی → پیام فارسیِ قابل‌فهم. سهمیه را هم به‌روز می‌کند. */
function sharedError(status: number, data: Record<string, unknown>): Error {
  const code = typeof data.error === "string" ? data.error : "";
  if (status === 429 && code === "quota") {
    const q = quotaFrom(data, quota);
    if (q) setQuota(q);
    if (data.reason === "global") return new Error("ظرفیت امروزِ دستیار عمومی برای همهٔ کاربران پر شده است؛ فردا دوباره باز می‌شود، یا در تنظیمات کلید شخصی وصل کن.");
    const used = q ? `${toFaDigits(q.used)} از ${toFaDigits(q.limit)}` : "";
    return new Error(`سهمیهٔ امروزت در دستیار عمومی تمام شد${used ? ` (${used})` : ""}؛ فردا دوباره فعال می‌شود، یا در تنظیمات کلید شخصی وصل کن.`);
  }
  if (status === 404) return new Error("دستیار عمومی روی سرور راه‌اندازی نشده است (تابع ai-chat پیدا نشد).");
  if (status === 401) return new Error("نشستِ دستیار عمومی معتبر نیست؛ یک بار دیگر تلاش کن.");
  if (status === 403) return new Error("این دامنه اجازهٔ استفاده از دستیار عمومی را ندارد.");
  if (status === 413 || code === "too_long") return new Error("متن ارسالی برای دستیار عمومی خیلی بلند است؛ کوتاه‌ترش کن یا خلاصه را خاموش کن.");
  if (code === "not_configured") return new Error("دستیار عمومی هنوز روی سرور پیکربندی نشده (کلید مدل ثبت نشده است).");
  if (code === "upstream_busy") return new Error("سرویس مدل شلوغ است؛ کمی بعد دوباره تلاش کن.");
  if (code === "upstream_auth") return new Error("کلیدِ سرور دستیار عمومی رد شد؛ سازنده باید آن را بررسی کند.");
  if (status >= 500 || code.startsWith("upstream")) return new Error("سرویس مدل پاسخ نداد؛ کمی بعد دوباره تلاش کن.");
  if (code === "bad_messages" || status === 400) return new Error("درخواست نامعتبر بود؛ پیام را دوباره بنویس.");
  return new Error(`سرور دستیار عمومی خطا داد (${status}).`);
}

function toFaDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

async function sharedPost(ep: SharedAiEndpoint, body: unknown, inner: AbortSignal): Promise<Record<string, unknown>> {
  const call = (token: string) => fetch(`${ep.url}/functions/v1/ai-chat`, {
    method: "POST",
    signal: inner,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ep.anonKey },
    body: JSON.stringify(body),
  });
  let res = await call(await sharedToken(ep, inner));
  if (res.status === 401) res = await call(await sharedToken(ep, inner, true));
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw sharedError(res.status, data);
  return data;
}

async function sharedChat(ep: SharedAiEndpoint, messages: AiChatMessage[], timeoutMs = 60_000, signal?: AbortSignal): Promise<string> {
  return withDeadline(timeoutMs, signal, async (inner) => {
    const data = await sharedPost(ep, { messages, temperature: 0.4 }, inner);
    const usage = data.usage as Record<string, unknown> | undefined;
    const q = quotaFrom(usage, quota);
    if (q) setQuota(q);
    const text = data.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("پاسخ خالی بود.");
    return text;
  }, SHARED_NETWORK_ERROR);
}

/** وضعیت دستیار عمومی بدون مصرف سهمیه: راه‌اندازی شده؟ چند پیام مانده؟ */
export async function checkSharedAi(signal?: AbortSignal): Promise<{ ok: boolean; error?: string; quota?: AiQuota }> {
  const ep = sharedAiEndpoint();
  if (!ep) return { ok: false, error: "این نسخه از اپ دستیار عمومی ندارد." };
  try {
    const data = await withDeadline(25_000, signal, (inner) => sharedPost(ep, { action: "status" }, inner), SHARED_NETWORK_ERROR);
    const q = quotaFrom(data, quota);
    if (q) setQuota(q);
    return { ok: true, quota: q ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطای ناشناخته" };
  }
}

/** فعال‌کردن دستیار عمومی: اول وضعیت سرور چک می‌شود، بعد حالت ذخیره می‌شود. */
export async function enableSharedAi(signal?: AbortSignal): Promise<{ ok: boolean; error?: string; quota?: AiQuota }> {
  const result = await checkSharedAi(signal);
  if (result.ok) writeAiMode("shared");
  return result;
}

/** خاموش‌کردن دستیار عمومی؛ اگر کلید شخصی ذخیره باشد، همان فعال می‌شود. */
export function disableSharedAi(): void {
  if (loadAiMode() === "shared") writeAiMode(loadAiConfig() ? "personal" : null);
}

/** سوئیچ به کلید شخصیِ ذخیره‌شده (اگر هست). */
export function usePersonalAi(): boolean {
  if (!loadAiConfig()) return false;
  writeAiMode("personal");
  return true;
}

/** فقط برای تست: پاک‌کردن نشست ناشناس و سهمیهٔ کش‌شده */
export function __resetSharedAiForTest(): void {
  writeSession(null);
  quota = null;
}

// ---------- API مشترک برای همهٔ سازنده‌ها ----------

async function chatWith(provider: AiProvider, messages: AiChatMessage[], signal?: AbortSignal): Promise<string> {
  return provider.kind === "personal"
    ? chat(provider.config, messages, 45_000, signal)
    : sharedChat(provider.endpoint, messages, 60_000, signal);
}

/** Shared transport (personal key or public server). Opening the assistant never calls this automatically. */
export async function requestAiChat(messages: AiChatMessage[], signal?: AbortSignal): Promise<string> {
  const provider = activeAiProvider();
  if (!provider) throw new Error("دستیار هوشمند در تنظیمات وصل نشده است.");
  return chatWith(provider, messages, signal);
}

/** تست اتصالِ کلید شخصی با کمترین مصرف توکن */
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

export function buildCardPrompt(text: string, maxCards: number): AiChatMessage[] {
  return [
    {
      role: "system",
      content:
        "تو برای یک دانشجوی ایرانی از متنِ داده‌شده فلش‌کارت آموزشی می‌سازی. " +
        "خروجی را فقط به‌صورت یک آرایه‌ی JSON معتبر بده بدون هیچ توضیح اضافه: " +
        '[{"front":"سوال","back":"پاسخ"}] — حداکثر ' +
        maxCards +
        " کارت. سوال‌ها کوتاه و مشخص باشند (ترجیحاً یک نکته در هر کارت)، پاسخ‌ها دقیق و به فارسی. از متن بیرون نرو.",
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
  if (!aiConfigured()) throw new Error("دستیار هوشمند در تنظیمات وصل نشده است.");
  if (!text.trim()) throw new Error("متنی برای ساخت کارت داده نشده.");
  const raw = await requestAiChat(buildCardPrompt(text, maxCards));
  const cards = parseCardsResponse(raw);
  if (cards.length === 0) throw new Error("مدل خروجیِ قابل استفاده نداد؛ دوباره تلاش کن یا متن را کوتاه‌تر کن.");
  return cards.slice(0, maxCards);
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
  return requestAiChat(buildTutorPrompt(mistake));
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
  return requestAiChat(buildNarrativePrompt(context));
}
