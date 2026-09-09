import { useState } from "react";
import { useStore, useLookups } from "../store";
import { Button, Card, Modal, inputClass } from "./ui";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";

interface GeneratedCard {
  front: string;
  back: string;
  topicId?: string;
}

/**
 * تولید خودکار فلش‌کارت از متن.
 * متن رو می‌گیره و بر اساس الگوها (خط بعدی، نقطه، علامت سوال و...)
 * سوال/جواب‌های جداگانه می‌سازه.
 * 
 * الگوهای پشتیبانی‌شده:
 * - "سوال؟ جواب" (با علامت سوال)
 * - "عنوان: توضیح" (با colon)
 * - "خط1\nخط2" (هر دو خط یک کارت)
 * - "• نکته" (نکات لیستی — تعریف ساده)
 */
export default function AutoFlashcard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, addFlashcard, toast } = useStore();
  const { topicById } = useLookups();
  const [text, setText] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [generated, setGenerated] = useState<GeneratedCard[]>([]);
  const [step, setStep] = useState<"input" | "review">("input");

  const generateCards = (): GeneratedCard[] => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const cards: GeneratedCard[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // الگوی ۱: سوال؟ جواب (در همان خط)
      if (line.includes("؟") || line.includes("?")) {
        const sep = line.includes("؟") ? "؟" : "?";
        const parts = line.split(sep);
        if (parts.length >= 2 && parts[1].trim()) {
          cards.push({
            front: parts[0].trim() + sep,
            back: parts.slice(1).join(sep).trim(),
            topicId: selectedTopicId || undefined,
          });
          i++;
          continue;
        }
        // سوال در یک خط و جواب در خط بعد
        if (i + 1 < lines.length && lines[i + 1].trim()) {
          cards.push({
            front: line,
            back: lines[i + 1],
            topicId: selectedTopicId || undefined,
          });
          i += 2;
          continue;
        }
      }

      // الگوی ۲: عنوان: توضیح
      if (line.includes(":") || line.includes("：")) {
        const sep = line.includes(":") ? ":" : "：";
        const idx = line.indexOf(sep);
        const front = line.slice(0, idx).trim();
        const back = line.slice(idx + 1).trim();
        if (front && back) {
          cards.push({ front, back, topicId: selectedTopicId || undefined });
          i++;
          continue;
        }
      }

      // الگوی ۳: خط فعلی + خط بعدی
      if (i + 1 < lines.length) {
        cards.push({
          front: line,
          back: lines[i + 1],
          topicId: selectedTopicId || undefined,
        });
        i += 2;
      } else {
        // خط آخر تکی — فقط به عنوان یادداشت
        cards.push({
          front: line,
          back: "(نیاز به تکمیل پاسخ)",
          topicId: selectedTopicId || undefined,
        });
        i++;
      }
    }

    return cards;
  };

  const handleGenerate = () => {
    const cards = generateCards();
    if (cards.length === 0) {
      toast("متنی برای تبدیل پیدا نشد", "⚠️");
      return;
    }
    setGenerated(cards);
    setStep("review");
  };

  const handleImport = () => {
    let count = 0;
    for (const card of generated) {
      addFlashcard({
        front: card.front,
        back: card.back,
        topicId: card.topicId,
      });
      count++;
    }
    toast(`${toFa(count)} فلش‌کارت ساخته شد!`, "🎴");
    setText("");
    setGenerated([]);
    setStep("input");
    onClose();
  };

  const removeCard = (idx: number) => {
    setGenerated((prev) => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setText("");
    setGenerated([]);
    setStep("input");
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="🪄 ساخت خودکار فلش‌کارت">
      {step === "input" ? (
        <div className="space-y-4">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            متنت رو بچسبون — خودکار به فلش‌کارت تبدیل می‌شه.
            <br />
            <span className="text-xs text-slate-400">
              الگو: «سوال؟ جواب» یا «عنوان: توضیح» یا هر دو خط = یک کارت
            </span>
          </div>

          {/* انتخاب مبحث */}
          <select
            className={inputClass}
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
          >
            <option value="">بدون مبحث (فلش‌کارت آزاد)</option>
            {state.subjects.map((s) => (
              <optgroup key={s.id} label={s.name}>
                {state.topics
                  .filter((t) => t.subjectId === s.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </optgroup>
            ))}
          </select>

          <textarea
            className={cn(inputClass, "min-h-[180px] font-mono text-xs leading-6 resize-y")}
            placeholder={"مثال:\nنرمال ضربان قلب؟ ۶۰ تا ۱۰۰\nفشار خون طبیعی: ۱۲۰/۸۰\nHbA1c\nزیر ۶.۵٪"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="auto"
          />

          <div className="text-[11px] text-slate-400">
            {toFa(text.split("\n").filter(Boolean).length)} خط — حدود {toFa(Math.max(1, Math.ceil(text.split("\n").filter(Boolean).length / 2)))} فلش‌کارت ساخته می‌شود
          </div>

          <Button onClick={handleGenerate} disabled={!text.trim()} className="w-full">
            🪄 تولید فلش‌کارت
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span>{toFa(generated.length)} فلش‌کارت ساخته شد</span>
            <button type="button" onClick={() => setStep("input")} className="text-xs text-teal-600 dark:text-teal-400 underline">
              ویرایش متن
            </button>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {generated.map((card, i) => (
              <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{card.front}</div>
                    <div className="text-sm text-teal-600 dark:text-teal-400 mt-1">→ {card.back}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCard(i)}
                    className="text-slate-300 hover:text-rose-500 text-sm p-1 shrink-0"
                    title="حذف"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("input")} className="flex-1">
              ویرایش
            </Button>
            <Button onClick={handleImport} className="flex-1">
              ✅ افزودن {toFa(generated.length)} کارت
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
