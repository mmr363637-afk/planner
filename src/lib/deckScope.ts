// ===== دامنه‌ی یک «مجموعه» (مبحث/پک منتخب) =====
// یک مجموعه در تب کارت‌ها یا با کلید `t:<topicId>` (مبحثِ کاربر) شناسایی می‌شود یا با
// `p:<packId>` (پکی که مبحثش در فهرست کاربر نیست). هر دو جای اپ — ویوی فلش‌کارت‌ها و تب
// مرور — باید «کدام کارت‌ها داخل این مجموعه‌اند» و «چند کارت منتخب هنوز اضافه نشده»
// را یک‌جور حساب کنند؛ این ماژول همان منطق خالص و مشترک است (بدون وابستگی به React تا
// چانکِ سنگینِ کاربرت‌ها به‌خاطر این چند تابع زودتر لود نشود).

import { curatedCardKey, curatedPackById, curatedPacksOfTopic, type CuratedPack } from "./curatedPacks";
import type { Flashcard, Topic } from "../types";

/** کارت‌های داخل دامنه‌ی یک مجموعه — بدون فیلتر سررسید (کلید خالی = همه‌ی کارت‌ها) */
export function deckScopedCards(
  flashcards: Flashcard[],
  deckKey: string | undefined,
  topicById: Map<string, Topic>,
): Flashcard[] {
  if (!deckKey) return flashcards;
  if (deckKey.startsWith("t:")) {
    const topicId = deckKey.slice(2);
    const packIds = new Set(curatedPacksOfTopic(topicById.get(topicId)?.sampleId).map((p) => p.id));
    return flashcards.filter((c) => c.topicId === topicId || (c.packId != null && packIds.has(c.packId)));
  }
  const packId = deckKey.slice(2);
  const pack = curatedPackById(packId);
  const ids = new Set(
    pack
      ? [pack.id, ...(pack.topicSampleId ? curatedPacksOfTopic(pack.topicSampleId).map((p) => p.id) : [])]
      : [packId],
  );
  return flashcards.filter((c) => c.packId != null && ids.has(c.packId));
}

/** پک(های) منتخبِ پشتِ یک مجموعه — همان‌هایی که دکمه‌ی «افزودن همه» رویشان کار می‌کند */
export function deckCuratedPacks(deckKey: string | undefined, topicById: Map<string, Topic>): CuratedPack[] {
  if (!deckKey) return [];
  if (deckKey.startsWith("t:")) return curatedPacksOfTopic(topicById.get(deckKey.slice(2))?.sampleId);
  const pack = curatedPackById(deckKey.slice(2));
  if (!pack) return [];
  return pack.topicSampleId ? curatedPacksOfTopic(pack.topicSampleId) : [pack];
}

/**
 * کارت‌های منتخبی که هنوز به «کارت‌های من» اضافه نشده‌اند، به تفکیک پک.
 * همان قاعده‌ی `importCuratedCards`: کارتِ قبلاً اضافه‌شده (کلید پک) و کارتِ هم‌متن با
 * کارت‌های خودِ کاربر نادیده گرفته می‌شوند تا شمارِ «باقی‌مانده» با واقعیت یکی باشد.
 */
export function curatedPending(packs: CuratedPack[], flashcards: Flashcard[]): { packId: string; indices: number[] }[] {
  if (packs.length === 0) return [];
  const imported = new Set(flashcards.filter((c) => c.packId).map((c) => curatedCardKey(c.packId!, c.front)));
  const fronts = new Set(flashcards.map((c) => c.front.trim().toLowerCase()));
  return packs
    .map((pack) => {
      const indices: number[] = [];
      pack.cards.forEach((card, i) => {
        if (imported.has(curatedCardKey(pack.id, card.f))) return;
        if (fronts.has(card.f.trim().toLowerCase())) return;
        indices.push(i);
      });
      return { packId: pack.id, indices };
    })
    .filter((x) => x.indices.length > 0);
}

/** شمارِ کارت‌های منتخبِ آماده که هنوز به کارت‌های کاربر اضافه نشده‌اند */
export function curatedPendingCount(packs: CuratedPack[], flashcards: Flashcard[]): number {
  return curatedPending(packs, flashcards).reduce((sum, x) => sum + x.indices.length, 0);
}
