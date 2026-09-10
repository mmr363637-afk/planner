import { useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, Field, Modal, inputClass } from "./ui";
import { JalaliDatePicker } from "./shared";
import { addDays, formatMinutes, toFa, todayKey } from "../lib/jalali";
import { GOAL_TEMPLATES } from "../lib/templates";
import { cn } from "../utils/cn";

/**
 * آنبوردینگ اولین ورود: انتخاب هدف ← ساعت روزانه و امتحان ← ساخت کتابخانه.
 * وقتی settings.onboarded=false است در App نمایش داده می‌شود.
 * (عمداً دکمه‌ی بستن ندارد — یک جریان ۳۰ ثانیه‌ای که فقط یک‌بار دیده می‌شود.)
 */
export default function Onboarding() {
  const { state, addSubject, addTopic, addExam, updateSettings, loadSampleData, toast } = useStore();
  const { go } = useNav();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState("konkoor");
  const [dailyMinutes, setDailyMinutes] = useState(240);
  const [examTitle, setExamTitle] = useState("");
  const [examDate, setExamDate] = useState(addDays(todayKey(), 90));
  const [withExam, setWithExam] = useState(true);
  const [done, setDone] = useState(false);

  const template = GOAL_TEMPLATES.find((t) => t.id === templateId) ?? GOAL_TEMPLATES[0];
  const topicsCount = template.useSampleData ? 297 : template.subjects.reduce((s, x) => s + x.topics.length, 0);

  const finish = () => {
    if (template.useSampleData) {
      loadSampleData();
    } else {
      // نگهبان تکراری: اگر قبلاً (مثلاً با رفرش وسط کار) ساخته شده، دوباره نساز
      const existing = new Set(state.subjects.map((s) => s.name));
      for (const s of template.subjects) {
        if (existing.has(s.name)) continue;
        const sub = addSubject({ name: s.name, color: s.color, priority: s.priority, approach: s.approach });
        for (const t of s.topics) {
          addTopic({
            subjectId: sub.id, name: t.name, volume: 10, estimatedMinutes: t.estimatedMinutes,
            priority: t.priority, difficulty: t.difficulty, status: "not_started",
          });
        }
      }
    }
    updateSettings({ dailyGoalMinutes: dailyMinutes });
    if (withExam && examTitle.trim() && !state.exams.some((e) => e.title === examTitle.trim())) {
      addExam({ title: examTitle.trim(), date: examDate });
    }
    setDone(true);
  };

  /** پایان واقعی: فلگ آنبوردد ست می‌شود و مودال برای همیشه می‌رود */
  const complete = (where: "plans" | "home") => {
    updateSettings({ onboarded: true });
    if (where === "plans") {
      toast("دکمه‌ی ✨ برنامه هوشمند را بزن", "🧠");
      go("plan", { planSub: "plans" });
    } else {
      go("home");
    }
  };

  return (
    <Modal open onClose={() => {}}>
      <div className="pt-4 pb-2">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          {done ? "🎉 آماده‌ای!" : `شروع · قدم ${toFa(step + 1)} از ${toFa(3)}`}
        </h3>
      </div>
      {!done && (
        <div className="flex gap-1 mb-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-teal-500" : "bg-slate-200 dark:bg-slate-700")} />
          ))}
        </div>
      )}

      {!done && step === 0 && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            به <b>برنامه‌ریز مطالعه</b> خوش اومدی! 📚 اول بگو هدفت چیه تا کتابخانه‌ات رو آماده کنیم:
          </p>
          <div className="flex flex-col gap-2">
            {GOAL_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTemplateId(t.id); setDailyMinutes(t.dailyMinutes); }}
                className={cn(
                  "text-right rounded-2xl border-2 p-3.5 transition-all active:scale-[0.99]",
                  templateId === t.id ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20" : "border-slate-200 dark:border-slate-700",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{t.icon}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{t.title}</span>
                  {templateId === t.id && <span className="mr-auto text-teal-600">✓</span>}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{t.desc}</div>
              </button>
            ))}
          </div>
          <Button className="w-full mt-5" size="lg" onClick={() => setStep(1)}>بعدی</Button>
        </>
      )}

      {!done && step === 1 && (
        <>
          <Field label="روزی چقدر می‌خوای بخونی؟" hint={formatMinutes(dailyMinutes)}>
            <input type="range" min={30} max={720} step={15} value={dailyMinutes} onChange={(e) => setDailyMinutes(Number(e.target.value))} className="w-full accent-teal-600" />
          </Field>
          <button
            type="button"
            onClick={() => setWithExam((v) => !v)}
            className={cn("w-full flex items-center gap-2 rounded-xl border-2 p-3 text-sm font-medium mb-3", withExam ? "border-teal-500 text-teal-700 dark:text-teal-300" : "border-slate-200 dark:border-slate-600 text-slate-500")}
          >
            <span className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center text-[12px]", withExam ? "bg-teal-500 border-teal-500 text-white" : "border-slate-300")}>{withExam ? "✓" : ""}</span>
            📝 امتحان مهمی در پیش دارم
          </button>
          {withExam && (
            <>
              <Field label="اسم امتحان">
                <input className={inputClass} value={examTitle} onChange={(e) => setExamTitle(e.target.value)} placeholder="مثلاً کنکور سراسری" />
              </Field>
              <Field label="تاریخ امتحان">
                <JalaliDatePicker value={examDate} onChange={setExamDate} min={todayKey()} />
              </Field>
            </>
          )}
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" onClick={() => setStep(0)}>قبلی</Button>
            <Button className="flex-1" onClick={() => setStep(2)}>بعدی</Button>
          </div>
        </>
      )}

      {!done && step === 2 && (
        <>
          <Card className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <div className="font-bold text-slate-800 dark:text-slate-100 mb-2">{template.icon} {template.title}</div>
            <div>📚 {template.subjects.length > 0 ? `${toFa(template.subjects.length)} درس و ${toFa(topicsCount)} مبحث آماده` : template.useSampleData ? `${toFa(topicsCount)} مبحث نمونه پزشکی` : "شروع با کتابخانه خالی"} ساخته می‌شود.</div>
            <div>🎯 هدف روزانه: {formatMinutes(dailyMinutes)}</div>
            {withExam && examTitle.trim() && <div>📝 امتحان «{examTitle.trim()}» ثبت می‌شود.</div>}
          </Card>
          <div className="flex gap-2 mt-5">
            <Button variant="ghost" onClick={() => setStep(1)}>قبلی</Button>
            <Button className="flex-1" size="lg" onClick={finish}>🚀 بساز و شروع کن</Button>
          </div>
        </>
      )}

      {done && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            کتابخانه‌ات آماده‌ست! حالا بذار <b>موتور هوشمند</b> بر اساس امتحان و ساعت روزانه‌ات، کل مسیر رو برات بچینه:
          </p>
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => complete("plans")}>
              ✨ ساخت برنامه هوشمند
            </Button>
            <Button variant="secondary" onClick={() => complete("home")}>فعلاً خودم می‌گردم</Button>
          </div>
          <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
            💡 نکته: همه‌ی داده‌ها فقط روی همین گوشی ذخیره می‌شود (آفلاین). از «تنظیمات» می‌توانی بکاپ بگیری.
          </p>
        </>
      )}
    </Modal>
  );
}
