import { useEffect, useMemo, useRef, useState } from "react";
import { useLookups, useStore } from "../store";
import { Button, Card, Chip, Modal, inputClass } from "./ui";
import { buildCardPackage, packageFilename, parseCardPackage, planCardPackageImport, type ImportPlan } from "../lib/cardPackage";
import { downloadTextFile } from "../lib/backup";
import { toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";

/**
 * بستهٔ اشتراک کارت‌ها — خروجی/ورود مبحث‌محور.
 * فرمت JSONِ نسخه‌دار و خواناست؛ هم متن کارت و هم درس/مبحث و یادداشت/هایلایت را
 * نگه می‌دارد. در ورود، پیش‌نمایشِ «چه چیزی اضافه می‌شود / چند تکراری است» نشان
 * داده می‌شود و کاربر خودش تأیید می‌کند.
 */
type PackagePreview = { error: string } | { plan: ImportPlan };
type ImportProgress = { phase: "planning" | "saving"; completed: number; total: number };

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export default function CardPackageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, importCardPackageText, toast } = useStore();
  const { subjectOfTopic } = useLookups();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"export" | "import">("export");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileReading, setFileReading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<null | { added: number; topics: number; ok: boolean; error?: string }>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previewGeneration = useRef(0);

  const mine = useMemo(() => state.flashcards.filter((c) => !c.origin || c.origin === "user"), [state.flashcards]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; subject: string; count: number }>();
    for (const c of mine) {
      const topic = c.topicId ? state.topics.find((t) => t.id === c.topicId) : undefined;
      const subject = topic ? subjectOfTopic(topic.id) : undefined;
      const key = topic ? `t:${topic.id}` : "orphan";
      const row = map.get(key);
      if (row) row.count += 1;
      else
        map.set(key, {
          key,
          name: topic?.name ?? "بدون مبحث",
          subject: subject?.name ?? "",
          count: 1,
        });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [mine, state.topics, subjectOfTopic]);

  const chosenCards = useMemo(() => {
    if (selected.size === 0) return [];
    const topicIds = new Set([...selected].filter((k) => k.startsWith("t:")).map((k) => k.slice(2)));
    const orphan = selected.has("orphan");
    return mine.filter((c) => (c.topicId ? topicIds.has(c.topicId) : orphan));
  }, [mine, selected]);

  const exportNow = () => {
    if (chosenCards.length === 0) return;
    const pkg = buildCardPackage(chosenCards, state.topics, state.subjects, { exportedAt: Date.now() });
    const names = selected.has("orphan") && selected.size === 1 ? [] : [...selected].filter((k) => k.startsWith("t:")).map((k) => groups.find((g) => g.key === k)?.name ?? "");
    const filename = packageFilename(names, todayKey());
    const ok = downloadTextFile(filename, JSON.stringify(pkg, null, 2), "application/json");
    if (ok) toast(`${toFa(chosenCards.length)} کارت در «${filename}» ذخیره شد`, "📦");
    else toast("دانلود فایل ممکن نشد", "⚠️");
  };

  useEffect(() => {
    const generation = ++previewGeneration.current;
    if (!text.trim()) {
      setPreview(null);
      setPreviewing(false);
      return;
    }
    if (fileReading || importing) {
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    const timer = setTimeout(() => {
      void (async () => {
        // اول یک نوبت به مرورگر می‌دهیم تا وضعیتِ «در حال بررسی» واقعاً دیده شود.
        await yieldToUi();
        if (generation !== previewGeneration.current) return;
        const parsed = parseCardPackage(text);
        if (!parsed.ok) setPreview({ error: parsed.error });
        else setPreview({ plan: planCardPackageImport(parsed.pkg, { topics: state.topics, subjects: state.subjects, cards: state.flashcards }) });
        setPreviewing(false);
      })();
    }, 220);
    return () => clearTimeout(timer);
  }, [text, state.topics, state.subjects, state.flashcards, fileReading, importing]);

  const readFile = async (file: File) => {
    setFileName(file.name);
    setFileReading(true);
    setPreview(null);
    setResult(null);
    await yieldToUi();
    try {
      setText(await file.text());
    } catch {
      toast("خواندن فایل ممکن نشد", "⚠️");
    } finally {
      setFileReading(false);
    }
  };

  const doImport = async () => {
    if (!text.trim() || importing || fileReading) return;
    const sourceText = text;
    setImporting(true);
    setImportProgress({ phase: "planning", completed: 0, total: 1 });
    setResult(null);
    // پیش از JSON.parse و برنامه‌ریزی، spinner را به صفحه بده.
    await yieldToUi();
    try {
      const res = await importCardPackageText(sourceText, setImportProgress);
      setResult({ ok: res.ok, added: res.added, topics: res.topics, error: res.error });
      if (res.ok) toast(`${toFa(res.added)} کارت از بسته اضافه شد`, "📥");
      else toast(res.error || "ورود بسته ناموفق بود", "⚠️");
    } catch {
      setResult({ ok: false, added: 0, topics: 0, error: "هنگامِ افزودن کارت‌ها خطایی رخ داد." });
      toast("ورود بسته ناموفق بود", "⚠️");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const busy = importing || fileReading;
  const progressPercent = importProgress?.phase === "saving"
    ? importProgress.total > 0 ? Math.round((importProgress.completed / importProgress.total) * 100) : 100
    : 8;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="📦 بستهٔ اشتراک کارت‌ها">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => setTab("export")}
          className={cn("flex-1 rounded-xl py-2 text-xs font-bold disabled:opacity-40", tab === "export" ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300")}
        >
          📤 خروجی مبحث‌محور
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setTab("import")}
          className={cn("flex-1 rounded-xl py-2 text-xs font-bold disabled:opacity-40", tab === "import" ? "bg-teal-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300")}
        >
          📥 ورود بسته
        </button>
      </div>

      {tab === "export" ? (
        <>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
            مبحث‌ها را انتخاب کن؛ فایل JSON شامل متن کارت‌ها، درس/مبحث، یادداشت‌ها و هایلایت‌هاست و در ورود دوباره به همان مبحث وصل می‌شود.
          </p>
          {groups.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-4">هنوز کارتی برای خروجی نداری.</div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {groups.map((g) => {
                const on = selected.has(g.key);
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() =>
                      setSelected((cur) => {
                        const next = new Set(cur);
                        if (next.has(g.key)) next.delete(g.key);
                        else next.add(g.key);
                        return next;
                      })
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 text-right",
                      on ? "border-teal-400 bg-teal-50 dark:bg-teal-900/30" : "border-slate-200 dark:border-slate-600",
                    )}
                  >
                    <span className={cn("w-4 h-4 rounded border flex items-center justify-center text-[10px]", on ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300")}>
                      {on ? "✓" : ""}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{g.name}</span>
                      {g.subject && <span className="block text-[10px] text-slate-400">{g.subject}</span>}
                    </span>
                    <Chip>{toFa(g.count)}</Chip>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set(groups.map((g) => g.key)))}>همه</Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>هیچ‌کدام</Button>
            <span className="text-[11px] text-slate-400 self-center">{toFa(chosenCards.length)} کارت انتخاب شده</span>
          </div>
          <div className="flex gap-2 mt-3">
            <Button className="flex-1" disabled={chosenCards.length === 0} onClick={exportNow}>📤 دانلود بسته</Button>
            <Button
              variant="secondary"
              disabled={chosenCards.length === 0}
              onClick={() => {
                const pkg = buildCardPackage(chosenCards, state.topics, state.subjects);
                const write = navigator.clipboard?.writeText(JSON.stringify(pkg, null, 2));
                if (!write) {
                  toast("کپی در این مرورگر ممکن نیست؛ از «دانلود بسته» استفاده کن", "⚠️");
                  return;
                }
                write.then(
                  () => toast("متن بسته کپی شد — می‌توانی در پیام‌رسان بفرستی", "📋"),
                  () => toast("کپی ممکن نشد", "⚠️"),
                );
              }}
            >
              📋 کپی متن
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
            فایل بسته (JSON) یا متن آن را اینجا بگذار. کارت‌های تکراریِ همان مبحث اضافه نمی‌شوند؛ مبحثِ ناموجود ساخته می‌شود.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              input.value = "";
              if (file) void readFile(file);
            }}
          />
          <div className="flex gap-1.5 mb-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>📄 انتخاب فایل</Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => { setText(""); setFileName(""); setPreview(null); setResult(null); }}
            >
              پاک‌کردن
            </Button>
          </div>
          {fileName && <div className="text-[10px] text-slate-400 mb-1.5 truncate" dir="auto">فایل: {fileName}</div>}
          {fileReading && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl bg-teal-50 dark:bg-teal-900/20 px-3 py-2 mb-2 text-[11px] text-teal-700 dark:text-teal-300">
              <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border-2 border-teal-300 border-t-teal-700 animate-spin" />
              در حال خواندنِ فایل…
            </div>
          )}
          <textarea
            className={cn(inputClass, "min-h-32 font-mono text-[11px] leading-relaxed disabled:opacity-60")}
            dir="ltr"
            placeholder='{"format":"study-planner.cards","version":1,"topics":[...],"cards":[...]}'
            value={text}
            disabled={busy}
            onChange={(e) => { setText(e.target.value); setFileName(""); setResult(null); }}
          />
          {previewing && !fileReading && !importing && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-full border-2 border-teal-300 border-t-teal-700 animate-spin" />
              در حال بررسیِ بسته و آماده‌کردنِ پیش‌نمایش…
            </div>
          )}
          {importing && (
            <div role="status" aria-live="polite" className="mt-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-900/20 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[11px] font-bold text-teal-800 dark:text-teal-200">
                <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border-2 border-teal-300 border-t-teal-700 animate-spin" />
                {importProgress?.phase === "saving" ? "در حال افزودن کارت‌ها…" : "در حال آماده‌سازی و بررسی بسته…"}
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-teal-100 dark:bg-teal-950/60"
                role="progressbar"
                aria-label="پیشرفت واردکردن کارت‌ها"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
              >
                <div className="h-full rounded-full bg-teal-600 transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
              {importProgress?.phase === "saving" && importProgress.total > 0 && (
                <div className="mt-1 text-[10px] text-teal-700 dark:text-teal-300">
                  {toFa(importProgress.completed)} از {toFa(importProgress.total)} کارت
                </div>
              )}
            </div>
          )}
          {!importing && !previewing && preview && "error" in preview && (
            <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-2">⚠️ {preview.error}</div>
          )}
          {!importing && !previewing && preview && "plan" in preview && (
            <Card className="mt-2 !p-3">
              <div className="text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-3 gap-y-1">
                <span>✅ {toFa(preview.plan.cardsToAdd.length)} کارت تازه</span>
                <span>🔁 {toFa(preview.plan.stats.duplicates)} تکراری</span>
                <span>⛔ {toFa(preview.plan.stats.invalid)} نامعتبر</span>
                {preview.plan.topicsToCreate.length > 0 && <span>📚 {toFa(preview.plan.topicsToCreate.length)} مبحث تازه</span>}
                {preview.plan.stats.orphan > 0 && <span>🔗 {toFa(preview.plan.stats.orphan)} بدون مبحث</span>}
              </div>
              {preview.plan.topicsToCreate.length > 0 && (
                <div className="text-[10px] text-slate-400 mt-1.5">
                  مباحث تازه: {preview.plan.topicsToCreate.map((t) => `${t.name}${t.newSubjectName ? ` (درس تازه: ${t.newSubjectName})` : ""}`).join("، ")}
                </div>
              )}
            </Card>
          )}
          {result && (
            <div className={cn("text-[11px] mt-2", result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {result.ok ? `✅ ${toFa(result.added)} کارت و ${toFa(result.topics)} مبحث اضافه شد` : `⚠️ ${result.error ?? "ورود ناموفق"}`}
            </div>
          )}
          <Button
            className="w-full mt-3"
            disabled={!text.trim() || !preview || "error" in (preview ?? {}) || previewing || busy}
            onClick={() => void doImport()}
          >
            {importing ? "در حال افزودن…" : "📥 افزودن به کارت‌های من"}
          </Button>
        </>
      )}
    </Modal>
  );
}
