import { describe, it, expect } from "vitest";
import {
  sourceDrafts,
  sourceEvidenceValid,
  searchSource,
} from "../sourceLearning";
import { parseStateText, EMPTY_STATE } from "../stateIO";
import { hasMeaningfulData } from "../backup";
import type { SourceDocument } from "../../types";
const doc: SourceDocument = {
  id: "d",
  title: "زیست",
  kind: "text",
  createdAt: 1,
  pages: [
    {
      number: 4,
      text: "میتوکندری: اندامک تولید انرژی\nسلول چیست؟ واحد پایه حیات\nناقل چیست؟\nپروتئین غشایی",
    },
  ],
};
describe("source-grounded cards", () => {
  it("keeps page and exact evidence for definition and Q/A pairs", () => {
    const cards = sourceDrafts(doc);
    expect(cards).toHaveLength(3);
    expect(cards[0].evidence.page).toBe(4);
    expect(cards[0].back).toBe("اندامک تولید انرژی");
    for (const card of cards)
      expect(sourceEvidenceValid(doc, card.evidence)).toBe(true);
  });
  it("does not invent a card or answer from unstructured prose", () =>
    expect(
      sourceDrafts({
        ...doc,
        pages: [{ number: 1, text: "متن معمولی بدون ساختار سؤال و پاسخ" }],
      }),
    ).toEqual([]));
  it("rejects a fabricated quote or wrong page", () => {
    const e = sourceDrafts(doc)[0].evidence;
    expect(sourceEvidenceValid(doc, { ...e, quote: "جواب ساختگی" })).toBe(
      false,
    );
    expect(sourceEvidenceValid(doc, { ...e, page: 1 })).toBe(false);
  });
  it("returns excerpts only when all query terms occur; no result means no guessed answer", () => {
    expect(searchSource(doc, "انرژی")[0].page).toBe(4);
    expect(searchSource(doc, "انرژی سیاره")).toEqual([]);
    expect(searchSource(doc, "")).toEqual([]);
  });
  it("round-trips sources and evidence through backups and migrates old states", () => {
    const parsed = parseStateText(
      JSON.stringify({ ...EMPTY_STATE, sourceDocuments: [doc] }),
    );
    expect(parsed?.sourceDocuments).toEqual([doc]);
    expect(parseStateText("{}")?.sourceDocuments).toEqual([]);
  });
  it("has no backup nudge for a pristine empty app", () => {
    expect(hasMeaningfulData(EMPTY_STATE)).toBe(false);
    expect(hasMeaningfulData({ ...EMPTY_STATE, sourceDocuments: [doc] })).toBe(
      true,
    );
  });
});
it("rejects malformed imported arrays and invalid source pages instead of erasing data", () => {
  expect(parseStateText('{"subjects":{}}')).toBeNull();
  expect(parseStateText('{"tasks":[null]}')).toBeNull();
  expect(
    parseStateText(
      JSON.stringify({
        sourceDocuments: [
          {
            ...doc,
            pages: [
              { number: 1, text: "a" },
              { number: 1, text: "b" },
            ],
          },
        ],
      }),
    ),
  ).toBeNull();
});
