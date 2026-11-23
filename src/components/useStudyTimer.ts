// ===== تایمرِ مشترکِ «زمانِ واقعیِ مطالعه» — همان منطقِ خوانندهٔ درسنامه، یک‌جا =====
//
// زمان از اختلافِ ساعتِ یکنواختِ مرورگر (`performance.now`) محاسبه می‌شود، نه از
// تعدادِ دفعاتِ اجرای `setInterval`: مرورگر در تبِ پس‌زمینه/گوشی، تیک‌ها را کم
// می‌کند و در نتیجه شمارشِ صرفاً تیکی می‌تواند ده‌ها دقیقه عقب بماند. تایمر فقط
// وقتی صفحه دیده می‌شود و کاربر آن را دستی متوقف نکرده، زمان را جمع می‌کند.

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { progressOf } from "../lib/lessonLibrary";
import type { LessonProgress } from "../types";

/** هر چند ثانیهٔ واقعی، زمان به state واریز شود (تا با بستنِ ناگهانی از دست نرود) */
export const STUDY_TICK_SECONDS = 20;

export interface StudyTimerApi {
  /** ثانیه‌هایی که در همین باز شدنِ پنجره شمرده شده */
  seconds: number;
  paused: boolean;
  setPaused: (v: boolean | ((p: boolean) => boolean)) => void;
  /** ثانیه‌های معوق را به `lessonProgress[trackId]` منتقل می‌کند */
  flush: () => void;
  /** رکوردِ کلیِ همان آیتم در state (ثبت‌شده + در حالِ شمارش) */
  record: LessonProgress;
  totalSeconds: number;
}

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export function useStudyTimer({ trackId, topicId }: { trackId: string; topicId?: string | null }): StudyTimerApi {
  const { state, visitLesson, addLessonStudyTime } = useStore();
  const [seconds, setSeconds] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const manualPausedRef = useRef(false);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");

  // میلی‌ثانیه‌های کامل‌شده در بازه‌های فعال؛ activeSince زمانِ شروعِ بازهٔ جاری است.
  const elapsedMs = useRef(0);
  const activeSince = useRef<number | null>(null);
  const committedSeconds = useRef(0);
  const secondsRef = useRef(0);

  // توابعِ Store با تغییرِ state عوض می‌شوند؛ ref مانعِ ریست‌شدنِ بازهٔ interval
  // و از دست‌رفتنِ زمان به‌خاطرِ هویتِ تازهٔ تابع در هر رندر می‌شود.
  const addTimeRef = useRef(addLessonStudyTime);
  addTimeRef.current = addLessonStudyTime;
  const trackIdRef = useRef(trackId);
  trackIdRef.current = trackId;
  const topicIdRef = useRef<string | null>(null);
  topicIdRef.current = topicId ?? null;
  const visitLessonRef = useRef(visitLesson);
  visitLessonRef.current = visitLesson;
  const visitedTrackId = useRef<string | null>(null);

  const elapsedSecondsNow = useCallback(() => {
    const runningMs = activeSince.current == null ? 0 : Math.max(0, monotonicNow() - activeSince.current);
    return Math.floor((elapsedMs.current + runningMs) / 1000);
  }, []);

  const settleActive = useCallback((publish = true) => {
    const since = activeSince.current;
    if (since == null) return;
    elapsedMs.current += Math.max(0, monotonicNow() - since);
    activeSince.current = null;
    const current = Math.floor(elapsedMs.current / 1000);
    secondsRef.current = current;
    if (publish) setSeconds(current);
  }, []);

  const flush = useCallback(() => {
    const due = Math.max(0, elapsedSecondsNow() - committedSeconds.current);
    if (due < 1) return;
    committedSeconds.current += due;
    addTimeRef.current(trackIdRef.current, due, { topicId: topicIdRef.current });
  }, [elapsedSecondsNow]);

  const setPaused = useCallback<StudyTimerApi["setPaused"]>((nextValue) => {
    const next = typeof nextValue === "function" ? nextValue(manualPausedRef.current) : nextValue;
    if (next === manualPausedRef.current) return;
    if (next) {
      // لحظهٔ توقف را دقیق ثبت کن؛ منتظرِ تیکِ بعدی نمان.
      settleActive();
      flush();
    }
    manualPausedRef.current = next;
    setManualPaused(next);
  }, [flush, settleActive]);

  useEffect(() => {
    if (visitedTrackId.current === trackId) return;
    visitedTrackId.current = trackId;
    visitLessonRef.current(trackId);
  }, [trackId, visitLesson]);

  const paused = manualPaused || !visible;

  useEffect(() => {
    if (paused) return;
    activeSince.current = monotonicNow();
    const id = setInterval(() => {
      const current = elapsedSecondsNow();
      if (current !== secondsRef.current) {
        secondsRef.current = current;
        setSeconds(current);
      }
      if (current - committedSeconds.current >= STUDY_TICK_SECONDS) flush();
    }, 1000);
    return () => {
      clearInterval(id);
      // توقفِ دستی، پنهان‌شدن یا unmount: زمانِ بینِ آخرین تیک و همین لحظه هم حساب شود.
      settleActive(false);
      flush();
    };
  }, [paused, elapsedSecondsNow, flush, settleActive]);

  // با پنهان‌شدنِ تب/اپ، همان لحظه بازه بسته و واریز می‌شود؛ در برگشت، فقط اگر
  // توقفِ دستی فعال نباشد شمارش از نو شروع می‌شود.
  useEffect(() => {
    const onVisibility = () => {
      const nextVisible = document.visibilityState !== "hidden";
      if (!nextVisible) {
        settleActive();
        flush();
      }
      setVisible(nextVisible);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [flush, settleActive]);

  const record = progressOf(state.lessonProgress, trackId);
  // record.seconds همین جلسه را با هر flush هم می‌گیرد؛ فقط بخشِ هنوز flush‌نشده
  // را دوباره از شمارندهٔ محلی جمع کن تا زمانِ نمایش‌داده‌شده دوبرابر نشود.
  const totalSeconds = record.seconds + Math.max(0, seconds - committedSeconds.current);
  return { seconds, paused, setPaused, flush, record, totalSeconds };
}
