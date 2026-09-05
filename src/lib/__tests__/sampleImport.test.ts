import { describe, expect, it } from "vitest";
import { SAMPLE_SUBJECTS, type SampleSubject } from "../sampleData";
import { mergeSampleData, normalizeSampleName } from "../sampleImport";
import type { Subject, Topic } from "../../types";

const subject = (name: string): Subject => ({ id: "old-subject", name, color: "#123456", priority: "low", createdAt: 10 });
const topic = (name: string): Topic => ({
  id: "old-topic", subjectId: "old-subject", name, description: "یادداشت شخصی",
  volume: 27, estimatedMinutes: 43, difficulty: 1, priority: "low", status: "mastered", createdAt: 11,
});
const cardio = SAMPLE_SUBJECTS.find((s) => s.id === "cardiology-harrison")!;

function idFactory() {
  let n = 0;
  return () => `new-${++n}`;
}

describe("medical sample catalogue", () => {
  it("includes all requested Harrison courses and Herring radiology with editable outlines", () => {
    for (const name of ["قلب", "غدد", "کلیه", "روماتولوژی", "خون", "گوارش", "ریه"]) {
      const sample = SAMPLE_SUBJECTS.find((s) => s.name === `${name} (هاریسون)`);
      expect(sample, name).toBeDefined();
      expect(sample!.topics.length).toBeGreaterThan(5);
    }
    expect(SAMPLE_SUBJECTS.find((s) => s.name === "رادیولوژی (هرینگ)")!.topics.length).toBeGreaterThan(5);
    expect(SAMPLE_SUBJECTS).toHaveLength(13);
    const allTopics = SAMPLE_SUBJECTS.flatMap((s) => s.topics);
    expect(new Set(SAMPLE_SUBJECTS.map((s) => s.id)).size).toBe(SAMPLE_SUBJECTS.length);
    expect(new Set(allTopics.map((t) => t.id)).size).toBe(allTopics.length);
    for (const s of SAMPLE_SUBJECTS) {
      expect(new Set(s.topics.map((t) => normalizeSampleName(t.name))).size).toBe(s.topics.length);
      for (const t of s.topics) {
        expect(t.minutes).toBeGreaterThan(0);
        expect([1, 2, 3]).toContain(t.difficulty);
      }
    }
  });

  it("is idempotent on repeated imports and keeps every entity ID", () => {
    const first = mergeSampleData([], [], SAMPLE_SUBJECTS, idFactory(), 100);
    const second = mergeSampleData(first.subjects, first.topics);
    const third = mergeSampleData(second.subjects, second.topics);
    expect(second.addedSubjects).toBe(0);
    expect(second.addedTopics).toBe(0);
    expect(third).toEqual(second);
    expect(second.subjects).toEqual(first.subjects);
    expect(second.topics).toEqual(first.topics);
    expect(first.topics.every((t) => first.subjects.some((s) => s.id === t.subjectId))).toBe(true);
  });

  it("adopts pre-update names and aliases without a second cardiology course or resetting progress", () => {
    const oldSubject = subject("قلب");
    const oldTopic = topic("Heart Failure");
    const merged = mergeSampleData([oldSubject], [oldTopic], [cardio], idFactory());
    expect(merged.addedSubjects).toBe(0);
    expect(merged.addedTopics).toBe(cardio.topics.length - 1);
    expect(merged.subjects[0]).toEqual({ ...oldSubject, sampleId: cardio.id });
    expect(merged.topics[0]).toEqual({ ...oldTopic, sampleId: cardio.topics[0].id });
    expect(merged.topics.every((t) => t.subjectId === oldSubject.id)).toBe(true);
    // Input records stay untouched, including the legacy local IDs used by sessions/reviews.
    expect(oldSubject.sampleId).toBeUndefined();
    expect(oldTopic.sampleId).toBeUndefined();
  });

  it("only adds missing topics when an older, untagged catalogue is loaded", () => {
    const oldCatalogue = SAMPLE_SUBJECTS.slice(0, 6).map((s) => ({
      ...s,
      name: s.id === cardio.id ? "قلب" : s.name,
      topics: s.topics.slice(0, s.id === cardio.id ? 3 : undefined).map((t) => ({ ...t, name: t.aliases?.[0] ?? t.name })),
    }));
    const old = mergeSampleData([], [], oldCatalogue, idFactory());
    const subjects = old.subjects.map(({ sampleId: _sampleId, ...s }) => s);
    const topics = old.topics.map(({ sampleId: _sampleId, ...t }) => t);
    const upgraded = mergeSampleData(subjects, topics);
    expect(upgraded.subjects).toHaveLength(SAMPLE_SUBJECTS.length);
    expect(upgraded.addedSubjects).toBe(7);
    expect(upgraded.topics).toHaveLength(SAMPLE_SUBJECTS.flatMap((s) => s.topics).length);
    expect(upgraded.topics.slice(0, topics.length).map((t) => t.id)).toEqual(topics.map((t) => t.id));
    expect(mergeSampleData(upgraded.subjects, upgraded.topics).addedTopics).toBe(0);
  });

  it("recognizes Persian/Arabic letters, whitespace, half-spaces and English case", () => {
    expect(normalizeSampleName("  كليه (هاريسون) ")).toBe(normalizeSampleName("کلیه‌ (هاریسون)"));
    const oldSubject = subject(" قلب  (هاريسون) ");
    const oldTopic = topic(" heart   failure ");
    const merged = mergeSampleData([oldSubject], [oldTopic], [cardio]);
    expect(merged.addedSubjects).toBe(0);
    expect(merged.addedTopics).toBe(cardio.topics.length - 1);
  });

  it("stable keys survive custom renames and future catalogue renames/reordering", () => {
    const first = mergeSampleData([], [], [cardio], idFactory());
    first.subjects[0] = { ...first.subjects[0], name: "قلب خودم", priority: "high" };
    first.topics[0] = { ...first.topics[0], name: "فصل مهم من", status: "mastered", estimatedMinutes: 17 };
    const renamedCatalogue: SampleSubject[] = [{ ...cardio, name: "نام جدید منبع", topics: [...cardio.topics].reverse().map((t) => ({ ...t, name: `ویرایش تازه ${t.name}` })) }];
    const updated = mergeSampleData(first.subjects, first.topics, renamedCatalogue);
    expect(updated.subjects).toEqual(first.subjects);
    expect(updated.topics).toEqual(first.topics);
    expect(updated.addedSubjects + updated.addedTopics).toBe(0);
  });

  it("fills only a missing/new topic, preserving custom topics and estimates", () => {
    const first = mergeSampleData([], [], [cardio], idFactory());
    const missing = first.topics.pop()!;
    const custom = { ...topic("یادداشت‌های کلاس من"), subjectId: first.subjects[0].id };
    const merged = mergeSampleData(first.subjects, [...first.topics, custom], [cardio]);
    expect(merged.addedSubjects).toBe(0);
    expect(merged.addedTopics).toBe(1);
    expect(merged.topics.find((t) => t.id === custom.id)).toEqual(custom);
    expect(merged.topics.filter((t) => t.sampleId === missing.sampleId)).toHaveLength(1);
  });

  it("does not delete old duplicates or unrelated custom courses with their own history", () => {
    const subjects = [subject("قلب"), { ...subject("قلب"), id: "old-duplicate" }, { ...subject("قلب کودکان"), id: "custom" }];
    const topics = [topic("Heart Failure"), { ...topic("Heart Failure"), id: "duplicate-topic", subjectId: "old-duplicate" }];
    const merged = mergeSampleData(subjects, topics, [cardio]);
    expect(merged.addedSubjects).toBe(0);
    expect(merged.subjects.map((s) => s.id)).toEqual(subjects.map((s) => s.id));
    expect(merged.topics.find((t) => t.id === "duplicate-topic")).toEqual(topics[1]);
    expect(mergeSampleData(merged.subjects, merged.topics, [cardio]).addedTopics).toBe(0);
  });
});
