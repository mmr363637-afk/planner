import { describe, expect, it } from "vitest";
import { buildPullRequest, buildPushRequest, buildSyncData, parsePullResponse, syncConfigured, SYNC_SETUP_SQL } from "../cloudSync";
import { EMPTY_STATE } from "../stateIO";
import type { SyncSettings } from "../../types";

const SETTINGS: SyncSettings = {
  provider: "supabase",
  url: "https://abc.supabase.co/",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake",
  table: "planner_state",
  autoSync: false,
};

describe("سینک ابری (سازنده‌های خالص)", () => {
  it("تنظیمات معتبر را تشخیص می‌دهد", () => {
    expect(syncConfigured(SETTINGS)).toBe(true);
    expect(syncConfigured({ ...SETTINGS, provider: "off" })).toBe(false);
    expect(syncConfigured({ ...SETTINGS, url: "notaurl" })).toBe(false);
    expect(syncConfigured({ ...SETTINGS, anonKey: "short" })).toBe(false);
  });

  it("داده‌ی ارسالی سشن فعال را حذف می‌کند", () => {
    const data = buildSyncData({ ...EMPTY_STATE, activeSession: null });
    expect(data.activeSession).toBeNull();
    expect(Array.isArray(data.subjects)).toBe(true);
  });

  it("درخواست push آدرس و هدر درست دارد", () => {
    const { url, init } = buildPushRequest(SETTINGS, EMPTY_STATE, "dev-x");
    expect(url).toBe("https://abc.supabase.co/rest/v1/planner_state");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toContain("Bearer");
    const body = JSON.parse(init.body as string);
    expect(body.id).toBe("main");
    expect(body.device).toBe("dev-x");
    expect(body.data).toBeDefined();
  });

  it("درخواست pull سطر main را می‌خواهد", () => {
    const { url, init } = buildPullRequest(SETTINGS);
    expect(url).toContain("id=eq.main");
    expect(init.method).toBe("GET");
  });

  it("پاسخ pull را پارس می‌کند", () => {
    expect(parsePullResponse([])).toBeNull();
    expect(parsePullResponse([{ nope: 1 }])).toBeNull();
    const ok = parsePullResponse([{ updated_at: "2026-01-01T00:00:00Z", device: "d", data: { a: 1 } }]);
    expect(ok?.device).toBe("d");
  });

  it("اسکریپت SQL راه‌اندازی کامل است", () => {
    expect(SYNC_SETUP_SQL).toContain("planner_state");
    expect(SYNC_SETUP_SQL).toContain("row level security");
  });
});
