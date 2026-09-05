import type { Subject, Topic } from "../types";
import { defaultId } from "./planner";
import { SAMPLE_SUBJECTS, type SampleSubject } from "./sampleData";

/** Exact matching, allowing Persian/Arabic glyph and spacing differences in old backups. */
export function normalizeSampleName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\s\u200c-\u200f()[\]«»]/g, "")
    .toLowerCase();
}

function matchesName(name: string, sample: { name: string; aliases?: string[] }): boolean {
  const normalized = normalizeSampleName(name);
  return [sample.name, ...(sample.aliases ?? [])].some((candidate) => normalizeSampleName(candidate) === normalized);
}

/**
 * Additive, idempotent catalogue import. Stable sample keys survive renaming/reordering.
 * Pre-key backups are adopted by exact names/known aliases, retaining their local IDs,
 * progress, estimates and all references from plans, sessions and reviews.
 * Never deletes or merges existing entities: an older duplicate may have its own history.
 */
export function mergeSampleData(
  existingSubjects: readonly Subject[],
  existingTopics: readonly Topic[],
  catalogue: readonly SampleSubject[] = SAMPLE_SUBJECTS,
  idFactory: () => string = defaultId,
  now = Date.now(),
) {
  const subjects = [...existingSubjects];
  const topics = [...existingTopics];

  for (const [i, sample] of catalogue.entries()) {
    let subjectIndex = subjects.findIndex((s) => s.sampleId === sample.id);
    if (subjectIndex < 0) subjectIndex = subjects.findIndex((s) => !s.sampleId && matchesName(s.name, sample));

    let subject: Subject;
    if (subjectIndex >= 0) {
      subject = subjects[subjectIndex];
      if (!subject.sampleId) {
        subject = { ...subject, sampleId: sample.id };
        subjects[subjectIndex] = subject;
      }
    } else {
      subject = {
        id: idFactory(),
        sampleId: sample.id,
        name: sample.name,
        color: sample.color,
        priority: i === 0 ? "high" : "medium",
        createdAt: now + i,
      };
      subjects.push(subject);
    }

    for (const [j, sampleTopic] of sample.topics.entries()) {
      let topicIndex = topics.findIndex((t) => t.sampleId === sampleTopic.id);
      if (topicIndex < 0) {
        topicIndex = topics.findIndex((t) => t.subjectId === subject.id && !t.sampleId && matchesName(t.name, sampleTopic));
      }
      if (topicIndex >= 0) {
        if (!topics[topicIndex].sampleId) topics[topicIndex] = { ...topics[topicIndex], sampleId: sampleTopic.id };
        continue;
      }
      topics.push({
        id: idFactory(),
        sampleId: sampleTopic.id,
        subjectId: subject.id,
        name: sampleTopic.name,
        volume: Math.round(sampleTopic.minutes / 6),
        estimatedMinutes: sampleTopic.minutes,
        priority: j === 0 ? "high" : "medium",
        difficulty: sampleTopic.difficulty,
        status: "not_started",
        createdAt: now + i * 100 + j,
      });
    }
  }

  return {
    subjects,
    topics,
    addedSubjects: subjects.length - existingSubjects.length,
    addedTopics: topics.length - existingTopics.length,
  };
}
