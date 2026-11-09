// @vitest-environment jsdom
// 📖 اتصالِ اپ به مخزنِ محتوای درسنامه (DATA): چه چیزی از مخزن می‌آید، چه چیزی در اپ
// می‌ماند، و چطور «مدت‌زمانِ محتوا» از «زمانِ واقعیِ مطالعهٔ کاربر» جدا است.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LessonLibrary from "../components/LessonLibrary";
import { StoreProvider, useStore, type StoreApi } from "../store";
import { DEFAULT_LIBRARY_BASE, LIBRARY_CACHE_KEY, clearLibraryCache } from "../lib/lessonLibrary";
import { STORAGE_KEY } from "../lib/persist";

const MANIFEST = {
  version: 1,
  schema: "med-library/1",
  updatedAt: "2026-11-08",
  index: "index.html",
  counts: { subjects: 2, lessons: 2, minutes: 75 },
  subjects: [
    { key: "cardio", name: "قلب و عروق", icon: "❤️", page: "subject/cardio.html", count: 1, minutes: 45, appSubjectKeys: ["cardiology-nematpour"] },
    { key: "nephro", name: "کلیه", count: 1, minutes: 30 },
  ],
  lessons: [
    {
      id: "cardio/aortic-stenosis",
      subject: "cardio",
      title: "تنگی دریچهٔ آئورت",
      path: "cardio/aortic-stenosis.html",
      sections: 9,
      words: 4200,
      minutes: 45,
      flashcards: 180,
      tables: 12,
      mcq: 30,
      source: "braunwald-2025",
      appSubjectKeys: ["cardiology-nematpour"],
    },
    {
      id: "nephro/aki",
      subject: "nephro",
      title: "آسیب حاد کلیه",
      path: "nephro/aki.html",
      minutes: 30,
      flashcards: 40,
      mcq: 0,
    },
  ],
  qbank: {
    index: "qbank/index.html",
    total: 790,
    parts: [{ part: "cardio", title: "قلب", count: 320, page: "qbank/cardio.html", standalone: "qbank/cardio-standalone.html", chapters: 4 }],
  },
};

const CARDIO = "تنگی دریچهٔ آئورت";
const NEPHRO = "آسیب حاد کلیه";
const CARDIO_ID = "cardio/aortic-stenosis";

/** آخرین وضعیتِ store در دسترسِ تست — به‌جای حدس‌زدن از روی localStorage */
let store: StoreApi | null = null;
function Probe() {
  store = useStore();
  return null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const onlineFetch = () => vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => MANIFEST }) as unknown as Response);

/** بازکردنِ کتابخانه و صبر تا مانیفست گرفته و فهرست رندر شود */
async function openLibrary() {
  render(
    <StoreProvider>
      <Probe />
      <LessonLibrary open onClose={() => {}} />
    </StoreProvider>,
  );
  await screen.findByText(/مخزنِ محتوای درسنامه/);
  await screen.findByText(new RegExp(CARDIO));
}

/** کارتِ ردیفِ یک درسنامهٔ مشخص (متنِ عنوان، نشانهٔ پایدارِ آن است) */
function row(title: string) {
  const card = screen
    .getAllByText(new RegExp(title))
    .map((el) => el.closest("div.rounded-2xl"))
    .find((el): el is HTMLElement => !!el && (el.textContent ?? "").includes("مطالعه در اپ"));
  if (!card) throw new Error(`ردیفِ درسنامهٔ «${title}» پیدا نشد`);
  return within(card);
}

/** درسنامه‌خوانِ یک درسنامه را باز می‌کند */
async function openReader(title: string) {
  fireEvent.click(row(title).getByRole("button", { name: /📖 مطالعه در اپ/ }));
  return screen.findByRole("dialog", { name: new RegExp(`درسنامه: ${title}`) });
}

/** رکوردِ پیشرفتِ یک درسنامه در state اپ — همیشه آخرین وضعیت */
function progress(id = CARDIO_ID) {
  return store!.state.lessonProgress?.[id];
}

function closeReader(reader: HTMLElement) {
  fireEvent.click(within(reader).getByRole("button", { name: /بستنِ درسنامه/ }));
}

function seedState(extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ subjects: [], topics: [], flashcards: [], settings: { onboarded: true }, ...extra }),
  );
}

beforeEach(() => {
  localStorage.clear();
  clearLibraryCache();
  store = null;
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  clearLibraryCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("📖 کتابخانهٔ درسنامه — آنچه از مخزنِ محتوا می‌آید", () => {
  it("در ورود فقط فهرست (مانیفست) گرفته می‌شود، نه کلِ مخزن یا متنِ درسنامه‌ها", async () => {
    const fetchMock = onlineFetch();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    await openLibrary();
    // دقیقاً یک درخواست: manifest.json — متنِ HTML هیچ درسنامه‌ای گرفته نشده
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${DEFAULT_LIBRARY_BASE}manifest.json`);
  });

  it("ردیفِ هر درسنامه: مدتِ محتوا، بخش‌ها، فلش‌کارت‌ها، جدول‌ها و سؤال‌های تعاملیِ همان فایل", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    const cardio = row(CARDIO);
    expect(cardio.getByText(/۴۵ دقیقه/)).toBeTruthy(); // مدت‌زمانِ خودِ محتوا
    expect(cardio.getByText(/۹ بخش/)).toBeTruthy();
    expect(cardio.getByText(/۱۸۰/)).toBeTruthy(); // فلش‌کارتِ درونِ درسنامه
    expect(cardio.getByText(/۱۲/)).toBeTruthy(); // جدول
    expect(cardio.getByText(/۳۰/)).toBeTruthy(); // سؤالِ تعاملیِ اختصاصیِ همان فایل
    // لینکِ مستقیمِ سؤال‌ها به لنگرِ همان بخش در فایلِ HTML می‌رود
    expect(cardio.getByRole("link").getAttribute("href")).toBe(`${DEFAULT_LIBRARY_BASE}cardio/aortic-stenosis.html#mcqs`);
    // آدرسِ خامِ مخزن (…/DATA/lib/) در فهرست چاپ نمی‌شود — فقط داخلِ ⚙️ دیده/عوض می‌شود
    expect(screen.queryByText(/DATA\/lib/)).toBeNull();
    expect(screen.queryByText(/github\.io/)).toBeNull();

    // شمارِ کل از مانیفست
    expect(screen.getByText(/^۱ ساعت$/)).toBeTruthy();
    expect(screen.getByTitle("مجموعِ مدت‌زمانِ محتوا: ۱ ساعت و ۱۵ دقیقه")).toBeTruthy();
    expect(screen.getByText(/نسخهٔ ۱ · 2026-11-08/)).toBeTruthy();
    expect(screen.getByText(/🟢 از مخزن/)).toBeTruthy();
    // تا وقتی کاربر این درسنامه را نخوانده، ردیفش «زمانِ مطالعهٔ تو» ندارد
    expect(cardio.queryByText(/مطالعهٔ تو:/)).toBeNull();
    // ولی کارتِ کلیِ «پیشرفتِ مطالعهٔ تو» همیشه هست (دادهٔ کاربر، نه محتوا)
    expect(screen.getByText(/پیشرفتِ مطالعهٔ تو \(ذخیره در اپ\)/)).toBeTruthy();
    expect(screen.getByText(/۰ دقیقه مطالعهٔ واقعی · ۰ درسنامه تمام‌شده/)).toBeTruthy();
  });

  it("سؤال‌های فصل‌به‌فصلِ مخزن صریحاً جدا از بانکِ مستقلِ اپ معرفی می‌شوند", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    expect(screen.getByText(/آزمون‌های فصل‌به‌فصلِ کتابخانه/)).toBeTruthy();
    expect(screen.getByText(/با «بانک سؤال پره‌انترنی و دستیاری» خودِ اپ/)).toBeTruthy();
    // لینک‌ها به خودِ مخزن می‌روند و هیچ سؤالی واردِ بانکِ اپ نمی‌شود
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain(`${DEFAULT_LIBRARY_BASE}qbank/index.html`);
    expect(links).toContain(`${DEFAULT_LIBRARY_BASE}qbank/cardio.html`);
    expect(links).toContain(`${DEFAULT_LIBRARY_BASE}qbank/cardio-standalone.html`);
    expect(store!.state.examBankAttempts).toEqual([]);
    expect(store!.state.examBankSessions).toEqual([]);
  });

  it("درسنامه‌ها زیرِ درسِ کتابخانه‌ایِ خودشان گروه می‌شوند و جست‌وجو/فیلتر کار می‌کند", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    // عنوانِ بخشِ درس + تراشهٔ فیلتر، هر دو نامِ درس را دارند
    expect(screen.getAllByText(/❤️ قلب و عروق/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /صفحهٔ درس/ }).getAttribute("href")).toBe(`${DEFAULT_LIBRARY_BASE}subject/cardio.html`);

    fireEvent.change(screen.getByLabelText("جست‌وجوی درسنامه"), { target: { value: "braunwald" } });
    expect(screen.getByText(new RegExp(CARDIO))).toBeTruthy();
    expect(screen.queryByText(new RegExp(NEPHRO))).toBeNull();

    fireEvent.change(screen.getByLabelText("جست‌وجوی درسنامه"), { target: { value: "چیزِ بی‌ربط" } });
    expect(screen.getByText(/درسنامه‌ای پیدا نشد/)).toBeTruthy();

    // فیلترِ درس
    fireEvent.change(screen.getByLabelText("جست‌وجوی درسنامه"), { target: { value: "" } });
    fireEvent.click(screen.getByText(/کلیه \(۱\)/));
    expect(screen.queryByText(new RegExp(CARDIO))).toBeNull();
    expect(screen.getByText(new RegExp(NEPHRO))).toBeTruthy();
  });

  it("آفلاین: فهرستِ کش‌شدهٔ قبلی با هشدارِ روشن نشان داده می‌شود", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    expect(localStorage.getItem(LIBRARY_CACHE_KEY)).toBeTruthy();
    cleanup();
    clearLibraryCache();

    // شبکه قطع است، ولی کشِ تازه هست → بدونِ درخواستِ شبکه همان فهرست برمی‌گردد
    const offlineFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", offlineFetch);
    await openLibrary();
    expect(offlineFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/🟡 از کشِ محلی \(آفلاین\)/)).toBeTruthy();
    expect(screen.getByText(new RegExp(CARDIO))).toBeTruthy();
  });

  it("وقتی محتوا در مخزن به‌روز شده باشد، نسخهٔ تازه شناخته و در اپ ثبت می‌شود", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    expect(store!.state.libraryVersion).toBe("1@2026-11-08");

    const updated = { ...MANIFEST, version: 2, updatedAt: "2026-11-09" };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => updated }) as unknown as Response));
    fireEvent.click(screen.getByRole("button", { name: /🔄 به‌روزرسانی/ }));
    await screen.findByText(/نسخهٔ محتوا عوض شده/);
    expect(store!.state.libraryVersion).toBe("2@2026-11-09");
    // پیشرفتِ کاربر با به‌روزشدنِ محتوا پاک نمی‌شود
    expect(store!.state.lessonProgress).toEqual({});
  });

  it("تنظیمِ آدرسِ مخزن توسط کاربر، آدرسِ پیش‌فرض را عوض می‌کند و دوباره می‌گیرد", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    fireEvent.click(screen.getByRole("button", { name: "⚙️" }));
    const input = screen.getByLabelText("آدرسِ مخزنِ محتوا");
    fireEvent.change(input, { target: { value: "https://mirror.example.com/lib/" } });
    const mirrorFetch = onlineFetch();
    vi.stubGlobal("fetch", mirrorFetch);
    fireEvent.click(screen.getByRole("button", { name: /ذخیره و دریافت/ }));
    await waitFor(() => expect(mirrorFetch).toHaveBeenCalled());
    expect(String(mirrorFetch.mock.calls[0][0])).toBe("https://mirror.example.com/lib/manifest.json");
    // آدرسِ تازه واقعاً استفاده می‌شود: لینکِ مستقیمِ همان درسنامه از mirror می‌آید
    await waitFor(() =>
      expect(row(CARDIO).getByRole("link").getAttribute("href")).toBe(
        "https://mirror.example.com/lib/cardio/aortic-stenosis.html#mcqs",
      ),
    );
  });
});

describe("📖 دادهٔ کاربر: زمانِ واقعیِ مطالعه، جدا از مدت‌زمانِ محتوا", () => {
  it("بازکردنِ درسنامه بازدید را ثبت می‌کند و تایمر زمانِ واقعیِ مطالعه را می‌شمارد", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    expect(progress()).toBeUndefined();

    const reader = await openReader(CARDIO);
    // فقط فایلِ همان درسنامه در iframe خواسته می‌شود
    expect(within(reader).getByTitle(CARDIO).getAttribute("src")).toBe(`${DEFAULT_LIBRARY_BASE}cardio/aortic-stenosis.html`);
    // بازدید بی‌درنگ ثبت می‌شود، بدونِ یک ثانیه مطالعه
    await waitFor(() => expect(progress()!.visits).toBe(1));
    expect(progress()!.seconds).toBe(0);

    await act(async () => {
      await wait(1300);
    });
    closeReader(reader);
    // موقعِ بستن، ثانیه‌های مانده واریز می‌شود تا چیزی از دست نرود
    await waitFor(() => expect(progress()!.seconds).toBeGreaterThan(0));
    expect(progress()!.visits).toBe(1);
  });

  it("«متوقف» شمارش را نگه می‌دارد و زمانِ الکی ثبت نمی‌شود", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    const reader = await openReader(CARDIO);
    fireEvent.click(within(reader).getByRole("button", { name: /متوقف|⏸/ }));
    await act(async () => {
      await wait(1300);
    });
    closeReader(reader);
    expect(progress()?.seconds ?? 0).toBe(0);
    expect(progress()!.visits).toBe(1);
  });

  it("زمانِ مطالعهٔ کاربر در ردیفِ درسنامه، جدا از مدت‌زمانِ محتوا نشان داده می‌شود", async () => {
    seedState({ lessonProgress: { [CARDIO_ID]: { seconds: 1500, visits: 2, lastAt: Date.now(), done: false } } });
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    const cardio = row(CARDIO);
    // ۲۵ دقیقه مطالعهٔ کاربر در برابرِ ۴۵ دقیقه مدتِ خودِ محتوا
    expect(cardio.getByText(/مطالعهٔ تو: ۲۵ دقیقه/)).toBeTruthy();
    expect(cardio.getByText(/۴۵ دقیقه/)).toBeTruthy();
    expect(cardio.getByText(/۲ بازدید/)).toBeTruthy();
    expect(screen.getByText(/۲۵ دقیقه مطالعهٔ واقعی · ۰ درسنامه تمام‌شده/)).toBeTruthy();
    expect(progress()!.seconds).toBe(1500);
    // این داده در state اپ است، نه در کشِ مخزنِ محتوا
    const cache = JSON.parse(localStorage.getItem(LIBRARY_CACHE_KEY) ?? "{}");
    expect(JSON.stringify(cache)).not.toContain("lessonProgress");
  });

  it("«تمام شد» در اپ ذخیره می‌شود و با فیلترِ «تمام‌نکرده‌ها» کار می‌کند", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();
    fireEvent.click(row(CARDIO).getByRole("button", { name: /علامتِ «تمام شد» برای/ }));
    await waitFor(() => expect(progress()!.done).toBe(true));
    expect(screen.getByText(/۱ درسنامه تمام‌شده/)).toBeTruthy();

    fireEvent.click(screen.getByText(/فقط درسنامه‌هایی که تمام نکرده‌ام/));
    expect(screen.queryByText(new RegExp(CARDIO))).toBeNull();
    expect(screen.getByText(new RegExp(NEPHRO))).toBeTruthy();
    // فیلتر را برمی‌داریم تا ردیفِ همان درسنامه دوباره دیده شود
    fireEvent.click(screen.getByText(/فقط درسنامه‌هایی که تمام نکرده‌ام/));

    // برداشتنِ علامت، زمانِ ثبت‌شده را پاک نمی‌کند
    fireEvent.click(row(CARDIO).getByRole("button", { name: /علامتِ «تمام شد» برای/ }));
    await waitFor(() => expect(progress()?.done).toBeUndefined());
    expect(progress()?.seconds ?? 0).toBe(0);
    expect(progress()?.visits ?? 0).toBe(0);
  });

  it("بازکردنِ دوبارهٔ همان درسنامه رکوردِ تکراری نمی‌سازد؛ زمان روی همان کلید جمع می‌شود", async () => {
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();

    let reader = await openReader(CARDIO);
    await act(async () => {
      await wait(1300);
    });
    closeReader(reader);
    await waitFor(() => expect(progress()!.seconds).toBeGreaterThan(0));
    const firstSeconds = progress()!.seconds;

    reader = await openReader(CARDIO);
    await act(async () => {
      await wait(1300);
    });
    closeReader(reader);
    await waitFor(() => expect(progress()!.seconds).toBeGreaterThan(firstSeconds));
    // یک کلید، یک رکورد — و بازدیدها شمرده شده‌اند
    expect(Object.keys(store!.state.lessonProgress ?? {})).toEqual([CARDIO_ID]);
    expect(progress()!.visits).toBe(2);
  });

  it("زمانِ مطالعه با «ثبت در آمارِ مطالعه» به جلسهٔ مطالعهٔ خودِ اپ هم می‌رود", async () => {
    // دو دقیقه مطالعهٔ قبلیِ همان درسنامه (تا دکمهٔ واریز فعال باشد)
    seedState({ lessonProgress: { [CARDIO_ID]: { seconds: 120, visits: 1, lastAt: Date.now() } } });
    vi.stubGlobal("fetch", onlineFetch());
    await openLibrary();

    // درس و مبحثِ متناظر در اپ — اتصال با همان کلیدِ کاتالوگ (sampleId)
    act(() => {
      store!.addSubject({ name: "قلب و عروق", color: "#0ea5e9", priority: "high", sampleId: "cardiology-nematpour" });
    });
    const subject = store!.state.subjects.at(-1)!;
    act(() => {
      store!.addTopic({
        subjectId: subject.id,
        name: CARDIO,
        volume: 20,
        estimatedMinutes: 45,
        priority: "high",
        difficulty: 2,
        status: "learning",
      });
    });
    const topic = store!.state.topics.at(-1)!;

    const reader = await openReader(CARDIO);
    const creditButton = await within(reader).findByRole("button", { name: /ثبت در آمارِ/ });
    await act(async () => {
      await wait(1300);
    });
    fireEvent.click(creditButton);
    await waitFor(() => expect(store!.state.sessions.length).toBeGreaterThan(0));
    const session = store!.state.sessions.at(-1)!;
    expect(session.topicId).toBe(topic.id);
    // ۲ دقیقهٔ قبلی + ۱ ثانیهٔ همین نشست → ۲ دقیقه در آمارِ مطالعهٔ اپ
    expect(session.durationMinutes).toBe(2);
    // رکوردِ درسنامه هم سرِ جایش می‌ماند: دو دفترِ زمان با هم یکی نمی‌شوند
    expect(progress()!.seconds).toBeGreaterThanOrEqual(120);
  });
});
