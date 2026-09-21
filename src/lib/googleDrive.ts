// ===== پشتیبان‌گیری/بازیابی Google Drive =====
// داده‌ها مستقیم به appDataFolder (پوشه‌ی مخفیِ اختصاصی اپ در Drive کاربر) می‌روند؛
// هیچ سرور واسطی در کار نیست. توجه: این نسخه رمزگذاری سرتاسریِ سمت کاربر انجام نمی‌دهد.

import { parseStateText } from "./stateIO";
import type { AppState } from "../types";

const BACKUP_FILE_NAME = "study_planner_cloud_backup.json";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

/**
 * Client ID در OAuth «راز» نیست و باید در bundle وب باشد؛ اما فقط صاحب پروژه‌ی
 * Google Cloud می‌تواند originهای مجاز آن را تعیین کند. برای انتشار عمومی، آن را
 * هنگام build در VITE_GOOGLE_DRIVE_CLIENT_ID بگذارید؛ در غیر این صورت کاربر می‌تواند
 * Client ID پروژه‌ی خودش را از تنظیمات وارد کند.
 */
export const DEPLOYED_GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID ?? "").trim();

/** وضعیت اتصال برای مصرف‌های بعدی UI */
export interface GoogleDriveStatus {
  connected: boolean;
  userEmail?: string;
  lastSyncAt?: number;
  syncing?: boolean;
  error?: string | null;
}

/** وضعیت اتصال و توکن در حافظه‌ی همان مرورگر */
const GD_STORAGE_KEY = "sp_gdrive_auth";
const GSI_SCRIPT_ID = "google-gsi-client";

interface StoredAuth {
  accessToken: string;
  expiresAt: number;
  email?: string;
  lastSyncAt?: number;
  fileId?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

interface GoogleIdentityError {
  type?: string;
  message?: string;
}

interface GoogleOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback: (error: GoogleIdentityError) => void;
  }): { requestAccessToken(options?: { prompt?: string }): void };
}

let googleApiPromise: Promise<void> | null = null;

function getGoogleOauth2(): GoogleOauth2 | undefined {
  return (window as typeof window & { google?: { accounts?: { oauth2?: GoogleOauth2 } } }).google?.accounts?.oauth2;
}

function rawErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as GoogleIdentityError;
    return [e.type, e.message].filter(Boolean).join(" ") || String(error);
  }
  return "";
}

/** آیا مقدار، شکلِ Client ID وب گوگل را دارد؟ (اعتبار واقعی را Google بررسی می‌کند.) */
export function isGoogleClientId(value: string): boolean {
  return /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(value.trim());
}

/** خطاهای فنی GSI را به پیامی قابل‌اقدام برای کاربر فارسی‌زبان تبدیل می‌کند. */
export function googleAuthErrorMessage(error: unknown): string {
  const text = rawErrorText(error);
  const normalized = text.toLowerCase();

  // خطاهای خودمان از قبل پیام فارسی و دقیق دارند.
  if (/[\u0600-\u06FF]/.test(text)) return text;
  if (normalized.includes("popup_closed")) return "پنجره‌ی ورود گوگل بسته شد؛ دوباره تلاش کن.";
  if (normalized.includes("popup_failed_to_open")) return "مرورگر پنجره‌ی ورود گوگل را بست. Pop-up را برای این سایت مجاز کن و دوباره بزن.";
  if (normalized.includes("access_denied")) return "اجازه‌ی دسترسی به پوشه‌ی اختصاصی برنامه داده نشد.";
  if (normalized.includes("origin_mismatch") || normalized.includes("unauthorized_origin")) {
    return "این آدرس سایت در Client ID گوگل مجاز نیست. در Google Cloud، Authorized JavaScript origin را دقیقاً برابر آدرس همین سایت قرار بده.";
  }
  if (normalized.includes("invalid_client") || normalized.includes("client_not_found") || normalized.includes("oauth client was not found")) {
    return "Client ID گوگل معتبر نیست یا حذف شده است. یک OAuth Client از نوع Web application بساز و شناسه‌اش را وارد کن.";
  }
  if (normalized.includes("idpiframe_initialization_failed")) {
    return "ورود گوگل در این مرورگر شروع نشد. کوکی‌های شخص‌ثالث/Pop-up را بررسی کن یا مرورگر دیگری امتحان کن.";
  }
  if (normalized.includes("drive api") || normalized.includes("accessnotconfigured") || normalized.includes("403")) {
    return "دسترسی Google Drive رد شد. مطمئن شو Drive API در همان پروژه‌ی Google Cloud فعال است و صفحه‌ی OAuth اجازه‌ی استفاده دارد.";
  }
  if (normalized.includes("load") || normalized.includes("network")) {
    return "اسکریپت ورود گوگل بارگذاری نشد. اینترنت، DNS یا مسدود نبودن accounts.google.com را بررسی کن.";
  }
  return "اتصال به گوگل کامل نشد. Client ID، origin مجاز و دسترسی Pop-up را بررسی کن.";
}

export function getStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(GD_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredAuth>;
    if (typeof data.accessToken !== "string" || !data.accessToken || typeof data.expiresAt !== "number") return null;
    if (Date.now() >= data.expiresAt) return null;
    return data as StoredAuth;
  } catch {
    return null;
  }
}

/** برای به‌روزرسانی متادیتا، حتی توکن منقضی‌شده را از storage می‌خوانیم. */
function rawStoredAuth(): Partial<StoredAuth> | null {
  try {
    const raw = localStorage.getItem(GD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<StoredAuth>) : null;
  } catch {
    return null;
  }
}

export function saveStoredAuth(auth: Partial<StoredAuth> | null): void {
  try {
    if (!auth) {
      localStorage.removeItem(GD_STORAGE_KEY);
    } else {
      const current = rawStoredAuth() ?? {};
      localStorage.setItem(GD_STORAGE_KEY, JSON.stringify({ ...current, ...auth }));
    }
  } catch {
    // پر شدن storage نباید خودِ اپ را از کار بیندازد.
  }
}

/** لود مقاوم اسکریپت رسمی Google Identity Services؛ کلیک دوباره بعد از شکست هم ممکن است. */
export function loadGoogleApi(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("ورود گوگل فقط در مرورگر در دسترس است."));
  }
  if (getGoogleOauth2()) return Promise.resolve();
  if (googleApiPromise) return googleApiPromise;

  const pending = new Promise<void>((resolve, reject) => {
    const node = document.getElementById(GSI_SCRIPT_ID);
    // یک نود هم‌نامِ خراب نباید تلاش بعدی را ۱۵ ثانیه معطل کند.
    if (node && !(node instanceof HTMLScriptElement)) node.remove();
    const existing = node instanceof HTMLScriptElement ? node : null;
    const script = existing ?? document.createElement("script");
    let settled = false;
    let timeout: number | undefined;

    const cleanup = () => {
      if (timeout != null) window.clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      // اسکریپتِ شکست‌خورده رویداد load/error تازه‌ای تولید نمی‌کند؛ حذفش برای retry ضروری است.
      if (!getGoogleOauth2()) script.remove();
      reject(error);
    };
    const waitForNamespace = (tries = 0) => {
      if (getGoogleOauth2()) {
        succeed();
        return;
      }
      // GSI گاهی چند میلی‌ثانیه پس از رویداد load، namespace را می‌سازد.
      if (tries < 10) {
        window.setTimeout(() => waitForNamespace(tries + 1), 40);
        return;
      }
      fail(new Error("Google Identity Services آماده نشد."));
    };
    const onLoad = () => {
      script.dataset.gsiLoaded = "true";
      waitForNamespace();
    };
    const onError = () => fail(new Error("خطا در بارگذاری Google Identity Services."));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    timeout = window.setTimeout(
      () => fail(new Error("بارگذاری سرویس ورود گوگل بیش از حد طول کشید.")),
      15_000,
    );

    if (!existing) {
      script.id = GSI_SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else if (script.dataset.gsiLoaded === "true") {
      waitForNamespace();
    }
  });

  googleApiPromise = pending.catch((error: unknown) => {
    // اگر اینترنت لحظه‌ای قطع بود یا اسکریپت شکست خورد، دکمه‌ی «تلاش دوباره» باید واقعاً کار کند.
    googleApiPromise = null;
    throw error;
  });
  return googleApiPromise;
}

/** دریافت توکن کوتاه‌عمر از کاربر با پنجره‌ی رسمی Google Identity Services. */
export async function requestGoogleAccessToken(clientId: string): Promise<string> {
  const cleanClientId = clientId.trim();
  if (!isGoogleClientId(cleanClientId)) {
    throw new Error("ابتدا یک Google OAuth Client ID معتبر وارد کن (باید به .apps.googleusercontent.com ختم شود)." );
  }

  await loadGoogleApi();
  const oauth2 = getGoogleOauth2();
  if (!oauth2) throw new Error("سرویس ورود گوگل در دسترس نیست.");

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    try {
      const tokenClient = oauth2.initTokenClient({
        client_id: cleanClientId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: (response) => {
          if (response.error) {
            finish(() => reject(new Error(googleAuthErrorMessage(response.error))));
            return;
          }
          if (!response.access_token) {
            finish(() => reject(new Error("گوگل توکن دسترسی برنگرداند.")));
            return;
          }
          const seconds = Number(response.expires_in);
          const expiresIn = Number.isFinite(seconds) && seconds > 60 ? seconds * 1000 : 3_600_000;
          saveStoredAuth({
            accessToken: response.access_token,
            // یک دقیقه زودتر منقضی‌شده حسابش می‌کنیم تا وسط درخواست Drive به 401 نخوریم.
            expiresAt: Date.now() + expiresIn - 60_000,
          });
          finish(() => resolve(response.access_token!));
        },
        error_callback: (error) => finish(() => reject(new Error(googleAuthErrorMessage(error)))),
      });
      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (error) {
      finish(() => reject(new Error(googleAuthErrorMessage(error))));
    }
  });
}

async function driveFailure(prefix: string, response: Response): Promise<Error> {
  if (response.status === 401) {
    saveStoredAuth(null);
    return new Error("نشست گوگل منقضی شده است؛ دوباره اتصال را برقرار کن.");
  }
  if (response.status === 403) {
    return new Error("دسترسی Google Drive رد شد. فعال بودن Drive API و origin مجاز Client ID را در Google Cloud بررسی کن.");
  }

  let detail = response.statusText;
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string" && body.error.message.trim()) detail = body.error.message.trim();
  } catch {
    // پاسخ غیر JSON هم فقط با status قابل توضیح است.
  }
  return new Error(`${prefix} (${response.status}${detail ? `: ${detail}` : ""})`);
}

/** یافتن فایل بکاپ در appDataFolder؛ فقط فایل همین اپ دیده می‌شود. */
async function findBackupFileId(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw await driveFailure("خطا در خواندن پوشه‌ی اختصاصی Drive", response);

  const data = (await response.json()) as { files?: Array<{ id?: unknown }> };
  const id = data.files?.[0]?.id;
  return typeof id === "string" && id ? id : null;
}

/** ذخیره یا جایگزینی snapshot کامل داده‌ها در Google Drive. */
export async function uploadStateToGoogleDrive(
  state: AppState,
  accessToken: string,
): Promise<{ success: boolean; lastSyncAt: number }> {
  const fileId = await findBackupFileId(accessToken);
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  // تایمر در حال اجرا، بین دو دستگاه معنای امنی ندارد؛ باقی داده‌ها کامل ذخیره می‌شوند.
  const cleanState = { ...state, activeSession: null };
  const jsonContent = JSON.stringify(cleanState, null, 2);
  const metadata = fileId
    ? { mimeType: "application/json" }
    : { name: BACKUP_FILE_NAME, mimeType: "application/json", parents: ["appDataFolder"] };

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    jsonContent +
    closeDelimiter;
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const response = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });
  if (!response.ok) throw await driveFailure("ذخیره در Drive ناموفق بود", response);

  const lastSyncAt = Date.now();
  saveStoredAuth({ lastSyncAt });
  return { success: true, lastSyncAt };
}

/** دانلود و اعتبارسنجی snapshot از Google Drive. */
export async function downloadStateFromGoogleDrive(accessToken: string): Promise<AppState | null> {
  const fileId = await findBackupFileId(accessToken);
  if (!fileId) return null;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw await driveFailure("دریافت پشتیبان از Drive ناموفق بود", response);

  const parsed = parseStateText(await response.text());
  if (!parsed) throw new Error("فایل موجود در Drive، پشتیبان معتبر برنامه‌ریز مطالعه نیست.");
  return parsed;
}
