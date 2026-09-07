// ===== Persistence layer =====
// IndexedDB منبعِ ماندگار داده است (حجم بالا، مقاوم به پاک‌شدن تصادفی) و localStorage
// «آینه‌ی سریع بوت» می‌ماند: هنگام اجرا، state بی‌درنگ و همگام از آینه خوانده می‌شود تا
// هیچ فلش/تأخیلی در اولین رندر نباشد، هم‌زمان همان داده در IndexedDB هم نوشته می‌شود.
// اگر آینه خالی/خراب باشد (مثلاً پاک‌شدن دستی localStorage)، داده از IndexedDB بازیابی
// می‌شود. داده‌های نسخه‌های قبلی (فقط localStorage) هم خودکار به IndexedDB منتقل می‌شوند.

import type { AppState } from "../types";
import { parseStateText } from "./stateIO";

/** کلید قدیمی و آینه‌ی بوت — همان کلیدی که نسخه‌های قبلی استفاده می‌کردند */
export const STORAGE_KEY = "study-planner-v1";

const DB_NAME = "study-planner";
const DB_VERSION = 1;
const STORE = "kv";
const KEY = "state";

// ---------- IndexedDB primitives ----------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb-unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb-open-failed"));
    req.onblocked = () => reject(new Error("idb-blocked"));
  });
}

function idbPut(db: IDBDatabase, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb-put-failed"));
    tx.onabort = () => reject(tx.error ?? new Error("idb-put-aborted"));
  });
}

function idbGet(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb-get-failed"));
  });
}

// ---------- module state ----------

let db: IDBDatabase | null = null;
let dbBroken = false; // یکبار شکست کافی است؛ دیگر تلاش نمی‌کنیم (آینه localStorage فعال می‌ماند)
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingJson: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();

// ---------- public API ----------

/** خواندن همگامِ آینه‌ی بوت (localStorage) — بوت بی‌درنگ بدون انتظار برای IndexedDB */
export function loadMirror(): AppState | null {
  try {
    return parseStateText(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * ذخیره‌ی state: آینه‌ی localStorage همگام + نوشتنِ IndexedDB با تأخیر کوتاه
 * (تا تغییرهای پشت‌سرهم ادغام شوند).
 */
export function persistState(state: AppState): void {
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch (e) {
    console.error("Failed to serialize state", e);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    // مثلاً پرشدن سهمیه localStorage — داده هنوز در IndexedDB ذخیره می‌شود
    console.warn("localStorage mirror write failed; IndexedDB remains the durable copy", e);
  }
  pendingJson = json;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const payload = pendingJson;
    pendingJson = null;
    if (payload != null) void writeToIdb(payload);
  }, 250);
}

/** خواندنِ ماندگار از IndexedDB (یا null اگر موجود نیست / در دسترس نیست) */
export async function loadDurable(): Promise<AppState | null> {
  if (dbBroken) return null;
  try {
    db = db ?? (await openDb());
    const raw = await idbGet(db);
    return typeof raw === "string" ? parseStateText(raw) : null;
  } catch {
    dbBroken = true;
    return null;
  }
}

/** انتظار برای پایان نوشتن‌های معوق — برای تست‌ها */
export function flushPersist(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
    const payload = pendingJson;
    pendingJson = null;
    if (payload != null) writeToIdb(payload);
  }
  return writeQueue;
}

/** بستن اتصال و ریست وضعیت داخلی — برای تست‌ها */
export async function closePersist(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  pendingJson = null;
  try {
    await writeQueue;
  } catch {
    /* ignore */
  }
  if (db) {
    db.close();
    db = null;
  }
  dbBroken = false;
}

async function writeToIdb(json: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    if (dbBroken) return;
    try {
      db = db ?? (await openDb());
      await idbPut(db, json);
    } catch (e) {
      dbBroken = true;
      console.warn("IndexedDB write failed; localStorage mirror keeps working", e);
    }
  });
  return writeQueue;
}
