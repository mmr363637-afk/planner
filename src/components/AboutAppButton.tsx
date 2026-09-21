import { useState } from "react";
import { APP_VERSION, faVersion } from "../lib/appVersion";
import {
  ABOUT_DEVELOPER_TEXT,
  DEVELOPER_NAME,
  TELEGRAM_URL,
} from "../lib/aboutApp";
import { Button, Modal } from "./ui";
import WhatsNewModal from "./WhatsNewModal";

/** Shared entry point in Settings and the existing developer credit. */
export default function AboutAppButton() {
  const [open, setOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        دربارهٔ این اپ
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="دربارهٔ این اپ"
        footer={<Button onClick={() => setOpen(false)}>بستن</Button>}
      >
        <div className="space-y-5 text-sm leading-7">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="w-12 h-12 shrink-0 rounded-2xl bg-teal-600 text-white flex items-center justify-center text-xl font-black"
            >
              م
            </span>
            <div>
              <h3 className="font-extrabold text-lg">برنامه‌ریز مطالعه</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                نسخهٔ {faVersion(APP_VERSION)} · فارسی و راست‌به‌چپ
              </p>
            </div>
          </div>
          <p>
            برای برنامه‌ریزی درس‌ها، ثبت مطالعه و مرور فاصله‌دار؛ با ابزارهایی
            برای انتخاب قدم بعدی و تنظیم برنامه با وقت واقعی.
          </p>
          <div className="rounded-2xl bg-teal-50 dark:bg-teal-950/40 p-4">
            <p className="text-xs text-teal-700 dark:text-teal-300">
              سازندهٔ اپ
            </p>
            <p className="font-bold text-base mt-1">{DEVELOPER_NAME}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {ABOUT_DEVELOPER_TEXT}
            </p>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 bg-teal-600 text-white font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
            >
              ارتباط در تلگرام <span dir="ltr">@Mahdimr3</span>
            </a>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            داده‌ها روی دستگاه ذخیره می‌شوند. در صورت فعال‌کردن همگام‌سازی،
            نسخه‌ای به سرویس ابری انتخابی ارسال می‌شود. برای محافظت از اطلاعات،
            فایل پشتیبان جداگانه نگه دار.
          </p>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setChangesOpen(true)}
          >
            تغییرات نسخهٔ فعلی
          </Button>
        </div>
      </Modal>
      {changesOpen && (
        <WhatsNewModal
          open
          lastSeen={undefined}
          onClose={() => setChangesOpen(false)}
        />
      )}
    </>
  );
}
