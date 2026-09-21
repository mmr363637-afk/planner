// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importSourceFile } from "../sourceImport";

class MockWorker {
  static last: MockWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    MockWorker.last = this;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}
const image = () =>
  new File(["image bytes"], "scan.png", { type: "image/png" });
beforeEach(() => vi.stubGlobal("Worker", MockWorker));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("local image extraction lifecycle", () => {
  it("reports progress and returns literal text, terminating the worker", async () => {
    const progress = vi.fn();
    const pending = importSourceFile(
      image(),
      progress,
      new AbortController().signal,
    );
    MockWorker.last.emit({ progress: 42 });
    expect(progress).toHaveBeenCalledWith("استخراج تصویر: 42٪");
    MockWorker.last.emit({ text: "Cell: Basic unit of life" });
    await expect(pending).resolves.toEqual({
      title: "scan.png",
      kind: "image",
      pages: [{ number: 1, text: "Cell: Basic unit of life" }],
    });
    expect(MockWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it("can cancel before the OCR engine has initialized", async () => {
    const abort = new AbortController();
    const pending = importSourceFile(image(), vi.fn(), abort.signal);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(MockWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it("surfaces initialization failures without leaving a background worker", async () => {
    const pending = importSourceFile(
      image(),
      vi.fn(),
      new AbortController().signal,
    );
    MockWorker.last.emit({ error: "model unavailable" });
    await expect(pending).rejects.toThrow("model unavailable");
    expect(MockWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it("times out a stalled worker after three minutes", async () => {
    vi.useFakeTimers();
    const pending = importSourceFile(
      image(),
      vi.fn(),
      new AbortController().signal,
    );
    const assertion = expect(pending).rejects.toThrow("سه دقیقه");
    await vi.advanceTimersByTimeAsync(180_000);
    await assertion;
    expect(MockWorker.last.terminate).toHaveBeenCalledOnce();
  });
  it("does not turn blank OCR output into source material", async () => {
    const pending = importSourceFile(
      image(),
      vi.fn(),
      new AbortController().signal,
    );
    MockWorker.last.emit({ text: "  \n " });
    await expect(pending).rejects.toThrow("متنی تشخیص داده نشد");
  });
});
