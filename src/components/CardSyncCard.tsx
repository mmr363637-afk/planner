// ===== 🔄 «کارت‌هایم را با مباحثِ اپ همگام کن» =====
//
// چرا این کارت لازم است؟ وقتی بعداً فلش‌کارت اضافه می‌کنی (بستهٔ کارت، پکِ منتخب،
// کارتِ ساخته‌شده در خواندنِ درسنامه، یا کارتِ قدیمیِ بی‌مبحث)، آن کارت‌ها ممکن است
// به هیچ مبحثی از خودِ اپ وصل نباشند: نه در فهرستِ مبحث دیده می‌شوند، نه در آمارِ
// مبحث می‌آیند و نه در تسلط/مرورِ برنامه حساب می‌شوند.
//
// این کارت اول *پیش‌نمایش* می‌دهد (چند کارت، از چه راهی: درسنامه/پک/نام)، بعد با یک
// تپ همه را وصل می‌کند. کارت‌هایی که با اطمینان پیدا نشوند دست‌نخورده می‌مانند —
// هیچ حدسی بی‌اجازه اعمال نمی‌شود.

import { useMemo, useState } from "react";
import { Button, Card, Chip } from "./ui";
import { useStore } from "../store";
import type { CardSyncPlan } from "../lib/cardSync";
import { cardSyncSummary, packTopicMap, planCardTopicSync } from "../lib/cardSync";
import { getCuratedPacks } from "../lib/curatedPacks";
import { toFa } from "../lib/jalali";

const VIA_LABEL: Record<string, string> = {
  lesson: "از درسنامه",
  pack: "از پکِ منتخب",
  name: "از نامِ مبحث",
};

export default function CardSyncCard() {
  const { state, applyCardSync } = useStore();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  // نقشه از روی خودِ state ساخته می‌شود (نه تابعِ store) تا با هر تغییرِ کارت‌ها تازه باشد
  const plan = useMemo<CardSyncPlan>(
    () =>
      planCardTopicSync({
        cards: state.flashcards,
        topics: state.topics,
        subjects: state.subjects,
        lessonLinks: state.lessonTopicLinks,
        packTopic: packTopicMap(getCuratedPacks(), state.topics),
      }),
    [state.flashcards, state.topics, state.subjects, state.lessonTopicLinks],
  );

  const attention = plan.suggestions.length > 0 || plan.unresolved.length > 0 || plan.duplicateSubjects.length > 0;
  const byVia = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of plan.suggestions) counts[s.via] = (counts[s.via] ?? 0) + 1;
    return counts;
  }, [plan.suggestions]);

  if (!attention && done == null) return null;

  return (
    <Card className="!p-3 border-amber-200/80 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-900/15">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-amber-900 dark:text-amber-200">🔄 کارت‌هایم با مباحثِ اپ همگام است؟</div>
          <p className="text-[10.5px] text-amber-800/90 dark:text-amber-200/80 leading-relaxed mt-0.5">{cardSyncSummary(plan)}</p>
        </div>
        <Button size="sm" variant={plan.suggestions.length > 0 ? "primary" : "secondary"} className="shrink-0" onClick={() => setOpen((v) => !v)}>
          {open ? "بستن" : plan.suggestions.length > 0 ? "همگام‌سازی" : "جزئیات"}
        </Button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {plan.suggestions.length === 0 && plan.unresolved.length === 0 && plan.duplicateSubjects.length === 0 && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">✅ همهٔ کارت‌ها به یک مبحثِ واقعی در برنامه وصل‌اند.</p>
          )}

          {plan.suggestions.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-white/70 dark:bg-slate-900/40 p-2 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{toFa(plan.suggestions.length)} کارت آمادهٔ اتصال:</span>
                {Object.entries(byVia).map(([via, n]) => (
                  <Chip key={via} className="!text-[9.5px]">
                    {VIA_LABEL[via] ?? via}: {toFa(n)}
                  </Chip>
                ))}
              </div>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {plan.suggestions.slice(0, 12).map((s) => (
                  <li key={s.cardId} className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    <span dir="auto">{s.preview || "—"}</span>
                    <span className="text-teal-600 dark:text-teal-400"> → {s.topicName}</span>
                  </li>
                ))}
                {plan.suggestions.length > 12 && <li className="text-[10px] text-slate-400">و {toFa(plan.suggestions.length - 12)} کارتِ دیگر…</li>}
              </ul>
              <Button
                size="sm"
                onClick={() => {
                  const res = applyCardSync(plan);
                  setDone(res.linked);
                  setOpen(false);
                }}
              >
                🔗 وصل‌کردنِ همه به مباحث
              </Button>
            </div>
          )}

          {plan.unresolved.length > 0 && (
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {toFa(plan.unresolved.length)} کارت هیچ سرنخِ مطمئنی برای مبحث ندارد. با بازکردنِ کارت، «مبحث» را از فهرست خودت انتخاب کن؛
              این کارت‌ها فعلاً فقط در «همهٔ کارت‌ها» دیده می‌شوند.
            </p>
          )}

          {plan.duplicateSubjects.length > 0 && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-900/15 p-2 space-y-1">
              <div className="text-[10.5px] font-bold text-rose-800 dark:text-rose-200">⚠️ درسِ تکراری (دو درسِ هم‌نام در فهرست)</div>
              {plan.duplicateSubjects.slice(0, 4).map((d) => (
                <p key={d.id} className="text-[10px] text-rose-700/90 dark:text-rose-200/80 leading-relaxed">
                  «{d.name}» کنارِ درسِ رسمی «{d.officialName}» هست — {toFa(d.cards)} کارت روی نسخهٔ غیرِ رسمی.
                  کارت‌ها را از بستهٔ رسمی/درسنامه وصل کن تا در برنامه بیایند.
                </p>
              ))}
            </div>
          )}
          {done != null && <p className="text-[10.5px] text-emerald-700 dark:text-emerald-300">✅ این بار {toFa(done)} کارت همگام شد.</p>}
        </div>
      )}
    </Card>
  );
}
