// ===== کارت آمار تست‌زنی =====
import { useMemo, useState } from "react";
import { useStore } from "../store";
import { FREE_TEST_KEY, accuracyByGroup, recentTestCount, testTotals, weeklyAccuracy } from "../lib/testStats";
import { WEEKDAYS_SHORT_FA, formatJalaliShort, toFa, todayKey } from "../lib/jalali";
import { Button, Card, ProgressBar } from "./ui";
import { cn } from "../utils/cn";
import TestLogModal from "./TestLogModal";

export default function TestStatsCard() {
  const { state, deleteTestLog } = useStore();
  const today = todayKey();
  const [logOpen, setLogOpen] = useState(false);
  const logs = state.testLogs ?? [];

  const totals = useMemo(() => testTotals(logs), [logs]);
  const byGroup = useMemo(() => accuracyByGroup(logs), [logs]);
  const weeks = useMemo(() => weeklyAccuracy(logs, today, 8), [logs, today]);
  const last7 = useMemo(() => recentTestCount(logs, 7, today), [logs, today]);
  const recent = useMemo(() => logs.slice(0, 6), [logs]);

  const subjectName = (id: string) =>
    id === FREE_TEST_KEY ? "تست آزاد" : state.subjects.find((s) => s.id === id)?.name ?? "—";
  const subjectColor = (id: string) =>
    id === FREE_TEST_KEY ? "#94a3b8" : state.subjects.find((s) => s.id === id)?.color ?? "#14b8a6";
  const rows = [...byGroup.entries()].sort((a, b) => b[1].total - a[1].total);
  const maxWeekTotal = Math.max(1, ...weeks.map((w) => w.total));

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">🧪 تست‌زنی</div>
          <Button size="sm" variant="secondary" onClick={() => setLogOpen(true)}>+ ثبت تست</Button>
        </div>

        {totals.total === 0 ? (
          <p className="text-xs text-slate-400 leading-relaxed">
            هنوز تستی ثبت نشده. بعد از هر جلسه‌ی تست‌زنی، تعداد و درست‌ها را این‌جا بزن تا روند دقتت را ببینی — <button type="button" className="text-teal-600 dark:text-teal-400 font-medium" onClick={() => setLogOpen(true)}>ثبت اولین تست</button>
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 py-2.5">
                <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{toFa(totals.total)}</div>
                <div className="text-[10px] text-slate-400">کل تست‌ها</div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 py-2.5">
                <div className="text-lg font-extrabold text-teal-600 dark:text-teal-400">{totals.accuracy == null ? "—" : `${toFa(totals.accuracy)}٪`}</div>
                <div className="text-[10px] text-slate-400">دقت کل</div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 py-2.5">
                <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{toFa(last7)}</div>
                <div className="text-[10px] text-slate-400">۷ روز اخیر</div>
              </div>
            </div>

            {/* روند هفتگی دقت */}
            {weeks.some((w) => w.total > 0) && (
              <div className="mb-4">
                <div className="flex items-end gap-1.5 h-16" dir="ltr">
                  {weeks.map((w) => (
                    <div key={w.weekStart} className="flex-1 flex flex-col items-center justify-end h-full" title={`هفته‌ی ${formatJalaliShort(w.weekStart)} — ${toFa(w.total)} تست، دقت ${w.accuracy == null ? "—" : toFa(w.accuracy) + "٪"}`}>
                      {w.accuracy != null && <span className="text-[8px] text-slate-400">{toFa(w.accuracy)}٪</span>}
                      <div
                        className={cn("w-full rounded-t", w.total === 0 ? "bg-transparent" : (w.accuracy ?? 0) >= 60 ? "bg-emerald-400/80 dark:bg-emerald-600" : "bg-amber-400/80 dark:bg-amber-600")}
                        style={{ height: w.total === 0 ? 2 : Math.max(8, (w.total / maxWeekTotal) * 100) + "%" }}
                      />
                      <span className="text-[8px] text-slate-400 mt-0.5" dir="rtl">{WEEKDAYS_SHORT_FA[6]}{formatJalaliShort(w.weekStart).split(" ")[0] ?? ""}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[9px] text-slate-400 text-center mt-1">روند ۸ هفته — سبز: دقت بالای ۶۰٪</div>
              </div>
            )}

            {/* دقت هر درس */}
            <div className="flex flex-col gap-2.5 mb-4">
              {rows.slice(0, 5).map(([id, t]) => (
                <div key={id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">{subjectName(id)}</span>
                    <span className="text-slate-400">{toFa(t.correct)}/{toFa(t.total)} · {t.accuracy == null ? "—" : `${toFa(t.accuracy)}٪`}</span>
                  </div>
                  <ProgressBar value={t.accuracy ?? 0} color={subjectColor(id)} height="h-1.5" />
                </div>
              ))}
            </div>

            {/* ثبت‌های اخیر */}
            <div className="border-t border-slate-100 dark:border-slate-700/60 pt-2.5">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">آخرین ثبت‌ها</div>
              <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-700/50">
                {recent.map((l) => (
                  <div key={l.id} className="flex items-center justify-between py-1.5 text-xs group">
                    <span className="text-slate-500 dark:text-slate-400">{formatJalaliShort(l.date)}</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {l.topicId ? state.topics.find((t) => t.id === l.topicId)?.name ?? subjectName(l.subjectId ?? FREE_TEST_KEY) : subjectName(l.subjectId ?? FREE_TEST_KEY)}
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{toFa(l.correct)}/{toFa(l.total)}</span>
                    <button type="button" onClick={() => deleteTestLog(l.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" title="حذف">✕</button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      <TestLogModal open={logOpen} onClose={() => setLogOpen(false)} />
    </>
  );
}
