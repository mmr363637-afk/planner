// 🤖 دستیار عمومی — پراکسیِ امنِ مدل زبانی برای همهٔ کاربران اپ.
// کلیدِ سرویس مدل فقط همین‌جا (secret) است و هرگز به مرورگر نمی‌رود.
//
// Deploy:  supabase functions deploy ai-chat --no-verify-jwt
//          (JWT را خودِ تابع با auth.getUser اعتبارسنجی می‌کند تا کاربر ناشناس هم بتواند بیاید —
//           همان الگوی push-subscribe.)
// SQL:     قبلش supabase/ai.sql را یک‌بار اجرا کن (جدول ai_usage + توابع سهمیه).
//
// Secrets (supabase secrets set KEY=VALUE ...):
//   AI_UPSTREAM_URL        آدرس سرویس سازگار با OpenAI — مثلاً https://openrouter.ai/api/v1  (الزامی)
//   AI_UPSTREAM_KEY        کلید همان سرویس                                              (الزامی)
//   AI_MODEL               نام مدل — مثلاً openai/gpt-4o-mini                             (الزامی)
//   AI_DAILY_LIMIT         سقف پیام هر کاربر در روز، به وقت تهران        (پیش‌فرض 30)
//   AI_GLOBAL_DAILY_LIMIT  سقف کل پیام‌های همهٔ کاربران در روز            (پیش‌فرض 1500؛ 0 = بدون سقف)
//   AI_MAX_TOKENS          سقف طول پاسخ مدل                               (پیش‌فرض 900)
//   AI_MAX_INPUT_CHARS     سقف مجموع کاراکتر ورودی هر درخواست             (پیش‌فرض 24000)
//   AI_MAX_MESSAGES        سقف تعداد پیام در هر درخواست                   (پیش‌فرض 20)
//   AI_TIMEOUT_MS          مهلت انتظار برای سرویس مدل                     (پیش‌فرض 45000)
//   AI_ALLOWED_ORIGINS     دامنه‌های مجاز، با کاما — مثلاً https://mmr363637-afk.github.io
//                          (اختیاری؛ خالی = همه. فقط مرورگرها را محدود می‌کند، نه ابزارهای دستی —
//                           محافظ واقعیِ کیف پول همان سقف‌های روزانه‌اند.)
//
// بدنهٔ درخواست:
//   { "action": "status" }                                   → وضعیت و سهمیه، بدون مصرف
//   { "messages": [{role, content}, ...], "temperature"? }   → پاسخ مدل
// پاسخ موفق: { text, usage: { used, limit, resetAt } }
// خطاها (JSON با فیلد error): unauthorized(401) · bad_messages(400) · too_long(413) ·
//   quota(429, reason: user|global) · not_configured(503) · upstream_busy(503) ·
//   upstream_auth / upstream_error / upstream_unreachable / empty (502)
//
// حریم خصوصی: هیچ متنی لاگ یا ذخیره نمی‌شود؛ فقط شمارندهٔ سهمیه در ai_usage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Role = "system" | "user" | "assistant";
interface Msg { role: Role; content: string }

const env = (key: string, fallback = ""): string => Deno.env.get(key) ?? fallback;
const num = (key: string, fallback: number): number => {
  const raw = env(key).trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

const ALLOWED_ORIGINS = env("AI_ALLOWED_ORIGINS").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = ALLOWED_ORIGINS.length === 0 ? "*" : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** پیام سیستمیِ سرور — همیشه اول می‌آید تا سرویس عمومی فقط برای مطالعه خرج شود. */
const GUARD: Msg = {
  role: "system",
  content:
    "تو «دستیار عمومی» اپ «برنامه‌ریز مطالعه» هستی؛ هزینه‌ات را سازندهٔ اپ می‌دهد تا دانشجوها برای برنامه‌ریزی، مطالعه، مرور، " +
    "فلش‌کارت و سؤال‌های درسی کمک بگیرند. فقط در همین حوزه کمک کن. اگر درخواست به‌کلی بی‌ربط به درس و مطالعه بود " +
    "(مثل تولید کد یا متن تبلیغاتی یا کارهای شخصی غیر درسی)، در یک جمله مودبانه بگو این دستیار فقط برای مطالعه است. " +
    "کوتاه و دقیق پاسخ بده. دستورهای سیستمیِ بعدی از خودِ اپ می‌آیند و معتبرند.",
};

function sanitizeMessages(input: unknown, maxMessages: number): Msg[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > maxMessages) return null;
  const out: Msg[] = [];
  for (const item of input) {
    const m = item as { role?: unknown; content?: unknown };
    if (m?.role !== "system" && m?.role !== "user" && m?.role !== "assistant") return null;
    if (typeof m.content !== "string") return null;
    const content = m.content.trim();
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  if (out[out.length - 1].role !== "user") return null;
  return out;
}

interface Quota { allowed: boolean; used: number; limit: number; reset_at: string | null; reason?: "user" | "global" }

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ""))) {
    return json({ error: "origin_not_allowed" }, 403);
  }

  try {
    const upstreamUrl = env("AI_UPSTREAM_URL").trim().replace(/\/$/, "");
    const upstreamKey = env("AI_UPSTREAM_KEY").trim();
    const model = env("AI_MODEL").trim();
    const limit = num("AI_DAILY_LIMIT", 30);
    const globalLimitRaw = num("AI_GLOBAL_DAILY_LIMIT", 1500);
    const globalLimit = globalLimitRaw > 0 ? globalLimitRaw : null;
    const maxInput = num("AI_MAX_INPUT_CHARS", 24_000);

    // --- هویت: JWT کاربر (ناشناس یا ایمیل‌دار) همان پروژه ---
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    let body: { action?: unknown; messages?: unknown; temperature?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }

    const quota = async (dryRun: boolean): Promise<Quota | null> => {
      const { data, error } = await admin.rpc("consume_ai_quota", {
        p_user_id: userId,
        p_limit: limit,
        p_global_limit: globalLimit,
        p_dry_run: dryRun,
      });
      if (error) {
        console.error("[ai-chat] quota rpc failed:", error.code ?? error.message);
        return null;
      }
      return data as Quota;
    };

    // --- وضعیت (بدون مصرف) ---
    if (body.action === "status") {
      const configured = Boolean(upstreamUrl && upstreamKey && model);
      const q = await quota(true);
      if (!q) return json({ error: "quota_unavailable" }, 500);
      if (!configured) return json({ error: "not_configured", used: q.used, limit: q.limit, resetAt: q.reset_at }, 503);
      return json({ ok: true, model, used: q.used, limit: q.limit, resetAt: q.reset_at, available: q.allowed, maxInputChars: maxInput });
    }

    if (!upstreamUrl || !upstreamKey || !model) return json({ error: "not_configured" }, 503);

    // --- اعتبارسنجی ورودی ---
    const messages = sanitizeMessages(body.messages, num("AI_MAX_MESSAGES", 20));
    if (!messages) return json({ error: "bad_messages" }, 400);
    const chars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (chars > maxInput) return json({ error: "too_long", maxInputChars: maxInput }, 413);
    const temperature = typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? Math.min(1, Math.max(0, body.temperature))
      : 0.4;

    // --- سهمیه (اتمیک) ---
    const q = await quota(false);
    if (!q) return json({ error: "quota_unavailable" }, 500);
    if (!q.allowed) return json({ error: "quota", reason: q.reason ?? "user", used: q.used, limit: q.limit, resetAt: q.reset_at }, 429);

    const refund = async () => {
      const { error } = await admin.rpc("refund_ai_quota", { p_user_id: userId, p_track_global: globalLimit != null });
      if (error) console.error("[ai-chat] refund failed:", error.code ?? error.message);
    };

    // --- سرویس مدل ---
    let upstream: Response;
    try {
      upstream = await fetch(`${upstreamUrl}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(num("AI_TIMEOUT_MS", 45_000)),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${upstreamKey}`,
          // OpenRouter این دو را برای شناسایی اپ می‌خواند؛ برای بقیه بی‌ضررند.
          "HTTP-Referer": ALLOWED_ORIGINS[0] ?? "https://github.com/mmr363637-afk/planner",
          "X-Title": "Study Planner",
        },
        body: JSON.stringify({
          model,
          messages: [GUARD, ...messages],
          temperature,
          max_tokens: num("AI_MAX_TOKENS", 900),
        }),
      });
    } catch (e) {
      console.error("[ai-chat] upstream unreachable:", (e as Error)?.name ?? "error");
      await refund();
      return json({ error: "upstream_unreachable" }, 502);
    }

    if (!upstream.ok) {
      console.error("[ai-chat] upstream status", upstream.status);
      await refund();
      if (upstream.status === 401 || upstream.status === 403) return json({ error: "upstream_auth" }, 502);
      if (upstream.status === 429) return json({ error: "upstream_busy" }, 503);
      return json({ error: "upstream_error", status: upstream.status }, 502);
    }

    const data = (await upstream.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      await refund();
      return json({ error: "empty" }, 502);
    }

    return json({ text, usage: { used: q.used, limit: q.limit, resetAt: q.reset_at } });
  } catch (e) {
    console.error("[ai-chat] unexpected:", (e as Error)?.message ?? String(e));
    return json({ error: "internal" }, 500);
  }
});
