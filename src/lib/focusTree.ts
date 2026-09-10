// ===== درخت تمرکز — رشد از روی دقایق مطالعه‌ی امروز =====

/** مرحله‌ی رشد: ۰=بذر … ۵=درخت تنومند */
export type TreeStage = 0 | 1 | 2 | 3 | 4 | 5;

const STAGE_EMOJI: Record<TreeStage, string> = {
  0: "🌰",
  1: "🌱",
  2: "🌿",
  3: "🪴",
  4: "🌳",
  5: "🌲",
};

export const WILTED_EMOJI = "🥀";

export function treeStage(todayMinutes: number, goalMinutes: number): TreeStage {
  if (todayMinutes <= 0) return 0;
  if (goalMinutes > 0) {
    const pct = (todayMinutes / goalMinutes) * 100;
    if (pct >= 100) return 5;
    if (pct >= 75) return 4;
    if (pct >= 50) return 3;
    if (pct >= 25) return 2;
    return 1;
  }
  if (todayMinutes >= 180) return 5;
  if (todayMinutes >= 120) return 4;
  if (todayMinutes >= 60) return 3;
  if (todayMinutes >= 30) return 2;
  return 1;
}

export function treeEmoji(stage: TreeStage, wilted: boolean): string {
  if (wilted) return WILTED_EMOJI;
  return STAGE_EMOJI[stage];
}

export function treeMessage(stage: TreeStage, wilted: boolean): string {
  if (wilted) return "وسط جلسه رهاش کردی و پژمرد… فردا جبران کن! 💧";
  switch (stage) {
    case 0: return "بذر امروزت کاشته نشده؛ یه جلسه شروع کن! 🌱";
    case 1: return "جوانه زد! همین‌طور ادامه بده. 💧";
    case 2: return "داره برگ می‌ده؛ آفرین! 🌿";
    case 3: return "قوی شده؛ نزدیک هدفی! 💪";
    case 4: return "یه درخت واقعی شدی امروز! 🌳";
    case 5: return "افسانه‌ای! جنگل امروز کامل شد 🏆";
  }
}
