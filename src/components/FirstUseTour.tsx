import { useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { Button, Modal } from "./ui";

interface TourStep {
  emoji: string;
  title: string;
  body: string;
  /** این قدم کاربر را به کدام تب ببرد (اختیاری) */
  go?: Parameters<ReturnType<typeof useNav>["go"]>;
  action?: { label: string; run: (nav: ReturnType<typeof useNav>) => void };
}

/**
 * 🧭 تور ده دقیقه‌ی اول — درمانِ «فیچرها را پیدا نمی‌کنم».
 * بعد از آنبوردینگ یک‌بار نشان داده می‌شود (settings.tourSeen) و چهار مسیرِ اصلی را
 * با یک «ببر آنجا» عملی معرفی می‌کند. کاملاً لوکال؛ قابل رد کردن است.
 */
const STEPS: TourStep[] = [
  {
    emoji: "⏱️",
    title: "۱) مطالعه را با تایمر ثبت کن",
    body: "در تب «مطالعه» درس/مبحث را انتخاب کن و تایمر آزاد یا پومودورو بزن. حتی بدون درس هم می‌شود زمان ثبت کرد. بعد از پایان، یادگیری‌ات را ارزیابی کن تا مرورها خودکار ساخته شوند.",
    go: ["study"],
  },
  {
    emoji: "🃏",
    title: "۲) مرور، قلبِ این اپ است",
    body: "در تب «مرور» سه چیز منتظرت است: مرورهای فاصله‌دارِ مباحث، فلش‌کارت‌ها (با بانک ۸٬۷۷۱ کارت منتخب پزشکی) و دفتر اشتباهات. نشانگرِ قرمزِ پایینِ اپ، تعداد سررسیدهای امروز را می‌گوید.",
    go: ["reviews"],
  },
  {
    emoji: "✨",
    title: "۳) برنامه‌ات را هوشمند بساز",
    body: "در «برنامه ← برنامه‌ها» دکمه‌ی «✨ برنامه هوشمند» از روز امتحان عقب‌گرد می‌کند: فازِ تست/جزوه/رفرنس برای هر درس، مرور خودکار و روزهای جمع‌بندی — با پنلِ «چرا این‌طور چیده شد؟».",
    go: ["plan", { planSub: "plans" }],
  },
  {
    emoji: "🔍",
    title: "۴) همه‌چیز با یک میان‌بر",
    body: "کلید Ctrl/⌘+K (یا دکمه‌ی 🔍 بالا) پالت فرمان را باز می‌کند: جستجوی فازی در درس‌ها، مباحث، کارت‌ها و امتحان‌ها + اقدام‌های سریع. کلید «؟» هم همه‌ی میان‌برها را نشان می‌دهد.",
  },
];

function firstRunArmed(): boolean {
  try { return sessionStorage.getItem("sp_first_run_tour") === "1"; } catch { return false; }
}

export default function FirstUseTour() {
  const { state, updateSettings } = useStore();
  const nav = useNav();
  const [step, setStep] = useState(0);
  const [armed] = useState(firstRunArmed);

  const dismiss = () => {
    try { sessionStorage.removeItem("sp_first_run_tour"); } catch { /* ignore */ }
    updateSettings({ tourSeen: true });
  };

  if (state.settings.tourSeen || !state.settings.onboarded || !armed) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = () => {
    dismiss();
  };

  return (
    <Modal open onClose={dismiss} title="🧭 تور دو دقیقه‌ای">
      <div className="text-center py-2">
        <div className="text-5xl mb-3" aria-hidden>{s.emoji}</div>
        <div className="font-extrabold text-slate-800 dark:text-slate-100 mb-2">{s.title}</div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{s.body}</p>
      </div>
      <div className="flex justify-center gap-1.5 my-4" aria-label={`قدم ${step + 1} از ${STEPS.length}`}>
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-teal-500" : "w-1.5 bg-slate-200 dark:bg-slate-600"}`} />
        ))}
      </div>
      <div className="flex gap-2">
        {s.go && (
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => {
              nav.go(s.go![0], s.go![1]);
              dismiss();
            }}
          >
            ببرم آنجا 👈
          </Button>
        )}
        <Button className="flex-1" onClick={() => (last ? finish() : setStep((x) => x + 1))}>
          {last ? "شروع کن! 🚀" : "بعدی"}
        </Button>
      </div>
      <button type="button" onClick={dismiss} className="w-full text-center text-xs text-slate-400 mt-3">
        رد کردن — بعداً از «چی جدیده؟» هم می‌شود دید
      </button>
    </Modal>
  );
}
