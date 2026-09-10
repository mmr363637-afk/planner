// ===== متن‌های آماده‌ی اشتراک‌گذاری (خلاصه‌ها) =====
import type { AppState } from "../types";
import { computeStreak, completedTopics, totalMinutes } from "./stats";
import { computeWrapped, wrappedSubjectName } from "./wrapped";
import { levelFromXp, levelTitle } from "./gamification";
import { gardenProgress } from "./garden";
import { formatMinutes, toFa } from "./jalali";

/** متن یک‌صفحه‌ای «خلاصه‌ی من» برای اشتراک */
export function harborShareSummary(state: AppState, today: string): string {
  const streak = computeStreak(state.sessions, today, state.settings.streakFreezes);
  const total = totalMinutes(state.sessions);
  const mastered = completedTopics(state.topics);
  const level = levelFromXp(state.settings.xp);
  const { stage } = gardenProgress(total);
  const w = computeWrapped(state.sessions, state.topics, today);
  const topSub = wrappedSubjectName(w, state.subjects);
  const lines = [
    "🌙 برنامه‌ریز مطالعه",
    "",
    `🔥 زنجیره: ${toFa(streak)} روز`,
    `⏱ مجموع مطالعه: ${formatMinutes(total)}`,
    `⭐ سطح ${toFa(level.level)} · ${levelTitle(level.level)} (${toFa(state.settings.xp)} XP)`,
    `✅ تسلط: ${toFa(mastered)} مبحث`,
    `${stage.icon} باغم: ${stage.label}`,
  ];
  if (topSub) lines.push(`📚 این‌سال بیشتر «${topSub}» خواندم (${formatMinutes(w.topSubjectMinutes)})`);
  lines.push("", "— همه‌چیز آفلاین و روی دستگاهم ذخیره می‌شود 🌱");
  return lines.join("\n");
}
