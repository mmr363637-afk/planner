import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { aiConfigured, subscribeAiConfig } from "../lib/ai";
import { cn } from "../utils/cn";
import { Modal } from "./ui";

const OPEN_EVENT = "sp:open-ai-assistant";
const AiAssistantDialog = lazy(() => import("./AiAssistantDialog"));

/** Shared by the header, command palette and connection settings. */
export function openAiAssistant(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function AiAssistantTrigger() {
  const connected = useSyncExternalStore(subscribeAiConfig, aiConfigured, () => false);
  return (
    <button
      type="button"
      onClick={openAiAssistant}
      aria-label="دستیار هوشمند"
      title={connected ? "دستیار هوشمند — متصل" : "دستیار هوشمند — اتصال در تنظیمات"}
      data-connected={connected}
      className={cn("relative w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center transition-colors", connected ? "text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50" : "text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60")}
    >
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="7" width="16" height="13" rx="4" />
        <path d="M12 3v4M2 12v4m20-4v4M9 15h6" />
        <circle cx="9" cy="11" r=".8" fill="currentColor" />
        <circle cx="15" cy="11" r=".8" fill="currentColor" />
      </svg>
      {connected && <span aria-hidden="true" className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
    </button>
  );
}

/** Mounted once in Shell, outside the sticky header's stacking context. */
export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const show = () => { setOpenedOnce(true); setOpen(true); };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);
  if (!openedOnce) return null;
  return (
    <Suspense fallback={<Modal open={open} title="🤖 دستیار هوشمند" onClose={close}><p role="status" className="text-sm text-slate-500 py-6 text-center">در حال آماده‌سازی دستیار…</p></Modal>}>
      <AiAssistantDialog open={open} onClose={close} />
    </Suspense>
  );
}
