// ===== ساختار درختی مباحث (زیرمبحث) =====
import type { Topic } from "../types";

/** آیا این مبحث والد است (زیرمبحث دارد)؟ */
export function isParentTopic(topic: Topic, allTopics: Topic[]): boolean {
  return allTopics.some((t) => t.parentId === topic.id);
}

/** فقط مباحث برگ — همین‌ها زمان‌بندی/مطالعه می‌شوند */
export function leafTopics(allTopics: Topic[]): Topic[] {
  return allTopics.filter((t) => !isParentTopic(t, allTopics));
}

/** خود مبحث + همه‌ی نسل‌های زیرش */
export function descendantsOf(topicId: string, allTopics: Topic[]): Topic[] {
  const out: Topic[] = [];
  const stack = [topicId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const t of allTopics) {
      if (t.parentId === cur) {
        out.push(t);
        stack.push(t.id);
      }
    }
  }
  return out;
}

/** زنجیره‌ی والدین از نزدیک‌ترین تا ریشه (برای نمایش مسیر) */
export function ancestorsOf(topic: Topic, allTopics: Topic[]): Topic[] {
  const byId = new Map(allTopics.map((t) => [t.id, t]));
  const out: Topic[] = [];
  let cur = topic.parentId ? byId.get(topic.parentId) : undefined;
  let guard = 0;
  while (cur && guard++ < 20) {
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** عمق مبحث در درخت (۰ = درس‌سطح) — با شکستن حلقه‌های معیوب */
export function depthOf(topic: Topic, allTopics: Topic[]): number {
  return ancestorsOf(topic, allTopics).length;
}

/**
 * وضعیت تجمعی مبحث والد از پایین به بالا:
 * همه‌ی برگ‌ها mastered → mastered؛ همه شروع‌نشده → not_started؛ غیر این → learning.
 */
export function aggregateStatus(topic: Topic, allTopics: Topic[]): Topic["status"] {
  const kids = descendantsOf(topic.id, allTopics);
  if (kids.length === 0) return topic.status;
  const statuses = kids.map((t) => t.status);
  if (statuses.every((s) => s === "mastered")) return "mastered";
  if (statuses.every((s) => s === "not_started")) return "not_started";
  return "learning";
}

/** مرتب‌سازی نایشی: والد قبل از فرزندان، بر اساس createdAt */
export function sortedForDisplay(topics: Topic[]): Topic[] {
  const byParent = new Map<string | undefined, Topic[]>();
  for (const t of topics) {
    const key = t.parentId && topics.some((x) => x.id === t.parentId) ? t.parentId : undefined;
    const list = byParent.get(key) ?? [];
    list.push(t);
    byParent.set(key, list);
  }
  const out: Topic[] = [];
  const walk = (parent: string | undefined) => {
    for (const t of (byParent.get(parent) ?? []).sort((a, b) => a.createdAt - b.createdAt)) {
      out.push(t);
      walk(t.id);
    }
  };
  walk(undefined);
  // مباحث یتیم (والد حذف‌شده) را هم در انتها بیاور
  for (const t of topics) if (!out.includes(t)) out.push(t);
  return out;
}
