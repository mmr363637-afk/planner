// 📲 ثبت subscription پوش برای کاربرِ واردشده (anonymous یا ایمیل).
// Deploy: supabase functions deploy push-subscribe --no-verify-jwt
// (JWT توسط خودِ تابع با auth.getUser اعتبارسنجی می‌شود تا anon هم بتواند ثبت کند.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

    const sub = await req.json();
    if (!sub || typeof sub.endpoint !== "string" || !sub.keys?.p256dh || !sub.keys?.auth) {
      return json({ error: "invalid_subscription" }, 400);
    }
    // upsert دستی: insert یا جایگزینی (policy فقط insert/delete اجازه می‌دهد)
    await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    const { error } = await admin
      .from("push_subscriptions")
      .insert({ user_id: userData.user.id, endpoint: sub.endpoint, subscription: sub });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
