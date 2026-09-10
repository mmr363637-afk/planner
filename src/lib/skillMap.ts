// ===== نقشه‌ی مهارت — گراف درس و مباحث =====
// درس در مرکز، مباحث حولش دایره‌وار؛ رنگ گره‌ها از وضعیت یادگیری می‌آید.
// چیدمان قطعی (deterministic) است تا تست‌پذیر باشد.

import type { LearningStatus, Subject, Topic } from "../types";

export interface SkillNode {
  id: string;
  name: string;
  kind: "subject" | "topic";
  status: LearningStatus | null; // null برای درسِ مرکزی
  color: string;
  x: number;
  y: number;
  r: number;
  depth: number;
  /** میانگین وضعیت برای والدها (۰..۱) */
  progress: number;
}

export interface SkillEdge {
  from: string; // node id
  to: string;
}

export interface SkillMap {
  nodes: SkillNode[];
  edges: SkillEdge[];
  width: number;
  height: number;
}

const STATUS_SCORE: Record<LearningStatus, number> = {
  not_started: 0,
  learning: 0.35,
  needs_review: 0.65,
  mastered: 1,
};

export function statusColor(status: LearningStatus): string {
  switch (status) {
    case "mastered": return "#eab308"; // طلایی
    case "needs_review": return "#f59e0b"; // کهربایی
    case "learning": return "#14b8a6"; // فیروزه‌ای
    case "not_started": return "#94a3b8"; // طوسی
  }
}

function progressOf(status: LearningStatus): number {
  return STATUS_SCORE[status];
}

export function buildSkillMap(
  subject: Pick<Subject, "id" | "name" | "color">,
  topics: Topic[],
  width = 760,
  height = 560,
): SkillMap {
  const cx = width / 2;
  const cy = height / 2;
  const ownTopics = topics.filter((t) => t.subjectId === subject.id);
  // درخت: parentId فقط اگر والد در همین درس باشد معتبر است
  const idSet = new Set(ownTopics.map((t) => t.id));
  const byParent = new Map<string | null, Topic[]>();
  for (const t of ownTopics) {
    const p = t.parentId && idSet.has(t.parentId) ? t.parentId : null;
    const arr = byParent.get(p) ?? [];
    arr.push(t);
    byParent.set(p, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name, "fa"));
  }

  const nodes: SkillNode[] = [];
  const edges: SkillEdge[] = [];
  // درسِ مرکزی
  const subjProgress = ownTopics.length === 0 ? 0 : ownTopics.reduce((s, t) => s + progressOf(t.status), 0) / ownTopics.length;
  nodes.push({
    id: subject.id,
    name: subject.name,
    kind: "subject",
    status: null,
    color: subject.color,
    x: cx,
    y: cy,
    r: 34,
    depth: 0,
    progress: Math.round(subjProgress * 100) / 100,
  });

  // وزن هر گره = تعداد برگ‌های زیرمجموعه (حداقل ۱) برای تخصیص سهم زاویه
  const weight = (t: Topic): number => {
    const kids = byParent.get(t.id) ?? [];
    return kids.length === 0 ? 1 : kids.reduce((s, k) => s + weight(k), 0);
  };

  const ringRadius = (depth: number) => 92 + depth * 82;

  const place = (t: Topic, a0: number, a1: number, depth: number, parentId: string) => {
    const a = (a0 + a1) / 2;
    const r = ringRadius(depth - 1);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const kids = byParent.get(t.id) ?? [];
    const selfScore = progressOf(t.status);
    const kidsAvg = kids.length === 0 ? selfScore : kids.reduce((s, k) => s + progressOf(k.status), 0) / kids.length;
    nodes.push({
      id: t.id,
      name: t.name,
      kind: "topic",
      status: t.status,
      color: statusColor(t.status),
      x,
      y,
      r: Math.max(10, 18 - depth * 2),
      depth,
      progress: Math.round(((selfScore + kidsAvg) / 2) * 100) / 100,
    });
    edges.push({ from: parentId, to: t.id });
    // تخصیص بازه‌ی زاویه به فرزندان متناسب با وزنشان
    let acc = a0;
    const totalW = kids.reduce((s, k) => s + weight(k), 0);
    for (const k of kids) {
      const span = totalW === 0 ? (a1 - a0) / kids.length : ((a1 - a0) * weight(k)) / totalW;
      place(k, acc, acc + span, depth + 1, t.id);
      acc += span;
    }
  };

  const roots = byParent.get(null) ?? [];
  const totalW = roots.reduce((s, t) => s + weight(t), 0);
  let acc = -Math.PI / 2; // شروع از بالای صفحه
  for (const t of roots) {
    const span = totalW === 0 ? (Math.PI * 2) / Math.max(1, roots.length) : ((Math.PI * 2) * weight(t)) / totalW;
    place(t, acc, acc + span, 1, subject.id);
    acc += span;
  }

  return { nodes, edges, width, height };
}
