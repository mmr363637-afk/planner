export interface SyncStatus {
  phase: "idle" | "saving" | "saved" | "offline" | "conflict" | "error";
  message: string;
  scope?: string;
  at?: number;
}
let status: SyncStatus = {
  phase: "idle",
  message: "همگام‌سازی هنوز انجام نشده است.",
};
const listeners = new Set<() => void>();
export const getSyncStatus = () => status;
export const subscribeSyncStatus = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function setSyncStatus(next: SyncStatus) {
  status = next;
  listeners.forEach((fn) => fn());
}
