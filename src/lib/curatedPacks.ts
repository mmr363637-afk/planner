// ===== پک‌های «فلش‌کارت منتخب» =====
// داده‌ی کارت‌ها generated است: scripts/generateCuratedPacks.mjs + src/lib/curatedPacksData.ts
// هر پک متناظر با یک فصل از منبع درسی است؛ اگر به مبحث کاتالوگ وصل شده باشد
// topicSampleId دارد و کارت‌های اضافه‌شده به همان مبحثِ درون اپ attach می‌شوند.
import { GENERATED_PACKS } from "./curatedPacksData";

export interface CuratedCard {
  /** روی کارت (سوال) */
  f: string;
  /** پشت کارت (پاسخ) */
  b: string;
}

export interface CuratedPack {
  /** کلید دائمی و یکتا (معمولاً همان sampleId مبحث؛ چند فصلِ هم‌مبحث پسوند #N می‌گیرند) */
  id: string;
  /** اگر ست باشد، کارت‌ها بعد از افزودن به مبحثِ کاربر با این sampleId وصل می‌شوند */
  topicSampleId?: string;
  /** کلید درس در کاتالوگ — برای گروه‌بندی و رنگ */
  subjectKey: string;
  /** نام درس برای وقتی مبحث در فهرست کاربر نیست */
  subjectName: string;
  /** نام مبحث/فصل برای وقتی مبحث در فهرست کاربر نیست */
  topicName: string;
  cards: CuratedCard[];
}

export const CURATED_PACKS: CuratedPack[] = GENERATED_PACKS.map((p) => ({
  id: p.id,
  topicSampleId: p.topicSampleId,
  subjectKey: p.subjectKey,
  subjectName: p.subjectName,
  topicName: p.topicName,
  cards: p.cards.map(([f, b]) => ({ f, b })),
}));

/** کل پک‌های متعلق به یک مبحث کاتالوگ (بر اساس sampleId) */
export function curatedPacksOfTopic(sampleId: string | undefined): CuratedPack[] {
  if (!sampleId) return [];
  return CURATED_PACKS.filter((p) => p.topicSampleId === sampleId);
}

/** پیدا کردن پک بر اساس شناسه */
export function curatedPackById(id: string): CuratedPack | undefined {
  return CURATED_PACKS.find((p) => p.id === id);
}

/** کلید یکتا برای تشخیص «این کارت منتخب قبلاً اضافه شده» — مستقل از id کارت */
export function curatedCardKey(packId: string, front: string): string {
  return `${packId}::${front.trim()}`;
}
