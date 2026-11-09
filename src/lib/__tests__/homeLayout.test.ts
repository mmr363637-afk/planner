import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_LAYOUT, HOME_CARD_META, moveHomeCard, resolveHomeLayout } from "../homeLayout";
import type { HomeCardLayout } from "../../types";

/**
 * چیدمانِ صفحهٔ اول (خانه).
 *
 * نکتهٔ اصلیِ این تست‌ها: کارتِ تازه‌ای که در یک نسخه اضافه می‌شود نباید برای کاربرِ
 * قدیمی با `visible: false` تهٔ فهرست بیفتد — وگرنه فیچرِ جدید «در صفحهٔ اول دیده
 * نمی‌شود» و عملاً منتشر نشده. از طرفِ دیگر، انتخابِ صریحِ کاربر (خاموش‌کردن یا
 * جابه‌جایی) همیشه بر مقدم است.
 */

const ids = (layout: HomeCardLayout[]) => layout.map((c) => c.id);
const visibleIds = (layout: HomeCardLayout[]) => layout.filter((c) => c.visible).map((c) => c.id);

describe("چیدمانِ پیش‌فرضِ صفحهٔ اول", () => {
  it("کارتِ «بانک سؤال و درسنامه‌ها» در پیش‌فرض دیده می‌شود و بالای صفحه است", () => {
    const layout = resolveHomeLayout(undefined);
    expect(layout).toEqual(DEFAULT_HOME_LAYOUT.map((c) => ({ ...c })));
    expect(visibleIds(layout).slice(0, 3)).toEqual(["tasks", "contentLibrary", "examCountdown"]);
    // کارهای امروز (قلبِ اپ) اول می‌ماند؛ محتوا بلافاصله بعدش، بدونِ اسکرول
    expect(visibleIds(layout)[0]).toBe("tasks");
  });

  it("هر شناسهٔ چیدمان، متایِ خودش را دارد (برچسب و آیکونِ فهرستِ تنظیمات)", () => {
    for (const card of DEFAULT_HOME_LAYOUT) {
      const meta = HOME_CARD_META.find((m) => m.id === card.id);
      expect(meta, card.id).toBeTruthy();
      expect(meta!.label.length).toBeGreaterThan(2);
      expect(meta!.icon.length).toBeGreaterThan(0);
    }
    expect(new Set(ids(DEFAULT_HOME_LAYOUT)).size).toBe(DEFAULT_HOME_LAYOUT.length);
  });
});

describe("کاربرِ قدیمی با چیدمانِ ذخیره‌شده", () => {
  it("کارتِ تازه را دیده‌شده و اولِ فهرست می‌گیرد", () => {
    const saved: HomeCardLayout[] = [
      { id: "quote", visible: true },
      { id: "tasks", visible: true },
      { id: "stats", visible: true },
    ];
    const layout = resolveHomeLayout(saved);
    const card = layout.find((c) => c.id === "contentLibrary");
    expect(card?.visible).toBe(true);
    expect(visibleIds(layout)).toEqual(["contentLibrary", "quote", "tasks", "stats"]);
    // کارت‌های خودش همان ترتیبی می‌مانند که چیده بود
    expect(ids(layout).indexOf("quote")).toBeLessThan(ids(layout).indexOf("tasks"));
  });

  it("خاموش‌کردنِ صریحِ کارتِ تازه محترم می‌ماند و دوباره روشن نمی‌شود", () => {
    const saved: HomeCardLayout[] = [
      { id: "contentLibrary", visible: false },
      { id: "tasks", visible: true },
    ];
    const layout = resolveHomeLayout(saved);
    expect(layout.find((c) => c.id === "contentLibrary")?.visible).toBe(false);
    expect(visibleIds(layout)).toEqual(["tasks"]);
  });

  it("جابه‌جاییِ صریحِ کاربر حفظ می‌شود (کارت به زور بالا نمی‌رود)", () => {
    const saved: HomeCardLayout[] = [
      { id: "tasks", visible: true },
      { id: "stats", visible: true },
      { id: "contentLibrary", visible: true },
    ];
    expect(visibleIds(resolveHomeLayout(saved))).toEqual(["tasks", "stats", "contentLibrary"]);
  });

  it("شناسهٔ ناشناس، تکراری و ردیفِ خالی را دور می‌ریزد و کارت‌های جاافتاده را اضافه می‌کند", () => {
    const saved = [
      { id: "tasks", visible: true },
      { id: "tasks", visible: false },
      { id: "not-a-card", visible: true },
      null,
    ] as unknown as HomeCardLayout[];
    const layout = resolveHomeLayout(saved);
    expect(ids(layout).filter((id) => id === "tasks")).toHaveLength(1);
    expect(layout.find((c) => c.id === "tasks")?.visible).toBe(true);
    expect(layout.some((c) => (c.id as string) === "not-a-card")).toBe(false);
    // همهٔ کارت‌های شناخته‌شده در خروجی هستند تا فهرستِ تنظیمات کامل بماند
    for (const meta of HOME_CARD_META) expect(layout.some((c) => c.id === meta.id)).toBe(true);
  });

  it("چیدمانِ خالی = همان پیش‌فرض", () => {
    expect(resolveHomeLayout([])).toEqual(DEFAULT_HOME_LAYOUT.map((c) => ({ ...c })));
  });
});

describe("جابه‌جاییِ کارت", () => {
  it("یک قدم بالا/پایین می‌رود و در لبه‌ها چیزی را خراب نمی‌کند", () => {
    const layout: HomeCardLayout[] = [
      { id: "tasks", visible: true },
      { id: "contentLibrary", visible: true },
      { id: "stats", visible: true },
    ];
    expect(ids(moveHomeCard(layout, "contentLibrary", -1))).toEqual(["contentLibrary", "tasks", "stats"]);
    expect(ids(moveHomeCard(layout, "contentLibrary", 1))).toEqual(["tasks", "stats", "contentLibrary"]);
    expect(moveHomeCard(layout, "tasks", -1)).toBe(layout); // لبهٔ بالا
    expect(moveHomeCard(layout, "stats", 1)).toBe(layout); // لبهٔ پایین
    expect(moveHomeCard(layout, "quote", 1)).toBe(layout); // شناسهٔ غریبه
  });
});
