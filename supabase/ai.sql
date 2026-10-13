-- =====================================================================
-- 🤖 دستیار عمومی (Shared AI) برای «برنامه‌ریز مطالعه»
-- کلید مدل زبانی فقط روی سرور (secret تابع ai-chat) می‌ماند؛ این فایل فقط
-- «شمارندهٔ سهمیه» را می‌سازد تا هر کاربر سقف روزانه داشته باشد و کل مصرف
-- روزانه هم سقف داشته باشد (محافظ کیف پول سازنده).
--
-- بعد از setup.sql (و در صورت استفاده از پوش، push.sql) این فایل را یک‌بار در
-- SQL Editor اجرا کن. سپس (در ترمینال، یک‌بار):
--
--   supabase functions deploy ai-chat --no-verify-jwt
--   supabase secrets set \
--     AI_UPSTREAM_URL="https://openrouter.ai/api/v1" \
--     AI_UPSTREAM_KEY="sk-or-..." \
--     AI_MODEL="openai/gpt-4o-mini" \
--     AI_DAILY_LIMIT="30" \
--     AI_GLOBAL_DAILY_LIMIT="1500" \
--     AI_ALLOWED_ORIGINS="https://mmr363637-afk.github.io"
--
-- پیش‌نیاز: Authentication → Sign In / Providers → Anonymous Sign-Ins = ON
-- (برای سینک ابری هم همین لازم بود). هویت ناشناس فقط برای شمردن سهمیه است.
--
-- پاک‌سازی (اختیاری، با pg_cron):
--   select cron.schedule('planner-ai-usage-gc', '15 1 * * *',
--     $$ delete from public.ai_usage where day < current_date - 14 $$);
-- =====================================================================

create table if not exists public.ai_usage (
  user_id    uuid        not null,          -- auth.users.id یا شناسهٔ صفر برای شمارندهٔ کلی
  day        date        not null,          -- روز به وقت تهران
  count      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- هیچ‌کس از مرورگر به این جدول نمی‌رسد؛ فقط Edge Function با service-role.
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- ---------------------------------------------------------------------
-- consume_ai_quota: یک پیام از سهمیهٔ امروزِ کاربر (و شمارندهٔ کلی) کم می‌کند.
--   p_limit        سقف روزانهٔ هر کاربر
--   p_global_limit سقف روزانهٔ کلِ همهٔ کاربران (null = بدون سقف کلی)
--   p_dry_run      فقط گزارش بده، چیزی مصرف نکن (برای نمایش «n از m» در تنظیمات)
-- خروجی: {allowed, used, limit, reset_at, reason?}
-- اتمیک است: ردیف‌ها با FOR UPDATE قفل می‌شوند تا دو درخواست هم‌زمان از سقف رد نشوند.
-- ---------------------------------------------------------------------
create or replace function public.consume_ai_quota(
  p_user_id      uuid,
  p_limit        integer,
  p_global_limit integer default null,
  p_dry_run      boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz        constant text := 'Asia/Tehran';
  v_global_id constant uuid := '00000000-0000-0000-0000-000000000000';
  v_day       date := (now() at time zone v_tz)::date;
  v_reset     timestamptz;
  v_used      integer := 0;
  v_global    integer := 0;
begin
  if p_user_id is null or p_user_id = v_global_id then
    raise exception 'invalid user id';
  end if;
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid limit';
  end if;
  v_reset := ((v_day + 1)::timestamp at time zone v_tz);

  -- ترتیب قفل ثابت (اول کلی، بعد کاربر) تا بن‌بست پیش نیاید
  if p_global_limit is not null then
    insert into public.ai_usage (user_id, day, count) values (v_global_id, v_day, 0)
      on conflict (user_id, day) do nothing;
    select count into v_global from public.ai_usage
      where user_id = v_global_id and day = v_day for update;
  end if;

  insert into public.ai_usage (user_id, day, count) values (p_user_id, v_day, 0)
    on conflict (user_id, day) do nothing;
  select count into v_used from public.ai_usage
    where user_id = p_user_id and day = v_day for update;

  if v_used >= p_limit then
    return jsonb_build_object('allowed', false, 'reason', 'user',
      'used', v_used, 'limit', p_limit, 'reset_at', v_reset);
  end if;
  if p_global_limit is not null and v_global >= p_global_limit then
    return jsonb_build_object('allowed', false, 'reason', 'global',
      'used', v_used, 'limit', p_limit, 'reset_at', v_reset);
  end if;
  if p_dry_run then
    return jsonb_build_object('allowed', true,
      'used', v_used, 'limit', p_limit, 'reset_at', v_reset);
  end if;

  update public.ai_usage set count = count + 1, updated_at = now()
    where user_id = p_user_id and day = v_day
    returning count into v_used;
  if p_global_limit is not null then
    update public.ai_usage set count = count + 1, updated_at = now()
      where user_id = v_global_id and day = v_day;
  end if;

  return jsonb_build_object('allowed', true,
    'used', v_used, 'limit', p_limit, 'reset_at', v_reset);
end;
$$;

-- ---------------------------------------------------------------------
-- refund_ai_quota: اگر سرویس مدل جواب نداد، پیامِ مصرف‌شده برگردانده می‌شود
-- (تا خطای سرویس از سهمیهٔ کاربر کم نکند).
-- ---------------------------------------------------------------------
create or replace function public.refund_ai_quota(
  p_user_id      uuid,
  p_track_global boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz        constant text := 'Asia/Tehran';
  v_global_id constant uuid := '00000000-0000-0000-0000-000000000000';
  v_day       date := (now() at time zone v_tz)::date;
begin
  update public.ai_usage set count = greatest(0, count - 1), updated_at = now()
    where user_id = p_user_id and day = v_day;
  if p_track_global then
    update public.ai_usage set count = greatest(0, count - 1), updated_at = now()
      where user_id = v_global_id and day = v_day;
  end if;
end;
$$;

-- فقط service-role (Edge Function) اجازهٔ اجرا دارد؛ از مرورگر قابل فراخوانی نیست.
revoke all on function public.consume_ai_quota(uuid, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.refund_ai_quota(uuid, boolean) from public, anon, authenticated;
