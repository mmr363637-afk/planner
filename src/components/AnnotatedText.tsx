import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnnotationColor, AnnotationStyle, TextAnnotation } from "../types";
import {
  ANNOTATION_COLORS,
  ANNOTATION_COLOR_IDS,
  addAnnotation,
  patchAnnotation,
  removeAnnotation,
  textSegments,
} from "../lib/annotations";
import { inputClass } from "./ui";
import { cn } from "../utils/cn";

/**
 * 🖍 متنِ قابلِ نشانه‌گذاری — مثل ابزارهای مطالعهٔ PDF/کتاب:
 * کاربر یک واژه یا عبارت را انتخاب می‌کند و همان‌جا هایلایت رنگی، زیرخط، خط‌خوردگی
 * یا یادداشتِ چسبیده به آن عبارت اضافه می‌کند. نشانه‌گذاری‌ها روی «آفستِ نویسه»
 * ذخیره می‌شوند، پس با بزرگ/کوچک‌شدن فونت یا تغییر تم جابه‌جا نمی‌شوند و متن اصلی
 * هرگز تغییر نمی‌کند.
 *
 * انتخاب با `selectionchange` گرفته می‌شود (روی اندروید مطمئن‌تر از mouseup است).
 * آفست‌ها از یک Range از ابتدای همین ظرف تا ابتدای انتخاب حساب می‌شوند؛ چون داخل
 * ظرف فقط متن و spanهای نشانه‌گذاری هست، طولِ متنی دقیقاً همان آفست است.
 */
export default function AnnotatedText({
  text,
  annotations,
  side,
  editable = false,
  onChange,
  className,
  as: Tag = "div",
  placeholderHint,
}: {
  text: string;
  annotations: TextAnnotation[];
  side: "front" | "back";
  editable?: boolean;
  /** فهرست کامل نشانه‌گذاری‌های کارت (هر دو سمت) برمی‌گردد — ذخیره با مالک است */
  onChange?: (next: TextAnnotation[]) => void;
  className?: string;
  as?: "div" | "p" | "span";
  placeholderHint?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const sideAnnotations = useMemo(() => annotations.filter((a) => a.side === side), [annotations, side]);
  const segments = useMemo(() => textSegments(text, sideAnnotations), [text, sideAnnotations]);
  const active = activeId ? sideAnnotations.find((a) => a.id === activeId) ?? null : null;

  const readSelection = useCallback(() => {
    if (!editable || typeof window === "undefined") return;
    const sel = window.getSelection();
    const root = rootRef.current;
    if (!sel || !root || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const raw = range.toString();
    if (raw.trim().length < 2) return;
    // فاصله‌های ابتدا/انتها نباید بخشی از نشانه‌گذاری باشند
    const leading = raw.length - raw.trimStart().length;
    const pre = range.cloneRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length + leading;
    const end = start + raw.trim().length;
    if (end <= start) return;
    setSelection({ start, end, text: text.slice(start, end) });
  }, [editable, text]);

  useEffect(() => {
    if (!editable || typeof document === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSel = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(readSelection, 120);
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", onSel);
    };
  }, [editable, readSelection]);

  const apply = (style: AnnotationStyle, color?: AnnotationColor) => {
    if (!selection || !onChange) return;
    const next = addAnnotation(annotations, {
      side,
      start: selection.start,
      end: selection.end,
      text: selection.text,
      style,
      color,
      note: style === "highlight" && noteOpen ? noteDraft.trim() || undefined : undefined,
    });
    onChange(next);
    setNoteDraft("");
    setNoteOpen(false);
    setSelection(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* ignore */
    }
  };

  const patchActive = (patch: Partial<Pick<TextAnnotation, "color" | "note" | "style">>) => {
    if (!active || !onChange) return;
    onChange(patchAnnotation(annotations, active.id, patch));
  };

  return (
    <div className={cn("relative", className)}>
      <Tag
        ref={rootRef as never}
        className={cn("whitespace-pre-wrap leading-relaxed", editable && "select-text")}
        data-annotation-side={side}
      >
        {segments.map((seg) => {
          if (!seg.marks.length) return <span key={`${seg.start}-${seg.end}`}>{seg.text}</span>;
          const hasNote = seg.marks.some((m) => !!m.note);
          const highlight = seg.marks.find((m) => m.style === "highlight");
          const underline = seg.marks.find((m) => m.style === "underline");
          const strike = seg.marks.find((m) => m.style === "strike");
          return (
            <span
              key={`${seg.start}-${seg.end}`}
              role={editable ? "button" : undefined}
              tabIndex={editable ? 0 : undefined}
              onClick={(e) => {
                if (!editable || selection) return;
                e.stopPropagation();
                setActiveId(seg.marks[0].id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editable) setActiveId(seg.marks[0].id);
              }}
              className={cn(
                "rounded-sm transition-colors",
                highlight ? ANNOTATION_COLORS[highlight.color ?? "yellow"].highlight : "",
                // نشانگرِ یادداشت با ::after رسم می‌شود (نه متن)، وگرنه یک نویسهٔ اضافه
                // در Range می‌آید و آفستِ نشانه‌گذاری‌های بعدی را جابه‌جا می‌کند.
                hasNote &&
                  "ring-1 ring-sky-400/40 after:content-['📝'] after:mx-0.5 after:align-super after:text-[9px] after:text-sky-600 dark:after:text-sky-300",
                editable && "cursor-pointer",
              )}
              style={{
                borderBottom: underline ? `2px solid ${ANNOTATION_COLORS[underline.color ?? "yellow"].dot}` : undefined,
                textDecoration: strike ? "line-through" : undefined,
                textDecorationColor: strike ? ANNOTATION_COLORS[strike.color ?? "orange"].dot : undefined,
              }}
            >
              {seg.text}
            </span>
          );
        })}
        {text.length === 0 && <span className="text-slate-400">—</span>}
      </Tag>

      {editable && selection && (
        <div className="mt-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/70 dark:bg-teal-900/20 p-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] text-slate-500 dark:text-slate-300 truncate">
              «{selection.text.slice(0, 32)}{selection.text.length > 32 ? "…" : ""}»
            </span>
            <button type="button" className="text-[10px] text-slate-400 shrink-0" onClick={() => setSelection(null)}>
              لغو
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ANNOTATION_COLOR_IDS.map((color) => (
              <button
                key={color}
                type="button"
                title={`هایلایت ${ANNOTATION_COLORS[color].label}`}
                aria-label={`هایلایت ${ANNOTATION_COLORS[color].label}`}
                onClick={() => apply("highlight", color)}
                className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-700 shadow-sm active:scale-90 transition"
                style={{ backgroundColor: ANNOTATION_COLORS[color].dot }}
              />
            ))}
            <span className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />
            <button type="button" onClick={() => apply("underline")} className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 underline">
              زیرخط
            </button>
            <button type="button" onClick={() => apply("strike")} className="text-[11px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 line-through">
              خط‌خوردگی
            </button>
            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              className={cn("text-[11px] px-2 py-1 rounded-lg border", noteOpen ? "border-sky-400 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-200" : "border-slate-300 dark:border-slate-600")}
            >
              📝 یادداشت
            </button>
          </div>
          {noteOpen && (
            <div className="mt-2">
              <textarea
                className={cn(inputClass, "text-xs min-h-[52px]")}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="یادداشت روی همین عبارت…"
                dir="auto"
              />
              <button
                type="button"
                className="mt-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-sky-600 text-white font-bold"
                onClick={() => apply("highlight", "blue")}
              >
                ذخیرهٔ هایلایت + یادداشت
              </button>
            </div>
          )}
        </div>
      )}

      {editable && active && !selection && (
        <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500 dark:text-slate-300 truncate">«{active.text.slice(0, 40)}»</span>
            <button type="button" className="text-[10px] text-slate-400" onClick={() => setActiveId(null)}>
              بستن ✕
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {ANNOTATION_COLOR_IDS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`رنگ ${ANNOTATION_COLORS[color].label}`}
                onClick={() => patchActive({ color })}
                className={cn("w-5 h-5 rounded-full border-2", active.color === color ? "border-slate-700 dark:border-white scale-110" : "border-white dark:border-slate-600")}
                style={{ backgroundColor: ANNOTATION_COLORS[color].dot }}
              />
            ))}
            <button type="button" onClick={() => patchActive({ style: "underline" })} className="text-[10px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 underline">
              زیرخط
            </button>
            <button type="button" onClick={() => patchActive({ style: "strike" })} className="text-[10px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 line-through">
              خط‌خوردگی
            </button>
            <button
              type="button"
              onClick={() => {
                if (!onChange) return;
                onChange(removeAnnotation(annotations, active.id));
                setActiveId(null);
              }}
              className="text-[10px] px-2 py-1 rounded border border-rose-300 text-rose-600 dark:text-rose-300"
            >
              حذف
            </button>
          </div>
          <textarea
            className={cn(inputClass, "mt-1.5 text-xs min-h-[44px]")}
            value={active.note ?? ""}
            onChange={(e) => patchActive({ note: e.target.value })}
            placeholder="یادداشت روی این عبارت…"
            dir="auto"
          />
        </div>
      )}

      {editable && !selection && !active && placeholderHint && (
        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{placeholderHint}</p>
      )}
    </div>
  );
}
