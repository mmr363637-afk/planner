import { useState } from "react";
import { useAmbient } from "../ambient";
import { AMBIENT_GROUP_META, AMBIENT_PRESETS, AMBIENT_QUICK_IDS, AMBIENT_SOUNDS, BINAURAL_BANDS, autoMixForHour, type AmbientGroupId } from "../lib/ambient";
import { toFa } from "../lib/jalali";
import type { AmbientSoundId } from "../types";
import { cn } from "../utils/cn";
import { Button, Modal, PauseIcon, PlayIcon, TimerIcon, Toggle, inputClass } from "./ui";

// ===== اجزای صداهای محیطی (Colored Noise + موتورهای مولد) =====

/** نوارهای متحرک کوچک که نشان می‌دهند صدا در حال پخش است */
export function AmbientBars({ active, className }: { active: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-end gap-[2px] h-3.5", className)} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn("w-[2px] rounded-full bg-current", active ? "animate-eq" : "h-1 opacity-40")}
          style={active ? { animationDelay: `${i * 0.16}s` } : undefined}
        />
      ))}
    </span>
  );
}

/** حجم (۰ تا ۱۰۰) به‌صورت اسلایدر — همیشه LTR تا جهت پرشدن برای کاربر طبیعی باشد */
export function LevelSlider({ value, onChange, disabled, ariaLabel }: { value: number; onChange: (v: number) => void; disabled?: boolean; ariaLabel?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      dir="ltr"
      value={pct}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      className="ambient-slider"
      style={{ ["--fill" as string]: `${pct}%` }}
    />
  );
}

/** گزینه‌های خاموشی خودکار: دائمی (null) یا چند پیش‌گزیده‌ی زمانی */
const SLEEP_OPTIONS: { minutes: number | null; label: string }[] = [
  { minutes: null, label: "دائمی" },
  { minutes: 5, label: "۵ دقیقه" },
  { minutes: 15, label: "۱۵ دقیقه" },
  { minutes: 30, label: "۳۰ دقیقه" },
  { minutes: 45, label: "۴۵ دقیقه" },
  { minutes: 60, label: "۶۰ دقیقه" },
];

function formatCountdown(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** خاموشی خودکارِ اختیاری: کاربر می‌تواند پخشِ دائمی نگه دارد یا تایمر بگذارد. */
function SleepTimerSection({
  playing,
  supported,
  sleepMinutes,
  remainingSec,
  setSleepMinutes,
}: {
  playing: boolean;
  supported: boolean;
  sleepMinutes: number | null;
  remainingSec: number | null;
  setSleepMinutes: (minutes: number | null) => void;
}) {
  const active = playing && remainingSec != null && remainingSec > 0;
  return (
    <div className="mb-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 p-3 bg-white dark:bg-slate-800/50">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <TimerIcon />
          خاموشی خودکار <span className="text-[10px] text-slate-400 font-normal">(اختیاری)</span>
        </span>
        {active ? (
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 tabular-nums">⏱ {toFa(formatCountdown(remainingSec))} مانده</span>
        ) : sleepMinutes != null && !playing ? (
          <span className="text-[10px] text-slate-400">با شروعِ پخش فعال می‌شود</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SLEEP_OPTIONS.map((opt) => {
          const selected = sleepMinutes === opt.minutes;
          return (
            <button
              key={opt.minutes ?? "off"}
              type="button"
              disabled={!supported}
              aria-pressed={selected}
              onClick={() => setSleepMinutes(opt.minutes)}
              title={`خاموشی خودکار: ${opt.label}`}
              className={cn(
                "text-[11px] px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40",
                selected
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-bold"
                  : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] leading-relaxed text-slate-400 mt-2">
        در حالت «دائمی» صدا تا وقتی خودت متوقفش کنی پخش می‌شود؛ با انتخاب یک مدت، بعد از آن خودکار خاموش می‌شود (مثلاً موقع خواب).
      </p>
    </div>
  );
}

/** انتخاب باندِ ضربان دوگوشی — فقط زیر لایه‌ی binaural نشان داده می‌شود */
function BinauralBandRow() {
  const { binauralBand, setBinauralBand } = useAmbient();
  return (
    <div className="mt-2 rounded-xl bg-white/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/60 p-2">
      <div className="text-[10px] text-slate-400 mb-1.5">باند موج مغزی (فقط با هدفون اثر دارد 🎧)</div>
      <div className="grid grid-cols-2 gap-1.5">
        {BINAURAL_BANDS.map((b) => {
          const on = binauralBand === b.id;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => setBinauralBand(b.id)}
              title={b.hint}
              className={cn(
                "text-[10px] px-2 py-1.5 rounded-lg border transition-colors text-right",
                on
                  ? "border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-bold"
                  : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400",
              )}
            >
              {b.label} · {toFa(b.beat)}Hz
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SoundRow({ id }: { id: AmbientSoundId }) {
  const { levels, setLevel, toggleSound } = useAmbient();
  const meta = AMBIENT_SOUNDS.find((s) => s.id === id)!;
  const value = levels[id];
  const on = value > 0.001;
  return (
    <div className={cn("rounded-2xl border p-3 transition-colors", on ? "border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-900/20" : "border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/60")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => toggleSound(id)}
          title={on ? `خاموش کردن ${meta.label}` : `روشن کردن ${meta.label}`}
          aria-pressed={on}
          className={cn(
            "w-11 h-11 rounded-2xl text-xl flex items-center justify-center shrink-0 border transition-all active:scale-95",
            on ? "bg-white dark:bg-slate-700 border-teal-300 dark:border-teal-600 shadow-sm" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60 grayscale",
          )}
        >
          {meta.icon}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-sm font-bold", on ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500")}>{meta.label}</span>
            <span className="text-[11px] tabular-nums text-slate-400">{toFa(Math.round(value * 100))}٪</span>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{meta.hint}</div>
        </div>
      </div>
      <div className="mt-2">
        <LevelSlider value={value} onChange={(v) => setLevel(id, v)} ariaLabel={`حجم ${meta.label}`} />
      </div>
      {id === "binaural" && <BinauralBandRow />}
    </div>
  );
}

/** بخش «پریست‌های من»: ذخیره‌ی میکس فعلی + اجرای/حذف میکس‌های ذخیره‌شده‌ی کاربر */
function UserPresetsSection() {
  const { customPresets, applyPreset, saveCustomPreset, deleteCustomPreset } = useAmbient();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const doSave = () => {
    if (saveCustomPreset(name)) {
      setName("");
      setSaving(false);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-slate-500 dark:text-slate-400">پریست‌های من</div>
        {!saving ? (
          <button type="button" onClick={() => setSaving(true)} className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline">
            💾 ذخیره میکس فعلی
          </button>
        ) : null}
      </div>
      {saving && (
        <div className="flex gap-2 mb-2">
          <input
            autoFocus
            className={cn(inputClass, "flex-1 !py-2 text-sm")}
            placeholder="نام پریست… مثلاً «شبِ امتحان»"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSave();
              if (e.key === "Escape") setSaving(false);
            }}
            maxLength={40}
          />
          <Button size="sm" disabled={name.trim() === ""} onClick={doSave}>
            ذخیره
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSaving(false)}>
            انصراف
          </Button>
        </div>
      )}
      {customPresets.length === 0 && !saving ? (
        <div className="text-[10px] text-slate-400">میکس علاقه‌ات را این‌جا ذخیره کن تا با یک لمس برگردد.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {customPresets.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => applyPreset(p.volumes)}
                title={`اجرای پریست «${p.label}»`}
                className="text-[11px] pr-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                {p.icon} {p.label}
              </button>
              <button
                type="button"
                onClick={() => deleteCustomPreset(p.id)}
                title={`حذف پریست «${p.label}»`}
                aria-label={`حذف پریست ${p.label}`}
                className="text-[10px] px-2 py-1.5 text-slate-400 hover:text-rose-500 border-r border-slate-100 dark:border-slate-700"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** دکمه‌ی ورود به میکسر (در نوار بالای اپ) */
export function AmbientTrigger() {
  const { playing, openMixer, supported } = useAmbient();
  return (
    <button
      type="button"
      onClick={openMixer}
      title="صداهای تمرکز"
      aria-label="صداهای تمرکز"
      className={cn(
        "relative w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
        playing ? "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40" : "text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60",
      )}
    >
      {playing ? <AmbientBars active /> : <HeadphonesIcon />}
      {!supported && <span className="sr-only">پشتیبانی نمی‌شود</span>}
    </button>
  );
}

/** میکسر کامل: پخش/توقف، حجم کلی، ترکیب‌های آماده و اسلایدرهای مستقل */
export function AmbientMixerModal() {
  const { mixerOpen, closeMixer, playing, busy, supported, master, setMaster, levels, applyPreset, togglePlay, resetLevels, activeSounds, sleepMinutes, sleepRemainingSec, setSleepMinutes, reactiveDuck, setReactiveDuck } = useAmbient();
  const mixLabel = activeSounds.length === 0 ? "همه‌ی صداها خاموش‌اند" : AMBIENT_SOUNDS.filter((s) => levels[s.id] > 0.001).map((s) => s.label).join(" + ");

  return (
    <Modal
      open={mixerOpen}
      onClose={closeMixer}
      title="🎧 صداهای تمرکز"
      footer={
        <>
          <Button variant="ghost" onClick={resetLevels}>
            حجم پیش‌فرض
          </Button>
          <Button onClick={togglePlay} disabled={!supported || busy}>
            {playing ? (
              <>
                <PauseIcon size={18} /> توقف
              </>
            ) : (
              <>
                <PlayIcon size={18} /> {busy ? "در حال آماده‌سازی…" : "شروع پخش"}
              </>
            )}
          </Button>
        </>
      }
    >
      {!supported && (
        <div className="mb-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
          ⚠️ مرورگر شما از Web Audio پشتیبانی نمی‌کند؛ پخش صدا ممکن نیست (میکس را می‌توانی ذخیره کنی).
        </div>
      )}

      {/* وضعیت پخش */}
      <div className={cn("rounded-2xl border p-4 flex items-center gap-4 mb-4", playing ? "border-teal-200 dark:border-teal-800/60 bg-gradient-to-l from-teal-50 to-white dark:from-teal-950/40 dark:to-slate-800/60" : "border-slate-200/70 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50")}>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!supported || busy}
          title={playing ? "توقف" : "پخش"}
          className={cn(
            "w-14 h-14 rounded-full text-white flex items-center justify-center shadow-lg shrink-0 transition active:scale-95 disabled:opacity-40",
            playing ? "bg-slate-700 dark:bg-slate-600" : "bg-teal-600",
          )}
        >
          {playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            {playing ? "در حال پخش" : "متوقف"}
            {playing && <AmbientBars active className="text-teal-500" />}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{mixLabel}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">صدا هنگام جابه‌جایی بین صفحه‌ها ادامه دارد — و از صفحه‌ی قفل هم کنترل می‌شود</div>
        </div>
      </div>

      {/* حجم کلی */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
          <span>حجم کلی</span>
          <span className="tabular-nums">{toFa(Math.round(master * 100))}٪</span>
        </div>
        <LevelSlider value={master} onChange={setMaster} ariaLabel="حجم کلی" />
      </div>

      {/* خاموشی خودکار (اختیاری) */}
      <SleepTimerSection playing={playing} supported={supported} sleepMinutes={sleepMinutes} remainingSec={sleepRemainingSec} setSleepMinutes={setSleepMinutes} />

      {/* واکنش به پومودورو */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 p-3 bg-white dark:bg-slate-800/50">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">🍅 واکنش به پومودورو</div>
          <div className="text-[10px] text-slate-400 leading-relaxed mt-0.5">در فاز استراحت، صدا نرم کم می‌شود و با شروع مطالعه برمی‌گردد.</div>
        </div>
        <Toggle checked={reactiveDuck} onChange={setReactiveDuck} label="واکنش به پومودورو" />
      </div>

      {/* ترکیب‌های آماده */}
      <div className="mb-4">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">ترکیب‌های آماده</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyPreset(autoMixForHour(new Date().getHours()))}
            title="ترکیب متناسب با همین ساعتِ روز"
            className="text-[11px] px-3 py-1.5 rounded-full border border-amber-300/70 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-bold transition-colors"
          >
            🌅 خودکارِ این ساعت
          </button>
          {AMBIENT_PRESETS.map((p) => {
            const active = AMBIENT_SOUNDS.every((s) => Math.abs(levels[s.id] - p.volumes[s.id]) < 0.02);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.volumes)}
                className={cn(
                  "text-[11px] px-3 py-1.5 rounded-full border transition-colors",
                  active
                    ? "border-teal-500 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-bold"
                    : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50",
                )}
              >
                {p.icon} {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* پریست‌های کاربر */}
      <UserPresetsSection />

      {/* همهٔ صداها با حجم مستقل = میکس — گروه‌بندی‌شده برای پیداکردن آسان */}
      {AMBIENT_GROUP_META.map((g: { id: AmbientGroupId; label: string; icon: string }) => {
        const rows = AMBIENT_SOUNDS.filter((s) => s.group === g.id);
        if (rows.length === 0) return null;
        return (
          <div key={g.id} className="mb-3">
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-1.5 flex items-center gap-1.5">
              <span aria-hidden="true">{g.icon}</span> {g.label}
              <span className="flex-1 h-px bg-slate-100 dark:bg-slate-700/60" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((s) => (
                <SoundRow key={s.id} id={s.id} />
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[10px] leading-relaxed text-slate-400 mt-4">
        این صداها در لحظه روی دستگاهت ساخته می‌شوند (نه فایل صوتی): بی‌نهایت و بدون درزِ تکرار پخش می‌شوند، اینترنت مصرف
        نمی‌کنند و آفلاین هم کار می‌کنند. «موسیقی زنده» هم هر بار از نو آهنگ‌سازی می‌شود 🎹
      </p>
    </Modal>
  );
}

/** کارت جمع‌وجور برای صفحه‌ی مطالعه: کلیدهای سریع + ورود به میکسر */
export function AmbientQuickCard({ className }: { className?: string }) {
  const { playing, busy, levels, togglePlay, toggleSound, openMixer, supported } = useAmbient();
  return (
    <div className={cn("rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/80 p-3", className)}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!supported || busy}
          title={playing ? "توقف صدای محیطی" : "پخش صدای محیطی"}
          className={cn(
            "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white transition active:scale-95 disabled:opacity-40",
            playing ? "bg-slate-700 dark:bg-slate-600" : "bg-teal-600",
          )}
        >
          {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            صداهای تمرکز
            {playing && <AmbientBars active className="text-teal-500" />}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {playing ? "در حال پخش — برای میکس باز کن" : "نویزهای رنگی، طبیعت و موسیقی زنده برای تمرکز"}
          </div>
        </div>
        <button type="button" onClick={openMixer} className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 shrink-0">
          میکس ←
        </button>
      </div>
      <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2 mt-3">
        {AMBIENT_QUICK_IDS.map((id) => {
          const s = AMBIENT_SOUNDS.find((x) => x.id === id)!;
          const on = levels[s.id] > 0.001;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSound(s.id)}
              title={`${on ? "خاموش" : "روشن"} کردن ${s.label}`}
              aria-pressed={on}
              className={cn(
                "flex-1 text-[11px] py-2 rounded-xl border transition-colors flex items-center justify-center gap-1.5",
                on
                  ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-bold"
                  : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500",
              )}
            >
              <span className={cn(!on && "grayscale opacity-70")}>{s.icon}</span>
              {s.label}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={openMixer} className="w-full text-[10px] text-slate-400 dark:text-slate-500 mt-2 hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
        + {toFa(AMBIENT_SOUNDS.length - AMBIENT_QUICK_IDS.length)} صدای دیگر در میکسر…
      </button>
    </div>
  );
}

function HeadphonesIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14h2.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
      <path d="M20 14h-2.5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1v-5z" />
    </svg>
  );
}
