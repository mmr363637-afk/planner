import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { aiConfigured, subscribeAiConfig } from "../lib/ai";
import { aiAssistantReply, assistantSection, ASSISTANT_HISTORY_LIMIT, ASSISTANT_QUESTION_LIMIT, ASSISTANT_SECTIONS, buildAssistantContext, type AssistantMessage, type AssistantSection } from "../lib/studyAssistant";
import { toFa } from "../lib/jalali";
import { trackFeature } from "../lib/usage";
import { useNav } from "../nav";
import { useStore } from "../store";
import { cn } from "../utils/cn";
import { Button, Modal, inputClass } from "./ui";

const EMPTY_MESSAGES: AssistantMessage[] = [];
const DISPLAY_HISTORY_LIMIT = 20;

export default function AiAssistantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useStore();
  const nav = useNav();
  const section = assistantSection(nav);
  const info = ASSISTANT_SECTIONS[section];
  const [connected, setConnected] = useState(aiConfigured);
  // Deliberately not in AppState/localStorage: conversations never enter backups or sync.
  const [conversations, setConversations] = useState<Partial<Record<AssistantSection, AssistantMessage[]>>>({});
  const [question, setQuestion] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const scope = useRef({ open, section });
  scope.current = { open, section };
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const messages = conversations[section] ?? EMPTY_MESSAGES;
  const busy = pending !== null;
  const context = useMemo(() => open && includeContext ? buildAssistantContext(state, section) : undefined, [state, section, open, includeContext]);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setPending(null);
  }, []);
  const close = () => { cancel(); onClose(); };

  useEffect(() => {
    cancel();
    setIncludeContext(false);
    setError(null);
  }, [open, section, cancel]);
  useEffect(() => { setQuestion(""); }, [section]);
  useEffect(() => subscribeAiConfig(() => {
    cancel();
    setConnected(aiConfigured());
    setConversations({});
    setQuestion("");
    setError(null);
    setIncludeContext(false);
  }), [cancel]);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    if (open && connected && !busy) questionRef.current?.focus();
  }, [open, connected, busy]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, pending, open]);

  const send = async () => {
    const text = question.trim();
    if (!text || !open || !connected || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(text);
    setError(null);
    const current = () => request.current === controller && scope.current.open && scope.current.section === section && aiConfigured();
    try {
      const reply = await aiAssistantReply(section, text, context, messages, controller.signal);
      if (!current()) return;
      setConversations((previous) => ({
        ...previous,
        [section]: [...(previous[section] ?? []), { role: "user" as const, content: text }, { role: "assistant" as const, content: reply }].slice(-DISPLAY_HISTORY_LIMIT),
      }));
      setQuestion("");
      trackFeature("ai_assistant");
    } catch (e) {
      if (current() && !controller.signal.aborted) setError(e instanceof Error ? e.message : "ارتباط با دستیار ناموفق بود؛ دوباره تلاش کن.");
    } finally {
      if (request.current === controller) { request.current = null; setPending(null); }
    }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(); };

  return (
    <Modal open={open} title="🤖 دستیار هوشمند" onClose={close}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-violet-50 dark:bg-violet-950/30 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-violet-700 dark:text-violet-300">همراهِ بخش {info.title}</span>
            <span className="text-[10px] text-slate-500">{connected ? "آنلاین · با اتصال خودت" : "هنوز متصل نیست"}</span>
          </div>
          <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">{info.description}</p>
        </div>

        {!connected ? (
          <div className="space-y-3">
            <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
              برای استفاده، در «تنظیمات ← هوشمند و استفاده ← دستیار هوشمند» سرویس خودت را وصل کن.
              همان اتصال برای همهٔ بخش‌ها استفاده می‌شود؛ نیازی به کلید جداگانه نیست.
              بدون اتصال، همهٔ ابزارهای آفلاین مثل قبل کار می‌کنند.
            </p>
            <Button onClick={() => { close(); nav.go("settings"); }}>رفتن به تنظیمات دستیار</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5" aria-label="پیشنهادهای این بخش">
              {info.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={busy}
                  onClick={() => { setQuestion(suggestion); setError(null); questionRef.current?.focus(); }}
                  className="text-right text-xs leading-6 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors disabled:opacity-40"
                >
                  ✨ {suggestion}
                </button>
              ))}
            </div>

            {(messages.length > 0 || busy) && (
              <div ref={logRef} role="log" aria-label={`گفت‌وگوی بخش ${info.title}`} aria-live="polite" aria-relevant="additions" className="max-h-72 overflow-y-auto space-y-3 rounded-xl border border-slate-100 dark:border-slate-700 p-2">
                {messages.map((message, index) => (
                  <div key={index} className={cn("rounded-xl px-3 py-2 text-sm leading-7 whitespace-pre-wrap break-words", message.role === "user" ? "bg-violet-50 dark:bg-violet-950/30 text-violet-900 dark:text-violet-200" : "bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-200")}>
                    <div className="text-[10px] font-bold mb-1 opacity-60">{message.role === "user" ? "تو" : "دستیار"}</div>
                    {message.content}
                  </div>
                ))}
                {busy && (
                  <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 px-3 py-2">
                    <p className="text-sm leading-7 whitespace-pre-wrap break-words">{pending}</p>
                    <p role="status" className="text-xs text-violet-600 dark:text-violet-300 mt-2 animate-pulse">دستیار در حال فکر کردن…</p>
                  </div>
                )}
              </div>
            )}

            {error && <p role="alert" className="text-xs leading-7 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300 p-3">{error} سؤال حفظ شده؛ می‌توانی دوباره ارسال کنی.</p>}

            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">سؤال یا درخواستت</span>
                <textarea
                  ref={questionRef}
                  className={cn(inputClass, "mt-1.5 min-h-24 leading-7 resize-y")}
                  aria-label="سؤال از دستیار"
                  placeholder="سؤالت را بنویس یا یکی از پیشنهادهای بالا را انتخاب کن…"
                  value={question}
                  disabled={busy}
                  maxLength={ASSISTANT_QUESTION_LIMIT}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
                  }}
                />
              </label>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer text-xs leading-6 text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={includeContext} disabled={busy} onChange={(event) => setIncludeContext(event.target.checked)} className="mt-1.5 accent-violet-600" />
                  <span>خلاصهٔ این بخش را هم بفرست<span className="block text-[10px] text-slate-500">{info.summaryLabel}؛ فقط همراهِ ارسال پیام.</span></span>
                </label>
                {includeContext && (
                  <details>
                    <summary className="cursor-pointer text-[11px] font-medium text-violet-600 dark:text-violet-300">پیش‌نمایش خلاصهٔ ارسالی</summary>
                    <pre aria-label="خلاصهٔ ارسالی" dir="ltr" className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 dark:bg-slate-900 p-2 text-[10px] leading-5 whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">{JSON.stringify(context, null, 2)}</pre>
                  </details>
                )}
                <p className="text-[10px] leading-5 text-slate-500">
                  پیام و حداکثر {toFa(ASSISTANT_HISTORY_LIMIT / 2)} رفت‌وبرگشت آخرِ همین بخش به سرویس وصل‌شده می‌رود.
                  ارسال خلاصه پیش‌فرض خاموش است؛ فایل‌ها، یادداشت‌ها و اطلاعات حساب خودکار ارسال نمی‌شوند.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={busy || !question.trim()} className="bg-violet-600 hover:bg-violet-700 shadow-violet-600/20">{busy ? "در حال ارسال…" : "ارسال به دستیار"}</Button>
                {busy ? <Button variant="outline" onClick={cancel}>لغو درخواست</Button> : messages.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setConversations((previous) => ({ ...previous, [section]: [] })); setError(null); }}>پاک‌کردن گفت‌وگو</Button>}
              </div>
              <p className="text-[10px] text-slate-400">Enter برای ارسال · Shift+Enter برای خط جدید</p>
            </form>
          </>
        )}
        <p className="text-[10px] leading-6 text-slate-500">
          پاسخ مدل ممکن است اشتباه باشد؛ با منبع درسیت بررسی کن. دستیار فقط پیشنهاد می‌دهد و چیزی را در برنامه تغییر نمی‌دهد.
          گفت‌وگوها فقط تا باز بودن همین اپ در حافظه می‌مانند؛ در بکاپ یا سینک ذخیره نمی‌شوند.
        </p>
      </div>
    </Modal>
  );
}
