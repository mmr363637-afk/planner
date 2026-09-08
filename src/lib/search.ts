// ===== جستجوی فازی سبک برای Command Palette =====
// تطبیق «زیردنباله‌ای» با امتیازدهی: حروفِ پرسه باید به‌ترتیب در متن بیایند.
// امتیاز به تطابق در ابتدای کلمه، تطابقِ متوالی و کوتاهیِ متن جایزه می‌دهد.

/** نرمال‌سازی فارسی/عربی تا «کی» و «کی» و ی/ي یکی شوند */
export function normalizeText(text: string): string {
  return text
    .replace(/[يى]/g, "ی")
    .replace(/[كک]/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّ]{1}/g, "") // اعراب
    .replace(/‌/g, " ") // نیم‌فاصله → فاصله
    .toLowerCase()
    .trim();
}

/**
 * امتیاز تطابق پرسه با متن؛ null یعنی بدون تطابق و عدد بالاتر یعنی بهتر.
 * الگوریتم: عبور سگمنت‌به‌سگمنتِ حروفِ پرسه روی متن، با:
 *  + تطابقِ متوالی پشت‌سرهم امتیاز بیشتری می‌گیرد
 *  + شروعِ کلمه (بعد از فاصله/ابتدای متن) پاداش می‌گیرد
 *  + شروعِ خودِ متن بیشترین امتیاز را می‌گیرد
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (q === "") return 0;
  if (t === "") return null;
  const includesCursor = t.indexOf(q);
  let base =
    includesCursor === 0 ? 1000 - t.length : includesCursor > 0 ? 700 - includesCursor - t.length : null;

  // تطبیق زیردنباله‌ای (بر نگرفتنِ حالت includes هم سازگار است)
  let ti = 0;
  let run = 0;
  let streakScore = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const at = t.indexOf(q[qi], ti);
    if (at < 0) return null;
    run = qi > 0 && at === ti ? run + 1 : 0;
    streakScore += run * 6;
    if (at === 0 || t[at - 1] === " ") streakScore += 12;
    ti = at + 1;
  }
  const subseqScore = 300 - (ti - q.length) * 2 - t.length + streakScore;
  base = Math.max(base ?? -Infinity, subseqScore);
  return Math.round(base);
}

export interface SearchItem {
  id: string;
  title: string;
  /** متن کمکیِ نمایشی زیر عنوان */
  subtitle?: string;
  icon?: string;
  /** متن‌های اضافی برای تطابق (مثلاً نام درسِ مرتبط) */
  keywords?: string[];
  /** میان‌برِ صفحه‌ی مقصد (برای مرتب‌سازی/نمایش اختیاری) */
  hint?: string;
}

/** فیلتر + مرتب‌سازی لیست نتایج بر اساس امتیاز فازی (بهترین‌ها بالا) */
export function searchItems<T extends SearchItem>(items: T[], query: string, limit = 20): T[] {
  const q = query.trim();
  if (!q) return items.slice(0, limit);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const titleScore = fuzzyScore(q, item.title);
    const kwScores = (item.keywords ?? []).map((k) => fuzzyScore(q, k)).filter((s): s is number => s != null);
    const best = Math.max(titleScore ?? -Infinity, ...(kwScores.length ? kwScores : [-Infinity]));
    if (best > -Infinity) scored.push({ item, score: best - (titleScore == null ? 40 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
