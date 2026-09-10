// ===== اتاق مطالعه‌ی دونفره (P2P، بدون سرور) =====
// میزبان «کد دعوت» (QR/متن) می‌فرستد؛ مهمان «کد پاسخ» برمی‌گرداند.
// اتصال مستقیم WebRTC است؛ بعد از اتصال، حضور (موضوع + زمان) و تشویقها ردوبدل می‌شود.

import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { useLookups, useStore } from "../store";
import { StudyRoom, type RoomMessage, type RoomStatus } from "../lib/rtcRoom";
import { formatMinutes } from "../lib/jalali";
import { totalStudyMs as activeTotalStudyMs } from "../pages/Study";
import { Button, Card, Field, Modal, Segmented, inputClass } from "./ui";
import { cn } from "../utils/cn";

// ---------- QR کوچک ----------
function QRView({ text }: { text: string }) {
  const modules = useMemo(() => {
    try {
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      const rows: boolean[][] = [];
      for (let r = 0; r < n; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
        rows.push(row);
      }
      return rows;
    } catch {
      return null;
    }
  }, [text]);

  if (!modules) {
    return <div className="text-[11px] text-slate-400 text-center py-4">برای QR خیلی بلند است؛ از «کپی متن» استفاده کن</div>;
  }
  const n = modules.length;
  const size = Math.min(52 * n, 240);
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} className="mx-auto rounded-lg bg-white p-2" role="img" aria-label="کد QR اتاق">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      {modules.flatMap((row, r) => row.map((on, c) => (on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0f172a" /> : null)))}
    </svg>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const CHEERS = ["👏", "🔥", "💪", "🎯", "☕"];

export default function StudyRoomModal({ open, onClose }: Props) {
  const { state, toast } = useStore();
  const { topicById } = useLookups();
  const roomRef = useRef<StudyRoom | null>(null);
  const [status, setStatus] = useState<RoomStatus>("idle");
  const [mode, setMode] = useState<"menu" | "host" | "join">("menu");
  const [name, setName] = useState("من");
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [peerName, setPeerName] = useState<string | null>(null);
  const [peerPresence, setPeerPresence] = useState<Extract<RoomMessage, { kind: "presence" }> | null>(null);
  const [peerCheer, setPeerCheer] = useState<{ emoji: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rtcAvailable = typeof RTCPeerConnection !== "undefined";

  // پاک‌سازی هنگام mount/unmount
  useEffect(() => {
    if (open) {
      setMode("menu");
      setOfferCode("");
      setAnswerCode("");
      setInputCode("");
      setPeerName(null);
      setPeerPresence(null);
      setPeerCheer(null);
      setError(null);
      setStatus(roomRef.current?.status ?? "idle");
    } else {
      roomRef.current?.close();
      roomRef.current = null;
      setStatus("idle");
    }
  }, [open]);

  const ensureRoom = (): StudyRoom | null => {
    if (roomRef.current) return roomRef.current;
    try {
      const room = new StudyRoom({ name });
      room.on((e) => {
        if (e.type === "status") setStatus(e.status);
        else if (e.type === "peer") setPeerName(e.name);
        else if (e.type === "message") {
          if (e.msg.kind === "presence") setPeerPresence(e.msg);
          else if (e.msg.kind === "cheer") setPeerCheer({ emoji: e.msg.emoji, at: Date.now() });
        }
      });
      roomRef.current = room;
      return room;
    } catch {
      setError("این مرورگر اتصال P2P را پشتیبانی نمی‌کند (RTCPeerConnection در دسترس نیست).");
      return null;
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} کپی شد`, "📋");
    } catch {
      toast("کپی نشد؛ متن را دستی انتخاب و کپی کن", "⚠️");
    }
  };

  const startHosting = async () => {
    const room = ensureRoom();
    if (!room) return;
    try {
      const code = await room.hostCode();
      setOfferCode(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ساخت دعوت ناموفق بود");
    }
  };

  const doJoin = async () => {
    const room = ensureRoom();
    if (!room) return;
    try {
      const code = await room.joinCode(inputCode);
      setAnswerCode(code);
    } catch (e) {
      setError(e instanceof Error && e.message === "not-a-room-code" ? "این متن کد دعوت نیست" : "خواندن کد دعوت نشد");
    }
  };

  const doAcceptAnswer = async () => {
    const room = ensureRoom();
    if (!room) return;
    try {
      await room.acceptAnswer(inputCode);
      setInputCode("");
    } catch (e) {
      setError(e instanceof Error && e.message === "need-answer-code" ? "این متن کد پاسخ نیست" : "خواندن کد پاسخ نشد — دوباره بفرست");
    }
  };

  // بیکن حضور: هر ۱۰ ثانیه وضعیتِ خودمان را می‌فرستیم
  const active = state.activeSession;
  const activeDesc = useMemo(() => {
    if (!active) return { running: false, topic: "استراحت", minutes: 0 };
    const topic = active.topicId != null ? topicById.get(active.topicId)?.name ?? "مطالعه بدون درس" : "مطالعه بدون درس";
    const minutes = Math.floor(activeTotalStudyMs(active, Date.now()) / 60000);
    return { running: active.running, topic, minutes };
  }, [active, topicById]);

  useEffect(() => {
    if (status !== "connected") return;
    const sendNow = () => roomRef.current?.send({ kind: "presence", ...activeDesc });
    sendNow();
    const id = setInterval(sendNow, 10_000);
    return () => clearInterval(id);
  }, [status, activeDesc]);

  // تشویق موقت محو شود
  useEffect(() => {
    if (!peerCheer) return;
    const id = setTimeout(() => setPeerCheer(null), 4000);
    return () => clearTimeout(id);
  }, [peerCheer]);

  const disconnect = () => {
    roomRef.current?.close();
    roomRef.current = null;
    setStatus("idle");
    setPeerName(null);
    setPeerPresence(null);
    setMode("menu");
    setOfferCode("");
    setAnswerCode("");
  };

  return (
    <Modal open={open} onClose={onClose} title="🤝 اتاق مطالعه‌ی دونفره">
      {!rtcAvailable && (
        <Card className="mb-3 border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/20">
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            این مرورگر اتصال مستقیم (WebRTC) را پشتیبانی نمی‌کند؛ روی Chrome/Edge/Firefox جدید امتحان کن.
          </p>
        </Card>
      )}

      {status === "connected" ? (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            متصل به {peerName ?? "هم‌مطالعه"}
          </div>

          {/* تشویق دریافتی */}
          <div className="h-12 flex items-center justify-center">
            {peerCheer ? (
              <div className="animate-slide-up text-2xl bg-white dark:bg-slate-800 shadow-lg rounded-full w-12 h-12 flex items-center justify-center" key={peerCheer.at}>
                {peerCheer.emoji}
              </div>
            ) : null}
          </div>

          {/* وضعیت طرف مقابل */}
          <Card className="my-4">
            {peerPresence ? (
              <>
                <div className="text-[11px] text-slate-400 mb-1">هم‌مطالعه‌ات الان</div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {peerPresence.running ? "📖 در حال مطالعه" : "⏸ مکث"}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">{peerPresence.topic}</div>
                <div className="text-xs text-slate-400 mt-0.5">{formatMinutes(peerPresence.minutes)} این جلسه</div>
              </>
            ) : (
              <div className="text-xs text-slate-400 py-2">منتظر اولین به‌روزرسانی از طرف مقابل…</div>
            )}
          </Card>

          {/* وضعیت من */}
          <Card className="my-4 bg-teal-50/60 dark:bg-teal-900/20 border-teal-100 dark:border-teal-900/40">
            <div className="text-[11px] text-teal-700 dark:text-teal-300 mb-1">وضعیت تو (خودکار فرستاده می‌شود)</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {activeDesc.running ? "📖 در حال مطالعه" : "⏸ مکث"} · {activeDesc.topic}
            </div>
          </Card>

          <div className="flex justify-center gap-2 my-3">
            {CHEERS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { roomRef.current?.send({ kind: "cheer", emoji: c }); }}
                className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-700 text-xl hover:scale-110 transition-transform"
                title={`تشویق ${c}`}
              >
                {c}
              </button>
            ))}
          </div>

          <Button variant="danger" className="w-full" onClick={disconnect}>
            قطع اتصال
          </Button>
        </div>
      ) : (
        <>
          <Field label="نام تو (برای نمایش به هم‌مطالعه‌ات)">
            <input className={inputClass} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="مثلاً مهدی" />
          </Field>

          <Segmented className="mb-4" value={mode} onChange={(v) => { setMode(v); setError(null); }} options={[{ value: "menu", label: "راهنما" }, { value: "host", label: "🏠 میزبان می‌شوم" }, { value: "join", label: "🚪 می‌پیوندم" }]} />

          {mode === "menu" && (
            <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed space-y-2">
              <p>با دوستت کنار هم درس بخوانید — حتی از راه دور:</p>
              <ol className="list-decimal mr-4 space-y-1">
                <li>یکی از شما «میزبان می‌شوم» را می‌زند و کد دعوت را برای دیگری می‌فرستد (واتساپ/پیامک یا نشان‌دادن QR).</li>
                <li>دیگری «می‌پیوندم» را می‌زند، کد را می‌چسباند و کد پاسخ را برمی‌گرداند.</li>
                <li>اتصال مستقیم بین دو دستگاه برقرار می‌شود؛ هیچ سروری در کار نیست.</li>
              </ol>
              <p className="text-[10px] text-slate-400">بعد از اتصال، وضعیت تایمر و تشویقها زنده ردوبدل می‌شود.</p>
            </div>
          )}

          {mode === "host" && (
            <div className="space-y-3">
              {offerCode === "" ? (
                <Button className="w-full" disabled={!rtcAvailable || status === "creating"} onClick={startHosting}>
                  {status === "creating" ? "در حال ساخت دعوت…" : "ساخت کد دعوت"}
                </Button>
              ) : (
                <>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">۱️⃣ این کد را به دوستت بده:</div>
                  <QRView text={offerCode} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => copy(offerCode, "کد دعوت")}>📋 کپی کد دعوت</Button>
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300 pt-2">۲️⃣ کد پاسخی که برگرداند، این‌جا بچسبان:</div>
                  <textarea dir="ltr" className={cn(inputClass, "min-h-[64px] text-[10px] font-mono")} value={inputCode} onChange={(e) => setInputCode(e.target.value.trim())} placeholder="SPLRTC1|…" />
                  <Button className="w-full" disabled={inputCode.length < 16} onClick={doAcceptAnswer}>
                    اتصال ✅
                  </Button>
                </>
              )}
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-3">
              {answerCode === "" ? (
                <>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">کد دعوتی که بهت دادند، این‌جا بچسبان:</div>
                  <textarea dir="ltr" className={cn(inputClass, "min-h-[64px] text-[10px] font-mono")} value={inputCode} onChange={(e) => setInputCode(e.target.value.trim())} placeholder="SPLRTC1|…" />
                  <Button className="w-full" disabled={inputCode.length < 16} onClick={doJoin}>
                    ساخت کد پاسخ
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">این کد پاسخ را برای میزبان بفرست:</div>
                  <QRView text={answerCode} />
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => copy(answerCode, "کد پاسخ")}>📋 کپی کد پاسخ</Button>
                  <p className="text-[11px] text-center text-slate-400">وقتی میزبان کد را وارد کند، اتصال خودکار برقرار می‌شود…</p>
                </>
              )}
            </div>
          )}

          {(status === "waiting") && mode === "host" && offerCode !== "" && (
            <p className="text-[11px] text-center text-teal-600 dark:text-teal-400 animate-pulse pt-1">در انتظار پاسخ دوستت…</p>
          )}
        </>
      )}

      {error && <p className="text-[11px] text-rose-500 mt-2 text-center">{error}</p>}
    </Modal>
  );
}
