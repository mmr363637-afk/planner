// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIBRARY_BASE,
  LIBRARY_CACHE_KEY,
  LIBRARY_STALE_MS,
  LIBRARY_URL_KEY,
  addLessonTime,
  appKeysOfLesson,
  clearLibraryCache,
  completedLessonCount,
  formatDurationFa,
  getLibraryBase,
  groupLessonsBySubject,
  lessonCompletion,
  lessonUrl,
  lessonsForAppKey,
  lessonsForSubject,
  lessonsForTopic,
  libraryHomeUrl,
  libraryQbankUrl,
  librarySubjectForAppKey,
  libraryUrl,
  libraryVersionKey,
  loadLibraryManifest,
  normalizeLibraryManifest,
  progressOf,
  qbankPartUrl,
  qbankStandaloneUrl,
  searchLessons,
  setLibraryBase,
  setLessonDone,
  studiedMinutes,
  totalStudiedSeconds,
  visitLesson,
} from "../lessonLibrary";
import { parseStateText } from "../stateIO";
import type { Subject, Topic } from "../../types";

/** همان ساختاری که مخزنِ محتوا (DATA) در lib/manifest.json منتشر می‌کند */
const RAW_MANIFEST = {
  version: 1,
  schema: "med-library/1",
  updatedAt: "2026-11-08",
  index: "index.html",
  counts: { subjects: 2, lessons: 3, minutes: 95 },
  subjects: [
    { key: "cardio", name: "قلب و عروق", nameEn: "Cardiology", page: "subject/cardio.html", count: 2, minutes: 75, appSubjectKeys: ["cardiology-nematpour"] },
    { key: "nephro", name: "کلیه", count: 1, minutes: 20, appSubjectKeys: ["nephro-book"] },
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
      id: "cardio/heart-failure",
      subject: "cardio",
      title: "نارسایی قلبی",
      path: "cardio/heart-failure.html",
      minutes: 30,
      flashcards: 90,
      mcq: 0,
      appSubjectKeys: ["cardiology-nematpour"],
    },
    {
      id: "nephro/aki",
      subject: "nephro",
      title: "آسیب حاد کلیه",
      path: "nephro/aki.html",
      minutes: 20,
      flashcards: 40,
      appSubjectKeys: ["nephro-book"],
    },
  ],
  qbank: {
    index: "qbank/index.html",
    total: 790,
    parts: [{ part: "cardio", title: "قلب", count: 320, page: "qbank/cardio.html", standalone: "qbank/cardio-standalone.html", chapters: 4 }],
  },
};

const manifest = () => normalizeLibraryManifest(RAW_MANIFEST)!;

const appSubject = (sampleId: string): Subject => ({
  id: `sub-${sampleId}`,
  name: "قلب",
  color: "#0ea5e9",
  priority: "high",
  createdAt: 0,
  sampleId,
});

const appTopic = (subjectId: string): Topic => ({
  id: "topic-1",
  subjectId,
  name: "تنگی دریچهٔ آئورت",
  status: "learning",
  priority: "high",
  estimatedMinutes: 60,
  createdAt: 0,
} as unknown as Topic);

describe("آدرس‌های کتابخانهٔ محتوا", () => {
  beforeEach(() => localStorage.clear());

  it("آدرسِ پیش‌فرضِ مخزنِ محتوا را می‌سازد و اسلشِ اضافه نمی‌کند", () => {
    expect(getLibraryBase()).toBe(DEFAULT_LIBRARY_BASE);
    expect(libraryUrl("manifest.json")).toBe(`${DEFAULT_LIBRARY_BASE}manifest.json`);
    // مسیرِ مطلقِ نسبی‌شده هم به آدرسِ درست می‌رسد (اسلشِ دوباره نمی‌سازد)
    expect(libraryUrl("/cardio/aki.html")).toBe(`${DEFAULT_LIBRARY_BASE}cardio/aki.html`);
    expect(lessonUrl(manifest().lessons[0])).toBe(`${DEFAULT_LIBRARY_BASE}cardio/aortic-stenosis.html`);
    expect(libraryHomeUrl(manifest())).toBe(`${DEFAULT_LIBRARY_BASE}index.html`);
    expect(libraryHomeUrl(null)).toBe(`${DEFAULT_LIBRARY_BASE}index.html`);
  });

  it("تنظیمِ کاربر جای آدرسِ پیش‌فرض را می‌گیرد (مثلاً دامنهٔ خودِ کاربر)", () => {
    setLibraryBase("https://example.com/lib///");
    expect(localStorage.getItem(LIBRARY_URL_KEY)).toBe("https://example.com/lib/");
    expect(getLibraryBase()).toBe("https://example.com/lib/");
    expect(lessonUrl(manifest().lessons[2], getLibraryBase())).toBe("https://example.com/lib/nephro/aki.html");
    setLibraryBase("");
    expect(localStorage.getItem(LIBRARY_URL_KEY)).toBeNull();
    expect(getLibraryBase()).toBe(DEFAULT_LIBRARY_BASE);
  });

  it("آدرسِ آزمون‌های فصل‌به‌فصلِ خودِ کتابخانه (جدا از بانکِ اپ)", () => {
    const m = manifest();
    expect(libraryQbankUrl(m)).toBe(`${DEFAULT_LIBRARY_BASE}qbank/index.html`);
    expect(qbankPartUrl(m.qbank!.parts[0])).toBe(`${DEFAULT_LIBRARY_BASE}qbank/cardio.html`);
    expect(qbankStandaloneUrl(m.qbank!.parts[0])).toBe(`${DEFAULT_LIBRARY_BASE}qbank/cardio-standalone.html`);
  });
});

describe("سالم‌سازی مانیفستِ مخزنِ محتوا", () => {
  it("شمارش‌ها، درس‌ها، درسنامه‌ها و آزمون‌های کتابخانه را کامل می‌خواند", () => {
    const m = manifest();
    expect(m.version).toBe(1);
    expect(m.updatedAt).toBe("2026-11-08");
    expect(m.counts).toEqual({ subjects: 2, lessons: 3, minutes: 95 });
    expect(m.lessons).toHaveLength(3);
    expect(m.lessons[0].mcq).toBe(30);
    expect(m.lessons[0].flashcards).toBe(180);
    expect(m.lessons[0].tables).toBe(12);
    expect(m.qbank?.total).toBe(790);
    expect(m.qbank?.parts[0].count).toBe(320);
    expect(libraryVersionKey(m)).toBe("1@2026-11-08");
    expect(libraryVersionKey(null)).toBe("");
  });

  it("ردیفِ خراب را رد می‌کند، تکراری را یکی می‌کند و شمارشِ نبود را از خودِ ردیف‌ها می‌سازد", () => {
    const m = normalizeLibraryManifest({
      lessons: [
        { title: "بدونِ مسیر" }, // بی‌مسیر → رد
        { path: "a.html" }, // بی‌عنوان → رد
        { title: "سالم", path: "a.html" }, // بی‌id → id از مسیر ساخته می‌شود
        { title: "تکراری", path: "b.html", id: "a" }, // id تکراری → رد
        null,
        "رشته",
      ],
      subjects: [{ key: "x" }, { name: "بی‌کلید" }, { key: "y", name: "درست" }],
    })!;
    expect(m.lessons.map((l) => l.id)).toEqual(["a"]);
    expect(m.subjects.map((s) => s.key)).toEqual(["y"]);
    // شمارش نداشت → از خودِ ردیف‌ها
    expect(m.counts).toEqual({ subjects: 1, lessons: 1, minutes: 0 });
  });

  it("مانیفستِ بی‌محتوا null می‌شود تا «کتابخانه در دسترس نیست» نشان داده شود", () => {
    expect(normalizeLibraryManifest(null)).toBeNull();
    expect(normalizeLibraryManifest({})).toBeNull();
    expect(normalizeLibraryManifest({ lessons: [], subjects: [] })).toBeNull();
    expect(normalizeLibraryManifest("رشته")).toBeNull();
  });
});

describe("خواندنِ مانیفست — فقط آنچه لازم است، با کشِ محلی", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    localStorage.clear();
    clearLibraryCache();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearLibraryCache();
    vi.restoreAllMocks();
  });

  const okJson = (data: unknown) =>
    vi.fn(async () => ({ ok: true, status: 200, json: async () => data }) as unknown as Response);

  it("اول از شبکه می‌خواند و نتیجه را برای آفلاین کش می‌کند", async () => {
    globalThis.fetch = okJson(RAW_MANIFEST) as unknown as typeof fetch;
    const load = await loadLibraryManifest();
    expect(load.source).toBe("network");
    expect(load.manifest?.lessons).toHaveLength(3);
    expect(load.url).toBe(`${DEFAULT_LIBRARY_BASE}manifest.json`);
    // فقط یک درخواست: مانیفست، نه کلِ مخزن
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LIBRARY_CACHE_KEY)).toBeTruthy();
  });

  it("کشِ تازه درخواستِ شبکه نمی‌زند (بارگذاریِ تکراری دادهٔ تکراری نمی‌سازد)", async () => {
    globalThis.fetch = okJson(RAW_MANIFEST) as unknown as typeof fetch;
    await loadLibraryManifest();
    clearLibraryCache();
    const second = await loadLibraryManifest();
    expect(second.source).toBe("cache");
    expect(second.manifest?.lessons).toHaveLength(3);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // «بروزرسانی» دستی کش را نادیده می‌گیرد
    const forced = await loadLibraryManifest({ force: true });
    expect(forced.source).toBe("network");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("در حالتِ آفلاین همان کشِ کهنه برمی‌گردد و خطا هم گزارش می‌شود", async () => {
    globalThis.fetch = okJson(RAW_MANIFEST) as unknown as typeof fetch;
    await loadLibraryManifest();
    const cached = JSON.parse(localStorage.getItem(LIBRARY_CACHE_KEY)!);
    cached.at = Date.now() - LIBRARY_STALE_MS - 1000; // کش کهنه شد
    localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(cached));
    clearLibraryCache();
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const offline = await loadLibraryManifest();
    expect(offline.source).toBe("cache");
    expect(offline.manifest?.lessons).toHaveLength(3);
    expect(offline.error).toContain("Failed to fetch");
  });

  it("بدونِ کش و بدونِ شبکه، صریحاً «در دسترس نیست» می‌گوید (نه صفحهٔ خالیِ بی‌توضیح)", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    const load = await loadLibraryManifest();
    expect(load.source).toBe("none");
    expect(load.manifest).toBeNull();
    expect(load.error).toBe("HTTP 404");
  });

  it("مانیفستِ نامعتبرِ شبکه کش نمی‌شود تا بعداً همان خرابی برنگردد", async () => {
    globalThis.fetch = okJson({ nope: true }) as unknown as typeof fetch;
    const load = await loadLibraryManifest();
    expect(load.source).toBe("none");
    expect(load.error).toContain("نامعتبر");
    expect(localStorage.getItem(LIBRARY_CACHE_KEY)).toBeNull();
  });
});

describe("نگاشتِ درسنامه‌ها به درس/مبحثِ خودِ اپ", () => {
  it("درسنامه‌ها با کلیدِ کاتالوگِ اپ (sampleId) به درسِ کاربر وصل می‌شوند", () => {
    const m = manifest();
    const subject = appSubject("cardiology-nematpour");
    expect(lessonsForSubject(m, subject).map((l) => l.id)).toEqual(["cardio/aortic-stenosis", "cardio/heart-failure"]);
    expect(lessonsForAppKey(m, "nephro-book").map((l) => l.id)).toEqual(["nephro/aki"]);
    expect(lessonsForAppKey(m, "کلیدی-که-نیست")).toEqual([]);
    expect(lessonsForAppKey(null, "nephro-book")).toEqual([]);
    // درسی که sampleId ندارد (درسِ دست‌سازِ کاربر) به چیزی وصل نمی‌شود
    expect(lessonsForSubject(m, { ...subject, sampleId: undefined })).toEqual([]);
  });

  it("مبحثِ اپ از راهِ درسِ والدش درسنامه‌ها را پیدا می‌کند", () => {
    const m = manifest();
    const subject = appSubject("cardiology-nematpour");
    expect(lessonsForTopic(m, appTopic(subject.id), [subject])).toHaveLength(2);
    expect(lessonsForTopic(m, undefined, [subject])).toEqual([]);
    expect(lessonsForTopic(m, appTopic("sub-ناموجود"), [subject])).toEqual([]);
  });

  it("درسِ کتابخانه‌ایِ یک کلیدِ اپ و کلیدهای یک درسنامه", () => {
    const m = manifest();
    expect(librarySubjectForAppKey(m, "cardiology-nematpour")?.name).toBe("قلب و عروق");
    expect(librarySubjectForAppKey(m, "چیزی-نیست")).toBeUndefined();
    expect(appKeysOfLesson(m.lessons[0])).toEqual(["cardiology-nematpour"]);
  });

  it("گروه‌بندی بر اساسِ درسِ کتابخانه و درسنامه‌های بی‌درس گم نمی‌شوند", () => {
    const groups = groupLessonsBySubject(manifest());
    expect(groups.map((g) => g.subject.key)).toEqual(["cardio", "nephro"]);
    expect(groups[0].lessons).toHaveLength(2);

    const orphan = normalizeLibraryManifest({
      subjects: RAW_MANIFEST.subjects,
      lessons: [...RAW_MANIFEST.lessons, { id: "x/y", subject: "ناشناس", title: "درسنامهٔ بی‌درس", path: "x/y.html", minutes: 5 }],
    })!;
    const grouped = groupLessonsBySubject(orphan);
    expect(grouped.at(-1)?.subject.key).toBe("__other");
    expect(grouped.at(-1)?.lessons.map((l) => l.id)).toEqual(["x/y"]);
  });

  it("جست‌وجو در عنوان، درس، مسیر و نامِ فایلِ مبدأ", () => {
    const m = manifest();
    expect(searchLessons(m, "آئورت").map((l) => l.id)).toEqual(["cardio/aortic-stenosis"]);
    expect(searchLessons(m, "aortic").map((l) => l.id)).toEqual(["cardio/aortic-stenosis"]);
    expect(searchLessons(m, "braunwald").map((l) => l.id)).toEqual(["cardio/aortic-stenosis"]);
    expect(searchLessons(m, "   ")).toHaveLength(3);
    expect(searchLessons(null, "آئورت")).toEqual([]);
  });
});

describe("دادهٔ کاربر: زمانِ واقعیِ مطالعه جدا از مدت‌زمانِ محتوا", () => {
  it("«مدت‌زمانِ محتوا» از مانیفست و «زمانِ مطالعه‌شده» از رکوردِ کاربر است", () => {
    const lesson = manifest().lessons[0];
    expect(lesson.minutes).toBe(45); // ویژگیِ خودِ محتوا
    const map = addLessonTime(undefined, lesson.id, 12 * 60, 1000);
    expect(studiedMinutes(map, lesson.id)).toBe(12); // کارِ کاربر
    expect(progressOf(map, lesson.id)).toEqual({ seconds: 720, visits: 0, lastAt: 1000, firstAt: 1000 });
    // پیشرفت = نسبتِ زمانِ کاربر به مدتِ محتوا، و هرگز از ۱ بیشتر نمی‌شود
    expect(lessonCompletion(map, lesson)).toBeCloseTo(12 / 45, 5);
    expect(lessonCompletion(addLessonTime(map, lesson.id, 90 * 60, 2000), lesson)).toBe(1);
    expect(lessonCompletion(undefined, lesson)).toBe(0);
  });

  it("addLessonTime خالص است و ثانیهٔ زیرِ یک رکوردِ الکی نمی‌سازد", () => {
    const base = { "cardio/aki": { seconds: 30, visits: 2, lastAt: 10 } };
    const next = addLessonTime(base, "cardio/aki", 20, 999);
    expect(next["cardio/aki"].seconds).toBe(50);
    expect(next["cardio/aki"].visits).toBe(2); // بازدید این‌جا شمرده نمی‌شود
    expect(base["cardio/aki"].seconds).toBe(30); // ورودی دست‌نخورده
    expect(addLessonTime(base, "cardio/aki", 0.4, 999)).toBe(base);
    expect(addLessonTime(base, "cardio/aki", -60, 999)).toBe(base);
    expect(addLessonTime(undefined, "x", 0)).toEqual({});
  });

  it("visitLesson فقط بازدید را می‌شمارد، بدونِ یک ثانیه مطالعه", () => {
    const visited = visitLesson(undefined, "cardio/aki", 500);
    expect(visited["cardio/aki"]).toEqual({ seconds: 0, visits: 1, lastAt: 500, firstAt: 500 });
    const twice = visitLesson(visited, "cardio/aki", 900);
    expect(twice["cardio/aki"].visits).toBe(2);
    expect(twice["cardio/aki"].firstAt).toBe(500);
    expect(studiedMinutes(twice, "cardio/aki")).toBe(0);
  });

  it("«تمام شد» دستی پیشرفت را ۱۰۰٪ می‌کند و زمانِ ثبت‌شده را پاک نمی‌کند", () => {
    const lesson = manifest().lessons[1];
    const studied = addLessonTime(undefined, lesson.id, 5 * 60, 100);
    const done = setLessonDone(studied, lesson.id, true, 200);
    expect(lessonCompletion(done, lesson)).toBe(1);
    expect(done[lesson.id].seconds).toBe(300);
    expect(done[lesson.id].done).toBe(true);
    expect(completedLessonCount(done)).toBe(1);
    // برگرداندنِ «تمام‌نشد» زمان را نگه می‌دارد
    const undone = setLessonDone(done, lesson.id, false, 300);
    expect(undone[lesson.id].seconds).toBe(300);
    expect(undone[lesson.id].done).toBeUndefined();
    expect(completedLessonCount(undone)).toBe(0);
  });

  it("جمعِ زمانِ مطالعه روی همهٔ درسنامه‌ها", () => {
    let map = addLessonTime(undefined, "a", 600, 1); // ۱۰ دقیقه
    map = addLessonTime(map, "b", 180, 2); // ۳ دقیقه
    expect(totalStudiedSeconds(map)).toBe(780);
    expect(totalStudiedSeconds(undefined)).toBe(0);
    expect(studiedMinutes(map, "a")).toBe(10);
    expect(studiedMinutes(map, "b")).toBe(3);
    expect(studiedMinutes(map, "درسنامه‌ای-که-باز-نشده")).toBe(0);
    // رکوردِ خراب در نقشه کلیدِ کاربر، جمع را NaN نمی‌کند
    expect(totalStudiedSeconds({ a: { seconds: Number.NaN, visits: 0, lastAt: 0 } })).toBe(0);
  });

  it("نمایشِ فارسیِ مدت‌زمان", () => {
    const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
    expect(formatDurationFa(45, fa)).toBe("۴۵ دقیقه");
    expect(formatDurationFa(60, fa)).toBe("۱ ساعت");
    expect(formatDurationFa(135, fa)).toBe("۲ ساعت و ۱۵ دقیقه");
    expect(formatDurationFa(0, fa)).toBe("۰ دقیقه");
    expect(formatDurationFa(-20, fa)).toBe("۰ دقیقه");
  });
});

describe("📖 ذخیره/بازیابیِ پیشرفتِ درسنامه در state اپ", () => {
  it("رکوردِ سالم می‌ماند و رکوردِ خراب به رندر نمی‌رسد", () => {
    const text = JSON.stringify({
      subjects: [],
      topics: [],
      flashcards: [],
      settings: { onboarded: true },
      libraryVersion: "1@2026-11-08",
      lessonProgress: {
        "cardio/as": { seconds: 1500, visits: 2, lastAt: 10, firstAt: 5, done: true, doneAt: 9, cardsAdded: 3 },
        "nephro/aki": { seconds: 60.9, visits: 1.7, lastAt: "خراب" },
        "empty/row": { seconds: 0, visits: 0, lastAt: 0 },
        "broken/row": "نه یک رکورد",
        "": { seconds: 10, visits: 1, lastAt: 1 },
        "x/bad-numbers": { seconds: Number.NaN, visits: -5, lastAt: 3 },
      },
    });
    const state = parseStateText(text)!;
    expect(state.libraryVersion).toBe("1@2026-11-08");
    // ثانیه/بازدیدِ اعشاری گرد می‌شود، مقدارِ غیرعدد صفر
    expect(state.lessonProgress?.["cardio/as"]).toEqual({
      seconds: 1500,
      visits: 2,
      lastAt: 10,
      firstAt: 5,
      done: true,
      doneAt: 9,
      cardsAdded: 3,
    });
    expect(state.lessonProgress?.["nephro/aki"]).toEqual({ seconds: 60, visits: 1, lastAt: 0 });
    // رکوردِ بی‌محتوا، خراب یا بی‌کلید حذف می‌شود تا state بیهوده بزرگ نشود
    // (ردیفی که فقط lastAt دارد و نه ثانیه/بازدید/«تمام‌شده» همان بی‌محتواست)
    expect(state.lessonProgress?.["x/bad-numbers"]).toBeUndefined();
    expect(state.lessonProgress?.["empty/row"]).toBeUndefined();
    expect(state.lessonProgress?.["broken/row"]).toBeUndefined();
    expect(state.lessonProgress?.[""]).toBeUndefined();
    expect(Object.keys(state.lessonProgress ?? {}).sort()).toEqual(["cardio/as", "nephro/aki"]);
  });

  it("state بدونِ این فیلد (نسخهٔ قدیمی) سالم بارگذاری می‌شود — دادهٔ قبلی از دست نمی‌رود", () => {
    const state = parseStateText(JSON.stringify({ subjects: [], topics: [], flashcards: [] }))!;
    expect(state.lessonProgress).toEqual({});
    expect(state.libraryVersion).toBeUndefined();
    // فلش‌کارت‌های قدیمی بدونِ sourceKey هم دست‌نخورده می‌مانند
    const withCards = parseStateText(
      JSON.stringify({
        subjects: [],
        topics: [],
        flashcards: [{ id: "c1", front: "رو", back: "پشت", ef: 2.5, intervalDays: 1, repetitions: 1, dueDate: "2026-01-01", lapses: 0, createdAt: 1, origin: "user" }],
      }),
    )!;
    expect(withCards.flashcards[0].front).toBe("رو");
    expect(withCards.flashcards[0].sourceKey).toBeUndefined();
    // کلیدِ نکته در فلش‌کارتِ تازه ذخیره و بازیابی می‌شود (پایهٔ جلوگیری از تکرار)
    const withKey = parseStateText(
      JSON.stringify({
        subjects: [],
        topics: [],
        flashcards: [{ id: "c2", front: "📌 نکته", back: "پشت", ef: 2.5, intervalDays: 0, repetitions: 0, dueDate: "2026-01-01", lapses: 0, createdAt: 1, origin: "user", sourceKey: "bkp:galb:50:abc123" }],
      }),
    )!;
    expect(withKey.flashcards[0].sourceKey).toBe("bkp:galb:50:abc123");
  });
});
