// ===== بستهٔ اشتراک فلش‌کارت (مبحث‌محور) =====
// خروجیِ استاندارد و خوانا که هم متن کارت‌ها و هم ساختار (مبحث/درس) را نگه می‌دارد.
// هنگام ورود، مبحث‌ها با sampleId یا نامِ نرمال‌شده تطبیق داده می‌شوند؛ اگر نبودند
// ساخته می‌شوند و کارت‌های تکراری (همان مبحث + همان متن) دوباره اضافه نمی‌شوند.
import type { Flashcard, Subject, Topic } from "../types";
import { normalizeText } from "./cardQuiz";

export const CARD_PACKAGE_FORMAT = "study-planner.cards";
export const CARD_PACKAGE_VERSION = 1;

export interface PackageTopic {
  key: string;
  name: string;
  subjectName: string;
  sampleId?: string;
}

export interface PackageCard {
  front: string;
  back: string;
  topicKey?: string;
  note?: string;
  highlights?: string[];
  bookmarked?: boolean;
}

export interface CardPackage {
  format: string;
  version: number;
  exportedAt: number;
  topics: PackageTopic[];
  cards: PackageCard[];
}

const MAX_TEXT = 5000;
const MAX_OPTIONS = 40;

/** کلید پایدارِ مبحث در بسته: sampleId اگر باشد، وگرنه نامِ نرمال‌شدهٔ درس/مبحث */
export function packageTopicKey(topic: Pick<Topic, "sampleId" | "name">, subjectName = ""): string {
  if (topic.sampleId) return `sample:${topic.sampleId}`;
  return `name:${normalizeText(subjectName)}::${normalizeText(topic.name)}`;
}

function clean(text: unknown, max = MAX_TEXT): string {
  return typeof text === "string" ? text.trim().slice(0, max) : "";
}

/**
 * ساخت بسته از هر زیرمجموعه‌ای از کارت‌ها — همان چیزی که «اشتراک یک مبحث» لازم دارد.
 * کارت‌های بدون مبحث هم با topicKey خالی می‌آیند (هیچ داده‌ای بی‌صدا حذف نمی‌شود).
 */
export function buildCardPackage(
  cards: Flashcard[],
  topics: Topic[],
  subjects: Subject[],
  opts: { exportedAt?: number; title?: string } = {},
): CardPackage {
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const used = new Map<string, PackageTopic>();
  const outCards: PackageCard[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const front = clean(card.front);
    const back = clean(card.back);
    if (!front || !back) continue;
    const topic = card.topicId ? topicById.get(card.topicId) : undefined;
    const subject = topic ? subjectById.get(topic.subjectId) : undefined;
    let topicKey: string | undefined;
    if (topic) {
      topicKey = packageTopicKey(topic, subject?.name ?? "");
      if (!used.has(topicKey)) {
        used.set(topicKey, {
          key: topicKey,
          name: topic.name,
          subjectName: subject?.name ?? "",
          sampleId: topic.sampleId,
        });
      }
    }
    const dupKey = `${topicKey ?? ""}|${normalizeText(front)}|${normalizeText(back)}`;
    if (seen.has(dupKey)) continue;
    seen.add(dupKey);
    const item: PackageCard = { front, back, topicKey };
    if (card.note?.trim()) item.note = card.note.trim().slice(0, MAX_TEXT);
    if (card.highlights?.length) {
      const highlights = [...new Set(card.highlights.map((h) => clean(h, 300)).filter(Boolean))].slice(0, MAX_OPTIONS);
      if (highlights.length > 0) item.highlights = highlights;
    }
    if (card.bookmark) item.bookmarked = true;
    outCards.push(item);
  }
  return {
    format: CARD_PACKAGE_FORMAT,
    version: CARD_PACKAGE_VERSION,
    exportedAt: opts.exportedAt ?? Date.now(),
    topics: [...used.values()],
    cards: outCards,
  };
}

export function serializeCardPackage(pkg: CardPackage): string {
  return JSON.stringify(pkg, null, 2);
}

export type ParsePackageResult =
  | { ok: true; pkg: CardPackage }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * خواندن بسته — هم فرمت خودِ اپ، هم آرایهٔ سادهٔ {front, back} (خروجی ابزارهای دیگر).
 * خطاها روشن برمی‌گردند تا کاربر بداند کدام فایل پذیرفته نشد.
 */
export function parseCardPackage(text: string): ParsePackageResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "فایل JSON معتبر نیست." };
  }
  // آرایهٔ ساده یا {cards:[...]}
  if (Array.isArray(raw)) return normalizePackage({ cards: raw });
  if (!isRecord(raw)) return { ok: false, error: "ساختار فایل شناسایی نشد." };
  if (raw.format === CARD_PACKAGE_FORMAT) {
    const version = typeof raw.version === "number" ? raw.version : CARD_PACKAGE_VERSION;
    if (version > CARD_PACKAGE_VERSION) {
      return { ok: false, error: "این بسته با نسخهٔ تازه‌تری از اپ ساخته شده است." };
    }
  }
  if (!Array.isArray(raw.cards)) return { ok: false, error: "فایل هیچ کارتی ندارد." };
  return normalizePackage(raw);
}

function normalizePackage(raw: Record<string, unknown>): ParsePackageResult {
  const rawTopics = Array.isArray(raw.topics) ? raw.topics : [];
  const topics: PackageTopic[] = [];
  for (const t of rawTopics) {
    if (!isRecord(t)) continue;
    const name = clean(t.name, 300);
    if (!name) continue;
    const subjectName = clean(t.subjectName, 300);
    const key = clean(t.key, 400) || packageTopicKey({ name, sampleId: typeof t.sampleId === "string" ? t.sampleId : undefined }, subjectName);
    if (topics.some((x) => x.key === key)) continue;
    topics.push({ key, name, subjectName, sampleId: typeof t.sampleId === "string" ? t.sampleId : undefined });
  }
  const cards: PackageCard[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const c of raw.cards as unknown[]) {
    if (!isRecord(c)) {
      skipped += 1;
      continue;
    }
    const front = clean(c.front);
    const back = clean(c.back);
    if (!front || !back) {
      skipped += 1;
      continue;
    }
    const topicKey = clean(c.topicKey, 400) || undefined;
    const key = `${topicKey ?? ""}|${normalizeText(front)}|${normalizeText(back)}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    const card: PackageCard = { front, back };
    if (topicKey) card.topicKey = topicKey;
    if (typeof c.note === "string" && c.note.trim()) card.note = c.note.trim().slice(0, MAX_TEXT);
    if (Array.isArray(c.highlights)) {
      const highlights = [...new Set(c.highlights.map((h) => clean(h, 300)).filter(Boolean))].slice(0, MAX_OPTIONS);
      if (highlights.length > 0) card.highlights = highlights;
    }
    if (c.bookmarked === true) card.bookmarked = true;
    cards.push(card);
  }
  if (cards.length === 0) return { ok: false, error: "هیچ کارت معتبری در فایل پیدا نشد." };
  return {
    ok: true,
    pkg: {
      format: CARD_PACKAGE_FORMAT,
      version: CARD_PACKAGE_VERSION,
      exportedAt: typeof raw.exportedAt === "number" ? raw.exportedAt : Date.now(),
      topics,
      cards,
    },
  };
}

export interface TopicToCreate {
  key: string;
  name: string;
  subjectName: string;
  /** نام درسِ موجود که مبحث باید زیرش ساخته شود (نرمال‌شده) — خالی یعنی درس تازه */
  newSubjectName: string;
}

export interface CardToAdd extends PackageCard {
  /** مبحث موجود که کارت به آن وصل می‌شود (اگر تطبیق داده شد) */
  matchedTopicId?: string;
  /** کلید مبحثی که قرار است تازه ساخته شود */
  newTopicKey?: string;
}

export interface ImportPlan {
  topicsToCreate: TopicToCreate[];
  cardsToAdd: CardToAdd[];
  stats: {
    total: number;
    duplicates: number;
    invalid: number;
    /** کارت‌هایی که مبحثشان در فایل نبود و بدون مبحث وارد می‌شوند */
    orphan: number;
  };
}

/**
 * برنامهٔ ورود (بدون تغییر state): چه مبحث‌هایی ساخته شود، چه کارت‌هایی اضافه شود و
 * چند کارت تکراری/نامعتبر رد شود. تکراری = همان مبحث + همان متن روی/پشت.
 */
export function planCardPackageImport(
  pkg: CardPackage,
  existing: { topics: Topic[]; subjects: Subject[]; cards: Flashcard[] },
): ImportPlan {
  const subjectByName = new Map(existing.subjects.map((s) => [normalizeText(s.name), s]));
  const topicBySample = new Map(existing.topics.filter((t) => t.sampleId).map((t) => [t.sampleId as string, t]));
  const topicByName = new Map<string, Topic[]>();
  for (const t of existing.topics) {
    const subject = existing.subjects.find((s) => s.id === t.subjectId);
    const key = `${normalizeText(subject?.name ?? "")}::${normalizeText(t.name)}`;
    topicByName.set(key, [...(topicByName.get(key) ?? []), t]);
  }
  const resolveTopic = (packageTopic: PackageTopic): Topic | undefined => {
    if (packageTopic.sampleId) {
      const bySample = topicBySample.get(packageTopic.sampleId);
      if (bySample) return bySample;
    }
    const byName = topicByName.get(`${normalizeText(packageTopic.subjectName)}::${normalizeText(packageTopic.name)}`);
    if (byName && byName.length === 1) return byName[0];
    const loose = existing.topics.filter((t) => normalizeText(t.name) === normalizeText(packageTopic.name));
    return loose.length === 1 ? loose[0] : undefined;
  };

  const topicMatch = new Map<string, { id?: string; key: string }>();
  const topicsToCreate: TopicToCreate[] = [];
  for (const t of pkg.topics) {
    const matched = resolveTopic(t);
    topicMatch.set(t.key, { id: matched?.id, key: t.key });
    if (matched) continue;
    const subjectKey = normalizeText(t.subjectName);
    const existingSubject = subjectByName.get(subjectKey);
    topicsToCreate.push({
      key: t.key,
      name: t.name,
      subjectName: t.subjectName,
      newSubjectName: existingSubject ? "" : t.subjectName,
    });
    // تطبیق‌های بعدی همین بسته با همین کلید
    topicByName.set(`${subjectKey}::${normalizeText(t.name)}`, [
      ...(topicByName.get(`${subjectKey}::${normalizeText(t.name)}`) ?? []),
    ]);
  }

  const existingKeys = new Set(
    existing.cards.map((c) => `${c.topicId ?? ""}|${normalizeText(c.front)}|${normalizeText(c.back)}`),
  );
  const seen = new Set<string>();
  const cardsToAdd: CardToAdd[] = [];
  let duplicates = 0;
  let invalid = 0;
  let orphan = 0;
  for (const card of pkg.cards) {
    const front = clean(card.front);
    const back = clean(card.back);
    if (!front || !back) {
      invalid += 1;
      continue;
    }
    const match = card.topicKey ? topicMatch.get(card.topicKey) : undefined;
    const matchedTopicId = match?.id;
    const newTopicKey = match && !match.id ? match.key : undefined;
    const key = `${matchedTopicId ?? (newTopicKey ? `new:${newTopicKey}` : "")}|${normalizeText(front)}|${normalizeText(back)}`;
    // مقایسه با کارت‌های موجود معمولاً با topicId انجام می‌شود؛ اگر مبحث تازه است،
    // همان متن در هر مبحثی که باشد تکراری محسوب نمی‌شود (مبحث متفاوت = کارت متفاوت).
    const globalDuplicate = existing.cards.some(
      (c) => normalizeText(c.front) === normalizeText(front) && normalizeText(c.back) === normalizeText(back) && (c.topicId ?? "") === (matchedTopicId ?? ""),
    );
    if (seen.has(key) || existingKeys.has(key) || globalDuplicate) {
      duplicates += 1;
      continue;
    }
    if (!matchedTopicId && !newTopicKey) orphan += 1;
    seen.add(key);
    const toAdd: CardToAdd = { ...card, front, back, matchedTopicId, newTopicKey };
    cardsToAdd.push(toAdd);
  }
  return { topicsToCreate, cardsToAdd, stats: { total: pkg.cards.length, duplicates, invalid, orphan } };
}

/** نامِ فایل خروجی — مبحث‌محور و قابل خواندن */
export function packageFilename(topicNames: string[], dateKey: string): string {
  const base = topicNames.filter(Boolean).slice(0, 2).map((n) => n.replace(/[\\/:*?"<>|\s]+/g, "-")).join("+");
  return `flashcards-${base || "all"}-${dateKey}.json`;
}
