// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../types";
import { EMPTY_STATE } from "../stateIO";

// --- کلاینت ساختگی Supabase ---
const fake = {
  rpcCalls: [] as {name:string;args:any}[],
  revision: 0,
  rpcError: null as null | {message:string;code:string},
  session: null as null | { user: { id: string; email?: string; is_anonymous?: boolean } },
  anonError: null as null | { message: string; code?: string },
  upsertCalls: [] as { row: unknown; opts: unknown }[],
  upsertResult: { error: null as null | { message: string; code?: string } },
  selectRow: null as null | { state: unknown; updated_at: string },
  selectResult: { data: undefined as unknown, error: null as null | { message: string; code?: string } },
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (name:string,args:any) => {
      fake.rpcCalls.push({name,args});
      if(fake.rpcError) return {data:null,error:fake.rpcError};
      if(args.p_expected_revision !== fake.revision) return {data:null,error:{code:"P0001",message:"planner_conflict"}};
      fake.revision++;
      return {data:{revision:fake.revision,updated_at:new Date().toISOString()},error:null};
    },
    auth: {
      getSession: async () => ({ data: { session: fake.session }, error: null }),
      signInAnonymously: async () =>
        fake.anonError
          ? { data: { user: null }, error: fake.anonError }
          : { data: { user: { id: "u-anon", is_anonymous: true } }, error: null },
      signOut: async () => ({}),
      updateUser: async () => ({ data: {}, error: null }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      verifyOtp: async () => ({ data: { user: { id: "u-otp", email: "a@b.c" } }, error: null }),
    },
    from: () => ({
      upsert: async (row: unknown, opts: unknown) => {
        fake.upsertCalls.push({ row, opts });
        return { error: fake.upsertResult.error };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (fake.selectRow ? { data: fake.selectRow, error: null } : { data: null, error: null }),
        }),
      }),
    }),
  }),
  // بقیه‌ی exportهای نوع‌لازم برای runtime لازم نیست
}));

import {
  acknowledgeRemote,
  acceptedRevisionSettings,
  __resetSupabaseClientForTest,
  ensureSyncIdentity,
  fetchRemoteUpdatedAt,
  getSupabaseConfig,
  isRemoteNewer,
  isSupabaseConfigured,
  pushStateToCloud,
  pullStateFromCloud,
  isValidAnonKey,
  isValidSupabaseUrl,
  stripStateForCloud,
  getSupabaseClient,
} from "../supabaseSync";
import type { UserSettings } from "../../types";

const CFG = { url: "https://abc.supabase.co", anonKey: "x".repeat(100) };
const goodSettings = (supabase?: UserSettings["supabase"]): UserSettings => ({ ...EMPTY_SETTINGS, ...(supabase ? { supabase } : {}) });
const EMPTY_SETTINGS = EMPTY_STATE.settings;

beforeEach(() => {
  localStorage.clear(); fake.rpcCalls=[]; fake.revision=0; fake.rpcError=null;
  fake.session = null;
  fake.anonError = null;
  fake.upsertCalls = [];
  fake.upsertResult = { error: null };
  fake.selectRow = null;
  fake.selectResult = { data: undefined, error: null };
  __resetSupabaseClientForTest();
});

describe("پیکربندی Supabase", () => {
  it("آدرس و کلید معتبر را تشخیص می‌دهد", () => {
    expect(isValidSupabaseUrl("https://abc.supabase.co")).toBe(true);
    expect(isValidSupabaseUrl("http://abc.supabase.co")).toBe(false);
    expect(isValidSupabaseUrl("not a url")).toBe(false);
    expect(isValidAnonKey("x".repeat(100))).toBe(true);
    expect(isValidAnonKey("short")).toBe(false);
  });

  it("پیش‌فرض بیلد (کلیدهای کارگذاشته‌شده) همیشه مؤثره و تنظیمات کاربر بر آن پیشی می‌گیرد", () => {
    // بدون تنظیمات: کلیدهای پیش‌فرض بیلد اعمال می‌شوند — دوستان کاربر هیچ تنظیمی لازم ندارند
    expect(isSupabaseConfigured(EMPTY_SETTINGS)).toBe(true);
    expect(getSupabaseConfig(EMPTY_SETTINGS).url).toMatch(/^https:\/\/[a-z]+\.supabase\.co$/);
    // تنظیمات کاربر بر پیش‌فرض پیشی می‌گیرد (trim هم می‌شود)
    expect(getSupabaseConfig(goodSettings({ url: " https://abc.supabase.co ", anonKey: " " + "x".repeat(99) })).url).toBe("https://abc.supabase.co");
    // مقادیر نامعتبرِ کاربر (آدرس http یا کلید کوتاه) → نامعتبر
    expect(isSupabaseConfigured(goodSettings({ url: "http://abc.supabase.co", anonKey: "x".repeat(100) }))).toBe(false);
  });
});

describe("stripStateForCloud / isRemoteNewer", () => {
  it("جلسه‌ی فعال را از payload ابری حذف می‌کند (تایمر لحظه‌ای سینک نمی‌شود)", () => {
    const s: AppState = {
      ...EMPTY_STATE,
      activeSession: {
        topicId: "t1", mode: "free", phase: "work", cycle: 0, running: true,
        startedAt: 1, accumulatedMs: 0, totalStudyMs: 0, sessionStartedAt: 1,
      },
    };
    const clean = stripStateForCloud(s);
    expect(clean.activeSession).toBeNull();
    expect(s.activeSession).not.toBeNull(); // اصل دست نخورد
  });

  it("تازه‌بودن نسخه‌ی ابری فقط با زمان‌نگار سنجیده می‌شود", () => {
    expect(isRemoteNewer(1000, 500)).toBe(true);
    expect(isRemoteNewer(1000, 1000)).toBe(false);
    expect(isRemoteNewer(1000, 2000)).toBe(false);
    expect(isRemoteNewer(1000, undefined)).toBe(true);
    expect(isRemoteNewer(0, 500)).toBe(false);
  });
});

describe("ورود ناشناس", () => {
  it("اگر نشستی هست همان را برمی‌گرداند", async () => {
    fake.session = { user: { id: "u-old", email: "me@x.io" } };
    const id = await ensureSyncIdentity(getSupabaseClient(CFG));
    expect(id.userId).toBe("u-old");
    expect(id.email).toBe("me@x.io");
  });

  it("بدون نشست، ورود ناشناس می‌کند", async () => {
    const id = await ensureSyncIdentity(getSupabaseClient(CFG));
    expect(id.userId).toBe("u-anon");
    expect(id.isAnonymous).toBe(true);
  });

  it("خطای «ناشناس غیرفعال» را به فارسی راهنما تبدیل می‌کند", async () => {
    fake.anonError = { message: "Anonymous provider is disabled", code: "validation_failed" };
    await expect(ensureSyncIdentity(getSupabaseClient(CFG))).rejects.toThrow(/ورود ناشناس.*غیرفعال|فعال/i);
  });
});

describe("push/pull وضعیت", () => {
  it("push از RPC اتمیک استفاده می‌کند و activeSession نمی‌فرستد", async () => {
    const sb = getSupabaseClient(CFG);
    const s: AppState = {
      ...EMPTY_STATE,
      subjects: [{ id: "s1", name: "زیست", color: "#f00", priority: "high", createdAt: 1 }],
      activeSession: { topicId: null, mode: "free", phase: "work", cycle: 0, running: false, startedAt: null, accumulatedMs: 0, totalStudyMs: 0, sessionStartedAt: 1 },
    };
    const at = await pushStateToCloud(sb, "user-1", s);
    expect(at).toBeGreaterThan(0);
    expect(fake.upsertCalls).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].name).toBe("save_planner_state");
    expect(fake.rpcCalls[0].args.p_expected_revision).toBe(0);
    expect(fake.rpcCalls[0].args.p_state.activeSession).toBeNull();
    expect(fake.rpcCalls[0].args.p_state.subjects[0].id).toBe("s1");
    await pushStateToCloud(sb,"user-1",{...s,settings:{...s.settings,supabase:acceptedRevisionSettings(sb,"user-1")}});
    expect(fake.rpcCalls[1].args.p_expected_revision).toBe(1);
  });

  it("pull با سند خالی null برمی‌گرداند", async () => {
    const sb = getSupabaseClient(CFG);
    expect(await pullStateFromCloud(sb, "user-1")).toBeNull();
  });

  it("pull داده‌ی معتبر را با updatedAt برمی‌گرداند و parseStateText رد نمی‌کند", async () => {
    const state = { ...EMPTY_STATE, flashcards: [{ id: "c1", front: "ف", back: "ب", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2026-01-01", lapses: 0, createdAt: 1 }] };
    fake.selectRow = { state, updated_at: "2026-09-21T10:00:00Z" };
    const sb = getSupabaseClient(CFG);
    const snap = await pullStateFromCloud(sb, "user-1");
    expect(snap).not.toBeNull();
    expect(snap!.state.flashcards.length).toBe(1);
    expect(snap!.updatedAt).toBe(Date.parse("2026-09-21T10:00:00Z"));
  });

  it("pull داده‌ی نامعتبر ابری خطا می‌دهد (parseStateText null برگرداند)", async () => {
    fake.selectRow = { state: 42, updated_at: "2026-09-21T10:00:00Z" };
    const sb = getSupabaseClient(CFG);
    await expect(pullStateFromCloud(sb, "user-1")).rejects.toThrow();
  });

  it("fetchRemoteUpdatedAt فقط زمان‌نگار سبک را برمی‌گرداند (نه سند کامل)", async () => {
    const sb = getSupabaseClient(CFG);
    expect(await fetchRemoteUpdatedAt(sb, "user-1")).toBeNull();
    fake.selectRow = { state: {}, updated_at: "2026-09-21T10:00:00Z" };
    expect(await fetchRemoteUpdatedAt(sb, "user-1")).toBe(Date.parse("2026-09-21T10:00:00Z"));
  });
});

describe("safe sync conflicts",()=>{
  it("refuses to overwrite an unseen remote revision",async()=>{
    fake.revision=3;
    const sb=getSupabaseClient(CFG);
    await expect(pushStateToCloud(sb,"u",EMPTY_STATE)).rejects.toThrow("تعارض");
    expect(fake.revision).toBe(3);expect(fake.upsertCalls).toHaveLength(0);
    acknowledgeRemote(sb,"u",3);
    await pushStateToCloud(sb,"u",{...EMPTY_STATE,settings:{...EMPTY_STATE.settings,supabase:acceptedRevisionSettings(sb,"u")}});expect(fake.revision).toBe(4);
  });
  it("never falls back to unsafe upsert when migration is missing",async()=>{
    fake.rpcError={code:"PGRST202",message:"function missing"};
    await expect(pushStateToCloud(getSupabaseClient(CFG),"u",EMPTY_STATE)).rejects.toThrow("safe-sync.sql");
    expect(fake.upsertCalls).toHaveLength(0);
  });
  it("reading the cloud does not acknowledge or authorize overwriting it",async()=>{
    fake.revision=2;fake.selectRow={state:EMPTY_STATE,updated_at:new Date().toISOString()};
    const sb=getSupabaseClient(CFG);await pullStateFromCloud(sb,"u");
    await expect(pushStateToCloud(sb,"u",EMPTY_STATE)).rejects.toThrow("تعارض");
  });
});
