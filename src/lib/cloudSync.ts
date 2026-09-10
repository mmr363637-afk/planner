// ===== همگام‌سازی ابریِ اختیاری — Supabase با REST مستقیم (بدون SDK) =====
// جدول تک‌سطری: id='main' | updated_at | device | data (jsonb)
// راه‌اندازی: اجرای SYNC_SETUP_SQL در SQL Editor سوپابیس + گذاشتن URL و anon key در تنظیمات.
import type { AppState, SyncSettings } from "../types";

export const SYNC_ROW_ID = "main";

export const SYNC_SETUP_SQL = `-- planner_state: جدول تک‌سطری سینک برنامه‌ریز مطالعه
create table if not exists planner_state (
  id text primary key,
  updated_at timestamptz not null default now(),
  device text,
  data jsonb not null
);
-- دسترسی با anon key (فقط همین جدول؛ RLS را ساده نگه می‌داریم):
alter table planner_state enable row level security;
drop policy if exists "anon full access" on planner_state;
create policy "anon full access" on planner_state for all using (true) with check (true);`;

export function deviceId(): string {
  try {
    const KEY = "planner-device-id";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "dev-web";
  }
}

function baseUrl(settings: SyncSettings): string {
  return settings.url.replace(/\/+$/, "");
}

function table(settings: SyncSettings): string {
  return (settings.table || "planner_state").trim() || "planner_state";
}

export function syncConfigured(settings: SyncSettings): boolean {
  return settings.provider === "supabase" && /^https?:\/\/.+/.test(settings.url.trim()) && settings.anonKey.trim().length > 10;
}

/** بدنه‌ی ارسالی: کل state بدون سشن فعال (سشن فعال دستگاه-محلی است) */
export function buildSyncData(state: AppState): Record<string, unknown> {
  const { activeSession: _active, ...rest } = state;
  void _active;
  return { ...(rest as unknown as Record<string, unknown>), activeSession: null };
}

export interface PushRequest {
  url: string;
  init: RequestInit;
}

/** درخواست upsert خالص — برای تست‌پذیری از fetch جدا شده */
export function buildPushRequest(settings: SyncSettings, state: AppState, device: string): PushRequest {
  const url = `${baseUrl(settings)}/rest/v1/${table(settings)}`;
  const body = JSON.stringify({
    id: SYNC_ROW_ID,
    updated_at: new Date().toISOString(),
    device,
    data: buildSyncData(state),
  });
  return {
    url,
    init: {
      method: "POST",
      headers: {
        apikey: settings.anonKey,
        Authorization: `Bearer ${settings.anonKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body,
    },
  };
}

export function buildPullRequest(settings: SyncSettings): PushRequest {
  const url = `${baseUrl(settings)}/rest/v1/${table(settings)}?id=eq.${SYNC_ROW_ID}&select=updated_at,device,data`;
  return {
    url,
    init: {
      method: "GET",
      headers: {
        apikey: settings.anonKey,
        Authorization: `Bearer ${settings.anonKey}`,
      },
    },
  };
}

export interface PulledState {
  updatedAt: string;
  device: string;
  data: unknown;
}

export function parsePullResponse(json: unknown): PulledState | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const row = json[0] as { updated_at?: unknown; device?: unknown; data?: unknown };
  if (!row || typeof row !== "object" || typeof row.updated_at !== "string" || row.data == null) return null;
  return { updatedAt: row.updated_at, device: typeof row.device === "string" ? row.device : "", data: row.data };
}

export async function pushState(settings: SyncSettings, state: AppState): Promise<void> {
  const { url, init } = buildPushRequest(settings, state, deviceId());
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`push ${res.status}`);
}

export async function pullState(settings: SyncSettings): Promise<PulledState | null> {
  const { url, init } = buildPullRequest(settings);
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`pull ${res.status}`);
  return parsePullResponse(await res.json());
}
