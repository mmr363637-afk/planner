import type { AppState } from "../types";
import { parseStateText } from "./stateIO";
export interface HistoryEntry {
  id: string;
  at: number;
  label: string;
  json: string;
}
const DB = "planner-recovery-v1";
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(
        new Error(
          "تاریخچهٔ امن در این مرورگر در دسترس نیست. ابتدا یک فایل پشتیبان ذخیره کن.",
        ),
      );
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("snapshots", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error("پایگاه تاریخچه مسدود است؛ تب‌های دیگر را ببند."));
  });
}
export async function listHistory(): Promise<HistoryEntry[]> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("snapshots").objectStore("snapshots").getAll();
      r.onsuccess = () =>
        resolve((r.result as HistoryEntry[]).sort((a, b) => b.at - a.at));
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function saveHistory(
  state: AppState,
  label: string,
): Promise<string> {
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    label,
    json: JSON.stringify({ ...state, activeSession: null }),
  };
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite"),
        store = tx.objectStore("snapshots");
      store.put(entry);
      const all = store.getAll();
      all.onsuccess = () => {
        const entries = (all.result as HistoryEntry[]).sort((a, b) =>
          a.id === entry.id ? -1 : b.id === entry.id ? 1 : b.at - a.at,
        );
        let bytes = 0;
        entries.forEach((e, i) => {
          bytes += e.json.length * 2;
          if (i >= 8 || (bytes > 16 * 1024 * 1024 && e.id !== entry.id))
            store.delete(e.id);
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("ذخیرهٔ تاریخچه ناموفق بود."));
    });
    return entry.id;
  } finally {
    db.close();
  }
}
export function historyState(entry: HistoryEntry): AppState | null {
  return parseStateText(entry.json);
}
export async function deleteHistory(id: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite");
      tx.objectStore("snapshots").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
