import { createContext, useContext } from "react";

export type Tab = "home" | "plan" | "study" | "reviews" | "stats" | "exams" | "settings";
export type PlanSubTab = "day" | "calendar" | "plans" | "subjects" | "timetable";

/**
 * پنجره‌هایی که از منوی ☰ مستقیم باز می‌شوند.
 * `exams` و `reviews` از این راه بانکِ سؤال، شبیه‌ساز، جزوه، صوتی و … را نشان می‌دهند.
 */
export type OpenTarget =
  | "exambank"
  | "simulator"
  | "cram"
  | "sources"
  | "audio"
  | "podcast"
  | "autocard"
  | "qbank"
  | "tests"
  | "journey"
  | "wrapped"
  | "skills"
  | "focus"
  | "textreader"
  | "studyroom"
  // پنجره‌هایی که فقط دیالوگ‌اند (بدونِ تبِ مقصد) — برای لینکِ مستقیم
  | "guide"
  | "whatsnew";

export interface NavState {
  tab: Tab;
  planSub: PlanSubTab;
  calendarDate: string | null;
  reviewSub?: "reviews" | "cards" | "mistakes";
  reviewTopic?: string;
  /** پرچمِ یک‌بارمصرف: صفحهٔ «دروس» همان اول کتابخانهٔ درسنامه‌ها را باز کند */
  library?: boolean;
  /**
   * پرچمِ یک‌بارمصرفِ «میان‌بُرهای منو»: صفحهٔ مقصد کدام پنجره را مستقیم باز کند.
   * همهٔ امکاناتی که جای اصلیِ خودشان را در تب‌ها نداشتند از منوی ☰ با همین
   * کلیدِ تازه به همان پنجره می‌رسند (بدونِ اینکه ۶ تبِ پایین شلوغ شود).
   */
  open?: OpenTarget;
}

export interface NavApi extends NavState {
  go: (tab: Tab, opts?: { planSub?: PlanSubTab; date?: string; reviewSub?: "reviews" | "cards" | "mistakes"; reviewTopic?: string; library?: boolean; open?: OpenTarget }) => void;
}

export const NavContext = createContext<NavApi | null>(null);

export function useNav(): NavApi {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav outside provider");
  return ctx;
}
