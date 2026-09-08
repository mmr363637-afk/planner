// ===== فلش‌کارت جاخالی (Cloze) + خواندن فهرست گروهی (CSV) =====
// قرارداد جاخالی: هر بخشی از متن که داخل {{ }} باشد، در روی کارت پنهان می‌شود
// و فقط بعد از برگرداندن کارت (یا روی کارتِ پاسخ) کامل دیده می‌شود.
// مثال: «داروی {{فوروزماید}} مدر {{چشمه‌ای}} است»
// نمایش روی کارت: «داروی […] مدر […] است»

const CLOZE_RE = /\{\{([^{}]+)\}\}/g;

/** آیا متن شامل حداقل یک بخشِ جاخالی است؟ */
export function hasCloze(text: string): boolean {
  CLOZE_RE.lastIndex = 0;
  return CLOZE_RE.test(text);
}

/** متن برای «روی کارت»: بخش‌های جاخالی با جای‌نگهدار پنهان می‌شوند */
export function maskCloze(text: string): string {
  return text.replace(CLOZE_RE, () => "[…]");
}

/** متن برای «پشت کارت» یا چاپ: نشانه‌ها برداشته می‌شوند و متن کامل دیده می‌شود */
export function revealCloze(text: string): string {
  return text.replace(CLOZE_RE, (_m, inner: string) => inner);
}

// ----- ورود گروهی کارت (خطِ: رو؛پشت یا رو<TAB>پشت یا رو|پشت) -----

export interface ParsedCardRow {
  front: string;
  back: string;
  /** شماره‌ی سطر در متن ورودی (۱-مبنا) برای گزارش خطا */
  line: number;
}

export interface BulkParseResult {
  cards: ParsedCardRow[];
  /** سطرهایی که نادیده گرفته شدند (خالی یا بدون ستون پاسخ) */
  skipped: number;
}

/**
 * چند فرمت رایج را می‌فهمد: جداکننده‌ی «؛» یا «;» یا تب یا «|».
 * خطوط خالی و خطوطی که فقط یک ستون دارند رد می‌شوند تا کاربر بتواند
 * متنش را از هر منبعی (Word/Excel/Anki ساده) کپی کند.
 */
export function parseBulkCards(text: string): BulkParseResult {
  const cards: ParsedCardRow[] = [];
  let skipped = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    if (isHeaderLine(trimmed, i)) continue;
    const cells = splitRow(trimmed);
    if (cells.length < 2 || cells[0].trim() === "" || cells.slice(1).join(" ").trim() === "") {
      skipped++;
      continue;
    }
    const front = unquote(cells[0].trim());
    // اگر خودِ پاسخ هم جداکننده داشته باشد، بقیه‌ی ستون‌ها دوباره به هم می‌چسبند
    const back = unquote(cells.slice(1).join("؛ ").trim());
    cards.push({ front, back, line: i + 1 });
  }
  return { cards, skipped };
}

/** خطِ عنوان رایج (مثل «سوال;جواب» یا «front;back») را نادیده می‌گیرد */
function isHeaderLine(line: string, index: number): boolean {
  if (index !== 0) return false;
  const l = line.toLowerCase().trim();
  // نکته: \b بین حروف فارسی و لاتین خوب کار نمی‌کند؛ در عوض پایانِ کلمه با lookahead بررسی می‌شود
  return /^(سوال|سؤال|رو|front|question|q)(?![؀-ۿa-z])\s*[;؛\t|,]\s*(جواب|پاسخ|پشت|back|answer|a)(?![؀-ۿa-z])/.test(l);
}

/** جدا کردن سطر بر اساس رایج‌ترین جداکننده (اولویت: تب، «؛»، «;»، «|»، و در آخر «,») */
function splitRow(line: string): string[] {
  const candidates = ["\t", "؛", ";", "|", ","];
  for (const sep of candidates) {
    if (line.includes(sep)) return line.split(sep);
  }
  return [line];
}

/** کوتیشن‌های دور یک ستون CSV را برمی‌دارد ("..." → ...) */
function unquote(cell: string): string {
  const t = cell.trim();
  if (t.length >= 2 && t.startsWith("\"") && t.endsWith("\"")) {
    return t.slice(1, -1).replace(/""/g, "\"");
  }
  return t;
}
