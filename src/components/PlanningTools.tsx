import { lazy, Suspense, useState } from "react";
import { Button } from "./ui";
const PlanningLab = lazy(() => import("./PlanningLab"));
export default function PlanningTools() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        className="w-full my-3"
        onClick={() => setOpen(true)}
      >
        روز منعطف، سناریوها و اصلاح تخمین زمان
      </Button>
      {open && (
        <Suspense fallback={<p role="status">در حال آماده‌سازی کارگاه…</p>}>
          <PlanningLab onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
