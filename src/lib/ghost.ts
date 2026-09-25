// ===== رقابت با سایه‌ی خودت — بهترین هفته‌ی گذشته در برابر هفته‌ی جاری =====
import type { StudySession } from "../types";
import { addDays, startOfWeek } from "./jalali";

export interface GhostWeek {
  start: string;
  minutes: number;
}

/** بهترین بازه‌ی ۷ روزه‌ی پیاپی (تقویمی) در کل سابقه */
export function bestRollingWeek(sessions: StudySession[]): GhostWeek | null {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (s.durationMinutes <= 0) continue;
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.durationMinutes);
  }
  if (byDate.size === 0) return null;
  const days = [...byDate.keys()].sort();
  let best: GhostWeek = { start: days[0], minutes: 0 };
  // هر روزِ دارای سابقه، شروعِ یک پنجره‌ی ۷ روزه
  for (const start of days) {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += byDate.get(addDays(start, i)) ?? 0;
    if (sum > best.minutes) best = { start, minutes: sum };
  }
  return best.minutes > 0 ? best : null;
}

/** دقایق هفته‌ی جاری (از شنبه تا امروز) */
export function currentWeekMinutes(sessions: StudySession[], today: string): number {
  const ws = startOfWeek(today);
  return sessions.filter((s) => s.date >= ws && s.date <= today).reduce((sum, s) => sum + s.durationMinutes, 0);
}

// ===== 👻 سایه‌ی دوستان — اشتراک آفلاین با کد متنی/QR =====
// همان فلسفه‌ی QR-transfer خود اپ: هیچ سروری در کار نیست. کاربر «کد سایه» را
// برای دوستش می‌فرستد (پیام‌رسان/QR) و طرف مقابل همان را paste می‌کند.
// کد فقط شامل نام + هفت عدد (دقیقه‌های هر روز هفته) است — هیچ داده‌ی دیگری بیرون نمی‌رود.

export interface GhostSharePayload {
  name: string;
  /** دقایق شنبه..جمعه‌ی هفته‌ی جاریِ دارنده */
  days: number[];
  weekStart: string;
}

const PREFIX = "SPGHOST1:";

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text: string): string {
  const pad = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "===".slice((pad.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** دقایق هر روزِ هفته‌ی جاری (شنبه..جمعه) برای ساخت کد اشتراک */
export function currentWeekDays(sessions: StudySession[], today: string): number[] {
  const ws = startOfWeek(today);
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const s of sessions) {
    if (s.durationMinutes <= 0) continue;
    for (let i = 0; i < 7; i++) {
      if (s.date === addDays(ws, i)) {
        out[i] += s.durationMinutes;
        break;
      }
    }
  }
  return out;
}

export function encodeGhostShare(payload: GhostSharePayload): string {
  const days = payload.days.map((d) => Math.max(0, Math.round(Number(d) || 0))).slice(0, 7);
  while (days.length < 7) days.push(0);
  const name = payload.name.trim().slice(0, 24) || "دوست";
  return PREFIX + b64urlEncode(JSON.stringify({ n: name, d: days, w: payload.weekStart }));
}

export function parseGhostShare(text: string): GhostSharePayload | null {
  try {
    const t = text.trim();
    if (!t.startsWith(PREFIX)) return null;
    const data = JSON.parse(b64urlDecode(t.slice(PREFIX.length))) as { n?: unknown; d?: unknown; w?: unknown };
    if (typeof data.n !== "string" || !Array.isArray(data.d)) return null;
    const days = data.d.map((x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x) : 0)).slice(0, 7);
    while (days.length < 7) days.push(0);
    if (days.every((d) => d === 0)) return null;
    const weekStart = typeof data.w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.w) ? data.w : "";
    return { name: data.n.trim().slice(0, 24) || "دوست", days, weekStart };
  } catch {
    return null;
  }
}

export function ghostTotal(days: number[]): number {
  return days.reduce((a, b) => a + b, 0);
}
