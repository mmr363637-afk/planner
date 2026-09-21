import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { defaultId } from "../lib/planner";
import { importSourceFile } from "../lib/sourceImport";
import {
  sourceDrafts,
  searchSource,
  sourceEvidenceValid,
  MAX_SOURCE_CHARS,
  MAX_SOURCE_PAGES,
  type SourceDraft,
} from "../lib/sourceLearning";
import { leafTopics } from "../lib/topics";
import type { SourceDocument } from "../types";
import { toFa } from "../lib/jalali";
import { Button, Card, Modal, inputClass } from "./ui";

export default function SourceNotebook({ onClose }: { onClose: () => void }) {
  const { state, saveSource, deleteSource, importSourceCards, toast } =
    useStore();
  const [docId, setDocId] = useState(""),
    [draft, setDraft] = useState<SourceDocument | null>(null),
    [title, setTitle] = useState(""),
    [text, setText] = useState("");
  const [cards, setCards] = useState<SourceDraft[]>([]),
    [selected, setSelected] = useState<number[]>([]),
    [topicId, setTopicId] = useState(""),
    [query, setQuery] = useState("");
  const [question, setQuestion] = useState(""),
    [quote, setQuote] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const doc = state.sourceDocuments?.find((d) => d.id === docId);
  const reset = () => {
    setCards([]);
    setSelected([]);
    setQuery("");
    setQuote("");
    setQuestion("");
    setPage(1);
    setError("");
  };
  const startFile = async (file: File) => {
    if (state.sourceDocuments && state.sourceDocuments.length >= 30) {
      setError(
        "حداکثر ۳۰ منبع؛ ابتدا از داده‌ها بکاپ بگیر و یک منبع را حذف کن.",
      );
      return;
    }
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setError("");
    setProgress("در حال خواندن فایل…");
    try {
      const result = await importSourceFile(
        file,
        setProgress,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setDraft({ ...result, id: defaultId(), createdAt: Date.now() });
        reset();
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "استخراج فایل ناموفق بود؛ دوباره یا با متن دستی تلاش کن.",
        );
    } finally {
      if (abort.current === controller) {
        setProgress("");
        abort.current = null;
      }
    }
  };
  const addManual = () => {
    if (!text.trim() || !title.trim()) return;
    if (text.length > MAX_SOURCE_CHARS) {
      setError("متن بیش از حد طولانی است.");
      return;
    }
    setDraft({
      id: defaultId(),
      title: title.trim(),
      kind: "text",
      createdAt: Date.now(),
      pages: text.split("\f").map((text, i) => ({ number: i + 1, text })),
    });
    reset();
  };
  const addQuote = () => {
    if (!doc) return;
    const evidence = {
      documentId: doc.id,
      documentTitle: doc.title,
      page,
      quote: quote.trim(),
    };
    if (!question.trim() || !sourceEvidenceValid(doc, evidence)) {
      setError("سؤال را بنویس و عبارتی عیناً از صفحهٔ انتخاب‌شده نقل کن.");
      return;
    }
    setCards((c) => [
      ...c,
      { front: question.trim(), back: quote.trim(), evidence },
    ]);
    setQuestion("");
    setQuote("");
    setError("");
  };
  const results = doc ? searchSource(doc, query) : [];
  return (
    <Modal
      open
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      title="جزوهٔ متصل به منبع"
    >
      <p className="text-sm leading-7 text-slate-600 dark:text-slate-300 mb-4">
        از متن، PDF یا تصویر، کارتِ قابل‌ردیابی بساز. پاسخ‌ها عیناً از متن
        استخراج می‌شوند؛ این ابزار پاسخ تازه تولید نمی‌کند و درستی علمی منبع را
        تضمین نمی‌کند.
      </p>
      {progress ? (
        <Card>
          <p role="status" className="text-sm">
            {progress}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              abort.current?.abort();
              setProgress("");
            }}
          >
            لغو استخراج
          </Button>
        </Card>
      ) : (
        <details open={!doc && !draft} className="mb-4">
          <summary className="cursor-pointer font-bold text-sm mb-3">
            افزودن منبع
          </summary>
          <label className="block text-sm mb-3">
            فایل (تا ۱۵ مگابایت)
            <input
              aria-label="فایل منبع"
              type="file"
              accept=".pdf,.txt,.md,image/*"
              className="block w-full mt-2 text-xs"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void startFile(file);
              }}
            />
          </label>
          <p className="text-xs leading-6 text-slate-500 mb-3">
            PDF متنی تا ۱۰۰ صفحه روی دستگاه خوانده می‌شود. برای PDF اسکن‌شده،
            تصویر صفحه را وارد کن. OCR فارسی/انگلیسی در مرورگر اجرا می‌شود؛ بار
            اول موتور و زبان از همین سایت دریافت می‌شوند و اینترنت لازم است.
            وابسته به CDN نیست؛ تصویر به سرویس تشخیص متن ارسال نمی‌شود. ترتیب
            متن فارسی و OCR را حتماً بازبینی کن.
          </p>
          <label className="block text-sm mb-2">
            عنوان منبع
            <input
              aria-label="عنوان منبع"
              className={inputClass}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            متن جزوه
            <textarea
              aria-label="متن جزوه"
              className={inputClass + " min-h-32"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="مثلاً: میتوکندری: اندامک تولید انرژی سلول"
            />
          </label>
          <Button
            className="mt-2"
            disabled={
              !text.trim() ||
              !title.trim() ||
              (state.sourceDocuments?.length ?? 0) >= 30
            }
            onClick={addManual}
          >
            بازبینی متن منبع
          </Button>
        </details>
      )}
      {draft && (
        <Card className="mb-4">
          <h3 className="font-bold mb-3">بازبینی پیش از ذخیره</h3>
          <label className="text-sm">
            عنوان
            <input
              className={inputClass}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <p className="text-xs leading-6 my-3">
            شمارهٔ صفحه حفظ می‌شود. فقط متن ذخیره می‌شود، نه فایل اصلی. اصلاح
            متن OCR باید در این مرحله انجام شود؛ کارت‌ها به همین نسخه متصل
            خواهند شد.
          </p>
          {draft.pages.map((p, i) => (
            <details key={p.number} open={draft.pages.length === 1}>
              <summary className="text-sm py-2 cursor-pointer">
                صفحه {toFa(p.number)} · {toFa(p.text.length)} نویسه
              </summary>
              <textarea
                aria-label={`متن صفحه ${p.number}`}
                className={inputClass + " min-h-40"}
                value={p.text}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pages: draft.pages.map((x, j) =>
                      j === i ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
              />
            </details>
          ))}
          <div className="flex gap-2 mt-3">
            <Button
              disabled={
                !draft.title.trim() ||
                !draft.pages.some((p) => p.text.trim()) ||
                draft.pages.length > MAX_SOURCE_PAGES ||
                draft.pages.reduce((n, p) => n + p.text.length, 0) >
                  MAX_SOURCE_CHARS
              }
              onClick={() => {
                if (!saveSource(draft)) {
                  setError("منبع ذخیره نشد؛ سقف حجم منابع را بررسی کن.");
                  return;
                }
                setDocId(draft.id);
                setDraft(null);
                setText("");
                setTitle("");
                reset();
              }}
            >
              متن را بررسی کردم؛ ذخیرهٔ منبع
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              انصراف
            </Button>
          </div>
        </Card>
      )}
      {!!state.sourceDocuments?.length && (
        <label className="block text-sm my-4">
          منبع ذخیره‌شده
          <select
            aria-label="منبع ذخیره‌شده"
            className={inputClass}
            value={docId}
            onChange={(e) => {
              setDocId(e.target.value);
              reset();
            }}
          >
            <option value="">انتخاب منبع</option>
            {state.sourceDocuments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {doc && (
        <>
          <Card className="mb-4">
            <h3 className="font-bold">{doc.title}</h3>
            <p className="text-xs text-slate-500 my-2">
              {toFa(doc.pages.length)} صفحه · نسخهٔ متنیِ بررسی‌شده توسط شما
            </p>
            <label className="text-sm">
              جست‌وجوی عبارت در منبع
              <input
                aria-label="جست‌وجو در منبع"
                className={inputClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {query.trim() &&
              (!results.length ? (
                <p className="text-sm mt-3">
                  در منبع عبارتی مطابق این جست‌وجو پیدا نشد؛ پاسخی حدس نمی‌زنیم.
                </p>
              ) : (
                results.map((r, i) => (
                  <blockquote
                    key={i}
                    className="border-r-2 border-teal-500 pr-3 text-sm leading-7 my-3"
                  >
                    <b>صفحه {toFa(r.page)}</b>
                    <p>{r.quote}</p>
                  </blockquote>
                ))
              ))}
            <details className="my-3">
              <summary className="cursor-pointer text-sm">
                دیدن متن صفحه‌ها
              </summary>
              {doc.pages.map((p) => (
                <section key={p.number}>
                  <h4 className="font-bold text-sm mt-3">
                    صفحه {toFa(p.number)}
                  </h4>
                  <p className="text-sm whitespace-pre-wrap leading-7 break-words">
                    {p.text || "متن قابل استخراج نداشت."}
                  </p>
                </section>
              ))}
            </details>
            <Button
              variant="secondary"
              onClick={() => {
                const items = sourceDrafts(doc);
                setCards(items);
                setSelected([]);
                if (!items.length)
                  setError(
                    "الگوی سؤال/جواب یا عنوان:تعریف پیدا نشد؛ از نقل‌قول دستی کارت بساز.",
                  );
                else setError("");
              }}
            >
              پیشنهاد کارت از عبارت‌های منبع
            </Button>
          </Card>
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-bold">
              ساخت کارت از نقل‌قول دلخواه
            </summary>
            <label className="block text-sm mt-3">
              صفحه
              <select
                className={inputClass}
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
              >
                {doc.pages.map((p) => (
                  <option key={p.number} value={p.number}>
                    {toFa(p.number)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm mt-2">
              سؤال
              <input
                aria-label="سؤال از منبع"
                className={inputClass}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <label className="block text-sm mt-2">
              پاسخ؛ عین عبارت صفحه
              <textarea
                aria-label="نقل‌قول پاسخ"
                className={inputClass}
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
              />
            </label>
            <Button className="mt-2" onClick={addQuote}>
              افزودن به پیش‌نمایش کارت‌ها
            </Button>
          </details>
          {!!cards.length && (
            <>
              <h3 className="font-bold mb-2">بازبینی و تأیید کارت‌ها</h3>
              <p className="text-xs leading-6 text-slate-500 mb-3">
                سؤال قابل ویرایش است. پاسخ و نقل‌قول را با متن بررسی کن؛ فقط
                کارت‌هایی که تیک بزنی وارد مرور می‌شوند.
              </p>
              <label className="text-sm">
                اتصال به مبحث (اختیاری)
                <select
                  aria-label="مبحث کارت‌های منبع"
                  className={inputClass}
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                >
                  <option value="">کارت مستقل</option>
                  {leafTopics(state.topics).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {cards.map((c, i) => (
                <Card key={i} className="my-3">
                  <label className="flex gap-2 text-sm mb-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(i)}
                      onChange={() =>
                        setSelected((s) =>
                          s.includes(i) ? s.filter((x) => x !== i) : [...s, i],
                        )
                      }
                    />
                    این کارت را بررسی و تأیید کردم
                  </label>
                  <input
                    aria-label={`سؤال کارت ${i + 1}`}
                    className={inputClass}
                    value={c.front}
                    onChange={(e) =>
                      setCards((items) =>
                        items.map((x, j) =>
                          j === i ? { ...x, front: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <p className="text-sm leading-7 my-2">{c.back}</p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-teal-700">
                      منبع: {c.evidence.documentTitle}، صفحه{" "}
                      {toFa(c.evidence.page)}
                    </summary>
                    <blockquote className="whitespace-pre-wrap leading-6 mt-2">
                      {c.evidence.quote}
                    </blockquote>
                  </details>
                </Card>
              ))}
              <Button
                disabled={!selected.length}
                className="w-full"
                onClick={() => {
                  const count = importSourceCards(
                    cards.filter((_, i) => selected.includes(i)),
                    topicId || undefined,
                  );
                  toast(
                    `${toFa(count)} کارت وارد مرور شد؛ کارت تکراری یا بدون شاهد وارد نمی‌شود.`,
                    "✅",
                  );
                  setCards([]);
                  setSelected([]);
                }}
              >
                افزودن {toFa(selected.length)} کارت تأییدشده به مرور
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => {
              if (
                window.confirm(
                  "متن منبع حذف شود؟ نقل‌قول کارت‌های ساخته‌شده باقی می‌ماند.",
                )
              ) {
                deleteSource(doc.id);
                setDocId("");
                reset();
              }
            }}
          >
            حذف متن این منبع
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-600 leading-7 mt-3">
          {error}
        </p>
      )}
    </Modal>
  );
}
