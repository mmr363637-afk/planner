// 📲 ارسال پوش به همه‌ی مشترکین (فراخوانی فقط با service-role key — مثلاً از pg_cron).
// Deploy: supabase functions deploy push-send
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:...
//
// بدنه‌ی درخواست (اختیاری): { "kind": "morning" | "generic", "title": "...", "body": "...", "url": "?page=..." }
// kind=morning → متن پیش‌فرض یادآور صبحگاهی با جمله‌ی روز (بدون داده‌ی شخصی —
// اپ هیچ محتوایی از کاربر را روی سرور نگه نمی‌دارد؛ فقط endpointها).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.4";

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
      return json({ error: "forbidden" }, 403);
    }
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:owner@example.com";
    if (!vapidPublic || !vapidPrivate) return json({ error: "vapid_not_configured" }, 500);
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    let body: { kind?: string; title?: string; body?: string; url?: string } = {};
    try {
      body = await req.json();
    } catch {
      /* body اختیاری است */
    }
    const payload = {
      title: body.title ?? "صبح بخیر ☀️",
      body:
        body.body ??
        "امروز هم یک قدم کوچک جلوتر از دیروز — برنامه‌ات منتظرته. (برای مرورهای امروز تپ کن)",
      tag: body.kind ?? "morning",
      url: body.url ?? "?page=home",
    };

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: subs, error } = await admin.from("push_subscriptions").select("endpoint,subscription");
    if (error) return json({ error: error.message }, 500);

    let sent = 0;
    let dropped = 0;
    for (const row of subs ?? []) {
      try {
        await webpush.sendNotification(row.subscription as webpush.PushSubscription, JSON.stringify(payload));
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          // اشتراک مرده (کاربر پاک کرده/مرورگر انداخته) — پاکش کن
          await admin.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
          dropped += 1;
        }
      }
    }
    return json({ ok: true, sent, dropped, total: subs?.length ?? 0 });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
