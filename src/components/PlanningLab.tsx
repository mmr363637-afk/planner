import { useMemo, useState } from "react";
import { useStore } from "../store";
import {
  addDays,
  formatJalaliShort,
  formatMinutes,
  todayKey,
  toFa,
  WEEKDAYS_FA,
} from "../lib/jalali";
import {
  paceEstimates,
  planningFingerprint,
  schedulePreview,
  type SchedulePreview,
  type ScheduleOptions,
} from "../lib/decisions";
import { saveHistory } from "../lib/history";
import { Button, Card, Modal, inputClass } from "./ui";

type Mode = "rescue" | "scenarios" | "pace";
export default function PlanningLab({
  onClose,
  initial = "rescue",
}: {
  onClose: () => void;
  initial?: Mode;
}) {
  const { state, applySchedule, acceptPace } = useStore();
  const [mode, setMode] = useState<Mode>(initial),
    [todayMinutes, setTodayMinutes] = useState(45),
    [daily, setDaily] = useState(state.settings.dailyGoalMinutes || 120),
    [horizon, setHorizon] = useState(14),
    [energy, setEnergy] = useState(false),
    [off, setOff] = useState<number[]>([]);
  const [previews, setPreviews] = useState<
      { title: string; result: SchedulePreview; fingerprint: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const today = todayKey();
  const estimates = useMemo(() => paceEstimates(state, today), [state, today]);
  const preview = () => {
    const base: ScheduleOptions = {
      today,
      end: addDays(today, horizon - 1),
      dailyMinutes: daily,
      offDays: off,
    };
    const variants =
      mode === "rescue"
        ? [
            {
              title: "روز منعطف",
              options: {
                ...base,
                todayMinutes,
                lowEnergy: energy,
                prioritize: true,
              },
            },
          ]
        : [
            { title: "بازچینی با ظرفیت فعلی", options: base },
            {
              title: "روزانه ۳۰ دقیقه سبک‌تر",
              options: { ...base, dailyMinutes: Math.max(0, daily - 30) },
            },
            {
              title: "اول مرورها و مباحث مهم",
              options: { ...base, prioritize: true },
            },
          ];
    setPreviews(
      variants.map((v) => ({
        title: v.title,
        result: schedulePreview(state, v.options),
        fingerprint: planningFingerprint(state),
      })),
    );
    setError("");
  };
  const apply = async (p: (typeof previews)[number]) => {
    setBusy(true);
    setError("");
    try {
      await saveHistory(state, `پیش از ${p.title}`);
      if (applySchedule(p.result.tasks, p.fingerprint)) {
        setPreviews([]);
        onClose();
      }
    } catch {
      setError(
        "نسخهٔ ایمنی ذخیره نشد؛ برنامه تغییر نکرد. فضای مرورگر را بررسی کن.",
      );
    } finally {
      setBusy(false);
    }
  };
  const baseline = state.tasks.filter(
    (t) =>
      t.status === "pending" &&
      t.date >= today &&
      t.date <= addDays(today, horizon - 1),
  );
  const baselineDays = new Set(baseline.map((t) => t.date)).size;
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="کارگاه برنامهٔ واقعی"
    >
      <div className="flex gap-2 flex-wrap mb-4">
        {(
          [
            ["rescue", "امروز به هم ریخت"],
            ["scenarios", "سناریوهای آینده"],
            ["pace", "یادگیری از زمان واقعی"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={mode === key ? "primary" : "secondary"}
            onClick={() => {
              setMode(key);
              setPreviews([]);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {mode === "pace" ? (
        <>
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300 mb-4">
            برای هر درس، حداقل سه کارِ یادگیریِ تمام‌شده در ۹۰ روز اخیر مقایسه
            می‌شوند. میانهٔ زمان واقعی به تخمین اولیه، مبنای پیشنهاد است؛ جلسهٔ
            ناقص یا زمان مرور با یادگیری مقایسه نمی‌شود.
          </p>
          {!estimates.length && (
            <Card>
              هنوز شواهد کافی یا اختلاف معناداری نداریم. مطالعه را با کارهای
              برنامه شروع و آن‌ها را تکمیل کن.
            </Card>
          )}
          {estimates.map((e) => {
            const key = e.sampleKey,
              accepted = state.settings.paceAccepted?.[e.subjectId] === key;
            return (
              <Card key={e.subjectId} className="mb-3">
                <h3 className="font-bold">{e.name}</h3>
                <p className="text-sm my-2">
                  {toFa(e.samples)} نمونه · زمان واقعی حدود{" "}
                  {toFa(Math.round(e.factor * 100))}٪ تخمین اولیه
                </p>
                <details>
                  <summary className="text-sm cursor-pointer text-teal-700">
                    دیدن تغییر تخمین‌ها
                  </summary>
                  <ul className="text-xs leading-7">
                    {e.topicChanges.map((c) => (
                      <li key={c.id}>
                        {state.topics.find((t) => t.id === c.id)?.name}:{" "}
                        {formatMinutes(c.before)} ← {formatMinutes(c.after)}
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="text-xs text-slate-500 my-3">
                  فقط تخمین مباحث برای ساخت برنامه‌های بعدی تغییر می‌کند؛
                  برنامهٔ فعلی و زمان ثبت‌شده دست‌نخورده می‌مانند.
                </p>
                <Button
                  disabled={accepted || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await saveHistory(state, "پیش از اصلاح تخمین زمان");
                      acceptPace(e, key);
                    } catch {
                      setError("ذخیرهٔ نسخهٔ ایمنی ناموفق بود.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {accepted
                    ? "این شواهد قبلاً اعمال شده"
                    : "تأیید اصلاح تخمین‌ها"}
                </Button>
              </Card>
            );
          })}
        </>
      ) : (
        <>
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300 mb-4">
            {mode === "rescue"
              ? "یک روز سخت قرار نیست کل برنامه را خراب کند. ظرفیت باقی‌ماندهٔ امروز را بگو؛ قبل از اعمال، جابه‌جایی‌ها را ببین."
              : "آینده را بدون دست‌زدن به برنامه آزمایش کن. پوشش زمانیِ تسک‌ها تخمین زده می‌شود، نه احتمال قبولی."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {mode === "rescue" && (
              <label className="text-sm">
                وقت باقی‌ماندهٔ امروز
                <input
                  aria-label="وقت باقی‌ماندهٔ امروز"
                  type="number"
                  min="0"
                  max="720"
                  className={inputClass}
                  value={todayMinutes}
                  onChange={(e) => {
                    setTodayMinutes(
                      Math.max(0, Math.min(720, Number(e.target.value))),
                    );
                    setPreviews([]);
                  }}
                />
              </label>
            )}
            <label className="text-sm">
              ظرفیت روزانه (دقیقه)
              <input
                aria-label="ظرفیت روزانه"
                type="number"
                min="15"
                max="720"
                className={inputClass}
                value={daily}
                onChange={(e) => {
                  setDaily(Number(e.target.value));
                  setPreviews([]);
                }}
              />
            </label>
            <label className="text-sm">
              بازهٔ مقایسه
              <select
                aria-label="بازه مقایسه"
                className={inputClass}
                value={horizon}
                onChange={(e) => {
                  setHorizon(Number(e.target.value));
                  setPreviews([]);
                }}
              >
                {[7, 14, 30, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {toFa(n)} روز
                  </option>
                ))}
              </select>
            </label>
          </div>
          {mode === "rescue" && (
            <label className="flex gap-2 my-4 text-sm">
              <input
                type="checkbox"
                checked={energy}
                onChange={(e) => {
                  setEnergy(e.target.checked);
                  setPreviews([]);
                }}
              />
              انرژی‌ام کم است؛ کار سبک‌تر اول باشد
            </label>
          )}
          <fieldset className="my-4">
            <legend className="text-sm mb-2">روزهای استراحت (اختیاری)</legend>
            <div className="flex flex-wrap gap-2">
              {[6, 0, 1, 2, 3, 4, 5].map((w) => (
                <label
                  key={w}
                  className="text-xs flex gap-1 p-2 rounded-lg bg-slate-100 dark:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={off.includes(w)}
                    onChange={() => {
                      setOff((x) =>
                        x.includes(w) ? x.filter((d) => d !== w) : [...x, w],
                      );
                      setPreviews([]);
                    }}
                  />
                  {WEEKDAYS_FA[w]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs leading-6 text-slate-500 mb-3">
            برنامهٔ موجود: {toFa(baseline.length)} کار در {toFa(baselineDays)}{" "}
            روز؛{" "}
            {formatMinutes(
              baseline.reduce(
                (n, t) => n + Math.max(0, t.plannedMinutes - t.doneMinutes),
                0,
              ),
            )}{" "}
            باقی‌مانده. کلاس‌ها از ظرفیت آینده کم می‌شوند؛ وقت امروز را خالص
            وارد کن. مهلت برنامه و امتحان، روزهای مجاز و موعد زودترین مرور رعایت
            می‌شوند. تسک بزرگ‌تر از ظرفیت روز، خودکار خرد نمی‌شود.
          </p>
          <Button
            className="w-full"
            onClick={preview}
            disabled={!Number.isFinite(daily) || daily < 15 || daily > 720}
          >
            ساخت پیش‌نمایش بدون تغییر برنامه
          </Button>
          {previews.map((p) => (
            <Card key={p.title} className="mt-4">
              <h3 className="font-bold">{p.title}</h3>
              <div className="grid grid-cols-2 gap-3 my-3 text-sm">
                <div>پوشش زمان کارها: {toFa(p.result.coverage)}٪</div>
                <div>{toFa(p.result.changes.length)} جابه‌جایی</div>
              </div>
              {p.result.warnings.map((w) => (
                <p
                  key={w}
                  className="text-xs leading-6 text-amber-700 dark:text-amber-300 mb-2"
                >
                  {w}
                </p>
              ))}
              <details>
                <summary className="cursor-pointer text-sm text-teal-700">
                  بار روزها و تغییرات دقیق
                </summary>
                <ul className="text-xs leading-7 my-2">
                  {p.result.days.map((d) => (
                    <li key={d.date}>
                      {formatJalaliShort(d.date)}: {formatMinutes(d.minutes)} از{" "}
                      {formatMinutes(d.capacity)}
                    </li>
                  ))}
                </ul>
                <ul className="text-xs leading-7">
                  {p.result.changes.map((c) => (
                    <li key={c.id}>
                      {
                        state.topics.find(
                          (t) =>
                            t.id ===
                            state.tasks.find((t) => t.id === c.id)?.topicId,
                        )?.name
                      }
                      : {formatJalaliShort(c.from)} ← {formatJalaliShort(c.to)}
                    </li>
                  ))}
                </ul>
                {p.result.unscheduled.map((t) => (
                  <p key={t.id} className="text-xs text-rose-600">
                    جا نشده:{" "}
                    {state.topics.find((x) => x.id === t.topicId)?.name} ·{" "}
                    {formatMinutes(t.plannedMinutes - t.doneMinutes)}
                  </p>
                ))}
              </details>
              <Button
                className="mt-3"
                disabled={
                  busy ||
                  p.result.unscheduled.length > 0 ||
                  !p.result.changes.length ||
                  p.fingerprint !== planningFingerprint(state)
                }
                onClick={() => void apply(p)}
              >
                {p.fingerprint !== planningFingerprint(state)
                  ? "داده عوض شده؛ پیش‌نمایش تازه بساز"
                  : "ذخیرهٔ نسخهٔ ایمنی و اعمال این سناریو"}
              </Button>
            </Card>
          ))}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-600 my-3">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm mt-3">
          در حال ذخیرهٔ نسخهٔ ایمنی…
        </p>
      )}
      <p className="text-xs text-slate-500 mt-5">
        قبل از اعمال، نسخهٔ قبلی در «تنظیمات ← وضعیت ذخیره و تاریخچه» نگه داشته
        می‌شود.
      </p>
    </Modal>
  );
}
