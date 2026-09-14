// ===== پک‌های «فلش‌کارت منتخب» =====
// داده‌ی generated است: scripts/generateCuratedPacks.mjs + src/lib/curatedPacksData/
// هر پک متناظر با یک فصل از منبع درسی است؛ اگر به مبحث کاتالوگ وصل شده باشد
// topicSampleId دارد و کارت‌های اضافه‌شده به همان مبحثِ درون اپ attach می‌شوند.
//
// ⚡ معماری دو لایه (برای سرعت روی گوشی):
//   ۱) «متادیتا» (id، نام درس/مبحث، تعداد کارت) همگام و از باندل کوچک ایندکس
//      می‌آید تا فهرست، شمارنده‌ها و صف مرور بدون هیچ دانلود اضافه‌ای ساخته شوند.
//   ۲) «کارت‌ها» فقط وقتی لود می‌شوند که کاربر یک پک/مبحث را واقعاً باز کند؛
//      هر درس یک چانک مجزا است (code-split) و درس‌های دیگر دانلود نمی‌شوند.
//   قبلاً همه‌ی کارت‌ها در یک چانک ۱٫۲+ مگابایتی بود و با اولین ورود به
//   فلش‌کارت‌ها کامل دانلود و پارس می‌شد.

import { loadPack, loadPacks, PACK_META, type PackMeta } from "./curatedPacksData";

export interface CuratedCard {
  /** روی کارت (سوال) */
  f: string;
  /** پشت کارت (پاسخ) */
  b: string;
}

/** پکِ کامل‌شده: متادیتا + کارت‌ها (بعد از لود) */
export interface CuratedPack extends PackMeta {
  cards: CuratedCard[];
}

export type CuratedPackMeta = PackMeta;

// ---------- لایه‌ی ۱: متادیتا (همگام، سبک) ----------

/** فهرست متادیتای همه‌ی پک‌ها — بدون کارت‌ها */
export function getCuratedPacks(): PackMeta[] {
  return PACK_META;
}

/** آیا داده در دسترس است؟ (متادیتا همیشه هست؛ برای سازگاری با UI‌های قدیمی) */
export function curatedPacksReady(): boolean {
  return true;
}

/** سازگاری با API قدیمی — حالا بلافاصله با متادیتا resolve می‌شود */
export function ensureCuratedPacks(): Promise<PackMeta[]> {
  return Promise.resolve(PACK_META);
}

/** کل متادیتای پک‌های متعلق به یک مبحث کاتالوگ (بر اساس sampleId) */
export function curatedPacksOfTopic(sampleId: string | undefined): PackMeta[] {
  if (!sampleId) return [];
  return PACK_META.filter((p) => p.topicSampleId === sampleId);
}

/** پیدا کردن متادیتای پک بر اساس شناسه */
export function curatedPackById(id: string): PackMeta | undefined {
  return PACK_META.find((p) => p.id === id);
}

// ---------- لایه‌ی ۲: کارت‌ها (تنبل، فقط درسِ مورد نیاز) ----------

const packCache = new Map<string, CuratedPack>();
const inflight = new Map<string, Promise<CuratedPack | undefined>>();

function toFull(meta: PackMeta, data: { cards: [string, string][] }): CuratedPack {
  return {
    id: meta.id,
    topicSampleId: meta.topicSampleId,
    subjectKey: meta.subjectKey,
    subjectName: meta.subjectName,
    topicName: meta.topicName,
    cardCount: meta.cardCount,
    ...(meta.file ? { file: meta.file } : {}),
    cards: data.cards.map(([f, b]) => ({ f, b })),
  };
}

async function loadPackInternal(id: string): Promise<CuratedPack | undefined> {
  const cached = packCache.get(id);
  if (cached) return cached;
  const running = inflight.get(id);
  if (running) return running;
  const p = loadPack(id)
    .then((meta) => (meta && PACK_META.find((m) => m.id === id) ? toFull(PACK_META.find((m) => m.id === id)!, meta) : undefined))
    .then((full) => {
      inflight.delete(id);
      if (full) packCache.set(id, full);
      return full;
    })
    .catch((err) => {
      inflight.delete(id);
      throw err;
    });
  inflight.set(id, p);
  return p;
}

/** لود یک پک کامل (با کارت‌ها) — فقط چانکِ درسِ همان پک دانلود می‌شود */
export function ensurePackById(id: string): Promise<CuratedPack | undefined> {
  return loadPackInternal(id);
}

/** لود چند پک کامل (ترتیب ورودی حفظ می‌شود) */
export async function ensurePacks(ids: string[]): Promise<CuratedPack[]> {
  const metas = ids.map((id) => PACK_META.find((m) => m.id === id)).filter((m): m is PackMeta => Boolean(m));
  const data = await loadPacks(ids);
  const byId = new Map(data.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const out: CuratedPack[] = [];
  for (const m of metas) {
    const d = byId.get(m.id);
    if (!d || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(toFull(m, d));
  }
  return out;
}

/** لود پک‌های کاملِ یک مبحث کاتالوگ */
export function ensurePacksOfTopic(sampleId: string | undefined): Promise<CuratedPack[]> {
  if (!sampleId) return Promise.resolve([]);
  return ensurePacks(curatedPacksOfTopic(sampleId).map((p) => p.id));
}

// ---------- کلید تکراری‌سنجی (بدون نیاز به لود کارت) ----------

/** کلید یکتا برای تشخیص «این کارت منتخب قبلاً اضافه شده» — مستقل از id کارت */
export function curatedCardKey(packId: string, front: string): string {
  return `${packId}::${front.trim()}`;
}
