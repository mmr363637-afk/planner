import { useState } from "react";
import { useStore, useLookups } from "../store";
import { Button, Card, Modal, SectionTitle, inputClass } from "./ui";
import { formatJalaliShort, toFa, todayKey } from "../lib/jalali";
import type { StudyNote, TopicTag } from "../types";
import { cn } from "../utils/cn";

const TAG_META: { id: TopicTag; label: string; icon: string; color: string }[] = [
  { id: "urgent", label: "فوری", icon: "🔴", color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" },
  { id: "exam", label: "امتحان", icon: "📝", color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" },
  { id: "review", label: "مرور", icon: "🔁", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
  { id: "weak", label: "ضعیفم", icon: "⚠️", color: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" },
  { id: "mastered", label: "بلدم", icon: "✅", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" },
];

/**
 * پنل یادداشت‌های سریع و مدیریت برچسب‌های مباحث.
 * همه‌چیز آفلاین و در localStorage ذخیره می‌شود.
 */
export default function NotesPanel({ topicId, onClose }: { topicId?: string; onClose?: () => void }) {
  const { state, addNote, deleteNote, toggleTopicTag } = useStore();
  const { topicById } = useLookups();
  const [newText, setNewText] = useState("");
  const [filter, setFilter] = useState<"all" | TopicTag>("all");

  const notes = state.notes
    .filter((n) => !topicId || n.topicId === topicId)
    .filter((n) => {
      if (filter === "all") return true;
      const topic = n.topicId ? topicById.get(n.topicId) : null;
      return topic?.tags?.includes(filter);
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    addNote(text, topicId);
    setNewText("");
  };

  return (
    <div className="space-y-4">
      {/* افزودن یادداشت */}
      <div className="flex gap-2">
        <textarea
          className={cn(inputClass, "flex-1 min-h-[60px] resize-none text-sm")}
          placeholder="یادداشت سریع بنویس..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button onClick={handleAdd} disabled={!newText.trim()}>
          ذخیره
        </Button>
      </div>

      {/* فیلتر برچسب */}
      <div className="flex gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn("px-2 py-1 rounded-lg text-xs transition-colors", filter === "all" ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-bold" : "bg-slate-100 dark:bg-slate-700 text-slate-500")}
        >
          همه ({toFa(state.notes.length)})
        </button>
        {TAG_META.map((tag) => {
          const count = state.topics.filter((t) => t.tags?.includes(tag.id)).length;
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => setFilter(tag.id)}
              className={cn("px-2 py-1 rounded-lg text-xs transition-colors", filter === tag.id ? "font-bold " + tag.color : "bg-slate-100 dark:bg-slate-700 text-slate-500")}
            >
              {tag.icon} {tag.label} ({toFa(count)})
            </button>
          );
        })}
      </div>

      {/* لیست یادداشت‌ها */}
      {notes.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">
          هنوز یادداشتی نداری 📝<br />
          <span className="text-xs">یادداشت‌هایت را اینجا بنویس تا همیشه دم دستت باشند</span>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const topic = note.topicId ? topicById.get(note.topicId) : null;
            return (
              <div key={note.id} className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{note.text}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-slate-400">{formatJalaliShort(new Date(note.createdAt).toISOString().slice(0, 10))}</span>
                      {topic && (
                        <span className="text-[10px] text-teal-600 dark:text-teal-400 flex items-center gap-1">
                          📚 {topic.name}
                          {topic.tags?.map((tag) => {
                            const meta = TAG_META.find((t) => t.id === tag);
                            return meta ? (
                              <span key={tag} className={cn("px-1.5 py-0.5 rounded text-[9px]", meta.color)}>
                                {meta.icon} {meta.label}
                              </span>
                            ) : null;
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteNote(note.id)}
                    className="text-slate-300 hover:text-rose-500 text-sm p-1"
                    title="حذف"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onClose && (
        <Button variant="ghost" onClick={onClose} className="w-full">
          بستن
        </Button>
      )}
    </div>
  );
}
