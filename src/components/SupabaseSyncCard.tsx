// ===== کارت همگام‌سازی ابری با Supabase =====
// ورود ناشناس خودکار (بدون هیچ اصطکاک) + اتصال ایمیل اختیاری برای ورود روی دستگاه‌های دیگر.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Card } from "./ui";
import {
  ensureSyncIdentity,
  getSupabaseClient,
  getSupabaseConfig,
  isRemoteNewer,
  isSupabaseConfigured,
  linkEmailToIdentity,
  pullStateFromCloud,
  pushStateToCloud,
  sendEmailOtp,
  signOutSync,
  verifyEmailOtp,
  type SyncIdentity,
} from "../lib/supabaseSync";
import { formatJalaliLong, toDateKey } from "../lib/jalali";

type Phase = "idle" | "connecting" | "ready" | "error";

export default function SupabaseSyncCard() {
  const { state, updateSettings, importData, toast } = useStore();
  const cfg = useMemo(() => getSupabaseConfig(state.settings), [state.settings]);
  const configured = isSupabaseConfigured(state.settings);

  const [identity, setIdentity] = useState<SyncIdentity | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // حالت‌های UI اتصال ایمیل / ورود دستگاه جدید
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [cfgDraft, setCfgDraft] = useState({ url: "", anonKey: "" });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const sb = useMemo(() => (configured ? getSupabaseClient(cfg) : null), [configured, cfg]);

  /** اتصال خودکار ناشناس هنگام باز شدن کارت (فقط اگر پیکربندی آماده باشد) */
  useEffect(() => {
    if (!sb) return;
    setPhase("connecting");
    ensureSyncIdentity(sb)
      .then((id) => {
        if (!mounted.current) return;
        setIdentity(id);
        setPhase("ready");
        // بررسی یک‌باره: اگر نسخه‌ی ابری تازه‌تر است، خبر بده (جایگزینی فقط با تأیید کاربر)
        pullStateFromCloud(sb, id.userId)
          .then((remote) => {
            if (!mounted.current || !remote) return;
            if (isRemoteNewer(remote.updatedAt, state.settings.supabase?.lastRemoteSeenAt ?? state.settings.supabase?.lastSyncAt)) {
              setMsg({ text: "☁️ نسخه‌ی تازه‌تری روی ابر هست — اگر می‌خواهی روی این دستگاه بیاید، «دریافت از ابر» را بزن." });
            }
          })
          .catch(() => { /* اخطار اولیه اختیاری است */ });
      })
      .catch((err) => {
        if (!mounted.current) return;
        setPhase("error");
        setMsg({ text: err?.message ?? "اتصال برقرار نشد.", error: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  const guardBusy = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setMsg(null);
      try {
        await fn();
      } catch (err: any) {
        if (mounted.current) setMsg({ text: err?.message ?? "خطای ناشناخته", error: true });
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [busy],
  );

  const handleSyncNow = () =>
    guardBusy(async () => {
      if (!sb || !identity) return;
      const at = await pushStateToCloud(sb, identity.userId, state);
      updateSettings({ supabase: { ...state.settings.supabase, lastSyncAt: at, lastRemoteSeenAt: at } });
      setMsg({ text: "داده‌ها با موفقیت روی ابر ذخیره شد ☁️" });
    });

  const handlePull = () =>
    guardBusy(async () => {
      if (!sb || !identity) return;
      if (!window.confirm("داده‌های این دستگاه با آخرین نسخه‌ی ابری جایگزین می‌شود. مطمئنی؟")) return;
      const remote = await pullStateFromCloud(sb, identity.userId);
      if (!remote) {
        setMsg({ text: "هنوز هیچ داده‌ای روی ابر نیست؛ اول «همگام‌سازی» را بزن.", error: true });
        return;
      }
      const ok = importData(JSON.stringify(remote.state));
      if (!ok) throw new Error("بازخوانی داده‌ی ابری ناموفق بود.");
      updateSettings({ supabase: { ...state.settings.supabase, lastSyncAt: Date.now(), lastRemoteSeenAt: remote.updatedAt } });
      setMsg({ text: "داده‌ها از ابر بازیابی شد 🔄" });
    });

  const handleLinkEmail = () =>
    guardBusy(async () => {
      if (!sb) return;
      await linkEmailToIdentity(sb, email);
      updateSettings({ supabase: { ...state.settings.supabase, email: email.trim() } });
      setEmailOpen(false);
      setEmail("");
      setMsg({ text: "ایمیل تأیید فرستاده شد — لینک داخل ایمیل را بزن تا حسابت دائمی شود ✉️" });
    });

  const handleSendOtp = () =>
    guardBusy(async () => {
      if (!sb) return;
      await sendEmailOtp(sb, otpEmail);
      setMsg({ text: "کد یک‌بارمصرف به ایمیلت فرستاده شد ✉️ آن را این‌جا وارد کن." });
    });

  const handleVerifyOtp = () =>
    guardBusy(async () => {
      if (!sb) return;
      const id = await verifyEmailOtp(sb, otpEmail, otpCode);
      setIdentity(id);
      setOtpOpen(false);
      setOtpCode("");
      setMsg({ text: "وارد شدی! حالا «دریافت از ابر» را بزن تا داده‌ها به این دستگاه بیاید 🎉" });
    });

  const lastSync = state.settings.supabase?.lastSyncAt;

  if (!configured) {
    return (
      <Card className="mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">☁️</span>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">همگام‌سازی ابری (Supabase)</div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          برای فعال شدن سینک، آدرس پروژه و anon key تنظیم شود (یک‌بار، از داشبورد Supabase).
          دیتابیس مال خودته؛ اپ فقط با آن حرف می‌زند.
        </p>
        <ConfigEditor
          draft={cfgDraft}
          setDraft={setCfgDraft}
          onSave={() => {
            updateSettings({ supabase: { ...state.settings.supabase, url: cfgDraft.url.trim(), anonKey: cfgDraft.anonKey.trim() } });
            setMsg({ text: "پیکربندی ذخیره شد — اتصال خودکار انجام می‌شود…" });
          }}
        />
        {msg && <Note msg={msg} />}
      </Card>
    );
  }

  return (
    <Card className="mb-2">
      <div className="flex items-center gap-2">
        <span className="text-base">☁️</span>
        <div className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">همگام‌سازی ابری (Supabase)</div>
        {phase === "ready" && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            متصل
          </span>
        )}
        {phase === "connecting" && <span className="text-[11px] text-slate-400">در حال اتصال…</span>}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
        شناسه‌ی ناشناس خودکار ساخته شد؛ هیچ پسوردی لازم نیست. برای بردن داده روی دستگاه دیگر، ایمیلت را وصل کن.
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-2.5">
        {identity && (
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span dir="ltr">id: {identity.userId.slice(0, 8)}…</span>
            <span>
              {identity.email ? `✉️ ${identity.email}` : "حساب ناشناس"}
              {lastSync ? ` · آخرین سینک: ${formatJalaliLong(toDateKey(new Date(lastSync)), false)}` : ""}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" size="sm" onClick={handleSyncNow} disabled={busy || phase !== "ready"}>
            {busy ? "یک لحظه…" : "☁️ همگام‌سازی حالا"}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePull} disabled={busy || phase !== "ready"}>
            📥 دریافت از ابر
          </Button>
        </div>

        {/* اتصال ایمیل / ورود روی دستگاه دیگر */}
        {!identity?.email && (
          <button type="button" className="text-[11px] text-teal-600 dark:text-teal-400 text-right hover:underline" onClick={() => { setEmailOpen((v) => !v); setOtpOpen(false); }}>
            ✉️ اتصال ایمیل به این حساب (پیشنهاد می‌شود)
          </button>
        )}
        {emailOpen && (
          <div className="flex gap-2">
            <input
              type="email"
              dir="ltr"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 text-xs px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            />
            <Button size="sm" variant="secondary" disabled={busy || !email.includes("@")} onClick={handleLinkEmail}>
              ارسال لینک تأیید
            </Button>
          </div>
        )}

        <button type="button" className="text-[11px] text-slate-400 text-right hover:underline" onClick={() => { setOtpOpen((v) => !v); setEmailOpen(false); }}>
          📱 ورود روی این دستگاه با ایمیل (دستگاه جدید)
        </button>
        {otpOpen && (
          <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <div className="flex gap-2">
              <input
                type="email"
                dir="ltr"
                inputMode="email"
                placeholder="you@example.com"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                className="flex-1 text-xs px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
              <Button size="sm" variant="secondary" disabled={busy || !otpEmail.includes("@")} onClick={handleSendOtp}>
                ارسال کد
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                inputMode="numeric"
                placeholder="کد ۶ رقمی"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9a-zA-Z]/g, "").slice(0, 8))}
                className="flex-1 text-xs px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-center tracking-widest"
              />
              <Button size="sm" variant="primary" disabled={busy || otpCode.length < 6} onClick={handleVerifyOtp}>
                ورود
              </Button>
            </div>
          </div>
        )}

        {identity && (
          <div className="flex justify-between items-center">
            <button
              type="button"
              className="text-[11px] text-slate-400 hover:underline"
              onClick={() => {
                setCfgDraft({ url: cfg.url, anonKey: cfg.anonKey });
                setConfigOpen((v) => !v);
              }}
            >
              {configOpen ? "بستن پیکربندی" : "پیکربندی پروژه"}
            </button>
            <button
              type="button"
              className="text-[11px] text-rose-500 hover:underline"
              onClick={() =>
                guardBusy(async () => {
                  if (!sb) return;
                  await signOutSync(sb);
                  setIdentity(null);
                  setPhase("idle");
                  setMsg({ text: "از حساب ابری خارج شدی؛ با باز کردن دوباره، شناسه‌ی ناشناس تازه‌ای ساخته می‌شود." });
                })
              }
            >
              خروج از حساب ابری
            </button>
          </div>
        )}
        {configOpen && (
          <ConfigEditor
            draft={cfgDraft}
            setDraft={setCfgDraft}
            onSave={() => {
              updateSettings({ supabase: { ...state.settings.supabase, url: cfgDraft.url.trim(), anonKey: cfgDraft.anonKey.trim() } });
              setConfigOpen(false);
              toast("پیکربندی سینک به‌روز شد", "☁️");
            }}
          />
        )}

        {msg && <Note msg={msg} />}
      </div>
    </Card>
  );
}

function Note({ msg }: { msg: { text: string; error?: boolean } }) {
  return (
    <div
      className={`mt-1 text-[11px] p-2 rounded-lg leading-relaxed ${
        msg.error
          ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
          : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"
      }`}
    >
      {msg.text}
    </div>
  );
}

function ConfigEditor({
  draft,
  setDraft,
  onSave,
}: {
  draft: { url: string; anonKey: string };
  setDraft: (d: { url: string; anonKey: string }) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl flex flex-col gap-2 text-right">
      <label className="block text-[11px] text-slate-600 dark:text-slate-300">Project URL</label>
      <input
        type="text"
        dir="ltr"
        value={draft.url}
        placeholder="https://abcdefgh.supabase.co"
        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
        className="w-full text-xs font-mono p-1.5 border rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
      />
      <label className="block text-[11px] text-slate-600 dark:text-slate-300">anon public key</label>
      <input
        type="text"
        dir="ltr"
        value={draft.anonKey}
        placeholder="eyJhbGciOi…"
        onChange={(e) => setDraft({ ...draft, anonKey: e.target.value })}
        className="w-full text-xs font-mono p-1.5 border rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
      />
      <Button size="sm" variant="secondary" onClick={onSave} disabled={!draft.url.trim() || !draft.anonKey.trim()}>
        ذخیره پیکربندی
      </Button>
    </div>
  );
}
