import { setSyncStatus } from "./syncStatus";
// ===== ماژول همگام‌سازی ابری با Supabase =====
// مدل امنیت: پروژه‌ی Supabase خودِ کاربر است؛ ما فقط کلاینت هستیم.
// - ورود «ناشناس خودکار»: با اولین باز شدنِ کارت سینک، یک شناسه‌ی ناشناس ساخته
//   می‌شود (Anonymous Sign-In) — بدون هیچ اصطکاک ورود. سینک فوراً کار می‌کند.
// - «اتصال ایمیل» (اختیاری): همان حساب ناشناس به ایمیل کاربر وصل می‌شود تا
//   روی دستگاه‌های دیگر هم با کد یک‌بارمصرف (OTP) وارد شود و داده‌ها برگردد.
// - داده: کل وضعیت اپ به‌صورت یک سند JSONB در جدول user_states ذخیره می‌شود و
//   RLS تضمین می‌کند هر کاربر فقط سند خودش را ببیند. هیچ سرور واسط دیگری در کار نیست.
// - تعارض: compare-and-swap اتمیک روی سرور. نسخهٔ پایه همراه وضعیت محلی است، نه یک کلید مشترک بین تب‌ها.
//   خواندن ابر، مجوز بازنویسی نیست؛ فقط پذیرش صریح یا ارسال موفق نسخهٔ پایه را جلو می‌برد.
//
// توجه: anon key عمومی است و در باندل آپلودشده دیده می‌شود؛ امنیت با RLS اعمال می‌شود.

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { parseStateText } from "./stateIO";
import type { AppState, UserSettings } from "../types";

/** پیش‌فرض‌های بیلد — پروژه‌ی کاربر. با VITE_SUPABASE_URL/ANON_KEY قابل‌بازنویسی است.
 * anon key ذاتاً عمومی است (در هر کلاینتی دیده می‌شود)؛ امنیت با RLS جدول اعمال می‌شود. */
const DEFAULT_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  "https://qylxqzzuzwwbhwglxhme.supabase.co";
const DEFAULT_ANON_KEY: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5bHhxenp1end3Ymh3Z2x4aG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5OTgxNTQsImV4cCI6MjEwNTU3NDE1NH0.uFfTOFXzENwQPfk1QmgOtnu3KYMIzI0CJZdaqC1ofUI";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** اعتبار حداقلیِ آدرس پروژه‌ی Supabase (بدون فراخوانی شبکه) */
export function isValidSupabaseUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** اعتبار حداقلی anon key — معمولاً JWT(سه‌بخشی) و به‌اندازه‌ی کافی بلند */
export function isValidAnonKey(key: string): boolean {
  const k = key.trim();
  return k.length >= 80 && !/\s/.test(k);
}

/** خواندن پیکربندی مؤثر: تنظیمات کاربر در اولویت، بعد پیش‌فرض بیلد */
export function getSupabaseConfig(settings: UserSettings | undefined): SupabaseConfig {
  const url = (settings?.supabase?.url ?? "").trim() || DEFAULT_URL.trim();
  const anonKey = (settings?.supabase?.anonKey ?? "").trim() || DEFAULT_ANON_KEY.trim();
  return { url, anonKey };
}

export function isSupabaseConfigured(settings: UserSettings | undefined): boolean {
  const { url, anonKey } = getSupabaseConfig(settings);
  return isValidSupabaseUrl(url) && isValidAnonKey(anonKey);
}

/**
 * اتصالِ خودکار (ساخت شناسه‌ی ناشناس / سینک پس‌زمینه) فقط در رانتایم واقعی مرورگر —
 * هرگز در تست‌ها (vitest) به پروژه‌ی واقعی درخواست نزن و کاربر ناشناسِ آشغال نساز.
 */
export function shouldAutoConnect(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test" ? false : true;
}

// ---------- کلاینت تک‌نمونه (با توجه به تغییر پیکربندی) ----------

let client: SupabaseClient | null = null;
let clientKey = "";
const clientScopes = new WeakMap<object, string>();
const revisions = new Map<string, number>();
const writing = new Set<string>();
export const syncScope = (sb: SupabaseClient, userId: string) => `planner-sync-revision:${clientScopes.get(sb) ?? "unknown"}:${userId}`;
export function acceptedRevisionSettings(sb: SupabaseClient, userId: string) {
  return { baseRevision: revisions.get(syncScope(sb,userId)) ?? 0, baseUserId: userId, baseProject: clientScopes.get(sb) ?? "unknown" };
}
export function acknowledgeRemote(sb: SupabaseClient, userId: string, revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("نسخهٔ ابری معتبر نیست.");
  const key = syncScope(sb,userId); revisions.set(key,revision);
  setSyncStatus({scope:key,phase:"saved",message:"نسخهٔ تأییدشدهٔ ابر ثبت شد.",at:Date.now()});
}

export function getSupabaseClient(cfg: SupabaseConfig): SupabaseClient {
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (client && clientKey === key) return client;
  client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  clientScopes.set(client, cfg.url);
  clientKey = key;
  return client;
}

/** فقط برای تست: ریست کامل کش کلاینت */
export function __resetSupabaseClientForTest(): void {
  revisions.clear(); writing.clear();

  client = null;
  clientKey = "";
}

// ---------- وضعیت ورود ----------

export interface SyncIdentity {
  userId: string;
  /** ناشناس (بدون ایمیل) یا دارای ایمیل */
  email?: string;
  isAnonymous: boolean;
}

/**
 * اگر نشستی هست همان را می‌دهد؛ وگرنه «ورود ناشناس» انجام می‌شود.
 * نیازمند فعال بودن Anonymous Sign-Ins در داشبورد Supabase (یک کلیک).
 */
export async function ensureSyncIdentity(sb: SupabaseClient): Promise<SyncIdentity> {
  const { data: sessionData, error: sessErr } = await sb.auth.getSession();
  const existing = sessionData?.session?.user;
  if (existing && !sessErr) return toIdentity(existing);
  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(toFaAuthError(error) ?? "ورود ناشناس ناموفق بود. Anonymous Sign-In را در داشبورد Supabase فعال کنید.");
  }
  return toIdentity(data.user);
}

function toIdentity(u: User): SyncIdentity {
  return { userId: u.id, email: u.email || undefined, isAnonymous: u.is_anonymous !== false && !u.email };
}

function toFaAuthError(error: { message?: string; code?: string } | null): string | null {
  if (!error?.message) return null;
  const m = error.message;
  if (/anonymous/i.test(m) && /disabled|not enabled|provider/i.test(m)) {
    return "ورود ناشناس در پروژه‌ی Supabase غیرفعال است؛ از داشبورد → Authentication → Sign In / Providers آن را روشن کنید.";
  }
  if (/rate limit/i.test(m)) return "محدودیت نرخ Supabase — چند دقیقه بعد دوباره تلاش کنید.";
  return m;
}

/**
 * اتصال ایمیل به همان حساب ناشناس فعلی (برای تبدیل به حساب دائمی و ورود روی دستگاه‌های دیگر).
 * ایمیل تأیید برای کاربر فرستاده می‌شود.
 */
export async function linkEmailToIdentity(sb: SupabaseClient, email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("ایمیل معتبر نیست.");
  const { error } = await sb.auth.updateUser({ email: clean });
  if (error) throw new Error(toFaAuthError(error) ?? "ارسال ایمیل تأیید ناموفق بود.");
}

/** روی دستگاه تازه: ورود با ایمیل (کد یک‌بارمصرف به ایمیل می‌آید — بدون نیاز به ریدایرکت) */
export async function sendEmailOtp(sb: SupabaseClient, email: string): Promise<void> {
  const clean = email.trim();
  const { error } = await sb.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
  if (error) throw new Error(toFaAuthError(error) ?? "ارسال کد به ایمیل ناموفق بود.");
}

export async function verifyEmailOtp(sb: SupabaseClient, email: string, token: string): Promise<SyncIdentity> {
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" });
  if (error || !data.user) throw new Error("کد واردشده درست نیست یا منقضی شده است.");
  return toIdentity(data.user);
}

export async function signOutSync(sb: SupabaseClient): Promise<void> {
  try {
    await sb.auth.signOut();
  } catch {
    /* خروج محلی در هر حال انجام می‌شود */
  }
}

// ---------- ذخیره/بازیابی وضعیت ----------

/** آماده‌سازی وضعیت برای ابر: بدون جلسه‌ی فعال (تایمر لحظه‌ای بین دستگاه‌ها سینک نمی‌شود) */
export function stripStateForCloud(state: AppState): AppState {
  const supabase = state.settings.supabase ? { ...state.settings.supabase } : undefined;
  if (supabase) { delete supabase.baseRevision; delete supabase.baseUserId; delete supabase.baseProject; }
  const result = { ...state, settings: { ...state.settings, supabase }, activeSession: null };
  delete (result as typeof result & { _localSavedAt?: number })._localSavedAt;
  return result;
}

export interface RemoteSnapshot {
  state: AppState;
  revision: number;
  updatedAt: number; // ms epoch
}

/** ذخیرهٔ اتمیک کل وضعیت فقط با نسخهٔ پایهٔ همان دستگاه (CAS). */
export async function pushStateToCloud(sb: SupabaseClient, userId: string, state: AppState): Promise<number> {
  const key = syncScope(sb,userId);
  if (writing.has(key)) throw new Error("یک همگام‌سازی در جریان است؛ چند لحظه بعد تلاش کن.");
  writing.add(key);
  setSyncStatus({scope:key,phase:"saving",message:"در حال ذخیره با بررسی نسخهٔ ابر…"});
  try {
    const { data, error } = await sb.rpc("save_planner_state", {
      p_expected_revision: state.settings.supabase?.baseUserId === userId && state.settings.supabase?.baseProject === clientScopes.get(sb) ? state.settings.supabase.baseRevision ?? 0 : 0,
      p_state: stripStateForCloud(state),
    });
    if (error) {
      if (error.code === "P0001" && error.message.includes("planner_conflict")) {
        setSyncStatus({scope:key,phase:"conflict",message:"نسخهٔ ابر تغییر کرده است؛ ارسال متوقف شد. ابتدا نسخه‌ها را مقایسه و یکی را با تأیید انتخاب کن."});
        throw new Error("تعارض نسخه‌ها: اطلاعات هیچ دستگاهی بازنویسی نشد. ابتدا «مقایسه و دریافت از ابر» را بزن.");
      }
      throw new Error(error.code === "PGRST202" || error.code === "42883"
        ? "به‌روزرسانی امنِ سرور لازم است: فایل supabase/safe-sync.sql باید در پروژه اجرا شود. ارسال ناامن انجام نمی‌دهیم."
        : toFaAuthError(error) ?? `ذخیرهٔ ابری ناموفق بود (${error.code ?? "شبکه"})`);
    }
    const revision = Number(data?.revision), at = Date.parse(data?.updated_at ?? "");
    if (!Number.isSafeInteger(revision) || revision <= 0 || !Number.isFinite(at)) throw new Error("پاسخ نسخهٔ ابری نامعتبر بود؛ دوباره دریافت کن.");
    acknowledgeRemote(sb,userId,revision);
    setSyncStatus({scope:key,phase:"saved",message:"نسخهٔ ابری با کنترل تعارض ذخیره شد.",at});
    return at;
  } catch (e) {
    const message = e instanceof Error ? e.message : "ارتباط با ابر ناموفق بود.";
    if (!message.startsWith("تعارض نسخه‌ها")) setSyncStatus({scope:key,phase:"error",message});
    throw e;
  } finally { writing.delete(key); }
}

/** خواندن وضعیت از ابر — اگر سندی نباشد null */
export async function pullStateFromCloud(sb: SupabaseClient, userId: string): Promise<RemoteSnapshot | null> {
  const { data, error } = await sb
    .from("user_states")
    .select("state, updated_at, revision")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(toFaAuthError(error) ?? `خطای خواندن از ابر (${error.code ?? "؟"})`);
  if (!data) return null;
  const parsed = parseStateText(JSON.stringify((data as { state: unknown }).state));
  if (!parsed) throw new Error("داده‌ی ابری معتبر نیست (پارس نشد).");
  const updatedAt = Date.parse((data as { updated_at?: string }).updated_at ?? "") || 0;
  return { state: parsed, updatedAt, revision: Number((data as {revision?:number}).revision ?? 0) };
}

/**
 * آیا نسخه‌ی ابری تازه‌تر از آخرین چیزی است که این دستگاه دیده؟
 * ملاک: updated_at سند ابری > آخرین زمان دیده‌شده/سینک‌شده‌ی محلی.
 */
export function isRemoteNewer(remoteUpdatedAt: number, localLastSeen: number | undefined): boolean {
  if (!remoteUpdatedAt) return false;
  return remoteUpdatedAt > (localLastSeen ?? 0);
}

/**
 * ⚡ چکِ سبکِ «نسخه‌ی ابری تازه‌تر است؟» — فقط زمان‌نگار را می‌خواند.
 * دانلودِ سندِ کامل برای هر چک، در مقیاس ~۵۰ کاربر، ترافیک خروجی (egress) را هدر می‌داد.
 */
export async function fetchRemoteUpdatedAt(sb: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await sb
    .from("user_states")
    .select("updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null; // چکِ پس‌زمینه هرگز اپ را نباید متوقف کند
  if (!data) return null;
  return Date.parse((data as { updated_at?: string }).updated_at ?? "") || null;
}
