// ===== پک‌های «فلش‌کارت منتخب» =====
// داده‌ی کارت‌ها generated است: scripts/generateCuratedPacks.mjs + src/lib/curatedPacksData.ts
// هر پک متناظر با یک فصل از منبع درسی است؛ اگر به مبحث کاتالوگ وصل شده باشد
// topicSampleId دارد و کارت‌های اضافه‌شده به همان مبحثِ درون اپ attach می‌شوند.
//
// ⚡ داده‌ی generated خیلی حجیم است (ده‌ها هزار خط) و فقط وقتی لود می‌شود که کاربر
// واقعاً وارد بخش فلش‌کارت‌ها شود: UI اول `ensureCuratedPacks()` را صدا می‌زند و بعد
// از getterهای همگام استفاده می‌کند. روی سرعت باز شدن اولیه‌ی اپ اثری ندارد.

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

let cache: CuratedPack[] | null = null;
let inflight: Promise<CuratedPack[]> | null = null;

/**
 * لود تنبلِ داده‌ی پک‌ها — یک‌بار برای کل عمر اپ. صدا کردنش از چند جا امن است
 * (همه همان promise را می‌گیرند) و بعد از لود، getterهای همگام جواب می‌دهند.
 */
export function ensureCuratedPacks(): Promise<CuratedPack[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = import("./curatedPacksData").then((m) => {
      cache = m.GENERATED_PACKS.map((p) => ({
        id: p.id,
        topicSampleId: p.topicSampleId,
        subjectKey: p.subjectKey,
        subjectName: p.subjectName,
        topicName: p.topicName,
        cards: p.cards.map(([f, b]) => ({ f, b })),
      }));
      return cache;
    }).catch((err) => {
      // شکست (مثلاً حافظه‌ی کم) نباید برای همیشه گیر کند؛ دفعه‌ی بعد دوباره تلاش می‌شود
      inflight = null;
      throw err;
    });
  }
  return inflight;
}

/** خواندن همگامِ کش — اگر هنوز لود نشده، آرایه‌ی خالی (UI باید اول ensure کند) */
export function getCuratedPacks(): CuratedPack[] {
  return cache ?? [];
}

/** آیا داده قبلاً لود شده؟ (برای تصمیمِ «نشان بده یا اسکلت») */
export function curatedPacksReady(): boolean {
  return cache != null;
}

/** کل پک‌های متعلق به یک مبحث کاتالوگ (بر اساس sampleId) */
export function curatedPacksOfTopic(sampleId: string | undefined): CuratedPack[] {
  if (!sampleId) return [];
  return getCuratedPacks().filter((p) => p.topicSampleId === sampleId);
}

/** پیدا کردن پک بر اساس شناسه */
export function curatedPackById(id: string): CuratedPack | undefined {
  return getCuratedPacks().find((p) => p.id === id);
}

/** کلید یکتا برای تشخیص «این کارت منتخب قبلاً اضافه شده» — مستقل از id کارت */
export function curatedCardKey(packId: string, front: string): string {
  return `${packId}::${front.trim()}`;
}
