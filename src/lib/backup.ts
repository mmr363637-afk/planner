// ===== پشتیبان‌گیری خودکار =====
// اپ کاملاً آفلاین است؛ «خودکار» بودن بکاپ یعنی خودِ اپ هر N روز فایل JSON را
// دانلود می‌کند و به کاربر یادآوری می‌کند — بدون هیچ سروری.

import type { AutoBackupSettings } from "../types";

export interface BackupStatus {
  due: boolean;
  /** روزهای گذشته از آخرین بکاپ — null یعنی هرگز بکاپ نداشته */
  daysSince: number | null;
  intervalDays: number;
}

const DAY_MS = 24 * 3600 * 1000;

export function backupStatus(ab: Pick<AutoBackupSettings, "enabled" | "intervalDays" | "lastBackupAt">, now: number = Date.now()): BackupStatus {
  if (!ab.enabled) return { due: false, daysSince: null, intervalDays: ab.intervalDays };
  if (ab.lastBackupAt == null) return { due: true, daysSince: null, intervalDays: ab.intervalDays };
  const daysSince = Math.floor((now - ab.lastBackupAt) / DAY_MS);
  return { due: daysSince >= ab.intervalDays, daysSince, intervalDays: ab.intervalDays };
}

/** نام پیشنهادی فایل بکاپ، مثلاً study-planner-backup-2026-09-10.json */
export function backupFileName(dateKey: string): string {
  return `study-planner-backup-${dateKey}.json`;
}

/** دانلود فایل متنی در مرورگر (برای بکاپ دستی/خودکار) — در محیط بدون DOM، false */
export function downloadTextFile(name: string, text: string, mime = "application/json"): boolean {
  try {
    if (typeof document === "undefined") return false;
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}
