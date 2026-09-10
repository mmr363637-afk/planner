// ===== برنامه‌ی ثابت هفته (کلاس‌ها، کار، ورزش) =====
// یک جدول هفتگی ترکیب‌پذیر با بلوک‌های رنگی؛ برای اینکه بدانی چه ساعت‌هایی خالی است
// تا «برنامه» حولِ مشغله‌ها شکل بگیرد. کاملاً آفلاین ذخیره می‌شود.

import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card, EmptyState, Field, IconButton, Modal, PlusIcon, TrashIcon, inputClass } from "../components/ui";
import { WEEKDAYS_FA, WEEK_ORDER, toFa } from "../lib/jalali";
import type { ClassBlock } from "../types";
import { cn } from "../utils/cn";

const DAY_START = 6 * 60; // ۶ صبح
const DAY_END = 24 * 60; // نیمه‌شب
const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);
const BLOCK_COLORS = ["#0ea5a4", "#8b5cf6", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#10b981"];

function minToText(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function textToMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 1440 ? v : null;
}

/** برخورد دو بلوک در یک روز */
function overlaps(a: ClassBlock, b: ClassBlock): boolean {
  return a.weekday === b.weekday && a.startMin < b.endMin && b.startMin < a.endMin;
}

export default function TimetablePage() {
  const { state, addClassBlock, updateClassBlock, deleteClassBlock } = useStore();
  const blocks = state.classBlocks ?? [];
  const [editing, setEditing] = useState<ClassBlock | null>(null);
  const [creatingAt, setCreatingAt] = useState<{ weekday: number } | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<number, ClassBlock[]>();
    for (const d of WEEK_ORDER) m.set(d, []);
    for (const b of blocks) m.get(b.weekday)?.push(b);
    for (const arr of m.values()) arr.sort((a, b) => a.startMin - b.startMin);
    return m;
  }, [blocks]);

  const conflicts = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < blocks.length; i++)
      for (let j = i + 1; j < blocks.length; j++)
        if (overlaps(blocks[i], blocks[j])) {
          set.add(blocks[i].id);
          set.add(blocks[j].id);
        }
    return set;
  }, [blocks]);

  // جمع کل مشغله‌ی هر روز (دقیقه)
  const busyPerDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of blocks) m.set(b.weekday, (m.get(b.weekday) ?? 0) + (b.endMin - b.startMin));
    return m;
  }, [blocks]);

  const span = DAY_END - DAY_START;
  const pct = (m: number) => `${((m - DAY_START) / span) * 100}%`;

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50">برنامه‌ی ثابت هفته ⏰</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">کلاس‌ها، کار، ورزش — چه ساعاتی مشغولی؟</p>
        </div>
        <Button onClick={() => setCreatingAt({ weekday: 6 })}>
          <PlusIcon /> بلوک جدید
        </Button>
      </div>

      {conflicts.size > 0 && (
        <Card className="mb-4 border-rose-200 dark:border-rose-800/50 bg-rose-50/60 dark:bg-rose-900/20">
          <div className="text-xs text-rose-700 dark:text-rose-300">⚠️ {toFa(conflicts.size)} بلوک با هم تداخل دارند — روی بلوک بزن و ساعتش را اصلاح کن.</div>
        </Card>
      )}

      {blocks.length === 0 ? (
        <Card>
          <EmptyState
            icon="⏰"
            title="برنامه‌ی هفتگی‌ات را بساز"
            description="بلوک‌های ثابت هفته (کلاس دانشگاه، کار، ورزش…) را اضافه کن تا همیشه بدانی چه ساعت‌هایی برای مطالعه خالی است."
            action={<Button onClick={() => setCreatingAt({ weekday: 6 })}>افزودن اولین بلوک</Button>}
          />
        </Card>
      ) : (
        <Card className="!p-2 overflow-hidden">
          {/* ستون روزها */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEK_ORDER.map((d) => (
              <div key={d} className="text-center">
                <button type="button" onClick={() => setCreatingAt({ weekday: d })} className="w-full rounded-lg py-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" title="افزودن بلوک به این روز">
                  {WEEKDAYS_FA[d]}
                </button>
                {busyPerDay.get(d) != null && <div className="text-[8px] text-slate-400">{formatDur(busyPerDay.get(d)!)} مشغله</div>}
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            {/* محور ساعت */}
            <div className="w-8 shrink-0 relative" style={{ height: 18 * 32 }}>
              {HOURS.filter((_, i) => i % 3 === 0).map((h) => (
                <div key={h} className="absolute text-[9px] text-slate-400 -translate-y-1/2" style={{ top: pct(h) }}>
                  {toFa(h / 60)}
                </div>
              ))}
            </div>
            {/* ستون‌های روزها */}
            <div className="flex-1 grid grid-cols-7 gap-1" dir="ltr">
              {WEEK_ORDER.map((d) => (
                <div key={d} className="relative rounded-lg bg-slate-50 dark:bg-slate-800/50" style={{ height: 18 * 32 }} dir="rtl" onClick={() => setCreatingAt({ weekday: d })} role="button" aria-label={`افزودن بلوک به ${WEEKDAYS_FA[d]}`}>
                  {HOURS.filter((_, i) => i % 3 === 0).map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-slate-200/50 dark:border-slate-700/40" style={{ top: pct(h) }} />
                  ))}
                  {(byDay.get(d) ?? []).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditing(b); }}
                      className={cn("absolute inset-x-1 rounded-md text-[9px] leading-tight text-white overflow-hidden px-1 py-0.5 text-right transition-transform hover:-translate-y-0.5", conflicts.has(b.id) && "ring-2 ring-rose-500")}
                      style={{ top: pct(b.startMin), height: `max(14px, ${((b.endMin - b.startMin) / span) * 100}%)`, backgroundColor: b.color ?? BLOCK_COLORS[0] }}
                      title={`${b.title} · ${toFa(minToText(b.startMin))} تا ${toFa(minToText(b.endMin))}`}
                    >
                      <div className="font-bold truncate">{b.title}</div>
                      <div className="opacity-80 text-[8px]" dir="ltr">{minToText(b.startMin)}–{minToText(b.endMin)}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="text-[9px] text-slate-400 mt-2 text-center">برای افزودن، روی ستون هر روز بزن</p>
        </Card>
      )}

      {(creatingAt || editing) && (
        <BlockModal
          block={editing}
          presetDay={creatingAt?.weekday ?? 6}
          onClose={() => { setEditing(null); setCreatingAt(null); }}
          onSave={(data) => {
            if (editing) updateClassBlock(editing.id, data);
            else addClassBlock(data);
            setEditing(null);
            setCreatingAt(null);
          }}
          onDelete={editing ? () => { deleteClassBlock(editing.id); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function formatDur(min: number): string {
  if (min < 60) return `${toFa(min)} دقیقه`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${toFa(h)} ساعت` : `${toFa(h)} ساعت و ${toFa(m)} دقیقه`;
}

function BlockModal({ block, presetDay, onClose, onSave, onDelete }: {
  block: ClassBlock | null;
  presetDay: number;
  onClose: () => void;
  onSave: (data: Omit<ClassBlock, "id" | "createdAt">) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(block?.title ?? "");
  const [weekday, setWeekday] = useState(block?.weekday ?? presetDay);
  const [start, setStart] = useState(minToText(block?.startMin ?? 8 * 60));
  const [end, setEnd] = useState(minToText(block?.endMin ?? 10 * 60));
  const [note, setNote] = useState(block?.note ?? "");
  const [color, setColor] = useState(block?.color ?? BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)]);

  const startMin = textToMin(start);
  const endMin = textToMin(end);
  const invalid = !title.trim() || startMin == null || endMin == null || endMin <= startMin;

  return (
    <Modal
      open
      onClose={onClose}
      title={block ? "ویرایش بلوک" : "بلوک جدید"}
      footer={
        <>
          {onDelete && (
            <IconButton onClick={onDelete} title="حذف" className="!mr-auto text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30">
              <TrashIcon />
            </IconButton>
          )}
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button disabled={invalid} onClick={() => onSave({ title: title.trim(), weekday, startMin: startMin!, endMin: endMin!, note: note.trim() || undefined, color })}>
            ذخیره
          </Button>
        </>
      }
    >
      <Field label="عنوان">
        <input autoFocus className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً کلاس فارماکولوژی" />
      </Field>
      <Field label="روز هفته">
        <div className="grid grid-cols-7 gap-1">
          {[...WEEK_ORDER].map((d) => (
            <button key={d} type="button" onClick={() => setWeekday(d)}
              className={cn("py-1.5 rounded-lg text-[11px] font-medium transition-colors", weekday === d ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300")}>
              {WEEKDAYS_FA[d]}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="از ساعت">
          <div className="flex items-center gap-1.5">
            <input type="time" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
            <div className="flex flex-col gap-1">
              {["-30", "+30"].map((op) => (
                <button key={op} type="button" className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/60 text-slate-500" onClick={() => { const v = textToMin(start); if (v != null) setStart(minToText(Math.max(0, Math.min(1410, v + (op === "+30" ? 30 : -30))))); }}>{op}</button>
              ))}
            </div>
          </div>
        </Field>
        <Field label="تا ساعت">
          <div className="flex items-center gap-1.5">
            <input type="time" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
            <div className="flex flex-col gap-1">
              {["-30", "+30"].map((op) => (
                <button key={op} type="button" className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/60 text-slate-500" onClick={() => { const v = textToMin(end); if (v != null) setEnd(minToText(Math.max(30, Math.min(1439, v + (op === "+30" ? 30 : -30))))); }}>{op}</button>
              ))}
            </div>
          </div>
        </Field>
      </div>
      {startMin != null && endMin != null && endMin <= startMin && <p className="text-[11px] text-rose-500 -mt-2 mb-3">پایان باید بعد از شروع باشد.</p>}
      <Field label="رنگ">
        <div className="flex flex-wrap gap-2">
          {BLOCK_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={cn("w-7 h-7 rounded-full transition-transform", color === c && "ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-800 scale-110")} style={{ backgroundColor: c }} />
          ))}
        </div>
      </Field>
      <Field label="یادداشت (اختیاری)">
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مکان، استاد، …" />
      </Field>
    </Modal>
  );
}
