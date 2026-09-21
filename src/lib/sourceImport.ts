import { MAX_SOURCE_CHARS, MAX_SOURCE_PAGES } from "./sourceLearning";
import type { SourceDocument } from "../types";
/** Heavy readers load on demand; text and PDF stay on device. */
export async function importSourceFile(
  file: File,
  progress: (text: string) => void,
  signal: AbortSignal,
): Promise<Pick<SourceDocument, "title" | "kind" | "pages">> {
  if (file.size > 15 * 1024 * 1024)
    throw new Error("حداکثر حجم فایل ۱۵ مگابایت است.");
  const abort = () => {
    if (signal.aborted) throw new DOMException("لغو شد", "AbortError");
  };
  abort();
  if (file.type.startsWith("image/")) {
    progress("دریافت موتور OCR و زبان فارسی؛ بار اول به اینترنت نیاز دارد…");
    const text = await new Promise<string>((resolve, reject) => {
      const worker = new Worker(
        new URL("./sourceOcr.worker.ts", import.meta.url),
        { type: "module" },
      );
      let finished = false;
      const finish = (error?: Error, text?: string) => {
        if (finished) return;
        finished = true;
        worker.onmessage = null;
        worker.onerror = null;
        clearTimeout(timeout);
        signal.removeEventListener("abort", cancel);
        worker.terminate();
        if (error) reject(error);
        else resolve(text ?? "");
      };
      const cancel = () => finish(new DOMException("لغو شد", "AbortError"));
      const timeout = setTimeout(
        () =>
          finish(
            new Error(
              "استخراج تصویر بیش از سه دقیقه طول کشید؛ تصویر کوچک‌تر یا متن دستی را امتحان کن.",
            ),
          ),
        180_000,
      );
      signal.addEventListener("abort", cancel, { once: true });
      worker.onerror = (event) => {
        event.preventDefault();
        finish(
          new Error(
            "موتور استخراج تصویر در دسترس نیست؛ یک‌بار آنلاین تلاش کن یا متن را دستی وارد کن.",
          ),
        );
      };
      worker.onmessage = ({
        data,
      }: MessageEvent<{
        text?: string;
        error?: string;
        progress?: number;
      }>) => {
        if (data.error) finish(new Error(data.error));
        else if (data.text !== undefined) finish(undefined, data.text);
        else if (data.progress !== undefined)
          progress(`استخراج تصویر: ${data.progress}٪`);
      };
      if (signal.aborted) cancel();
      else worker.postMessage(file);
    });
    abort();
    if (!text.trim())
      throw new Error(
        "متنی تشخیص داده نشد؛ تصویر واضح‌تر یا متن دستی وارد کن.",
      );
    if (text.length > MAX_SOURCE_CHARS)
      throw new Error("متن تصویر بیش از حد طولانی است؛ آن را بخش‌بندی کن.");
    return { title: file.name, kind: "image", pages: [{ number: 1, text }] };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    const { default: workerUrl } =
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    abort();
    const loading = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    const cancel = () => {
      void loading.destroy();
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const pdf = await loading.promise;
      if (pdf.numPages > MAX_SOURCE_PAGES)
        throw new Error(
          `حداکثر ${MAX_SOURCE_PAGES} صفحه؛ فایل را بخش‌بندی کن.`,
        );
      const pages: SourceDocument["pages"] = [];
      let chars = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        abort();
        progress(`استخراج صفحه ${number} از ${pdf.numPages}`);
        const page = await pdf.getPage(number),
          content = await page.getTextContent();
        const text = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("")
          .trim();
        chars += text.length;
        if (chars > MAX_SOURCE_CHARS)
          throw new Error("متن فایل طولانی است؛ آن را بخش‌بندی کن.");
        pages.push({ number, text });
        page.cleanup();
      }
      if (!pages.some((p) => p.text))
        throw new Error(
          "این PDF متن قابل استخراج ندارد؛ تصویر صفحه را با گزینهٔ OCR وارد کن.",
        );
      return { title: file.name, kind: "pdf", pages };
    } finally {
      signal.removeEventListener("abort", cancel);
      await loading.destroy();
    }
  }
  if (!/\.(txt|md)$/i.test(file.name) && !file.type.startsWith("text/"))
    throw new Error("فرمت مجاز: PDF، تصویر، TXT یا Markdown.");
  const text = await file.text();
  abort();
  if (!text.trim() || text.length > MAX_SOURCE_CHARS)
    throw new Error("متن خالی یا طولانی‌تر از ۵۰۰ هزار نویسه است.");
  return {
    title: file.name,
    kind: "text",
    pages: text.split("\f").map((text, i) => ({ number: i + 1, text })),
  };
}
