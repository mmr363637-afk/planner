import { useEffect, useState, useSyncExternalStore } from "react";
import { useStore } from "../store";
import { getPersistenceStatus, subscribePersistence } from "../lib/persist";
import { getSyncStatus, subscribeSyncStatus } from "../lib/syncStatus";
import {
  deleteHistory,
  listHistory,
  saveHistory,
  type HistoryEntry,
} from "../lib/history";
import { backupFileName, downloadTextFile } from "../lib/backup";
import { todayKey, toFa } from "../lib/jalali";
import { Button, Card } from "./ui";
export default function StorageHealth() {
  const { state, replaceData } = useStore();
  const local = useSyncExternalStore(
      subscribePersistence,
      getPersistenceStatus,
    ),
    cloud = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
  const [entries, setEntries] = useState<HistoryEntry[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    listHistory()
      .then(setEntries)
      .catch(() => setMessage("تاریخچهٔ امن در این مرورگر در دسترس نیست."));
  useEffect(() => {
    void refresh();
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch {
      setMessage("عملیات انجام نشد؛ فضای ذخیره یا دسترسی مرورگر را بررسی کن.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mb-4">
      <h3 className="font-bold mb-3">وضعیت ذخیره و تاریخچه</h3>
      <dl className="text-sm leading-7">
        <dt className="font-medium">روی این دستگاه</dt>
        <dd>
          {local.pending
            ? "در حال ذخیره…"
            : local.durable
              ? "در IndexedDB ذخیره شد"
              : local.mirror
                ? "فقط نسخهٔ سریع مرورگر در دسترس است"
                : "هنوز ذخیرهٔ موفق تأیید نشده"}
          {local.at
            ? ` · ${new Date(local.at).toLocaleTimeString("fa-IR")}`
            : ""}
        </dd>
        {local.error && <dd className="text-rose-600">{local.error}</dd>}
        <dt className="font-medium mt-2">فایل پشتیبان</dt>
        <dd>
          {state.settings.autoBackup.lastBackupAt
            ? `آخرین درخواست دانلود: ${new Date(state.settings.autoBackup.lastBackupAt).toLocaleString("fa-IR")}`
            : "هنوز درخواست دانلود ثبت نشده"}
          . ذخیره‌شدن فایل را در دانلودها بررسی کن.
        </dd>
        <dt className="font-medium mt-2">ابر</dt>
        <dd>
          {(state.settings.cloudProvider ?? "drive") === "supabase"
            ? cloud.message
            : state.settings.googleDrive?.lastSyncAt
              ? "نسخه‌ای به Google Drive فرستاده شده؛ این بکاپ دستی است، نه ادغام هم‌زمان دو دستگاه."
              : "بکاپ Google Drive هنوز تأیید نشده است."}
        </dd>
      </dl>
      <p className="text-xs text-slate-500 leading-6 my-3">
        تاریخچه محلی: حداکثر ۸ نسخه، با بودجهٔ حدود ۱۶ مگابایت. با پاک‌شدن دادهٔ
        سایت، تاریخچه هم پاک می‌شود؛ جای بکاپ خارج از دستگاه نیست.
      </p>
      <Button
        size="sm"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await saveHistory(state, "نسخهٔ دستی");
            setMessage("نسخهٔ محلی ذخیره شد.");
          })
        }
      >
        ذخیرهٔ نسخهٔ محلی اکنون
      </Button>
      <details className="mt-3">
        <summary className="text-sm cursor-pointer">
          نسخه‌های بازیابی ({toFa(entries.length)})
        </summary>
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="border-t border-slate-200 dark:border-slate-700 py-3 mt-2"
          >
            <p className="text-sm">{entry.label}</p>
            <p className="text-xs text-slate-500 my-2">
              {new Date(entry.at).toLocaleString("fa-IR")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || !!state.activeSession}
                onClick={() => {
                  if (
                    window.confirm(
                      "این نسخه جایگزین داده‌های فعلی شود؟ ابتدا از وضعیت فعلی نسخهٔ ایمنی ذخیره می‌شود.",
                    )
                  )
                    void run(async () => {
                      const ok = await replaceData(
                        entry.json,
                        "پیش از بازگردانی تاریخچه",
                      );
                      setMessage(
                        ok ? "نسخه بازیابی شد." : "بازیابی انجام نشد.",
                      );
                    });
                }}
              >
                بازیابی
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  downloadTextFile(backupFileName(todayKey()), entry.json);
                }}
              >
                دانلود این نسخه
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("این نسخهٔ محلی حذف شود؟"))
                    void run(() => deleteHistory(entry.id));
                }}
              >
                حذف
              </Button>
            </div>
          </div>
        ))}
      </details>
      {message && (
        <p role="status" className="text-sm mt-3">
          {message}
        </p>
      )}
    </Card>
  );
}
