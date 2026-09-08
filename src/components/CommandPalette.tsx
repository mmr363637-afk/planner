// ===== Command Palette — جستجوی سراسری (Ctrl+K) =====
// مثل Spotlight: هر چیزِ اپ (اقدام‌ها، درس‌ها، مباحث، کارت‌ها، امتحان‌ها) با یک
// جعبه‌ی جستجو پیدا می‌شود. کاملاً روی دستگاه و بدون سرور — با همان موتور فازی lib/search.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLookups, useStore } from "../store";
import { useNav, type PlanSubTab, type Tab } from "../nav";
import { useAmbient } from "../ambient";
import { searchItems, type SearchItem } from "../lib/search";
import { leafTopics } from "../lib/topics";
import { todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";

const OPEN_EVENT = "sp:open-command-palette";

/** دکمه/میانبرِ هرجایی می‌تواند با این رویداد پالت را باز کند */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface PaletteItem extends SearchItem {
  group: "اقدام" | "درس" | "مبحث" | "کارت" | "امتحان";
  run: () => void;
}

export function CommandPalette() {
  const { state } = useStore();
  const { subjectById } = useLookups();
  const { go } = useNav();
  const { openMixer } = useAmbient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // باز شدن با Ctrl/Cmd+K و رویدادِ داخلیِ دکمه‌ی جستجو
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setQuery("");
      setActive(0);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setActive(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const goTab = (tab: Tab, planSub?: PlanSubTab) => () => {
      go(tab, planSub ? { planSub } : undefined);
      setOpen(false);
    };
    const actions: PaletteItem[] = [
      { id: "act-home", group: "اقدام", title: "خانه", icon: "🏠", hint: "خانه", keywords: ["home", "شروع"], run: goTab("home") },
      { id: "act-study", group: "اقدام", title: "شروع مطالعه (تایمر)", icon: "▶️", hint: "مطالعه", keywords: ["study", "تایمر", "پومودورو", "مطالعه"], run: goTab("study") },
      { id: "act-calendar", group: "اقدام", title: "تقویم برنامه", icon: "🗓️", hint: "برنامه", keywords: ["calendar", "تقویم"], run: goTab("plan", "calendar") },
      { id: "act-plans", group: "اقدام", title: "برنامه‌ها و ساخت برنامه", icon: "🧭", hint: "برنامه", keywords: ["plan", "ویزارد"], run: goTab("plan", "plans") },
      { id: "act-subjects", group: "اقدام", title: "دروس و مباحث", icon: "📚", hint: "برنامه", keywords: ["subjects", "درس", "مبحث"], run: goTab("plan", "subjects") },
      { id: "act-reviews", group: "اقدام", title: "مرورهای امروز", icon: "🔁", hint: "مرور", keywords: ["reviews", "مرور"], run: goTab("reviews") },
      { id: "act-stats", group: "اقدام", title: "آمار و دستاوردها", icon: "📊", hint: "آمار", keywords: ["stats", "آمار", "باغ"], run: goTab("stats") },
      { id: "act-exams", group: "اقدام", title: "امتحانات", icon: "📝", hint: "امتحان", keywords: ["exams", "امتحان", "تایمر امتحان"], run: goTab("exams") },
      {
        id: "act-mixer",
        group: "اقدام",
        title: "میکسر صداهای تمرکز",
        icon: "🎧",
        hint: "صدا",
        keywords: ["sound", "noise", "نویز", "صدا", "باران", "موسیقی"],
        run: () => {
          openMixer();
          setOpen(false);
        },
      },
      { id: "act-settings", group: "اقدام", title: "تنظیمات", icon: "⚙️", hint: "تنظیمات", keywords: ["settings", "تنظیمات", "تم"], run: goTab("settings") },
    ];
    const today = todayKey();
    const subjects: PaletteItem[] = state.subjects.map((s) => ({
      id: `sub-${s.id}`,
      group: "درس",
      title: s.name,
      subtitle: "درس",
      icon: "◼️",
      keywords: [s.name, "درس"],
      run: goTab("plan", "subjects"),
    }));
    const topics: PaletteItem[] = leafTopics(state.topics).map((t) => ({
      id: `top-${t.id}`,
      group: "مبحث",
      title: t.name,
      subtitle: subjectById.get(t.subjectId)?.name ?? "مبحث",
      icon: "📄",
      keywords: [t.name, subjectById.get(t.subjectId)?.name ?? ""],
      run: goTab("plan", "subjects"),
    }));
    const cards: PaletteItem[] = state.flashcards.slice(0, 400).map((c) => ({
      id: `card-${c.id}`,
      group: "کارت",
      title: c.front,
      subtitle: "فلش‌کارت",
      icon: "🃏",
      keywords: [c.front, c.back],
      run: goTab("reviews"),
    }));
    const exams: PaletteItem[] = state.exams.map((e) => ({
      id: `exam-${e.id}`,
      group: "امتحان",
      title: e.title,
      subtitle: e.date >= today ? "امتحانِ پیش‌رو" : "امتحانِ گذشته",
      icon: "📝",
      keywords: [e.title, e.subject ?? ""],
      run: goTab("exams"),
    }));
    return [...actions, ...subjects, ...topics, ...cards, ...exams];
    // پالت هنگام بسته‌بودن ساخته نمی‌شود تا هزینه‌ی جستجو فقط هنگام نیاز باشد
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ? state : null, subjectById, go, openMixer]);

  const results = useMemo(() => searchItems(items, query, 14), [items, query]);
  const shownActive = Math.min(active, Math.max(0, results.length - 1));

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    item.run();
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(results[shownActive]);
    }
  };

  // نگه‌داشتن عنصر فعال در دید
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${shownActive}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [shownActive]);

  if (!open) return null;

  const GROUP_ORDER: PaletteItem["group"][] = ["اقدام", "درس", "مبحث", "کارت", "امتحان"];
  const grouped = new Map<PaletteItem["group"], { item: PaletteItem; idx: number }[]>();
  results.forEach((item, idx) => {
    const arr = grouped.get(item.group) ?? [];
    arr.push({ item, idx });
    grouped.set(item.group, arr);
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" dir="rtl" role="dialog" aria-modal="true" aria-label="جستجوی سراسری">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade" onClick={() => setOpen(false)} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <SearchGlyph />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="جستجو در همه‌جا… (مبحث، درس، کارت، امتحان، اقدام)"
            aria-label="جستجو"
            className="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
          />
          <kbd className="text-[10px] text-slate-400 border border-slate-200 dark:border-slate-600 rounded-lg px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-8">چیزی پیدا نشد — عبارت دیگری امتحان کن 🔍</div>
          ) : (
            GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => (
              <div key={g} className="mb-1">
                <div className="px-4 pt-1.5 pb-1 text-[10px] font-bold text-slate-400">{g}</div>
                {grouped.get(g)!.map(({ item, idx }) => (
                  <button
                    key={item.id}
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => runItem(item)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-right transition-colors",
                      idx === shownActive ? "bg-teal-50 dark:bg-teal-900/30" : "bg-transparent",
                    )}
                  >
                    <span className="text-base w-6 text-center shrink-0" aria-hidden="true">{item.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">{item.title}</span>
                      {item.subtitle && <span className="block text-[10px] text-slate-400 truncate">{item.subtitle}</span>}
                    </span>
                    {item.hint && <span className="text-[9px] text-slate-300 dark:text-slate-500 shrink-0">{item.hint}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400">
          <span>↑↓ حرکت · Enter انتخاب</span>
          <span>
            باز کردن: <kbd className="border border-slate-200 dark:border-slate-600 rounded px-1">Ctrl</kbd>+<kbd className="border border-slate-200 dark:border-slate-600 rounded px-1">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

/** دکمه‌ی جستجو برای نوار بالای اپ */
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      title="جستجو (Ctrl+K)"
      aria-label="جستجوی سراسری"
      className="w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
    >
      <SearchGlyph />
    </button>
  );
}

function SearchGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
