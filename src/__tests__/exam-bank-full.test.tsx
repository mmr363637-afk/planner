// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import App from "../App";
import { STORAGE_KEY } from "../lib/persist";

/**
 * آزمونِ سرتاسری با «بانکِ همراهِ اپ» (public/qbank) — همان دادهٔ واقعیِ user:
 * ۱۰ هزار سؤال در ۳۷۰ مبحث، شاردهای gzip. این‌جا مسیر واقعیِ اپ در مرورگر
 * شبیه‌سازی می‌شود: درخواستِ manifest.json → مانیفست، درخواستِ شارد (پاسخِ
 * فشرده) → باز شدن با DecompressionStream/Response → سؤال‌ها.
 */

const BANK_DIR = join(process.cwd(), "public", "qbank");
const manifestText = readFileSync(join(BANK_DIR, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestText) as { topics: { topicId: string; topicTitle: string; count: number; subject: string }[] };

beforeAll(() => {
  // مرورگرِ اپ این دو API را دارد؛ jsdom ندارد
  if (!("DecompressionStream" in globalThis)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DecompressionStream } = require("node:stream/web") as { DecompressionStream: unknown };
    (globalThis as Record<string, unknown>).DecompressionStream = DecompressionStream;
  }

  const base = "http://localhost/qbank/";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/qbank/manifest.json")) return new Response(manifestText, { status: 200, headers: { "Content-Type": "application/json" } });
    const match = /\/qbank\/topics\/(.+)\.json\.gz$/.exec(url);
    if (match) {
      const topicId = decodeURIComponent(match[1]);
      const buffer = readFileSync(join(BANK_DIR, "topics", `${encodeURIComponent(topicId)}.json.gz`));
      // همان چیزی که شبکه می‌دهد: بایت‌های gzip (نه متن از پیش بازشده)
      void base;
      return new Response(uncompressedBytes(buffer), { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

/**
 * jsdom/Node پاسخ را بی‌در‌سر «از پیش بازشده» تحویل می‌دهد؛ برای اینکه مسیرِ
 * واقعیِ اپ (DecompressionStream روی بایت‌های gzip) تست شود، ساختارِ gzip
 * را دست‌نخورده می‌فرستیم و همان بایت‌ها در مرورگر باز می‌شوند.
 */
function uncompressedBytes(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

afterEach(cleanup);

function seed() {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ subjects: [], topics: [], flashcards: [], settings: { onboarded: true } }));
}
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);

describe("بانک همراهِ اپ (۱۰ هزار سؤال، gzip)", () => {
  it("مانیفست را می‌گیرد، مبحث را دانلود می‌کند و پاسخ را با متادیتای کوچک ذخیره می‌کند", async () => {
    seed();
    const topic = [...manifest.topics].sort((a, b) => b.count - a.count)[0];
    render(<App />);
    const dismiss = screen.queryByRole("button", { name: "بزن بریم! 🚀" });
    if (dismiss) fireEvent.click(dismiss);

    fireEvent.click(screen.getAllByText("امتحانات")[0]);
    fireEvent.click(await screen.findByRole("button", { name: /بانک سؤال پره‌انترنی/ }));
    expect(await screen.findByText(/بانک کامل/)).toBeTruthy();
    // شمارش کل سؤال‌ها در سرصفحه (همان مانیفست)
    const total = manifest.topics.reduce((sum, t) => sum + t.count, 0);
    expect(screen.getByText(new RegExp(String(total).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])))).toBeTruthy();

    // درس‌ها جمع‌شده‌اند (۳۷۰ مبحث در ۱۳ درس)؛ اول درسِ مبحث را باز کن، بعد مبحث را انتخاب کن
    fireEvent.click(screen.getByText((_, node) => !!node && node.tagName === "SPAN" && (node.textContent ?? "").startsWith(topic.subject)));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(topic.topicTitle) }));
    const start = screen.getByRole("button", { name: /^شروع آزمون/ });
    expect((start as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(start);

    const firstOption = await screen.findByRole("button", { name: /^۱\)/ }, { timeout: 15_000 });
    fireEvent.click(firstOption);
    expect(await screen.findByText(/✅ درست|❌ غلط/)).toBeTruthy();

    const state = saved();
    expect(state.examBankAttempts?.length).toBe(1);
    expect(state.examBankAttempts[0].topicId).toBe(topic.topicId);
    // متنِ سؤال روی گوشی نمی‌ماند
    expect(JSON.stringify(state).length).toBeLessThan(20_000);
  }, 30_000);
});
