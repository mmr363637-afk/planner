import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { recommendNext } from "../lib/decisions";
import { todayKey, toFa } from "../lib/jalali";
import { Button, Card, inputClass } from "./ui";

export default function NextActionCard() {
  const { state, startSession, updateSettings } = useStore(),
    { go } = useNav();
  const [budget, setBudget] = useState(25),
    [energy, setEnergy] = useState<"normal" | "low">("normal");
  const today = todayKey();
  const dismissed =
    state.settings.dismissedRecommendations?.date === today
      ? state.settings.dismissedRecommendations.keys
      : [];
  const list = useMemo(
    () => recommendNext(state, today, budget, energy),
    [state, today, budget, energy],
  );
  const next = list.find((r) => !dismissed.includes(r.key));
  const labels = {
    study: "مطالعه",
    review: "مرور مبحث",
    cards: "مرور کارت",
    mistakes: "تمرین اشتباهات",
  };
  if (state.activeSession)
    return (
      <Card className="mb-4 border-teal-300">
        <h2 className="font-bold mb-2">مطالعه‌ات در جریان است</h2>
        <p className="text-sm text-slate-500 mb-3">
          جلسهٔ تازه‌ای شروع نمی‌کنیم؛ از همان‌جا ادامه بده.
        </p>
        <Button onClick={() => go("study")}>ادامهٔ جلسهٔ فعال</Button>
      </Card>
    );
  return (
    <Card className="mb-4 border-teal-300 dark:border-teal-700 bg-teal-50/40 dark:bg-teal-950/20">
      <div className="text-xs text-teal-700 dark:text-teal-300 mb-3">
        یک قدم روشن، همین حالا
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <label className="text-xs text-slate-600 dark:text-slate-300">
          وقت آزاد
          <select
            aria-label="وقت آزاد برای پیشنهاد"
            className={inputClass + " mt-1"}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          >
            {[10, 15, 25, 45, 60].map((n) => (
              <option key={n} value={n}>
                {toFa(n)} دقیقه
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          انرژی امروز
          <select
            aria-label="انرژی برای پیشنهاد"
            className={inputClass + " mt-1"}
            value={energy}
            onChange={(e) => setEnergy(e.target.value as typeof energy)}
          >
            <option value="normal">معمولی</option>
            <option value="low">کم؛ سبک‌تر شروع کنیم</option>
          </select>
        </label>
      </div>
      {next ? (
        <>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
            {labels[next.kind]}: {next.title}
          </h2>
          <p className="text-sm text-teal-700 dark:text-teal-300 mt-1">
            پیشنهاد یک نوبت {toFa(next.minutes)} دقیقه‌ای؛ نه زمان قطعی اتمام
            مبحث
          </p>
          <ul className="text-sm leading-7 text-slate-600 dark:text-slate-300 my-3 list-disc pr-5">
            {next.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (next.kind === "study") {
                  startSession(
                    next.topicId ?? null,
                    "free",
                    next.taskId,
                    next.minutes,
                  );
                  go("study");
                } else
                  go("reviews", {
                    reviewSub: next.kind === "review" ? "reviews" : next.kind,
                    reviewTopic: next.topicId,
                  });
              }}
            >
              {next.kind === "study"
                ? "شروع پیشنهاد"
                : "باز کردن تمرین پیشنهادی"}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                updateSettings({
                  dismissedRecommendations: {
                    date: today,
                    keys: [...dismissed, next.key],
                  },
                })
              }
            >
              پیشنهاد دیگر
            </Button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold">
            {list.length
              ? "همهٔ پیشنهادها را کنار گذاشتی"
              : "از یک جلسهٔ کوتاه شروع کن"}
          </h2>
          <p className="text-sm text-slate-500 my-3">
            {list.length
              ? "می‌توانی پیشنهادها را برگردانی یا آزاد مطالعه کنی."
              : "لازم نیست اول همه‌چیز را برنامه‌ریزی کنی. زمانت ثبت می‌شود؛ هر وقت خواستی درس اضافه کن."}
          </p>
          <Button
            onClick={() => {
              startSession(null, "free", undefined, 20);
              go("study");
            }}
          >
            شروع کوتاه با هدف ۲۰ دقیقه
          </Button>
          {list.length > 0 && (
            <Button
              variant="ghost"
              onClick={() =>
                updateSettings({
                  dismissedRecommendations: { date: today, keys: [] },
                })
              }
            >
              بازگرداندن پیشنهادها
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-slate-500 mt-3">
        پیشنهاد محلی و توضیح‌پذیر از برنامه، مرور، امتحان و داده‌های خودت؛
        انتخاب نهایی با توست.
      </p>
    </Card>
  );
}
