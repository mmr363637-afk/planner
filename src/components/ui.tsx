import { useEffect, type ReactNode } from "react";
import { cn } from "../utils/cn";

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 shadow-sm p-4",
        onClick && "cursor-pointer active:scale-[0.99] transition-transform",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-6 first:mt-0">
      <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{children}</h2>
      {action}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export function Button({
  children,
  onClick,
  variant = "primary",
  className,
  disabled,
  size = "md",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit";
}) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-teal-600 hover:bg-teal-700 text-white shadow-sm shadow-teal-600/20",
    secondary: "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50",
    ghost: "bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60",
    danger: "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 hover:bg-rose-100",
    outline: "border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50",
  };
  const sizes = { sm: "text-xs px-3 py-1.5 rounded-lg", md: "text-sm px-4 py-2.5 rounded-xl", lg: "text-base px-6 py-3.5 rounded-2xl" };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ children, onClick, className, title }: { children: ReactNode; onClick?: () => void; className?: string; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ value, color, className, height = "h-2.5" }: { value: number; color?: string; className?: string; height?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden", height, className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-700", !color && "bg-teal-500")}
        style={{ width: `${v}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function RingProgress({ value, size = 120, stroke = 10, children, color = "#0d9488" }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-slate-100 dark:text-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Chip({ children, color, className, onClick, active }: { children: ReactNode; color?: string; className?: string; onClick?: () => void; active?: boolean }) {
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap",
        !color && "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
        onClick && "cursor-pointer",
        active && "ring-2 ring-teal-500",
        className,
      )}
      style={color ? { backgroundColor: color + "22", color } : undefined}
    >
      {children}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: "low" | "medium" | "high" }) {
  const colors = { low: "bg-slate-400", medium: "bg-amber-400", high: "bg-rose-500" };
  return <span className={cn("inline-block w-2 h-2 rounded-full", colors[priority])} />;
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[92vh] flex flex-col bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up">
        <div className="sm:hidden w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mt-3" />
        {title && (
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
            <IconButton onClick={onClose} title="بستن">
              <CloseIcon />
            </IconButton>
          </div>
        )}
        <div className="px-5 pb-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-xs leading-relaxed">{description}</p>}
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 placeholder:text-slate-400";

export function Segmented<T extends string>({ options, value, onChange, className }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("flex bg-slate-100 dark:bg-slate-700/60 rounded-xl p-1 gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 text-sm py-1.5 rounded-lg transition-all font-medium",
            value === o.value ? "bg-white dark:bg-slate-800 shadow text-teal-700 dark:text-teal-300" : "text-slate-500 dark:text-slate-300",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40",
        checked ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-600",
      )}
    >
      <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", checked ? "right-0.5" : "right-[22px]")} />
    </button>
  );
}

export function StatTile({ icon, label, value, sub, className }: { icon: string; label: string; value: string; sub?: string; className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </Card>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "تأیید", danger, onConfirm, onClose }: { open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{message}</p>
    </Modal>
  );
}

// ===== Icons (inline SVG, stroke-based) =====
const iconProps = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const CloseIcon = () => (
  <svg {...iconProps} width={18} height={18}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const HomeIcon = () => (
  <svg {...iconProps}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v10h14V10" />
  </svg>
);
export const CalendarIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
export const TimerIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </svg>
);
export const RepeatIcon = () => (
  <svg {...iconProps}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);
export const ChartIcon = () => (
  <svg {...iconProps}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
export const SettingsIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const PlusIcon = () => (
  <svg {...iconProps}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const PlayIcon = ({ size = 22 }: { size?: number }) => (
  <svg {...iconProps} width={size} height={size} fill="currentColor" stroke="none">
    <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5z" />
  </svg>
);
export const PauseIcon = ({ size = 22 }: { size?: number }) => (
  <svg {...iconProps} width={size} height={size} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
export const CheckIcon = ({ size = 18 }: { size?: number }) => (
  <svg {...iconProps} width={size} height={size}>
    <path d="M5 12.5 10 17l9-10" />
  </svg>
);
export const TrashIcon = () => (
  <svg {...iconProps} width={18} height={18}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const EditIcon = () => (
  <svg {...iconProps} width={18} height={18}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
    <path d="M13.5 6.5l3 3" />
  </svg>
);
export const ChevronIcon = ({ dir = "left" }: { dir?: "left" | "right" | "down" }) => (
  <svg {...iconProps} width={18} height={18} className={dir === "right" ? "rotate-180" : dir === "down" ? "-rotate-90" : ""}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
);
export const MoreIcon = () => (
  <svg {...iconProps} width={18} height={18} fill="currentColor" stroke="none">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);
export const BookIcon = () => (
  <svg {...iconProps}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" />
    <path d="M4 19a2 2 0 0 0 2 2h13" />
  </svg>
);
export const ExamIcon = () => (
  <svg {...iconProps}>
    <path d="M3 9l9-5 9 5-9 5-9-5z" />
    <path d="M7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4" />
    <path d="M21 9v5" />
  </svg>
);
