import { Suspense, lazy } from "react";
import { Modal } from "./ui";
import type { OpenTarget } from "../nav";

// پنجره‌هایی که از منوی ☰ مستقیم باز می‌شوند و صفحهٔ مستقل ندارند.
// (بانکِ سؤال، شبیه‌ساز، جزوه، صوتی، پادکست، کارتِ خودکار و منبع‌ها را خودِ
// صفحهٔ امتحانات/مرورها با همان `nav.open` باز می‌کنند.)
const JourneyCard = lazy(() => import("./JourneyCard"));
const WrappedModal = lazy(() => import("./WrappedModal"));
const SkillTree = lazy(() => import("./SkillTree"));
const TestLogModal = lazy(() => import("./TestLogModal"));
const FocusMode = lazy(() => import("./FocusMode"));
const TextReader = lazy(() => import("./TextReader"));
const StudyRoomModal = lazy(() => import("./StudyRoom"));

const HANDLED: OpenTarget[] = ["journey", "wrapped", "skills", "tests", "focus", "textreader", "studyroom"];

export function isShortcutTarget(target?: OpenTarget): boolean {
  return !!target && HANDLED.includes(target);
}

/**
 * هر پنجرهٔ «بدونِ تب» را با همان کلیدِ `nav.open` باز می‌کند. همه تنبل‌اند تا
 * باز کردنِ منو هیچ‌کدام از این ماژول‌های سنگین را به باندلِ اولیه اضافه نکند.
 */
export default function ShortcutModals({ target, onClose }: { target?: OpenTarget; onClose: () => void }) {
  if (!target || !HANDLED.includes(target)) return null;
  const wrap = (title: string, node: React.ReactNode) => (
    <Modal open onClose={onClose} title={title}>
      <Suspense fallback={<div className="py-8 text-center text-xs text-slate-400">در حال بارگذاری…</div>}>{node}</Suspense>
    </Modal>
  );
  switch (target) {
    case "journey":
      return wrap("🗺 سفر مطالعه", <JourneyCard />);
    case "wrapped":
      return (
        <Suspense fallback={null}>
          <WrappedModal open onClose={onClose} />
        </Suspense>
      );
    case "skills":
      return (
        <Suspense fallback={null}>
          <SkillTree open onClose={onClose} />
        </Suspense>
      );
    case "tests":
      return (
        <Suspense fallback={null}>
          <TestLogModal open onClose={onClose} />
        </Suspense>
      );
    case "focus":
      return (
        <Suspense fallback={null}>
          <FocusMode open onClose={onClose} />
        </Suspense>
      );
    case "textreader":
      return (
        <Suspense fallback={null}>
          <TextReader onClose={onClose} />
        </Suspense>
      );
    case "studyroom":
      return (
        <Suspense fallback={null}>
          <StudyRoomModal open onClose={onClose} />
        </Suspense>
      );
    default:
      return null;
  }
}
