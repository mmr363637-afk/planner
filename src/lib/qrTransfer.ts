// ===== انتقال داده بین دو دستگاه با QR — کاملاً بدون سرور =====
// داده انتخابی → JSON → فشرده‌سازی deflate-raw (با Web API استاندارد CompressionStream؛
// اگر در دسترس نبود، بدون فشرده‌سازی) → base64url → تکه‌تکه‌کردن به چند QR.
// هر QR سرآیند «SPLNR1|{فشرده؟}|{شماره}/{تعداد}|» دارد؛ دستگاه دوم تکه‌ها را (به هر ترتیبی)
// جمع می‌کند، سرآیندها را برمی‌دارد، به هم می‌چسباند و از حالت فشرده خارج می‌کند.
// محتوای هر QR متنی است؛ هیچ داده‌ای از این مسیر به بیرون اینترنت نمی‌رود.

import type { AppState } from "../types";

export type TransferScope = "settings" | "plan" | "full";

export const SCOPE_LABEL: Record<TransferScope, string> = {
  settings: "فقط تنظیمات",
  plan: "برنامه و درس‌ها",
  full: "همه‌ی داده‌ها",
};

export interface TransferPayload {
  v: 1;
  scope: TransferScope;
  at: number;
  data: Partial<AppState>;
}

/** برش داده بر اساس دامنه‌ی انتخابی */
export function scopeState(state: AppState, scope: TransferScope): Partial<AppState> {
  const settings = state.settings;
  switch (scope) {
    case "settings":
      return { settings };
    case "plan":
      return {
        settings,
        subjects: state.subjects,
        topics: state.topics,
        plans: state.plans,
        tasks: state.tasks,
        reviews: state.reviews,
        flashcards: state.flashcards,
        exams: state.exams,
      };
    case "full":
    default:
      return {
        settings: state.settings,
        subjects: state.subjects,
        topics: state.topics,
        plans: state.plans,
        tasks: state.tasks,
        reviews: state.reviews,
        flashcards: state.flashcards,
        exams: state.exams,
        sessions: state.sessions,
        achievements: state.achievements,
      };
  }
}

// ---------- base64url ----------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------- فشرده‌سازی ----------

async function deflate(text: string): Promise<Uint8Array | null> {
  const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!CS) return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CS("deflate-raw"));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array): Promise<string | null> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) return null;
  try {
    const stream = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DS("deflate-raw"));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

// ---------- کدکردن / تکه‌کردن ----------

const PREFIX = "SPLNR1";
/** شناسه‌ی کوتاه هر انتقال — برای تشخیص قاطی‌شدن تکه‌های دو انتقال متفاوت */
function transferId(): string {
  return Math.random().toString(36).slice(2, 8);
}
/** طول متنِ هر QR — برای اسکن مطمئن با دوربین موبایل عمداً محافظه‌کارانه است */
export const CHUNK_SIZE = 800;

export interface EncodeResult {
  chunks: string[];
  /** شناسه‌ی این انتقال — در سرآیند هر تکه می‌آید */
  tid: string;
  scope: TransferScope;
  /** حجم JSON خام و فشرده — برای نمایش به کاربر */
  rawBytes: number;
  packedBytes: number;
  compressed: boolean;
}

export async function encodeTransfer(state: AppState, scope: TransferScope): Promise<EncodeResult> {
  const payload: TransferPayload = { v: 1, scope, at: Date.now(), data: scopeState(state, scope) };
  const tid = transferId();
  const json = JSON.stringify(payload);
  const rawBytes = new Blob([json]).size;
  const deflated = await deflate(json);
  const compressed = deflated != null && deflated.length < json.length;
  const packed = compressed ? deflated! : new TextEncoder().encode(json);
  const body = bytesToBase64Url(packed);
  const total = Math.max(1, Math.ceil(body.length / CHUNK_SIZE));
  const flag = compressed ? "D" : "R";
  const chunks = Array.from({ length: total }, (_, i) => `${PREFIX}|${tid}|${flag}|${i + 1}/${total}|${body.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)}`);
  return { chunks, tid, scope, rawBytes, packedBytes: packed.length, compressed };
}

export interface DecodeResult {
  scope: TransferScope;
  at: number;
  data: Partial<AppState>;
}

export interface DecodeProgress {
  received: number;
  total: number;
}

/** وضعیت یک مجموعه تکه: چند تکه از چند تکه لازم است؟ (بدون merge محتوا) */
export function chunkMeta(text: string): { tid: string; index: number; total: number } | null {
  if (!text.startsWith(PREFIX + "|")) return null;
  const parts = text.split("|");
  if (parts.length < 5) return null;
  const tid = parts[1];
  const [idx, total] = parts[3].split("/").map(Number);
  if (!tid || !Number.isInteger(idx) || !Number.isInteger(total) || total < 1 || idx < 1 || idx > total) return null;
  return { tid, index: idx, total };
}

/** ترکیب تکه‌ها و بازگرداندن داده (به هر ترتیبی) */
export async function decodeTransfer(texts: string[]): Promise<DecodeResult> {
  const metas = texts.map((t) => ({ text: t, meta: chunkMeta(t.trim()) }));
  if (metas.some((m) => m.meta == null)) throw new Error("invalid-chunk");
  const total = metas[0].meta!.total;
  const tid = metas[0].meta!.tid;
  if (metas.some((m) => m.meta!.total !== total || m.meta!.tid !== tid)) throw new Error("mixed-transfers");
  const byIndex = new Map<number, string>();
  for (const m of metas) {
    const idx = m.meta!.index;
    if (byIndex.has(idx)) continue; // تکراری (مثلاً اسکن دوباره همان QR)
    byIndex.set(idx, m.text.trim().split("|").slice(4).join("|"));
  }
  const missing = [];
  for (let i = 1; i <= total; i++) if (!byIndex.has(i)) missing.push(i);
  if (missing.length > 0) throw new Error(`missing-chunks:${missing.join(",")}`);
  const flag = metas[0].text.trim().split("|")[2];
  const body = Array.from({ length: total }, (_, i) => byIndex.get(i + 1)!).join("");
  if (flag === "D") {
    const json = await inflate(base64UrlToBytes(body));
    if (json == null) throw new Error("decompress-failed");
    return parsePayload(json);
  }
  if (flag === "R") {
    const json = new TextDecoder().decode(base64UrlToBytes(body));
    return parsePayload(json);
  }
  throw new Error("unknown-flag");
}

function parsePayload(json: string): DecodeResult {
  const payload = JSON.parse(json) as TransferPayload;
  if (!payload || payload.v !== 1 || typeof payload.scope !== "string" || typeof payload.data !== "object") {
    throw new Error("invalid-payload");
  }
  return { scope: payload.scope, at: payload.at, data: payload.data };
}

/** خلاصه‌ی شمارنده‌ها برای نمایش پیش از ورود داده */
export function summarize(data: Partial<AppState>): string[] {
  const rows: string[] = [];
  const count = (arr?: unknown[]) => (Array.isArray(arr) ? arr.length : 0);
  if (data.settings) rows.push("تنظیمات و ظاهر");
  if (count(data.subjects)) rows.push(`${count(data.subjects)} درس`);
  if (count(data.topics)) rows.push(`${count(data.topics)} مبحث`);
  if (count(data.plans)) rows.push(`${count(data.plans)} برنامه`);
  if (count(data.tasks)) rows.push(`${count(data.tasks)} کار`);
  if (count(data.exams)) rows.push(`${count(data.exams)} امتحان`);
  if (count(data.reviews)) rows.push(`${count(data.reviews)} مرور`);
  if (count(data.flashcards)) rows.push(`${count(data.flashcards)} فلش‌کارت`);
  if (count(data.sessions)) rows.push(`${count(data.sessions)} جلسه‌ی مطالعه`);
  return rows;
}
