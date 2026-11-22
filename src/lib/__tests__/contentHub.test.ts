// @vitest-environment jsdom
// 🎨🧪 بسترِ بخش‌های «اسکچ‌نوت» و «آزمایشگاه» مخزنِ محتوا: سالم‌سازیِ مانیفست‌ها،
// آدرس‌ها، کش و جداسازیِ آمارِ کاربر. همان قراردادهایی که درسنامه‌ها دارند.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LABS_CACHE_KEY,
  SKETCHES_CACHE_KEY,
  SKETCH_TRACK_PREFIX,
  LAB_TRACK_PREFIX,
  clearHubCaches,
  formatBytesFa,
  hubDoneCount,
  hubStudiedSeconds,
  isHubTrackId,
  labInfo,
  labPageUrl,
  labSimulatorUrl,
  labsHomeUrl,
  lessonOnlyProgress,
  loadLabsManifest,
  loadSketchManifest,
  normalizeLabsManifest,
  normalizeSketchManifest,
  sketchSetInfo,
  sketchSetUrl,
  sketchesHomeUrl,
  sketchTrackId,
  labTrackId,
} from "../contentHub";
import { DEFAULT_LIBRARY_BASE, LIBRARY_URL_KEY } from "../libraryRepo";
import type { LessonProgress } from "../../types";

// شکلِ واقعیِ مانیفست‌های مخزن (همان چیزی که در content/sketches و content/labs هست)
const SKETCH_MANIFEST = {
  built: "content/sketches",
  total: 67,
  sets: {
    orthopedics: { count: 20, bytes: 8111241, pages: ["content/sketches/orthopedics.html"] },
    infectious: { count: 47, bytes: 22297182, pages: ["content/sketches/infectious.html"] },
  },
};
const LABS_MANIFEST = {
  built: "content/labs",
  labs: [
    {
      key: "cardiac",
      name: "شبیه‌ساز بالینی قلب",
      scenarios: 18,
      source: "cardiac-simulator (4).html",
      bytes: 4110535,
    },
  ],
};

const BASE = DEFAULT_LIBRARY_BASE;
const env = (data: unknown, at = Date.now()) => JSON.stringify({ at, data });

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  clearHubCaches();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  clearHubCaches();
});

describe("normalizeSketchManifest", () => {
  it("شکلِ واقعیِ مانیفست را نرمال می‌کند: مجموعه‌ها آرایه می‌شوند و پیشوندِ content/ از مسیرها می‌افتد", () => {
    const m = normalizeSketchManifest(SKETCH_MANIFEST);
    expect(m).not.toBeNull();
    expect(m?.total).toBe(67);
    // ترتیبِ پایدار: مجموعه‌های بزرگ‌تر اول
    expect(m?.sets.map((s) => s.key)).toEqual(["infectious", "orthopedics"]);
    expect(m?.sets[0]).toMatchObject({ key: "infectious", count: 47, bytes: 22297182, pages: ["sketches/infectious.html"] });
    expect(m?.sets[1]?.pages).toEqual(["sketches/orthopedics.html"]);
  });

  it("ورودیِ خراب رد می‌شود ولی ردیف‌های ناقص تا جای ممکن نجات می‌یابند", () => {
    expect(normalizeSketchManifest(null)).toBeNull();
    expect(normalizeSketchManifest("x")).toBeNull();
    expect(normalizeSketchManifest({})).toBeNull();
    expect(normalizeSketchManifest({ sets: {} })).toBeNull();
    // مجموعه بدونِ pages → fallback به قراردادِ نام‌گذاریِ مخزن
    const m = normalizeSketchManifest({ sets: { peds: { count: 3 } } });
    expect(m?.sets[0]?.pages).toEqual(["sketches/peds.html"]);
    expect(m?.total).toBe(3);
  });
});

describe("normalizeLabsManifest", () => {
  it("شکلِ واقعیِ مانیفست را نرمال می‌کند و صفحاتِ پیش‌فرض می‌سازد", () => {
    const m = normalizeLabsManifest(LABS_MANIFEST);
    expect(m).not.toBeNull();
    expect(m?.labs).toHaveLength(1);
    expect(m?.labs[0]).toMatchObject({
      key: "cardiac",
      name: "شبیه‌ساز بالینی قلب",
      scenarios: 18,
      bytes: 4110535,
      page: "labs/cardiac/index.html",
      simulator: "labs/cardiac/simulator.html",
    });
  });

  it("ورودیِ خراب رد می‌شود و ردیف‌های بی‌کلید/بی‌نام کنار می‌روند", () => {
    expect(normalizeLabsManifest(null)).toBeNull();
    expect(normalizeLabsManifest({ labs: [] })).toBeNull();
    expect(normalizeLabsManifest({ labs: [{ key: "", name: "x" }, { scenarios: 3 }] })).toBeNull();
    const m = normalizeLabsManifest({ labs: [{ key: "cardiac", name: "قلب", scenarios: 18, page: "content/labs/cardiac/index.html" }] });
    expect(m?.labs[0]?.page).toBe("labs/cardiac/index.html");
  });
});

describe("آدرس‌ها و کلیدها", () => {
  it("آدرس‌های مخزن از همان پایهٔ درسنامه‌ها ساخته می‌شوند", () => {
    expect(sketchesHomeUrl()).toBe(`${BASE}sketches/index.html`);
    expect(labsHomeUrl()).toBe(`${BASE}labs/index.html`);
    const m = normalizeSketchManifest(SKETCH_MANIFEST)!;
    expect(sketchSetUrl(m.sets[0])).toBe(`${BASE}sketches/infectious.html`);
    const lm = normalizeLabsManifest(LABS_MANIFEST)!;
    expect(labPageUrl(lm.labs[0])).toBe(`${BASE}labs/cardiac/index.html`);
    expect(labSimulatorUrl(lm.labs[0])).toBe(`${BASE}labs/cardiac/simulator.html`);
  });

  it("با تنظیمِ آدرسِ کاربر، آدرس‌ها عوض می‌شوند (خودمیزبانی)", () => {
    localStorage.setItem(LIBRARY_URL_KEY, "https://medical.example.com/lib/");
    expect(sketchesHomeUrl()).toBe("https://medical.example.com/lib/sketches/index.html");
    expect(labSimulatorUrl(normalizeLabsManifest(LABS_MANIFEST)!.labs[0])).toBe(
      "https://medical.example.com/lib/labs/cardiac/simulator.html",
    );
  });

  it("کلیدهای ثبتِ پیشرفت جدا و قابل‌تشخیص‌اند", () => {
    expect(sketchTrackId("infectious")).toBe("sketch:infectious");
    expect(labTrackId("cardiac")).toBe("lab:cardiac");
    expect(isHubTrackId("sketch:infectious")).toBe(true);
    expect(isHubTrackId("lab:cardiac")).toBe(true);
    expect(isHubTrackId("cardio/aortic-stenosis")).toBe(false);
    expect(isHubTrackId(undefined)).toBe(false);
  });

  it("lessonOnlyProgress کلیدهای بستر را کنار می‌گذارد و آمارِ درسنامه‌ها نجوشیده می‌ماند", () => {
    const map: Record<string, LessonProgress> = {
      "cardio/aortic-stenosis": { seconds: 900, visits: 2, lastAt: 1 },
      [`${SKETCH_TRACK_PREFIX}infectious`]: { seconds: 300, visits: 1, lastAt: 2, done: true },
      [`${LAB_TRACK_PREFIX}cardiac`]: { seconds: 120, visits: 1, lastAt: 3 },
    };
    const only = lessonOnlyProgress(map)!;
    expect(Object.keys(only)).toEqual(["cardio/aortic-stenosis"]);
    expect(hubStudiedSeconds(map)).toBe(420);
    expect(hubStudiedSeconds(map, "sketch:")).toBe(300);
    expect(hubDoneCount(map)).toBe(1);
    expect(hubDoneCount(map, "lab:")).toBe(0);
  });

  it("formatBytesFa حجم را فارسی نشان می‌دهد", () => {
    const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
    expect(formatBytesFa(811, fa)).toBe("۸۱۱ بایت");
    expect(formatBytesFa(2048, fa)).toBe("۲ کیلوبایت");
    expect(formatBytesFa(22297182, fa)).toContain("مگابایت");
  });

  it("متادیتای نمایش برای مجموعه‌های شناخته‌شده هست و برای ناشناخته fallback می‌دهد", () => {
    expect(sketchSetInfo("infectious").name).toBe("عفونی");
    expect(sketchSetInfo("orthopedics").appSubjectKeys).toContain("orthopedics-alamiharandi");
    expect(sketchSetInfo("neonatology").icon).toBe("🎨");
    expect(labInfo("cardiac").appSubjectKeys).toContain("cardiology-nematpour");
    expect(labInfo("surgery-sim").icon).toBe("🧪");
  });
});

describe("بارگذاریِ مانیفست‌ها — شبکه، کش و آفلاین", () => {
  it("از شبکه می‌آورد و در localStorage کش می‌کند؛ بارِ دوم شبکه نمی‌زند", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("sketches/sketch-manifest.json")) return jsonResponse(SKETCH_MANIFEST);
      return jsonResponse(LABS_MANIFEST);
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await loadSketchManifest();
    expect(first.source).toBe("network");
    expect(first.manifest?.total).toBe(67);
    expect(localStorage.getItem(SKETCHES_CACHE_KEY)).toBeTruthy();

    // پاک‌کردنِ کشِ حافظه (نه localStorage) — معادلِ «بازشدنِ دوبارهٔ اپ»
    clearHubCaches();
    const second = await loadSketchManifest();
    expect(second.source).toBe("cache");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("force همیشه شبکه را صدا می‌زند", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(LABS_MANIFEST));
    vi.stubGlobal("fetch", fetchMock);
    await loadLabsManifest();
    await loadLabsManifest({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("آفلاین + کشِ تازه → همان کش با علامتِ cache (بدون خطا؛ چیزی خراب نیست)", async () => {
    localStorage.setItem(SKETCHES_CACHE_KEY, env(normalizeSketchManifest(SKETCH_MANIFEST)));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));
    const res = await loadSketchManifest();
    expect(res.source).toBe("cache");
    expect(res.manifest?.total).toBe(67);
  });

  it("آفلاین + کشِ کهنه → کشِ کهنه برمی‌گردد و خطا هم گزارش می‌شود", async () => {
    localStorage.setItem(SKETCHES_CACHE_KEY, env(normalizeSketchManifest(SKETCH_MANIFEST), Date.now() - 7 * 60 * 60 * 1000));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));
    const res = await loadSketchManifest();
    expect(res.source).toBe("cache");
    expect(res.manifest?.total).toBe(67);
    expect(res.error).toContain("Failed to fetch");
  });

  it("آفلاین + کشِ کهنه → کشِ کهنه برمی‌گردد (مثلِ درسنامه‌ها)", async () => {
    localStorage.setItem(LABS_CACHE_KEY, env(normalizeLabsManifest(LABS_MANIFEST), Date.now() - 7 * 60 * 60 * 1000));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));
    const res = await loadLabsManifest();
    expect(res.source).toBe("cache");
    expect(res.manifest?.labs[0]?.key).toBe("cardiac");
  });

  it("آفلاین + بی‌کش → source: none با خطا (و مانیفست null)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));
    const res = await loadLabsManifest();
    expect(res.source).toBe("none");
    expect(res.manifest).toBeNull();
    expect(res.error).toContain("Failed to fetch");
  });

  it("مانیفستِ نامعتبر از شبکه → source: none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ hello: "world" })));
    const res = await loadSketchManifest();
    expect(res.source).toBe("none");
    expect(res.manifest).toBeNull();
  });
});
