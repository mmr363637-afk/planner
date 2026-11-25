// ===== 🔗 «این درسنامه به کدام مبحثِ برنامه وصل است؟» =====
//
// چرا این پنل لازم است؟ دقیقه‌های مطالعهٔ یک درسنامه فقط وقتی به تسک‌های برنامه
// واریز می‌شوند که بدانیم به کدام «مبحث» مربوط است. تطبیقِ خودکار (lib/lessonTopic)
// فقط مواردِ مطمئن را وصل می‌کند؛ باقیِ موارد (عنوان‌های چندبخشی، درسنامه‌هایی که
// مبحثِ هم‌نام ندارند) با یک انتخابِ سادهٔ کاربر حل می‌شوند — یک‌بار برای همیشه،
// چون اتصال در state ذخیره می‌شود و با هر بار خواندن دوباره لازم نیست.
//
// کامپوننت عمداً «احساسِ فرم» ندارد: وضعیتِ فعلی را صادقانه می‌گوید (وصل/خودکار/بدون)
// و جست‌وجوی ساده‌ای روی نامِ مبحث و درس دارد تا روی گوشی هم یک‌لمسی باشد.

import { useMemo, useState } from "react";
import { Button, inputClass } from "./ui";
import { useStore } from "../store";
import { useLookups } from "../store";
import { autoTopicCandidate, pendingTopicIdsOf, rankTopicsForLesson, type TopicCandidate } from "../lib/lessonTopic";
import { normalizeFa } from "../lib/textSearch";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";

export interface LessonTopicLinkProps {
  /** کلیدِ پایدارِ درسنامه/اسکچ‌نوت/آزمایشگاه (`LessonMeta.id` یا `sketch:*`/`lab:*`) */
  trackId: string;
  /** عنوانِ محتوا — برای پیشنهادِ مبحثِ هم‌نام */
  title?: string;
  /** کلیدهای درسِ اپ که این محتوا به آن‌ها وصل است (`Subject.sampleId`) */
  appSubjectKeys?: string[];
  /** در حالت فشرده فقط وضعیت و دکمهٔ تغییر نشان داده می‌شود */
  compact?: boolean;
  /** حداکثرِ واژهٔ توضیحِ وضعیت؛ در هدرِ درسنامه کوتاه‌تر بهتر است */
  dense?: boolean;
}

export default function LessonTopicLinkPanel({ trackId, title, appSubjectKeys, compact, dense }: LessonTopicLinkProps) {
  const { state, linkLessonTopic } = useStore();
  const { topicById, subjectOfTopic } = useLookups();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const linkedId = state.lessonTopicLinks?.[trackId] ?? null;
  const linkedTopic = linkedId ? topicById.get(linkedId) : undefined;
  const linkedSubject = linkedTopic ? subjectOfTopic(linkedTopic.id) : undefined;

  const pending = useMemo(() => pendingTopicIdsOf(state.tasks), [state.tasks]);
  const ranked = useMemo(
    () =>
      rankTopicsForLesson({
        title,
        appSubjectKeys,
        subjects: state.subjects,
        topics: state.topics,
        pendingTopicIds: pending,
      }),
    [title, appSubjectKeys, state.subjects, state.topics, pending],
  );
  // همان تابعی که store برای واریزِ زمان استفاده می‌کند — تا برچسبِ «خودکار» دروغ نگوید
  const auto = linkedId ? null : autoTopicCandidate(ranked);

  const searchResults = useMemo(() => {
    const q = normalizeFa(query.trim());
    if (!q) return [];
    const scored = state.topics
      .map((topic) => {
        const name = normalizeFa(topic.name);
        const subject = state.subjects.find((s) => s.id === topic.subjectId);
        const subjectName = normalizeFa(subject?.name ?? "");
        const inName = name.includes(q) ? 2 : 0;
        const inSubject = subjectName.includes(q) ? 1 : 0;
        const hasTask = pending.has(topic.id) ? 0.5 : 0;
        return { topic, score: inName + inSubject + hasTask, subjectName: subject?.name ?? "" };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.topic.name.localeCompare(b.topic.name, "fa"))
      .slice(0, 8);
    return scored;
  }, [query, state.topics, state.subjects, pending]);

  const status = linkedTopic ? (
    <span className="text-teal-700 dark:text-teal-300">
      🔗 وصل به «{linkedTopic.name}»{linkedSubject ? ` · ${linkedSubject.name}` : ""}
    </span>
  ) : auto ? (
    <span className="text-indigo-700 dark:text-indigo-300">
      ✨ خودکار: «{auto.name}»{auto.subjectName ? ` · ${auto.subjectName}` : ""}
    </span>
  ) : (
    <span className="text-amber-700 dark:text-amber-300">⚠️ به هیچ مبحثی وصل نیست — زمان فقط در آمارِ روز می‌ماند</span>
  );

  const suggestionList = !query.trim() ? ranked.slice(0, 6) : [];

  return (
    <div className={cn("rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40", compact ? "px-2 py-1.5" : "px-2.5 py-2")}>
      <div className="flex items-center justify-between gap-2">
        <div className={cn("min-w-0 leading-relaxed", dense ? "text-[9.5px]" : "text-[10.5px]")}>{status}</div>
        <Button size="sm" variant="ghost" className="shrink-0 !text-[10px]" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "بستن" : linkedTopic || auto ? "تغییرِ مبحث" : "وصل کن"}
        </Button>
      </div>

      {!compact && !open && (
        <p className="mt-0.5 text-[9px] text-slate-400 leading-relaxed">
          دقیقه‌های این محتوا به تسک‌های همین مبحث در برنامه واریز می‌شوند؛ اتصال یک‌بار ذخیره می‌شود.
        </p>
      )}

      {open && (
        <div className="mt-2 space-y-1.5">
          <input
            className={cn(inputClass, "!text-[11px] py-1.5")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 نامِ مبحث یا درس را بنویس…"
            aria-label="جست‌وجوی مبحث برای اتصال"
            type="search"
          />

          {suggestionList.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] text-slate-400">پیشنهاد بر اساسِ عنوانِ همین محتوا</div>
              {suggestionList.map((c) => (
                <TopicOption key={`s-${c.topicId}`} candidate={c} active={c.topicId === (linkedId ?? auto?.topicId)} onPick={() => { linkLessonTopic(trackId, c.topicId); setOpen(false); setQuery(""); }} />
              ))}
            </div>
          )}

          {query.trim() && (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {searchResults.length === 0 && <p className="text-[10px] text-slate-400 py-1">مبحثی با این نام پیدا نشد.</p>}
              {searchResults.map(({ topic, subjectName }) => (
                <button
                  key={`q-${topic.id}`}
                  type="button"
                  onClick={() => {
                    linkLessonTopic(trackId, topic.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "w-full text-right rounded-lg border px-2 py-1.5 transition-colors",
                    topic.id === linkedId
                      ? "border-teal-400 bg-teal-50 dark:bg-teal-900/25"
                      : "border-slate-200 dark:border-slate-700 hover:border-teal-300",
                  )}
                >
                  <span className="block text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                    {pending.has(topic.id) ? "🎯 " : ""}
                    {topic.name}
                  </span>
                  <span className="block text-[9px] text-slate-400 truncate">
                    {subjectName}
                    {pending.has(topic.id) ? " · تسکِ در انتظار در برنامه" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[9px] text-slate-400">
              {toFa(state.topics.length)} مبحث در {toFa(state.subjects.length)} درس
            </span>
            {linkedId && (
              <Button size="sm" variant="ghost" className="!text-[10px]" onClick={() => { linkLessonTopic(trackId, null); setOpen(false); }}>
                🔓 برداشتنِ اتصال
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TopicOption({ candidate, active, onPick }: { candidate: TopicCandidate; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "w-full text-right rounded-lg border px-2 py-1.5 transition-colors",
        active ? "border-teal-400 bg-teal-50 dark:bg-teal-900/25" : "border-slate-200 dark:border-slate-700 hover:border-teal-300",
      )}
    >
      <span className="block text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
        {candidate.hasPendingTask ? "🎯 " : ""}
        {candidate.name}
      </span>
      <span className="block text-[9px] text-slate-400 truncate">
        {candidate.subjectName}
        {" · "}
        {toFa(Math.round(candidate.score * 100))}٪ نزدیک
        {candidate.hasPendingTask ? " · تسکِ در انتظار" : ""}
      </span>
    </button>
  );
}
