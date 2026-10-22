import { describe, expect, it } from "vitest";
import type { StudySession, StudyTask, Topic } from "../../types";
import { APPROACH_TIME_FACTOR, estimatePlanLoad, estimateTopicMinutes, minChunkForKind, topicPace } from "../planEstimate";

let n = 0;
function topic(partial: Partial<Topic> & { id: string; estimatedMinutes: number }): Topic {
  n += 1;
  return {
    subjectId: "s1", name: partial.id, volume: 1, priority: "medium", difficulty: 2, status: "learning", createdAt: n,
    ...partial,
  };
}
function task(id: string, topicId: string, planned: number, status: StudyTask["status"] = "done"): StudyTask {
  return { id, topicId, date: "2026-01-01", plannedMinutes: planned, doneMinutes: planned, status, order: 0, priority: "medium" };
}
function session(id: string, topicId: string, taskId: string | undefined, minutes: number): StudySession {
  n += 1;
  return { id, topicId, taskId, startedAt: n, endedAt: n, durationMinutes: minutes, rating: null, mode: "free", date: "2026-01-01" };
}

describe("تخمین زمان بر اساس روش مطالعه", () => {
  it("رفرنس بیشترین و بانک سؤال کمترین زمان را می‌گیرد", () => {
    const t = topic({ id: "t", estimatedMinutes: 120 });
    const reference = estimateTopicMinutes(t, "reference");
    const mixed = estimateTopicMinutes(t, "mixed");
    const notes = estimateTopicMinutes(t, "notes");
    const qbank = estimateTopicMinutes(t, "qbank");
    expect(reference.minutes).toBeGreaterThan(mixed.minutes);
    expect(mixed.minutes).toBeGreaterThan(notes.minutes);
    expect(notes.minutes).toBeGreaterThan(qbank.minutes);
    expect(APPROACH_TIME_FACTOR.qbank).toBeLessThan(1);
  });

  it("ضریب سختی اعمال می‌شود و حداقل ۲۰ دقیقه رعایت می‌شود", () => {
    const easy = topic({ id: "e", estimatedMinutes: 100, difficulty: 1 });
    const hard = topic({ id: "h", estimatedMinutes: 100, difficulty: 3 });
    expect(estimateTopicMinutes(hard, "mixed").minutes).toBeGreaterThan(estimateTopicMinutes(easy, "mixed").minutes);
    const tiny = topic({ id: "tiny", estimatedMinutes: 1, difficulty: 1 });
    expect(estimateTopicMinutes(tiny, "qbank").minutes).toBeGreaterThanOrEqual(20);
  });

  it("عدد دستیِ همان روش بر همه‌چیز مقدم است", () => {
    const t = topic({ id: "t", estimatedMinutes: 300, estimateOverrides: { qbank: 90 } });
    const est = estimateTopicMinutes(t, "qbank");
    expect(est.source).toBe("manual");
    expect(est.minutes).toBe(90);
    expect(estimateTopicMinutes(t, "reference").source).not.toBe("manual");
  });

  it("با سابقهٔ کم، تخمین دست‌نخورده می‌ماند", () => {
    const t = topic({ id: "t", estimatedMinutes: 100 });
    const tasks = [task("k1", "t", 30)];
    const pace = topicPace("t", tasks, [session("s1", "t", "k1", 80)]);
    expect(pace.factor).toBe(1);
    expect(estimateTopicMinutes(t, "mixed", { tasks, sessions: [session("s1", "t", "k1", 80)] }).paceFactor).toBe(1);
  });

  it("اگر کاربر همیشه بیشتر وقت بگذارد، تخمین بزرگ‌تر می‌شود (با سقف)", () => {
    const t = topic({ id: "t", estimatedMinutes: 100 });
    const tasks = [task("a", "t", 30), task("b", "t", 30), task("c", "t", 30)];
    const sessions = [session("s1", "t", "a", 60), session("s2", "t", "b", 60), session("s3", "t", "c", 60)];
    const pace = topicPace("t", tasks, sessions);
    expect(pace.factor).toBeCloseTo(1.6); // سقفِ اصلاح
    const est = estimateTopicMinutes(t, "mixed", { tasks, sessions });
    expect(est.paceFactor).toBe(1.6); // سقف
    expect(est.minutes).toBeGreaterThan(120);
    expect(est.source).toBe("history");
  });

  it("اگر سریع‌تر تمام کند، تخمین کوچک‌تر می‌شود ولی زیر حداقل نمی‌رود", () => {
    const t = topic({ id: "t", estimatedMinutes: 100 });
    const tasks = [task("a", "t", 40), task("b", "t", 40), task("c", "t", 40)];
    const sessions = [session("s1", "t", "a", 10), session("s2", "t", "b", 10), session("s3", "t", "c", 10)];
    const est = estimateTopicMinutes(t, "mixed", { tasks, sessions });
    expect(est.paceFactor).toBeCloseTo(0.6);
    expect(est.minutes).toBeLessThan(100);
  });

  it("کارهای انجام‌نشده در سابقه حساب نمی‌شوند", () => {
    const tasks = [task("a", "t", 30, "pending"), task("b", "t", 30, "pending")];
    const pace = topicPace("t", tasks, [session("s1", "t", "a", 120)]);
    expect(pace.samples).toBe(0);
    expect(pace.factor).toBe(1);
  });
});

describe("کفِ زمان هر نوع تسک و بار کلی برنامه", () => {
  it("کفِ هر نوع با سقف تمرکز کاربر هماهنگ می‌شود", () => {
    expect(minChunkForKind("learn", 90)).toBe(30);
    expect(minChunkForKind("test", 90)).toBe(20);
    expect(minChunkForKind("review", 90)).toBe(10);
    expect(minChunkForKind("learn", 25)).toBe(25);
    expect(minChunkForKind(undefined, undefined)).toBe(30);
  });

  it("بار برنامه را به تفکیک درس و مبحث جمع می‌زند", () => {
    const topics = [
      topic({ id: "a", estimatedMinutes: 100, subjectId: "s1" }),
      topic({ id: "b", estimatedMinutes: 200, subjectId: "s2" }),
    ];
    const load = estimatePlanLoad(topics, { s1: "qbank", s2: "reference" });
    expect(load.byTopic).toHaveLength(2);
    expect(load.byTopic[0].approach).toBe("qbank");
    expect(load.bySubject.s1).toBe(load.byTopic[0].minutes);
    expect(load.totalMinutes).toBe(load.bySubject.s1 + load.bySubject.s2);
    expect(load.totalMinutes).toBeGreaterThan(0);
  });
});
