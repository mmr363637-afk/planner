import { useEffect, useMemo, useRef, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Modal } from "./ui";
import { buildPodcastQueue } from "../lib/podcast";
import { classifyReviews } from "../lib/srs";
import { classifyCards } from "../lib/sm2";
import { toFa, todayKey } from "../lib/jalali";

/**
 * 📻 پادکست مرور — مرورهای سررسید (اشتباهات، مباحث، کارت‌ها) را
 * با صدا برایت می‌خواند؛ برای توی راه و قبل خواب. کاملاً آفلاین (TTS خود گوشی).
 */
export default function ReviewPodcast({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useStore();
  const { topicById, subjectOfTopic, subjectById } = useLookups();
  const today = todayKey();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const indexRef = useRef(0);
  const playingRef = useRef(false);
  indexRef.current = index;
  playingRef.current = playing;

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const queue = useMemo(() => {
    if (!open) return [];
    const reviews = classifyReviews(state.reviews, today);
    const cards = classifyCards(state.flashcards, today);
    return buildPodcastQueue({
      reviews: [...reviews.overdue, ...reviews.today],
      flashcards: [...cards.overdue, ...cards.due],
      mistakes: (state.mistakes ?? []).filter((m) => m.dueDate <= today),
      topicById, subjectOfTopic, subjectById,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state.reviews, state.flashcards, state.mistakes]);

  useEffect(() => {
    if (open) {
      setIndex(0);
      setPlaying(false);
    } else {
      try {
        window.speechSynthesis?.cancel();
      } catch { /* ignore */ }
    }
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch { /* ignore */ }
    };
  }, [open ]);

  const speakAt = (i: number, speed: number) => {
    if (!supported || queue.length === 0) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const item = queue[Math.max(0, Math.min(i, queue.length - 1))];
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = "fa-IR";
    u.rate = speed;
    const faVoice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("fa"));
    if (faVoice) u.voice = faVoice;
    u.onend = () => {
      // اگر هنوز حالت پخش است و آیتم بعدی هست، ادامه بده
      if (playingRef.current && indexRef.current < queue.length - 1) {
        const next = indexRef.current + 1;
        setIndex(next);
        // speakAt با index جدید
        setTimeout(() => {
          if (playingRef.current) speakAtRef.current(next, speed);
        }, 350);
      } else {
        setPlaying(false);
      }
    };
    u.onerror = () => setPlaying(false);
    synth.speak(u);
  };
  const speakAtRef = useRef(speakAt);
  speakAtRef.current = speakAt;

  const toggle = () => {
    if (!supported || queue.length === 0) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    } else {
      setPlaying(true);
      // کمی صبر تا playingRef به‌روز شود
      setTimeout(() => speakAt(indexRef.current, rate), 30);
    }
  };

  const jump = (i: number) => {
    const clamped = Math.max(0, Math.min(queue.length - 1, i));
    setIndex(clamped);
    if (playingRef.current) setTimeout(() => speakAt(clamped, rate), 30);
  };

  return (
    <Modal open={open} onClose={onClose} title="📻 پادکست مرور">
      {!supported ? (
        <Card className="text-sm text-slate-500">مرورگرت پخش گفتار را پشتیبانی نمی‌کند. در کروم اندروید امتحان کن.</Card>
      ) : queue.length === 0 ? (
        <Card className="text-sm text-slate-500 text-center py-6">
          🎉 مرور سررسیدی نداری؛ پادکست امروز تعطیل است!
        </Card>
      ) : (
        <>
          <Card className="bg-gradient-to-br from-teal-600 to-emerald-600 text-white border-0 text-center py-6">
            <div className={`text-5xl mb-2 ${playing ? "animate-bounce" : ""}`} style={{ animationDuration: "1.6s" }}>🎙️</div>
            <div className="font-bold">{queue[index]?.title}</div>
            <div className="text-xs opacity-80 mt-1">مورد {toFa(index + 1)} از {toFa(queue.length)}</div>
            <div className="h-1.5 rounded-full bg-white/25 mt-3 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${((index + (playing ? 0.5 : 0)) / queue.length) * 100}%` }} />
            </div>
          </Card>

          <div className="flex items-center justify-center gap-3 mt-4">
            <Button variant="ghost" onClick={() => jump(index - 1)} disabled={index === 0}>⏮</Button>
            <button
              type="button" onClick={toggle}
              className="w-14 h-14 rounded-full bg-teal-600 text-white text-2xl flex items-center justify-center shadow-lg shadow-teal-600/30 active:scale-95 transition"
            >
              {playing ? "⏸" : "▶️"}
            </button>
            <Button variant="ghost" onClick={() => jump(index + 1)} disabled={index >= queue.length - 1}>⏭</Button>
          </div>

          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-slate-500">
            سرعت:
            {[0.8, 1, 1.25, 1.5].map((r) => (
              <button
                key={r} type="button"
                onClick={() => {
                  setRate(r);
                  if (playingRef.current) setTimeout(() => speakAt(indexRef.current, r), 30);
                }}
                className={`px-2.5 py-1 rounded-lg ${rate === r ? "bg-teal-600 text-white font-bold" : "bg-slate-100 dark:bg-slate-700"}`}
              >
                {toFa(r)}×
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {queue.map((q, i) => (
              <button
                key={i} type="button" onClick={() => jump(i)}
                className={`text-right text-xs p-2.5 rounded-xl border transition-colors ${i === index ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20 font-bold" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}
              >
                {i === index && playing ? "🔊 " : `${toFa(i + 1)}. `}{q.title}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
