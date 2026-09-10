// ===== باغ مجازی — نمایشگرِ رشدِ بصریِ مجموع زمان مطالعه =====
// درخت با SVG کشیده می‌شود (بدون فایل تصویری) و هر مرحله‌ی باغ شکل متفاوتی دارد.
// گل‌ها به ازای هر مبحثِ «تسلط‌یافته» روی چمن باز می‌شوند.

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { FLOWER_SPOTS, GARDEN_STAGES, gardenFlowers, gardenProgress } from "../lib/garden";
import { totalMinutes } from "../lib/stats";
import { formatMinutes, toFa } from "../lib/jalali";
import { Card, ProgressBar } from "./ui";

const FLOWER_COLORS = ["#f472b6", "#fbbf24", "#a78bfa", "#fb7185", "#38bdf8", "#f97316", "#4ade80"];

export function GardenCard() {
  const { state } = useStore();
  const total = useMemo(() => totalMinutes(state.sessions), [state.sessions]);
  const mastered = useMemo(() => state.topics.filter((t) => t.status === "mastered").length, [state.topics]);
  const { stage, inStage } = gardenProgress(total);
  const flowers = gardenFlowers(mastered);
  const next = stage.toMinutes;

  // «تماشای رشد»: بازپخش فشرده‌ی مسیرِ دانه تا باغِ امروز
  const [replay, setReplay] = useState<number | null>(null); // 0..1 یا null
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const reducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // تبدیل پیشرفتِ خطی به دقیقه‌ها با کاهشِ نرم (ease-out) تا مراحل اول سریع‌تر دیده شوند
  const shownMinutes = replay == null ? total : Math.round(total * Math.pow(replay, 0.65));
  const shown = gardenProgress(shownMinutes);
  const shownStage = replay == null ? stage : shown.stage;
  const shownInStage = replay == null ? inStage : shown.inStage;
  const shownFlowers = replay == null ? flowers : Math.round(flowers * replay);

  const startReplay = () => {
    if (reducedMotion || total < 5) return;
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const DURATION = 5500;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / DURATION);
      setReplay(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else raf.current = requestAnimationFrame(() => setReplay(null));
    };
    setReplay(0);
    raf.current = requestAnimationFrame(step);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <svg viewBox="0 0 100 100" className="w-28 h-28 rounded-2xl bg-gradient-to-b from-sky-100 to-emerald-50 dark:from-slate-700 dark:to-slate-800" role="img" aria-label={`باغ تو: ${stage.label}`}>
            <GardenScene level={shownStage.level} flowers={shownFlowers} inStage={shownInStage} />
          </svg>
          {total >= 5 && (
            <button
              type="button"
              onClick={startReplay}
              disabled={replay != null}
              title="تماشای مسیر رشد باغت از دانه تا امروز"
              className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full bg-emerald-500 text-white text-xs shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:bg-emerald-600 transition-colors disabled:opacity-60"
            >
              {replay != null ? "⏳" : "▶"}
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            🌱 باغ تو
            <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">{shownStage.icon} {shownStage.label}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {replay != null ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">در حال بازپخش مسیر… {formatMinutes(shownMinutes)} ↑</span>
            ) : (
              <>
                {formatMinutes(total)} مطالعه = آبِ باغ توست 🌧️
                {flowers > 0 && <> و {toFa(flowers)} گل از {toFa(mastered)} مبحثِ تسلط‌یافته‌ات باز شده 🌸</>}
              </>
            )}
          </div>
          {next != null ? (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span>{stage.label}</span>
                <span>{toFa(Math.max(0, next - total))} دقیقه تا «{GARDEN_STAGES[stage.level + 1]?.label ?? ""}»</span>
              </div>
              <ProgressBar value={shownInStage * 100} color="#10b981" height="h-1.5" />
            </div>
          ) : (
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-2">🏆 باغت به آخرین مرحله رسیده؛ حالا فقط گلهاش را بیشتر کن!</div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** صحنه‌ی SVG باغ — ظاهرش با مرحله عوض می‌شود و با پیشرفتِ درونِ مرحله می‌رويد */
function GardenScene({ level, flowers, inStage }: { level: number; flowers: number; inStage: number }) {
  // ابعادِ درخت بر اساس مرحله + پیشرفتِ نرمِ درونِ مرحله تا رشد «تدریجی» حس شود
  const ease = level === 0 ? 0 : (level + Math.min(1, inStage * 0.6)) / 6; // 0..1
  const trunkH = 8 + ease * 34; // ارتفاع تنه
  const canopyR = 3 + ease * 15; // شعاع تاج
  const cx = 50;
  const groundY = 86;

  return (
    <g>
      {/* خورشید */}
      <circle cx={16} cy={18} r={7} fill="#fde68a" opacity={0.9} />
      {/* زمین */}
      <ellipse cx={50} cy={92} rx={52} ry={10} fill="#bbf7d0" opacity={0.85} />
      <ellipse cx={50} cy={90} rx={46} ry={7} fill="#86efac" opacity={0.7} />

      {level === 0 ? (
        // فقط خاک و بذر
        <g>
          <ellipse cx={50} cy={groundY} rx={10} ry={3.2} fill="#a16207" opacity={0.65} />
          <circle cx={50} cy={groundY - 2.4} r={1.6} fill="#713f12" />
          {/* پیش‌نمایش محوِ اینده */}
          <path d={`M50 ${groundY - 3} q-1.5 -3 -4 -3.5`} stroke="#4ade80" strokeWidth={1} fill="none" opacity={0.5} />
        </g>
      ) : (
        <g>
          {/* تنه */}
          <path
            d={`M${cx} ${groundY} C ${cx - 2} ${groundY - trunkH * 0.5}, ${cx + 2} ${groundY - trunkH * 0.7}, ${cx} ${groundY - trunkH}`}
            stroke="#92400e"
            strokeWidth={1.8 + ease * 2.6}
            strokeLinecap="round"
            fill="none"
          />
          {/* تاج (جوانه‌ها در مراحل پایین کوچک‌اند) */}
          {level <= 1 ? (
            <g>
              <path d={`M${cx} ${groundY - trunkH} q -5 -1.5 -6.5 -6.5 q 5 1 6.5 6.5`} fill="#22c55e" />
              <path d={`M${cx} ${groundY - trunkH} q 5 -1.5 6.5 -6.5 q -5 1 -6.5 6.5`} fill="#16a34a" />
            </g>
          ) : (
            <g>
              <circle cx={cx - canopyR * 0.7} cy={groundY - trunkH - canopyR * 0.2} r={canopyR * 0.75} fill="#16a34a" opacity={0.95} />
              <circle cx={cx + canopyR * 0.7} cy={groundY - trunkH - canopyR * 0.15} r={canopyR * 0.72} fill="#15803d" opacity={0.95} />
              <circle cx={cx} cy={groundY - trunkH - canopyR * 0.55} r={canopyR} fill="#22c55e" opacity={0.95} />
              {/* گل‌های روی تاج در مراحل بالا */}
              {level >= 5 &&
                [0, 1, 2, 3, 4].map((i) => {
                  const a = (i / 5) * Math.PI * 2;
                  return (
                    <circle
                      key={i}
                      cx={cx + Math.cos(a) * canopyR * 0.8}
                      cy={groundY - trunkH - canopyR * 0.55 + Math.sin(a) * canopyR * 0.6}
                      r={1.6}
                      fill={FLOWER_COLORS[i % FLOWER_COLORS.length]}
                      stroke="#fff"
                      strokeWidth={0.35}
                    />
                  );
                })}
            </g>
          )}
          {/* پرنده‌ها وقتی باغ بزرگ شد */}
          {level >= 5 && (
            <g stroke="#475569" strokeWidth={0.8} fill="none" opacity={0.8}>
              <path d="M70 22 q 2 -2 4 0 q 2 -2 4 0" />
              <path d="M78 30 q 2 -2 4 0 q 2 -2 4 0" />
            </g>
          )}
        </g>
      )}

      {/* گل‌های چمن: به ازای هر مبحثِ تسلط‌یافته */}
      {FLOWER_SPOTS.slice(0, flowers).map((spot, i) => (
        <g key={i}>
          <line x1={spot.x} y1={spot.y} x2={spot.x} y2={spot.y - 2.4} stroke="#16a34a" strokeWidth={0.7} />
          <circle cx={spot.x} cy={spot.y - 3.1} r={1.4} fill={FLOWER_COLORS[i % FLOWER_COLORS.length]} stroke="#fff" strokeWidth={0.3} />
        </g>
      ))}
    </g>
  );
}
