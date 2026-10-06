// ===== «روز من» — تایم‌لاینِ زیبای یک روز + نمای هفته + خروجی =====
// از صبح اول وقت تا آخر شب: کلاس‌های ثابت، امتحان‌ها، مطالعهٔ ثبت‌شده، مباحثی که
// پیشنهاد می‌شود کِی خوانده شوند، پنجره‌های خالی و خطِ «الان». خروجی: تصویر، متن و PDF.

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Modal, Segmented, SectionTitle } from "../components/ui";
import { useNav } from "../nav";
import { useStore } from "../store";
import { buildDaySheet, buildWeekSheet, clockToMin, minToClock, sheetText, type DaySheet, type SheetItem } from "../lib/daySheet";
import { daySheetCardName, renderDaySheetCard } from "../lib/daySheetCard";
import { shareOrDownloadCard } from "../lib/shareCard";
import { goldenHours } from "../lib/goldenHours";
import { iranianHolidayLabel } from "../lib/iranianHolidays";
import { WEEKDAYS_FA, WEEKDAYS_SHORT_FA, WEEK_ORDER, addDays, formatJalaliLong, formatMinutes, keyToJalali, relativeDayLabel, todayKey, weekdayOf, weekDates } from "../lib/jalali";
import { cn } from "../utils/cn";

const KIND_META: Record<SheetItem["kind"], { label: string; icon: string; ring: string }> = {
  class: { label: "کلاس", icon: "🏫", ring: "ring-sky-300/50 dark:ring-sky-400/30" },
  exam: { label: "امتحان", icon: "🎓", ring: "ring-rose-300/60 dark:ring-rose-400/30" },
  recorded: { label: "ثبت‌شده", icon: "✅", ring: "ring-emerald-300/60 dark:ring-emerald-400/30" },
  suggested: { label: "پیشنهادی", icon: "🎯", ring: "ring-amber-300/60 dark:ring-amber-400/30" },
};

/** ارتفاع هر دقیقه روی محور روز (پیکسل) — تعادل بین خوانایی و اسکرول */
const PX_PER_MIN = 1.15;
const WEEK_PX_PER_MIN = 0.5;

export default function DaySheetPage() {
  const { state, toast } = useStore();
  const { go } = useNav();
  const today = todayKey();

  const [date, setDate] = useState(today);
  const [view, setView] = useState<"day" | "week">("day");
  const [tick, setTick] = useState(() => Date.now());
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // خطِ «الان» هر دقیقه تازه می‌شود
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const dayStartMin = clockToMin(state.settings.dayStart) ?? 7 * 60;
  const dayEndMin = clockToMin(state.settings.dayEnd) ?? 23 * 60;

  // ساعت طلاییِ شخصی (بر پایهٔ جلسات ۹۰ روز گذشته) + تعطیلات ایرانی
  const goldenWindow = useMemo(() => goldenHours(state.sessions).bestWindow, [state.sessions]);

  const nowMin = date === today ? new Date(tick).getHours() * 60 + new Date(tick).getMinutes() : null;

  const sheet = useMemo(
    () =>
      buildDaySheet({
        date,
        weekday: weekdayOf(date),
        dayStartMin,
        dayEndMin,
        classBlocks: state.classBlocks ?? [],
        tasks: state.tasks,
        sessions: state.sessions,
        topics: state.topics,
        subjects: state.subjects,
        exams: state.exams,
        reviews: state.reviews,
        holiday: iranianHolidayLabel(date),
        nowMin,
        goldenWindow,
      }),
    [date, dayStartMin, dayEndMin, state.classBlocks, state.tasks, state.sessions, state.topics, state.subjects, state.exams, state.reviews, nowMin, goldenWindow],
  );

  const dates = useMemo(() => weekDates(date), [date]);
  const week = useMemo(
    () =>
      buildWeekSheet({
        dates,
        weekdayOf,
        holidayOf: iranianHolidayLabel,
        dayStartMin,
        dayEndMin,
        classBlocks: state.classBlocks ?? [],
        tasks: state.tasks,
        sessions: state.sessions,
        topics: state.topics,
        subjects: state.subjects,
        exams: state.exams,
        reviews: state.reviews,
        nowDate: today,
        nowMin: new Date(tick).getHours() * 60 + new Date(tick).getMinutes(),
        goldenWindow,
      }),
    [dates, dayStartMin, dayEndMin, state.classBlocks, state.tasks, state.sessions, state.topics, state.subjects, state.exams, state.reviews, today, tick, goldenWindow],
  );

  const weekTotals = useMemo(
    () =>
      week.reduce(
        (acc, d) => ({
          classMinutes: acc.classMinutes + d.totals.classMinutes,
          recordedMinutes: acc.recordedMinutes + d.totals.recordedMinutes,
          suggestedMinutes: acc.suggestedMinutes + d.totals.suggestedMinutes,
          freeMinutes: acc.freeMinutes + d.totals.freeMinutes,
          reviewsDue: acc.reviewsDue + d.totals.reviewsDue,
        }),
        { classMinutes: 0, recordedMinutes: 0, suggestedMinutes: 0, freeMinutes: 0, reviewsDue: 0 },
      ),
    [week],
  );

  const titles = useMemo(() => Object.fromEntries(week.map((d) => [d.date, `${WEEKDAYS_FA[d.weekday]} ${formatJalaliLong(d.date, false)}`])), [week]);

  const makeCanvas = () => renderDaySheetCard(sheet, formatJalaliLong(date), { accent: sheet.bySubject[0]?.color ?? "#14b8a6" });

  async function exportImage() {
    setBusy(true);
    try {
      const canvas = makeCanvas();
      if (!canvas) {
        toast("ساخت تصویر در این مرورگر ممکن نشد", "⚠️");
        return;
      }
      setPreview({ url: canvas.toDataURL("image/png"), name: daySheetCardName(date) });
    } finally {
      setBusy(false);
    }
  }

  async function shareImage() {
    const canvas = makeCanvas();
    if (!canvas) {
      toast("ساخت تصویر در این مرورگر ممکن نشد", "⚠️");
      return;
    }
    const name = daySheetCardName(date);
    const result = await shareOrDownloadCard(canvas, name, sheetText(sheet, formatJalaliLong(date)));
    if (result === "shared") toast("تصویر روز فرستاده شد", "🖼️");
    else if (result === "downloaded") toast("تصویر روز ذخیره شد", "🖼️");
    else toast("اشتراک‌گذاری ممکن نشد؛ از «تصویر PNG» استفاده کن", "⚠️");
  }

  async function copyText() {
    const text = sheetText(sheet, formatJalaliLong(date));
    try {
      await navigator.clipboard.writeText(text);
      toast("متن برنامه کپی شد", "📋");
    } catch {
      toast("کپی خودکار ممکن نشد", "⚠️");
    }
  }

  const isToday = date === today;
  // «انجام‌شده از کلِ کار امروز» = ثبت‌شده ÷ (ثبت‌شده + آنچه مانده)
  const progressTotal = sheet.totals.recordedMinutes + sheet.totals.plannedMinutes;
  const progress = progressTotal > 0 ? Math.min(1, sheet.totals.recordedMinutes / progressTotal) : 0;

  return (
    <div className="pb-6 day-sheet-root">
      {/* ── سربرگ گرادیانی */}
      <Card className="!p-0 overflow-hidden mb-4 border-0 bg-gradient-to-br from-teal-600 via-cyan-700 to-violet-700 text-white no-print">
        <div className="relative p-5">
          <div className="absolute -top-16 -left-10 w-52 h-52 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-6 w-56 h-56 rounded-full bg-amber-300/10 blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold flex items-center gap-2">🌤️ روز من</h1>
              <p className="text-xs text-teal-100/90 mt-1.5">{relativeDayLabel(date)} · {formatJalaliLong(date)}</p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {isToday && <span className="text-[10px] px-2 py-1 rounded-full bg-white/20 font-bold">امروز</span>}
                {sheet.holiday && <span className="text-[10px] px-2 py-1 rounded-full bg-rose-500/30 font-bold">تعطیل · {sheet.holiday}</span>}
                {goldenWindow && <span className="text-[10px] px-2 py-1 rounded-full bg-amber-300/25 font-bold">✨ ساعت طلایی {minToClock(goldenWindow.startHour * 60)}–{minToClock(goldenWindow.endHour * 60)}</span>}
              </div>
            </div>
            <div className="text-left shrink-0">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setDate(addDays(date, 1))} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 transition-colors font-bold" title="روز بعد" aria-label="روز بعد">‹</button>
                <button type="button" onClick={() => setDate(today)} className="px-3 h-8 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-xs font-bold">امروز</button>
                <button type="button" onClick={() => setDate(addDays(date, -1))} className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 transition-colors font-bold" title="روز قبل" aria-label="روز قبل">›</button>
              </div>
              <p className="text-[10px] text-teal-100/80 mt-2 text-center">تایم‌لاین {minToClock(sheet.rangeStartMin)} تا {minToClock(sheet.rangeEndMin)}</p>
            </div>
          </div>

          {/* نوار پیشرفت روز */}
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-[10px] text-teal-50/90 mb-1.5">
              <span>✅ ثبت‌شده {formatMinutes(sheet.totals.recordedMinutes)}</span>
              <span>🎯 پیشنهادی {formatMinutes(sheet.totals.suggestedMinutes)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-l from-amber-300 to-emerald-300 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* نوار روزهای هفته */}
        <div className="relative grid grid-cols-7 gap-1 px-3 pb-3">
          {WEEK_ORDER.map((wd, i) => {
            const d = dates[i];
            const j = keyToJalali(d);
            const holiday = !!iranianHolidayLabel(d);
            const active = d === date;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className={cn(
                  "rounded-xl py-1.5 flex flex-col items-center transition-all",
                  active ? "bg-white text-teal-800 shadow-lg scale-[1.03]" : "bg-white/10 hover:bg-white/20 text-white",
                )}
              >
                <span className="text-[10px] opacity-80">{WEEKDAYS_SHORT_FA[wd]}</span>
                <span className={cn("text-sm font-bold", holiday && !active && "text-amber-200")}>{toFaNum(j.jd)}</span>
                <span className={cn("w-1.5 h-1.5 rounded-full mt-0.5", d === today ? "bg-white" : "bg-transparent")} />
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── انتخاب نما */}
      <div className="flex items-center gap-2 mb-4 no-print">
        <Segmented<"day" | "week"> value={view} onChange={setView} options={[{ value: "day", label: "🗓️ روز" }, { value: "week", label: "📆 هفته" }]} className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setDate(today)} disabled={isToday}>امروز</Button>
      </div>

      {view === "day" ? (
        <>
          <StatRow sheet={sheet} />

          {/* ── تایم‌لاین */}
          <SectionTitle action={<span className="text-[11px] text-slate-400">{toFaNum(sheet.items.length)} برنامه · {formatMinutes(sheet.totals.freeMinutes)} خالی</span>}>
            ⏱ تایم‌لاین روز
          </SectionTitle>
          <Card className="!p-3 day-sheet-card">
            {sheet.items.length === 0 && sheet.windows.length >= 1 ? (
              <div className="text-center py-8 px-4">
                <div className="text-4xl mb-3">🕊</div>
                <p className="font-bold text-slate-700 dark:text-slate-200">این روز کاملاً آزاد است</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {formatMinutes(sheet.totals.freeMinutes)} زمان خالی داری. از «برنامه‌ها» یک برنامه بساز تا همین روز پر شود.
                </p>
                <Button size="sm" className="mt-4" onClick={() => go("plan", { planSub: "plans" })}>ساختن برنامه</Button>
              </div>
            ) : (
              <Timeline sheet={sheet} px={PX_PER_MIN} />
            )}
            {sheet.conflicts.length > 0 && (
              <div className="mt-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300">
                ⚠️ {toFaNum(sheet.conflicts.length)} تداخل در بلوک‌های ثابت این روز (کلاس/امتحان) — در «⏰ هفتگی» اصلاحش کن.
              </div>
            )}
            <Legend />
          </Card>

          <SubjectShare sheet={sheet} />

          <div className="grid md:grid-cols-2 gap-4">
            <FreeWindowsCard sheet={sheet} onPlan={() => go("plan", { planSub: "plans" })} />
            <UnplacedCard sheet={sheet} onPlan={() => go("plan", { planSub: "plans" })} />
          </div>

          <ExportCard onImage={exportImage} onShare={shareImage} onCopy={copyText} busy={busy} />
        </>
      ) : (
        <>
          <WeekStats totals={weekTotals} />
          <SectionTitle action={<span className="text-[11px] text-slate-400">هفتهٔ {formatJalaliLong(dates[0])} تا {formatJalaliLong(dates[6], false)}</span>}>
            📆 هفتهٔ من
          </SectionTitle>
          <Card className="!p-3 day-sheet-card overflow-x-auto">
            <WeekOverview week={week} titles={titles} onPick={(d) => { setDate(d); setView("day"); }} />
          </Card>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <Card>
              <h3 className="font-bold text-sm mb-3 text-slate-700 dark:text-slate-200">🕊 زمان‌های خالی هفته</h3>
              <div className="space-y-2">
                {week.filter((d) => d.windows.length > 0).length === 0 ? (
                  <p className="text-xs text-slate-500">همه‌ی ساعات کاری این هفته پُر است.</p>
                ) : (
                  week.map((d) => (
                    <button key={d.date} type="button" onClick={() => { setDate(d.date); setView("day"); }} className="w-full text-right flex items-center gap-2 text-xs rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                      <span className={cn("w-1.5 h-1.5 rounded-full", d.holiday ? "bg-rose-400" : "bg-teal-400")} />
                      <span className="font-bold text-slate-700 dark:text-slate-200 w-16">{WEEKDAYS_FA[d.weekday]}</span>
                      <span className="text-slate-500 dark:text-slate-400 flex-1">
                        {d.windows.length === 0 ? "بدون پنجره" : d.windows.map((w) => `${minToClock(w.start)}–${minToClock(w.end)}`).join(" ، ")}
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMinutes(d.totals.freeMinutes)}</span>
                    </button>
                  ))
                )}
              </div>
            </Card>
            <Card>
              <h3 className="font-bold text-sm mb-3 text-slate-700 dark:text-slate-200">📚 سهم درس‌ها در هفته</h3>
              <WeekSubjects week={week} />
            </Card>
          </div>

          <ExportCard onImage={exportImage} onShare={shareImage} onCopy={copyText} busy={busy} />
        </>
      )}

      {preview && (
        <Modal
          open
          onClose={() => setPreview(null)}
          title="تصویر روز من"
          footer={
            <>
              <Button variant="ghost" onClick={() => setPreview(null)}>بستن</Button>
              <Button
                onClick={() => {
                  void (async () => {
                    const canvas = makeCanvas();
                    if (!canvas) return;
                    const result = await shareOrDownloadCard(canvas, preview.name, sheetText(sheet, formatJalaliLong(date)));
                    if (result !== "failed") toast(result === "shared" ? "فرستاده شد" : "تصویر ذخیره شد", "🖼️");
                  })();
                }}
              >
                اشتراک / دانلود
              </Button>
            </>
          }
        >
          <img src={preview.url} alt="کارت تصویری برنامهٔ روز" className="w-full rounded-xl border border-slate-200 dark:border-slate-700" />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
            همین تصویر را می‌توانی در گالری ذخیره کنی یا برای دوستت بفرستی. برای PDF هم از دکمهٔ «چاپ / PDF» استفاده کن.
          </p>
        </Modal>
      )}
    </div>
  );
}

function toFaNum(n: number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** محور ساعت‌ها + بلوک‌ها + خطِ الان */
function Timeline({ sheet, px }: { sheet: DaySheet; px: number }) {
  const span = Math.max(60, sheet.rangeEndMin - sheet.rangeStartMin);
  const height = Math.round(span * px);
  const at = (min: number) => (min - sheet.rangeStartMin) * px;
  const firstHour = Math.ceil(sheet.rangeStartMin / 60);
  const lastHour = Math.floor(sheet.rangeEndMin / 60);
  const hours: number[] = [];
  for (let h = firstHour; h <= lastHour; h++) hours.push(h);

  return (
    <div className="relative day-timeline" style={{ height }} dir="rtl">
      {/* شبکه و برچسب ساعت‌ها */}
      {hours.map((h) => (
        <div key={h} className="absolute right-0 left-14 pointer-events-none" style={{ top: Math.round(at(h * 60)) }}>
          <div className="border-t border-dashed border-slate-200/80 dark:border-slate-700/50" />
        </div>
      ))}
      {hours.map((h) => (
        <div key={`l${h}`} className="absolute right-0 w-12 text-left text-[9px] text-slate-400 dark:text-slate-500 -translate-y-1/2 pointer-events-none" style={{ top: Math.round(at(h * 60)) }}>
          {minToClock(h * 60)}
        </div>
      ))}

      {/* پنجره‌های خالی */}
      {sheet.windows.map((w) => {
        const top = at(w.start);
        const h = Math.max(16, w.minutes * px - 3);
        return (
          <div
            key={`w${w.start}`}
            className={cn(
              "absolute right-14 left-0 rounded-xl border border-dashed flex items-center justify-center",
              w.golden ? "border-amber-300/80 bg-amber-50/60 dark:bg-amber-900/15" : "border-slate-300/80 dark:border-slate-600/60 bg-slate-50/70 dark:bg-slate-800/40",
            )}
            style={{ top, height: h }}
          >
            {h > 34 && (
              <span className={cn("text-[10px] font-medium", w.golden ? "text-amber-600 dark:text-amber-300" : "text-slate-400 dark:text-slate-500")}>
                🕊 خالی · {formatMinutes(w.minutes)}{w.golden ? " · ✨ ساعت طلایی" : w.best ? " · طولانی‌ترین" : ""}
              </span>
            )}
          </div>
        );
      })}

      {/* بلوک‌ها */}
      {sheet.items.map((item) => {
        const top = at(item.startMin);
        const h = Math.max(20, item.minutes * px - 3);
        const meta = KIND_META[item.kind];
        return (
          <div
            key={item.id}
            data-item={item.kind}
            data-title={item.title}
            className={cn("absolute right-14 left-0 rounded-xl overflow-hidden text-white px-2.5 py-1 shadow-md ring-1", meta.ring)}
            style={{
              top,
              height: h,
              backgroundImage: `linear-gradient(135deg, ${item.color} 0%, ${item.color}dd 60%, ${item.color}b3 100%)`,
              boxShadow: `0 8px 18px -12px ${item.color}`,
            }}
            title={`${meta.label} · ${item.title} · ${minToClock(item.startMin)}–${minToClock(item.endMin)}`}
          >
            <span className="absolute inset-y-0 right-0 w-1 bg-white/70" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10" />
            <div className="relative">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] shrink-0">{item.icon}</span>
                <span className="text-[11px] font-extrabold truncate leading-tight">{item.title}</span>
              </div>
              {h >= 34 && (
                <div className="flex items-center gap-1 mt-0.5 text-[9px] opacity-90 truncate">
                  <span dir="ltr" className="font-medium">{minToClock(item.startMin)}–{minToClock(item.endMin)}</span>
                  <span>· {formatMinutes(item.minutes)}</span>
                  {item.label && <span className="opacity-90">· {item.label}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* خطِ «الان» */}
      {sheet.nowMin != null && sheet.nowMin >= sheet.rangeStartMin && sheet.nowMin <= sheet.rangeEndMin && (
        <div className="absolute right-14 left-0 pointer-events-none" style={{ top: Math.round(at(sheet.nowMin)) }}>
          <div className="relative border-t-2 border-dashed border-rose-500">
            <span className="absolute -top-1.5 right-0 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-800" />
            <span className="absolute -top-3 left-0 text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-white/90 dark:bg-slate-800/90 rounded-full px-2 py-0.5">الان {minToClock(sheet.nowMin)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400">
      {(Object.keys(KIND_META) as SheetItem["kind"][]).map((k) => (
        <span key={k} className="flex items-center gap-1">
          <span>{KIND_META[k].icon}</span> {KIND_META[k].label}
        </span>
      ))}
      <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded border border-dashed border-slate-300 dark:border-slate-600 inline-block" /> زمان خالی</span>
      <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed border-rose-500 inline-block" /> الان</span>
    </div>
  );
}

function StatRow({ sheet }: { sheet: DaySheet }) {
  const tiles = [
    { icon: "🏫", label: "کلاس", value: formatMinutes(sheet.totals.classMinutes), from: "from-sky-500/15", to: "to-sky-400/5", text: "text-sky-600 dark:text-sky-300" },
    { icon: "✅", label: "ثبت‌شده", value: formatMinutes(sheet.totals.recordedMinutes), from: "from-emerald-500/15", to: "to-emerald-400/5", text: "text-emerald-600 dark:text-emerald-300" },
    { icon: "🎯", label: "پیشنهادی", value: formatMinutes(sheet.totals.suggestedMinutes), from: "from-amber-500/15", to: "to-amber-400/5", text: "text-amber-600 dark:text-amber-300" },
    { icon: "🕊", label: "خالی", value: formatMinutes(sheet.totals.freeMinutes), from: "from-violet-500/15", to: "to-violet-400/5", text: "text-violet-600 dark:text-violet-300" },
    { icon: "🔁", label: "مرور امروز", value: `${toFaNum(sheet.totals.reviewsDue)} مبحث`, from: "from-rose-500/15", to: "to-rose-400/5", text: "text-rose-600 dark:text-rose-300" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-2 no-print">
      {tiles.map((t) => (
        <div key={t.label} className={cn("rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-gradient-to-br p-3", t.from, t.to)}>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">{t.icon} {t.label}</div>
          <div className={cn("text-sm font-extrabold mt-1", t.text)}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

function SubjectShare({ sheet }: { sheet: DaySheet }) {
  if (sheet.bySubject.length === 0) return null;
  const max = Math.max(...sheet.bySubject.map((s) => s.minutes), 1);
  return (
    <Card className="mt-4">
      <h3 className="font-bold text-sm mb-1 text-slate-700 dark:text-slate-200">📚 سهم درس‌ها در این روز</h3>
      <p className="text-[10px] text-slate-400 mb-3">مجموع مطالعهٔ ثبت‌شده و بلوک‌های پیشنهادی هر درس</p>
      <div className="space-y-2.5">
        {sheet.bySubject.map((s) => (
          <div key={s.subjectId} className="flex items-center gap-2.5">
            <span className="w-24 shrink-0 text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{s.name}</span>
            <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(6, (s.minutes / max) * 100)}%`, backgroundImage: `linear-gradient(90deg, ${s.color}, ${s.color}aa)` }} />
            </div>
            <span className="w-20 shrink-0 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400">{formatMinutes(s.minutes)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FreeWindowsCard({ sheet, onPlan }: { sheet: DaySheet; onPlan: () => void }) {
  return (
    <Card>
      <h3 className="font-bold text-sm mb-3 text-slate-700 dark:text-slate-200">🕊 پنجره‌های خالی</h3>
      {sheet.windows.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">این روز پنجرهٔ خالیِ قابل‌استفاده ندارد؛ مرزهای روز را در تنظیمات ببین.</p>
      ) : (
        <ul className="space-y-2">
          {sheet.windows.map((w) => (
            <li key={w.start} className={cn("rounded-xl border px-3 py-2 flex items-center gap-2", w.golden ? "border-amber-200 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-900/15" : "border-slate-200 dark:border-slate-700/60")}>
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200" dir="ltr">{minToClock(w.start)}–{minToClock(w.end)}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-1">{formatMinutes(w.minutes)}</span>
              {w.golden && <span className="text-[9px] font-bold text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 rounded-full px-2 py-0.5">✨ ساعت طلایی</span>}
              {!w.golden && w.best && <span className="text-[9px] font-bold text-violet-600 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/40 rounded-full px-2 py-0.5">طولانی‌ترین</span>}
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" size="sm" className="mt-3" onClick={onPlan}>پر کردن با برنامه →</Button>
    </Card>
  );
}

function UnplacedCard({ sheet, onPlan }: { sheet: DaySheet; onPlan: () => void }) {
  return (
    <Card>
      <h3 className="font-bold text-sm mb-3 text-slate-700 dark:text-slate-200">📦 جا نشد…</h3>
      {sheet.unplaced.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">همه‌ی کارهای این روز در تایم‌لاین جا شدند. آفرین! 🎉</p>
      ) : (
        <>
          <ul className="space-y-2">
            {sheet.unplaced.map((u) => (
              <li key={u.id} className="rounded-xl border border-slate-200 dark:border-slate-700/60 px-3 py-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: u.color }} />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{u.title}</span>
                <span className="text-[10px] text-slate-400 truncate flex-1">{u.label}</span>
                <span className="text-[11px] font-bold text-slate-500">{formatMinutes(u.minutes)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">این‌ها برای امروز جا نشدند؛ در روزهای بعد خودکار جبران می‌شوند.</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={onPlan}>تغییر برنامه →</Button>
        </>
      )}
    </Card>
  );
}

function WeekStats({ totals }: { totals: { classMinutes: number; recordedMinutes: number; suggestedMinutes: number; freeMinutes: number; reviewsDue: number } }) {
  const tiles = [
    { icon: "🏫", label: "کلاس", value: formatMinutes(totals.classMinutes), color: "text-sky-600 dark:text-sky-300" },
    { icon: "✅", label: "ثبت‌شده", value: formatMinutes(totals.recordedMinutes), color: "text-emerald-600 dark:text-emerald-300" },
    { icon: "🎯", label: "پیشنهادی", value: formatMinutes(totals.suggestedMinutes), color: "text-amber-600 dark:text-amber-300" },
    { icon: "🕊", label: "خالی", value: formatMinutes(totals.freeMinutes), color: "text-violet-600 dark:text-violet-300" },
    { icon: "🔁", label: "مرور", value: `${toFaNum(totals.reviewsDue)} مبحث`, color: "text-rose-600 dark:text-rose-300" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-2 no-print">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-3">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">{t.icon} {t.label}</div>
          <div className={cn("text-sm font-extrabold mt-1", t.color)}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

function WeekOverview({ week, titles, onPick }: { week: DaySheet[]; titles: Record<string, string>; onPick: (date: string) => void }) {
  const rangeStart = Math.min(...week.map((d) => d.rangeStartMin));
  const rangeEnd = Math.max(...week.map((d) => d.rangeEndMin));
  const span = Math.max(60, rangeEnd - rangeStart);
  const height = Math.round(span * WEEK_PX_PER_MIN);
  const at = (min: number) => (min - rangeStart) * WEEK_PX_PER_MIN;
  const firstHour = Math.ceil(rangeStart / 60);
  const lastHour = Math.floor(rangeEnd / 60);
  const hours: number[] = [];
  for (let h = firstHour; h <= lastHour; h++) hours.push(h);

  return (
    <div className="min-w-[640px]">
      <div className="grid grid-cols-[40px_repeat(7,1fr)] gap-1.5">
        <div />
        {week.map((d) => (
          <button key={d.date} type="button" onClick={() => onPick(d.date)} className="rounded-lg py-1 text-center hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
            <div className={cn("text-[11px] font-bold", d.holiday ? "text-rose-500" : "text-slate-600 dark:text-slate-300")}>{WEEKDAYS_FA[d.weekday]}</div>
            <div className="text-[9px] text-slate-400">{formatJalaliLong(d.date, false)}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[40px_repeat(7,1fr)] gap-1.5 mt-1">
        {/* محور ساعت */}
        <div className="relative" style={{ height }}>
          {hours.filter((h) => h % 2 === 0).map((h) => (
            <div key={h} className="absolute right-0 left-0 text-[9px] text-slate-400 text-left -translate-y-1/2" style={{ top: at(h * 60) }}>{minToClock(h * 60)}</div>
          ))}
        </div>
        {week.map((d) => (
          <div key={d.date} className="relative rounded-lg bg-slate-50 dark:bg-slate-800/40 overflow-hidden" style={{ height }} role="button" tabIndex={0} onClick={() => onPick(d.date)} onKeyDown={(e) => e.key === "Enter" && onPick(d.date)} title={titles[d.date]}>
            {hours.filter((h) => h % 2 === 0).map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-dashed border-slate-200/70 dark:border-slate-700/40" style={{ top: at(h * 60) }} />
            ))}
            {d.windows.map((w) => (
              <div key={`w${w.start}`} className={cn("absolute inset-x-0", w.golden ? "bg-amber-100/70 dark:bg-amber-900/20" : "bg-white/50 dark:bg-slate-700/20")} style={{ top: at(w.start), height: Math.max(4, w.minutes * WEEK_PX_PER_MIN - 2) }} />
            ))}
            {d.items.map((item) => {
              const h = Math.max(7, item.minutes * WEEK_PX_PER_MIN - 2);
              return (
                <div
                  key={item.id}
                  className="absolute inset-x-0.5 rounded-md overflow-hidden text-white px-1"
                  style={{ top: at(item.startMin), height: h, backgroundColor: item.color, boxShadow: `0 4px 10px -8px ${item.color}` }}
                  title={`${item.title} · ${minToClock(item.startMin)}–${minToClock(item.endMin)}`}
                >
                  {h >= 22 ? (
                    <div className="pt-0.5">
                      <div className="text-[8px] font-bold truncate leading-tight">{item.icon} {item.title}</div>
                      {h >= 40 && <div className="text-[7px] opacity-85 truncate" dir="ltr">{minToClock(item.startMin)}</div>}
                    </div>
                  ) : (
                    <span className="text-[7px] leading-none">{item.icon}</span>
                  )}
                </div>
              );
            })}
            {d.nowMin != null && d.nowMin >= rangeStart && d.nowMin <= rangeEnd && (
              <div className="absolute inset-x-0 border-t border-rose-500" style={{ top: at(d.nowMin) }} />
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[40px_repeat(7,1fr)] gap-1.5 mt-2">
        <div />
        {week.map((d) => (
          <div key={d.date} className="text-center space-y-0.5">
            <div className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">✅ {formatMinutes(d.totals.recordedMinutes)}</div>
            <div className="text-[9px] text-amber-600 dark:text-amber-400">🎯 {formatMinutes(d.totals.suggestedMinutes)}</div>
            <div className="text-[9px] text-violet-600 dark:text-violet-400">🕊 {formatMinutes(d.totals.freeMinutes)}</div>
            {d.totals.reviewsDue > 0 && <div className="text-[9px] text-rose-500">🔁 {toFaNum(d.totals.reviewsDue)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekSubjects({ week }: { week: DaySheet[] }) {
  const totals = new Map<string, { name: string; color: string; minutes: number }>();
  for (const d of week)
    for (const s of d.bySubject) {
      const cur = totals.get(s.subjectId) ?? { name: s.name, color: s.color, minutes: 0 };
      cur.minutes += s.minutes;
      totals.set(s.subjectId, cur);
    }
  const list = [...totals.values()].sort((a, b) => b.minutes - a.minutes);
  if (list.length === 0) return <p className="text-xs text-slate-500">این هفته سهمی برای درس‌ها ثبت نشده.</p>;
  const max = Math.max(...list.map((s) => s.minutes), 1);
  return (
    <div className="space-y-2.5">
      {list.slice(0, 7).map((s) => (
        <div key={s.name} className="flex items-center gap-2.5">
          <span className="w-20 shrink-0 text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{s.name}</span>
          <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(6, (s.minutes / max) * 100)}%`, backgroundImage: `linear-gradient(90deg, ${s.color}, ${s.color}aa)` }} />
          </div>
          <span className="w-20 shrink-0 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400">{formatMinutes(s.minutes)}</span>
        </div>
      ))}
    </div>
  );
}

function ExportCard({ onImage, onShare, onCopy, busy }: { onImage: () => void; onShare: () => void; onCopy: () => void; busy: boolean }) {
  return (
    <Card className="mt-4 no-print !p-0 overflow-hidden">
      <div className="p-4 bg-gradient-to-l from-slate-50 to-white dark:from-slate-800 dark:to-slate-800/60">
        <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">📤 خروجی گرفتن</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          تصویر گرافیکیِ روز، متن آمادهٔ اشتراک، یا چاپ/PDF از همین صفحه.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button onClick={onImage} disabled={busy}>🖼️ تصویر PNG</Button>
          <Button variant="secondary" onClick={onShare}>📲 اشتراک تصویر</Button>
          <Button variant="outline" onClick={onCopy}>📋 کپی متن</Button>
          <Button variant="outline" onClick={() => window.print()}>🖨️ چاپ / PDF</Button>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">برای PDF، در پنجرهٔ چاپ «Save as PDF» را انتخاب کن. کارت‌های رنگی هم چاپ می‌شوند.</p>
      </div>
    </Card>
  );
}
