// ===== انتقال داده بین دو دستگاه با QR (بدون سرور) =====
// ارسال: روی دستگاه مبدأ تکه‌های QR پشت‌سرهم نمایش داده می‌شود.
// دریافت: دوربین دستگاه مقصد (BarcodeDetector) تکه‌ها را اسکن می‌کند؛ اگر مرورگر
// BarcodeDetector نداشت، همان متن تکه‌ها به‌صورت دستی چسبانده می‌شود.
import { useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { useStore } from "../store";
import { Button, Card, Segmented, inputClass } from "./ui";
import { chunkMeta, decodeTransfer, encodeTransfer, SCOPE_LABEL, scopeState, summarize, type DecodeResult, type EncodeResult, type TransferScope } from "../lib/qrTransfer";
import { toFa } from "../lib/jalali";
import { cn } from "../utils/cn";

// ---- BarcodeDetector (در TypeScript استاندارد تعریف نشده) ----
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;
function getBarcodeDetector(): BarcodeDetectorCtor | null {
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

type Mode = "send" | "receive";

export default function QrTransfer() {
  const [mode, setMode] = useState<Mode>("send");
  return (
    <div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
        داده‌ها مستقیم از صفحه‌ی یک دستگاه به دستگاه دیگر منتقل می‌شوند — بدون سرور و بدون اینترنت.
        دستگاه اول کدها را نشان می‌دهد و دستگاه دوم با دوربین اسکن می‌کند (یا متن را دستی می‌چسباند).
      </p>
      <Segmented value={mode} onChange={setMode} options={[{ value: "send", label: "📱 نشان دادن کد" }, { value: "receive", label: "📷 اسکن کد" }]} />
      <div className="mt-4">{mode === "send" ? <SendPanel /> : <ReceivePanel />}</div>
    </div>
  );
}

// ================= ارسال =================

function SendPanel() {
  const { state } = useStore();
  const [scope, setScope] = useState<TransferScope>("plan");
  const [result, setResult] = useState<EncodeResult | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => summarize(scopeState(state, scope)), [state, scope]);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await encodeTransfer(state, scope);
      setResult(res);
      setIndex(0);
      setAutoPlay(false);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!result || !autoPlay) return;
    const id = setInterval(() => {
      setIndex((i) => {
        if (i + 1 >= result.chunks.length) return 0; // بعد از آخرین کارت از اول
        return i + 1;
      });
    }, 4000);
    return () => clearInterval(id);
  }, [result, autoPlay]);

  const svg = useMemo(() => {
    if (!result) return null;
    const qr = qrcode(0, "L");
    qr.addData(result.chunks[index]);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
  }, [result, index]);

  if (!result) {
    return (
      <div className="space-y-3">
        <Segmented value={scope} onChange={setScope} options={[{ value: "settings", label: "تنظیمات" }, { value: "plan", label: "برنامه" }, { value: "full", label: "همه" }]} />
        <Card>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">این‌ها منتقل می‌شوند:</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{summary.join(" · ") || "چیزی برای این دامنه نیست"}</div>
        </Card>
        <Button className="w-full" disabled={busy} onClick={generate}>
          {busy ? "در حال آماده‌سازی…" : "ساخت کد QR"}
        </Button>
      </div>
    );
  }

  const total = result.chunks.length;
  return (
    <div className="space-y-3">
      {total > 12 && (
        <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-900/20">
          <div className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
            این داده {toFa(total)} کارت QR می‌شود. برای راحتی، دامنه‌ی کوچک‌تر انتخاب کن یا از «پشتیبان‌گیری (دانلود JSON)» استفاده کن.
          </div>
        </Card>
      )}
      <div className="relative rounded-2xl bg-white p-3 border border-slate-200">
        <div className="aspect-square w-full max-w-[320px] mx-auto text-black [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg ?? "" }} />
        <div className="absolute top-2 right-2 text-[10px] font-bold bg-slate-800/85 text-white px-2 py-0.5 rounded-full">
          {toFa(index + 1)} / {toFa(total)}
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setIndex((i) => (i - 1 + total) % total)}>
          قبلی
        </Button>
        <button
          type="button"
          onClick={() => setAutoPlay((a) => !a)}
          className={cn("text-xs px-3 py-2 rounded-xl font-medium", autoPlay ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200")}
        >
          {autoPlay ? "⏸ توقف پخش" : "▶️ پخش خودکار"}
        </button>
        <Button variant="secondary" size="sm" onClick={() => setIndex((i) => (i + 1) % total)}>
          بعدی
        </Button>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-relaxed">
        روی دستگاه دوم «اسکن کد» را باز کن و دوربین را روی هر کارت نگه دار؛ همه‌ی کارت‌ها اسکن شوند.
        {result.compressed ? " داده فشرده شد ✅" : ""}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => setResult(null)}>
          تغییر دامنه
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={() => {
            navigator.clipboard?.writeText(result.chunks.join("\n")).then(() => setCopied(true)).catch(() => setCopied(false));
          }}
        >
          {copied ? "کپی شد ✓" : "کپی متن کارت‌ها"}
        </Button>
      </div>
    </div>
  );
}

// ================= دریافت =================

function ReceivePanel() {
  const { importData, updateSettings, toast } = useStore();
  const [chunks, setChunks] = useState<string[]>([]);
  const [expected, setExpected] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [decoded, setDecoded] = useState<DecodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<string[]>([]);
  chunksRef.current = chunks;

  const Detector = getBarcodeDetector();

  const addChunk = (raw: string) => {
    const meta = chunkMeta(raw);
    if (!meta) return;
    setError(null);
    setExpected((e) => (e == null ? meta.total : e));
    setChunks((prev) => {
      if (prev.some((c) => chunkMeta(c)?.index === meta.index)) return prev;
      const next = [...prev, raw];
      if (next.length === meta.total) {
        void finish(next);
      }
      return next;
    });
  };

  const finish = async (all: string[]) => {
    try {
      const res = await decodeTransfer(all);
      stopCamera();
      setScanning(false);
      setDecoded(res);
    } catch (e) {
      setError(e instanceof Error ? (e.message === "mixed-transfers" ? "تکه‌های دو انتقال متفاوت قاطی شده‌اند؛ از اول اسکن کن" : "تکه‌ها کامل نیستند") : "خطا در خواندن داده");
      setChunks([]);
      setExpected(null);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  const startCamera = async () => {
    setError(null);
    if (!Detector) {
      setError("این مرورگر اسکن دوربین ندارد؛ متن کارت‌ها را دستی وارد کن (کپی متن کارت‌ها در دستگاه فرستنده)");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      setChunks([]);
      setExpected(null);
      const detector = new Detector({ formats: ["qr_code"] });
      requestAnimationFrame(async function loop() {
        if (!streamRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const found = await detector.detect(video);
            for (const f of found) addChunk(f.rawValue);
          } catch {
            /* فریم بعدی */
          }
        }
        if (streamRef.current) requestAnimationFrame(loop);
      });
    } catch {
      setError("دسترسی به دوربین داده نشد؛ از تنظیمات مرورگر اجازه بده یا از روش دستی استفاده کن");
    }
  };

  const decodeManual = async () => {
    const parts = manual.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setChunks(parts);
    try {
      const res = await decodeTransfer(parts);
      setDecoded(res);
      setError(null);
    } catch {
      setError("متن واردشده کامل یا معتبر نیست؛ همه‌ی کارت‌ها را کامل کپی کن");
    }
  };

  const apply = () => {
    if (!decoded) return;
    try {
      if (decoded.scope === "settings" && !decoded.data.subjects) {
        updateSettings(decoded.data.settings ?? {});
        toast("تنظیمات از دستگاه دیگر وارد شد", "✅");
      } else {
        const ok = importData(JSON.stringify({ data: decoded.data }));
        if (!ok) throw new Error("bad");
        toast("داده‌ها از دستگاه دیگر وارد شد", "✅");
      }
      setDecoded(null);
      setChunks([]);
      setExpected(null);
      setManual("");
    } catch {
      toast("ورود داده ناموفق بود", "⚠️");
    }
  };

  const progress = expected != null ? `${toFa(chunks.length)}/${toFa(expected)}` : null;

  return (
    <div className="space-y-3">
      {Detector ? (
        !scanning ? (
          <Button className="w-full" onClick={startCamera}>
            📷 روشن کردن دوربین و اسکن
          </Button>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-600 bg-black aspect-[3/4] max-w-[320px] mx-auto">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-x-8 top-1/3 h-40 border-2 border-white/80 rounded-2xl pointer-events-none" />
            {progress && (
              <div className="absolute top-2 inset-x-2 text-center text-xs font-bold bg-teal-600/90 text-white px-2 py-1 rounded-full">
                دریافت: {progress} — دوربین را روی کارت‌ها نگه دار
              </div>
            )}
          </div>
        )
      ) : (
        <Card className="border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-900/20">
          <div className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
            مرورگر این دستگاه اسکن دوربین ندارد. در دستگاه فرستنده «کپی متن کارت‌ها» را بزن و متن را اینجا بچسبان.
          </div>
        </Card>
      )}
      {scanning && (
        <Button variant="secondary" className="w-full" onClick={() => { stopCamera(); setScanning(false); }}>
          توقف دوربین
        </Button>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-teal-600 dark:text-teal-400 font-medium">ورود دستی متن کارت‌ها</summary>
        <textarea
          className={cn(inputClass, "mt-2 h-28 font-mono text-[10px] leading-relaxed")}
          dir="ltr"
          placeholder={"SPLNR1|abc123|D|1/3|…\nSPLNR1|abc123|D|2/3|…"}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <Button variant="outline" size="sm" className="mt-2" onClick={decodeManual}>
          خواندن متن
        </Button>
      </details>

      {error && (
        <Card className="border-rose-200 dark:border-rose-800/50 bg-rose-50/70 dark:bg-rose-900/20">
          <div className="text-[11px] text-rose-700 dark:text-rose-300">{error}</div>
        </Card>
      )}

      {decoded && (
        <Card>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5">
            داده آماده‌ی ورود است ({SCOPE_LABEL[decoded.scope]})
          </div>
          <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 mb-3">
            {summarize(decoded.data).map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
          <div className="text-[11px] text-amber-700 dark:text-amber-300 mb-3 leading-relaxed">
            ⚠️ اگر همین حالا برنامه/درس‌ها را وارد کنی، داده‌های فعلی این دستگاه با داده‌های ارسالی جایگزین می‌شوند.
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={apply}>
              ورود داده‌ها
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDecoded(null); setChunks([]); setExpected(null); }}>
              انصراف
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
