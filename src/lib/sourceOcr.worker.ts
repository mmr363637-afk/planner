import { createWorker } from "tesseract.js";
import workerPath from "tesseract.js/dist/worker.min.js?url";
import corePath from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import fasUrl from "@tesseract.js-data/fas/4.0.0_best_int/fas.traineddata.gz?url";
import engUrl from "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url";

// A dedicated, disposable parent worker makes cancellation during initialization
// possible too (Tesseract only returns its child worker after initialization).
// Every executable/model URL is a same-origin, versioned build asset; no CDN.
self.onmessage = async ({ data: file }: MessageEvent<File>) => {
  let engine: Awaited<ReturnType<typeof createWorker>> | undefined;
  const fail = () =>
    self.postMessage({
      error:
        "استخراج تصویر ناموفق بود؛ اتصال یا تصویر را بررسی و دوباره تلاش کن. متن دستی هم در دسترس است.",
    });
  try {
    const langPath = import.meta.env.DEV
      ? `${self.location.origin}/__ocr-models/`
      : new URL(".", fasUrl).href;
    if (!import.meta.env.DEV && new URL(".", engUrl).href !== langPath)
      throw new Error("OCR models must share a directory");
    engine = await createWorker("fas+eng", 1, {
      langPath,
      workerPath: new URL(workerPath, self.location.href).href,
      corePath: new URL(corePath, self.location.href).href,
      cacheMethod: "none",
      errorHandler: fail,
      logger: (m) => {
        if (m.status === "recognizing text")
          self.postMessage({ progress: Math.round(m.progress * 100) });
      },
    });
    const result = await engine.recognize(file);
    self.postMessage({ text: result.data.text });
  } catch {
    fail();
  } finally {
    await engine?.terminate();
  }
};
