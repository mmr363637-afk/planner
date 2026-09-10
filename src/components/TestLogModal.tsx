// ===== مودال ثبت سریع تست (تمرین تست‌زنی) =====
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Button, Field, Modal, Segmented, inputClass } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  /** مبحث از پیش انتخاب‌شده (مثلاً بعد از پایان جلسه‌ی همان مبحث) */
  presetTopicId?: string;
}

const PRESETS = [10, 20, 30, 50];

export default function TestLogModal({ open, onClose, presetTopicId }: Props) {
  const { state, addTestLog } = useStore();
  const [topicId, setTopicId] = useState<string>(presetTopicId ?? "");
  const [total, setTotal] = useState<number>(20);
  const [correct, setCorrect] = useState<number>(15);

  useEffect(() => {
    if (open) {
      setTopicId(presetTopicId ?? "");
      setTotal(20);
      setCorrect(15);
    }
  }, [open, presetTopicId]);

  // درسِ مشتق از مبحث انتخاب‌شده
  const subjectId = topicId ? state.topics.find((t) => t.id === topicId)?.subjectId : undefined;
  const clampedCorrect = Math.min(correct, total);

  const phrase = total === 0 ? "—" : `دقت: ${Math.min(100, Math.round((clampedCorrect / Math.max(1, total)) * 100))}٪`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🧪 ثبت تست"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button
            onClick={() => {
              addTestLog({ topicId: topicId || undefined, subjectId, total, correct: clampedCorrect });
              onClose();
            }}
            disabled={total < 1}
          >
            ثبت
          </Button>
        </>
      }
    >
      <Field label="مبحث (اختیاری)">
        <select className={inputClass} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">تستِ آزاد (بدون مبحث)</option>
          {state.subjects.map((s) => (
            <optgroup key={s.id} label={s.name}>
              {state.topics.filter((t) => t.subjectId === s.id).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="تعداد تست">
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={200} className={inputClass} value={total}
            onChange={(e) => setTotal(Math.max(1, Math.min(200, Math.floor(Number(e.target.value)) || 1)))} />
          <Segmented
            className="flex-1"
            value={PRESETS.includes(total) ? String(total) : "custom"}
            onChange={(v) => v !== "custom" && setTotal(Number(v))}
            options={[...PRESETS.map((n) => ({ value: String(n), label: String(n) })), { value: "custom", label: "…" }]}
          />
        </div>
      </Field>

      <Field label="تعداد درست">
        <input type="range" min={0} max={total} value={clampedCorrect}
          onChange={(e) => setCorrect(Number(e.target.value))}
          className="w-full accent-teal-600" dir="ltr" />
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
          <span>۰</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">{clampedCorrect} درست</span>
          <span>{total}</span>
        </div>
      </Field>

      <div className="rounded-xl bg-teal-50 dark:bg-teal-900/25 text-teal-700 dark:text-teal-300 text-sm font-bold text-center py-2.5">
        {phrase}
      </div>
      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">دقیقهٔ مطالعه جداگانه ثبت می‌شود؛ این‌جا فقط خروجی تست‌زنی است.</p>
    </Modal>
  );
}
