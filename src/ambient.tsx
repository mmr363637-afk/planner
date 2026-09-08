import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "./store";
import { AMBIENT_IDS, AMBIENT_SOUNDS, ambientEngine, ambientSupported, defaultVolumes, normalizeVolumes } from "./lib/ambient";
import { bindMediaSessionHandlers, clearMediaSession, updateMediaSession } from "./lib/mediaSession";
import { DEFAULT_AMBIENT, type AmbientSoundId, type AmbientUserPreset, type BinauralBandId } from "./types";

/**
 * لایه‌ی React موتور صداهای محیطی.
 *
 * چرا یک Provider جدا از Store؟ چون «در حال پخش بودن» یک وضعیت زمانِ‌اجراست (نه داده‌ی
 * قابل ذخیره): مرورگرها پخش صدا را بدون اشاره‌ی کاربر آزاد نمی‌کنند، پس بعد از رفرش
 * نباید خودکار پخش شود. اما *میکس* (حجم هر صدا + حجم کلی + پریست‌های کاربر) در تنظیمات
 * ذخیره می‌شود تا دفعه‌ی بعد همان ترکیب آماده باشد.
 *
 * Provider در سطح App سوار می‌شود تا صدا هنگام جابه‌جایی بین صفحه‌ها قطع نشود.
 * همچنین Media Session را هم این‌جا می‌دوزد تا کنترل از صفحه‌ی قفل گوشی ممکن شود.
 */
export interface AmbientApi {
  supported: boolean;
  playing: boolean;
  busy: boolean;
  mixerOpen: boolean;
  levels: Record<AmbientSoundId, number>;
  master: number;
  /** صداهایی که حجمشان صفر نیست (برای نمایش وضعیت روی آیکون) */
  activeSounds: AmbientSoundId[];
  openMixer: () => void;
  closeMixer: () => void;
  togglePlay: () => void;
  setLevel: (id: AmbientSoundId, value: number) => void;
  setMaster: (value: number) => void;
  /** خاموش/روشن سریع یک صدا (با یادآوری حجم قبلی) */
  toggleSound: (id: AmbientSoundId) => void;
  applyPreset: (volumes: Partial<Record<AmbientSoundId, number>>) => void;
  resetLevels: () => void;
  /** خاموشی خودکار (اختیاری): تعداد دقیقه یا null=پخش دائمی */
  sleepMinutes: number | null;
  /** ثانیه‌های باقی‌مانده تا خاموشی (وقتی تایمر فعال و در حال پخش است) */
  sleepRemainingSec: number | null;
  setSleepMinutes: (minutes: number | null) => void;
  /** باند ضربان دوگوشی (آلفا/بتا/تتا/دلتا) */
  binauralBand: BinauralBandId;
  setBinauralBand: (band: BinauralBandId) => void;
  /** واکنش به پومودورو: کم‌شدن نرمِ صدا در فاز استراحت */
  reactiveDuck: boolean;
  setReactiveDuck: (v: boolean) => void;
  /** پریست‌هایی که خودِ کاربر ساخته است */
  customPresets: AmbientUserPreset[];
  saveCustomPreset: (label: string, icon?: string) => boolean;
  deleteCustomPreset: (id: string) => void;
}

const AmbientContext = createContext<AmbientApi | null>(null);

const sameLevels = (a: Record<AmbientSoundId, number>, b: Record<AmbientSoundId, number>) =>
  AMBIENT_IDS.every((id) => Math.abs((a[id] ?? 0) - (b[id] ?? 0)) < 1e-4);

const MAX_USER_PRESETS = 24;

export function AmbientProvider({ children }: { children: ReactNode }) {
  const { state, updateSettings, toast } = useStore();
  const cfg = state.settings.ambient ?? DEFAULT_AMBIENT;
  const binauralBand: BinauralBandId = cfg.binauralBand ?? DEFAULT_AMBIENT.binauralBand ?? "alpha";
  const reactiveDuck = cfg.reactiveDuck === true;
  const customPresets = cfg.customPresets ?? [];

  const [supported] = useState(() => ambientSupported());
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [levels, setLevels] = useState<Record<AmbientSoundId, number>>(() => normalizeVolumes(cfg.volumes));
  const [master, setMaster] = useState<number>(() => Math.max(0, Math.min(1, cfg.master ?? DEFAULT_AMBIENT.master)));
  // خاموشی خودکار (اختیاری): کاربر می‌تواند پخشِ دائمی نگه دارد یا مدت‌زمان بگذارد.
  const [sleepMinutes, setSleepMinutesState] = useState<number | null>(null);
  const [sleepEndAt, setSleepEndAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now()); // فقط برای شمارش معکوسِ زنده

  // حجم قبلی هر صدا، تا با خاموش/روشن سریع به همان بلندی برگردد
  const remembered = useRef<Partial<Record<AmbientSoundId, number>>>({});
  const levelsRef = useRef(levels);
  levelsRef.current = levels;
  const masterRef = useRef(master);
  masterRef.current = master;
  const updateRef = useRef(updateSettings);
  updateRef.current = updateSettings;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // اگر تنظیمات از جای دیگری عوض شد (بازیابی پشتیبان، حذف داده‌ها، ریست) همگام شو
  const savedSignature = `${cfg.master ?? DEFAULT_AMBIENT.master}|${AMBIENT_IDS.map((id) => cfg.volumes?.[id] ?? "").join(",")}`;
  useEffect(() => {
    const nextLevels = normalizeVolumes(cfg.volumes);
    const nextMaster = Math.max(0, Math.min(1, cfg.master ?? DEFAULT_AMBIENT.master));
    setLevels((prev) => (sameLevels(prev, nextLevels) ? prev : nextLevels));
    setMaster((prev) => (Math.abs(prev - nextMaster) < 1e-4 ? prev : nextMaster));
    // فقط وقتی امضای مقدارها عوض شود؛ نه هر بار که آبجکت تنظیمات از نو ساخته می‌شود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSignature]);

  // ذخیره‌ی میکس در تنظیمات (با تأخیر تا کشیدن اسلایدر باعث نوشتن‌های پیاپی نشود)
  // مهم: کل آبجکت ambient را از روی نسخه‌ی تازه می‌سازیم تا کلیدهای دیگر
  // (customPresets, binauralBand, reactiveDuck) هنگام ذخیره پاک نشوند.
  const firstPersist = useRef(true);
  useEffect(() => {
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
    const id = setTimeout(() => updateRef.current({ ambient: { ...cfgRef.current, volumes: levels, master } }), 400);
    return () => clearTimeout(id);
  }, [levels, master]);

  // انتقال میکس به موتور صوتی
  useEffect(() => {
    ambientEngine.setLevels(levels);
  }, [levels]);
  useEffect(() => {
    ambientEngine.setMaster(master);
  }, [master]);

  // باند ضربان دوگوشی ← تنظیمات ذخیره‌شده (جایی دیگر هم می‌تواند تغییرش دهد)
  useEffect(() => {
    ambientEngine.setBinauralBand(binauralBand);
  }, [binauralBand]);

  // واکنش به پومودورو: در فاز استراحت صدا نرم می‌شود (اگر کاربر روشنش کرده باشد)
  const phase = !state.activeSession
    ? null
    : state.activeSession.mode === "pomodoro" && state.activeSession.phase !== "work"
      ? ("break" as const)
      : ("work" as const);
  useEffect(() => {
    ambientEngine.setFocusPhase(phase, reactiveDuck);
  }, [phase, reactiveDuck]);

  // ---- Media Session: پخش صدا در صفحه‌ی قفل/نوتیفیکیشن کنترل‌شدنی است ----
  useEffect(() => {
    bindMediaSessionHandlers({
      onPlay: () => {
        void ambientEngine.start(levelsRef.current, masterRef.current).then((ok) => setPlaying(ok));
      },
      onPause: () => {
        ambientEngine.stop();
        setPlaying(false);
      },
    });
    return () => {
      clearMediaSession();
    };
  }, []);
  useEffect(() => {
    updateMediaSession(playing, levels);
  }, [playing, levels]);

  // اگر کاربر اپ را بست/پنهان کرد، پخش را متوقف کن تا بی‌جهت CPU مصرف نشود.
  // (با ref تا تغییر وضعیت پخش، cleanup این افکت را اجرا نکند و صدا را قطع نکند)
  const playingRef = useRef(false);
  playingRef.current = playing;
  useEffect(() => {
    const onPageHide = () => {
      if (!playingRef.current) return;
      ambientEngine.stop();
      setPlaying(false);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      ambientEngine.stop();
    };
  }, []);

  // وقتی پخش شروع می‌شود و کاربر مدت‌زمانی برای خاموشی انتخاب کرده، تایمر را کوک کن
  useEffect(() => {
    if (playing && sleepMinutes != null && sleepEndAt == null) {
      const end = Date.now() + sleepMinutes * 60000;
      setSleepEndAt(end);
      setNow(Date.now());
    }
    if (!playing) setSleepEndAt(null);
    // عمداً فقط به playing وابسته است؛ انتخابِ مدت، در setSleepMinutes مدیریت می‌شود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // شمارش معکوس زنده + خاموش کردن خودکار وقتی زمان تمام می‌شود
  useEffect(() => {
    if (!playing || sleepEndAt == null) return;
    const id = setInterval(() => {
      const remaining = sleepEndAt - Date.now();
      if (remaining <= 0) {
        ambientEngine.stop();
        setPlaying(false);
        setSleepEndAt(null);
        setSleepMinutesState(null);
        toastRef.current("زمان خاموشی رسید؛ صدا متوقف شد", "⏰");
      } else {
        setNow(Date.now());
      }
    }, 500);
    return () => clearInterval(id);
  }, [playing, sleepEndAt]);

  const setSleepMinutes = useCallback(
    (minutes: number | null) => {
      setSleepMinutesState(minutes);
      if (playing) setSleepEndAt(minutes == null ? null : Date.now() + minutes * 60000);
      else setSleepEndAt(null);
    },
    [playing],
  );

  const togglePlay = useCallback(() => {
    if (!supported) {
      toastRef.current("مرورگر شما از پخش صدای محیطی پشتیبانی نمی‌کند", "⚠️");
      return;
    }
    if (playing) {
      ambientEngine.stop();
      setPlaying(false);
      return;
    }
    setBusy(true);
    void ambientEngine
      .start(levels, master)
      .then((ok) => {
        setPlaying(ok);
        if (ok) {
          const names = AMBIENT_SOUNDS.filter((s) => levels[s.id] > 0.001).map((s) => s.label);
          toastRef.current(names.length > 0 ? `پخش شد: ${names.join(" + ")}` : "پخش شد — ولی همه‌ی صداها خاموش‌اند", "🎧");
        } else {
          toastRef.current("پخش صدا شروع نشد؛ یک بار دیگر امتحان کن", "⚠️");
        }
      })
      .finally(() => setBusy(false));
  }, [playing, supported, levels, master, toastRef]);

  const setLevel = useCallback((id: AmbientSoundId, value: number) => {
    const v = Math.max(0, Math.min(1, value));
    if (v > 0.001) remembered.current[id] = v; // تا «روشن کردن» به همان بلندی برگردد
    setLevels((prev) => ({ ...prev, [id]: v }));
  }, []);

  const toggleSound = useCallback((id: AmbientSoundId) => {
    const current = levelsRef.current[id] ?? 0;
    if (current > 0.001) {
      remembered.current[id] = current;
      setLevels((prev) => ({ ...prev, [id]: 0 }));
    } else {
      const restore = remembered.current[id] ?? (defaultVolumes()[id] || 0.6);
      setLevels((prev) => ({ ...prev, [id]: restore }));
    }
  }, []);

  const applyPreset = useCallback((volumes: Partial<Record<AmbientSoundId, number>>) => {
    setLevels(normalizeVolumes(volumes));
  }, []);

  const resetLevels = useCallback(() => {
    setLevels(defaultVolumes());
    setMaster(DEFAULT_AMBIENT.master);
    remembered.current = {};
  }, []);

  const setBinauralBand = useCallback((band: BinauralBandId) => {
    ambientEngine.setBinauralBand(band);
    updateRef.current({ ambient: { ...cfgRef.current, binauralBand: band } });
  }, []);

  const setReactiveDuck = useCallback((v: boolean) => {
    ambientEngine.setFocusPhase(null, v); // در افکت بعدی فازِ واقعی اعمال می‌شود
    updateRef.current({ ambient: { ...cfgRef.current, reactiveDuck: v } });
  }, []);

  const saveCustomPreset = useCallback(
    (label: string, icon = "🎧") => {
      const trimmed = label.trim().slice(0, 40);
      if (!trimmed) return false;
      const cur = cfgRef.current.customPresets ?? [];
      if (cur.length >= MAX_USER_PRESETS) {
        toastRef.current(`حداکثر ${MAX_USER_PRESETS} پریست شخصی می‌توانی داشته باشی`, "⚠️");
        return false;
      }
      const preset: AmbientUserPreset = {
        id: `user-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        label: trimmed,
        icon: icon || "🎧",
        volumes: { ...levelsRef.current },
      };
      updateRef.current({ ambient: { ...cfgRef.current, customPresets: [...cur, preset] } });
      toastRef.current(`پریست «${trimmed}» ذخیره شد`, "💾");
      return true;
    },
    [toastRef],
  );

  const deleteCustomPreset = useCallback(
    (id: string) => {
      const cur = cfgRef.current.customPresets ?? [];
      const found = cur.find((p) => p.id === id);
      updateRef.current({ ambient: { ...cfgRef.current, customPresets: cur.filter((p) => p.id !== id) } });
      if (found) toastRef.current(`پریست «${found.label}» حذف شد`, "🗑");
    },
    [toastRef],
  );

  const sleepRemainingSec = sleepEndAt != null && playing ? Math.max(0, Math.ceil((sleepEndAt - now) / 1000)) : null;

  const api = useMemo<AmbientApi>(
    () => ({
      supported,
      playing,
      busy,
      mixerOpen,
      levels,
      master,
      activeSounds: AMBIENT_IDS.filter((id) => levels[id] > 0.001),
      openMixer: () => setMixerOpen(true),
      closeMixer: () => setMixerOpen(false),
      togglePlay,
      setLevel,
      setMaster,
      toggleSound,
      applyPreset,
      resetLevels,
      sleepMinutes,
      sleepRemainingSec,
      setSleepMinutes,
      binauralBand,
      setBinauralBand,
      reactiveDuck,
      setReactiveDuck,
      customPresets,
      saveCustomPreset,
      deleteCustomPreset,
    }),
    [
      supported, playing, busy, mixerOpen, levels, master, togglePlay, setLevel, setMaster, toggleSound, applyPreset, resetLevels,
      sleepMinutes, sleepRemainingSec, setSleepMinutes, binauralBand, setBinauralBand, reactiveDuck, setReactiveDuck,
      customPresets, saveCustomPreset, deleteCustomPreset,
    ],
  );

  return <AmbientContext.Provider value={api}>{children}</AmbientContext.Provider>;
}

export function useAmbient(): AmbientApi {
  const ctx = useContext(AmbientContext);
  if (!ctx) throw new Error("useAmbient must be used within AmbientProvider");
  return ctx;
}
