import AboutAppButton from "../components/AboutAppButton";
import { ABOUT_DEVELOPER_TEXT } from "../lib/aboutApp";
export { ABOUT_DEVELOPER_TEXT } from "../lib/aboutApp";
import { Suspense, lazy } from "react";
import { useNav, type PlanSubTab } from "../nav";
import { Card, SectionTitle, Segmented } from "../components/ui";
// ⚡ زیرصفحه‌های برنامه هم تنبل‌اند تا ورود به تب «برنامه» سبک بماند
const DaySheetPage = lazy(() => import("./DaySheet"));
const CalendarPage = lazy(() => import("./Calendar"));
const PlansPage = lazy(() => import("./Plans"));
const SubjectsPage = lazy(() => import("./Subjects"));
const TimetablePage = lazy(() => import("./Timetable"));

/** Credit line shown at the bottom of the «برنامه» page (all sub-tabs). */


export default function PlanPage() {
  const { planSub, go } = useNav();
  return (
    <div>
      {/* 🐛→✅ قبلاً این تب‌ها no-print نبودند و موقع چاپ «روز من» هم در PDF ظاهر
          می‌شدند (یک ردیف دکمه‌ی بی‌فایده بالای فایل). */}
      <div className="no-print">
        <Segmented<PlanSubTab>
          value={planSub}
          onChange={(v) => go("plan", { planSub: v })}
          options={[
            { value: "day", label: "🌤️ روز من" },
            { value: "calendar", label: "تقویم" },
            { value: "plans", label: "برنامه‌ها" },
            { value: "subjects", label: "دروس" },
            { value: "timetable", label: "⏰ هفتگی" },
          ]}
          className="mb-4"
          compact
        />
      </div>
      <Suspense fallback={<div className="animate-pulse h-40 rounded-2xl bg-slate-200/70 dark:bg-slate-700/60" aria-label="در حال بارگذاری…" />}>
        {planSub === "day" && <DaySheetPage />}
        {planSub === "calendar" && <CalendarPage key={planSub} />}
        {planSub === "plans" && <PlansPage />}
        {planSub === "subjects" && <SubjectsPage />}
        {planSub === "timetable" && <TimetablePage />}
      </Suspense>

      <AboutDeveloper />
    </div>
  );
}

function AboutDeveloper() {
  return (
    <section className="mt-8 no-print">
      <SectionTitle>درباره سازنده</SectionTitle>
      <Card className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-base">م</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 mb-3">{ABOUT_DEVELOPER_TEXT}</p>
          <AboutAppButton />
        </div>
      </Card>
    </section>
  );
}
