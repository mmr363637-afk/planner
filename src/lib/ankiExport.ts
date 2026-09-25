// ===== 📤 خروجی سازگار با Anki =====
// Anki فایل‌های متنیِ «ستون‌جدا» را مستقیم import می‌کند (File → Import):
// هر سطر = یک کارت؛ ستون‌ها با Tab جدا می‌شوند و directive‌های بالای فایل
// (#separator:Tab، #notetype:Cloze و…) قالب را به Anki اعلام می‌کنند.
// یعنی بدون سرور و بدون کتابخانه‌ی سنگین، کارت‌های اپ با بزرگ‌ترین
// اکوسیستم فلش‌کارت دنیا جابه‌جا می‌شوند. کاملاً آفلاین.
//
// دو نوع خروجی داریم چون Anki برای جاخالی‌ها Note Type متفاوتی می‌خواهد:
//  - ankiBasic: کارت‌های معمولی «رو؛ پشت» (ستون سوم = tag سلسله‌مراتبی درس::مبحث)
//  - ankiCloze: کارت‌های جاخالی — {{پنهان}} به {{c1::پنهان}} تبدیل می‌شود و
//    با #notetype:Cloze مستقیم به نوعِ درست می‌نشیند.

import type { Flashcard, Subject, Topic } from "../types";
import { hasCloze } from "./cloze";

export function clozeToAnki(text: string): string {
  // {{x}} → {{c1::x}}؛ چند جاخالی در یک متن، شماره‌های پیاپی می‌گیرند
  let i = 0;
  return text.replace(/\{\{([^{}]+)\}\}/g, (_m, inner: string) => {
    i += 1;
    return `{{c${i}::${inner.trim()}}}`;
  });
}

function tagify(name: string | undefined): string {
  if (!name) return "";
  return name.trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_:-]/gu, "");
}

export interface AnkiExportOptions {
  /** فقط کارت‌های یک مبحث — خالی یعنی همه */
  topicId?: string | null;
  /** شامل کارت‌های منتخبِ واردشده (origin=curated) هم بشود؟ پیش‌فرض بله */
  includeCurated?: boolean;
}

function prepare(cards: Flashcard[], topics: Topic[], subjects: Subject[], opts: AnkiExportOptions) {
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  return cards
    .filter((c) => (!opts.topicId || c.topicId === opts.topicId) && (opts.includeCurated !== false || c.origin !== "curated"))
    .map((c) => {
      const topic = c.topicId != null ? topicById.get(c.topicId) : undefined;
      const subject = topic ? subjectById.get(topic.subjectId) : undefined;
      const tags = [tagify(subject?.name), tagify(topic?.name)].filter(Boolean).join("::");
      return { card: c, tags };
    });
}

const clean = (s: string) => s.replace(/[\t\n]+/g, " ").trim();

/** کارت‌های معمولی (بدون جاخالی) — front/back/tags */
export function ankiBasic(cards: Flashcard[], topics: Topic[], subjects: Subject[], opts: AnkiExportOptions = {}): { text: string; count: number } {
  const rows = prepare(cards, topics, subjects, opts).filter(({ card }) => !hasCloze(card.front) && !hasCloze(card.back));
  const lines = ["#separator:tab", "#html:false", "#notetype:Basic", "#tags column:3"];
  for (const { card, tags } of rows) {
    const front = clean(card.front);
    const back = clean(card.back);
    if (!front || !back) continue;
    lines.push(`${front}\t${back}\t${tags}`);
  }
  return { text: lines.join("\n") + "\n", count: Math.max(0, lines.length - 4) };
}

/** کارت‌های جاخالی با سینتکس cloze خودِ Anki */
export function ankiCloze(cards: Flashcard[], topics: Topic[], subjects: Subject[], opts: AnkiExportOptions = {}): { text: string; count: number } {
  const rows = prepare(cards, topics, subjects, opts).filter(({ card }) => hasCloze(card.front) || hasCloze(card.back));
  const lines = ["#separator:tab", "#html:false", "#notetype:Cloze", "#tags column:2"];
  for (const { card, tags } of rows) {
    const text = clean(clozeToAnki(card.front)) + (card.back.trim() ? ` — ${clean(card.back)}` : "");
    if (!text) continue;
    lines.push(`${text}\t${tags}`);
  }
  return { text: lines.join("\n") + "\n", count: Math.max(0, lines.length - 4) };
}
