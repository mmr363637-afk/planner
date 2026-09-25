import { useEffect, useMemo, useRef, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, inputClass } from "./ui";
import { cn } from "../utils/cn";
import { formatMinutes } from "../lib/jalali";
import { getSupabaseClient, getSupabaseConfig, isSupabaseConfigured } from "../lib/supabaseSync";
import { CHEERS, channelName, mergeMember, normalizeRoomCode, parseRoomMessage, pruneMembers, randomRoomCode, type RoomMember, type RoomTick } from "../lib/groupRoom";
import { totalStudyMs as activeTotalStudyMs } from "../lib/sessionTime";
import { trackFeature } from "../lib/usage";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * 🌐 اتاق مطالعه‌ی گروهی (حالت ابریِ اختیاری/آزمایشی).
 * اتاق دونفره‌ی P2P بالا کاملاً آفلاین است و دست‌نخورده می‌ماند؛ این پنل فقط وقتی
 * کار می‌کند که سینک Supabase وصل باشد — وگرنه راهنما نشان می‌دهد و به حالت
 * دونفره ارجاع می‌دهد. کانال Realtime: broadcast (تیکِ تایمر) + presence (اعضا).
 */
export default function GroupRoomPanel({ onExit }: { onExit: () => void }) {
  const { state, toast } = useStore();
  const { topicById } = useLookups();
  const configured = isSupabaseConfigured(state.settings);

  const [code, setCode] = useState("");
  const [myName, setMyName] = useState(() => `مهمان${Math.floor(Math.random() * 90 + 10)}`);
  const myNameRef = useRef(myName);
  myNameRef.current = myName.trim().slice(0, 24) || "مهمان";
  const [joined, setJoined] = useState<string | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [cheers, setCheers] = useState<{ name: string; emoji: string; at: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const active = state.activeSession;
  const activeDesc = useMemo(() => {
    if (!active) return { running: false, topic: "استراحت", minutes: 0 };
    const topic = active.topicId != null ? topicById.get(active.topicId)?.name ?? "مطالعه بدون درس" : "مطالعه بدون درس";
    return { running: active.running, topic, minutes: Math.floor(activeTotalStudyMs(active, Date.now()) / 60000) };
  }, [active, topicById]);
  const descRef = useRef(activeDesc);
  descRef.current = activeDesc;

  const join = (raw: string) => {
    const normalized = normalizeRoomCode(raw);
    if (!normalized) {
      setError("کد اتاق باید حداقل ۴ حرف/رقم باشد.");
      return;
    }
    if (!configured) {
      setError("برای اتاق گروهی، سینک ابری (Supabase) باید در «تنظیمات ← داده‌ها» فعال باشد. اتاق دونفره‌ی P2P بدون هیچ سروری کار می‌کند.");
      return;
    }
    setError(null);
    trackFeature("study_room");
    try {
      const sb = getSupabaseClient(getSupabaseConfig(state.settings));
      channelRef.current?.unsubscribe();
      const ch = sb.channel(channelName(normalized), { config: { broadcast: { self: false } } });
      ch.on("broadcast", { event: "room" }, ({ payload }) => {
        const msg = parseRoomMessage(payload);
        if (!msg) return;
        if (msg.type === "tick") setMembers((list) => pruneMembers(mergeMember(list, msg), Date.now()));
        else setCheers((c) => [...c.slice(-8), { name: msg.name, emoji: msg.emoji, at: Date.now() }]);
      });
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setJoined(normalized);
          sendTick(ch);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError("اتصال به کانال گروهی برقرار نشد — شبکه یا وضعیت پروژه‌ی Supabase را بررسی کن.");
        }
      });
      channelRef.current = ch;
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته در اتصال گروهی.");
    }
  };

  const sendTick = (ch = channelRef.current) => {
    if (!ch) return;
    const d = descRef.current;
    const tick: RoomTick = { type: "tick", name: myNameRef.current, running: d.running, elapsedMinutes: d.minutes, topicName: d.topic === "استراحت" ? null : d.topic, at: Date.now() };
    void ch.send({ type: "broadcast", event: "room", payload: tick });
  };

  // بیکن حضور هر ۱۰ ثانیه + هرس اعضای ساکت
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(() => {
      sendTick();
      setMembers((list) => pruneMembers(list, Date.now()));
    }, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  // پاکسازی هنگام بستن
  useEffect(() => {
    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, []);

  // محو شدن تشویق‌ها
  useEffect(() => {
    if (cheers.length === 0) return;
    const id = setTimeout(() => setCheers((c) => c.slice(1)), 3500);
    return () => clearTimeout(id);
  }, [cheers]);

  const cheer = (emoji: string) => {
    if (!channelRef.current) return;
    void channelRef.current.send({ type: "broadcast", event: "room", payload: { type: "cheer", name: myNameRef.current, emoji, at: Date.now() } });
  };

  if (!configured) {
    return (
      <Card className="text-center py-4">
        <div className="text-3xl mb-2">🌐</div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">اتاق گروهی به سینک ابری وصل است</div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
          اتاق دونفره (بالا) کاملاً آفلاین و P2P است و همیشه کار می‌کند. برای اتاقِ بیش از دو نفر،
          پروژه‌ی Supabase باید در «تنظیمات ← داده‌ها ← همگام‌سازی ابری» متصل باشد.
        </p>
        <Button variant="ghost" size="sm" onClick={onExit}>برگشت</Button>
      </Card>
    );
  }

  return (
    <div>
      {!joined ? (
        <Card>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">🌐 اتاق گروهی (آزمایشی)</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
            یک کد اتاق بساز و برای هم‌گروهی‌هایت بفرست؛ همه با همان کد وارد می‌شوند. وضعیت تایمر و
            تشویق‌ها بین اعضا پخش می‌شود — بدون ذخیره‌ی هیچ داده‌ای روی سرور (فقط کانال زنده).
          </p>
          <div className="flex gap-2 mb-2">
            <input className={cn(inputClass, "flex-1")} dir="ltr" placeholder="کد اتاق (مثلاً MED42)" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button size="sm" onClick={() => join(code)}>ورود</Button>
          </div>
          <input className={cn(inputClass, "mb-2")} placeholder="نامی که بقیه می‌بینند" value={myName} onChange={(e) => setMyName(e.target.value.slice(0, 24))} />
          <Button variant="outline" size="sm" className="w-full" onClick={() => { const c = randomRoomCode(); setCode(c); join(c); }}>
            🎲 ساخت اتاق تازه
          </Button>
          {error && <p className="text-[11px] text-rose-500 mt-2 leading-relaxed">{error}</p>}
        </Card>
      ) : (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-bold mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            اتاق <span dir="ltr">{joined}</span> · {formatMinutes(activeDesc.minutes)}
          </div>

          <div className="h-12 flex items-center justify-center gap-2 flex-wrap">
            {cheers.slice(-4).map((c, i) => (
              <span key={c.at + i} className="animate-slide-up text-2xl bg-white dark:bg-slate-800 shadow rounded-full w-10 h-10 flex items-center justify-center">{c.emoji}</span>
            ))}
          </div>

          <Card className="my-3 text-right">
            <div className="text-[11px] text-slate-400 mb-2">اعضای آنلاین (تیک هر ۱۰ ثانیه)</div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-700/50">
              <span className="text-sm font-bold text-teal-700 dark:text-teal-300">تو</span>
              <span className="text-xs text-slate-500">{activeDesc.running ? "📖 در حال مطالعه" : "⏸ مکث"} · {activeDesc.topic}</span>
            </div>
            {members.length === 0 && <div className="text-xs text-slate-400 py-2">هنوز عضو دیگری نیامده — کد <b dir="ltr">{joined}</b> را بفرست.</div>}
            {members.map((m) => (
              <div key={m.name} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{m.name}</span>
                <span className="text-xs text-slate-500">{m.running ? "📖 در حال مطالعه" : "⏸ مکث"} · {m.topicName ?? "—"} · {formatMinutes(m.elapsedMinutes)}</span>
              </div>
            ))}
          </Card>

          <div className="flex gap-1.5 justify-center mb-3" aria-label="تشویق">
            {CHEERS.map((e) => (
              <button key={e} type="button" onClick={() => cheer(e)} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 hover:scale-110 transition-transform text-lg">
                {e}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { void navigator.clipboard?.writeText(joined).then(() => toast("کد اتاق کپی شد", "📋")).catch(() => undefined); }}>
              📋 کپی کد اتاق
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" onClick={() => { channelRef.current?.unsubscribe(); channelRef.current = null; setJoined(null); setMembers([]); }}>
              خروج از اتاق
            </Button>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            هیچ داده‌ای روی سرور ذخیره نمی‌شود؛ کانال فقط زنده است و با خروجِ تو پاک می‌شود. عضوِ
            ساکت بعد از ۹۰ ثانیه از فهرست حذف می‌شود.
          </p>
        </div>
      )}
    </div>
  );
}
