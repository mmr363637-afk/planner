// @vitest-environment jsdom
// 🎨🧪 پنجرهٔ «اسکچ‌نوت و آزمایشگاهِ تعاملی» — نمایِ اپ از دو بخشِ تازهٔ مخزنِ محتوا.
// این تست قفل می‌کند: فقط مانیفست‌ها گرفته می‌شود (نه کلِ مخزن)، گالری/شبیه‌ساز
// در قابِ اپ باز می‌شوند، بازدید ثبت می‌شود و دادهٔ کاربر از محتوا جدا می‌ماند.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ContentHub from "../components/ContentHub";
import { StoreProvider, useStore, type StoreApi } from "../store";
import { STORAGE_KEY } from "../lib/persist";
import { DEFAULT_LIBRARY_BASE } from "../lib/lessonLibrary";
import { SKETCHES_CACHE_KEY, LABS_CACHE_KEY, clearHubCaches } from "../lib/contentHub";

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
      type: "self-contained-html",
      entry: "cardiac/index.html",
      app: "cardiac/simulator.html",
      scenarios: 18,
      source: "cardiac-simulator (4).html",
      bytes: 4110535,
    },
    {
      key: "pulmolab",
      name: "آزمایشگاه تعاملی ریه",
      nameEn: "PulmoLab Studio",
      type: "modular-pwa",
      theme: { h: 197, c: 74, a: 172 },
      entry: "pulmolab/index.html",
      app: "pulmolab/index.html",
      source: "PulmoLab-Studio-Offline.zip",
      files: 122,
      bytes: 12380311,
      counts: { radiographs: 70, sounds: 12, diseases: 30, cases: 8 },
    },
  ],
};

/** کتابخانه آنلاین فرض می‌شود؛ بقیهٔ درخواست‌ها ۴۰۴ */
function stubFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("sketches/sketch-manifest.json")) {
      return { ok: true, status: 200, json: async () => SKETCH_MANIFEST } as unknown as Response;
    }
    if (url.includes("labs/labs-manifest.json")) {
      return { ok: true, status: 200, json: async () => LABS_MANIFEST } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
}

const env = (data: unknown, at = Date.now()) => JSON.stringify({ at, data });

let store: StoreApi | null = null;
function Probe() {
  store = useStore();
  return null;
}

function seedState(extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ subjects: [], topics: [], flashcards: [], settings: { onboarded: true }, ...extra }),
  );
}

beforeEach(() => {
  localStorage.clear();
  clearHubCaches();
  store = null;
  stubFetch();
});

afterEach(() => {
  cleanup();
  clearHubCaches();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openHub(tab: "sketches" | "labs" = "sketches") {
  render(
    <StoreProvider>
      <Probe />
      <ContentHub open onClose={() => {}} initialTab={tab} />
    </StoreProvider>,
  );
  return screen.findByRole("dialog", { name: /اسکچ‌نوت و آزمایشگاهِ تعاملی/ });
}

/** کارتِ یک مجموعه/آزمایشگاه با h4ِ مشخص */
function cardOf(title: string | RegExp) {
  const heading = screen.getAllByText(title).find((el) => el.tagName === "H4");
  const card = heading?.closest("div.rounded-2xl");
  if (!card) throw new Error("کارت پیدا نشد");
  return within(card as HTMLElement);
}

describe("🎨🧪 اسکچ‌نوت و آزمایشگاه — بارگذاری و نمایش", () => {
  it("در ورود فقط دو مانیفست گرفته می‌شود، نه خودِ گالری‌ها یا شبیه‌ساز", async () => {
    await openHub();
    await screen.findByText("اسکچ‌نوت‌های عفونی");
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.filter((u) => u.includes("manifest"))).toHaveLength(2);
    expect(calls.some((u) => u.includes("infectious.html"))).toBe(false);
    expect(calls.some((u) => u.includes("simulator.html"))).toBe(false);
  });

  it("دو مجموعه با تعداد و حجمِ واقعیِ مانیفست نشان داده می‌شوند (عفونی اول)", async () => {
    await openHub();
    const infectious = await screen.findByText("اسکچ‌نوت‌های عفونی");
    expect(infectious).toBeTruthy();
    expect(screen.getByText("اسکچ‌نوت‌های ارتوپدی")).toBeTruthy();
    expect(screen.getByText("۴۷ تصویر")).toBeTruthy();
    expect(screen.getByText("۲۰ تصویر")).toBeTruthy();
    // شمارنده‌های کلیِ همان تب
    expect(screen.getByText("۶۷")).toBeTruthy();
  });

  it("آدرسِ خامِ مخزن در فهرست چاپ نمی‌شود (فقط داخل ⚙️ دیده می‌شود)", async () => {
    await openHub();
    await screen.findByText("اسکچ‌نوت‌های عفونی");
    expect(screen.queryByText(new RegExp(DEFAULT_LIBRARY_BASE))).toBeNull();
  });

  it("آفلاین با کشِ تازه → مجموعه‌ها از کش نشان داده می‌شوند با نشانِ «آفلاین»", async () => {
    // کش همیشه شکلِ نرمال‌شده را نگه می‌دارد (همان چیزی که نسخهٔ قبلی نوشته)
    const normalizedSketches = {
      built: "content/sketches",
      total: 67,
      sets: [
        { key: "infectious", count: 47, bytes: 22297182, pages: ["sketches/infectious.html"] },
        { key: "orthopedics", count: 20, bytes: 8111241, pages: ["sketches/orthopedics.html"] },
      ],
    };
    const normalizedLabs = {
      built: "content/labs",
      labs: [{ key: "cardiac", name: "شبیه‌ساز بالینی قلب", scenarios: 18, bytes: 4110535, page: "labs/cardiac/index.html", simulator: "labs/cardiac/simulator.html" }],
    };
    localStorage.setItem(SKETCHES_CACHE_KEY, env(normalizedSketches));
    localStorage.setItem(LABS_CACHE_KEY, env(normalizedLabs));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }) as unknown as typeof fetch);
    await openHub();
    expect(await screen.findByText("اسکچ‌نوت‌های عفونی")).toBeTruthy();
    expect(screen.getAllByText(/از کشِ محلی \(آفلاین\)/).length).toBeGreaterThan(0);
  });

  it("بدونِ شبکه و بدونِ کش → پیامِ «مخزن در دسترس نیست» + تلاشِ دوباره", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }) as unknown as typeof fetch);
    await openHub();
    expect(await screen.findByText("مخزن در دسترس نیست")).toBeTruthy();
    expect(screen.getByRole("button", { name: /تلاش دوباره/ })).toBeTruthy();
  });
});

describe("🎨 تبِ اسکچ‌نوت‌ها — خواننده و ثبتِ بازدید", () => {
  it("«بازکردن گالری» همان گالریِ مخزن را در قابِ اپ باز می‌کند و بازدید ثبت می‌شود", async () => {
    await openHub("sketches");
    const card = cardOf("اسکچ‌نوت‌های عفونی");
    fireEvent.click(card.getByRole("button", { name: /بازکردن گالری/ }));

    const frame = await screen.findByRole("dialog", { name: "اسکچ‌نوت‌های عفونی" });
    const iframe = frame.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(`${DEFAULT_LIBRARY_BASE}sketches/infectious.html`);
    await waitFor(() => expect(store?.state.lessonProgress?.["sketch:infectious"]?.visits).toBe(1));

    // بستن → برگشت به فهرست، بدونِ از دست رفتنِ پنجره
    fireEvent.click(within(frame).getByRole("button", { name: "بستن" }));
    expect(await screen.findByRole("dialog", { name: /اسکچ‌نوت و آزمایشگاهِ تعاملی/ })).toBeTruthy();
  });

  it("برای تصویرِ کارتِ گالری هم ذره‌بین را داخل صفحهٔ بارگذاری‌شده نصب می‌کند", async () => {
    await openHub("sketches");
    const card = cardOf("اسکچ‌نوت‌های عفونی");
    fireEvent.click(card.getByRole("button", { name: /بازکردن گالری/ }));
    const frame = await screen.findByRole("dialog", { name: "اسکچ‌نوت‌های عفونی" });
    const iframe = frame.querySelector("iframe")!;

    const galleryFixture = document.createElement("div");
    galleryFixture.innerHTML = '<main data-sk-gallery><button class="sk-item__btn"><img data-full="/full.png" /></button></main>';
    document.body.appendChild(galleryFixture);
    Object.defineProperty(iframe, "contentDocument", { configurable: true, get: () => document });
    fireEvent.load(iframe);

    expect(document.querySelector("[data-sk-hold-magnifier]")).toBeTruthy();
    expect(within(frame).getByText("🔎 روی تصویر نگه‌دار")).toBeTruthy();
    fireEvent.click(within(frame).getByRole("button", { name: "بستن" }));
    expect(document.querySelector("[data-sk-hold-magnifier]")).toBeNull();
    galleryFixture.remove();
  });

  it("«✓» در کارت، مجموعه را بدونِ ثبتِ زمان در پیشرفت علامت می‌زند", async () => {
    await openHub("sketches");
    const card = cardOf("اسکچ‌نوت‌های ارتوپدی");
    fireEvent.click(card.getByRole("button", { name: /«تمام شد» برای اسکچ‌نوت‌های ارتوپدی/ }));
    expect(store?.state.lessonProgress?.["sketch:orthopedics"]?.done).toBe(true);
    // بدونِ زمانِ مطالعه — ثبتِ زمان فقط از راهِ خواننده/دکمهٔ «ثبت در مطالعهٔ امروز»
    expect(store?.state.lessonProgress?.["sketch:orthopedics"]?.seconds ?? 0).toBe(0);
  });
});

describe("🧪 تبِ آزمایشگاه — شبیه‌ساز قلب", () => {
  it("کارتِ آزمایشگاه با ۱۸ سناریو دیده می‌شود و شبیه‌ساز در قاب باز می‌شود", async () => {
    await openHub("labs");
    expect(await screen.findByText("شبیه‌ساز بالینی قلب")).toBeTruthy();
    expect(screen.getByText("۱۸ سناریو")).toBeTruthy();

    const card = cardOf("شبیه‌ساز بالینی قلب");
    fireEvent.click(card.getByRole("button", { name: /اجرای شبیه‌ساز/ }));
    const frame = await screen.findByRole("dialog", { name: "شبیه‌ساز بالینی قلب" });
    const iframe = frame.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(`${DEFAULT_LIBRARY_BASE}labs/cardiac/simulator.html`);
    await waitFor(() => expect(store?.state.lessonProgress?.["lab:cardiac"]?.visits).toBe(1));
  });

  it("«ℹ️ معرفی» صفحهٔ معرفیِ سناریوها را جداگانه باز می‌کند", async () => {
    await openHub("labs");
    const card = cardOf("شبیه‌ساز بالینی قلب");
    fireEvent.click(card.getByRole("button", { name: /معرفی/ }));
    const frame = await screen.findByRole("dialog", { name: /شبیه‌ساز بالینی قلب — معرفی/ });
    const iframe = frame.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(`${DEFAULT_LIBRARY_BASE}labs/cardiac/index.html`);
  });

  it("شبیه‌ساز ریه (PulmoLab) مستقیم به labs/pulmolab/index.html وصل می‌شود (بدون 404 روی simulator.html)", async () => {
    await openHub("labs");
    expect(await screen.findByText("آزمایشگاه تعاملی ریه")).toBeTruthy();
    const card = cardOf("آزمایشگاه تعاملی ریه");
    expect(card.getByText("۷۰ رادیوگرافی")).toBeTruthy();
    // چون entry و app یکی‌اند، دکمهٔ تکراریِ «معرفی» نشان داده نمی‌شود
    expect(card.queryByRole("button", { name: /معرفی/ })).toBeNull();

    fireEvent.click(card.getByRole("button", { name: /اجرای شبیه‌ساز/ }));
    const frame = await screen.findByRole("dialog", { name: "آزمایشگاه تعاملی ریه" });
    const iframe = frame.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(`${DEFAULT_LIBRARY_BASE}labs/pulmolab/index.html`);
    await waitFor(() => expect(store?.state.lessonProgress?.["lab:pulmolab"]?.visits).toBe(1));
  });
});

describe("اتصال به خانه و منو", () => {
  it("دکمهٔ «🎨 اسکچ‌نوت‌ها» در کارتِ محتوای صفحهٔ اول، همین پنجره را باز می‌کند", async () => {
    seedState();
    const { default: App } = await import("../App");
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);
    const sketches = await screen.findByRole("button", { name: "🎨 اسکچ‌نوت‌ها" }, { timeout: 25_000 });
    fireEvent.click(sketches);
    expect(await screen.findByRole("dialog", { name: /اسکچ‌نوت و آزمایشگاهِ تعاملی/ }, { timeout: 25_000 })).toBeTruthy();
  });
});
