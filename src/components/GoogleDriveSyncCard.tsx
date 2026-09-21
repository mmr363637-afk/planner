// ===== کارت همگام‌سازی ابری Google Drive =====
import { useState, useEffect } from "react";
import { useStore } from "../store";
import { Button, Card } from "./ui";
import {
  getStoredAuth,
  saveStoredAuth,
  requestGoogleAccessToken,
  uploadStateToGoogleDrive,
  downloadStateFromGoogleDrive,
} from "../lib/googleDrive";
import { formatJalaliLong, toDateKey } from "../lib/jalali";

// Client ID عمومی یا پیش‌فرض برنامه (قابل تغییر توسط کاربر در صورت نیاز به پروژه شخصی)
const DEFAULT_CLIENT_ID = "1042784562044-8j3q4m8p2u7s2d3n4o5p6q7r8s9t0u1v.apps.googleusercontent.com";

export default function GoogleDriveSyncCard() {
  const { state, updateSettings, importData } = useStore();
  const [auth, setAuth] = useState(getStoredAuth());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [customClientId, setCustomClientId] = useState(
    state.settings.googleDrive?.clientId || ""
  );
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    setAuth(getStoredAuth());
  }, []);

  const clientId = customClientId.trim() || DEFAULT_CLIENT_ID;

  const handleConnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      await requestGoogleAccessToken(clientId);
      setAuth(getStoredAuth());
      setMsg({ text: "اتصال به Google Drive با موفقیت برقرار شد! 🎉" });
    } catch (err: any) {
      setMsg({
        text: err?.message || "خطا در اتصال به حساب گوگل. لطفاً دسترسی پاپ‌آپ مرورگر را بررسی کنید.",
        error: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    saveStoredAuth(null);
    setAuth(null);
    setMsg({ text: "اتصال به حساب گوگل قطع شد." });
  };

  const handleUpload = async () => {
    if (!auth?.accessToken) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await uploadStateToGoogleDrive(state, auth.accessToken);
      setAuth(getStoredAuth());
      updateSettings({
        googleDrive: {
          ...state.settings.googleDrive,
          lastSyncAt: res.lastSyncAt,
        },
      });
      setMsg({ text: "پشتیبان با موفقیت در پوشه‌ی امن گوگل درایو ذخیره شد! ☁️" });
    } catch (err: any) {
      setMsg({ text: err?.message || "خطا در همگام‌سازی و آپلود", error: true });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!auth?.accessToken) return;
    if (!window.confirm("آیا مطمئن هستید؟ داده‌های فعلی با آخرین نسخه از گوگل درایو جایگزین خواهند شد.")) {
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const cloudState = await downloadStateFromGoogleDrive(auth.accessToken);
      if (!cloudState) {
        setMsg({ text: "هیچ فایل پشتیبانی در گوگل درایو پیدا نشد.", error: true });
        return;
      }
      const ok = importData(JSON.stringify(cloudState));
      if (ok) {
        setMsg({ text: "داده‌ها با موفقیت از گوگل درایو بازیابی شدند! 🔄" });
      } else {
        setMsg({ text: "خطا در بازخوانی داده‌های دریافتی.", error: true });
      }
    } catch (err: any) {
      setMsg({ text: err?.message || "خطا در دریافت پشتیبان از درایو", error: true });
    } finally {
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
            <span className="text-base">☁️</span>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              همگام‌سازی با Google Drive (رایگان و امن)
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            بدون هیچ سرور واسط؛ فایل پشتیبان رمزگذاری‌شده مستقیماً در پوشه‌ی مخفی و اختصاصی گوگل درایو شخصی خودت ذخیره می‌شود.
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
        {isConnected ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                متصل به حساب گوگل
              </span>
              {lastSync && (
                <span className="text-slate-400 text-[11px]">
                  آخرین سینک: {formatJalaliLong(toDateKey(new Date(lastSync)), true)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={handleUpload}
                disabled={loading}
              >
                {loading ? "در حال ارسال..." : "☁️ ذخیره در درایو"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={loading}
              >
                {loading ? "در حال دریافت..." : "📥 بازیابی از درایو"}
              </Button>
            </div>

            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-[11px] text-rose-500 hover:underline"
              >
                قطع اتصال گوگل درایو
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              با اتصال به گوگل درایو، اگر گوشی عوض شود یا حافظه مرورگر پاک شود، اطلاعات مطالعه و فلش‌کارت‌هایت همیشه در امان است.
            </p>
            <Button
              variant="secondary"
              onClick={handleConnect}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2"
            >
              <span>🔑</span>
              <span>{loading ? "در حال اتصال به گوگل..." : "اتصال به Google Drive شخصی"}</span>
            </Button>
          </div>
        )}

        {/* پیام وضعیت */}
        {msg && (
          <div
            className={`mt-2.5 text-[11px] p-2 rounded-lg leading-relaxed ${
              msg.error
                ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* تنظیمات پیشرفته Client ID */}
        <div className="mt-2 text-left">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="text-[10px] text-slate-400 hover:underline"
          >
            {showConfig ? "بستن تنظیمات پیشرفته Client ID" : "تنظیم Client ID شخصی گوگل (اختیاری)"}
          </button>
          {showConfig && (
            <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg text-right">
              <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">
                Google OAuth Client ID شخصی شما:
              </label>
              <input
                type="text"
                value={customClientId}
                placeholder="xxxx.apps.googleusercontent.com"
                onChange={(e) => {
                  setCustomClientId(e.target.value);
                  updateSettings({
                    googleDrive: {
                      ...state.settings.googleDrive,
                      clientId: e.target.value,
                    },
                  });
                }}
                className="w-full text-xs font-mono p-1.5 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                dir="ltr"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                اگر مایلید از کنسول Google Cloud خودتان Client ID بگیرید، می‌توانید آن را اینجا قرار دهید.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
