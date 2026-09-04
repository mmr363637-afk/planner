import { useNav, type PlanSubTab } from "../nav";
import { Segmented } from "../components/ui";
import CalendarPage from "./Calendar";
import PlansPage from "./Plans";
import SubjectsPage from "./Subjects";

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
    </div>
  );
}
