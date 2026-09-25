import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Button, Card, Segmented, inputClass } from "./ui";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";
import { getSupabaseConfig } from "../lib/supabaseSync";
import { pushSupport, subscribePush, unsubscribePush } from "../lib/webpush";
import { clearAiConfig, loadAiConfig, saveAiConfig, testAiConnection, type AiConfig } from "../lib/ai";
import { resetUsage, usageReport } from "../lib/usage";

/* ============ الگوریتم زمان‌بندی فلش‌کارت ============ */

export function SrsAlgorithmRow() {
  const { state, updateSettings, toast } = useStore();
  const value = state.settings.srsAlgorithm ?? "sm2";
  return (
    <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-700/60">
      <div className="text-sm text-slate-700 dark:text-slate-200 mb-2">🧮 الگوریتم فلش‌کارت‌ها</div>
      <Segmented
        value={value}
        onChange={(v) => {
          updateSettings({ srsAlgorithm: v });
          toast(v === "fsrs" ? "FSRS فعال شد — از مرور بعدی" : "SM-2 کلاسیک فعال شد", "🧮");
        }}
        options={[
          { value: "sm2", label: "SM-2 کلاسیک" },
          { value: "fsrs", label: "FSRS پیشرفته ✨" },
        ]}
      />
      <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
        SM-2 همان الگوریتم معروف و آزموده‌شده است. FSRS نسل جدید است: «پایداری حافظه» را برای هر
        کارت تخمین می‌زند و فاصله‌ها را شخصی‌سازی می‌کند — برای هزاران کارتِ پزشکی معمولاً مرورِ کمتر
        با یادآوریِ همان‌قدر. هر دو آفلاین‌اند؛ دکمه‌های ارزیابی عوض نمی‌شوند و تاریخچه‌ات هم حفظ می‌شود.
      </p>
    </div>
  );
}

/* ============ 📲 اعلان واقعی (Web Push) ============ */

export function WebPushCard() {
  const { state, updateSettings, toast } = useStore();
  const cfg = state.settings.webPush ?? {};
  const [vapid, setVapid] = useState(cfg.vapidKey ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const support = pushSupport();
  const sb = getSupabaseConfig(state.settings);

  useEffect(() => {
    if (support === "unsupported") setStatus("این مرورگر از Web Push پشتیبانی نمی‌کند.");
    else if (support === "no-sw") setStatus("سرویس‌ورکر فعال نیست — یک بار اپ را آنلاین باز کن.");
  }, [support]);

  const enable = async () => {
    setBusy(true);
    setStatus(null);
    const r = await subscribePush({ vapidKey: vapid, supabaseUrl: sb.url, anonKey: sb.anonKey });
    setBusy(false);
    if (r.ok) {
      updateSettings({ webPush: { ...cfg, vapidKey: vapid.trim(), enabled: true, lastSubAt: Date.now() } });
      setStatus("✅ پوش فعال شد — از این پس حتی با اپِ بسته، یادآورها می‌رسند.");
      toast("اعلان واقعی فعال شد 📲", "✅");
    } else {
      setStatus(`⚠️ ${r.error}`);
    }
  };

  const disable = async () => {
    setBusy(true);
    await unsubscribePush({ supabaseUrl: sb.url, anonKey: sb.anonKey });
    setBusy(false);
    updateSettings({ webPush: { ...cfg, enabled: false } });
    setStatus("پوش خاموش شد — اعلان‌های داخل اپ مثل قبل کار می‌کنند.");
  };

  return (
    <details className="mb-2 group">
      <summary className="cursor-pointer select-none list-none rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
        <span>📲 اعلان واقعی (پوش) — پیشرفته</span>
        <span className="text-[10px] font-normal text-slate-400">فقط با راه‌اندازی شخصی سرور ▾</span>
      </summary>
      <div className="mt-2">
      <Card>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">📲 اعلان واقعی (پوش)</div>
        <span className={cn("text-[10px] px-2 py-0.5 rounded-full", cfg.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300")}>
          {cfg.enabled ? "روشن" : "خاموش"}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
        با پوش، یادآور صبحگاهی/روز امتحان/مرورها حتی وقتی <b>اپ بسته است</b> هم می‌رسند (روی اندروید و
        PWA نصب‌شده). کاملاً اختیاری است — بدون آن، همه‌ی اعلان‌های داخل اپ مثل قبل کار می‌کنند و اپ
        صددرصد آفلاین می‌ماند. نیاز به راه‌اندازی یک‌باره‌ی سرور دارد (کلید VAPID + سه تابع Supabase؛
        راهنما در README ریپو). اگر نمی‌خواهی راه‌اندازی کنی، همین بخش را بسته بگذار — هیچ‌چیز از دست
        نمی‌رود و اعلان‌های داخل‌اپ کامل‌اند.
      </p>
      {support !== "ready" ? (
        <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-2.5">{status}</div>
      ) : cfg.enabled ? (
        <div className="space-y-2">
          {status && <div className="text-[11px] text-slate-500 dark:text-slate-400">{status}</div>}
          <div className="text-[11px] text-slate-400">آخرین ثبت: {cfg.lastSubAt ? toFa(new Date(cfg.lastSubAt).toLocaleString("fa-IR")) : "—"}</div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void disable()}>خاموش کردن پوش</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className={cn(inputClass, "text-xs")}
            dir="ltr"
            placeholder="کلید عمومی VAPID (از سازنده/سرور خودت)"
            value={vapid}
            onChange={(e) => setVapid(e.target.value)}
          />
          <Button size="sm" disabled={busy || !vapid.trim()} onClick={() => void enable()}>
            {busy ? "در حال ثبت…" : "فعال‌سازی پوش"}
          </Button>
          {status && <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{status}</div>}
        </div>
      )}
    </Card>
      </div>
    </details>
  );
}

/* ============ 🤖 دستیار هوشمند (BYO-Key) ============ */

export function AiAssistantCard() {
  const { toast } = useStore();
  const [cfg, setCfg] = useState<AiConfig | null>(() => loadAiConfig());
  const [baseUrl, setBaseUrl] = useState(cfg?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(cfg?.apiKey ?? "");
  const [model, setModel] = useState(cfg?.model ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const test = async () => {
    setBusy(true);
    setResult(null);
    const next: AiConfig = { baseUrl, apiKey, model };
    const r = await testAiConnection(next);
    setBusy(false);
    if (r.ok) {
      saveAiConfig(next);
      setCfg(next);
      setResult({ ok: true, msg: "✅ اتصال برقرار است — دستیار در «ساخت فلش‌کارت»، «منتور اشتباهات» و «گزارش هفته» فعال شد." });
      toast("دستیار هوشمند وصل شد 🤖", "✅");
    } else {
      setResult({ ok: false, msg: r.error ?? "خطا" });
    }
  };

  const disconnect = () => {
    clearAiConfig();
    setCfg(null);
    setBaseUrl(""); setApiKey(""); setModel("");
    setResult({ ok: true, msg: "دستیار قطع شد — همه‌ی سازنده‌های آفلاین مثل قبل کار می‌کنند." });
  };

  return (
    <Card className="mb-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">🤖 دستیار هوشمند (اختیاری)</div>
        <span className={cn("text-[10px] px-2 py-0.5 rounded-full", cfg ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300")}>
          {cfg ? "متصل" : "قطع"}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
        با کلیدِ API <b>خودت</b> (OpenRouter، Groq، Gemini یا حتی Ollama روی کامپیوتر خودت — هر سرویس
        سازگار با OpenAI). سه چیز اضافه می‌کند: ساخت فلش‌کارت هوشمند از متن، توضیحِ ریشه‌ای اشتباه‌ها،
        و روایتِ نوشته‌شده‌ی هفته. <b>کلید فقط در localStorage همین دستگاه می‌ماند</b> — داخل AppState
        نمی‌رود، پس با بکاپ/سینک ابر جابه‌جا نمی‌شود. بدون دستیار، همه‌ی مسیرهای آفلاین (ساخت
        قاعده‌محور کارت، منتور اشتباهات، گزارش‌های عددی) کامل کار می‌کنند.
      </p>
      <div className="space-y-2">
        <input className={cn(inputClass, "text-xs")} dir="ltr" placeholder="baseUrl — مثلاً https://openrouter.ai/api/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <input className={cn(inputClass, "text-xs")} dir="ltr" type="password" placeholder="API Key (فقط روی این دستگاه ذخیره می‌شود)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <input className={cn(inputClass, "text-xs")} dir="ltr" placeholder="model — مثلاً openai/gpt-4o-mini" value={model} onChange={(e) => setModel(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !baseUrl.trim() || !apiKey.trim() || !model.trim()} onClick={() => void test()}>
            {busy ? "در حال تست…" : cfg ? "تست و ذخیره" : "اتصال"}
          </Button>
          {cfg && <Button size="sm" variant="outline" onClick={disconnect}>قطع کردن</Button>}
        </div>
        {result && (
          <div className={cn("text-[11px] leading-relaxed rounded-xl p-2.5", result.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300")}>
            {result.msg}
          </div>
        )}
        <p className="text-[10px] text-slate-400 leading-relaxed">
          نکته‌ی فنی: سرویس باید CORS مرورگر را قبول کند (OpenRouter/Groq/Gemini/Ollama قبول دارند).
          متن ارسالی فقط همان چیزی است که همان‌لحظه می‌فرستی (متنِ ساخت کارت، یک اشتباه، یا خلاصه‌ی
          عددی هفته) — کل داده‌ی اپ هرگز ارسال نمی‌شود.
        </p>
      </div>
    </Card>
  );
}

/* ============ 📈 گزارش استفاده‌ی محلی ============ */

export function UsageReportCard() {
  const [tick, setTick] = useState(0);
  const report = usageReport(14);
  return (
    <Card className="mb-2">
      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">📈 گزارش استفاده‌ی محلی</div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
        فقط روی همین دستگاه شمرده می‌شود (نه در بکاپ، نه در سینک ابر، نه هیچ سروری) — تا بدانی کدام
        قابلیت‌ها واقعاً برایت جا افتاده‌اند. اگر اسکرین‌شاتش را برای سازنده بفرستی، به او کمک کرده‌ای
        بفهمد چه چیزی را نگه دارد و چه چیزی را ساده‌تر کند.
      </p>
      {report.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">هنوز داده‌ای نیست — بعد از چند روز استفاده پر می‌شود.</div>
      ) : (
        <div key={tick} className="flex flex-col gap-1.5">
          {report.map((r) => (
            <div key={r.key} className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
              <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{toFa(r.count)}×</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="ghost" onClick={() => { resetUsage(); setTick((t) => t + 1); }}>
          صفر کردن شمارنده‌ها
        </Button>
      </div>
    </Card>
  );
}
