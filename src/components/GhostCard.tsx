import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, Card, ProgressBar, SectionTitle } from "./ui";
import { bestRollingWeek, currentWeekDays, currentWeekMinutes, encodeGhostShare, ghostTotal, parseGhostShare } from "../lib/ghost";
import { formatJalaliShort, formatMinutes, startOfWeek, toFa, todayKey } from "../lib/jalali";
import { shareText } from "../lib/share";
import { trackFeature } from "../lib/usage";
import type { FriendGhost } from "../types";

const MAX_FRIENDS = 5;

/** 👻 رقابت با سایه‌ی خودت — و حالا با سایه‌ی دوستت (کد متنی، بدون سرور) */
export default function GhostCard() {
  const { state, updateSettings, toast } = useStore();
  const [importOpen, setImportOpen] = useState(false);
  const [code, setCode] = useState("");
  const [myName, setMyName] = useState("");
  const [nameOpen, setNameOpen] = useState(false);
  const today = todayKey();
  const ghost = useMemo(() => bestRollingWeek(state.sessions), [state.sessions]);
  const current = useMemo(() => currentWeekMinutes(state.sessions, today), [state.sessions, today]);
  const friends = state.settings.friendGhosts ?? [];

  const myCode = useMemo(
    () =>
      encodeGhostShare({
        name: myName.trim() || "ناشناس",
        days: currentWeekDays(state.sessions, today),
        weekStart: startOfWeek(today),
      }),
    [state.sessions, today, myName],
  );

  const shareMine = async () => {
    if (!myName.trim()) {
      setNameOpen(true);
      return;
    }
    trackFeature("ghost_share");
    const text = `👻 سایه‌ی هفته‌ی من در برنامه‌ریز مطالعه:\n${myCode}\n(در اپ: آمار ← رقابت با سایه ← «وارد کردن سایه‌ی دوست»)`;
    const r = await shareText(text, "رقابت سایه‌ها");
    if (r === "failed") toast("اشتراک/کپی ناموفق بود", "⚠️");
    else toast(r === "shared" ? "کد سایه ارسال شد 👻" : "کد سایه کپی شد 👻", "✅");
  };

  const importFriend = () => {
    const parsed = parseGhostShare(code);
    if (!parsed) {
      toast("کد معتبر نیست — باید با SPGHOST1: شروع شود", "⚠️");
      return;
    }

    const g: FriendGhost = {
      id: `${Date.now()}`,
      name: parsed.name,
      days: parsed.days,
      weekStart: parsed.weekStart,
      total: ghostTotal(parsed.days),
      importedAt: Date.now(),
    };
    const next = [g, ...friends.filter((f) => f.name !== g.name)].slice(0, MAX_FRIENDS);
    updateSettings({ friendGhosts: next });
    trackFeature("ghost_import");
    setCode("");
    setImportOpen(false);
    toast(`سایه‌ی «${g.name}» اضافه شد — هفته‌ی ${g.weekStart ? formatJalaliShort(g.weekStart) : "نامعلوم"}`, "👻");
  };

  const hasOwnGhost = ghost && ghost.minutes > 0;
  if (!hasOwnGhost && friends.length === 0) return null;
  const pct = hasOwnGhost ? Math.min(100, Math.round((current / ghost!.minutes) * 100)) : 0;
  const ahead = hasOwnGhost && current >= ghost!.minutes;

  return (
    <div>
      <SectionTitle>رقابت با سایه‌ات 👻</SectionTitle>
      <Card className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white border-0">
        {hasOwnGhost && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="opacity-90">👻 سایه‌ات (هفته‌ی {formatJalaliShort(ghost!.start)})</span>
              <b>{formatMinutes(ghost!.minutes)}</b>
            </div>
            <div className="flex items-center justify-between text-sm mt-1.5">
              <span className="opacity-90">🔥 این هفته</span>
              <b>{formatMinutes(current)}</b>
            </div>
            <div className="mt-3">
              <ProgressBar value={pct} className="bg-white/20" color="#fff" />
            </div>
            <div className="text-xs mt-2 opacity-90 leading-relaxed">
              {ahead
                ? "🏆 از سایه‌ات جلو زدی! رکورد جدید بزن."
                : `تا شکستن رکوردت ${formatMinutes(ghost!.minutes - current)} مونده — می‌تونی! (${toFa(pct)}٪)`}
            </div>
          </>
        )}

        {/* رقابت با دوستان — همان هفته‌ی جاری، با کدِ متنی (آفلاین، بدون سرور) */}
        <div className={hasOwnGhost ? "mt-4 pt-3 border-t border-white/20" : ""}>
          {friends.map((f) => {
            const friendPct = Math.min(100, Math.round((current / Math.max(1, f.total)) * 100));
            const iAmAhead = current >= f.total;
            return (
              <div key={f.id} className="mb-3 last:mb-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="opacity-90">
                    🕹️ {f.name}
                    <span className="text-[10px] opacity-70"> (هفته‌ی {f.weekStart ? formatJalaliShort(f.weekStart) : "؟"})</span>
                  </span>
                  <b>{formatMinutes(f.total)}</b>
                </div>
                <div className="mt-1.5">
                  <ProgressBar value={friendPct} className="bg-white/20" color={iAmAhead ? "#4ade80" : "#fff"} />
                </div>
                <div className="text-[11px] mt-1 opacity-85">
                  {iAmAhead ? `🏆 از ${f.name} جلوئی!` : `${formatMinutes(f.total - current)} تا ${f.name} مونده (${toFa(friendPct)}٪)`}
                </div>
              </div>
            );
          })}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={shareMine}
              className="flex-1 text-xs font-bold bg-white/15 hover:bg-white/25 rounded-xl py-2 transition-colors"
            >
              📤 کد سایه‌ی من
            </button>
            <button
              type="button"
              onClick={() => setImportOpen((x) => !x)}
              className="flex-1 text-xs font-bold bg-white/15 hover:bg-white/25 rounded-xl py-2 transition-colors"
            >
              📥 سایه‌ی دوست
            </button>
          </div>
          {nameOpen && (
            <div className="mt-2.5">
              <input
                value={myName}
                onChange={(e) => setMyName(e.target.value.slice(0, 24))}
                placeholder="اسمی که دوستت می‌بیند (مثلاً مهدی)"
                className="w-full rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/50 text-xs p-2.5 outline-none focus:border-white/50"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="flex-1" onClick={() => { if (myName.trim()) { setNameOpen(false); void shareMine(); } }}>ساخت کد</Button>
                <Button size="sm" variant="ghost" onClick={() => setNameOpen(false)}>بی‌خیال</Button>
              </div>
            </div>
          )}
          {importOpen && (
            <div className="mt-2.5">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="کد دوستت را اینجا بچسبان (SPGHOST1:…)"
                rows={2}
                dir="ltr"
                className="w-full rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/50 text-xs p-2.5 outline-none focus:border-white/50"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={importFriend} className="flex-1">وارد کن</Button>
                <Button size="sm" variant="ghost" onClick={() => setImportOpen(false)}>بستن</Button>
              </div>
              <p className="text-[10px] opacity-75 mt-2 leading-relaxed">
                کد فقط نام + هفت عدد (دقیقه‌های هر روز هفته) دارد — هیچ داده‌ی دیگری جابه‌جا نمی‌شود. تا {toFa(MAX_FRIENDS)} دوست.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
