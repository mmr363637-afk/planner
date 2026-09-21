// ===== کارت پشتیبان‌گیری/بازیابی Google Drive =====
import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card } from "./ui";
import {
  DEPLOYED_GOOGLE_CLIENT_ID,
  getStoredAuth,
  googleAuthErrorMessage,
  isGoogleClientId,
  requestGoogleAccessToken,
  saveStoredAuth,
  uploadStateToGoogleDrive,
  downloadStateFromGoogleDrive,
} from "../lib/googleDrive";
import { formatJalaliLong, toDateKey } from "../lib/jalali";

const GOOGLE_CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials";

type Message = { text: string; error?: boolean } | null;

/**
 * GitHub Pages یک origin عمومی است؛ Google OAuth بدون Client ID ثبت‌شده در Google
 * Cloud کار نمی‌کند. به‌جای یک شناسه‌ی ساختگی/غیرقابل‌استفاده، این کارت هم Client ID
 * نصب‌شده در زمان build را می‌پذیرد و هم Client ID شخصیِ صاحب اپ را.
 */
export default function GoogleDriveSyncCard() {
  const { state, updateSettings, importData } = useStore();
  const savedClientId = state.settings.googleDrive?.clientId?.trim() || "";
  const initialClientId = savedClientId || DEPLOYED_GOOGLE_CLIENT_ID;
  const [auth, setAuth] = useState(getStoredAuth());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Message>(null);
  const [clientId, setClientId] = useState(initialClientId);
  const [showConfig, setShowConfig] = useState(!isGoogleClientId(initialClientId));

  // اگر بکاپی تنظیمات را از دستگاه دیگر برگرداند، مقدار فرم هم تازه شود؛ ولی تایپِ در حال انجام کاربر را پاک نکن.
  useEffect(() => {
    if (!clientId.trim() || clientId === savedClientId || clientId === DEPLOYED_GOOGLE_CLIENT_ID) {
      setClientId(savedClientId || DEPLOYED_GOOGLE_CLIENT_ID);
    }
  }, [savedClientId]);

  const cleanClientId = clientId.trim();
  const isConfigured = isGoogleClientId(cleanClientId);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const clientIdSource = useMemo(
    () => savedClientId ? "شخصی" : DEPLOYED_GOOGLE_CLIENT_ID ? "نسخه‌ی منتشرشده" : "",
    [savedClientId],
  );

  const persistClientId = (): boolean => {
    if (!isConfigured) {
      setShowConfig(true);
      setMsg({
        error: true,
        text: "برای اتصال، ابتدا Google OAuth Client ID معتبر را وارد کن. شناسه باید به .apps.googleusercontent.com ختم شود.",
      });
      return false;
    }
    if (cleanClientId !== savedClientId) {
      updateSettings({ googleDrive: { ...state.settings.googleDrive, clientId: cleanClientId } });
    }
    return true;
  };

  const handleConnect = async () => {
    if (!persistClientId()) return;
    setLoading(true);
    setMsg(null);
    try {
      await requestGoogleAccessToken(cleanClientId);
      setAuth(getStoredAuth());
      setMsg({ text: "اتصال به Google Drive برقرار شد. حالا «ذخیره در Drive» را بزن تا یک پشتیبان ساخته شود. ☁️" });
    } catch (error) {
      setMsg({ text: googleAuthErrorMessage(error), error: true });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    saveStoredAuth(null);
    setAuth(null);
    setMsg({ text: "اتصال محلی به حساب گوگل قطع شد. فایل پشتیبانِ قبلی از Drive پاک نمی‌شود." });
  };

  const handleUpload = async () => {
    if (!auth?.accessToken) return;
    setLoading(true);
    setMsg(null);
    try {
      const result = await uploadStateToGoogleDrive(state, auth.accessToken);
      setAuth(getStoredAuth());
      updateSettings({
        googleDrive: { ...state.settings.googleDrive, clientId: cleanClientId || savedClientId || undefined, lastSyncAt: result.lastSyncAt },
      });
      setMsg({ text: "پشتیبان فعلی در پوشه‌ی اختصاصی برنامه در Google Drive ذخیره شد. ☁️" });
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "ذخیره در Google Drive ناموفق بود.", error: true });
    } finally {
      // در خطای 401، lib توکن را پاک می‌کند؛ UI هم باید همان لحظه به حالت اتصال‌نداشته برگردد.
      setAuth(getStoredAuth());
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!auth?.accessToken) return;
    if (!window.confirm("داده‌های فعلی با نسخه‌ی پشتیبانِ Google Drive جایگزین می‌شوند. قبل از ادامه، اگر لازم است یک فایل JSON دانلود کن. ادامه می‌دهی؟")) return;

    setLoading(true);
    setMsg(null);
    try {
      const cloudState = await downloadStateFromGoogleDrive(auth.accessToken);
      if (!cloudState) {
        setMsg({ text: "هنوز فایل پشتیبانی در پوشه‌ی اختصاصی برنامه پیدا نشد؛ ابتدا از یک دستگاه «ذخیره در Drive» را بزن.", error: true });
        return;
      }
      const ok = importData(JSON.stringify(cloudState));
      setMsg(ok
        ? { text: "داده‌ها از Google Drive بازیابی شدند. 🔄" }
        : { text: "فایل دریافت‌شده معتبر نبود و هیچ داده‌ای جایگزین نشد.", error: true });
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : "دریافت پشتیبان از Google Drive ناموفق بود.", error: true });
    } finally {
      setAuth(getStoredAuth());
      setLoading(false);
    }
  };

  const isConnected = !!auth?.accessToken;
  const lastSync = auth?.lastSyncAt || state.settings.googleDrive?.lastSyncAt;

  return (
    <Card className="mb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">☁️</span>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">پشتیبان‌گیری با Google Drive</div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            فایل JSON مستقیماً در پوشه‌ی مخفی <span dir="ltr">appDataFolder</span> حساب گوگل خودت می‌رود؛ سرور واسطی نداریم. این «ذخیره/بازیابی» دستی است، نه سینک هم‌زمانِ چنددستگاهی یا ادغام خودکار داده‌ها.
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
        {isConnected ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                متصل به حساب گوگل
              </span>
              {lastSync && <span className="text-slate-400 text-[11px] text-left">آخرین ذخیره: {formatJalaliLong(toDateKey(new Date(lastSync)), true)}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" size="sm" onClick={handleUpload} disabled={loading}>
                {loading ? "در حال ذخیره…" : "☁️ ذخیره در Drive"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
                {loading ? "در حال دریافت…" : "📥 بازیابی از Drive"}
              </Button>
            </div>
            <button type="button" onClick={handleDisconnect} className="self-end text-[11px] text-rose-500 hover:underline">
              قطع اتصال این مرورگر
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              توکن ورود فقط کوتاه‌مدت است؛ اگر بعداً دوباره «متصل نبود» دیدی، طبیعی است و با یک کلیک دوباره اجازه می‌دهی. Client ID لازم است تا Google بداند این وب‌سایت اجازه‌ی درخواست Drive دارد.
            </p>
            <Button
              variant="secondary"
              onClick={handleConnect}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2"
            >
              <span aria-hidden="true">🔑</span>
              <span>{loading ? "در حال اتصال به گوگل…" : isConfigured ? "اتصال به Google Drive شخصی" : "پیکربندی Google Drive"}</span>
            </Button>
          </div>
        )}

        {msg && (
          <div className={`mt-2.5 text-[11px] p-2 rounded-lg leading-relaxed ${msg.error
            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
            : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"}`}
            role={msg.error ? "alert" : "status"}
          >
            {msg.text}
          </div>
        )}

        <div className="mt-3 text-right">
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className="text-[11px] text-slate-500 dark:text-slate-400 hover:underline"
            aria-expanded={showConfig}
          >
            {showConfig ? "بستن راه‌اندازی Google Drive" : isConfigured ? "تنظیم/تغییر Google OAuth Client ID" : "راه‌اندازی Google Drive (لازم)"}
          </button>

          {showConfig && (
            <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-right space-y-2.5">
              <label className="block">
                <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Google OAuth Client ID از نوع Web application</span>
                <input
                  type="text"
                  value={clientId}
                  placeholder="1234-xxxx.apps.googleusercontent.com"
                  onChange={(event) => setClientId(event.target.value)}
                  onBlur={() => { if (isGoogleClientId(clientId)) persistClientId(); }}
                  className="w-full text-xs font-mono p-2 border rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  dir="ltr"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {clientId.trim() && !isConfigured && <span className="block mt-1 text-[10px] text-rose-500">فرمت Client ID درست نیست.</span>}
                {isConfigured && clientIdSource && <span className="block mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">Client ID {clientIdSource} آماده است.</span>}
              </label>

              <ol className="list-decimal pr-4 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 space-y-1">
                <li>در یک پروژه‌ی Google Cloud، <b>Google Drive API</b> را فعال کن.</li>
                <li>در OAuth consent screen، حساب خودت را (اگر پروژه در حالت Testing است) به Test users اضافه کن.</li>
                <li>از Credentials یک <b>OAuth client ID → Web application</b> بساز.</li>
                <li>در <span dir="ltr">Authorized JavaScript origins</span> دقیقاً این origin را وارد کن: <code dir="ltr" className="select-all">{origin || "https://your-site.example"}</code></li>
                <li>Client ID را اینجا paste کن و سپس «اتصال» را بزن. Client ID راز نیست؛ Client secret را هرگز داخل اپ وب وارد نکن.</li>
              </ol>
              <div className="flex items-center justify-between gap-2">
                <a href={GOOGLE_CREDENTIALS_URL} target="_blank" rel="noreferrer" className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline">
                  باز کردن Google Cloud Credentials ↗
                </a>
                <Button size="sm" variant="outline" onClick={persistClientId} disabled={!isConfigured}>
                  ذخیره‌ی Client ID
                </Button>
              </div>
              <p className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2">
                حریم خصوصی: فایل در appDataFolder مخفی است، اما در این نسخه با گذرواژه‌ی جداگانه رمزگذاری سرتاسری نمی‌شود؛ برای داده‌ی خیلی حساس از پشتیبان JSON محلیِ رمزگذاری‌شده توسط خودت هم نگه‌دار.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
