// ===== 🖍 نشانه‌گذاری انتخابی روی متن فلش‌کارت =====
//
// تفاوت با «هایلایتِ نسخهٔ قبل»: قبلاً فقط یک عبارتِ *متن* ذخیره می‌شد و همهٔ
// تکرارهای آن عبارت رنگ می‌گرفتند؛ رنگ و خط‌کشیدن هم نبود. این‌جا هر نشانه‌گذاری
// یک «بازهٔ نویسه» روی یک سمتِ مشخص کارت است (front/back) و می‌تواند هایلایت
// رنگی، زیرخط، خط‌خوردگی یا یادداشتِ چسبیده به همان عبارت باشد. متن کارت هرگز
// تغییر نمی‌کند و اگر کاربر بعداً آن را ویرایش کند، نشانه‌گذاری‌ای که دیگر با
// متن نمی‌خواند نادیده گرفته می‌شود (هیچ‌وقت روی حرفِ اشتباه نمی‌نشیند).
//
// همهٔ توابع خالص‌اند (بدون DOM) تا در تست‌ها و در ذخیره‌سازی قابل اتکا باشند.

import type { AnnotationColor, AnnotationStyle, Flashcard, TextAnnotation } from "../types";

export const MAX_ANNOTATIONS_PER_CARD = 120;
export const MAX_ANNOTATION_TEXT = 400;
export const MAX_ANNOTATION_NOTE = 600;

/** رنگ‌ها با کلاس‌های ثابت Tailwind — در تم روشن و تیره هر دو خوانا می‌مانند */
export const ANNOTATION_COLORS: Record<
  AnnotationColor,
  { label: string; dot: string; highlight: string; underline: string }
> = {
  yellow: {
    label: "زرد",
    dot: "#eab308",
    highlight: "bg-yellow-200/80 dark:bg-yellow-400/30",
    underline: "#eab308",
  },
  green: {
    label: "سبز",
    dot: "#22c55e",
    highlight: "bg-emerald-200/80 dark:bg-emerald-400/30",
    underline: "#22c55e",
  },
  blue: {
    label: "آبی",
    dot: "#3b82f6",
    highlight: "bg-sky-200/80 dark:bg-sky-400/30",
    underline: "#3b82f6",
  },
  pink: {
    label: "صورتی",
    dot: "#ec4899",
    highlight: "bg-pink-200/80 dark:bg-pink-400/30",
    underline: "#ec4899",
  },
  purple: {
    label: "بنفش",
    dot: "#8b5cf6",
    highlight: "bg-violet-200/80 dark:bg-violet-400/30",
    underline: "#8b5cf6",
  },
  orange: {
    label: "نارنجی",
    dot: "#f97316",
    highlight: "bg-orange-200/80 dark:bg-orange-400/30",
    underline: "#f97316",
  },
};

export const ANNOTATION_COLOR_IDS = Object.keys(ANNOTATION_COLORS) as AnnotationColor[];

export const ANNOTATION_STYLE_LABEL: Record<AnnotationStyle, string> = {
  highlight: "هایلایت",
  underline: "زیرخط",
  strike: "خط‌خوردگی",
};

export function isAnnotationColor(value: unknown): value is AnnotationColor {
  return typeof value === "string" && (ANNOTATION_COLOR_IDS as string[]).includes(value);
}

export function isAnnotationStyle(value: unknown): value is AnnotationStyle {
  return value === "highlight" || value === "underline" || value === "strike";
}

/** عددِ صحیحِ محدود — برای آفست‌های ورودیِ نامطمئن (بکاپ/سینک) */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * سالم‌سازیِ فهرستِ نشانه‌گذاری‌ها از دادهٔ ذخیره‌شده.
 * آفست‌های نامعتبر، طول صفر، یا بیش‌ازحد بزرگ حذف می‌شوند تا رندر هیچ‌وقت نشکند.
 */
export function normalizeAnnotations(value: unknown, maxLen = 100_000): TextAnnotation[] {
  if (!Array.isArray(value)) return [];
  const out: TextAnnotation[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<TextAnnotation>;
    if (typeof r.id !== "string" || !r.id) continue;
    if (r.side !== "front" && r.side !== "back") continue;
    if (!isAnnotationStyle(r.style)) continue;
    if (typeof r.text !== "string" || !r.text.trim()) continue;
    const start = clampInt(r.start, -1, 0, maxLen);
    const end = clampInt(r.end, -1, 0, maxLen);
    if (start < 0 || end <= start) continue;
    const key = `${r.side}:${start}:${end}:${r.style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: r.id.slice(0, 80),
      side: r.side,
      start,
      end,
      text: r.text.slice(0, MAX_ANNOTATION_TEXT),
      style: r.style,
      color: isAnnotationColor(r.color) ? r.color : r.style === "highlight" ? "yellow" : undefined,
      note: typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, MAX_ANNOTATION_NOTE) : undefined,
      createdAt: typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : Date.now(),
    });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end).slice(0, MAX_ANNOTATIONS_PER_CARD);
}

/**
 * نشانه‌گذاری‌های مؤثرِ یک کارت: نشانه‌گذاری‌های تازه **به‌علاوهٔ** سازگاریِ عقب‌رو
 * با `highlights` نسخهٔ قبل (عبارت‌های متنی) — بدون مهاجرتِ مخرب؛ `highlights`
 * دست‌نخورده می‌ماند تا بکاپ/سینکِ قدیمی هم سالم بماند.
 */
export function annotationsOf(
  card: Pick<Flashcard, "front" | "back" | "annotations" | "highlights">,
  side: "front" | "back",
): TextAnnotation[] {
  const text = side === "front" ? card.front : card.back;
  const own = normalizeAnnotations(card.annotations, text.length + 1).filter((a) => a.side === side && a.end <= text.length);
  const legacy: TextAnnotation[] = [];
  if (side === "front" || side === "back") {
    for (const term of card.highlights ?? []) {
      const needle = term.trim();
      if (needle.length < 2) continue;
      let from = 0;
      // همهٔ تکرارهای عبارت، مگر این‌که از قبل نشانه‌گذاری شده باشد
      for (;;) {
        const at = text.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        const covered = own.some((a) => a.start === at && a.end === end);
        if (!covered) {
          legacy.push({
            id: `legacy:${side}:${at}:${end}`,
            side,
            start: at,
            end,
            text: needle,
            style: "highlight",
            color: "yellow",
            createdAt: 0,
          });
        }
        from = at + needle.length;
        if (legacy.length > MAX_ANNOTATIONS_PER_CARD) break;
      }
    }
  }
  return dedupe([...own, ...legacy]);
}

/** حذف تکراری‌ها با کلیدِ سمت/بازه/سبک (نگه‌داشتن اولی) و مرتب‌سازی */
export function dedupe(list: TextAnnotation[]): TextAnnotation[] {
  const seen = new Set<string>();
  const out: TextAnnotation[] = [];
  for (const a of list) {
    const key = `${a.side}:${a.start}:${a.end}:${a.style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

export interface AnnotationDraft {
  side: "front" | "back";
  start: number;
  end: number;
  text: string;
  style?: AnnotationStyle;
  color?: AnnotationColor;
  note?: string;
}

/**
 * افزودن/جایگزینیِ یک نشانه‌گذاری.
 * • بازهٔ تکراری با همان سبک: رنگ/یادداشت به‌روز می‌شود (به‌جای انبارکردن تکراری).
 * • هایلایت‌ها روی هم می‌توانند بیفتند ولی «زیرخط» و «خط‌خوردگی» جدا نگه داشته می‌شوند.
 * • سقفِ تعداد رعایت می‌شود تا دادهٔ کارت بی‌نهایت رشد نکند.
 */
export function addAnnotation(list: TextAnnotation[], draft: AnnotationDraft, now = Date.now()): TextAnnotation[] {
  const start = Math.max(0, Math.floor(draft.start));
  const end = Math.floor(draft.end);
  // `draft.text` همان عبارتِ انتخاب‌شده است (نه کل متن کارت)؛ آفست‌ها به متنِ همان سمت
  // اشاره می‌کنند و همین‌جا فقط اعتبارسنجی می‌شوند.
  const text = draft.text.trim();
  if (!text || end <= start) return list;
  const style: AnnotationStyle = draft.style ?? "highlight";
  const color = style === "highlight" ? draft.color ?? "yellow" : draft.color;
  const note = draft.note?.trim().slice(0, MAX_ANNOTATION_NOTE) || undefined;
  const side = draft.side;
  const base = normalizeAnnotations(list);
  const same = base.find((a) => a.side === side && a.start === start && a.end === end && a.style === style);
  if (same) {
    return base.map((a) =>
      a.id === same.id
        ? { ...a, color: color ?? a.color, note: note ?? a.note, text: a.text || text }
        : a,
    );
  }
  const fresh: TextAnnotation = {
    id: `an:${now.toString(36)}:${Math.random().toString(36).slice(2, 7)}`,
    side,
    start,
    end,
    text: text.slice(0, MAX_ANNOTATION_TEXT),
    style,
    color,
    note,
    createdAt: now,
  };
  return dedupe([...base, fresh]).slice(-MAX_ANNOTATIONS_PER_CARD);
}

/** حذف یک نشانه‌گذاری با شناسه */
export function removeAnnotation(list: TextAnnotation[], id: string): TextAnnotation[] {
  return normalizeAnnotations(list).filter((a) => a.id !== id);
}

/** تغییر رنگ/یادداشتِ یک نشانه‌گذاری موجود */
export function patchAnnotation(list: TextAnnotation[], id: string, patch: Partial<Pick<TextAnnotation, "color" | "note" | "style">>): TextAnnotation[] {
  return normalizeAnnotations(list).map((a) => (a.id === id ? { ...a, ...patch, note: patch.note === "" ? undefined : patch.note ?? a.note } : a));
}

export interface TextSegment {
  text: string;
  start: number;
  end: number;
  /** نشانه‌گذاری‌های فعال روی همین بازه (ممکن است چندتا باشند) */
  marks: TextAnnotation[];
}

/**
 * تقسیم متن به بازه‌های هم‌پوشانِ نشانه‌گذاری — پایهٔ رندر بدون تغییر متن.
 * اگر هیچ نشانه‌گذاری‌ای نباشد، یک بازهٔ کامل برمی‌گردد.
 */
export function textSegments(text: string, annotations: TextAnnotation[]): TextSegment[] {
  if (!text) return [];
  const valid = normalizeAnnotations(annotations, text.length + 1).filter(
    (a) => a.start >= 0 && a.end <= text.length && a.end > a.start,
  );
  if (valid.length === 0) return [{ text, start: 0, end: text.length, marks: [] }];
  const points = new Set<number>([0, text.length]);
  for (const a of valid) {
    points.add(a.start);
    points.add(a.end);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: TextSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    out.push({
      text: text.slice(start, end),
      start,
      end,
      marks: valid.filter((a) => a.start <= start && a.end >= end),
    });
  }
  return out;
}

/** تعداد نشانه‌گذاری‌ها روی یک سمت (برای نشانگر در فهرست کارت‌ها) */
export function annotationCount(card: Pick<Flashcard, "front" | "back" | "annotations" | "highlights">): number {
  return annotationsOf(card, "front").length + annotationsOf(card, "back").length;
}

/** عبارت‌های دارای یادداشت — برای نمایش «یادداشت‌های حاشیه» بدون بازکردن کارت */
export function notedAnnotations(card: Pick<Flashcard, "front" | "back" | "annotations" | "highlights">): TextAnnotation[] {
  return [...annotationsOf(card, "front"), ...annotationsOf(card, "back")].filter((a) => !!a.note);
}

/** شکستن متن به واژه‌ها با آفست — ابزار انتخابِ «واژه/عبارت» روی موبایل */
export function wordSpanAt(text: string, offset: number): { start: number; end: number } | null {
  if (!text || offset < 0 || offset > text.length) return null;
  const isWord = (ch: string) => /[\p{L}\p{N}\u200c]/u.test(ch);
  let start = Math.min(offset, text.length - 1);
  if (!isWord(text[start]) && start > 0) start -= 1;
  if (!isWord(text[start])) return null;
  let s = start;
  let e = start + 1;
  while (s > 0 && isWord(text[s - 1])) s -= 1;
  while (e < text.length && isWord(text[e])) e += 1;
  return { start: s, end: e };
}

/**
 * جا‌به‌جاییِ نشانه‌گذاری‌ها وقتی متن کارت ویرایش می‌شود.
 * • اگر بازهٔ قبلی هنوز همان متن را بدهد، دست‌نخورده می‌ماند.
 * • اگر متنِ نشانه‌گذاری‌شده یک‌بار و فقط یک‌بار در متن تازه باشد، به همان‌جا منتقل می‌شود
 *   (ویرایشِ جای دیگر کارت، هایلایت‌ها را از بین نمی‌برد).
 * • اگر عبارت حذف/تکراری شده باشد، نشانه‌گذاری حذف می‌شود — هیچ‌وقت روی حرفِ اشتباه نمی‌نشیند.
 */
export function remapAnnotationsForText(list: TextAnnotation[], newText: string, side: "front" | "back"): TextAnnotation[] {
  const out: TextAnnotation[] = [];
  for (const a of normalizeAnnotations(list)) {
    if (a.side !== side) {
      out.push(a);
      continue;
    }
    if (a.start >= 0 && a.end <= newText.length && newText.slice(a.start, a.end) === a.text) {
      out.push(a);
      continue;
    }
    const first = newText.indexOf(a.text);
    if (first < 0) continue;
    if (newText.indexOf(a.text, first + 1) >= 0) continue;
    out.push({ ...a, start: first, end: first + a.text.length });
  }
  return dedupe(out);
}

/**
 * نگاشتِ نشانه‌گذاری به متنِ «نمایشی» (پس از باز‌کردن جاخالی) — آفست‌های ذخیره‌شده به
 * متنِ خامِ کارت اشاره می‌کنند؛ برای رندر، هر عبارت در متنِ نمایشی پیدا و جابه‌جا می‌شود.
 */
export function mapAnnotationsToDisplay(list: TextAnnotation[], displayText: string, side: "front" | "back"): TextAnnotation[] {
  const out: TextAnnotation[] = [];
  for (const a of list) {
    if (a.side !== side) continue;
    if (displayText.slice(a.start, a.end) === a.text) {
      out.push(a);
      continue;
    }
    const at = displayText.indexOf(a.text);
    if (at >= 0) out.push({ ...a, start: at, end: at + a.text.length });
  }
  return dedupe(out);
}
