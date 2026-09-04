import { useNav, type PlanSubTab } from "../nav";
import { Card, SectionTitle, Segmented } from "../components/ui";
import CalendarPage from "./Calendar";
import PlansPage from "./Plans";
import SubjectsPage from "./Subjects";

/** Credit line shown at the bottom of the «برنامه» page (all sub-tabs). */
export const ABOUT_DEVELOPER_TEXT = "این برنامه با طراحی و توسعهٔ مهدی محمدرحیمی ساخته شده است.";

export default function PlanPage() {
  const { planSub, go } = useNav();
  return (
    <div>
      <Segmented<PlanSubTab>
        value={planSub}
        onChange={(v) => go("plan", { planSub: v })}
        options={[
          { value: "calendar", label: "تقویم" },
          { value: "plans", label: "برنامه‌ها" },
          { value: "subjects", label: "دروس" },
        ]}
        className="mb-4"
      />
      {planSub === "calendar" && <CalendarPage key={planSub} />}
      {planSub === "plans" && <PlansPage />}
      {planSub === "subjects" && <SubjectsPage />}

      <AboutDeveloper />
    </div>
  );
}

function AboutDeveloper() {
  return (
    <section className="mt-8">
      <SectionTitle>درباره سازنده</SectionTitle>
      <Card className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-base">م</span>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{ABOUT_DEVELOPER_TEXT}</p>
      </Card>
    </section>
  );
}
