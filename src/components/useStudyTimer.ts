// ===== تایمرِ مشترکِ «زمانِ واقعیِ مطالعه» — همان منطقِ خوانندهٔ درسنامه، یک‌جا =====
//
// قبل از این، منطقِ شمارش (۱ ثانیه یک‌بار، توقفِ خودکار وقتی تب پنهان است،
// واریز به `lessonProgress` و سپس به «آمارِ امروز» از راهِ دکمه/بستن) داخلِ
// `LessonReader` نهفته بود. خوانندهٔ بخش‌های تازهٔ مخزن (اسکچ‌نوت/آزمایشگاه)
// هم عینِ همان رفتار را لازم دارد، پس اینجا استخراج شد تا هر دو یک کد را
// اجرا کنند؛ درسنامه‌ها با همان تست‌ها سر جای خود می‌مانند.

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { progressOf } from "../lib/lessonLibrary";
import type { LessonProgress } from "../types";

/** چند ثانیه یک‌بار زمانِ مطالعه به state واریز شود (تا با بستنِ ناگهانی از دست نرود) */
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

export function useStudyTimer({ trackId, topicId }: { trackId: string; topicId?: string | null }): StudyTimerApi {
  const { state, visitLesson, addLessonStudyTime } = useStore();
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const pending = useRef(0);
  const topicIdRef = useRef<string | null>(null);
  topicIdRef.current = topicId ?? null;
  const visited = useRef(false);

  useEffect(() => {
    if (visited.current) return;
    visited.current = true;
    visitLesson(trackId);
  }, [trackId, visitLesson]);

  const flush = useCallback(() => {
    const due = Math.floor(pending.current);
    if (due < 1) return;
    pending.current -= due;
    addLessonStudyTime(trackId, due, { topicId: topicIdRef.current });
  }, [addLessonStudyTime, trackId]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      pending.current += 1;
      setSeconds((s) => s + 1);
      if (pending.current >= STUDY_TICK_SECONDS) flush();
    }, 1000);
    return () => clearInterval(id);
  }, [paused, flush]);

  // با پنهان‌شدنِ تب/اپ، شمارش متوقف می‌شود (زمانِ واقعیِ مطالعه، نه زمانِ بازبودنِ پنجره)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        setPaused(true);
        flush();
      } else setPaused(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [flush]);

  // موقعِ بستن، هر چه مانده واریز می‌شود تا یک ثانیه هم از دست نرود
  useEffect(() => {
    return () => {
      const due = Math.floor(pending.current);
      if (due >= 1) addLessonStudyTime(trackId, due, { topicId: topicIdRef.current });
    };
    // فقط یک‌بار در پایانِ عمرِ کامپوننت
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const record = progressOf(state.lessonProgress, trackId);
  const totalSeconds = record.seconds + seconds;
  return { seconds, paused, setPaused, flush, record, totalSeconds };
}
