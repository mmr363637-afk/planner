import { useAmbient } from "../ambient";
import { AMBIENT_PRESETS, AMBIENT_SOUNDS } from "../lib/ambient";
import { toFa } from "../lib/jalali";
import type { AmbientSoundId } from "../types";
import { cn } from "../utils/cn";
import { Button, Modal, PauseIcon, PlayIcon } from "./ui";

// ===== اجزای صداهای محیطی (White Noise) =====

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

/** میکسر کامل: پخش/توقف، حجم کلی، ترکیب‌های آماده و سه اسلایدر مستقل */
export function AmbientMixerModal() {
  const { mixerOpen, closeMixer, playing, busy, supported, master, setMaster, levels, applyPreset, togglePlay, resetLevels, activeSounds } = useAmbient();
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
          <div className="text-[10px] text-slate-400 mt-0.5">صدا هنگام جابه‌جایی بین صفحه‌ها ادامه دارد</div>
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

      {/* ترکیب‌های آماده */}
      <div className="mb-4">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">ترکیب‌های آماده</div>
        <div className="flex flex-wrap gap-2">
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

      {/* سه صدا با حجم مستقل = میکس */}
      <div className="flex flex-col gap-2">
        {AMBIENT_SOUNDS.map((s) => (
          <SoundRow key={s.id} id={s.id} />
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-400 mt-4">
        این صداها در لحظه روی دستگاهت ساخته می‌شوند (نه فایل صوتی): بی‌نهایت و بدون درزِ تکرار پخش می‌شوند، اینترنت مصرف
        نمی‌کنند و آفلاین هم کار می‌کنند.
      </p>
    </Modal>
  );
}

/** کارت جمع‌وجور برای صفحه‌ی مطالعه: سه کلید سریع + ورود به میکسر */
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
            {playing ? "در حال پخش — برای میکس باز کن" : "باران، رعد و برق و رودخانه برای تمرکز بیشتر"}
          </div>
        </div>
        <button type="button" onClick={openMixer} className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 shrink-0">
          میکس ←
        </button>
      </div>
      <div className="flex items-center gap-2 mt-3">
        {AMBIENT_SOUNDS.map((s) => {
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
