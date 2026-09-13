// ===== حالت جنگی 🏴‍☠️ — برنامه‌ی فشرده‌ی لحظه‌ی آخری =====
// «تا امتحان چند ساعت مونده، چیکار کنم؟» — این موتور از اشتباه‌های سررسیده،
// مرورها، مباحث ضعیف/نخوانده و کارت‌های سررسیده، بلاک‌های ۵۰ دقیقه کار + ۱۰ دقیقه
// استراحت می‌چیند. کاملاً خالص و تست‌پذیر؛ هیچ وابستگی به زمان حال ندارد.
import type { CramBlock, CramKind, Flashcard, Mistake, Review, Subject, Topic } from "../types";
import { leafTopics } from "./topics";

/** طول بلاک کار و استراحت جنگی (دقیقه) */
export const CRAM_WORK = 50;
export const CRAM_BREAK = 10;

export const CRAM_KIND_META: Record<CramKind, { icon: string; label: string }> = {
  mistakes: { icon: "📓", label: "اشتباه‌ها" },
  review: { icon: "🔁", label: "مرور" },
  learn: { icon: "📖", label: "یادگیری" },
  cards: { icon: "🃏", label: "فلش‌کارت" },
  recap: { icon: "🧾", label: "جمع‌بندی" },
  break: { icon: "☕", label: "استراحت" },
};

export interface CramOptions {
  topics: Topic[];
  reviews: Review[];
  mistakes: Mistake[];
  flashcards: Flashcard[];
  subjects: Subject[];
  /** ساعت‌های در دسترس (۱ تا ۲۴) */
  hours: number;
  /** امروز به‌صورت yyyy-mm-dd */
  today: string;
  /** فقط این درس — خالی یعنی همه‌ی دروس فعال */
  subjectId?: string;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** بلاک‌های کاریِ خام (بدون استراحت) به ترتیب اولویت جنگی */
function workPieces(o: CramOptions): CramBlock[] {
  const archived = new Set(o.subjects.filter((s) => s.archived).map((s) => s.id));
  const topicSubject = new Map(o.topics.map((t) => [t.id, t.subjectId]));
  const topicName = new Map(o.topics.map((t) => [t.id, t.name]));
  const subjectName = new Map(o.subjects.map((s) => [s.id, s.name]));
  const inScope = (subjectId: string | undefined) => {
    if (subjectId && archived.has(subjectId)) return false;
    if (o.subjectId && subjectId !== o.subjectId) return false;
    return true;
  };
  const out: CramBlock[] = [];
  let n = 0;
  const push = (b: Omit<CramBlock, "id">) => out.push({ ...b, id: `cram-${n++}` });

  // ۱) اشتباه‌های سررسیده — بالاترین اولویت (دقیقاً همان‌جایی که نمره از دست می‌رود)
  const dueMistakes = o.mistakes.filter((m) => m.dueDate <= o.today && inScope(m.subjectId ?? (m.topicId ? topicSubject.get(m.topicId) : undefined)));
  for (const g of chunk(dueMistakes, 5)) {
    push({
      kind: "mistakes",
      minutes: clamp(g.length * 5, 15, CRAM_WORK),
      label: g.length === 1 ? "مرور ۱ اشتباه سررسیده" : `مرور ${g.length} اشتباه سررسیده`,
      detail: g.slice(0, 2).map((m) => m.question.slice(0, 40)).join("؛ "),
      reason: "اشتباهِ تکرارشده = نمره‌ی ازدست‌رفته؛ اول این‌ها را ببند",
    });
  }

  // ۲) مرورهای سررسیده
  const dueReviews = o.reviews
    .filter((r) => r.status === "pending" && r.dueDate <= o.today && inScope(topicSubject.get(r.topicId)))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  for (const g of chunk(dueReviews, 3)) {
    const names = [...new Set(g.map((r) => topicName.get(r.topicId) ?? "مبحث"))];
    push({
      kind: "review",
      minutes: clamp(g.length * 8, 15, CRAM_WORK),
      label: g.length === 1 ? "۱ مرور سررسیده" : `${g.length} مرور سررسیده`,
      detail: names.slice(0, 3).join("، ") + (names.length > 3 ? "…" : ""),
      reason: "مرورِ سرِ وقت، فراموشی را نصف می‌کند",
    });
  }

  // ۳) مباحث ضعیف (برگ‌ها، اولویت‌دار)
  const leaves = leafTopics(o.topics).filter((t) => inScope(t.subjectId));
  const byPri = (a: Topic, b: Topic) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || b.estimatedMinutes - a.estimatedMinutes;
  for (const t of leaves.filter((t) => t.status === "needs_review").sort(byPri)) {
    push({
      kind: "learn",
      minutes: clamp(Math.round(t.estimatedMinutes) || 25, 20, CRAM_WORK),
      label: t.name,
      detail: subjectName.get(t.subjectId) ?? "",
      reason: "ضعیفی — با اولویت بالا جمعش کن",
      topicId: t.id,
    });
  }

  // ۴) مباحث شروع‌نشده (برگ‌ها، اولویت‌دار)
  for (const t of leaves.filter((t) => t.status === "not_started").sort(byPri)) {
    push({
      kind: "learn",
      minutes: clamp(Math.round(t.estimatedMinutes) || 25, 20, CRAM_WORK),
      label: t.name,
      detail: subjectName.get(t.subjectId) ?? "",
      reason: "هنوز شروع نشده — هر دقیقه‌اش نمره است",
      topicId: t.id,
    });
  }

  // ۵) فلش‌کارت‌های سررسیده
  const dueCards = o.flashcards.filter((c) => c.dueDate <= o.today && inScope(c.topicId ? topicSubject.get(c.topicId) : undefined));
  if (dueCards.length > 0) {
    push({
      kind: "cards",
      minutes: clamp(Math.round(dueCards.length * 1.5), 10, CRAM_WORK),
      label: `${dueCards.length} کارت سررسیده`,
      reason: "کارت‌ها را سریع بزن و رد شو",
    });
  }

  return out;
}

/**
 * چیدن بلاک‌ها در بودجه‌ی زمانی: بلاک کارِ ۵۰ دقیقه‌ای + استراحت ۱۰ دقیقه‌ای.
 * اگر محتوا از بودجه بیشتر باشد، آخرش نصف‌ونیمه می‌شود («بخشی»)؛ اگر کمتر باشد،
 * با جمع‌بندی پر می‌شود. مجموع دقیقه‌ها هرگز از بودجه رد نمی‌شود.
 */
export function buildCramPlan(o: CramOptions): CramBlock[] {
  const hours = clamp(Math.round(o.hours) || 3, 1, 24);
  let budget = hours * 60;
  const pieces = workPieces(o);

  // هیچ محتوایی نیست: یا درسی نیست، یا همه‌چیز تسلط شده
  if (pieces.length === 0) {
    const anyScope = o.topics.some((t) => {
      const sid = t.subjectId;
      if (o.subjects.some((s) => s.id === sid && s.archived)) return false;
      return !o.subjectId || sid === o.subjectId;
    });
    if (!anyScope) return [];
    return [{
      id: "cram-0",
      kind: "recap",
      minutes: Math.min(25, budget),
      label: "مرور افتخاری 🏆",
      reason: "همه‌چیز را بلدی! فقط یک مرور سبک بزن و با خیال راحت برو",
    }];
  }

  const out: CramBlock[] = [];
  let slot = 0; // دقیقه‌های پرشده‌ی بلاکِ کاریِ جاری (۰ تا ۵۰)
  let idx = 0;
  const pushBreak = () => {
    out.push({ id: `cram-b${idx++}`, kind: "break", minutes: CRAM_BREAK, label: "استراحت", detail: "از جات بلند شو، آب بخور، گوشی را چک نکن!", reason: "مغز خسته چیزی نگه نمی‌دارد" });
  };

  for (const piece of pieces) {
    if (budget <= 0) break;
    // اگر در این اسلات جا نمی‌شود، اسلات را ببند (و اگر محتوا و بودجه هست، استراحت بگذار)
    if (slot + piece.minutes > CRAM_WORK && slot > 0) {
      if (budget > CRAM_BREAK + 10) {
        pushBreak();
        budget -= CRAM_BREAK;
      }
      slot = 0;
    }
    if (piece.minutes <= budget && (slot === 0 || slot + piece.minutes <= CRAM_WORK)) {
      out.push({ ...piece, id: `cram-w${idx++}` });
      slot += piece.minutes;
      budget -= piece.minutes;
    } else if (budget >= 15 && slot === 0) {
      // آخرین لقمه: بخشی از این بلاک
      out.push({ ...piece, id: `cram-w${idx++}`, minutes: budget, label: `${piece.label} (بخشی)` });
      slot += budget;
      budget = 0;
    }
    if (slot >= CRAM_WORK) {
      slot = 0;
      if (budget > CRAM_BREAK + 10) {
        pushBreak();
        budget -= CRAM_BREAK;
      }
    }
  }

  // بودجه‌ی اضافه → جمع‌بندی (۵۰تایی با استراحت بینشان)
  while (budget >= 20) {
    if (slot > 0) {
      if (budget > CRAM_BREAK + 10) {
        pushBreak();
        budget -= CRAM_BREAK;
      }
      slot = 0;
    }
    const m = Math.min(CRAM_WORK, budget);
    out.push({ id: `cram-r${idx++}`, kind: "recap", minutes: m, label: "جمع‌بندی و تست تمرینی", detail: "فرمول‌ها، خلاصه‌ها و چند تست زمان‌دار", reason: "مرور نهایی — هرچه خواندی را تثبیت کن" });
    budget -= m;
    slot = 0;
    if (budget > CRAM_BREAK + 10 && budget >= 20) {
      pushBreak();
      budget -= CRAM_BREAK;
    }
  }

  return out;
}

/** خلاصه‌ی اعداد برای نمایش (پیشرفت، جمع‌ها) */
export function cramTotals(items: { kind: CramKind; minutes: number; done?: boolean }[]): { work: number; rest: number; doneWork: number; total: number } {
  let work = 0, rest = 0, doneWork = 0;
  for (const b of items) {
    if (b.kind === "break") rest += b.minutes;
    else {
      work += b.minutes;
      if (b.done) doneWork += b.minutes;
    }
  }
  return { work, rest, doneWork, total: work + rest };
}
