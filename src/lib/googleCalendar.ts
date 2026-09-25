// ===== 📅 تقویم گوگل — مسیر دوطرفه‌ی «ارسال امتحانات» (اختیاری/آزمایشی) =====
// تا امروز خروجی تقویم یک‌طرفه بود: ICS (کاملاً آفلاین) + لینک «افزودن به تقویم
// گوگل» برای هر امتحان. این ماژول وقتی کاربر همان Client ID درایو را دارد،
// امتحانات را دسته‌ای به تقویم گوگلش می‌فرستد/به‌روز می‌کند (scope calendar.events).
//
// اصول:
//  - کاملاً اختیاری و آنلاین؛ مسیر آفلاین (ICS + لینک تک‌تک) مثل قبل کار می‌کند.
//  - هر رویداد با extendedProperties.private.sp_exam_id علامت می‌خورد تا دفعه‌ی بعد
//    به‌جای ساختِ تکراری، همان به‌روزرسانی شود.
//  - نیازمند افزودن scope «calendar.events» به OAuth consent همان Client ID.

import { loadGoogleApi, toFaGoogleDriveError } from "./googleDrive";
import type { Exam } from "../types";
import { fromDateKey } from "./jalali";

const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CAL_API = "https://www.googleapis.com/calendar/v3";
const APP_TAG = "study-planner-ir";

/** توکن با scope تقویم — همان الگوی requestAccessToken درایو ولی با دامنه‌ی جدا */
export async function requestCalendarToken(clientId: string): Promise<string> {
  await loadGoogleApi();
  const google = (window as unknown as { google: any }).google;
  if (!google?.accounts?.oauth2) throw new Error("سرویس ورود گوگل در دسترس نیست.");
  const request = (prompt: "consent" | "") =>
    new Promise<string>((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CAL_SCOPE,
        callback: (resp: { access_token?: string; error?: string; error_description?: string }) => {
          if (resp.error) {
            reject(new Error(resp.error + (resp.error_description ? `: ${resp.error_description}` : "")));
            return;
          }
          if (resp.access_token) resolve(resp.access_token);
          else reject(new Error("توکن تقویم دریافت نشد."));
        },
        error_callback: (err: { type?: string; message?: string }) =>
          reject(Object.assign(new Error(err?.message ?? "unknown"), { type: err?.type ?? "unknown" })),
      });
      tokenClient.requestAccessToken({ prompt });
    });
  try {
    return await request("");
  } catch (e) {
    const msg = toFaGoogleDriveError(e);
    if (/consent|scope|دامنه/i.test((e as Error)?.message ?? "")) return request("consent").catch((e2) => { throw new Error(toFaGoogleDriveError(e2) || msg); });
    throw new Error(msg || (e instanceof Error ? e.message : String(e)));
  }
}

interface GEvent {
  id: string;
  summary?: string;
  extendedProperties?: { private?: Record<string, string> };
}

async function calFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`تقویم گوگل خطا داد (${res.status}): ${body.slice(0, 160)}`);
  }
  return res;
}

/** رویدادهای قبلیِ خودمان (با تگ اپ) برای به‌روزرسانی به‌جای تکرار */
export async function listOurEvents(token: string): Promise<Map<string, string>> {
  const q = encodeURIComponent(`privateExtendedProperties.sp_app=${APP_TAG}`);
  const res = await calFetch(token, `/calendars/primary/events?${q}&maxResults=250&fields=items(id,summary,extendedProperties)`);
  const data = (await res.json()) as { items?: GEvent[] };
  const out = new Map<string, string>();
  for (const ev of data.items ?? []) {
    const examId = ev.extendedProperties?.private?.sp_exam_id;
    if (examId) out.set(examId, ev.id);
  }
  return out;
}

/** ساخت بدنه‌ی رویداد از یک امتحان (ساعت دارد → زمان‌دار؛ ندارد → تمام‌روز) */
export function examToEventBody(exam: Exam): Record<string, unknown> {
  const title = `🎓 امتحان: ${exam.title}`;
  const description = [exam.note ? `یادداشت: ${exam.note}` : "", "از «برنامه‌ریز مطالعه» — موفق باشی!"].filter(Boolean).join("\n");
  const body: Record<string, unknown> = {
    summary: title,
    description,
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "popup", minutes: 60 * 24 }] },
    extendedProperties: { private: { sp_app: APP_TAG, sp_exam_id: exam.id } },
  };
  if (exam.time && /^\d{2}:\d{2}$/.test(exam.time)) {
    const d = fromDateKey(exam.date);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(exam.time.slice(0, 2)), Number(exam.time.slice(3, 5)));
    const end = new Date(iso.getTime() + 2 * 3600 * 1000); // فرض: دو ساعت
    body.start = { dateTime: iso.toString(), timeZone: tz };
    body.end = { dateTime: end.toString(), timeZone: tz };
  } else {
    const nextDay = new Date(fromDateKey(exam.date).getTime() + 86_400_000);
    const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    body.start = { date: fmt(fromDateKey(exam.date)) };
    body.end = { date: fmt(nextDay) }; // در API گوگل، پایانِ تمام‌روز «روز بعد» است
  }
  return body;
}

export interface PushResult { created: number; updated: number; failed: number; }

/** ارسال/به‌روزرسانی همه‌ی امتحاناتِ پیش‌رو در تقویم گوگل */
export async function pushExamsToCalendar(token: string, exams: Exam[], today: string): Promise<PushResult> {
  const upcoming = exams.filter((e) => e.date >= today);
  const existing = await listOurEvents(token);
  const result: PushResult = { created: 0, updated: 0, failed: 0 };
  for (const exam of upcoming) {
    try {
      const prevId = existing.get(exam.id);
      if (prevId) {
        await calFetch(token, `/calendars/primary/events/${prevId}`, { method: "PATCH", body: JSON.stringify(examToEventBody(exam)) });
        result.updated += 1;
      } else {
        await calFetch(token, "/calendars/primary/events", { method: "POST", body: JSON.stringify(examToEventBody(exam)) });
        result.created += 1;
      }
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
