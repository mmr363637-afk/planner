import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card, SectionTitle } from "./ui";
import { cn } from "../utils/cn";
import { toFa, todayKey } from "../lib/jalali";
import { defaultExamChecklist, toggleCheckItem } from "../lib/examChecklist";
import { trackFeature } from "../lib/usage";
import { pushExamsToCalendar, requestCalendarToken } from "../lib/googleCalendar";
import { isValidGoogleClientId, resolveGoogleClientId } from "../lib/googleDrive";
import type { Exam, ExamCheckItem } from "../types";

/**
 * 🎓 همراه روز امتحان — از «فیچر» به «مراسم».
 * روز امتحان سه لحظه دارد: صبح (آرامش + چک‌لیست + کپسول زمان)، سر جلسه، و بعد از
 * امتحان (بازتاب با حال‌وهوا که در ژورنال می‌نشیند). همه آفلاین.
 */
export function ExamDayCompanion() {
  const { state, updateExam, openCapsule, upsertJournal, toast } = useStore();
  const today = todayKey();
  const todays = useMemo(() => state.exams.filter((e) => e.date === today), [state.exams, today]);
  const [debuiltFor, setDebuiltFor] = useState<string | null>(null);
  const [mood, setMood] = useState(3);
  const [note, setNote] = useState("");
  const [savedAny, setSavedAny] = useState(false);

  if (todays.length === 0) return null;

  const openableCapsules = state.capsules.filter((c) => !c.openedAt && c.openDate <= today && (!c.examId || todays.some((e) => e.id === c.examId)));
  const existingJournal = state.journal.find((j) => j.date === today);

  const saveDebrief = (exam: Exam) => {
    const text = `بازتاب امتحان «${exam.title}»: ${note.trim() || "(بدون توضیح)"}`;
    upsertJournal(today, existingJournal ? `${existingJournal.learned}\n${text}` : text, mood);
    trackFeature("exam_debrief");
    setDebuiltFor(null);
    setNote("");
    setSavedAny(true);
    toast("بازتاب امتحان در ژورنال امروز ثبت شد 🌙", "✅");
  };

  return (
    <div>
      <SectionTitle>همراه روز امتحان 🎓</SectionTitle>
      {todays.map((exam) => {
        const list: ExamCheckItem[] = exam.checklist ?? defaultExamChecklist();
        const done = list.filter((i) => i.done).length;
        return (
          <Card key={exam.id} className="mb-2 border-rose-200 dark:border-rose-900/50 bg-gradient-to-b from-rose-50/60 to-white dark:from-rose-950/20 dark:to-slate-800">
            <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-1">
              امروز روزِ «{exam.title}» است {exam.time ? `· ساعت ${toFa(exam.time)}` : ""}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              صبح: نفس عمیق، چک‌لیست، و اگر کپسول زمانی داری همین حالا بازش کن. تو برای این روز
              برنامه ریخته‌ای — فقط اجرا کن.
            </p>

            {openableCapsules.length > 0 && (
              <div className="mb-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 p-2.5">
                <div className="text-[12px] font-bold text-violet-700 dark:text-violet-300 mb-1.5">💌 کپسول زمانِ امروز آماده است</div>
                {openableCapsules.map((c) => (
                  <Button key={c.id} size="sm" variant="ghost" onClick={() => { openCapsule(c.id); toast("نامه‌ات به خودت باز شد 💌", "🎉"); }}>
                    باز کردن نامه
                  </Button>
                ))}
              </div>
            )}

            <div className="text-[12px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">🎒 چک‌لیست ({toFa(done)} از {toFa(list.length)})</div>
            <div className="flex flex-col gap-1 mb-3">
              {list.map((item) => (
                <CheckRow key={item.id} item={item} onToggle={() => {
                  updateExam(exam.id, { checklist: toggleCheckItem(list, item.id) });
                }} />
              ))}
            </div>

            {debuiltFor === exam.id ? (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-[12px] font-bold text-slate-700 dark:text-slate-200 mb-2">چطور گذشت؟ 🌙</div>
                <div className="flex gap-1.5 mb-2" role="radiogroup" aria-label="حالِ بعد از امتحان">
                  {[1, 2, 3, 4, 5].map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mood === m}
                      onClick={() => setMood(m)}
                      className={cn("flex-1 text-lg py-1.5 rounded-xl border transition-all", mood === m ? "border-teal-400 bg-teal-50 dark:bg-teal-900/30 scale-105" : "border-slate-200 dark:border-slate-700 opacity-60")}
                    >
                      {["😖", "😕", "😐", "🙂", "😄"][m - 1]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="چه چیزی خوب پیش رفت؟ چه چیزی را دفعه‌ی بعد عوض می‌کنی؟"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-teal-500/40"
                />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" className="flex-1" onClick={() => saveDebrief(exam)}>ثبت در ژورنال امروز</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDebuiltFor(null)}>بعداً</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { setDebuiltFor(exam.id); setSavedAny(false); }}>
                {savedAny || existingJournal ? "ویرایش بازتاب امروز 🌙" : "بعد از امتحان: ثبت بازتاب 🌙"}
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function CheckRow({ item, onToggle }: { item: ExamCheckItem; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300 cursor-pointer py-0.5">
      <input type="checkbox" checked={item.done} onChange={onToggle} className="accent-teal-600 w-4 h-4" />
      <span className={item.done ? "line-through opacity-60" : ""}>{item.label}</span>
    </label>
  );
}

/**
 * ☁️ ارسال دسته‌ای امتحانات به تقویم گوگل — مسیر آنلاینِ اختیاری.
 * مسیرهای آفلاین (ICS + لینک تک‌تک) سر جای خودشان می‌مانند.
 */
export function CalendarSyncCard() {
  const { state, toast } = useStore();
  const today = todayKey();
  const upcoming = state.exams.filter((e) => e.date >= today);
  const [clientId, setClientId] = useState(() => resolveGoogleClientId(state.settings));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (upcoming.length === 0) return null;

  const sync = async () => {
    const effective = clientId.trim() || resolveGoogleClientId(state.settings);
    if (!isValidGoogleClientId(effective)) {
      setMsg("Client ID معتبر نیست — یا خالی بگذار (پیش‌فرض برنامه) یا Client ID پروژه‌ی شخصی‌ات را کامل وارد کن.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const token = await requestCalendarToken(effective);
      const r = await pushExamsToCalendar(token, state.exams, today);
      trackFeature("calendar_sync");
      setMsg(`✅ ${toFa(r.created)} رویداد ساخته و ${toFa(r.updated)} رویداد به‌روز شد${r.failed > 0 ? ` · ${toFa(r.failed)} مورد ناموفق` : ""}.`);
      toast("امتحانات در تقویم گوگل ثبت شدند 📅", "✅");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : "خطای ناشناخته"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle>تقویم گوگل ☁️</SectionTitle>
      <Card>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
          ارسال دسته‌ایِ همه‌ی امتحاناتِ پیش‌رو به تقویم گوگلت (اختیاری و آنلاین). رویدادهای اپ با
          برچسب مخفی ذخیره می‌شوند تا دفعه‌ی بعد <b>به‌روز</b> شوند، نه تکراری. مسیرهای آفلاین سر
          جای خودشان‌اند: خروجی ICS در تنظیمات و لینک «+» کنار هر امتحان.
        </p>
        <input
          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-teal-500/40 mb-2"
          dir="ltr"
          placeholder={`Client ID — پیش‌فرض برنامه کار گذاشته شده (برای پروژه‌ی شخصی عوضش کن)`}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
        <p className="text-[10px] text-slate-400 leading-relaxed mb-2">
          برای اولین بار، در کنسول گوگلِ همان Client ID باید «Google Calendar API» روشن و scope
          <code dir="ltr"> calendar.events</code> به صفحه‌ی consent اضافه شده باشد (دو کلیک — راهنما در README).
          اگر این کار را نکردی، همان لینک «+» کنار هر امتحان بدون هیچ تنظیمی کار می‌کند.
        </p>
        <Button size="sm" disabled={busy} onClick={() => void sync()}>
          {busy ? "در حال ارسال…" : `📅 ارسال ${toFa(upcoming.length)} امتحان به تقویم`}
        </Button>
        {msg && <p className="text-[11px] mt-2 leading-relaxed text-slate-500 dark:text-slate-400">{msg}</p>}
      </Card>
    </div>
  );
}
