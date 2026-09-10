import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Card, Field, Modal, SectionTitle, Toggle, inputClass } from "./ui";
import { SYNC_SETUP_SQL, pullState, pushState, syncConfigured } from "../lib/cloudSync";
import { formatJalaliShort, toFa } from "../lib/jalali";

/**
 * ☁️ همگام‌سازی ابریِ اختیاری (Supabase، بدون SDK).
 * پیش‌فرض: خاموش — آفلاین-اول بودن اپ دست‌نخورده می‌ماند.
 */
export default function SyncSettings() {
  const { state, updateSettings, importData, toast } = useStore();
  const sync = state.settings.sync ?? { provider: "off", url: "", anonKey: "", table: "planner_state", autoSync: false };
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [remote, setRemote] = useState<{ updatedAt: string; device: string; json: string } | null>(null);

  const set = (patch: Partial<typeof sync>) => updateSettings({ sync: { ...sync, ...patch, lastError: undefined } });
  const configured = syncConfigured(sync);

  const doPush = async () => {
    if (!configured || busy) return;
    setBusy("push");
    try {
      await pushState(sync, state);
      updateSettings({ sync: { ...sync, lastSyncAt: Date.now(), lastError: undefined } });
      toast("آپلود شد ☁️ — داده‌های این دستگاه روی ابر رفت", "✅");
    } catch {
      updateSettings({ sync: { ...sync, lastError: "آپلود ناموفق بود؛ آدرس/کلید را بررسی کن" } });
      toast("آپلود ناموفق بود", "⚠️");
    } finally {
      setBusy(null);
    }
  };

  const doPull = async () => {
    if (!configured || busy) return;
    setBusy("pull");
    try {
      const res = await pullState(sync);
      if (!res) {
        toast("روی ابر چیزی نیست؛ اول از یک دستگاه آپلود کن", "☁️");
        return;
      }
      setRemote({ updatedAt: res.updatedAt, device: res.device, json: JSON.stringify({ data: res.data }) });
    } catch {
      updateSettings({ sync: { ...sync, lastError: "دانلود ناموفق بود؛ آدرس/کلید را بررسی کن" } });
      toast("دانلود ناموفق بود", "⚠️");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <SectionTitle>همگام‌سازی ابری ☁️</SectionTitle>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">سینک با Supabase</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              اختیاری و خاموش به‌صورت پیش‌فرض — برای داشتن یک نسخه روی ابر و جابه‌جایی بین گوشی و کامپیوتر.
            </div>
          </div>
          <Toggle checked={sync.provider === "supabase"} onChange={(v) => set({ provider: v ? "supabase" : "off" })} label="سینک ابری" />
        </div>

        {sync.provider === "supabase" && (
          <div className="mt-3">
            <Field label="Project URL">
              <input className={inputClass} dir="ltr" placeholder="https://xxxx.supabase.co" value={sync.url} onChange={(e) => set({ url: e.target.value })} />
            </Field>
            <Field label="anon key">
              <input className={inputClass} dir="ltr" type="password" placeholder="eyJhbGciOi…" value={sync.anonKey} onChange={(e) => set({ anonKey: e.target.value })} />
            </Field>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500">آپلود خودکار بعد از هر تغییر</span>
              <Toggle checked={sync.autoSync} onChange={(v) => set({ autoSync: v })} label="آپلود خودکار" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" disabled={!configured || busy !== null} onClick={doPush}>
                {busy === "push" ? "…" : "⬆️ آپلود الان"}
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" disabled={!configured || busy !== null} onClick={doPull}>
                {busy === "pull" ? "…" : "⬇️ دانلود و جایگزینی"}
              </Button>
            </div>
            <button type="button" className="text-xs text-teal-600 dark:text-teal-400 mt-3" onClick={() => setGuideOpen(true)}>
              📖 راهنمای راه‌اندازی (۳ دقیقه‌ای)
            </button>
            {sync.lastSyncAt && (
              <div className="text-[11px] text-slate-400 mt-2">آخرین سینک موفق: {new Date(sync.lastSyncAt).toLocaleString("fa-IR")}</div>
            )}
            {sync.lastError && <div className="text-[11px] text-rose-600 mt-1">{sync.lastError}</div>}
          </div>
        )}
      </Card>

      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title="📖 راهنمای سینک ابری">
        <ol className="text-xs text-slate-600 dark:text-slate-300 leading-loose list-decimal pr-4 flex flex-col gap-1.5">
          <li>در <b dir="ltr">supabase.com</b> رایگان ثبت‌نام کن و یک پروژه بساز.</li>
          <li>از منوی SQL Editor پروژه، «New query» را باز کن و این اسکریپت را اجرا کن:</li>
        </ol>
        <pre dir="ltr" className="text-[10px] bg-slate-900 text-emerald-200 rounded-xl p-3 overflow-x-auto my-2 whitespace-pre-wrap">{SYNC_SETUP_SQL}</pre>
        <ol className="text-xs text-slate-600 dark:text-slate-300 leading-loose list-decimal pr-4 flex flex-col gap-1.5" start={3}>
          <li>از Settings ← API پروژه، مقادیر <b dir="ltr">Project URL</b> و <b dir="ltr">anon key</b> را بردار و این‌جا بگذار.</li>
          <li>«⬆️ آپلود الان» را بزن. تمام! روی دستگاه دوم هم همین دو مقدار را بگذار و «⬇️ دانلود» بزن.</li>
          <li>⚠️ دانلود، داده‌ی این دستگاه را <b>جایگزین</b> می‌کند؛ اگر مطمئن نیستی اول از «داده‌ها» بکاپ بگیر.</li>
        </ol>
        <Button
          size="sm" variant="secondary" className="w-full mt-3"
          onClick={() => {
            try {
              void navigator.clipboard?.writeText(SYNC_SETUP_SQL);
              toast("اسکریپت SQL کپی شد", "📋");
            } catch { /* ignore */ }
          }}
        >
          📋 کپی اسکریپت SQL
        </Button>
      </Modal>

      <Modal
        open={remote !== null}
        onClose={() => setRemote(null)}
        title="⬇️ جایگزینی با نسخه‌ی ابری؟"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemote(null)}>انصراف</Button>
            <Button
              onClick={() => {
                if (remote && importData(remote.json)) {
                  updateSettings({ sync: { ...sync, lastSyncAt: Date.now(), lastError: undefined } });
                  toast("نسخه‌ی ابری جایگزین شد ☁️", "✅");
                } else {
                  toast("نسخه‌ی ابری خراب است و جایگزین نشد", "⚠️");
                }
                setRemote(null);
              }}
            >
              جایگزین کن
            </Button>
          </>
        }
      >
        {remote && (
          <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <div>📅 تاریخ نسخه‌ی ابری: <b dir="ltr">{new Date(remote.updatedAt).toLocaleString("fa-IR")}</b></div>
            <div>📱 دستگاه فرستنده: <b dir="ltr">{remote.device || "نامشخص"}</b></div>
            <div className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              ⚠️ داده‌ی فعلی این دستگاه ({toFa(state.sessions.length)} جلسه، {toFa(state.topics.length)} مبحث) با نسخه‌ی ابری جایگزین می‌شود.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** آپلود خودکار (debounce) وقتی سینک روشن و پیکربندی شده باشد — فقط push، هرگز جایگزینی خودکار */
export function CloudAutoSync() {
  const { state, updateSettings } = useStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<string>("");

  useEffect(() => {
    const sync = state.settings.sync;
    if (!sync || sync.provider !== "supabase" || !sync.autoSync || !syncConfigured(sync)) return;
    // اثر انگشت سبک برای این‌که سینک بیهوده نزنیم
    const fingerprint = `${state.sessions.length}:${state.tasks.length}:${state.settings.xp}:${state.topics.length}:${(state.mistakes ?? []).length}`;
    if (fingerprint === lastPushed.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pushState(sync, state)
        .then(() => {
          lastPushed.current = fingerprint;
          updateSettings({ sync: { ...sync, lastSyncAt: Date.now(), lastError: undefined } });
        })
        .catch(() => {
          updateSettings({ sync: { ...sync, lastError: `آپلود خودکار ناموفق (${formatJalaliShort(new Date().toISOString().slice(0, 10))})` } });
        });
    }, 45000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessions.length, state.tasks.length, state.topics.length, state.settings.xp, state.settings.sync?.autoSync]);

  return null;
}
