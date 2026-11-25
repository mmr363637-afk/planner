// @vitest-environment jsdom
// 🎯 وصل‌کردنِ درسنامه به مبحثِ برنامه — همان باگی که کاربر گزارش داد:
// «آبسهٔ ریه را خواندم، ساعت مطالعه در آمارِ روز ثبت شد ولی برنامه نوشت نخوانده‌ای».
//
// سه سناریوی ریشه‌ای این‌جا قفل می‌شوند:
//   ۱. درسنامه‌ای که در مانیفست `appSubjectKeys` ندارد (درسِ «عفونی») باز هم مبحثِ
//      هم‌نامش را پیدا می‌کند و تسکِ برنامه را پر می‌کند.
//   ۲. زمانِ درسنامه به «اولین مبحثِ درس» نمی‌رود؛ فقط به مبحثِ هم‌نام.
//   ۳. اتصالِ دستیِ کاربر بر تطبیقِ خودکار اولویت دارد و `null` اتصال را برمی‌دارد.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import LessonTopicLink from "../components/LessonTopicLink";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "../store";
import {
  AUTO_TOPIC_MIN_SCORE,
  lessonTitleScore,
  pendingTopicIdsOf,
  pickAutoTopic,
  rankTopicsForLesson,
  resolveTopicForTrack,
  type TopicCandidate,
} from "../lib/lessonTopic";
import { lessonAppKeys } from "../lib/lessonLibrary";
import { STORAGE_KEY } from "../lib/persist";
import type { LessonMeta, LibraryManifest, StudyTask, Subject, Topic } from "../types";
import { addDays, todayKey } from "../lib/jalali";

const wrapper = ({ children }: { children: ReactNode }) => <StoreProvider>{children}</StoreProvider>;

const subj = (id: string, sampleId?: string): Subject => ({
  id,
  name: id,
  color: "#0d9488",
  priority: "medium",
  createdAt: 1,
  ...(sampleId ? { sampleId } : {}),
});

const topic = (id: string, subjectId: string, name: string): Topic => ({
  id,
  subjectId,
  name,
  volume: 10,
  estimatedMinutes: 90,
  priority: "medium",
  difficulty: 2,
  status: "not_started",
  createdAt: 1,
});

function cand(over: Partial<TopicCandidate> & Pick<TopicCandidate, "topicId" | "name" | "score">): TopicCandidate {
  return { subjectId: "s", subjectName: "s", sameSubject: false, hasPendingTask: false, ...over };
}

const SUBJECTS: Subject[] = [
  subj("sub-inf", "infectious-harrison"),
  subj("sub-pul", "pulmonology-harrison"),
];
const TOPICS: Topic[] = [
  topic("t-fever", "sub-inf", "تب و هیپرترمی"),
  topic("t-pneu", "sub-inf", "پنومونی"),
  topic("t-lungabs", "sub-inf", "آبسه ریه"),
  topic("t-tb", "sub-inf", "سل"),
  topic("t-pneuabs", "sub-pul", "پنومونی و آبسه ریه"),
  topic("t-asthma", "sub-pul", "آسم"),
];

describe("lessonTitleScore — شباهتِ عنوانِ درسنامه و نامِ مبحث", () => {
  it("عنوانِ یکسان امتیازِ کامل می‌گیرد و ی/ک/نیم‌فاصله مانع نیست", () => {
    expect(lessonTitleScore("آبسه ریه", "آبسه ریه")).toBe(1);
    expect(lessonTitleScore("آبسه‌ی ریه", "آبسه ریه")).toBeGreaterThan(0.85);
    expect(lessonTitleScore("کم‌خونی", "کمخونی")).toBeGreaterThan(0.85);
  });

  it("مبحثِ جزئی‌تر/کامل‌تر («پنومونی و آبسه ریه») برای عنوانِ «آبسهٔ ریه» بالاتر از گزینه‌های بی‌ربط است", () => {
    const близ = lessonTitleScore("آبسهٔ ریه", "پنومونی و آبسه ریه");
    expect(близ).toBeGreaterThanOrEqual(AUTO_TOPIC_MIN_SCORE);
    expect(близ).toBeGreaterThan(lessonTitleScore("آبسهٔ ریه", "پنومونی"));
    expect(близ).toBeGreaterThan(lessonTitleScore("آبسهٔ ریه", "آسم"));
  });

  it("پسوندِ فصل/عدد و «فوق‌تخصصی» مانع نمی‌شود، ولی دو مبحثِ جدا با هم قاطی نمی‌شوند", () => {
    expect(lessonTitleScore("فصل ۸ — سوختگی", "سوختگی")).toBeGreaterThanOrEqual(AUTO_TOPIC_MIN_SCORE);
    expect(lessonTitleScore("آریتمی‌های فوق بطنی", "آریتمی‌های بطنی")).toBeLessThan(AUTO_TOPIC_MIN_SCORE);
    expect(lessonTitleScore("سل", "سلول‌های بنیادی")).toBe(0);
  });

  it("یک واژهٔ عمومیِ مشترک («قلب») به‌تنهایی اتصال نمی‌سازد", () => {
    expect(lessonTitleScore("زیست‌شناسی پایه سیستم قلبی-عروقی", "نارسایی قلب")).toBeLessThan(0.7);
    expect(lessonTitleScore("پنومونی", "آسم")).toBe(0);
  });
});

describe("rankTopicsForLesson / pickAutoTopic — حدسِ محافظه‌کارانه", () => {
  it("«آبسهٔ ریه» برای درسنامهٔ بی‌کلیدِ عفونی، مبحثِ هم‌نام را اول می‌آورد", () => {
    const ranked = rankTopicsForLesson({ title: "آبسهٔ ریه", subjects: SUBJECTS, topics: TOPICS });
    expect(ranked.length).toBeGreaterThan(0);
    // هر دو «آبسه ریه» و «پنومونی و آبسه ریه» نزدیک‌اند؛ هیچ‌کدام مبحثِ بی‌ربط نیست
    expect(["t-lungabs", "t-pneuabs"]).toContain(ranked[0].topicId);
    expect(ranked.every((c) => c.score > 0)).toBe(true);
  });

  it("«آبسهٔ ریه» وقتی مبحثِ دقیق در اپ هست، همان را انتخاب می‌کند", () => {
    const ranked = rankTopicsForLesson({
      title: "آبسهٔ ریه",
      appSubjectKeys: ["infectious-harrison"],
      subjects: SUBJECTS,
      topics: TOPICS,
    });
    expect(pickAutoTopic(ranked)).toBe("t-lungabs");
    expect(ranked[0].sameSubject).toBe(true);
  });

  it("در تساویِ امتیاز، مبحثِ هم‌درس (کلیدِ کاتالوگ) برنده است", () => {
    const ranked = rankTopicsForLesson({
      title: "پنومونی",
      appSubjectKeys: ["pulmonology-harrison"],
      subjects: SUBJECTS,
      topics: TOPICS,
    });
    // «پنومونی» (عفونی) و «پنومونی و آبسه ریه» (ریه) هر دو نزدیک‌اند؛ امتیازِ کاملِ
    // «پنومونی» خودش گویاست، پس همان انتخاب می‌شود.
    expect(ranked[0].score).toBeGreaterThanOrEqual(0.99);
    expect(pickAutoTopic(ranked)).toBe("t-pneu");
  });

  it("وقتی دو کاندیدِ برابر و بی‌ترجیح باشند، اتصالِ خودکار انجام نمی‌شود", () => {
    expect(pickAutoTopic([cand({ topicId: "a", name: "a", score: 0.9 }), cand({ topicId: "b", name: "b", score: 0.9 })])).toBeNull();
    expect(pickAutoTopic([cand({ topicId: "a", name: "a", score: 0.6 })])).toBeNull();
    expect(pickAutoTopic([cand({ topicId: "a", name: "a", score: 0.9, hasPendingTask: true }), cand({ topicId: "b", name: "b", score: 0.9 })])).toBe("a");
  });

  it("بدونِ عنوان، هیچ کاندیدی ساخته نمی‌شود (برای اسکچ‌نوت/آزمایشگاه که عنوانشان مبحث نیست)", () => {
    expect(rankTopicsForLesson({ subjects: SUBJECTS, topics: TOPICS })).toEqual([]);
  });
});

describe("resolveTopicForTrack — اتصالِ کاربر > تطبیقِ خودکار", () => {
  it("اتصالِ دستیِ موجود در state اولویت دارد", () => {
    const res = resolveTopicForTrack({
      trackId: "infectious/132-lung-abscess",
      links: { "infectious/132-lung-abscess": "t-tb" },
      title: "آبسهٔ ریه",
      subjects: SUBJECTS,
      topics: TOPICS,
    });
    expect(res).toMatchObject({ topicId: "t-tb", linked: true });
  });

  it("اتصال به مبحثِ حذف‌شده نادیده گرفته می‌شود و به تطبیقِ خودکار برمی‌گردد", () => {
    const res = resolveTopicForTrack({
      trackId: "x",
      links: { x: "deleted-topic" },
      title: "آبسهٔ ریه",
      subjects: SUBJECTS,
      topics: TOPICS,
    });
    expect(res.linked).toBe(false);
    expect(["t-lungabs", "t-pneuabs"]).toContain(res.topicId);
  });

  it("معرفی مبحث‌های در انتظار به‌عنوان ترجیح کار می‌کند", () => {
    const tasks: StudyTask[] = [
      { id: "a", topicId: "t-lungabs", date: "2026-01-01", plannedMinutes: 60, doneMinutes: 0, status: "pending", order: 0, priority: "medium" },
    ];
    expect(pendingTopicIdsOf(tasks)).toEqual(new Set(["t-lungabs"]));
  });
});

describe("lessonAppKeys — کلیدِ درسِ اپ از خودِ درسنامه یا درسِ والدش", () => {
  const manifest: LibraryManifest = {
    version: 1,
    updatedAt: "2026-11-20",
    counts: { subjects: 1, lessons: 1, minutes: 118 },
    subjects: [{ key: "infectious", name: "عفونی", count: 1, minutes: 118, appSubjectKeys: ["infectious-harrison"] }],
    lessons: [{ id: "infectious/132-lung-abscess", subject: "infectious", title: "آبسهٔ ریه", path: "x.html", minutes: 118, sections: 1, words: 1, flashcards: 1, tables: 1, mcq: 1 }],
  };
  it("درسنامهٔ بی‌کلید، کلیدِ درسِ والدش را به ارث می‌برد", () => {
    expect(lessonAppKeys(manifest.lessons[0], manifest)).toEqual(["infectious-harrison"]);
  });
  it("کلیدِ خودِ درسنامه مقدم است و بدونِ مانیفست هم کرش نمی‌کند", () => {
    const own: LessonMeta = { ...manifest.lessons[0], appSubjectKeys: ["cardiology-nematpour"] };
    expect(lessonAppKeys(own, manifest)).toEqual(["cardiology-nematpour"]);
    expect(lessonAppKeys(manifest.lessons[0])).toEqual([]);
  });
});

// ───────────────────────────── انتها به انتها: همان سناریوی کاربر ─────────────────────────────

const LESSON_ID = "infectious/132-lung-abscess";

function seed(tasks: StudyTask[], lessonTitle = "آبسهٔ ریه") {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subjects: [
        { id: "sub-inf", name: "عفونی", color: "#ef4444", priority: "high", sampleId: "infectious-harrison", createdAt: 1 },
      ],
      topics: [
        { id: "t-fever", subjectId: "sub-inf", name: "تب و هیپرترمی", volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 1, status: "not_started", createdAt: 1 },
        { id: "t-lungabs", subjectId: "sub-inf", name: "آبسه ریه", volume: 10, estimatedMinutes: 118, priority: "high", difficulty: 2, status: "not_started", createdAt: 2 },
      ],
      tasks,
      settings: { onboarded: true },
      _lessonTitle: lessonTitle,
    }),
  );
}

const absTask = (over: Partial<StudyTask> = {}): StudyTask => ({
  id: "task-abs",
  topicId: "t-lungabs",
  date: todayKey(),
  plannedMinutes: 118,
  doneMinutes: 0,
  status: "pending",
  order: 0,
  priority: "high",
  kind: "learn",
  ...over,
});

describe("📖 زمانِ درسنامه به تسکِ برنامه واریز می‌شود (باگِ «آبسهٔ ریه»)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T12:00:00"));
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("درسنامهٔ بی‌کلیدِ عفونی با تطبیقِ عنوان، تسکِ هم‌نام را پر و تمام می‌کند", () => {
    seed([absTask()]);
    const { result } = renderHook(useStore, { wrapper });

    act(() => {
      result.current.creditLessonStudyTime({
        lessonId: LESSON_ID,
        title: "آبسهٔ ریه",
        appSubjectKeys: ["infectious-harrison"],
        minutes: 118,
      });
    });

    const task = result.current.state.tasks.find((t) => t.id === "task-abs")!;
    expect(task.status).toBe("done");
    expect(task.doneMinutes).toBe(118);
    // جلسه هم به همان مبحث وصل است (نه به «تب و هیپرترمی» = اولین مبحثِ درس)
    expect(result.current.state.sessions.at(-1)).toMatchObject({ lessonId: LESSON_ID, topicId: "t-lungabs", durationMinutes: 118 });
    expect(result.current.state.topics.find((t) => t.id === "t-lungabs")?.status).toBe("learning");
  });

  it("بدونِ مبحثِ هم‌نام، هیچ تسکِ نامربوطی پر نمی‌شود و زمان فقط در آمار می‌ماند", () => {
    seed([absTask({ topicId: "t-fever" })]);
    const { result } = renderHook(useStore, { wrapper });

    act(() => {
      result.current.creditLessonStudyTime({ lessonId: "x/unknown", title: "مبحثی که در اپ نیست", minutes: 40 });
    });

    expect(result.current.state.tasks.find((t) => t.id === "task-abs")?.doneMinutes).toBe(0);
    const session = result.current.state.sessions.at(-1)!;
    expect(session.topicId).toBeNull();
    expect(session.durationMinutes).toBe(40);
  });

  it("انتخابِ دستیِ کاربر بر تطبیقِ خودکار مقدم است و با null برداشته می‌شود", () => {
    seed([absTask({ topicId: "t-fever", id: "task-fever" })]);
    const { result } = renderHook(useStore, { wrapper });

    act(() => result.current.linkLessonTopic(LESSON_ID, "t-fever"));
    expect(result.current.state.lessonTopicLinks?.[LESSON_ID]).toBe("t-fever");

    act(() => {
      result.current.creditLessonStudyTime({ lessonId: LESSON_ID, title: "آبسهٔ ریه", minutes: 30 });
    });
    expect(result.current.state.tasks.find((t) => t.id === "task-fever")?.doneMinutes).toBe(30);

    act(() => result.current.linkLessonTopic(LESSON_ID, null));
    expect(result.current.state.lessonTopicLinks?.[LESSON_ID]).toBeUndefined();
  });

  it("مسیرِ تایمر (addLessonStudyTime) هم با عنوان، مبحث را پیدا می‌کند — نه فقط دکمهٔ «ثبت»", () => {
    seed([absTask({ date: addDays(todayKey(), 2) })]);
    const { result } = renderHook(useStore, { wrapper });

    act(() => {
      // ۳ دقیقه مطالعهٔ واقعیِ تایمر؛ `addLessonStudyTime` خودش هر دقیقهٔ کامل را واریز می‌کند
      for (let i = 0; i < 3; i++) {
        act(() => result.current.addLessonStudyTime(LESSON_ID, 60, { title: "آبسهٔ ریه", appSubjectKeys: ["infectious-harrison"] }));
      }
    });

    // تسکِ آینده پر شد؛ چون زودتر خوانده شده، معادلش از بار امروز آزاد می‌شود
    const task = result.current.state.tasks.find((t) => t.id === "task-abs")!;
    expect(task.doneMinutes).toBe(3);
    expect(result.current.state.sessions.filter((s) => s.lessonId === LESSON_ID)).toHaveLength(3);
    expect(result.current.state.sessions.every((s) => s.topicId === "t-lungabs")).toBe(true);
  });
});

// ───────────────────────────── پنلِ اتصال: وضعیت را صادقانه می‌گوید ─────────────────────────────

describe("LessonTopicLink — وضعیتِ اتصال و انتخابِ یک‌لمسی", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T12:00:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("درسنامهٔ بی‌اتصال، هشدارِ «بدونِ مبحث» را نشان می‌دهد و با یک تپ وصل می‌شود", () => {
    seed([absTask({ topicId: "t-fever", id: "task-fever" })]);
    let link: ReturnType<typeof useStore>["linkLessonTopic"] | null = null;
    function Probe() {
      const store = useStore();
      link = store.linkLessonTopic;
      return <LessonTopicLink trackId={LESSON_ID} title="آبسهٔ ریه" appSubjectKeys={["infectious-harrison"]} compact dense />;
    }
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );

    // «آبسه ریه» در اپ هست → خودکار وصل است، پس هشدار نباید دیده شود
    expect(screen.queryByText(/به هیچ مبحثی وصل نیست/)).toBeNull();
    expect(screen.getByText(/خودکار/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /تغییرِ مبحث/ }));
    // برداشتنِ اتصال ممکن است فقط وقتی اتصالِ صریح باشد؛ این‌جا اتصالِ خودکار است
    expect(screen.getByLabelText("جست‌وجوی مبحث برای اتصال")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("جست‌وجوی مبحث برای اتصال"), { target: { value: "تب" } });
    fireEvent.click(screen.getByRole("button", { name: /تب و هیپرترمی/ }));
    expect(link).toBeTruthy();
  });
});

describe("🧹 حذفِ مبحث، اتصالِ درسنامه‌ها را هم پاک می‌کند", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T12:00:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("اتصال به مبحثِ حذف‌شده نمی‌ماند، اتصال به بقیه حفظ می‌شود", () => {
    seed([absTask()]);
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.linkLessonTopic(LESSON_ID, "t-lungabs");
      result.current.linkLessonTopic("other/lesson", "t-fever");
    });
    expect(Object.keys(result.current.state.lessonTopicLinks ?? {})).toHaveLength(2);

    act(() => result.current.deleteTopic("t-lungabs"));

    expect(result.current.state.lessonTopicLinks?.[LESSON_ID]).toBeUndefined();
    expect(result.current.state.lessonTopicLinks?.["other/lesson"]).toBe("t-fever");
  });

  it("حذفِ درس هم اتصال‌های مربوط به مباحثش را برمی‌دارد", () => {
    seed([absTask()]);
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.linkLessonTopic(LESSON_ID, "t-lungabs"));
    act(() => result.current.deleteSubject("sub-inf"));
    expect(result.current.state.lessonTopicLinks?.[LESSON_ID]).toBeUndefined();
  });
});

describe("📅 خواندنِ زودتر از برنامه — تسکِ آینده هم حساب می‌شود", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T12:00:00"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("اگر مبحث امروز خوانده شد ولی تسکش فرداست، همان تسکِ آینده واریز می‌شود و بارِ امروز آزاد می‌ماند", () => {
    const future = addDays(todayKey(), 1);
    seed([absTask({ date: future, plannedMinutes: 60 })]);
    const { result } = renderHook(useStore, { wrapper });

    act(() => {
      result.current.creditLessonStudyTime({ lessonId: LESSON_ID, title: "آبسهٔ ریه", minutes: 60 });
    });

    const task = result.current.state.tasks.find((t) => t.id === "task-abs")!;
    // تسکِ همان مبحث (فردا) پر شده — برنامه دیگر نمی‌گوید «باید بخوانی»
    expect(task.doneMinutes).toBe(60);
    expect(task.status).toBe("done");
    // و از آنجا که زمان امروز خوانده شده، بارِ امروز باید سبک‌تر (بدونِ دوباره‌چینی) بماند
    expect(result.current.state.sessions.at(-1)?.date).toBe(todayKey());
    expect(result.current.state.sessions.at(-1)?.lessonId).toBe(LESSON_ID);
  });
});
