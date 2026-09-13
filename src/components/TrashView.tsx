// ===== سطل زباله 🗑 — بازگردانی حذف‌ها تا ۳۰ روز =====
import { useState } from "react";
import { useStore } from "../store";
import { Button, ConfirmDialog, EmptyState, Modal } from "./ui";
import { TRASH_KIND_META } from "../lib/trash";
import { toFa } from "../lib/jalali";

function ageLabel(deletedAt: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - deletedAt) / 60000));
  if (mins < 1) return "همین حالا";
  if (mins < 60) return `${toFa(mins)} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${toFa(hours)} ساعت پیش`;
  return `${toFa(Math.floor(hours / 24))} روز پیش`;
}

export default function TrashView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, restoreTrash, deleteTrashForever, emptyTrash } = useStore();
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const items = [...(state.trash ?? [])].sort((a, b) => b.deletedAt - a.deletedAt);
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="🗑 سطل زباله"
        footer={
          items.length > 0 ? (
            <Button variant="danger" onClick={() => setEmptyConfirm(true)}>
              خالی کردن سطل
            </Button>
          ) : undefined
        }
      >
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          حذف‌ها تا ۳۰ روز این‌جا می‌مانند و بعد خودکار پاک می‌شوند. بازگردانی، چیزهای دوباره‌ساخته‌شده را تکراری نمی‌کند.
        </p>
        {items.length === 0 ? (
          <EmptyState icon="🗑" title="سطل خالی است" description="هر چه حذف کنی، ۳۰ روز این‌جا می‌ماند تا اگر اشتباه شد برگردد." />
        ) : (
          <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
            {items.map((item) => {
              const meta = TRASH_KIND_META[item.kind];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 px-3 py-2.5"
                >
                  <span className="text-xl w-8 text-center shrink-0">{meta?.icon ?? "🗑"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{item.label}</div>
                    <div className="text-[10px] text-slate-400">{meta?.label ?? ""} · {ageLabel(item.deletedAt)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreTrash(item.id)}
                    className="shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
                  >
                    ↩️ برگردان
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTrashForever(item.id)}
                    title="حذف برای همیشه"
                    className="shrink-0 w-8 h-8 rounded-xl text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-500 text-sm"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={emptyConfirm}
        onClose={() => setEmptyConfirm(false)}
        title="خالی کردن سطل"
        message="همه‌ی آیتم‌های سطل برای همیشه حذف می‌شوند. مطمئنی؟"
        confirmLabel="بله، خالی کن"
        danger
        onConfirm={() => {
          emptyTrash();
          setEmptyConfirm(false);
        }}
      />
    </>
  );
}
