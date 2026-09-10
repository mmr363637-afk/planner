// ===== فلش‌کارت‌ها: مرور مبحث‌محور + جلسه‌ی SM-2 + پک‌های منتخب =====
import { useMemo, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, ConfirmDialog, EmptyState, Modal, PlusIcon, Segmented, Toggle, TrashIcon, inputClass } from "./ui";
import { classifyCards } from "../lib/sm2";
import { hasCloze, maskCloze, parseBulkCards, revealCloze } from "../lib/cloze";
import { formatJalaliShort, toFa, todayKey } from "../lib/jalali";
import { leafTopics } from "../lib/topics";
import { mulberry32 } from "../lib/random";
import { CURATED_PACKS, curatedCardKey, curatedPackById, curatedPacksOfTopic, type CuratedPack } from "../lib/curatedPacks";
import type { Flashcard, Topic } from "../types";
import { cn } from "../utils/cn";

/** بر زدن قطعی بر اساس یک عدد (برای «مرور ترکیبی» هر روز متفاوت) */
export function shuffleSeededId<T extends { id: string }>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed >>> 0);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** چهار دکمه‌ی ارزیابی → کیفیت SM-2 */
const GRADES: { q: 1 | 3 | 4 | 5; label: string; emoji: string; className: string }[] = [
  { q: 1, label: "بلد نبودم", emoji: "😵", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  { q: 3, label: "سخت", emoji: "😅", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { q: 4, label: "خوب", emoji: "🙂", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  { q: 5, label: "آسون", emoji: "😎", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
];

/** یک «مجموعه» (Deck) = یک مبحث؛ کارت‌های خودِ کاربر + پک(های) منتخب همان مبحث */
export interface Deck {
  /** کلید یکتا: t:<topicId> یا p:<packId> */
  key: string;
  topic?: Topic;
  /** پک‌های منتخبِ وصل به این مبحث (می‌تواند چند فصل باشد) */
  packs: CuratedPack[];
  title: string;
  subtitle?: string;
  color?: string;
  myCards: Flashcard[];
  dueCount: number;
  curatedTotal: number;
  curatedRemaining: number;
}

const deckCardKey = (packId: string, index: number) => `${packId}#${index}`;

/** ساخت مجموعه‌های مبحث‌محور از کارت‌های کاربر + پک‌های منتخب کاتالوگ */
export function buildDecks(flashcards: Flashcard[], topics: Topic[], today: string): Deck[] {
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const byTopic = new Map<string, Flashcard[]>();
  const byPack = new Map<string, Flashcard[]>();
  for (const c of flashcards) {
    if (c.topicId && topicById.has(c.topicId)) {
      const arr = byTopic.get(c.topicId) ?? [];
      arr.push(c);
      byTopic.set(c.topicId, arr);
    } else if (c.packId) {
      // کارت منتخبی که مبحثش در فهرست کاربر نیست — با کلید پک گروه می‌شود
      const arr = byPack.get(c.packId) ?? [];
      arr.push(c);
      byPack.set(c.packId, arr);
    }
    // کارت‌های بدون مبحث فقط در «همه‌ی کارت‌ها» و مرور کلی دیده می‌شوند
  }

  const decks: Deck[] = [];

  const makeDeck = (topic: Topic | undefined, packs: CuratedPack[]): Deck => {
    const myCards = topic
      ? [...(byTopic.get(topic.id) ?? []), ...packs.flatMap((p) => byPack.get(p.id) ?? [])]
      : packs.flatMap((p) => byPack.get(p.id) ?? []);
    const dueCount = myCards.filter((c) => c.dueDate <= today).length;
    const remaining = packs.reduce(
      (sum, p) => sum + p.cards.filter((pc) => !myCards.some((c) => curatedCardKey(p.id, pc.f) === curatedCardKey(p.id, c.front))).length,
      0,
    );
    return {
      key: topic ? `t:${topic.id}` : `p:${packs[0].id}`,
      topic,
      packs,
      title: topic?.name ?? packs[0].topicName,
      subtitle: topic?.name ? undefined : packs[0].subjectName,
      myCards,
      dueCount,
      curatedTotal: packs.reduce((s, p) => s + p.cards.length, 0),
      curatedRemaining: remaining,
    };
  };

  const seenTopics = new Set<string>();

  // ۱) مباحثی که کاربر برایشان کارت دارد (یا پک منتخب دارند)
  for (const t of topics) {
    const cards = byTopic.get(t.id);
    const packs = curatedPacksOfTopic(t.sampleId);
    if ((!cards || cards.length === 0) && packs.length === 0) continue;
    seenTopics.add(t.id);
    decks.push(makeDeck(t, packs));
  }

  // ۲) کارت‌های منتخبِ بدون مبحث در فهرست کاربر (با نامِ ذخیره‌شده در پک)
  for (const pack of CURATED_PACKS) {
    if (pack.topicSampleId && topics.some((t) => t.sampleId === pack.topicSampleId)) continue; // بالا اضافه شده
    if (packsHaveDeck(decks, pack)) continue;
    const orphan = byPack.get(pack.id);
    if (!orphan || orphan.length === 0) continue;
    decks.push(makeDeck(undefined, [pack]));
  }

  // ۳) پک‌های منتخبی که هنوز هیچ کارتی از آن‌ها اضافه نشده — بانک منتخب‌ها
  for (const pack of CURATED_PACKS) {
    if (pack.topicSampleId && topics.some((t) => t.sampleId === pack.topicSampleId)) continue;
    if (packsHaveDeck(decks, pack)) continue;
    const topic = pack.topicSampleId ? topics.find((t) => t.sampleId === pack.topicSampleId) : undefined;
    const sameGroup = topic ? seenTopics.has(topic.id) : byPack.has(pack.id);
    if (sameGroup) continue;
    // پک‌های هم‌مبحث را یکجا بگذار تا یک ردیف بانک داشته باشند
    const siblings = pack.topicSampleId ? curatedPacksOfTopic(pack.topicSampleId) : [pack];
    if (siblings[0].id !== pack.id) continue;
    decks.push(makeDeck(topic, siblings));
  }

  return decks;
}

/** آیا پک قبلاً در یکی از مجموعه‌ها نشسته؟ */
function packsHaveDeck(decks: Deck[], pack: CuratedPack): boolean {
  return decks.some((d) => d.packs.some((p) => p.id === pack.id));
}

export default function FlashcardsView() {
  const { state } = useStore();
  const today = todayKey();
  const [session, setSession] = useState<null | { mixed?: boolean; deckKey?: string; deckTitle?: string; all?: boolean }>(null);
  const [tab, setTab] = useState<"decks" | "all">("decks");
  const groups = classifyCards(state.flashcards, today);
  const dueCount = groups.overdue.length + groups.due.length;
  const needsCheckCount = state.flashcards.filter((c) => c.needsCheck).length;
  const decks = useMemo(() => buildDecks(state.flashcards, state.topics, today), [state.flashcards, state.topics, today]);

  if (session) {
    return <ReviewSession onExit={() => setSession(null)} mixed={session.mixed} deckKey={session.deckKey} deckTitle={session.deckTitle} all={session.all} />;
  }

  return (
    <div>
      {/* خلاصه */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card className="text-center py-3">
          <div className="text-lg font-extrabold text-rose-500">{toFa(dueCount)}</div>
          <div className="text-[10px] text-slate-400">آماده‌ی مرور</div>
        </Card>
        <Card className="text-center py-3">
          <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{toFa(state.flashcards.length)}</div>
          <div className="text-[10px] text-slate-400">کارت‌های من</div>
        </Card>
        <Card className="text-center py-3">
          <div className={cn("text-lg font-extrabold", needsCheckCount > 0 ? "text-amber-500" : "text-emerald-500")}>{toFa(needsCheckCount)}</div>
          <div className="text-[10px] text-slate-400">نیاز به بررسی</div>
        </Card>
      </div>

      {dueCount > 0 && (
        <div className="flex gap-2 mb-4">
          <Button size="lg" className="flex-1" onClick={() => setSession({ mixed: false })}>
            شروع مرور {toFa(dueCount)} کارت
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setSession({ mixed: true })} title="کارت‌ها از همه‌ی درس‌ها به‌هم‌ریخته — تکنیک Interleaving برای تثبیت بهتر">
            🎲 ترکیبی
          </Button>
        </div>
      )}

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "decks", label: "📚 مبحث‌محور" },
          { value: "all", label: "🗂 همه‌ی کارت‌ها" },
        ]}
      />

      {tab === "decks" ? (
        <DeckList decks={decks} onStartDeck={(deck, all) => setSession({ deckKey: deck.key, deckTitle: deck.title, all })} />
      ) : (
        <ManageCards />
      )}
    </div>
  );
}

// ================= فهرست مبحث‌محور =================

function DeckList({ decks, onStartDeck }: { decks: Deck[]; onStartDeck: (deck: Deck, all: boolean) => void }) {
  const { state } = useStore();
  const [detail, setDetail] = useState<Deck | null>(null);
  const [onlyCheckable, setOnlyCheckable] = useState(false);
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());
  const checkCount = state.flashcards.filter((c) => c.needsCheck).length;

  const filterActive = onlyCheckable && checkCount > 0;
  const relevant = filterActive ? decks.filter((d) => d.myCards.some((c) => c.needsCheck)) : decks;
  // مرتب‌سازی: سررسیددارها اول، بعد مجموعه‌های دارای کارت
  const sorted = [...relevant].sort(
    (a, b) => b.dueCount - a.dueCount || (b.myCards.length > 0 ? 1 : 0) - (a.myCards.length > 0 ? 1 : 0) || a.title.localeCompare(b.title, "fa"),
  );
  const active = sorted.filter((d) => d.myCards.length > 0);

  // بانک منتخب‌ها: پک‌هایی که هنوز هیچ کارتی از آن‌ها اضافه نشده — گروه‌بندی بر اساس درس
  const bank = sorted.filter((d) => d.myCards.length === 0 && d.packs.length > 0);
  const bankGroups = useMemo(() => {
    const map = new Map<string, { name: string; decks: Deck[] }>();
    for (const d of bank) {
      const key = d.packs[0].subjectKey;
      if (!map.has(key)) map.set(key, { name: d.packs[0].subjectName, decks: [] });
      map.get(key)!.decks.push(d);
    }
    return [...map.values()];
  }, [bank]);
  const showLibrary = !filterActive;
  const toggleSubject = (key: string) =>
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      {checkCount > 0 && (
        <Card className="mb-3 p-3 !bg-amber-50/70 dark:!bg-amber-900/20 !border-amber-200/70 dark:!border-amber-800/50">
          <div className="flex items-center gap-3">
            <span className="text-xl">🚩</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-amber-700 dark:text-amber-300">{toFa(checkCount)} کارت علامت «بررسی سوال» دارد</div>
              <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80">جوابِ این کارت‌ها ممکن است اشتباه باشد؛ از «همه‌ی کارت‌ها» ویرایششان کن</div>
            </div>
            <button type="button" onClick={() => setOnlyCheckable((v) => !v)} className={cn("text-xs px-2.5 py-1.5 rounded-lg shrink-0 font-medium transition-colors", filterActive ? "bg-amber-500 text-white" : "bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700")}>
              {filterActive ? "نمایش همه" : "فقط این‌ها"}
            </button>
          </div>
        </Card>
      )}

      {active.length === 0 ? (
        <EmptyState
          icon="📚"
          title={filterActive ? "کارت علامت‌خورده‌ای در این مباحث نیست" : "هنوز کارتی در مجموعه‌هات نداری"}
          description={
            filterActive
              ? "علامت «بررسی سوال» را از روی کارت‌ها بردار یا همه‌ی مجموعه‌ها را نشان بده."
              : "از «بانک منتخب‌ها» کارت‌های هر مبحث را انتخاب و اضافه کن، یا برای مبحث موردعلاقه‌ات کارت بساز."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {active.map((deck) => (
            <DeckCard key={deck.key} deck={deck} onStart={(all) => onStartDeck(deck, all)} onOpen={() => setDetail(deck)} />
          ))}
        </div>
      )}

      {showLibrary && bankGroups.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">⭐ بانک فلش‌کارت‌های منتخب</h2>
            <span className="text-[11px] text-slate-400">{toFa(bank.length)} مبحث</span>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">درس را باز کن، مبحث را انتخاب کن و از فهرست، هر کارتی را خواستی تیک بزن و اضافه کن — لازم نیست همه را برداری.</p>
          <div className="flex flex-col gap-2">
            {bankGroups.map((g) => {
              const open = openSubjects.has(g.name);
              return (
                <div key={g.name} className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 overflow-hidden">
                  <button type="button" onClick={() => toggleSubject(g.name)} className="w-full flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800/80 text-right">
                    <span className={cn("text-slate-400 text-xs transition-transform", open && "rotate-90")}>◀</span>
                    <span className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">⭐ {g.name}</span>
                    <span className="text-[11px] text-slate-400">{toFa(g.decks.length)} مبحث</span>
                  </button>
                  {open && (
                    <div className="p-2 pt-0 flex flex-col gap-2 bg-slate-50/60 dark:bg-slate-900/30">
                      {g.decks.map((deck) => (
                        <DeckCard key={deck.key} deck={deck} onStart={(all) => onStartDeck(deck, all)} onOpen={() => setDetail(deck)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {detail && <DeckDetail key={detail.key} deck={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DeckCard({ deck, onStart, onOpen }: { deck: Deck; onStart: (all: boolean) => void; onOpen: () => void }) {
  const { subjectOfTopic } = useLookups();
  const subject = deck.topic ? subjectOfTopic(deck.topic.id) : undefined;
  const color = subject?.color ?? (deck.packs.length > 0 ? "#64748b" : undefined);
  const mineCount = deck.myCards.length;

  return (
    <div data-deck={deck.key}>
      <Card className="p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0" onClick={onOpen} role="button">
          {deck.subtitle && <div className="text-[11px] text-slate-400">{deck.subtitle}</div>}
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{deck.title}</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Chip>🃏 کارت‌های من: {toFa(mineCount)}</Chip>
            {deck.curatedTotal > 0 && <Chip className="!bg-violet-100 !text-violet-700 dark:!bg-violet-900/40 dark:!text-violet-300">⭐ منتخب: {toFa(deck.curatedRemaining)} باقی‌مانده</Chip>}
            {deck.dueCount > 0 && <Chip className="!bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-300">🔴 {toFa(deck.dueCount)} سررسید</Chip>}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        {deck.dueCount > 0 ? (
          <Button size="sm" className="flex-1" onClick={() => onStart(false)}>
            مرور این مبحث ({toFa(deck.dueCount)})
          </Button>
        ) : mineCount > 0 ? (
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => onStart(true)} title="مرور همه‌ی کارت‌های این مبحث، حتی غیر سررسید">
            مرور همه‌ی {toFa(mineCount)} کارت
          </Button>
        ) : (
          <Button size="sm" variant="secondary" className="flex-1" onClick={onOpen}>
            افزودن از منتخب‌ها
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onOpen}>
          مدیریت
        </Button>
      </div>
      </Card>
    </div>
  );
}

// ================= جزئیات مجموعه (مبحث) =================

function DeckDetail({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const { state, addFlashcard, importCuratedCards, updateFlashcard, deleteFlashcard, toggleCardNeedsCheck, toast, importedCuratedKeys, existingCardFronts } = useStore();
  const { subjectOfTopic } = useLookups();
  /** تیک‌های بانک: کلید «packId#index» */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Flashcard | null>(null);
  const subject = deck.topic ? subjectOfTopic(deck.topic.id) : undefined;
  const packs = deck.packs;

  // همیشه از state زنده بخوان تا ساخت/حذف/import در همان لحظه دیده شود
  const today = todayKey();
  const myCards = useMemo(() => {
    if (deck.topic) return state.flashcards.filter((c) => c.topicId === deck.topic!.id || packs.some((p) => c.packId === p.id));
    return packs.length ? state.flashcards.filter((c) => packs.some((p) => c.packId === p.id)) : [];
  }, [state.flashcards, deck.topic, packs]);

  /** ایندکس‌های اضافه‌شده‌ی هر پک */
  const addedInPacks = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const p of packs) {
      const st = new Set<number>();
      p.cards.forEach((pc, i) => {
        if (importedCuratedKeys.has(curatedCardKey(p.id, pc.f)) || existingCardFronts.has(pc.f.trim().toLowerCase())) st.add(i);
      });
      map.set(p.id, st);
    }
    return map;
  }, [packs, importedCuratedKeys, existingCardFronts]);
  const remaining = packs.reduce((sum, p) => sum + (p.cards.length - (addedInPacks.get(p.id)?.size ?? 0)), 0);

  const toggleCheck = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const doImport = () => {
    const byPack = new Map<string, number[]>();
    for (const key of checked) {
      const [packId, idx] = [key.slice(0, key.lastIndexOf("#")), Number(key.slice(key.lastIndexOf("#") + 1))];
      const arr = byPack.get(packId) ?? [];
      arr.push(idx);
      byPack.set(packId, arr);
    }
    let n = 0;
    for (const [packId, indices] of byPack) n += importCuratedCards(packId, indices);
    if (n > 0) toast(`${toFa(n)} کارت منتخب به کارت‌های تو اضافه شد`, "⭐");
    else toast("کارت جدیدی اضافه نشد (تکراری)", "🃏");
    setChecked(new Set());
  };

  const checkedCount = checked.size;

  return (
    <Modal open onClose={onClose} title={`🃏 ${deck.title}`} footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
      {subject && (
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subject.color }} />
          <span className="text-xs text-slate-400">{subject.name}</span>
        </div>
      )}

      {/* کارت‌های خودِ کاربر (ساخته یا واردشده از پک) */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300">کارت‌های من ({toFa(myCards.length)})</h4>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <PlusIcon /> کارت جدید برای این مبحث
        </Button>
      </div>
      {myCards.length === 0 ? (
        <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-3 mb-4">
          هنوز کارتی برای این مبحث نداری{packs.length > 0 ? " — از فهرست منتخب‌های پایین انتخاب کن یا خودت بساز" : ""}
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {myCards.map((c) => {
            const due = c.dueDate <= today;
            return (
              <Card key={c.id} className="p-3" onClick={() => setEditing(c)}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{revealCloze(c.front)}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{revealCloze(c.back)}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {c.origin === "curated" && <Chip className="!bg-violet-100 !text-violet-700 dark:!bg-violet-900/40 dark:!text-violet-300">⭐ منتخب</Chip>}
                      {c.needsCheck && <Chip className="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300">🚩 بررسی سوال</Chip>}
                      <Chip className={cn(due && "!bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-300")}>{due ? "سررسید" : formatJalaliShort(c.dueDate)}</Chip>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCardNeedsCheck(c.id);
                    }}
                    title="جواب ممکن است اشتباه باشد — علامت بزن تا بعداً ویرایش کنی"
                    className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors", c.needsCheck ? "bg-amber-100 dark:bg-amber-900/40" : "text-slate-300 hover:text-amber-500")}
                  >
                    🚩
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(c);
                    }}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 flex items-center justify-center shrink-0"
                    title="حذف کارت"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* پک(های) منتخب این مبحث — افزودنِ انتخابی */}
      {packs.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-1 mt-2">
            <h4 className="text-xs font-bold text-violet-700 dark:text-violet-300">⭐ فلش‌کارت‌های منتخب سازنده ({toFa(remaining)} باقی‌مانده از {toFa(deck.curatedTotal)})</h4>
            {remaining > 0 && (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="text-[11px] text-teal-600 dark:text-teal-400 px-1.5 py-1"
                  onClick={() => {
                    const all = new Set<string>();
                    for (const p of packs) p.cards.forEach((_, i) => { if (!(addedInPacks.get(p.id)?.has(i) ?? false)) all.add(deckCardKey(p.id, i)); });
                    setChecked(all);
                  }}
                >
                  انتخاب همه
                </button>
                <button type="button" className="text-[11px] text-slate-400 px-1.5 py-1" onClick={() => setChecked(new Set())}>
                  پاک‌کردن
                </button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mb-2">فقط هر کارتی را که می‌خواهی تیک بزن و اضافه کن؛ لازم نیست همه را برداری.</p>
          {packs.map((pack, pi) => {
            const added = addedInPacks.get(pack.id) ?? new Set<number>();
            return (
              <div key={pack.id} className={cn(pi > 0 && "mt-3")}>
                {packs.length > 1 && (
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{added.size === pack.cards.length ? "✅" : "📌"} {pack.topicName}</div>
                )}
                <div className="flex flex-col gap-1.5">
                  {pack.cards.map((pc, i) => {
                    const isAdded = added.has(i);
                    const key = deckCardKey(pack.id, i);
                    const isChecked = checked.has(key);
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={isAdded}
                        onClick={() => toggleCheck(key)}
                        className={cn(
                          "text-right rounded-xl border p-2.5 transition-colors flex items-start gap-2.5",
                          isAdded
                            ? "border-emerald-200/70 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-900/15 opacity-80"
                            : isChecked
                              ? "border-teal-400 dark:border-teal-600 bg-teal-50/60 dark:bg-teal-900/20"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-teal-300",
                        )}
                      >
                        <span
                          className={cn(
                            "w-5 h-5 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center text-[11px] font-bold",
                            isAdded ? "border-emerald-500 bg-emerald-500 text-white" : isChecked ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300 dark:border-slate-600",
                          )}
                        >
                          {isAdded || isChecked ? "✓" : ""}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-800 dark:text-slate-100">{revealCloze(pc.f)}</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{revealCloze(pc.b)}</span>
                          {isAdded && <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">به کارت‌های تو اضافه شده</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {remaining > 0 && (
            <Button className="w-full mt-3" disabled={checkedCount === 0} onClick={doImport}>
              افزودن {checkedCount > 0 ? toFa(checkedCount) : ""} کارت انتخابی به کارت‌های من
            </Button>
          )}
        </>
      )}

      {(creating || editing) && (
        <CardEditor
          key={editing?.id ?? "new"}
          card={editing ?? undefined}
          lockedTopicId={deck.topic?.id}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(front, back, topicId) => {
            if (editing) {
              updateFlashcard(editing.id, { front, back, topicId: topicId || undefined });
              toast("کارت به‌روز شد", "🃏");
            } else {
              addFlashcard({ front, back, topicId: topicId || deck.topic?.id });
              toast("کارت ساخته شد (+ مرور از امروز)", "🃏");
            }
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف کارت"
        message={`کارت «${deleting?.front ?? ""}» حذف می‌شود.`}
        confirmLabel="حذف"
        danger
        onConfirm={() => {
          if (deleting) deleteFlashcard(deleting.id);
          setDeleting(null);
          toast("کارت حذف شد", "🗑");
        }}
      />
    </Modal>
  );
}

// ================= جلسه‌ی مرور =================

function ReviewSession({
  onExit,
  mixed,
  deckKey,
  deckTitle,
  all,
}: {
  onExit: () => void;
  mixed?: boolean;
  deckKey?: string;
  deckTitle?: string;
  all?: boolean;
}) {
  const { state, reviewFlashcard, toggleCardNeedsCheck, toast } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const today = todayKey();

  // صف مرور: عقب‌افتاده‌ها اول، بعد امروز؛ به ترتیب سررسید — یا ترکیبی (Interleaving)
  const queue = useMemo(() => {
    let base = state.flashcards;
    if (deckKey) {
      // مرور یک مبحث خاص: t:<topicId> یا p:<packId>
      if (deckKey.startsWith("t:")) {
        const topicId = deckKey.slice(2);
        const packIds = new Set(curatedPacksOfTopic(topicById.get(topicId)?.sampleId).map((p) => p.id));
        base = base.filter((c) => c.topicId === topicId || (c.packId != null && packIds.has(c.packId)));
      } else {
        const packId = deckKey.slice(2);
        const pack = curatedPackById(packId);
        const ids = new Set(pack ? [pack.id, ...(pack.topicSampleId ? curatedPacksOfTopic(pack.topicSampleId).map((p) => p.id) : [])] : [packId]);
        base = base.filter((c) => c.packId != null && ids.has(c.packId));
      }
      if (!all) {
        const g = classifyCards(base, today);
        base = [...g.overdue, ...g.due];
      }
    } else {
      const g = classifyCards(base, today);
      base = [...g.overdue, ...g.due];
    }
    if (!mixed) return base;
    // seed از تاریخ می‌آید تا صفِ «ترکیبیِ امروز» در بازگشت به جلسه یکسان بماند
    const seed = Number(today.replace(/-/g, ""));
    return shuffleSeededId(base, seed);
    // صف از لحظه‌ی شروع ثابت می‌ماند تا کارت‌های جدید وسط جلسه اضافه نشوند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ good: number; again: number }>({ good: 0, again: 0 });
  const [finished, setFinished] = useState(false);

  if (queue.length === 0 || finished) {
    return (
      <Card className="text-center py-8">
        <div className="text-4xl mb-2">🎉</div>
        <div className="font-bold text-slate-800 dark:text-slate-100">جلسه تمام شد</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
          {toFa(results.good + results.again)} کارت مرور شد · 😎 {toFa(results.good)} درست · 😵 {toFa(results.again)} برای تکرار
        </div>
        <Button onClick={onExit}>بازگشت</Button>
      </Card>
    );
  }

  const card = queue[index];
  const topic: Topic | undefined = card.topicId != null ? topicById.get(card.topicId) : undefined;
  const subject = topic ? subjectOfTopic(topic.id) : undefined;

  const grade = (q: 1 | 3 | 4 | 5) => {
    reviewFlashcard(card.id, q);
    setResults((r) => ({ good: r.good + (q >= 3 ? 1 : 0), again: r.again + (q < 3 ? 1 : 0) }));
    if (index + 1 >= queue.length) {
      toast(`${toFa(queue.length)} کارت مرور شد (+${toFa(queue.length * 2)} XP)`, "🃏");
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  };

  return (
    <div>
      {/* پیشرفت */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          کارت {toFa(index + 1)} از {toFa(queue.length)}
          {deckTitle && <span className="mr-1.5 px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300">📚 {deckTitle}</span>}
          {mixed && <span className="mr-1.5 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300">🎲 ترکیبی</span>}
        </span>
        <button type="button" onClick={onExit} className="text-xs text-slate-400">
          پایان جلسه
        </button>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full mb-5 overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      {/* کارت */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="w-full text-right rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 min-h-56 flex flex-col active:scale-[0.99] transition"
      >
        {(subject || topic || card.origin === "curated") && (
          <div className="flex items-center gap-2 mb-3">
            {subject && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: subject.color }} />}
            <span className="text-[11px] text-slate-400 truncate">{topic?.name ?? subject?.name}</span>
            {card.origin === "curated" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 shrink-0">⭐ منتخب</span>}
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
            {flipped ? revealCloze(card.front) : maskCloze(card.front)}
            {hasCloze(card.front) && !flipped && <span className="text-teal-600 dark:text-teal-400 text-[11px] font-normal"> (جاخالی)</span>}
          </div>
          {flipped ? (
            <>
              <hr className="my-4 border-slate-100 dark:border-slate-700" />
              <div className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">{revealCloze(card.back)}</div>
            </>
          ) : (
            <div className="text-[11px] text-slate-400 mt-4">برای دیدن پاسخ لمس کن 👆</div>
          )}
        </div>
        <div className="flex gap-1.5 mt-3">
          <Chip>فاصله: {toFa(card.intervalDays)} روز</Chip>
          <Chip>EF {toFa(card.ef.toFixed(2))}</Chip>
          {card.needsCheck && <Chip className="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300">🚩 بررسی سوال</Chip>}
        </div>
      </button>

      {/* ارزیابی */}
      {flipped ? (
        <>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {GRADES.map((g) => (
              <button
                key={g.q}
                type="button"
                onClick={() => grade(g.q)}
                className={cn("rounded-2xl py-3 font-bold text-sm active:scale-95 transition", g.className)}
              >
                {g.emoji} {g.label}
              </button>
            ))}
          </div>
          {/* گزینه‌ی «بررسی سوال»: جواب ممکن است اشتباه باشد؛ علامت بزن تا بعداً ویرایش شود */}
          <button
            type="button"
            onClick={() => {
              toggleCardNeedsCheck(card.id);
              toast(card.needsCheck ? "علامت بررسی برداشته شد" : "به فهرست «بررسی سوال» اضافه شد — از «همه‌ی کارت‌ها» ویرایشش کن", "🚩");
            }}
            className={cn(
              "w-full mt-2.5 py-2.5 rounded-xl text-xs font-medium border transition-colors",
              card.needsCheck
                ? "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:border-amber-300 hover:text-amber-600",
            )}
          >
            🚩 {card.needsCheck ? "علامت «بررسی سوال» فعال — برداشتن" : "بررسی سوال — ممکنه جواب اشتباه باشه"}
          </button>
        </>
      ) : (
        <Button size="lg" className="w-full mt-4" onClick={() => setFlipped(true)}>
          نمایش پاسخ
        </Button>
      )}
    </div>
  );
}

// ================= مدیریت کارت‌ها =================

function ManageCards() {
  const { state, addFlashcard, updateFlashcard, deleteFlashcard, toggleCardNeedsCheck, toast } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const [query, setQuery] = useState("");
  const [onlyNeedsCheck, setOnlyNeedsCheck] = useState(false);
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Flashcard | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const today = todayKey();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...state.flashcards].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (onlyNeedsCheck) list = list.filter((c) => c.needsCheck);
    if (!q) return list;
    return list.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || (c.topicId != null && topicById.get(c.topicId)?.name.includes(query)));
  }, [state.flashcards, query, onlyNeedsCheck, topicById]);

  const checkCount = state.flashcards.filter((c) => c.needsCheck).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">همه‌ی کارت‌ها</h2>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            📥 ورود گروهی
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            <PlusIcon /> کارت جدید
          </Button>
        </div>
      </div>
      {state.flashcards.length > 6 && (
        <input className={cn(inputClass, "mb-2 text-sm")} placeholder="جستجو در کارت‌ها…" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {checkCount > 0 && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] text-slate-400">فقط کارت‌های علامت‌خورده را ببین</span>
          <label className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400">
            🚩 فقط بررسی سوال
            <Toggle checked={onlyNeedsCheck} onChange={setOnlyNeedsCheck} label="فقط کارت‌های نیاز به بررسی" />
          </label>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {filtered.slice(0, 60).map((c) => {
          const topic = c.topicId != null ? topicById.get(c.topicId) : undefined;
          const subject = topic ? subjectOfTopic(topic.id) : undefined;
          const due = c.dueDate <= today;
          return (
            <Card key={c.id} className="p-3" onClick={() => setEditing(c)}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{revealCloze(c.front)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{revealCloze(c.back)}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(subject || topic) && <Chip color={subject?.color}>{topic?.name ?? subject?.name}</Chip>}
                    {c.origin === "curated" && <Chip className="!bg-violet-100 !text-violet-700 dark:!bg-violet-900/40 dark:!text-violet-300">⭐ منتخب</Chip>}
                    <Chip className={cn(due && "!bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-300")}>
                      {due ? "سررسید" : formatJalaliShort(c.dueDate)}
                    </Chip>
                    {c.needsCheck && <Chip className="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300">🚩 بررسی سوال</Chip>}
                    {c.lapses > 0 && <Chip>گزیده: {toFa(c.lapses)}</Chip>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCardNeedsCheck(c.id);
                  }}
                  title="جواب ممکن است اشتباه باشد — علامت بزن تا بعداً ویرایش کنی"
                  className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors", c.needsCheck ? "bg-amber-100 dark:bg-amber-900/40" : "text-slate-300 hover:text-amber-500")}
                >
                  🚩
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(c);
                  }}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 flex items-center justify-center shrink-0"
                  title="حذف کارت"
                >
                  <TrashIcon />
                </button>
              </div>
            </Card>
          );
        })}
        {filtered.length > 60 && <div className="text-xs text-slate-400 text-center py-2">و {toFa(filtered.length - 60)} کارت دیگر…</div>}
        {filtered.length === 0 && <div className="text-xs text-slate-400 text-center py-4">{onlyNeedsCheck ? "کارت علامت‌خورده‌ای نیست 🎉" : "کارتی یافت نشد"}</div>}
      </div>

      {(creating || editing) && (
        <CardEditor
          key={editing?.id ?? "new"}
          card={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={(front, back, topicId) => {
            if (editing) {
              updateFlashcard(editing.id, { front, back, topicId: topicId || undefined });
              toast("کارت به‌روز شد", "🃏");
            } else {
              addFlashcard({ front, back, topicId: topicId || undefined });
              toast("کارت ساخته شد (+ مرور از امروز)", "🃏");
            }
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="حذف کارت"
        message={`کارت «${deleting?.front ?? ""}» حذف می‌شود.`}
        confirmLabel="حذف"
        danger
        onConfirm={() => {
          if (deleting) deleteFlashcard(deleting.id);
          setDeleting(null);
          toast("کارت حذف شد", "🗑");
        }}
      />

      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onImport={(rows) => {
          for (const row of rows) addFlashcard({ front: row.front, back: row.back });
          setBulkOpen(false);
          toast(`${toFa(rows.length)} کارت اضافه شد — مرور از امروز شروع می‌شود`, "🃏");
        }}
      />
    </div>
  );
}

/** ورود گروهی کارت: هر سطر «رو؛پشت» (با ؛ یا تب یا | یا ویرگول) */
function BulkImportModal({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (rows: { front: string; back: string }[]) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseBulkCards(text), [text]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📥 ورود گروهی کارت"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button disabled={parsed.cards.length === 0} onClick={() => onImport(parsed.cards)}>
            افزودن {parsed.cards.length > 0 ? toFa(parsed.cards.length) : ""} کارت
          </Button>
        </>
      }
    >
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
        هر سطر یک کارت: <b>روی کارت</b> سپس <b>پشت کارت</b>، با <b>؛</b> یا تب یا <b>|</b> جدا شود. جاخالی هم می‌توانی بنویسی: کلمه‌ی
        پنهان را در <code dir="ltr">{"{{...}}"}</code> بگذار.
      </p>
      <textarea
        dir="auto"
        autoFocus
        className={cn(inputClass, "min-h-40 font-mono text-[12px] leading-relaxed")}
        placeholder={"مکانیسم اثر فوروزماید؛مهار {{پمپ Na/K}} در لوله‌ی پروگزیمال\nپادتن عامل دفتر؛IgG\nانزیم محدودکننده‌ی سنتز کلسترول|HMG-CoA reductase"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="متن کارت‌ها برای ورود گروهی"
      />
      {text.trim() !== "" && (
        <div className="text-[11px] mt-2 text-slate-500 dark:text-slate-400">
          {parsed.cards.length > 0 ? <>✅ {toFa(parsed.cards.length)} کارت آماده است</> : "هنوز کارتِ معتبری پیدا نشد"}
          {parsed.skipped > 0 && <> · ⏭ {toFa(parsed.skipped)} سطر ناقص رد شد</>}
        </div>
      )}
    </Modal>
  );
}

function CardEditor({
  card,
  lockedTopicId,
  onClose,
  onSave,
}: {
  card?: Flashcard;
  /** وقتی از داخل یک مبحث باز شده، مبحث ثابت است */
  lockedTopicId?: string;
  onClose: () => void;
  onSave: (front: string, back: string, topicId: string | undefined) => void;
}) {
  const { state } = useStore();
  const { subjectOfTopic } = useLookups();
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [topicId, setTopicId] = useState<string | "">(card?.topicId ?? lockedTopicId ?? "");
  const valid = front.trim().length > 0 && back.trim().length > 0;
  const topics = useMemo(() => leafTopics(state.topics), [state.topics]);

  return (
    <Modal
      open
      onClose={onClose}
      title={card ? "ویرایش کارت" : "کارت جدید"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            disabled={!valid}
            onClick={() => onSave(front.trim(), back.trim(), topicId || undefined)}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">روی کارت (سوال) *</span>
          <textarea autoFocus className={cn(inputClass, "min-h-[64px] resize-y")} value={front} onChange={(e) => setFront(e.target.value)} placeholder="مثلاً: مکانیسم اثر فوروزماید؟" />
          <span className="block text-[10px] text-slate-400 mt-1 leading-relaxed">
            برای کارتِ جاخالی، کلمه‌ی پنهان را در <code dir="ltr">{"{{...}}"}</code> بگذار — مثلاً: «داروی {"{{فوروزماید}}"} مدر چشمه‌ای است»
          </span>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">پشت کارت (پاسخ) *</span>
          <textarea className={cn(inputClass, "min-h-[64px] resize-y")} value={back} onChange={(e) => setBack(e.target.value)} placeholder="پاسخ کوتاه و دقیق بهتر یاد می‌ماند" />
        </label>
        {!lockedTopicId ? (
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">مبحث مرتبط (اختیاری)</span>
            <select className={inputClass} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">— بدون مبحث —</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {subjectOfTopic(t.id)?.name ? `${subjectOfTopic(t.id)!.name} › ` : ""}
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="text-[11px] text-teal-600 dark:text-teal-400 bg-teal-50/60 dark:bg-teal-900/20 rounded-xl px-3 py-2">
            📚 این کارت به مبحث فعلی وصل می‌شود
          </div>
        )}
      </div>
    </Modal>
  );
}
