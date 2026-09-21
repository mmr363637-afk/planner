// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { guardedReload, isChunkLoadError } from "../appHealth";

const GUARD_KEY = "sp_autoreload_guard_v1";

beforeEach(() => {
  sessionStorage.clear();
});

describe("isChunkLoadError — تشخیص خطای لود چانک lazy در مرورگرهای مختلف", () => {
  it("پیام کروم/مایکروسافت اج را می‌شناسد", () => {
    expect(isChunkLoadError("Failed to fetch dynamically imported module: https://x/y/assets/Flashcards-abc.js")).toBe(true);
  });
  it("پیام فایرفاکس را می‌شناسد", () => {
    expect(isChunkLoadError("error loading dynamically imported module: https://x/y.js")).toBe(true);
  });
  it("پیام سافاری را می‌شناسد", () => {
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
  });
  it("خطاهای عادی را نادیده می‌گیرد", () => {
    expect(isChunkLoadError("Cannot read properties of undefined (reading 'id')")).toBe(false);
    expect(isChunkLoadError("")).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("guardedReload — حلقه‌شکن رفرش خودکار", () => {
  it("اولین بار true برمی‌گرداند و گارد را می‌نویسد", () => {
    const ok = guardedReload("chunk-error", 1_000_000);
    expect(ok).toBe(true);
    const saved = JSON.parse(sessionStorage.getItem(GUARD_KEY)!);
    expect(saved.reason).toBe("chunk-error");
    expect(saved.at).toBe(1_000_000);
  });

  it("تا ۶۰ ثانیه‌ی بعد رفرشِ خودکارِ دوم را بلاک می‌کند (بدون حلقه)", () => {
    guardedReload("a", 0);
    expect(guardedReload("b", 30_000)).toBe(false);
    expect(guardedReload("c", 59_999)).toBe(false);
    // حتی با علت متفاوت
    expect(guardedReload("controllerchange", 10_000)).toBe(false);
  });

  it("بعد از گذشت بازه‌ی گارد دوباره اجازه‌ی رفرش می‌دهد", () => {
    guardedReload("a", 0);
    expect(guardedReload("b", 61_000)).toBe(true);
  });
});
