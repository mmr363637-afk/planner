import { useEffect, useRef, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Field, Modal, inputClass } from "./ui";
import { parseVoiceLog } from "../lib/voiceLog";
import { leafTopics } from "../lib/topics";
import { formatMinutes, toFa } from "../lib/jalali";

interface Recog {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognizer(): (new () => Recog) | null {
  const w = window as unknown as Record<string, unknown>;
  const C = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Recog) | undefined;
  return C ?? null;
}

function norm(s: string): string {
  return s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[ً-ٟ]/g, "").trim();
}

/** تطبیق فازی نام درس/مبحث با باقی‌مانده‌ی جمله */
export function guessTopic(topics: { id: string; name: string; subjectId: string }[], subjects: { id: string; name: string }[], rest: string): string | null {
  const r = norm(rest);
  if (!r) return null;
  let best: string | null = null;
  let bestScore = 0;
  const consider = (id: string, name: string, exactBonus: number) => {
    const n = norm(name);
    if (!n) return;
    let score = 0;
    if (r.includes(n) || n.includes(r)) score = n.length + exactBonus;
    else {
      for (const w of n.split(/\s+/)) {
        if (w.length >= 2 && r.includes(w)) score += w.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  };
  for (const t of topics) consider(t.id, t.name, 10);
  if (bestScore >= 3) return best;
  for (const s of subjects) {
    const n = norm(s.name);
    if (n && r.includes(n) && n.length > bestScore) {
      bestScore = n.length;
      // اولین مبحثِ خوانده‌نشده‌ی همان درس
      best = topics.find((t) => t.subjectId === s.id)?.id ?? null;
    }
  }
  return bestScore >= 2 ? best : null;
}

/**
 * 🎙️ ثبت مطالعه با صدا — «۴۵ دقیقه قلب خوندم» را می‌فهمد و ثبت می‌کند.
 * اگر مرورگر گفتار را نداشت، همان جمله را دستی می‌گیریم و پارس می‌کنیم.
 */
export default function VoiceLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, logManualSession } = useStore();
  const { topicById } = useLookups();
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const recogRef = useRef<Recog | null>(null);
  const RecogClass = getRecognizer();

  const topics = leafTopics(state.topics);
  const parsed = parseVoiceLog(text);
  const guessed = parsed.minutes != null ? guessTopic(topics, state.subjects, parsed.rest) : null;
  const [topicId, setTopicId] = useState<string | null>(null);
  const effectiveTopic = topicId ?? guessed;

  useEffect(() => {
    if (open) {
      setText("");
      setTopicId(null);
      setError("");
      setListening(false);
    }
    return () => {
      try {
        recogRef.current?.stop();
      } catch { /* ignore */ }
    };
  }, [open ]);

  const toggleListen = () => {
    if (!RecogClass) return;
    if (listening) {
      try {
        recogRef.current?.stop();
      } catch { /* ignore */ }
      setListening(false);
      return;
    }
    try {
      const rec = new RecogClass();
      recogRef.current = rec;
      rec.lang = "fa-IR";
      rec.interimResults = true;
      rec.onresult = (e) => {
        const last = e.results[e.results.length - 1][0]?.transcript ?? "";
        if (last) setText(last);
      };
      rec.onerror = (e) => {
        setError(e.error === "not-allowed" ? "دسترسی به میکروفون داده نشد 🎤" : "خطا در تشخیص گفتار؛ جمله را بنویس.");
        setListening(false);
      };
      rec.onend = () => setListening(false);
      rec.start();
      setListening(true);
      setError("");
    } catch {
      setError("مرورگرت ضبط صدا را پشتیبانی نمی‌کند؛ جمله را بنویس.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="🎙️ ثبت مطالعه با صدا">
      {!RecogClass ? (
        <Card className="text-xs text-slate-500 mb-3">مرورگرت تشخیص گفتار ندارد؛ جمله‌ات را بنویس، خودش می‌فهمد. (در کروم اندروید دکمه‌ی میکروفون فعال است.)</Card>
      ) : (
        <div className="flex justify-center mb-3">
          <button
            type="button" onClick={toggleListen}
            className={`w-16 h-16 rounded-full text-3xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${listening ? "bg-rose-500 text-white animate-pulse" : "bg-teal-600 text-white"}`}
          >
            {listening ? "⏹" : "🎤"}
          </button>
        </div>
      )}
      {error && <div className="text-xs text-rose-600 text-center mb-2">{error}</div>}

      <Field label={listening ? "🎙️ دارم گوش می‌دم… بگو:" : "جمله‌ات"} hint="مثال: «۴۵ دقیقه قلب خوندم» یا «یک ساعت و نیم زبان»">
        <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="۴۵ دقیقه قلب خوندم" />
      </Field>

      {text.trim() && (
        <Card className="mb-3 text-sm">
          {parsed.minutes != null ? (
            <>
              <div>⏱ مدت: <b className="text-teal-600">{formatMinutes(parsed.minutes)}</b></div>
              <div className="mt-1">
                📖 مبحث: <b>{effectiveTopic ? topicById.get(effectiveTopic)?.name : "نامشخص (بدون درس ثبت می‌شود)"}</b>
              </div>
              {parsed.rest && <div className="text-[11px] text-slate-400 mt-1">«{parsed.rest}»</div>}
            </>
          ) : (
            <div className="text-amber-700 dark:text-amber-300 text-xs">مدت را نفهمیدم! بگو «چند دقیقه/ساعت» — مثلاً «۳۰ دقیقه ریاضی».</div>
          )}
        </Card>
      )}

      {parsed.minutes != null && (
        <Field label="تغییر مبحث (اختیاری)">
          <select className={inputClass} value={effectiveTopic ?? ""} onChange={(e) => setTopicId(e.target.value || null)}>
            <option value="">مطالعه بدون درس</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      )}

      <Button
        className="w-full" disabled={parsed.minutes == null}
        onClick={() => {
          if (parsed.minutes == null) return;
          logManualSession(effectiveTopic, parsed.minutes);
          onClose();
        }}
      >
        ثبت {parsed.minutes != null ? formatMinutes(parsed.minutes) : ""} مطالعه {effectiveTopic ? `· ${topicById.get(effectiveTopic)?.name}` : "· بدون درس"} {parsed.minutes != null ? `· ${toFa(parsed.minutes)}+ XP` : ""}
      </Button>
    </Modal>
  );
}
