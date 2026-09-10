// ===== پادکست مرور — صفِ گفتارِ مرورهای سررسید برای پخش صوتی =====
import type { Flashcard, Mistake, Review, Subject, Topic } from "../types";

export interface PodcastItem {
  title: string;
  text: string;
}

/**
 * از مرورهای سررسید، فلش‌کارت‌های سررسید و اشتباهات سررسید،
 * یک فهرست گفتار می‌سازد. ترتیب: اشتباهات، بعد مرور مباحث، بعد کارت‌ها.
 */
export function buildPodcastQueue(args: {
  reviews: Review[];
  flashcards: Flashcard[];
  mistakes: Mistake[];
  topicById: Map<string, Topic>;
  subjectOfTopic: (topicId: string) => Subject | undefined;
  subjectById: Map<string, Subject>;
  limit?: number;
}): PodcastItem[] {
  const { reviews, flashcards, mistakes, topicById, subjectOfTopic, subjectById, limit = 25 } = args;
  const out: PodcastItem[] = [];

  const subjectNameOf = (topicId?: string, subjectId?: string): string => {
    if (topicId) {
      const s = subjectOfTopic(topicId);
      if (s) return s.name;
    }
    if (subjectId) return subjectById.get(subjectId)?.name ?? "";
    return "";
  };

  for (const m of mistakes) {
    if (out.length >= limit) break;
    const subj = subjectNameOf(m.topicId, m.subjectId);
    out.push({
      title: `📓 اشتباه${subj ? ` · ${subj}` : ""}`,
      text: `${m.question}. ${m.answer ? `پاسخ درست: ${m.answer}.` : ""}${m.cause ? ` علت اشتباه: ${m.cause}.` : ""}`.trim(),
    });
  }
  for (const r of reviews) {
    if (out.length >= limit) break;
    const topic = topicById.get(r.topicId);
    if (!topic) continue;
    const subj = subjectOfTopic(r.topicId)?.name ?? "";
    out.push({
      title: `🔁 ${topic.name}`,
      text: `مرور شماره ${r.reviewNumber} مبحث ${topic.name}${subj ? ` از درس ${subj}` : ""}. ${topic.description ?? ""}`.trim(),
    });
  }
  for (const c of flashcards) {
    if (out.length >= limit) break;
    out.push({ title: `🃏 ${c.front.slice(0, 40)}`, text: `${c.front}. پاسخ: ${c.back}` });
  }
  return out;
}
