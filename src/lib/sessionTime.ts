// ===== محاسبات زمانی جلسه‌ی مطالعه (توابع خالص) =====
// این‌جا زندگی می‌کنند تا App (بنر جلسه‌ی فعال) بدون ایمپورتِ صفحه‌ی سنگینِ Study
// بتواند از آن‌ها استفاده کند؛ صفحه‌ی Study تنبل (lazy) لود می‌شود.
import type { ActiveSession, PomodoroSettings } from "../types";

export function phaseDurationMs(a: ActiveSession, p: PomodoroSettings): number {
  const minutes = a.phase === "work" ? p.work : a.phase === "short" ? p.shortBreak : p.longBreak;
  return minutes * 60_000;
}

export function phaseElapsedMs(a: ActiveSession, now: number): number {
  return a.accumulatedMs + (a.running && a.startedAt != null ? now - a.startedAt : 0);
}

export function totalStudyMs(a: ActiveSession, now: number): number {
  return a.totalStudyMs + (a.phase === "work" && a.running && a.startedAt != null ? now - a.startedAt : 0);
}
