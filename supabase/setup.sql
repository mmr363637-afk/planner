-- =====================================================================
-- راه‌اندازی همگام‌سازی ابری «برنامه‌ریز مطالعه» با Supabase
-- این اسکریپت را یک‌بار در داشبورد Supabase اجرا کن:
--   Dashboard → SQL Editor → New query → کپی این فایل → Run
-- سپس:
--   Dashboard → Authentication → Sign In / Up → Anonymous Sign-Ins = ON
--   Dashboard → Project Settings → API → «Project URL» و «anon public»
--   را در تنظیمات اپ (بخش داده‌ها → همگام‌سازی ابری) وارد کن.
-- امنیت: RLS تضمین می‌کند هر کاربر فقط سندِ خودش را ببیند/بنویسد. anon key
-- عمومی است و بدون این سیاست‌ها خطرناک بود — پس Policyها را حذف نکن!
-- =====================================================================

-- جدول وضعیت کاربران: هر کاربر دقیقاً یک سند JSONB (وضعیت کامل اپ)
create table if not exists public.user_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- ستون updated_at برای مقایسه‌ی «نسخه‌ی ابری تازه‌تر است؟» سمت کلاینت سودمند است
create index if not exists user_states_updated_at_idx on public.user_states (updated_at);

-- RLS را روشن کن — بدون این، هیچ‌کس (حتی با anon key) دسترسی ندارد و با
-- فعال‌سازی Policyهای زیر، هر کاربر فقط به سند خودش می‌رسد.
alter table public.user_states enable row level security;

-- خواندنِ سندِ خودی
drop policy if exists "user_states_select_own" on public.user_states;
create policy "user_states_select_own"
  on public.user_states for select
  to authenticated
  using (auth.uid() = user_id);

-- ساختِ سندِ خودی
drop policy if exists "user_states_insert_own" on public.user_states;
create policy "user_states_insert_own"
  on public.user_states for insert
  to authenticated
  with check (auth.uid() = user_id);

-- به‌روزرسانیِ سندِ خودی
drop policy if exists "user_states_update_own" on public.user_states;
create policy "user_states_update_own"
  on public.user_states for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- حذفِ سندِ خودی (برای «خروج و پاک‌سازی» در آینده — ضروری نیست اما بی‌خطر)
drop policy if exists "user_states_delete_own" on public.user_states;
create policy "user_states_delete_own"
  on public.user_states for delete
  to authenticated
  using (auth.uid() = user_id);

-- =====================================================================
-- اختیاری ولی توصیه‌شده: تبدیل خودکار کاربرهای ناشناسِ بلااستفاده
-- (Supabase پروژه‌های رایگان را هم با این حجم راحت تحمل می‌کند؛
--  سقف عملی: ۵۰۰ مگابایت دیتابیس — هر سند معمولاً چند صد کیلوبایت است)
-- نکته‌ی ایمیل: برای کارکردن «کد یک‌بارمصرف»، قالب ایمیل OTP باید شامل
-- {{ .Token }} باشد (پیش‌فرض Supabase شامل است).
-- =====================================================================
