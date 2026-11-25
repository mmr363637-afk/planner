// @vitest-environment jsdom
// 🔄 همگام‌سازیِ فلش‌کارت‌ها با مباحثِ خودِ اپ — سناریوی کاربر:
// «بعداً فلش‌کارت اضافه کردم، مباحثش با مباحثِ خودِ اپ همگام شود.»
//
// سه شکافِ واقعی این‌جا قفل می‌شوند:
//   ۱. ورودِ بستهٔ کارت با نامِ کمی متفاوت، مبحثِ تکراری نمی‌سازد و به مبحثِ اپ می‌چسبد.
//   ۲. کارت‌های بی‌مبحث با نشانهٔ قطعی (درسنامه/پک) خودکار و با نامِ نزدیک پس از تأیید وصل می‌شوند.
//   ۳. کارتِ ساخته‌شده حینِ خواندنِ درسنامه، مبحثِ همان درسنامه را می‌گیرد.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "../store";
import { STORAGE_KEY } from "../lib/persist";
import {
  CARD_TOPIC_MIN_SCORE,
  cardSyncSummary,
  packTopicMap,
  planCardTopicSync,
  resolveTopicByName,
} from "../lib/cardSync";
import { planCardPackageImport, type CardPackage } from "../lib/cardPackage";
import type { Flashcard, StudyTask, Subject, Topic } from "../types";

const wrapper = ({ children }: { children: ReactNode }) => <StoreProvider>{children}</StoreProvider>;

const subject = (id: string, name: string, sampleId?: string): Subject => ({
  id,
  name,
  color: "#0d9488",
  priority: "medium",
  createdAt: 1,
  ...(sampleId ? { sampleId } : {}),
});

const topic = (id: string, subjectId: string, name: string, sampleId?: string): Topic => ({
  id,
  subjectId,
  name,
  volume: 10,
  estimatedMinutes: 60,
  priority: "medium",
  difficulty: 2,
  status: "not_started",
  createdAt: 1,
  ...(sampleId ? { sampleId } : {}),
});

const card = (id: string, over: Partial<Flashcard> = {}): Flashcard => ({
  id,
  front: `سؤال ${id}`,
  back: `جواب ${id}`,
  ef: 2.5,
  intervalDays: 0,
  repetitions: 0,
  dueDate: "2026-11-25",
  lapses: 0,
  createdAt: 1,
  ...over,
});

const SUBJECTS = [subject("s-surg", "جراحی", "surgery-lawrence"), subject("s-path", "پاتولوژی")];
const TOPICS = [
  topic("t-preop", "s-surg", "ارزیابی قبل از عمل", "surgery-lawrence-001"),
  topic("t-postop", "s-surg", "مراقبت بعد از عمل", "surgery-lawrence-002"),
  topic("t-tumor", "s-path", "تومورهای خوش‌خیم"),
];

describe("resolveTopicByName — مبحثِ اپ برای یک نامِ بیرونی", () => {
  it("sampleId را به هر نامی ترجیح می‌دهد", () => {
    expect(resolveTopicByName({ name: "هر نامی", sampleId: "surgery-lawrence-002" }, { topics: TOPICS, subjects: SUBJECTS })).toMatchObject({
      topicId: "t-postop",
      via: "sample",
    });
  });

  it("نامِ کمی بلندتر/کوتاه‌تر را (برخلافِ قبل) به همان مبحث می‌چسباند — نه مبحثِ تازه", () => {
    const res = resolveTopicByName(
      { name: "ارزیابی قبل از عمل و مراقبت از بیمار جراحی", subjectName: "جراحی" },
      { topics: TOPICS, subjects: SUBJECTS },
    );
    expect(res).toMatchObject({ topicId: "t-preop" });
    expect(res!.score).toBeGreaterThanOrEqual(CARD_TOPIC_MIN_SCORE);
  });

  it("نامِ کوتاه و مبهم را حدس نمی‌زند", () => {
    expect(resolveTopicByName({ name: "جراحی" }, { topics: TOPICS, subjects: SUBJECTS })).toBeUndefined();
    expect(resolveTopicByName({ name: "هیچ‌چیز" }, { topics: TOPICS, subjects: SUBJECTS })).toBeUndefined();
  });

  it("در تساویِ امتیاز، همان درس برنده است", () => {
    const twins = [
      topic("p1", "s-surg", "آبسه ریه"),
      topic("p2", "s-path", "پنومونی و آبسه ریه"),
    ];
    const res = resolveTopicByName({ name: "پنومونی و آبسه ریه", subjectName: "پاتولوژی" }, { topics: twins, subjects: SUBJECTS });
    expect(res?.topicId).toBe("p2");
  });
});

describe("ورودِ بستهٔ کارت — همگام با مبحثِ اپ", () => {
  const pkg = (topicName: string): CardPackage => ({
    format: "study-planner.cards",
    version: 1,
    exportedAt: 1,
    topics: [{ key: `name:جراحی::${topicName}`, name: topicName, subjectName: "جراحی" }],
    cards: [{ front: "q", back: "a", topicKey: `name:جراحی::${topicName}` }],
  });

  it("نامِ توصیفیِ بلندتر، مبحثِ تکراری نمی‌سازد و کارت به مبحثِ اپ می‌رسد", () => {
    const plan = planCardPackageImport(pkg("ارزیابی قبل از عمل و مراقبت از بیمار جراحی"), {
      topics: TOPICS,
      subjects: SUBJECTS,
      cards: [],
    });
    expect(plan.topicsToCreate).toHaveLength(0);
    expect(plan.cardsToAdd[0].matchedTopicId).toBe("t-preop");
    expect(plan.stats.orphan).toBe(0);
  });

  it("مبحثی که واقعاً در اپ نیست همچنان ساخته می‌شود (هیچ داده‌ای گم نمی‌شود)", () => {
    const plan = planCardPackageImport(pkg("احیای قلبی-ریوی پیشرفته"), { topics: TOPICS, subjects: SUBJECTS, cards: [] });
    expect(plan.topicsToCreate).toHaveLength(1);
    expect(plan.topicsToCreate[0].name).toBe("احیای قلبی-ریوی پیشرفته");
  });
});

describe("planCardTopicSync — نقشهٔ همگام‌سازی", () => {
  it("کارتِ درسنامه با اتصالِ همان درسنامه، و کارتِ پک با مبحثِ پک وصل می‌شوند", () => {
    const plan = planCardTopicSync({
      cards: [
        card("c1", { lessonId: "infectious/132-lung-abscess" }),
        card("c2", { packId: "surgery-lawrence-001", origin: "curated" }),
        card("c3"),
        card("c4", { topicId: "t-tumor" }),
      ],
      topics: TOPICS,
      subjects: SUBJECTS,
      lessonLinks: { "infectious/132-lung-abscess": "t-postop" },
      packTopic: new Map([["surgery-lawrence-001", "t-preop"]]),
    });
    expect(plan.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "c1", topicId: "t-postop", via: "lesson" }),
        expect.objectContaining({ cardId: "c2", topicId: "t-preop", via: "pack" }),
      ]),
    );
    expect(plan.unresolved.map((u) => u.cardId)).toEqual(["c3"]);
    expect(plan.alreadyLinked).toBe(1);
    expect(cardSyncSummary(plan)).toContain("۲ کارت");
  });

  it("اتصالِ درسنامه به مبحثِ حذف‌شده یا مبحثِ ناموجود نادیده گرفته می‌شود", () => {
    const plan = planCardTopicSync({
      cards: [card("c1", { lessonId: "x/y" }), card("c2", { packId: "gone" })],
      topics: TOPICS,
      subjects: SUBJECTS,
      lessonLinks: { "x/y": "deleted" },
      packTopic: new Map([["gone", "deleted"]]),
    });
    expect(plan.suggestions).toHaveLength(0);
    expect(plan.unresolved).toHaveLength(2);
  });

  it("درسِ تکراری (غیرِ رسمی) گزارش می‌شود ولی خودکار ادغام نمی‌شود", () => {
    const dupSubjects = [...SUBJECTS, subject("s-surg-dup", "جراحی")];
    const plan = planCardTopicSync({
      cards: [card("c1", { topicId: "t-dup" })],
      topics: [...TOPICS, topic("t-dup", "s-surg-dup", "ارزیابی قبل از عمل")],
      subjects: dupSubjects,
    });
    expect(plan.duplicateSubjects).toHaveLength(1);
    expect(plan.duplicateSubjects[0]).toMatchObject({ id: "s-surg-dup", officialId: "s-surg" });
  });

  it("packTopicMap فقط پک‌هایی را می‌آورد که مبحثشان واقعاً در فهرست است", () => {
    const map = packTopicMap(
      [
        { id: "p1", topicSampleId: "surgery-lawrence-001" },
        { id: "p2", topicSampleId: "missing-sample" },
        { id: "p3" },
      ],
      TOPICS,
    );
    expect([...map.entries()]).toEqual([["p1", "t-preop"]]);
  });
});

// ───────────────────────────── انتها به انتها با store ─────────────────────────────

const baseTasks = (): StudyTask[] => [];

function seedFlashcards(cards: Flashcard[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: SUBJECTS,
      topics: TOPICS,
      flashcards: cards,
      tasks: baseTasks(),
      settings: { onboarded: true },
    }),
  );
}

describe("🔄 همگام‌سازیِ خودکار و دستی در store", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T12:00:00"));
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("وصل‌کردنِ درسنامه به مبحث، کارت‌های همان درسنامه را خودکار وصل می‌کند", () => {
    seedFlashcards([card("c1", { lessonId: "infectious/132-lung-abscess" })]);
    const { result } = renderHook(useStore, { wrapper });
    expect(result.current.state.flashcards[0].topicId).toBeUndefined();

    act(() => result.current.linkLessonTopic("infectious/132-lung-abscess", "t-preop"));

    expect(result.current.state.flashcards[0].topicId).toBe("t-preop");
  });

  it("applyCardSync فقط پیشنهادهای قطعی را اعمال می‌کند و بقیه را دستِ کاربر می‌گذارد", () => {
    seedFlashcards([card("c1", { packId: "surgery-lawrence-001" }), card("c2")]);
    const { result } = renderHook(useStore, { wrapper });

    // پک‌ها در تست لود نمی‌شوند؛ نقشهٔ ساختگی را خودمان می‌دهیم (همان قراردادِ store)
    const plan = {
      duplicateSubjects: [],
      unresolved: [{ cardId: "c2", preview: "سؤال c2" }],
      alreadyLinked: 0,
      suggestions: [{ cardId: "c1", topicId: "t-preop", topicName: "ارزیابی قبل از عمل", via: "pack" as const, score: 1, preview: "سؤال c1" }],
    };
    let linked = 0;
    act(() => {
      linked = result.current.applyCardSync(plan).linked;
    });

    expect(linked).toBe(1);
    expect(result.current.state.flashcards.find((c) => c.id === "c1")?.topicId).toBe("t-preop");
    expect(result.current.state.flashcards.find((c) => c.id === "c2")?.topicId).toBeUndefined();
  });

  it("linkFlashcardTopic کارت را وصل می‌کند و با null برمی‌گرداند", () => {
    seedFlashcards([card("c1")]);
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.linkFlashcardTopic("c1", "t-tumor"));
    expect(result.current.state.flashcards[0].topicId).toBe("t-tumor");
    act(() => result.current.linkFlashcardTopic("c1", null));
    expect(result.current.state.flashcards[0].topicId).toBeUndefined();
  });

  it("مبحثِ ناموجود به کارت وصل نمی‌شود (اتصالِ مرده ساخته نمی‌شود)", () => {
    seedFlashcards([card("c1")]);
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.linkFlashcardTopic("c1", "nope"));
    expect(result.current.state.flashcards[0].topicId).toBeUndefined();
  });
});

describe("@مبحث در ورودِ گروهی — کارت از همان لحظه به مبحثِ اپ می‌چسبد", () => {
  it("نشانهٔ صریحِ @ مبحث را جدا می‌کند و پاسخ را دست‌نخورده می‌گذارد", async () => {
    const { parseBulkCards } = await import("../lib/cloze");
    const parsed = parseBulkCards("مکانیسم فوروزماید؛مهار پمپ Na/K؛@نارسایی قلب\nپادتن؛IgG");
    expect(parsed.cards[0]).toMatchObject({ front: "مکانیسم فوروزماید", back: "مهار پمپ Na/K", topicName: "نارسایی قلب" });
    // سطرِ بدونِ نشانه (و با «؛» در پاسخ) مثلِ قبل می‌ماند
    expect(parsed.cards[1]).toMatchObject({ front: "پادتن", back: "IgG" });
    expect(parsed.cards[1].topicName).toBeUndefined();
  });

  it("نشانهٔ @ بدونِ پاسخ، سطر را نامعتبر می‌کند (کارتِ خالی ساخته نمی‌شود)", async () => {
    const { parseBulkCards } = await import("../lib/cloze");
    expect(parseBulkCards("سوال؛@مبحث").skipped).toBe(1);
  });
});
