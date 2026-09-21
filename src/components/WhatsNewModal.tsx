// ===== مودال «چی جدیده؟ ✨» — یک‌بار بعد از هر آپدیت =====
import { Button, Modal } from "./ui";
import { faVersion } from "../lib/appVersion";
import { unseenChangelog } from "../lib/changelog";

export default function WhatsNewModal({
  open,
  lastSeen,
  onClose,
}: {
  open: boolean;
  lastSeen: string | undefined;
  onClose: () => void;
}) {
  const entries = unseenChangelog(lastSeen);
  if (entries.length === 0) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="✨ چی جدیده؟"
      footer={
        <Button className="w-full" size="lg" onClick={onClose}>
          بزن بریم! 🚀
        </Button>
      }
    >
      <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
        {entries.map((e) => (
          <div key={e.version}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                نسخه‌ی {faVersion(e.version)}
              </span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{e.title}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {e.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                  <span className="text-teal-500 mt-0.5 shrink-0">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-[11px] text-slate-400 leading-relaxed">
          داده‌ها روی دستگاه ذخیره می‌شوند؛ همگام‌سازی ابری اختیاری است و بعضی ابزارها برای دریافت اولیه به اینترنت نیاز دارند. 💾 یادت نره گاهی بکاپ بگیری!
        </p>
      </div>
    </Modal>
  );
}
