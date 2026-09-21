// ===== ماژول همگام‌سازی ابری امن با Google Drive =====
// از پوشه‌ی اختصاصی appDataFolder گوگل درایو کاربر استفاده می‌کند.
// این پوشه مخفی و کاملاً ایزوله است و تنها خودِ این اپ به آن دسترسی دارد.
// هیچ فایلی از درایو کاربر دیده نمی‌شود و داده‌ها به هیچ سروری جز گوگل کاربر ارسال نمی‌شوند.

import { parseStateText } from "./stateIO";
import type { AppState } from "../types";

const BACKUP_FILE_NAME = "study_planner_cloud_backup.json";
const G_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

/** اعتبارسنجی فرم Client ID گوگل — همان‌چیزی که با پلس‌سازِ جعلی هرگز نبود */
export function isValidGoogleClientId(id: string): boolean {
  return /^[0-9]+-[a-z0-9]{20,}\.apps\.googleusercontent\.com$/.test(id.trim());
}

/**
 * ترجمه‌ی خطاهای رایج OAuth گوگل به راهنمای فارسیِ قابل‌فهم.
 * این پیام‌ها تنها راهِ فهمیدنِ ایرادِ راه‌اندازی است (پاپ‌آپ گوگل به ما دیتیل نمی‌دهد).
 */
export function toFaGoogleDriveError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const type = (err as { type?: string } | null)?.type ?? "";
  if (/popup_failed_to_open|popup_blocked/i.test(type) || /popup/i.test(msg))
    return "پاپ‌آپ گوگل توسط مرورگر بلاک شد — اجازه‌ی پاپ‌آپ را برای این سایت روشن کن.";
  if (/popup_closed/i.test(type)) return "پنجره‌ی ورود گوگل زود بسته شد؛ دوباره تلاش کن.";
  if (/invalid_client/i.test(msg))
    return "Client ID معتبر نیست یا دیگر در Google Cloud موجود است — آن را از کنسول مجدد کپی کن.";
  if (/access_denied|unauthorized_client/i.test(msg))
    return "گوگل اجازه نداد: اگر اپ در حالت Testing است، ایمیل این حساب باید در بخش «Test users» کنسول Google Cloud اضافه شده باشد.";
  if (/invalid_scope|scope/i.test(msg))
    return "اسکوپ drive.appdata در صفحه‌ی OAuth consent اضافه نشده — از کنسول آن را اضافه کن.";
  if (/accessNotConfigured|has not been used|disabled/i.test(msg))
    return "«Google Drive API» در پروژه‌ی Google Cloud فعال نیست — از APIs & Services ← Library آن را Enable کن.";
  if (/idpiframe_initialization_failed|origin/i.test(msg) || /origin/i.test(type))
    return "آدرس این سایت در «Authorized JavaScript origins» همان Client ID ثبت نشده — مبدا (origin) دقیق را در کنسول اضافه کن.";
  if (/نشست گوگل منقضی/i.test(msg)) return msg;
  return msg || "خطای ناشناخته در اتصال به گوگل.";
}

export interface GoogleDriveStatus {
  connected: boolean;
  userEmail?: string;
  lastSyncAt?: number;
  syncing?: boolean;
  error?: string | null;
}

/** وضعیت اتصال و توکن در حافظه مرورگر */
const GD_STORAGE_KEY = "sp_gdrive_auth";

interface StoredAuth {
  accessToken: string;
  expiresAt: number;
  email?: string;
  lastSyncAt?: number;
  fileId?: string;
}

/** پیام خطای بدنه‌ی پاسخ Drive API را (در صورت وجود) به متن خطا می‌چسباند تا ترجمه‌ی فارسی دقیق شود */
async function driveError(prefix: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.error?.errors?.[0]?.message || "";
  } catch {
    /* بدنه JSON نبود */
  }
  return new Error(`${prefix}: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
}

export function getStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(GD_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredAuth;
    if (data.expiresAt && Date.now() > data.expiresAt) {
      // توکن منقضی شده
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: Partial<StoredAuth> | null): void {
  try {
    if (!auth) {
      localStorage.removeItem(GD_STORAGE_KEY);
    } else {
      const current = getStoredAuth() || { accessToken: "", expiresAt: 0 };
      localStorage.setItem(GD_STORAGE_KEY, JSON.stringify({ ...current, ...auth }));
    }
  } catch {
    // Ignore storage errors
  }
}

/** لود کردن اسکریپت رسمی گوگل در صورت نیاز */
export async function loadGoogleApi(): Promise<void> {
  if (typeof window === "undefined") return;
  if ((window as unknown as { google?: { accounts?: { oauth2?: unknown } } }).google?.accounts?.oauth2) {
    return;
  }
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("google-gsi-client");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("خطا در بارگذاری")));
      return;
    }
    const script = document.createElement("script");
    script.id = "google-gsi-client";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("خطا در بارگذاری Google Client API"));
    document.head.appendChild(script);
  });
}

/** دریافت توکن احراز هویت از کاربر با پنجره پاپ‌آپ گوگل */
export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  await loadGoogleApi();
  const google = (window as unknown as { google: any }).google;
  if (!google?.accounts?.oauth2) {
    throw new Error("سرویس ورود گوگل در دسترس نیست.");
  }

  const request = (prompt: "consent" | "") =>
    new Promise<string>((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: G_SCOPE,
        callback: (resp: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => {
          if (resp.error) {
            reject(new Error(resp.error + (resp.error_description ? `: ${resp.error_description}` : "")));
            return;
          }
          if (resp.access_token) {
            const expiresIn = resp.expires_in ? Number(resp.expires_in) * 1000 : 3600 * 1000;
            saveStoredAuth({
              accessToken: resp.access_token,
              expiresAt: Date.now() + expiresIn - 60000,
            });
            resolve(resp.access_token);
          } else {
            reject(new Error("توکن دریافت نشد."));
          }
        },
        error_callback: (err: { type?: string; message?: string }) =>
          reject(Object.assign(new Error(err?.message ?? "unknown"), { type: err?.type ?? "unknown" })),
      });
      tokenClient.requestAccessToken({ prompt });
    });

  // اول بی‌صدا (بعد از اولین رضایت)؛ اگر هنوز رضایتی ثبت نشده با صفحه‌ی consent دوباره
  try {
    return await request("");
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (/consent_required|interaction_required|access_denied|account_selection_required/i.test(msg)) {
      return request("consent");
    }
    throw e;
  }
}

export interface DriveBackupVersion { id: string; name: string; modifiedTime: string; }
/** Immutable snapshots; older devices cannot overwrite backups made by newer ones. */
export async function listDriveBackups(accessToken: string): Promise<DriveBackupVersion[]> {
  const query = encodeURIComponent(`(name = '${BACKUP_FILE_NAME}' or name contains 'planner-version-') and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=30`, {headers:{Authorization:`Bearer ${accessToken}`}});
  if (!res.ok) throw await driveError("فهرست نسخه‌های درایو دریافت نشد",res);
  const data = await res.json(); return data.files ?? [];
}
async function findBackupFileId(accessToken: string): Promise<string | null> {
  return (await listDriveBackups(accessToken))[0]?.id ?? null;
}

/** ذخیره یا به‌روزرسانی وضعیت کامل در گوگل درایو */
export async function uploadStateToGoogleDrive(
  state: AppState,
  accessToken: string
): Promise<{ success: boolean; lastSyncAt: number }> {
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const cleanState = { ...state, activeSession: null };
  const jsonContent = JSON.stringify(cleanState, null, 2);

  const metadata = { name: `planner-version-${new Date().toISOString().replace(/[:.]/g,"-")}-${crypto.randomUUID()}.json`, mimeType:"application/json", parents:["appDataFolder"] };

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    jsonContent +
    closeDelimiter;

  const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const method = "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    if (res.status === 401) {
      saveStoredAuth(null);
      throw new Error("نشست گوگل منقضی شده است.");
    }
    throw await driveError("شکست در ذخیره درایو", res);
  }

  const now = Date.now();
  saveStoredAuth({ lastSyncAt: now });
  return { success: true, lastSyncAt: now };
}

/** دانلود بکاپ از گوگل درایو */
export async function downloadStateFromGoogleDrive(accessToken: string, selectedId?: string): Promise<AppState | null> {
  const fileId = selectedId ?? await findBackupFileId(accessToken);
  if (!fileId) return null;

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      saveStoredAuth(null);
      throw new Error("نشست گوگل منقضی شده است.");
    }
    throw await driveError("شکست در دریافت اطلاعات از درایو", res);
  }

  const raw = await res.text();
  const parsed = parseStateText(raw);
  if (!parsed) {
    throw new Error("داده‌ی معتبری در بکاپ گوگل درایو یافت نشد.");
  }
  return parsed;
}
