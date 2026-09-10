// ===== نقشه‌ی مهارت (Skill Tree) — نمای گرافیِ درس و مباحث =====
import { useMemo, useState } from "react";
import { useStore } from "../store";
import { buildSkillMap, type SkillNode } from "../lib/skillMap";
import { STATUS_LABEL, type Topic } from "../types";
import { toFa } from "../lib/jalali";
import { IconButton, CloseIcon } from "./ui";
import { cn } from "../utils/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  /** کلیک روی گره‌ی مبحث (مثلاً برای ویرایش) */
  onPickTopic?: (topic: Topic) => void;
}

export default function SkillTree({ open, onClose, onPickTopic }: Props) {
  const { state } = useStore();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<SkillNode | null>(null);

  const subjects = state.subjects;
  const activeId = subjectId ?? subjects[0]?.id ?? null;
  const subject = subjects.find((s) => s.id === activeId) ?? null;

  const map = useMemo(() => {
    if (!subject) return null;
    return buildSkillMap(subject, state.topics, 720, 520);
  }, [subject, state.topics]);

  if (!open) return null;

  const legend = [
    { c: "#94a3b8", t: "شروع‌نشده" },
    { c: "#14b8a6", t: "در حال یادگیری" },
    { c: "#f59e0b", t: "نیاز به مرور" },
    { c: "#eab308", t: "تسلط (طلایی)" },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-slate-900 animate-fade" dir="rtl" role="dialog" aria-label="نقشه‌ی مهارت">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-50">🗺 نقشه‌ی مهارت</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">گره‌های طوسی → فیروزه‌ای → طلایی؛ مسیر یادگیری‌ات را یک‌نگاه ببین</p>
        </div>
        <IconButton onClick={onClose} title="بستن"><CloseIcon /></IconButton>
      </div>

      {/* انتخاب درس */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-slate-100 dark:border-slate-800/60">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubjectId(s.id)}
            className={cn(
              "shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors border",
              activeId === s.id
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {map && map.nodes.length > 1 ? (
          <div className="relative" dir="ltr">
            <svg viewBox={`0 0 ${map.width} ${map.height}`} className="w-[min(92vw,720px)] h-auto">
              {/* یال‌ها */}
              {map.edges.map((e, i) => {
                const a = map.nodes.find((n) => n.id === e.from);
                const b = map.nodes.find((n) => n.id === e.to);
                if (!a || !b) return null;
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                return (
                  <path
                    key={i}
                    d={`M ${a.x} ${a.y} Q ${mx + (b.x - a.x) * 0.08} ${my + (b.y - a.y) * 0.08} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={b.color}
                    strokeOpacity={0.35}
                    strokeWidth={1.5}
                  />
                );
              })}
              {/* گره‌ها */}
              {map.nodes.map((n) => (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => {
                    if (n.kind === "topic" && onPickTopic) {
                      const t = state.topics.find((x) => x.id === n.id);
                      if (t) onPickTopic(t);
                    }
                  }}
                >
                  {/* حلقه‌ی پیشرفت دور گره مرکزی */}
                  {n.kind === "subject" && (
                    <circle r={n.r + 7} fill="none" stroke={n.color} strokeOpacity={0.5} strokeWidth={3}
                      strokeDasharray={2 * Math.PI * (n.r + 7)} strokeDashoffset={(1 - n.progress) * 2 * Math.PI * (n.r + 7)}
                      transform="rotate(-90)" strokeLinecap="round" />
                  )}
                  <circle r={n.r} fill={n.color} fillOpacity={n.kind === "subject" ? 1 : 0.15} stroke={n.color} strokeWidth={2} />
                  {n.status === "mastered" && (
                    <text textAnchor="middle" dominantBaseline="central" fontSize={n.r * 0.9}>✓</text>
                  )}
                  {n.kind === "subject" && (
                    <text textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={800} fill="#fff">{toFa(Math.round(n.progress * 100))}٪</text>
                  )}
                  {/* نام کوتاه کنار گره‌های بزرگ */}
                  {(n.kind === "subject" || n.r >= 14) && (
                    <text y={n.r + 13} textAnchor="middle" fontSize={9.5} fill="currentColor" className="fill-slate-500 dark:fill-slate-400">
                      {n.name.length > 14 ? n.name.slice(0, 13) + "…" : n.name}
                    </text>
                  )}
                </g>
              ))}
            </svg>

            {/* تول‌تیپ */}
            {hovered && hovered.kind === "topic" && (
              <div className="absolute left-2 bottom-2 right-2 sm:left-auto sm:right-4 sm:w-64 pointer-events-none rounded-2xl bg-slate-900/90 dark:bg-slate-700/95 text-white text-xs px-4 py-3 shadow-xl">
                <div className="font-bold mb-1">{hovered.name}</div>
                <div className="text-white/70">
                  وضعیت: {hovered.status ? STATUS_LABEL[hovered.status] : "—"}
                  {" · "}پیشرفت: {toFa(Math.round(hovered.progress * 100))}٪
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-sm text-slate-400 py-16">
            {subjects.length === 0 ? "هنوز درسی نداری — اول یک درس بساز." : "این درس هنوز مبحثی ندارد."}
          </div>
        )}
      </div>

      {/* راهنمای رنگ‌ها */}
      <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
        {legend.map((l, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: l.c + "33", border: `2px solid ${l.c}` }} />
            {l.t}
          </span>
        ))}
        <span className="text-slate-300 dark:text-slate-600">·</span>
        <span>روی گره کلیک کن تا ویرایشش کنی</span>
      </div>
    </div>
  );
}
