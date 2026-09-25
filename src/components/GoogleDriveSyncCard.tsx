// ===== کارت همگام‌سازی ابری Google Drive =====
// Client ID واقعیِ برنامه (در Google Cloud Console ساخته شده) به‌صورت پیش‌فرض در این‌جا
// کار گذاشته شده؛ کاربران هیچ تنظیمی لازم ندارند — فقط «اتصال» را می‌زنند و با جیمیلِ خودشان
// وارد می‌شوند (آن‌ها باید در Test users کنسولِ گوگلِ سازنده اضافه شده باشند).
// هر کاربرِ پیشرفته هم می‌تواند Client ID پروژه‌ی شخصی خودش را جایگزین کند.
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Button, Card } from "./ui";
import {
  listDriveBackups,
  type DriveBackupVersion,
  getStoredAuth,
  isValidGoogleClientId,
  resolveGoogleClientId,
  saveStoredAuth,
  requestGoogleAccessToken,
  toFaGoogleDriveError,
  uploadStateToGoogleDrive,
  downloadStateFromGoogleDrive,
} from "../lib/googleDrive";
import { formatJalaliLong, toDateKey } from "../lib/jalali";

/** Client ID اصلی برنامه — عمومی بودنش طبیعی است (کلاینت‌های وب/موبایل چنین‌اند) */

export default function GoogleDriveSyncCard() {
  const { state, updateSettings, replaceData } = useStore();
  const [auth, setAuth] = useState(getStoredAuth());
  const [loading, setLoading] = useState(false);
  const [versions,setVersions] = useState<DriveBackupVersion[]>([]);
  const [selectedVersion,setSelectedVersion] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const customId = (state.settings.googleDrive?.clientId ?? "").trim();
  const clientId = resolveGoogleClientId(state.settings);
  const hasClientId = isValidGoogleClientId(clientId);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [idDraft, setIdDraft] = useState(customId);

  useEffect(() => {
    setAuth(getStoredAuth());
  }, []);

  const saveClientId = () => {
    const v = idDraft.trim();
    if (!isValidGoogleClientId(v)) {
      setMsg({ text: "قالب Client ID درست نیست — باید مثل «123456-abc…apps.googleusercontent.com» باشد.", error: true });
      return;
    }
    updateSettings({ googleDrive: { ...state.settings.googleDrive, clientId: v } });
    setMsg({ text: "Client ID شخصی ذخیره شد — حالا «اتصال» را بزن." });
  };
  const resetClientId = () => {
    updateSettings({ googleDrive: { ...state.settings.googleDrive, clientId: "" } });
    setIdDraft("");
    setMsg({ text: "به Client ID پیش‌فرضِ برنامه برگشتی." });
  };

  const handleConnect = async () => {
    setLoading(true);
    setMsg(null);
    try {
      await requestGoogleAccessToken(clientId);
      setAuth(getStoredAuth());
      setMsg({ text: "اتصال به Google Drive با موفقیت برقرار شد! 🎉" });
    } catch (err) {
      setAuth(getStoredAuth());
      setMsg({ text: toFaGoogleDriveError(err), error: true });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    saveStoredAuth(null);
    setAuth(null);
    setMsg({ text: "اتصال قطع شد؛ Client ID ذخیره می‌ماند تا دفعه‌ی بعد دوباره وصل شوی." });
  };

  const handleUpload = async () => {
    if (!auth?.accessToken) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await uploadStateToGoogleDrive(state, auth.accessToken);
      setAuth(getStoredAuth());
      updateSettings({ googleDrive: { ...state.settings.googleDrive, lastSyncAt: res.lastSyncAt } });
      setMsg({ text: "پشتیبان با موفقیت در پوشه‌ی امن گوگل درایو ذخیره شد! ☁️" });
    } catch (err) {
      setMsg({ text: toFaGoogleDriveError(err), error: true });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!auth?.accessToken) return;
    if (!window.confirm("داده‌های فعلی این دستگاه با آخرین نسخه‌ی گوگل درایو جایگزین می‌شوند. مطمئنی؟")) return;
    setLoading(true);
    setMsg(null);
    try {
      const cloudState = await downloadStateFromGoogleDrive(auth.accessToken, selectedVersion || undefined);
      if (!cloudState) {
        setMsg({ text: "هیچ فایل پشتیبانی در گوگل درایو پیدا نشد.", error: true });
        return;
      }
      const ok = await replaceData(JSON.stringify(cloudState));
      setMsg(ok ? { text: "داده‌ها با موفقیت از گوگل درایو بازیابی شدند! 🔄" } : { text: "خطا در بازخوانی داده‌های دریافتی.", error: true });
    } catch (err) {
      setMsg({ text: toFaGoogleDriveError(err), error: true });
    } finally {
      setLoading(false);
    }
  };

  const isConnected = !!auth?.accessToken;
  const lastSync = auth?.lastSyncAt || state.settings.googleDrive?.lastSyncAt;

  return (
    <Card className="mb-2">
      <p className="text-xs leading-6 text-slate-500 mb-3">بکاپ نسخه‌دار: هر ارسال، فایل جدید می‌سازد و نسخهٔ قبلی را بازنویسی نمی‌کند. این سرویس ادغام هم‌زمان نیست. نسخه‌ها خودکار حذف نمی‌شوند و از سهمیهٔ درایو استفاده می‌کنند.</p>
      {auth?.accessToken && <div className="mb-3"><Button size="sm" variant="secondary" disabled={loading} onClick={async()=>{setLoading(true);try{setVersions(await listDriveBackups(auth.accessToken!));}catch(e){setMsg({text:toFaGoogleDriveError(e),error:true});}finally{setLoading(false);}}}>دیدن ۳۰ نسخهٔ اخیر درایو</Button>{versions.length>0 && <label className="text-sm block mt-2">نسخهٔ بازیابی<select aria-label="نسخهٔ درایو" className="w-full p-2 border rounded-xl bg-transparent mt-1" value={selectedVersion} onChange={e=>setSelectedVersion(e.target.value)}><option value="">آخرین نسخه</option>{versions.map(v=><option key={v.id} value={v.id}>{new Date(v.modifiedTime).toLocaleString('fa-IR')} · {v.name.slice(0,22)}</option>)}</select></label>}</div>}

      <div className="flex items-center gap-2">
        <span className="text-base">☁️</span>
        <div className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">همگام‌سازی با Google Drive</div>
        {isConnected && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            متصل
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
        رایگان و بدون سرور واسط؛ فایل پشتیبان فقط در پوشه‌ی مخفیِ اختصاصیِ درایوِ گوگل حساب خودت ذخیره می‌شود.
        اعتبار نشست حدود ۱ ساعت است؛ بعدش کافی است دوباره «اتصال» را بزنی (بدون از دست رفتن هیچ چیزی).
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-2.5">
        {isConnected && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">اعتبار نشست: تا حدود یک ساعت آینده</span>
            {lastSync && <span className="text-slate-400 text-[11px]">آخرین سینک: {formatJalaliLong(toDateKey(new Date(lastSync)), false)}</span>}
          </div>
        )}
        {isConnected ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="sm" onClick={handleUpload} disabled={loading}>
              {loading ? "یک لحظه…" : "☁️ ذخیره در درایو"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
              📥 بازیابی از درایو
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={handleConnect} disabled={loading || !hasClientId} className="w-full">
            🔑 {loading ? "در حال اتصال به گوگل…" : "اتصال به Google Drive"}
          </Button>
        )}

        {msg && (
          <div
            className={`text-[11px] p-2 rounded-lg leading-relaxed ${
              msg.error
                ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"
            }`}
          >
            {msg.text}
          </div>
        )}

        {!isConnected && (
          <p className="text-[10px] text-slate-400 leading-relaxed">
            💡 در اولین اتصال، گوگل هشدار «تأییدنشده» نشان می‌دهد — طبیعی است چون اپ هنوز اعتبارسنجی گوگل را پاس نکرده: Advanced ← Go to … (unsafe) ← Continue. داده‌ی درایوت جز در پوشه‌ی مخفیِ همین اپ دیده نمی‌شود.
          </p>
        )}

        <div className="flex justify-between items-center">
          <button type="button" className="text-[11px] text-slate-400 hover:underline" onClick={() => setAdvancedOpen((v) => !v)}>
            ⚙️ تنظیمات پیشرفته (Client ID / راهنما)
          </button>
          {isConnected && (
            <button type="button" onClick={handleDisconnect} className="text-[11px] text-rose-500 hover:underline">
              قطع اتصال
            </button>
          )}
        </div>

        {advancedOpen && (
          <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-right">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Client ID فعلی: <code dir="ltr" className="text-[10px]">{clientId.slice(0, 20)}…</code> {customId ? "(شخصیِ شما)" : "(پیش‌فرضِ برنامه)"}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                value={idDraft}
                placeholder="Client ID پروژه‌ی شخصی خودت (اختیاری)"
                onChange={(e) => setIdDraft(e.target.value)}
                className="flex-1 text-xs font-mono px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
              <Button size="sm" variant="secondary" disabled={!idDraft.trim()} onClick={saveClientId}>
                ذخیره
              </Button>
              {customId && (
                <Button size="sm" variant="outline" onClick={resetClientId}>
                  بازگشت به پیش‌فرض
                </Button>
              )}
            </div>
            <button type="button" onClick={() => setGuideOpen((v) => !v)} className="text-[11px] text-teal-600 dark:text-teal-400 text-right hover:underline">
              {guideOpen ? "▼ پنهان‌کردن راهنمای ساخت Client ID رایگان" : "▶ راهنمای ساخت Client ID شخصی (برای توسعه‌دهندگان)"}
            </button>
            {guideOpen && (
              <ol className="text-[11px] text-slate-500 dark:text-slate-400 leading-6 list-decimal pr-4 space-y-1">
                <li>
                  به{" "}
                  <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-teal-600 dark:text-teal-400 underline" dir="ltr">
                    console.cloud.google.com
                  </a>{" "}
                  برو و با جیمیل خودت یک پروژه‌ی جدید بساز.
                </li>
                <li>از <b>APIs &amp; Services ← Library</b> عبارت «Google Drive API» را جست‌وجو و <b>Enable</b> کن.</li>
                <li>در Google Auth Platform ← Audience حالت <b>External</b> را انتخاب کن و اسکوپ <code dir="ltr">.../auth/drive.appdata</code> را اضافه کن.</li>
                <li>در Audience ← Test users، جیمیل‌های کاربرانت را اضافه کن.</li>
                <li>یک <b>OAuth Client ID</b> از نوع «Web application» بساز و <code dir="ltr">https://mmr363637-afk.github.io</code> را در Authorized JavaScript origins بگذار.</li>
                <li>Client ID را همین‌جا پیست و ذخیره کن.</li>
              </ol>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
