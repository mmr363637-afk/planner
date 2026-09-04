import { createContext, useContext } from "react";

export type Tab = "home" | "plan" | "study" | "reviews" | "stats" | "exams" | "settings";
export type PlanSubTab = "calendar" | "plans" | "subjects";

export interface NavState {
  tab: Tab;
  planSub: PlanSubTab;
  calendarDate: string | null;
}

export interface NavApi extends NavState {
  go: (tab: Tab, opts?: { planSub?: PlanSubTab; date?: string }) => void;
}

export const NavContext = createContext<NavApi | null>(null);

export function useNav(): NavApi {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav outside provider");
  return ctx;
}
