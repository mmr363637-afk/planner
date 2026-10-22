import { useMemo, useState } from "react";
import { useStore } from "../store";
import { Button, ConfirmDialog } from "./ui";
import { curatedPending } from "../lib/deckScope";
import { toFa } from "../lib/jalali";
import type { CuratedPack } from "../lib/curatedPacks";

/** از این تعداد به بالا، «افزودن همه» اول تأیید می‌گیرد تا یک تپ اشتباه صدها کارت نسازد */
const BULK_CONFIRM_THRESHOLD = 10;

/**
 * «افزودن یک‌جای همه‌ی کارت‌های باقی‌مانده‌ی این پک‌ها» — یک تپ به‌جای تیک‌زدنِ
 * دونه‌دونه‌ی کارت‌ها. اگر تعداد از `BULK_CONFIRM_THRESHOLD` بگذرد، اول تأیید
 * می‌گیرد؛ دکمه وقتی هیچ کارتِ باقی‌مانده‌ای نیست خودش ناپدید می‌شود.
 */
export function BulkAddCuratedButton({
  packs,
  variant = "secondary",
  size = "md",
  className,
  label,
  onAdded,
}: {
  packs: CuratedPack[];
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  /** متن دکمه — n = تعداد کارت‌های باقی‌مانده */
  label?: (n: number) => string;
  onAdded?: (n: number) => void;
}) {
  const { state, importCuratedCards, toast } = useStore();
  const [confirming, setConfirming] = useState(false);
  const pending = useMemo(() => curatedPending(packs, state.flashcards), [packs, state.flashcards]);
  const count = pending.reduce((sum, x) => sum + x.indices.length, 0);
  if (count === 0) return null;

  const addAll = () => {
    let n = 0;
    for (const x of pending) n += importCuratedCards(x.packId, x.indices);
    toast(
      n > 0 ? `${toFa(n)} کارت منتخب به کارت‌های تو اضافه شد` : "کارت جدیدی اضافه نشد (تکراری)",
      n > 0 ? "⭐" : "🃏",
    );
    onAdded?.(n);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => (count > BULK_CONFIRM_THRESHOLD ? setConfirming(true) : addAll())}
      >
        {(label ?? ((n: number) => `➕ افزودن همه (${toFa(n)} کارت)`))(count)}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="افزودن کارت‌های منتخب"
        message={`${toFa(count)} کارت منتخب یک‌جا به «کارت‌های من» اضافه می‌شود. هر وقت خواستی می‌توانی از «همه‌ی کارت‌ها» حذفشان کنی.`}
        confirmLabel={`افزودن ${toFa(count)} کارت`}
        onConfirm={() => {
          setConfirming(false);
          addAll();
        }}
      />
    </>
  );
}

