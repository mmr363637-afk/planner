import type { SourceDocument, SourceEvidence } from "../types";
export interface SourceDraft {
  front: string;
  back: string;
  evidence: SourceEvidence;
}
export const MAX_SOURCE_CHARS = 500_000;
export const MAX_SOURCE_PAGES = 100;
/** Extract only verbatim answers. The user reviews every card before saving. */
export function sourceDrafts(doc: SourceDocument): SourceDraft[] {
  const drafts: SourceDraft[] = [],
    seen = new Set<string>();
  for (const page of doc.pages) {
    const lines = page.text
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let front = "",
        back = "",
        quote = line;
      const q = line.search(/[؟?]/),
        colon = line.search(/[:：]/);
      if (q > 2 && q < 250) {
        front = line.slice(0, q + 1);
        back = line.slice(q + 1).trim();
        if (!back && lines[i + 1] && !/[؟?]/.test(lines[i + 1])) {
          back = lines[++i];
          quote += "\n" + back;
        }
      } else if (colon > 1 && colon < 120) {
        front = `${line.slice(0, colon)} چیست؟`;
        back = line.slice(colon + 1).trim();
      }
      if (!front || !back || back.length > 1500 || seen.has(front)) continue;
      seen.add(front);
      drafts.push({
        front,
        back,
        evidence: {
          documentId: doc.id,
          documentTitle: doc.title,
          page: page.number,
          quote,
        },
      });
      if (drafts.length >= 80) return drafts;
    }
  }
  return drafts;
}
export function sourceEvidenceValid(
  doc: SourceDocument,
  e: SourceEvidence,
): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return (
    e.documentId === doc.id &&
    !!e.quote.trim() &&
    !!doc.pages.find(
      (p) => p.number === e.page && norm(p.text).includes(norm(e.quote)),
    )
  );
}
/** Search returns excerpts, not invented answers. */
export function searchSource(
  doc: SourceDocument,
  query: string,
): { page: number; quote: string }[] {
  const normalize = (s: string) =>
    s.replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();
  const words = normalize(query)
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!words.length) return [];
  return doc.pages
    .flatMap((p) =>
      p.text
        .split(/\n+/)
        .filter((line) => words.every((w) => normalize(line).includes(w)))
        .slice(0, 5)
        .map((quote) => ({ page: p.number, quote })),
    )
    .slice(0, 20);
}
