// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../../types";
import { EMPTY_STATE } from "../stateIO";

// --- کلاینت ساختگی Supabase ---
const fake = {
  session: null as null | { user: { id: string; email?: string; is_anonymous?: boolean } },
  anonError: null as null | { message: string; code?: string },
  upsertCalls: [] as { row: unknown; opts: unknown }[],
  upsertResult: { error: null as null | { message: string; code?: string } },
  selectRow: null as null | { state: unknown; updated_at: string },
  selectResult: { data: undefined as unknown, error: null as null | { message: string; code?: string } },
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
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
  __resetSupabaseClientForTest,
  ensureSyncIdentity,
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

  it("اولویت با تنظیمات کاربر است و بدون آن نامعتبر است", () => {
    expect(isSupabaseConfigured(EMPTY_SETTINGS)).toBe(false);
    expect(isSupabaseConfigured(goodSettings({ url: "https://abc.supabase.co", anonKey: "x".repeat(100) }))).toBe(true);
    expect(getSupabaseConfig(goodSettings({ url: " https://abc.supabase.co ", anonKey: " " + "x".repeat(99) })).url).toBe("https://abc.supabase.co");
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
  it("push سند را با user_id و updated_at به‌صورت upsert می‌کند و activeSession نمی‌فرستد", async () => {
    const sb = getSupabaseClient(CFG);
    const s: AppState = {
      ...EMPTY_STATE,
      subjects: [{ id: "s1", name: "زیست", color: "#f00", priority: "high", createdAt: 1 }],
      activeSession: { topicId: null, mode: "free", phase: "work", cycle: 0, running: false, startedAt: null, accumulatedMs: 0, totalStudyMs: 0, sessionStartedAt: 1 },
    };
    const at = await pushStateToCloud(sb, "user-1", s);
    expect(at).toBeGreaterThan(0);
    const { row, opts } = fake.upsertCalls[0] as { row: any; opts: any };
    expect(fake.upsertCalls.length).toBe(1);
    expect(row.user_id).toBe("user-1");
    expect(row.updated_at).toBeTruthy();
    expect(row.state.activeSession).toBeNull();
    expect(row.state.subjects[0].id).toBe("s1");
    expect(opts.onConflict).toBe("user_id");
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
});
