-- =====================================================================
-- 📲 اعلان واقعی (Web Push) برای «برنامه‌ریز مطالعه»
-- بعد از setup.sql و safe-sync.sql، این فایل را یک‌بار در SQL Editor اجرا کن.
--
-- سپس (در ترمینال، یک‌بار):
--   supabase functions deploy push-subscribe --no-verify-jwt
--   supabase functions deploy push-unsubscribe --no-verify-jwt
--   supabase functions deploy push-send
--   supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:you@example.com"
-- (کلیدهای VAPID را با `npx web-push generate-vapid-keys` بساز)
--
-- زمان‌بندی ارسال (مثلاً یادآور صبحگاهی ۰۸:۰۰ به وقت تهران = ۰۴:۳۰ UTC):
--   select cron.schedule('planner-morning-push', '30 4 * * *',
--     $$ select net.http_post(
--          url := 'https://<ref>.supabase.co/functions/v1/push-send',
--          headers := '{"Authorization":"Bearer <service-role-key>","Content-Type":"application/json"}'::jsonb,
--          body := '{"kind":"morning"}'::jsonb
--        ) $$);
-- =====================================================================

create table if not exists public.push_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text primary key,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- هر کاربر فقط subscriptionهای خودش را می‌بیند/می‌سازد/پاک می‌کند
drop policy if exists "push_select_own" on public.push_subscriptions;
create policy "push_select_own" on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own" on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own" on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

-- ارسال فقط از Edge Function با service-role انجام می‌شود (نه از مرورگر)
revoke update on public.push_subscriptions from anon, authenticated;
