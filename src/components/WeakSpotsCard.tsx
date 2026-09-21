// ===== کارت کلینیک و عیب‌یابی نقاط ضعف تحصیلی =====
import { useStore } from "../store";
import { diagnoseWeakSpots } from "../lib/diagnostics";
import { Card } from "./ui";

export default function WeakSpotsCard() {
  const { state } = useStore();
  const spots = diagnoseWeakSpots(state);

  if (spots.length === 0) return null;

  return (
    <Card className="mb-3 border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🩺</span>
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
            تحلیل نقاط ضعف و مباحث نیازمند توجه ({spots.length} مورد)
          </h3>
        </div>
      </div>
      <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mb-3 leading-relaxed">
        این مباحث به دلیل تست‌زنی پایین یا فراموشی مکرر در فلش‌کارت‌ها شناسایی شده‌اند:
      </p>

      <div className="flex flex-col gap-2">
        {spots.slice(0, 4).map((s) => (
          <div
            key={s.topicId}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-100 dark:border-slate-800 flex flex-col gap-1 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                {s.topicName}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: `${s.subjectColor}20`,
                  color: s.subjectColor,
                }}
              >
                {s.subjectName}
              </span>
            </div>
            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
              ⚠️ {s.reason}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              💡 {s.recommendation}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
