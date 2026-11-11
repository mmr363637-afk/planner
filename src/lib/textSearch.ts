// ===== 🔎 ابزارِ مشترکِ جست‌وجوی فارسی (فازی، چندواژه‌ای، بدونِ کتابخانهٔ بیرونی) =====
//
// یک‌جا نوشته شده تا فلش‌کارت‌ها و کتابخانهٔ درسنامه‌ها یک رفتار داشته باشند:
// نرمال‌سازیِ ی/ک عربی، اعراب، نیم‌فاصله و ارقامِ فارسی، بعد تطبیقِ واژه‌به‌واژه با
// امتیازدهی (کامل > شروعِ واژه > زیررشته > فازیِ محتاطانه). این کار جست‌وجو را از
// «زیررشتهٔ خامِ includes» — که با یک حرفِ اضافه/کم از کار می‌افتاد — جدا می‌کند.

/** نرمال‌سازیِ متنِ فارسی برای تطبیق: ی/ک عربی، اعراب، نیم‌فاصله، علائم و ارقام */
export function normalizeFa(text: string): string {
  return String(text ?? "")
    .replace(/[\u064A\u0649]/g, "ی") // ي ی
    .replace(/[\u0643]/g, "ک") // ك ک
    .replace(/[\u0623\u0625\u0622]/g, "ا")
    .replace(/[\u0629]/g, "ه")
    .replace(/[\u064B-\u0652\u0670]/g, "") // اعراب
    .replace(/[\u200c\u200d]/g, " ") // نیم‌فاصله → فاصله
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "") // نشانه‌های جهت
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

/** توکن‌های یک متنِ نرمال‌شده */
export function tokenize(text: string): string[] {
  const n = normalizeFa(text);
  return n ? n.split(" ").filter(Boolean) : [];
}

/** یک فیلدِ قابلِ جست‌وجو با وزن — عنوان باید از نامِ فایل باارزش‌تر باشد */
export interface SearchField {
  text: string;
  weight?: number;
}

/**
 * امتیازِ یک واژهٔ جست‌وجو روی متن (۰ = بی‌ربط).
 *  • تطبیقِ کاملِ واژه = ۱۲
 *  • شروعِ واژه = ۸ («آورت» ↔ «آئورت» را هم پوشش می‌دهد)
 *  • زیررشته = ۵
 *  • فازیِ محتاطانه (اولین حرفِ یکسان + فاصلهٔ ویرایشی ≤ ۱ برای واژه‌های ≥ ۴ حرف) = ۳
 * تطبیق‌های کوچک‌تر از ۳ حرف فقط «شروعِ واژه» حساب می‌شوند تا «می» همه‌چیز را نگیرد.
 */
function wordScore(word: string, hayTokens: string[], hayText: string): number {
  if (!word) return 0;
  if (word.length < 3) {
    return hayTokens.some((t) => t.startsWith(word)) ? 8 : 0;
  }
  let best = 0;
  for (const t of hayTokens) {
    if (t === word) return 12;
    if (t.startsWith(word)) best = Math.max(best, 8);
    else if (t.includes(word)) best = Math.max(best, 5);
    // فازیِ محتاطانه: یک حرفِ کم/زیاد (مثلِ «آورت» ↔ «آئورت») را می‌بخشد؛
    // از ۴ حرف به بالا تا کلمه‌های کوتاه همسایه را به هم نچسباند.
    else if (word.length >= 4 && t[0] === word[0] && editsWithin(word, t, 1)) best = Math.max(best, 3);
  }
  if (best === 0 && hayText.includes(word)) best = 4;
  return best;
}

/** فاصلهٔ ویرایشیِ Levenshtein با سقفِ `max` (خروجی: آیا ≤ max است؟) */
function editsWithin(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** چندواژه‌ای؟ همهٔ واژه‌ها باید حداقل امتیازِ ۳ بگیرند (AND)؛ جمعِ امتیازها مرتب می‌کند */
function matchScore(query: string, fields: { text: string; weight: number }[]): number {
  const words = tokenize(query);
  if (words.length === 0) return 0;
  let total = 0;
  for (const w of words) {
    let bestForWord = 0;
    for (const f of fields) {
      if (!f.text) continue;
      const s = wordScore(w, f.text.split(" "), f.text);
      if (s > 0) bestForWord = Math.max(bestForWord, s * f.weight);
    }
    if (bestForWord === 0) return 0; // AND: یک واژهٔ بی‌ربط ⇒ نتیجهٔ بی‌ربط
    total += bestForWord;
  }
  return total / words.length;
}

/**
 * امتیازِ یک عبارت روی چند فیلد (AND بینِ واژه‌ها، میانگینِ امتیاز).
 * ۰ یعنی بی‌ربط — عبارتِ خالی هم ۰ می‌دهد؛ فراخوان خودش تصمیم می‌گیرد.
 */
export function scoreQuery(query: string, fields: SearchField[]): number {
  return matchScore(
    query,
    fields.map((f) => ({ text: normalizeFa(f.text), weight: f.weight ?? 1 })),
  );
}
